"""Covoiturage (carpool) — système complet avec paiement SB Pay sécurisé.

Modèle de paiement : SÉQUESTRE (escrow).
- À la réservation, le montant (prix/place × sièges) est débité du portefeuille
  SB Pay du passager et conservé par la plateforme (séquestre).
- Si le passager annule AVANT le départ → remboursement intégral.
- À la complétion du trajet (par le chauffeur ou libération auto après le départ)
  → le séquestre est reversé au chauffeur, moins la commission plateforme (15 %).
- Si le chauffeur annule tout le trajet → tous les passagers sont remboursés.

Seul SB Pay (portefeuille) est accepté pour garantir la sécurité des fonds.
"""
import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, Request, HTTPException

from core.config import db
from core.deps import get_current_user, require_role
from core.notifications import create_notification

router = APIRouter(prefix="/carpool", tags=["carpool"])

CARPOOL_CONFIG_KEY = "carpool"
SUPER_DRIVER_MIN_RATING = 4.7
SUPER_DRIVER_MIN_COUNT = 5
CARPOOL_DEFAULTS = {
    "enabled": True,
    "commission_percent": 15.0,
    "max_seats_per_booking": 4,
    "max_seats_per_ride": 8,
    "auto_release_hours": 12,
    "currency": "EUR",
}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _parse_dt(s):
    if not s:
        return None
    try:
        dt = datetime.fromisoformat(str(s).replace("Z", "+00:00"))
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except Exception:
        return None


async def get_carpool_config() -> dict:
    doc = await db.service_configs.find_one({"service_key": CARPOOL_CONFIG_KEY}, {"_id": 0}) or {}
    cfg = {**CARPOOL_DEFAULTS, **{k: v for k, v in doc.items() if k != "service_key"}}
    cfg["commission_percent"] = float(cfg.get("commission_percent") or 0)
    cfg["max_seats_per_booking"] = int(cfg.get("max_seats_per_booking") or 1)
    return cfg


def _seats_left(ride: dict) -> int:
    return max(0, int(ride.get("available_seats", 0)) - int(ride.get("seats_taken", 0)))


async def _attach_driver_ratings(rides: list) -> list:
    """Ajoute driver_rating (moyenne ★) + driver_ratings_count à chaque trajet."""
    ids = list({r.get("driver_id") for r in rides if r.get("driver_id")})
    if not ids:
        return rides
    docs = await db.users.find(
        {"id": {"$in": ids}},
        {"_id": 0, "id": 1, "cp_driver_rating_sum": 1, "cp_driver_rating_count": 1}).to_list(len(ids))
    m = {d["id"]: d for d in docs}
    for r in rides:
        u = m.get(r.get("driver_id")) or {}
        cnt = int(u.get("cp_driver_rating_count") or 0)
        s = float(u.get("cp_driver_rating_sum") or 0)
        avg = round(s / cnt, 1) if cnt else None
        r["driver_rating"] = avg
        r["driver_ratings_count"] = cnt
        r["driver_super"] = bool(cnt >= SUPER_DRIVER_MIN_COUNT and avg and avg >= SUPER_DRIVER_MIN_RATING)
    return rides


@router.get("/drivers/{driver_id}/reviews")
async def driver_reviews(driver_id: str):
    """Avis détaillés reçus par un chauffeur + note moyenne + badge Super chauffeur."""
    u = await db.users.find_one(
        {"id": driver_id}, {"_id": 0, "name": 1, "cp_driver_rating_sum": 1, "cp_driver_rating_count": 1}) or {}
    cnt = int(u.get("cp_driver_rating_count") or 0)
    s = float(u.get("cp_driver_rating_sum") or 0)
    avg = round(s / cnt, 1) if cnt else None
    reviews = await db.carpool_ratings.find(
        {"ratee_id": driver_id, "ratee_role": "driver"},
        {"_id": 0, "stars": 1, "comment": 1, "rater_name": 1, "created_at": 1}
    ).sort("created_at", -1).limit(30).to_list(30)
    return {
        "driver_name": u.get("name"), "rating": avg, "count": cnt,
        "is_super_driver": bool(cnt >= SUPER_DRIVER_MIN_COUNT and avg and avg >= SUPER_DRIVER_MIN_RATING),
        "reviews": reviews,
    }


def _public_ride(ride: dict, *, reveal_contact: bool = False) -> dict:
    out = {k: v for k, v in ride.items() if k != "_id"}
    out["seats_left"] = _seats_left(ride)
    # Masque les contacts par défaut ; révélés une fois la réservation faite / pour le chauffeur.
    if not reveal_contact:
        out.pop("driver_phone", None)
        for p in out.get("passengers", []):
            p.pop("phone", None)
    return out


