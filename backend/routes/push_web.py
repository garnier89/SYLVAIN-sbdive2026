"""
Web Push (PWA) subscription + admin notification settings.

Endpoints (all under /api):
  GET  /push/vapid-public-key        -> { publicKey }   (public)
  POST /push/subscribe               -> store browser subscription (auth)
  POST /push/unsubscribe             -> drop a subscription (auth)
  POST /push/test                    -> send a test push to self (auth)
  GET  /push/settings                -> notification settings (auth)
  GET  /admin/notifications/settings -> admin read
  PUT  /admin/notifications/settings -> admin update
"""
from datetime import datetime, timezone

from fastapi import APIRouter, Request, Depends, HTTPException

from core.config import db, VAPID_PUBLIC_KEY
from core.deps import get_current_user, require_role
from core.webpush import send_web_push_to_user
# Re-exported from core so background helpers can read settings without importing
# this routes module (breaks the former availability ↔ push_web import cycle).
from core.notif_settings import get_notif_settings  # noqa: F401

router = APIRouter(prefix="/push", tags=["push"])
admin_router = APIRouter(prefix="/admin/notifications", tags=["admin-notifications"])



@router.get("/vapid-public-key")
async def vapid_public_key():
    return {"publicKey": VAPID_PUBLIC_KEY}


@router.post("/subscribe")
async def subscribe(request: Request, user=Depends(get_current_user)):
    body = await request.json()
    sub = body.get("subscription") or body
    endpoint = sub.get("endpoint")
    keys = sub.get("keys")
    if not endpoint or not keys or not keys.get("p256dh") or not keys.get("auth"):
        raise HTTPException(status_code=400, detail="Invalid subscription")
    now = datetime.now(timezone.utc).isoformat()
    await db.push_subscriptions.update_one(
        {"endpoint": endpoint},
        {
            "$set": {
                "user_id": user["id"],
                "endpoint": endpoint,
                "keys": {"p256dh": keys["p256dh"], "auth": keys["auth"]},
                "role": user.get("role"),
                "user_agent": request.headers.get("user-agent"),
                "updated_at": now,
            },
            "$setOnInsert": {"created_at": now},
        },
        upsert=True,
    )
    return {"ok": True}


@router.post("/unsubscribe")
async def unsubscribe(request: Request, user=Depends(get_current_user)):
    body = await request.json()
    endpoint = (body or {}).get("endpoint")
    if endpoint:
        await db.push_subscriptions.delete_one({"endpoint": endpoint})
    return {"ok": True}


@router.post("/test")
async def test_push(user=Depends(get_current_user)):
    await send_web_push_to_user(user["id"], {
        "title": "SB Drive — Test",
        "body": "Les notifications push fonctionnent ✅",
        "url": "/",
        "tag": "sb-test",
    })
    return {"ok": True}


@router.get("/settings")
async def notif_settings_public(user=Depends(get_current_user)):
    return await get_notif_settings()


@router.get("/unread-count")
async def unread_count(user=Depends(get_current_user)):
    n = await db.notifications.count_documents({"user_id": user["id"], "read": {"$ne": True}})
    return {"count": n}


@router.get("/list")
async def list_notifications(user=Depends(get_current_user)):
    items = await db.notifications.find(
        {"user_id": user["id"]}, {"_id": 0}
    ).sort("created_at", -1).to_list(50)
    return items


@router.post("/read-all")
async def read_all(user=Depends(get_current_user)):
    res = await db.notifications.update_many(
        {"user_id": user["id"], "read": {"$ne": True}}, {"$set": {"read": True}})
    return {"updated": res.modified_count}


@admin_router.get("/waiting-clients")
async def waiting_clients(request: Request):
    """Active 'notify me when a driver is online' alerts, grouped by zone, with the
    last targeted-push history per zone."""
    await require_role(request, ["admin"])
    from core.availability import compute_waiting_by_zone, get_zone_push_history
    summary = await compute_waiting_by_zone()
    hist = await get_zone_push_history()
    for z in summary["by_zone"]:
        h = hist.get(z["zone_id"])
        z["last_push"] = {"at": h["last_sent_at"], "count": h.get("last_notified_count", 0),
                          "source": h.get("last_source")} if h else None
    return summary


@admin_router.get("/demand-kpi")
async def demand_kpi(request: Request):
    await require_role(request, ["admin"])
    from core.availability import compute_demand_kpi
    return await compute_demand_kpi(hours=24)


