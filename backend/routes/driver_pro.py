"""
Driver Pro features (V3Cube Pack B):
- Manage Vehicles (multi-vehicle per driver)
- Bank Details management
- Cancellation Reasons (admin CRUD + driver list)
- Earning Statistics (period filter)
"""
from fastapi import APIRouter, Request, HTTPException
from datetime import datetime, timezone, timedelta
from core.config import db
from core.deps import get_current_user, require_role
import uuid

router = APIRouter(prefix="/driver-pro", tags=["driver-pro"])


# ============================================================
# Manage Vehicles
# ============================================================

@router.get("/vehicles")
async def list_my_vehicles(request: Request):
    user = await get_current_user(request)
    cursor = db.driver_vehicles.find({"driver_id": user["id"]}, {"_id": 0})
    items = await cursor.to_list(50)
    return {"items": items, "count": len(items)}


@router.post("/vehicles")
async def add_vehicle(request: Request):
    user = await get_current_user(request)
    body = await request.json()
    required = ("brand", "model", "plate", "year", "color", "vehicle_type")
    for k in required:
        if not body.get(k):
            raise HTTPException(status_code=400, detail=f"{k} required")
    # ensure plate uniqueness for this driver
    exists = await db.driver_vehicles.find_one(
        {"driver_id": user["id"], "plate": body["plate"]}, {"_id": 0, "id": 1}
    )
    if exists:
        raise HTTPException(status_code=400, detail="Plate already registered")
    is_first = await db.driver_vehicles.count_documents({"driver_id": user["id"]}) == 0
    doc = {
        "id": str(uuid.uuid4()),
        "driver_id": user["id"],
        "brand": body["brand"],
        "model": body["model"],
        "plate": body["plate"].upper(),
        "year": int(body["year"]),
        "color": body["color"],
        "vehicle_type": body["vehicle_type"],
        "is_active": bool(body.get("is_active", is_first)),
        "is_primary": bool(body.get("is_primary", is_first)),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.driver_vehicles.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.put("/vehicles/{vid}")
async def update_vehicle(vid: str, request: Request):
    user = await get_current_user(request)
    body = await request.json()
    updates = {k: body[k] for k in ("brand", "model", "color", "vehicle_type", "is_active") if k in body}
    if "year" in body:
        updates["year"] = int(body["year"])
    res = await db.driver_vehicles.update_one(
        {"id": vid, "driver_id": user["id"]}, {"$set": updates}
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    return {"message": "updated", "id": vid}


@router.delete("/vehicles/{vid}")
async def delete_vehicle(vid: str, request: Request):
    user = await get_current_user(request)
    res = await db.driver_vehicles.delete_one({"id": vid, "driver_id": user["id"]})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    return {"message": "deleted"}


@router.post("/vehicles/{vid}/set-primary")
async def set_primary_vehicle(vid: str, request: Request):
    user = await get_current_user(request)
    target = await db.driver_vehicles.find_one(
        {"id": vid, "driver_id": user["id"]}, {"_id": 0}
    )
    if not target:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    await db.driver_vehicles.update_many(
        {"driver_id": user["id"]}, {"$set": {"is_primary": False}}
    )
    await db.driver_vehicles.update_one(
        {"id": vid}, {"$set": {"is_primary": True, "is_active": True}}
    )
    # sync driver record for backwards compat
    await db.drivers.update_one(
        {"user_id": user["id"]},
        {"$set": {"vehicle_brand": target["brand"], "vehicle_model": target["model"],
                  "vehicle_plate": target["plate"], "vehicle_type": target["vehicle_type"]}}
    )
    return {"message": "primary updated", "id": vid}


# ============================================================
# Bank Details
# ============================================================

@router.get("/bank")
async def get_bank_details(request: Request):
    user = await get_current_user(request)
    doc = await db.driver_bank_details.find_one({"driver_id": user["id"]}, {"_id": 0})
    if doc:
        # mask IBAN (keep first 4 + last 4)
        iban = doc.get("iban", "")
        if len(iban) > 8:
            doc["iban_masked"] = iban[:4] + " **** **** **** " + iban[-4:]
        else:
            doc["iban_masked"] = iban
        doc.pop("iban", None)  # never return raw IBAN
    return doc or {}


@router.put("/bank")
async def update_bank_details(request: Request):
    user = await get_current_user(request)
    body = await request.json()
    required = ("account_holder", "iban", "bic")
    for k in required:
        if not body.get(k):
            raise HTTPException(status_code=400, detail=f"{k} required")
    iban_clean = body["iban"].replace(" ", "").upper()
    if len(iban_clean) < 14 or len(iban_clean) > 34:
        raise HTTPException(status_code=400, detail="Invalid IBAN length")
    doc = {
        "driver_id": user["id"],
        "account_holder": body["account_holder"],
        "iban": iban_clean,
        "bic": body["bic"].upper(),
        "bank_name": body.get("bank_name", ""),
        "verified": False,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.driver_bank_details.update_one(
        {"driver_id": user["id"]}, {"$set": doc}, upsert=True
    )
    return {"message": "saved", "iban_last4": iban_clean[-4:]}


# ============================================================
# Cancellation Reasons - Admin CRUD + Driver list
# ============================================================

@router.get("/cancellation-reasons")
async def list_cancellation_reasons(request: Request, user_type: str = "Driver"):
    cursor = db.cancellation_reasons_v2.find(
        {"user_type": user_type, "active": {"$ne": False}}, {"_id": 0}
    ).sort("display_order", 1)
    items = await cursor.to_list(100)
    return items


@router.get("/admin/cancellation-reasons")
async def admin_list_cancellation_reasons(request: Request):
    await require_role(request, ["admin"], permission="server.settings.edit")
    cursor = db.cancellation_reasons_v2.find({}, {"_id": 0}).sort("display_order", 1)
    items = await cursor.to_list(200)
    return items


@router.post("/admin/cancellation-reasons")
async def admin_create_cancellation_reason(request: Request):
    await require_role(request, ["admin"], permission="server.settings.edit")
    body = await request.json()
    if not body.get("reason_fr") or not body.get("user_type"):
        raise HTTPException(status_code=400, detail="reason_fr and user_type required")
    doc = {
        "id": str(uuid.uuid4()),
        "slug": body.get("slug") or body["reason_fr"].lower().replace(" ", "_")[:40],
        "reason_fr": body["reason_fr"],
        "reason_en": body.get("reason_en", body["reason_fr"]),
        "user_type": body["user_type"],  # "User" | "Driver"
        "active": bool(body.get("active", True)),
        "display_order": int(body.get("display_order", 0)),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.cancellation_reasons_v2.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.put("/admin/cancellation-reasons/{rid}")
async def admin_update_cancellation_reason(rid: str, request: Request):
    await require_role(request, ["admin"], permission="server.settings.edit")
    body = await request.json()
    updates = {k: body[k] for k in ("reason_fr", "reason_en", "user_type", "active", "display_order") if k in body}
    res = await db.cancellation_reasons_v2.update_one({"id": rid}, {"$set": updates})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    return {"message": "updated"}


@router.delete("/admin/cancellation-reasons/{rid}")
async def admin_delete_cancellation_reason(rid: str, request: Request):
    await require_role(request, ["admin"], permission="server.settings.edit")
    await db.cancellation_reasons_v2.delete_one({"id": rid})
    return {"message": "deleted"}


# ============================================================
# Earnings statistics with period filter
# ============================================================

@router.get("/earnings/stats")
async def earnings_stats(request: Request, period: str = "week"):
    """Period: day | week | month."""
    user = await get_current_user(request)
    now = datetime.now(timezone.utc)
    if period == "day":
        start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        bucket = "hour"
    elif period == "month":
        start = now - timedelta(days=30)
        bucket = "day"
    else:
        start = now - timedelta(days=7)
        bucket = "day"
    start_iso = start.isoformat()
    cursor = db.rides.find(
        {"driver_id": user["id"], "status": "completed", "completed_at": {"$gte": start_iso}},
        {"_id": 0, "fare": 1, "final_fare": 1, "estimated_fare": 1, "completed_at": 1},
    ).sort("completed_at", 1)
    rides = await cursor.to_list(2000)
    series = {}
    total = 0.0
    for r in rides:
        ts = r.get("completed_at") or ""
        if bucket == "hour":
            key = ts[:13]  # YYYY-MM-DDTHH
        else:
            key = ts[:10]  # YYYY-MM-DD
        fare = float(r.get("final_fare") or r.get("fare") or r.get("estimated_fare") or 0)
        series[key] = series.get(key, 0) + fare
        total += fare
    points = [{"label": k, "value": round(v, 2)} for k, v in sorted(series.items())]
    return {
        "period": period,
        "bucket": bucket,
        "total": round(total, 2),
        "count": len(rides),
        "points": points,
    }
