"""Favorite drivers — shared helpers for preferential dispatch.

A customer can favorite up to 2 drivers (enforced in routes/phase1.py). When a
ride or delivery is created and a favorite driver is online, the request is
offered EXCLUSIVELY to the favorite(s) for a short, admin-configurable head-start
window before being broadcast to all nearby drivers.

Favorites reference `db.drivers.id` (shared by taxi + delivery couriers).
"""
from core.config import db


async def get_favorite_head_start_seconds() -> int:
    """Admin-configurable exclusivity window (seconds, clamped 0..60). 0 disables."""
    doc = await db.service_configs.find_one({"service_key": "auto_dispatch"}, {"_id": 0, "settings": 1})
    settings = (doc or {}).get("settings") or {}
    try:
        return max(0, min(60, int(settings.get("favorite_head_start_seconds", 20))))
    except (TypeError, ValueError):
        return 20


async def online_favorite_drivers(user_id: str) -> list:
    """Return [{driver_id, driver_user_id}] for this customer's favorites that are
    currently approved & online (eligible to receive an exclusive offer)."""
    favs = await db.favorite_drivers.find({"user_id": user_id}, {"_id": 0, "driver_id": 1}).to_list(10)
    out = []
    for f in favs:
        d = await db.drivers.find_one(
            {"id": f["driver_id"], "status": "approved", "is_online": True},
            {"_id": 0, "id": 1, "user_id": 1},
        )
        if d:
            out.append({"driver_id": d["id"], "driver_user_id": d["user_id"]})
    return out
