"""Lightweight, zone-aware "trending services" tracker.

Each time a user opens a service tile the client pings /track; we keep a running
counter per (service, zone) AND a global counter. /trending returns the most
opened services near the user (falling back to global when the zone is sparse).
No PII is stored — only the service's display metadata so the home can render it.
"""
from datetime import datetime, timezone

from fastapi import APIRouter, Request

from core.config import db

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
    return {"zone": z, "items": [_shape(i) for i in items if i.get("name") and i.get("path")]}
