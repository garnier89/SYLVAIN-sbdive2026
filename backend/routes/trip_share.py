"""Secure live trip sharing (safety tool).

A rider OR the assigned driver can generate a public, token-gated link. Anyone
with the link sees the trip LIVE until it ends: client + driver identity,
vehicle, full route and the driver's live position. Phone numbers ARE shown in
clear here (this is a safety feature) even though they stay masked inside the app.
"""
import secrets
from datetime import datetime, timezone

from fastapi import APIRouter, Request, HTTPException

from core.config import db
from core.deps import get_current_user
from core.websocket import manager

router = APIRouter(tags=["trip-share"])

ENDED_STATUSES = {"completed", "cancelled", "canceled", "expired", "no_driver"}


@router.post("/rides/{ride_id}/share")
async def create_trip_share(ride_id: str, request: Request):
    user = await get_current_user(request)
    ride = await db.rides.find_one({"id": ride_id}, {"_id": 0})
    if not ride:
        raise HTTPException(404, "Course introuvable")

    is_rider = ride.get("user_id") == user["id"]
    is_driver = False
    if user.get("role") == "driver":
        drv = await db.drivers.find_one({"user_id": user["id"]}, {"_id": 0, "id": 1})
        is_driver = bool(drv) and ride.get("driver_id") == drv["id"]
    if not (is_rider or is_driver):
        raise HTTPException(403, "Non autorisé à partager cette course")

    existing = await db.trip_shares.find_one(
        {"ride_id": ride_id, "created_by": user["id"]}, {"_id": 0, "token": 1})
    if existing:
        return {"token": existing["token"]}

    token = secrets.token_urlsafe(9)
    await db.trip_shares.insert_one({
        "token": token,
        "ride_id": ride_id,
        "created_by": user["id"],
        "created_by_role": "driver" if is_driver else "rider",
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return {"token": token}


@router.get("/trip-share/{token}")
async def get_trip_share(token: str):
    """PUBLIC — live snapshot of a shared trip (no auth)."""
    share = await db.trip_shares.find_one({"token": token}, {"_id": 0})
    if not share:
        raise HTTPException(404, "Lien de suivi invalide ou expiré")
    ride = await db.rides.find_one({"id": share["ride_id"]}, {"_id": 0})
    if not ride:
        raise HTTPException(404, "Course introuvable")

    status = ride.get("status")
    active = status not in ENDED_STATUSES

    rider = await db.users.find_one({"id": ride.get("user_id")}, {"_id": 0, "name": 1, "phone": 1}) or {}

    driver = None
    vehicle = None
    driver_pos = None
    if ride.get("driver_id"):
        drv = await db.drivers.find_one({"id": ride["driver_id"]}, {"_id": 0}) or {}
        duser = {}
        if drv.get("user_id"):
            duser = await db.users.find_one(
                {"id": drv["user_id"]}, {"_id": 0, "name": 1, "avatar_url": 1, "phone": 1}) or {}
            loc = manager.get_driver_location(drv["user_id"]) or {}
            lat = loc.get("lat", drv.get("current_lat"))
            lng = loc.get("lng", drv.get("current_lng"))
            if lat and lng:
                driver_pos = {"lat": lat, "lng": lng}
        driver = {
            "name": ride.get("driver_name") or duser.get("name"),
            "phone": ride.get("driver_phone") or duser.get("phone") or drv.get("user_phone"),
            "photo": duser.get("avatar_url"),
            "rating": ride.get("driver_rating") or drv.get("rating"),
        }
        vehicle = {
            "number": drv.get("vehicle_number") or ride.get("driver_vehicle_number"),
            "model": drv.get("vehicle_model") or ride.get("driver_vehicle_model"),
            "color": drv.get("vehicle_color"),
            "brand": drv.get("vehicle_brand") or drv.get("vehicle_make"),
        }

    return {
        "active": active,
        "status": status,
        "shared_by": share.get("created_by_role", "rider"),
        "ride": {
            "id": ride["id"],
            "status": status,
            "pickup_address": ride.get("pickup_address"),
            "dropoff_address": ride.get("dropoff_address"),
            "pickup_lat": ride.get("pickup_lat"), "pickup_lng": ride.get("pickup_lng"),
            "dropoff_lat": ride.get("dropoff_lat"), "dropoff_lng": ride.get("dropoff_lng"),
            "stops": ride.get("stops", []),
            "route_polyline": ride.get("route_polyline"),
            "vehicle_type": ride.get("vehicle_type"),
            "driver_lat": driver_pos["lat"] if driver_pos else None,
            "driver_lng": driver_pos["lng"] if driver_pos else None,
        },
        "driver_pos": driver_pos,
        "client": {"name": rider.get("name"), "phone": rider.get("phone")},
        "driver": driver,
        "vehicle": vehicle,
    }
