"""SB Travel — Hôtels (réservation de chambres, inventaire géré par l'admin).

Modèle MVP (inventaire admin, sans API tierce) :
- L'admin gère des hôtels (`hotel_listings`) et leurs chambres (`hotel_rooms`, avec un nombre d'unités).
- L'utilisateur recherche par ville, consulte l'hôtel + chambres, choisit des dates (check-in/out),
  un nombre de voyageurs et de chambres → devis (nuits × prix × chambres).
- Disponibilité calculée à partir des réservations confirmées qui chevauchent la période.
- Paiement via le portefeuille SB Pay (débité à la réservation), annulation = remboursement avant le check-in.
"""
import uuid
from datetime import datetime, timezone, date

from fastapi import APIRouter, Request, HTTPException

from core.config import db
from core.deps import require_role, get_current_user
from core.notifications import create_notification
from core.airport import notify_admins

router = APIRouter(prefix="/hotels", tags=["hotels"])
admin_router = APIRouter(prefix="/hotels/admin", tags=["hotels-admin"])


def _now():
    return datetime.now(timezone.utc).isoformat()


def _parse_date(s):
    if not s:
        return None
    try:
        return date.fromisoformat(str(s)[:10])
    except (ValueError, TypeError):
        return None


def _nights(check_in, check_out):
    a, b = _parse_date(check_in), _parse_date(check_out)
    if not a or not b:
        return 0
    return (b - a).days


async def _booked_units(room_id, check_in, check_out, exclude_booking_id=None):
    """Nombre de chambres déjà réservées (confirmées) qui chevauchent [check_in, check_out)."""
    a, b = _parse_date(check_in), _parse_date(check_out)
    if not a or not b:
        return 0
    q = {"room_id": room_id, "status": "confirmed"}
    total = 0
    async for bk in db.hotel_bookings.find(q, {"_id": 0}):
        if exclude_booking_id and bk.get("id") == exclude_booking_id:
            continue
        ea, eb = _parse_date(bk.get("check_in")), _parse_date(bk.get("check_out"))
        if not ea or not eb:
            continue
        if ea < b and eb > a:  # chevauchement
            total += int(bk.get("rooms_count", 1) or 1)
    return total


async def _room_availability(room, check_in, check_out, exclude_booking_id=None):
    total_units = int(room.get("total_units", 0) or 0)
    booked = await _booked_units(room["id"], check_in, check_out, exclude_booking_id)
    return max(total_units - booked, 0)


async def _min_room_price(hotel_id):
    prices = []
    async for r in db.hotel_rooms.find({"hotel_id": hotel_id, "active": True}, {"_id": 0, "price_per_night": 1}):
        prices.append(float(r.get("price_per_night", 0) or 0))
    return min(prices) if prices else 0.0


# ============================================================
#  SEED (démo)
# ============================================================
async def seed_hotels():
    if await db.hotel_listings.count_documents({}) > 0:
        return
    demo = [
        {"name": "Hôtel La Pagerie", "city": "Fort-de-France", "address": "Pointe du Bout, Les Trois-Îlets",
         "stars": 4, "description": "Hôtel de charme face à la baie de Fort-de-France, piscine et plage privée.",
         "amenities": ["Wifi", "Piscine", "Petit-déjeuner", "Climatisation", "Parking"],
         "image_url": "", "rooms": [
            {"name": "Chambre Double Standard", "capacity": 2, "beds": "1 lit double", "price_per_night": 120, "deposit_amount": 150, "total_units": 8,
             "amenities": ["Wifi", "Climatisation", "TV"]},
            {"name": "Suite Vue Mer", "capacity": 3, "beds": "1 lit king + canapé", "price_per_night": 240, "deposit_amount": 300, "total_units": 4,
             "amenities": ["Wifi", "Climatisation", "Balcon", "Mini-bar"]},
         ]},
        {"name": "Résidence Caraïbes", "city": "Sainte-Anne", "address": "Plage de la Caravelle",
         "stars": 3, "description": "Résidence familiale à 100 m de la plage, idéale pour les séjours détente.",
         "amenities": ["Wifi", "Cuisine équipée", "Parking", "Climatisation"],
         "image_url": "", "rooms": [
            {"name": "Studio 2 personnes", "capacity": 2, "beds": "1 lit double", "price_per_night": 85, "deposit_amount": 100, "total_units": 10,
             "amenities": ["Wifi", "Kitchenette", "Climatisation"]},
            {"name": "Appartement Familial", "capacity": 4, "beds": "2 chambres", "price_per_night": 150, "deposit_amount": 200, "total_units": 5,
             "amenities": ["Wifi", "Cuisine", "Terrasse"]},
         ]},
    ]
    for h in demo:
        rooms = h.pop("rooms", [])
        hid = f"hotel_{uuid.uuid4().hex[:10]}"
        await db.hotel_listings.insert_one({
            "id": hid, "active": True, "created_at": _now(), "lat": None, "lng": None, **h})
        for r in rooms:
            await db.hotel_rooms.insert_one({
                "id": f"room_{uuid.uuid4().hex[:10]}", "hotel_id": hid, "active": True,
                "image_url": "", "created_at": _now(), **r})


