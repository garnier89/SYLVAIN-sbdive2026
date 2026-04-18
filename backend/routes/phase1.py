"""Phase 1 Taxi Ops endpoints: ride chat, start-OTP, favorite drivers, stopovers, emergency contacts, SOS."""
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Request, HTTPException

from core.config import db
from core.deps import get_current_user
from core.websocket import manager

router = APIRouter(prefix="/phase1", tags=["phase1"])


# ═══════════ RIDE CHAT (Passenger ↔ Driver) ═══════════

@router.get("/rides/{ride_id}/messages")
async def get_ride_messages(ride_id: str, request: Request):
    user = await get_current_user(request)
    ride = await db.rides.find_one({"id": ride_id}, {"_id": 0, "user_id": 1, "driver_id": 1})
    if not ride:
        raise HTTPException(status_code=404, detail="Ride not found")

    # Authorize: ride's passenger or its driver user
    is_passenger = ride["user_id"] == user["id"]
    is_driver = False
    if not is_passenger and ride.get("driver_id"):
        d = await db.drivers.find_one({"id": ride["driver_id"]}, {"_id": 0, "user_id": 1})
        is_driver = d and d["user_id"] == user["id"]
    if not (is_passenger or is_driver):
        raise HTTPException(status_code=403, detail="Not allowed")

    msgs = await db.ride_messages.find({"ride_id": ride_id}, {"_id": 0}).sort("created_at", 1).to_list(500)
    return msgs


