"""Iter 92 — Taxi bidding: raise proposed fare, cannot lower."""
import os
import requests

BASE = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001").rstrip("/")
API = f"{BASE}/api"
USER = {"email": os.environ.get("SEED_TEST_EMAIL", "test2@example.com"), "password": os.environ.get("SEED_TEST_PASSWORD", "TestPass123!")}


def _session():
    s = requests.Session()
    assert s.post(f"{API}/auth/login", json=USER).status_code == 200
    return s


def _pending_ride(s, fare=12.0):
    r = s.post(f"{API}/rides", json={
        "pickup_lat": 48.857, "pickup_lng": 2.351, "pickup_address": "A",
        "dropoff_lat": 48.880, "dropoff_lng": 2.355, "dropoff_address": "B",
        "vehicle_type": "sb", "payment_method": "cash", "proposed_fare": fare,
    })
    assert r.status_code == 200, r.text
    return r.json()["id"]


def test_raise_fare_ok_and_reject_lower():
    s = _session()
    rid = _pending_ride(s, 12.0)
    try:
        # raise
        r = s.post(f"{API}/rides/{rid}/proposed-fare", json={"proposed_fare": 15})
        assert r.status_code == 200, r.text
        assert r.json()["proposed_fare"] == 15.0
        # lower / equal rejected
        assert s.post(f"{API}/rides/{rid}/proposed-fare", json={"proposed_fare": 10}).status_code == 400
        assert s.post(f"{API}/rides/{rid}/proposed-fare", json={"proposed_fare": 15}).status_code == 400
    finally:
        s.post(f"{API}/rides/{rid}/status", json={"status": "cancelled", "cancel_reason": "test"})


def test_cannot_raise_when_not_pending():
    s = _session()
    rid = _pending_ride(s, 12.0)
    s.post(f"{API}/rides/{rid}/status", json={"status": "cancelled", "cancel_reason": "test"})
    r = s.post(f"{API}/rides/{rid}/proposed-fare", json={"proposed_fare": 20})
    assert r.status_code == 400


def test_only_owner_can_raise():
    s = _session()
    rid = _pending_ride(s, 12.0)
    try:
        anon = requests.Session()
        r = anon.post(f"{API}/rides/{rid}/proposed-fare", json={"proposed_fare": 20})
        assert r.status_code in (401, 403)
    finally:
        s.post(f"{API}/rides/{rid}/status", json={"status": "cancelled", "cancel_reason": "test"})
