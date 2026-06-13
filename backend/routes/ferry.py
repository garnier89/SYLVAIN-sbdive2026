"""
SB Ferry — billetterie maritime (Antilles).

Permet d'acheter un billet de bateau, qu'il soit :
  - INTER-ÎLES (ex. Fort-de-France ⇄ Pointe-à-Pitre, ⇄ Roseau, ⇄ Castries…)
  - LOCAL / intra-île (ex. Fort-de-France ⇄ Les Trois-Îlets, ⇄ Sainte-Anne…)

Le client recherche un trajet (port départ → port arrivée + date), choisit un
horaire, renseigne ses passagers, paie via SB Pay, et reçoit un billet avec
référence + QR. Une correspondance « SB Drive VTC vers le port » est proposée.

Collections :
  - ferry_ports     : {id, name, city, island, lat, lng, is_active}
  - ferry_companies : {id, name, color, is_active}
  - ferry_routes    : {id, company_id, company_name, from_port_id, from_label,
                       to_port_id, to_label, route_type, duration_min,
                       price_adult, price_child, departure_times[], is_active,
                       display_order}
  - ferry_bookings  : billet émis (réf, passagers, total, statut, qr_payload…)
"""
import json
import os
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Request, HTTPException, Depends

from core.config import db
from core.permissions import require_permission
from core.deps import get_current_user

public_router = APIRouter(prefix="/ferry", tags=["ferry"])
admin_router = APIRouter(prefix="/admin/ferry", tags=["admin-ferry"])

# SB Drive commission (%) taken on each ferry ticket by default (per-company override possible).
DEFAULT_COMMISSION = 12.0


def _now():
    return datetime.now(timezone.utc).isoformat()


def _ref():
    return f"SBF-{uuid.uuid4().hex[:8].upper()}"


def stripe_enabled():
    """A real Stripe secret key is long; the placeholder in .env is short → card disabled."""
    k = os.environ.get("STRIPE_API_KEY", "")
    return k.startswith("sk_") and len(k) >= 30


async def _global_commission():
    doc = await db.ferry_config.find_one({"id": "global"})
    try:
        return float(doc.get("commission_percent")) if doc and doc.get("commission_percent") is not None else DEFAULT_COMMISSION
    except (TypeError, ValueError):
        return DEFAULT_COMMISSION


async def _commission_pct_for(route):
    """Company-specific commission if set, otherwise the global default."""
    company = await db.ferry_companies.find_one({"id": route.get("company_id")}, {"_id": 0, "commission_percent": 1})
    if company and company.get("commission_percent") is not None:
        try:
            return float(company["commission_percent"])
        except (TypeError, ValueError):
            pass
    return await _global_commission()


def _compute_split(total, commission_pct, payment_method):
    """Split a gross ticket price into SB Drive commission vs ferry-company revenue.

    - sbpay / stripe : SB Drive collects the money → it OWES the company its net revenue.
    - cash           : the company collects at the port → it OWES SB Drive the commission.
    """
    commission = round(total * commission_pct / 100.0, 2)
    company_rev = round(total - commission, 2)
    if payment_method == "cash":
        direction = "company_owes_platform"
        settle_amount = commission
    else:
        direction = "platform_owes_company"
        settle_amount = company_rev
    return {
        "commission_percent": round(commission_pct, 2),
        "platform_commission": commission,
        "company_revenue": company_rev,
        "settlement_direction": direction,
        "settlement_amount": settle_amount,
    }


