from fastapi import APIRouter, Request, HTTPException
from datetime import datetime, timezone, timedelta
import uuid

from core.config import db
from core.deps import require_role

router = APIRouter(prefix="/admin", tags=["admin"])


# ===== VEHICLE TYPE — full configuration schema (V3Cube parity) =====
VT_FIELDS = [
    # identity & display
    "name_fr", "name_en", "name_translations", "name_rental", "category",
    "icon_type", "show_as", "info", "currency", "display_order",
    # feature toggles
    "allow_whatsapp_booking", "enable_pool", "assist_available", "pet_friendly",
    "ask_otp_before_ride", "fare_model_strategy",
    # base pricing
    "price_per_km", "price_per_min", "min_fare", "base_fare", "commission_percent",
    "zone_overrides",
    # waiting & cancellation
    "user_cancel_time_limit", "user_cancel_charges", "waiting_time_limit",
    "waiting_charges", "intransit_waiting_fee_per_min", "cancellation_fare",
    # capacity & surge
    "person_capacity", "peak_slot1", "peak_slot2", "night_charges",
    # images
    "image_unselected", "image_selected",
]

VT_DEFAULTS = {
    "name_fr": "", "name_en": "", "name_translations": {}, "name_rental": "",
    "category": "ride", "icon_type": "Car", "show_as": "list", "info": "",
    "currency": "EUR", "display_order": 99,
    "allow_whatsapp_booking": False, "enable_pool": False, "assist_available": False,
    "pet_friendly": False, "ask_otp_before_ride": False, "fare_model_strategy": "incremental",
    "price_per_km": 1.5, "price_per_min": 0.3, "min_fare": 10.0, "base_fare": 5.0,
    "commission_percent": 15.0, "zone_overrides": [],
    "user_cancel_time_limit": 5, "user_cancel_charges": 4.0, "waiting_time_limit": 1,
    "waiting_charges": 20.0, "intransit_waiting_fee_per_min": 0.3, "cancellation_fare": 5.0,
    "person_capacity": 4,
    "peak_slot1": {"enabled": False, "days": {}}, "peak_slot2": {"enabled": False, "days": {}},
    "night_charges": {"enabled": False, "days": {}},
    "image_unselected": None, "image_selected": None,
}


# ===== DEFAULT REWARDS / POINTS CONFIG =====
DEFAULT_REWARDS_CONFIG = {
    "regard_vehicles": [
        {"id": "rv_car", "type": "Voiture", "icon": "Car", "active": True, "start_date": "", "end_date": "", "start_time": "06:00", "end_time": "23:00", "zone": "Martinique", "bonus_per_trip": 3, "min_trips": 5, "description": "Bonus course voiture"},
        {"id": "rv_moto", "type": "Moto", "icon": "Motorcycle", "active": False, "start_date": "", "end_date": "", "start_time": "08:00", "end_time": "22:00", "zone": "Paris", "bonus_per_trip": 2, "min_trips": 8, "description": "Bonus course moto"},
        {"id": "rv_velo", "type": "Velo", "icon": "Bicycle", "active": False, "start_date": "", "end_date": "", "start_time": "07:00", "end_time": "21:00", "zone": "Fort-de-France", "bonus_per_trip": 1.5, "min_trips": 10, "description": "Bonus course velo"},
    ],
    "guarantees": [
        {"id": "g_day", "name": "Garantie Journee Standard", "active": True, "start_hour": "12:00", "end_hour": "20:00", "min_revenue": 59, "acceptance_rate": 80, "max_cancellation": 10, "zone": "Martinique", "start_date": "", "end_date": "", "description": "Entre 12h et 20h, CA min 59EUR"},
    ],
    "points": {
        "initial_points": 100,
        "points_per_ride_accepted": 2,
        "points_per_ride_completed": 3,
        "points_lost_per_refuse": 5,
        "points_lost_per_cancel": 10,
        "palettes": [
            {"id": "p1", "name": "Debutant", "min_points": 0, "max_points": 30, "priority_access": False, "max_ride_amount": 20, "color": "#EF4444"},
            {"id": "p2", "name": "Standard", "min_points": 31, "max_points": 60, "priority_access": False, "max_ride_amount": 50, "color": "#F59E0B"},
            {"id": "p3", "name": "Confirme", "min_points": 61, "max_points": 80, "priority_access": True, "max_ride_amount": 100, "color": "#3B82F6"},
            {"id": "p4", "name": "Expert", "min_points": 81, "max_points": 100, "priority_access": True, "max_ride_amount": 999, "color": "#10B981"},
        ],
    },
}


async def get_rewards_config():
    """Return the rewards config merged with defaults."""
    doc = await db.service_configs.find_one({"service_key": "rewards"}, {"_id": 0})
    if not doc or not doc.get("settings"):
        return DEFAULT_REWARDS_CONFIG
    s = doc["settings"]
    return {
        "regard_vehicles": s.get("regard_vehicles") or DEFAULT_REWARDS_CONFIG["regard_vehicles"],
        "guarantees": s.get("guarantees") or DEFAULT_REWARDS_CONFIG["guarantees"],
        "points": s.get("points") or DEFAULT_REWARDS_CONFIG["points"],
    }


@router.get("/vehicle-types")
async def admin_list_vehicle_types(request: Request):
    await require_role(request, ["admin"], permission="server.settings.edit")
    types = await db.vehicle_types.find({}, {"_id": 0}).sort("display_order", 1).to_list(100)
    return types


