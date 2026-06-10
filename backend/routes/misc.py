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
    await require_role(request, ["admin"], permission="users.view")
    query = {}
    if role:
        query["role"] = role
    users = await db.users.find(query, {"_id": 0, "password_hash": 0}).skip(skip).limit(limit).to_list(limit)
    total = await db.users.count_documents(query)
    # Enrich each user with wallet_balance via batched fetch
    if users:
        ids = [u["id"] for u in users]
        wallets = await db.wallets.find({"user_id": {"$in": ids}}, {"_id": 0, "user_id": 1, "balance": 1}).to_list(len(ids))
        wallet_map = {w["user_id"]: w.get("balance", 0) for w in wallets}
        for u in users:
            u["wallet_balance"] = wallet_map.get(u["id"], 0)
    return {"users": users, "total": total}


@router.get("/admin/drivers")
async def admin_list_drivers(request: Request, status: Optional[str] = None, limit: int = 50, skip: int = 0):
    await require_role(request, ["admin"], permission="drivers.view")
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
    user = await require_role(request, ["admin"], permission="drivers.approve")
    result = await db.drivers.update_one({"id": driver_id}, {"$set": {"status": "approved"}})
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Driver not found")
    try:
        from routes.audit_logs import log_action
        await log_action(actor_id=user["id"], actor_role=user["role"], action="driver.approve",
                         target_type="driver", target_id=driver_id,
                         ip_address=request.client.host if request.client else None)
    except Exception:
        pass
    return {"message": "Driver approved"}


@router.post("/admin/drivers/{driver_id}/reject")
async def reject_driver(driver_id: str, request: Request):
    user = await require_role(request, ["admin"], permission="drivers.reject")
    body = await request.json()
    reason = body.get("reason", "")
    result = await db.drivers.update_one({"id": driver_id}, {"$set": {"status": "rejected", "rejection_reason": reason}})
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Driver not found")
    try:
        from routes.audit_logs import log_action
        await log_action(actor_id=user["id"], actor_role=user["role"], action="driver.reject",
                         target_type="driver", target_id=driver_id, reason=reason,
                         ip_address=request.client.host if request.client else None)
    except Exception:
        pass
    return {"message": "Driver rejected"}


@router.put("/admin/drivers/{driver_id}/service-types")
async def admin_set_driver_service_types(driver_id: str, request: Request):
    """ADMIN override: enable/disable the services a driver handles
    (taxi / delivery / courier) in one click. Unlike the driver self-service
    endpoint, this bypasses the VTC gate (admin authority). Enabling 'taxi' makes
    the driver eligible to receive scheduled taxi reservations on the home-feed."""
    user = await require_role(request, ["admin"], permission="drivers.approve")
    body = await request.json()
    allowed = {"taxi", "delivery", "courier"}
    service_types = [s for s in (body.get("service_types") or []) if s in allowed]
    if not service_types:
        raise HTTPException(status_code=400, detail="Sélectionnez au moins un service (taxi, livraison ou coursier)")
    driver = await db.drivers.find_one({"id": driver_id}, {"_id": 0, "id": 1, "taxi_mode": 1})
    if driver is None:
        raise HTTPException(status_code=404, detail="Driver not found")
    update = {"service_types": service_types}
    if "taxi" in service_types:
        update["taxi_mode"] = body.get("taxi_mode") or driver.get("taxi_mode") or "car"
    else:
        update["taxi_mode"] = None
    await db.drivers.update_one({"id": driver_id}, {"$set": update})
    try:
        from routes.audit_logs import log_action
        await log_action(actor_id=user["id"], actor_role=user["role"], action="driver.service_types.update",
                         target_type="driver", target_id=driver_id,
                         ip_address=request.client.host if request.client else None)
    except Exception:
        pass
    return {"message": "Services mis à jour", "driver_id": driver_id,
            "service_types": service_types, "taxi_mode": update["taxi_mode"]}