def _make_booking_doc(user_id, route, adults, children, travel_date, departure_time,
                      passengers, payment_method, payment_status, total, split):
    ref = _ref()
    qr_payload = json.dumps({"ref": ref, "from": route["from_label"], "to": route["to_label"],
                             "date": travel_date, "time": departure_time,
                             "pax": adults + children, "type": "sb_ferry"}, ensure_ascii=False)
    return {
        "id": f"fbk_{uuid.uuid4().hex[:12]}",
        "booking_ref": ref,
        "user_id": user_id,
        "route_id": route["id"],
        "company_id": route.get("company_id"),
        "company_name": route["company_name"],
        "from_port_id": route["from_port_id"], "from_label": route["from_label"],
        "to_port_id": route["to_port_id"], "to_label": route["to_label"],
        "route_type": route["route_type"], "duration_min": route["duration_min"],
        "travel_date": travel_date, "departure_time": departure_time,
        "adults": adults, "children": children,
        "passengers": passengers,
        "unit_adult": float(route["price_adult"]), "unit_child": float(route["price_child"]),
        "total": total, "currency": "EUR",
        "commission_percent": split["commission_percent"],
        "platform_commission": split["platform_commission"],
        "company_revenue": split["company_revenue"],
        "settlement_direction": split["settlement_direction"],
        "settlement_amount": split["settlement_amount"],
        "settlement_status": "pending",
        "payment_method": payment_method, "payment_status": payment_status,
        "status": "confirmed",
        "qr_payload": qr_payload,
        "created_at": _now(),
    }


def _validate_booking_body(route, body):
    """Shared validation → returns (adults, children, travel_date, departure_time, total)."""
    adults = max(1, int(body.get("adults", 1)))
    children = max(0, int(body.get("children", 0)))
    travel_date = (body.get("travel_date") or "").strip()
    departure_time = (body.get("departure_time") or "").strip()
    if not travel_date or not departure_time:
        raise HTTPException(status_code=400, detail="Date et horaire requis")
    if travel_date < datetime.now(timezone.utc).date().isoformat():
        raise HTTPException(status_code=400, detail="La date de voyage est déjà passée")
    if departure_time not in (route.get("departure_times") or []):
        raise HTTPException(status_code=400, detail="Horaire indisponible")
    total = round(adults * float(route["price_adult"]) + children * float(route["price_child"]), 2)
    return adults, children, travel_date, departure_time, total


# ============================================================
# Seed (idempotent)
# ============================================================

_PORTS = [
    # Martinique
    ("ftdf", "Gare maritime de Fort-de-France", "Fort-de-France", "Martinique", 14.5996, -61.0733),
    ("trois", "Anse Mitan — Les Trois-Îlets", "Les Trois-Îlets", "Martinique", 14.5489, -61.0494),
    ("steanne", "Embarcadère de Sainte-Anne", "Sainte-Anne", "Martinique", 14.4361, -60.8853),
    ("marin", "Port du Marin", "Le Marin", "Martinique", 14.4694, -60.8669),
    # Guadeloupe
    ("ptp", "Gare maritime de Pointe-à-Pitre", "Pointe-à-Pitre", "Guadeloupe", 16.2376, -61.5344),
    ("saintes", "Terre-de-Haut — Les Saintes", "Les Saintes", "Guadeloupe", 15.8669, -61.5847),
    ("mgalante", "Grand-Bourg — Marie-Galante", "Marie-Galante", "Guadeloupe", 15.8853, -61.3094),
    # Dominique / Sainte-Lucie
    ("roseau", "Port de Roseau", "Roseau", "Dominique", 15.3017, -61.3881),
    ("castries", "Port de Castries", "Castries", "Sainte-Lucie", 14.0167, -60.9897),
]

_COMPANIES = [
    ("expdesiles", "L'Express des Îles", "#0EA5E9"),
    ("valferry", "Val'Ferry", "#F97316"),
    ("cmwi", "Compagnie Maritime West Indies", "#10B981"),
]

