"""
Store Delivery Categories (V3Cube "Services" — Store Delivery).
Admin can toggle each delivery vertical Active/Inactive, edit its name/icon,
set an age restriction (18+/21+), choose the delivery vehicle, and reorder.
Disabling a category hides it from the client app's delivery hub (/all-delivery, /food).
Keys are aligned with the frontend AllDeliveryPage category ids.
"""
from fastapi import APIRouter, Request, HTTPException
import uuid
from datetime import datetime, timezone

from core.config import db
from core.deps import require_role
from core.geo_scope import clean_scope, scope_matches, resolve_zone_from_text

router = APIRouter(prefix="/store-categories", tags=["store-categories"])

# Seed list aligned with AllDeliveryPage categories (key == category id).
# `path` is the client route, `store_type` filters merchants on the delivery page.
DEFAULT_STORE_CATEGORIES = [
    {"key": "food", "name": "Livraison Repas", "name_en": "Food Delivery", "icon": "🍴", "store_type": "restaurant", "path": "/food", "group": "food", "age_restriction": 0, "delivery_vehicle": "any", "display_order": 1},
    {"key": "grocery", "name": "Livraison Courses", "name_en": "Grocery", "icon": "🛒", "store_type": "grocery", "path": "/food?type=grocery", "group": "essentials", "age_restriction": 0, "delivery_vehicle": "any", "display_order": 2},
    {"key": "medicine", "name": "Livraison Médicaments", "name_en": "Pharmacy", "icon": "💊", "store_type": "pharmacy", "path": "/pharmacy", "group": "essentials", "age_restriction": 18, "delivery_vehicle": "any", "display_order": 3},
    {"key": "flowers", "name": "Livraison Fleurs", "name_en": "Flowers", "icon": "💐", "store_type": "florist", "path": "/food?type=florist", "group": "specialty", "age_restriction": 0, "delivery_vehicle": "any", "display_order": 4},
    {"key": "stationery", "name": "Livraison Papeterie", "name_en": "Stationery", "icon": "✏️", "store_type": "stationery", "path": "/food?type=stationery", "group": "specialty", "age_restriction": 0, "delivery_vehicle": "any", "display_order": 5},
    {"key": "wine", "name": "Livraison Vin", "name_en": "Wine & Spirits", "icon": "🍷", "store_type": "wine", "path": "/food?type=wine", "group": "specialty", "age_restriction": 18, "delivery_vehicle": "any", "display_order": 6},
    {"key": "water", "name": "Eau en bouteille", "name_en": "Bottled Water", "icon": "💧", "store_type": "grocery", "path": "/food?type=grocery", "group": "essentials", "age_restriction": 0, "delivery_vehicle": "any", "display_order": 7},
    {"key": "supermarket", "name": "Supermarché", "name_en": "Supermarket", "icon": "🏬", "store_type": "grocery", "path": "/food?type=grocery", "group": "essentials", "age_restriction": 0, "delivery_vehicle": "any", "display_order": 8},
    {"key": "construction", "name": "Matériaux Construction", "name_en": "Construction", "icon": "🦺", "store_type": "construction", "path": "/food?type=construction", "group": "specialty", "age_restriction": 0, "delivery_vehicle": "car", "display_order": 9},
    {"key": "parcel", "name": "Livraison Colis", "name_en": "Parcel", "icon": "📦", "store_type": "parcel", "path": "/parcel", "group": "logistics", "age_restriction": 0, "delivery_vehicle": "any", "display_order": 10},
    {"key": "genie", "name": "Delivery Genie", "name_en": "Concierge", "icon": "🛍️", "store_type": "genie", "path": "/runner?mode=genie", "group": "on_demand", "age_restriction": 0, "delivery_vehicle": "any", "display_order": 11},
    {"key": "runner", "name": "Delivery Runner", "name_en": "Express Runner", "icon": "⚡", "store_type": "runner", "path": "/runner", "group": "on_demand", "age_restriction": 0, "delivery_vehicle": "moto", "display_order": 12},
]


