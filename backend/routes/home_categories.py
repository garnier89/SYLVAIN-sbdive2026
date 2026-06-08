"""
Home Categories CMS (Iter 87).

Configurable, admin-managed home-screen categories for every section
(taxi, delivery, on-demand, beauty, pet, car-care, towing, nearby...).

Admin can: add/edit/delete categories, change icon (library name or uploaded
image data-URL), edit FR/EN labels & subtitles, reorder (display_order),
show/hide on home (visible_home), and set the target route.

Public endpoint serves the active config to the user home screen.

Collection: home_categories
"""
from fastapi import APIRouter, Request, HTTPException, Depends
from datetime import datetime, timezone
import uuid

from core.config import db
from core.permissions import require_permission

router = APIRouter(prefix="/home-categories", tags=["home-categories"])

# Curated Phosphor icon names exposed to the admin icon picker (must match
# frontend DynamicIcon map).
ICON_LIBRARY = [
    "Car", "Taxi", "CarSimple", "CarProfile", "Motorcycle", "Bicycle", "Van",
    "Truck", "UsersThree", "UsersFour", "User", "Gavel", "Calendar", "CalendarPlus",
    "Clock", "MapTrifold", "AirplaneTilt", "PawPrint", "Dog", "UserPlus", "HandHeart",
    "Briefcase", "Wheelchair", "Leaf", "Lightning", "Key", "Package", "ForkKnife",
    "Storefront", "ShoppingBag", "Bag", "Wrench", "Hammer", "PaintBrush", "Broom",
    "Heart", "Sparkle", "Scissors", "HairDryer", "MaskHappy", "HandSoap", "Drop",
    "GasPump", "BatteryFull", "Plug", "Coffee", "Wine", "Stethoscope", "FirstAid",
    "VideoCamera", "GridFour", "Wallet", "Buildings", "Star", "MapPin",
]

SECTIONS = [
    {"key": "taxi", "title_fr": "Services Taxi", "all_route": "/taxi"},
    {"key": "delivery", "title_fr": "Services de Livraison", "all_route": "/all-delivery"},
    {"key": "ondemand", "title_fr": "Services à la demande", "all_route": "/all-services"},
    {"key": "beauty", "title_fr": "Beauté & Bien-être", "all_route": "/beauty"},
    {"key": "pet", "title_fr": "Services Animaux", "all_route": "/pet-care"},
    {"key": "carcare", "title_fr": "Entretien Auto", "all_route": "/car-care"},
    {"key": "towing", "title_fr": "Remorquage", "all_route": "/towing"},
    {"key": "nearby", "title_fr": "À proximité", "all_route": "/nearby"},
]

# ── Home SECTION LAYOUT (order + show/hide of every block on the client Home) ──
# Master list of all home blocks in their default order (mirrors UserHome.SECTION_ORDER).
# Admin reorders / hides whole sections; the client renders blocks in this order.
HOME_BLOCKS = [
    {"key": "taxi", "title_fr": "Services Taxi"},
    {"key": "promo", "title_fr": "Bannières promo"},
    {"key": "delivery", "title_fr": "Services de Livraison"},
    {"key": "parcel", "title_fr": "Colis & Coursier"},
    {"key": "marketplace", "title_fr": "Marketplace"},
    {"key": "beauty", "title_fr": "Beauté & Bien-être"},
    {"key": "medical", "title_fr": "Santé & Médical"},
    {"key": "ondemand", "title_fr": "Services à la demande"},
    {"key": "bid", "title_fr": "Services aux enchères"},
    {"key": "carcare", "title_fr": "Entretien Auto"},
    {"key": "towing", "title_fr": "Remorquage"},
    {"key": "genie", "title_fr": "Genie (multi-services)"},
    {"key": "video", "title_fr": "Consultation vidéo"},
    {"key": "pet", "title_fr": "Services Animaux"},
    {"key": "parking", "title_fr": "Parking"},
    {"key": "giftcards", "title_fr": "Cartes cadeaux"},
    {"key": "carpool", "title_fr": "Covoiturage"},
    {"key": "tracking", "title_fr": "Suivi de colis"},
    {"key": "nearby", "title_fr": "À proximité"},
]


async def seed_home_sections():
    """Idempotent: insert any missing home-section layout entry (preserves admin order/visibility)."""
    for i, b in enumerate(HOME_BLOCKS):
        existing = await db.home_sections.find_one({"key": b["key"]})
        if not existing:
            await db.home_sections.insert_one({
                "key": b["key"],
                "title_fr": b["title_fr"],
                "display_order": i,
                "visible": True,
                "created_at": datetime.now(timezone.utc).isoformat(),
            })


