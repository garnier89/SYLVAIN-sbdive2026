from fastapi import APIRouter, Request, Response, HTTPException, Query
import uuid
from datetime import datetime, timezone
from typing import Optional

from core.config import db, STRIPE_API_KEY, logger
from core.deps import get_current_user, require_role, get_object
from models.schemas import TicketCreate

router = APIRouter(tags=["support_admin"])


# Wallet routes moved to routes/wallet.py

# ===== STRIPE WEBHOOK =====
@router.post("/webhook/stripe")
async def stripe_webhook(request: Request):
    from emergentintegrations.payments.stripe.checkout import StripeCheckout
    body = await request.body()
    sig = request.headers.get("Stripe-Signature")
    stripe_checkout = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url="")
    try:
        webhook_response = await stripe_checkout.handle_webhook(body, sig)
        if webhook_response.payment_status == "paid":
            session_id = webhook_response.session_id
            txn = await db.payment_transactions.find_one({"session_id": session_id})
            if txn and txn["status"] != "completed":
                if txn["type"] == "wallet_topup":
                    await db.wallets.update_one({"user_id": txn["user_id"]}, {"$inc": {"balance": txn["amount"]}})
                await db.payment_transactions.update_one({"session_id": session_id}, {"$set": {"status": "completed"}})
        return {"status": "ok"}
    except Exception as e:
        logger.error(f"Webhook error: {e}")
        return {"status": "error"}


