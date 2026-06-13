"""Rides — driver discovery & feed endpoints.

Extracted from rides.py (Phase 5 refactor). Behaviour is unchanged: this router
shares the same `/rides` prefix and reuses the helpers that remain defined in
routes.rides (single source of truth for ride logic).
"""
from fastapi import APIRouter, Request, HTTPException
from datetime import datetime, timezone

from core.config import db
from core.deps import get_current_user, calculate_distance
from core.websocket import manager
from routes.rides import (
    NEARBY_DRIVERS_RADIUS_KM,
    enrich_passenger_info,
    _expire_dead_pending_rides,
    restricted_gammes_map,
    driver_sub_allowed,
)

router = APIRouter(prefix="/rides", tags=["rides"])


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


@router.get("/driver/bookings")
async def driver_bookings(request: Request):
    """V3Cube 'Mes réservations' for a driver: available pending rides (to accept),
    upcoming rides assigned to this driver (to start), and live bidding rides."""
    user = await get_current_user(request)
    driver = await db.drivers.find_one({"user_id": user["id"]}, {"_id": 0, "id": 1})
    if not driver:
        raise HTTPException(status_code=403, detail="Driver profile required")
    did = driver["id"]

    # Erase rides/reservations/bids that can no longer be served, so they stop
    # showing up in the list (and stop returning "déjà prise ou indisponible").
    await _expire_dead_pending_rides()

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
