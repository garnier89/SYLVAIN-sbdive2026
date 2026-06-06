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
    for leg in legs:
        leg["status"] = "pending"  # pending → delivered (per drop-off)
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


async def _driver_live_location(driver_id):
    """Last known driver position: in-memory (live) first, else persisted in db.drivers."""
    if not driver_id:
        return None
    loc = manager.get_driver_location(driver_id)
    if loc and loc.get("lat") is not None:
        return {"lat": loc["lat"], "lng": loc["lng"]}
    drv = await db.drivers.find_one({"user_id": driver_id}, {"_id": 0, "current_lat": 1, "current_lng": 1})
    if drv and drv.get("current_lat") is not None:
        return {"lat": drv["current_lat"], "lng": drv["current_lng"]}
    return None


@router.get("/{parcel_id}")
async def get_parcel(parcel_id: str, request: Request):
    user = await get_current_user(request)
    parcel = await db.parcels.find_one({"id": parcel_id}, {"_id": 0})
    if not parcel:
        raise HTTPException(status_code=404, detail="Parcel not found")
    if parcel["user_id"] != user["id"] and user["role"] not in ["admin", "dispatcher", "driver"]:
        raise HTTPException(status_code=403, detail="Access denied")
    parcel["driver_location"] = await _driver_live_location(parcel.get("driver_id"))
    # Dynamic ETA: courier → next relevant point (pickup, or next undelivered drop-off)
    loc = parcel["driver_location"]
    label, eta = None, None
    if loc:
        status = parcel.get("status")
        if status in ("accepted", "arrived_pickup", "pending", None):
            tgt, label = (parcel.get("pickup_lat"), parcel.get("pickup_lng")), "le ramassage"
        else:
            nxt = next((lg for lg in parcel.get("legs", []) if lg.get("status") != "delivered"), None)
            stops = parcel.get("stops", [])
            if nxt and nxt["index"] < len(stops):
                s = stops[nxt["index"]]
                tgt, label = (s.get("lat"), s.get("lng")), f"le dépôt {nxt['index'] + 1}"
            else:
                tgt = (None, None)
        if tgt[0] is not None:
            km = calculate_distance(loc["lat"], loc["lng"], tgt[0], tgt[1])
            eta = max(1, round(km / 25 * 60))
    parcel["eta_minutes"] = eta
    parcel["eta_target_label"] = label
    return parcel


# ── Driver side: accept & per-step status ─────────────────────────────────
PARCEL_FLOW = ["pending", "accepted", "arrived_pickup", "picked_up", "in_transit", "completed"]


@router.get("/driver/available")
async def driver_available_parcels(request: Request):
    user = await get_current_user(request)
    # Only "courier" (coursier) drivers receive parcel / express-courier jobs
    driver = await db.drivers.find_one({"user_id": user["id"]}, {"_id": 0, "service_types": 1})
    svc = (driver or {}).get("service_types") or ["taxi", "delivery", "courier"]
    if "courier" not in svc:
        return []
    items = await db.parcels.find({"status": "pending", "driver_id": None}, {"_id": 0}).sort("created_at", -1).to_list(30)
    return items


@router.get("/driver/active")
async def driver_active_parcels(request: Request):
    user = await get_current_user(request)
    items = await db.parcels.find({"driver_id": user["id"], "status": {"$ne": "completed"}}, {"_id": 0}).sort("created_at", -1).to_list(30)
    return items


@router.post("/{parcel_id}/accept")
async def accept_parcel(parcel_id: str, request: Request):
    user = await get_current_user(request)
    parcel = await db.parcels.find_one({"id": parcel_id}, {"_id": 0})
    if not parcel:
        raise HTTPException(status_code=404, detail="Parcel not found")
    if parcel.get("driver_id"):
        raise HTTPException(status_code=400, detail="Colis déjà pris en charge")
    await db.parcels.update_one({"id": parcel_id}, {"$set": {"driver_id": user["id"], "status": "accepted", "accepted_at": datetime.now(timezone.utc).isoformat()}})
    return {**parcel, "driver_id": user["id"], "status": "accepted"}


@router.post("/{parcel_id}/status")
async def update_parcel_status(parcel_id: str, request: Request):
    user = await get_current_user(request)
    body = await request.json()
    new_status = body.get("status")
    if new_status not in PARCEL_FLOW:
        raise HTTPException(status_code=400, detail="Statut invalide")
    parcel = await db.parcels.find_one({"id": parcel_id}, {"_id": 0})
    if not parcel:
        raise HTTPException(status_code=404, detail="Parcel not found")
    if parcel.get("driver_id") != user["id"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    await db.parcels.update_one({"id": parcel_id}, {"$set": {"status": new_status}})
    return {"id": parcel_id, "status": new_status}


@router.post("/{parcel_id}/legs/{index}/deliver")
async def deliver_parcel_leg(parcel_id: str, index: int, request: Request):
    user = await get_current_user(request)
    parcel = await db.parcels.find_one({"id": parcel_id}, {"_id": 0})
    if not parcel:
        raise HTTPException(status_code=404, detail="Parcel not found")
    if parcel.get("driver_id") != user["id"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    legs = parcel.get("legs", [])
    if index < 0 or index >= len(legs):
        raise HTTPException(status_code=404, detail="Dépôt introuvable")
    legs[index]["status"] = "delivered"
    all_done = all(leg.get("status") == "delivered" for leg in legs)
    new_status = "completed" if all_done else "in_transit"
    await db.parcels.update_one({"id": parcel_id}, {"$set": {"legs": legs, "status": new_status}})
    return {"id": parcel_id, "legs": legs, "status": new_status, "all_delivered": all_done}
