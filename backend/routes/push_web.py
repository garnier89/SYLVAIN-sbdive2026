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

router = APIRouter(prefix="/push", tags=["push"])
admin_router = APIRouter(prefix="/admin/notifications", tags=["admin-notifications"])

# Admin-tunable notification behaviour (proximity, ride chaining, message copy).
DEFAULT_NOTIF_SETTINGS = {
    "arrival_distance_m": 200,        # driver "is here" radius
    "chaining_enabled": True,         # allow a 2nd ride while finishing one
    "chaining_time_min": 5,           # offer chained ride within N min of completion
    "chaining_distance_km": 3,        # ...and within N km of the dropoff
    "messages": {
        "new_ride": "Nouvelle course disponible",
        "scheduled_reservation": "Nouvelle réservation planifiée",
        "ride_accepted": "Votre course a été acceptée",
        "driver_nearby": "Votre chauffeur arrive (à moins de {distance} m)",
        "driver_arrived": "Votre chauffeur est là",
        "ride_started": "Votre course a commencé",
        "ride_completed": "Course terminée — merci !",
        "driver_back_online": "Vous êtes de nouveau en ligne",
        "new_message": "Nouveau message",
    },
}


async def get_notif_settings() -> dict:
    """Merge persisted admin settings over the safe defaults."""
    doc = await db.app_settings.find_one({"key": "notifications"}, {"_id": 0})
    s = (doc or {}).get("value") or {}
    merged = {**DEFAULT_NOTIF_SETTINGS, **s}
    merged["messages"] = {**DEFAULT_NOTIF_SETTINGS["messages"], **(s.get("messages") or {})}
    return merged


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
        "messages": body.get("messages") or {},
    }
    await db.app_settings.update_one(
        {"key": "notifications"},
        {"$set": {"key": "notifications", "value": value}},
        upsert=True,
    )
    return await get_notif_settings()