# ── Crédit / débit portefeuille (mêmes primitives que le flux course) ──────
async def _wallet_debit_atomic(user_id: str, amount: float, description: str) -> bool:
    """Débit atomique : échoue (False) si solde insuffisant."""
    amount = round(float(amount), 2)
    if amount <= 0:
        return True
    res = await db.wallets.update_one(
        {"user_id": user_id, "balance": {"$gte": amount}},
        {"$inc": {"balance": -amount}},
    )
    if not res.modified_count:
        return False
    w = await db.wallets.find_one({"user_id": user_id}, {"_id": 0, "balance": 1})
    await db.wallet_transactions.insert_one({
        "id": f"tx_{uuid.uuid4().hex[:12]}", "user_id": user_id, "type": "Booking",
        "amount": -amount, "balance_after": round((w or {}).get("balance", 0), 2),
        "description": description, "status": "completed", "created_at": _now(),
    })
    return True


async def _wallet_credit(user_id: str, amount: float, description: str, tx_type: str = "Refund") -> None:
    amount = round(float(amount), 2)
    if amount <= 0 or not user_id:
        return
    await db.wallets.update_one(
        {"user_id": user_id},
        {"$inc": {"balance": amount},
         "$setOnInsert": {"user_id": user_id, "currency": "EUR", "created_at": _now()}},
        upsert=True,
    )
    w = await db.wallets.find_one({"user_id": user_id}, {"_id": 0, "balance": 1})
    await db.wallet_transactions.insert_one({
        "id": f"tx_{uuid.uuid4().hex[:12]}", "user_id": user_id, "type": tx_type,
        "amount": amount, "balance_after": round((w or {}).get("balance", 0), 2),
        "description": description, "status": "completed", "created_at": _now(),
    })


# ── Config (public + admin) ────────────────────────────────────────────────
@router.get("/config")
async def carpool_config():
    cfg = await get_carpool_config()
    return {"commission_percent": cfg["commission_percent"], "currency": cfg["currency"],
            "max_seats_per_booking": cfg["max_seats_per_booking"], "enabled": cfg["enabled"]}


@router.get("/admin/config")
async def carpool_admin_get(request: Request):
    await require_role(request, ["admin"])
    return await get_carpool_config()


def _clamp(v, lo, hi, default, *, cast=float):
    try:
        x = cast(v)
    except (TypeError, ValueError):
        return default
    return max(lo, min(hi, x))


@router.put("/admin/config")
async def carpool_admin_set(request: Request):
    await require_role(request, ["admin"])
    body = await request.json()
    update = {"service_key": CARPOOL_CONFIG_KEY}
    if "enabled" in body:
        update["enabled"] = bool(body["enabled"])
    if "commission_percent" in body:
        update["commission_percent"] = _clamp(body["commission_percent"], 0, 100, 15.0)
    if "max_seats_per_booking" in body:
        update["max_seats_per_booking"] = _clamp(body["max_seats_per_booking"], 1, 8, 4, cast=int)
    if "max_seats_per_ride" in body:
        update["max_seats_per_ride"] = _clamp(body["max_seats_per_ride"], 1, 8, 8, cast=int)
    if "auto_release_hours" in body:
        update["auto_release_hours"] = _clamp(body["auto_release_hours"], 1, 168, 12, cast=int)
    if "currency" in body:
        update["currency"] = str(body["currency"] or "EUR").upper()[:3]
    await db.service_configs.update_one({"service_key": CARPOOL_CONFIG_KEY}, {"$set": update}, upsert=True)
    return await get_carpool_config()