@router.post("/vehicle-types")
async def create_vehicle_type(request: Request):
    await require_role(request, ["admin"], permission="server.settings.edit")
    body = await request.json()
    slug = body.get("slug")
    if not slug:
        raise HTTPException(status_code=400, detail="slug is required")
    existing = await db.vehicle_types.find_one({"slug": slug})
    if existing:
        raise HTTPException(status_code=409, detail="Vehicle type already exists")
    doc = {**VT_DEFAULTS, "slug": slug, "status": "active",
           "created_at": datetime.now(timezone.utc).isoformat()}
    for field in VT_FIELDS:
        if field in body:
            doc[field] = body[field]
    await db.vehicle_types.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.put("/vehicle-types/{slug}")
async def update_vehicle_type(slug: str, request: Request):
    await require_role(request, ["admin"], permission="server.settings.edit")
    body = await request.json()
    update = {}
    for field in VT_FIELDS + ["status"]:
        if field in body:
            update[field] = body[field]
    if not update:
        raise HTTPException(status_code=400, detail="No fields to update")
    result = await db.vehicle_types.update_one({"slug": slug}, {"$set": update})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Vehicle type not found")
    return {"message": f"Vehicle type '{slug}' updated"}


@router.post("/vehicle-types/translate")
async def translate_vehicle_type_name(request: Request):
    """Auto-translate a vehicle type name into all supported languages via LLM."""
    await require_role(request, ["admin"], permission="server.settings.edit")
    import os
    import json as _json
    body = await request.json()
    text = (body.get("text") or "").strip()
    langs = body.get("langs") or []
    if not text or not langs:
        raise HTTPException(status_code=400, detail="text et langs requis")
    api_key = os.environ.get("EMERGENT_LLM_KEY")
    if not api_key:
        raise HTTPException(status_code=503, detail="Service de traduction indisponible")
    lang_list = ", ".join(langs)
    prompt = (
        "Translate the following vehicle category name into these languages "
        f"(ISO codes): {lang_list}. Keep it short (1-3 words), natural for a ride-hailing app. "
        'Reply ONLY with a JSON object mapping each ISO code to its translation, no markdown.\n'
        f'Name: "{text}"'
    )
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        chat = (
            LlmChat(api_key=api_key, session_id=f"vt-translate-{uuid.uuid4().hex[:8]}",
                    system_message="You are a professional localization assistant. Output strict JSON only.")
            .with_model("anthropic", "claude-sonnet-4-6")
        )
        raw = await chat.send_message(UserMessage(text=prompt))
        cleaned = raw.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.split("```")[1].replace("json", "", 1).strip()
        translations = _json.loads(cleaned)
        return {"translations": {k: v for k, v in translations.items() if k in langs}}
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Échec de la traduction: {e}")


@router.delete("/vehicle-types/{slug}")
async def delete_vehicle_type(slug: str, request: Request):
    await require_role(request, ["admin"], permission="server.settings.edit")
    result = await db.vehicle_types.delete_one({"slug": slug})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Vehicle type not found")
    return {"message": f"Vehicle type '{slug}' deleted"}


@router.post("/merchants/{merchant_id}/status")
async def update_merchant_status(merchant_id: str, request: Request):
    await require_role(request, ["admin"], permission="merchants.activate")
    body = await request.json()
    new_status = body.get("status", "active")
    result = await db.merchants.update_one({"id": merchant_id}, {"$set": {"status": new_status}})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Merchant not found")
    return {"message": f"Merchant status updated to {new_status}"}


@router.get("/stats")
async def get_admin_stats(request: Request):
    await require_role(request, ["admin"])
    users_count = await db.users.count_documents({})
    drivers_count = await db.drivers.count_documents({})
    rides_count = await db.rides.count_documents({})
    orders_count = await db.orders.count_documents({})
    merchants_count = await db.merchants.count_documents({})
    return {
        "users": users_count,
        "drivers": drivers_count,
        "rides": rides_count,
        "orders": orders_count,
        "merchants": merchants_count,
    }


# ===== USER DETAIL / EDIT (matches XJekPlus Edit User page) =====

@router.get("/users/{user_id}")
async def admin_get_user(user_id: str, request: Request):
    await require_role(request, ["admin"], permission="users.view")
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(404, "User not found")
    wallet = await db.wallets.find_one({"user_id": user_id}, {"_id": 0, "balance": 1}) or {}
    user["wallet_balance"] = wallet.get("balance", 0)
    return user


