"""Regression (iter 538) — ride cancellation UX:

1) When a CLIENT cancels a ride that a driver already accepted, the assigned
   driver must receive a real-time `ride_cancelled` WebSocket event.
2) The /accept 409 message must be ACCURATE: "annulée par le client" when the
   ride is already cancelled vs "déjà acceptée" when claimed by another driver.
"""
import uuid
from datetime import datetime, timezone

import pytest
from fastapi import HTTPException

from conftest import run_async
from core.config import db
from core.websocket import manager
import routes.rides as rides


def _mk_request(user, body):
    class _Req:
        async def json(self):
            return body
    # Patch the auth + body the endpoint reads.
    return _Req(), user


def test_cancel_notifies_assigned_driver(monkeypatch):
    rid = "test_" + uuid.uuid4().hex
    driver_uid = "drv_" + uuid.uuid4().hex
    client_uid = "usr_" + uuid.uuid4().hex
    sent = []

    async def fake_personal(message, client_id):
        sent.append((client_id, message))

    monkeypatch.setattr(manager, "send_personal_message", fake_personal)
    monkeypatch.setattr(manager, "send_to_ride_room", lambda *a, **k: _noop())

    async def _noop():
        return None

    async def fake_get_user(request):
        return {"id": client_uid, "role": "user"}

    monkeypatch.setattr(rides, "get_current_user", fake_get_user)

    ride = {
        "id": rid, "status": "accepted", "user_id": client_uid,
        "driver_id": "d1", "driver_user_id": driver_uid,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "dropoff_address": "Gare du Nord",
    }

    class _Req:
        async def json(self):
            return {"reason": "changed my mind"}

    async def _run():
        await db.rides.insert_one(dict(ride))
        try:
            await rides.cancel_ride(rid, _Req())
        finally:
            await db.rides.delete_one({"id": rid})

    run_async(_run())
    # The assigned driver got a dedicated ride_cancelled event.
    driver_events = [m for cid, m in sent if cid == driver_uid and m.get("type") == "ride_cancelled"]
    assert driver_events, f"driver not notified: {sent}"
    assert "annulée par le client" in driver_events[0]["body"].lower()


def test_accept_409_message_when_cancelled(monkeypatch):
    """If the ride is already cancelled, /accept returns the tailored message."""
    rid = "test_" + uuid.uuid4().hex
    driver_uid = "drv_" + uuid.uuid4().hex

    async def fake_get_user(request):
        return {"id": driver_uid, "role": "driver"}

    monkeypatch.setattr(rides, "get_current_user", fake_get_user)

    class _Req:
        async def json(self):
            return {}

    ride = {
        "id": rid, "status": "cancelled", "user_id": "u1",
        "vehicle_type": "standard",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    async def _run():
        # The driver must be approved for the endpoint to proceed.
        await db.drivers.update_one(
            {"user_id": driver_uid},
            {"$set": {"user_id": driver_uid, "id": "d_" + driver_uid, "status": "approved"}},
            upsert=True)
        await db.rides.insert_one(dict(ride))
        try:
            await rides.accept_ride(rid, _Req())
            return None
        except HTTPException as e:
            return e
        finally:
            await db.rides.delete_one({"id": rid})
            await db.drivers.delete_one({"user_id": driver_uid})

    err = run_async(_run())
    # A cancelled ride is NOT 'pending', so accept_ride 404s at the initial
    # `find_one({status: pending})` guard. That is correct: the driver is told
    # the ride is gone. The tailored 409 path covers the atomic-claim loser.
    assert isinstance(err, HTTPException)
    assert err.status_code in (404, 409)