# (company_id, from_port, to_port, route_type, duration_min, price_adult, price_child, [times])
_ROUTES = [
    # Local — baie de Fort-de-France (navettes fréquentes)
    ("valferry", "ftdf", "trois", "local", 20, 7.0, 4.0, ["06:30", "07:30", "08:30", "12:00", "16:00", "18:00", "19:30"]),
    ("valferry", "ftdf", "steanne", "local", 45, 12.0, 7.0, ["07:00", "09:30", "15:00", "17:30"]),
    ("valferry", "ftdf", "marin", "local", 50, 14.0, 8.0, ["08:00", "16:30"]),
    # Inter-îles
    ("expdesiles", "ftdf", "ptp", "inter_island", 240, 79.0, 49.0, ["07:30", "14:00"]),
    ("expdesiles", "ftdf", "roseau", "inter_island", 120, 65.0, 45.0, ["08:00"]),
    ("expdesiles", "ftdf", "castries", "inter_island", 90, 59.0, 39.0, ["09:00", "16:00"]),
    ("cmwi", "ptp", "saintes", "inter_island", 45, 25.0, 15.0, ["08:00", "13:00", "17:00"]),
    ("cmwi", "ptp", "mgalante", "inter_island", 60, 28.0, 18.0, ["08:15", "12:45", "17:15"]),
]


async def _ensure_commission_defaults():
    """Idempotent backfill so commission works on already-seeded environments too."""
    if await db.ferry_config.count_documents({"id": "global"}) == 0:
        await db.ferry_config.insert_one({"id": "global", "commission_percent": DEFAULT_COMMISSION,
                                          "updated_at": _now()})
    await db.ferry_companies.update_many(
        {"commission_percent": {"$exists": False}},
        {"$set": {"commission_percent": DEFAULT_COMMISSION}})


async def seed_ferry():
    """Seed ports, companies and routes (both directions) if none exist."""
    await _ensure_commission_defaults()
    if await db.ferry_routes.count_documents({}) > 0:
        return
    port_label = {}
    if await db.ferry_ports.count_documents({}) == 0:
        docs = []
        for key, name, city, island, lat, lng in _PORTS:
            docs.append({"id": f"fpt_{key}", "name": name, "city": city, "island": island,
                         "lat": lat, "lng": lng, "is_active": True})
        await db.ferry_ports.insert_many(docs)
    for key, name, city, island, lat, lng in _PORTS:
        port_label[f"fpt_{key}"] = f"{city} ({island})"

    company_name = {}
    if await db.ferry_companies.count_documents({}) == 0:
        docs = []
        for key, name, color in _COMPANIES:
            docs.append({"id": f"fco_{key}", "name": name, "color": color,
                         "commission_percent": DEFAULT_COMMISSION, "is_active": True})
        await db.ferry_companies.insert_many(docs)
    for key, name, color in _COMPANIES:
        company_name[f"fco_{key}"] = name

    routes = []
    order = 0
    for cid, frm, to, rtype, dur, pa, pc, times in _ROUTES:
        for a, b in ((frm, to), (to, frm)):  # both directions
            routes.append({
                "id": f"frt_{uuid.uuid4().hex[:10]}",
                "company_id": f"fco_{cid}", "company_name": company_name[f"fco_{cid}"],
                "from_port_id": f"fpt_{a}", "from_label": port_label[f"fpt_{a}"],
                "to_port_id": f"fpt_{b}", "to_label": port_label[f"fpt_{b}"],
                "route_type": rtype, "duration_min": dur,
                "price_adult": pa, "price_child": pc,
                "departure_times": times, "is_active": True, "display_order": order,
                "created_at": _now(), "updated_at": _now(),
            })
            order += 1
    if routes:
        await db.ferry_routes.insert_many(routes)


# ============================================================
# Public
# ============================================================

@public_router.get("/ports")
async def list_ports():
    ports = await db.ferry_ports.find({"is_active": True}, {"_id": 0}).sort("city", 1).to_list(200)
    return {"ports": ports}


@public_router.get("/routes")
async def search_routes(from_port: str = "", to_port: str = "", q: str = "", route_type: str = ""):
    """Search active routes. Filter by from/to port id, free-text (port/city/island), or type."""
    query = {"is_active": True}
    if from_port:
        query["from_port_id"] = from_port
    if to_port:
        query["to_port_id"] = to_port
    if route_type in ("local", "inter_island"):
        query["route_type"] = route_type
    routes = await db.ferry_routes.find(query, {"_id": 0}).sort("display_order", 1).to_list(300)
    if q:
        ql = q.strip().lower()
        routes = [r for r in routes if ql in (r.get("from_label", "") + " " + r.get("to_label", "")).lower()]
    return {"routes": routes, "count": len(routes)}


