from fastapi import APIRouter, Request, HTTPException
import uuid
import os
import secrets
import requests
from datetime import datetime, timezone
from typing import Optional

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


@router.post("/estimate")
async def estimate_ride(data: RideRequest):
    distance = None
    duration = None
    route_polyline = None

    # Try Google Maps Directions API for real distance/time
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
            resp = requests.get(url, params=params, timeout=5)
            gdata = resp.json()
            if gdata.get("status") == "OK" and gdata.get("routes"):
                leg = gdata["routes"][0]["legs"][0]
                distance = leg["distance"]["value"] / 1000  # meters to km
                duration = int(leg["duration"]["value"] / 60)  # seconds to min
                route_polyline = gdata["routes"][0].get("overview_polyline", {}).get("points")
        except Exception as e:
            pass  # Fallback to haversine

    # Fallback to haversine calculation
    if distance is None:
        distance = calculate_distance(data.pickup_lat, data.pickup_lng, data.dropoff_lat, data.dropoff_lng)
    if duration is None:
        duration = int(distance * 3)

    vtype_doc = await db.vehicle_types.find_one({"slug": data.vehicle_type, "status": "active"}, {"_id": 0})
    fare = calculate_fare(distance, data.vehicle_type, duration, vtype_doc)
    result = {
        "distance_km": round(distance, 2),
        "duration_mins": duration,
        "estimated_fare": fare,
        "vehicle_type": data.vehicle_type,
        "currency": "EUR",
        "source": "google_maps" if route_polyline else "haversine",
    }
    if route_polyline:
        result["route_polyline"] = route_polyline
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
        "auto_assign": getattr(data, 'auto_assign', True),
        "female_driver_request": getattr(data, 'female_driver_request', False),
        "handicap_accessibility": getattr(data, 'handicap_accessibility', False),
        "notes": getattr(data, 'notes', None),
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
    await db.rides.insert_one(ride)

    # Join WS ride room for the user
    manager.join_ride_room(ride["id"], user["id"])

    # Broadcast to all connected drivers
    await manager.broadcast_to_drivers({
        "type": "new_ride_request",
        "ride_id": ride["id"],
        "pickup_lat": ride["pickup_lat"],
        "pickup_lng": ride["pickup_lng"],
        "pickup_address": ride["pickup_address"],
        "dropoff_address": ride["dropoff_address"],
        "vehicle_type": ride["vehicle_type"],
        "estimated_fare": fare,
        "distance_km": ride["distance_km"],
        "duration_mins": ride["duration_mins"],
    })

    ride.pop("_id", None)
    ride["created_at"] = datetime.fromisoformat(ride["created_at"])
    return RideResponse(**ride)


@router.get("/{ride_id}")
async def get_ride(ride_id: str, request: Request):
    user = await get_current_user(request)
    ride = await db.rides.find_one({"id": ride_id}, {"_id": 0})
    if not ride:
        raise HTTPException(status_code=404, detail="Ride not found")
    if ride["user_id"] != user["id"] and ride.get("driver_id") != user["id"] and user["role"] not in ["admin", "dispatcher"]:
        raise HTTPException(status_code=403, detail="Access denied")

    # Attach live driver location if in progress
    if ride.get("driver_id") and ride["status"] in ["accepted", "arriving", "in_progress"]:
        loc = manager.get_driver_location(ride["driver_id"])
        if loc:
            ride["driver_lat"] = loc["lat"]
            ride["driver_lng"] = loc["lng"]

    return ride


