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
import os
from datetime import datetime, timezone, timedelta

import httpx

from core.config import db

logger = logging.getLogger("airport")

DEFAULT_FREE_WAIT_MIN = 45
DEFAULT_LUGGAGE_FEE = 5.0
DEFAULT_SHUTTLE_DISCOUNT_PCT = 30.0
DEFAULT_WAIT_RATE_PER_MIN = 0.5
FLIGHT_WATCH_INTERVAL_SEC = 120

# AviationStack (real flight data) — free tier: HTTP only, 100 req/month.
AVIATIONSTACK_KEY = os.environ.get("AVIATIONSTACK_API_KEY", "")
AVIATIONSTACK_URL = "https://api.aviationstack.com/v1/flights"
FLIGHT_CACHE_TTL_SEC = 600  # 10 min cache per flight to spare the monthly quota
FLIGHT_FAIL_TTL_SEC = 300   # back off real calls for 5 min after a failure (slow/unreachable)
_flight_cache: dict[str, tuple[float, dict]] = {}  # flight_number -> (expires_at, status)
_flight_fail_until: dict[str, float] = {}  # flight_number -> retry-after timestamp


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
# Référentiel par défaut (Antilles-Guyane + Paris) pour le mode « Transfert
# aéroport ». Seed idempotent au démarrage : seuls les codes manquants sont créés.
DEFAULT_AIRPORT_ZONES = [
    {"code": "FDF", "name": "Aéroport Martinique Aimé Césaire", "lat": 14.591, "lng": -61.003, "radius_km": 4,
     "meeting_point": "Terminal Arrivées, niveau 0, sortie B"},
    {"code": "PTP", "name": "Aéroport Pointe-à-Pitre Le Raizet", "lat": 16.2653, "lng": -61.5314, "radius_km": 4,
     "meeting_point": "Hall Arrivées, niveau RDC, sortie principale"},
    {"code": "CAY", "name": "Aéroport Cayenne Félix Éboué", "lat": 4.8198, "lng": -52.3604, "radius_km": 4,
     "meeting_point": "Hall Arrivées, sortie principale"},
    {"code": "SXM", "name": "Aéroport de Grand-Case Espérance", "lat": 18.0999, "lng": -63.0472, "radius_km": 3,
     "meeting_point": "Terminal Arrivées, sortie principale"},
    {"code": "ORY", "name": "Paris-Orly", "lat": 48.7262, "lng": 2.3652, "radius_km": 5,
     "meeting_point": "Orly 4, Niveau Arrivées, Porte A"},
    {"code": "CDG", "name": "Paris-Charles de Gaulle", "lat": 49.0097, "lng": 2.5479, "radius_km": 6,
     "meeting_point": "Terminal 2E, Porte 5, Niveau Arrivées"},
]


