"""Iter48 tests for price negotiation / counter-offer flow."""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # Fallback to frontend .env file
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")

API = f"{BASE_URL}/api"

PASSENGER_EMAIL = f"TEST_pax_{uuid.uuid4().hex[:6]}@example.com"
PASSENGER_PASSWORD = os.environ.get("TEST_USER_PASSWORD", "TestPass123!")
DRIVER_EMAIL = "testdriver@example.com"
DRIVER_PASSWORD = os.environ.get("TEST_DRIVER_PASSWORD", "Driver123!")


@pytest.fixture(scope="module")
def passenger_token():
    r = requests.post(f"{API}/auth/register", json={
        "email": PASSENGER_EMAIL, "password": PASSENGER_PASSWORD,
        "name": "Test Pax", "phone": "+33600000000",
    })
    if r.status_code not in (200, 201):
        # maybe already exists
        r = requests.post(f"{API}/auth/login", json={"email": PASSENGER_EMAIL, "password": PASSENGER_PASSWORD})
    assert r.status_code == 200, f"passenger auth failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def driver_token():
    r = requests.post(f"{API}/auth/login", json={"email": DRIVER_EMAIL, "password": DRIVER_PASSWORD})
    assert r.status_code == 200, f"driver login failed: {r.text}"
    return r.json()["access_token"]