@router.get("/admin/drivers/{driver_id}/documents")
async def admin_get_driver_documents(driver_id: str, request: Request):
    """List a driver's documents merged with the documents required by their categories."""
    await require_role(request, ["admin"], permission="drivers.view")
    d = await db.drivers.find_one({"id": driver_id}, {"_id": 0})
    if not d:
        raise HTTPException(status_code=404, detail="Driver not found")
    from routes.drivers import build_documents_view
    view = await build_documents_view(d)
    user = await db.users.find_one({"id": d["user_id"]}, {"_id": 0, "password_hash": 0}) or {}
    return {
        **view, "driver_id": driver_id, "driver_status": d.get("status"),
        "rejection_reason": d.get("rejection_reason"),
        "driver_name": user.get("name"), "driver_email": user.get("email"),
        "vehicle_type": d.get("vehicle_type"), "categories": d.get("categories") or [],
        "company_name": d.get("company_name"), "license_number": d.get("license_number"),
        "vehicle_number": d.get("vehicle_number"), "vehicle_model": d.get("vehicle_model"),
        "pending_info": d.get("pending_info"),
    }


@router.put("/admin/drivers/{driver_id}/info-change/status")
async def admin_set_driver_info_change_status(driver_id: str, request: Request):
    """Approve / reject a driver's pending professional-info change (company name / license number)."""
    actor = await require_role(request, ["admin"], permission="drivers.approve")
    body = await request.json()
    status_value = body.get("status")
    if status_value not in ("approved", "rejected"):
        raise HTTPException(status_code=400, detail="status doit être approved ou rejected")
    reason = (body.get("reason") or "").strip()
    d = await db.drivers.find_one({"id": driver_id}, {"_id": 0})
    if not d:
        raise HTTPException(status_code=404, detail="Driver not found")
    pending = d.get("pending_info")
    if not pending or pending.get("status") != "pending":
        raise HTTPException(status_code=404, detail="Aucune demande de modification en attente")

    now = datetime.now(timezone.utc).isoformat()
    updates = {}
    if status_value == "approved":
        if pending.get("company_name"):
            updates["company_name"] = pending["company_name"]
        if pending.get("license_number"):
            updates["license_number"] = pending["license_number"]
        title, msg = ("Informations validées ✅",
                      "Vos informations professionnelles (société / licence) ont été approuvées.")
    else:
        title, msg = ("Modification refusée",
                      "Votre demande de modification d'informations a été refusée."
                      + (f" Motif : {reason}" if reason else ""))
    updates["pending_info"] = {**pending, "status": status_value, "reason": reason or None, "reviewed_at": now}
    await db.drivers.update_one({"id": driver_id}, {"$set": updates})

    try:
        from routes.audit_logs import log_action
        await log_action(actor_id=actor["id"], actor_role=actor["role"],
                         action=f"driver.info_change.{status_value}", target_type="driver",
                         target_id=driver_id, reason=reason,
                         ip_address=request.client.host if request.client else None)
    except Exception:
        pass

    from core.notifications import create_notification
    await create_notification(
        d["user_id"], "driver_info_reviewed", title, msg,
        data={"status": status_value, "reason": reason},
        ws_payload={"type": "driver_info_reviewed", "status": status_value, "reason": reason,
                    "title": title, "body": msg},
    )
    return {
        "message": "Demande traitée", "status": status_value,
        "company_name": updates.get("company_name", d.get("company_name")),
        "license_number": updates.get("license_number", d.get("license_number")),
        "pending_info": updates["pending_info"],
    }


