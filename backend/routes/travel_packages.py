"""SB Travel — Forfaits combinés Vol + Hôtel (packages voyage à prix réduit).

Réutilise les modules Vols et Hôtels existants :
- L'admin compose un forfait (`travel_packages`) : un vol + un hôtel/chambre + nb de nuits + remise %.
- L'utilisateur réserve le forfait en un seul paiement SB Pay (remise appliquée). La réservation
  crée AUSSI les réservations sous-jacentes (vol + hôtel) pour décrémenter correctement les stocks
  et apparaître dans « Mes vols » / « Mes séjours ». Annulation groupée = remboursement du total remisé.
"""
import uuid
from datetime import datetime, timezone, date, timedelta

from fastapi import APIRouter, Request, HTTPException

from core.config import db
from core.deps import require_role, get_current_user
from core.notifications import create_notification
from core.airport import notify_admins
from routes.hotels import _room_availability
from routes.flights import _seats_available, _clean_passengers, CABINS

router = APIRouter(prefix="/travel-packages", tags=["travel-packages"])
admin_router = APIRouter(prefix="/travel-packages/admin", tags=["travel-packages-admin"])


def _now():
    return datetime.now(timezone.utc).isoformat()


def _check_out(check_in, nights):
    try:
        ci = date.fromisoformat(str(check_in)[:10])
        return str(ci + timedelta(days=max(1, int(nights))))
    except (ValueError, TypeError):
        return None


def _default_check_in(flight):
    """Par défaut : la date d'arrivée du vol (l'hôtel commence à l'arrivée)."""
    arr = flight.get("arrival_at") if flight else None
    return str(arr)[:10] if arr else str(date.today())


async def _resolve(pkg):
    """Charge le vol + hôtel + chambre liés au forfait."""
    flight = await db.flight_offers.find_one({"id": pkg.get("flight_id")}, {"_id": 0})
    hotel = await db.hotel_listings.find_one({"id": pkg.get("hotel_id")}, {"_id": 0})
    room = await db.hotel_rooms.find_one({"id": pkg.get("room_id")}, {"_id": 0})
    return flight, hotel, room


async def _package_view(pkg):
    flight, hotel, room = await _resolve(pkg)
    nights = int(pkg.get("nights", 1) or 1)
    discount = float(pkg.get("discount_pct", 0) or 0)
    flight_price = float(flight.get("price", 0) or 0) if flight else 0
    room_price = float(room.get("price_per_night", 0) or 0) if room else 0
    base_total = round(flight_price + room_price * nights, 2)  # 1 voyageur, 1 chambre (indicatif)
    final_total = round(base_total * (1 - discount / 100), 2)
    out = dict(pkg)
    out["flight"] = flight
    out["hotel"] = hotel
    out["room"] = room
    out["nights"] = nights
    out["base_total"] = base_total
    out["final_total"] = final_total
    out["savings"] = round(base_total - final_total, 2)
    out["available"] = bool(flight and hotel and room and flight.get("active") and hotel.get("active") and room.get("active"))
    out["cabin_label"] = CABINS.get(flight.get("cabin_class"), flight.get("cabin_class")) if flight else None
    return out


# ============================================================
#  SEED (démo) — assemble le 1er vol démo + le 1er hôtel démo
# ============================================================
async def seed_travel_packages():
    if await db.travel_packages.count_documents({}) > 0:
        return
    flight = await db.flight_offers.find_one({"active": True}, {"_id": 0})
    hotel = await db.hotel_listings.find_one({"active": True}, {"_id": 0})
    if not flight or not hotel:
        return
    room = await db.hotel_rooms.find_one({"hotel_id": hotel["id"], "active": True}, {"_id": 0})
    if not room:
        return
    await db.travel_packages.insert_one({
        "id": f"pkg_{uuid.uuid4().hex[:10]}", "active": True, "created_at": _now(),
        "title": f"Escapade {flight['destination']} — {hotel['name']}",
        "description": f"Vol {flight['airline']} + {hotel['stars']}★ {hotel['name']} ({hotel['city']}). Tout compris, prix réduit.",
        "image_url": "", "flight_id": flight["id"], "hotel_id": hotel["id"], "room_id": room["id"],
        "nights": 7, "discount_pct": 15})


# ============================================================
#  UTILISATEUR
# ============================================================
@router.get("")
async def list_packages(request: Request):
    await get_current_user(request)
    items = await db.travel_packages.find({"active": True}, {"_id": 0}).sort("created_at", -1).to_list(100)
    out = [await _package_view(p) for p in items]
    return {"packages": [p for p in out if p["available"]]}


