from fastapi import APIRouter, Request, HTTPException
import uuid
import os
import asyncio
import secrets
import requests
from datetime import datetime, timezone, timedelta
from typing import Optional

from core.zone_alerts import maybe_create_zone_alert

# Bidirectional bidding: driver counter-offers expire after this many seconds
OFFER_TTL_SECONDS = 30


async def _cash_exclude_set(ride: dict):
    """For a CASH ride, return the set of connected driver user-ids to EXCLUDE
    from the broadcast (those below the minimum balance). None for non-cash."""
    if (ride.get("payment_method") or "").strip().lower() != "cash":
        return None
    from core.websocket import manager as _mgr
    from core.config import db as _db
    connected = list(getattr(_mgr, "driver_clients", set()))
    if not connected:
        return None
    eligible = await _db.wallets.find(
        {"user_id": {"$in": connected}, "balance": {"$gte": CASH_RIDE_MIN_BALANCE}},
        {"_id": 0, "user_id": 1},
    ).to_list(5000)
    eligible_ids = {w["user_id"] for w in eligible}
    return set(connected) - eligible_ids


async def _vehicle_exclude_set(ride: dict):
    """Two-wheeler isolation at broadcast: exclude connected drivers whose vehicle_type
    is incompatible with the ride's vehicle_type (moto ride ↔ moto drivers only)."""
    rvt = ride.get("vehicle_type")
    if not rvt:
        return set()
    from core.websocket import manager as _mgr
    from core.config import db as _db
    from routes.auto_dispatch import _vehicle_compatible
    connected = list(getattr(_mgr, "driver_clients", set()))
    if not connected:
        return set()
    drivers = await _db.drivers.find(
        {"user_id": {"$in": connected}}, {"_id": 0, "user_id": 1, "vehicle_type": 1}).to_list(5000)
    return {d["user_id"] for d in drivers if not _vehicle_compatible(rvt, d.get("vehicle_type"))}


# Taxi Pool — V3Cube model (Vehicle Type → Pool config):
#   1st seat = full fare F (no discount). Each additional seat = Pool Percentage % of F.
#   total(n) = F * (1 + (n-1) * pool_percentage/100). e.g. P=90 → 2 seats = F*1.9.
#   Capacity ("Available Seats", excl. driver) caps the seats a booking may request.
from core.pool_config import (  # noqa: F401 — pool pricing/policy extracted into core.pool_config
    POOL_DEFAULT_MAX_SEATS_PER_BOOKING, POOL_DEFAULT_DISCOUNT_PERCENT,
    POOL_ALL_PAYMENTS, POOL_DEFAULT_MAX_STOPS,
    pool_seat_multiplier, get_pool_config, get_pool_global_config,
)

# Intercity (longue distance) — a round-trip (aller-retour) bills the outbound fare
# times this factor (admin-overridable later). <2.0 reflects a return-trip rebate.
INTERCITY_ROUNDTRIP_FACTOR = 1.9


from core.config import db
from core.deps import get_current_user, calculate_distance, calculate_fare
from core.cancel_policy import _cancel_policy, _compute_cancel_fee
from core.rental_meter import _compute_rental_meter
# Phase-3 extraction: payment reconciliation helpers (re-exported for
# routes/phase1.py and the test-suite which import them from routes.rides).
from core.ride_payments import (  # noqa: F401
    CASH_RIDE_MIN_BALANCE,
    VALID_PAYMENT_METHODS,
    _driver_meets_cash_minimum,
    _payment_feasibility,
    switch_to_cash_if_needed,
    _refund_intercity_deposit,
    _ride_invoice_number,
)
from models.schemas import RideRequest, RideResponse
from core.websocket import manager

router = APIRouter(prefix="/rides", tags=["rides"])

# V3Cube status flow: pending → accepted → arriving → in_progress → completed | cancelled
VALID_TRANSITIONS = {
    "pending": ["accepted", "cancelled"],
    "accepted": ["arriving", "cancelled"],
    "arriving": ["in_progress", "cancelled"],
    "in_progress": ["completed", "cancelled"],
}


CONTACT_REVEAL_MINUTES = 30  # reveal a scheduled ride's client phone only within X min of pickup

# ── Planification de trajets — fenêtres anti-confusion / anti-conflit ──
# IMPORTANT : ces fenêtres sont calculées par rapport à l'HEURE DU RENDEZ-VOUS
# (scheduled_at), PAS à l'heure de commande. Ex. RDV 15h00 → démarrage possible
# dès 14h20 (40 min avant), quelle que soit l'heure de réservation (midi, etc.).
SCHEDULED_ACTIVATION_MIN = 40   # le chauffeur peut démarrer / la course devient "active" 40 min avant le RDV
SCHEDULED_DOUBLE_BOOK_MIN = 30  # un client ne peut pas avoir 2 réservations à moins de X min d'écart
SCHEDULED_CONFLICT_MIN = 45     # un chauffeur ne peut pas cumuler 2 engagements qui se chevauchent (± X min)


async def _scheduling_windows():
    """Fenêtres de planification EFFECTIVES (admin-configurables via
    service_configs['scheduling'], repli sur les constantes ci-dessus).
    Renvoie (driver_start_window_min, anti_double_booking_min, driver_conflict_min)."""
    try:
        from routes.config import get_scheduling_config
        cfg = await get_scheduling_config()
        return (
            int(cfg.get("driver_start_window_min", SCHEDULED_ACTIVATION_MIN)),
            int(cfg.get("anti_double_booking_min", SCHEDULED_DOUBLE_BOOK_MIN)),
            int(cfg.get("driver_conflict_min", SCHEDULED_CONFLICT_MIN)),
        )
    except Exception:
        return (SCHEDULED_ACTIVATION_MIN, SCHEDULED_DOUBLE_BOOK_MIN, SCHEDULED_CONFLICT_MIN)


def _parse_iso(value):
    """Parse un ISO datetime tolérant (gère le 'Z'). Renvoie un datetime aware ou None."""
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt
    except (TypeError, ValueError):
        return None


def _is_scheduled_pending_activation(ride: dict, activation_min: int = SCHEDULED_ACTIVATION_MIN) -> bool:
    """True si la réservation programmée n'est PAS encore une course active 'maintenant'
    (le chauffeur n'a pas démarré et on est loin du départ) → ne doit pas déclencher la
    bande de suivi / redirection. Couvre 'pending' (pas encore acceptée) et 'accepted'
    (chauffeur confirmé mais départ lointain). Dès arriving/in_progress, ou dans la
    fenêtre d'activation, elle redevient une course active normale."""
    if ride.get("ride_mode") != "scheduled" and not ride.get("scheduled_at"):
        return False
    if ride.get("status") not in ("pending", "accepted"):
        return False
    sdt = _parse_iso(ride.get("scheduled_at"))
    if not sdt:
        return False
    return datetime.now(timezone.utc) < sdt - timedelta(minutes=activation_min)


def _ride_ref(ride_id: str) -> str:
    """N° de réservation lisible affiché au client/chauffeur (sans le préfixe 'ride_')."""
    return (str(ride_id).split("_")[-1][:8]).upper()


async def _driver_schedule_conflict(driver_id: str, new_ride: dict):
    """Renvoie un message FR si accepter `new_ride` chevauche un engagement déjà
    pris par ce chauffeur, sinon None. Préserve le pré-booking Phase 4 (instantané
    qui en pré-réserve un autre) : seuls les chevauchements avec une réservation
    PROGRAMMÉE sont bloqués."""
    now = datetime.now(timezone.utc)
    new_sched = _parse_iso(new_ride.get("scheduled_at"))
    _, _, conflict_min = await _scheduling_windows()
    buffer = timedelta(minutes=conflict_min)
    others = await db.rides.find(
        {"driver_id": driver_id, "status": {"$in": ["accepted", "arriving", "in_progress"]}},
        {"_id": 0, "scheduled_at": 1, "status": 1},
    ).to_list(50)
    for o in others:
        o_sched = _parse_iso(o.get("scheduled_at"))
        if new_sched and o_sched:
            # Deux réservations programmées trop proches.
            if abs((new_sched - o_sched).total_seconds()) < buffer.total_seconds():
                return ("Vous avez déjà une réservation à moins de "
                        f"{conflict_min} min de cet horaire.")
        elif new_sched and not o_sched:
            # Nouvelle réservation imminente alors qu'une course instantanée tourne.
            if new_sched <= now + buffer:
                return ("Vous avez une course en cours qui chevauche cette "
                        "réservation imminente.")
        elif (not new_sched) and o_sched:
            # Nouvelle course instantanée alors qu'une réservation programmée est imminente.
            if o_sched <= now + buffer:
                return ("Vous avez une réservation programmée imminente : "
                        "impossible de prendre une nouvelle course maintenant.")
    return None




def _client_phone_revealed(ride: dict) -> bool:
    """Anti-disintermediation gate: decide whether the driver may see the
    client's real phone number. Prevents 'accept early → harvest number →
    release → do the ride off-platform (au black)' on scheduled bookings."""
    status = ride.get("status")
    if status in ("in_progress", "completed"):
        return True
    if status != "accepted":
        return False  # pending / offered / cancelled → never reveal
    # Accepted: instant rides need the number now; scheduled rides only near pickup.
    sched = ride.get("scheduled_at")
    if not sched:
        return True
    try:
        sdt = datetime.fromisoformat(str(sched).replace("Z", "+00:00"))
        return datetime.now(timezone.utc) >= sdt - timedelta(minutes=CONTACT_REVEAL_MINUTES)
    except Exception:
        return True


async def enrich_passenger_info(ride: dict) -> dict:
    """Attach passenger display info (name, rating, phone, avatar) so the driver
    app can render the V3Cube request/ride cards. Safe no-op if ride is empty.

    The real phone number is masked until contact is legitimately needed
    (see _client_phone_revealed) to fight off-platform poaching."""
    if not ride or not ride.get("user_id"):
        return ride
    u = await db.users.find_one(
        {"id": ride["user_id"]},
        {"_id": 0, "name": 1, "phone": 1, "avatar": 1, "passenger_rating": 1},
    )
    ride["passenger_id"] = ride["user_id"]
    ride["passenger_name"] = ride.get("book_for_name") or (u or {}).get("name") or "Passager"
    real_phone = ride.get("book_for_phone") or (u or {}).get("phone")
    if _client_phone_revealed(ride):
        ride["passenger_phone"] = real_phone
        ride["passenger_phone_hidden"] = False
    else:
        ride["passenger_phone"] = None
        ride["passenger_phone_hidden"] = True
        sched = ride.get("scheduled_at")
        if sched:
            try:
                sdt = datetime.fromisoformat(str(sched).replace("Z", "+00:00"))
                ride["passenger_phone_reveal_at"] = (sdt - timedelta(minutes=CONTACT_REVEAL_MINUTES)).isoformat()
            except Exception:
                pass
    ride["passenger_avatar"] = (u or {}).get("avatar")
    ride["passenger_rating"] = round(float((u or {}).get("passenger_rating", 5.0) or 5.0), 1)
    return ride

# ── Driver sub-category gating (Particulier / VTC / Taxi licence) ──────────
# Each car "gamme" (vehicle_type) declares allowed_taxi_subs. A gamme is
# "restricted" when it lists a strict subset of the 3 subs (e.g. ["vtc"]).
# Open gammes (all 3 subs, empty, or missing) impose no restriction.
ALL_TAXI_SUBS = {"particulier", "vtc", "taxi"}
TAXI_SUB_LABELS = {"particulier": "Particulier", "vtc": "VTC", "taxi": "Taxi (licence)"}


def gamme_restricted_subs(vtype_doc):
    """Return the set of allowed taxi_subs if the gamme is restricted, else None (open)."""
    subs = (vtype_doc or {}).get("allowed_taxi_subs")
    if not subs:
        return None
    s = {str(x).strip().lower() for x in subs if x}
    if not s or s >= ALL_TAXI_SUBS:
        return None
    return s


def driver_sub_allowed(driver_sub, allowed_subs):
    """True if a driver with taxi_sub can serve a gamme restricted to allowed_subs."""
    if allowed_subs is None:
        return True
    return (driver_sub or "").strip().lower() in allowed_subs


async def restricted_gammes_map():
    """Map {gamme_slug: set(allowed_subs)} for restricted car gammes only."""
    m = {}
    async for vt in db.vehicle_types.find({}, {"_id": 0, "slug": 1, "allowed_taxi_subs": 1}):
        r = gamme_restricted_subs(vt)
        if r is not None:
            m[vt["slug"]] = r
    return m


@router.post("/estimate")
async def estimate_ride(data: RideRequest):
    distance = None
    duration = None
    route_polyline = None

    # Build ordered route points: pickup -> stops[] -> dropoff
    stop_points = []
    for s in (data.stops or []):
        lat = s.get("lat") if isinstance(s, dict) else None
        lng = s.get("lng") if isinstance(s, dict) else None
        if lat and lng:
            stop_points.append((lat, lng))

    # Try Google Maps Directions API for real distance/time (with waypoints)
    gmaps_key = os.environ.get("GOOGLE_MAPS_KEY")
    if gmaps_key and data.pickup_lat and data.dropoff_lat:
        try:
            url = "https://maps.googleapis.com/maps/api/directions/json"
            params = {
                "origin": f"{data.pickup_lat},{data.pickup_lng}",
                "destination": f"{data.dropoff_lat},{data.dropoff_lng}",
                "key": gmaps_key,
                "language": "fr",
                "units": "metric",
            }
            if stop_points:
                params["waypoints"] = "|".join(f"{lat},{lng}" for lat, lng in stop_points)
            resp = requests.get(url, params=params, timeout=5)
            gdata = resp.json()
            if gdata.get("status") == "OK" and gdata.get("routes"):
                legs = gdata["routes"][0]["legs"]
                distance = sum(leg["distance"]["value"] for leg in legs) / 1000  # meters to km
                duration = int(sum(leg["duration"]["value"] for leg in legs) / 60)  # seconds to min
                route_polyline = gdata["routes"][0].get("overview_polyline", {}).get("points")
        except Exception:
            pass  # Fallback to haversine

    # Fallback to haversine calculation (sum legs through stops)
    if distance is None:
        route = [(data.pickup_lat, data.pickup_lng)] + stop_points + [(data.dropoff_lat, data.dropoff_lng)]
        distance = sum(
            calculate_distance(route[i][0], route[i][1], route[i + 1][0], route[i + 1][1])
            for i in range(len(route) - 1)
        )
    if duration is None:
        duration = int(distance * 3)

    vtype_doc = await db.vehicle_types.find_one({"slug": data.vehicle_type, "status": "active"}, {"_id": 0})
    from core.geo_scope import apply_vehicle_zone_pricing
    vtype_doc, zone_tariff = apply_vehicle_zone_pricing(vtype_doc, getattr(data, "pickup_address", "") or "")
    fare = calculate_fare(distance, data.vehicle_type, duration, vtype_doc)

    # Dynamic pricing (AI Surge + Weather Surcharge)
    from routes.pricing import compute_pricing_adjustment
    adj = await compute_pricing_adjustment(fare, data.pickup_lat, data.pickup_lng, data.vehicle_type)
    fare = adj["fare"]

    # ── Taxi Pool — V3Cube shared-ride pricing (only when Pool is selected) ──
    pool_enabled = bool(getattr(data, "pool_enabled", False))
    pool_original_fare = None
    pool_reason = []
    pool_seats = 1
    pool_cfg = None
    pool_discount_pct = None
    pool_savings = None
    if pool_enabled:
        pool_cfg = await get_pool_config(vtype_doc)
        # Per-booking cap (shared ride): a passenger can reserve at most N seats,
        # bounded by the vehicle's pool capacity.
        booking_cap = max(1, min(pool_cfg.get("max_seats_per_booking", POOL_DEFAULT_MAX_SEATS_PER_BOOKING), pool_cfg["available_seats"]))
        pool_seats = max(1, min(int(getattr(data, "seats_required", 1) or 1), booking_cap))
        pool_original_fare = round(fare, 2)  # standard PRIVATE fare (reference for savings)
        pool_discount_pct = pool_cfg.get("discount_percent", POOL_DEFAULT_DISCOUNT_PERCENT)
        # 1st seat = discounted (sharing rebate); extra seats billed via pool_percentage.
        pool_base = fare * (1 - pool_discount_pct / 100.0)
        fare = round(pool_base * pool_seat_multiplier(pool_seats, pool_cfg["pool_percentage"]), 2)
        pool_savings = round(max(pool_original_fare - fare, 0), 2)
        pool_reason = [f"Pool partagé · -{pool_discount_pct:.0f}% · {pool_seats} place(s)"]

    # ── Intercity (longue distance) — optional round-trip (aller-retour) ──
    is_intercity = (getattr(data, "ride_type", "") == "intercity")
    round_trip = bool(getattr(data, "round_trip", False))
    intercity_reason = []
    if is_intercity and round_trip and not pool_enabled:
        fare = round(fare * INTERCITY_ROUNDTRIP_FACTOR, 2)
        intercity_reason = ["Aller-retour"]

    result = {
        "distance_km": round(distance, 2),
        "duration_mins": duration,
        "estimated_fare": fare,
        "vehicle_type": data.vehicle_type,
        "currency": "EUR",
        "source": "google_maps" if route_polyline else "haversine",
        "surge_multiplier": adj["surge_multiplier"],
        "weather_multiplier": adj["weather_multiplier"],
        "weather_condition": adj["weather_condition"],
        "pricing_reasons": adj["reasons"] + pool_reason + intercity_reason,
        "pool_enabled": pool_enabled,
        "seats_required": pool_seats,
        "available_seats": pool_cfg["available_seats"] if pool_cfg else None,
        "max_seats_per_booking": pool_cfg.get("max_seats_per_booking") if pool_cfg else None,
        "pool_percentage": pool_cfg["pool_percentage"] if pool_cfg else None,
        "pool_discount_percent": pool_discount_pct,
        "pool_savings": pool_savings,
        "original_fare": pool_original_fare,
        "is_intercity": is_intercity,
        "round_trip": round_trip and is_intercity,
    }
    if route_polyline:
        result["route_polyline"] = route_polyline
    if zone_tariff:
        result["zone_tariff"] = zone_tariff
        result["pricing_reasons"] = [f"Tarif local : {zone_tariff}"] + result["pricing_reasons"]
    if vtype_doc:
        result["fare_type"] = vtype_doc.get("fare_type", "Regular")
        result["base_fare"] = vtype_doc.get("base_fare", 0)
        result["price_per_km"] = vtype_doc.get("price_per_km", 0)
        result["commission_percent"] = vtype_doc.get("commission_percent", 0)
        result["cancellation_fare"] = vtype_doc.get("cancellation_fare", 0)
    return result