@router.put("/admin/drivers/{driver_id}/documents/{doc_type}/status")
async def admin_set_driver_document_status(driver_id: str, doc_type: str, request: Request):
    """Approve / reject / reset a specific uploaded driver document (db.drivers.documents)."""
    actor = await require_role(request, ["admin"], permission="drivers.approve")
    body = await request.json()
    status_value = body.get("status")
    if status_value not in ("approved", "rejected", "pending"):
        raise HTTPException(status_code=400, detail="status doit être approved, rejected ou pending")
    reason = (body.get("reason") or "").strip()
    d = await db.drivers.find_one({"id": driver_id}, {"_id": 0})
    if not d:
        raise HTTPException(status_code=404, detail="Driver not found")
    docs = d.get("documents") or []
    idx = None
    for i, doc in enumerate(docs):  # target the most recent upload of this type
        if doc.get("type") == doc_type:
            idx = i
    if idx is None:
        raise HTTPException(status_code=404, detail="Document non trouvé pour ce chauffeur")
    docs[idx]["status"] = status_value
    docs[idx]["reason"] = reason
    docs[idx]["reviewed_at"] = datetime.now(timezone.utc).isoformat()
    await db.drivers.update_one({"id": driver_id}, {"$set": {"documents": docs}})
    try:
        from routes.audit_logs import log_action
        await log_action(actor_id=actor["id"], actor_role=actor["role"],
                         action=f"driver.document.{status_value}", target_type="driver",
                         target_id=driver_id, reason=f"{doc_type}: {reason}",
                         ip_address=request.client.host if request.client else None)
    except Exception:
        pass
    from routes.drivers import build_documents_view
    view = await build_documents_view({**d, "documents": docs})

    # ── Auto-update driver account status from document completeness ──
    driver_status = d.get("status")
    account_event = None  # ("approved" | "pending", title, body)
    if view["all_required_approved"] and driver_status in ("pending", "rejected", None):
        await db.drivers.update_one({"id": driver_id}, {"$set": {"status": "approved", "rejection_reason": None}})
        driver_status = "approved"
        account_event = ("approved", "Compte validé 🎉",
                         "Tous vos documents sont approuvés. Vous pouvez recevoir des courses !")
    elif status_value == "rejected" and (matched := next((it for it in view["documents"] if it["key"] == doc_type), None)) and matched.get("required") and driver_status == "approved":
        await db.drivers.update_one({"id": driver_id}, {"$set": {"status": "pending"}})
        driver_status = "pending"
        account_event = ("pending", "Compte en vérification",
                         "Un document requis a été refusé : votre compte repasse en vérification.")

    # ── Notify the driver: in-app WS toast + mobile Expo push + persisted feed item ──
    matched = next((it for it in view["documents"] if it["key"] == doc_type), None)
    label = (matched or {}).get("label") or doc_type
    if status_value == "approved":
        title, msg = "Document validé ✅", f"Votre document « {label} » a été approuvé."
    elif status_value == "rejected":
        title, msg = "Document refusé", f"Votre document « {label} » a été refusé." + (f" Motif : {reason}" if reason else "")
    else:
        title, msg = "Document en attente", f"Votre document « {label} » est de nouveau en attente de validation."
    uid = d["user_id"]
    from core.notifications import create_notification
    await create_notification(
        uid, "driver_document_reviewed", title, msg,
        data={"doc_type": doc_type, "status": status_value, "reason": reason},
        ws_payload={"type": "driver_document_reviewed", "doc_type": doc_type, "doc_label": label,
                    "status": status_value, "reason": reason, "title": title, "body": msg},
    )
    if account_event:
        await create_notification(uid, "account_status", account_event[1], account_event[2],
                                  data={"status": account_event[0]})
    return {"message": "Document mis à jour", "driver_status": driver_status, **view}