@admin_router.post("/notify-zone-drivers")
async def notify_zone_drivers(request: Request):
    """Send a 'high demand, go online' push to OFFLINE approved drivers whose last
    known location falls within the given zone."""
    await require_role(request, ["admin"])
    body = await request.json()
    zone_id = body.get("zone_id")
    zone = await db.zones.find_one({"id": zone_id}, {"_id": 0, "name": 1, "lat": 1, "lng": 1, "radius_km": 1})
    if not zone or zone.get("lat") is None or zone.get("lng") is None:
        raise HTTPException(status_code=404, detail="Zone introuvable")
    from core.availability import notify_zone_offline_drivers
    notified = await notify_zone_offline_drivers(
        zone_id, zone["name"], zone["lat"], zone["lng"], zone.get("radius_km") or 15, source="manual")
    return {"notified": notified, "zone": zone["name"]}


@admin_router.get("/settings")
async def admin_get_settings(request: Request):
    await require_role(request, ["admin"])
    return await get_notif_settings()


@admin_router.put("/settings")
async def admin_put_settings(request: Request):
    await require_role(request, ["admin"])
    body = await request.json()
    # Whitelist + coerce numeric fields, keep messages as a dict.
    value = {
        "arrival_distance_m": max(10, int(body.get("arrival_distance_m", 200))),
        "chaining_enabled": bool(body.get("chaining_enabled", True)),
        "chaining_time_min": max(0, int(body.get("chaining_time_min", 5))),
        "chaining_distance_km": max(0, float(body.get("chaining_distance_km", 3))),
        "auto_demand_alerts": bool(body.get("auto_demand_alerts", True)),
        "demand_cooldown_min": max(1, int(body.get("demand_cooldown_min", 30))),
        "demand_min_waiting": max(1, int(body.get("demand_min_waiting", 1))),
        "messages": body.get("messages") or {},
    }
    await db.app_settings.update_one(
        {"key": "notifications"},
        {"$set": {"key": "notifications", "value": value}},
        upsert=True,
    )
    return await get_notif_settings()


# ───────────────────── Custom broadcast notifications ─────────────────────
# Admin-composed notifications/announcements targeted at an audience (simple
# role-based or a refined segment) with optional scheduled delivery. See
# core.notif_broadcast for audience resolution, dispatch and the scheduler loop.

import uuid as _uuid
from core.notif_broadcast import (
    AUDIENCE_LABELS, ZONE_AUDIENCES, INACTIVITY_AUDIENCES, INACTIVITY_PRESETS,
    resolve_audience, dispatch_broadcast,
)


def _norm_schedule(raw) -> tuple:
    """Return (schedule_at_iso_or_None, status). A future schedule → 'scheduled'."""
    if not raw:
        return None, "draft"
    try:
        dt = datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
    except (ValueError, TypeError):
        return None, "draft"
    iso = dt.astimezone(timezone.utc).isoformat()
    status = "scheduled" if dt > datetime.now(timezone.utc) else "draft"
    return iso, status


def _clean_broadcast(b: dict) -> dict:
    return {
        "id": b.get("id"),
        "title": b.get("title", ""),
        "body": b.get("body", ""),
        "audience": b.get("audience", "client"),
        "audience_label": AUDIENCE_LABELS.get(b.get("audience", "client"), b.get("audience")),
        "zone_id": b.get("zone_id"),
        "zone_name": b.get("zone_name"),
        "inactive_days": b.get("inactive_days"),
        "url": b.get("url") or "",
        "schedule_at": b.get("schedule_at"),
        "status": b.get("status", "draft"),
        "active": bool(b.get("active", True)),
        "created_at": b.get("created_at"),
        "updated_at": b.get("updated_at"),
        "last_sent_at": b.get("last_sent_at"),
        "sent_count": b.get("sent_count", 0),
    }


async def _apply_targeting(body: dict, doc: dict) -> None:
    """Fill zone_id/zone_name/inactive_days on `doc` based on the audience."""
    audience = doc["audience"]
    if audience in ZONE_AUDIENCES:
        zone = await db.zones.find_one({"id": body.get("zone_id")}, {"_id": 0, "id": 1, "name": 1})
        if not zone:
            raise HTTPException(status_code=400, detail="Zone requise pour ce ciblage")
        doc["zone_id"] = zone["id"]
        doc["zone_name"] = zone.get("name")
    else:
        doc["zone_id"] = None
        doc["zone_name"] = None
    doc["inactive_days"] = max(1, int(body.get("inactive_days") or 30)) if audience in INACTIVITY_AUDIENCES else None


