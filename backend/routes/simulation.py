from fastapi import APIRouter, Request, HTTPException
import uuid
import asyncio
import math
import secrets
import random as _sim_random
from datetime import datetime, timezone

from core.config import db, logger
from core.deps import get_current_user, hash_password
from core.websocket import manager

router = APIRouter(prefix="/simulation", tags=["simulation"])

# Global simulation state
_simulation_tasks = {}
_simulation_drivers = {}

DRIVER_NAMES = [
    "Jean-Pierre Mbappé", "Ahmed Diallo", "Fatou Konaté", "Moussa Traoré",
    "Sophie Lefèvre", "Marc Nguyen", "Aminata Sylla", "Karim Bensalah",
]
VEHICLE_MODELS = [
    "Peugeot 308 2024", "Renault Clio V", "Citroën C4", "Toyota Corolla",
    "Mercedes Classe C", "BMW Série 3", "Volkswagen Golf", "Hyundai Tucson",
]


def interpolate_coords(start_lat, start_lng, end_lat, end_lng, steps):
    """Generate intermediate GPS coordinates between two points."""
    coords = []
    for i in range(steps + 1):
        t = i / steps
        lat = start_lat + (end_lat - start_lat) * t
        lng = start_lng + (end_lng - start_lng) * t
        # Add slight random offset for realism
        lat += _sim_random.uniform(-0.0003, 0.0003)
        lng += _sim_random.uniform(-0.0003, 0.0003)
        coords.append((lat, lng))
    return coords


async def simulation_loop(user_id: str, sim_driver_id: str, sim_driver_user_id: str):
    """Background task that auto-accepts rides and simulates driver movement."""
    logger.info(f"Simulation started for user {user_id} with driver {sim_driver_id}")

    try:
        while user_id in _simulation_tasks:
            # Look for pending rides from this user
            ride = await db.rides.find_one(
                {"user_id": user_id, "status": "pending"},
                {"_id": 0}
            )

            if ride:
                ride_id = ride["id"]
                logger.info(f"Simulation: auto-accepting ride {ride_id}")

                # Wait 3 seconds before accepting (realistic)
                await asyncio.sleep(3)

                # Re-check ride still pending
                ride = await db.rides.find_one({"id": ride_id, "status": "pending"}, {"_id": 0})
                if not ride:
                    continue

                driver_doc = await db.drivers.find_one({"id": sim_driver_id}, {"_id": 0})
                if not driver_doc:
                    continue

                # Accept the ride
                now = datetime.now(timezone.utc).isoformat()
                await db.rides.update_one({"id": ride_id}, {"$set": {
                    "driver_id": sim_driver_id,
                    "status": "accepted",
                    "accepted_at": now,
                    "driver_name": driver_doc.get("user_name", "Chauffeur Simulation"),
                    "driver_phone": driver_doc.get("user_phone", "+33600000000"),
                    "driver_rating": driver_doc.get("rating", 4.8),
                    "driver_vehicle_model": driver_doc.get("vehicle_model"),
                    "driver_vehicle_number": driver_doc.get("vehicle_number"),
                }})

                # Notify passenger via WebSocket
                manager.join_ride_room(ride_id, sim_driver_user_id)
                manager.join_ride_room(ride_id, user_id)

                await manager.send_personal_message({
                    "type": "ride_accepted",
                    "ride_id": ride_id,
                    "driver_id": sim_driver_id,
                    "driver_name": driver_doc.get("user_name", "Chauffeur Simulation"),
                    "driver_phone": "+33600000000",
                    "driver_rating": 4.8,
                    "driver_vehicle_model": driver_doc.get("vehicle_model"),
                    "driver_vehicle_number": driver_doc.get("vehicle_number"),
                    "status": "accepted",
                }, user_id)

                await asyncio.sleep(2)

                # Phase 1: Driver moves TOWARD pickup (from a nearby random point)
                start_lat = ride["pickup_lat"] + _sim_random.uniform(-0.008, 0.008)
                start_lng = ride["pickup_lng"] + _sim_random.uniform(-0.008, 0.008)
                approach_coords = interpolate_coords(
                    start_lat, start_lng, ride["pickup_lat"], ride["pickup_lng"], 8
                )

                # Update status to "arriving"
                await db.rides.update_one({"id": ride_id}, {"$set": {"status": "arriving", "arrived_at": now}})
                await manager.send_personal_message({
                    "type": "ride_status_update", "ride_id": ride_id, "status": "arriving",
                    "otp": ride.get("otp"), "timestamp": now,
                }, user_id)

                # Simulate approach
                for lat, lng in approach_coords:
                    if user_id not in _simulation_tasks:
                        break
                    manager.update_driver_location(sim_driver_id, lat, lng)
                    await manager.send_personal_message({
                        "type": "driver_location", "lat": lat, "lng": lng, "ride_id": ride_id,
                    }, user_id)
                    await asyncio.sleep(1.5)

                if user_id not in _simulation_tasks:
                    continue

                # Phase 2: Start the trip
                await asyncio.sleep(2)
                now2 = datetime.now(timezone.utc).isoformat()
                await db.rides.update_one({"id": ride_id}, {"$set": {"status": "in_progress", "started_at": now2}})
                await manager.send_personal_message({
                    "type": "ride_status_update", "ride_id": ride_id, "status": "in_progress", "timestamp": now2,
                }, user_id)

                # Phase 3: Move from pickup to dropoff
                trip_coords = interpolate_coords(
                    ride["pickup_lat"], ride["pickup_lng"],
                    ride["dropoff_lat"], ride["dropoff_lng"], 12
                )
                for lat, lng in trip_coords:
                    if user_id not in _simulation_tasks:
                        break
                    manager.update_driver_location(sim_driver_id, lat, lng)
                    await manager.send_personal_message({
                        "type": "driver_location", "lat": lat, "lng": lng, "ride_id": ride_id,
                    }, user_id)
                    await asyncio.sleep(1.5)

                if user_id not in _simulation_tasks:
                    continue

                # Phase 4: Complete the trip
                await asyncio.sleep(1)
                now3 = datetime.now(timezone.utc).isoformat()
                await db.rides.update_one({"id": ride_id}, {"$set": {
                    "status": "completed", "completed_at": now3,
                    "final_fare": ride["estimated_fare"],
                    "payment_status": "completed",
                }})
                commission = ride.get("commission_percent", 10) / 100
                driver_earnings = ride["estimated_fare"] * (1 - commission)
                await db.drivers.update_one(
                    {"id": sim_driver_id},
                    {"$inc": {"total_trips": 1, "earnings": round(driver_earnings, 2)}}
                )
                await manager.send_personal_message({
                    "type": "ride_status_update", "ride_id": ride_id, "status": "completed",
                    "final_fare": ride["estimated_fare"], "timestamp": now3,
                }, user_id)

                # Clean up room
                if ride_id in manager.ride_rooms:
                    del manager.ride_rooms[ride_id]

                logger.info(f"Simulation: ride {ride_id} completed")

            # Poll every 3 seconds
            await asyncio.sleep(3)

    except asyncio.CancelledError:
        logger.info(f"Simulation cancelled for user {user_id}")
    except Exception as e:
        logger.error(f"Simulation error: {e}")
    finally:
        _simulation_tasks.pop(user_id, None)
        logger.info(f"Simulation ended for user {user_id}")


