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

import jwt
from fastapi import APIRouter, Request, HTTPException, Depends

from core.config import db, JWT_SECRET, JWT_ALGORITHM
from core.permissions import require_permission
from core.geo_scope import clean_scope, scope_matches, resolve_zone_from_text

public_router = APIRouter(prefix="/home-banners", tags=["home-banners"])
admin_router = APIRouter(prefix="/admin/home-banners", tags=["admin-home-banners"])


async def _resolve_user_optional(request: Request):
    """Best-effort: resolve the logged-in user from cookie/Bearer token. Never raises."""
    token = request.cookies.get("access_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if not token:
        return None
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            return None
        u = await db.users.find_one({"id": payload.get("sub")}, {"_id": 0, "id": 1, "name": 1, "phone": 1, "email": 1})
        return u
    except Exception:
        return None


async def _log_banner_event(request: Request, banner_id: str, event: str):
    """Log a banner interaction (impression/click/dismiss) with user + location + time,
    and bump the fast counter on the banner doc. Body may carry zone/location/lat/lng."""
    try:
        body = await request.json()
    except Exception:
        body = {}
    banner = await db.home_banners.find_one({"id": banner_id}, {"_id": 0, "key": 1, "title": 1})
    if not banner:
        return False
    user = await _resolve_user_optional(request)
    label = (body.get("location") or "").strip()
    zone = resolve_zone_from_text(label) if label else {}
    doc = {
        "id": f"bev_{uuid.uuid4().hex[:12]}",
        "banner_id": banner_id,
        "banner_key": banner.get("key"),
        "banner_title": banner.get("title"),
        "event": event,
        "user_id": (user or {}).get("id"),
        "user_name": (user or {}).get("name") or "Visiteur anonyme",
        "user_phone": (user or {}).get("phone"),
        "country": (body.get("country") or zone.get("country") or "").upper(),
        "state": body.get("state") or zone.get("state") or "",
        "city": body.get("city") or zone.get("city") or "",
        "location_label": label,
        "lat": body.get("lat"),
        "lng": body.get("lng"),
        "created_at": _now(),
    }
    await db.banner_events.insert_one(doc)
    field = {"impression": "impressions", "click": "clicks", "dismiss": "dismiss_count"}.get(event)
    if field:
        await db.home_banners.update_one({"id": banner_id}, {"$inc": {field: 1}})
    return True


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
async def track_dismiss(banner_id: str, request: Request):
    """Public: log one close (with user/time/location) for close-rate analytics."""
    await _log_banner_event(request, banner_id, "dismiss")
    return {"ok": True}


@public_router.post("/{banner_id}/impression")
async def track_impression(banner_id: str, request: Request):
    """Public: log one view (with user/time/location)."""
    await _log_banner_event(request, banner_id, "impression")
    return {"ok": True}


@public_router.post("/{banner_id}/click")
async def track_click(banner_id: str, request: Request):
    """Public: log one click (with user/time/location)."""
    await _log_banner_event(request, banner_id, "click")
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



# ============================================================
# Admin — analytics ("régie pub interne")
# ============================================================

def _rate(num, den):
    return round(100 * num / den, 1) if den else 0.0


@admin_router.get("/analytics")
async def admin_analytics(current_user: dict = Depends(require_permission("content.manage"))):
    """Per-banner performance (impressions, clicks, dismisses, CTR, close-rate)
    plus a CTR-by-zone breakdown — aggregated from banner_events."""
    banners = await db.home_banners.find({}, {"_id": 0, "id": 1, "title": 1, "key": 1, "variant": 1}).sort("display_order", 1).to_list(200)

    # Totals per banner+event
    pipe = [{"$group": {"_id": {"b": "$banner_id", "e": "$event"}, "n": {"$sum": 1}}}]
    rows = await db.banner_events.aggregate(pipe).to_list(5000)
    totals = {}
    for r in rows:
        b = r["_id"]["b"]; e = r["_id"]["e"]
        totals.setdefault(b, {}).update({e: r["n"]})

    # By-zone per banner+event (country/city)
    zpipe = [{"$group": {"_id": {"b": "$banner_id", "e": "$event", "c": "$country", "city": "$city"}, "n": {"$sum": 1}}}]
    zrows = await db.banner_events.aggregate(zpipe).to_list(10000)
    zones = {}
    for r in zrows:
        k = r["_id"]; b = k["b"]
        zlabel = (k.get("city") or "").strip() or (k.get("c") or "").strip() or "Inconnu"
        zones.setdefault(b, {}).setdefault(zlabel, {"impression": 0, "click": 0, "dismiss": 0})
        zones[b][zlabel][k["e"]] = zones[b][zlabel].get(k["e"], 0) + r["n"]

    out = []
    g_imp = g_clk = g_dis = 0
    for b in banners:
        t = totals.get(b["id"], {})
        imp = t.get("impression", 0); clk = t.get("click", 0); dis = t.get("dismiss", 0)
        g_imp += imp; g_clk += clk; g_dis += dis
        zb = []
        for zlabel, zt in sorted(zones.get(b["id"], {}).items(), key=lambda kv: -kv[1].get("impression", 0)):
            zb.append({
                "zone": zlabel,
                "impressions": zt.get("impression", 0),
                "clicks": zt.get("click", 0),
                "dismisses": zt.get("dismiss", 0),
                "ctr": _rate(zt.get("click", 0), zt.get("impression", 0)),
            })
        out.append({
            "id": b["id"], "title": b["title"], "key": b["key"], "variant": b.get("variant"),
            "impressions": imp, "clicks": clk, "dismisses": dis,
            "ctr": _rate(clk, imp), "close_rate": _rate(dis, imp),
            "by_zone": zb[:8],
        })

    return {
        "banners": out,
        "totals": {
            "impressions": g_imp, "clicks": g_clk, "dismisses": g_dis,
            "ctr": _rate(g_clk, g_imp), "close_rate": _rate(g_dis, g_imp),
        },
    }


@admin_router.get("/{banner_id}/events")
async def admin_events(banner_id: str, limit: int = 50, event: str = "", current_user: dict = Depends(require_permission("content.manage"))):
    """Recent interactions for a banner: who (name), when (time), where (location)."""
    q = {"banner_id": banner_id}
    if event in ("impression", "click", "dismiss"):
        q["event"] = event
    limit = max(1, min(limit, 200))
    items = await db.banner_events.find(q, {"_id": 0}).sort("created_at", -1).to_list(limit)
    return {"events": items, "count": len(items)}