# ── Tableau de bord admin : revenus covoiturage ─────────────────────────────
@router.get("/admin/revenue")
async def carpool_admin_revenue(request: Request, date_from: Optional[str] = None, date_to: Optional[str] = None):
    """Agrège les revenus de la plateforme issus du covoiturage (commissions 15 %).

    Renvoie : KPIs (commission totale, brut encaissé, reversé chauffeurs, trajets
    terminés, places vendues, panier moyen), top chauffeurs, et série quotidienne
    pour le graphique.
    """
    await require_role(request, ["admin"])
    cfg = await get_carpool_config()

    def _in_range(iso: str) -> bool:
        if not (date_from or date_to):
            return True
        d = (iso or "")[:10]
        if date_from and d < date_from:
            return False
        if date_to and d > date_to:
            return False
        return True

    completed = await db.carpool_rides.find({"status": "completed"}, {"_id": 0}).to_list(100000)
    completed = [r for r in completed if _in_range(r.get("completed_at") or r.get("departure_date") or "")]

    total_commission = total_gross = total_payout = 0.0
    seats_sold = 0
    drivers = {}  # driver_id -> stats
    day_series = {}  # 'YYYY-MM-DD' -> {commission, rides}

    for r in completed:
        commission = round(float(r.get("total_commission") or 0), 2)
        gross = round(sum(float(p.get("amount_paid") or 0)
                          for p in r.get("passengers", []) if p.get("status") in ("completed", "booked")), 2)
        payout = round(gross - commission, 2)
        seats = sum(int(p.get("seats") or 0) for p in r.get("passengers", []) if p.get("status") in ("completed", "booked"))
        total_commission += commission
        total_gross += gross
        total_payout += payout
        seats_sold += seats

        did = r.get("driver_id")
        d = drivers.setdefault(did, {"driver_id": did, "driver_name": r.get("driver_name") or "—",
                                     "commission": 0.0, "gross": 0.0, "rides": 0, "seats": 0})
        d["commission"] = round(d["commission"] + commission, 2)
        d["gross"] = round(d["gross"] + gross, 2)
        d["rides"] += 1
        d["seats"] += seats

        day = (r.get("completed_at") or r.get("departure_date") or "")[:10]
        if day:
            ds = day_series.setdefault(day, {"date": day, "commission": 0.0, "rides": 0})
            ds["commission"] = round(ds["commission"] + commission, 2)
            ds["rides"] += 1

    # Enrichit les top chauffeurs avec leur note moyenne (réutilise les agrégats user).
    ids = [d for d in drivers if d]
    if ids:
        udocs = await db.users.find(
            {"id": {"$in": ids}},
            {"_id": 0, "id": 1, "cp_driver_rating_sum": 1, "cp_driver_rating_count": 1}).to_list(len(ids))
        um = {u["id"]: u for u in udocs}
        for did, d in drivers.items():
            u = um.get(did) or {}
            cnt = int(u.get("cp_driver_rating_count") or 0)
            s = float(u.get("cp_driver_rating_sum") or 0)
            d["rating"] = round(s / cnt, 1) if cnt else None
            d["ratings_count"] = cnt

    top_drivers = sorted(drivers.values(), key=lambda x: x["commission"], reverse=True)[:10]
    daily = sorted(day_series.values(), key=lambda x: x["date"])[-30:]
    rides_count = len(completed)
    active_drivers = len([d for d in drivers if d])

    return {
        "currency": cfg["currency"],
        "commission_percent": cfg["commission_percent"],
        "kpis": {
            "total_commission": round(total_commission, 2),
            "total_gross": round(total_gross, 2),
            "total_payout": round(total_payout, 2),
            "rides_completed": rides_count,
            "seats_sold": seats_sold,
            "active_drivers": active_drivers,
            "avg_commission_per_ride": round(total_commission / rides_count, 2) if rides_count else 0.0,
        },
        "top_drivers": top_drivers,
        "daily": daily,
    }


# ── Publier un trajet ───────────────────────────────────────────────────────
@router.post("/rides")
async def create_carpool_ride(request: Request):
    user = await get_current_user(request)
    cfg = await get_carpool_config()
    if not cfg["enabled"]:
        raise HTTPException(status_code=503, detail="Covoiturage temporairement indisponible")
    body = await request.json()

    pickup = str(body.get("pickup_address") or "").strip()
    dropoff = str(body.get("dropoff_address") or "").strip()
    departure = str(body.get("departure_date") or "").strip()
    if not pickup or not dropoff:
        raise HTTPException(status_code=400, detail="Départ et destination requis")
    dep_dt = _parse_dt(departure)
    if not dep_dt:
        raise HTTPException(status_code=400, detail="Date de départ invalide")
    if dep_dt < datetime.now(timezone.utc) - timedelta(minutes=5):
        raise HTTPException(status_code=400, detail="La date de départ doit être dans le futur")
    try:
        seats = int(body.get("available_seats", 3))
        price = round(float(body.get("price_per_seat", 10.0)), 2)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="Sièges ou prix invalides")
    if not (1 <= seats <= int(cfg["max_seats_per_ride"])):
        raise HTTPException(status_code=400, detail=f"Sièges entre 1 et {cfg['max_seats_per_ride']}")
    if price < 0 or price > 1000:
        raise HTTPException(status_code=400, detail="Prix par place invalide")

    ride = {
        "id": f"carpool_{uuid.uuid4().hex[:12]}",
        "driver_id": user["id"], "driver_name": user.get("name"), "driver_phone": user.get("phone"),
        "pickup_address": pickup, "dropoff_address": dropoff, "departure_date": departure,
        "pickup_lat": body.get("pickup_lat"), "pickup_lng": body.get("pickup_lng"),
        "dropoff_lat": body.get("dropoff_lat"), "dropoff_lng": body.get("dropoff_lng"),
        "distance_km": (round(float(body["distance_km"]), 1) if body.get("distance_km") not in (None, "") else None),
        "notes": str(body.get("notes") or "").strip()[:200],
        "available_seats": seats, "seats_taken": 0, "price_per_seat": price, "currency": cfg["currency"],
        "status": "open", "passengers": [], "escrow_total": 0.0, "total_commission": 0.0,
        "created_at": _now(),
    }
    await db.carpool_rides.insert_one(dict(ride))

    # Matching inversé : si le trajet répond à une demande passager, on la clôt et on le prévient.
    req_id = str(body.get("request_id") or "")
    if req_id:
        req = await db.carpool_requests.find_one({"id": req_id, "status": "open"})
        if req:
            await db.carpool_requests.update_one(
                {"id": req_id}, {"$set": {"status": "fulfilled", "ride_id": ride["id"], "fulfilled_at": _now()}})
            await create_notification(
                req["passenger_id"], "carpool_request_fulfilled", "Un chauffeur propose votre trajet 🚗",
                f"{user.get('name') or 'Un chauffeur'} propose {pickup} → {dropoff} à {price}€/place. Réservez votre place !",
                data={"ride_id": ride["id"], "request_id": req_id})
    return _public_ride(ride, reveal_contact=True)


