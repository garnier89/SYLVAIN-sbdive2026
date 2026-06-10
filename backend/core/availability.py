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


# ─────────────────────────────────────────────────────────────────────────────
# Demand vs supply: waiting clients per zone + targeted "go online" pushes,
# usable manually (admin click) and automatically (background demand agent).
# ─────────────────────────────────────────────────────────────────────────────

async def compute_waiting_by_zone() -> dict:
    """Group active availability alerts by zone (center + radius_km)."""
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=ALERT_TTL_HOURS)).isoformat()
    alerts = await db.availability_alerts.find({"created_at": {"$gte": cutoff}}, {"_id": 0}).to_list(3000)
    zones = await db.zones.find({}, {"_id": 0, "id": 1, "name": 1, "lat": 1, "lng": 1, "radius_km": 1}).to_list(500)
    by_zone, hors = {}, 0
    for a in alerts:
        lat, lng = a.get("pickup_lat"), a.get("pickup_lng")
        matched = None
        if lat is not None and lng is not None:
            best = None
            for z in zones:
                if z.get("lat") is None or z.get("lng") is None:
                    continue
                d = calculate_distance(lat, lng, z["lat"], z["lng"])
                if d <= (z.get("radius_km") or 0) and (best is None or d < best[1]):
                    best = (z, d)
            matched = best[0] if best else None
        if matched:
            row = by_zone.setdefault(matched["id"], {
                "zone_id": matched["id"], "name": matched["name"],
                "lat": matched["lat"], "lng": matched["lng"],
                "radius_km": matched.get("radius_km") or 15, "count": 0,
            })
            row["count"] += 1
        else:
            hors += 1
    rows = sorted(by_zone.values(), key=lambda r: r["count"], reverse=True)
    return {"total": len(alerts), "by_zone": rows, "hors_zone": hors}


async def notify_zone_offline_drivers(zone_id, name, lat, lng, radius_km, source="manual", waiting=None) -> int:
    """Push a 'high demand, go online' alert to offline approved drivers whose last
    known location is within the zone; record a send-history entry (anti-spam + KPIs)."""
    from core.notifications import create_notification
    drivers = await db.drivers.find(
        {"status": "approved", "is_online": False},
        {"_id": 0, "user_id": 1, "current_lat": 1, "current_lng": 1}).to_list(3000)
    notified = 0
    for d in drivers:
        dlat, dlng = d.get("current_lat"), d.get("current_lng")
        if dlat is None or dlng is None or not d.get("user_id"):
            continue
        if calculate_distance(dlat, dlng, lat, lng) > (radius_km or 15):
            continue
        await create_notification(
            d["user_id"], "demand_alert", "📈 Forte demande",
            f"Forte demande à {name}, passez en ligne pour prendre des courses !",
            data={"url": "/chauffeur/home", "zone_id": zone_id})
        notified += 1
    now = datetime.now(timezone.utc).isoformat()
    await db.zone_demand_pushes.update_one(
        {"zone_id": zone_id},
        {"$set": {"zone_id": zone_id, "name": name, "last_sent_at": now,
                  "last_notified_count": notified, "last_source": source, "waiting_at_send": waiting}},
        upsert=True)
    return notified


async def get_zone_push_history() -> dict:
    docs = await db.zone_demand_pushes.find({}, {"_id": 0}).to_list(500)
    return {d["zone_id"]: d for d in docs}


async def demand_automation_loop():
    """Background 'demand agent': periodically analyses waiting clients per zone and
    auto-notifies offline drivers where demand exists, with a per-zone cooldown."""
    import asyncio as _a
    import logging
    log = logging.getLogger("demand_agent")
    await _a.sleep(20)
    while True:
        try:
            from routes.push_web import get_notif_settings
            s = await get_notif_settings()
            if s.get("auto_demand_alerts", True):
                cooldown_min = int(s.get("demand_cooldown_min", 30) or 30)
                min_wait = int(s.get("demand_min_waiting", 1) or 1)
                summary = await compute_waiting_by_zone()
                hist = await get_zone_push_history()
                now = datetime.now(timezone.utc)
                for z in summary["by_zone"]:
                    if z["count"] < min_wait:
                        continue
                    h = hist.get(z["zone_id"])
                    if h and h.get("last_sent_at"):
                        try:
                            last = datetime.fromisoformat(h["last_sent_at"])
                            if (now - last).total_seconds() < cooldown_min * 60:
                                continue
                        except Exception:
                            pass
                    n = await notify_zone_offline_drivers(
                        z["zone_id"], z["name"], z["lat"], z["lng"], z["radius_km"],
                        source="auto", waiting=z["count"])
                    if n:
                        log.info(f"demand agent: notified {n} offline drivers in {z['name']} ({z['count']} waiting)")
        except Exception:
            log.warning("demand automation loop error", exc_info=True)
        await _a.sleep(300)  # every 5 minutes