@router.post("/start")
async def start_simulation(request: Request):
    user = await get_current_user(request)
    user_id = user["id"]

    if user_id in _simulation_tasks:
        return {"status": "already_running", "driver_id": _simulation_drivers.get(user_id)}

    # Create a simulation driver user + profile
    sim_user_id = f"sim_driver_{uuid.uuid4().hex[:8]}"
    sim_driver_id = f"driver_sim_{uuid.uuid4().hex[:8]}"
    driver_name = _sim_random.choice(DRIVER_NAMES)
    vehicle_model = _sim_random.choice(VEHICLE_MODELS)
    vehicle_number = f"{_sim_random.choice('ABCDEFGH')}{_sim_random.choice('ABCDEFGH')}-{_sim_random.randint(100,999)}-{_sim_random.choice('ABCDEFGH')}{_sim_random.choice('ABCDEFGH')}"

    # Create sim driver user
    await db.users.update_one(
        {"id": sim_user_id},
        {"$set": {
            "id": sim_user_id, "email": f"{sim_user_id}@sim.local",
            "password_hash": hash_password("sim123"), "name": driver_name,
            "phone": f"+33600{_sim_random.randint(100000,999999)}", "role": "driver",
            "is_verified": True, "created_at": datetime.now(timezone.utc).isoformat(),
        }},
        upsert=True
    )

    # Create sim driver profile (approved)
    await db.drivers.update_one(
        {"id": sim_driver_id},
        {"$set": {
            "id": sim_driver_id, "user_id": sim_user_id,
            "user_name": driver_name, "user_phone": f"+33600{_sim_random.randint(100000,999999)}",
            "vehicle_type": "car", "vehicle_number": vehicle_number,
            "vehicle_model": vehicle_model, "license_number": f"SIM{_sim_random.randint(10000,99999)}",
            "status": "approved", "is_online": True,
            "rating": round(_sim_random.uniform(4.5, 5.0), 1),
            "total_trips": _sim_random.randint(50, 500),
            "earnings": round(_sim_random.uniform(500, 5000), 2),
            "current_lat": 48.8566, "current_lng": 2.3522,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }},
        upsert=True
    )

    # Start background loop
    _simulation_drivers[user_id] = sim_driver_id
    task = asyncio.create_task(simulation_loop(user_id, sim_driver_id, sim_user_id))
    _simulation_tasks[user_id] = task

    return {
        "status": "started",
        "driver_name": driver_name,
        "driver_vehicle": vehicle_model,
        "driver_plate": vehicle_number,
        "driver_rating": 4.8,
        "message": "Mode simulation activé. Réservez une course pour voir le chauffeur virtuel en action !",
    }


@router.post("/stop")
async def stop_simulation(request: Request):
    user = await get_current_user(request)
    user_id = user["id"]

    task = _simulation_tasks.pop(user_id, None)
    driver_id = _simulation_drivers.pop(user_id, None)

    if task:
        task.cancel()

    # Clean up sim driver
    if driver_id:
        await db.drivers.delete_one({"id": driver_id})

    return {"status": "stopped", "message": "Mode simulation désactivé"}


@router.get("/status")
async def simulation_status(request: Request):
    user = await get_current_user(request)
    user_id = user["id"]
    is_active = user_id in _simulation_tasks

    result = {"active": is_active}
    if is_active and user_id in _simulation_drivers:
        driver = await db.drivers.find_one({"id": _simulation_drivers[user_id]}, {"_id": 0})
        if driver:
            result["driver_name"] = driver.get("user_name")
            result["driver_vehicle"] = driver.get("vehicle_model")
            result["driver_plate"] = driver.get("vehicle_number")
            result["driver_rating"] = driver.get("rating")
    return result
