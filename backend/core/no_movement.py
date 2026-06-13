"""Anti-fraude Lot 2 — détection « accepté mais ne se déplace pas » + auto-réassignation.

Après qu'un chauffeur accepte une course **instantanée**, une position GPS est
enregistrée (`accept_lat/lng`, cf. rides.accept_ride). Cette boucle de fond vérifie,
au bout de `no_movement_minutes` (défaut 5 min), si le chauffeur n'a **pas bougé**
(distance < `no_movement_threshold_m`, défaut 150 m) et n'est **pas encore arrivé**.

Si c'est le cas : la course est **libérée**, le chauffeur immobile reçoit une
**pénalité** + compteur, les deux parties sont **notifiées**, l'**admin alerté**, et la
course est **réassignée** au chauffeur dispo le plus proche (dispatch séquentiel). Si
aucun chauffeur n'est disponible, la course reste en attente et l'admin est alerté.
"""
import asyncio
import math
from datetime import datetime, timezone, timedelta

from core.config import db, logger
from core.websocket import manager

SCAN_INTERVAL_SEC = 30
_TERMINAL = ("completed", "cancelled", "arriving", "in_progress")


def _haversine_m(lat1, lng1, lat2, lng2) -> float:
    r = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlmb = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlmb / 2) ** 2
    return 2 * r * math.asin(min(1.0, math.sqrt(a)))


async def _current_driver_location(driver_user_id: str, driver_id: str):
    loc = manager.get_driver_location(driver_user_id)
    if loc and loc.get("lat") is not None:
        return loc.get("lat"), loc.get("lng")
    drv = await db.drivers.find_one({"id": driver_id}, {"_id": 0, "current_lat": 1, "current_lng": 1})
    if drv and drv.get("current_lat") is not None:
        return drv.get("current_lat"), drv.get("current_lng")
    return None, None


async def _resolve_driver_user_id(ride: dict) -> str:
    if ride.get("driver_user_id"):
        return ride["driver_user_id"]
    if ride.get("driver_id"):
        drv = await db.drivers.find_one({"id": ride["driver_id"]}, {"_id": 0, "user_id": 1})
        return (drv or {}).get("user_id")
    return None


async def _handle_stuck_ride(ride: dict, threshold_m: float) -> bool:
    ride_id = ride["id"]
    driver_id = ride.get("driver_id")
    driver_user_id = await _resolve_driver_user_id(ride)
    cur_lat, cur_lng = await _current_driver_location(driver_user_id, driver_id)

    # Decide "not moving": no live position at all OR within threshold of accept point.
    moved = False
    if cur_lat is not None and ride.get("accept_lat") is not None:
        dist = _haversine_m(ride["accept_lat"], ride["accept_lng"], cur_lat, cur_lng)
        moved = dist >= threshold_m
    if moved:
        return False

    now = datetime.now(timezone.utc).isoformat()
    # ATOMIC release: only one loop iteration processes this exact assignment.
    released = await db.rides.find_one_and_update(
        {"id": ride_id, "status": "accepted", "driver_id": driver_id, "arrived_at": None},
        {
            "$set": {"status": "pending", "no_movement_released_at": now,
                     "previous_driver_id": driver_id, "assigned_by": None},
            "$unset": {"driver_id": "", "driver_user_id": "", "driver_name": "",
                       "driver_phone": "", "accepted_at": "", "accept_lat": "", "accept_lng": ""},
            "$inc": {"reassign_count": 1},
        },
    )
    if not released:
        return False

    logger.info("no_movement: released ride %s from driver %s", ride_id, driver_id)

    # Penalty + counter for the idle driver.
    try:
        from routes.moderation import apply_driver_penalty, _log_event
        await apply_driver_penalty(driver_id, kind="no_movement_release", ride_id=ride_id)
        await db.drivers.update_one({"id": driver_id}, {"$inc": {"no_movement_count": 1}})
        await _log_event("no_movement_release", driver_id=driver_id, user_id=driver_user_id,
                         ride_id=ride_id)
    except Exception as e:
        logger.error("no_movement penalty error: %s", e)

    # Notify both parties + admins.
    try:
        from core.notifications import create_notification
        if driver_user_id:
            await create_notification(
                driver_user_id, "moderation", "Course réassignée",
                "Aucun déplacement détecté après acceptation — la course a été réattribuée.",
                push=True, data={"ride_id": ride_id, "kind": "no_movement"})
        if ride.get("user_id"):
            await create_notification(
                ride["user_id"], "ride", "Nouveau chauffeur en recherche",
                "Votre chauffeur ne s'est pas mis en route — nous vous en réattribuons un autre.",
                push=True, data={"ride_id": ride_id, "kind": "reassigning"})
        await manager.send_personal_message({"type": "ride_unassigned", "ride_id": ride_id},
                                            driver_user_id or "")
        await manager.send_personal_message({"type": "searching_driver", "ride_id": ride_id},
                                            ride.get("user_id") or "")
    except Exception as e:
        logger.error("no_movement notify error: %s", e)

    # Re-dispatch to the next nearest online driver (excluding the idle one).
    try:
        from routes.bookings_admin import begin_ride_dispatch
        session = await begin_ride_dispatch(ride_id, exclude_driver_ids=[driver_id])
        if not session:
            await manager.broadcast_to_admins({
                "type": "no_movement_alert", "ride_id": ride_id, "driver_id": driver_id,
                "reassigned": False, "reason": "no_driver_available"})
        else:
            await manager.broadcast_to_admins({
                "type": "no_movement_alert", "ride_id": ride_id, "driver_id": driver_id,
                "reassigned": True})
    except Exception as e:
        logger.error("no_movement redispatch error: %s", e)
    return True


async def _scan_stuck_rides() -> int:
    from routes.moderation import get_moderation_config
    cfg = await get_moderation_config()
    if not cfg.get("enabled", True) or not cfg.get("no_movement_enabled", True):
        return 0
    minutes = int(cfg.get("no_movement_minutes", 5) or 5)
    threshold = float(cfg.get("no_movement_threshold_m", 150) or 150)
    now_dt = datetime.now(timezone.utc)
    cutoff = (now_dt - timedelta(minutes=minutes)).isoformat()
    # Lower bound: ignore stale/legacy 'accepted' rides (only act within a 2h window).
    floor = (now_dt - timedelta(hours=2)).isoformat()
    candidates = await db.rides.find({
        "status": "accepted",
        "arrived_at": None,
        "accepted_at": {"$lte": cutoff, "$gte": floor},
        "ride_mode": {"$ne": "scheduled"},
        "driver_id": {"$ne": None},
        "accept_lat": {"$ne": None},
    }, {"_id": 0}).limit(50).to_list(50)
    handled = 0
    for ride in candidates:
        try:
            if await _handle_stuck_ride(ride, threshold):
                handled += 1
        except Exception as e:
            logger.error("no_movement handle error on %s: %s", ride.get("id"), e)
    return handled


async def no_movement_loop():
    logger.info("No-movement anti-fraud loop started")
    while True:
        try:
            await _scan_stuck_rides()
        except Exception as e:
            logger.error("no_movement loop error: %s", e)
        await asyncio.sleep(SCAN_INTERVAL_SEC)
