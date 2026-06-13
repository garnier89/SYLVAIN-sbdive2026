"""Iter351 — anti-fraude Lot 2 : détection 'accepté mais ne bouge pas' + auto-réassignation."""
import sys
import asyncio
import uuid
from datetime import datetime, timezone, timedelta

import pytest
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")
sys.path.insert(0, "/app/backend")

from core.config import db  # noqa: E402
from core import no_movement as NM  # noqa: E402

_LOOP = asyncio.new_event_loop()
asyncio.set_event_loop(_LOOP)


def run(coro):
    return _LOOP.run_until_complete(coro)


def test_haversine_distance():
    assert NM._haversine_m(14.6, -61.0, 14.6, -61.0) == 0
    # ~0.00135 deg latitude ≈ 150 m
    d = NM._haversine_m(14.6, -61.0, 14.60135, -61.0)
    assert 140 < d < 160


def _seed_ride(*, accept_lat, accept_lng, minutes_ago=6, current=None):
    suffix = uuid.uuid4().hex[:6]
    rid = f"test_r_{suffix}"
    duid = f"test_du_{suffix}"
    drv_id = f"test_d_{suffix}"
    ride_id = f"test_ride_{suffix}"
    accepted_at = (datetime.now(timezone.utc) - timedelta(minutes=minutes_ago)).isoformat()
    run(db.users.insert_one({"id": rid, "name": "Client Test", "role": "user", "email": f"{rid}@t.local"}))
    run(db.users.insert_one({"id": duid, "name": "Chauffeur Test", "role": "driver", "email": f"{duid}@t.local"}))
    drv = {"id": drv_id, "user_id": duid, "status": "approved"}
    if current:
        drv["current_lat"], drv["current_lng"] = current
    run(db.drivers.insert_one(drv))
    run(db.wallets.insert_one({"user_id": duid, "balance": 50.0}))
    run(db.rides.insert_one({
        "id": ride_id, "user_id": rid, "driver_id": drv_id, "driver_user_id": duid,
        "status": "accepted", "ride_mode": "instant", "accepted_at": accepted_at,
        "arrived_at": None, "accept_lat": accept_lat, "accept_lng": accept_lng,
    }))
    return ride_id, drv_id, duid, rid


def _cleanup(ride_id, drv_id, duid, rid):
    run(db.rides.delete_one({"id": ride_id}))
    run(db.drivers.delete_one({"id": drv_id}))
    run(db.users.delete_many({"id": {"$in": [duid, rid]}}))
    run(db.wallets.delete_many({"user_id": {"$in": [duid, rid]}}))


def test_stuck_driver_is_released_and_penalised():
    ride_id, drv_id, duid, rid = _seed_ride(accept_lat=14.6, accept_lng=-61.0)  # no current loc → not moving
    try:
        run(NM._scan_stuck_rides())
        ride = run(db.rides.find_one({"id": ride_id}))
        assert ride["status"] == "pending"
        assert ride.get("driver_id") is None
        assert ride.get("previous_driver_id") == drv_id
        assert ride.get("reassign_count", 0) >= 1
        drv = run(db.drivers.find_one({"id": drv_id}))
        assert drv.get("no_movement_count", 0) >= 1
    finally:
        _cleanup(ride_id, drv_id, duid, rid)


def test_moving_driver_is_not_released():
    # Current position ~1 km away from accept point → moved → keep the ride.
    ride_id, drv_id, duid, rid = _seed_ride(accept_lat=14.6, accept_lng=-61.0, current=(14.61, -61.0))
    try:
        run(NM._scan_stuck_rides())
        ride = run(db.rides.find_one({"id": ride_id}))
        assert ride["status"] == "accepted"
        assert ride.get("driver_id") == drv_id
    finally:
        _cleanup(ride_id, drv_id, duid, rid)


def test_recent_ride_within_grace_not_touched():
    # Accepted only 1 min ago (< no_movement_minutes) → outside the scan window.
    ride_id, drv_id, duid, rid = _seed_ride(accept_lat=14.6, accept_lng=-61.0, minutes_ago=1)
    try:
        run(NM._scan_stuck_rides())
        ride = run(db.rides.find_one({"id": ride_id}))
        assert ride["status"] == "accepted"
    finally:
        _cleanup(ride_id, drv_id, duid, rid)