# ── Demandes de trajet (matching inversé : le passager publie, le chauffeur propose) ──
@router.post("/requests")
async def create_carpool_request(request: Request):
    user = await get_current_user(request)
    body = await request.json()
    pickup = str(body.get("pickup_address") or "").strip()
    dropoff = str(body.get("dropoff_address") or "").strip()
    departure = str(body.get("departure_date") or "").strip()
    if not pickup or not dropoff:
        raise HTTPException(status_code=400, detail="Départ et destination requis")
    try:
        seats = max(1, min(8, int(body.get("seats_needed", 1))))
    except (TypeError, ValueError):
        seats = 1
    try:
        max_price = round(float(body.get("max_price")), 2) if body.get("max_price") not in (None, "") else None
    except (TypeError, ValueError):
        max_price = None
    req = {
        "id": f"cpreq_{uuid.uuid4().hex[:12]}",
        "passenger_id": user["id"], "passenger_name": user.get("name"),
        "pickup_address": pickup, "dropoff_address": dropoff,
        "pickup_lat": body.get("pickup_lat"), "pickup_lng": body.get("pickup_lng"),
        "dropoff_lat": body.get("dropoff_lat"), "dropoff_lng": body.get("dropoff_lng"),
        "departure_date": departure, "seats_needed": seats, "max_price": max_price,
        "notes": str(body.get("notes") or "").strip()[:200],
        "status": "open", "created_at": _now(),
    }
    await db.carpool_requests.insert_one(dict(req))
    matched = await _notify_matching_drivers(req)
    out = {k: v for k, v in req.items() if k != "_id"}
    out["drivers_notified"] = matched
    return out


@router.get("/requests")
async def list_carpool_requests(pickup: Optional[str] = None, dropoff: Optional[str] = None, limit: int = 30):
    query = {"status": "open"}
    if pickup:
        query["pickup_address"] = {"$regex": pickup, "$options": "i"}
    if dropoff:
        query["dropoff_address"] = {"$regex": dropoff, "$options": "i"}
    return await db.carpool_requests.find(query, {"_id": 0}).sort("departure_date", 1).limit(int(limit)).to_list(int(limit))


