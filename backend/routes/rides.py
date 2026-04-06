from fastapi import APIRouter, Request, HTTPException
import uuid
import secrets
from datetime import datetime, timezone
from typing import Optional

from core.config import db
from core.deps import get_current_user, calculate_distance, calculate_fare
from models.schemas import RideRequest, RideResponse
from core.websocket import manager

router = APIRouter(prefix="/rides", tags=["rides"])


@router.post("/estimate")
async def estimate_ride(data: RideRequest):
    distance = calculate_distance(data.pickup_lat, data.pickup_lng, data.dropoff_lat, data.dropoff_lng)
    duration = int(distance * 3)
    # Look up vehicle type from DB for V3Cube pricing
    vtype_doc = await db.vehicle_types.find_one({"slug": data.vehicle_type, "status": "active"}, {"_id": 0})
    fare = calculate_fare(distance, data.vehicle_type, duration, vtype_doc)
    result = {
        "distance_km": round(distance, 2),
        "duration_mins": duration,
        "estimated_fare": fare,
        "vehicle_type": data.vehicle_type,
        "currency": "EUR",
    }
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
    distance = calculate_distance(data.pickup_lat, data.pickup_lng, data.dropoff_lat, data.dropoff_lng)
    duration = int(distance * 3)
    vtype_doc = await db.vehicle_types.find_one({"slug": data.vehicle_type, "status": "active"}, {"_id": 0})
    fare = calculate_fare(distance, data.vehicle_type, duration, vtype_doc)
    otp = str(secrets.randbelow(10000)).zfill(4)

    ride = {
        "id": f"ride_{uuid.uuid4().hex[:12]}", "user_id": user["id"], "driver_id": None,
        "pickup_lat": data.pickup_lat, "pickup_lng": data.pickup_lng, "pickup_address": data.pickup_address,
        "dropoff_lat": data.dropoff_lat, "dropoff_lng": data.dropoff_lng, "dropoff_address": data.dropoff_address,
        "vehicle_type": data.vehicle_type, "status": "pending", "estimated_fare": fare,
        "final_fare": None, "distance_km": round(distance, 2), "duration_mins": duration,
        "payment_method": data.payment_method, "payment_status": "pending", "otp": otp,
        "fare_type": vtype_doc.get("fare_type", "Regular") if vtype_doc else "Regular",
        "base_fare": vtype_doc.get("base_fare", 0) if vtype_doc else 0,
        "price_per_km": vtype_doc.get("price_per_km", 0) if vtype_doc else 0,
        "commission_percent": vtype_doc.get("commission_percent", 0) if vtype_doc else 0,
        "currency": "EUR",
        "scheduled_at": data.scheduled_at,
        "coupon_code": data.coupon_code,
        "discount": 0.0,
        "book_for_name": data.book_for_name,
        "book_for_phone": data.book_for_phone,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.rides.insert_one(ride)
    await manager.broadcast({"type": "new_ride", "ride_id": ride["id"], "pickup_lat": ride["pickup_lat"], "pickup_lng": ride["pickup_lng"], "pickup_address": ride["pickup_address"], "vehicle_type": ride["vehicle_type"], "fare": fare})
    ride.pop("_id", None)
    ride["created_at"] = datetime.fromisoformat(ride["created_at"])
    return RideResponse(**ride)


@router.get("/{ride_id}", response_model=RideResponse)
async def get_ride(ride_id: str, request: Request):
    user = await get_current_user(request)
    ride = await db.rides.find_one({"id": ride_id}, {"_id": 0})
    if not ride:
        raise HTTPException(status_code=404, detail="Ride not found")
    if ride["user_id"] != user["id"] and ride.get("driver_id") != user["id"] and user["role"] not in ["admin", "dispatcher"]:
        raise HTTPException(status_code=403, detail="Access denied")
    if isinstance(ride.get("created_at"), str):
        ride["created_at"] = datetime.fromisoformat(ride["created_at"])
    return RideResponse(**ride)


@router.post("/{ride_id}/accept")
async def accept_ride(ride_id: str, request: Request):
    user = await get_current_user(request)
    driver = await db.drivers.find_one({"user_id": user["id"]})
    if not driver or driver["status"] != "approved":
        raise HTTPException(status_code=403, detail="Not an approved driver")
    ride = await db.rides.find_one({"id": ride_id, "status": "pending"})
    if not ride:
        raise HTTPException(status_code=404, detail="Ride not found or already taken")
    await db.rides.update_one({"id": ride_id}, {"$set": {"driver_id": driver["id"], "status": "accepted"}})
    await manager.send_personal_message({"type": "ride_accepted", "ride_id": ride_id, "driver_id": driver["id"]}, ride["user_id"])
    return {"message": "Ride accepted"}


@router.post("/{ride_id}/status")
async def update_ride_status(ride_id: str, request: Request):
    user = await get_current_user(request)
    body = await request.json()
    new_status = body.get("status")
    valid_statuses = ["arriving", "in_progress", "completed", "cancelled"]
    if new_status not in valid_statuses:
        raise HTTPException(status_code=400, detail="Invalid status")
    ride = await db.rides.find_one({"id": ride_id}, {"_id": 0})
    if not ride:
        raise HTTPException(status_code=404, detail="Ride not found")
    driver = await db.drivers.find_one({"user_id": user["id"]})
    if not driver and user["role"] not in ["admin", "dispatcher"]:
        raise HTTPException(status_code=403, detail="Not authorized")

    update_data = {"status": new_status}
    if new_status == "completed":
        update_data["final_fare"] = ride["estimated_fare"]
        update_data["payment_status"] = "completed" if ride["payment_method"] != "cash" else "pending"
        await db.drivers.update_one({"id": ride["driver_id"]}, {"$inc": {"total_trips": 1, "earnings": ride["estimated_fare"]}})

    await db.rides.update_one({"id": ride_id}, {"$set": update_data})
    await manager.send_personal_message({"type": "ride_status", "ride_id": ride_id, "status": new_status}, ride["user_id"])
    return {"message": f"Status updated to {new_status}"}


@router.get("")
async def list_rides(request: Request, status: Optional[str] = None, limit: int = 20):
    user = await get_current_user(request)
    query = {}
    if user["role"] == "user":
        query["user_id"] = user["id"]
    elif user["role"] == "driver":
        driver = await db.drivers.find_one({"user_id": user["id"]})
        if driver:
            query["$or"] = [{"driver_id": driver["id"]}, {"status": "pending", "vehicle_type": driver["vehicle_type"]}]
    if status:
        query["status"] = status
    rides = await db.rides.find(query, {"_id": 0}).sort("created_at", -1).limit(limit).to_list(limit)
    for ride in rides:
        if isinstance(ride.get("created_at"), str):
            ride["created_at"] = datetime.fromisoformat(ride["created_at"])
    return rides


@router.post("/{ride_id}/rate")
async def rate_ride(ride_id: str, request: Request):
    from models.schemas import RatingCreate
    user = await get_current_user(request)
    body = await request.json()
    ride = await db.rides.find_one({"id": ride_id, "user_id": user["id"], "status": "completed"})
    if not ride:
        raise HTTPException(status_code=404, detail="Ride not found or not completed")
    rating = {
        "id": f"rating_{uuid.uuid4().hex[:12]}", "user_id": user["id"], "driver_id": ride["driver_id"],
        "ride_id": ride_id, "rating": max(1, min(5, body.get("rating", 5))),
        "comment": body.get("comment"), "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.ratings.insert_one(rating)
    ratings = await db.ratings.find({"driver_id": ride["driver_id"]}, {"rating": 1}).to_list(1000)
    avg = sum(r["rating"] for r in ratings) / len(ratings) if ratings else 5.0
    await db.drivers.update_one({"id": ride["driver_id"]}, {"$set": {"rating": round(avg, 2)}})
    return {"message": "Rating submitted"}
