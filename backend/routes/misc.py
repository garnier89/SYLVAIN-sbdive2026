from fastapi import APIRouter, Request, Response, HTTPException, Query
import uuid
from datetime import datetime, timezone, timedelta
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


@router.get("/admin/revenue")
async def admin_revenue(request: Request):
    await require_role(request, ["admin"])
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    week_start = (now - timedelta(days=now.weekday())).replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0).isoformat()

    all_completed = await db.rides.find({"status": "completed"}, {"_id": 0, "estimated_fare": 1, "final_fare": 1, "created_at": 1, "commission_percent": 1}).to_list(5000)

    today_rides = [r for r in all_completed if r.get("created_at", "") >= today_start]
    week_rides = [r for r in all_completed if r.get("created_at", "") >= week_start]
    month_rides = [r for r in all_completed if r.get("created_at", "") >= month_start]

    def calc(rides_list):
        total = sum(r.get("final_fare", r.get("estimated_fare", 0)) or 0 for r in rides_list)
        commission = sum((r.get("final_fare", r.get("estimated_fare", 0)) or 0) * ((r.get("commission_percent") or 10) / 100) for r in rides_list)
        return round(total, 2), round(commission, 2)

    today_total, today_comm = calc(today_rides)
    week_total, week_comm = calc(week_rides)
    month_total, month_comm = calc(month_rides)
    all_total, all_comm = calc(all_completed)

    # Recent transactions
    recent = await db.rides.find({"status": "completed"}, {"_id": 0}).sort("created_at", -1).limit(20).to_list(20)

    return {
        "today": {"total": today_total, "commission": today_comm, "rides": len(today_rides)},
        "week": {"total": week_total, "commission": week_comm, "rides": len(week_rides)},
        "month": {"total": month_total, "commission": month_comm, "rides": len(month_rides)},
        "all_time": {"total": all_total, "commission": all_comm, "rides": len(all_completed)},
        "recent_transactions": recent,
    }



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


# ===== ADMIN SETTINGS =====
@router.get("/admin/settings")
async def get_admin_settings(request: Request):
    await require_role(request, ["admin"])
    doc = await db.admin_settings.find_one({"key": "global"}, {"_id": 0})
    if not doc:
        return {"settings": {
            "platform_name": "SB Drive VTC", "admin_country_code": "1", "country_code": "FR",
            "default_distance_unit": "KMs", "wallet_amount_1": "699", "wallet_amount_2": "799",
            "wallet_amount_3": "899", "google_analytics_id": "", "records_per_page": "50",
            "maintenance_mode": "No", "default_currency": "EUR", "default_language": "fr",
            "commission_rate": "10", "min_fare": "5.0", "surge_multiplier": "1.0",
            "auto_assign_rides": True, "notifications_enabled": True,
            "smtp_host": "", "smtp_port": "587", "smtp_user": "", "smtp_password": "",
            "sender_email": "", "sms_provider": "twilio", "sms_api_key": "",
            "primary_color": "#3b82f6", "secondary_color": "#FF4500",
            "maps_api_key": "", "stripe_key": "", "stripe_secret": "",
        }}
    return {"settings": doc.get("settings", {})}


@router.put("/admin/settings")
async def update_admin_settings(request: Request):
    await require_role(request, ["admin"])
    body = await request.json()
    settings = body.get("settings", {})
    await db.admin_settings.update_one(
        {"key": "global"},
        {"$set": {"key": "global", "settings": settings, "updated_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True
    )
    return {"message": "Settings saved", "settings": settings}


# ===== HEALTH =====
@router.get("/")
async def root():
    return {"message": "SuperApp API", "status": "healthy"}

@router.get("/health")
async def health():
    return {"status": "ok"}


# ===== PUBLIC/AUTHED SUPPORT CONTACT =====
@router.post("/support/contact")
async def submit_support_contact(request: Request):
    """Any authenticated user (user/driver/merchant/admin) can submit a support contact message."""
    user = await get_current_user(request)
    body = await request.json()
    message = (body.get("message") or "").strip()
    if not message:
        raise HTTPException(status_code=400, detail="Message required")
    doc = {
        "id": f"con_{uuid.uuid4().hex[:8]}",
        "user_id": user["id"],
        "name": user.get("name") or body.get("name") or "User",
        "email": user.get("email") or body.get("email", ""),
        "phone": user.get("phone") or body.get("phone", ""),
        "role": user.get("role"),
        "subject": body.get("subject", "Support request"),
        "message": message,
        "status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.admin_contact_requests.insert_one(doc)
    doc.pop("_id", None)
    return {"message": "Received", "id": doc["id"]}



# ═══════════ CLIENT → ADMIN CROSS-FLOW HELPERS ═══════════

@router.post("/rides/{ride_id}/help")
async def submit_trip_help(ride_id: str, request: Request):
    user = await get_current_user(request)
    body = await request.json()
    issue = (body.get("issue") or "").strip()
    if not issue:
        raise HTTPException(status_code=400, detail="Issue required")
    doc = {
        "id": f"trh_{uuid.uuid4().hex[:10]}",
        "user_id": user["id"],
        "name": user.get("name", "User"),
        "phone": user.get("phone", ""),
        "ride_id": ride_id,
        "issue": issue[:500],
        "status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.admin_trip_help_requests.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.post("/orders/{order_id}/help")
async def submit_order_help(order_id: str, request: Request):
    user = await get_current_user(request)
    body = await request.json()
    issue = (body.get("issue") or "").strip()
    if not issue:
        raise HTTPException(status_code=400, detail="Issue required")
    doc = {
        "id": f"oh_{uuid.uuid4().hex[:10]}",
        "user_id": user["id"],
        "name": user.get("name", "User"),
        "order_id": order_id,
        "issue": issue[:500],
        "status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.admin_order_help_requests.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.post("/wallet/withdraw-request")
async def submit_withdraw_request(request: Request):
    user = await get_current_user(request)
    body = await request.json()
    amount = float(body.get("amount", 0))
    iban = (body.get("iban") or "").strip()
    if amount < 10:
        raise HTTPException(status_code=400, detail="Minimum 10 EUR")
    if not iban:
        raise HTTPException(status_code=400, detail="IBAN required")
    # Check wallet balance
    wallet = await db.wallets.find_one({"user_id": user["id"]}, {"_id": 0}) or {}
    if (wallet.get("balance", 0) or 0) < amount:
        raise HTTPException(status_code=400, detail="Insufficient balance")
    doc = {
        "id": f"wr_{uuid.uuid4().hex[:10]}",
        "user_id": user["id"],
        "name": user.get("name", "User"),
        "phone": user.get("phone", ""),
        "amount": amount,
        "iban": iban,
        "status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.admin_withdraw_requests.insert_one(doc)
    # Freeze amount
    await db.wallets.update_one({"user_id": user["id"]}, {"$inc": {"balance": -amount, "pending_withdraw": amount}})
    doc.pop("_id", None)
    return doc

