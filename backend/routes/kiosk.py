"""
SB Drive Tab (Kiosk) - public kiosk endpoints + admin management.

Flow:
1) Admin creates a kiosk borne via POST /api/kiosk/admin/create
2) On the tablet, gerant unlocks the kiosk once via POST /api/kiosk/unlock {pin}
   -> returns a kiosk session_token (long-lived)
3) Once unlocked, the kiosk operates in libre-service mode:
   - GET /api/kiosk/{token}/info  -> hotel info + lang + currency
   - GET /api/kiosk/{token}/nearest-driver -> ETA min
   - POST /api/kiosk/{token}/estimate -> distance + fare (pickup auto = hotel)
   - POST /api/kiosk/{token}/book -> creates a ride (user is auto-created via phone)
"""
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone
import uuid
import math
import secrets
import httpx

from core.config import db
from core.deps import get_current_user
from core.websocket import manager

router = APIRouter(prefix="/kiosk", tags=["kiosk"])

# ===================== Models =====================

class KioskCreate(BaseModel):
    hotel_name: str
    address: str
    lat: float
    lng: float
    pin_code: str  # 4-6 digits
    language: str = "fr"
    currency: str = "EUR"
    image_url: Optional[str] = None
    pickup_label: Optional[str] = None  # custom pickup name to display


class KioskUnlockBody(BaseModel):
    pin_code: str


class KioskBookBody(BaseModel):
    first_name: str
    last_name: str
    email: Optional[str] = None
    phone: str  # +33...
    dest_lat: float
    dest_lng: float
    dest_address: str
    vehicle_type: str = "sb"


class KioskEstimateBody(BaseModel):
    dest_lat: float
    dest_lng: float
    vehicle_type: str = "sb"


# ===================== Helpers =====================

def _haversine_km(lat1, lng1, lat2, lng2):
    r = 6371.0
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2
    return 2 * r * math.atan2(math.sqrt(a), math.sqrt(1 - a))


# Vehicle types pricing matching V3Cube screenshots
VEHICLE_PRICING = {
    "sb":      {"label": "SB",      "seats": 4, "price_per_km": 0.80, "base": 2.0, "color": "red"},
    "confort": {"label": "Confort", "seats": 4, "price_per_km": 0.90, "base": 2.5, "color": "white"},
    "fast":    {"label": "Fast",    "seats": 4, "price_per_km": 1.30, "base": 3.0, "color": "white"},
    "taxi":    {"label": "TAXI",    "seats": 4, "price_per_km": 1.20, "base": 2.5, "color": "yellow"},
    "van":     {"label": "Van",     "seats": 6, "price_per_km": 1.20, "base": 3.5, "color": "white"},
}


def _calc_fare(distance_km: float, vehicle_type: str) -> float:
    cfg = VEHICLE_PRICING.get(vehicle_type, VEHICLE_PRICING["sb"])
    return round(cfg["base"] + distance_km * cfg["price_per_km"], 2)


async def _get_kiosk_by_token(token: str) -> dict:
    kiosk = await db.kiosks.find_one({"session_token": token, "active": True}, {"_id": 0})
    if not kiosk:
        raise HTTPException(404, "Kiosk not found or inactive")
    return kiosk


# ===================== Admin endpoints =====================