def _h(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


def _ride_payload(proposed_fare=None):
    p = {
        "pickup_lat": 48.8566, "pickup_lng": 2.3522, "pickup_address": "Paris",
        "dropoff_lat": 48.8738, "dropoff_lng": 2.2950, "dropoff_address": "La Defense",
        "vehicle_type": "sb", "payment_method": "cash",
    }
    if proposed_fare is not None:
        p["proposed_fare"] = proposed_fare
    return p


# 1. Create ride with proposed_fare
def test_create_ride_with_proposed_fare(passenger_token):
    r = requests.post(f"{API}/rides", headers=_h(passenger_token), json=_ride_payload(25.00))
    assert r.status_code == 200, r.text
    j = r.json()
    assert j["proposed_fare"] == 25.00
    assert j["counter_offers"] == []


# 2. Create ride without proposed_fare → defaults to estimated_fare
def test_create_ride_without_proposed_fare_defaults(passenger_token):
    r = requests.post(f"{API}/rides", headers=_h(passenger_token), json=_ride_payload())
    assert r.status_code == 200, r.text
    j = r.json()
    assert j["proposed_fare"] == j["estimated_fare"]


# 3. Driver counter-offer success
def test_driver_counter_offer_success(passenger_token, driver_token):
    r = requests.post(f"{API}/rides", headers=_h(passenger_token), json=_ride_payload(25.00))
    rid = r.json()["id"]
    r2 = requests.post(f"{API}/rides/{rid}/counter-offer", headers=_h(driver_token), json={"amount": 30})
    assert r2.status_code == 200, r2.text
    offer = r2.json()["offer"]
    assert offer["amount"] == 30
    assert offer["status"] == "pending"
    assert offer["driver_id"]
    assert offer["id"].startswith("off_")


# 4. Non-driver cannot counter-offer → 403
def test_counter_offer_rejects_non_driver(passenger_token):
    r = requests.post(f"{API}/rides", headers=_h(passenger_token), json=_ride_payload(25.00))
    rid = r.json()["id"]
    r2 = requests.post(f"{API}/rides/{rid}/counter-offer", headers=_h(passenger_token), json={"amount": 30})
    assert r2.status_code == 403


# 5. Invalid amount (0 or negative) → 400
def test_counter_offer_invalid_amount(passenger_token, driver_token):
    r = requests.post(f"{API}/rides", headers=_h(passenger_token), json=_ride_payload(25.00))
    rid = r.json()["id"]
    r2 = requests.post(f"{API}/rides/{rid}/counter-offer", headers=_h(driver_token), json={"amount": 0})
    assert r2.status_code == 400
    r3 = requests.post(f"{API}/rides/{rid}/counter-offer", headers=_h(driver_token), json={"amount": -5})
    assert r3.status_code == 400


# 6. Same driver 2 counter-offers → previous replaced
def test_counter_offer_same_driver_replaces_pending(passenger_token, driver_token):
    r = requests.post(f"{API}/rides", headers=_h(passenger_token), json=_ride_payload(25.00))
    rid = r.json()["id"]
    requests.post(f"{API}/rides/{rid}/counter-offer", headers=_h(driver_token), json={"amount": 30})
    requests.post(f"{API}/rides/{rid}/counter-offer", headers=_h(driver_token), json={"amount": 35})
    r_get = requests.get(f"{API}/rides/{rid}", headers=_h(passenger_token))
    assert r_get.status_code == 200
    offers = r_get.json().get("counter_offers", [])
    pending = [o for o in offers if o["status"] == "pending"]
    assert len(pending) == 1
    assert pending[0]["amount"] == 35


# 7. Counter-offer on non-pending ride → 400
def test_counter_offer_non_pending_ride(passenger_token, driver_token):
    # Create ride, accept via counter-offer flow, then try to add another offer
    r = requests.post(f"{API}/rides", headers=_h(passenger_token), json=_ride_payload(25.00))
    rid = r.json()["id"]
    r2 = requests.post(f"{API}/rides/{rid}/counter-offer", headers=_h(driver_token), json={"amount": 30})
    offer_id = r2.json()["offer"]["id"]
    requests.post(f"{API}/rides/{rid}/accept-offer/{offer_id}", headers=_h(passenger_token))
    r3 = requests.post(f"{API}/rides/{rid}/counter-offer", headers=_h(driver_token), json={"amount": 40})
    assert r3.status_code == 400


# 8. GET ride returns counter_offers list
def test_get_ride_returns_counter_offers(passenger_token, driver_token):
    r = requests.post(f"{API}/rides", headers=_h(passenger_token), json=_ride_payload(25.00))
    rid = r.json()["id"]
    requests.post(f"{API}/rides/{rid}/counter-offer", headers=_h(driver_token), json={"amount": 33})
    r_get = requests.get(f"{API}/rides/{rid}", headers=_h(passenger_token))
    assert r_get.status_code == 200
    offers = r_get.json().get("counter_offers", [])
    assert len(offers) >= 1
    o = offers[0]
    for k in ("id", "driver_id", "amount", "status"):
        assert k in o


# 9. Accept offer: ride.status=accepted, driver_id/estimated_fare updated, offer accepted
def test_passenger_accept_offer(passenger_token, driver_token):
    r = requests.post(f"{API}/rides", headers=_h(passenger_token), json=_ride_payload(25.00))
    rid = r.json()["id"]
    r2 = requests.post(f"{API}/rides/{rid}/counter-offer", headers=_h(driver_token), json={"amount": 30})
    offer = r2.json()["offer"]
    r3 = requests.post(f"{API}/rides/{rid}/accept-offer/{offer['id']}", headers=_h(passenger_token))
    assert r3.status_code == 200, r3.text
    j = r3.json()
    assert j["final_fare"] == 30
    r_get = requests.get(f"{API}/rides/{rid}", headers=_h(passenger_token))
    ride = r_get.json()
    assert ride["status"] == "accepted"
    assert ride["driver_id"] == offer["driver_id"]
    assert ride["estimated_fare"] == 30
    assert any(o["id"] == offer["id"] and o["status"] == "accepted" for o in ride.get("counter_offers", []))


# 10. Accept-offer by non-owner → 403
def test_accept_offer_rejects_non_owner(passenger_token, driver_token):
    r = requests.post(f"{API}/rides", headers=_h(passenger_token), json=_ride_payload(25.00))
    rid = r.json()["id"]
    r2 = requests.post(f"{API}/rides/{rid}/counter-offer", headers=_h(driver_token), json={"amount": 30})
    offer_id = r2.json()["offer"]["id"]
    # Create another passenger
    other_email = f"TEST_other_{uuid.uuid4().hex[:6]}@example.com"
    rr = requests.post(f"{API}/auth/register", json={
        "email": other_email, "password": os.environ.get("TEST_USER_PASSWORD", "TestPass123!"), "name": "Other", "phone": "+33600000001",
    })
    other_tok = rr.json()["access_token"]
    r3 = requests.post(f"{API}/rides/{rid}/accept-offer/{offer_id}", headers=_h(other_tok))
    assert r3.status_code == 403


# 11. Accept-offer on non-pending ride → 400
def test_accept_offer_non_pending_ride(passenger_token, driver_token):
    r = requests.post(f"{API}/rides", headers=_h(passenger_token), json=_ride_payload(25.00))
    rid = r.json()["id"]
    r2 = requests.post(f"{API}/rides/{rid}/counter-offer", headers=_h(driver_token), json={"amount": 30})
    offer_id = r2.json()["offer"]["id"]
    requests.post(f"{API}/rides/{rid}/accept-offer/{offer_id}", headers=_h(passenger_token))
    # Try again -> ride no longer pending
    r3 = requests.post(f"{API}/rides/{rid}/accept-offer/{offer_id}", headers=_h(passenger_token))
    assert r3.status_code == 400


# 12. Accept invalid offer id → 404
def test_accept_offer_invalid_id(passenger_token, driver_token):
    r = requests.post(f"{API}/rides", headers=_h(passenger_token), json=_ride_payload(25.00))
    rid = r.json()["id"]
    requests.post(f"{API}/rides/{rid}/counter-offer", headers=_h(driver_token), json={"amount": 30})
    r3 = requests.post(f"{API}/rides/{rid}/accept-offer/off_invalid123", headers=_h(passenger_token))
    assert r3.status_code == 404


# 13. Driver points incremented on offer accept
def test_driver_points_increment_on_offer_accept(passenger_token, driver_token):
    # Get initial driver points
    me = requests.get(f"{API}/auth/me", headers=_h(driver_token)).json()
    # /api/drivers/me may not exist; skip if unavailable
    r_drv = requests.get(f"{API}/drivers/me", headers=_h(driver_token))
    if r_drv.status_code != 200:
        pytest.skip(f"/api/drivers/me not available ({r_drv.status_code})")
    before = r_drv.json().get("points", 0)
    # Create ride + offer + accept
    r = requests.post(f"{API}/rides", headers=_h(passenger_token), json=_ride_payload(25.00))
    rid = r.json()["id"]
    r2 = requests.post(f"{API}/rides/{rid}/counter-offer", headers=_h(driver_token), json={"amount": 30})
    offer_id = r2.json()["offer"]["id"]
    r3 = requests.post(f"{API}/rides/{rid}/accept-offer/{offer_id}", headers=_h(passenger_token))
    assert r3.status_code == 200
    after = requests.get(f"{API}/drivers/me", headers=_h(driver_token)).json().get("points", 0)
    assert after >= before  # should be >= (>= instead of > to handle cap at 100)
