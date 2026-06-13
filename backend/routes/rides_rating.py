"""Ride rating endpoints (extracted from routes/rides.py — Phase 4).

Passenger rates the driver and driver rates the passenger. Both update the
running average on the rated party. Self-contained leaf endpoints.
"""
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Request, HTTPException

from core.config import db
from core.deps import get_current_user

router = APIRouter(prefix="/rides", tags=["rides"])


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
        # Persist into the favorite_drivers collection (same store the favorites
        # page reads), enforcing the max-2 rule. Silently ignore if already at max.
        already = await db.favorite_drivers.find_one(
            {"user_id": user["id"], "driver_id": ride["driver_id"]}, {"_id": 0, "id": 1})
        if not already and await db.favorite_drivers.count_documents({"user_id": user["id"]}) < 2:
            drv = await db.drivers.find_one({"id": ride["driver_id"]}, {"_id": 0, "user_id": 1})
            drv_user = await db.users.find_one({"id": (drv or {}).get("user_id")}, {"_id": 0, "name": 1}) if drv else None
            await db.favorite_drivers.update_one(
                {"user_id": user["id"], "driver_id": ride["driver_id"]},
                {"$setOnInsert": {
                    "id": f"fav_{uuid.uuid4().hex[:10]}",
                    "user_id": user["id"],
                    "driver_id": ride["driver_id"],
                    "driver_name": (drv_user or {}).get("name", "Chauffeur"),
                    "created_at": datetime.now(timezone.utc).isoformat(),
                }},
                upsert=True,
            )
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