async def _section_layout(visible_only: bool = True):
    """Returns home-section layout (admin order), backfilling titles for any new blocks."""
    rows = await db.home_sections.find({}, {"_id": 0}).sort("display_order", 1).to_list(100)
    known = {r["key"] for r in rows}
    # Backfill blocks added after the last seed so they still appear (at the end).
    extra = [{"key": b["key"], "title_fr": b["title_fr"], "display_order": 1000 + i, "visible": True}
             for i, b in enumerate(HOME_BLOCKS) if b["key"] not in known]
    rows = sorted(rows + extra, key=lambda r: r.get("display_order", 0))
    if visible_only:
        rows = [r for r in rows if r.get("visible", True)]
    return rows


# (section, key, label_fr, icon_name, bg_class, icon_color_class, target_route, visible_home)
_SEED = [
    # ---- Taxi (16 modes from the hub) ----
    ("taxi", "standard", "VTC\nRéservation", "Car", "bg-amber-50", "text-amber-500", "/taxi?mode=standard", True),
    ("taxi", "pool", "VTC\nPooling", "UsersThree", "bg-teal-50", "text-teal-500", "/taxi?mode=pool", True),
    ("taxi", "rental", "VTC\nLocation", "Taxi", "bg-blue-50", "text-blue-500", "/taxi?mode=rental", True),
    ("taxi", "personal-driver", "Chauffeur\nPrivé", "User", "bg-orange-50", "text-orange-700", "/taxi?mode=buddy_driver", True),
    ("taxi", "bidding", "Enchères\nVTC", "Gavel", "bg-pink-50", "text-pink-500", "/taxi?mode=bidding", True),
    ("taxi", "intercity", "VTC\nIntercity", "Truck", "bg-green-50", "text-green-600", "/taxi?mode=intercity", True),
    ("taxi", "book_later", "Programmer\nCourse", "Calendar", "bg-cyan-50", "text-cyan-600", "/taxi?mode=book_later", True),
    ("taxi", "electric", "VTC\nGreen", "Leaf", "bg-emerald-50", "text-emerald-600", "/taxi?mode=electric", False),
    ("taxi", "moto", "Moto\nTaxi", "Motorcycle", "bg-red-50", "text-red-500", "/taxi?mode=moto", False),
    ("taxi", "moto_rental", "Loc\nMoto", "Key", "bg-rose-50", "text-rose-500", "/taxi?mode=moto_rental", False),
    ("taxi", "airport", "Taxi\nAéroport", "AirplaneTilt", "bg-sky-50", "text-sky-500", "/taxi?mode=airport", False),
    ("taxi", "pets", "Taxi\nAnimaux", "PawPrint", "bg-orange-50", "text-orange-500", "/taxi?mode=pets", False),
    ("taxi", "book_for_someone", "Pour un\nproche", "UserPlus", "bg-teal-50", "text-teal-600", "/taxi?mode=book_for_someone", False),
    ("taxi", "tuktuk", "TukTuk", "Van", "bg-lime-50", "text-lime-600", "/taxi?mode=tuktuk", False),
    ("taxi", "assist", "Taxi\nAssistance", "HandHeart", "bg-rose-50", "text-rose-500", "/taxi?mode=assist", False),
    ("taxi", "corporate", "Taxi\nCorporate", "Briefcase", "bg-slate-50", "text-slate-600", "/taxi?mode=corporate", False),
    ("taxi", "access", "Taxi\nPMR", "Wheelchair", "bg-indigo-50", "text-indigo-600", "/taxi?mode=access", False),
    # ---- Delivery ----
    ("delivery", "food-delivery", "Livraison\nRepas", "ForkKnife", "bg-rose-50", "text-rose-500", "/food", True),
    ("delivery", "grocery-delivery", "Livraison\nCourses", "Storefront", "bg-emerald-50", "text-emerald-500", "/food?type=grocery", True),
    ("delivery", "runner-courier", "Coursier\nExpress", "Lightning", "bg-amber-50", "text-amber-500", "/runner", True),
    ("delivery", "parcel", "Livraison\nColis", "Package", "bg-purple-50", "text-purple-500", "/parcel", True),
    # ---- On-demand ----
    ("ondemand", "handyman", "Bricolage", "Wrench", "bg-fuchsia-50", "text-fuchsia-500", "/services", True),
    ("ondemand", "massage", "Massage", "Heart", "bg-sky-50", "text-sky-500", "/services", True),
    ("ondemand", "mechanic", "Mécanique", "GasPump", "bg-green-50", "text-green-500", "/services", True),
    # ---- Beauty ----
    ("beauty", "hair-care", "Soins\nCheveux", "HairDryer", "bg-amber-50", "text-amber-600", "/beauty", True),
    ("beauty", "skin-facial", "Skin\n& Facial", "MaskHappy", "bg-green-50", "text-green-600", "/beauty", True),
    ("beauty", "nail-polish", "Vernis\nOngles", "Sparkle", "bg-rose-50", "text-rose-500", "/beauty", True),
    ("beauty", "makeup", "Maquillage", "PaintBrush", "bg-purple-50", "text-purple-500", "/beauty", True),
    ("beauty", "mens-grooming", "Soins\nHommes", "Scissors", "bg-indigo-50", "text-indigo-600", "/beauty", False),
    # ---- Pet ----
    ("pet", "grooming", "Toilettage", "PawPrint", "bg-amber-50", "text-amber-600", "/pet-care", True),
    ("pet", "walking", "Promenade", "Dog", "bg-green-50", "text-green-600", "/pet-care", True),
    # ---- Car care ----
    ("carcare", "car-wash", "Lavage\nAuto", "CarSimple", "bg-blue-50", "text-blue-500", "/car-care", True),
    ("carcare", "battery", "Service\nBatterie", "BatteryFull", "bg-green-50", "text-green-600", "/car-care", True),
    ("carcare", "fuel", "Livraison\nCarburant", "GasPump", "bg-orange-50", "text-orange-500", "/car-care", True),
    ("carcare", "ev-charging", "Recharge\nEV", "Plug", "bg-emerald-50", "text-emerald-600", "/car-care", True),
    # ---- Towing ----
    ("towing", "emergency-towing", "Remorquage\nUrgence", "Truck", "bg-red-50", "text-red-600", "/towing", True),
    ("towing", "flat-tire", "Pneu\nCrevé", "CarSimple", "bg-amber-50", "text-amber-600", "/towing", True),
    ("towing", "lockout", "Serrure\nVoiture", "Key", "bg-purple-50", "text-purple-500", "/towing", True),
    # ---- Nearby ----
    ("nearby", "cafes", "Cafés", "Coffee", "bg-amber-50", "text-amber-600", "/nearby", True),
    ("nearby", "salons", "Salons", "Scissors", "bg-pink-50", "text-pink-500", "/nearby", True),
    ("nearby", "bars", "Bars", "Wine", "bg-purple-50", "text-purple-500", "/nearby", True),
]


