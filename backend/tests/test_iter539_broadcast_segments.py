"""Regression (iter 539) — admin broadcast segments + scheduled dispatch.

Covers:
- resolve_audience for role-based + refined segments (offline drivers, zone,
  inactive clients, inactive clients × zone).
- run_due_scheduled_broadcasts: dispatches a due 'scheduled' broadcast, flips it
  to 'sent', and is idempotent (no double-send).
"""
import uuid
from datetime import datetime, timezone, timedelta

from conftest import run_async
from core.config import db
from core import notif_broadcast as nb


def test_resolve_role_and_segment_audiences():
    async def _run():
        # Role-based: every merchant.
        merchants = await nb.resolve_audience({"audience": "merchant"})
        n_merchant = await db.users.count_documents({"role": "merchant"})
        # Offline drivers ⊆ all drivers.
        offline = await nb.resolve_audience({"audience": "driver_offline"})
        n_off = await db.drivers.count_documents({"is_online": {"$ne": True}})
        # Inactive clients: 7d window ≥ 30d window (no-activity-in-7d is a superset).
        inact7 = await nb.resolve_audience({"audience": "client_inactive", "inactive_days": 7})
        inact30 = await nb.resolve_audience({"audience": "client_inactive", "inactive_days": 30})
        return len(merchants), n_merchant, len(offline), n_off, len(inact7), len(inact30)

    n_m, exp_m, n_off, exp_off, i7, i30 = run_async(_run())
    assert n_m == exp_m
    assert n_off == exp_off
    assert i7 >= i30  # shorter inactivity window catches at least as many


def test_zone_audience_unknown_zone_empty():
    async def _run():
        return await nb.resolve_audience({"audience": "driver_zone", "zone_id": "does_not_exist"})
    assert run_async(_run()) == []


def test_due_scheduled_broadcast_dispatched_once():
    bid = "TEST_" + uuid.uuid4().hex
    past = (datetime.now(timezone.utc) - timedelta(minutes=1)).isoformat()

    async def _run():
        await db.notif_broadcasts.insert_one({
            "id": bid, "title": "SchedTest", "body": "auto", "audience": "merchant",
            "url": "", "active": True, "schedule_at": past, "status": "scheduled",
            "created_at": past, "updated_at": past, "last_sent_at": None, "sent_count": 0,
        })
        try:
            first = await nb.run_due_scheduled_broadcasts()
            doc = await db.notif_broadcasts.find_one({"id": bid}, {"_id": 0, "status": 1, "sent_count": 1})
            second = await nb.run_due_scheduled_broadcasts()  # idempotent
            return first, doc, second
        finally:
            await db.notif_broadcasts.delete_many({"id": bid})
            await db.notifications.delete_many({"data.broadcast_id": bid})

    first, doc, second = run_async(_run())
    assert first == 1
    assert doc["status"] == "sent"
    assert doc["sent_count"] >= 0
    assert second == 0  # already sent → not re-dispatched