async def seed_store_categories():
    """Idempotent: insert any missing category (preserves admin edits/toggles)."""
    for c in DEFAULT_STORE_CATEGORIES:
        existing = await db.store_categories.find_one({"key": c["key"]})
        if not existing:
            await db.store_categories.insert_one({
                "id": f"storecat_{uuid.uuid4().hex[:10]}",
                "key": c["key"],
                "name": c["name"],
                "name_en": c["name_en"],
                "icon": c["icon"],
                "store_type": c["store_type"],
                "path": c["path"],
                "group": c["group"],
                "age_restriction": c["age_restriction"],
                "delivery_vehicle": c["delivery_vehicle"],
                "display_order": c["display_order"],
                "active": True,
                "created_at": datetime.now(timezone.utc).isoformat(),
            })


@router.get("")
async def list_active_store_categories(location: str = ""):
    """Public: delivery verticals + active flags so the client app can filter the
    delivery hub. When `location` (browser-resolved) is supplied, categories whose
    geographic `scope` doesn't match the zone are dropped (global scope = always).
    No location → all categories (the client filters `active` itself)."""
    cats = await db.store_categories.find({}, {"_id": 0}).sort("display_order", 1).to_list(100)
    if location:
        zone = resolve_zone_from_text(location)
        cats = [c for c in cats if scope_matches(c.get("scope"), zone)]
    return cats


async def store_type_enabled(store_type: str) -> bool:
    """True if at least one ACTIVE category maps to this store_type (used to gate /food)."""
    cat = await db.store_categories.find_one({"store_type": store_type, "active": True})
    return cat is not None


# ── Admin management ──────────────────────────────────────────────────────
admin_router = APIRouter(prefix="/admin/store-categories", tags=["store-categories-admin"])

_EDITABLE = ("name", "name_en", "icon", "store_type", "path", "group",
             "age_restriction", "delivery_vehicle", "display_order", "active")


@admin_router.get("")
async def admin_list_store_categories(request: Request):
    await require_role(request, ["admin"], permission="server.settings.edit")
    cats = await db.store_categories.find({}, {"_id": 0}).sort("display_order", 1).to_list(100)
    return cats


@admin_router.post("/reorder")
async def admin_reorder_store_categories(request: Request):
    """Body: {ordered_keys: [...]} — sets display_order by index."""
    await require_role(request, ["admin"], permission="server.settings.edit")
    body = await request.json()
    keys = body.get("ordered_keys", [])
    for i, key in enumerate(keys):
        await db.store_categories.update_one(
            {"key": key},
            {"$set": {"display_order": i, "updated_at": datetime.now(timezone.utc).isoformat()}},
        )
    return {"message": "reordered", "count": len(keys)}


@admin_router.put("/{key}")
async def admin_update_store_category(key: str, request: Request):
    await require_role(request, ["admin"], permission="server.settings.edit")
    body = await request.json()
    allowed = {}
    for f in _EDITABLE:
        if f in body:
            allowed[f] = body[f]
    if "scope" in body:
        allowed["scope"] = clean_scope(body["scope"])
    if "age_restriction" in allowed:
        try:
            allowed["age_restriction"] = int(allowed["age_restriction"])
        except (TypeError, ValueError):
            allowed["age_restriction"] = 0
    if not allowed:
        raise HTTPException(status_code=400, detail="No fields to update")
    allowed["updated_at"] = datetime.now(timezone.utc).isoformat()
    result = await db.store_categories.update_one({"key": key}, {"$set": allowed})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Store category not found")
    updated = await db.store_categories.find_one({"key": key}, {"_id": 0})
    return updated


@admin_router.post("/{key}/toggle")
async def admin_toggle_store_category(key: str, request: Request):
    await require_role(request, ["admin"], permission="server.settings.edit")
    cat = await db.store_categories.find_one({"key": key}, {"_id": 0})
    if not cat:
        raise HTTPException(status_code=404, detail="Store category not found")
    new_active = not cat.get("active", True)
    await db.store_categories.update_one(
        {"key": key},
        {"$set": {"active": new_active, "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    return {"key": key, "active": new_active}