@router.post("/users")
async def admin_create_user(request: Request):
    await require_role(request, ["admin"], permission="users.create")
    from core.deps import hash_password
    body = await request.json()
    first_name = (body.get("first_name") or "").strip()
    last_name = (body.get("last_name") or "").strip()
    email = (body.get("email") or "").strip().lower()
    password = body.get("password") or ""
    phone_code = (body.get("phone_code") or "").strip()
    phone = (body.get("phone") or "").strip().replace(" ", "")
    if not first_name or not email or not password:
        raise HTTPException(400, "first_name, email et password sont requis")
    if await db.users.find_one({"email": email}):
        raise HTTPException(400, "Email déjà utilisé")
    full_phone = f"{phone_code}{phone}" if phone_code and not phone.startswith("+") else phone
    if full_phone and await db.users.find_one({"phone": full_phone}):
        raise HTTPException(400, "Numéro déjà utilisé")
    user_id = f"user_{uuid.uuid4().hex[:12]}"
    doc = {
        "id": user_id,
        "email": email,
        "password_hash": hash_password(password),
        "first_name": first_name,
        "last_name": last_name,
        "name": f"{first_name} {last_name}".strip() or email,
        "phone": full_phone or None,
        "phone_code": phone_code or None,
        "gender": body.get("gender"),
        "country": body.get("country"),
        "language": body.get("language") or "fr",
        "currency": body.get("currency") or "EUR",
        "avatar_url": body.get("avatar_url"),
        "role": "user",
        "is_verified": False,
        "is_suspended": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(doc)
    await db.wallets.insert_one({"user_id": user_id, "balance": 0.0, "created_at": doc["created_at"]})
    doc.pop("password_hash", None)
    doc.pop("_id", None)
    return doc


@router.put("/users/{user_id}")
async def admin_update_user(user_id: str, request: Request):
    await require_role(request, ["admin"], permission="users.edit")
    from core.deps import hash_password
    body = await request.json()
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(404, "User not found")
    updates = {}
    for field in ("first_name", "last_name", "gender", "country", "language", "currency", "avatar_url", "phone_code"):
        if body.get(field) is not None:
            updates[field] = body[field]
    if body.get("first_name") is not None or body.get("last_name") is not None:
        fn = body.get("first_name", user.get("first_name", ""))
        ln = body.get("last_name", user.get("last_name", ""))
        updates["name"] = f"{fn} {ln}".strip() or user.get("name") or user.get("email")
    if body.get("email"):
        email = body["email"].strip().lower()
        if email != user.get("email") and await db.users.find_one({"email": email, "id": {"$ne": user_id}}):
            raise HTTPException(400, "Email déjà utilisé")
        updates["email"] = email
    if body.get("phone") is not None:
        phone = body["phone"].strip().replace(" ", "")
        code = body.get("phone_code", user.get("phone_code", ""))
        full = f"{code}{phone}" if code and not phone.startswith("+") else phone
        if full and await db.users.find_one({"phone": full, "id": {"$ne": user_id}}):
            raise HTTPException(400, "Numéro déjà utilisé")
        updates["phone"] = full or None
    if body.get("password"):
        updates["password_hash"] = hash_password(body["password"])
    if body.get("is_active") is not None:
        updates["is_suspended"] = not bool(body["is_active"])
    if updates:
        await db.users.update_one({"id": user_id}, {"$set": updates})
    return {"updated": True}


@router.delete("/users/{user_id}")
async def admin_delete_user(user_id: str, request: Request):
    await require_role(request, ["admin"], permission="users.delete")
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "role": 1})
    if not user:
        raise HTTPException(404, "User not found")
    if user.get("role") == "admin":
        raise HTTPException(400, "Impossible de supprimer un admin via cette route (utilisez /api/acl/admins)")
    await db.users.delete_one({"id": user_id})
    await db.wallets.delete_many({"user_id": user_id})
    return {"deleted": True}

@router.get("/users/{user_id}/documents")
async def admin_get_user_documents(user_id: str, request: Request):
    """Return documents uploaded by the user (or empty list)."""
    await require_role(request, ["admin"], permission="users.view")
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "name": 1, "email": 1, "first_name": 1, "last_name": 1, "avatar_url": 1})
    if not user:
        raise HTTPException(404, "User not found")
    docs = await db.user_documents.find({"user_id": user_id}, {"_id": 0}).to_list(50)
    if user.get("avatar_url") and not any(d.get("type") == "profile" for d in docs):
        docs.insert(0, {
            "id": f"profile_{user_id}",
            "user_id": user_id,
            "type": "profile",
            "label": "Photo de profil",
            "file_url": user["avatar_url"],
            "mime_type": "image/*",
            "uploaded_at": None,
            "status": "active",
        })
    return {"user": user, "documents": docs, "total": len(docs)}


@router.post("/users/{user_id}/documents")
async def admin_upload_user_document(user_id: str, request: Request):
    """Attach a document on behalf of the user (data-URL or external link)."""
    await require_role(request, ["admin"], permission="users.edit")
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "id": 1})
    if not user:
        raise HTTPException(404, "User not found")
    body = await request.json()
    file_url = body.get("file_url")
    if not file_url:
        raise HTTPException(400, "file_url requis")
    if isinstance(file_url, str) and len(file_url) > 11_000_000:
        # ~8 MB binary => ~11 MB base64; protects MongoDB 16MB doc limit and prevents DoS
        raise HTTPException(413, "Fichier trop volumineux (max 8 Mo)")
    doc = {
        "id": f"doc_{uuid.uuid4().hex[:12]}",
        "user_id": user_id,
        "type": (body.get("type") or "other").strip(),
        "label": (body.get("label") or "Document").strip(),
        "file_url": file_url,
        "mime_type": body.get("mime_type") or "application/octet-stream",
        "uploaded_at": datetime.now(timezone.utc).isoformat(),
        "uploaded_by": "admin",
        "status": "pending_review",
    }
    await db.user_documents.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.delete("/users/{user_id}/documents/{doc_id}")
async def admin_delete_user_document(user_id: str, doc_id: str, request: Request):
    await require_role(request, ["admin"], permission="users.edit")
    res = await db.user_documents.delete_one({"id": doc_id, "user_id": user_id})
    if res.deleted_count == 0:
        raise HTTPException(404, "Document introuvable")
    return {"deleted": True}