# ============================================================
#  UTILISATEUR — recherche / détail / disponibilité
# ============================================================
@router.get("/cities")
async def list_cities(request: Request):
    await get_current_user(request)
    cities = await db.hotel_listings.distinct("city", {"active": True})
    return {"cities": sorted([c for c in cities if c])}


@router.get("")
async def list_hotels(request: Request, city: str = None, search: str = None):
    await get_current_user(request)
    q = {"active": True}
    if city:
        q["city"] = city
    if search:
        q["$or"] = [{"name": {"$regex": search, "$options": "i"}},
                    {"city": {"$regex": search, "$options": "i"}}]
    items = await db.hotel_listings.find(q, {"_id": 0}).sort("stars", -1).to_list(100)
    for h in items:
        h["min_price"] = await _min_room_price(h["id"])
    return {"hotels": items}


@router.get("/{hotel_id}")
async def hotel_detail(hotel_id: str, request: Request, check_in: str = None, check_out: str = None):
    await get_current_user(request)
    hotel = await db.hotel_listings.find_one({"id": hotel_id, "active": True}, {"_id": 0})
    if not hotel:
        raise HTTPException(status_code=404, detail="Hôtel introuvable")
    rooms = await db.hotel_rooms.find({"hotel_id": hotel_id, "active": True}, {"_id": 0}).sort("price_per_night", 1).to_list(50)
    nights = _nights(check_in, check_out)
    for r in rooms:
        if check_in and check_out and nights > 0:
            r["available_units"] = await _room_availability(r, check_in, check_out)
            r["total_for_stay"] = round(float(r.get("price_per_night", 0) or 0) * nights, 2)
        else:
            r["available_units"] = int(r.get("total_units", 0) or 0)
            r["total_for_stay"] = None
    hotel["rooms"] = rooms
    hotel["nights"] = nights
    return hotel


@router.post("/quote")
async def quote(request: Request):
    await get_current_user(request)
    body = await request.json()
    room = await db.hotel_rooms.find_one({"id": body.get("room_id"), "active": True}, {"_id": 0})
    if not room:
        raise HTTPException(status_code=404, detail="Chambre introuvable")
    nights = _nights(body.get("check_in"), body.get("check_out"))
    if nights <= 0:
        raise HTTPException(status_code=400, detail="Dates invalides (le départ doit être après l'arrivée)")
    rooms_count = max(1, int(body.get("rooms_count", 1) or 1))
    available = await _room_availability(room, body.get("check_in"), body.get("check_out"))
    price = round(float(room.get("price_per_night", 0) or 0) * nights * rooms_count, 2)
    deposit = round(float(room.get("deposit_amount", 0) or 0) * rooms_count, 2)
    return {"nights": nights, "rooms_count": rooms_count, "available_units": available,
            "price_per_night": room.get("price_per_night"), "total_price": price,
            "deposit_amount": deposit, "total_with_deposit": round(price + deposit, 2),
            "enough_availability": available >= rooms_count}


