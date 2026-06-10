from fastapi import APIRouter, Request, HTTPException
import uuid
import os
import re
import math
import asyncio
import secrets
import requests
from datetime import datetime, timezone, timedelta
from typing import Optional

from core.zone_alerts import maybe_create_zone_alert

# Bidirectional bidding: driver counter-offers expire after this many seconds
OFFER_TTL_SECONDS = 30

# Taxi Pool — V3Cube model (Vehicle Type → Pool config):
#   1st seat = full fare F (no discount). Each additional seat = Pool Percentage % of F.
#   total(n) = F * (1 + (n-1) * pool_percentage/100). e.g. P=90 → 2 seats = F*1.9.
#   Capacity ("Available Seats", excl. driver) caps the seats a booking may request.
POOL_DEFAULT_PERCENTAGE = 90.0
POOL_DEFAULT_SEATS = 4
# A single passenger can only reserve a few seats in a SHARED pool so the vehicle
# keeps room for other pool riders. Admin-overridable per Vehicle Type / pool config.
POOL_DEFAULT_MAX_SEATS_PER_BOOKING = 2
# Pool = SHARED ride → the rider accepts detours/other passengers in exchange for a
# genuinely cheaper fare. This % is taken off the standard private fare for the 1st
# seat (each extra seat the same booking reserves is then billed via pool_percentage).
# Admin-overridable per Vehicle Type (`pool_discount_percent`) or global pool config.
POOL_DEFAULT_DISCOUNT_PERCENT = 25.0

# Intercity (longue distance) — a round-trip (aller-retour) bills the outbound fare
# times this factor (admin-overridable later). <2.0 reflects a return-trip rebate.
INTERCITY_ROUNDTRIP_FACTOR = 1.9


def pool_seat_multiplier(seats: int, pool_percentage: float) -> float:
    """Linear V3Cube pool multiplier: 1 + (n-1) * pool_percentage/100.
    seats=1 -> 1.0 ; seats=2 (P=90) -> 1.9 ; seats=3 -> 2.8 ; seats=4 -> 3.7."""
    n = max(1, int(seats or 1))
    return round(1 + (n - 1) * (pool_percentage / 100.0), 6)


def _pool_num(v, d):
    try:
        return float(v)
    except (TypeError, ValueError):
        return d


def _pool_bool(v, d):
    if isinstance(v, str):
        return v.strip().lower() in ("true", "1", "yes", "oui", "on")
    return bool(v) if v is not None else d


async def get_pool_config(vtype_doc=None):
    """Pool config sourced **per Vehicle Type** (V3Cube parity).

    The Admin configures Enable Pool / Pool Percentage / Available Seats on each
    Vehicle Type. We read those fields from the selected vehicle_types document.
    Falls back to the legacy global service_configs 'pool' doc, then to defaults.
    """
    if vtype_doc and ("pool_percentage" in vtype_doc or "enable_pool" in vtype_doc):
        return {
            "enabled": _pool_bool(vtype_doc.get("enable_pool"), True),
            "pool_percentage": _pool_num(vtype_doc.get("pool_percentage", POOL_DEFAULT_PERCENTAGE), POOL_DEFAULT_PERCENTAGE),
            "available_seats": int(_pool_num(vtype_doc.get("person_capacity", POOL_DEFAULT_SEATS), POOL_DEFAULT_SEATS)),
            "max_seats_per_booking": int(_pool_num(vtype_doc.get("pool_max_seats_per_booking", POOL_DEFAULT_MAX_SEATS_PER_BOOKING), POOL_DEFAULT_MAX_SEATS_PER_BOOKING)),
            "discount_percent": _pool_num(vtype_doc.get("pool_discount_percent", POOL_DEFAULT_DISCOUNT_PERCENT), POOL_DEFAULT_DISCOUNT_PERCENT),
        }

    doc = await _db_pool_config()
    s = (doc or {}).get("settings", {}) or {}
    return {
        "enabled": _pool_bool(s.get("enable_pool", True), True),
        "pool_percentage": _pool_num(s.get("pool_percentage", POOL_DEFAULT_PERCENTAGE), POOL_DEFAULT_PERCENTAGE),
        "available_seats": int(_pool_num(s.get("available_seats", POOL_DEFAULT_SEATS), POOL_DEFAULT_SEATS)),
        "max_seats_per_booking": int(_pool_num(s.get("max_seats_per_booking", POOL_DEFAULT_MAX_SEATS_PER_BOOKING), POOL_DEFAULT_MAX_SEATS_PER_BOOKING)),
        "discount_percent": _pool_num(s.get("pool_discount_percent", POOL_DEFAULT_DISCOUNT_PERCENT), POOL_DEFAULT_DISCOUNT_PERCENT),
    }


async def _db_pool_config():
    from core.config import db as _db
    return await _db.service_configs.find_one({"service_key": "pool"}, {"_id": 0})


# Payment methods that may be allowed for Pool (shared) rides.
POOL_ALL_PAYMENTS = ["cash", "card", "wallet", "sbpaygo"]
POOL_DEFAULT_MAX_STOPS = 2


