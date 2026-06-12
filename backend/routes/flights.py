"""SB Travel — Billets d'avion (agence de voyage, inventaire géré par l'admin).

Modèle MVP (inventaire admin, sans API tierce type Amadeus) :
- L'admin publie des vols (`flight_offers`) : compagnie, n° de vol, départ/arrivée (ville + horaires),
  classe, prix, sièges disponibles, escales, bagages.
- L'utilisateur recherche par ville de départ/arrivée (+ date optionnelle), consulte les vols,
  saisit ses passagers et réserve.
- Paiement via le portefeuille SB Pay (débité à la réservation). Sièges décrémentés selon
  les réservations confirmées. Annulation = remboursement avant le départ.
"""
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Request, HTTPException

from core.config import db
from core.deps import require_role, get_current_user
from core.notifications import create_notification
from core.airport import notify_admins

router = APIRouter(prefix="/flights", tags=["flights"])
admin_router = APIRouter(prefix="/flights/admin", tags=["flights-admin"])

CABINS = {"economy": "Économique", "premium": "Premium", "business": "Affaires", "first": "Première"}


def _now():
    return datetime.now(timezone.utc).isoformat()


def _parse_dt(s):
    if not s:
        return None
    try:
        return datetime.fromisoformat(str(s).replace("Z", "+00:00"))
    except (ValueError, TypeError):
        return None