@router.put("/users/{user_id}/documents/{doc_id}/status")
async def admin_update_document_status(user_id: str, doc_id: str, request: Request):
    """Approve/reject a KYC document. Sets is_verified=True on user when at least one doc is approved."""
    await require_role(request, ["admin"], permission="users.edit")
    body = await request.json()
    status_value = (body.get("status") or "").strip()
    if status_value not in ("approved", "rejected", "pending_review"):
        raise HTTPException(400, "status doit être approved, rejected ou pending_review")
    reason = (body.get("reason") or "").strip()[:300]
    now = datetime.now(timezone.utc).isoformat()
    updates = {"status": status_value, "reviewed_at": now, "reviewed_by": "admin"}
    if reason:
        updates["review_reason"] = reason
    res = await db.user_documents.update_one({"id": doc_id, "user_id": user_id}, {"$set": updates})
    if res.matched_count == 0:
        raise HTTPException(404, "Document introuvable")
    # If at least one doc approved → mark user verified; if all rejected → unverified
    approved_count = await db.user_documents.count_documents({"user_id": user_id, "status": "approved"})
    await db.users.update_one({"id": user_id}, {"$set": {"is_verified": approved_count > 0}})
    return {"status": status_value, "is_verified": approved_count > 0, "approved_count": approved_count}




@router.post("/users/{user_id}/wallet/credit")
async def admin_credit_user_wallet(user_id: str, request: Request):
    """Manually credit (or debit, with negative amount) a user's wallet from the admin UI."""
    await require_role(request, ["admin"], permission="billing.edit")
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "id": 1, "name": 1, "email": 1})
    if not user:
        raise HTTPException(404, "User not found")
    body = await request.json()
    try:
        amount = float(body.get("amount") or 0)
    except (TypeError, ValueError):
        raise HTTPException(400, "Montant invalide")
    if amount == 0:
        raise HTTPException(400, "Montant requis")
    note = (body.get("note") or "").strip()[:200]
    now = datetime.now(timezone.utc).isoformat()
    await db.wallets.update_one(
        {"user_id": user_id},
        {"$inc": {"balance": amount}, "$setOnInsert": {"user_id": user_id, "created_at": now}},
        upsert=True,
    )
    wallet = await db.wallets.find_one({"user_id": user_id}, {"_id": 0, "balance": 1})
    new_balance = wallet["balance"] if wallet else amount
    tx_type = "admin_credit" if amount > 0 else "admin_debit"
    await db.wallet_transactions.insert_one({
        "id": f"tx_{uuid.uuid4().hex[:12]}",
        "user_id": user_id,
        "amount": amount,
        "type": tx_type,
        "description": note or ("Crédit administrateur" if amount > 0 else "Débit administrateur"),
        "balance_after": new_balance,
        "created_at": now,
    })
    return {"new_balance": new_balance, "amount": amount, "type": tx_type}


# ===== ADMIN GENERAL SETTINGS =====

@router.get("/settings")
async def get_admin_general_settings(request: Request):
    await require_role(request, ["admin"], permission="server.settings.edit")
    doc = await db.service_configs.find_one({"service_key": "general"}, {"_id": 0})
    if not doc:
        return {"settings": {}}
    return doc


@router.put("/settings")
async def save_admin_general_settings(request: Request):
    await require_role(request, ["admin"], permission="server.settings.edit")
    body = await request.json()
    settings = body.get("settings", body)
    await db.service_configs.update_one(
        {"service_key": "general"},
        {"$set": {
            "service_key": "general",
            "settings": settings,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }},
        upsert=True,
    )
    return {"message": "Settings saved", "settings": settings}


@router.get("/analytics/delivery-monthly")
async def get_delivery_monthly(request: Request):
    """Monthly counts for Store Deliveries and Delivery Genie/Runner (last 12 months)."""
    await require_role(request, ["admin"])

    # Build the last 12 month buckets (oldest → newest)
    now = datetime.now(timezone.utc)
    y, m = now.year, now.month
    months_back = []
    for _ in range(12):
        months_back.append((y, m))
        m -= 1
        if m == 0:
            m = 12
            y -= 1
    months_back.reverse()
    MONTH_ABBR = ["", "Jan", "Fév", "Mar", "Avr", "Mai", "Juin", "Juil", "Aoû", "Sep", "Oct", "Nov", "Déc"]
    label = {(yy, mm): f"{MONTH_ABBR[mm]} {yy}" for (yy, mm) in months_back}

    def _bucket_key(iso):
        try:
            d = datetime.fromisoformat(str(iso).replace("Z", "+00:00"))
            return (d.year, d.month)
        except (TypeError, ValueError):
            return None

    # Store deliveries (orders collection)
    store_monthly = {k: 0 for k in months_back}
    store_total = 0
    async for o in db.orders.find({}, {"_id": 0, "created_at": 1}):
        store_total += 1
        bk = _bucket_key(o.get("created_at"))
        if bk in store_monthly:
            store_monthly[bk] += 1

    # Delivery Genie / Runner (runner_orders collection, split by service_type)
    runner_monthly = {k: {"runner": 0, "genie": 0} for k in months_back}
    gr_total = 0
    async for r in db.runner_orders.find({}, {"_id": 0, "created_at": 1, "service_type": 1}):
        gr_total += 1
        bk = _bucket_key(r.get("created_at"))
        if bk in runner_monthly:
            st = "genie" if (r.get("service_type") == "genie") else "runner"
            runner_monthly[bk][st] += 1

    buckets = months_back
    return {
        "store_deliveries": {
            "total": store_total,
            "monthly": [{"month": label[k], "count": store_monthly[k]} for k in buckets],
        },
        "delivery_genie_runner": {
            "total": gr_total,
            "monthly": [{"month": label[k], "runner": runner_monthly[k]["runner"], "genie": runner_monthly[k]["genie"]} for k in buckets],
        },
    }


