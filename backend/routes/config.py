from fastapi import APIRouter, Request, HTTPException
from typing import Optional

from core.config import db
from core.deps import get_current_user, require_role

router = APIRouter(prefix="/config", tags=["configuration"])


@router.get("/app")
async def get_app_config():
    """Public app configuration (currency, company info, feature flags)."""
    configs = await db.app_configurations.find({}, {"_id": 0}).to_list(200)
    result = {}
    for c in configs:
        result[c["key"]] = c["value"]
    return result


@router.get("/vehicle-categories")
async def get_vehicle_categories():
    """Get all active vehicle categories (Ride types)."""
    categories = await db.vehicle_categories.find(
        {"status": "active"}, {"_id": 0}
    ).sort("display_order", 1).to_list(50)
    return categories


@router.get("/vehicle-types")
async def get_vehicle_types(category_slug: Optional[str] = None):
    """Get vehicle types with pricing. Optionally filter by category."""
    query = {"status": "active"}
    if category_slug:
        query["category_slug"] = category_slug
    types = await db.vehicle_types.find(query, {"_id": 0}).sort("display_order", 1).to_list(50)
    return types


@router.get("/vehicle-types/{slug}")
async def get_vehicle_type_detail(slug: str):
    """Get a specific vehicle type by slug."""
    vtype = await db.vehicle_types.find_one({"slug": slug, "status": "active"}, {"_id": 0})
    if not vtype:
        raise HTTPException(status_code=404, detail="Vehicle type not found")
    return vtype


@router.get("/nearby-categories")
async def get_nearby_categories():
    """Get nearby business categories."""
    categories = await db.nearby_categories.find({}, {"_id": 0}).sort("display_order", 1).to_list(50)
    return categories


@router.get("/parcel-types")
async def get_parcel_types():
    """Get parcel/delivery package types."""
    types = await db.parcel_package_types.find({}, {"_id": 0}).sort("display_order", 1).to_list(20)
    return types


@router.get("/cancel-reasons")
async def get_cancel_reasons(user_type: Optional[str] = None):
    """Get ride/order cancel reasons. Filter by user_type (User/Driver/Both)."""
    query = {}
    if user_type:
        query["for"] = {"$in": [user_type, "Both"]}
    reasons = await db.cancel_reasons.find(query, {"_id": 0}).sort("display_order", 1).to_list(20)
    return reasons


@router.get("/master-categories")
async def get_master_service_categories():
    """Get master service categories (Taxi, Delivery, UberX, etc.)."""
    categories = await db.master_service_categories.find(
        {"status": "active"}, {"_id": 0}
    ).sort("display_order", 1).to_list(20)
    return categories


@router.get("/track-categories")
async def get_track_categories():
    """Get family/employee tracking categories."""
    categories = await db.track_categories.find({}, {"_id": 0}).to_list(10)
    return categories


# Admin-only config management
@router.get("/admin/all")
async def admin_get_all_configs(request: Request):
    """Get all configurations (admin only)."""
    await require_role(request, ["admin"])
    configs = await db.app_configurations.find({}, {"_id": 0}).to_list(500)
    return configs


@router.put("/admin/{key}")
async def admin_update_config(key: str, request: Request):
    """Update a configuration value (admin only)."""
    await require_role(request, ["admin"])
    body = await request.json()
    new_value = body.get("value")
    if new_value is None:
        raise HTTPException(status_code=400, detail="Missing 'value' field")
    result = await db.app_configurations.update_one(
        {"key": key}, {"$set": {"value": str(new_value)}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Configuration key not found")
    return {"message": f"Configuration '{key}' updated"}
