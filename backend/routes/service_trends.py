"""Lightweight, zone-aware "trending services" tracker.

Each time a user opens a service tile the client pings /track; we keep a running
counter per (service, zone) AND a global counter. /trending returns the most
opened services near the user (falling back to global when the zone is sparse).
No PII is stored — only the service's display metadata so the home can render it.

Admins can additionally **pin** a few services so they always appear FIRST in the
"Tendances près de vous" row, ahead of the organic (usage-based) trends.
"""
from datetime import datetime, timezone

from fastapi import APIRouter, Request, Depends

from core.config import db
from core.permissions import require_permission

router = APIRouter(prefix="/service-trends", tags=["service-trends"])


def _norm_zone(z):
    z = (z or "").strip().lower()[:60]
    return z or "global"


def _shape(i):
    return {
        "id": i.get("sid"),
        "name": i.get("name"),
        "path": i.get("path"),
        "iconName": i.get("icon_name"),
        "imageUrl": i.get("image_url"),
        "bg": i.get("bg_class"),
        "iconColor": i.get("icon_color_class"),
        "count": i.get("count", 0),
    }


@router.post("/track")
async def track(request: Request):
    body = await request.json()
    sid = body.get("id") or body.get("path")
    path = body.get("path")
    if not sid or not path:
        return {"ok": False}
    # Skip aggregate / "more" tiles — not real services.
    if "more" in str(sid):
        return {"ok": False}
    meta = {
        "name": body.get("name"),
        "path": path,
        "icon_name": body.get("iconName"),
        "image_url": body.get("imageUrl"),
        "bg_class": body.get("bg"),
        "icon_color_class": body.get("iconColor"),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    for zone in {_norm_zone(body.get("zone")), "global"}:
        await db.service_trends.update_one(
            {"sid": sid, "zone": zone},
            {"$inc": {"count": 1}, "$set": meta},
            upsert=True,
        )
    return {"ok": True}


@router.get("/trending")
async def trending(zone: str = None, limit: int = 8):
    limit = max(1, min(int(limit or 8), 20))
    z = _norm_zone(zone)
    items = await db.service_trends.find({"zone": z}, {"_id": 0}).sort("count", -1).to_list(limit)
    if len(items) < 4:  # sparse zone → show what's trending globally instead
        items = await db.service_trends.find({"zone": "global"}, {"_id": 0}).sort("count", -1).to_list(limit)
    organic = [_shape(i) for i in items if i.get("name") and i.get("path")]

    # Admin-pinned services always lead the row, then organic trends (dedup by path).
    pinned_doc = await db.service_trends_meta.find_one({"id": "pinned"}, {"_id": 0}) or {}
    out, seen = [], set()
    for p in (pinned_doc.get("items") or []):
        if p.get("name") and p.get("path") and p["path"] not in seen:
            out.append({
                "id": p.get("sid") or p["path"], "name": p["name"], "path": p["path"],
                "iconName": p.get("icon_name"), "imageUrl": p.get("image_url"),
                "bg": p.get("bg_class"), "iconColor": p.get("icon_color_class"),
                "count": 0, "pinned": True,
            })
            seen.add(p["path"])
    for i in organic:
        if i["path"] not in seen:
            out.append(i)
            seen.add(i["path"])
    return {"zone": z, "items": out[:limit]}


def _parse_pinned_item(it):
    path = (it.get("path") or "").strip()
    name = (it.get("name") or "").strip()
    if not path or not name:
        return None
    return {
        "sid": it.get("sid") or it.get("id") or path,
        "name": name, "path": path,
        "icon_name": it.get("icon_name") or it.get("iconName"),
        "image_url": it.get("image_url") or it.get("imageUrl"),
        "bg_class": it.get("bg_class") or it.get("bg"),
        "icon_color_class": it.get("icon_color_class") or it.get("iconColor"),
    }


@router.get("/admin/pinned")
async def admin_get_pinned(current_user: dict = Depends(require_permission("content.manage"))):
    doc = await db.service_trends_meta.find_one({"id": "pinned"}, {"_id": 0}) or {}
    return {"items": doc.get("items") or []}


@router.put("/admin/pinned")
async def admin_set_pinned(request: Request, current_user: dict = Depends(require_permission("content.manage"))):
    body = await request.json()
    items = [p for p in (_parse_pinned_item(it) for it in (body.get("items") or [])[:12]) if p]
    await db.service_trends_meta.update_one(
        {"id": "pinned"},
        {"$set": {"id": "pinned", "items": items, "updated_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True,
    )
    return {"items": items}
