"""Zone driver-shortage alerts & temporary driver bonuses.

When too many rides in a pickup zone end with no driver (converted to bidding or
rescheduled) within a rolling window, raise an admin alert and — optionally —
declare a temporary driver bonus to rebalance supply. Admin-configurable via
service_configs key 'no_driver_alerts'.
"""
import uuid
from datetime import datetime, timezone, timedelta

from core.config import db
from core.websocket import manager

_ZONE_TOKENS = [
    ("martinique", "Martinique"), ("fort-de-france", "Martinique"),
    ("guadeloupe", "Guadeloupe"), ("pointe-a-pitre", "Guadeloupe"),
    ("guyane", "Guyane"), ("reunion", "Reunion"),
    ("paris", "Paris"), ("lyon", "Lyon"), ("marseille", "Marseille"),
]


def infer_zone(addr: str) -> str:
    if not addr:
        return "Inconnue"
    low = addr.lower()
    for token, label in _ZONE_TOKENS:
        if token in low:
            return label
    parts = [p.strip() for p in addr.split(",") if p.strip()]
    return parts[-1][:30] if parts else "Inconnue"


def _as_bool(v, default=True):
    if isinstance(v, bool):
        return v
    if isinstance(v, str):
        return v.strip().lower() in ("true", "1", "yes", "oui", "on")
    return default


async def get_alert_cfg() -> dict:
    doc = await db.service_configs.find_one({"service_key": "no_driver_alerts"}, {"_id": 0})
    s = (doc or {}).get("settings", {}) or {}

    def num(key, default, lo, hi):
        try:
            return min(hi, max(lo, int(s.get(key, default))))
        except (TypeError, ValueError):
            return default

    return {
        "enabled": _as_bool(s.get("enabled", True), True),
        "zone_threshold": num("zone_threshold", 3, 1, 100),
        "window_minutes": num("window_minutes", 60, 5, 1440),
        "auto_bonus_enabled": _as_bool(s.get("auto_bonus_enabled", False), False),
        "bonus_amount": num("bonus_amount", 5, 0, 1000),
        "bonus_duration_minutes": num("bonus_duration_minutes", 60, 5, 1440),
    }


async def maybe_create_zone_alert(pickup_address: str, outcome: str) -> None:
    """Called after a ride records a no-driver outcome; raises an alert when a
    zone crosses the configured threshold within the rolling window."""
    cfg = await get_alert_cfg()
    if not cfg["enabled"]:
        return
    zone = infer_zone(pickup_address)
    now = datetime.now(timezone.utc)
    since = (now - timedelta(minutes=cfg["window_minutes"])).isoformat()

    recent = await db.rides.find(
        {"no_driver_at": {"$gte": since}, "no_driver_outcome": {"$in": ["bidding", "scheduled"]}},
        {"_id": 0, "pickup_address": 1},
    ).to_list(2000)
    count = sum(1 for r in recent if infer_zone(r.get("pickup_address")) == zone)
    if count < cfg["zone_threshold"]:
        return

    existing = await db.zone_alerts.find_one({"zone": zone, "status": "active"}, {"_id": 0})
    if existing:
        await db.zone_alerts.update_one(
            {"id": existing["id"]},
            {"$set": {"count": count, "last_seen_at": now.isoformat()}},
        )
        return

    alert = {
        "id": f"zalert_{uuid.uuid4().hex[:10]}",
        "zone": zone,
        "count": count,
        "threshold": cfg["zone_threshold"],
        "window_minutes": cfg["window_minutes"],
        "status": "active",
        "created_at": now.isoformat(),
        "last_seen_at": now.isoformat(),
        "bonus_amount": 0,
        "bonus_active_until": None,
    }
    if cfg["auto_bonus_enabled"] and cfg["bonus_amount"] > 0:
        alert["bonus_amount"] = cfg["bonus_amount"]
        alert["bonus_active_until"] = (now + timedelta(minutes=cfg["bonus_duration_minutes"])).isoformat()
    await db.zone_alerts.insert_one(dict(alert))

    try:
        await manager.broadcast_to_admins({
            "type": "zone_no_driver_alert",
            "zone": alert["zone"],
            "count": alert["count"],
            "threshold": alert["threshold"],
            "bonus_amount": alert["bonus_amount"],
            "bonus_active_until": alert["bonus_active_until"],
        })
    except Exception:
        pass
