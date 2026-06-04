"""
Dynamic pricing (V3Cube "AI Dynamic Surge" + "Weather Surcharge").
Both adjustments are applied to the computed fare in /rides/estimate and
when creating a ride. Configs are stored in service_configs.
"""
from fastapi import APIRouter, Request, HTTPException
from datetime import datetime, timezone

from core.config import db
from core.deps import require_role, calculate_distance

router = APIRouter(prefix="/admin/pricing", tags=["pricing"])

DEFAULT_SURGE = {
    "enabled": False,
    "mode": "auto",            # auto (demand-based) | manual
    "manual_multiplier": 1.5,
    "max_multiplier": 3.0,
    "radius_km": 5,
    # auto tiers: applied when demand_ratio >= min_ratio (pending rides / online drivers)
    "tiers": [
        {"min_ratio": 1.0, "multiplier": 1.2},
        {"min_ratio": 2.0, "multiplier": 1.5},
        {"min_ratio": 3.0, "multiplier": 2.0},
    ],
}

DEFAULT_WEATHER = {
    "enabled": False,
    "active_now": False,       # admin manual switch (bad weather currently active)
    "type": "percent",         # percent | flat
    "amount": 15,              # 15% or 15 EUR
    "condition_label": "Pluie / intempéries",
}


async def _get_cfg(key, defaults):
    doc = await db.service_configs.find_one({"service_key": key}, {"_id": 0})
    settings = (doc or {}).get("settings") or {}
    return {**defaults, **settings}


async def get_surge_config():
    return await _get_cfg("dynamic_surge", DEFAULT_SURGE)


async def get_weather_config():
    return await _get_cfg("weather_surcharge", DEFAULT_WEATHER)


async def _compute_surge_multiplier(surge, lat, lng):
    if not surge.get("enabled"):
        return 1.0
    if surge.get("mode") == "manual":
        return min(float(surge.get("manual_multiplier", 1.0)), float(surge.get("max_multiplier", 3.0)))
    # auto: demand ratio = pending rides nearby / online drivers nearby
    radius = float(surge.get("radius_km", 5))
    pending = await db.rides.find({"status": "pending"}, {"_id": 0, "pickup_lat": 1, "pickup_lng": 1}).to_list(500)
    drivers = await db.drivers.find({"is_online": True}, {"_id": 0, "current_lat": 1, "current_lng": 1}).to_list(500)
    near_pending = sum(1 for r in pending if r.get("pickup_lat") and calculate_distance(lat, lng, r["pickup_lat"], r["pickup_lng"]) <= radius)
    near_drivers = sum(1 for d in drivers if d.get("current_lat") and calculate_distance(lat, lng, d["current_lat"], d["current_lng"]) <= radius)
    ratio = near_pending / (near_drivers + 1)
    mult = 1.0
    for tier in sorted(surge.get("tiers", []), key=lambda t: t.get("min_ratio", 0)):
        if ratio >= tier.get("min_ratio", 0):
            mult = float(tier.get("multiplier", 1.0))
    return min(mult, float(surge.get("max_multiplier", 3.0)))


async def compute_pricing_adjustment(base_fare, lat, lng):
    """Returns {fare, surge_multiplier, weather_surcharge, reasons[]} applying
    both Dynamic Surge and Weather Surcharge to base_fare."""
    surge = await get_surge_config()
    weather = await get_weather_config()
    reasons = []

    fare = float(base_fare or 0)
    multiplier = 1.0
    if lat is not None and lng is not None:
        multiplier = await _compute_surge_multiplier(surge, lat, lng)
    if multiplier > 1.0:
        fare = round(fare * multiplier, 2)
        reasons.append(f"Tarif majoré x{multiplier:g} (forte demande)")

    weather_surcharge = 0.0
    if weather.get("enabled") and weather.get("active_now"):
        amt = float(weather.get("amount", 0))
        if weather.get("type") == "flat":
            weather_surcharge = round(amt, 2)
        else:
            weather_surcharge = round(fare * amt / 100, 2)
        if weather_surcharge > 0:
            fare = round(fare + weather_surcharge, 2)
            label = weather.get("condition_label") or "Intempéries"
            reasons.append(f"Supplément météo ({label}) +{weather_surcharge:.2f} €")

    return {
        "fare": fare,
        "surge_multiplier": multiplier,
        "weather_surcharge": weather_surcharge,
        "reasons": reasons,
    }


# ── Admin endpoints ───────────────────────────────────────────────────────
@router.get("/surge")
async def get_surge(request: Request):
    await require_role(request, ["admin"], permission="server.settings.edit")
    return await get_surge_config()


@router.put("/surge")
async def put_surge(request: Request):
    await require_role(request, ["admin"], permission="server.settings.edit")
    body = await request.json()
    settings = body.get("settings", body)
    await db.service_configs.update_one(
        {"service_key": "dynamic_surge"},
        {"$set": {"service_key": "dynamic_surge", "settings": settings, "updated_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True,
    )
    return await get_surge_config()


@router.get("/weather")
async def get_weather(request: Request):
    await require_role(request, ["admin"], permission="server.settings.edit")
    return await get_weather_config()


@router.put("/weather")
async def put_weather(request: Request):
    await require_role(request, ["admin"], permission="server.settings.edit")
    body = await request.json()
    settings = body.get("settings", body)
    await db.service_configs.update_one(
        {"service_key": "weather_surcharge"},
        {"$set": {"service_key": "weather_surcharge", "settings": settings, "updated_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True,
    )
    return await get_weather_config()
