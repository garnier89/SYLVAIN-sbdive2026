"""SB Événement — event discovery, digital ticketing (QR) & event transport.

Phase 1 (MVP, user side):
  - Discovery (categories) + event detail
  - Ticket purchase paid from the unified SB Pay wallet (db.wallets)
  - Digital tickets with a unique QR token + reservation history
  - Transport proposal handled on the client (deep-link to SB Drive)
Admin back-office: full event CRUD.

Phase 2 (later): organizer space, Event Pass VIP, pooled collective shuttles,
QR entry-scanning validation.
"""
import uuid
import secrets
from datetime import datetime, timezone

from fastapi import APIRouter, Request, HTTPException, Query

from core.config import db
from core.deps import get_current_user, require_role
from core.payments import debit_with_fallback, refund_user

public_router = APIRouter(prefix="/events", tags=["events"])
admin_router = APIRouter(prefix="/admin/events", tags=["events-admin"])

# Discovery categories (slug -> French label). Mirrored on the frontend.
CATEGORIES = {
    "concert": "Concerts",
    "festival": "Festivals",
    "carnaval": "Carnaval",
    "sport": "Matchs sportifs",
    "conference": "Conférences",
    "soiree": "Soirées",
    "exposition": "Expositions",
}
TRANSPORT_OPTIONS = {"none", "one_way", "return", "round_trip", "private_driver", "shuttle"}


def _now():
    return datetime.now(timezone.utc).isoformat()


# Platform settings for SB Événement Pro (commission + sponsorship pricing).
EVENTS_SETTINGS_DEFAULTS = {"commission_percent": 10.0, "boost_price_per_day": 9.99}


async def get_events_settings() -> dict:
    doc = await db.events_settings.find_one({"id": "default"}, {"_id": 0}) or {}
    return {**EVENTS_SETTINGS_DEFAULTS, **{k: v for k, v in doc.items() if k != "id"}}


def _event_snapshot(ev: dict) -> dict:
    return {
        "title": ev.get("title"), "category": ev.get("category"), "image": ev.get("image"),
        "venue_name": ev.get("venue_name"), "address": ev.get("address"), "city": ev.get("city"),
        "lat": ev.get("lat"), "lng": ev.get("lng"), "starts_at": ev.get("starts_at"),
    }


# ----------------------------------------------------------------- public (user)
@public_router.get("")
async def list_events(
    category: str = Query(None),
    city: str = Query(None),
    q: str = Query(None),
    featured: bool = Query(False),
    limit: int = Query(50, ge=1, le=100),
):
    """Public discovery feed: active, upcoming events (soonest first)."""
    now_iso = _now()
    query = {"status": "active"}
    if category:
        query["category"] = category
    if city:
        query["city"] = {"$regex": city, "$options": "i"}
    if featured:
        query["is_featured"] = True
    if q:
        query["$or"] = [
            {"title": {"$regex": q, "$options": "i"}},
            {"venue_name": {"$regex": q, "$options": "i"}},
            {"city": {"$regex": q, "$options": "i"}},
        ]
    # Upcoming first; keep recently-started ongoing events too.
    docs = await db.events.find(query, {"_id": 0}).sort("starts_at", 1).to_list(200)
    upcoming = [d for d in docs if (d.get("ends_at") or d.get("starts_at") or "") >= now_iso]
    items = (upcoming or docs)[:limit]
    for d in items:
        d["sold_out"] = _is_sold_out(d)
        # An organizer-sponsored boost expires; admin "featured" has no boosted_until.
        bu = d.get("boosted_until")
        d["is_featured"] = bool(d.get("is_featured")) and (not bu or bu >= now_iso)
    return {"items": items, "count": len(items)}


@public_router.get("/categories")
async def event_categories():
    """Category list with live counts (active upcoming events)."""
    now_iso = _now()
    out = []
    for slug, label in CATEGORIES.items():
        c = await db.events.count_documents(
            {"status": "active", "category": slug, "starts_at": {"$gte": now_iso}}
        )
        out.append({"slug": slug, "label": label, "count": c})
    return {"categories": out}


@public_router.get("/my/tickets")
async def my_tickets(request: Request):
    """The user's purchased tickets / reservation history (newest first)."""
    user = await get_current_user(request)
    tickets = await db.event_tickets.find(
        {"user_id": user["id"]}, {"_id": 0}
    ).sort("purchased_at", -1).to_list(200)
    return {"tickets": tickets, "count": len(tickets)}


