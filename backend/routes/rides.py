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

    # ===== Pack C — Corporate booking validation + discount =====
    corporate_id = None
    corporate_discount_pct = 0.0
    corporate_name = None
    if getattr(data, "corporate_account_id", None):
        from routes.corporate import resolve_corporate_for_booking
        corp = await resolve_corporate_for_booking(user["id"], data.corporate_account_id)
        if not corp:
            raise HTTPException(status_code=403, detail="Code entreprise invalide ou vous n'êtes pas membre actif")
        corporate_id = corp["id"]
        corporate_discount_pct = float(corp.get("discount_pct", 0))
        corporate_name = corp.get("name")
        if corporate_discount_pct > 0:
            fare = round(fare * (1 - corporate_discount_pct / 100), 2)

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
        "proposed_fare": float(data.proposed_fare) if data.proposed_fare else fare,
        "counter_offers": [],  # list of {driver_id, driver_name, amount, created_at, status}
        # Pack A — Taxi Avance V3Cube
        "ride_type": getattr(data, 'ride_type', 'instant'),
        "flight_number": getattr(data, 'flight_number', None),
        "rental_hours": getattr(data, 'rental_hours', None),
        "rental_package": getattr(data, 'rental_package', None),
        "corporate_account_id": corporate_id,
        "corporate_name": corporate_name,
        "corporate_discount_pct": corporate_discount_pct,
        "buddy_hours": getattr(data, 'buddy_hours', None),
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
        "proposed_fare": ride["proposed_fare"],
        "distance_km": ride["distance_km"],
        "duration_mins": ride["duration_mins"],
    })

    # Also broadcast to admins watching the live-rides cockpit
    await manager.broadcast_to_admins({
        "type": "new_ride_request",
        "ride_id": ride["id"],
        "booking_no": ride["booking_no"],
        "pickup_lat": ride["pickup_lat"],
        "pickup_lng": ride["pickup_lng"],
        "pickup_address": ride["pickup_address"],
        "dropoff_address": ride["dropoff_address"],
        "vehicle_type": ride["vehicle_type"],
        "estimated_fare": fare,
        "distance_km": ride["distance_km"],
        "user_id": ride["user_id"],
        "created_at": ride["created_at"],
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
    # Authorization: passenger, assigned driver (driver.id matches OR driver.user_id matches), or admin/dispatcher
    is_passenger = ride["user_id"] == user["id"]
    is_admin = user["role"] in ["admin", "dispatcher"]
    is_assigned_driver = False
    if ride.get("driver_id") and user["role"] == "driver":
        drv = await db.drivers.find_one({"user_id": user["id"]}, {"_id": 0, "id": 1})
        if drv and drv["id"] == ride["driver_id"]:
            is_assigned_driver = True
    if not (is_passenger or is_assigned_driver or is_admin):
        raise HTTPException(status_code=403, detail="Access denied")

    # Attach live driver location if in progress (driver_locations is keyed by user_id of the driver)
    if ride.get("driver_id") and ride["status"] in ["accepted", "arriving", "in_progress"]:
        drv = await db.drivers.find_one({"id": ride["driver_id"]}, {"_id": 0, "user_id": 1})
        if drv:
            loc = manager.get_driver_location(drv["user_id"])
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

    # ===== Auto-dispatch quality bonus (if ride was escalated) =====
    fresh_ride = await db.rides.find_one({"id": ride_id}, {"_id": 0})
    if fresh_ride and fresh_ride.get("auto_dispatch_tier", 0) > 0:
        from routes.auto_dispatch import _adjust_driver_points, get_config as _get_ad_cfg
        ad_cfg = await _get_ad_cfg()
        if ad_cfg.get("scoring_enabled"):
            await _adjust_driver_points(
                user["id"],
                ad_cfg["accept_bonus_points"],
                f"Acceptation course escaladée (tier {fresh_ride['auto_dispatch_tier']})",
                ride_id,
                floor=ad_cfg["min_points_floor"],
            )

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
        final_fare = ride["estimated_fare"]
        update_data["final_fare"] = final_fare
        pm = ride.get("payment_method")
        # === SB PayGo auto-deduction ===
        if pm == "sbpaygo":
            wallet = await db.sbpaygo_wallets.find_one({"user_id": ride["user_id"]})
            if wallet and wallet.get("balance", 0) >= final_fare:
                tx = {
                    "id": f"tx_{uuid.uuid4().hex[:10]}",
                    "type": "debit",
                    "amount": final_fare,
                    "label": f"Paiement course {ride['id']}",
                    "ride_id": ride["id"],
                    "created_at": now,
                }
                await db.sbpaygo_wallets.update_one(
                    {"user_id": ride["user_id"]},
                    {"$inc": {"balance": -final_fare}, "$push": {"transactions": tx}},
                )
                update_data["payment_status"] = "paid"
                update_data["paid_with"] = "sbpaygo"
                update_data["paid_at"] = now
            else:
                # Insufficient balance: leave open so user can top-up and pay
                update_data["payment_status"] = "unpaid_insufficient"
        else:
            update_data["payment_status"] = "completed" if pm != "cash" else "pending_cash"
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

        # ===== Pack C: record corporate charge on completion =====
        if ride.get("corporate_account_id"):
            from routes.corporate import record_corporate_charge
            await record_corporate_charge(ride["corporate_account_id"], ride, final_fare)

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


# ===== NEGOTIATION / COUNTER-OFFERS =====

@router.post("/{ride_id}/counter-offer")
async def driver_counter_offer(ride_id: str, request: Request):
    """Driver proposes a different fare for a pending ride (negotiation)."""
    user = await get_current_user(request)
    if user["role"] != "driver":
        raise HTTPException(status_code=403, detail="Driver only")
    driver = await db.drivers.find_one({"user_id": user["id"]}, {"_id": 0})
    if not driver:
        raise HTTPException(status_code=404, detail="Driver profile not found")

    ride = await db.rides.find_one({"id": ride_id}, {"_id": 0})
    if not ride:
        raise HTTPException(status_code=404, detail="Ride not found")
    if ride.get("status") != "pending":
        raise HTTPException(status_code=400, detail="Ride is no longer pending")

    body = await request.json()
    amount = float(body.get("amount", 0))
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Invalid amount")

    offer = {
        "id": f"off_{uuid.uuid4().hex[:8]}",
        "driver_id": driver["id"],
        "driver_name": user.get("name", "Chauffeur"),
        "driver_rating": driver.get("rating", 5.0),
        "driver_vehicle_model": driver.get("vehicle_model"),
        "driver_vehicle_number": driver.get("vehicle_number"),
        "amount": amount,
        "status": "pending",  # pending | accepted | rejected
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    # Prevent the same driver from spamming offers: replace previous pending
    await db.rides.update_one(
        {"id": ride_id},
        {"$pull": {"counter_offers": {"driver_id": driver["id"], "status": "pending"}}},
    )
    await db.rides.update_one(
        {"id": ride_id},
        {"$push": {"counter_offers": offer}},
    )

    # Notify the passenger via WS room
    await manager.send_to_ride_room(ride_id, {
        "type": "counter_offer",
        "ride_id": ride_id,
        "offer": offer,
    })

    return {"message": "Offer sent", "offer": offer}


@router.post("/{ride_id}/accept-offer/{offer_id}")
async def passenger_accept_offer(ride_id: str, offer_id: str, request: Request):
    """Passenger accepts a driver's counter-offer → ride starts."""
    user = await get_current_user(request)
    ride = await db.rides.find_one({"id": ride_id}, {"_id": 0})
    if not ride:
        raise HTTPException(status_code=404, detail="Ride not found")
    if ride["user_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Not your ride")
    if ride.get("status") != "pending":
        raise HTTPException(status_code=400, detail="Ride is no longer pending")

    offers = ride.get("counter_offers") or []
    offer = next((o for o in offers if o["id"] == offer_id and o["status"] == "pending"), None)
    if not offer:
        raise HTTPException(status_code=404, detail="Offer not found")

    driver = await db.drivers.find_one({"id": offer["driver_id"]}, {"_id": 0})
    if not driver:
        raise HTTPException(status_code=404, detail="Driver not found")
    driver_user = await db.users.find_one({"id": driver["user_id"]}, {"_id": 0})

    now = datetime.now(timezone.utc).isoformat()

    # Mark offer accepted, reject others, assign driver and switch ride to accepted
    await db.rides.update_one({"id": ride_id, "counter_offers.id": offer_id}, {"$set": {"counter_offers.$.status": "accepted"}})
    await db.rides.update_one(
        {"id": ride_id},
        {
            "$set": {
                "driver_id": driver["id"],
                "status": "accepted",
                "accepted_at": now,
                "estimated_fare": offer["amount"],
                "driver_name": (driver_user or {}).get("name", offer.get("driver_name")),
                "driver_phone": (driver_user or {}).get("phone"),
                "driver_rating": driver.get("rating", 5.0),
                "driver_vehicle_model": driver.get("vehicle_model"),
                "driver_vehicle_number": driver.get("vehicle_number"),
            },
        },
    )
    # Reject remaining pending offers
    await db.rides.update_one(
        {"id": ride_id},
        {"$set": {"counter_offers.$[elem].status": "rejected"}},
        array_filters=[{"elem.id": {"$ne": offer_id}, "elem.status": "pending"}],
    )

    # Award points to accepting driver (same logic as accept_ride)
    points_cfg = await _get_driver_points_cfg()
    gain = int(points_cfg.get("points_per_ride_accepted", 2))
    current_points = driver.get("points", points_cfg["initial_points"])
    new_points = min(100, current_points + gain)
    await db.drivers.update_one(
        {"id": driver["id"]},
        {"$set": {"points": new_points}, "$inc": {"offered_count": 1, "accepted_count": 1}},
    )

    # Notify driver via WS + ride room
    await manager.send_to_ride_room(ride_id, {
        "type": "offer_accepted",
        "ride_id": ride_id,
        "offer_id": offer_id,
        "driver_id": driver["id"],
    })

    return {"message": "Offer accepted", "ride_id": ride_id, "final_fare": offer["amount"]}


async def _get_driver_points_cfg():
    from routes.drivers import _get_rewards_points_config
    return await _get_rewards_points_config()


# ============================================================
# Pack A — Taxi Avance V3Cube : Scheduled rides management
# ============================================================

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
    await db.rides.update_one(
        {"id": ride_id},
        {"$set": {"scheduled_at": new_at, "rescheduled_at": datetime.now(timezone.utc).isoformat()}},
    )
    return {"message": "Rescheduled", "ride_id": ride_id, "scheduled_at": new_at}


@router.post("/airport-multipliers")
async def airport_multipliers(request: Request):
    """Return airport fare multiplier config (V3Cube parity)."""
    cfg = await db.app_configurations.find_one(
        {"key": "airport_pricing"}, {"_id": 0, "value": 1}
    ) or {}
    return cfg.get("value") or {
        "multiplier": 1.25,
        "min_fare": 25.0,
        "waiting_fee_per_min": 0.5,
        "currency": "EUR",
    }


@router.post("/rental-packages")
async def rental_packages(request: Request):
    """Return available rental packages (hourly / km bundles)."""
    cfg = await db.app_configurations.find_one(
        {"key": "rental_packages"}, {"_id": 0, "value": 1}
    ) or {}
    return cfg.get("value") or {
        "packages": [
            {"slug": "2h_20km", "label": "2h / 20 km", "hours": 2, "km": 20, "price": 40},
            {"slug": "4h_40km", "label": "4h / 40 km", "hours": 4, "km": 40, "price": 75},
            {"slug": "8h_80km", "label": "8h / 80 km", "hours": 8, "km": 80, "price": 140},
        ],
        "currency": "EUR",
    }

