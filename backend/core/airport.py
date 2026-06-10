"""Airport Transfer module — Flight Watch (simulated), free-wait config,
luggage assistance & shared-shuttle pricing, admin alerts.

Airports are stored in `db.airport_zones` (admin-managed, shared with the legacy
surcharge config). Each airport can define:
  - meeting_point        : terminal meeting-point text sent to the client/driver
  - free_wait_minutes    : free waiting time after the driver arrives (default 45)
  - luggage_fee          : flat fee added when the client requests luggage help
  - shuttle_discount_pct : discount applied when the client opts for a shared shuttle
  - waiting_rate_per_min : per-minute fee charged past the free-wait window
"""
import asyncio
import hashlib
import logging
import math
from datetime import datetime, timezone, timedelta

from core.config import db

logger = logging.getLogger("airport")

DEFAULT_FREE_WAIT_MIN = 45
DEFAULT_LUGGAGE_FEE = 5.0
DEFAULT_SHUTTLE_DISCOUNT_PCT = 30.0
DEFAULT_WAIT_RATE_PER_MIN = 0.5
FLIGHT_WATCH_INTERVAL_SEC = 120


def _haversine_km(lat1, lng1, lat2, lng2):
    if None in (lat1, lng1, lat2, lng2):
        return 1e9
    R = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlmb = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlmb / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


# ── Airport directory (admin-managed) ───────────────────────────────────
async def list_airports(active_only=True):
    q = {"active": True} if active_only else {}
    return await db.airport_zones.find(q, {"_id": 0}).to_list(100)


async def get_airport(airport_id):
    if not airport_id:
        return None
    return await db.airport_zones.find_one({"id": airport_id}, {"_id": 0})


async def match_airport(p_lat, p_lng, d_lat, d_lng):
    """Return the airport zone whose radius contains the pickup OR the dropoff."""
    zones = await db.airport_zones.find({"active": True}, {"_id": 0}).to_list(100)
    best, best_d = None, 1e9
    for z in zones:
        r = z.get("radius_km", 3) or 3
        dp = _haversine_km(p_lat, p_lng, z.get("lat"), z.get("lng"))
        dd = _haversine_km(d_lat, d_lng, z.get("lat"), z.get("lng"))
        m = min(dp, dd)
        if m <= r and m < best_d:
            best, best_d = z, m
    return best


def airport_meta(airport: dict | None) -> dict:
    """Normalised airport options (filled with defaults)."""
    a = airport or {}
    return {
        "airport_id": a.get("id"),
        "airport_name": a.get("name"),
        "meeting_point": a.get("meeting_point") or "Hall des arrivées, niveau 0",
        "free_wait_minutes": int(a.get("free_wait_minutes", DEFAULT_FREE_WAIT_MIN) or DEFAULT_FREE_WAIT_MIN),
        "luggage_fee": float(a.get("luggage_fee", DEFAULT_LUGGAGE_FEE) or 0),
        "shuttle_discount_pct": float(a.get("shuttle_discount_pct", DEFAULT_SHUTTLE_DISCOUNT_PCT) or 0),
        "waiting_rate_per_min": float(a.get("waiting_rate_per_min", DEFAULT_WAIT_RATE_PER_MIN) or 0),
    }


def apply_airport_options(fare: float, luggage_assist: bool, shared_shuttle: bool, meta: dict):
    """Add luggage fee then apply shuttle discount. Returns (fare, luggage_fee, shuttle_discount)."""
    luggage_fee = round(meta["luggage_fee"], 2) if luggage_assist else 0.0
    new_fare = round(fare + luggage_fee, 2)
    shuttle_discount = 0.0
    if shared_shuttle and meta["shuttle_discount_pct"] > 0:
        shuttle_discount = round(new_fare * meta["shuttle_discount_pct"] / 100, 2)
        new_fare = round(max(new_fare - shuttle_discount, 0), 2)
    return new_fare, luggage_fee, shuttle_discount