@router.get("/bookings/my")
async def my_bookings(request: Request):
    user = await get_current_user(request)
    items = await db.travel_bookings.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return {"bookings": items}


@router.get("/{package_id}")
async def package_detail(package_id: str, request: Request):
    await get_current_user(request)
    pkg = await db.travel_packages.find_one({"id": package_id, "active": True}, {"_id": 0})
    if not pkg:
        raise HTTPException(status_code=404, detail="Forfait introuvable")
    return await _package_view(pkg)


@router.post("/{package_id}/quote")
async def quote(package_id: str, request: Request):
    await get_current_user(request)
    body = await request.json()
    pkg = await db.travel_packages.find_one({"id": package_id, "active": True}, {"_id": 0})
    if not pkg:
        raise HTTPException(status_code=404, detail="Forfait introuvable")
    flight, hotel, room = await _resolve(pkg)
    if not (flight and hotel and room):
        raise HTTPException(status_code=409, detail="Ce forfait n'est plus disponible")
    nights = int(pkg.get("nights", 1) or 1)
    discount = float(pkg.get("discount_pct", 0) or 0)
    travelers = max(1, int(body.get("travelers", 1) or 1))
    rooms_count = max(1, int(body.get("rooms_count", 1) or 1))
    check_in = body.get("check_in") or _default_check_in(flight)
    check_out = _check_out(check_in, nights)

    seats_ok = await _seats_available(flight) >= travelers
    rooms_avail = await _room_availability(room, check_in, check_out)
    base_total = round(float(flight.get("price", 0) or 0) * travelers + float(room.get("price_per_night", 0) or 0) * nights * rooms_count, 2)
    final_total = round(base_total * (1 - discount / 100), 2)
    return {"travelers": travelers, "rooms_count": rooms_count, "nights": nights,
            "check_in": check_in, "check_out": check_out, "discount_pct": discount,
            "base_total": base_total, "final_total": final_total, "savings": round(base_total - final_total, 2),
            "enough_seats": seats_ok, "enough_rooms": rooms_avail >= rooms_count,
            "available": seats_ok and rooms_avail >= rooms_count}


