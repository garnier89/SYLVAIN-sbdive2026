"""Admin broadcast notifications — segments, scheduling and background dispatch.

An admin composes a notification, picks an AUDIENCE (simple role-based or a
refined SEGMENT: offline drivers, drivers in a zone, inactive clients, inactive
clients in a zone) and optionally a SCHEDULE (deferred send at a date/time).

- Immediate send: POST /admin/notifications/broadcasts/{id}/send
- Scheduled send: a 60s background loop (broadcast_scheduler_loop) dispatches
  any 'scheduled' broadcast whose schedule_at is due.

This module owns audience resolution + dispatch so both the HTTP layer
(routes.push_web) and the loop can use it without import cycles.
"""
import math
import asyncio
from datetime import datetime, timezone, timedelta
from typing import List, Optional

from core.config import db, logger
from core.websocket import manager


# Audience → human label. Role-based audiences map to user roles; segments are
# resolved dynamically (offline drivers, zone, inactivity).
AUDIENCE_LABELS = {
    "all": "Toutes les applications",
    "client": "Application client",
    "driver": "Application chauffeur",
    "merchant": "Application marchand",
    "driver_offline": "Chauffeurs hors-ligne",
    "driver_zone": "Chauffeurs d'une zone",
    "client_inactive": "Clients inactifs",
    "client_inactive_zone": "Clients inactifs d'une zone",
}

# Audiences that need a zone_id / inactive_days parameter.
ZONE_AUDIENCES = {"driver_zone", "client_inactive_zone"}
INACTIVITY_AUDIENCES = {"client_inactive", "client_inactive_zone"}

# Admin-selectable inactivity presets (days). The admin picks one; any positive
# integer is accepted server-side ("voir plus").
INACTIVITY_PRESETS = [
    {"value": 7, "label": "1 semaine"},
    {"value": 14, "label": "2 semaines"},
    {"value": 21, "label": "3 semaines"},
    {"value": 30, "label": "1 mois"},
    {"value": 60, "label": "2 mois"},
    {"value": 90, "label": "3 mois"},
]

_ROLE_MAP = {
    "all": ["user", "driver", "merchant"],
    "client": ["user"],
    "driver": ["driver"],
    "merchant": ["merchant"],
}


def _haversine_km(lat1, lng1, lat2, lng2) -> float:
    try:
        r = 6371.0
        p1, p2 = math.radians(lat1), math.radians(lat2)
        dphi = math.radians(lat2 - lat1)
        dl = math.radians(lng2 - lng1)
        a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
        return r * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    except (TypeError, ValueError):
        return 1e9


async def _active_user_ids_since(cutoff_iso: str) -> set:
    """User ids that took a ride OR placed an order since cutoff (= 'active')."""
    active = set()
    active.update(await db.rides.distinct("user_id", {"created_at": {"$gte": cutoff_iso}}))
    active.update(await db.orders.distinct("user_id", {"created_at": {"$gte": cutoff_iso}}))
    return {u for u in active if u}


async def _last_ride_location(user_id: str):
    doc = await db.rides.find_one(
        {"user_id": user_id, "pickup_lat": {"$ne": None}},
        {"_id": 0, "pickup_lat": 1, "pickup_lng": 1},
        sort=[("created_at", -1)],
    )
    if doc and doc.get("pickup_lat") is not None:
        return doc["pickup_lat"], doc.get("pickup_lng")
    return None


