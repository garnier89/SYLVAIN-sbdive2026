"""
Iter 94 — V3Cube ride OTP security & full lifecycle backend verification.

Validates:
  1. Passenger sees `start_otp` on GET /api/rides/{id}.
  2. Driver does NOT see `start_otp`/`otp` on GET /api/rides/{id} (stripped).
  3. Driver direct in_progress transition is blocked (400, with French message).
  4. Wrong OTP via /api/phase1/rides/{id}/start-otp/verify → 400.
  5. Correct OTP starts the ride (status=in_progress).
  6. Completed ride exposes `fare_breakdown` with base/distance/time/min_adjustment/total.
"""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://sb-drive-vtc.preview.emergentagent.com").rstrip("/")

PASSENGER = {"email": "test2@example.com", "password": "TestPass123!"}
DRIVER    = {"email": "jean.dupont@demo.sb", "password": "Driver123!"}


def _login(creds):
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json=creds, timeout=15)
    assert r.status_code == 200, f"Login failed for {creds['email']}: {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="module")
def passenger_session():
    return _login(PASSENGER)


@pytest.fixture(scope="module")
def driver_session():
    return _login(DRIVER)


@pytest.fixture(scope="module")
def ride_id(passenger_session, driver_session):
    # Make the driver online so they can accept
    try:
        driver_session.post(f"{BASE_URL}/api/drivers/online", json={"online": True}, timeout=10)
    except Exception:
        pass

    payload = {
        "pickup_lat": 48.8566, "pickup_lng": 2.3522, "pickup_address": "Hôtel de Ville, Paris",
        "dropoff_lat": 48.8738, "dropoff_lng": 2.2950, "dropoff_address": "Arc de Triomphe, Paris",
        "vehicle_type": "sb",
        "payment_method": "cash",
    }
    r = passenger_session.post(f"{BASE_URL}/api/rides", json=payload, timeout=15)
    assert r.status_code in (200, 201), f"Create ride failed: {r.status_code} {r.text}"
    rid = r.json()["id"]

    # Driver accepts
    r = driver_session.post(f"{BASE_URL}/api/rides/{rid}/accept", timeout=15)
    assert r.status_code == 200, f"Accept ride failed: {r.status_code} {r.text}"
    return rid


def test_passenger_sees_start_otp(passenger_session, ride_id):
    r = passenger_session.get(f"{BASE_URL}/api/rides/{ride_id}", timeout=15)
    assert r.status_code == 200, r.text
    body = r.json()
    assert "start_otp" in body, "Passenger ride detail must expose start_otp"
    assert isinstance(body["start_otp"], str) and len(body["start_otp"]) == 4
    assert body["start_otp"].isdigit()


def test_driver_cannot_see_start_otp(driver_session, ride_id):
    r = driver_session.get(f"{BASE_URL}/api/rides/{ride_id}", timeout=15)
    assert r.status_code == 200, r.text
    body = r.json()
    assert "start_otp" not in body, f"start_otp leaked to driver: {body.get('start_otp')!r}"
    assert "otp" not in body, f"otp leaked to driver: {body.get('otp')!r}"


def test_driver_can_set_arriving(driver_session, ride_id):
    r = driver_session.post(f"{BASE_URL}/api/rides/{ride_id}/status", json={"status": "arriving"}, timeout=15)
    assert r.status_code == 200, r.text


def test_driver_cannot_directly_start_in_progress(driver_session, ride_id):
    r = driver_session.post(f"{BASE_URL}/api/rides/{ride_id}/status", json={"status": "in_progress"}, timeout=15)
    assert r.status_code == 400, f"Expected 400, got {r.status_code}: {r.text}"
    detail = r.json().get("detail", "")
    assert "OTP" in detail.upper() or "otp" in detail, f"Expected OTP error msg, got: {detail}"


def test_wrong_otp_rejected(driver_session, ride_id):
    r = driver_session.post(
        f"{BASE_URL}/api/phase1/rides/{ride_id}/start-otp/verify",
        json={"otp": "0000"},
        timeout=15,
    )
    # If real otp happens to be 0000, retry with another
    if r.status_code == 200:
        pytest.skip("OTP collision with 0000 (1/10000 chance); cannot test wrong-otp here")
    assert r.status_code == 400, f"Expected 400 on wrong OTP, got {r.status_code}: {r.text}"


def test_correct_otp_starts_ride(passenger_session, driver_session, ride_id):
    # Read OTP from passenger view
    r = passenger_session.get(f"{BASE_URL}/api/rides/{ride_id}", timeout=15)
    assert r.status_code == 200
    otp = r.json()["start_otp"]
    assert otp

    r = driver_session.post(
        f"{BASE_URL}/api/phase1/rides/{ride_id}/start-otp/verify",
        json={"otp": otp},
        timeout=15,
    )
    assert r.status_code == 200, f"OTP verify failed: {r.status_code} {r.text}"

    # GET should confirm in_progress
    r = driver_session.get(f"{BASE_URL}/api/rides/{ride_id}", timeout=15)
    assert r.status_code == 200
    assert r.json()["status"] == "in_progress"


def test_completed_ride_has_fare_breakdown(driver_session, ride_id):
    # Wait a moment so time_charge is computed > 0
    time.sleep(2)
    r = driver_session.post(f"{BASE_URL}/api/rides/{ride_id}/status", json={"status": "completed"}, timeout=15)
    assert r.status_code == 200, r.text

    # Fetch as driver (driver still authorized) — fare_breakdown should exist
    r = driver_session.get(f"{BASE_URL}/api/rides/{ride_id}", timeout=15)
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "completed"
    fb = body.get("fare_breakdown")
    assert fb, "fare_breakdown missing on completed ride"
    for k in ("base_fare", "distance_km", "distance_charge", "time_charge", "min_adjustment", "total", "currency"):
        assert k in fb, f"fare_breakdown missing key {k}: {fb}"
    assert fb["total"] > 0, f"total should be > 0 for a real ride: {fb}"
    assert fb["base_fare"] > 0, f"base_fare should be > 0: {fb}"
    assert fb["distance_km"] > 0
    assert fb["currency"] == "EUR"
