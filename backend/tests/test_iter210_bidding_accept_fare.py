"""Iter210 — Bidding: accepting a ride honors the passenger's proposed fare.

Bug: when a driver accepted a bidding ride directly, the agreed price reverted
to the system estimate instead of the passenger's proposed fare ("la proposition
de tarif ne fonctionne pas"). The fix sets estimated/agreed/final fare = proposed.
"""
import os
import uuid

import requests

BASE = (os.environ.get("REACT_APP_BACKEND_URL") or "").rstrip("/")
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
        "password": "Test1234!", "role": "user"})
    assert r.status_code == 200, r.text[:200]
    return s


def _driver(email="amadou.diallo@demo.sb"):
    s = requests.Session()
    r = s.post(f"{BASE}/api/auth/login", json={"email": email, "password": "Driver123!"})
    assert r.status_code == 200, r.text[:200]
    return s


def test_driver_accept_bidding_honors_proposed_fare():
    rider, driver = _rider(), _driver()
    rid = rider.post(f"{BASE}/api/rides", json=RIDE).json()["id"]

    acc = driver.post(f"{BASE}/api/rides/{rid}/accept")
    assert acc.status_code == 200, acc.text[:200]

    ride = rider.get(f"{BASE}/api/rides/{rid}").json()
    assert ride["status"] == "accepted"
    assert ride.get("driver_id")
    # The proposed fare must be honored, NOT the system estimate.
    assert ride.get("estimated_fare") == PROPOSED, f"fare not honored: {ride.get('estimated_fare')}"
    assert ride.get("final_fare") == PROPOSED


def test_passenger_accept_counter_offer_sets_fare():
    rider, driver = _rider(), _driver("jean.dupont@demo.sb")
    rid = rider.post(f"{BASE}/api/rides", json=RIDE).json()["id"]

    co = driver.post(f"{BASE}/api/rides/{rid}/counter-offer", json={"amount": 32.0})
    assert co.status_code == 200, co.text[:200]
    offer_id = co.json()["offer"]["id"]

    ride = rider.get(f"{BASE}/api/rides/{rid}").json()
    assert any(o["id"] == offer_id for o in ride.get("counter_offers", []))

    acc = rider.post(f"{BASE}/api/rides/{rid}/accept-offer/{offer_id}")
    assert acc.status_code == 200, acc.text[:200]
    ride = rider.get(f"{BASE}/api/rides/{rid}").json()
    assert ride["status"] == "accepted"
    assert ride.get("estimated_fare") == 32.0