@router.get("/my-requests")
async def my_carpool_requests(request: Request):
    user = await get_current_user(request)
    return await db.carpool_requests.find(
        {"passenger_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(50)


@router.post("/requests/{req_id}/cancel")
async def cancel_carpool_request(req_id: str, request: Request):
    user = await get_current_user(request)
    req = await db.carpool_requests.find_one({"id": req_id})
    if not req or req["passenger_id"] != user["id"]:
        raise HTTPException(status_code=404, detail="Demande introuvable")
    await db.carpool_requests.update_one({"id": req_id}, {"$set": {"status": "cancelled", "cancelled_at": _now()}})
    return {"ok": True}


# ── Trajets habituels du chauffeur + alerte automatique sur demande correspondante ──
import math  # noqa: E402
import re  # noqa: E402

MATCH_RADIUS_KM = 15.0  # rayon de correspondance géographique (départ ET destination)


def _haversine_km(lat1, lng1, lat2, lng2):
    try:
        lat1, lng1, lat2, lng2 = float(lat1), float(lng1), float(lat2), float(lng2)
    except (TypeError, ValueError):
        return None
    R = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlmb = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlmb / 2) ** 2
    return R * 2 * math.asin(math.sqrt(a))


def _tokens(s):
    """Mots significatifs (≥ 4 lettres) d'une adresse, en minuscules sans accents simples."""
    s = (s or "").lower()
    for a, b in (("é", "e"), ("è", "e"), ("ê", "e"), ("à", "a"), ("ô", "o"), ("î", "i"), ("ç", "c")):
        s = s.replace(a, b)
    return {w for w in re.split(r"[^a-z0-9]+", s) if len(w) >= 4}


def _endpoints_match(req_addr, req_lat, req_lng, route_addr, route_lat, route_lng):
    """Une extrémité (départ ou destination) correspond si : géo ≤ rayon (si coords des
    deux côtés), sinon partage d'au moins un mot significatif (ville)."""
    if req_lat and req_lng and route_lat and route_lng:
        d = _haversine_km(req_lat, req_lng, route_lat, route_lng)
        if d is not None:
            return d <= MATCH_RADIUS_KM
    return bool(_tokens(req_addr) & _tokens(route_addr))


def _request_matches_route(req: dict, route: dict) -> bool:
    return (
        _endpoints_match(req.get("pickup_address"), req.get("pickup_lat"), req.get("pickup_lng"),
                         route.get("pickup_address"), route.get("pickup_lat"), route.get("pickup_lng"))
        and
        _endpoints_match(req.get("dropoff_address"), req.get("dropoff_lat"), req.get("dropoff_lng"),
                         route.get("dropoff_address"), route.get("dropoff_lat"), route.get("dropoff_lng"))
    )


async def _notify_matching_drivers(req: dict) -> int:
    """Prévient les chauffeurs dont un trajet habituel actif correspond à la demande."""
    notified = set()
    routes = await db.carpool_driver_routes.find({"active": True}).to_list(2000)
    for route in routes:
        did = route.get("driver_id")
        if not did or did == req.get("passenger_id") or did in notified:
            continue
        if _request_matches_route(req, route):
            notified.add(did)
            await create_notification(
                did, "carpool_request_match", "Demande sur votre trajet habituel 🚗🔔",
                f"{req.get('passenger_name') or 'Un passager'} cherche {req['pickup_address']} → {req['dropoff_address']}"
                f"{' · ' + str(req['max_price']) + '€ max' if req.get('max_price') is not None else ''}. Proposez votre trajet !",
                data={"request_id": req["id"], "url": "/carpool?tab=requests"})
    return len(notified)


@router.post("/driver-routes")
async def create_driver_route(request: Request):
    user = await get_current_user(request)
    body = await request.json()
    pickup = str(body.get("pickup_address") or "").strip()
    dropoff = str(body.get("dropoff_address") or "").strip()
    if not pickup or not dropoff:
        raise HTTPException(status_code=400, detail="Départ et destination requis")
    days = body.get("days") or []
    if not isinstance(days, list):
        days = []
    route = {
        "id": f"cproute_{uuid.uuid4().hex[:12]}",
        "driver_id": user["id"], "driver_name": user.get("name"),
        "pickup_address": pickup, "dropoff_address": dropoff,
        "pickup_lat": body.get("pickup_lat"), "pickup_lng": body.get("pickup_lng"),
        "dropoff_lat": body.get("dropoff_lat"), "dropoff_lng": body.get("dropoff_lng"),
        "days": [int(d) for d in days if str(d).isdigit() and 0 <= int(d) <= 6][:7],
        "time": str(body.get("time") or "").strip()[:5],  # 'HH:MM'
        "active": True, "created_at": _now(),
    }
    await db.carpool_driver_routes.insert_one(dict(route))
    return {k: v for k, v in route.items() if k != "_id"}


@router.get("/driver-routes")
async def list_driver_routes(request: Request):
    user = await get_current_user(request)
    return await db.carpool_driver_routes.find(
        {"driver_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(50)


@router.post("/driver-routes/{route_id}/toggle")
async def toggle_driver_route(route_id: str, request: Request):
    user = await get_current_user(request)
    route = await db.carpool_driver_routes.find_one({"id": route_id, "driver_id": user["id"]})
    if not route:
        raise HTTPException(status_code=404, detail="Trajet habituel introuvable")
    new_active = not route.get("active", True)
    await db.carpool_driver_routes.update_one({"id": route_id}, {"$set": {"active": new_active}})
    return {"ok": True, "active": new_active}


@router.delete("/driver-routes/{route_id}")
async def delete_driver_route(route_id: str, request: Request):
    user = await get_current_user(request)
    res = await db.carpool_driver_routes.delete_one({"id": route_id, "driver_id": user["id"]})
    if not res.deleted_count:
        raise HTTPException(status_code=404, detail="Trajet habituel introuvable")
    return {"ok": True}


# ── Rechercher des trajets ──────────────────────────────────────────────────
@router.get("/rides")
async def search_carpool_rides(pickup: Optional[str] = None, dropoff: Optional[str] = None,
                               date: Optional[str] = None, limit: int = 20):
    query = {"status": {"$in": ["open", "full"]}}
    if pickup:
        query["pickup_address"] = {"$regex": pickup, "$options": "i"}
    if dropoff:
        query["dropoff_address"] = {"$regex": dropoff, "$options": "i"}
    if date:
        query["departure_date"] = {"$regex": f"^{date}"}
    rides = await db.carpool_rides.find(query).sort("departure_date", 1).limit(limit).to_list(limit)
    out = [_public_ride(r) for r in rides]
    await _attach_driver_ratings(out)
    return out


# ── Réserver des places (avec séquestre SB Pay) ─────────────────────────────
@router.post("/rides/{ride_id}/book")
async def book_carpool_seat(ride_id: str, request: Request):
    user = await get_current_user(request)
    body = await request.json() if request.headers.get("content-length") else {}
    cfg = await get_carpool_config()
    try:
        seats = int(body.get("seats", 1))
    except (TypeError, ValueError):
        seats = 1
    if seats < 1:
        raise HTTPException(status_code=400, detail="Nombre de places invalide")
    if seats > int(cfg["max_seats_per_booking"]):
        raise HTTPException(status_code=400, detail=f"Maximum {cfg['max_seats_per_booking']} places par réservation")

    ride = await db.carpool_rides.find_one({"id": ride_id})
    if not ride or ride.get("status") not in ("open", "full"):
        raise HTTPException(status_code=404, detail="Trajet introuvable ou complet")
    if ride["driver_id"] == user["id"]:
        raise HTTPException(status_code=400, detail="Vous ne pouvez pas réserver votre propre trajet")
    if any(p["user_id"] == user["id"] and p.get("status") == "booked" for p in ride.get("passengers", [])):
        raise HTTPException(status_code=400, detail="Vous avez déjà réservé ce trajet")

    amount = round(float(ride["price_per_seat"]) * seats, 2)

    # 1) Réservation ATOMIQUE des sièges (évite la sur-réservation concurrente).
    reserved = await db.carpool_rides.find_one_and_update(
        {"id": ride_id, "status": {"$in": ["open", "full"]},
         "$expr": {"$lte": [{"$add": [{"$ifNull": ["$seats_taken", 0]}, seats]}, "$available_seats"]}},
        {"$inc": {"seats_taken": seats}},
    )
    if not reserved:
        raise HTTPException(status_code=400, detail="Plus assez de places disponibles")

    # 2) Débit SB Pay (séquestre). Rollback des sièges si solde insuffisant.
    ok = await _wallet_debit_atomic(
        user["id"], amount,
        f"Réservation covoiturage {ride['pickup_address']} → {ride['dropoff_address']} ({seats} place(s), séquestre)")
    if not ok:
        await db.carpool_rides.update_one({"id": ride_id}, {"$inc": {"seats_taken": -seats}})
        w = await db.wallets.find_one({"user_id": user["id"]}, {"_id": 0, "balance": 1})
        bal = round(float((w or {}).get("balance", 0) or 0), 2)
        raise HTTPException(status_code=400, detail=f"Solde SB Pay insuffisant ({amount} {ride['currency']}, dispo {bal})")

    # 3) Ajoute le passager + met à jour le séquestre / statut.
    passenger = {"user_id": user["id"], "name": user.get("name"), "phone": user.get("phone"),
                 "seats": seats, "amount_paid": amount, "status": "booked", "booked_at": _now()}
    await db.carpool_rides.update_one(
        {"id": ride_id},
        {"$push": {"passengers": passenger}, "$inc": {"escrow_total": amount}})
    updated = await db.carpool_rides.find_one({"id": ride_id})
    if _seats_left(updated) <= 0:
        await db.carpool_rides.update_one({"id": ride_id}, {"$set": {"status": "full"}})
        updated["status"] = "full"

    await create_notification(
        ride["driver_id"], "carpool_booking", "Nouvelle réservation covoiturage 🚗",
        f"{user.get('name') or 'Un passager'} a réservé {seats} place(s) · {ride['pickup_address']} → {ride['dropoff_address']}",
        data={"ride_id": ride_id})
    await create_notification(
        user["id"], "carpool_booked", "Place réservée ✅",
        f"{ride['pickup_address']} → {ride['dropoff_address']} · {amount} {ride['currency']} (séquestre). Contact chauffeur disponible.",
        data={"ride_id": ride_id})

    return {"ok": True, "message": "Place réservée", "amount_paid": amount, "seats": seats,
            "driver_phone": ride.get("driver_phone"), "ride": _public_ride(updated, reveal_contact=True)}


# ── Annuler sa réservation (remboursement avant départ) ─────────────────────
@router.post("/rides/{ride_id}/cancel")
async def cancel_carpool_booking(ride_id: str, request: Request):
    user = await get_current_user(request)
    ride = await db.carpool_rides.find_one({"id": ride_id})
    if not ride:
        raise HTTPException(status_code=404, detail="Trajet introuvable")
    pax = next((p for p in ride.get("passengers", []) if p["user_id"] == user["id"] and p.get("status") == "booked"), None)
    if not pax:
        raise HTTPException(status_code=404, detail="Réservation active introuvable")
    if ride.get("status") in ("completed", "cancelled"):
        raise HTTPException(status_code=400, detail="Trajet déjà terminé ou annulé")

    dep = _parse_dt(ride.get("departure_date"))
    refundable = dep is None or dep > datetime.now(timezone.utc)
    amount = round(float(pax.get("amount_paid", 0)), 2)
    seats = int(pax.get("seats", 1))

    await db.carpool_rides.update_one(
        {"id": ride_id, "passengers.user_id": user["id"]},
        {"$set": {"passengers.$.status": "cancelled", "passengers.$.cancelled_at": _now(),
                  "status": "open"},
         "$inc": {"seats_taken": -seats, "escrow_total": -amount}})

    if refundable and amount > 0:
        await _wallet_credit(user["id"], amount,
                             f"Remboursement covoiturage {ride['pickup_address']} → {ride['dropoff_address']}", "Refund")
    await create_notification(
        ride["driver_id"], "carpool_cancel", "Annulation covoiturage",
        f"{user.get('name') or 'Un passager'} a annulé {seats} place(s).", data={"ride_id": ride_id})
    return {"ok": True, "refunded": amount if refundable else 0.0}


# ── Terminer le trajet : libère le séquestre au chauffeur (moins commission) ─
async def _release_escrow(ride: dict, *, reason: str = "completed") -> dict:
    cfg = await get_carpool_config()
    pct = float(cfg["commission_percent"]) / 100.0
    total_driver, total_comm = 0.0, 0.0
    for p in ride.get("passengers", []):
        if p.get("status") != "booked":
            continue
        amount = round(float(p.get("amount_paid", 0)), 2)
        commission = round(amount * pct, 2)
        driver_part = round(amount - commission, 2)
        total_driver += driver_part
        total_comm += commission
        await db.carpool_rides.update_one(
            {"id": ride["id"], "passengers.user_id": p["user_id"]},
            {"$set": {"passengers.$.status": "completed"}})
    total_driver = round(total_driver, 2)
    total_comm = round(total_comm, 2)
    if total_driver > 0:
        await _wallet_credit(ride["driver_id"], total_driver,
                             f"Gain covoiturage {ride['pickup_address']} → {ride['dropoff_address']}", "Earning")
    if total_comm > 0:
        await db.carpool_commissions.insert_one({
            "id": f"cc_{uuid.uuid4().hex[:10]}", "ride_id": ride["id"], "amount": total_comm,
            "created_at": _now()})
    await db.carpool_rides.update_one(
        {"id": ride["id"]},
        {"$set": {"status": "completed", "escrow_released": True, "released_reason": reason,
                  "completed_at": _now()}, "$inc": {"total_commission": total_comm}})
    return {"driver_credited": total_driver, "commission": total_comm}


@router.post("/rides/{ride_id}/complete")
async def complete_carpool_ride(ride_id: str, request: Request):
    user = await get_current_user(request)
    ride = await db.carpool_rides.find_one({"id": ride_id})
    if not ride:
        raise HTTPException(status_code=404, detail="Trajet introuvable")
    if ride["driver_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Seul le chauffeur peut terminer le trajet")
    if ride.get("status") in ("completed", "cancelled"):
        raise HTTPException(status_code=400, detail="Trajet déjà terminé ou annulé")
    res = await _release_escrow(ride, reason="driver")
    for p in ride.get("passengers", []):
        if p.get("status") == "booked":
            await create_notification(p["user_id"], "carpool_completed", "Trajet covoiturage terminé 🏁",
                                      f"{ride['pickup_address']} → {ride['dropoff_address']}. Merci d'avoir voyagé avec SB !",
                                      data={"ride_id": ride_id})
    await create_notification(ride["driver_id"], "carpool_payout", "Paiement covoiturage reçu 💶",
                              f"{res['driver_credited']} {ride['currency']} crédités sur votre portefeuille SB Pay.",
                              data={"ride_id": ride_id})
    return {"ok": True, **res}


# ── Le chauffeur annule tout le trajet : rembourse tous les passagers ───────
@router.post("/rides/{ride_id}/cancel-ride")
async def cancel_carpool_ride(ride_id: str, request: Request):
    user = await get_current_user(request)
    ride = await db.carpool_rides.find_one({"id": ride_id})
    if not ride:
        raise HTTPException(status_code=404, detail="Trajet introuvable")
    if ride["driver_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Seul le chauffeur peut annuler le trajet")
    if ride.get("status") in ("completed", "cancelled"):
        raise HTTPException(status_code=400, detail="Trajet déjà terminé ou annulé")
    refunded = 0.0
    for p in ride.get("passengers", []):
        if p.get("status") != "booked":
            continue
        amount = round(float(p.get("amount_paid", 0)), 2)
        refunded += amount
        await _wallet_credit(p["user_id"], amount,
                             f"Remboursement covoiturage annulé {ride['pickup_address']} → {ride['dropoff_address']}", "Refund")
        await create_notification(p["user_id"], "carpool_cancel_ride", "Trajet covoiturage annulé",
                                  f"Le chauffeur a annulé. Vous êtes remboursé de {amount} {ride['currency']}.",
                                  data={"ride_id": ride_id})
        await db.carpool_rides.update_one(
            {"id": ride_id, "passengers.user_id": p["user_id"]},
            {"$set": {"passengers.$.status": "refunded"}})
    await db.carpool_rides.update_one(
        {"id": ride_id}, {"$set": {"status": "cancelled", "escrow_total": 0.0, "cancelled_at": _now()}})
    return {"ok": True, "refunded": round(refunded, 2)}


# ── Mes trajets ─────────────────────────────────────────────────────────────
@router.get("/my-rides")
async def my_carpool_rides(request: Request):
    user = await get_current_user(request)
    as_driver = [_public_ride(r, reveal_contact=True) for r in
                 await db.carpool_rides.find({"driver_id": user["id"]}).sort("departure_date", -1).to_list(50)]
    as_passenger = [_public_ride(r, reveal_contact=True) for r in
                    await db.carpool_rides.find({"passengers.user_id": user["id"]}).sort("departure_date", -1).to_list(50)]
    await _attach_driver_ratings(as_driver)
    await _attach_driver_ratings(as_passenger)

    # « can_rate » : qui le user peut encore noter sur ses trajets terminés.
    completed_ids = [r["id"] for r in (as_driver + as_passenger) if r.get("status") == "completed"]
    given = await db.carpool_ratings.find(
        {"rater_id": user["id"], "ride_id": {"$in": completed_ids}},
        {"_id": 0, "ride_id": 1, "ratee_id": 1}).to_list(500) if completed_ids else []
    given_set = {(g["ride_id"], g["ratee_id"]) for g in given}
    for r in as_driver:
        r["can_rate"] = ([{"user_id": p["user_id"], "name": p.get("name"), "role": "passenger"}
                          for p in r.get("passengers", [])
                          if p.get("status") == "completed" and (r["id"], p["user_id"]) not in given_set]
                         if r.get("status") == "completed" else [])
    for r in as_passenger:
        if r.get("status") == "completed" and (r["id"], r.get("driver_id")) not in given_set:
            r["can_rate"] = [{"user_id": r.get("driver_id"), "name": r.get("driver_name"), "role": "driver"}]
        else:
            r["can_rate"] = []
    return {"as_driver": as_driver, "as_passenger": as_passenger}


# ── Noter (★) chauffeur ↔ passager après un trajet terminé ──────────────────
@router.post("/rides/{ride_id}/rate")
async def rate_carpool(ride_id: str, request: Request):
    user = await get_current_user(request)
    body = await request.json()
    try:
        stars = int(body.get("stars", 0))
    except (TypeError, ValueError):
        stars = 0
    if not (1 <= stars <= 5):
        raise HTTPException(status_code=400, detail="Note entre 1 et 5 étoiles")
    ratee_id = str(body.get("ratee_id") or "")
    comment = str(body.get("comment") or "").strip()[:300]

    ride = await db.carpool_rides.find_one({"id": ride_id})
    if not ride:
        raise HTTPException(status_code=404, detail="Trajet introuvable")
    if ride.get("status") != "completed":
        raise HTTPException(status_code=400, detail="Vous pourrez noter une fois le trajet terminé")

    pax_ids = [p["user_id"] for p in ride.get("passengers", []) if p.get("status") == "completed"]
    if ride["driver_id"] == user["id"]:
        if ratee_id not in pax_ids:
            raise HTTPException(status_code=400, detail="Passager introuvable sur ce trajet")
        ratee_role, field = "passenger", "cp_pax_rating"
        ratee_name = next((p.get("name") for p in ride["passengers"] if p["user_id"] == ratee_id), "")
    elif user["id"] in pax_ids:
        if ratee_id != ride["driver_id"]:
            raise HTTPException(status_code=400, detail="Vous ne pouvez noter que le chauffeur")
        ratee_role, field = "driver", "cp_driver_rating"
        ratee_name = ride.get("driver_name")
    else:
        raise HTTPException(status_code=403, detail="Vous n'avez pas participé à ce trajet")

    if await db.carpool_ratings.find_one({"ride_id": ride_id, "rater_id": user["id"], "ratee_id": ratee_id}):
        raise HTTPException(status_code=400, detail="Vous avez déjà noté cette personne")

    await db.carpool_ratings.insert_one({
        "id": f"rt_{uuid.uuid4().hex[:10]}", "ride_id": ride_id, "rater_id": user["id"],
        "rater_name": user.get("name"), "ratee_id": ratee_id, "ratee_role": ratee_role,
        "stars": stars, "comment": comment, "created_at": _now()})
    await db.users.update_one(
        {"id": ratee_id}, {"$inc": {f"{field}_sum": stars, f"{field}_count": 1}})
    await create_notification(
        ratee_id, "carpool_rating", "Nouvelle évaluation ⭐",
        f"{user.get('name') or 'Un membre'} vous a attribué {stars}/5 sur un trajet covoiturage.",
        data={"ride_id": ride_id})
    return {"ok": True, "ratee_name": ratee_name, "stars": stars}


# ── Libération automatique du séquestre après le départ (filet de sécurité) ─
async def carpool_autorelease_loop():
    """Toutes les 30 min : libère le séquestre au chauffeur pour les trajets dont
    le départ est passé depuis > auto_release_hours et que le chauffeur n'a pas
    clôturés (évite que les fonds restent bloqués indéfiniment)."""
    import asyncio
    while True:
        try:
            cfg = await get_carpool_config()
            grace = timedelta(hours=float(cfg.get("auto_release_hours", 12)))
            now = datetime.now(timezone.utc)
            cursor = db.carpool_rides.find({"status": {"$in": ["open", "full"]}, "escrow_total": {"$gt": 0}})
            async for ride in cursor:
                dep = _parse_dt(ride.get("departure_date"))
                if dep and (now - dep) >= grace:
                    res = await _release_escrow(ride, reason="auto")
                    for p in ride.get("passengers", []):
                        if p.get("status") == "booked":
                            await create_notification(
                                p["user_id"], "carpool_completed", "Trajet covoiturage clôturé 🏁",
                                f"{ride['pickup_address']} → {ride['dropoff_address']}.", data={"ride_id": ride["id"]})
                    if res["driver_credited"] > 0:
                        await create_notification(
                            ride["driver_id"], "carpool_payout", "Paiement covoiturage reçu 💶",
                            f"{res['driver_credited']} {ride['currency']} crédités (clôture automatique).",
                            data={"ride_id": ride["id"]})
        except Exception as e:  # noqa: BLE001
            try:
                from core.config import logger
                logger.error(f"carpool_autorelease_loop error: {e}")
            except Exception:
                pass
        await asyncio.sleep(1800)
