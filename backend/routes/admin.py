from fastapi import APIRouter, Request, HTTPException
from datetime import datetime, timezone

from core.config import db
from core.deps import require_role

router = APIRouter(prefix="/admin", tags=["admin"])


@router.post("/vehicle-types")
async def create_vehicle_type(request: Request):
    await require_role(request, ["admin"])
    body = await request.json()
    slug = body.get("slug")
    if not slug:
        raise HTTPException(status_code=400, detail="slug is required")
    existing = await db.vehicle_types.find_one({"slug": slug})
    if existing:
        raise HTTPException(status_code=409, detail="Vehicle type already exists")
    doc = {
        "slug": slug,
        "name_fr": body.get("name_fr", slug),
        "person_capacity": body.get("person_capacity", 4),
        "min_fare": body.get("min_fare", 10),
        "base_fare": body.get("base_fare", 5),
        "price_per_km": body.get("price_per_km", 1.5),
        "price_per_min": body.get("price_per_min", 0.3),
        "commission_percent": body.get("commission_percent", 15),
        "cancellation_fare": body.get("cancellation_fare", 5),
        "icon_type": body.get("icon_type", "Car"),
        "status": "active",
        "display_order": body.get("display_order", 99),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.vehicle_types.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.put("/vehicle-types/{slug}")
async def update_vehicle_type(slug: str, request: Request):
    await require_role(request, ["admin"])
    body = await request.json()
    update = {}
    for field in ["name_fr", "person_capacity", "min_fare", "base_fare", "price_per_km", "price_per_min", "commission_percent", "cancellation_fare", "icon_type", "status", "display_order"]:
        if field in body:
            update[field] = body[field]
    if not update:
        raise HTTPException(status_code=400, detail="No fields to update")
    result = await db.vehicle_types.update_one({"slug": slug}, {"$set": update})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Vehicle type not found")
    return {"message": f"Vehicle type '{slug}' updated"}


@router.delete("/vehicle-types/{slug}")
async def delete_vehicle_type(slug: str, request: Request):
    await require_role(request, ["admin"])
    result = await db.vehicle_types.delete_one({"slug": slug})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Vehicle type not found")
    return {"message": f"Vehicle type '{slug}' deleted"}


@router.post("/merchants/{merchant_id}/status")
async def update_merchant_status(merchant_id: str, request: Request):
    await require_role(request, ["admin"])
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


# ===== SERVICE CONFIGS =====

@router.get("/service-config/{service_key}")
async def get_service_config(service_key: str, request: Request):
    await require_role(request, ["admin"])
    config = await db.service_configs.find_one({"service_key": service_key}, {"_id": 0})
    if not config:
        return {"service_key": service_key, "settings": {}}
    return config


@router.put("/service-config/{service_key}")
async def save_service_config(service_key: str, request: Request):
    await require_role(request, ["admin"])
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

@router.get("/crud/{collection}")
async def list_crud_items(collection: str, request: Request):
    await require_role(request, ["admin"])
    allowed = ["groups", "vehicles", "companies", "hotels", "organizations", "pending_requests"]
    col_name = f"admin_{collection}" if collection in allowed else None
    if not col_name:
        raise HTTPException(status_code=400, detail="Invalid collection")
    items = await db[col_name].find({}, {"_id": 0}).to_list(100)
    return items


@router.post("/crud/{collection}")
async def create_crud_item(collection: str, request: Request):
    await require_role(request, ["admin"])
    allowed = ["groups", "vehicles", "companies", "hotels", "organizations", "pending_requests"]
    col_name = f"admin_{collection}" if collection in allowed else None
    if not col_name:
        raise HTTPException(status_code=400, detail="Invalid collection")
    body = await request.json()
    import uuid
    body["id"] = f"{collection[:3]}_{uuid.uuid4().hex[:8]}"
    body["created_at"] = datetime.now(timezone.utc).isoformat()
    await db[col_name].insert_one(body)
    body.pop("_id", None)
    return body


@router.put("/crud/{collection}/{item_id}")
async def update_crud_item(collection: str, item_id: str, request: Request):
    await require_role(request, ["admin"])
    allowed = ["groups", "vehicles", "companies", "hotels", "organizations", "pending_requests"]
    col_name = f"admin_{collection}" if collection in allowed else None
    if not col_name:
        raise HTTPException(status_code=400, detail="Invalid collection")
    body = await request.json()
    body.pop("id", None)
    body.pop("_id", None)
    result = await db[col_name].update_one({"id": item_id}, {"$set": body})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Item not found")
    return {"message": "Updated"}


@router.delete("/crud/{collection}/{item_id}")
async def delete_crud_item(collection: str, item_id: str, request: Request):
    await require_role(request, ["admin"])
    allowed = ["groups", "vehicles", "companies", "hotels", "organizations", "pending_requests"]
    col_name = f"admin_{collection}" if collection in allowed else None
    if not col_name:
        raise HTTPException(status_code=400, detail="Invalid collection")
    result = await db[col_name].delete_one({"id": item_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Item not found")
    return {"message": "Deleted"}
