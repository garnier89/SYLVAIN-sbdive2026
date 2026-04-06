from fastapi import APIRouter, Request, HTTPException
import uuid
from datetime import datetime, timezone
from typing import Optional

from core.config import db
from core.deps import get_current_user

router = APIRouter(prefix="/carpool", tags=["carpool"])


@router.post("/rides")
async def create_carpool_ride(request: Request):
    user = await get_current_user(request)
    body = await request.json()

    ride = {
        "id": f"carpool_{uuid.uuid4().hex[:12]}",
        "driver_id": user["id"],
        "driver_name": user["name"],
        "pickup_address": body["pickup_address"],
        "dropoff_address": body["dropoff_address"],
        "departure_date": body["departure_date"],
        "available_seats": body.get("available_seats", 3),
        "price_per_seat": body.get("price_per_seat", 10.0),
        "currency": "EUR",
        "status": "open",
        "passengers": [],
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.carpool_rides.insert_one(ride)
    ride.pop("_id", None)
    return ride


@router.get("/rides")
async def search_carpool_rides(
    pickup: Optional[str] = None,
    dropoff: Optional[str] = None,
    date: Optional[str] = None,
    limit: int = 20
):
    query = {"status": "open"}
    if pickup:
        query["pickup_address"] = {"$regex": pickup, "$options": "i"}
    if dropoff:
        query["dropoff_address"] = {"$regex": dropoff, "$options": "i"}
    if date:
        query["departure_date"] = date

    rides = await db.carpool_rides.find(query, {"_id": 0}).sort("departure_date", 1).limit(limit).to_list(limit)
    return rides


@router.post("/rides/{ride_id}/book")
async def book_carpool_seat(ride_id: str, request: Request):
    user = await get_current_user(request)
    ride = await db.carpool_rides.find_one({"id": ride_id, "status": "open"})
    if not ride:
        raise HTTPException(status_code=404, detail="Ride not found")
    if ride["driver_id"] == user["id"]:
        raise HTTPException(status_code=400, detail="Cannot book your own ride")
    if len(ride.get("passengers", [])) >= ride["available_seats"]:
        raise HTTPException(status_code=400, detail="No seats available")
    if any(p["user_id"] == user["id"] for p in ride.get("passengers", [])):
        raise HTTPException(status_code=400, detail="Already booked")

    passenger = {"user_id": user["id"], "name": user["name"], "booked_at": datetime.now(timezone.utc).isoformat()}
    await db.carpool_rides.update_one({"id": ride_id}, {"$push": {"passengers": passenger}})

    updated = await db.carpool_rides.find_one({"id": ride_id})
    if len(updated.get("passengers", [])) >= updated["available_seats"]:
        await db.carpool_rides.update_one({"id": ride_id}, {"$set": {"status": "full"}})

    return {"message": "Seat booked successfully"}


@router.get("/my-rides")
async def my_carpool_rides(request: Request):
    user = await get_current_user(request)
    as_driver = await db.carpool_rides.find({"driver_id": user["id"]}, {"_id": 0}).sort("departure_date", -1).to_list(50)
    as_passenger = await db.carpool_rides.find({"passengers.user_id": user["id"]}, {"_id": 0}).sort("departure_date", -1).to_list(50)
    return {"as_driver": as_driver, "as_passenger": as_passenger}
