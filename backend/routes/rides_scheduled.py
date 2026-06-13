"""Rides — scheduled (Ride Later) management endpoints.

Extracted from rides.py (Phase 5 refactor). Behaviour unchanged; same `/rides`
prefix.
"""
import asyncio
from datetime import datetime, timezone

from fastapi import APIRouter, Request, HTTPException

from core.config import db
from core.deps import get_current_user
from core.zone_alerts import maybe_create_zone_alert

router = APIRouter(prefix="/rides", tags=["rides"])


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

    # Airport rides: optionally re-track a NEW flight (Flight Watch) in one step.
    is_airport = ride.get("ride_type") == "airport"
    new_flight = body.get("flight_number")
    if is_airport:
        from core.airport import simulate_flight_status, refresh_flight_for_ride
        if new_flight is not None:
            updates["flight_number"] = (new_flight or "").strip().upper() or None
        fn_to_track = updates.get("flight_number", ride.get("flight_number"))
        if fn_to_track:
            fs = simulate_flight_status(fn_to_track, new_at)  # instant seed
            updates["flight_status"] = fs
            if fs and fs.get("adjusted_pickup"):
                updates["scheduled_at"] = fs["adjusted_pickup"]
        else:
            updates["flight_status"] = None

    # Mark as a "no driver found" outcome only when the ride had been re-broadcast (relances)
    if int(ride.get("relance_count") or 0) > 0:
        updates["no_driver_outcome"] = "scheduled"
        updates["no_driver_at"] = now_iso
    await db.rides.update_one({"id": ride_id}, {"$set": updates})
    # Background: re-sync real flight data for the (possibly new) flight.
    if is_airport and updates.get("flight_number", ride.get("flight_number")):
        from core.airport import refresh_flight_for_ride
        asyncio.create_task(refresh_flight_for_ride({**ride, **updates}))
    if updates.get("no_driver_outcome") == "scheduled":
        await maybe_create_zone_alert(ride.get("pickup_address"), "scheduled")
    return {"message": "Rescheduled", "ride_id": ride_id, "scheduled_at": updates["scheduled_at"], "flight_number": updates.get("flight_number", ride.get("flight_number"))}
