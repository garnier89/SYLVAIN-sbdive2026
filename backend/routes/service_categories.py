"""
Service Categories (V3Cube "Manage Service Category" — Taxi Service).
Admin can toggle each taxi booking mode Active/Inactive and edit its name/icon.
Disabling a category hides it from the client app's Taxi Hub (/taxi).
Keys are aligned with the frontend TaxiHubPage MODES ids.
"""
from fastapi import APIRouter, Request, HTTPException
import uuid
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from core.config import db
from core.deps import require_role, get_current_user

router = APIRouter(prefix="/service-categories", tags=["service-categories"])

DEFAULT_TZ = "Europe/Paris"


def is_category_available_now(cat: dict) -> bool:
    """A service is bookable when it is active AND (no schedule OR current time
    falls within one of its activation windows). Used by the client + create_ride."""
    if not cat:
        return True
    if cat.get("active") is False:
        return False
    if not cat.get("schedule_enabled"):
        return True
    windows = cat.get("schedule_windows") or []
    if not windows:
        return True  # schedule on but no window defined → treat as always-on
    tzname = cat.get("schedule_tz") or DEFAULT_TZ
    try:
        now = datetime.now(ZoneInfo(tzname))
    except Exception:
        now = datetime.now(ZoneInfo(DEFAULT_TZ))
    weekday = now.weekday()  # Mon=0 … Sun=6
    cur = now.strftime("%H:%M")
    for w in windows:
        days = w.get("days") or []
        if days and weekday not in days:
            continue
        start = w.get("start") or "00:00"
        end = w.get("end") or "23:59"
        if start <= end:
            if start <= cur <= end:
                return True
        else:  # overnight window crossing midnight (e.g. 22:00 → 02:00)
            if cur >= start or cur <= end:
                return True
    return False


async def category_available_now_by_key(key: str) -> bool:
    cat = await db.service_categories.find_one({"key": key}, {"_id": 0})
    return is_category_available_now(cat)


def _fmt_time(t: str) -> str:
    """'07:00' → '7h' ; '17:30' → '17h30'."""
    try:
        h, m = t.split(":")
        h = int(h)
        return f"{h}h" if m == "00" else f"{h}h{m}"
    except Exception:
        return t


def availability_hint(cat: dict) -> str:
    """Short FR label of opening windows for scheduled services (e.g. 'Dispo 7h-10h · 17h-20h')."""
    if not cat or not cat.get("schedule_enabled"):
        return ""
    windows = cat.get("schedule_windows") or []
    if not windows:
        return ""
    try:
        now = datetime.now(ZoneInfo(cat.get("schedule_tz") or DEFAULT_TZ))
    except Exception:
        now = datetime.now(ZoneInfo(DEFAULT_TZ))
    weekday = now.weekday()
    todays = [w for w in windows if not w.get("days") or weekday in w.get("days", [])]
    show = todays if todays else windows
    parts = [f"{_fmt_time(w.get('start', '00:00'))}-{_fmt_time(w.get('end', '23:59'))}" for w in show]
    return "Dispo " + " · ".join(parts[:3])


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
    """Public: keys + active flags + live availability so the client app can filter the Taxi Hub."""
    cats = await db.service_categories.find({}, {"_id": 0}).sort("display_order", 1).to_list(100)
    for c in cats:
        c["available_now"] = is_category_available_now(c)
        c["availability_hint"] = availability_hint(c)
    return cats


# ── "Me prévenir à l'ouverture" reminders (in-app, push-ready) ─────────────
@router.get("/reminders")
async def my_service_reminders(request: Request):
    """Returns the user's active reminders + any service that just reopened (delivered in-app as a toast)."""
    user = await get_current_user(request)
    pending = await db.service_reminders.find(
        {"user_id": user["id"], "notified": False}, {"_id": 0}
    ).to_list(100)
    subscribed, ready = [], []
    for rem in pending:
        cat = await db.service_categories.find_one({"key": rem["category_key"]}, {"_id": 0})
        if cat and is_category_available_now(cat):
            await db.service_reminders.update_one(
                {"id": rem["id"]},
                {"$set": {"notified": True, "notified_at": datetime.now(timezone.utc).isoformat()}},
            )
            ready.append({"key": rem["category_key"], "name": rem.get("category_name") or rem["category_key"]})
        else:
            subscribed.append(rem["category_key"])
    return {"subscribed": subscribed, "ready": ready}


@router.post("/{key}/remind")
async def subscribe_service_reminder(key: str, request: Request):
    user = await get_current_user(request)
    cat = await db.service_categories.find_one({"key": key}, {"_id": 0})
    if not cat:
        raise HTTPException(status_code=404, detail="Service category not found")
    existing = await db.service_reminders.find_one(
        {"user_id": user["id"], "category_key": key, "notified": False}
    )
    if not existing:
        await db.service_reminders.insert_one({
            "id": f"rem_{uuid.uuid4().hex[:10]}",
            "user_id": user["id"],
            "category_key": key,
            "category_name": cat.get("name", key),
            "notified": False,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    return {"key": key, "subscribed": True}


@router.delete("/{key}/remind")
async def unsubscribe_service_reminder(key: str, request: Request):
    user = await get_current_user(request)
    await db.service_reminders.delete_many(
        {"user_id": user["id"], "category_key": key, "notified": False}
    )
    return {"key": key, "subscribed": False}



# ── Admin management ──────────────────────────────────────────────────────
admin_router = APIRouter(prefix="/admin/service-categories", tags=["service-categories-admin"])


@admin_router.get("")
async def admin_list_service_categories(request: Request):
    await require_role(request, ["admin"], permission="server.settings.edit")
    cats = await db.service_categories.find({}, {"_id": 0}).sort("display_order", 1).to_list(100)
    return cats


@admin_router.post("/reorder")
async def admin_reorder_service_categories(request: Request):
    """Body: {ordered_keys: [...]} — sets display_order by index so admins can
    organise/feature taxi services in the order they want (reflected in /taxi)."""
    await require_role(request, ["admin"], permission="server.settings.edit")
    body = await request.json()
    keys = body.get("ordered_keys", [])
    for i, key in enumerate(keys):
        await db.service_categories.update_one(
            {"key": key},
            {"$set": {"display_order": i, "updated_at": datetime.now(timezone.utc).isoformat()}},
        )
    return {"message": "reordered", "count": len(keys)}


@admin_router.put("/{key}")
async def admin_update_service_category(key: str, request: Request):
    await require_role(request, ["admin"], permission="server.settings.edit")
    body = await request.json()
    allowed = {}
    for f in ("name", "name_en", "icon", "display_order", "active", "schedule_enabled", "schedule_windows", "schedule_tz"):
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