async def seed_home_categories():
    """Seed default categories once (idempotent)."""
    if await db.home_categories.count_documents({}) > 0:
        return
    docs = []
    order_by_section = {}
    for section, key, label, icon, bg, color, route, visible in _SEED:
        order_by_section.setdefault(section, 0)
        docs.append({
            "id": f"hcat_{uuid.uuid4().hex[:10]}",
            "section": section,
            "key": key,
            "label_fr": label,
            "label_en": label,
            "subtitle_fr": "",
            "icon_name": icon,
            "image_url": None,
            "bg_class": bg,
            "icon_color_class": color,
            "target_route": route,
            "display_order": order_by_section[section],
            "visible_home": visible,
            "status": "active",
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        order_by_section[section] += 1
    if docs:
        await db.home_categories.insert_many(docs)


def _clean(doc):
    doc.pop("_id", None)
    return doc


# ============================================================
# Public
# ============================================================

@router.get("")
async def list_public(section: str = None):
    """Active categories grouped by section (for the user home)."""
    q = {"status": "active"}
    if section:
        q["section"] = section
    items = await db.home_categories.find(q, {"_id": 0}).sort("display_order", 1).to_list(1000)
    layout = await _section_layout(visible_only=True)
    return {"sections": SECTIONS, "items": items, "section_order": [r["key"] for r in layout]}


@router.get("/icons")
async def list_icons(current_user: dict = Depends(require_permission("content.manage"))):
    return {"icons": ICON_LIBRARY, "sections": SECTIONS}


# ============================================================
# Admin
# ============================================================

@router.get("/admin")
async def admin_list(current_user: dict = Depends(require_permission("content.manage"))):
    items = await db.home_categories.find({}, {"_id": 0}).sort([("section", 1), ("display_order", 1)]).to_list(2000)
    return {"items": items, "sections": SECTIONS, "icons": ICON_LIBRARY}


@router.post("/admin")
async def admin_create(request: Request, current_user: dict = Depends(require_permission("content.manage"))):
    body = await request.json()
    if not body.get("label_fr"):
        raise HTTPException(400, "Nom (FR) requis")
    if not body.get("section"):
        raise HTTPException(400, "Section requise")
    image_url = body.get("image_url")
    if isinstance(image_url, str) and len(image_url) > 11_000_000:
        raise HTTPException(413, "Image trop volumineuse (max 8 Mo)")
    count = await db.home_categories.count_documents({"section": body["section"]})
    doc = {
        "id": f"hcat_{uuid.uuid4().hex[:10]}",
        "section": body["section"],
        "key": body.get("key") or f"cat_{uuid.uuid4().hex[:6]}",
        "label_fr": body["label_fr"],
        "label_en": body.get("label_en") or body["label_fr"],
        "subtitle_fr": body.get("subtitle_fr", ""),
        "icon_name": body.get("icon_name") or "GridFour",
        "image_url": image_url or None,
        "bg_class": body.get("bg_class") or "bg-gray-50",
        "icon_color_class": body.get("icon_color_class") or "text-gray-600",
        "target_route": body.get("target_route") or "/",
        "display_order": body.get("display_order", count),
        "visible_home": bool(body.get("visible_home", True)),
        "badge": body.get("badge") or "",
        "status": body.get("status", "active"),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.home_categories.insert_one(doc)
    return _clean(doc)


@router.put("/admin/{cat_id}")
async def admin_update(cat_id: str, request: Request, current_user: dict = Depends(require_permission("content.manage"))):
    body = await request.json()
    allowed = {"section", "key", "label_fr", "label_en", "subtitle_fr", "icon_name",
               "image_url", "bg_class", "icon_color_class", "target_route", "status", "badge"}
    updates = {k: v for k, v in body.items() if k in allowed}
    if "visible_home" in body:
        updates["visible_home"] = bool(body["visible_home"])
    if "display_order" in body:
        updates["display_order"] = int(body["display_order"])
    if isinstance(updates.get("image_url"), str) and len(updates["image_url"]) > 11_000_000:
        raise HTTPException(413, "Image trop volumineuse (max 8 Mo)")
    res = await db.home_categories.update_one({"id": cat_id}, {"$set": updates})
    if res.matched_count == 0:
        raise HTTPException(404, "Catégorie introuvable")
    return {"message": "updated"}


@router.delete("/admin/{cat_id}")
async def admin_delete(cat_id: str, current_user: dict = Depends(require_permission("content.manage"))):
    res = await db.home_categories.delete_one({"id": cat_id})
    if res.deleted_count == 0:
        raise HTTPException(404, "Catégorie introuvable")
    return {"message": "deleted"}


@router.post("/admin/reorder")
async def admin_reorder(request: Request, current_user: dict = Depends(require_permission("content.manage"))):
    """Body: {ordered_ids: [id1, id2, ...]} — sets display_order by index."""
    body = await request.json()
    ids = body.get("ordered_ids", [])
    for i, cid in enumerate(ids):
        await db.home_categories.update_one({"id": cid}, {"$set": {"display_order": i}})
    return {"message": "reordered", "count": len(ids)}


# ============================================================
# Admin — Home SECTION layout (order + show/hide whole sections)
# ============================================================

@router.get("/admin/sections")
async def admin_list_sections(current_user: dict = Depends(require_permission("content.manage"))):
    """All home sections (visible + hidden) in their saved order, for the layout editor."""
    await seed_home_sections()
    rows = await _section_layout(visible_only=False)
    return {"sections": rows}


@router.post("/admin/sections/reorder")
async def admin_reorder_sections(request: Request, current_user: dict = Depends(require_permission("content.manage"))):
    """Body: {ordered_keys: [...]} — sets each home section's display_order by index."""
    body = await request.json()
    keys = body.get("ordered_keys", [])
    for i, key in enumerate(keys):
        await db.home_sections.update_one(
            {"key": key},
            {"$set": {"display_order": i, "updated_at": datetime.now(timezone.utc).isoformat()}},
            upsert=False,
        )
    return {"message": "reordered", "count": len(keys)}


@router.post("/admin/sections/{key}/toggle")
async def admin_toggle_section(key: str, current_user: dict = Depends(require_permission("content.manage"))):
    """Show/hide an entire home section on the client Home."""
    row = await db.home_sections.find_one({"key": key}, {"_id": 0})
    if not row:
        raise HTTPException(404, "Section introuvable")
    new_visible = not row.get("visible", True)
    await db.home_sections.update_one(
        {"key": key},
        {"$set": {"visible": new_visible, "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    return {"key": key, "visible": new_visible}
