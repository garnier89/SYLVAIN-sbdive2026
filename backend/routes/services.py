from fastapi import APIRouter, Request, HTTPException
import uuid
from datetime import datetime, timezone
from typing import Optional

from core.config import db
from core.deps import get_current_user
from core.seed_data import SERVICE_CATEGORIES
from core.websocket import manager
from routes.coupons import compute_coupon_discount


router = APIRouter(prefix="/services", tags=["services"])

# Service booking status flow (mirrors the V3Cube on-demand service lifecycle)
SVC_TRANSITIONS = {
    "pending": ["confirmed", "cancelled"],
    "confirmed": ["in_progress", "cancelled"],
    "in_progress": ["completed", "cancelled"],
}


@router.get("/categories")
async def list_service_categories():
    """Return service categories with full V3Cube structure."""
    return SERVICE_CATEGORIES


@router.post("/estimate")
async def estimate_service(request: Request):
    """Live price breakdown for a service booking (base * qty − promo)."""
    user = await get_current_user(request)
    body = await request.json()
    base_price = float(body.get("base_price") or 0)
    quantity = max(1, int(body.get("quantity") or 1))
    subtotal = round(base_price * quantity, 2)
    coupon = await compute_coupon_discount(body.get("coupon_code"), subtotal, user["id"])
    discount = coupon["discount_amount"] if coupon["valid"] else 0.0
    total = round(max(0, subtotal - discount), 2)
    return {
        "base_price": base_price,
        "quantity": quantity,
        "subtotal": subtotal,
        "discount": discount,
        "promo_valid": coupon["valid"],
        "total": total,
        "currency": "EUR",
    }


@router.post("/bookings")
async def create_service_booking(request: Request):
    user = await get_current_user(request)
    body = await request.json()

    base_price = float(body.get("base_price") or 0)
    quantity = max(1, int(body.get("quantity") or 1))
    subtotal = round(base_price * quantity, 2)
    coupon = await compute_coupon_discount(body.get("coupon_code"), subtotal, user["id"])
    discount = coupon["discount_amount"] if coupon["valid"] else 0.0
    total = round(max(0, subtotal - discount), 2)

    provider_id = body.get("provider_id")
    provider_name = body.get("provider_name")
    # A chosen provider auto-confirms the booking; otherwise it waits for assignment.
    status = "confirmed" if provider_id else "pending"
    now = datetime.now(timezone.utc).isoformat()

    booking = {
        "id": f"svcbk_{uuid.uuid4().hex[:12]}",
        "user_id": user["id"],
        "user_name": user.get("name"),
        "category": body["category"],
        "service_key": body.get("service_key"),
        "service_name": body["service_name"],
        "provider_id": provider_id,
        "provider_name": provider_name,
        "provider_phone": body.get("provider_phone"),
        "address": body.get("address", ""),
        "lat": body.get("lat"),
        "lng": body.get("lng"),
        "is_instant": bool(body.get("is_instant")),
        "scheduled_date": body.get("scheduled_date"),
        "scheduled_time": body.get("scheduled_time"),
        "notes": body.get("notes", ""),
        "quantity": quantity,
        "base_price": base_price,
        "subtotal": subtotal,
        "coupon_code": coupon.get("code") if coupon["valid"] else None,
        "discount": discount,
        "price": total,
        "currency": "EUR",
        "payment_method": body.get("payment_method", "cash"),
        "payment_status": "pending",
        "status": status,
        "confirmed_at": now if status == "confirmed" else None,
        "created_at": now,
    }
    await db.service_bookings.insert_one(booking)
    booking.pop("_id", None)

    # Record coupon usage so per-user limits hold
    if coupon["valid"]:
        await db.coupon_usage.insert_one({
            "id": f"cu_{uuid.uuid4().hex[:10]}", "coupon_code": coupon["code"],
            "user_id": user["id"], "booking_id": booking["id"], "created_at": now,
        })
        await db.coupons.update_one({"code": coupon["code"]}, {"$inc": {"used": 1}})

    # Notify the admin cockpit in real time
    await manager.broadcast_to_admins({
        "type": "new_service_booking",
        "booking_id": booking["id"],
        "category": booking["category"],
        "service_name": booking["service_name"],
        "provider_name": provider_name,
        "price": total,
        "status": status,
        "user_id": user["id"],
        "created_at": now,
    })
    return booking


@router.get("/bookings")
async def list_service_bookings(request: Request, status: Optional[str] = None, limit: int = 50):
    user = await get_current_user(request)
    query = {"user_id": user["id"]}
    if status:
        query["status"] = status
    bookings = await db.service_bookings.find(query, {"_id": 0}).sort("created_at", -1).limit(limit).to_list(limit)
    return bookings


@router.get("/bookings/{booking_id}")
async def get_service_booking(booking_id: str, request: Request):
    user = await get_current_user(request)
    query = {"id": booking_id}
    if user["role"] not in ("admin", "dispatcher"):
        query["user_id"] = user["id"]
    booking = await db.service_bookings.find_one(query, {"_id": 0})
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    return booking


@router.post("/bookings/{booking_id}/status")
async def update_service_booking_status(booking_id: str, request: Request):
    """Advance a service booking through its lifecycle (admin/dispatcher)."""
    user = await get_current_user(request)
    if user["role"] not in ("admin", "dispatcher"):
        raise HTTPException(status_code=403, detail="Admin only")
    body = await request.json()
    new_status = body.get("status")
    booking = await db.service_bookings.find_one({"id": booking_id}, {"_id": 0})
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    allowed = SVC_TRANSITIONS.get(booking["status"], [])
    if new_status not in allowed:
        raise HTTPException(status_code=400, detail=f"Cannot go from '{booking['status']}' to '{new_status}'")
    now = datetime.now(timezone.utc).isoformat()
    update = {"status": new_status}
    if new_status == "completed":
        update["completed_at"] = now
        if booking.get("payment_method") != "cash":
            update["payment_status"] = "paid"
    await db.service_bookings.update_one({"id": booking_id}, {"$set": update})
    await manager.send_personal_message({
        "type": "service_booking_update", "booking_id": booking_id, "status": new_status,
    }, booking["user_id"])
    return {"message": "Status updated", "status": new_status}


@router.post("/bookings/{booking_id}/cancel")
async def cancel_service_booking(booking_id: str, request: Request):
    user = await get_current_user(request)
    result = await db.service_bookings.update_one(
        {"id": booking_id, "user_id": user["id"], "status": {"$in": ["pending", "confirmed"]}},
        {"$set": {"status": "cancelled", "cancelled_at": datetime.now(timezone.utc).isoformat()}}
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Booking not found or cannot be cancelled")
    return {"message": "Booking cancelled"}


@router.get("/nearby")
async def get_nearby_businesses(lat: float = 48.8566, lng: float = 2.3522, category: Optional[str] = None, limit: int = 20):
    query = {"is_active": True}
    if category:
        query["category"] = category
    businesses = await db.nearby_businesses.find(query, {"_id": 0}).limit(limit).to_list(limit)
    return businesses