@router.post("/rides/{ride_id}/messages")
async def send_ride_message(ride_id: str, request: Request):
    user = await get_current_user(request)
    ride = await db.rides.find_one({"id": ride_id}, {"_id": 0})
    if not ride:
        raise HTTPException(status_code=404, detail="Ride not found")

    is_passenger = ride["user_id"] == user["id"]
    is_driver = False
    if not is_passenger and ride.get("driver_id"):
        d = await db.drivers.find_one({"id": ride["driver_id"]}, {"_id": 0, "user_id": 1})
        is_driver = d and d["user_id"] == user["id"]
    if not (is_passenger or is_driver):
        raise HTTPException(status_code=403, detail="Not allowed")

    body = await request.json()
    text = (body.get("text") or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Message required")

    msg = {
        "id": f"msg_{uuid.uuid4().hex[:10]}",
        "ride_id": ride_id,
        "sender_id": user["id"],
        "sender_name": user.get("name", "User"),
        "sender_role": "driver" if is_driver else "passenger",
        "text": text[:1000],
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.ride_messages.insert_one(msg)
    msg.pop("_id", None)
    await manager.send_to_ride_room(ride_id, {"type": "chat_message", "message": msg})
    return msg


# ═══════════ OTP TO START RIDE ═══════════

@router.post("/rides/{ride_id}/start-otp/request")
async def request_start_otp(ride_id: str, request: Request):
    """Passenger: request/rotate start OTP for the ride (shown on their screen)."""
    user = await get_current_user(request)
    ride = await db.rides.find_one({"id": ride_id}, {"_id": 0})
    if not ride:
        raise HTTPException(status_code=404, detail="Ride not found")
    if ride["user_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Not your ride")

    import random
    otp = str(random.randint(1000, 9999))
    await db.rides.update_one({"id": ride_id}, {"$set": {"start_otp": otp}})
    return {"otp": otp}


@router.post("/rides/{ride_id}/start-otp/verify")
async def verify_start_otp(ride_id: str, request: Request):
    """Driver: verify OTP and switch ride to in_progress."""
    user = await get_current_user(request)
    if user.get("role") != "driver":
        raise HTTPException(status_code=403, detail="Driver only")
    ride = await db.rides.find_one({"id": ride_id}, {"_id": 0})
    if not ride:
        raise HTTPException(status_code=404, detail="Ride not found")

    body = await request.json()
    otp = (body.get("otp") or "").strip()
    if not otp or otp != ride.get("start_otp"):
        raise HTTPException(status_code=400, detail="Invalid OTP")
    if ride.get("status") not in ("accepted", "arriving"):
        raise HTTPException(status_code=400, detail="Ride not ready")

    now = datetime.now(timezone.utc).isoformat()
    await db.rides.update_one({"id": ride_id}, {"$set": {
        "status": "in_progress",
        "started_at": now,
    }})
    await manager.send_to_ride_room(ride_id, {"type": "ride_started", "ride_id": ride_id, "started_at": now})
    return {"message": "Ride started", "ride_id": ride_id}


# ═══════════ FAVORITE DRIVERS ═══════════

@router.get("/favorite-drivers")
async def list_favorite_drivers(request: Request):
    user = await get_current_user(request)
    favs = await db.favorite_drivers.find({"user_id": user["id"]}, {"_id": 0}).to_list(100)
    # enrich
    enriched = []
    for f in favs:
        d = await db.drivers.find_one({"id": f["driver_id"]}, {"_id": 0})
        if not d:
            continue
        u = await db.users.find_one({"id": d["user_id"]}, {"_id": 0, "name": 1, "avatar_url": 1}) or {}
        enriched.append({
            "driver_id": d["id"],
            "name": u.get("name", f.get("driver_name", "Chauffeur")),
            "avatar_url": u.get("avatar_url"),
            "vehicle_model": d.get("vehicle_model"),
            "vehicle_type": d.get("vehicle_type"),
            "rating": d.get("rating", 5.0),
            "total_trips": d.get("total_trips", 0),
            "added_at": f.get("created_at"),
        })
    return enriched


@router.post("/favorite-drivers/{driver_id}")
async def add_favorite_driver(driver_id: str, request: Request):
    user = await get_current_user(request)
    driver = await db.drivers.find_one({"id": driver_id}, {"_id": 0, "user_id": 1})
    if not driver:
        raise HTTPException(status_code=404, detail="Driver not found")
    driver_user = await db.users.find_one({"id": driver["user_id"]}, {"_id": 0, "name": 1})
    doc = {
        "id": f"fav_{uuid.uuid4().hex[:10]}",
        "user_id": user["id"],
        "driver_id": driver_id,
        "driver_name": (driver_user or {}).get("name", "Chauffeur"),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    # upsert: user+driver is unique
    await db.favorite_drivers.update_one(
        {"user_id": user["id"], "driver_id": driver_id},
        {"$setOnInsert": doc},
        upsert=True,
    )
    return {"message": "Added", "driver_id": driver_id}


@router.delete("/favorite-drivers/{driver_id}")
async def remove_favorite_driver(driver_id: str, request: Request):
    user = await get_current_user(request)
    await db.favorite_drivers.delete_one({"user_id": user["id"], "driver_id": driver_id})
    return {"message": "Removed"}


# ═══════════ STOPOVERS ═══════════

@router.put("/rides/{ride_id}/stopovers")
async def set_stopovers(ride_id: str, request: Request):
    """Passenger sets intermediate stops for an existing ride."""
    user = await get_current_user(request)
    ride = await db.rides.find_one({"id": ride_id}, {"_id": 0})
    if not ride:
        raise HTTPException(status_code=404, detail="Ride not found")
    if ride["user_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Not your ride")
    if ride.get("status") not in ("pending", "accepted", "arriving", "in_progress"):
        raise HTTPException(status_code=400, detail="Cannot edit stopovers")
    body = await request.json()
    stops = body.get("stopovers", [])
    if not isinstance(stops, list) or len(stops) > 5:
        raise HTTPException(status_code=400, detail="Max 5 stopovers")
    # Validate shape
    clean = []
    for s in stops:
        if not isinstance(s, dict):
            continue
        clean.append({
            "address": s.get("address", ""),
            "lat": float(s.get("lat") or 0),
            "lng": float(s.get("lng") or 0),
        })
    await db.rides.update_one({"id": ride_id}, {"$set": {"stopovers": clean}})
    await manager.send_to_ride_room(ride_id, {"type": "stopovers_updated", "ride_id": ride_id, "stopovers": clean})
    return {"message": "Stopovers updated", "stopovers": clean}


# ═══════════ EMERGENCY CONTACTS + SOS ═══════════

@router.get("/emergency-contacts")
async def list_emergency_contacts(request: Request):
    user = await get_current_user(request)
    contacts = await db.emergency_contacts.find({"user_id": user["id"]}, {"_id": 0}).to_list(10)
    return contacts


@router.post("/emergency-contacts")
async def add_emergency_contact(request: Request):
    user = await get_current_user(request)
    count = await db.emergency_contacts.count_documents({"user_id": user["id"]})
    if count >= 5:
        raise HTTPException(status_code=400, detail="Max 5 emergency contacts")
    body = await request.json()
    name = (body.get("name") or "").strip()
    phone = (body.get("phone") or "").strip()
    if not name or not phone:
        raise HTTPException(status_code=400, detail="Name and phone required")
    doc = {
        "id": f"ec_{uuid.uuid4().hex[:10]}",
        "user_id": user["id"],
        "name": name,
        "phone": phone,
        "relation": (body.get("relation") or "").strip(),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.emergency_contacts.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.delete("/emergency-contacts/{contact_id}")
async def remove_emergency_contact(contact_id: str, request: Request):
    user = await get_current_user(request)
    result = await db.emergency_contacts.delete_one({"id": contact_id, "user_id": user["id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    return {"message": "Removed"}


@router.post("/sos")
async def trigger_sos(request: Request):
    """Trigger SOS: store alert + broadcast to admin. (SMS to contacts would require Twilio.)"""
    user = await get_current_user(request)
    body = await request.json()
    contacts = await db.emergency_contacts.find({"user_id": user["id"]}, {"_id": 0}).to_list(5)

    alert = {
        "id": f"sos_{uuid.uuid4().hex[:10]}",
        "user_id": user["id"],
        "user_name": user.get("name"),
        "user_phone": user.get("phone"),
        "user_role": user.get("role"),
        "ride_id": body.get("ride_id"),
        "lat": body.get("lat"),
        "lng": body.get("lng"),
        "address": body.get("address", ""),
        "message": (body.get("message") or "").strip()[:500],
        "status": "active",
        "contacts_notified": [{"name": c["name"], "phone": c["phone"]} for c in contacts],
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.sos_alerts.insert_one(alert)
    alert.pop("_id", None)
    # Broadcast to admin room
    try:
        await manager.broadcast_to_admins({"type": "sos_alert", "alert": alert})
    except Exception:
        pass
    return {"message": "SOS triggered", "alert_id": alert["id"], "contacts_count": len(contacts)}
