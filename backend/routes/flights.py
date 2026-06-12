"""SB Travel — Billets d'avion (agence de voyage, inventaire géré par l'admin).

Modèle MVP (inventaire admin, sans API tierce type Amadeus) :
- L'admin publie des vols (`flight_offers`) : compagnie, n° de vol, départ/arrivée (ville + horaires),
  classe, prix, sièges disponibles, escales, bagages.
- L'utilisateur recherche par ville de départ/arrivée (+ date optionnelle), consulte les vols,
  saisit ses passagers et réserve.
- Paiement via le portefeuille SB Pay (débité à la réservation). Sièges décrémentés selon
  les réservations confirmées. Annulation = remboursement avant le départ.
"""
import io
import re
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import StreamingResponse

from core.config import db
from core.deps import require_role, get_current_user
from core.notifications import create_notification
from core.airport import notify_admins
from core import duffel

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
#  UTILISATEUR — VOLS EN DIRECT (API Duffel temps réel)
# ============================================================
TITLE_OK = {"mr", "ms", "mrs", "miss", "dr"}
GENDER_OK = {"m", "f"}


def _iso_dur_to_min(s):
    """'PT11H30M' -> minutes."""
    if not s:
        return 0
    m = re.match(r"PT(?:(\d+)H)?(?:(\d+)M)?", str(s))
    if not m:
        return 0
    h = int(m.group(1) or 0)
    mi = int(m.group(2) or 0)
    return h * 60 + mi


def _norm_segment(seg):
    o, d = seg.get("origin") or {}, seg.get("destination") or {}
    mc = seg.get("marketing_carrier") or {}
    return {
        "origin_code": o.get("iata_code"), "origin_name": o.get("city_name") or o.get("name"),
        "destination_code": d.get("iata_code"), "destination_name": d.get("city_name") or d.get("name"),
        "departing_at": seg.get("departing_at"), "arriving_at": seg.get("arriving_at"),
        "carrier": mc.get("name"), "carrier_code": mc.get("iata_code"),
        "flight_number": f"{mc.get('iata_code', '')}{seg.get('marketing_carrier_flight_number', '')}",
        "duration_min": _iso_dur_to_min(seg.get("duration")),
    }


def _norm_slice(sl):
    segs = [_norm_segment(s) for s in (sl.get("segments") or [])]
    o, d = sl.get("origin") or {}, sl.get("destination") or {}
    return {
        "origin_code": o.get("iata_code"), "origin_name": o.get("city_name") or o.get("name"),
        "destination_code": d.get("iata_code"), "destination_name": d.get("city_name") or d.get("name"),
        "departing_at": segs[0]["departing_at"] if segs else None,
        "arriving_at": segs[-1]["arriving_at"] if segs else None,
        "duration_min": _iso_dur_to_min(sl.get("duration")),
        "stops": max(len(segs) - 1, 0),
        "segments": segs,
    }


def _norm_offer(offer):
    owner = offer.get("owner") or {}
    return {
        "id": offer.get("id"),
        "total_amount": offer.get("total_amount"),
        "total_currency": offer.get("total_currency"),
        "airline": owner.get("name"),
        "airline_logo": owner.get("logo_symbol_url"),
        "cabin_class": offer.get("cabin_class"),
        "slices": [_norm_slice(s) for s in (offer.get("slices") or [])],
    }