@router.get("/admin/rides")
async def admin_list_rides(request: Request, status: Optional[str] = None, limit: int = 50, skip: int = 0):
    await require_role(request, ["admin", "dispatcher"], permission="dispatch.view")
    query = {}
    if status:
        query["status"] = status
    rides = await db.rides.find(query, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    total = await db.rides.count_documents(query)
    return {"rides": rides, "total": total}


@router.get("/admin/orders")
async def admin_list_orders(request: Request, status: Optional[str] = None, limit: int = 50, skip: int = 0):
    await require_role(request, ["admin", "dispatcher"], permission="merchants.view")
    query = {}
    if status:
        query["status"] = status
    orders = await db.orders.find(query, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    total = await db.orders.count_documents(query)
    return {"orders": orders, "total": total}


@router.post("/admin/users/{user_id}/suspend")
async def suspend_user(user_id: str, request: Request):
    actor = await require_role(request, ["admin"], permission="users.suspend")
    result = await db.users.update_one({"id": user_id}, {"$set": {"is_suspended": True}})
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    try:
        from routes.audit_logs import log_action
        await log_action(actor_id=actor["id"], actor_role=actor["role"], action="user.suspend",
                         target_type="user", target_id=user_id,
                         ip_address=request.client.host if request.client else None)
    except Exception:
        pass
    return {"message": "User suspended"}


@router.post("/admin/users/{user_id}/unsuspend")
async def unsuspend_user(user_id: str, request: Request):
    await require_role(request, ["admin"], permission="users.suspend")
    result = await db.users.update_one({"id": user_id}, {"$set": {"is_suspended": False}})
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return {"message": "User unsuspended"}


@router.get("/admin/revenue")
async def admin_revenue(request: Request):
    await require_role(request, ["admin"], permission="billing.view")
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
    await require_role(request, ["admin", "dispatcher"], permission="dispatch.view")
    online_drivers = await db.drivers.find({"is_online": True, "current_lat": {"$ne": None}}, {"_id": 0}).to_list(500)
    pending_rides = await db.rides.find({"status": {"$in": ["pending", "accepted", "arriving", "in_progress"]}}, {"_id": 0}).to_list(100)
    pending_orders = await db.orders.find({"status": {"$in": ["pending", "accepted", "preparing", "ready", "picked_up"]}}, {"_id": 0}).to_list(100)
    return {"drivers": online_drivers, "rides": pending_rides, "orders": pending_orders}


@router.post("/dispatcher/assign-ride")
async def dispatcher_assign_ride(request: Request):
    await require_role(request, ["admin", "dispatcher"], permission="dispatch.assign")
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
    await require_role(request, ["admin"], permission="server.settings.edit")
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
    await require_role(request, ["admin"], permission="server.settings.edit")
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
    # Only drivers & merchants can withdraw — clients cannot.
    if user.get("role") not in ("driver", "merchant"):
        raise HTTPException(status_code=403, detail="Seuls les chauffeurs et marchands peuvent demander un retrait.")
    body = await request.json()
    try:
        amount = round(float(body.get("amount", 0)), 2)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="Montant invalide")
    iban = (body.get("iban") or "").strip()

    from core.wallet_reserve import ensure_reserve_credited, get_reserve_config, get_user_region
    floor = await ensure_reserve_credited(user)
    cfg = await get_reserve_config()
    wmin = float(cfg.get("withdraw_min", 10) or 10)
    if amount < wmin:
        raise HTTPException(status_code=400, detail=f"Minimum {wmin:.0f} EUR")
    if not iban:
        raise HTTPException(status_code=400, detail="IBAN required")
    wallet = await db.wallets.find_one({"user_id": user["id"]}, {"_id": 0}) or {}
    balance = float(wallet.get("balance", 0) or 0)
    pending = float(wallet.get("pending_withdraw", 0) or 0)
    available = round(balance - floor - pending, 2)
    if amount > available:
        raise HTTPException(
            status_code=400,
            detail=f"Montant retirable max {max(0.0, available):.2f} € (réserve de {floor:.0f} € conservée)",
        )
    doc = {
        "id": f"wr_{uuid.uuid4().hex[:10]}",
        "user_id": user["id"],
        "name": user.get("name", "User"),
        "phone": user.get("phone", ""),
        "role": user.get("role"),
        "region": get_user_region(user),
        "amount": amount,
        "iban": iban,
        "status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.admin_withdraw_requests.insert_one(doc)
    # Freeze amount (held in suspense until admin validates)
    await db.wallets.update_one({"user_id": user["id"]}, {"$inc": {"balance": -amount, "pending_withdraw": amount}})
    doc.pop("_id", None)
    return doc

