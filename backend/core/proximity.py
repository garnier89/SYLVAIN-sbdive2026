"""
Driver-proximity alerts: notify the passenger "Votre chauffeur arrive" once the
assigned driver enters the admin-configured radius (default 200 m) while en
route to the pickup. Fired from both the WS location stream and the REST
location endpoint. Idempotent via the ride's `nearby_notified` flag.
"""
from core.config import db
from core.deps import calculate_distance

# Driver is heading to the pickup (not yet started the trip).
_EN_ROUTE_STATUSES = ["accepted", "arriving"]


async def maybe_notify_driver_nearby(driver_user_id: str, lat: float, lng: float) -> None:
    if not driver_user_id or lat is None or lng is None:
        return
    try:
        drv = await db.drivers.find_one({"user_id": driver_user_id}, {"_id": 0, "id": 1})
        if not drv:
            return
        ride = await db.rides.find_one(
            {"driver_id": drv["id"], "status": {"$in": _EN_ROUTE_STATUSES},
             "nearby_notified": {"$ne": True}},
            {"_id": 0, "id": 1, "user_id": 1, "pickup_lat": 1, "pickup_lng": 1},
        )
        if not ride or ride.get("pickup_lat") is None or ride.get("pickup_lng") is None:
            return

        from routes.push_web import get_notif_settings
        settings = await get_notif_settings()
        radius_m = int(settings.get("arrival_distance_m", 200) or 200)
        dist_km = calculate_distance(lat, lng, ride["pickup_lat"], ride["pickup_lng"])
        if dist_km * 1000.0 > radius_m:
            return

        # Atomically claim the one-shot flag so concurrent updates don't double-fire.
        res = await db.rides.update_one(
            {"id": ride["id"], "nearby_notified": {"$ne": True}},
            {"$set": {"nearby_notified": True}},
        )
        if res.modified_count == 0:
            return

        msg_tpl = settings["messages"].get("driver_nearby") or "Votre chauffeur arrive (à moins de {distance} m)"
        msg = msg_tpl.replace("{distance}", str(radius_m))
        from core.notifications import create_notification
        from core.websocket import manager
        try:
            await manager.send_personal_message(
                {"type": "driver_nearby", "ride_id": ride["id"], "body": msg}, ride["user_id"])
        except Exception:
            pass
        await create_notification(
            ride["user_id"], "driver_nearby", "🚗 Chauffeur à proximité", msg,
            data={"url": f"/ride/{ride['id']}", "ride_id": ride["id"]},
        )
    except Exception:
        import logging
        logging.getLogger("proximity").warning("nearby notify failed", exc_info=True)
