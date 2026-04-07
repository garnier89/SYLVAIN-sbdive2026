from fastapi import APIRouter, Request, HTTPException, File, UploadFile, Query
import uuid
from datetime import datetime, timezone, timedelta

from core.config import db, APP_NAME
from core.deps import get_current_user, put_object
from models.schemas import DriverCreate, DriverProfile
from core.websocket import manager

router = APIRouter(prefix="/drivers", tags=["drivers"])


@router.post("/register", response_model=DriverProfile)
async def register_driver(data: DriverCreate, request: Request):
    user = await get_current_user(request)
    existing = await db.drivers.find_one({"user_id": user["id"]})
    if existing:
        raise HTTPException(status_code=400, detail="Already registered as driver")

    driver = {
        "id": f"driver_{uuid.uuid4().hex[:12]}",
        "user_id": user["id"],
        "vehicle_type": data.vehicle_type,
        "vehicle_number": data.vehicle_number,
        "vehicle_model": data.vehicle_model,
        "license_number": data.license_number,
        "status": "pending",
        "is_online": False,
        "current_lat": None,
        "current_lng": None,
        "rating": 5.0,
        "total_trips": 0,
        "earnings": 0.0,
        "documents": [],
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.drivers.insert_one(driver)
    await db.users.update_one({"id": user["id"]}, {"$set": {"role": "driver"}})
    driver.pop("_id", None)
    return DriverProfile(**driver)


@router.get("/profile", response_model=DriverProfile)
async def get_driver_profile(request: Request):
    user = await get_current_user(request)
    driver = await db.drivers.find_one({"user_id": user["id"]}, {"_id": 0})
    if not driver:
        raise HTTPException(status_code=404, detail="Driver profile not found")
    return DriverProfile(**driver)


@router.post("/toggle-online")
async def toggle_driver_online(request: Request):
    user = await get_current_user(request)
    driver = await db.drivers.find_one({"user_id": user["id"]})
    if not driver:
        raise HTTPException(status_code=404, detail="Driver profile not found")
    if driver["status"] != "approved":
        raise HTTPException(status_code=400, detail="Driver not approved")
    new_status = not driver["is_online"]
    await db.drivers.update_one({"user_id": user["id"]}, {"$set": {"is_online": new_status}})
    return {"is_online": new_status}


@router.post("/location")
async def update_driver_location(request: Request):
    user = await get_current_user(request)
    body = await request.json()
    lat, lng = body.get("lat"), body.get("lng")
    await db.drivers.update_one({"user_id": user["id"]}, {"$set": {"current_lat": lat, "current_lng": lng}})
    manager.update_driver_location(user["id"], lat, lng)
    return {"message": "Location updated"}


@router.post("/documents")
async def upload_driver_document(request: Request, file: UploadFile = File(...), doc_type: str = Query(...)):
    user = await get_current_user(request)
    driver = await db.drivers.find_one({"user_id": user["id"]})
    if not driver:
        raise HTTPException(status_code=404, detail="Driver profile not found")

    ext = file.filename.split(".")[-1] if "." in file.filename else "bin"
    path = f"{APP_NAME}/drivers/{user['id']}/{doc_type}_{uuid.uuid4().hex[:8]}.{ext}"
    data = await file.read()
    result = put_object(path, data, file.content_type or "application/octet-stream")

    doc_record = {
        "type": doc_type, "path": result["path"], "filename": file.filename,
        "uploaded_at": datetime.now(timezone.utc).isoformat(), "status": "pending"
    }
    await db.drivers.update_one({"user_id": user["id"]}, {"$push": {"documents": doc_record}})
    return {"message": "Document uploaded", "path": result["path"]}



@router.get("/earnings")
async def get_driver_earnings(request: Request):
    user = await get_current_user(request)
    driver = await db.drivers.find_one({"user_id": user["id"]}, {"_id": 0})
    if not driver:
        raise HTTPException(status_code=404, detail="Driver profile not found")

    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    week_start = (now - timedelta(days=now.weekday())).replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0).isoformat()

    # Fetch completed rides for this driver
    all_rides = await db.rides.find(
        {"driver_id": user["id"], "status": "completed"},
        {"_id": 0, "estimated_fare": 1, "created_at": 1, "pickup_address": 1, "dropoff_address": 1, "distance_km": 1}
    ).sort("created_at", -1).to_list(500)

    today_earnings = sum(r.get("estimated_fare", 0) for r in all_rides if r.get("created_at", "") >= today_start)
    week_earnings = sum(r.get("estimated_fare", 0) for r in all_rides if r.get("created_at", "") >= week_start)
    month_earnings = sum(r.get("estimated_fare", 0) for r in all_rides if r.get("created_at", "") >= month_start)
    total_earnings = sum(r.get("estimated_fare", 0) for r in all_rides)

    today_trips = len([r for r in all_rides if r.get("created_at", "") >= today_start])
    week_trips = len([r for r in all_rides if r.get("created_at", "") >= week_start])

    recent_rides = all_rides[:20]

    return {
        "today": round(today_earnings, 2),
        "week": round(week_earnings, 2),
        "month": round(month_earnings, 2),
        "total": round(total_earnings, 2),
        "today_trips": today_trips,
        "week_trips": week_trips,
        "total_trips": driver.get("total_trips", 0),
        "rating": driver.get("rating", 5.0),
        "recent_rides": recent_rides,
    }


@router.get("/ride-history")
async def get_driver_ride_history(request: Request):
    user = await get_current_user(request)
    driver = await db.drivers.find_one({"user_id": user["id"]})
    if not driver:
        raise HTTPException(status_code=404, detail="Driver profile not found")

    rides = await db.rides.find(
        {"driver_id": user["id"]},
        {"_id": 0}
    ).sort("created_at", -1).to_list(100)

    return {"rides": rides}