# ============================================================
#  UTILISATEUR — réservation
# ============================================================
@router.post("/book")
async def book(request: Request):
    user = await get_current_user(request)
    body = await request.json()
    room = await db.hotel_rooms.find_one({"id": body.get("room_id"), "active": True}, {"_id": 0})
    if not room:
        raise HTTPException(status_code=404, detail="Chambre introuvable")
    hotel = await db.hotel_listings.find_one({"id": room["hotel_id"], "active": True}, {"_id": 0})
    if not hotel:
        raise HTTPException(status_code=404, detail="Hôtel introuvable")
    check_in, check_out = body.get("check_in"), body.get("check_out")
    nights = _nights(check_in, check_out)
    if nights <= 0:
        raise HTTPException(status_code=400, detail="Dates invalides (le départ doit être après l'arrivée)")
    rooms_count = max(1, int(body.get("rooms_count", 1) or 1))
    guests = max(1, int(body.get("guests", 1) or 1))
    available = await _room_availability(room, check_in, check_out)
    if available < rooms_count:
        raise HTTPException(status_code=409, detail=f"Plus que {available} chambre(s) disponible(s) sur cette période")
    price = round(float(room.get("price_per_night", 0) or 0) * nights * rooms_count, 2)
    deposit = round(float(room.get("deposit_amount", 0) or 0) * rooms_count, 2)
    total_debit = round(price + deposit, 2)

    wallet = await db.wallets.find_one({"user_id": user["id"]})
    if not wallet or wallet.get("balance", 0) < total_debit:
        msg = "Solde SB Pay insuffisant pour cette réservation"
        if deposit > 0:
            msg += f" (séjour {price}€ + caution {deposit}€)"
        raise HTTPException(status_code=400, detail=msg)
    new_balance = round(wallet["balance"] - total_debit, 2)
    await db.wallets.update_one({"user_id": user["id"]}, {"$set": {"balance": new_balance}})
    await db.wallet_transactions.insert_one({
        "id": f"tx_{uuid.uuid4().hex[:12]}", "user_id": user["id"], "type": "Booking",
        "amount": -price, "balance_after": round(wallet["balance"] - price, 2),
        "description": f"Hôtel {hotel['name']} — {room['name']}", "status": "completed", "created_at": _now()})
    if deposit > 0:
        await db.wallet_transactions.insert_one({
            "id": f"tx_{uuid.uuid4().hex[:12]}", "user_id": user["id"], "type": "Deposit",
            "amount": -deposit, "balance_after": new_balance,
            "description": f"Caution bloquée — {hotel['name']} ({room['name']})",
            "status": "completed", "created_at": _now()})

    booking = {
        "id": f"hbk_{uuid.uuid4().hex[:10]}", "user_id": user["id"], "user_name": user.get("name"),
        "hotel_id": hotel["id"], "hotel_name": hotel["name"], "hotel_city": hotel.get("city"),
        "room_id": room["id"], "room_name": room["name"],
        "check_in": str(_parse_date(check_in)), "check_out": str(_parse_date(check_out)),
        "nights": nights, "guests": guests, "rooms_count": rooms_count,
        "price_per_night": float(room.get("price_per_night", 0) or 0), "total_price": price,
        "deposit_amount": deposit, "deposit_held_amount": deposit,
        "deposit_status": "held" if deposit > 0 else "none",
        "status": "confirmed", "payment_status": "paid", "created_at": _now(),
    }
    await db.hotel_bookings.insert_one(dict(booking))
    booking.pop("_id", None)
    await notify_admins("hotel_booking_new", "Nouvelle réservation hôtel",
                        f"{user.get('name') or 'Un client'} a réservé {room['name']} à {hotel['name']} ({nights} nuit(s)).",
                        data={"booking_id": booking["id"]})
    await create_notification(user["id"], "hotel_booking", "Réservation confirmée 🏨",
                              f"{hotel['name']} — {room['name']}, {nights} nuit(s)."
                              + (f" Caution bloquée : {deposit}€ (restituée au départ)." if deposit > 0 else " Bon séjour !"),
                              data={"booking_id": booking["id"]})
    return {"ok": True, "booking": booking, "balance": new_balance}


@router.get("/bookings/my")
async def my_bookings(request: Request):
    user = await get_current_user(request)
    items = await db.hotel_bookings.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return {"bookings": items}


@router.post("/bookings/{booking_id}/cancel")
async def cancel_booking(booking_id: str, request: Request):
    user = await get_current_user(request)
    bk = await db.hotel_bookings.find_one({"id": booking_id, "user_id": user["id"]}, {"_id": 0})
    if not bk:
        raise HTTPException(status_code=404, detail="Réservation introuvable")
    if bk["status"] != "confirmed":
        raise HTTPException(status_code=409, detail="Cette réservation ne peut plus être annulée")
    today = date.today()
    ci = _parse_date(bk.get("check_in"))
    room_refund = float(bk.get("total_price", 0) or 0) if (ci and ci > today) else 0.0
    # La caution bloquée est toujours restituée à l'annulation (chambre non occupée).
    held = float(bk.get("deposit_held_amount", 0) or 0) if bk.get("deposit_status") == "held" else 0.0
    refund = round(room_refund + held, 2)
    if refund > 0:
        wallet = await db.wallets.find_one({"user_id": user["id"]})
        bal = round((wallet.get("balance", 0) if wallet else 0) + refund, 2)
        await db.wallets.update_one({"user_id": user["id"]}, {"$set": {"balance": bal}}, upsert=True)
        await db.wallet_transactions.insert_one({
            "id": f"tx_{uuid.uuid4().hex[:12]}", "user_id": user["id"], "type": "Refund",
            "amount": refund, "balance_after": bal,
            "description": f"Remboursement hôtel {bk['hotel_name']}"
                           + (f" (séjour {room_refund}€ + caution {held}€)" if (room_refund and held) else ""),
            "status": "completed", "created_at": _now()})
    await db.hotel_bookings.update_one(
        {"id": booking_id},
        {"$set": {"status": "cancelled", "cancelled_at": _now(),
                  "deposit_status": "released" if held else bk.get("deposit_status"),
                  "deposit_refunded": held}})
    return {"ok": True, "refunded": refund}


