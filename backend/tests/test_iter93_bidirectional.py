"""Iter 93 — Bidirectional bidding: driver counter-offer + client accepts a specific driver."""
import os
import requests

BASE = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001").rstrip("/")
API = f"{BASE}/api"
USER = {"email": os.environ.get("SEED_TEST_EMAIL", "test2@example.com"), "password": os.environ.get("SEED_TEST_PASSWORD", "TestPass123!")}
DRIVER = {"email": "jean.dupont@demo.sb", "password": "Driver123!"}


def _session(creds):
    s = requests.Session()
    assert s.post(f"{API}/auth/login", json=creds).status_code == 200
    return s


def _cleanup(client, rid):
    client.post(f"{API}/rides/{rid}/status", json={"status": "cancelled", "cancel_reason": "test"})


def test_counter_offer_then_accept():
    client = _session(USER)
    rid = client.post(f"{API}/rides", json={
        "pickup_lat": 48.857, "pickup_lng": 2.351, "pickup_address": "A",
        "dropoff_lat": 48.880, "dropoff_lng": 2.355, "dropoff_address": "B",
        "vehicle_type": "sb", "payment_method": "cash", "proposed_fare": 10,
    }).json()["id"]
    try:
        # route_polyline stored (best-effort google)
        ride = client.get(f"{API}/rides/{rid}").json()
        assert "route_polyline" in ride

        driver = _session(DRIVER)
        r = driver.post(f"{API}/rides/{rid}/counter-offer", json={"amount": 13})
        assert r.status_code == 200, r.text
        offer = r.json()["offer"]
        assert offer["amount"] == 13.0
        assert offer["driver_name"]

        # client sees the offer
        ride = client.get(f"{API}/rides/{rid}").json()
        offers = [o for o in (ride.get("counter_offers") or []) if o["status"] == "pending"]
        assert offers, "expected at least one pending offer"
        oid = offers[0]["id"]

        # client accepts the specific driver's offer
        r = client.post(f"{API}/rides/{rid}/accept-offer/{oid}")
        assert r.status_code == 200, r.text
        ride = client.get(f"{API}/rides/{rid}").json()
        assert ride["status"] == "accepted"
        assert ride.get("driver_id")
        assert ride["estimated_fare"] == 13.0
    finally:
        # free driver + cancel
        _cleanup(client, rid)