@public_router.get("/routes/{route_id}")
async def route_detail(route_id: str):
    r = await db.ferry_routes.find_one({"id": route_id}, {"_id": 0})
    if not r:
        raise HTTPException(status_code=404, detail="Trajet introuvable")
    return r


@public_router.post("/bookings")
async def create_booking(request: Request):
    """Create a ferry booking (SB Pay or cash), split revenue, issue ticket (ref + QR).

    payment_method:
      - sbpay : debit wallet now (platform collects → owes company its net revenue)
      - cash  : pay at the port (company collects → owes platform the commission)
    Card payments go through /bookings/stripe-checkout (two-step).
    """
    user = await get_current_user(request)
    body = await request.json()

    route = await db.ferry_routes.find_one({"id": body.get("route_id")}, {"_id": 0})
    if not route or not route.get("is_active"):
        raise HTTPException(status_code=404, detail="Trajet indisponible")

    adults, children, travel_date, departure_time, total = _validate_booking_body(route, body)

    payment_method = body.get("payment_method", "sbpay")
    if payment_method not in ("sbpay", "cash"):
        raise HTTPException(status_code=400, detail="Mode de paiement invalide")

    new_balance = None
    if payment_method == "sbpay":
        wallet = await db.wallets.find_one({"user_id": user["id"]})
        balance = (wallet or {}).get("balance", 0)
        if not wallet or balance < total:
            raise HTTPException(status_code=400, detail="Solde SB Pay insuffisant. Rechargez votre portefeuille.")
        new_balance = round(balance - total, 2)
        await db.wallets.update_one({"user_id": user["id"]}, {"$set": {"balance": new_balance}})

    commission_pct = await _commission_pct_for(route)
    split = _compute_split(total, commission_pct, payment_method)
    payment_status = "paid" if payment_method == "sbpay" else "cash_due"
    booking = _make_booking_doc(user["id"], route, adults, children, travel_date, departure_time,
                                body.get("passengers", []), payment_method, payment_status, total, split)
    await db.ferry_bookings.insert_one(dict(booking))

    if payment_method == "sbpay":
        await db.wallet_transactions.insert_one({
            "id": f"tx_{uuid.uuid4().hex[:12]}", "user_id": user["id"], "type": "Booking",
            "amount": -total, "balance_after": new_balance,
            "description": f"SB Ferry {route['from_label']} → {route['to_label']}",
            "status": "completed", "created_at": _now(),
        })
        try:
            from core.cashback import award_cashback
            await award_cashback(user["id"], total, "sbpay", "ferry", ref_id=booking["id"])
        except Exception:
            pass

    booking.pop("_id", None)
    return booking


