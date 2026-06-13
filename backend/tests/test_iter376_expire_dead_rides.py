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
        future = (now + timedelta(days=2)).isoformat()
        # Scheduled: 60-min grace after pickup time
        sched_within_grace = (now - timedelta(minutes=30)).isoformat()   # late but kept
        sched_past_grace = (now - timedelta(minutes=90)).isoformat()     # erased
        # Immediate: 10-min window
        imm_fresh = (now - timedelta(minutes=5)).isoformat()             # kept
        imm_stale = (now - timedelta(minutes=15)).isoformat()           # erased
        pfx = f"t376_{uuid.uuid4().hex[:6]}"
        docs = [
            {"id": f"{pfx}_sched_grace", "status": "pending", "driver_id": None, "scheduled_at": sched_within_grace, "created_at": sched_within_grace, "mode": "scheduled"},
            {"id": f"{pfx}_sched_dead", "status": "pending", "driver_id": None, "scheduled_at": sched_past_grace, "created_at": sched_past_grace, "mode": "scheduled"},
            {"id": f"{pfx}_future_sched", "status": "pending", "driver_id": None, "scheduled_at": future, "created_at": iso, "mode": "scheduled"},
            {"id": f"{pfx}_imm_fresh", "status": "pending", "driver_id": None, "scheduled_at": None, "created_at": imm_fresh, "mode": "normal"},
            {"id": f"{pfx}_imm_stale", "status": "pending", "driver_id": None, "scheduled_at": None, "created_at": imm_stale, "mode": "normal"},
            {"id": f"{pfx}_bid_stale", "status": "pending", "driver_id": None, "scheduled_at": None, "created_at": imm_stale, "mode": "bidding"},
            # already-assigned ride must never be touched
            {"id": f"{pfx}_assigned", "status": "accepted", "driver_id": "drv_x", "scheduled_at": sched_past_grace, "created_at": sched_past_grace, "mode": "scheduled"},
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
            # erased
            assert got[f"{pfx}_sched_dead"] == "expired", "reservation >60min late must expire"
            assert got[f"{pfx}_imm_stale"] == "expired", "immediate >10min must expire"
            assert got[f"{pfx}_bid_stale"] == "expired", "bid >10min must expire"
            # kept
            assert got[f"{pfx}_sched_grace"] == "pending", "reservation within 60-min grace stays (late driver)"
            assert got[f"{pfx}_future_sched"] == "pending", "future reservation stays available"
            assert got[f"{pfx}_imm_fresh"] == "pending", "fresh request (<10min) stays available"
            assert got[f"{pfx}_assigned"] == "accepted", "assigned ride must never be expired"
        finally:
            await db.rides.delete_many({"id": {"$in": ids}})

    _run(run())


if __name__ == "__main__":
    test_expire_dead_pending_rides()
    print("EXPIRE-DEAD-RIDES TEST PASSED")