@router.get("/live/search")
async def live_search(request: Request, origin: str, destination: str, date: str,
                      return_date: str = None, passengers: int = 1, cabin_class: str = "economy"):
    """Recherche de vols réels via Duffel (codes IATA requis, ex. FDF, ORY)."""
    await get_current_user(request)
    if not duffel.duffel_enabled():
        raise HTTPException(status_code=503, detail="API vols en direct non configurée")
    origin, destination = (origin or "").strip().upper(), (destination or "").strip().upper()
    if len(origin) != 3 or len(destination) != 3:
        raise HTTPException(status_code=400, detail="Codes aéroport invalides (3 lettres, ex. FDF)")
    cabin = cabin_class if cabin_class in CABINS else "economy"
    pax_count = max(1, min(int(passengers or 1), 9))
    slices = [{"origin": origin, "destination": destination, "departure_date": str(date)[:10]}]
    if return_date:
        slices.append({"origin": destination, "destination": origin, "departure_date": str(return_date)[:10]})
    pax = [{"type": "adult"} for _ in range(pax_count)]
    try:
        oreq = await duffel.create_offer_request(slices, pax, cabin)
    except duffel.DuffelError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)
    passenger_ids = [p.get("id") for p in (oreq.get("passengers") or [])]
    await db.flight_offer_requests.update_one(
        {"id": oreq.get("id")},
        {"$set": {"id": oreq.get("id"), "passenger_ids": passenger_ids, "slices": slices,
                  "cabin_class": cabin, "created_at": _now()}},
        upsert=True,
    )
    offers = [_norm_offer(o) for o in (oreq.get("offers") or [])]
    offers.sort(key=lambda o: float(o.get("total_amount") or 0))
    return {"offer_request_id": oreq.get("id"), "passenger_count": pax_count, "offers": offers[:40]}


def _clean_live_passengers(value, expected, fallback_ids):
    out = []
    if not isinstance(value, list):
        raise HTTPException(status_code=400, detail="Passagers invalides")
    if len(value) != expected:
        raise HTTPException(status_code=400, detail=f"Renseignez exactement {expected} passager(s)")
    for i, p in enumerate(value):
        if not isinstance(p, dict):
            raise HTTPException(status_code=400, detail="Passager invalide")
        given = str(p.get("given_name") or "").strip()[:60]
        family = str(p.get("family_name") or "").strip()[:60]
        if not given or not family:
            raise HTTPException(status_code=400, detail="Nom et prénom requis pour chaque passager")
        title = str(p.get("title") or "mr").lower()
        gender = str(p.get("gender") or "m").lower()
        born_on = str(p.get("born_on") or "").strip()[:10]
        if not re.match(r"^\d{4}-\d{2}-\d{2}$", born_on):
            raise HTTPException(status_code=400, detail="Date de naissance requise (AAAA-MM-JJ)")
        out.append({
            "id": fallback_ids[i],
            "title": title if title in TITLE_OK else "mr",
            "gender": gender if gender in GENDER_OK else "m",
            "given_name": given, "family_name": family, "born_on": born_on,
        })
    return out