@public_router.post("/bookings/stripe-checkout")
async def ferry_stripe_checkout(request: Request):
    """Start a Stripe Checkout for a ferry ticket. Booking is created once paid (see /stripe-status)."""
    user = await get_current_user(request)
    if not stripe_enabled():
        raise HTTPException(status_code=503, detail="Paiement par carte bientôt disponible. Utilisez SB Pay ou payez en espèces au port.")
    body = await request.json()
    route = await db.ferry_routes.find_one({"id": body.get("route_id")}, {"_id": 0})
    if not route or not route.get("is_active"):
        raise HTTPException(status_code=404, detail="Trajet indisponible")
    adults, children, travel_date, departure_time, total = _validate_booking_body(route, body)
    origin_url = (body.get("origin_url") or "").rstrip("/")
    if not origin_url:
        raise HTTPException(status_code=400, detail="Origin URL requis")

    from emergentintegrations.payments.stripe.checkout import StripeCheckout, CheckoutSessionRequest
    host_url = str(request.base_url).rstrip("/")
    sc = StripeCheckout(api_key=os.environ["STRIPE_API_KEY"], webhook_url=f"{host_url}/api/webhook/stripe")
    success_url = f"{origin_url}/ferry?ferry_session={{CHECKOUT_SESSION_ID}}"
    cancel_url = f"{origin_url}/ferry"
    session = await sc.create_checkout_session(CheckoutSessionRequest(
        amount=float(total), currency="eur", success_url=success_url, cancel_url=cancel_url,
        metadata={"user_id": user["id"], "type": "ferry_ticket", "route_id": route["id"]},
    ))
    now = _now()
    await db.payment_transactions.insert_one({
        "id": f"pay_{uuid.uuid4().hex[:12]}", "session_id": session.session_id, "user_id": user["id"],
        "amount": total, "currency": "EUR", "type": "ferry_ticket",
        "payment_status": "pending", "status": "initiated",
        "metadata": {"route_id": route["id"], "adults": adults, "children": children,
                     "travel_date": travel_date, "departure_time": departure_time,
                     "passengers": body.get("passengers", [])},
        "created_at": now, "updated_at": now,
    })
    return {"url": session.url, "session_id": session.session_id}


@public_router.get("/stripe-status/{session_id}")
async def ferry_stripe_status(session_id: str, request: Request):
    user = await get_current_user(request)
    tx = await db.payment_transactions.find_one(
        {"session_id": session_id, "user_id": user["id"], "type": "ferry_ticket"}, {"_id": 0})
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction introuvable")
    if tx.get("payment_status") == "paid" and tx.get("booking_id"):
        b = await db.ferry_bookings.find_one({"id": tx["booking_id"]}, {"_id": 0})
        return {"payment_status": "paid", "booking": b}
    if not stripe_enabled():
        return {"payment_status": tx["payment_status"], "booking": None}

    from emergentintegrations.payments.stripe.checkout import StripeCheckout
    host_url = str(request.base_url).rstrip("/")
    sc = StripeCheckout(api_key=os.environ["STRIPE_API_KEY"], webhook_url=f"{host_url}/api/webhook/stripe")
    try:
        status = await sc.get_checkout_status(session_id)
    except Exception:
        return {"payment_status": tx["payment_status"], "booking": None}

    now = _now()
    if status and status.payment_status == "paid":
        # Atomically claim the transaction so the booking is created only once.
        res = await db.payment_transactions.update_one(
            {"session_id": session_id, "payment_status": {"$ne": "paid"}},
            {"$set": {"payment_status": "paid", "status": "complete", "updated_at": now}})
        if res.modified_count > 0:
            meta = tx.get("metadata") or {}
            route = await db.ferry_routes.find_one({"id": meta.get("route_id")}, {"_id": 0})
            total = round(tx["amount"], 2)
            commission_pct = await _commission_pct_for(route)
            split = _compute_split(total, commission_pct, "stripe")
            booking = _make_booking_doc(user["id"], route, meta.get("adults", 1), meta.get("children", 0),
                                        meta.get("travel_date"), meta.get("departure_time"),
                                        meta.get("passengers", []), "stripe", "paid", total, split)
            await db.ferry_bookings.insert_one(dict(booking))
            await db.payment_transactions.update_one({"session_id": session_id}, {"$set": {"booking_id": booking["id"]}})
            try:
                from core.cashback import award_cashback
                await award_cashback(user["id"], total, "stripe", "ferry", ref_id=booking["id"])
            except Exception:
                pass
            booking.pop("_id", None)
            return {"payment_status": "paid", "booking": booking}
        # Lost the race → fetch the booking created by the winning request.
        fresh = await db.payment_transactions.find_one({"session_id": session_id}, {"_id": 0, "booking_id": 1})
        b = await db.ferry_bookings.find_one({"id": (fresh or {}).get("booking_id")}, {"_id": 0}) if fresh else None
        return {"payment_status": "paid", "booking": b}
    if status and status.status == "expired":
        await db.payment_transactions.update_one(
            {"session_id": session_id}, {"$set": {"payment_status": "expired", "status": "expired", "updated_at": now}})
        return {"payment_status": "expired", "booking": None}
    return {"payment_status": status.payment_status if status else "pending", "booking": None}