# ============================================================
#  ADMIN — hôtels, chambres, réservations
# ============================================================
_HOTEL_FIELDS = ("name", "city", "address", "stars", "description", "amenities", "image_url", "active")
_ROOM_FIELDS = ("name", "capacity", "beds", "price_per_night", "deposit_amount", "total_units", "amenities", "image_url", "active")


@admin_router.get("/hotels")
async def admin_hotels(request: Request):
    await require_role(request, ["admin"])
    items = await db.hotel_listings.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)
    for h in items:
        h["room_count"] = await db.hotel_rooms.count_documents({"hotel_id": h["id"], "active": True})
    return {"hotels": items}


@admin_router.post("/hotels")
async def admin_create_hotel(request: Request):
    await require_role(request, ["admin"], permission="server.settings.edit")
    body = await request.json()
    hotel = {"id": f"hotel_{uuid.uuid4().hex[:10]}", "created_at": _now(), "lat": None, "lng": None,
             "name": str(body.get("name") or "Hôtel")[:120],
             "city": str(body.get("city") or "")[:80],
             "address": str(body.get("address") or "")[:200],
             "stars": max(0, min(5, int(body.get("stars") or 0))),
             "description": str(body.get("description") or "")[:1000],
             "amenities": [str(a)[:40] for a in (body.get("amenities") or [])][:20],
             "image_url": str(body.get("image_url") or "")[:600],
             "active": True}
    await db.hotel_listings.insert_one(dict(hotel))
    return {"ok": True, "hotel": hotel}


@admin_router.put("/hotels/{hotel_id}")
async def admin_update_hotel(hotel_id: str, request: Request):
    await require_role(request, ["admin"], permission="server.settings.edit")
    body = await request.json()
    update = {}
    for f in _HOTEL_FIELDS:
        if f not in body:
            continue
        if f == "stars":
            update[f] = max(0, min(5, int(body[f] or 0)))
        elif f == "active":
            update[f] = bool(body[f])
        elif f == "amenities":
            update[f] = [str(a)[:40] for a in (body[f] or [])][:20]
        else:
            update[f] = str(body[f])[:1000]
    if update:
        await db.hotel_listings.update_one({"id": hotel_id}, {"$set": update})
    hotel = await db.hotel_listings.find_one({"id": hotel_id}, {"_id": 0})
    return {"ok": True, "hotel": hotel}


@admin_router.delete("/hotels/{hotel_id}")
async def admin_delete_hotel(hotel_id: str, request: Request):
    await require_role(request, ["admin"], permission="server.settings.edit")
    await db.hotel_listings.update_one({"id": hotel_id}, {"$set": {"active": False}})
    return {"ok": True}


@admin_router.get("/hotels/{hotel_id}/rooms")
async def admin_rooms(hotel_id: str, request: Request):
    await require_role(request, ["admin"])
    items = await db.hotel_rooms.find({"hotel_id": hotel_id}, {"_id": 0}).sort("price_per_night", 1).to_list(100)
    return {"rooms": items}


@admin_router.post("/hotels/{hotel_id}/rooms")
async def admin_create_room(hotel_id: str, request: Request):
    await require_role(request, ["admin"], permission="server.settings.edit")
    body = await request.json()
    room = {"id": f"room_{uuid.uuid4().hex[:10]}", "hotel_id": hotel_id, "created_at": _now(),
            "name": str(body.get("name") or "Chambre")[:120],
            "capacity": max(1, int(body.get("capacity") or 1)),
            "beds": str(body.get("beds") or "")[:80],
            "price_per_night": max(0.0, float(body.get("price_per_night") or 0)),
            "deposit_amount": max(0.0, float(body.get("deposit_amount") or 0)),
            "total_units": max(0, int(body.get("total_units") or 0)),
            "amenities": [str(a)[:40] for a in (body.get("amenities") or [])][:20],
            "image_url": str(body.get("image_url") or "")[:600],
            "active": True}
    await db.hotel_rooms.insert_one(dict(room))
    return {"ok": True, "room": room}