@router.post("/{package_id}/book")
async def book(package_id: str, request: Request):
    user = await get_current_user(request)
    body = await request.json()
    pkg = await db.travel_packages.find_one({"id": package_id, "active": True}, {"_id": 0})
    if not pkg:
        raise HTTPException(status_code=404, detail="Forfait introuvable")
    flight, hotel, room = await _resolve(pkg)
    if not (flight and hotel and room and flight.get("active") and hotel.get("active") and room.get("active")):
        raise HTTPException(status_code=409, detail="Ce forfait n'est plus disponible")

    nights = int(pkg.get("nights", 1) or 1)
    discount = float(pkg.get("discount_pct", 0) or 0)
    passengers = _clean_passengers(body.get("passengers"))
    if not passengers:
        raise HTTPException(status_code=400, detail="Ajoutez au moins un voyageur")
    travelers = len(passengers)
    rooms_count = max(1, int(body.get("rooms_count", 1) or 1))
    check_in = body.get("check_in") or _default_check_in(flight)
    check_out = _check_out(check_in, nights)
    if not check_out:
        raise HTTPException(status_code=400, detail="Date d'arrivée invalide")

    # Disponibilités (vol + hôtel)
    if await _seats_available(flight) < travelers:
        raise HTTPException(status_code=409, detail="Plus assez de sièges sur le vol")
    if await _room_availability(room, check_in, check_out) < rooms_count:
        raise HTTPException(status_code=409, detail="Plus assez de chambres sur ces dates")

    base_total = round(float(flight.get("price", 0) or 0) * travelers + float(room.get("price_per_night", 0) or 0) * nights * rooms_count, 2)
    final_total = round(base_total * (1 - discount / 100), 2)

    wallet = await db.wallets.find_one({"user_id": user["id"]})
    if not wallet or wallet.get("balance", 0) < final_total:
        raise HTTPException(status_code=400, detail="Solde SB Pay insuffisant pour ce forfait")
    new_balance = round(wallet["balance"] - final_total, 2)
    await db.wallets.update_one({"user_id": user["id"]}, {"$set": {"balance": new_balance}})
    await db.wallet_transactions.insert_one({
        "id": f"tx_{uuid.uuid4().hex[:12]}", "user_id": user["id"], "type": "Booking",
        "amount": -final_total, "balance_after": new_balance,
        "description": f"Forfait voyage : {pkg['title']}", "status": "completed", "created_at": _now()})

    travel_booking_id = f"tvb_{uuid.uuid4().hex[:10]}"
    now = _now()

    # Réservation de vol sous-jacente
    flight_booking = {
        "id": f"fbk_{uuid.uuid4().hex[:10]}", "user_id": user["id"], "user_name": user.get("name"),
        "flight_id": flight["id"], "airline": flight["airline"], "flight_number": flight["flight_number"],
        "origin": flight["origin"], "origin_code": flight.get("origin_code"),
        "destination": flight["destination"], "destination_code": flight.get("destination_code"),
        "departure_at": flight["departure_at"], "arrival_at": flight["arrival_at"],
        "cabin_class": flight.get("cabin_class"), "passengers": passengers, "seats_count": travelers,
        "price_per_seat": float(flight.get("price", 0) or 0),
        "total_price": round(float(flight.get("price", 0) or 0) * travelers, 2),
        "contact_email": str(user.get("email") or "")[:120],
        "status": "confirmed", "payment_status": "paid", "package_booking_id": travel_booking_id,
        "created_at": now}
    await db.flight_bookings.insert_one(dict(flight_booking))

    # Réservation d'hôtel sous-jacente
    hotel_booking = {
        "id": f"hbk_{uuid.uuid4().hex[:10]}", "user_id": user["id"], "user_name": user.get("name"),
        "hotel_id": hotel["id"], "hotel_name": hotel["name"], "hotel_city": hotel.get("city"),
        "room_id": room["id"], "room_name": room["name"], "check_in": check_in, "check_out": check_out,
        "nights": nights, "guests": travelers, "rooms_count": rooms_count,
        "price_per_night": float(room.get("price_per_night", 0) or 0),
        "total_price": round(float(room.get("price_per_night", 0) or 0) * nights * rooms_count, 2),
        "status": "confirmed", "payment_status": "paid", "package_booking_id": travel_booking_id,
        "created_at": now}
    await db.hotel_bookings.insert_one(dict(hotel_booking))

    booking = {
        "id": travel_booking_id, "user_id": user["id"], "user_name": user.get("name"),
        "package_id": pkg["id"], "title": pkg["title"],
        "flight_booking_id": flight_booking["id"], "hotel_booking_id": hotel_booking["id"],
        "airline": flight["airline"], "flight_number": flight["flight_number"],
        "origin": flight["origin"], "destination": flight["destination"],
        "departure_at": flight["departure_at"], "hotel_name": hotel["name"], "hotel_city": hotel.get("city"),
        "room_name": room["name"], "check_in": check_in, "check_out": check_out, "nights": nights,
        "travelers": travelers, "rooms_count": rooms_count,
        "base_total": base_total, "discount_pct": discount, "total_price": final_total,
        "savings": round(base_total - final_total, 2),
        "status": "confirmed", "payment_status": "paid", "created_at": now}
    await db.travel_bookings.insert_one(dict(booking))
    booking.pop("_id", None)

    await notify_admins("travel_package_new", "Nouvelle réservation forfait voyage",
                        f"{user.get('name') or 'Un client'} a réservé « {pkg['title']} » ({travelers} voyageur(s)).",
                        data={"booking_id": travel_booking_id})
    await create_notification(user["id"], "travel_package", "Forfait voyage réservé 🧳",
                              f"{pkg['title']} — vol + hôtel confirmés. Bon voyage !",
                              data={"booking_id": travel_booking_id})
    return {"ok": True, "booking": booking, "balance": new_balance}