@router.post("/admin/create")
async def admin_create_kiosk(body: KioskCreate, current_user: dict = Depends(get_current_user)):
    if current_user.get("role") != "admin":
        raise HTTPException(403, "Admin only")
    if len(body.pin_code) < 4 or not body.pin_code.isdigit():
        raise HTTPException(400, "PIN must be at least 4 digits")
    kiosk = {
        "id": f"kiosk_{uuid.uuid4().hex[:12]}",
        "hotel_name": body.hotel_name,
        "address": body.address,
        "lat": body.lat,
        "lng": body.lng,
        "pin_code": body.pin_code,
        "language": body.language,
        "currency": body.currency,
        "image_url": body.image_url or "https://images.unsplash.com/photo-1455587734955-081b22074882?w=1200",
        "pickup_label": body.pickup_label or body.hotel_name,
        "session_token": secrets.token_urlsafe(32),
        "active": True,
        "total_bookings": 0,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.kiosks.insert_one(kiosk)
    return {"id": kiosk["id"], "session_token": kiosk["session_token"], "kiosk_url": f"/kiosk?token={kiosk['session_token']}"}


@router.get("/admin/list")
async def admin_list_kiosks(current_user: dict = Depends(get_current_user)):
    if current_user.get("role") != "admin":
        raise HTTPException(403, "Admin only")
    items = await db.kiosks.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return {"items": items, "total": len(items)}


@router.put("/admin/{kiosk_id}")
async def admin_update_kiosk(kiosk_id: str, body: KioskCreate, current_user: dict = Depends(get_current_user)):
    if current_user.get("role") != "admin":
        raise HTTPException(403, "Admin only")
    update = {k: v for k, v in body.model_dump().items() if v is not None}
    update["pickup_label"] = update.get("pickup_label") or update.get("hotel_name")
    result = await db.kiosks.update_one({"id": kiosk_id}, {"$set": update})
    if result.matched_count == 0:
        raise HTTPException(404, "Kiosk not found")
    return {"updated": True}


@router.delete("/admin/{kiosk_id}")
async def admin_delete_kiosk(kiosk_id: str, current_user: dict = Depends(get_current_user)):
    if current_user.get("role") != "admin":
        raise HTTPException(403, "Admin only")
    result = await db.kiosks.delete_one({"id": kiosk_id})
    if result.deleted_count == 0:
        raise HTTPException(404, "Kiosk not found")
    return {"deleted": True}


@router.post("/admin/{kiosk_id}/regenerate-token")
async def admin_regenerate_token(kiosk_id: str, current_user: dict = Depends(get_current_user)):
    if current_user.get("role") != "admin":
        raise HTTPException(403, "Admin only")
    new_token = secrets.token_urlsafe(32)
    result = await db.kiosks.update_one({"id": kiosk_id}, {"$set": {"session_token": new_token}})
    if result.matched_count == 0:
        raise HTTPException(404, "Kiosk not found")
    return {"session_token": new_token}


# ===================== Public kiosk endpoints =====================

@router.post("/unlock")
async def kiosk_unlock(body: KioskUnlockBody):
    """Try to unlock a kiosk by PIN. Returns the session_token + kiosk info if PIN matches."""
    kiosk = await db.kiosks.find_one({"pin_code": body.pin_code, "active": True}, {"_id": 0})
    if not kiosk:
        raise HTTPException(401, "PIN incorrect")
    return {
        "session_token": kiosk["session_token"],
        "kiosk_id": kiosk["id"],
        "hotel_name": kiosk["hotel_name"],
        "address": kiosk["address"],
        "language": kiosk.get("language", "fr"),
        "currency": kiosk.get("currency", "EUR"),
        "image_url": kiosk.get("image_url"),
    }


@router.get("/{token}/info")
async def kiosk_info(token: str):
    kiosk = await _get_kiosk_by_token(token)
    return {
        "kiosk_id": kiosk["id"],
        "hotel_name": kiosk["hotel_name"],
        "address": kiosk["address"],
        "pickup_label": kiosk.get("pickup_label", kiosk["hotel_name"]),
        "lat": kiosk["lat"],
        "lng": kiosk["lng"],
        "language": kiosk.get("language", "fr"),
        "currency": kiosk.get("currency", "EUR"),
        "image_url": kiosk.get("image_url"),
        "vehicles": [{"key": k, **v} for k, v in VEHICLE_PRICING.items()],
    }


@router.get("/{token}/nearest-driver")
async def kiosk_nearest_driver(token: str):
    """Returns ETA in minutes of the nearest online driver to the kiosk location."""
    kiosk = await _get_kiosk_by_token(token)
    online_drivers = await db.drivers.find(
        {"is_online": True, "current_lat": {"$ne": None}},
        {"_id": 0, "current_lat": 1, "current_lng": 1}
    ).to_list(200)

    if not online_drivers:
        return {"eta_minutes": None, "available": False, "drivers_online": 0}

    distances = [_haversine_km(kiosk["lat"], kiosk["lng"], d["current_lat"], d["current_lng"]) for d in online_drivers]
    nearest_km = min(distances)
    # Only count drivers within reasonable radius (50 km for kiosk service zone)
    nearby = [d for d in distances if d <= 50]
    if not nearby:
        return {"eta_minutes": None, "available": False, "drivers_online": len(online_drivers), "nearest_km": round(nearest_km, 2)}
    nearest_nearby_km = min(nearby)
    # Assume avg city speed 25 km/h -> minutes = km / 25 * 60
    eta = max(2, int(round(nearest_nearby_km / 25.0 * 60)))
    return {"eta_minutes": eta, "available": True, "drivers_online": len(nearby), "nearest_km": round(nearest_nearby_km, 2)}


@router.post("/{token}/estimate")
async def kiosk_estimate(token: str, body: KioskEstimateBody):
    kiosk = await _get_kiosk_by_token(token)
    distance_km = _haversine_km(kiosk["lat"], kiosk["lng"], body.dest_lat, body.dest_lng)
    distance_km = round(distance_km, 2)
    fare = _calc_fare(distance_km, body.vehicle_type)
    eta_min = max(5, int(round(distance_km / 30.0 * 60)))
    return {
        "distance_km": distance_km,
        "estimated_duration_minutes": eta_min,
        "estimated_fare": fare,
        "currency": kiosk.get("currency", "EUR"),
        "vehicle_type": body.vehicle_type,
    }


@router.post("/{token}/book")
async def kiosk_book(token: str, body: KioskBookBody):
    """Create a ride from the kiosk on behalf of a walk-in customer."""
    kiosk = await _get_kiosk_by_token(token)

    # 1) Find/create user by phone (lightweight - guest user)
    phone_norm = body.phone.strip().replace(" ", "")
    user = await db.users.find_one({"phone": phone_norm})
    if not user:
        user_id = f"kiosk_user_{uuid.uuid4().hex[:10]}"
        user_doc = {
            "id": user_id,
            "email": body.email or f"{user_id}@kiosk.sbdrive.vtc",
            "password_hash": "$kiosk_guest$",
            "name": f"{body.first_name} {body.last_name}".strip(),
            "phone": phone_norm,
            "role": "user",
            "is_verified": False,
            "is_kiosk_guest": True,
            "kiosk_id": kiosk["id"],
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        try:
            await db.users.insert_one(user_doc)
        except Exception:
            # Race condition fallback
            user = await db.users.find_one({"phone": phone_norm})
            user_id = user["id"] if user else user_id
    else:
        user_id = user["id"]

    # 2) Compute fare
    distance_km = round(_haversine_km(kiosk["lat"], kiosk["lng"], body.dest_lat, body.dest_lng), 2)
    fare = _calc_fare(distance_km, body.vehicle_type)
    booking_no = uuid.uuid4().hex[:8].upper()

    # 3) Create ride
    ride = {
        "id": f"ride_{uuid.uuid4().hex[:12]}",
        "booking_no": booking_no,
        "user_id": user_id,
        "passenger_name": f"{body.first_name} {body.last_name}".strip(),
        "passenger_phone": phone_norm,
        "passenger_email": body.email,
        "pickup_lat": kiosk["lat"],
        "pickup_lng": kiosk["lng"],
        "pickup_address": kiosk.get("pickup_label") or kiosk["hotel_name"],
        "dropoff_lat": body.dest_lat,
        "dropoff_lng": body.dest_lng,
        "dropoff_address": body.dest_address,
        "vehicle_type": body.vehicle_type,
        "distance_km": distance_km,
        "estimated_fare": fare,
        "final_fare": None,
        "status": "pending",
        "payment_method": "cash_to_driver",
        "payment_status": "unpaid",
        "source": "kiosk",
        "kiosk_id": kiosk["id"],
        "kiosk_hotel": kiosk["hotel_name"],
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.rides.insert_one(ride)

    # 4) Increment kiosk stats
    await db.kiosks.update_one({"id": kiosk["id"]}, {"$inc": {"total_bookings": 1}})

    # 5) Broadcast to admins + drivers
    payload = {
        "type": "new_ride_request",
        "ride_id": ride["id"],
        "booking_no": booking_no,
        "pickup_lat": kiosk["lat"], "pickup_lng": kiosk["lng"],
        "pickup_address": ride["pickup_address"],
        "dropoff_address": ride["dropoff_address"],
        "vehicle_type": body.vehicle_type,
        "estimated_fare": fare,
        "distance_km": distance_km,
        "user_id": user_id,
        "source": "kiosk",
        "kiosk_hotel": kiosk["hotel_name"],
        "created_at": ride["created_at"],
    }
    try:
        await manager.broadcast_to_admins(payload)
        await manager.broadcast_to_drivers(payload)
    except Exception:
        pass

    return {
        "ride_id": ride["id"],
        "booking_no": booking_no,
        "estimated_fare": fare,
        "currency": kiosk.get("currency", "EUR"),
        "distance_km": distance_km,
    }


@router.get("/{token}/ride/{ride_id}")
async def kiosk_ride_status(token: str, ride_id: str):
    """Light status check for the kiosk to display 'searching driver' state."""
    await _get_kiosk_by_token(token)
    ride = await db.rides.find_one({"id": ride_id}, {"_id": 0, "id": 1, "status": 1, "booking_no": 1, "driver_id": 1, "estimated_fare": 1})
    if not ride:
        raise HTTPException(404, "Ride not found")
    driver_info = None
    if ride.get("driver_id"):
        driver = await db.drivers.find_one({"user_id": ride["driver_id"]}, {"_id": 0, "vehicle_model": 1, "vehicle_number": 1, "rating": 1})
        user = await db.users.find_one({"id": ride["driver_id"]}, {"_id": 0, "name": 1, "phone": 1})
        if driver and user:
            driver_info = {
                "name": user.get("name", "Chauffeur"),
                "phone": user.get("phone"),
                "vehicle_model": driver.get("vehicle_model"),
                "vehicle_number": driver.get("vehicle_number"),
                "rating": driver.get("rating", 5.0),
            }
    return {**ride, "driver_info": driver_info}



@router.get("/{token}/geocode")
async def kiosk_geocode(token: str, q: str):
    """Server-side proxy to Nominatim (OpenStreetMap) for destination search.
    Avoids browser CORS / rate limiting by setting a proper User-Agent server-side.
    """
    await _get_kiosk_by_token(token)
    if not q or len(q.strip()) < 2:
        return {"results": []}
    headers = {"User-Agent": "SBDriveVTC-Kiosk/1.0 (contact@sbdrivevtc.com)"}
    params = {"format": "json", "q": q, "limit": 8, "addressdetails": 1}
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            r = await client.get("https://nominatim.openstreetmap.org/search", params=params, headers=headers)
            if r.status_code != 200:
                return {"results": []}
            data = r.json() or []
            results = [{
                "lat": float(item.get("lat")),
                "lng": float(item.get("lon")),
                "address": item.get("display_name", ""),
            } for item in data]
            return {"results": results}
    except Exception:
        return {"results": []}
