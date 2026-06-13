"""Iter 374 — Dedicated tests for the extracted `routes/rides_bidding.py` sub-router.

Locks the negotiation flow (driver counter-offer → passenger accept/reject),
the average-fare hint and the driver-only gating, after the Phase-4 split.
"""
import os
import uuid

import requests


def _read_frontend_env():
    try:
        with open("/app/frontend/.env") as f:
            for ln in f:
                if ln.startswith("REACT_APP_BACKEND_URL="):
                    return ln.split("=", 1)[1].strip()
    except Exception:
        return None
    return None


BASE = (os.environ.get("REACT_APP_BACKEND_URL") or _read_frontend_env() or "").rstrip("/")
assert BASE, "REACT_APP_BACKEND_URL missing"

PROPOSED = 25.0
RIDE = {
    "pickup_lat": 14.6037, "pickup_lng": -61.0594, "pickup_address": "Fort-de-France",
    "dropoff_lat": 14.61, "dropoff_lng": -60.99, "dropoff_address": "Le Lamentin",
    "vehicle_type": "sb", "payment_method": "cash",
    "ride_type": "bidding", "proposed_fare": PROPOSED,
}


def _rider():
    s = requests.Session()
    r = s.post(f"{BASE}/api/auth/register", json={
        "name": "Bid Rider", "email": f"bid_{uuid.uuid4().hex[:8]}@test.sb",
        "password": "Test1234!", "role": "user"}, timeout=30)
    assert r.status_code == 200, r.text[:200]
    return s


def _driver(email="amadou.diallo@demo.sb"):
    s = requests.Session()
    r = s.post(f"{BASE}/api/auth/login", json={"email": email, "password": "Driver123!"}, timeout=30)
    assert r.status_code == 200, r.text[:200]
    return s


def _new_bidding_ride(rider):
    r = rider.post(f"{BASE}/api/rides", json=RIDE, timeout=30)
    assert r.status_code == 200, r.text[:200]
    return r.json()["id"]


# ── counter-offer ──────────────────────────────────────────────────────────
def test_driver_counter_offer_appended_and_visible():
    rider, driver = _rider(), _driver()
    rid = _new_bidding_ride(rider)
    co = driver.post(f"{BASE}/api/rides/{rid}/counter-offer", json={"amount": 30.0}, timeout=30)
    assert co.status_code == 200, co.text[:200]
    offer = co.json()["offer"]
    assert offer["amount"] == 30.0
    assert offer["status"] == "pending"
    assert "expires_at" in offer and offer["ttl_seconds"] > 0
    ride = rider.get(f"{BASE}/api/rides/{rid}", timeout=30).json()
    assert any(o["id"] == offer["id"] for o in ride.get("counter_offers", []))


def test_counter_offer_is_driver_only():
    rider = _rider()
    rid = _new_bidding_ride(rider)
    # A passenger cannot post a counter-offer.
    r = rider.post(f"{BASE}/api/rides/{rid}/counter-offer", json={"amount": 30.0}, timeout=30)
    assert r.status_code == 403


def test_counter_offer_rejects_invalid_amount():
    rider, driver = _rider(), _driver()
    rid = _new_bidding_ride(rider)
    r = driver.post(f"{BASE}/api/rides/{rid}/counter-offer", json={"amount": 0}, timeout=30)
    assert r.status_code == 400


def test_counter_offer_replaces_previous_pending_from_same_driver():
    rider, driver = _rider(), _driver()
    rid = _new_bidding_ride(rider)
    driver.post(f"{BASE}/api/rides/{rid}/counter-offer", json={"amount": 30.0}, timeout=30)
    driver.post(f"{BASE}/api/rides/{rid}/counter-offer", json={"amount": 28.0}, timeout=30)
    ride = rider.get(f"{BASE}/api/rides/{rid}", timeout=30).json()
    pendings = [o for o in ride.get("counter_offers", []) if o["status"] == "pending"]
    assert len(pendings) == 1, f"expected 1 pending offer, got {len(pendings)}"
    assert pendings[0]["amount"] == 28.0


# ── accept-offer ───────────────────────────────────────────────────────────
def test_passenger_accept_offer_assigns_driver_and_fare():
    rider, driver = _rider(), _driver("jean.dupont@demo.sb")
    rid = _new_bidding_ride(rider)
    co = driver.post(f"{BASE}/api/rides/{rid}/counter-offer", json={"amount": 33.0}, timeout=30)
    offer_id = co.json()["offer"]["id"]
    acc = rider.post(f"{BASE}/api/rides/{rid}/accept-offer/{offer_id}", timeout=30)
    assert acc.status_code == 200, acc.text[:200]
    assert acc.json()["final_fare"] == 33.0
    ride = rider.get(f"{BASE}/api/rides/{rid}", timeout=30).json()
    assert ride["status"] == "accepted"
    assert ride.get("driver_id")
    assert ride.get("estimated_fare") == 33.0


def test_accept_unknown_offer_404():
    rider = _rider()
    rid = _new_bidding_ride(rider)
    r = rider.post(f"{BASE}/api/rides/{rid}/accept-offer/off_does_not_exist", timeout=30)
    assert r.status_code == 404


# ── reject-offer ───────────────────────────────────────────────────────────
def test_passenger_reject_offer_marks_rejected():
    rider, driver = _rider(), _driver()
    rid = _new_bidding_ride(rider)
    co = driver.post(f"{BASE}/api/rides/{rid}/counter-offer", json={"amount": 40.0}, timeout=30)
    offer_id = co.json()["offer"]["id"]
    rej = rider.post(f"{BASE}/api/rides/{rid}/reject-offer/{offer_id}", timeout=30)
    assert rej.status_code == 200, rej.text[:200]
    ride = rider.get(f"{BASE}/api/rides/{rid}", timeout=30).json()
    # ride stays pending; the offer is rejected (drops out of the chooser)
    assert ride["status"] == "pending"
    o = next(o for o in ride["counter_offers"] if o["id"] == offer_id)
    assert o["status"] == "rejected"


def test_reject_unknown_offer_404():
    rider = _rider()
    rid = _new_bidding_ride(rider)
    r = rider.post(f"{BASE}/api/rides/{rid}/reject-offer/off_nope", timeout=30)
    assert r.status_code == 404


# ── avg-fares ──────────────────────────────────────────────────────────────
def test_bidding_avg_fares_shape_and_auth():
    rider = _rider()
    r = rider.get(f"{BASE}/api/rides/bidding/avg-fares", timeout=30)
    assert r.status_code == 200, r.text[:200]
    d = r.json()
    assert isinstance(d["fares"], dict) and d["sample_days"] == 30
    assert requests.get(f"{BASE}/api/rides/bidding/avg-fares", timeout=30).status_code in (401, 403)