@router.post("/bookings/{booking_id}/cancel")
async def cancel_booking(booking_id: str, request: Request):
    user = await get_current_user(request)
    bk = await db.travel_bookings.find_one({"id": booking_id, "user_id": user["id"]}, {"_id": 0})
    if not bk:
        raise HTTPException(status_code=404, detail="Réservation introuvable")
    if bk["status"] != "confirmed":
        raise HTTPException(status_code=409, detail="Cette réservation ne peut plus être annulée")
    # Annule les 2 réservations sous-jacentes
    await db.flight_bookings.update_one({"id": bk.get("flight_booking_id")}, {"$set": {"status": "cancelled", "cancelled_at": _now()}})
    await db.hotel_bookings.update_one({"id": bk.get("hotel_booking_id")}, {"$set": {"status": "cancelled", "cancelled_at": _now()}})
    # Remboursement du total remisé si avant l'arrivée (check_in futur)
    refund = 0.0
    try:
        ci = date.fromisoformat(str(bk.get("check_in"))[:10])
        if ci > date.today():
            refund = float(bk.get("total_price", 0) or 0)
    except (ValueError, TypeError):
        refund = float(bk.get("total_price", 0) or 0)
    if refund > 0:
        wallet = await db.wallets.find_one({"user_id": user["id"]})
        bal = round((wallet.get("balance", 0) if wallet else 0) + refund, 2)
        await db.wallets.update_one({"user_id": user["id"]}, {"$set": {"balance": bal}}, upsert=True)
        await db.wallet_transactions.insert_one({
            "id": f"tx_{uuid.uuid4().hex[:12]}", "user_id": user["id"], "type": "Refund",
            "amount": refund, "balance_after": bal,
            "description": f"Remboursement forfait {bk['title']}", "status": "completed", "created_at": _now()})
    await db.travel_bookings.update_one({"id": booking_id}, {"$set": {"status": "cancelled", "cancelled_at": _now()}})
    return {"ok": True, "refunded": refund}


# ============================================================
#  ADMIN
# ============================================================
@admin_router.get("/options")
async def admin_options(request: Request):
    """Listes de vols / hôtels / chambres pour composer un forfait."""
    await require_role(request, ["admin"])
    flights = await db.flight_offers.find({"active": True}, {"_id": 0, "id": 1, "airline": 1, "flight_number": 1, "origin": 1, "destination": 1, "price": 1, "departure_at": 1}).to_list(200)
    hotels = await db.hotel_listings.find({"active": True}, {"_id": 0, "id": 1, "name": 1, "city": 1, "stars": 1}).to_list(200)
    rooms = await db.hotel_rooms.find({"active": True}, {"_id": 0, "id": 1, "hotel_id": 1, "name": 1, "price_per_night": 1}).to_list(400)
    return {"flights": flights, "hotels": hotels, "rooms": rooms}


@admin_router.get("/packages")
async def admin_packages(request: Request):
    await require_role(request, ["admin"])
    items = await db.travel_packages.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)
    out = [await _package_view(p) for p in items]
    return {"packages": out}


@admin_router.post("/packages")
async def admin_create_package(request: Request):
    await require_role(request, ["admin"], permission="server.settings.edit")
    body = await request.json()
    if not body.get("flight_id") or not body.get("hotel_id") or not body.get("room_id"):
        raise HTTPException(status_code=400, detail="Vol, hôtel et chambre requis")
    pkg = {"id": f"pkg_{uuid.uuid4().hex[:10]}", "created_at": _now(),
           "title": str(body.get("title") or "Forfait voyage")[:120],
           "description": str(body.get("description") or "")[:1000],
           "image_url": str(body.get("image_url") or "")[:600],
           "flight_id": body["flight_id"], "hotel_id": body["hotel_id"], "room_id": body["room_id"],
           "nights": max(1, int(body.get("nights") or 1)),
           "discount_pct": max(0.0, min(90.0, float(body.get("discount_pct") or 0))),
           "active": True}
    await db.travel_packages.insert_one(dict(pkg))
    return {"ok": True, "package": pkg}


@admin_router.put("/packages/{package_id}")
async def admin_update_package(package_id: str, request: Request):
    await require_role(request, ["admin"], permission="server.settings.edit")
    body = await request.json()
    update = {}
    for f in ("title", "description", "image_url", "flight_id", "hotel_id", "room_id", "nights", "discount_pct", "active"):
        if f not in body:
            continue
        if f == "nights":
            update[f] = max(1, int(body[f] or 1))
        elif f == "discount_pct":
            update[f] = max(0.0, min(90.0, float(body[f] or 0)))
        elif f == "active":
            update[f] = bool(body[f])
        else:
            update[f] = str(body[f])[:1000]
    if update:
        await db.travel_packages.update_one({"id": package_id}, {"$set": update})
    pkg = await db.travel_packages.find_one({"id": package_id}, {"_id": 0})
    return {"ok": True, "package": pkg}


@admin_router.delete("/packages/{package_id}")
async def admin_delete_package(package_id: str, request: Request):
    await require_role(request, ["admin"], permission="server.settings.edit")
    await db.travel_packages.update_one({"id": package_id}, {"$set": {"active": False}})
    return {"ok": True}


@admin_router.get("/bookings")
async def admin_bookings(request: Request):
    await require_role(request, ["admin"])
    items = await db.travel_bookings.find({}, {"_id": 0}).sort("created_at", -1).to_list(300)
    return {"bookings": items}