@router.post("/live/book")
async def live_book(request: Request):
    user = await get_current_user(request)
    if not duffel.duffel_enabled():
        raise HTTPException(status_code=503, detail="API vols en direct non configurée")
    body = await request.json()
    oreq = await db.flight_offer_requests.find_one({"id": body.get("offer_request_id")}, {"_id": 0})
    if not oreq:
        raise HTTPException(status_code=404, detail="Recherche expirée, relancez la recherche")
    passenger_ids = oreq.get("passenger_ids") or []
    contact_email = str(body.get("contact_email") or user.get("email") or "").strip()[:120]
    contact_phone = str(body.get("contact_phone") or "").strip()[:20]
    if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", contact_email):
        raise HTTPException(status_code=400, detail="E-mail de contact valide requis")
    if not re.match(r"^\+\d{6,15}$", contact_phone):
        raise HTTPException(status_code=400, detail="Téléphone au format international requis (ex. +596...)")

    # Re-fetch the live offer for the current price (offers expire quickly)
    try:
        offer = await duffel.get_offer(body.get("offer_id"))
    except duffel.DuffelError as e:
        raise HTTPException(status_code=e.status_code, detail="Cette offre n'est plus disponible, relancez la recherche")
    amount, currency = offer.get("total_amount"), offer.get("total_currency")
    if not amount:
        raise HTTPException(status_code=409, detail="Offre indisponible, relancez la recherche")
    price = round(float(amount), 2)

    passengers = _clean_live_passengers(body.get("passengers"), len(passenger_ids), passenger_ids)
    for p in passengers:
        p["email"] = contact_email
        p["phone_number"] = contact_phone

    wallet = await db.wallets.find_one({"user_id": user["id"]})
    if not wallet or wallet.get("balance", 0) < price:
        raise HTTPException(status_code=400, detail=f"Solde SB Pay insuffisant ({price} {currency})")

    try:
        order = await duffel.create_order(body.get("offer_id"), passengers, amount, currency)
    except duffel.DuffelError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)

    pnr = order.get("booking_reference") or ""
    new_balance = round(wallet["balance"] - price, 2)
    await db.wallets.update_one({"user_id": user["id"]}, {"$set": {"balance": new_balance}})
    await db.wallet_transactions.insert_one({
        "id": f"tx_{uuid.uuid4().hex[:12]}", "user_id": user["id"], "type": "Booking",
        "amount": -price, "balance_after": new_balance,
        "description": f"Vol {order.get('owner', {}).get('name', '')} · PNR {pnr}",
        "status": "completed", "created_at": _now()})

    slices = [_norm_slice(s) for s in (order.get("slices") or [])]
    first, last = (slices[0] if slices else {}), (slices[-1] if slices else {})
    booking = {
        "id": f"fbk_{uuid.uuid4().hex[:10]}", "user_id": user["id"], "user_name": user.get("name"),
        "source": "duffel", "duffel_order_id": order.get("id"), "pnr": pnr,
        "airline": order.get("owner", {}).get("name"),
        "flight_number": slices[0]["segments"][0]["flight_number"] if slices and slices[0]["segments"] else "",
        "origin": first.get("origin_name"), "origin_code": first.get("origin_code"),
        "destination": (first.get("destination_name") if len(slices) <= 1 else last.get("destination_name")),
        "destination_code": (first.get("destination_code") if len(slices) <= 1 else last.get("destination_code")),
        "departure_at": first.get("departing_at"), "arrival_at": first.get("arriving_at"),
        "cabin_class": offer.get("cabin_class"),
        "passengers": [{"name": f"{p['given_name']} {p['family_name']}", "type": "adult"} for p in passengers],
        "slices": slices, "seats_count": len(passengers),
        "total_price": price, "currency": currency,
        "contact_email": contact_email, "contact_phone": contact_phone,
        "status": "confirmed", "payment_status": "paid", "created_at": _now(),
    }
    await db.flight_bookings.insert_one(dict(booking))
    booking.pop("_id", None)
    await notify_admins("flight_booking_new", "Nouvelle réservation de vol (réel)",
                        f"{user.get('name') or 'Un client'} · PNR {pnr} · {booking['airline']}",
                        data={"booking_id": booking["id"]})
    await create_notification(user["id"], "flight_booking", "Vol réservé ✈️",
                              f"PNR {pnr} · {booking['origin_code']} → {booking['destination_code']}. E-billet disponible.",
                              data={"booking_id": booking["id"]})
    return {"ok": True, "booking": booking, "balance": new_balance}


@router.get("/bookings/{booking_id}/eticket")
async def eticket(booking_id: str, request: Request):
    """Génère le e-billet PDF (PNR, passagers, itinéraire)."""
    user = await get_current_user(request)
    bk = await db.flight_bookings.find_one({"id": booking_id, "user_id": user["id"]}, {"_id": 0})
    if not bk:
        raise HTTPException(status_code=404, detail="Réservation introuvable")
    pdf = _build_eticket_pdf(bk)
    return StreamingResponse(io.BytesIO(pdf), media_type="application/pdf",
                             headers={"Content-Disposition": f'inline; filename="eticket-{bk.get("pnr") or booking_id}.pdf"'})


