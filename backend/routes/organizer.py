"""SB Événement Pro — organizer space.

A logged-in user opens an organizer profile (instant, like becoming a merchant),
then manages THEIR own events: create/edit/publish, sales dashboard, participants
list, and paid sponsorship ("boost") charged to their SB Pay wallet.

Payout of net revenue to the organizer is displayed but not transferred yet
(handled later, like ferry settlements).
"""
import uuid
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Request, HTTPException

from core.config import db
from core.deps import get_current_user
from core.payments import debit_with_fallback
from routes.events import _build_event, get_events_settings, CATEGORIES

router = APIRouter(prefix="/organizer", tags=["organizer"])


def _now():
    return datetime.now(timezone.utc).isoformat()


async def _require_organizer(request: Request) -> dict:
    user = await get_current_user(request)
    org = await db.organizers.find_one({"user_id": user["id"]}, {"_id": 0})
    if not org:
        raise HTTPException(status_code=403, detail="Profil organisateur requis")
    return org


def _event_stats(ev: dict, tickets: list) -> dict:
    valid = [t for t in tickets if t.get("status") == "valid"]
    gross = round(sum(float(t.get("total_price", 0) or 0) for t in valid), 2)
    seats = sum(int(t.get("quantity", 0) or 0) for t in valid)
    checked = [t for t in valid if t.get("checked_in")]
    checked_orders = len(checked)
    checked_seats = sum(int(t.get("quantity", 0) or 0) for t in checked)
    pct = float(ev.get("commission_percent", 10) or 0)
    commission = round(gross * pct / 100, 2)
    return {
        "orders": len(valid), "seats": seats, "gross": gross,
        "commission_percent": pct, "commission": commission,
        "net": round(gross - commission, 2),
        "checked_in_orders": checked_orders, "checked_in_seats": checked_seats,
    }


# --------------------------------------------------------------- profile
@router.get("/me")
async def organizer_me(request: Request):
    user = await get_current_user(request)
    org = await db.organizers.find_one({"user_id": user["id"]}, {"_id": 0})
    return {"profile": org}


