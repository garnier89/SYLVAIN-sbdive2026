"""Rides — Taxi Hall (street-hail) endpoints.

Extracted from rides.py (Phase 5 refactor). Behaviour unchanged: same `/rides`
prefix; the competition-gate helper lives here as it is only used by Taxi Hall.
"""
import re
import uuid
import secrets
from datetime import datetime, timezone

from fastapi import APIRouter, Request, HTTPException

from core.config import db
from core.deps import get_current_user

router = APIRouter(prefix="/rides", tags=["rides"])


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