@admin_router.put("/rooms/{room_id}")
async def admin_update_room(room_id: str, request: Request):
    await require_role(request, ["admin"], permission="server.settings.edit")
    body = await request.json()
    update = {}
    for f in _ROOM_FIELDS:
        if f not in body:
            continue
        if f == "price_per_night":
            update[f] = max(0.0, float(body[f] or 0))
        elif f == "deposit_amount":
            update[f] = max(0.0, float(body[f] or 0))
        elif f in ("capacity", "total_units"):
            update[f] = max(0, int(body[f] or 0))
        elif f == "active":
            update[f] = bool(body[f])
        elif f == "amenities":
            update[f] = [str(a)[:40] for a in (body[f] or [])][:20]
        else:
            update[f] = str(body[f])[:600]
    if update:
        await db.hotel_rooms.update_one({"id": room_id}, {"$set": update})
    room = await db.hotel_rooms.find_one({"id": room_id}, {"_id": 0})
    return {"ok": True, "room": room}


@admin_router.delete("/rooms/{room_id}")
async def admin_delete_room(room_id: str, request: Request):
    await require_role(request, ["admin"], permission="server.settings.edit")
    await db.hotel_rooms.update_one({"id": room_id}, {"$set": {"active": False}})
    return {"ok": True}


@admin_router.get("/bookings")
async def admin_bookings(request: Request):
    await require_role(request, ["admin"])
    items = await db.hotel_bookings.find({}, {"_id": 0}).sort("created_at", -1).to_list(300)
    return {"bookings": items}


@admin_router.post("/bookings/{booking_id}/checkout")
async def admin_checkout(booking_id: str, request: Request):
    """Clôture du séjour (départ client) : restitue la caution bloquée sur SB Pay,
    moins d'éventuels frais de dommages (plafonnés au montant de la caution, conservés par l'hôtel)."""
    await require_role(request, ["admin"], permission="server.settings.edit")
    body = {}
    try:
        body = await request.json()
    except Exception:
        body = {}
    bk = await db.hotel_bookings.find_one({"id": booking_id}, {"_id": 0})
    if not bk:
        raise HTTPException(status_code=404, detail="Réservation introuvable")
    if bk.get("status") != "confirmed":
        raise HTTPException(status_code=409, detail="Cette réservation ne peut pas être clôturée")

    held = float(bk.get("deposit_held_amount", 0) or 0) if bk.get("deposit_status") == "held" else 0.0
    try:
        damage = max(0.0, float(body.get("damage_fees") or 0))
    except (TypeError, ValueError):
        damage = 0.0
    damage = min(damage, held)  # on ne retient jamais plus que la caution bloquée
    refund = round(held - damage, 2)

    if held > 0 and refund > 0:
        wallet = await db.wallets.find_one({"user_id": bk["user_id"]})
        bal = round((wallet.get("balance", 0) if wallet else 0) + refund, 2)
        await db.wallets.update_one({"user_id": bk["user_id"]}, {"$set": {"balance": bal}}, upsert=True)
        await db.wallet_transactions.insert_one({
            "id": f"tx_{uuid.uuid4().hex[:12]}", "user_id": bk["user_id"], "type": "Refund",
            "amount": refund, "balance_after": bal,
            "description": f"Restitution caution hôtel {bk['hotel_name']}"
                           + (f" (− {damage}€ dommages)" if damage else ""),
            "status": "completed", "created_at": _now()})

    await db.hotel_bookings.update_one(
        {"id": booking_id},
        {"$set": {"status": "completed", "completed_at": _now(),
                  "damage_fees": damage, "deposit_refunded": refund,
                  "deposit_status": "released" if held else bk.get("deposit_status"),
                  "checkout_notes": str(body.get("notes") or "")[:300]}})
    await create_notification(
        bk["user_id"], "hotel_checkout", "Séjour terminé 🏨",
        (f"Caution restituée : {refund}€ sur votre SB Pay" + (f" ({damage}€ retenus pour dommages)." if damage else "."))
        if held else f"Merci d'avoir séjourné à {bk['hotel_name']}.",
        data={"booking_id": booking_id})
    return {"ok": True, "status": "completed", "deposit_refunded": refund, "damage_fees": damage}
