"""
Parcel delivery (V3Cube "Send Anything" — single & multi-drop).
A courier picks up at one origin and delivers to one or several drop-off points
in a single trip. Fare is computed per leg (origin → drop1 → drop2 …).
"""
from fastapi import APIRouter, Request, HTTPException
import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional, List
from pydantic import BaseModel, Field

from core.config import db
from core.deps import get_current_user, calculate_distance, calculate_fare
from core.websocket import manager

router = APIRouter(prefix="/parcels", tags=["parcels"])

VEHICLE_MAP = {"moto": "motorcycle", "box": "car"}


class ParcelStop(BaseModel):
    address: Optional[str] = None
    lat: float
    lng: float
    recipient_name: Optional[str] = None
    recipient_phone: Optional[str] = None
    note: Optional[str] = None


class ParcelEstimateRequest(BaseModel):
    pickup_lat: float
    pickup_lng: float
    stops: List[ParcelStop] = Field(..., min_length=1)
    vehicle_type: str = "moto"  # moto | box


class ParcelCreateRequest(ParcelEstimateRequest):
    pickup_address: Optional[str] = None
    sender_name: Optional[str] = None
    sender_phone: Optional[str] = None
    payment_method: str = "cash"


def _compute_legs(pickup_lat: float, pickup_lng: float, stops: List[ParcelStop], vehicle_type: str):
    vkey = VEHICLE_MAP.get(vehicle_type, "motorcycle")
    legs, total_km, total_fare = [], 0.0, 0.0
    cur = (pickup_lat, pickup_lng)
    for i, s in enumerate(stops):
        d = calculate_distance(cur[0], cur[1], s.lat, s.lng)
        dur = int(round(d * 2))  # rough ~2 min/km
        fare = calculate_fare(d, vkey, dur, None)
        legs.append({
            "index": i,
            "distance_km": round(d, 2),
            "duration_mins": dur,
            "fare": fare,
            "address": s.address,
            "recipient_name": s.recipient_name,
        })
        total_km += d
        total_fare += fare
        cur = (s.lat, s.lng)
    return legs, round(total_km, 2), round(total_fare, 2)


@router.post("/estimate")
async def estimate_parcel(data: ParcelEstimateRequest, request: Request):
    await get_current_user(request)
    legs, total_km, total_fare = _compute_legs(data.pickup_lat, data.pickup_lng, data.stops, data.vehicle_type)
    return {
        "vehicle_type": data.vehicle_type,
        "stops_count": len(data.stops),
        "legs": legs,
        "total_distance_km": total_km,
        "total_duration_mins": sum(leg["duration_mins"] for leg in legs),
        "estimated_fare": total_fare,
    }


@router.post("")
async def create_parcel(data: ParcelCreateRequest, request: Request):
    user = await get_current_user(request)
    legs, total_km, total_fare = _compute_legs(data.pickup_lat, data.pickup_lng, data.stops, data.vehicle_type)
    parcel = {
        "id": f"parcel_{uuid.uuid4().hex[:12]}",
        "user_id": user["id"],
        "driver_id": None,
        "vehicle_type": data.vehicle_type,
        "delivery_mode": "multi" if len(data.stops) > 1 else "single",
        "pickup_lat": data.pickup_lat,
        "pickup_lng": data.pickup_lng,
        "pickup_address": data.pickup_address,
        "sender_name": data.sender_name,
        "sender_phone": data.sender_phone,
        "stops": [s.model_dump() for s in data.stops],
        "legs": legs,
        "total_distance_km": total_km,
        "total_duration_mins": sum(leg["duration_mins"] for leg in legs),
        "fare": total_fare,
        "payment_method": data.payment_method,
        "payment_status": "pending",
        "status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "estimated_delivery": (datetime.now(timezone.utc) + timedelta(minutes=20 + 10 * len(data.stops))).isoformat(),
    }
    await db.parcels.insert_one(parcel)
    parcel.pop("_id", None)
    try:
        await manager.broadcast_to_drivers({"type": "new_parcel", "parcel_id": parcel["id"], "fare": total_fare})
    except Exception:
        pass
    return parcel


@router.get("")
async def list_my_parcels(request: Request, limit: int = 20):
    user = await get_current_user(request)
    items = await db.parcels.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(limit)
    return items


@router.get("/{parcel_id}")
async def get_parcel(parcel_id: str, request: Request):
    user = await get_current_user(request)
    parcel = await db.parcels.find_one({"id": parcel_id}, {"_id": 0})
    if not parcel:
        raise HTTPException(status_code=404, detail="Parcel not found")
    if parcel["user_id"] != user["id"] and user["role"] not in ["admin", "dispatcher", "driver"]:
        raise HTTPException(status_code=403, detail="Access denied")
    return parcel