# ===== SUPPORT =====
@router.post("/support/tickets")
async def create_ticket(data: TicketCreate, request: Request):
    user = await get_current_user(request)
    ticket = {
        "id": f"ticket_{uuid.uuid4().hex[:12]}", "user_id": user["id"],
        "subject": data.subject, "message": data.message,
        "related_id": data.related_id, "related_type": data.related_type,
        "status": "open", "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.support_tickets.insert_one(ticket)
    ticket.pop("_id", None)
    return ticket


@router.get("/support/tickets")
async def list_tickets(request: Request):
    user = await get_current_user(request)
    if user["role"] == "admin":
        tickets = await db.support_tickets.find({}, {"_id": 0}).sort("created_at", -1).to_list(100)
    else:
        tickets = await db.support_tickets.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return tickets


@router.post("/support/tickets/{ticket_id}/reply")
async def reply_to_ticket(ticket_id: str, request: Request):
    user = await get_current_user(request)
    body = await request.json()
    message = body.get("message")
    ticket = await db.support_tickets.find_one({"id": ticket_id})
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    if ticket["user_id"] != user["id"] and user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Access denied")
    reply = {"user_id": user["id"], "message": message, "created_at": datetime.now(timezone.utc).isoformat()}
    await db.support_tickets.update_one({"id": ticket_id}, {"$push": {"replies": reply}})
    return {"message": "Reply added"}


# ===== ADMIN =====
@router.get("/admin/dashboard")
async def admin_dashboard(request: Request):
    await require_role(request, ["admin"])
    total_users = await db.users.count_documents({"role": "user"})
    total_drivers = await db.drivers.count_documents({})
    active_drivers = await db.drivers.count_documents({"is_online": True})
    total_merchants = await db.merchants.count_documents({})
    today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    today_rides = await db.rides.count_documents({"created_at": {"$gte": today.isoformat()}})
    today_orders = await db.orders.count_documents({"created_at": {"$gte": today.isoformat()}})
    pending_drivers = await db.drivers.count_documents({"status": "pending"})
    open_tickets = await db.support_tickets.count_documents({"status": "open"})
    completed_rides = await db.rides.find({"status": "completed", "created_at": {"$gte": today.isoformat()}}, {"final_fare": 1}).to_list(1000)
    completed_orders = await db.orders.find({"status": "delivered", "created_at": {"$gte": today.isoformat()}}, {"total": 1}).to_list(1000)
    today_revenue = sum(r.get("final_fare", 0) or 0 for r in completed_rides) + sum(o.get("total", 0) for o in completed_orders)
    return {"total_users": total_users, "total_drivers": total_drivers, "active_drivers": active_drivers, "total_merchants": total_merchants, "today_rides": today_rides, "today_orders": today_orders, "today_revenue": round(today_revenue, 2), "pending_drivers": pending_drivers, "open_tickets": open_tickets}


@router.get("/admin/users")
async def admin_list_users(request: Request, role: Optional[str] = None, limit: int = 50, skip: int = 0):
    await require_role(request, ["admin"])
    query = {}
    if role:
        query["role"] = role
    users = await db.users.find(query, {"_id": 0, "password_hash": 0}).skip(skip).limit(limit).to_list(limit)
    total = await db.users.count_documents(query)
    return {"users": users, "total": total}


@router.get("/admin/drivers")
async def admin_list_drivers(request: Request, status: Optional[str] = None, limit: int = 50, skip: int = 0):
    await require_role(request, ["admin"])
    query = {}
    if status:
        query["status"] = status
    drivers = await db.drivers.find(query, {"_id": 0}).skip(skip).limit(limit).to_list(limit)
    total = await db.drivers.count_documents(query)
    for driver in drivers:
        user = await db.users.find_one({"id": driver["user_id"]}, {"_id": 0, "password_hash": 0})
        driver["user"] = user
    return {"drivers": drivers, "total": total}


@router.post("/admin/drivers/{driver_id}/approve")
async def approve_driver(driver_id: str, request: Request):
    await require_role(request, ["admin"])
    result = await db.drivers.update_one({"id": driver_id}, {"$set": {"status": "approved"}})
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Driver not found")
    return {"message": "Driver approved"}


@router.post("/admin/drivers/{driver_id}/reject")
async def reject_driver(driver_id: str, request: Request):
    await require_role(request, ["admin"])
    body = await request.json()
    reason = body.get("reason", "")
    result = await db.drivers.update_one({"id": driver_id}, {"$set": {"status": "rejected", "rejection_reason": reason}})
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Driver not found")
    return {"message": "Driver rejected"}


@router.get("/admin/rides")
async def admin_list_rides(request: Request, status: Optional[str] = None, limit: int = 50, skip: int = 0):
    await require_role(request, ["admin", "dispatcher"])
    query = {}
    if status:
        query["status"] = status
    rides = await db.rides.find(query, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    total = await db.rides.count_documents(query)
    return {"rides": rides, "total": total}


@router.get("/admin/orders")
async def admin_list_orders(request: Request, status: Optional[str] = None, limit: int = 50, skip: int = 0):
    await require_role(request, ["admin", "dispatcher"])
    query = {}
    if status:
        query["status"] = status
    orders = await db.orders.find(query, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    total = await db.orders.count_documents(query)
    return {"orders": orders, "total": total}


@router.post("/admin/users/{user_id}/suspend")
async def suspend_user(user_id: str, request: Request):
    await require_role(request, ["admin"])
    result = await db.users.update_one({"id": user_id}, {"$set": {"is_suspended": True}})
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return {"message": "User suspended"}


@router.post("/admin/users/{user_id}/unsuspend")
async def unsuspend_user(user_id: str, request: Request):
    await require_role(request, ["admin"])
    result = await db.users.update_one({"id": user_id}, {"$set": {"is_suspended": False}})
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return {"message": "User unsuspended"}


# ===== DISPATCHER =====
@router.get("/dispatcher/live")
async def dispatcher_live_data(request: Request):
    await require_role(request, ["admin", "dispatcher"])
    online_drivers = await db.drivers.find({"is_online": True, "current_lat": {"$ne": None}}, {"_id": 0}).to_list(500)
    pending_rides = await db.rides.find({"status": {"$in": ["pending", "accepted", "arriving", "in_progress"]}}, {"_id": 0}).to_list(100)
    pending_orders = await db.orders.find({"status": {"$in": ["pending", "accepted", "preparing", "ready", "picked_up"]}}, {"_id": 0}).to_list(100)
    return {"drivers": online_drivers, "rides": pending_rides, "orders": pending_orders}


@router.post("/dispatcher/assign-ride")
async def dispatcher_assign_ride(request: Request):
    await require_role(request, ["admin", "dispatcher"])
    body = await request.json()
    ride_id, driver_id = body.get("ride_id"), body.get("driver_id")
    driver = await db.drivers.find_one({"id": driver_id, "status": "approved", "is_online": True})
    if not driver:
        raise HTTPException(status_code=400, detail="Driver not available")
    result = await db.rides.update_one({"id": ride_id, "status": "pending"}, {"$set": {"driver_id": driver_id, "status": "accepted"}})
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Ride not found or already assigned")
    from core.websocket import manager
    await manager.send_personal_message({"type": "ride_assigned", "ride_id": ride_id}, driver["user_id"])
    return {"message": "Ride assigned"}


# ===== FILES =====
@router.get("/files/{path:path}")
async def download_file(path: str, request: Request, auth: Optional[str] = Query(None)):
    try:
        data, content_type = get_object(path)
        return Response(content=data, media_type=content_type)
    except Exception:
        raise HTTPException(status_code=404, detail="File not found")


# ===== HEALTH =====
@router.get("/")
async def root():
    return {"message": "SuperApp API", "status": "healthy"}

@router.get("/health")
async def health():
    return {"status": "ok"}