async def get_pool_global_config():
    """GLOBAL Pool configuration (V3Cube « Configuration Pool »), stored in the
    service_configs 'pool' doc. Unlike `get_pool_config` (per Vehicle Type pricing),
    this exposes the admin's cross-cutting Pool policy consumed by the booking flow:
    eligible vehicle categories, allowed payment methods, capacity & max stops."""
    doc = await _db_pool_config()
    s = (doc or {}).get("settings", {}) or {}
    elig = s.get("eligible_vehicle_slugs")
    if not isinstance(elig, list):
        elig = []
    pms = s.get("payment_methods")
    if not isinstance(pms, list) or not pms:
        pms = list(POOL_ALL_PAYMENTS)
    discount = s.get("share_discount_percent", s.get("pool_discount_percent", POOL_DEFAULT_DISCOUNT_PERCENT))
    return {
        "enabled": _pool_bool(s.get("enable_pool", True), True),
        "pool_percentage": _pool_num(s.get("pool_percentage", POOL_DEFAULT_PERCENTAGE), POOL_DEFAULT_PERCENTAGE),
        "available_seats": int(_pool_num(s.get("available_seats", POOL_DEFAULT_SEATS), POOL_DEFAULT_SEATS)),
        "max_seats_per_booking": int(_pool_num(s.get("max_seats_per_booking", POOL_DEFAULT_MAX_SEATS_PER_BOOKING), POOL_DEFAULT_MAX_SEATS_PER_BOOKING)),
        "discount_percent": _pool_num(discount, POOL_DEFAULT_DISCOUNT_PERCENT),
        "max_stops": int(_pool_num(s.get("max_stops", POOL_DEFAULT_MAX_STOPS), POOL_DEFAULT_MAX_STOPS)),
        "eligible_vehicle_slugs": [str(x).strip().lower() for x in elig if x],
        "payment_methods": [str(x).strip().lower() for x in pms if x in POOL_ALL_PAYMENTS],
    }


from core.config import db
from core.deps import get_current_user, calculate_distance, calculate_fare
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


async def enrich_passenger_info(ride: dict) -> dict:
    """Attach passenger display info (name, rating, phone, avatar) so the driver
    app can render the V3Cube request/ride cards. Safe no-op if ride is empty."""
    if not ride or not ride.get("user_id"):
        return ride
    u = await db.users.find_one(
        {"id": ride["user_id"]},
        {"_id": 0, "name": 1, "phone": 1, "avatar": 1, "passenger_rating": 1},
    )
    ride["passenger_id"] = ride["user_id"]
    ride["passenger_name"] = ride.get("book_for_name") or (u or {}).get("name") or "Passager"
    ride["passenger_phone"] = ride.get("book_for_phone") or (u or {}).get("phone")
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
        "rental_hours": getattr(data, 'rental_hours', None),
        "rental_package": getattr(data, 'rental_package', None),
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

    await db.rides.insert_one(ride)

    # Track auto-promotion usage once the booking is persisted
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
        await manager.broadcast_to_drivers({
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
        })

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
        async for d in cursor:
            uid = d.get("user_id")
            if not uid:
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