def _duration_min(dep, arr):
    a, b = _parse_dt(dep), _parse_dt(arr)
    if not a or not b or b <= a:
        return 0
    return int((b - a).total_seconds() // 60)


async def _booked_seats(flight_id, exclude_booking_id=None):
    total = 0
    async for bk in db.flight_bookings.find({"flight_id": flight_id, "status": "confirmed"}, {"_id": 0}):
        if exclude_booking_id and bk.get("id") == exclude_booking_id:
            continue
        total += int(bk.get("seats_count", 1) or 1)
    return total


async def _seats_available(flight):
    total = int(flight.get("seats_total", 0) or 0)
    return max(total - await _booked_seats(flight["id"]), 0)


# ============================================================
#  SEED (démo)
# ============================================================
async def seed_flights():
    if await db.flight_offers.count_documents({}) > 0:
        return
    demo = [
        {"airline": "Air Caraïbes", "flight_number": "TX540", "origin": "Fort-de-France", "origin_code": "FDF",
         "destination": "Paris", "destination_code": "ORY", "departure_at": "2026-07-15T13:30",
         "arrival_at": "2026-07-16T02:10", "cabin_class": "economy", "price": 480, "seats_total": 60,
         "stops": 0, "baggage": "1 bagage 23 kg inclus"},
        {"airline": "Air France", "flight_number": "AF798", "origin": "Fort-de-France", "origin_code": "FDF",
         "destination": "Paris", "destination_code": "CDG", "departure_at": "2026-07-15T16:00",
         "arrival_at": "2026-07-16T05:05", "cabin_class": "business", "price": 1450, "seats_total": 16,
         "stops": 0, "baggage": "2 bagages 32 kg inclus"},
        {"airline": "Corsair", "flight_number": "SS920", "origin": "Pointe-à-Pitre", "origin_code": "PTP",
         "destination": "Miami", "destination_code": "MIA", "departure_at": "2026-08-02T09:45",
         "arrival_at": "2026-08-02T13:20", "cabin_class": "economy", "price": 320, "seats_total": 80,
         "stops": 0, "baggage": "1 bagage 23 kg inclus"},
    ]
    for f in demo:
        await db.flight_offers.insert_one({
            "id": f"flight_{uuid.uuid4().hex[:10]}", "active": True, "created_at": _now(),
            "duration_min": _duration_min(f["departure_at"], f["arrival_at"]), **f})


# ============================================================
#  UTILISATEUR — recherche / détail
# ============================================================
async def _public_flight(f):
    f = dict(f)
    f["seats_available"] = await _seats_available(f)
    f["cabin_label"] = CABINS.get(f.get("cabin_class"), f.get("cabin_class"))
    return f


@router.get("/airports")
async def list_airports(request: Request):
    await get_current_user(request)
    origins = await db.flight_offers.distinct("origin", {"active": True})
    dests = await db.flight_offers.distinct("destination", {"active": True})
    return {"origins": sorted([c for c in origins if c]), "destinations": sorted([c for c in dests if c])}


@router.get("")
async def search_flights(request: Request, origin: str = None, destination: str = None, date: str = None):
    await get_current_user(request)
    q = {"active": True}
    if origin:
        q["origin"] = {"$regex": f"^{origin}$", "$options": "i"}
    if destination:
        q["destination"] = {"$regex": f"^{destination}$", "$options": "i"}
    if date:
        q["departure_at"] = {"$regex": f"^{str(date)[:10]}"}
    items = await db.flight_offers.find(q, {"_id": 0}).sort("departure_at", 1).to_list(100)
    out = [await _public_flight(f) for f in items]
    return {"flights": out}


@router.get("/{flight_id}")
async def flight_detail(flight_id: str, request: Request):
    await get_current_user(request)
    f = await db.flight_offers.find_one({"id": flight_id, "active": True}, {"_id": 0})
    if not f:
        raise HTTPException(status_code=404, detail="Vol introuvable")
    return await _public_flight(f)


# ============================================================
#  UTILISATEUR — réservation
# ============================================================
def _clean_passengers(value):
    out = []
    if isinstance(value, list):
        for p in value:
            if not isinstance(p, dict):
                continue
            name = str(p.get("name") or "").strip()[:80]
            ptype = p.get("type") if p.get("type") in ("adult", "child", "infant") else "adult"
            if name:
                out.append({"name": name, "type": ptype})
    return out


@router.post("/book")
async def book(request: Request):
    user = await get_current_user(request)
    body = await request.json()
    flight = await db.flight_offers.find_one({"id": body.get("flight_id"), "active": True}, {"_id": 0})
    if not flight:
        raise HTTPException(status_code=404, detail="Vol introuvable")
    passengers = _clean_passengers(body.get("passengers"))
    if not passengers:
        raise HTTPException(status_code=400, detail="Ajoutez au moins un passager")
    seats = len(passengers)
    available = await _seats_available(flight)
    if available < seats:
        raise HTTPException(status_code=409, detail=f"Plus que {available} siège(s) disponible(s) sur ce vol")
    price = round(float(flight.get("price", 0) or 0) * seats, 2)

    wallet = await db.wallets.find_one({"user_id": user["id"]})
    if not wallet or wallet.get("balance", 0) < price:
        raise HTTPException(status_code=400, detail="Solde SB Pay insuffisant pour cette réservation")
    new_balance = round(wallet["balance"] - price, 2)
    await db.wallets.update_one({"user_id": user["id"]}, {"$set": {"balance": new_balance}})
    await db.wallet_transactions.insert_one({
        "id": f"tx_{uuid.uuid4().hex[:12]}", "user_id": user["id"], "type": "Booking",
        "amount": -price, "balance_after": new_balance,
        "description": f"Vol {flight['airline']} {flight['flight_number']} {flight['origin']}→{flight['destination']}",
        "status": "completed", "created_at": _now()})

    booking = {
        "id": f"fbk_{uuid.uuid4().hex[:10]}", "user_id": user["id"], "user_name": user.get("name"),
        "flight_id": flight["id"], "airline": flight["airline"], "flight_number": flight["flight_number"],
        "origin": flight["origin"], "origin_code": flight.get("origin_code"),
        "destination": flight["destination"], "destination_code": flight.get("destination_code"),
        "departure_at": flight["departure_at"], "arrival_at": flight["arrival_at"],
        "cabin_class": flight.get("cabin_class"), "passengers": passengers, "seats_count": seats,
        "price_per_seat": float(flight.get("price", 0) or 0), "total_price": price,
        "contact_email": str(body.get("contact_email") or user.get("email") or "")[:120],
        "status": "confirmed", "payment_status": "paid", "created_at": _now(),
    }
    await db.flight_bookings.insert_one(dict(booking))
    booking.pop("_id", None)
    await notify_admins("flight_booking_new", "Nouvelle réservation de vol",
                        f"{user.get('name') or 'Un client'} a réservé {seats} siège(s) sur {flight['airline']} {flight['flight_number']}.",
                        data={"booking_id": booking["id"]})
    await create_notification(user["id"], "flight_booking", "Vol réservé ✈️",
                              f"{flight['origin']} → {flight['destination']} · {flight['airline']} {flight['flight_number']}. Bon voyage !",
                              data={"booking_id": booking["id"]})
    return {"ok": True, "booking": booking, "balance": new_balance}


@router.get("/bookings/my")
async def my_bookings(request: Request):
    user = await get_current_user(request)
    items = await db.flight_bookings.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return {"bookings": items}


@router.post("/bookings/{booking_id}/cancel")
async def cancel_booking(booking_id: str, request: Request):
    user = await get_current_user(request)
    bk = await db.flight_bookings.find_one({"id": booking_id, "user_id": user["id"]}, {"_id": 0})
    if not bk:
        raise HTTPException(status_code=404, detail="Réservation introuvable")
    if bk["status"] != "confirmed":
        raise HTTPException(status_code=409, detail="Cette réservation ne peut plus être annulée")
    dep = _parse_dt(bk.get("departure_at"))
    now = datetime.now(timezone.utc)
    if dep is not None and dep.tzinfo is None:
        dep = dep.replace(tzinfo=timezone.utc)
    before_departure = dep is None or dep > now
    refund = float(bk.get("total_price", 0) or 0) if before_departure else 0.0
    if refund > 0:
        wallet = await db.wallets.find_one({"user_id": user["id"]})
        bal = round((wallet.get("balance", 0) if wallet else 0) + refund, 2)
        await db.wallets.update_one({"user_id": user["id"]}, {"$set": {"balance": bal}}, upsert=True)
        await db.wallet_transactions.insert_one({
            "id": f"tx_{uuid.uuid4().hex[:12]}", "user_id": user["id"], "type": "Refund",
            "amount": refund, "balance_after": bal,
            "description": f"Remboursement vol {bk['airline']} {bk['flight_number']}",
            "status": "completed", "created_at": _now()})
    await db.flight_bookings.update_one({"id": booking_id}, {"$set": {"status": "cancelled", "cancelled_at": _now()}})
    return {"ok": True, "refunded": refund}


# ============================================================
#  ADMIN — vols + réservations
# ============================================================
_FLIGHT_FIELDS = ("airline", "flight_number", "origin", "origin_code", "destination", "destination_code",
                  "departure_at", "arrival_at", "cabin_class", "price", "seats_total", "stops", "baggage", "active")


@admin_router.get("/flights")
async def admin_flights(request: Request):
    await require_role(request, ["admin"])
    items = await db.flight_offers.find({}, {"_id": 0}).sort("departure_at", 1).to_list(300)
    for f in items:
        f["seats_booked"] = await _booked_seats(f["id"])
    return {"flights": items}


@admin_router.post("/flights")
async def admin_create_flight(request: Request):
    await require_role(request, ["admin"], permission="server.settings.edit")
    body = await request.json()
    dep, arr = str(body.get("departure_at") or ""), str(body.get("arrival_at") or "")
    flight = {"id": f"flight_{uuid.uuid4().hex[:10]}", "created_at": _now(),
              "airline": str(body.get("airline") or "")[:80],
              "flight_number": str(body.get("flight_number") or "")[:20],
              "origin": str(body.get("origin") or "")[:80],
              "origin_code": str(body.get("origin_code") or "")[:8],
              "destination": str(body.get("destination") or "")[:80],
              "destination_code": str(body.get("destination_code") or "")[:8],
              "departure_at": dep, "arrival_at": arr, "duration_min": _duration_min(dep, arr),
              "cabin_class": body.get("cabin_class") if body.get("cabin_class") in CABINS else "economy",
              "price": max(0.0, float(body.get("price") or 0)),
              "seats_total": max(0, int(body.get("seats_total") or 0)),
              "stops": max(0, int(body.get("stops") or 0)),
              "baggage": str(body.get("baggage") or "")[:120],
              "active": True}
    await db.flight_offers.insert_one(dict(flight))
    return {"ok": True, "flight": flight}


@admin_router.put("/flights/{flight_id}")
async def admin_update_flight(flight_id: str, request: Request):
    await require_role(request, ["admin"], permission="server.settings.edit")
    body = await request.json()
    update = {}
    for f in _FLIGHT_FIELDS:
        if f not in body:
            continue
        if f == "price":
            update[f] = max(0.0, float(body[f] or 0))
        elif f in ("seats_total", "stops"):
            update[f] = max(0, int(body[f] or 0))
        elif f == "active":
            update[f] = bool(body[f])
        elif f == "cabin_class":
            update[f] = body[f] if body[f] in CABINS else "economy"
        else:
            update[f] = str(body[f])[:120]
    if update.get("departure_at") or update.get("arrival_at"):
        cur = await db.flight_offers.find_one({"id": flight_id}, {"_id": 0})
        dep = update.get("departure_at", cur.get("departure_at") if cur else "")
        arr = update.get("arrival_at", cur.get("arrival_at") if cur else "")
        update["duration_min"] = _duration_min(dep, arr)
    if update:
        await db.flight_offers.update_one({"id": flight_id}, {"$set": update})
    flight = await db.flight_offers.find_one({"id": flight_id}, {"_id": 0})
    return {"ok": True, "flight": flight}


@admin_router.delete("/flights/{flight_id}")
async def admin_delete_flight(flight_id: str, request: Request):
    await require_role(request, ["admin"], permission="server.settings.edit")
    await db.flight_offers.update_one({"id": flight_id}, {"$set": {"active": False}})
    return {"ok": True}


@admin_router.get("/bookings")
async def admin_bookings(request: Request):
    await require_role(request, ["admin"])
    items = await db.flight_bookings.find({}, {"_id": 0}).sort("created_at", -1).to_list(300)
    return {"bookings": items}