@public_router.get("/bookings")
async def my_bookings(request: Request):
    user = await get_current_user(request)
    items = await db.ferry_bookings.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return {"bookings": items}


@public_router.get("/bookings/{booking_id}")
async def booking_detail(booking_id: str, request: Request):
    user = await get_current_user(request)
    b = await db.ferry_bookings.find_one({"id": booking_id, "user_id": user["id"]}, {"_id": 0})
    if not b:
        raise HTTPException(status_code=404, detail="Billet introuvable")
    # Attach departure port coordinates for the VTC connection.
    port = await db.ferry_ports.find_one({"id": b["from_port_id"]}, {"_id": 0})
    b["from_port"] = port
    return b


# ============================================================
# Admin CMS
# ============================================================

@admin_router.get("/companies")
async def admin_companies(current_user: dict = Depends(require_permission("content.manage"))):
    items = await db.ferry_companies.find({}, {"_id": 0}).sort("name", 1).to_list(100)
    return {"companies": items}


@admin_router.post("/companies")
async def admin_create_company(request: Request, current_user: dict = Depends(require_permission("content.manage"))):
    body = await request.json()
    if not (body.get("name") or "").strip():
        raise HTTPException(status_code=400, detail="Nom requis")
    try:
        pct = float(body.get("commission_percent", DEFAULT_COMMISSION))
    except (TypeError, ValueError):
        pct = DEFAULT_COMMISSION
    pct = max(0.0, min(100.0, pct))
    doc = {"id": f"fco_{uuid.uuid4().hex[:8]}", "name": body["name"].strip(),
           "color": body.get("color", "#0EA5E9"), "commission_percent": pct,
           "is_active": bool(body.get("is_active", True))}
    await db.ferry_companies.insert_one(dict(doc))
    doc.pop("_id", None)
    return doc


@admin_router.put("/companies/{company_id}")
async def admin_update_company(company_id: str, request: Request, current_user: dict = Depends(require_permission("content.manage"))):
    body = await request.json()
    existing = await db.ferry_companies.find_one({"id": company_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Compagnie introuvable")
    patch = {}
    if "name" in body and (body.get("name") or "").strip():
        patch["name"] = body["name"].strip()
    if "color" in body:
        patch["color"] = body.get("color")
    if "is_active" in body:
        patch["is_active"] = bool(body.get("is_active"))
    if "commission_percent" in body:
        try:
            patch["commission_percent"] = max(0.0, min(100.0, float(body["commission_percent"])))
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail="Commission invalide")
    await db.ferry_companies.update_one({"id": company_id}, {"$set": patch})
    # Keep route labels in sync if the company was renamed.
    if "name" in patch:
        await db.ferry_routes.update_many({"company_id": company_id}, {"$set": {"company_name": patch["name"]}})
    return {**existing, **patch}


@admin_router.get("/config")
async def admin_ferry_config(current_user: dict = Depends(require_permission("content.manage"))):
    pct = await _global_commission()
    return {"commission_percent": pct, "default_commission_percent": DEFAULT_COMMISSION,
            "stripe_enabled": stripe_enabled()}


@admin_router.put("/config")
async def admin_update_ferry_config(request: Request, current_user: dict = Depends(require_permission("content.manage"))):
    body = await request.json()
    try:
        pct = max(0.0, min(100.0, float(body.get("commission_percent"))))
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="Commission invalide")
    await db.ferry_config.update_one({"id": "global"},
                                     {"$set": {"id": "global", "commission_percent": pct, "updated_at": _now()}},
                                     upsert=True)
    return {"commission_percent": pct}