@router.get("/{ride_id}/nearby-drivers")
async def nearby_drivers_count(ride_id: str, request: Request):
    """Count approved, online drivers near the ride's pickup — used by the
    'Recherche d'un chauffeur' radar to reassure the passenger in real time."""
    user = await get_current_user(request)
    ride = await db.rides.find_one({"id": ride_id}, {"_id": 0, "user_id": 1, "pickup_lat": 1, "pickup_lng": 1})
    if not ride:
        raise HTTPException(status_code=404, detail="Ride not found")
    if ride["user_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    p_lat, p_lng = ride.get("pickup_lat"), ride.get("pickup_lng")
    if p_lat is None or p_lng is None:
        return {"count": 0, "radius_km": NEARBY_DRIVERS_RADIUS_KM, "positions": []}
    cursor = db.drivers.find(
        {"status": "approved", "is_online": True},
        {"_id": 0, "user_id": 1, "current_lat": 1, "current_lng": 1},
    )
    count = 0
    positions = []
    async for d in cursor:
        loc = manager.get_driver_location(d["user_id"]) or {}
        lat = loc.get("lat", d.get("current_lat"))
        lng = loc.get("lng", d.get("current_lng"))
        if lat is None or lng is None:
            continue
        if calculate_distance(p_lat, p_lng, lat, lng) <= NEARBY_DRIVERS_RADIUS_KM:
            count += 1
            if len(positions) < 12:
                positions.append({"lat": lat, "lng": lng})
    return {"count": count, "radius_km": NEARBY_DRIVERS_RADIUS_KM, "positions": positions}


@router.get("/nearby/drivers")
async def nearby_online_drivers(lat: float, lng: float, request: Request):
    """Pre-booking version: approved + online drivers near an arbitrary pickup
    point (lat/lng). Returns the count, up to 12 positions, and the nearest
    driver's ETA (minutes) so the booking map can reassure the rider before they
    order ('Chauffeur à ~X min')."""
    await get_current_user(request)
    cursor = db.drivers.find(
        {"status": "approved", "is_online": True},
        {"_id": 0, "user_id": 1, "current_lat": 1, "current_lng": 1},
    )
    count = 0
    positions = []
    nearest_km = None
    async for d in cursor:
        loc = manager.get_driver_location(d["user_id"]) or {}
        d_lat = loc.get("lat", d.get("current_lat"))
        d_lng = loc.get("lng", d.get("current_lng"))
        if d_lat is None or d_lng is None:
            continue
        dist = calculate_distance(lat, lng, d_lat, d_lng)
        if dist <= NEARBY_DRIVERS_RADIUS_KM:
            count += 1
            if nearest_km is None or dist < nearest_km:
                nearest_km = dist
            if len(positions) < 12:
                positions.append({"lat": d_lat, "lng": d_lng})
    # ETA ≈ 2.5 min/km (~24 km/h urban approach), min 1 min when drivers exist.
    eta_mins = max(1, round(nearest_km * 2.5)) if nearest_km is not None else None
    return {"count": count, "radius_km": NEARBY_DRIVERS_RADIUS_KM, "positions": positions, "eta_mins": eta_mins, "nearest_km": round(nearest_km, 2) if nearest_km is not None else None}


VALID_PAYMENT_METHODS = {"cash", "card", "wallet", "sbpaygo"}


async def _cancel_policy():
    """Admin-configured cancellation fee (€) and free window (minutes)."""
    doc = await db.service_configs.find_one({"service_key": "payment_methods"}, {"_id": 0})
    s = (doc or {}).get("settings") or {}
    return {
        "fee": float(s.get("cancellation_fee_eur", 5.0) or 0),
        "free_window_min": float(s.get("free_cancel_window_minutes", 5) or 0),
    }


def _compute_cancel_fee(ride: dict, policy: dict, now_dt: datetime) -> float:
    """Cancellation fee rules:
      - Still searching (pending / not accepted): FREE.
      - Instant ride: free during the first `free_window_min` after the driver
        accepted; fee applies afterwards.
      - Scheduled ride: free if cancelled more than `free_window_min` before the
        scheduled pickup; fee applies if too close.
    """
    status = ride.get("status")
    if status == "pending":
        return 0.0
    free_min = policy["free_window_min"]
    # Scheduled rides
    if ride.get("scheduled_at"):
        try:
            sched = datetime.fromisoformat(str(ride["scheduled_at"]).replace("Z", "+00:00"))
            if (sched - now_dt).total_seconds() / 60.0 > free_min:
                return 0.0
        except (ValueError, TypeError):
            pass
        return policy["fee"]
    # Instant rides — window starts at driver acceptance
    accepted_at = ride.get("accepted_at")
    if not accepted_at:
        return 0.0
    try:
        acc = datetime.fromisoformat(str(accepted_at).replace("Z", "+00:00"))
        if (now_dt - acc).total_seconds() / 60.0 <= free_min:
            return 0.0
    except (ValueError, TypeError):
        pass
    return policy["fee"]


async def _payment_feasibility(user_id: str, method: str, fare: float):
    """For wallet, check the balance and compute the cash shortfall. Other
    methods are considered feasible at this stage (CB hold handled separately)."""
    if method == "wallet":
        wallet = await db.wallets.find_one({"user_id": user_id})
        bal = float((wallet or {}).get("balance", 0.0) or 0.0)
        if bal < fare:
            return {"sufficient": False, "balance": round(bal, 2), "shortfall": round(fare - bal, 2), "difference_in_cash": True}
        return {"sufficient": True, "balance": round(bal, 2), "shortfall": 0.0, "difference_in_cash": False}
    return {"sufficient": True, "balance": None, "shortfall": 0.0, "difference_in_cash": False}


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
    # Phase 4 — ATOMIC LOCK: only ONE driver can claim a ride. The filter still
    # requires status=pending AND driver_id=None, so concurrent /accept calls
    # race on the same document and only the first one matches. The loser gets a
    # 409 instead of silently overwriting the winning driver.
    accept_fields = {
        "driver_id": driver["id"],
        "status": "accepted",
        "accepted_at": now,
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
            f"Course #{ride_id[:8].upper()} · vers {dest}", push=False,
            data={"ride_id": ride_id, "kind": "ride_accepted"},
        )
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
    if accepted_at:
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

    # Phase 3 — €1 penalty for accepting then releasing a booking.
    from routes.moderation import apply_driver_penalty
    await apply_driver_penalty(driver["id"], "accept_release", ride_id)

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

    now = datetime.now(timezone.utc).isoformat()
    update_data = {"status": new_status}

    if new_status == "arriving":
        update_data["arrived_at"] = now

    elif new_status == "in_progress":
        update_data["started_at"] = now

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
        pm = ride.get("payment_method")
        # === SB PayGo auto-deduction ===
        if pm == "sbpaygo":
            wallet = await db.sbpaygo_wallets.find_one({"user_id": ride["user_id"]})
            if wallet and wallet.get("balance", 0) >= final_fare:
                tx = {
                    "id": f"tx_{uuid.uuid4().hex[:10]}",
                    "type": "debit",
                    "amount": final_fare,
                    "label": f"Paiement course {ride['id']}",
                    "ride_id": ride["id"],
                    "created_at": now,
                }
                await db.sbpaygo_wallets.update_one(
                    {"user_id": ride["user_id"]},
                    {"$inc": {"balance": -final_fare}, "$push": {"transactions": tx}},
                )
                update_data["payment_status"] = "paid"
                update_data["paid_with"] = "sbpaygo"
                update_data["paid_at"] = now
            else:
                # Insufficient balance: leave open so user can top-up and pay
                update_data["payment_status"] = "unpaid_insufficient"
        else:
            update_data["payment_status"] = "completed" if pm != "cash" else "pending_cash"
        if ride.get("driver_id"):
            d_full = await db.drivers.find_one({"id": ride["driver_id"]}, {"_id": 0, "taxi_sub": 1, "user_id": 1})
            # ===== Phase 5 loyalty: reduce commission for higher-tier drivers =====
            from routes.loyalty import get_commission_discount_pct, apply_loyalty_on_completion
            base_commission = ride.get("commission_percent", 10) / 100
            loyalty_disc = await get_commission_discount_pct((d_full or {}).get("user_id"))
            commission = base_commission * (1 - loyalty_disc / 100)
            if loyalty_disc > 0:
                update_data["loyalty_commission_discount_pct"] = loyalty_disc
            driver_earnings = final_fare * (1 - commission)
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
            # ===== Activity journal: earnings notification =====
            if (d_full or {}).get("user_id"):
                from core.notifications import create_notification
                await create_notification(
                    d_full["user_id"], "earning", "Course terminée 💸",
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

        # ===== Carried cancellation debt: reimburse the previous driver =====
        carried = ride.get("carried_debt")
        if carried and float(carried.get("amount", 0) or 0) > 0:
            from routes.debts import settle_carried_debts
            await settle_carried_debts({**ride, "final_fare": final_fare}, carried)

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
    """Get the current active ride for the logged-in user (or driver)."""
    user = await get_current_user(request)
    active_statuses = ["pending", "accepted", "arriving", "in_progress"]

    if user["role"] == "driver":
        driver = await db.drivers.find_one({"user_id": user["id"]})
        if driver:
            ride = await db.rides.find_one(
                {"driver_id": driver["id"], "status": {"$in": active_statuses}},
                {"_id": 0}
            )
            if ride:
                await enrich_passenger_info(ride)
                return ride
    else:
        ride = await db.rides.find_one(
            {"user_id": user["id"], "status": {"$in": active_statuses}},
            {"_id": 0}
        )
        if ride:
            if ride.get("driver_id"):
                loc = manager.get_driver_location(ride["driver_id"])
                if loc:
                    ride["driver_lat"] = loc["lat"]
                    ride["driver_lng"] = loc["lng"]
            return ride

    return {"active_ride": None}


@router.get("/driver/bookings")
async def driver_bookings(request: Request):
    """V3Cube 'Mes réservations' for a driver: available pending rides (to accept),
    upcoming rides assigned to this driver (to start), and live bidding rides."""
    user = await get_current_user(request)
    driver = await db.drivers.find_one({"user_id": user["id"]}, {"_id": 0, "id": 1})
    if not driver:
        raise HTTPException(status_code=403, detail="Driver profile required")
    did = driver["id"]

    upcoming = await db.rides.find(
        {"driver_id": did, "status": {"$in": ["accepted", "arriving", "in_progress"]}},
        {"_id": 0},
    ).sort("created_at", -1).to_list(50)
    pending = await db.rides.find(
        {"status": "pending", "driver_id": None, "mode": {"$ne": "bidding"}},
        {"_id": 0},
    ).sort("created_at", -1).to_list(50)
    bids = await db.rides.find(
        {"status": "pending", "driver_id": None, "mode": "bidding"},
        {"_id": 0},
    ).sort("created_at", -1).to_list(50)

    for r in [*upcoming, *pending, *bids]:
        await enrich_passenger_info(r)
    return {"upcoming": upcoming, "pending": pending, "bids": bids}


@router.get("/driver/home-feed")
async def driver_home_feed(request: Request):
    """Live counts/lists powering the V3Cube driver home indicators:
    RED = planned reservations awaiting acceptance, circle = upcoming assigned jobs,
    YELLOW = immediate available service rides, BLUE = available courier/delivery jobs
    (only if the driver enabled that option)."""
    user = await get_current_user(request)
    driver = await db.drivers.find_one({"user_id": user["id"]}, {"_id": 0, "id": 1, "service_types": 1})
    if not driver:
        raise HTTPException(status_code=403, detail="Driver profile required")
    did = driver["id"]
    svc = driver.get("service_types") or ["taxi", "delivery", "courier"]
    now_iso = datetime.now(timezone.utc).isoformat()
    has_taxi = "taxi" in svc
    has_courier = ("courier" in svc) or ("delivery" in svc)

    scheduled_pending = await db.rides.find(
        {"status": "pending", "driver_id": None, "scheduled_at": {"$ne": None, "$gte": now_iso}},
        {"_id": 0},
    ).sort("scheduled_at", 1).to_list(30) if has_taxi else []

    upcoming = await db.rides.find(
        {"driver_id": did, "status": {"$in": ["accepted", "arriving"]}},
        {"_id": 0},
    ).sort("scheduled_at", 1).to_list(30)

    available_rides = await db.rides.find(
        {"status": "pending", "driver_id": None,
         "$or": [{"scheduled_at": None}, {"scheduled_at": {"$exists": False}}]},
        {"_id": 0},
    ).sort("created_at", -1).to_list(30) if has_taxi else []

    available_deliveries = await db.parcels.find(
        {"status": "pending", "driver_id": None}, {"_id": 0},
    ).sort("created_at", -1).to_list(30) if has_courier else []

    for r in [*scheduled_pending, *upcoming, *available_rides]:
        await enrich_passenger_info(r)

    next_scheduled_at = next((r["scheduled_at"] for r in upcoming if r.get("scheduled_at")), None)

    return {
        "scheduled_pending": scheduled_pending,
        "upcoming": upcoming,
        "available_rides": available_rides,
        "available_deliveries": available_deliveries,
        "next_scheduled_at": next_scheduled_at,
        "counts": {
            "scheduled_pending": len(scheduled_pending),
            "upcoming": len(upcoming),
            "available_rides": len(available_rides),
            "available_deliveries": len(available_deliveries),
        },
    }


async def _taxi_hall_eligibility(driver: dict, zone=None) -> dict:
    """Taxi Hall 'zone de compétition' gate: a driver may only street-hail when
    their acceptance rate ≥ admin min AND cancellation rate ≤ admin max (per zone).
    A newly-registered driver defaults to 100% acceptance / 0% cancellation, so
    they pass by default."""
    from routes.config import get_app_settings_config
    cfg = await get_app_settings_config(zone)
    require = bool(cfg.get("taxi_hall_require_competition"))
    min_acc = float(cfg.get("taxi_hall_min_acceptance_rate", 0) or 0)
    max_can = float(cfg.get("taxi_hall_max_cancellation_rate", 100) or 100)
    min_score = float(cfg.get("taxi_hall_min_activity_score", 0) or 0)
    min_balance = float(cfg.get("taxi_hall_min_wallet_balance", 0) or 0)
    cash_only = bool(cfg.get("taxi_hall_cash_only", True))
    acc = driver.get("acceptance_rate")
    acc = float(acc) if acc is not None else 100.0
    can = float(driver.get("cancellation_rate", 0) or 0)
    # Activity score: same weighted composite as /drivers/my-activity.
    points_pct = min(float(driver.get("points", 0) or 0), 100)
    activity_score = round(points_pct * 0.5 + acc * 0.3 + (100 - can) * 0.2)
    wallet = await db.wallets.find_one({"user_id": driver.get("user_id")}, {"_id": 0, "balance": 1}) or {}
    balance = float(wallet.get("balance", 0) or 0)
    eligible, reason, need_recharge = True, None, False
    if require:
        if acc < min_acc:
            eligible, reason = False, f"Taux d'acceptation insuffisant ({acc:.0f}% < {min_acc:.0f}% requis)."
        elif can > max_can:
            eligible, reason = False, f"Taux d'annulation trop élevé ({can:.0f}% > {max_can:.0f}% autorisé)."
    if eligible and min_score > 0 and activity_score < min_score:
        eligible, reason = False, f"Score d'activité insuffisant ({activity_score} < {min_score:.0f} requis)."
    if eligible and min_balance > 0 and balance < min_balance:
        eligible, reason, need_recharge = False, (
            f"Solde insuffisant ({balance:.2f} € < {min_balance:.2f} € requis). Rechargez votre portefeuille."
        ), True
    return {
        "eligible": eligible, "require_competition": require, "reason": reason,
        "need_recharge": need_recharge,
        "acceptance_rate": acc, "cancellation_rate": can,
        "min_acceptance_rate": min_acc, "max_cancellation_rate": max_can,
        "activity_score": activity_score, "min_activity_score": min_score,
        "wallet_balance": balance, "min_wallet_balance": min_balance,
        "cash_only": cash_only,
    }


@router.get("/taxi-hall/eligibility")
async def taxi_hall_eligibility(request: Request, pickup: str = ""):
    """Driver-facing: can I use Taxi Hall right now? (zone competition gate)."""
    user = await get_current_user(request)
    driver = await db.drivers.find_one({"user_id": user["id"]}, {"_id": 0})
    if not driver:
        raise HTTPException(status_code=403, detail="Driver profile required")
    from core.geo_scope import resolve_zone_from_text
    from routes.config import get_app_settings_config
    zone = resolve_zone_from_text(pickup) if pickup else None
    enabled = bool((await get_app_settings_config(zone)).get("taxi_hail_option", True))
    elig = await _taxi_hall_eligibility(driver, zone)
    elig["enabled"] = enabled
    return elig


@router.post("/taxi-hall")
async def create_taxi_hall(request: Request):
    """V3Cube 'Taxi Hall': the driver picks up a street-hail client who doesn't use
    the app — enters destination + vehicle gamme and starts an immediate in-progress
    ride that behaves like a normal trip (metered, completed via the usual flow)."""
    user = await get_current_user(request)
    driver = await db.drivers.find_one({"user_id": user["id"]}, {"_id": 0})
    if not driver:
        raise HTTPException(status_code=403, detail="Driver profile required")
    from routes.config import get_app_settings_config
    th_cfg = await get_app_settings_config()
    if not th_cfg.get("taxi_hail_option", True):
        raise HTTPException(status_code=403, detail="Auto-stop désactivé par l'administrateur")
    cash_only = bool(th_cfg.get("taxi_hall_cash_only", True))
    body = await request.json()
    # Zone-aware competition gate (acceptance/cancellation thresholds per zone).
    from core.geo_scope import resolve_zone_from_text
    th_zone = resolve_zone_from_text(body.get("dropoff_address") or body.get("pickup_address") or "")
    elig = await _taxi_hall_eligibility(driver, th_zone)
    if not elig["eligible"]:
        raise HTTPException(status_code=403, detail=elig["reason"] or "Accès Taxi Hall refusé (zone de compétition).")
    now = datetime.now(timezone.utc).isoformat()
    vt_slug = body.get("vehicle_type", "sb")
    vtype = await db.vehicle_types.find_one({"slug": vt_slug}, {"_id": 0}) or {}
    # Street-client identity: if the entered phone matches an app account, link it
    # so the trip becomes a classic ride (history + re-engagement); else keep guest info.
    client_name = (body.get("client_name") or "").strip()
    client_phone = (body.get("client_phone") or "").strip()
    matched = None
    digits = re.sub(r"\D", "", client_phone)
    if len(digits) >= 6:
        suffix = digits[-8:]
        matched = await db.users.find_one(
            {"phone": {"$regex": re.escape(suffix) + r"\D*$"}, "role": "user"},
            {"_id": 0, "id": 1, "name": 1, "phone": 1},
        )
    passenger_name = (matched or {}).get("name") or client_name or "Client (hélé)"
    ride = {
        "id": f"ride_{uuid.uuid4().hex[:12]}",
        "booking_no": str(secrets.randbelow(90000000) + 10000000),
        "user_id": matched["id"] if matched else None,
        "client_matched": bool(matched),
        "guest_name": client_name or None,
        "guest_phone": client_phone or None,
        "driver_id": driver["id"],
        "driver_name": driver.get("user_name", user.get("name", "Chauffeur")),
        "status": "in_progress",
        "mode": "taxi_hall",
        "is_taxi_hall": True,
        "vehicle_type": vt_slug,
        "base_fare": vtype.get("base_fare", 0),
        "price_per_km": vtype.get("price_per_km", 0),
        "pickup_lat": body.get("pickup_lat"),
        "pickup_lng": body.get("pickup_lng"),
        "pickup_address": body.get("pickup_address") or "Position actuelle",
        "dropoff_lat": body.get("dropoff_lat"),
        "dropoff_lng": body.get("dropoff_lng"),
        "dropoff_address": body.get("dropoff_address") or "Destination",
        "distance_km": round(float(body.get("distance_km", 0) or 0), 2),
        "duration_mins": int(body.get("duration_mins", 0) or 0),
        "estimated_fare": round(float(body.get("estimated_fare", 0) or 0), 2),
        "payment_method": "cash" if cash_only else body.get("payment_method", "cash"),
        "passenger_name": passenger_name,
        "passenger_rating": 5.0,
        "created_at": now,
        "accepted_at": now,
        "started_at": now,
    }
    await db.rides.insert_one(ride)
    ride.pop("_id", None)
    return ride



@router.get("/pending/available")
async def get_available_rides(request: Request):
    """Get pending rides available for drivers to accept."""
    user = await get_current_user(request)
    driver = await db.drivers.find_one({"user_id": user["id"]})
    if not driver or driver["status"] != "approved":
        raise HTTPException(status_code=403, detail="Not an approved driver")

    # Only "taxi" drivers receive taxi ride requests
    svc = driver.get("service_types") or ["taxi", "delivery"]
    if "taxi" not in svc:
        return []

    rides = await db.rides.find(
        {"status": "pending"},
        {"_id": 0}
    ).sort("created_at", -1).limit(10).to_list(10)
    # Hide gammes reserved for a sub-category the driver isn't in (VTC/Taxi)
    restricted = await restricted_gammes_map()
    if restricted:
        rides = [r for r in rides if driver_sub_allowed(driver.get("taxi_sub"), restricted.get(r.get("vehicle_type")))]
    return rides


@router.post("/{ride_id}/rate")
async def rate_ride(ride_id: str, request: Request):
    user = await get_current_user(request)
    body = await request.json()
    ride = await db.rides.find_one({"id": ride_id, "user_id": user["id"], "status": "completed"})
    if not ride:
        raise HTTPException(status_code=404, detail="Ride not found or not completed")
    rating = {
        "id": f"rating_{uuid.uuid4().hex[:12]}",
        "user_id": user["id"],
        "driver_id": ride["driver_id"],
        "ride_id": ride_id,
        "rating": max(1, min(5, body.get("rating", 5))),
        "comment": body.get("comment"),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.ratings.insert_one(rating)
    if body.get("favorite_driver") and ride.get("driver_id"):
        await db.users.update_one({"id": user["id"]}, {"$addToSet": {"favorite_driver_ids": ride["driver_id"]}})
    pipeline = [
        {"$match": {"driver_id": ride["driver_id"]}},
        {"$group": {"_id": None, "avg": {"$avg": "$rating"}}}
    ]
    result = await db.ratings.aggregate(pipeline).to_list(1)
    avg = result[0]["avg"] if result else 5.0
    await db.drivers.update_one({"id": ride["driver_id"]}, {"$set": {"rating": round(avg, 2)}})
    return {"message": "Rating submitted"}


@router.post("/{ride_id}/rate-passenger")
async def rate_passenger(ride_id: str, request: Request):
    """Driver rates the passenger after completing the trip (V3Cube 'Laisser un commentaire')."""
    user = await get_current_user(request)
    driver = await db.drivers.find_one({"user_id": user["id"]}, {"_id": 0, "id": 1})
    ride = await db.rides.find_one({"id": ride_id}, {"_id": 0, "driver_id": 1, "user_id": 1})
    if not ride:
        raise HTTPException(status_code=404, detail="Ride not found")
    if not driver or ride.get("driver_id") != driver["id"]:
        raise HTTPException(status_code=403, detail="Only the assigned driver can rate the passenger")
    body = await request.json()
    pr = {
        "id": f"prating_{uuid.uuid4().hex[:12]}",
        "driver_id": driver["id"],
        "user_id": ride["user_id"],
        "ride_id": ride_id,
        "rating": max(1, min(5, int(body.get("rating", 5)))),
        "comment": body.get("comment"),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.passenger_ratings.insert_one(pr)
    pipeline = [
        {"$match": {"user_id": ride["user_id"]}},
        {"$group": {"_id": None, "avg": {"$avg": "$rating"}}},
    ]
    result = await db.passenger_ratings.aggregate(pipeline).to_list(1)
    avg = result[0]["avg"] if result else 5.0
    await db.users.update_one({"id": ride["user_id"]}, {"$set": {"passenger_rating": round(avg, 2)}})
    return {"message": "Passenger rated"}


# ===== NEGOTIATION / COUNTER-OFFERS =====

@router.post("/{ride_id}/counter-offer")
async def driver_counter_offer(ride_id: str, request: Request):
    """Driver proposes a different fare for a pending ride (negotiation)."""
    user = await get_current_user(request)
    if user["role"] != "driver":
        raise HTTPException(status_code=403, detail="Driver only")
    driver = await db.drivers.find_one({"user_id": user["id"]}, {"_id": 0})
    if not driver:
        raise HTTPException(status_code=404, detail="Driver profile not found")

    ride = await db.rides.find_one({"id": ride_id}, {"_id": 0})
    if not ride:
        raise HTTPException(status_code=404, detail="Ride not found")
    if ride.get("status") != "pending":
        raise HTTPException(status_code=400, detail="Ride is no longer pending")

    # ── Driver sub-category gating (same rule as direct accept) ──
    vtype_doc = await db.vehicle_types.find_one(
        {"slug": ride.get("vehicle_type")}, {"_id": 0, "allowed_taxi_subs": 1}
    )
    allowed_subs = gamme_restricted_subs(vtype_doc)
    if not driver_sub_allowed(driver.get("taxi_sub"), allowed_subs):
        labels = " / ".join(TAXI_SUB_LABELS.get(s, s) for s in sorted(allowed_subs))
        raise HTTPException(
            status_code=403,
            detail=f"Cette course est réservée aux chauffeurs {labels}.",
        )

    body = await request.json()
    amount = float(body.get("amount", 0))
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Invalid amount")

    from routes.taxi_configs import get_taxi_config
    bid_cfg = await get_taxi_config("taxi_bid")
    ttl = int(bid_cfg.get("offer_ttl_seconds", OFFER_TTL_SECONDS))

    # Flag offers that match the passenger's proposed fare exactly ("Votre tarif")
    proposed = ride.get("proposed_fare")
    at_proposed_fare = bool(proposed) and abs(amount - float(proposed)) < 0.01

    # Driver photo + distance/ETA to the pickup (so the passenger's bidding list
    # mirrors the V3Cube "Demander" screen: photo, rating, ETA, km, price).
    driver_photo = (
        user.get("avatar_url") or user.get("photo")
        or driver.get("photo_url") or driver.get("selfie_url")
    )
    distance_km = None
    eta_min = None
    d_lat, d_lng = driver.get("current_lat"), driver.get("current_lng")
    p_lat, p_lng = ride.get("pickup_lat"), ride.get("pickup_lng")
    if None not in (d_lat, d_lng, p_lat, p_lng):
        R, to_rad = 6371.0, math.radians
        dlat, dlng = to_rad(p_lat - d_lat), to_rad(p_lng - d_lng)
        h = (math.sin(dlat / 2) ** 2
             + math.cos(to_rad(d_lat)) * math.cos(to_rad(p_lat)) * math.sin(dlng / 2) ** 2)
        distance_km = round(R * 2 * math.atan2(math.sqrt(h), math.sqrt(1 - h)), 2)
        eta_min = max(1, round((distance_km / 22) * 60) + 1)

    offer = {
        "id": f"off_{uuid.uuid4().hex[:8]}",
        "driver_id": driver["id"],
        "driver_name": user.get("name", "Chauffeur"),
        "driver_rating": driver.get("rating", 5.0),
        "driver_vehicle_model": driver.get("vehicle_model"),
        "driver_vehicle_number": driver.get("vehicle_number"),
        "driver_photo": driver_photo,
        "distance_km": distance_km,
        "eta_min": eta_min,
        "amount": amount,
        "at_proposed_fare": at_proposed_fare,
        "status": "pending",  # pending | accepted | rejected
        "created_at": datetime.now(timezone.utc).isoformat(),
        "expires_at": (datetime.now(timezone.utc) + timedelta(seconds=ttl)).isoformat(),
        "ttl_seconds": ttl,
    }

    # Prevent the same driver from spamming offers: replace previous pending
    await db.rides.update_one(
        {"id": ride_id},
        {"$pull": {"counter_offers": {"driver_id": driver["id"], "status": "pending"}}},
    )
    await db.rides.update_one(
        {"id": ride_id},
        {"$push": {"counter_offers": offer}},
    )

    # Notify the passenger via WS room
    await manager.send_to_ride_room(ride_id, {
        "type": "counter_offer",
        "ride_id": ride_id,
        "offer": offer,
    })

    return {"message": "Offer sent", "offer": offer}


@router.post("/{ride_id}/accept-offer/{offer_id}")
async def passenger_accept_offer(ride_id: str, offer_id: str, request: Request):
    """Passenger accepts a driver's counter-offer → ride starts."""
    user = await get_current_user(request)
    ride = await db.rides.find_one({"id": ride_id}, {"_id": 0})
    if not ride:
        raise HTTPException(status_code=404, detail="Ride not found")
    if ride["user_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Not your ride")
    if ride.get("status") != "pending":
        raise HTTPException(status_code=400, detail="Ride is no longer pending")

    offers = ride.get("counter_offers") or []
    offer = next((o for o in offers if o["id"] == offer_id and o["status"] == "pending"), None)
    if not offer:
        raise HTTPException(status_code=404, detail="Offer not found")

    # Reject expired offers (driver counter-offers live for OFFER_TTL_SECONDS)
    exp = offer.get("expires_at")
    if exp:
        try:
            if datetime.fromisoformat(exp) < datetime.now(timezone.utc):
                await db.rides.update_one(
                    {"id": ride_id, "counter_offers.id": offer_id},
                    {"$set": {"counter_offers.$.status": "expired"}},
                )
                raise HTTPException(status_code=400, detail="Cette offre a expiré")
        except ValueError:
            pass

    driver = await db.drivers.find_one({"id": offer["driver_id"]}, {"_id": 0})
    if not driver:
        raise HTTPException(status_code=404, detail="Driver not found")
    driver_user = await db.users.find_one({"id": driver["user_id"]}, {"_id": 0})

    now = datetime.now(timezone.utc).isoformat()

    # Mark offer accepted, reject others, assign driver and switch ride to accepted
    await db.rides.update_one({"id": ride_id, "counter_offers.id": offer_id}, {"$set": {"counter_offers.$.status": "accepted"}})
    claimed = await db.rides.find_one_and_update(
        {"id": ride_id, "status": "pending", "driver_id": None},
        {
            "$set": {
                "driver_id": driver["id"],
                "status": "accepted",
                "accepted_at": now,
                "estimated_fare": offer["amount"],
                "driver_name": (driver_user or {}).get("name", offer.get("driver_name")),
                "driver_phone": (driver_user or {}).get("phone"),
                "driver_rating": driver.get("rating", 5.0),
                "driver_vehicle_model": driver.get("vehicle_model"),
                "driver_vehicle_number": driver.get("vehicle_number"),
            },
        },
    )
    if not claimed:
        raise HTTPException(status_code=409, detail="Cette course a déjà été attribuée")
    # Reject remaining pending offers
    await db.rides.update_one(
        {"id": ride_id},
        {"$set": {"counter_offers.$[elem].status": "rejected"}},
        array_filters=[{"elem.id": {"$ne": offer_id}, "elem.status": "pending"}],
    )

    # Award points to accepting driver (same logic as accept_ride)
    points_cfg = await _get_driver_points_cfg()
    gain = int(points_cfg.get("points_per_ride_accepted", 2))
    current_points = driver.get("points", points_cfg["initial_points"])
    new_points = min(100, current_points + gain)
    await db.drivers.update_one(
        {"id": driver["id"]},
        {"$set": {"points": new_points}, "$inc": {"offered_count": 1, "accepted_count": 1}},
    )

    # Notify driver via WS + ride room
    await manager.send_to_ride_room(ride_id, {
        "type": "offer_accepted",
        "ride_id": ride_id,
        "offer_id": offer_id,
        "driver_id": driver["id"],
    })

    return {"message": "Offer accepted", "ride_id": ride_id, "final_fare": offer["amount"]}


@router.get("/bidding/avg-fares")
async def bidding_avg_fares(request: Request):
    """Average ACCEPTED bidding fare per vehicle type over the last 30 days.
    Helps riders propose a fair price on the enchère flow (and lifts acceptance)."""
    await get_current_user(request)
    since = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
    pipeline = [
        {"$match": {
            "ride_type": "bidding",
            "status": {"$in": ["accepted", "arriving", "in_progress", "completed"]},
            "created_at": {"$gte": since},
        }},
        {"$group": {
            "_id": {"$toLower": "$vehicle_type"},
            "avg": {"$avg": {"$ifNull": ["$final_fare", "$estimated_fare"]}},
            "n": {"$sum": 1},
        }},
    ]
    rows = await db.rides.aggregate(pipeline).to_list(50)
    fares = {r["_id"]: round(float(r["avg"]), 2) for r in rows if r.get("_id") and r.get("avg")}
    counts = {r["_id"]: r["n"] for r in rows if r.get("_id")}
    return {"fares": fares, "counts": counts, "sample_days": 30}



@router.post("/{ride_id}/reject-offer/{offer_id}")
async def passenger_reject_offer(ride_id: str, offer_id: str, request: Request):
    """Passenger refuses a driver's bid/counter-offer. Marks it rejected (so it
    drops out of the passenger's chooser list) and notifies the driver. Other
    drivers keep competing — the ride stays pending."""
    user = await get_current_user(request)
    ride = await db.rides.find_one({"id": ride_id}, {"_id": 0, "user_id": 1, "status": 1})
    if not ride:
        raise HTTPException(status_code=404, detail="Ride not found")
    if ride["user_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Not your ride")
    res = await db.rides.update_one(
        {"id": ride_id, "counter_offers.id": offer_id},
        {"$set": {"counter_offers.$.status": "rejected"}},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Offer not found")
    # Let the driver know their bid was declined (best-effort).
    await manager.send_to_ride_room(ride_id, {
        "type": "offer_rejected",
        "ride_id": ride_id,
        "offer_id": offer_id,
    })
    return {"message": "Offer rejected", "offer_id": offer_id}


async def _get_driver_points_cfg():
    from routes.drivers import _get_rewards_points_config
    return await _get_rewards_points_config()


# ============================================================
# Pack A — Taxi Avance V3Cube : Scheduled rides management
# ============================================================

@router.get("/scheduled/list")
async def list_scheduled_rides(request: Request):
    """List the current user's upcoming scheduled rides (Ride Later)."""
    user = await get_current_user(request)
    now_iso = datetime.now(timezone.utc).isoformat()
    cursor = db.rides.find(
        {
            "user_id": user["id"],
            "scheduled_at": {"$ne": None, "$gte": now_iso},
            "status": {"$in": ["pending", "accepted"]},
        },
        {"_id": 0},
    ).sort("scheduled_at", 1)
    items = await cursor.to_list(100)
    return {"items": items, "count": len(items)}


@router.put("/{ride_id}/reschedule")
async def reschedule_ride(ride_id: str, request: Request):
    """Reschedule a pending scheduled ride to a new datetime."""
    user = await get_current_user(request)
    body = await request.json()
    new_at = body.get("scheduled_at")
    if not new_at:
        raise HTTPException(status_code=400, detail="scheduled_at required")
    ride = await db.rides.find_one({"id": ride_id, "user_id": user["id"]}, {"_id": 0})
    if not ride:
        raise HTTPException(status_code=404, detail="Ride not found")
    if ride.get("status") not in ("pending", "accepted"):
        raise HTTPException(status_code=400, detail="Cannot reschedule a ride in this state")
    now_iso = datetime.now(timezone.utc).isoformat()
    updates = {"scheduled_at": new_at, "rescheduled_at": now_iso}
    # Mark as a "no driver found" outcome only when the ride had been re-broadcast (relances)
    if int(ride.get("relance_count") or 0) > 0:
        updates["no_driver_outcome"] = "scheduled"
        updates["no_driver_at"] = now_iso
    await db.rides.update_one({"id": ride_id}, {"$set": updates})
    if updates.get("no_driver_outcome") == "scheduled":
        await maybe_create_zone_alert(ride.get("pickup_address"), "scheduled")
    return {"message": "Rescheduled", "ride_id": ride_id, "scheduled_at": new_at}


@router.post("/airport-multipliers")
async def airport_multipliers(request: Request):
    """Return airport fare multiplier config (V3Cube parity)."""
    cfg = await db.app_configurations.find_one(
        {"key": "airport_pricing"}, {"_id": 0, "value": 1}
    ) or {}
    return cfg.get("value") or {
        "multiplier": 1.25,
        "min_fare": 25.0,
        "waiting_fee_per_min": 0.5,
        "currency": "EUR",
    }


@router.post("/rental-packages")
async def rental_packages(request: Request):
    """Return available rental packages (hourly / km bundles)."""
    cfg = await db.app_configurations.find_one(
        {"key": "rental_packages"}, {"_id": 0, "value": 1}
    ) or {}
    return cfg.get("value") or {
        "packages": [
            {"slug": "2h_20km", "label": "2h / 20 km", "hours": 2, "km": 20, "price": 40},
            {"slug": "4h_40km", "label": "4h / 40 km", "hours": 4, "km": 40, "price": 75},
            {"slug": "8h_80km", "label": "8h / 80 km", "hours": 8, "km": 80, "price": 140},
        ],
        "currency": "EUR",
    }

