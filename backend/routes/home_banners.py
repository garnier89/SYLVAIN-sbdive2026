"""
Home Feature Banners CMS.

Admin-managed full-width banners shown on the user home screen (e.g. the
"SB Student" entry row and the "Livraison Instantanée" hero card). Lets the
team control ORDER, VISIBILITY, ZONE targeting, display SCHEDULE (date window)
and whether each banner is DISMISSIBLE — all without a redeployment.

Two render variants:
  - "hero"  : large gradient card (icon + optional badge + title + subtitle)
  - "entry" : compact row (round icon + title + subtitle + chevron)

Public endpoint serves the active, in-schedule, zone-matching banners ordered
by display_order. A /dismiss endpoint counts closes (close-rate analytics).

Collection: home_banners
"""
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Request, HTTPException, Depends

from core.config import db
from core.permissions import require_permission
from core.geo_scope import clean_scope, scope_matches, resolve_zone_from_text

public_router = APIRouter(prefix="/home-banners", tags=["home-banners"])
admin_router = APIRouter(prefix="/admin/home-banners", tags=["admin-home-banners"])


def _now():
    return datetime.now(timezone.utc).isoformat()


def _parse_dt(s):
    if not s:
        return None
    try:
        dt = datetime.fromisoformat(str(s).replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except Exception:
        return None


def _in_schedule(b) -> bool:
    """True if NOW is within [starts_at, ends_at] (either bound optional)."""
    now = datetime.now(timezone.utc)
    start = _parse_dt(b.get("starts_at"))
    end = _parse_dt(b.get("ends_at"))
    if start and now < start:
        return False
    if end and now > end:
        return False
    return True


# (key, variant, title, subtitle, icon, badge, bg_from, bg_to, target_route)
DEFAULTS = [
    ("sb_student", "entry", "SB Student 🎓", "Marketplace, tarifs étudiants, campus & plus",
     "GraduationCap", "", "#5B21B6", "#7C3AED", "/sb-student"),
    ("instant_delivery", "hero", "Livraison Instantanée",
     "Envoyez un colis maintenant — un coursier le récupère et le livre en temps réel.",
     "Lightning", "EXPRESS · DÈS 30 MIN", "#4F46E5", "#FF5000", "/parcel"),
]


async def seed_home_banners():
    """Idempotent: seed the default home feature banners if none exist."""
    if await db.home_banners.count_documents({}) > 0:
        return
    docs = []
    for i, (key, variant, title, subtitle, icon, badge, bg_from, bg_to, route) in enumerate(DEFAULTS):
        docs.append({
            "id": f"hbn_{uuid.uuid4().hex[:10]}",
            "key": key, "variant": variant, "title": title, "subtitle": subtitle,
            "icon": icon, "badge": badge, "bg_from": bg_from, "bg_to": bg_to,
            "target_route": route, "dismissible": True, "active": True,
            "display_order": i, "scope": {"country": "", "state": "", "city": ""},
            "starts_at": None, "ends_at": None,
            "impressions": 0, "dismiss_count": 0,
            "created_at": _now(), "updated_at": _now(),
        })
    if docs:
        await db.home_banners.insert_many(docs)


def _clean(doc):
    doc.pop("_id", None)
    return doc


# ============================================================
# Public
# ============================================================

@public_router.get("")
async def list_public(country: str = "", state: str = "", city: str = "", location: str = ""):
    """Active + in-schedule + zone-matching home banners, ordered by display_order."""
    items = await db.home_banners.find({"active": True}, {"_id": 0}).sort("display_order", 1).to_list(100)
    items = [b for b in items if _in_schedule(b)]
    # Always apply zone targeting: globally-scoped banners show everywhere; a
    # zone-scoped banner only shows when the request resolves to a matching zone.
    if country:
        zone = {"country": country.upper(), "state": state, "city": city}
    elif location:
        zone = resolve_zone_from_text(location)
    else:
        zone = None
    items = [b for b in items if scope_matches(b.get("scope"), zone)]
    return {"banners": items}


@public_router.post("/{banner_id}/dismiss")
async def track_dismiss(banner_id: str):
    """Public, fire-and-forget: count one close (for close-rate analytics)."""
    await db.home_banners.update_one({"id": banner_id}, {"$inc": {"dismiss_count": 1}})
    return {"ok": True}


@public_router.post("/{banner_id}/impression")
async def track_impression(banner_id: str):
    await db.home_banners.update_one({"id": banner_id}, {"$inc": {"impressions": 1}})
    return {"ok": True}


# ============================================================
# Admin
# ============================================================

def _payload(body, *, creating):
    out = {}
    if creating or "title" in body:
        out["title"] = (body.get("title") or "").strip()
    if creating or "subtitle" in body:
        out["subtitle"] = (body.get("subtitle") or "").strip()
    if creating or "variant" in body:
        out["variant"] = body.get("variant") if body.get("variant") in ("hero", "entry") else "entry"
    if creating or "icon" in body:
        out["icon"] = (body.get("icon") or "").strip()
    if creating or "badge" in body:
        out["badge"] = (body.get("badge") or "").strip()
    if creating or "bg_from" in body:
        out["bg_from"] = (body.get("bg_from") or "#5B21B6").strip()
    if creating or "bg_to" in body:
        out["bg_to"] = (body.get("bg_to") or "#7C3AED").strip()
    if creating or "target_route" in body:
        out["target_route"] = (body.get("target_route") or "/").strip()
    if creating or "dismissible" in body:
        out["dismissible"] = bool(body.get("dismissible", True))
    if creating or "active" in body:
        out["active"] = bool(body.get("active", True))
    if "display_order" in body and body.get("display_order") is not None:
        out["display_order"] = int(body["display_order"])
    if creating or "scope" in body:
        out["scope"] = clean_scope(body.get("scope"))
    if creating or "starts_at" in body:
        out["starts_at"] = body.get("starts_at") or None
    if creating or "ends_at" in body:
        out["ends_at"] = body.get("ends_at") or None
    return out


@admin_router.get("")
async def admin_list(current_user: dict = Depends(require_permission("content.manage"))):
    items = await db.home_banners.find({}, {"_id": 0}).sort("display_order", 1).to_list(200)
    # Derive close-rate for the admin table.
    for b in items:
        imp = b.get("impressions") or 0
        b["close_rate"] = round(100 * (b.get("dismiss_count") or 0) / imp, 1) if imp else 0.0
    return {"banners": items, "count": len(items)}


@admin_router.post("")
async def admin_create(request: Request, current_user: dict = Depends(require_permission("content.manage"))):
    body = await request.json()
    data = _payload(body, creating=True)
    if not data["title"]:
        raise HTTPException(status_code=400, detail="Le titre est requis")
    last = await db.home_banners.find_one({}, sort=[("display_order", -1)])
    doc = {
        "id": f"hbn_{uuid.uuid4().hex[:10]}",
        "key": (body.get("key") or f"banner_{uuid.uuid4().hex[:6]}").strip(),
        **data,
        "display_order": data.get("display_order", (last.get("display_order", 0) + 1) if last else 0),
        "impressions": 0, "dismiss_count": 0,
        "created_at": _now(), "updated_at": _now(),
    }
    await db.home_banners.insert_one(dict(doc))
    return _clean(doc)


@admin_router.put("/{banner_id}")
async def admin_update(banner_id: str, request: Request, current_user: dict = Depends(require_permission("content.manage"))):
    body = await request.json()
    existing = await db.home_banners.find_one({"id": banner_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Bannière introuvable")
    patch = _payload(body, creating=False)
    patch["updated_at"] = _now()  # touch → re-show after edit on the client
    await db.home_banners.update_one({"id": banner_id}, {"$set": patch})
    return {**existing, **patch}


@admin_router.patch("/{banner_id}/toggle")
async def admin_toggle(banner_id: str, current_user: dict = Depends(require_permission("content.manage"))):
    existing = await db.home_banners.find_one({"id": banner_id}, {"_id": 0, "active": 1})
    if not existing:
        raise HTTPException(status_code=404, detail="Bannière introuvable")
    new_val = not existing.get("active", True)
    await db.home_banners.update_one({"id": banner_id}, {"$set": {"active": new_val, "updated_at": _now()}})
    return {"id": banner_id, "active": new_val}


@admin_router.delete("/{banner_id}")
async def admin_delete(banner_id: str, current_user: dict = Depends(require_permission("content.manage"))):
    res = await db.home_banners.delete_one({"id": banner_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Bannière introuvable")
    return {"ok": True, "deleted": banner_id}


@admin_router.post("/reorder")
async def admin_reorder(request: Request, current_user: dict = Depends(require_permission("content.manage"))):
    body = await request.json()
    ids = body.get("ordered_ids", [])
    for i, bid in enumerate(ids):
        await db.home_banners.update_one({"id": bid}, {"$set": {"display_order": i, "updated_at": _now()}})
    return {"ok": True, "count": len(ids)}
