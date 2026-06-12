"""Iter 330 — Anti-disintermediation ("course au black") controls.

- Client phone is masked for scheduled rides until near pickup.
- accept->release on a scheduled ride escalates the penalty and suspends the
  driver from scheduled rides past a threshold.
- The driver-behavior dashboard surfaces the scheduled suspension.

Run from /app/backend:  python -m pytest tests/test_iter330_antifraud.py -v
"""
import os
import sys
import uuid
import asyncio
from datetime import datetime, timezone, timedelta

import requests

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

API = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001").rstrip("/") + "/api"
ADMIN = {"email": "admin@superapp.com", "password": "SuperAdmin123!"}

# One persistent loop shared across all async tests so Motor binds to it once.
_loop = asyncio.new_event_loop()
asyncio.set_event_loop(_loop)


def _run(coro):
    return _loop.run_until_complete(coro)


def _now():
    return datetime.now(timezone.utc)


def test_phone_reveal_gate():
    from routes.rides import _client_phone_revealed
    far = (_now() + timedelta(hours=5)).isoformat()
    near = (_now() + timedelta(minutes=10)).isoformat()
    assert _client_phone_revealed({"status": "accepted"}) is True
    assert _client_phone_revealed({"status": "accepted", "ride_mode": "scheduled", "scheduled_at": far}) is False
    assert _client_phone_revealed({"status": "accepted", "ride_mode": "scheduled", "scheduled_at": near}) is True
    assert _client_phone_revealed({"status": "in_progress", "ride_mode": "scheduled", "scheduled_at": far}) is True
    assert _client_phone_revealed({"status": "pending"}) is False


def test_enrich_masks_scheduled_phone():
    from core.config import db
    from routes.rides import enrich_passenger_info

    async def run():
        uid = f"u_test_{uuid.uuid4().hex[:8]}"
        await db.users.insert_one({"id": uid, "name": "Client Test", "phone": "+33611112222", "email": f"{uid}@test.sb"})
        far = (_now() + timedelta(hours=4)).isoformat()
        try:
            hidden = await enrich_passenger_info({"user_id": uid, "status": "accepted", "ride_mode": "scheduled", "scheduled_at": far})
            assert hidden["passenger_phone"] is None
            assert hidden["passenger_phone_hidden"] is True
            assert hidden.get("passenger_phone_reveal_at")
            shown = await enrich_passenger_info({"user_id": uid, "status": "accepted"})
            assert shown["passenger_phone"] == "+33611112222"
            assert shown["passenger_phone_hidden"] is False
        finally:
            await db.users.delete_one({"id": uid})

    _run(run())


def test_release_penalty_escalates_and_suspends():
    from core.config import db
    from routes.moderation import apply_driver_penalty

    async def run():
        did = f"drv_test_{uuid.uuid4().hex[:8]}"
        uid = f"u_drv_{uuid.uuid4().hex[:8]}"
        await db.users.insert_one({"id": uid, "name": "Chauffeur Test", "role": "driver", "email": f"{uid}@test.sb"})
        await db.wallets.update_one({"user_id": uid}, {"$set": {"balance": 100.0, "currency": "EUR"}}, upsert=True)
        await db.drivers.insert_one({"id": did, "user_id": uid, "accept_release_count": 0})
        try:
            r1 = await apply_driver_penalty(did, "accept_release", "ride_x", is_scheduled=True)
            assert r1["amount"] == 2.0 and not r1.get("suspended")
            await db.drivers.update_one({"id": did}, {"$set": {"accept_release_count": 1}})
            r2 = await apply_driver_penalty(did, "accept_release", "ride_y", is_scheduled=True)
            assert r2["amount"] == 5.0 and not r2.get("suspended")
            await db.drivers.update_one({"id": did}, {"$set": {"accept_release_count": 2}})
            r3 = await apply_driver_penalty(did, "accept_release", "ride_z", is_scheduled=True)
            assert r3["amount"] == 10.0 and r3["suspended"] is True
            drv = await db.drivers.find_one({"id": did}, {"_id": 0, "scheduled_suspended_until": 1})
            assert drv.get("scheduled_suspended_until")
            ri = await apply_driver_penalty(did, "accept_release", "ride_i", is_scheduled=False)
            assert ri["amount"] == 1.0
        finally:
            await db.drivers.delete_one({"id": did})
            await db.users.delete_one({"id": uid})
            await db.wallets.delete_one({"user_id": uid})
            await db.wallet_transactions.delete_many({"user_id": uid})

    _run(run())


def test_driver_behavior_exposes_scheduled_suspension():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json=ADMIN, timeout=20)
    s.headers.update({"Authorization": f"Bearer {r.json()['access_token']}"})
    res = s.get(f"{API}/admin/dispatch/driver-behavior", timeout=30)
    assert res.status_code == 200
    drivers = res.json().get("drivers", [])
    if drivers:
        assert "scheduled_suspended" in drivers[0]
        assert "scheduled_suspended_until" in drivers[0]
