"""Driver online-session tracking (for activity reports).

`driver_shifts` is unused in practice — drivers go online via the simple
`toggle-online` flag, which keeps no history. This module logs open/close
online sessions so the admin can report time-online over a period. Data accrues
from the moment this is wired in (no retro-history).
"""
import uuid
from datetime import datetime, timezone

from core.config import db


def _now_iso():
    return datetime.now(timezone.utc).isoformat()


def _parse(s):
    try:
        d = datetime.fromisoformat(str(s).replace("Z", "+00:00"))
        return d if d.tzinfo else d.replace(tzinfo=timezone.utc)
    except (ValueError, TypeError):
        return None


async def mark_online(user_id: str):
    if not user_id:
        return
    open_s = await db.driver_online_sessions.find_one(
        {"driver_user_id": user_id, "offline_at": None}, {"_id": 1})
    if open_s:
        return  # already online
    await db.driver_online_sessions.insert_one({
        "id": f"onl_{uuid.uuid4().hex[:12]}",
        "driver_user_id": user_id,
        "online_at": _now_iso(),
        "offline_at": None,
    })


async def mark_offline(user_id: str):
    if not user_id:
        return
    open_s = await db.driver_online_sessions.find_one(
        {"driver_user_id": user_id, "offline_at": None})
    if not open_s:
        return
    now = datetime.now(timezone.utc)
    start = _parse(open_s.get("online_at")) or now
    minutes = round(max(0.0, (now - start).total_seconds() / 60), 1)
    await db.driver_online_sessions.update_one(
        {"_id": open_s["_id"]},
        {"$set": {"offline_at": now.isoformat(), "minutes": minutes}})


async def online_minutes_by_driver(start_iso: str, end_iso: str) -> dict:
    """Sum online minutes per driver_user_id for sessions overlapping the period."""
    start = _parse(start_iso)
    end = _parse(end_iso) or datetime.now(timezone.utc)
    now = datetime.now(timezone.utc)
    # Sessions that started before period end and ended after period start (or open).
    cur = db.driver_online_sessions.find(
        {"online_at": {"$lte": end_iso}}, {"_id": 0, "driver_user_id": 1, "online_at": 1, "offline_at": 1})
    out = {}
    async for s in cur:
        s_on = _parse(s.get("online_at"))
        s_off = _parse(s.get("offline_at")) or now
        if not s_on:
            continue
        lo = max(s_on, start) if start else s_on
        hi = min(s_off, end)
        if hi <= lo:
            continue
        out[s["driver_user_id"]] = out.get(s["driver_user_id"], 0.0) + (hi - lo).total_seconds() / 60
    return {k: round(v, 1) for k, v in out.items()}
