"""
"Prévenez-moi quand un chauffeur passe en ligne" — recovers rides that would
otherwise be lost when no driver is available at booking time.

A client registers one availability alert (with their pickup). When any approved
driver toggles online, waiting clients near that driver get a push so they can
re-book. Alerts are one-shot (deleted once notified).
"""
from datetime import datetime, timezone, timedelta

from core.config import db
from core.deps import calculate_distance

ALERT_RADIUS_KM = 15.0
ALERT_TTL_HOURS = 2


async def register_availability_alert(user_id: str, pickup_lat, pickup_lng, pickup_address) -> None:
    now = datetime.now(timezone.utc).isoformat()
    await db.availability_alerts.update_one(
        {"user_id": user_id},
        {"$set": {
            "user_id": user_id,
            "pickup_lat": pickup_lat,
            "pickup_lng": pickup_lng,
            "pickup_address": pickup_address,
            "created_at": now,
        }},
        upsert=True,
    )


async def notify_waiting_clients(driver_user_id: str) -> None:
    """Notify waiting clients that a driver just came online (best-effort)."""
    try:
        drv = await db.drivers.find_one(
            {"user_id": driver_user_id}, {"_id": 0, "current_lat": 1, "current_lng": 1})
        d_lat = (drv or {}).get("current_lat")
        d_lng = (drv or {}).get("current_lng")
        cutoff = (datetime.now(timezone.utc) - timedelta(hours=ALERT_TTL_HOURS)).isoformat()
        alerts = await db.availability_alerts.find(
            {"created_at": {"$gte": cutoff}}).to_list(500)
        if not alerts:
            return
        from core.notifications import create_notification
        for a in alerts:
            if (d_lat is not None and d_lng is not None
                    and a.get("pickup_lat") is not None and a.get("pickup_lng") is not None):
                if calculate_distance(d_lat, d_lng, a["pickup_lat"], a["pickup_lng"]) > ALERT_RADIUS_KM:
                    continue
            await db.availability_alerts.delete_one({"_id": a["_id"]})
            await create_notification(
                a["user_id"], "driver_available", "🚗 Un chauffeur est disponible !",
                "Un chauffeur vient de passer en ligne près de vous. Commandez votre course maintenant.",
                data={"url": "/home"},
            )
    except Exception:
        import logging
        logging.getLogger("availability").warning("notify waiting clients failed", exc_info=True)