@public_router.get("/{event_id}")
async def get_event(event_id: str):
    ev = await db.events.find_one({"id": event_id, "status": "active"}, {"_id": 0})
    if not ev:
        raise HTTPException(status_code=404, detail="Événement introuvable")
    ev["sold_out"] = _is_sold_out(ev)
    return ev


def _is_sold_out(ev: dict) -> bool:
    tiers = ev.get("tiers") or []
    if not tiers:
        return False
    return all((t.get("quantity_total", 0) - t.get("quantity_sold", 0)) <= 0 for t in tiers)


@public_router.post("/{event_id}/purchase")
async def purchase_ticket(event_id: str, request: Request):
    """Buy N tickets of one tier, paid from the SB Pay wallet. Returns the ticket
    (with a unique QR token). `transport_option` is stored for the follow-up
    SB Drive proposal shown on the client."""
    user = await get_current_user(request)
    body = await request.json()
    tier_id = body.get("tier_id")
    quantity = int(body.get("quantity", 1) or 1)
    transport_option = body.get("transport_option", "none")
    if transport_option not in TRANSPORT_OPTIONS:
        transport_option = "none"
    if quantity < 1 or quantity > 10:
        raise HTTPException(status_code=400, detail="Quantité invalide (1 à 10).")

    ev = await db.events.find_one({"id": event_id, "status": "active"}, {"_id": 0})
    if not ev:
        raise HTTPException(status_code=404, detail="Événement introuvable")
    tier = next((t for t in (ev.get("tiers") or []) if t.get("id") == tier_id), None)
    if not tier:
        raise HTTPException(status_code=400, detail="Catégorie de billet introuvable.")
    remaining = int(tier.get("quantity_total", 0)) - int(tier.get("quantity_sold", 0))
    if remaining < quantity:
        raise HTTPException(status_code=400, detail=f"Plus que {max(remaining, 0)} billet(s) disponible(s).")

    unit_price = round(float(tier.get("price", 0) or 0), 2)
    total = round(unit_price * quantity, 2)
    currency = tier.get("currency", "EUR")

    # Payment via unified SB Pay wallet (skip for free tiers).
    cashback = 0.0
    if total > 0:
        pay = await debit_with_fallback(
            user["id"], total, "wallet",
            f"Billet — {ev.get('title')} ({tier.get('name')}) x{quantity}",
            service="events", ref_id=event_id,
        )
        if not pay.get("paid"):
            raise HTTPException(status_code=402, detail="Solde SB Pay insuffisant. Rechargez votre portefeuille.")
        cashback = pay.get("cashback", 0.0)

    # Decrement stock (best-effort atomic on the matched tier).
    await db.events.update_one(
        {"id": event_id},
        {"$inc": {"tiers.$[t].quantity_sold": quantity}},
        array_filters=[{"t.id": tier_id}],
    )

    ticket = {
        "id": f"evt_tkt_{uuid.uuid4().hex[:12]}",
        "event_id": event_id,
        "user_id": user["id"],
        "tier_id": tier_id,
        "tier_name": tier.get("name"),
        "quantity": quantity,
        "unit_price": unit_price,
        "total_price": total,
        "currency": currency,
        "qr_token": f"SBEVT-{secrets.token_urlsafe(10)}",
        "status": "valid",
        "transport_option": transport_option,
        "event_snapshot": _event_snapshot(ev),
        "cashback": cashback,
        "purchased_at": _now(),
        "used_at": None,
    }
    await db.event_tickets.insert_one(ticket)
    ticket.pop("_id", None)
    return {"ticket": ticket, "cashback": cashback}


@public_router.post("/tickets/{ticket_id}/cancel")
async def cancel_ticket(ticket_id: str, request: Request):
    """Cancel a still-valid ticket before the event starts → refund to SB Pay."""
    user = await get_current_user(request)
    tkt = await db.event_tickets.find_one({"id": ticket_id, "user_id": user["id"]}, {"_id": 0})
    if not tkt:
        raise HTTPException(status_code=404, detail="Billet introuvable")
    if tkt.get("status") != "valid":
        raise HTTPException(status_code=400, detail="Billet déjà utilisé ou annulé.")
    starts_at = (tkt.get("event_snapshot") or {}).get("starts_at") or ""
    if starts_at and starts_at <= _now():
        raise HTTPException(status_code=400, detail="L'événement a déjà commencé — annulation impossible.")

    if float(tkt.get("total_price", 0) or 0) > 0:
        await refund_user(user["id"], float(tkt["total_price"]), "wallet",
                          f"Remboursement billet — {(tkt.get('event_snapshot') or {}).get('title')}")
    await db.event_tickets.update_one({"id": ticket_id}, {"$set": {"status": "cancelled", "cancelled_at": _now()}})
    # Release stock
    await db.events.update_one(
        {"id": tkt["event_id"]},
        {"$inc": {"tiers.$[t].quantity_sold": -int(tkt.get("quantity", 1))}},
        array_filters=[{"t.id": tkt.get("tier_id")}],
    )
    return {"message": "Billet annulé et remboursé", "refunded": tkt.get("total_price", 0)}