@admin_router.get("/broadcasts")
async def list_broadcasts(request: Request):
    await require_role(request, ["admin"])
    items = await db.notif_broadcasts.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)
    zones = await db.zones.find({}, {"_id": 0, "id": 1, "name": 1}).sort("name", 1).to_list(200)
    return {
        "items": [_clean_broadcast(b) for b in items],
        "audiences": [{"value": k, "label": v} for k, v in AUDIENCE_LABELS.items()],
        "zone_audiences": list(ZONE_AUDIENCES),
        "inactivity_audiences": list(INACTIVITY_AUDIENCES),
        "inactivity_presets": INACTIVITY_PRESETS,
        "zones": zones,
    }


@admin_router.post("/broadcasts/preview")
async def preview_broadcast(request: Request):
    """Estimate how many users a given targeting would reach (no send)."""
    await require_role(request, ["admin"])
    body = await request.json()
    if body.get("audience") not in AUDIENCE_LABELS:
        raise HTTPException(status_code=400, detail="Audience invalide")
    spec = {"audience": body["audience"], "zone_id": body.get("zone_id"),
            "inactive_days": body.get("inactive_days")}
    recipients = await resolve_audience(spec)
    return {"count": len(recipients)}


@admin_router.post("/broadcasts")
async def create_broadcast(request: Request):
    await require_role(request, ["admin"])
    body = await request.json()
    title = (body.get("title") or "").strip()
    text = (body.get("body") or "").strip()
    audience = body.get("audience") if body.get("audience") in AUDIENCE_LABELS else "client"
    if not title or not text:
        raise HTTPException(status_code=400, detail="Titre et message requis")
    now = datetime.now(timezone.utc).isoformat()
    schedule_at, status = _norm_schedule(body.get("schedule_at"))
    doc = {
        "id": _uuid.uuid4().hex, "title": title, "body": text, "audience": audience,
        "url": (body.get("url") or "").strip(), "active": bool(body.get("active", True)),
        "schedule_at": schedule_at, "status": status,
        "created_at": now, "updated_at": now, "last_sent_at": None, "sent_count": 0,
    }
    await _apply_targeting(body, doc)
    await db.notif_broadcasts.insert_one(doc)
    return _clean_broadcast(doc)


@admin_router.put("/broadcasts/{bid}")
async def update_broadcast(bid: str, request: Request):
    await require_role(request, ["admin"])
    body = await request.json()
    existing = await db.notif_broadcasts.find_one({"id": bid}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Notification introuvable")
    update = {"updated_at": datetime.now(timezone.utc).isoformat()}
    if "title" in body:
        update["title"] = (body.get("title") or "").strip()
    if "body" in body:
        update["body"] = (body.get("body") or "").strip()
    if body.get("audience") in AUDIENCE_LABELS:
        update["audience"] = body["audience"]
        # Recompute zone/inactivity targeting for the (possibly) new audience.
        tmp = {"audience": body["audience"]}
        await _apply_targeting(body, tmp)
        update.update({"zone_id": tmp["zone_id"], "zone_name": tmp["zone_name"], "inactive_days": tmp["inactive_days"]})
    if "url" in body:
        update["url"] = (body.get("url") or "").strip()
    if "active" in body:
        update["active"] = bool(body.get("active"))
    if "schedule_at" in body:
        schedule_at, status = _norm_schedule(body.get("schedule_at"))
        update["schedule_at"] = schedule_at
        # Don't resurrect an already-sent broadcast unless rescheduled in future.
        if status == "scheduled" or existing.get("status") != "sent":
            update["status"] = status
    await db.notif_broadcasts.update_one({"id": bid}, {"$set": update})
    doc = await db.notif_broadcasts.find_one({"id": bid}, {"_id": 0})
    return _clean_broadcast(doc)


@admin_router.delete("/broadcasts/{bid}")
async def delete_broadcast(bid: str, request: Request):
    await require_role(request, ["admin"])
    await db.notif_broadcasts.delete_one({"id": bid})
    return {"ok": True}


@admin_router.post("/broadcasts/{bid}/send")
async def send_broadcast(bid: str, request: Request):
    await require_role(request, ["admin"])
    b = await db.notif_broadcasts.find_one({"id": bid}, {"_id": 0})
    if not b:
        raise HTTPException(status_code=404, detail="Notification introuvable")
    sent = await dispatch_broadcast(bid)
    return {"ok": True, "sent": sent}
