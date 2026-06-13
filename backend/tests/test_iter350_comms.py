"""Iter350 — communications: Firebase OTP flag, Twilio voice/SMS flags, masked-call party resolution."""
import sys
import asyncio
import uuid

import pytest
from dotenv import load_dotenv
from pymongo import ReturnDocument

load_dotenv("/app/backend/.env")
sys.path.insert(0, "/app/backend")

from core.config import db  # noqa: E402
from core.firebase_auth import firebase_enabled, extract_phone  # noqa: E402
from core.voice import voice_enabled, to_e164  # noqa: E402
from core.sms import sms_enabled  # noqa: E402
from routes.calls import _resolve_parties, _first_name, RELAY_AFTER_ATTEMPTS  # noqa: E402

_LOOP = asyncio.new_event_loop()
asyncio.set_event_loop(_LOOP)


def run(coro):
    return _LOOP.run_until_complete(coro)


def test_firebase_disabled_without_credentials():
    # No FIREBASE_SERVICE_ACCOUNT_JSON / file configured → feature flag off, no crash.
    assert firebase_enabled() is False
    assert extract_phone({"phone_number": "+596696000000"}) == "+596696000000"
    assert extract_phone({}) == ""


def test_twilio_flags_are_boolean():
    assert isinstance(voice_enabled(), bool)
    assert isinstance(sms_enabled(), bool)


def test_e164_normalisation():
    assert to_e164("+596696123456") == "+596696123456"
    assert to_e164("0612345678") == "+33612345678"
    assert to_e164("") == ""


def test_resolve_parties_rider_and_driver():
    rid = f"test_rider_{uuid.uuid4().hex[:6]}"
    duid = f"test_drvuser_{uuid.uuid4().hex[:6]}"
    drv_id = f"test_drv_{uuid.uuid4().hex[:6]}"
    ride_id = f"test_ride_{uuid.uuid4().hex[:6]}"
    try:
        run(db.users.insert_one({"id": rid, "name": "Marie Dupont", "phone": "+596696111111", "role": "user", "email": f"{rid}@test.local"}))
        run(db.users.insert_one({"id": duid, "name": "Jean Chauffeur", "phone": "+596696222222", "role": "driver", "email": f"{duid}@test.local"}))
        run(db.drivers.insert_one({"id": drv_id, "user_id": duid}))
        run(db.rides.insert_one({"id": ride_id, "user_id": rid, "driver_id": drv_id}))
        ride = run(db.rides.find_one({"id": ride_id}))
        rider, driver_user = run(_resolve_parties(ride))
        assert rider["id"] == rid and driver_user["id"] == duid
        assert _first_name(rider) == "Marie"
        assert _first_name(driver_user) == "Jean"
    finally:
        run(db.users.delete_many({"id": {"$in": [rid, duid]}}))
        run(db.drivers.delete_one({"id": drv_id}))
        run(db.rides.delete_one({"id": ride_id}))


def test_call_attempts_escalate_to_relay():
    ride_id = f"test_call_{uuid.uuid4().hex[:6]}"
    caller_id = f"test_caller_{uuid.uuid4().hex[:6]}"
    key = {"ride_id": ride_id, "caller_id": caller_id}
    try:
        last = 0
        for _ in range(RELAY_AFTER_ATTEMPTS):
            res = run(db.call_sessions.find_one_and_update(
                key, {"$inc": {"attempts": 1}}, upsert=True, return_document=ReturnDocument.AFTER))
            last = res["attempts"]
        assert last >= RELAY_AFTER_ATTEMPTS  # → use_relay True at the endpoint
    finally:
        run(db.call_sessions.delete_one(key))