def _build_eticket_pdf(bk) -> bytes:
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.lib import colors
    from reportlab.pdfgen import canvas

    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    w, h = A4
    navy = colors.HexColor("#0A2540")
    orange = colors.HexColor("#FF5000")

    c.setFillColor(navy)
    c.rect(0, h - 30 * mm, w, 30 * mm, fill=1, stroke=0)
    c.setFillColor(colors.white)
    c.setFont("Helvetica-Bold", 20)
    c.drawString(18 * mm, h - 18 * mm, "SB Travel — E-Billet")
    c.setFont("Helvetica", 10)
    c.drawString(18 * mm, h - 25 * mm, "Carte d'embarquement électronique")
    c.setFillColor(orange)
    c.setFont("Helvetica-Bold", 16)
    c.drawRightString(w - 18 * mm, h - 18 * mm, f"PNR : {bk.get('pnr') or '—'}")

    y = h - 45 * mm
    c.setFillColor(colors.black)
    c.setFont("Helvetica-Bold", 13)
    c.drawString(18 * mm, y, f"{bk.get('airline') or ''}  {bk.get('flight_number') or ''}")
    y -= 7 * mm
    c.setFont("Helvetica", 10)
    c.setFillColor(colors.HexColor("#555555"))
    c.drawString(18 * mm, y, f"Statut : {bk.get('status', '').upper()}   ·   Total : {bk.get('total_price')} {bk.get('currency') or 'EUR'}")

    def fmt(s):
        try:
            return datetime.fromisoformat(str(s).replace("Z", "+00:00")).strftime("%d/%m/%Y %H:%M")
        except Exception:
            return str(s or "—")

    y -= 12 * mm
    for sl in (bk.get("slices") or [{
        "origin_code": bk.get("origin_code"), "origin_name": bk.get("origin"),
        "destination_code": bk.get("destination_code"), "destination_name": bk.get("destination"),
        "departing_at": bk.get("departure_at"), "arriving_at": bk.get("arrival_at"),
    }]):
        c.setStrokeColor(colors.HexColor("#E5E7EB"))
        c.setLineWidth(1)
        c.roundRect(18 * mm, y - 22 * mm, w - 36 * mm, 22 * mm, 3 * mm, stroke=1, fill=0)
        c.setFillColor(navy)
        c.setFont("Helvetica-Bold", 18)
        c.drawString(24 * mm, y - 9 * mm, sl.get("origin_code") or "—")
        c.drawRightString(w - 24 * mm, y - 9 * mm, sl.get("destination_code") or "—")
        c.setFillColor(orange)
        c.setFont("Helvetica", 9)
        c.drawCentredString(w / 2, y - 8 * mm, "—— ✈ ——")
        c.setFillColor(colors.HexColor("#555555"))
        c.setFont("Helvetica", 8)
        c.drawString(24 * mm, y - 16 * mm, f"{sl.get('origin_name') or ''}  {fmt(sl.get('departing_at'))}")
        c.drawRightString(w - 24 * mm, y - 16 * mm, f"{fmt(sl.get('arriving_at'))}  {sl.get('destination_name') or ''}")
        y -= 28 * mm

    y -= 2 * mm
    c.setFillColor(colors.black)
    c.setFont("Helvetica-Bold", 11)
    c.drawString(18 * mm, y, "Passagers")
    y -= 7 * mm
    c.setFont("Helvetica", 10)
    c.setFillColor(colors.HexColor("#333333"))
    for p in (bk.get("passengers") or []):
        c.drawString(22 * mm, y, f"•  {p.get('name')}")
        y -= 6 * mm

    c.setFillColor(colors.HexColor("#999999"))
    c.setFont("Helvetica", 8)
    c.drawString(18 * mm, 15 * mm, "Présentez ce billet et une pièce d'identité à l'enregistrement. SB Travel — SB Marketplace.")
    c.showPage()
    c.save()
    buf.seek(0)
    return buf.read()


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
