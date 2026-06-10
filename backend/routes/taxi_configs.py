"""
Taxi sub-configs (V3Cube): Rental Packages, Personal Driver, Taxi Bid Service,
Manage Ride Profiles. Stored in service_configs; consumed by the client Taxi Hub
and the bidding flow. Admin CRUD + a single public getter.
"""
from fastapi import APIRouter, Request, HTTPException
from datetime import datetime, timezone

from core.config import db
from core.deps import require_role

router = APIRouter(prefix="/admin/taxi-configs", tags=["taxi-configs"])
public_router = APIRouter(prefix="/config", tags=["taxi-configs-public"])

DEFAULTS = {
    "rental_packages": {
        "packages": [
            {"slug": "2h_20km", "label": "2h", "km": 20, "hours": 2, "price": 36, "extra_hour_rate": 18, "extra_km_rate": 0.8},
            {"slug": "4h_40km", "label": "4h", "km": 40, "hours": 4, "price": 72, "extra_hour_rate": 18, "extra_km_rate": 0.8},
            {"slug": "8h_80km", "label": "8h", "km": 80, "hours": 8, "price": 144, "extra_hour_rate": 18, "extra_km_rate": 0.8},
            {"slug": "journee", "label": "Journée", "km": 100, "hours": 10, "price": 170, "extra_hour_rate": 18, "extra_km_rate": 0.8},
        ],
    },
    "personal_driver": {
        "enabled": True,
        "hourly_rate": 20,
        "durations": [1, 2, 4, 8],
    },
    "taxi_bid": {
        "enabled": True,
        "offer_ttl_seconds": 30,
        "min_increment": 1,
        "suggested_increases": [1, 2, 5],
    },
    "ride_profiles": {
        "allow_book_for_other": True,
        "allow_female_driver": True,
        "allow_handicap": True,
        "allow_pets": True,
    },
}

VALID_KEYS = set(DEFAULTS.keys())


async def get_taxi_config(key):
    if key not in VALID_KEYS:
        return {}
    doc = await db.service_configs.find_one({"service_key": key}, {"_id": 0})
    settings = (doc or {}).get("settings") or {}
    return {**DEFAULTS[key], **settings}


@public_router.get("/taxi-options")
async def get_taxi_options():
    """Public: all taxi sub-configs merged with defaults (for the client app)."""
    out = {}
    for k in VALID_KEYS:
        out[k] = await get_taxi_config(k)
    return out


@router.get("/{key}")
async def admin_get_taxi_config(key: str, request: Request):
    await require_role(request, ["admin"], permission="server.settings.edit")
    if key not in VALID_KEYS:
        raise HTTPException(status_code=404, detail="Unknown config key")
    return await get_taxi_config(key)


@router.put("/{key}")
async def admin_put_taxi_config(key: str, request: Request):
    await require_role(request, ["admin"], permission="server.settings.edit")
    if key not in VALID_KEYS:
        raise HTTPException(status_code=404, detail="Unknown config key")
    body = await request.json()
    settings = body.get("settings", body)
    await db.service_configs.update_one(
        {"service_key": key},
        {"$set": {"service_key": key, "settings": settings, "updated_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True,
    )
    return await get_taxi_config(key)
