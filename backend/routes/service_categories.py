"""
Service Categories (V3Cube "Manage Service Category" — Taxi Service).
Admin can toggle each taxi booking mode Active/Inactive and edit its name/icon.
Disabling a category hides it from the client app's Taxi Hub (/taxi).
Keys are aligned with the frontend TaxiHubPage MODES ids.
"""
from fastapi import APIRouter, Request, HTTPException
import uuid
from datetime import datetime, timezone

from core.config import db
from core.deps import require_role

router = APIRouter(prefix="/service-categories", tags=["service-categories"])

# Seed list aligned with TaxiHubPage MODES (key == mode id)
DEFAULT_CATEGORIES = [
    {"key": "standard", "name": "Taxi VTC", "name_en": "Taxi Booking", "icon": "🚕", "group": "everyday", "display_order": 1},
    {"key": "pool", "name": "Pool", "name_en": "Taxi Pool", "icon": "🚐", "group": "everyday", "display_order": 2},
    {"key": "electric", "name": "Green", "name_en": "Taxi Green", "icon": "🌿", "group": "everyday", "display_order": 3},
    {"key": "moto", "name": "Moto", "name_en": "Moto Taxi", "icon": "🏍️", "group": "everyday", "display_order": 4},
    {"key": "rental", "name": "Mise à Dispo", "name_en": "Taxi Rental", "icon": "⏱️", "group": "time", "display_order": 5},
    {"key": "intercity", "name": "Intercité", "name_en": "Taxi Intercity", "icon": "🛣️", "group": "time", "display_order": 6},
    {"key": "book_later", "name": "Plus Tard", "name_en": "Schedule A Ride", "icon": "📅", "group": "time", "display_order": 7},
    {"key": "moto_rental", "name": "Loc Moto", "name_en": "Moto Rental", "icon": "🔑", "group": "time", "display_order": 8},
    {"key": "buddy_driver", "name": "Chauffeur Privé", "name_en": "Personal Driver", "icon": "🧑\u200d✈️", "group": "time", "display_order": 9},
    {"key": "bidding", "name": "Enchères", "name_en": "Taxi Bidding", "icon": "💸", "group": "special", "display_order": 10},
    {"key": "airport", "name": "Aéroport", "name_en": "Airport", "icon": "✈️", "group": "special", "display_order": 11},
    {"key": "pets", "name": "Animaux", "name_en": "Pet Friendly", "icon": "🐾", "group": "special", "display_order": 12},
    {"key": "book_for_someone", "name": "Pour un proche", "name_en": "Book For Other", "icon": "👥", "group": "special", "display_order": 13},
    {"key": "tuktuk", "name": "TukTuk", "name_en": "TukTuk", "icon": "🛺", "group": "special", "display_order": 14},
    {"key": "assist", "name": "Assistance", "name_en": "Assistance", "icon": "🤝", "group": "special", "display_order": 15},
    {"key": "corporate", "name": "Corporate", "name_en": "Corporate", "icon": "💼", "group": "special", "display_order": 16},
    {"key": "access", "name": "PMR", "name_en": "Access", "icon": "♿", "group": "special", "display_order": 17},
]


async def seed_service_categories():
    """Idempotent: insert any missing category (preserves admin edits/toggles)."""
    for c in DEFAULT_CATEGORIES:
        existing = await db.service_categories.find_one({"key": c["key"]})
        if not existing:
            await db.service_categories.insert_one({
                "id": f"svccat_{uuid.uuid4().hex[:10]}",
                "key": c["key"],
                "name": c["name"],
                "name_en": c["name_en"],
                "icon": c["icon"],
                "group": c["group"],
                "display_order": c["display_order"],
                "active": True,
                "created_at": datetime.now(timezone.utc).isoformat(),
            })


@router.get("")
async def list_active_service_categories():
    """Public: keys + active flags so the client app can filter the Taxi Hub."""
    cats = await db.service_categories.find({}, {"_id": 0}).sort("display_order", 1).to_list(100)
    return cats


# ── Admin management ──────────────────────────────────────────────────────
admin_router = APIRouter(prefix="/admin/service-categories", tags=["service-categories-admin"])


@admin_router.get("")
async def admin_list_service_categories(request: Request):
    await require_role(request, ["admin"], permission="server.settings.edit")
    cats = await db.service_categories.find({}, {"_id": 0}).sort("display_order", 1).to_list(100)
    return cats


@admin_router.put("/{key}")
async def admin_update_service_category(key: str, request: Request):
    await require_role(request, ["admin"], permission="server.settings.edit")
    body = await request.json()
    allowed = {}
    for f in ("name", "name_en", "icon", "display_order", "active"):
        if f in body:
            allowed[f] = body[f]
    if not allowed:
        raise HTTPException(status_code=400, detail="No fields to update")
    allowed["updated_at"] = datetime.now(timezone.utc).isoformat()
    result = await db.service_categories.update_one({"key": key}, {"$set": allowed})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Service category not found")
    updated = await db.service_categories.find_one({"key": key}, {"_id": 0})
    return updated


@admin_router.post("/{key}/toggle")
async def admin_toggle_service_category(key: str, request: Request):
    await require_role(request, ["admin"], permission="server.settings.edit")
    cat = await db.service_categories.find_one({"key": key}, {"_id": 0})
    if not cat:
        raise HTTPException(status_code=404, detail="Service category not found")
    new_active = not cat.get("active", True)
    await db.service_categories.update_one(
        {"key": key},
        {"$set": {"active": new_active, "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    return {"key": key, "active": new_active}