# ----------------------------------------------------------------- admin CRUD
def _build_event(body: dict) -> dict:
    tiers = []
    for t in (body.get("tiers") or []):
        tiers.append({
            "id": t.get("id") or f"tier_{uuid.uuid4().hex[:6]}",
            "name": t.get("name") or "Standard",
            "price": round(float(t.get("price", 0) or 0), 2),
            "currency": t.get("currency", "EUR"),
            "quantity_total": int(t.get("quantity_total", 0) or 0),
            "quantity_sold": int(t.get("quantity_sold", 0) or 0),
        })
    return {
        "title": (body.get("title") or "").strip(),
        "category": body.get("category") if body.get("category") in CATEGORIES else "concert",
        "description": body.get("description", ""),
        "image": body.get("image", ""),
        "venue_name": body.get("venue_name", ""),
        "address": body.get("address", ""),
        "city": body.get("city", ""),
        "lat": body.get("lat"),
        "lng": body.get("lng"),
        "starts_at": body.get("starts_at"),
        "ends_at": body.get("ends_at"),
        "organizer_name": body.get("organizer_name", ""),
        "tiers": tiers,
        "is_featured": bool(body.get("is_featured", False)),
        "status": body.get("status", "active"),
    }


@admin_router.get("")
async def admin_list_events(request: Request):
    await require_role(request, ["admin"])
    docs = await db.events.find({}, {"_id": 0}).sort("starts_at", 1).to_list(500)
    return {"items": docs, "count": len(docs)}


@admin_router.post("")
async def admin_create_event(request: Request):
    await require_role(request, ["admin"])
    body = await request.json()
    ev = _build_event(body)
    if not ev["title"] or not ev["starts_at"]:
        raise HTTPException(status_code=400, detail="Titre et date de début requis.")
    ev["id"] = f"event_{uuid.uuid4().hex[:12]}"
    ev["created_at"] = _now()
    await db.events.insert_one(ev)
    ev.pop("_id", None)
    return ev


@admin_router.put("/{event_id}")
async def admin_update_event(event_id: str, request: Request):
    await require_role(request, ["admin"])
    body = await request.json()
    ev = _build_event(body)
    res = await db.events.update_one({"id": event_id}, {"$set": ev})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Événement introuvable")
    doc = await db.events.find_one({"id": event_id}, {"_id": 0})
    return doc


@admin_router.delete("/{event_id}")
async def admin_delete_event(event_id: str, request: Request):
    await require_role(request, ["admin"])
    await db.events.delete_one({"id": event_id})
    return {"message": "Événement supprimé"}


@admin_router.get("/{event_id}/attendees")
async def admin_event_attendees(event_id: str, request: Request):
    """Phase 2 seed: participant list + simple sales stats for an event."""
    await require_role(request, ["admin"])
    tickets = await db.event_tickets.find({"event_id": event_id}, {"_id": 0}).to_list(1000)
    valid = [t for t in tickets if t.get("status") == "valid"]
    revenue = round(sum(float(t.get("total_price", 0) or 0) for t in valid), 2)
    seats = sum(int(t.get("quantity", 0) or 0) for t in valid)
    return {"tickets": tickets, "stats": {"orders": len(valid), "seats": seats, "revenue": revenue}}


@admin_router.get("/config/settings")
async def admin_get_events_settings(request: Request):
    await require_role(request, ["admin"])
    return await get_events_settings()


@admin_router.put("/config/settings")
async def admin_set_events_settings(request: Request):
    await require_role(request, ["admin"])
    body = await request.json()
    update = {
        "id": "default",
        "commission_percent": round(float(body.get("commission_percent", 10) or 0), 2),
        "boost_price_per_day": round(float(body.get("boost_price_per_day", 9.99) or 0), 2),
    }
    await db.events_settings.update_one({"id": "default"}, {"$set": update}, upsert=True)
    return await get_events_settings()


@admin_router.get("/config/organizers")
async def admin_list_organizers(request: Request):
    await require_role(request, ["admin"])
    orgs = await db.organizers.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    for o in orgs:
        o["events_count"] = await db.events.count_documents({"organizer_id": o["id"]})
    return {"organizers": orgs, "count": len(orgs)}