@router.post("/{ride_id}/accept")
async def accept_ride(ride_id: str, request: Request):
    user = await get_current_user(request)
    driver = await db.drivers.find_one({"user_id": user["id"]}, {"_id": 0})
    if not driver or driver["status"] != "approved":
        raise HTTPException(status_code=403, detail="Not an approved driver")

    ride = await db.rides.find_one({"id": ride_id, "status": "pending"})
    if not ride:
        raise HTTPException(status_code=404, detail="Ride not found or already taken")

    now = datetime.now(timezone.utc).isoformat()
    await db.rides.update_one({"id": ride_id}, {"$set": {
        "driver_id": driver["id"],
        "status": "accepted",
        "accepted_at": now,
        "driver_name": driver.get("user_name", user.get("name", "Chauffeur")),
        "driver_phone": driver.get("user_phone", user.get("phone")),
        "driver_rating": driver.get("rating", 5.0),
        "driver_vehicle_model": driver.get("vehicle_model"),
        "driver_vehicle_number": driver.get("vehicle_number"),
    }})

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

    now = datetime.now(timezone.utc).isoformat()
    update_data = {"status": new_status}

    if new_status == "arriving":
        update_data["arrived_at"] = now

    elif new_status == "in_progress":
        update_data["started_at"] = now

    elif new_status == "completed":
        update_data["completed_at"] = now
        update_data["final_fare"] = ride["estimated_fare"]
        update_data["payment_status"] = "completed" if ride["payment_method"] != "cash" else "pending_cash"
        if ride.get("driver_id"):
            commission = ride.get("commission_percent", 10) / 100
            driver_earnings = ride["estimated_fare"] * (1 - commission)
            await db.drivers.update_one(
                {"id": ride["driver_id"]},
                {"$inc": {"total_trips": 1, "earnings": round(driver_earnings, 2)}}
            )
            # ===== POINTS: award for completed ride =====
            from routes.drivers import _get_rewards_points_config
            points_cfg = await _get_rewards_points_config()
            gain = int(points_cfg.get("points_per_ride_completed", 3))
            d_doc = await db.drivers.find_one({"id": ride["driver_id"]}, {"_id": 0, "points": 1})
            if d_doc:
                new_pts = min(100, d_doc.get("points", points_cfg["initial_points"]) + gain)
                await db.drivers.update_one({"id": ride["driver_id"]}, {"$set": {"points": new_pts}})

    elif new_status == "cancelled":
        update_data["cancelled_at"] = now
        update_data["cancelled_by"] = "driver" if is_driver else "user" if is_passenger else "admin"
        cancel_reason = body.get("cancel_reason")
        if cancel_reason:
            update_data["cancel_reason"] = cancel_reason
        # Apply cancellation fee if ride was already accepted
        if current_status in ["accepted", "arriving"] and is_passenger:
            vtype_doc = await db.vehicle_types.find_one({"slug": ride["vehicle_type"]}, {"_id": 0})
            cancel_fee = vtype_doc.get("cancellation_fare", 5.0) if vtype_doc else 5.0
            update_data["cancellation_fee"] = cancel_fee
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

    await db.rides.update_one({"id": ride_id}, {"$set": update_data})

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
        ws_message["final_fare"] = ride["estimated_fare"]
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

    now = datetime.now(timezone.utc).isoformat()
    cancel_fee = 0.0
    if ride["status"] in ["accepted", "arriving"]:
        vtype_doc = await db.vehicle_types.find_one({"slug": ride["vehicle_type"]}, {"_id": 0})
        cancel_fee = vtype_doc.get("cancellation_fare", 5.0) if vtype_doc else 5.0

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

    return {"message": "Ride cancelled", "cancellation_fee": cancel_fee}


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
    rides = await db.rides.find(query, {"_id": 0}).sort("created_at", -1).limit(min(limit, 100)).to_list(min(limit, 100))
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


@router.get("/pending/available")
async def get_available_rides(request: Request):
    """Get pending rides available for drivers to accept."""
    user = await get_current_user(request)
    driver = await db.drivers.find_one({"user_id": user["id"]})
    if not driver or driver["status"] != "approved":
        raise HTTPException(status_code=403, detail="Not an approved driver")

    rides = await db.rides.find(
        {"status": "pending"},
        {"_id": 0}
    ).sort("created_at", -1).limit(10).to_list(10)
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
    pipeline = [
        {"$match": {"driver_id": ride["driver_id"]}},
        {"$group": {"_id": None, "avg": {"$avg": "$rating"}}}
    ]
    result = await db.ratings.aggregate(pipeline).to_list(1)
    avg = result[0]["avg"] if result else 5.0
    await db.drivers.update_one({"id": ride["driver_id"]}, {"$set": {"rating": round(avg, 2)}})
    return {"message": "Rating submitted"}