# ── Flight Watch (SIMULATED) ─────────────────────────────────────────────
def simulate_flight_status(flight_number, scheduled_at=None, now=None):
    """Deterministic simulated flight status (stable across polls per flight).

    Distribution by flight number: ~70% on_time, 20% delayed, 7% early, 3% cancelled.
    When delayed/early and a scheduled pickup is provided, returns `adjusted_pickup`.
    """
    fn = (flight_number or "").strip().upper()
    if not fn:
        return None
    now = now or datetime.now(timezone.utc)
    seed = int(hashlib.sha256(fn.encode()).hexdigest(), 16)
    bucket = seed % 100
    if bucket < 70:
        status, delay = "on_time", 0
    elif bucket < 90:
        status, delay = "delayed", 15 + (seed % 4) * 15   # 15/30/45/60 min
    elif bucket < 97:
        status, delay = "early", -(10 + (seed % 3) * 5)    # 10/15/20 min early
    else:
        status, delay = "cancelled", 0
    out = {
        "flight_number": fn,
        "status": status,
        "delay_minutes": delay,
        "checked_at": now.isoformat(),
        "simulated": True,
    }
    if scheduled_at and status in ("delayed", "early"):
        try:
            base = datetime.fromisoformat(str(scheduled_at).replace("Z", "+00:00"))
            if base.tzinfo is None:
                base = base.replace(tzinfo=timezone.utc)
            out["adjusted_pickup"] = (base + timedelta(minutes=delay)).isoformat()
        except (ValueError, TypeError):
            pass
    return out


def _flight_message(status_doc: dict):
    """(title, body) localised FR for a flight status change."""
    fn = status_doc.get("flight_number", "")
    d = status_doc.get("delay_minutes", 0)
    s = status_doc.get("status")
    if s == "delayed":
        return ("✈️ Vol retardé", f"Le vol {fn} a {d} min de retard — l'heure de prise en charge a été ajustée automatiquement.")
    if s == "early":
        return ("✈️ Vol en avance", f"Le vol {fn} est en avance de {abs(d)} min — l'heure de prise en charge a été avancée.")
    if s == "cancelled":
        return ("✈️ Vol annulé", f"Le vol {fn} est annulé. Vérifiez votre réservation ou annulez la course.")
    return ("✈️ Vol à l'heure", f"Le vol {fn} est à l'heure.")


async def _notify_flight_change(ride: dict, status_doc: dict):
    from core.notifications import create_notification
    title, body = _flight_message(status_doc)
    data = {"url": f"/ride/{ride['id']}", "ride_id": ride["id"], "flight_status": status_doc}
    # Client
    await create_notification(ride.get("user_id"), "flight_watch", title, body, data=data)
    # Driver (if assigned)
    if ride.get("driver_id"):
        drv = await db.drivers.find_one({"id": ride["driver_id"]}, {"_id": 0, "user_id": 1})
        if drv and drv.get("user_id"):
            await create_notification(drv["user_id"], "flight_watch", title, body, data=data)


async def refresh_flight_for_ride(ride: dict) -> dict | None:
    """Re-evaluate a ride's flight, persist + notify on change. Returns the new status."""
    new = simulate_flight_status(ride.get("flight_number"), ride.get("scheduled_at"))
    if not new:
        return None
    old = ride.get("flight_status") or {}
    changed = (old.get("status") != new["status"]) or (old.get("delay_minutes") != new["delay_minutes"])
    updates = {"flight_status": new}
    if new.get("adjusted_pickup"):
        updates["scheduled_at"] = new["adjusted_pickup"]
    await db.rides.update_one({"id": ride["id"]}, {"$set": updates})
    if changed:
        await _notify_flight_change(ride, new)
    return new


async def _run_flight_watch_once():
    cursor = db.rides.find({
        "ride_type": "airport",
        "flight_number": {"$nin": [None, ""]},
        "status": {"$in": ["pending", "accepted", "arriving"]},
    }, {"_id": 0})
    async for ride in cursor:
        try:
            await refresh_flight_for_ride(ride)
        except Exception:
            logger.warning("flight watch failed for ride %s", ride.get("id"), exc_info=True)


async def flight_watch_loop():
    """Background loop: keep airport rides' flight status synced (simulated)."""
    while True:
        try:
            await _run_flight_watch_once()
        except Exception:
            logger.warning("flight_watch_loop iteration failed", exc_info=True)
        await asyncio.sleep(FLIGHT_WATCH_INTERVAL_SEC)


async def notify_admins(ntype: str, title: str, body: str, data: dict | None = None):
    """Send an in-app + push notification to every admin user."""
    from core.notifications import create_notification
    admins = await db.users.find({"role": "admin"}, {"_id": 0, "id": 1}).to_list(200)
    for a in admins:
        await create_notification(a["id"], ntype, title, body, data=data or {})