@router.post("", response_model=RideResponse)
async def create_ride(data: RideRequest, request: Request):
    user = await get_current_user(request)

    # Phase 3 — block bookings while the passenger is under a temporary ban.
    from routes.moderation import check_passenger_ban
    await check_passenger_ban(user["id"])

    # Block new bookings while an old unpaid debt is unsettled (admin policy).
    from routes.debts import check_debt_block
    await check_debt_block(user["id"])

    # ── Service availability (admin can disable a Taxi mode / set a schedule without redeploy) ──
    mode_id = getattr(data, "mode_id", None)
    if mode_id:
        cat = await db.service_categories.find_one({"key": mode_id}, {"_id": 0})
        if cat:
            from routes.service_categories import is_category_available_now
            if not is_category_available_now(cat):
                raise HTTPException(status_code=400, detail=f"Le service « {cat.get('name', mode_id)} » est actuellement indisponible.")

    # ── Scheduling restrictions (Programmer une course) ──────────────────
    if getattr(data, "scheduled_at", None):
        from routes.config import get_scheduling_config
        sched_cfg = await get_scheduling_config()
        ride_type = getattr(data, "ride_type", "instant")
        is_pool = bool(getattr(data, "pool_enabled", False))
        is_bidding = ride_type == "bidding"
        disabled = sched_cfg.get("disabled_modes", [])
        mode_key = "pool" if is_pool else ("bidding" if is_bidding else ride_type)
        if not sched_cfg.get("enabled", True):
            raise HTTPException(status_code=400, detail="La planification des courses est actuellement désactivée.")
        if is_pool and "pool" in disabled:
            raise HTTPException(status_code=400, detail="La planification n'est pas disponible pour les courses Pool.")
        if mode_key in disabled:
            raise HTTPException(status_code=400, detail="La planification n'est pas disponible pour ce mode de réservation.")
        # Validate min advance & max horizon
        try:
            sched_dt = datetime.fromisoformat(str(data.scheduled_at).replace("Z", "+00:00"))
            if sched_dt.tzinfo is None:
                sched_dt = sched_dt.replace(tzinfo=timezone.utc)
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail="Date de planification invalide.")
        now = datetime.now(timezone.utc)
        min_adv = sched_cfg.get("min_advance_minutes", 60)
        if sched_dt < now + timedelta(minutes=min_adv):
            raise HTTPException(status_code=400, detail=f"La course doit être planifiée au moins {min_adv} minutes à l'avance.")
        max_days = sched_cfg.get("max_advance_days", 30)
        if sched_dt > now + timedelta(days=max_days):
            raise HTTPException(status_code=400, detail=f"La course ne peut pas être planifiée au-delà de {max_days} jours.")

        # Anti double-réservation : pas deux réservations à moins de X min d'écart (admin-configurable).
        anti_double = int(sched_cfg.get("anti_double_booking_min", SCHEDULED_DOUBLE_BOOK_MIN))
        win_lo = (sched_dt - timedelta(minutes=anti_double)).isoformat()
        win_hi = (sched_dt + timedelta(minutes=anti_double)).isoformat()
        clash = await db.rides.find_one({
            "user_id": user["id"],
            "status": {"$in": ["pending", "accepted", "arriving", "in_progress"]},
            "scheduled_at": {"$ne": None, "$gte": win_lo, "$lte": win_hi},
        }, {"_id": 0, "scheduled_at": 1})
        if clash:
            raise HTTPException(
                status_code=409,
                detail=f"Vous avez déjà une réservation à moins de {anti_double} min de ce créneau. "
                       "Annulez-la ou choisissez un autre horaire.",
            )

    # ── Instant rides need a driver online; otherwise prompt to schedule ──
    # S'applique aux courses standard ET aux enchères (« proposez votre tarif ») :
    # sans aucun chauffeur connecté, on ne peut ni commander ni négocier en direct —
    # la seule option proposée au client est de PLANIFIER son trajet.
    if not getattr(data, "scheduled_at", None):
        online_count = await db.drivers.count_documents({"status": "approved", "is_online": True})
        if online_count == 0:
            raise HTTPException(status_code=409, detail={
                "code": "no_drivers_available",
                "message": "Aucun chauffeur n'est disponible pour le moment. Vous pouvez planifier votre course.",
                "can_schedule": True,
            })

    # Distance through optional intermediate stops: pickup -> stops[] -> dropoff
    stop_points = [(s.get("lat"), s.get("lng")) for s in (data.stops or []) if isinstance(s, dict) and s.get("lat") and s.get("lng")]
    route = [(data.pickup_lat, data.pickup_lng)] + stop_points + [(data.dropoff_lat, data.dropoff_lng)]
    distance = sum(
        calculate_distance(route[i][0], route[i][1], route[i + 1][0], route[i + 1][1])
        for i in range(len(route) - 1)
    )
    duration = int(distance * 3)
    vtype_doc = await db.vehicle_types.find_one({"slug": data.vehicle_type, "status": "active"}, {"_id": 0})
    from core.geo_scope import apply_vehicle_zone_pricing
    vtype_doc, _zone_tariff = apply_vehicle_zone_pricing(vtype_doc, getattr(data, "pickup_address", "") or "")
    fare = calculate_fare(distance, data.vehicle_type, duration, vtype_doc)
    otp = str(secrets.randbelow(10000)).zfill(4)

    # Best-effort real route polyline (Google Directions with waypoints) for maps
    route_polyline = None
    gmaps_key = os.environ.get("GOOGLE_MAPS_KEY")
    if gmaps_key and data.pickup_lat and data.dropoff_lat:
        try:
            params = {
                "origin": f"{data.pickup_lat},{data.pickup_lng}",
                "destination": f"{data.dropoff_lat},{data.dropoff_lng}",
                "key": gmaps_key, "language": "fr", "units": "metric",
            }
            if stop_points:
                params["waypoints"] = "|".join(f"{lat},{lng}" for lat, lng in stop_points)
            gresp = requests.get("https://maps.googleapis.com/maps/api/directions/json", params=params, timeout=5)
            gjson = gresp.json()
            if gjson.get("status") == "OK" and gjson.get("routes"):
                route_polyline = gjson["routes"][0].get("overview_polyline", {}).get("points")
                legs = gjson["routes"][0]["legs"]
                distance = sum(leg["distance"]["value"] for leg in legs) / 1000
                duration = int(sum(leg["duration"]["value"] for leg in legs) / 60)
                fare = calculate_fare(distance, data.vehicle_type, duration, vtype_doc)
        except Exception:
            pass

    # Dynamic pricing (AI Surge + Weather Surcharge) — applied before corporate discount
    from routes.pricing import compute_pricing_adjustment
    pricing_adj = await compute_pricing_adjustment(fare, data.pickup_lat, data.pickup_lng, data.vehicle_type)
    fare = pricing_adj["fare"]

    # ── Taxi Pool — V3Cube shared-ride pricing (only when Pool section is used) ──
    pool_enabled = bool(getattr(data, "pool_enabled", False))
    pool_original_fare = None
    pool_seats = 1
    pool_capacity = 1
    pool_discount_pct = None
    if pool_enabled:
        # ── Enforce the admin's GLOBAL Pool policy (V3Cube « Configuration Pool ») ──
        pool_global = await get_pool_global_config()
        if not pool_global.get("enabled", True):
            raise HTTPException(status_code=400, detail="Le service Pool (taxi partagé) est actuellement indisponible.")
        elig = pool_global.get("eligible_vehicle_slugs") or []
        if elig and (data.vehicle_type or "").strip().lower() not in elig:
            raise HTTPException(status_code=400, detail="Ce véhicule n'est pas éligible aux courses Pool.")
        allowed_pms = pool_global.get("payment_methods") or POOL_ALL_PAYMENTS
        if (data.payment_method or "").strip().lower() not in allowed_pms:
            raise HTTPException(status_code=400, detail="Ce moyen de paiement n'est pas autorisé pour les courses Pool.")
        max_stops = pool_global.get("max_stops", POOL_DEFAULT_MAX_STOPS)
        if len(stop_points) > max_stops:
            raise HTTPException(status_code=400, detail=f"Une course Pool accepte au maximum {max_stops} arrêt(s).")
        pool_cfg = await get_pool_config(vtype_doc)
        pool_capacity = max(1, pool_cfg["available_seats"])  # total shared-vehicle capacity (for "remaining seats")
        booking_cap = max(1, min(pool_cfg.get("max_seats_per_booking", POOL_DEFAULT_MAX_SEATS_PER_BOOKING), pool_capacity))
        pool_seats = max(1, min(int(getattr(data, "seats_required", 1) or 1), booking_cap))
        pool_original_fare = round(fare, 2)
        pool_discount_pct = pool_cfg.get("discount_percent", POOL_DEFAULT_DISCOUNT_PERCENT)
        pool_base = fare * (1 - pool_discount_pct / 100.0)
        fare = round(pool_base * pool_seat_multiplier(pool_seats, pool_cfg["pool_percentage"]), 2)

    # ── Intercity (longue distance) — optional round-trip (aller-retour) ──
    is_intercity = (getattr(data, "ride_type", "") == "intercity")
    intercity_round_trip = bool(getattr(data, "round_trip", False)) and is_intercity
    if intercity_round_trip and not pool_enabled:
        fare = round(fare * INTERCITY_ROUNDTRIP_FACTOR, 2)

    # ── Intercity — validations serveur (délai mini, fenêtre aller-retour) ──
    if is_intercity:
        from routes.config import get_app_settings_config
        _appset_ic = await get_app_settings_config()
        now_ic = datetime.now(timezone.utc)

        def _parse_ic(s):
            try:
                d = datetime.fromisoformat(str(s).replace("Z", "+00:00"))
                return d if d.tzinfo else d.replace(tzinfo=timezone.utc)
            except (TypeError, ValueError):
                return None

        sched_raw = getattr(data, "scheduled_at", None)
        if sched_raw:
            sdt = _parse_ic(sched_raw)
            min_h = float(_appset_ic.get("min_hours_later_booking_intercity", 2) or 0)
            if sdt and min_h > 0 and sdt < now_ic + timedelta(hours=min_h):
                raise HTTPException(status_code=400, detail=f"Une course Intercité doit être réservée au moins {int(min_h)} h à l'avance.")
            max_days_ic = int(_appset_ic.get("max_pickup_days_intercity", 90) or 90)
            if sdt and sdt > now_ic + timedelta(days=max_days_ic):
                raise HTTPException(status_code=400, detail=f"Une course Intercité ne peut pas être planifiée au-delà de {max_days_ic} jours.")
        if intercity_round_trip:
            ret = _parse_ic(getattr(data, "return_at", None))
            dep = _parse_ic(sched_raw) or now_ic
            if ret:
                if ret <= dep:
                    raise HTTPException(status_code=400, detail="La date de retour doit être après le départ.")
                max_rt = int(_appset_ic.get("max_round_trip_days_intercity", 5) or 5)
                if ret > dep + timedelta(days=max_rt):
                    raise HTTPException(status_code=400, detail=f"Le retour d'un aller-retour Intercité doit avoir lieu sous {max_rt} jours.")

    # ── Airport Transfer (P2) — resolve airport, luggage help & shared shuttle ──
    airport_meta_doc = None
    airport_luggage_fee = 0.0
    airport_shuttle_discount = 0.0
    is_airport = (getattr(data, "ride_type", "") == "airport") or (mode_id == "airport")
    if is_airport:
        from core.airport import match_airport, get_airport, airport_meta as _amh, apply_airport_options, simulate_flight_status
        a_doc = None
        if getattr(data, "airport_id", None):
            a_doc = await get_airport(data.airport_id)
        if not a_doc:
            a_doc = await match_airport(data.pickup_lat, data.pickup_lng, data.dropoff_lat, data.dropoff_lng)
        airport_meta_doc = _amh(a_doc)
        fare, airport_luggage_fee, airport_shuttle_discount = apply_airport_options(
            fare, bool(getattr(data, "luggage_assist", False)), bool(getattr(data, "shared_shuttle", False)), airport_meta_doc,
        )

    # ── Mise à disposition (rental, P2) — package price + live-billing config ──
    rental_meta = None
    is_rental = (getattr(data, "ride_type", "") == "rental") or (mode_id in ("rental", "moto_rental"))
    if is_rental:
        from routes.taxi_configs import get_taxi_config
        slug = getattr(data, "rental_package", None)
        veh = getattr(data, "vehicle_type", None)
        # 1) Per-vehicle package (db.rental_packages, managed in AdminRentalPackages) — preferred.
        pkg = None
        if slug:
            pkg = await db.rental_packages.find_one(
                {"id": slug, "status": "active"}, {"_id": 0})
        if pkg is None and veh:
            # fallback: first active package for this vehicle type
            pkg = await db.rental_packages.find_one(
                {"vehicle_type": veh, "status": "active"}, {"_id": 0}, sort=[("hours", 1)])
        # 2) Legacy flat config (taxi_configs.rental_packages) keyed by slug.
        if pkg is None:
            cfg = await get_taxi_config("rental_packages")
            flat = (cfg or {}).get("packages", [])
            pkg = next((p for p in flat if p.get("slug") == slug), None) or {}
        hours_inc = float(pkg.get("hours") or getattr(data, "rental_hours", None) or 2)
        rental_meta = {
            "rental_hours_included": hours_inc,
            "rental_km_included": float(pkg.get("km") or hours_inc * 10),
            "rental_extra_hour_rate": float(pkg.get("extra_hour_rate", 18) or 0),
            "rental_extra_km_rate": float(pkg.get("extra_km_rate", 0.8) or 0),
            "rental_package_price": float(pkg.get("price") or fare or hours_inc * 18),
        }
        # Rental fare = fixed package price (distance-based estimate doesn't apply).
        fare = rental_meta["rental_package_price"]

    # ===== Pack C — Corporate booking validation + discount =====
    corporate_id = None
    corporate_discount_pct = 0.0
    corporate_name = None
    if getattr(data, "corporate_account_id", None):
        from routes.corporate import resolve_corporate_for_booking
        corp = await resolve_corporate_for_booking(user["id"], data.corporate_account_id)
        if not corp:
            raise HTTPException(status_code=403, detail="Code entreprise invalide ou vous n'êtes pas membre actif")
        corporate_id = corp["id"]
        corporate_discount_pct = float(corp.get("discount_pct", 0))
        corporate_name = corp.get("name")
        if corporate_discount_pct > 0:
            fare = round(fare * (1 - corporate_discount_pct / 100), 2)

    # ===== AI Based Auto Promotions — discount auto-appliqué au tarif rider =====
    # Resolve the request zone from the pickup so geo-scoped promos/vouchers only
    # apply where the admin targeted them (e.g. a promo visible only in Martinique).
    from core.geo_scope import resolve_zone_from_text
    ride_zone = resolve_zone_from_text(data.pickup_address or "")
    from routes.auto_promotions import evaluate_best_auto_promo
    auto_promo = await evaluate_best_auto_promo(user["id"], fare, service_type="ride", zone=ride_zone)
    auto_promo_id = auto_promo["id"] if auto_promo else None
    auto_promo_title = auto_promo["title"] if auto_promo else None
    auto_promo_discount = auto_promo["discount_amount"] if auto_promo else 0.0
    if auto_promo_discount > 0:
        fare = round(max(fare - auto_promo_discount, 0), 2)

    # ===== Voucher (code saisi par le rider) — appliqué après la promo auto =====
    # ── Canonical ride mode (so each order type keeps its own identity) ──
    # bidding  → passenger proposes a fare, drivers may counter-offer.
    # pool     → shared ride with seat restrictions.
    # scheduled→ future pickup (kept in the driver agenda, not an instant pop-up).
    # otherwise→ the TaxiHub mode_id (standard/airport/pets/…) or "instant".
    incoming_ride_type = getattr(data, "ride_type", "instant") or "instant"
    is_bidding = incoming_ride_type == "bidding" or (mode_id == "bidding")
    if is_bidding:
        ride_mode = "bidding"
    elif pool_enabled:
        ride_mode = "pool"
    elif getattr(data, "scheduled_at", None):
        ride_mode = "scheduled"
    else:
        ride_mode = mode_id or incoming_ride_type or "instant"

    voucher_code = (data.voucher_code or "").strip().upper() if data.voucher_code else None
    voucher_id = None
    voucher_discount = 0.0
    if voucher_code:
        from routes.vouchers import validate_voucher
        v_doc, v_disc, v_err = await validate_voucher(voucher_code, user["id"], fare, zone=ride_zone)
        if v_err:
            raise HTTPException(status_code=400, detail=v_err)
        voucher_id = v_doc["id"]
        voucher_discount = v_disc
        fare = round(max(fare - voucher_discount, 0), 2)

    # ===== Phase 5 — Loyalty tier discount (client) =====
    loyalty_discount_pct = 0.0
    loyalty_discount_amount = 0.0
    loyalty_tier_name = None
    try:
        from routes.loyalty import get_client_discount
        loyalty_discount_pct, loyalty_tier_name = await get_client_discount(user["id"])
        if loyalty_discount_pct > 0:
            loyalty_discount_amount = round(fare * loyalty_discount_pct / 100, 2)
            fare = round(max(fare - loyalty_discount_amount, 0), 2)
    except Exception:
        loyalty_discount_pct, loyalty_discount_amount, loyalty_tier_name = 0.0, 0.0, None

    # ===== SB Student — automatic student discount (cap-aware, verified students only) =====
    student_discount_amount = 0.0
    student_discount_pct = 0.0
    student_discount_kind = None
    try:
        from routes.student import compute_student_discount
        student_kind = "advance" if getattr(data, "scheduled_at", None) else "ride"
        # Campus trip detection (pickup OR dropoff inside a university zone) → campus rate.
        try:
            from routes.student_zones import is_campus_trip
            if await is_campus_trip(data.pickup_lat, data.pickup_lng, data.dropoff_lat, data.dropoff_lng):
                student_kind = "campus"
        except Exception:
            pass
        sres = await compute_student_discount(user["id"], fare, student_kind)
        if sres.get("amount", 0) > 0:
            student_discount_amount = sres["amount"]
            student_discount_pct = sres.get("pct", 0.0)
            student_discount_kind = sres.get("kind")
            fare = round(max(fare - student_discount_amount, 0), 2)
    except Exception:
        student_discount_amount, student_discount_pct, student_discount_kind = 0.0, 0.0, None

    ride = {
        "id": f"ride_{uuid.uuid4().hex[:12]}",
        "booking_no": str(secrets.randbelow(90000000) + 10000000),
        "user_id": user["id"],
        "driver_id": None,
        "pickup_lat": data.pickup_lat, "pickup_lng": data.pickup_lng, "pickup_address": data.pickup_address,
        "dropoff_lat": data.dropoff_lat, "dropoff_lng": data.dropoff_lng, "dropoff_address": data.dropoff_address,
        "vehicle_type": data.vehicle_type,
        "status": "pending",
        "estimated_fare": fare,
        "final_fare": None,
        "distance_km": round(distance, 2),
        "duration_mins": duration,
        "payment_method": data.payment_method,
        "payment_status": "pending",
        "otp": otp,
        "start_otp": otp,
        "fare_type": vtype_doc.get("fare_type", "Regular") if vtype_doc else "Regular",
        "base_fare": vtype_doc.get("base_fare", 0) if vtype_doc else 0,
        "price_per_km": vtype_doc.get("price_per_km", 0) if vtype_doc else 0,
        "commission_percent": vtype_doc.get("commission_percent", 0) if vtype_doc else 0,
        "currency": "EUR",
        "scheduled_at": data.scheduled_at,
        "coupon_code": data.coupon_code,
        "discount": 0.0,
        "loyalty_discount_pct": loyalty_discount_pct,
        "loyalty_discount_amount": loyalty_discount_amount,
        "loyalty_tier_name": loyalty_tier_name,
        "student_discount_pct": student_discount_pct,
        "student_discount_amount": student_discount_amount,
        "student_discount_kind": student_discount_kind,
        "safe_ride_night": bool(getattr(data, "safe_ride_night", False)),
        "book_for_name": data.book_for_name,
        "book_for_phone": data.book_for_phone,
        "auto_assign": getattr(data, 'auto_assign', True),
        "female_driver_request": getattr(data, 'female_driver_request', False),
        "handicap_accessibility": getattr(data, 'handicap_accessibility', False),
        "notes": getattr(data, 'notes', None),
        "proposed_fare": float(data.proposed_fare) if data.proposed_fare else fare,
        "counter_offers": [],  # list of {driver_id, driver_name, amount, created_at, status}
        # Pack A — Taxi Avance V3Cube
        "ride_type": incoming_ride_type,
        "mode": ride_mode,
        "is_bidding": is_bidding,
        "flight_number": getattr(data, 'flight_number', None),
        # Airport Transfer (P2)
        "airport_id": airport_meta_doc["airport_id"] if airport_meta_doc else None,
        "airport_name": airport_meta_doc["airport_name"] if airport_meta_doc else None,
        "airport_terminal": getattr(data, 'airport_terminal', None) if is_airport else None,
        "flight_arrival_time": getattr(data, 'flight_arrival_time', None) if is_airport else None,
        "meeting_point": airport_meta_doc["meeting_point"] if airport_meta_doc else None,
        "free_wait_minutes": airport_meta_doc["free_wait_minutes"] if airport_meta_doc else None,
        "waiting_rate_per_min": airport_meta_doc["waiting_rate_per_min"] if airport_meta_doc else None,
        "luggage_assist": bool(getattr(data, 'luggage_assist', False)) if is_airport else False,
        "luggage_count": getattr(data, 'luggage_count', None) if is_airport else None,
        "luggage_fee": airport_luggage_fee,
        "shared_shuttle": bool(getattr(data, 'shared_shuttle', False)) if is_airport else False,
        "shuttle_discount": airport_shuttle_discount,
        "flight_status": None,
        "rental_hours": getattr(data, 'rental_hours', None),
        "rental_package": getattr(data, 'rental_package', None),
        "rental_hours_included": rental_meta["rental_hours_included"] if rental_meta else None,
        "rental_km_included": rental_meta["rental_km_included"] if rental_meta else None,
        "rental_extra_hour_rate": rental_meta["rental_extra_hour_rate"] if rental_meta else None,
        "rental_extra_km_rate": rental_meta["rental_extra_km_rate"] if rental_meta else None,
        "rental_package_price": rental_meta["rental_package_price"] if rental_meta else None,
        "rental_started_at": None,
        "rental_ended_at": None,
        "rental_actual_km": None,
        "rental_overage_fee": 0.0,
        "corporate_account_id": corporate_id,
        "corporate_name": corporate_name,
        "corporate_discount_pct": corporate_discount_pct,
        "auto_promo_id": auto_promo_id,
        "auto_promo_title": auto_promo_title,
        "auto_promo_discount": auto_promo_discount,
        "voucher_code": voucher_code,
        "voucher_discount": voucher_discount,
        "buddy_hours": getattr(data, 'buddy_hours', None),
        "pets_count": getattr(data, 'pets_count', None),
        "pets_size": getattr(data, 'pets_size', None),
        "assist_needs": getattr(data, 'assist_needs', None),
        "pool_enabled": getattr(data, 'pool_enabled', False),
        "seats_required": pool_seats,
        "pool_capacity": pool_capacity,
        "pool_seats_taken": pool_seats if pool_enabled else 0,
        "pool_riders": [],
        "original_fare": pool_original_fare,
        "pool_discount_percent": pool_discount_pct,
        "round_trip": intercity_round_trip,
        "return_at": getattr(data, 'return_at', None) if intercity_round_trip else None,
        "stops": getattr(data, 'stops', None),
        "ride_profile": getattr(data, 'ride_profile', None),
        "ride_profile_org_type": getattr(data, 'ride_profile_org_type', None),
        "business_trip_reason": getattr(data, 'business_trip_reason', None),
        "route_polyline": route_polyline,
        "surge_multiplier": pricing_adj["surge_multiplier"],
        "weather_multiplier": pricing_adj["weather_multiplier"],
        "weather_condition": pricing_adj["weather_condition"],
        "cancel_reason": None,
        "cancelled_by": None,
        "driver_name": None,
        "driver_phone": None,
        "driver_rating": None,
        "driver_vehicle_model": None,
        "driver_vehicle_number": None,
        "accepted_at": None,
        "arrived_at": None,
        "started_at": None,
        "completed_at": None,
        "cancelled_at": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    # ── Carry forward any unpaid cancellation debt onto this ride ──
    # (booking is no longer blocked; the penalty is settled when this ride
    #  completes — cash → debited from the new driver to reimburse the previous
    #  driver; wallet/card → charged with the ride.)
    from routes.debts import carry_unpaid_debts_to_ride
    carried = await carry_unpaid_debts_to_ride(user["id"], ride["id"])
    ride["carried_debt"] = carried if carried.get("amount", 0) > 0 else None

    # ── Intercity — caution/séquestre SB Pay à la réservation (sécurise le trajet) ──
    # Un acompte (% du tarif) est débité du portefeuille et conservé par la plateforme.
    # Il est imputé au paiement à la complétion (réduit le reste dû) ou remboursé à
    # l'annulation avant prise en charge. Garantit l'engagement du passager (no-show).
    ride["intercity_deposit"] = 0.0
    ride["deposit_status"] = None
    if is_intercity:
        from routes.config import get_app_settings_config as _gas
        _appset_dep = await _gas()
        _dep_pct = float(_appset_dep.get("intercity_deposit_percent", 30) or 0)
        _pm_l = (data.payment_method or "").strip().lower()
        if _appset_dep.get("intercity_deposit_enabled", True) and _dep_pct > 0 and _pm_l in ("wallet", "sbpay", "sbpaygo", "card"):
            deposit = round(fare * _dep_pct / 100.0, 2)
            if deposit > 0:
                _res = await db.wallets.update_one(
                    {"user_id": user["id"], "balance": {"$gte": deposit}},
                    {"$inc": {"balance": -deposit}})
                if not _res.modified_count:
                    _w = await db.wallets.find_one({"user_id": user["id"]}, {"_id": 0, "balance": 1})
                    _bal = round(float((_w or {}).get("balance", 0) or 0), 2)
                    raise HTTPException(status_code=400, detail=f"Caution Intercité requise : {deposit:.2f} € (solde SB Pay {_bal:.2f} €). Rechargez votre portefeuille pour réserver.")
                _w = await db.wallets.find_one({"user_id": user["id"]}, {"_id": 0, "balance": 1})
                await db.wallet_transactions.insert_one({
                    "id": f"tx_{uuid.uuid4().hex[:12]}", "user_id": user["id"], "type": "Deposit",
                    "amount": -deposit, "balance_after": round((_w or {}).get("balance", 0), 2),
                    "description": "Caution Intercité (séquestre)", "ride_id": ride["id"],
                    "status": "completed", "created_at": ride["created_at"]})
                ride["intercity_deposit"] = deposit
                ride["deposit_status"] = "held"

    await db.rides.insert_one(ride)

    # ── Scheduled booking → confirmation (notif + email). No phone disclosed. ──
    if ride.get("scheduled_at"):
        try:
            from core.notifications import create_notification
            from core.email import send_booking_confirmation
            ref = _ride_ref(ride["id"])
            try:
                _sd = datetime.fromisoformat(str(ride["scheduled_at"]).replace("Z", "+00:00"))
                when = _sd.strftime("%d/%m/%Y à %H:%M")
            except (ValueError, TypeError):
                when = str(ride.get("scheduled_at"))
            await create_notification(
                user["id"], "ride", "Réservation confirmée ✅",
                f"Votre réservation #{ref} pour le {when} est confirmée. "
                f"Vous serez notifié dès qu'un chauffeur accepte.",
                data={"ride_id": ride["id"], "kind": "booking_confirmed", "url": f"/ride/{ride['id']}"})
            if user.get("email"):
                await send_booking_confirmation(
                    user["email"], ref=ref, when=when,
                    pickup=ride.get("pickup_address") or "—",
                    dropoff=ride.get("dropoff_address") or "—")
        except Exception:
            pass

    # Record the granted SB Student discount for daily/monthly cap tracking.
    if student_discount_amount > 0:
        try:
            from routes.student import record_student_discount_usage
            await record_student_discount_usage(user["id"], student_discount_amount, student_discount_kind or "ride", ride["id"])
        except Exception:
            pass

    # ── Airport Transfer: seed flight status + alert admins (P2) ──
    if is_airport:
        try:
            from core.airport import simulate_flight_status, refresh_flight_for_ride, notify_admins
            if ride.get("flight_number"):
                # Seed instantly with the simulated status so booking is never blocked
                # by a slow external call; the real AviationStack status is fetched in
                # the background and replaces it (notifying on change).
                fs = simulate_flight_status(ride["flight_number"], ride.get("scheduled_at"))
                if fs:
                    if fs.get("adjusted_pickup"):
                        ride["scheduled_at"] = fs["adjusted_pickup"]
                    ride["flight_status"] = fs
                    await db.rides.update_one({"id": ride["id"]}, {"$set": {
                        "flight_status": fs, "scheduled_at": ride.get("scheduled_at")}})
                # Background: upgrade to real flight data (best-effort).
                asyncio.create_task(refresh_flight_for_ride(dict(ride)))
            await notify_admins(
                "airport_booking", "✈️ Nouvelle course Aéroport",
                f"{ride.get('airport_name') or 'Aéroport'} · Vol {ride.get('flight_number') or '—'} · {ride['pickup_address'][:40]}",
                data={"url": "/admin/airport", "ride_id": ride["id"]},
            )
        except Exception:
            import logging
            logging.getLogger("rides").warning("airport post-create hook failed", exc_info=True)
    if auto_promo_id:
        await db.auto_promotions.update_one({"id": auto_promo_id}, {"$inc": {"usage_count": 1}})

    # Record voucher redemption (per-user + global quota tracking)
    if voucher_id:
        from routes.vouchers import redeem_voucher
        await redeem_voucher(voucher_id, user["id"], ride["id"], voucher_discount)

    # Join WS ride room for the user
    manager.join_ride_room(ride["id"], user["id"])

    # Broadcast to all connected drivers — EXCEPT scheduled rides, which must
    # wait in the driver's agenda (home-feed `scheduled_pending`) instead of
    # popping up as an immediate request.
    if not ride.get("scheduled_at"):
        new_ride_payload = {
            "type": "new_ride_request",
            "ride_id": ride["id"],
            "pickup_lat": ride["pickup_lat"],
            "pickup_lng": ride["pickup_lng"],
            "pickup_address": ride["pickup_address"],
            "dropoff_address": ride["dropoff_address"],
            "vehicle_type": ride["vehicle_type"],
            "estimated_fare": fare,
            "proposed_fare": ride["proposed_fare"],
            "distance_km": ride["distance_km"],
            "duration_mins": ride["duration_mins"],
            "mode": ride_mode,
            "ride_type": incoming_ride_type,
            "is_bidding": is_bidding,
            "pool_enabled": ride["pool_enabled"],
            "seats_required": ride["seats_required"],
        }
        # Favorite head-start: if the customer has online favorite driver(s), offer
        # the ride EXCLUSIVELY to them for a short window before broadcasting to all.
        favorite_held = False
        try:
            from core.favorites import get_favorite_head_start_seconds, online_favorite_drivers
            from core.notifications import create_notification
            head = await get_favorite_head_start_seconds()
            favs = await online_favorite_drivers(user["id"]) if head > 0 else []
            if favs:
                hold_until = (datetime.now(timezone.utc) + timedelta(seconds=head)).isoformat()
                await db.rides.update_one({"id": ride["id"]}, {"$set": {
                    "favorite_hold_until": hold_until,
                    "favorite_target_driver_ids": [f["driver_id"] for f in favs],
                    "favorite_hold_released": False,
                }})
                for f in favs:
                    await manager.send_personal_message({**new_ride_payload, "favorite": True}, f["driver_user_id"])
                    try:
                        await create_notification(
                            f["driver_user_id"], "favorite_ride",
                            "⭐ Course d'un client qui vous a en favori",
                            f"{ride['pickup_address'][:40]} — réservez avant les autres chauffeurs.",
                            data={"url": "/chauffeur/home", "ride_id": ride["id"]},
                        )
                    except Exception:
                        pass
                favorite_held = True
        except Exception:
            import logging
            logging.getLogger("rides").warning("favorite head-start failed", exc_info=True)
        if not favorite_held:
            await manager.broadcast_to_drivers(new_ride_payload, exclude=((await _cash_exclude_set(ride) or set()) | await _vehicle_exclude_set(ride)) or None)

    # Also broadcast to admins watching the live-rides cockpit
    await manager.broadcast_to_admins({
        "type": "new_ride_request",
        "ride_id": ride["id"],
        "booking_no": ride["booking_no"],
        "pickup_lat": ride["pickup_lat"],
        "pickup_lng": ride["pickup_lng"],
        "pickup_address": ride["pickup_address"],
        "dropoff_address": ride["dropoff_address"],
        "vehicle_type": ride["vehicle_type"],
        "estimated_fare": fare,
        "distance_km": ride["distance_km"],
        "user_id": ride["user_id"],
        "created_at": ride["created_at"],
    })

    ride.pop("_id", None)
    ride["created_at"] = datetime.fromisoformat(ride["created_at"])
    # Background Web Push to drivers (instant → nearby online drivers; scheduled →
    # online drivers' agenda). Fire-and-forget so the booking response isn't delayed.
    asyncio.create_task(_push_new_ride_to_drivers(dict(ride), instant=not ride.get("scheduled_at")))
    return RideResponse(**ride)


@router.post("/availability-alert")
async def availability_alert(request: Request):
    user = await get_current_user(request)
    body = await request.json()
    from core.availability import register_availability_alert
    await register_availability_alert(
        user["id"], body.get("pickup_lat"), body.get("pickup_lng"), body.get("pickup_address"))
    return {"ok": True}


async def _push_new_ride_to_drivers(ride: dict, instant: bool = True):
    """Web Push a new ride/reservation to online drivers (background alert)."""
    try:
        from core.webpush import send_web_push_to_user
        from routes.push_web import get_notif_settings
        settings = await get_notif_settings()
        if instant:
            title = "SB Drive — Nouvelle course"
            body = settings["messages"].get("new_ride", "Nouvelle course disponible")
            url, tag, typ = "/chauffeur/home", "new_ride", "new_ride_request"
        else:
            title = "SB Drive — Réservation"
            body = settings["messages"].get("scheduled_reservation", "Nouvelle réservation planifiée")
            url, tag, typ = "/chauffeur/reservations", "scheduled", "scheduled_reservation"
        pickup = (ride.get("pickup_address") or "")[:45]
        payload = {"title": title, "body": f"{body} · {pickup}", "url": url, "tag": tag,
                   "type": typ, "data": {"ride_id": ride["id"]}}
        cursor = db.drivers.find({"status": "approved", "is_online": True},
                                 {"_id": 0, "user_id": 1, "current_lat": 1, "current_lng": 1})
        is_cash_ride = (ride.get("payment_method") or "").strip().lower() == "cash"
        async for d in cursor:
            uid = d.get("user_id")
            if not uid:
                continue
            # Cash rides are not pushed to drivers below the minimum balance.
            if is_cash_ride and not await _driver_meets_cash_minimum(uid):
                continue
            if instant:
                loc = manager.get_driver_location(uid) or {}
                d_lat = loc.get("lat", d.get("current_lat"))
                d_lng = loc.get("lng", d.get("current_lng"))
                if d_lat is None or d_lng is None:
                    continue
                if calculate_distance(ride["pickup_lat"], ride["pickup_lng"], d_lat, d_lng) > NEARBY_DRIVERS_RADIUS_KM:
                    continue
            await send_web_push_to_user(uid, payload)
    except Exception:
        import logging
        logging.getLogger("rides").warning("new ride push failed", exc_info=True)


@router.post("/{ride_id}/proposed-fare")
async def update_proposed_fare(ride_id: str, request: Request):
    """Bidding: passenger raises their offered fare on a still-pending ride and
    re-broadcasts the request to nearby drivers (cannot lower below current)."""
    user = await get_current_user(request)
    body = await request.json()
    new_fare = float(body.get("proposed_fare") or 0)
    ride = await db.rides.find_one({"id": ride_id}, {"_id": 0})
    if not ride:
        raise HTTPException(status_code=404, detail="Ride not found")
    if ride["user_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    if ride["status"] != "pending":
        raise HTTPException(status_code=400, detail="La course n'est plus en attente")
    current = float(ride.get("proposed_fare") or 0)
    if new_fare <= current:
        raise HTTPException(status_code=400, detail="Le nouveau tarif doit être supérieur au tarif actuel")
    await db.rides.update_one({"id": ride_id}, {"$set": {"proposed_fare": new_fare}})
    # Re-broadcast to drivers with the higher offer
    await manager.broadcast_to_drivers({
        "type": "new_ride_request",
        "ride_id": ride["id"],
        "pickup_lat": ride["pickup_lat"],
        "pickup_lng": ride["pickup_lng"],
        "pickup_address": ride["pickup_address"],
        "dropoff_address": ride["dropoff_address"],
        "vehicle_type": ride["vehicle_type"],
        "estimated_fare": ride.get("estimated_fare"),
        "proposed_fare": new_fare,
        "distance_km": ride.get("distance_km"),
        "duration_mins": ride.get("duration_mins"),
        "mode": ride.get("mode") or "bidding",
        "ride_type": ride.get("ride_type", "instant"),
        "is_bidding": True,
        "pool_enabled": ride.get("pool_enabled", False),
        "seats_required": ride.get("seats_required", 1),
    })
    return {"message": "Tarif augmenté et renvoyé aux chauffeurs", "proposed_fare": new_fare}


@router.post("/{ride_id}/rebroadcast")
async def rebroadcast_ride(ride_id: str, request: Request):
    """Re-emit a still-pending ride request to nearby drivers (a 'relance')."""
    user = await get_current_user(request)
    ride = await db.rides.find_one({"id": ride_id}, {"_id": 0})
    if not ride:
        raise HTTPException(status_code=404, detail="Ride not found")
    if ride["user_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    if ride["status"] != "pending":
        raise HTTPException(status_code=400, detail="La course n'est plus en attente")
    await db.rides.update_one(
        {"id": ride_id},
        {"$inc": {"relance_count": 1}, "$set": {"last_relance_at": datetime.now(timezone.utc).isoformat()}},
    )
    await manager.broadcast_to_drivers({
        "type": "new_ride_request",
        "ride_id": ride["id"],
        "pickup_lat": ride["pickup_lat"],
        "pickup_lng": ride["pickup_lng"],
        "pickup_address": ride["pickup_address"],
        "dropoff_address": ride["dropoff_address"],
        "vehicle_type": ride["vehicle_type"],
        "estimated_fare": ride.get("estimated_fare"),
        "proposed_fare": ride.get("proposed_fare"),
        "distance_km": ride.get("distance_km"),
        "duration_mins": ride.get("duration_mins"),
        "mode": ride.get("mode"),
        "ride_type": ride.get("ride_type", "instant"),
        "is_bidding": ride.get("is_bidding", False),
        "pool_enabled": ride.get("pool_enabled", False),
        "seats_required": ride.get("seats_required", 1),
    })
    return {"message": "Recherche relancée", "ride_id": ride_id}


# Radius (km) within which online drivers are considered "notified / nearby".
NEARBY_DRIVERS_RADIUS_KM = 12.0


@router.put("/{ride_id}/payment-method")
async def change_payment_method(ride_id: str, request: Request):
    """Change a ride's payment method at any time before completion. For wallet
    with an insufficient balance, the ride is kept and the shortfall is flagged
    as payable in cash."""
    user = await get_current_user(request)
    body = await request.json()
    method = (body.get("payment_method") or "").strip()
    if method not in VALID_PAYMENT_METHODS:
        raise HTTPException(status_code=400, detail="Moyen de paiement invalide")
    ride = await db.rides.find_one({"id": ride_id}, {"_id": 0, "user_id": 1, "status": 1, "final_fare": 1, "estimated_fare": 1})
    if not ride:
        raise HTTPException(status_code=404, detail="Ride not found")
    if ride["user_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    if ride.get("status") in {"completed", "cancelled"}:
        raise HTTPException(status_code=400, detail="Course terminée — paiement non modifiable")
    fare = float(ride.get("final_fare") or ride.get("estimated_fare") or 0.0)
    info = await _payment_feasibility(user["id"], method, fare)
    await db.rides.update_one(
        {"id": ride_id},
        {"$set": {
            "payment_method": method,
            "payment_shortfall": info["shortfall"],
            "difference_in_cash": info["difference_in_cash"],
        }},
    )
    return {"message": "Moyen de paiement mis à jour", "payment_method": method, **info}


@router.post("/{ride_id}/collect-cash")
async def collect_cash(ride_id: str, request: Request):
    """Driver confirms whether the cash amount due was actually received.
    The amount due covers a wallet shortfall, a recalculated extra (fare went up),
    or a full cash fare. 'Non reçu' records the amount as a carried debt on the
    passenger (recovered on a future ride or settled from the wallet)."""
    user = await get_current_user(request)
    body = await request.json()
    received = bool(body.get("received"))
    amount_received_raw = body.get("amount_received")
    ride = await db.rides.find_one({"id": ride_id}, {"_id": 0})
    if not ride:
        raise HTTPException(status_code=404, detail="Course introuvable")
    is_admin = user.get("role") == "admin"
    if not is_admin:
        drv = await db.drivers.find_one({"user_id": user["id"]}, {"_id": 0, "id": 1})
        if not drv or ride.get("driver_id") != drv["id"]:
            raise HTTPException(status_code=403, detail="Non autorisé")
    cash_due = round(float(ride.get("cash_due_to_driver") or 0), 2)
    if cash_due <= 0:
        return {"message": "Aucun montant à percevoir", "cash_due": 0.0, "received": received}
    now = datetime.now(timezone.utc).isoformat()
    carried = ride.get("carried_debt")
    # Carried debt still unpaid at this point (digital may have settled part already).
    debt_ids = (carried or {}).get("debt_ids") or []
    carried_remaining = 0.0
    if debt_ids:
        unpaid = await db.cancellation_debts.find(
            {"id": {"$in": debt_ids}, "paid": False}, {"_id": 0, "amount": 1}).to_list(200)
        carried_remaining = round(sum(float(x.get("amount", 0) or 0) for x in unpaid), 2)

    # How much cash the driver actually collected (partial supported).
    if amount_received_raw is not None:
        amount_received = round(min(max(float(amount_received_raw or 0), 0.0), cash_due), 2)
    else:
        amount_received = cash_due if received else 0.0

    # Apply the collected cash to the current fare first, then to the carried debt.
    fare_remaining = max(0.0, round(cash_due - carried_remaining, 2))
    fare_paid = round(min(amount_received, fare_remaining), 2)
    fare_shortfall = round(fare_remaining - fare_paid, 2)
    debt_cash = round(amount_received - fare_paid, 2)  # cash applied to the carried debt

    # Forward the cash-collected portion of the carried debt to the old driver(s).
    if debt_cash > 0 and carried_remaining > 0:
        from routes.debts import settle_carried_debts
        await settle_carried_debts(ride, carried, collected_in_cash=True, max_amount=debt_cash)
    # Unpaid fare → a new ride-balance debt on the passenger (re-carries / wallet).
    if fare_shortfall > 0:
        from routes.debts import record_ride_balance_debt
        await record_ride_balance_debt(ride["user_id"], ride_id, fare_shortfall)

    fully_paid = amount_received >= cash_due - 0.001
    await db.rides.update_one({"id": ride_id}, {"$set": {
        "payment_status": "paid" if fully_paid else ("partial" if amount_received > 0 else "debt"),
        "cash_collected": amount_received,
        "cash_collected_at": now,
        "cash_unpaid": round(cash_due - amount_received, 2),
        "cash_due_to_driver": 0.0,
    }})
    return {
        "message": "Paiement perçu" if fully_paid else ("Paiement partiel enregistré" if amount_received > 0 else "Montant ajouté à la dette du client"),
        "received": fully_paid,
        "amount": amount_received,
        "cash_due": cash_due,
        "shortfall": round(cash_due - amount_received, 2),
    }


@router.post("/{ride_id}/convert-to-bidding")
async def convert_ride_to_bidding(ride_id: str, request: Request):
    """Convert a pending standard ride into bidding mode (keep pickup/dropoff/vehicle),
    seed the proposed fare from the estimate and re-broadcast so drivers can counter-offer."""
    user = await get_current_user(request)
    ride = await db.rides.find_one({"id": ride_id}, {"_id": 0})
    if not ride:
        raise HTTPException(status_code=404, detail="Ride not found")
    if ride["user_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    if ride["status"] != "pending":
        raise HTTPException(status_code=400, detail="La course n'est plus en attente")
    proposed = round(max(float(ride.get("proposed_fare") or 0), float(ride.get("estimated_fare") or 0)), 2)
    await db.rides.update_one(
        {"id": ride_id},
        {"$set": {"mode": "bidding", "is_bidding": True, "proposed_fare": proposed,
                  "no_driver_outcome": "bidding", "no_driver_at": datetime.now(timezone.utc).isoformat()}},
    )
    await manager.broadcast_to_drivers({
        "type": "new_ride_request",
        "ride_id": ride["id"],
        "pickup_lat": ride["pickup_lat"],
        "pickup_lng": ride["pickup_lng"],
        "pickup_address": ride["pickup_address"],
        "dropoff_address": ride["dropoff_address"],
        "vehicle_type": ride["vehicle_type"],
        "estimated_fare": ride.get("estimated_fare"),
        "proposed_fare": proposed,
        "distance_km": ride.get("distance_km"),
        "duration_mins": ride.get("duration_mins"),
        "mode": "bidding",
        "ride_type": ride.get("ride_type", "instant"),
        "is_bidding": True,
        "pool_enabled": ride.get("pool_enabled", False),
        "seats_required": ride.get("seats_required", 1),
    })
    await maybe_create_zone_alert(ride.get("pickup_address"), "bidding")
    return {"message": "Course convertie en enchères", "ride_id": ride_id, "proposed_fare": proposed}



@router.post("/{ride_id}/update-route")
async def update_ride_route(ride_id: str, request: Request):
    """In-ride modification: the passenger can change the departure/destination
    addresses or add/remove intermediate stops even after the driver has accepted
    or the ride has started. Recomputes distance/fare/polyline and notifies the
    assigned driver via the ride WS room."""
    user = await get_current_user(request)
    body = await request.json()
    ride = await db.rides.find_one({"id": ride_id}, {"_id": 0})
    if not ride:
        raise HTTPException(status_code=404, detail="Ride not found")
    if ride["user_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    if ride["status"] not in ["pending", "accepted", "arriving", "in_progress"]:
        raise HTTPException(status_code=400, detail="La course ne peut plus être modifiée")

    in_progress = ride["status"] == "in_progress"

    # New values fall back to current ride values
    pickup_lat = body.get("pickup_lat", ride["pickup_lat"])
    pickup_lng = body.get("pickup_lng", ride["pickup_lng"])
    pickup_address = body.get("pickup_address", ride["pickup_address"])
    dropoff_lat = body.get("dropoff_lat", ride["dropoff_lat"])
    dropoff_lng = body.get("dropoff_lng", ride["dropoff_lng"])
    dropoff_address = body.get("dropoff_address", ride["dropoff_address"])
    stops = body.get("stops", ride.get("stops")) or []

    # The pickup point cannot change once the trip is underway
    pickup_changed = (pickup_lat != ride["pickup_lat"] or pickup_lng != ride["pickup_lng"])
    if in_progress and pickup_changed:
        raise HTTPException(status_code=400, detail="Le point de départ ne peut pas être modifié une fois la course commencée")

    # Recompute distance / duration / fare / polyline through stops
    stop_points = [(s.get("lat"), s.get("lng")) for s in stops if isinstance(s, dict) and s.get("lat") and s.get("lng")]
    route = [(pickup_lat, pickup_lng)] + stop_points + [(dropoff_lat, dropoff_lng)]
    distance = sum(
        calculate_distance(route[i][0], route[i][1], route[i + 1][0], route[i + 1][1])
        for i in range(len(route) - 1)
    )
    duration = int(distance * 3)
    vtype_doc = await db.vehicle_types.find_one({"slug": ride["vehicle_type"], "status": "active"}, {"_id": 0})
    from core.geo_scope import apply_vehicle_zone_pricing
    vtype_doc, _zone_tariff = apply_vehicle_zone_pricing(vtype_doc, ride.get("pickup_address") or pickup_address or "")
    fare = calculate_fare(distance, ride["vehicle_type"], duration, vtype_doc)

    route_polyline = ride.get("route_polyline")
    gmaps_key = os.environ.get("GOOGLE_MAPS_KEY")
    if gmaps_key and pickup_lat and dropoff_lat:
        try:
            params = {
                "origin": f"{pickup_lat},{pickup_lng}",
                "destination": f"{dropoff_lat},{dropoff_lng}",
                "key": gmaps_key, "language": "fr", "units": "metric",
            }
            if stop_points:
                params["waypoints"] = "|".join(f"{lat},{lng}" for lat, lng in stop_points)
            gresp = requests.get("https://maps.googleapis.com/maps/api/directions/json", params=params, timeout=5)
            gjson = gresp.json()
            if gjson.get("status") == "OK" and gjson.get("routes"):
                route_polyline = gjson["routes"][0].get("overview_polyline", {}).get("points")
                legs = gjson["routes"][0]["legs"]
                distance = sum(leg["distance"]["value"] for leg in legs) / 1000
                duration = int(sum(leg["duration"]["value"] for leg in legs) / 60)
                fare = calculate_fare(distance, ride["vehicle_type"], duration, vtype_doc)
        except Exception:
            pass

    update = {
        "pickup_lat": pickup_lat, "pickup_lng": pickup_lng, "pickup_address": pickup_address,
        "dropoff_lat": dropoff_lat, "dropoff_lng": dropoff_lng, "dropoff_address": dropoff_address,
        "stops": stops or None,
        "distance_km": round(distance, 2),
        "duration_mins": duration,
        "estimated_fare": fare,
        "route_polyline": route_polyline,
        "route_updated_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.rides.update_one({"id": ride_id}, {"$set": update})

    # Notify the assigned driver (and passenger) in the ride room
    await manager.send_to_ride_room(ride_id, {
        "type": "route_updated",
        "ride_id": ride_id,
        **update,
    })

    updated = await db.rides.find_one({"id": ride_id}, {"_id": 0})
    return updated


@router.get("/active-zone-bonuses")
async def active_zone_bonuses(request: Request):
    """Drivers: list currently active temporary zone bonuses (driver-shortage incentives)."""
    await get_current_user(request)
    now_iso = datetime.now(timezone.utc).isoformat()
    alerts = await db.zone_alerts.find(
        {"status": "active", "bonus_active_until": {"$gt": now_iso}},
        {"_id": 0, "zone": 1, "bonus_amount": 1, "bonus_active_until": 1},
    ).to_list(50)
    return {"bonuses": [a for a in alerts if (a.get("bonus_amount") or 0) > 0]}


@router.get("/{ride_id}")
async def get_ride(ride_id: str, request: Request):
    user = await get_current_user(request)
    ride = await db.rides.find_one({"id": ride_id}, {"_id": 0})
    if not ride:
        raise HTTPException(status_code=404, detail="Ride not found")
    # Authorization: passenger, assigned driver (driver.id matches OR driver.user_id matches), or admin/dispatcher
    is_passenger = ride["user_id"] == user["id"]
    is_admin = user["role"] in ["admin", "dispatcher"]
    is_assigned_driver = False
    if ride.get("driver_id") and user["role"] == "driver":
        drv = await db.drivers.find_one({"user_id": user["id"]}, {"_id": 0, "id": 1})
        if drv and drv["id"] == ride["driver_id"]:
            is_assigned_driver = True
    if not (is_passenger or is_assigned_driver or is_admin):
        raise HTTPException(status_code=403, detail="Access denied")

    # Attach live driver location if in progress (driver_locations is keyed by user_id of the driver)
    if ride.get("driver_id") and ride["status"] in ["accepted", "arriving", "in_progress"]:
        drv = await db.drivers.find_one({"id": ride["driver_id"]}, {"_id": 0, "user_id": 1})
        if drv:
            loc = manager.get_driver_location(drv["user_id"])
            if loc:
                ride["driver_lat"] = loc["lat"]
                ride["driver_lng"] = loc["lng"]

    # The start OTP must never be exposed to the driver — only the passenger
    # (in their app) and the admin (who can relay it if the phone is off).
    if is_assigned_driver and not is_admin:
        ride.pop("start_otp", None)
        ride.pop("otp", None)

    # The driver/admin view needs passenger display info (V3Cube ride card).
    if is_assigned_driver or is_admin:
        await enrich_passenger_info(ride)

    # Bidding: how many drivers have seen this offer (live "vu par X chauffeurs").
    ride["viewed_count"] = len(ride.get("viewed_by") or [])

    return ride


@router.post("/{ride_id}/seen")
async def mark_ride_seen(ride_id: str, request: Request):
    """A driver acknowledges they have SEEN a (bidding) ride request. Records the
    driver in the ride's viewed_by set so the passenger can show a live
    'X chauffeurs ont vu votre offre' counter. Best-effort, idempotent."""
    user = await get_current_user(request)
    driver = await db.drivers.find_one({"user_id": user["id"]}, {"_id": 0, "id": 1})
    if not driver:
        return {"ok": False}
    res = await db.rides.update_one(
        {"id": ride_id, "status": "pending"},
        {"$addToSet": {"viewed_by": driver["id"]}},
    )
    ride = await db.rides.find_one({"id": ride_id}, {"_id": 0, "viewed_by": 1})
    count = len(ride.get("viewed_by") or []) if ride else 0
    return {"ok": res.matched_count > 0, "viewed_count": count}


@router.post("/{ride_id}/accept")
async def accept_ride(ride_id: str, request: Request):
    # NOTE (Phase 4 "Prochaine course"): this endpoint intentionally does NOT
    # reject a driver who already has an in-progress ride. A busy driver near
    # finishing can pre-book the next job via this same endpoint, which starts
    # automatically once the current ride completes (see DriverHome.finishRide).
    # Do not add a "driver already busy" guard here — it would break that flow.
    user = await get_current_user(request)
    driver = await db.drivers.find_one({"user_id": user["id"]}, {"_id": 0})
    if not driver or driver["status"] != "approved":
        raise HTTPException(status_code=403, detail="Not an approved driver")

    ride = await db.rides.find_one({"id": ride_id, "status": "pending"})
    if not ride:
        raise HTTPException(status_code=404, detail="Ride not found or already taken")

    # Anti-disintermediation: a driver suspended from scheduled bookings (for
    # repeatedly accepting then releasing scheduled rides) cannot take them.
    if ride.get("scheduled_at"):
        susp = driver.get("scheduled_suspended_until")
        if susp:
            try:
                until = datetime.fromisoformat(str(susp).replace("Z", "+00:00"))
                if datetime.now(timezone.utc) < until:
                    raise HTTPException(
                        status_code=403,
                        detail="Réservations planifiées temporairement suspendues suite à des relâchements répétés.",
                    )
            except HTTPException:
                raise
            except Exception:
                pass

    # ── Anti-conflit d'agenda : empêche un chauffeur de cumuler deux engagements
    # qui se chevauchent (cause des « le chauffeur est dans une autre course »). ──
    conflict_msg = await _driver_schedule_conflict(driver["id"], ride)
    if conflict_msg:
        raise HTTPException(status_code=409, detail=conflict_msg)


    # change and must cover platform fees). Below it, they cannot take cash rides.
    if (ride.get("payment_method") or "").strip().lower() == "cash":
        if not await _driver_meets_cash_minimum(user["id"]):
            raise HTTPException(
                status_code=403,
                detail=f"Solde insuffisant pour une course en espèces. Rechargez votre portefeuille (minimum {CASH_RIDE_MIN_BALANCE:.0f} €) pour recevoir et accepter les courses payées en espèces.",
            )

    # ── Driver sub-category gating: VTC/Taxi gammes are reserved ──
    vtype_doc = await db.vehicle_types.find_one(
        {"slug": ride.get("vehicle_type")}, {"_id": 0, "allowed_taxi_subs": 1}
    )
    allowed_subs = gamme_restricted_subs(vtype_doc)
    if not driver_sub_allowed(driver.get("taxi_sub"), allowed_subs):
        labels = " / ".join(TAXI_SUB_LABELS.get(s, s) for s in sorted(allowed_subs))
        raise HTTPException(
            status_code=403,
            detail=f"Cette course est réservée aux chauffeurs {labels}. Votre profil ne correspond pas à cette gamme.",
        )

    now = datetime.now(timezone.utc).isoformat()
    # Anti-fraud Lot 2: snapshot the driver's GPS at accept time so a background
    # loop can later detect "accepted but never moved" and auto-reassign.
    _accept_loc = manager.get_driver_location(user["id"]) or {}
    _accept_lat = _accept_loc.get("lat", driver.get("current_lat"))
    _accept_lng = _accept_loc.get("lng", driver.get("current_lng"))
    # Phase 4 — ATOMIC LOCK: only ONE driver can claim a ride. The filter still
    # requires status=pending AND driver_id=None, so concurrent /accept calls
    # race on the same document and only the first one matches. The loser gets a
    # 409 instead of silently overwriting the winning driver.
    accept_fields = {
        "driver_id": driver["id"],
        "driver_user_id": user["id"],
        "status": "accepted",
        "accepted_at": now,
        "accept_lat": _accept_lat,
        "accept_lng": _accept_lng,
        "driver_name": driver.get("user_name", user.get("name", "Chauffeur")),
        "driver_phone": driver.get("user_phone", user.get("phone")),
        "driver_rating": driver.get("rating", 5.0),
        "driver_vehicle_model": driver.get("vehicle_model"),
        "driver_vehicle_number": driver.get("vehicle_number"),
    }
    # BIDDING: accepting the request means agreeing to the PASSENGER's proposed
    # fare — it becomes the agreed price (otherwise the negotiated amount is lost
    # and the system estimate is wrongly used).
    is_bidding_ride = ride.get("mode") == "bidding" or ride.get("is_bidding") or ride.get("ride_type") == "bidding"
    if is_bidding_ride and ride.get("proposed_fare"):
        try:
            pf = round(float(ride["proposed_fare"]), 2)
            accept_fields["estimated_fare"] = pf
            accept_fields["agreed_fare"] = pf
            accept_fields["final_fare"] = pf
        except (TypeError, ValueError):
            pass
    claimed = await db.rides.find_one_and_update(
        {"id": ride_id, "status": "pending", "driver_id": None},
        {"$set": accept_fields},
    )
    if not claimed:
        raise HTTPException(status_code=409, detail="Course déjà acceptée par un autre chauffeur")

    # ===== Activity journal: new ride accepted =====
    try:
        from core.notifications import create_notification
        dest = ride.get("dropoff_address") or "destination"
        await create_notification(
            user["id"], "ride", "Nouvelle course acceptée 🚗",
            f"Course #{_ride_ref(ride_id)} · vers {dest}", push=False,
            data={"ride_id": ride_id, "kind": "ride_accepted"},
        )
    except Exception:
        pass

    # ===== Scheduled reservation accepted → confirm the client (notif + email) =====
    if ride.get("scheduled_at") and ride.get("user_id"):
        try:
            from core.notifications import create_notification
            from core.email import send_driver_accepted
            ref = _ride_ref(ride_id)
            dname = accept_fields.get("driver_name") or "Votre chauffeur"
            try:
                _sd = datetime.fromisoformat(str(ride["scheduled_at"]).replace("Z", "+00:00"))
                when = _sd.strftime("%d/%m/%Y à %H:%M")
            except (ValueError, TypeError):
                when = str(ride.get("scheduled_at"))
            await create_notification(
                ride["user_id"], "ride", "Chauffeur confirmé 🚗",
                f"{dname} a accepté votre réservation #{ref} prévue le {when}.",
                data={"ride_id": ride_id, "kind": "reservation_accepted", "url": f"/ride/{ride_id}"})
            cu = await db.users.find_one({"id": ride["user_id"]}, {"_id": 0, "email": 1})
            if cu and cu.get("email"):
                await send_driver_accepted(cu["email"], ref=ref, driver_name=dname, when=when)
        except Exception:
            pass

    # ===== SMS au proche (course réservée pour autrui) — feature-flag Twilio =====
    if ride.get("book_for_phone"):
        try:
            from core.sms import send_sms, sms_enabled
            if sms_enabled():
                ref = _ride_ref(ride_id)
                dest = ride.get("dropoff_address") or "destination"
                first = (ride.get("book_for_name") or "").split(" ")[0] or "Bonjour"
                await send_sms(
                    ride["book_for_phone"],
                    f"SB Drive: {first}, un chauffeur a ete reserve pour vous "
                    f"(course #{ref}) vers {dest}. Il arrive bientot.")
        except Exception:
            pass

    # ===== POINTS: award for accepted ride =====
    from routes.drivers import _get_rewards_points_config, _ensure_driver_stats, _recompute_rates
    points_cfg = await _get_rewards_points_config()
    await _ensure_driver_stats(driver, points_cfg)
    gain = int(points_cfg.get("points_per_ride_accepted", 2))
    current_points = driver.get("points", points_cfg["initial_points"])
    new_points = min(100, current_points + gain)
    await db.drivers.update_one(
        {"id": driver["id"]},
        {"$set": {"points": new_points}, "$inc": {"offered_count": 1, "accepted_count": 1}},
    )
    await _recompute_rates(driver["id"])

    # ===== Auto-dispatch quality bonus (if ride was escalated) =====
    fresh_ride = await db.rides.find_one({"id": ride_id}, {"_id": 0})
    if fresh_ride and fresh_ride.get("auto_dispatch_tier", 0) > 0:
        from routes.auto_dispatch import _adjust_driver_points, get_config as _get_ad_cfg
        ad_cfg = await _get_ad_cfg()
        if ad_cfg.get("scoring_enabled"):
            await _adjust_driver_points(
                user["id"],
                ad_cfg["accept_bonus_points"],
                f"Acceptation course escaladée (tier {fresh_ride['auto_dispatch_tier']})",
                ride_id,
                floor=ad_cfg["min_points_floor"],
            )

    # ===== Favorite driver? Flag the ride + reassure the passenger =====
    is_fav = await db.favorite_drivers.find_one(
        {"user_id": ride["user_id"], "driver_id": driver["id"]}, {"_id": 0, "id": 1})
    if is_fav:
        await db.rides.update_one({"id": ride_id}, {"$set": {"favorite_driver_assigned": True}})
        try:
            from core.notifications import create_notification
            await create_notification(
                ride["user_id"], "ride",
                "Votre chauffeur favori arrive ⭐",
                f"Bonne nouvelle, c'est {driver.get('user_name', user.get('name', 'votre chauffeur favori'))}, votre chauffeur favori, qui prend en charge votre course !",
                data={"ride_id": ride_id, "kind": "favorite_assigned"},
            )
        except Exception:
            pass

    # Join WS ride room
    manager.join_ride_room(ride_id, user["id"])

    # Notify passenger
    await manager.send_personal_message({
        "type": "ride_accepted",
        "ride_id": ride_id,
        "driver_id": driver["id"],
        "driver_name": driver.get("user_name", user.get("name", "Chauffeur")),
        "driver_phone": driver.get("user_phone"),
        "driver_rating": driver.get("rating", 5.0),
        "driver_vehicle_model": driver.get("vehicle_model"),
        "driver_vehicle_number": driver.get("vehicle_number"),
        "is_favorite": bool(is_fav),
        "status": "accepted",
    }, ride["user_id"])

    return {"message": "Ride accepted", "status": "accepted"}


@router.post("/{ride_id}/decline")
async def decline_ride(ride_id: str, request: Request):
    """A driver refuses an incoming offer. Records the refusal and, once the
    driver crosses the admin-configured threshold within the rolling window,
    auto-switches them OFFLINE. Best-effort — never blocks the driver UI."""
    user = await get_current_user(request)
    driver = await db.drivers.find_one({"user_id": user["id"]}, {"_id": 0, "id": 1, "user_id": 1})
    if not driver:
        raise HTTPException(status_code=403, detail="Driver profile required")
    try:
        from routes.dispatch_admin import record_driver_refusal
        result = await record_driver_refusal(driver, ride_id)
    except Exception:
        result = {"count": 0, "max": 0, "went_offline": False}
    return {"ok": True, **result}


DRIVER_CANCEL_WINDOW_MIN = 20


@router.post("/{ride_id}/driver-cancel-booking")
async def driver_cancel_booking(ride_id: str, request: Request):
    """A driver releases a booking they accepted. Allowed ONLY while the ride is
    still 'accepted' and within DRIVER_CANCEL_WINDOW_MIN of acceptance; afterwards
    the cancel option is gone (only 'Démarrer' remains). The ride returns to the
    available pool — scheduled rides reappear in the agenda, instant rides are
    re-broadcast immediately."""
    user = await get_current_user(request)
    driver = await db.drivers.find_one({"user_id": user["id"]}, {"_id": 0, "id": 1})
    if not driver:
        raise HTTPException(status_code=403, detail="Driver profile required")

    ride = await db.rides.find_one({"id": ride_id}, {"_id": 0})
    if not ride:
        raise HTTPException(status_code=404, detail="Ride not found")
    if ride.get("driver_id") != driver["id"]:
        raise HTTPException(status_code=403, detail="Not your booking")
    if ride.get("status") != "accepted":
        raise HTTPException(status_code=400, detail="Cette course ne peut plus être annulée.")

    accepted_at = ride.get("accepted_at")
    # Réservations PROGRAMMÉES : libérables à tout moment tant que non démarrées
    # (la pénalité anti-abus s'applique déjà). Courses instantanées : fenêtre courte.
    is_scheduled = ride.get("ride_mode") == "scheduled" or bool(ride.get("scheduled_at"))
    if accepted_at and not is_scheduled:
        acc = datetime.fromisoformat(str(accepted_at).replace("Z", "+00:00"))
        if datetime.now(timezone.utc) - acc > timedelta(minutes=DRIVER_CANCEL_WINDOW_MIN):
            raise HTTPException(
                status_code=400,
                detail=f"Délai d'annulation dépassé ({DRIVER_CANCEL_WINDOW_MIN} min).",
            )

    now = datetime.now(timezone.utc).isoformat()
    await db.rides.update_one({"id": ride_id}, {"$set": {
        "status": "pending",
        "driver_id": None,
        "accepted_at": None,
        "driver_name": None,
        "driver_phone": None,
        "driver_rating": None,
        "driver_vehicle_model": None,
        "driver_vehicle_number": None,
        "released_at": now,
    }})

    # Phase 3 — escalating penalty for accepting then releasing a booking
    # (scheduled rides escalate + can suspend, to stop off-platform poaching).
    from routes.moderation import apply_driver_penalty
    await apply_driver_penalty(driver["id"], "accept_release", ride_id,
                               is_scheduled=bool(ride.get("scheduled_at")))

    # Phase 4 — track accept-then-cancel for the dispatch control tower (flags
    # drivers who dump CARD rides). Best-effort.
    try:
        from routes.dispatch_admin import record_driver_cancellation
        await record_driver_cancellation(driver["id"], ride)
    except Exception:
        pass

    # Notify the passenger their driver stepped back.
    try:
        from core.notifications import create_notification
        await create_notification(
            ride["user_id"], "ride", "Recherche d'un nouveau chauffeur",
            "Votre chauffeur n'est plus disponible. Nous recherchons un autre chauffeur pour votre réservation.",
            push=True, data={"ride_id": ride_id, "kind": "driver_released"},
        )
    except Exception:
        pass
    await manager.send_personal_message(
        {"type": "ride_driver_released", "ride_id": ride_id, "status": "pending"},
        ride["user_id"],
    )

    # Re-enter the pool: instant rides re-broadcast, scheduled rides return to the
    # agenda (no immediate pop-up).
    if not ride.get("scheduled_at"):
        await manager.broadcast_to_drivers({
            "type": "new_ride_request",
            "ride_id": ride_id,
            "pickup_lat": ride.get("pickup_lat"),
            "pickup_lng": ride.get("pickup_lng"),
            "pickup_address": ride.get("pickup_address"),
            "dropoff_address": ride.get("dropoff_address"),
            "vehicle_type": ride.get("vehicle_type"),
            "estimated_fare": ride.get("estimated_fare"),
            "proposed_fare": ride.get("proposed_fare"),
            "distance_km": ride.get("distance_km"),
            "duration_mins": ride.get("duration_mins"),
        })

    return {"message": "Booking released", "status": "pending", "cancel_window_min": DRIVER_CANCEL_WINDOW_MIN}



@router.post("/{ride_id}/status")
async def update_ride_status(ride_id: str, request: Request):
    user = await get_current_user(request)
    body = await request.json()
    new_status = body.get("status")

    ride = await db.rides.find_one({"id": ride_id}, {"_id": 0})
    if not ride:
        raise HTTPException(status_code=404, detail="Ride not found")

    current_status = ride["status"]
    allowed = VALID_TRANSITIONS.get(current_status, [])
    if new_status not in allowed:
        raise HTTPException(status_code=400, detail=f"Cannot transition from '{current_status}' to '{new_status}'. Allowed: {allowed}")

    # Authorization check
    driver = await db.drivers.find_one({"user_id": user["id"]})
    is_driver = driver and driver["id"] == ride.get("driver_id")
    is_passenger = user["id"] == ride["user_id"]
    is_admin = user["role"] in ["admin", "dispatcher"]

    if new_status == "cancelled":
        if not (is_passenger or is_driver or is_admin):
            raise HTTPException(status_code=403, detail="Not authorized to cancel")
    elif not (is_driver or is_admin):
        raise HTTPException(status_code=403, detail="Only the driver can update ride status")

    # The driver cannot start the trip via the generic status endpoint: they MUST
    # verify the passenger's start OTP (POST /phase1/rides/{id}/start-otp/verify).
    # Admins may force-start (e.g. they relayed the OTP and the phone is off).
    if new_status == "in_progress" and is_driver and not is_admin:
        raise HTTPException(status_code=400, detail="Le code OTP du client est requis pour démarrer la course")

    # Réservation PROGRAMMÉE : le chauffeur ne peut la démarrer (passer "en route")
    # que dans les SCHEDULED_ACTIVATION_MIN min précédant l'HEURE DU RENDEZ-VOUS
    # (scheduled_at), jamais à l'heure de commande. Les admins ne sont pas bloqués.
    if new_status == "arriving" and is_driver and not is_admin and ride.get("scheduled_at"):
        sdt = _parse_iso(ride["scheduled_at"])
        if sdt:
            activation_min, _, _ = await _scheduling_windows()
            earliest = sdt - timedelta(minutes=activation_min)
            now_dt = datetime.now(timezone.utc)
            if now_dt < earliest:
                mins = int((earliest - now_dt).total_seconds() // 60)
                raise HTTPException(
                    status_code=400,
                    detail=(f"Trop tôt : vous pourrez démarrer cette réservation "
                            f"{activation_min} min avant le rendez-vous "
                            f"(dans environ {mins} min)."),
                )

    now = datetime.now(timezone.utc).isoformat()
    update_data = {"status": new_status}

    if new_status == "arriving":
        update_data["arrived_at"] = now

    elif new_status == "in_progress":
        update_data["started_at"] = now
        # Mid-ride payment guard (admin force-start path): switch to cash & flash
        # the driver if the rider's wallet can't cover the fare.
        try:
            _drv = await db.drivers.find_one({"id": ride.get("driver_id")}, {"_id": 0, "user_id": 1}) if ride.get("driver_id") else None
            await switch_to_cash_if_needed(ride, (_drv or {}).get("user_id"), now)
        except Exception:
            pass

    elif new_status == "completed":
        update_data["completed_at"] = now
        # ===== Invoice fare breakdown (V3Cube "Résumé de paiement") =====
        vtype = await db.vehicle_types.find_one({"slug": ride["vehicle_type"]}, {"_id": 0}) or {}
        base = round(vtype.get("base_fare", ride.get("base_fare", 0)) + vtype.get("pickup_price", 0), 2)
        per_km = vtype.get("price_per_km", ride.get("price_per_km", 0))
        per_min = vtype.get("price_per_min", 0)
        min_fare = vtype.get("min_fare", 0)
        dist = ride.get("distance_km", 0) or 0
        dist_charge = round(dist * per_km, 2)
        elapsed_sec = 0
        if ride.get("started_at"):
            try:
                started = datetime.fromisoformat(ride["started_at"])
                elapsed_sec = max(0, int((datetime.now(timezone.utc) - started).total_seconds()))
            except (ValueError, TypeError):
                pass
        time_charge = round((elapsed_sec / 60) * per_min, 2)
        # ===== Extra charges (V3Cube "Frais supplémentaires": péage + autres + attente) =====
        extra = body.get("extra_charges") or {}
        extra_toll = round(float(extra.get("toll", 0) or 0), 2)
        extra_other = round(float(extra.get("other", 0) or 0), 2)
        extra_waiting = round(float(extra.get("waiting", 0) or 0), 2)
        extras_total = round(extra_toll + extra_other + extra_waiting, 2)
        subtotal = round(base + dist_charge + time_charge + extras_total, 2)
        # ===== Phase 5 — apply the rider's loyalty discount on the metered fare
        # (fare components only, not toll/extra passthrough) =====
        loy_pct = float(ride.get("loyalty_discount_pct", 0) or 0)
        loyalty_cut = 0.0
        if loy_pct > 0:
            fare_part = round(base + dist_charge + time_charge, 2)
            loyalty_cut = round(fare_part * loy_pct / 100, 2)
            subtotal = round(max(subtotal - loyalty_cut, 0), 2)
        min_adj = round(max(0, min_fare - subtotal), 2)
        final_fare = round(subtotal + min_adj, 2)
        # Safety floor: never bill below the originally estimated fare + extras (covers
        # edge cases such as an unregistered vehicle slug → empty pricing doc).
        est_floor = round((ride.get("estimated_fare", 0) or 0) + extras_total, 2)
        if final_fare < est_floor:
            min_adj = round(min_adj + (est_floor - final_fare), 2)
            final_fare = est_floor
        # V3Cube "Arrondir": round the net total to the nearest whole euro.
        total_net = float(round(final_fare))
        rounding = round(total_net - final_fare, 2)
        subtotal_before_round = final_fare
        final_fare = total_net
        update_data["final_fare"] = final_fare
        update_data["fare_breakdown"] = {
            "vehicle_label": vtype.get("name", ride.get("vehicle_type", "")),
            "base_fare": base,
            "distance_km": round(dist, 2),
            "distance_charge": dist_charge,
            "time_seconds": elapsed_sec,
            "time_charge": time_charge,
            "min_fare": min_fare,
            "min_adjustment": min_adj,
            "extra_toll": extra_toll,
            "extra_other": extra_other,
            "extra_waiting": extra_waiting,
            "extra_total": extras_total,
            "extra_note": extra.get("note") or None,
            "loyalty_discount": loyalty_cut,
            "loyalty_tier": ride.get("loyalty_tier_name"),
            "subtotal": subtotal_before_round,
            "rounding": rounding,
            "total": final_fare,
            "total_net": final_fare,
            "currency": "EUR",
        }
        # ── Mise à disposition: override invoice with package + overage billing ──
        if ride.get("ride_type") == "rental":
            meter = _compute_rental_meter(ride, datetime.now(timezone.utc), actual_km=ride.get("rental_actual_km"))
            final_fare = float(round(meter["projected_total"]))
            update_data["final_fare"] = final_fare
            update_data["rental_overage_hours"] = meter["overage_hours"]
            update_data["rental_overage_km"] = meter["overage_km"]
            update_data["rental_overage_fee"] = meter["overage_fee"]
            update_data["fare_breakdown"] = {
                "vehicle_label": vtype.get("name", ride.get("vehicle_type", "")),
                "rental": True,
                "rental_package": ride.get("rental_package"),
                "package_price": meter["package_price"],
                "hours_included": meter["hours_included"],
                "elapsed_minutes": meter["elapsed_minutes"],
                "overage_hours": meter["overage_hours"],
                "extra_hour_rate": meter["extra_hour_rate"],
                "km_included": meter["km_included"],
                "actual_km": ride.get("rental_actual_km"),
                "overage_km": meter["overage_km"],
                "extra_km_rate": meter["extra_km_rate"],
                "overage_fee": meter["overage_fee"],
                "subtotal": meter["projected_total"],
                "total": final_fare,
                "total_net": final_fare,
                "currency": "EUR",
            }
        pm = ride.get("payment_method")
        cashback_earned = 0.0
        # Anti-fraud payout: track how much of the fare was ACTUALLY captured
        # digitally (from the passenger's wallet/card). The driver is only ever
        # credited for this captured portion — never for money still due in cash.
        digital_captured = 0.0
        from core.cashback import award_cashback
        # Carried debt (unpaid balance from a previous ride) rides along with this
        # fare: the passenger owes (fare + debt) on this trip.
        carried = ride.get("carried_debt")
        carried_amt = round(float((carried or {}).get("amount", 0) or 0), 2)
        if carried_amt > 0:
            update_data.setdefault("fare_breakdown", ride.get("fare_breakdown") or {})
            bd = update_data["fare_breakdown"]
            bd["carried_debt"] = carried_amt
            bd["fare_subtotal"] = round(float(bd.get("total", final_fare)), 2)
            bd["total"] = round(float(bd.get("total", final_fare)) + carried_amt, 2)
            bd["total_net"] = round(float(bd.get("total_net", final_fare)) + carried_amt, 2)
        amt = round(float(final_fare) + carried_amt, 2)
        # Caution Intercité déjà encaissée à la réservation (séquestre) → imputée au
        # paiement final (réduit le reste dû ; comptée comme déjà capturée digitalement).
        held_deposit = round(float(ride.get("intercity_deposit") or 0), 2) if ride.get("deposit_status") == "held" else 0.0
        # === Digital payment settlement (unified SB Pay wallet) ===
        # Under the wallet model, "card" tops up the wallet then pays from it, so
        # wallet / sbpaygo / card all settle from the wallet. We charge what the
        # balance can cover; any shortfall (e.g. the fare was recalculated higher
        # than the held balance, or the balance was insufficient at booking) is
        # collected IN CASH by the driver and confirmed via "Reçu / Non reçu".
        if pm in ("sbpaygo", "wallet", "sbpay", "card"):
            w = await db.wallets.find_one({"user_id": ride["user_id"]}, {"_id": 0, "balance": 1})
            bal = round(float((w or {}).get("balance", 0.0) or 0.0), 2)
            amt_digital = round(max(0.0, amt - held_deposit), 2)
            charge = round(min(bal, amt_digital), 2)
            cash_due = round(amt_digital - charge, 2)
            if charge > 0:
                res = await db.wallets.update_one(
                    {"user_id": ride["user_id"], "balance": {"$gte": charge}},
                    {"$inc": {"balance": -charge}},
                )
                if res.modified_count:
                    digital_captured = charge
                    w2 = await db.wallets.find_one({"user_id": ride["user_id"]}, {"_id": 0})
                    await db.wallet_transactions.insert_one({
                        "id": f"tx_{uuid.uuid4().hex[:12]}",
                        "user_id": ride["user_id"],
                        "type": "Booking",
                        "amount": -charge,
                        "balance_after": round((w2 or {}).get("balance", 0), 2),
                        "description": f"Paiement course {ride['id']}",
                        "ride_id": ride["id"],
                        "status": "completed",
                        "created_at": now,
                    })
                    cashback_earned = await award_cashback(ride["user_id"], charge, "sbpay", "ride", ref_id=ride["id"], label="Cashback course SB Pay")
                else:
                    # Race: the balance changed between read and write → all cash due.
                    cash_due = amt_digital
            if held_deposit > 0:
                digital_captured = round(digital_captured + held_deposit, 2)
                update_data["deposit_status"] = "captured"
                update_data["intercity_deposit_captured"] = held_deposit
            if cash_due > 0:
                update_data["cash_due_to_driver"] = cash_due
                update_data["payment_status"] = "cash_due"
            else:
                update_data["payment_status"] = "paid"
                update_data["paid_with"] = "sbpay"
                update_data["paid_at"] = now
        else:
            # Cash ride — the whole fare is collected by the driver and confirmed
            # via "Reçu / Non reçu" (non-payment becomes a carried debt). Any
            # Intercity deposit already held counts toward the fare (less cash due).
            cash_amt = round(max(0.0, amt - held_deposit), 2)
            update_data["payment_status"] = "pending_cash" if cash_amt > 0 else "paid"
            update_data["cash_due_to_driver"] = cash_amt
            if held_deposit > 0:
                digital_captured = round(digital_captured + held_deposit, 2)
                update_data["deposit_status"] = "captured"
                update_data["intercity_deposit_captured"] = held_deposit
            cashback_earned = await award_cashback(ride["user_id"], final_fare, pm or "", "ride", ref_id=ride["id"], label="Cashback course")
        if cashback_earned > 0:
            update_data["cashback_earned"] = cashback_earned
        if ride.get("driver_id"):
            d_full = await db.drivers.find_one({"id": ride["driver_id"]}, {"_id": 0, "taxi_sub": 1, "user_id": 1})
            # ===== Phase 5 loyalty: reduce commission for higher-tier drivers =====
            from routes.loyalty import get_commission_discount_pct, apply_loyalty_on_completion
            base_commission = ride.get("commission_percent", 10) / 100
            loyalty_disc = await get_commission_discount_pct((d_full or {}).get("user_id"))
            commission = base_commission * (1 - loyalty_disc / 100)
            if loyalty_disc > 0:
                update_data["loyalty_commission_discount_pct"] = loyalty_disc
            # The wallet/card charge pays the FARE first (then any carried debt),
            # so the fare portion captured digitally is min(charge, final_fare).
            # The driver earns commission-net only on this captured fare; the cash
            # part is settled (and stays with the driver) at the "Reçu" step.
            fare_captured_digital = round(min(digital_captured, final_fare), 2)
            update_data["digital_captured_fare"] = fare_captured_digital
            driver_earnings = round(fare_captured_digital * (1 - commission), 2)
            # ===== Sub-category bonus (Particulier / VTC / Taxi licence) =====
            sub = (d_full or {}).get("taxi_sub")
            subcat_bonus = 0.0
            if sub:
                from routes.admin import get_rewards_config
                from core.geo_scope import resolve_zone_from_text
                ride_zone = resolve_zone_from_text(ride.get("pickup_address") or "")
                scb = (await get_rewards_config(ride_zone)).get("sub_category_bonus") or {}
                if scb.get("enabled"):
                    subcat_bonus = round(float(scb.get(sub, 0) or 0), 2)
            if subcat_bonus > 0:
                update_data["subcategory_bonus"] = subcat_bonus
                update_data["subcategory"] = sub
            total_credit = round(driver_earnings + subcat_bonus, 2)
            await db.drivers.update_one(
                {"id": ride["driver_id"]},
                {"$inc": {"total_trips": 1, "earnings": total_credit}}
            )
            # ===== Credit the driver's WITHDRAWABLE SB Pay wallet for the part
            # actually captured digitally (+ any platform bonus). Anti-fraud rule:
            # the platform never pays out money it did not collect. Cash collected
            # stays physically with the driver and is reported separately. =====
            duid = (d_full or {}).get("user_id")
            if duid and total_credit > 0:
                await db.wallets.update_one(
                    {"user_id": duid},
                    {"$inc": {"balance": total_credit},
                     "$setOnInsert": {"user_id": duid, "currency": "EUR", "created_at": now}},
                    upsert=True,
                )
                _wd = await db.wallets.find_one({"user_id": duid}, {"_id": 0, "balance": 1})
                await db.wallet_transactions.insert_one({
                    "id": f"tx_{uuid.uuid4().hex[:12]}", "user_id": duid,
                    "type": "Earning", "amount": total_credit,
                    "balance_after": round((_wd or {}).get("balance", 0), 2),
                    "description": f"Gain course #{ride['id'][:8].upper()} (paiement encaissé)",
                    "ride_id": ride["id"], "status": "completed", "created_at": now,
                })
            # ===== Activity journal: earnings notification =====
            if duid and total_credit > 0:
                from core.notifications import create_notification
                await create_notification(
                    duid, "earning", "Course terminée 💸",
                    f"+{total_credit:.2f} € pour la course #{ride['id'][:8].upper()}",
                    data={"ride_id": ride["id"], "amount": total_credit, "kind": "ride"},
                )
            # ===== POINTS: award for completed ride =====
            from routes.drivers import _get_rewards_points_config
            points_cfg = await _get_rewards_points_config()
            gain = int(points_cfg.get("points_per_ride_completed", 3))
            d_doc = await db.drivers.find_one({"id": ride["driver_id"]}, {"_id": 0, "points": 1})
            if d_doc:
                new_pts = min(100, d_doc.get("points", points_cfg["initial_points"]) + gain)
                await db.drivers.update_one({"id": ride["driver_id"]}, {"$set": {"points": new_pts}})

        # ===== Pack C: record corporate charge on completion =====
        if ride.get("corporate_account_id"):
            from routes.corporate import record_corporate_charge
            await record_corporate_charge(ride["corporate_account_id"], ride, final_fare)

        # ===== Carried debt: settle the digitally-paid portion now =====
        # The carried debt is part of `amt`. The wallet/card charge pays the fare
        # first, then the debt; whatever the wallet covered of the debt is forwarded
        # to the previous driver now (no driver notification). The rest (still in
        # cash_due) is settled at the "Reçu / Non reçu" cash step. Cash rides settle
        # nothing here (cash_due == amt ≥ carried_amt → 0).
        if carried_amt > 0:
            cash_due_now = round(float(update_data.get("cash_due_to_driver", 0) or 0), 2)
            debt_via_digital = max(0.0, round(carried_amt - cash_due_now, 2))
            if debt_via_digital > 0:
                from routes.debts import settle_carried_debts
                await settle_carried_debts({**ride, "final_fare": final_fare}, carried,
                                           collected_in_cash=False, max_amount=debt_via_digital)

        # ===== Phase 2: advance referral qualification on ride completion =====
        from routes.referral import process_referral_on_ride_completion
        await process_referral_on_ride_completion(ride.get("user_id"), ride.get("driver_id"))

        # ===== Phase 5: award loyalty points to passenger + driver =====
        try:
            d_uid = None
            if ride.get("driver_id"):
                _d = await db.drivers.find_one({"id": ride["driver_id"]}, {"_id": 0, "user_id": 1})
                d_uid = (_d or {}).get("user_id")
            from routes.loyalty import apply_loyalty_on_completion
            await apply_loyalty_on_completion(ride, d_uid)
        except Exception as _e:
            import logging
            logging.getLogger("loyalty").warning("loyalty award failed: %s", _e)

    elif new_status == "cancelled":
        update_data["cancelled_at"] = now
        update_data["cancelled_by"] = "driver" if is_driver else "user" if is_passenger else "admin"
        cancel_reason = body.get("cancel_reason")
        if cancel_reason:
            update_data["cancel_reason"] = cancel_reason
        # Apply cancellation fee per admin policy (free window after acceptance / before scheduled pickup)
        if is_passenger:
            policy = await _cancel_policy()
            cancel_fee = _compute_cancel_fee({**ride, "status": current_status}, policy, datetime.now(timezone.utc))
            if cancel_fee > 0:
                update_data["cancellation_fee"] = cancel_fee
                from routes.debts import settle_cancellation_fee
                # The wronged driver (if one was already assigned) is reimbursed.
                await settle_cancellation_fee(ride["user_id"], ride_id, cancel_fee, ride.get("driver_id"))
        # Release any cancellation debt that was carried by this (now cancelled)
        # ride so it follows the passenger's next ride instead of being lost.
        from routes.debts import release_carried_debts
        await release_carried_debts(ride_id)
        # Refund any Intercity deposit held in escrow for this ride.
        await _refund_intercity_deposit(ride)
        # ===== POINTS: driver-initiated cancellation penalises the driver =====
        if is_driver and ride.get("driver_id"):
            from routes.drivers import _get_rewards_points_config, _recompute_rates
            points_cfg = await _get_rewards_points_config()
            loss = int(points_cfg.get("points_lost_per_cancel", 10))
            d_doc = await db.drivers.find_one({"id": ride["driver_id"]}, {"_id": 0, "points": 1})
            if d_doc:
                new_pts = max(0, d_doc.get("points", points_cfg["initial_points"]) - loss)
                await db.drivers.update_one(
                    {"id": ride["driver_id"]},
                    {"$set": {"points": new_pts}, "$inc": {"cancelled_count": 1}},
                )
                await _recompute_rates(ride["driver_id"])
            # Phase 3 — monetary penalty for an abusive driver cancellation.
            from routes.moderation import apply_driver_penalty
            await apply_driver_penalty(ride["driver_id"], "abusive_cancel", ride_id)
        # ===== Phase 3: track passenger cancellation (warning / temporary ban) =====
        if is_passenger:
            from routes.moderation import register_passenger_cancel
            await register_passenger_cancel(ride["user_id"], ride_id)

    await db.rides.update_one({"id": ride_id}, {"$set": update_data})

    # ===== Facture de course terminée (email reçu, non bloquant) =====
    if new_status == "completed":
        try:
            invoice_no = ride.get("ride_invoice_number") or await _ride_invoice_number()
            await db.rides.update_one({"id": ride_id}, {"$set": {"ride_invoice_number": invoice_no}})
            payer = await db.users.find_one({"id": ride["user_id"]}, {"_id": 0, "email": 1, "name": 1}) if ride.get("user_id") else None
            if payer and payer.get("email"):
                driver_name = ""
                if ride.get("driver_id"):
                    drv = await db.drivers.find_one({"id": ride["driver_id"]}, {"_id": 0, "name": 1})
                    driver_name = (drv or {}).get("name", "")
                bd = update_data.get("fare_breakdown") or {}
                from core.email import fire, send_ride_invoice
                frontend = os.environ.get("FRONTEND_URL", "").rstrip("/")
                fire(send_ride_invoice(
                    payer["email"], payer.get("name", ""), invoice_no=invoice_no,
                    pickup=ride.get("pickup_address", ""), dropoff=ride.get("dropoff_address", ""),
                    distance_km=ride.get("distance_km", 0), breakdown=bd,
                    total=update_data.get("final_fare", 0), driver_name=driver_name,
                    vehicle_label=bd.get("vehicle_label", ride.get("vehicle_type", "")),
                    ride_url=f"{frontend}/ride/{ride_id}",
                ))
        except Exception:
            pass

    # ===== Passenger-facing lifecycle Web Push (background alert + sound) =====
    if ride.get("user_id") and new_status in ("arriving", "in_progress", "completed"):
        try:
            from routes.push_web import get_notif_settings
            from core.notifications import create_notification
            _msgs = (await get_notif_settings())["messages"]
            _life = {
                "arriving": ("driver_arrived", "🚗 Chauffeur arrivé"),
                "in_progress": ("ride_started", "🟢 Course démarrée"),
                "completed": ("ride_completed", "🏁 Course terminée"),
            }
            _key, _title = _life[new_status]
            await create_notification(
                ride["user_id"], _key, _title, _msgs.get(_key, _title),
                data={"url": f"/ride/{ride_id}", "ride_id": ride_id, "status": new_status},
            )
        except Exception:
            pass

    # Notify via WebSocket
    ws_message = {
        "type": "ride_status_update",
        "ride_id": ride_id,
        "status": new_status,
        "timestamp": now,
    }
    if new_status == "arriving":
        ws_message["otp"] = ride.get("otp")
    if new_status == "completed":
        ws_message["final_fare"] = update_data.get("final_fare")
        ws_message["fare_breakdown"] = update_data.get("fare_breakdown")
    if new_status == "cancelled":
        ws_message["cancelled_by"] = update_data.get("cancelled_by")
        ws_message["cancel_reason"] = update_data.get("cancel_reason")

    await manager.send_to_ride_room(ride_id, ws_message)

    # Also send personal message to passenger
    if ride.get("user_id"):
        await manager.send_personal_message(ws_message, ride["user_id"])

    # Clean up room on terminal states
    if new_status in ["completed", "cancelled"]:
        if ride_id in manager.ride_rooms:
            del manager.ride_rooms[ride_id]

    # SB Student rewards — award loyalty points on completed rides (defensive, idempotent).
    if new_status == "completed" and ride.get("user_id"):
        try:
            from routes.student_rewards import award_ride_points
            await award_ride_points(ride["user_id"], {**ride, **update_data, "id": ride_id})
        except Exception:
            pass

    return {"message": f"Status updated to {new_status}", "status": new_status}


@router.post("/{ride_id}/cancel")
async def cancel_ride(ride_id: str, request: Request):
    """Convenience endpoint for cancelling a ride with a reason."""
    user = await get_current_user(request)
    body = await request.json()
    reason = body.get("reason", "")

    ride = await db.rides.find_one({"id": ride_id}, {"_id": 0})
    if not ride:
        raise HTTPException(status_code=404, detail="Ride not found")
    if ride["user_id"] != user["id"] and user["role"] not in ["admin", "dispatcher"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    if ride["status"] in ["completed", "cancelled"]:
        raise HTTPException(status_code=400, detail="Ride already finished")

    now_dt = datetime.now(timezone.utc)
    now = now_dt.isoformat()
    policy = await _cancel_policy()
    cancel_fee = _compute_cancel_fee(ride, policy, now_dt)
    settle = {"fee": cancel_fee, "debt_created": False, "paid_from_wallet": False}
    if cancel_fee > 0 and ride["user_id"] == user["id"]:
        from routes.debts import settle_cancellation_fee
        settle = await settle_cancellation_fee(user["id"], ride_id, cancel_fee, ride.get("driver_id"))

    # Release any debt this ride was carrying so it follows the next ride.
    from routes.debts import release_carried_debts
    await release_carried_debts(ride_id)
    # Refund any Intercity deposit held in escrow for this ride.
    await _refund_intercity_deposit(ride)

    await db.rides.update_one({"id": ride_id}, {"$set": {
        "status": "cancelled",
        "cancelled_at": now,
        "cancelled_by": "user",
        "cancel_reason": reason,
        "cancellation_fee": cancel_fee,
    }})

    await manager.send_to_ride_room(ride_id, {
        "type": "ride_status_update",
        "ride_id": ride_id,
        "status": "cancelled",
        "cancelled_by": "user",
        "cancel_reason": reason,
        "cancellation_fee": cancel_fee,
        "timestamp": now,
    })

    if ride_id in manager.ride_rooms:
        del manager.ride_rooms[ride_id]

    # Phase 3 — track passenger cancellation (warning / temporary ban).
    moderation = {"count": 0, "warned": False, "banned": False, "ban_until": None}
    if ride["user_id"] == user["id"]:
        from routes.moderation import register_passenger_cancel
        moderation = await register_passenger_cancel(user["id"], ride_id)

    return {
        "message": "Ride cancelled",
        "cancellation_fee": cancel_fee,
        "debt_created": settle.get("debt_created", False),
        "paid_from_wallet": settle.get("paid_from_wallet", False),
        "free_window_min": policy["free_window_min"],
        "moderation": moderation,
    }


@router.post("/{ride_id}/refund-client")
async def refund_client_from_driver(ride_id: str, request: Request):
    """A driver refunds/pays the ride's client from their OWN wallet (e.g. paid in
    cash but no change). Debits the driver while respecting the non-withdrawable
    reserve, credits the client instantly. Linked to the ride. No admin validation."""
    user = await get_current_user(request)
    driver = await db.drivers.find_one({"user_id": user["id"]}, {"_id": 0, "id": 1})
    if not driver:
        raise HTTPException(status_code=403, detail="Not a driver")
    ride = await db.rides.find_one({"id": ride_id}, {"_id": 0})
    if not ride:
        raise HTTPException(status_code=404, detail="Course introuvable")
    if ride.get("driver_id") != driver["id"]:
        raise HTTPException(status_code=403, detail="Cette course ne vous appartient pas")
    client_id = ride.get("user_id")
    if not client_id:
        raise HTTPException(status_code=400, detail="Client introuvable pour cette course")
    body = await request.json()
    try:
        amount = round(float(body.get("amount", 0)), 2)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="Montant invalide")
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Le montant doit être positif")

    from core.wallet_reserve import ensure_reserve_credited
    floor = await ensure_reserve_credited(user)
    wallet = await db.wallets.find_one({"user_id": user["id"]}, {"_id": 0}) or {}
    balance = float(wallet.get("balance", 0) or 0)
    pending = float(wallet.get("pending_withdraw", 0) or 0)
    available = round(balance - floor - pending, 2)
    if amount > available:
        raise HTTPException(
            status_code=400,
            detail=f"Montant max remboursable {max(0.0, available):.2f} € (réserve de {floor:.0f} € non utilisable).",
        )

    now = datetime.now(timezone.utc).isoformat()
    new_driver_balance = round(balance - amount, 2)
    await db.wallets.update_one({"user_id": user["id"]}, {"$set": {"balance": new_driver_balance}})
    cw = await db.wallets.find_one({"user_id": client_id}, {"_id": 0})
    if not cw:
        await db.wallets.insert_one({"user_id": client_id, "balance": 0.0, "currency": "EUR", "created_at": now})
        cw = {"balance": 0.0}
    new_client_balance = round(float(cw.get("balance", 0) or 0) + amount, 2)
    await db.wallets.update_one({"user_id": client_id}, {"$set": {"balance": new_client_balance}})

    booking = ride.get("booking_no") or ride_id
    for tx in (
        {"user_id": user["id"], "type": "ride_refund_out", "amount": -amount, "balance_after": new_driver_balance,
         "description": f"Remboursement client — course {booking}"},
        {"user_id": client_id, "type": "ride_refund_in", "amount": amount, "balance_after": new_client_balance,
         "description": f"Remboursement chauffeur — course {booking}"},
    ):
        await db.wallet_transactions.insert_one({**tx, "id": f"tx_{uuid.uuid4().hex[:12]}", "ride_id": ride_id,
                                                 "status": "completed", "created_at": now})

    try:
        from core.notifications import create_notification
        await create_notification(client_id, "ride_refund", "Remboursement reçu 💶",
                                  f"Votre chauffeur vous a remboursé {amount:.2f} € pour la course {booking}.",
                                  data={"url": "/wallet", "amount": amount})
    except Exception:
        pass
    try:
        from core.email import fire, send_wallet_receipt
        from core.billing import next_number
        frontend = os.environ.get("FRONTEND_URL", "").rstrip("/")
        ref = await next_number("SB-R")
        client = await db.users.find_one({"id": client_id}, {"_id": 0, "email": 1, "name": 1})
        if client and client.get("email"):
            fire(send_wallet_receipt(client["email"], client.get("name", ""), kind="transfer_in", amount=amount,
                                     balance_after=new_client_balance, ref=ref, wallet_url=f"{frontend}/wallet",
                                     counterparty=user.get("name", "Chauffeur")))
        if user.get("email"):
            fire(send_wallet_receipt(user["email"], user.get("name", ""), kind="transfer_out", amount=amount,
                                     balance_after=new_driver_balance, ref=ref, wallet_url=f"{frontend}/wallet",
                                     counterparty=(client or {}).get("name", "Client")))
    except Exception:
        pass

    return {"ok": True, "amount": amount, "driver_balance": new_driver_balance, "client_balance": new_client_balance}


@router.get("")
async def list_rides(request: Request, status: Optional[str] = None, limit: int = 20):
    user = await get_current_user(request)
    query = {}
    driver_sub = None
    is_driver_feed = False
    if user["role"] == "user":
        query["user_id"] = user["id"]
    elif user["role"] == "driver":
        driver = await db.drivers.find_one({"user_id": user["id"]})
        if driver:
            is_driver_feed = True
            driver_sub = driver.get("taxi_sub")
            # Drivers see their own rides + ALL pending requests (consistent with the
            # WS broadcast_to_drivers model). Vehicle-type matching is not enforced so
            # approved drivers always receive incoming requests regardless of category.
            query["$or"] = [{"driver_id": driver["id"]}, {"status": "pending"}]
    if status:
        query["status"] = status
    rides = await db.rides.find(query, {"_id": 0}).sort("created_at", -1).limit(min(limit, 100)).to_list(min(limit, 100))
    if is_driver_feed:
        driver_doc_id = (await db.drivers.find_one({"user_id": user["id"]}, {"_id": 0, "id": 1}) or {}).get("id")
        # Scheduled rides (future pickups) belong in the driver's agenda
        # (home-feed `scheduled_pending`), never in the immediate request feed —
        # they must not surface as a live "Demande" pop-up.
        rides = [
            r for r in rides
            if r.get("status") != "pending"
            or r.get("driver_id") == driver_doc_id
            or not r.get("scheduled_at")
        ]
        # Hide pending rides whose gamme is reserved for a sub-category the driver
        # isn't in (keep the driver's own assigned rides regardless).
        restricted = await restricted_gammes_map()
        if restricted:
            rides = [
                r for r in rides
                if r.get("status") != "pending"
                or r.get("driver_id") == driver_doc_id
                or driver_sub_allowed(driver_sub, restricted.get(r.get("vehicle_type")))
            ]
        # Cash-ride gating: a driver below the minimum balance never sees pending
        # cash rides (consistent with the WS/push filtering). Done BEFORE the
        # anti-cherry-pick strip below, while payment_method is still present.
        if not await _driver_meets_cash_minimum(user["id"]):
            rides = [
                r for r in rides
                if r.get("driver_id") == driver_doc_id
                or (r.get("payment_method") or "").strip().lower() != "cash"
            ]
        for r in rides:
            await enrich_passenger_info(r)
            # Phase 4 (anti cherry-pick): hide the payment method on still-pending
            # offers so a driver can't accept cash-only and reject card rides.
            # It is revealed only once the ride is assigned to THEM.
            if r.get("status") == "pending" and r.get("driver_id") != driver_doc_id:
                r.pop("payment_method", None)
                r.pop("payment_status", None)
    return rides


@router.get("/active/current")
async def get_active_ride(request: Request):
    """Course réellement active pour l'utilisateur connecté (client ou chauffeur).

    Exclut les réservations PROGRAMMÉES acceptées mais encore loin du départ
    (le chauffeur n'a pas démarré) : elles ne doivent pas apparaître comme une
    course « en cours maintenant » (bande de suivi, redirection), pour lever la
    confusion « démarrée » et ne pas bloquer l'utilisateur 45 min trop tôt."""
    user = await get_current_user(request)
    active_statuses = ["pending", "accepted", "arriving", "in_progress"]
    activation_min, _, _ = await _scheduling_windows()

    if user["role"] == "driver":
        driver = await db.drivers.find_one({"user_id": user["id"]})
        if driver:
            rides = await db.rides.find(
                {"driver_id": driver["id"], "status": {"$in": active_statuses}},
                {"_id": 0},
            ).to_list(20)
            ride = next((r for r in rides if not _is_scheduled_pending_activation(r, activation_min)), None)
            if ride:
                await enrich_passenger_info(ride)
                return ride
    else:
        rides = await db.rides.find(
            {"user_id": user["id"], "status": {"$in": active_statuses}},
            {"_id": 0},
        ).to_list(20)
        ride = next((r for r in rides if not _is_scheduled_pending_activation(r, activation_min)), None)
        if ride:
            if ride.get("driver_id"):
                loc = manager.get_driver_location(ride["driver_id"])
                if loc:
                    ride["driver_lat"] = loc["lat"]
                    ride["driver_lng"] = loc["lng"]
            return ride

    return {"active_ride": None}


async def _expire_dead_pending_rides():
    """Mark unassigned pending rides that can no longer be served as `expired`, so
    they disappear from every driver list (réservations, courses, enchères) and
    can no longer be (futilely) accepted.

    Grace windows (a late driver / delay must not erase a booking too early):
      - scheduled reservation : expired 60 min AFTER its pickup time,
      - immediate request / bid : expired 10 min after creation (rider gave up).
    Idempotent and cheap (single indexed update_many)."""
    from routes.reservation_config import get_reservation_rules
    rules = await get_reservation_rules()
    try:
        grace_min = int(rules.get("scheduled_grace_minutes", 60))
    except (TypeError, ValueError):
        grace_min = 60
    try:
        imm_min = int(rules.get("immediate_expiry_minutes", 10))
    except (TypeError, ValueError):
        imm_min = 10
    now = datetime.now(timezone.utc)
    now_iso = now.isoformat()
    scheduled_cutoff = (now - timedelta(minutes=grace_min)).isoformat()   # grace after pickup time
    immediate_cutoff = (now - timedelta(minutes=imm_min)).isoformat()     # window for live requests
    await db.rides.update_many(
        {
            "status": "pending",
            "driver_id": None,
            "$or": [
                # scheduled reservation whose pickup time passed > 60 min ago
                {"scheduled_at": {"$ne": None, "$lt": scheduled_cutoff}},
                # abandoned immediate request / bid (no scheduled time, > 10 min old)
                {"$and": [
                    {"$or": [{"scheduled_at": None}, {"scheduled_at": {"$exists": False}}]},
                    {"created_at": {"$lt": immediate_cutoff}},
                ]},
            ],
        },
        {"$set": {"status": "expired", "expired_at": now_iso, "expiry_reason": "unaccepted"}},
    )



def _fmt_sched_time(sdt) -> str:
    """Format court d'une heure de RDV pour un SMS (ex. '15h30')."""
    try:
        return sdt.strftime("%Hh%M")
    except Exception:
        return ""


async def run_scheduled_ride_reminders():
    """Envoie un rappel SMS (client + chauffeur) ~`sms_reminder_min` min avant
    l'HEURE DU RDV d'une réservation programmée. Idempotent : ne traite chaque
    course qu'une seule fois (flag `reminder_sms_sent`). Testable directement.

    No-op propre si le rappel SMS est désactivé (admin) ou si Twilio n'est pas
    configuré (dans ce cas on ne pose PAS le flag, pour réessayer quand actif)."""
    from core.sms import send_sms, sms_enabled
    from routes.config import get_scheduling_config
    cfg = await get_scheduling_config()
    if not cfg.get("sms_reminder_enabled", True):
        return {"sent": 0, "rides": 0}
    if not sms_enabled():
        return {"sent": 0, "rides": 0, "reason": "sms_disabled"}

    reminder_min = int(cfg.get("sms_reminder_min", 30))
    now = datetime.now(timezone.utc)
    window_hi = (now + timedelta(minutes=reminder_min)).isoformat()
    now_iso = now.isoformat()

    rides = await db.rides.find({
        "status": {"$in": ["pending", "accepted"]},
        "scheduled_at": {"$ne": None, "$gte": now_iso, "$lte": window_hi},
        "reminder_sms_sent": {"$ne": True},
    }, {"_id": 0}).to_list(200)

    sent_total = 0
    for ride in rides:
        sdt = _parse_iso(ride.get("scheduled_at"))
        when = _fmt_sched_time(sdt) if sdt else ""
        ref = _ride_ref(ride.get("id", ""))
        pickup = (ride.get("pickup_address") or "").strip()[:60] or "—"

        # Numéro client (réservation pour soi ou pour un tiers).
        client_phone = ride.get("book_for_phone")
        if not client_phone and ride.get("user_id"):
            u = await db.users.find_one({"id": ride["user_id"]}, {"_id": 0, "phone": 1})
            client_phone = (u or {}).get("phone")
        if client_phone:
            body = (f"SB Drive — Rappel : votre course Réf. #{ref} est prévue à {when} "
                    f"(dans ~{reminder_min} min). Départ : {pickup}. À tout de suite !")
            if await send_sms(client_phone, body):
                sent_total += 1

        # Numéro chauffeur (uniquement si la réservation est acceptée).
        if ride.get("status") == "accepted" and ride.get("driver_id"):
            drv = await db.drivers.find_one({"id": ride["driver_id"]}, {"_id": 0, "user_id": 1})
            if drv and drv.get("user_id"):
                du = await db.users.find_one({"id": drv["user_id"]}, {"_id": 0, "phone": 1})
                drv_phone = (du or {}).get("phone")
                if drv_phone:
                    body = (f"SB Drive — Rappel chauffeur : course Réf. #{ref} prévue à {when} "
                            f"(dans ~{reminder_min} min). Prise en charge : {pickup}.")
                    if await send_sms(drv_phone, body):
                        sent_total += 1

        await db.rides.update_one(
            {"id": ride["id"]},
            {"$set": {"reminder_sms_sent": True, "reminder_sms_at": now_iso}},
        )

    return {"sent": sent_total, "rides": len(rides)}


async def scheduled_ride_reminder_loop():
    """Boucle de fond : vérifie toutes les 60 s les réservations programmées
    arrivant dans la fenêtre de rappel et envoie les SMS (client + chauffeur)."""
    from core.config import logger
    while True:
        try:
            await run_scheduled_ride_reminders()
        except Exception as e:
            try:
                logger.error("scheduled_ride_reminder_loop error: %s", e)
            except Exception:
                pass
        await asyncio.sleep(60)
