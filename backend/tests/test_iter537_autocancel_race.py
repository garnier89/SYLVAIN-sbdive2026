"""Regression — auto-dispatch must NEVER cancel a ride that a driver already
accepted (race between the 5s dispatch loop snapshot and a /accept call).

Bug (iter 537): _auto_cancel_ride did an unconditional
`update_one({"id": ...}, {status: cancelled})`, clobbering an 'accepted' ride.
Fix: atomic compare-and-set on `status == "pending"`.
"""
import uuid
from datetime import datetime, timezone

from conftest import run_async
from core.config import db
from routes.auto_dispatch import _auto_cancel_ride


def test_autocancel_skips_accepted_ride():
    rid = "test_" + uuid.uuid4().hex
    ride = {
        "id": rid, "status": "accepted", "user_id": "u1", "driver_id": "d1",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    async def _run():
        await db.rides.insert_one(dict(ride))
        try:
            # Loop still holds the OLD pending snapshot of this ride.
            await _auto_cancel_ride({**ride, "status": "pending"})
            after = await db.rides.find_one({"id": rid}, {"_id": 0, "status": 1})
            return after["status"]
        finally:
            await db.rides.delete_one({"id": rid})

    assert run_async(_run()) == "accepted"  # NOT clobbered


def test_autocancel_cancels_still_pending_ride():
    rid = "test_" + uuid.uuid4().hex
    ride = {
        "id": rid, "status": "pending", "user_id": "u2",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    async def _run():
        await db.rides.insert_one(dict(ride))
        try:
            await _auto_cancel_ride(ride)
            return await db.rides.find_one({"id": rid}, {"_id": 0, "status": 1, "cancelled_by": 1})
        finally:
            await db.rides.delete_one({"id": rid})

    after = run_async(_run())
    assert after["status"] == "cancelled"
    assert after["cancelled_by"] == "auto_dispatch"