@router.post("/register")
async def organizer_register(request: Request):
    user = await get_current_user(request)
    existing = await db.organizers.find_one({"user_id": user["id"]}, {"_id": 0})
    if existing:
        return {"profile": existing, "created": False}
    body = await request.json()
    name = (body.get("name") or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Nom de l'organisateur requis")
    org = {
        "id": f"org_{uuid.uuid4().hex[:12]}",
        "user_id": user["id"],
        "name": name,
        "email": (body.get("email") or user.get("email") or "").strip(),
        "phone": (body.get("phone") or user.get("phone") or "").strip(),
        "status": "active",
        "created_at": _now(),
    }
    await db.organizers.insert_one(org)
    org.pop("_id", None)
    return {"profile": org, "created": True}


@router.get("/settings")
async def organizer_settings(request: Request):
    await _require_organizer(request)
    return await get_events_settings()


# --------------------------------------------------------------- dashboard
@router.get("/dashboard")
async def organizer_dashboard(request: Request):
    org = await _require_organizer(request)
    events = await db.events.find({"organizer_id": org["id"]}, {"_id": 0}).sort("starts_at", 1).to_list(500)
    ev_ids = [e["id"] for e in events]
    all_tickets = await db.event_tickets.find({"event_id": {"$in": ev_ids}}, {"_id": 0}).to_list(5000) if ev_ids else []
    by_event = {}
    for t in all_tickets:
        by_event.setdefault(t["event_id"], []).append(t)

    totals = {"events": len(events), "active": 0, "orders": 0, "seats": 0, "gross": 0.0, "commission": 0.0, "net": 0.0}
    for e in events:
        st = _event_stats(e, by_event.get(e["id"], []))
        e["stats"] = st
        e["sold_out"] = all((t.get("quantity_total", 0) - t.get("quantity_sold", 0)) <= 0 for t in (e.get("tiers") or [])) if e.get("tiers") else False
        bu = e.get("boosted_until")
        e["boost_active"] = bool(e.get("is_featured")) and (not bu or bu >= _now())
        if e.get("status") == "active":
            totals["active"] += 1
        totals["orders"] += st["orders"]
        totals["seats"] += st["seats"]
        totals["gross"] = round(totals["gross"] + st["gross"], 2)
        totals["commission"] = round(totals["commission"] + st["commission"], 2)
        totals["net"] = round(totals["net"] + st["net"], 2)
    return {"profile": org, "totals": totals, "events": events}


# --------------------------------------------------------------- event CRUD (own)
@router.post("/events")
async def organizer_create_event(request: Request):
    org = await _require_organizer(request)
    body = await request.json()
    ev = _build_event(body)
    if not ev["title"] or not ev["starts_at"]:
        raise HTTPException(status_code=400, detail="Titre et date de début requis.")
    settings = await get_events_settings()
    ev["id"] = f"event_{uuid.uuid4().hex[:12]}"
    ev["organizer_id"] = org["id"]
    ev["organizer_name"] = ev.get("organizer_name") or org["name"]
    ev["commission_percent"] = settings["commission_percent"]
    ev["boosted_until"] = None
    ev["boost_spent"] = 0.0
    ev["created_at"] = _now()
    await db.events.insert_one(ev)
    ev.pop("_id", None)
    return ev


async def _own_event(org, event_id):
    ev = await db.events.find_one({"id": event_id, "organizer_id": org["id"]}, {"_id": 0})
    if not ev:
        raise HTTPException(status_code=404, detail="Événement introuvable")
    return ev


@router.put("/events/{event_id}")
async def organizer_update_event(event_id: str, request: Request):
    org = await _require_organizer(request)
    await _own_event(org, event_id)
    body = await request.json()
    ev = _build_event(body)
    # never let the client reassign ownership / commission via this path
    ev.pop("organizer_id", None)
    await db.events.update_one({"id": event_id, "organizer_id": org["id"]}, {"$set": ev})
    return await db.events.find_one({"id": event_id}, {"_id": 0})


@router.delete("/events/{event_id}")
async def organizer_delete_event(event_id: str, request: Request):
    org = await _require_organizer(request)
    await _own_event(org, event_id)
    await db.events.delete_one({"id": event_id, "organizer_id": org["id"]})
    return {"message": "Événement supprimé"}


@router.get("/events/{event_id}/attendees")
async def organizer_attendees(event_id: str, request: Request):
    org = await _require_organizer(request)
    ev = await _own_event(org, event_id)
    tickets = await db.event_tickets.find({"event_id": event_id}, {"_id": 0}).sort("purchased_at", -1).to_list(2000)
    return {"event": {"id": ev["id"], "title": ev["title"]}, "tickets": tickets, "stats": _event_stats(ev, tickets)}


# --------------------------------------------------------------- entry check-in (QR scan)
async def _buyer_name(user_id: str) -> str:
    u = await db.users.find_one({"id": user_id}, {"_id": 0, "name": 1})
    return (u or {}).get("name") or "Participant"


@router.get("/events/{event_id}/checkin-stats")
async def organizer_checkin_stats(event_id: str, request: Request):
    """Live check-in counters for the scanner screen."""
    org = await _require_organizer(request)
    ev = await _own_event(org, event_id)
    tickets = await db.event_tickets.find({"event_id": event_id, "status": "valid"}, {"_id": 0}).to_list(5000)
    seats = sum(int(t.get("quantity", 0) or 0) for t in tickets)
    checked = [t for t in tickets if t.get("checked_in")]
    return {
        "event": {"id": ev["id"], "title": ev["title"]},
        "orders": len(tickets), "seats": seats,
        "checked_in_orders": len(checked),
        "checked_in_seats": sum(int(t.get("quantity", 0) or 0) for t in checked),
    }


@router.post("/events/{event_id}/checkin")
async def organizer_checkin(event_id: str, request: Request):
    """Validate a ticket QR at the door. Returns one of:
    ok | already_used | cancelled | wrong_event | invalid.
    A valid ticket is marked checked_in (revenue stats keep status 'valid')."""
    org = await _require_organizer(request)
    await _own_event(org, event_id)
    body = await request.json()
    code = (body.get("qr_token") or body.get("code") or "").strip()
    if not code:
        raise HTTPException(status_code=400, detail="Code du billet requis")

    tkt = await db.event_tickets.find_one({"qr_token": code}, {"_id": 0})
    if not tkt:
        tkt = await db.event_tickets.find_one({"id": code}, {"_id": 0})
    if not tkt:
        return {"result": "invalid", "message": "Billet introuvable"}
    if tkt.get("event_id") != event_id:
        return {"result": "wrong_event", "message": "Billet d'un autre événement"}
    if tkt.get("status") == "cancelled":
        return {"result": "cancelled", "message": "Billet annulé"}
    if tkt.get("status") != "valid":
        return {"result": "invalid", "message": "Billet non valide"}

    name = await _buyer_name(tkt["user_id"])
    if tkt.get("checked_in"):
        return {
            "result": "already_used", "message": "Déjà scanné",
            "ticket": {"id": tkt["id"], "buyer": name, "tier_name": tkt.get("tier_name"),
                       "quantity": tkt.get("quantity"), "checked_in_at": tkt.get("checked_in_at")},
        }

    now = _now()
    upd = await db.event_tickets.find_one_and_update(
        {"id": tkt["id"], "checked_in": {"$ne": True}, "status": "valid"},
        {"$set": {"checked_in": True, "checked_in_at": now, "used_at": now}},
    )
    if not upd:  # raced with another scanner
        return {"result": "already_used", "message": "Déjà scanné",
                "ticket": {"id": tkt["id"], "buyer": name, "tier_name": tkt.get("tier_name"), "quantity": tkt.get("quantity")}}
    return {
        "result": "ok", "message": "Entrée validée",
        "ticket": {"id": tkt["id"], "buyer": name, "tier_name": tkt.get("tier_name"),
                   "quantity": tkt.get("quantity"), "checked_in_at": now},
    }


# --------------------------------------------------------------- sponsorship
@router.post("/events/{event_id}/boost")
async def organizer_boost_event(event_id: str, request: Request):
    """Sponsor an event: feature it ('À la une' / top) for N days, paid via SB Pay."""
    org = await _require_organizer(request)
    ev = await _own_event(org, event_id)
    body = await request.json()
    days = int(body.get("days", 0) or 0)
    if days < 1 or days > 60:
        raise HTTPException(status_code=400, detail="Durée invalide (1 à 60 jours).")
    settings = await get_events_settings()
    cost = round(days * float(settings["boost_price_per_day"]), 2)

    pay = await debit_with_fallback(
        org["user_id"], cost, "wallet",
        f"Sponsorisation — {ev['title']} ({days} j)", service="event_boost", ref_id=event_id,
    )
    if not pay.get("paid"):
        raise HTTPException(status_code=402, detail="Solde SB Pay insuffisant pour la sponsorisation.")

    # Extend from the current boost end (or now) by N days.
    base = ev.get("boosted_until")
    start = base if (base and base >= _now()) else _now()
    new_until = (datetime.fromisoformat(start) + timedelta(days=days)).isoformat()
    await db.events.update_one(
        {"id": event_id},
        {"$set": {"is_featured": True, "boosted_until": new_until},
         "$inc": {"boost_spent": cost}},
    )
    return {"message": "Événement sponsorisé", "cost": cost, "days": days, "boosted_until": new_until}