@admin_router.get("/revenue")
async def admin_ferry_revenue(current_user: dict = Depends(require_permission("content.manage")),
                              date_from: str = "", date_to: str = ""):
    """Revenue split & settlement report: per company + by payment method + totals."""
    query = {}
    if date_from:
        query["created_at"] = {"$gte": date_from}
    if date_to:
        query.setdefault("created_at", {})["$lte"] = date_to + "T23:59:59"
    bookings = await db.ferry_bookings.find(query, {"_id": 0}).to_list(5000)

    companies = await db.ferry_companies.find({}, {"_id": 0}).to_list(200)
    comp_name = {c["id"]: c.get("name", "—") for c in companies}

    def _blank():
        return {"tickets": 0, "gross": 0.0, "commission": 0.0, "company_revenue": 0.0,
                "platform_owes_company": 0.0, "company_owes_platform": 0.0}

    per_company = {}
    by_method = {}
    totals = _blank()
    for b in bookings:
        total = float(b.get("total", 0) or 0)
        commission = float(b.get("platform_commission", 0) or 0)
        company_rev = float(b.get("company_revenue", 0) or 0)
        direction = b.get("settlement_direction")
        settled = b.get("settlement_status") == "settled"
        cid = b.get("company_id") or "unknown"
        method = b.get("payment_method", "sbpay")

        for bucket in (per_company.setdefault(cid, _blank()), totals):
            bucket["tickets"] += 1
            bucket["gross"] = round(bucket["gross"] + total, 2)
            bucket["commission"] = round(bucket["commission"] + commission, 2)
            bucket["company_revenue"] = round(bucket["company_revenue"] + company_rev, 2)
            if not settled and direction == "platform_owes_company":
                bucket["platform_owes_company"] = round(bucket["platform_owes_company"] + company_rev, 2)
            elif not settled and direction == "company_owes_platform":
                bucket["company_owes_platform"] = round(bucket["company_owes_platform"] + commission, 2)

        m = by_method.setdefault(method, {"tickets": 0, "gross": 0.0, "commission": 0.0})
        m["tickets"] += 1
        m["gross"] = round(m["gross"] + total, 2)
        m["commission"] = round(m["commission"] + commission, 2)

    companies_list = [{"company_id": cid, "company_name": comp_name.get(cid, "—"), **vals}
                      for cid, vals in per_company.items()]
    companies_list.sort(key=lambda x: x["gross"], reverse=True)
    return {
        "totals": totals,
        "by_company": companies_list,
        "by_method": [{"method": k, **v} for k, v in by_method.items()],
        "count": len(bookings),
    }


@admin_router.post("/bookings/{booking_id}/settle")
async def admin_settle_booking(booking_id: str, current_user: dict = Depends(require_permission("content.manage"))):
    """Mark a booking's settlement as cleared (commission/revenue reconciled with the company)."""
    b = await db.ferry_bookings.find_one({"id": booking_id}, {"_id": 0, "settlement_status": 1})
    if not b:
        raise HTTPException(status_code=404, detail="Billet introuvable")
    new_val = "settled" if b.get("settlement_status") != "settled" else "pending"
    await db.ferry_bookings.update_one({"id": booking_id}, {"$set": {"settlement_status": new_val, "settled_at": _now()}})
    return {"id": booking_id, "settlement_status": new_val}


@admin_router.get("/ports")
async def admin_ports(current_user: dict = Depends(require_permission("content.manage"))):
    items = await db.ferry_ports.find({}, {"_id": 0}).sort("city", 1).to_list(300)
    return {"ports": items}


@admin_router.post("/ports")
async def admin_create_port(request: Request, current_user: dict = Depends(require_permission("content.manage"))):
    body = await request.json()
    if not (body.get("name") or "").strip():
        raise HTTPException(status_code=400, detail="Nom requis")
    doc = {"id": f"fpt_{uuid.uuid4().hex[:8]}", "name": body["name"].strip(),
           "city": body.get("city", ""), "island": body.get("island", ""),
           "lat": body.get("lat"), "lng": body.get("lng"), "is_active": bool(body.get("is_active", True))}
    await db.ferry_ports.insert_one(dict(doc))
    doc.pop("_id", None)
    return doc