async def resolve_audience(b: dict) -> List[str]:
    """Resolve a broadcast definition to a list of recipient user ids."""
    audience = b.get("audience", "client")

    # Simple role-based audiences.
    if audience in _ROLE_MAP:
        ids = await db.users.distinct("id", {"role": {"$in": _ROLE_MAP[audience]}})
        return [i for i in ids if i]

    # Offline drivers (not currently online).
    if audience == "driver_offline":
        return [d["user_id"] async for d in db.drivers.find(
            {"is_online": {"$ne": True}}, {"_id": 0, "user_id": 1}) if d.get("user_id")]

    # Drivers whose last known GPS falls within a zone radius.
    if audience == "driver_zone":
        zone = await db.zones.find_one({"id": b.get("zone_id")}, {"_id": 0, "lat": 1, "lng": 1, "radius_km": 1})
        if not zone or zone.get("lat") is None:
            return []
        radius = float(zone.get("radius_km") or 15)
        out = []
        async for d in db.drivers.find(
            {"current_lat": {"$ne": None}, "current_lng": {"$ne": None}},
            {"_id": 0, "user_id": 1, "current_lat": 1, "current_lng": 1}):
            if _haversine_km(d["current_lat"], d["current_lng"], zone["lat"], zone["lng"]) <= radius and d.get("user_id"):
                out.append(d["user_id"])
        return out

    # Inactive clients (no ride/order in N days), optionally crossed with a zone.
    if audience in ("client_inactive", "client_inactive_zone"):
        days = max(1, int(b.get("inactive_days") or 30))
        cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
        all_clients = {i for i in await db.users.distinct("id", {"role": "user"}) if i}
        active = await _active_user_ids_since(cutoff)
        inactive = all_clients - active
        if audience == "client_inactive":
            return list(inactive)
        # Crossed with zone → keep only those whose last ride pickup is in the zone.
        zone = await db.zones.find_one({"id": b.get("zone_id")}, {"_id": 0, "lat": 1, "lng": 1, "radius_km": 1})
        if not zone or zone.get("lat") is None:
            return []
        radius = float(zone.get("radius_km") or 15)
        out = []
        for uid in inactive:
            loc = await _last_ride_location(uid)
            if loc and loc[1] is not None and _haversine_km(loc[0], loc[1], zone["lat"], zone["lng"]) <= radius:
                out.append(uid)
        return out

    return []


async def dispatch_broadcast(bid: str) -> int:
    """Send a broadcast to its resolved audience. Returns the number sent."""
    b = await db.notif_broadcasts.find_one({"id": bid}, {"_id": 0})
    if not b:
        return 0
    recipients = await resolve_audience(b)
    from core.notifications import create_notification
    data = {"kind": "admin_broadcast", "broadcast_id": bid}
    if b.get("url"):
        data["url"] = b["url"]
    sent = 0
    for uid in recipients:
        try:
            await create_notification(uid, "announcement", b["title"], b["body"], data=dict(data))
            sent += 1
        except Exception:
            pass
    now = datetime.now(timezone.utc).isoformat()
    await db.notif_broadcasts.update_one(
        {"id": bid}, {"$set": {"status": "sent", "last_sent_at": now, "sent_count": sent}})
    return sent


async def run_due_scheduled_broadcasts() -> int:
    """Dispatch every scheduled broadcast whose schedule_at is now due. Idempotent
    via the status flip to 'sent'. Returns the count of broadcasts dispatched."""
    now_iso = datetime.now(timezone.utc).isoformat()
    due = await db.notif_broadcasts.find(
        {"status": "scheduled", "schedule_at": {"$ne": None, "$lte": now_iso}},
        {"_id": 0, "id": 1},
    ).to_list(100)
    n = 0
    for d in due:
        # Atomically claim it (avoid a double-send if the loop overlaps).
        claimed = await db.notif_broadcasts.find_one_and_update(
            {"id": d["id"], "status": "scheduled"},
            {"$set": {"status": "sending"}},
        )
        if not claimed:
            continue
        try:
            await dispatch_broadcast(d["id"])
            n += 1
        except Exception as e:  # pragma: no cover
            logger.warning(f"broadcast dispatch failed {d['id']}: {e}")
            await db.notif_broadcasts.update_one({"id": d["id"]}, {"$set": {"status": "scheduled"}})
    return n


async def broadcast_scheduler_loop():
    """Background loop: dispatch due scheduled broadcasts every 60s."""
    while True:
        try:
            await run_due_scheduled_broadcasts()
        except Exception as e:  # pragma: no cover
            logger.warning(f"broadcast_scheduler_loop error: {e}")
        await asyncio.sleep(60)