@router.get("/analytics")
async def get_analytics(request: Request, period: str = "week"):
    await require_role(request, ["admin"])

    # Ride status breakdown
    pipeline_status = [
        {"$group": {"_id": "$status", "count": {"$sum": 1}}}
    ]
    status_results = await db.rides.aggregate(pipeline_status).to_list(20)
    status_map = {r["_id"]: r["count"] for r in status_results}

    # Recent rides
    recent_rides = await db.rides.find({}, {"_id": 0}).sort("created_at", -1).limit(5).to_list(5)

    # Total earnings
    earning_pipeline = [
        {"$match": {"status": "completed"}},
        {"$group": {"_id": None, "total": {"$sum": "$final_fare"}, "count": {"$sum": 1}}}
    ]
    earning_result = await db.rides.aggregate(earning_pipeline).to_list(1)
    total_earning = earning_result[0]["total"] if earning_result else 0
    completed_count = earning_result[0]["count"] if earning_result else 0

    # Commission calculation (15% default)
    commission_total = total_earning * 0.15

    # Scheduled bookings
    scheduled = await db.rides.find(
        {"scheduled_at": {"$ne": None}}, {"_id": 0}
    ).sort("scheduled_at", -1).limit(5).to_list(5)

    # Active drivers
    active_drivers = await db.drivers.count_documents({"is_online": True})
    total_drivers = await db.drivers.count_documents({})

    # Rides in progress
    in_progress = status_map.get("in_progress", 0) + status_map.get("arriving", 0)
    completed = status_map.get("completed", 0)
    cancelled = status_map.get("cancelled", 0)
    pending = status_map.get("pending", 0)

    return {
        "ride_status": {
            "in_progress": in_progress,
            "completed": completed,
            "cancelled": cancelled,
            "pending": pending,
        },
        "earnings": {
            "total": round(total_earning, 2),
            "commission": round(commission_total, 2),
            "outstanding": 0,
            "org_outstanding": 0,
        },
        "drivers": {
            "active": active_drivers,
            "total": total_drivers,
        },
        "recent_rides": recent_rides,
        "scheduled_bookings": scheduled,
        "completed_rides_count": completed_count,
    }


# ===== SERVICE CONFIGS =====

@router.get("/service-config/{service_key}")
async def get_service_config(service_key: str, request: Request):
    await require_role(request, ["admin"], permission="server.settings.edit")
    config = await db.service_configs.find_one({"service_key": service_key}, {"_id": 0})
    if not config:
        return {"service_key": service_key, "settings": {}}
    return config


@router.put("/service-config/{service_key}")
async def save_service_config(service_key: str, request: Request):
    await require_role(request, ["admin"], permission="server.settings.edit")
    body = await request.json()
    settings = body.get("settings", {})
    await db.service_configs.update_one(
        {"service_key": service_key},
        {"$set": {
            "service_key": service_key,
            "settings": settings,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }},
        upsert=True,
    )
    return {"message": f"Config '{service_key}' saved"}


# ===== CRUD ITEMS (groups, vehicles, company, etc.) =====

ALLOWED_CRUD = [
    "groups", "vehicles", "companies", "hotels", "organizations", "pending_requests",
    "vehicle_makes", "vehicle_models", "cancel_reasons", "email_templates", "sms_templates",
    "master_services", "sos_requests", "contact_requests", "withdraw_requests",
    "order_help_requests", "trip_help_requests", "push_notifications",
    "payouts", "settlements", "disputes", "documents",
    "banners", "wallet_requests", "news", "newsletter_subscribers", "promocodes",
    "beauty_salons", "pet_providers", "car_services", "towing_partners",
    "nearby_businesses", "ondemand_services", "carpool_trips", "marketplace_listings",
    "weather_surcharge", "personal_driver", "auto_promotions", "vouchers",
    "faqs", "help_articles", "donations",
]


def _crud_col(collection: str):
    if collection not in ALLOWED_CRUD:
        raise HTTPException(status_code=400, detail="Invalid collection")
    return db[f"admin_{collection}"]


@router.get("/crud/{collection}")
async def list_crud_items(collection: str, request: Request):
    await require_role(request, ["admin"], permission="server.settings.edit")
    col = _crud_col(collection)
    items = await col.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return items


@router.post("/crud/{collection}")
async def create_crud_item(collection: str, request: Request):
    await require_role(request, ["admin"], permission="server.settings.edit")
    col = _crud_col(collection)
    body = await request.json()
    body["id"] = f"{collection[:3]}_{uuid.uuid4().hex[:8]}"
    body["created_at"] = datetime.now(timezone.utc).isoformat()
    await col.insert_one(body)
    body.pop("_id", None)
    return body