def _route_payload(body, *, creating):
    out = {}
    for k in ("company_id", "company_name", "from_port_id", "from_label", "to_port_id",
              "to_label", "route_type"):
        if creating or k in body:
            out[k] = body.get(k)
    if creating or "duration_min" in body:
        out["duration_min"] = int(body.get("duration_min", 30))
    if creating or "price_adult" in body:
        out["price_adult"] = float(body.get("price_adult", 0))
    if creating or "price_child" in body:
        out["price_child"] = float(body.get("price_child", 0))
    if creating or "departure_times" in body:
        times = body.get("departure_times", [])
        if isinstance(times, str):
            times = [t.strip() for t in times.split(",") if t.strip()]
        out["departure_times"] = times
    if creating or "is_active" in body:
        out["is_active"] = bool(body.get("is_active", True))
    if "display_order" in body and body.get("display_order") is not None:
        out["display_order"] = int(body["display_order"])
    return out


@admin_router.get("/routes")
async def admin_routes(current_user: dict = Depends(require_permission("content.manage"))):
    items = await db.ferry_routes.find({}, {"_id": 0}).sort("display_order", 1).to_list(500)
    return {"routes": items, "count": len(items)}


@admin_router.post("/routes")
async def admin_create_route(request: Request, current_user: dict = Depends(require_permission("content.manage"))):
    body = await request.json()
    data = _route_payload(body, creating=True)
    if not data.get("from_label") or not data.get("to_label"):
        raise HTTPException(status_code=400, detail="Ports de départ et d'arrivée requis")
    last = await db.ferry_routes.find_one({}, sort=[("display_order", -1)])
    doc = {"id": f"frt_{uuid.uuid4().hex[:10]}", **data,
           "display_order": data.get("display_order", (last.get("display_order", 0) + 1) if last else 0),
           "created_at": _now(), "updated_at": _now()}
    await db.ferry_routes.insert_one(dict(doc))
    doc.pop("_id", None)
    return doc


@admin_router.put("/routes/{route_id}")
async def admin_update_route(route_id: str, request: Request, current_user: dict = Depends(require_permission("content.manage"))):
    body = await request.json()
    existing = await db.ferry_routes.find_one({"id": route_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Trajet introuvable")
    patch = _route_payload(body, creating=False)
    patch["updated_at"] = _now()
    await db.ferry_routes.update_one({"id": route_id}, {"$set": patch})
    return {**existing, **patch}


@admin_router.patch("/routes/{route_id}/toggle")
async def admin_toggle_route(route_id: str, current_user: dict = Depends(require_permission("content.manage"))):
    existing = await db.ferry_routes.find_one({"id": route_id}, {"_id": 0, "is_active": 1})
    if not existing:
        raise HTTPException(status_code=404, detail="Trajet introuvable")
    new_val = not existing.get("is_active", True)
    await db.ferry_routes.update_one({"id": route_id}, {"$set": {"is_active": new_val, "updated_at": _now()}})
    return {"id": route_id, "is_active": new_val}


@admin_router.delete("/routes/{route_id}")
async def admin_delete_route(route_id: str, current_user: dict = Depends(require_permission("content.manage"))):
    res = await db.ferry_routes.delete_one({"id": route_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Trajet introuvable")
    return {"ok": True, "deleted": route_id}


@admin_router.get("/bookings")
async def admin_bookings(current_user: dict = Depends(require_permission("content.manage")), limit: int = 100):
    items = await db.ferry_bookings.find({}, {"_id": 0}).sort("created_at", -1).to_list(min(limit, 500))
    revenue = round(sum(b.get("total", 0) for b in items), 2)
    commission = round(sum(b.get("platform_commission", 0) or 0 for b in items), 2)
    return {"bookings": items, "count": len(items), "revenue": revenue, "commission": commission}