async def seed_airport_zones():
    """Idempotent : crée les zones aéroport par défaut manquantes (par code)."""
    import uuid
    created = []
    for a in DEFAULT_AIRPORT_ZONES:
        if await db.airport_zones.find_one({"code": a["code"]}):
            continue
        await db.airport_zones.insert_one({
            "id": f"az_{uuid.uuid4().hex[:10]}", **a,
            "free_wait_minutes": DEFAULT_FREE_WAIT_MIN, "luggage_fee": DEFAULT_LUGGAGE_FEE,
            "shuttle_discount_pct": DEFAULT_SHUTTLE_DISCOUNT_PCT, "waiting_rate_per_min": DEFAULT_WAIT_RATE_PER_MIN,
            "surcharge_amount": 0.0, "active": True,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        created.append(a["code"])
    if created:
        logger.info("Airport zones seeded: %s", ", ".join(created))
    return created


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


def _parse_iso(s):
    if not s:
        return None
    try:
        return datetime.fromisoformat(str(s).replace("Z", "+00:00"))
    except (ValueError, TypeError):
        return None


def _map_aviationstack(record: dict, flight_number: str, scheduled_at=None, now=None):
    """Map an AviationStack /v1/flights record into our normalised status shape."""
    now = now or datetime.now(timezone.utc)
    raw = (record.get("flight_status") or "").lower()
    arr = record.get("arrival") or {}
    delay = arr.get("delay")
    try:
        delay = int(delay) if delay is not None else None
    except (ValueError, TypeError):
        delay = None
    sched = _parse_iso(arr.get("scheduled"))
    ref = _parse_iso(arr.get("actual")) or _parse_iso(arr.get("estimated"))
    if delay is None and sched and ref:
        delay = int((ref - sched).total_seconds() / 60)

    if raw == "cancelled":
        status, delay_minutes = "cancelled", 0
    elif delay is not None and delay >= 10:
        status, delay_minutes = "delayed", delay
    elif delay is not None and delay <= -10:
        status, delay_minutes = "early", delay
    else:
        status, delay_minutes = "on_time", (delay or 0)

    out = {
        "flight_number": flight_number,
        "status": status,
        "delay_minutes": delay_minutes,
        "checked_at": now.isoformat(),
        "simulated": False,
        "source": "aviationstack",
    }
    if scheduled_at and status in ("delayed", "early"):
        base = _parse_iso(scheduled_at)
        if base:
            if base.tzinfo is None:
                base = base.replace(tzinfo=timezone.utc)
            out["adjusted_pickup"] = (base + timedelta(minutes=delay_minutes)).isoformat()
    return out


async def fetch_aviationstack(flight_number, scheduled_at=None):
    """Query AviationStack for a real flight status. Returns mapped dict or None on any failure."""
    if not AVIATIONSTACK_KEY:
        return None
    fn = (flight_number or "").strip().upper()
    if not fn:
        return None
    params = {"access_key": AVIATIONSTACK_KEY, "flight_iata": fn, "limit": 1}
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(6.0, connect=4.0)) as client:
            r = await client.get(AVIATIONSTACK_URL, params=params)
        if r.status_code != 200:
            logger.info("aviationstack non-200 for %s: %s", fn, r.status_code)
            return None
        payload = r.json()
        if isinstance(payload, dict) and payload.get("error"):
            logger.info("aviationstack error for %s: %s", fn, payload.get("error"))
            return None
        data = (payload or {}).get("data") or []
        if not data:
            return None
        return _map_aviationstack(data[0], fn, scheduled_at)
    except Exception:
        logger.warning("aviationstack call failed for %s", fn, exc_info=True)
        return None


async def get_flight_status(flight_number, scheduled_at=None):
    """Real flight status via AviationStack (cached 10 min) with fallback to simulation.

    Always returns the same shape as `simulate_flight_status`.
    """
    fn = (flight_number or "").strip().upper()
    if not fn:
        return None
    import time as _time
    cached = _flight_cache.get(fn)
    if cached and cached[0] > _time.time():
        base = dict(cached[1])
        # Recompute adjusted_pickup against THIS ride's scheduled_at.
        if scheduled_at and base.get("status") in ("delayed", "early"):
            sa = _parse_iso(scheduled_at)
            if sa:
                if sa.tzinfo is None:
                    sa = sa.replace(tzinfo=timezone.utc)
                base["adjusted_pickup"] = (sa + timedelta(minutes=base.get("delay_minutes", 0))).isoformat()
        return base
    # Skip the (slow) real call if it recently failed/was unreachable for this flight.
    if _flight_fail_until.get(fn, 0) > _time.time():
        return simulate_flight_status(fn, scheduled_at)
    real = await fetch_aviationstack(fn, scheduled_at)
    if real:
        _flight_cache[fn] = (_time.time() + FLIGHT_CACHE_TTL_SEC, real)
        return real
    # Fallback: deterministic simulation (no API / quota / not found). Back off real retries.
    _flight_fail_until[fn] = _time.time() + FLIGHT_FAIL_TTL_SEC
    return simulate_flight_status(fn, scheduled_at)


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
        return ("✈️ Vol annulé", f"Le vol {fn} est annulé. Reportez votre course pour garder votre réservation et votre chauffeur.")
    return ("✈️ Vol à l'heure", f"Le vol {fn} est à l'heure.")


async def _notify_flight_change(ride: dict, status_doc: dict):
    from core.notifications import create_notification
    title, body = _flight_message(status_doc)
    # Cancelled flights deep-link to the scheduled rides list where the client can
    # tap "Reporter ma course" to reschedule instead of losing the booking.
    url = "/scheduled-rides" if status_doc.get("status") == "cancelled" else f"/ride/{ride['id']}"
    data = {"url": url, "ride_id": ride["id"], "flight_status": status_doc}
    # Client
    await create_notification(ride.get("user_id"), "flight_watch", title, body, data=data)
    # Driver (if assigned)
    if ride.get("driver_id"):
        drv = await db.drivers.find_one({"id": ride["driver_id"]}, {"_id": 0, "user_id": 1})
        if drv and drv.get("user_id"):
            await create_notification(drv["user_id"], "flight_watch", title, body, data=data)


async def refresh_flight_for_ride(ride: dict) -> dict | None:
    """Re-evaluate a ride's flight, persist + notify on change. Returns the new status."""
    new = await get_flight_status(ride.get("flight_number"), ride.get("scheduled_at"))
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
        # Alert dispatchers/admins specifically for disruptive changes.
        if new["status"] in ("delayed", "cancelled"):
            title, body = _flight_message(new)
            await notify_admins(
                "flight_watch_admin", f"⚠️ {title}",
                f"Course aéroport #{ride.get('booking_no', '')} · {body}",
                data={"url": "/admin/airport", "ride_id": ride["id"], "flight_status": new},
            )
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
