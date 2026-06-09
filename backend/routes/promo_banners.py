"""
Promo Banners CMS.

Admin-managed promotional banners shown in the home-screen carousel.
Lets the team launch seasonal campaigns and promo codes from the admin
panel — no redeployment required.

Admin can: add/edit/delete banners, set FR title/subtitle, an optional
highlight (e.g. "-50%"), a promo code, a CTA label + target route, a left
image (URL or uploaded data-URL), theme (light/dark) and background color,
toggle active, and reorder (display_order).

Public endpoint serves the active banners to the user home carousel.

Collection: promo_banners
"""
from fastapi import APIRouter, Request, HTTPException, Depends
from datetime import datetime, timezone
import uuid

from core.config import db
from core.permissions import require_permission
from core.geo_scope import clean_scope, scope_matches, resolve_zone_from_text

router = APIRouter(prefix="/promo-banners", tags=["promo-banners"])

# (title, subtitle, highlight, promo_code, cta_label, target_route, image_url, theme, bg_color)
_SEED = [
    (
        "Courses fraîches livrées vite.", "Commandez maintenant !", "", "",
        "Commander", "/food?type=grocery",
        "https://images.unsplash.com/photo-1542838132-92c53300491e?w=300&h=200&fit=crop",
        "light", "#FFFFFF",
    ),
    (
        "Première course VTC", "Profitez de votre première course.", "-50%", "BIENVENUE",
        "", "/taxi?mode=standard", None, "dark", "#FF5000",
    ),
]


async def seed_promo_banners():
    """Seed default banners once (idempotent)."""
    if await db.promo_banners.count_documents({}) > 0:
        return
    docs = []
    for i, (title, subtitle, highlight, code, cta, route, image, theme, bg) in enumerate(_SEED):
        docs.append({
            "id": f"promo_{uuid.uuid4().hex[:10]}",
            "title": title,
            "subtitle": subtitle,
            "highlight": highlight,
            "promo_code": code,
            "cta_label": cta,
            "target_route": route,
            "image_url": image,
            "theme": theme,
            "bg_color": bg,
            "display_order": i,
            "status": "active",
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    if docs:
        await db.promo_banners.insert_many(docs)


def _clean(doc):
    doc.pop("_id", None)
    return doc


# ============================================================
# Public
# ============================================================

@router.get("")
async def list_public(country: str = "", state: str = "", city: str = "", location: str = "", surface: str = ""):
    """Active banners for a given surface, filtered by the request zone.

    `surface` targets where the banner shows: "home" (default), "food" or
    "marketplace". Banners with no `surfaces` field default to home (backward
    compat). Zone filtering is unchanged.
    """
    items = await db.promo_banners.find({"status": "active"}, {"_id": 0}).sort("display_order", 1).to_list(200)

    # Surface filter (home is the default for legacy banners without `surfaces`)
    target_surface = surface or "home"
    items = [
        b for b in items
        if (target_surface in (b.get("surfaces") or ["home"]))
    ]

    if not (country or location):
        return {"items": items}
    if country:
        zone = {"country": country.upper(), "state": state, "city": city}
    else:
        zone = resolve_zone_from_text(location)
    filtered = [b for b in items if scope_matches(b.get("scope"), zone)]
    return {"items": filtered}


@router.post("/{banner_id}/impression")
async def track_impression(banner_id: str):
    """Public, fire-and-forget: count one impression for a banner."""
    await db.promo_banners.update_one({"id": banner_id}, {"$inc": {"impressions": 1}})
    return {"ok": True}


@router.post("/{banner_id}/click")
async def track_click(banner_id: str):
    """Public, fire-and-forget: count one click for a banner."""
    await db.promo_banners.update_one({"id": banner_id}, {"$inc": {"clicks": 1}})
    return {"ok": True}


# ============================================================
# Admin
# ============================================================

@router.get("/admin")
async def admin_list(current_user: dict = Depends(require_permission("content.manage"))):
    items = await db.promo_banners.find({}, {"_id": 0}).sort("display_order", 1).to_list(500)
    return {"items": items}


@router.post("/admin")
async def admin_create(request: Request, current_user: dict = Depends(require_permission("content.manage"))):
    body = await request.json()
    if not body.get("title"):
        raise HTTPException(400, "Titre requis")
    image_url = body.get("image_url")
    if isinstance(image_url, str) and len(image_url) > 11_000_000:
        raise HTTPException(413, "Image trop volumineuse (max 8 Mo)")
    count = await db.promo_banners.count_documents({})
    doc = {
        "id": f"promo_{uuid.uuid4().hex[:10]}",
        "title": body["title"],
        "subtitle": body.get("subtitle", ""),
        "highlight": body.get("highlight", ""),
        "promo_code": body.get("promo_code", ""),
        "cta_label": body.get("cta_label", ""),
        "target_route": body.get("target_route") or "/",
        "image_url": image_url or None,
        "theme": body.get("theme") if body.get("theme") in ("light", "dark") else "light",
        "bg_color": body.get("bg_color") or "#FFFFFF",
        "display_order": body.get("display_order", count),
        "status": body.get("status", "active"),
        "surfaces": [s for s in (body.get("surfaces") or ["home"]) if s in ("home", "food", "marketplace")] or ["home"],
        "scope": clean_scope(body.get("scope")),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.promo_banners.insert_one(doc)
    return _clean(doc)


@router.put("/admin/{banner_id}")
async def admin_update(banner_id: str, request: Request, current_user: dict = Depends(require_permission("content.manage"))):
    body = await request.json()
    allowed = {"title", "subtitle", "highlight", "promo_code", "cta_label",
               "target_route", "image_url", "bg_color", "status"}
    updates = {k: v for k, v in body.items() if k in allowed}
    if "theme" in body and body["theme"] in ("light", "dark"):
        updates["theme"] = body["theme"]
    if "display_order" in body:
        updates["display_order"] = int(body["display_order"])
    if "surfaces" in body:
        updates["surfaces"] = [s for s in (body["surfaces"] or []) if s in ("home", "food", "marketplace")] or ["home"]
    if "scope" in body:
        updates["scope"] = clean_scope(body["scope"])
    if isinstance(updates.get("image_url"), str) and len(updates["image_url"]) > 11_000_000:
        raise HTTPException(413, "Image trop volumineuse (max 8 Mo)")
    res = await db.promo_banners.update_one({"id": banner_id}, {"$set": updates})
    if res.matched_count == 0:
        raise HTTPException(404, "Bannière introuvable")
    return {"message": "updated"}


@router.delete("/admin/{banner_id}")
async def admin_delete(banner_id: str, current_user: dict = Depends(require_permission("content.manage"))):
    res = await db.promo_banners.delete_one({"id": banner_id})
    if res.deleted_count == 0:
        raise HTTPException(404, "Bannière introuvable")
    return {"message": "deleted"}


@router.post("/admin/reorder")
async def admin_reorder(request: Request, current_user: dict = Depends(require_permission("content.manage"))):
    """Body: {ordered_ids: [id1, id2, ...]} — sets display_order by index."""
    body = await request.json()
    ids = body.get("ordered_ids", [])
    for i, bid in enumerate(ids):
        await db.promo_banners.update_one({"id": bid}, {"$set": {"display_order": i}})
    return {"message": "reordered", "count": len(ids)}