@router.put("/crud/{collection}/{item_id}")
async def update_crud_item(collection: str, item_id: str, request: Request):
    await require_role(request, ["admin"], permission="server.settings.edit")
    col = _crud_col(collection)
    body = await request.json()
    body.pop("id", None)
    body.pop("_id", None)
    result = await col.update_one({"id": item_id}, {"$set": body})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Item not found")
    return {"message": "Updated"}


@router.delete("/crud/{collection}/{item_id}")
async def delete_crud_item(collection: str, item_id: str, request: Request):
    await require_role(request, ["admin"], permission="server.settings.edit")
    col = _crud_col(collection)
    result = await col.delete_one({"id": item_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Item not found")
    return {"message": "Deleted"}


# ===== REWARDS CONFIG (vehicle regards + revenue guarantees + driver points) =====

@router.get("/rewards/config")
async def get_admin_rewards_config(request: Request):
    await require_role(request, ["admin"], permission="drivers.rewards.config")
    return await get_rewards_config()


@router.put("/rewards/config")
async def save_admin_rewards_config(request: Request):
    await require_role(request, ["admin"], permission="drivers.rewards.config")
    body = await request.json()
    settings = {
        "regard_vehicles": body.get("regard_vehicles", DEFAULT_REWARDS_CONFIG["regard_vehicles"]),
        "guarantees": body.get("guarantees", DEFAULT_REWARDS_CONFIG["guarantees"]),
        "points": body.get("points", DEFAULT_REWARDS_CONFIG["points"]),
    }
    await db.service_configs.update_one(
        {"service_key": "rewards"},
        {"$set": {
            "service_key": "rewards",
            "settings": settings,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }},
        upsert=True,
    )
    return {"message": "Rewards config saved", "settings": settings}


# ===== PRIORITY DRIVERS (manually boosted by admin) =====

@router.get("/priority-drivers")
async def list_priority_drivers(request: Request):
    """List all drivers with their priority state (manual + computed from points)."""
    await require_role(request, ["admin"], permission="drivers.priority.toggle")
    config = await get_rewards_config()
    palettes = config["points"]["palettes"]

    def resolve_palette(points: int):
        for p in palettes:
            if p["min_points"] <= points <= p["max_points"]:
                return p
        return palettes[0] if palettes else None

    drivers = await db.drivers.find({}, {"_id": 0}).to_list(500)
    result = []
    for d in drivers:
        user_doc = await db.users.find_one({"id": d["user_id"]}, {"_id": 0, "name": 1, "email": 1, "phone": 1})
        points = d.get("points", config["points"]["initial_points"])
        palette = resolve_palette(points)
        result.append({
            "driver_id": d["id"],
            "user_id": d["user_id"],
            "name": (user_doc or {}).get("name", "Chauffeur"),
            "email": (user_doc or {}).get("email", ""),
            "phone": (user_doc or {}).get("phone", ""),
            "vehicle_type": d.get("vehicle_type"),
            "vehicle_number": d.get("vehicle_number"),
            "status": d.get("status"),
            "is_online": d.get("is_online", False),
            "points": points,
            "total_trips": d.get("total_trips", 0),
            "rating": d.get("rating", 5.0),
            "manual_priority": d.get("manual_priority", False),
            "manual_priority_note": d.get("manual_priority_note", ""),
            "acceptance_rate": d.get("acceptance_rate", 100),
            "cancellation_rate": d.get("cancellation_rate", 0),
            "palette_name": palette["name"] if palette else "",
            "palette_color": palette["color"] if palette else "#9CA3AF",
            "has_priority": d.get("manual_priority", False) or (palette["priority_access"] if palette else False),
        })
    # Sort: manual priority first, then by points desc
    result.sort(key=lambda x: (not x["manual_priority"], -x["points"]))
    return result


@router.put("/priority-drivers/{driver_id}")
async def set_priority_driver(driver_id: str, request: Request):
    """Toggle/set manual priority for a specific driver."""
    await require_role(request, ["admin"], permission="drivers.priority.toggle")
    body = await request.json()
    manual_priority = bool(body.get("manual_priority", False))
    note = body.get("note", "")
    result = await db.drivers.update_one(
        {"id": driver_id},
        {"$set": {
            "manual_priority": manual_priority,
            "manual_priority_note": note,
            "manual_priority_updated_at": datetime.now(timezone.utc).isoformat(),
        }},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Driver not found")
    return {"driver_id": driver_id, "manual_priority": manual_priority, "note": note}


@router.delete("/priority-drivers/{driver_id}")
async def remove_priority_driver(driver_id: str, request: Request):
    await require_role(request, ["admin"], permission="drivers.priority.toggle")
    result = await db.drivers.update_one(
        {"id": driver_id},
        {"$set": {"manual_priority": False, "manual_priority_note": ""}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Driver not found")
    return {"driver_id": driver_id, "manual_priority": False}



# ===== TOP CHAUFFEURS (public ranking + admin manual select) =====

@router.get("/top-drivers-config")
async def get_top_drivers_config(request: Request):
    await require_role(request, ["admin"], permission="drivers.rewards.config")
    doc = await db.service_configs.find_one({"service_key": "top_drivers"}, {"_id": 0})
    if not doc:
        return {"settings": {"mode": "composite", "max_shown": 10, "manual_driver_ids": []}}
    return doc


@router.put("/top-drivers-config")
async def save_top_drivers_config(request: Request):
    await require_role(request, ["admin"], permission="drivers.rewards.config")
    body = await request.json()
    settings = {
        "mode": body.get("mode", "composite"),  # composite | points | manual
        "max_shown": int(body.get("max_shown", 10)),
        "manual_driver_ids": body.get("manual_driver_ids", []),
    }
    await db.service_configs.update_one(
        {"service_key": "top_drivers"},
        {"$set": {"service_key": "top_drivers", "settings": settings,
                  "updated_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True,
    )
    return {"message": "Top drivers config saved", "settings": settings}


# ===== DB BACKUP (simple collection dump list) =====

@router.get("/db-backup")
async def db_backup_status(request: Request):
    await require_role(request, ["admin"], permission="server.settings.edit")
    names = await db.list_collection_names()
    stats = []
    for n in names:
        try:
            count = await db[n].count_documents({})
            stats.append({"collection": n, "count": count})
        except Exception:
            pass
    stats.sort(key=lambda x: -x["count"])
    return {"collections": stats, "total": len(stats), "checked_at": datetime.now(timezone.utc).isoformat()}



# ===== NEGOTIATION GAP REPORT =====

@router.get("/reports/negotiation-gap")
async def negotiation_gap_report(request: Request, days: int = 30):
    """Report on the gap between passenger proposed_fare and the final accepted fare,
    grouped by day and by pickup zone (vehicle_type as a proxy zone when address parsing fails)."""
    await require_role(request, ["admin"], permission="billing.view")
    from datetime import timedelta
    since = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()

    query = {
        "created_at": {"$gte": since},
        "proposed_fare": {"$ne": None, "$gt": 0},
        "status": {"$in": ["accepted", "arriving", "in_progress", "completed"]},
    }
    rides = await db.rides.find(query, {
        "_id": 0,
        "id": 1, "created_at": 1, "proposed_fare": 1, "estimated_fare": 1, "final_fare": 1,
        "vehicle_type": 1, "pickup_address": 1, "dropoff_address": 1, "distance_km": 1,
        "counter_offers": 1, "status": 1,
    }).to_list(5000)

    agg = _aggregate_negotiation_rides(rides)
    return {
        "period_days": days,
        **agg["totals"],
        "daily": _finalize_daily(agg["by_day"]),
        "zones": _finalize_zones(agg["by_zone"]),
        "vehicles": _finalize_vehicles(agg["by_vehicle"]),
        "samples": agg["samples"],
    }


_ZONE_TOKENS = [
    ("martinique", "Martinique"), ("fort-de-france", "Martinique"),
    ("guadeloupe", "Guadeloupe"), ("pointe-a-pitre", "Guadeloupe"),
    ("guyane", "Guyane"), ("reunion", "Reunion"),
    ("paris", "Paris"), ("lyon", "Lyon"), ("marseille", "Marseille"),
]


def _infer_zone(addr: str) -> str:
    if not addr:
        return "Inconnue"
    low = addr.lower()
    for token, label in _ZONE_TOKENS:
        if token in low:
            return label
    parts = [p.strip() for p in addr.split(",") if p.strip()]
    return parts[-1][:30] if parts else "Inconnue"


def _extract_ride_metrics(r: dict):
    """Return (proposed, accepted, gap_abs, gap_pct, was_negotiated) or None if invalid."""
    proposed = float(r.get("proposed_fare") or 0)
    accepted = float(r.get("final_fare") or r.get("estimated_fare") or 0)
    if proposed <= 0 or accepted <= 0:
        return None
    gap_abs = accepted - proposed
    gap_pct = (gap_abs / proposed) * 100 if proposed > 0 else 0
    was_negotiated = any((o or {}).get("status") == "accepted" for o in (r.get("counter_offers") or []))
    return proposed, accepted, gap_abs, gap_pct, was_negotiated


def _aggregate_negotiation_rides(rides):
    by_day, by_zone, by_vehicle = {}, {}, {}
    total_gap_abs = total_gap_pct = total_proposed = total_accepted = 0.0
    n = negotiated_count = accepted_at_offer_count = 0
    samples = []

    for r in rides:
        metrics = _extract_ride_metrics(r)
        if metrics is None:
            continue
        proposed, accepted, gap_abs, gap_pct, was_negotiated = metrics
        n += 1
        total_gap_abs += gap_abs
        total_gap_pct += gap_pct
        total_proposed += proposed
        total_accepted += accepted
        if was_negotiated:
            negotiated_count += 1
        else:
            accepted_at_offer_count += 1

        day = (r.get("created_at") or "")[:10]
        d = by_day.setdefault(day, {"day": day, "count": 0, "avg_gap": 0, "sum_gap": 0, "sum_proposed": 0, "sum_accepted": 0})
        d["count"] += 1
        d["sum_gap"] += gap_abs
        d["sum_proposed"] += proposed
        d["sum_accepted"] += accepted

        zone = _infer_zone(r.get("pickup_address") or "")
        z = by_zone.setdefault(zone, {"zone": zone, "count": 0, "sum_gap": 0, "sum_pct": 0, "sum_proposed": 0, "sum_accepted": 0})
        z["count"] += 1
        z["sum_gap"] += gap_abs
        z["sum_pct"] += gap_pct
        z["sum_proposed"] += proposed
        z["sum_accepted"] += accepted

        vt = r.get("vehicle_type") or "unknown"
        v = by_vehicle.setdefault(vt, {"vehicle": vt, "count": 0, "sum_gap": 0, "sum_pct": 0})
        v["count"] += 1
        v["sum_gap"] += gap_abs
        v["sum_pct"] += gap_pct

        if len(samples) < 20:
            samples.append({
                "ride_id": r["id"], "created_at": r.get("created_at"),
                "proposed": round(proposed, 2), "accepted": round(accepted, 2),
                "gap_abs": round(gap_abs, 2), "gap_pct": round(gap_pct, 1),
                "pickup": r.get("pickup_address"), "zone": zone,
                "vehicle_type": vt, "negotiated": was_negotiated,
            })

    totals = {
        "total_rides": n,
        "negotiated_count": negotiated_count,
        "accepted_at_offer_count": accepted_at_offer_count,
        "avg_gap_abs": round(total_gap_abs / n, 2) if n else 0,
        "avg_gap_pct": round(total_gap_pct / n, 1) if n else 0,
        "total_proposed": round(total_proposed, 2),
        "total_accepted": round(total_accepted, 2),
        "total_revenue_gap": round(total_accepted - total_proposed, 2),
    }
    return {"totals": totals, "by_day": by_day, "by_zone": by_zone, "by_vehicle": by_vehicle, "samples": samples}


def _finalize_daily(by_day):
    out = []
    for day in sorted(by_day.keys()):
        d = by_day[day]
        c = d["count"] or 1
        d["avg_gap"] = round(d["sum_gap"] / c, 2)
        d["avg_proposed"] = round(d["sum_proposed"] / c, 2)
        d["avg_accepted"] = round(d["sum_accepted"] / c, 2)
        out.append(d)
    return out


def _finalize_zones(by_zone):
    rows = []
    for z in by_zone.values():
        c = z["count"] or 1
        z["avg_gap"] = round(z["sum_gap"] / c, 2)
        z["avg_gap_pct"] = round(z["sum_pct"] / c, 1)
        z["avg_proposed"] = round(z["sum_proposed"] / c, 2)
        z["avg_accepted"] = round(z["sum_accepted"] / c, 2)
        rows.append(z)
    rows.sort(key=lambda x: -x["count"])
    return rows


def _finalize_vehicles(by_vehicle):
    rows = []
    for v in by_vehicle.values():
        c = v["count"] or 1
        v["avg_gap"] = round(v["sum_gap"] / c, 2)
        v["avg_gap_pct"] = round(v["sum_pct"] / c, 1)
        rows.append(v)
    rows.sort(key=lambda x: -x["count"])
    return rows



# ===== LIVE RIDES (Admin real-time monitoring) =====
@router.get("/live-rides")
async def admin_live_rides(request: Request):
    """Return all currently active rides (accepted/arriving/in_progress) with
    pickup/dropoff coords + live driver location from WebSocket manager."""
    await require_role(request, ["admin", "dispatcher"])
    from core.websocket import manager

    rides = await db.rides.find(
        {"status": {"$in": ["pending", "accepted", "arriving", "in_progress"]}},
        {"_id": 0},
    ).sort("created_at", -1).limit(100).to_list(100)

    # Attach live driver location + user contact
    for r in rides:
        if r.get("driver_id"):
            loc = manager.get_driver_location(r["driver_id"])
            if loc:
                r["driver_lat"] = loc.get("lat")
                r["driver_lng"] = loc.get("lng")
                r["driver_last_seen"] = loc.get("timestamp")
        # Attach passenger name/phone for display
        if r.get("user_id"):
            u = await db.users.find_one({"id": r["user_id"]}, {"_id": 0, "name": 1, "phone": 1, "email": 1})
            if u:
                r["passenger_name"] = u.get("name")
                r["passenger_phone"] = u.get("phone")
                r["passenger_email"] = u.get("email")

    # Aggregate counts per status
    counts = {"pending": 0, "accepted": 0, "arriving": 0, "in_progress": 0}
    for r in rides:
        s = r.get("status")
        if s in counts:
            counts[s] += 1

    return {"rides": rides, "counts": counts, "total": len(rides)}


# ============================================================
# Heatmap endpoints (Admin Heat View - Google Maps)
# ============================================================

@router.get("/heatmap/drivers")
async def heatmap_drivers(request: Request):
    """Return active driver positions as heatmap points (for density visualisation)."""
    await require_role(request, ["admin"], permission="dashboard.view")
    cursor = db.drivers.find(
        {
            "is_online": True,
            "current_lat": {"$exists": True, "$ne": None},
            "current_lng": {"$exists": True, "$ne": None},
        },
        {"_id": 0, "current_lat": 1, "current_lng": 1},
    )
    docs = await cursor.to_list(2000)
    items = [{"lat": d["current_lat"], "lng": d["current_lng"], "weight": 1} for d in docs]
    return {"items": items, "count": len(items)}


@router.get("/heatmap/rides")
async def heatmap_rides(request: Request):
    """Return recent ride pickup points as heatmap (last 24h)."""
    await require_role(request, ["admin"], permission="dashboard.view")
    since = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
    cursor = db.rides.find(
        {
            "created_at": {"$gte": since},
            "pickup_lat": {"$exists": True, "$ne": None},
            "pickup_lng": {"$exists": True, "$ne": None},
        },
        {"_id": 0, "pickup_lat": 1, "pickup_lng": 1},
    )
    docs = await cursor.to_list(5000)
    items = [{"lat": d["pickup_lat"], "lng": d["pickup_lng"], "weight": 1} for d in docs]
    return {"items": items, "count": len(items)}
