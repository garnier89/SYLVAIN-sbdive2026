"""Iter 376 — Dead-ride expiry: stale reservations/rides/bids are erased.

Bug fix: the driver "Mes réservations" list kept showing reservations whose
pickup time had passed (and abandoned immediate requests), which then errored
with "Course déjà prise ou indisponible". `_expire_dead_pending_rides` now marks
them `expired` so they vanish from every driver list.
"""
import asyncio
import uuid
from datetime import datetime, timezone, timedelta

from core.config import db
from routes.rides import _expire_dead_pending_rides


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


def test_expire_dead_pending_rides():
    async def run():
        now = datetime.now(timezone.utc)
        iso = now.isoformat()
        past = (now - timedelta(days=1)).isoformat()
        future = (now + timedelta(days=2)).isoformat()
        old_immediate = (now - timedelta(hours=5)).isoformat()
        fresh = (now - timedelta(minutes=5)).isoformat()
        pfx = f"t376_{uuid.uuid4().hex[:6]}"
        docs = [
            {"id": f"{pfx}_past_sched", "status": "pending", "driver_id": None, "scheduled_at": past, "created_at": past, "mode": "normal"},
            {"id": f"{pfx}_future_sched", "status": "pending", "driver_id": None, "scheduled_at": future, "created_at": iso, "mode": "normal"},
            {"id": f"{pfx}_old_imm", "status": "pending", "driver_id": None, "scheduled_at": None, "created_at": old_immediate, "mode": "normal"},
            {"id": f"{pfx}_fresh_imm", "status": "pending", "driver_id": None, "scheduled_at": None, "created_at": fresh, "mode": "normal"},
            {"id": f"{pfx}_old_bid", "status": "pending", "driver_id": None, "scheduled_at": None, "created_at": old_immediate, "mode": "bidding"},
            # already-assigned ride must never be touched
            {"id": f"{pfx}_assigned", "status": "accepted", "driver_id": "drv_x", "scheduled_at": past, "created_at": past, "mode": "normal"},
        ]
        ids = [d["id"] for d in docs]
        await db.rides.delete_many({"id": {"$in": ids}})
        await db.rides.insert_many([dict(d) for d in docs])
        try:
            await _expire_dead_pending_rides()
            got = {}
            for i in ids:
                r = await db.rides.find_one({"id": i}, {"_id": 0, "status": 1})
                got[i] = r["status"]
            assert got[f"{pfx}_past_sched"] == "expired"
            assert got[f"{pfx}_old_imm"] == "expired"
            assert got[f"{pfx}_old_bid"] == "expired"
            assert got[f"{pfx}_future_sched"] == "pending", "future reservation must stay available"
            assert got[f"{pfx}_fresh_imm"] == "pending", "fresh request must stay available"
            assert got[f"{pfx}_assigned"] == "accepted", "assigned ride must never be expired"
        finally:
            await db.rides.delete_many({"id": {"$in": ids}})

    _run(run())


if __name__ == "__main__":
    test_expire_dead_pending_rides()
    print("EXPIRE-DEAD-RIDES TEST PASSED")
