"""Iter 61 — Phase 2 smoke (heatmap, airport-flat-quote, tip, waybill)."""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
USER_EMAIL = "neg_test@example.com"
USER_PW = os.environ.get("TEST_NEG_PASSWORD", "Test1234!")


@pytest.fixture(scope="module")
def user_session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": USER_EMAIL, "password": USER_PW}, timeout=20)
    assert r.status_code == 200, f"user login failed {r.status_code} {r.text[:200]}"
    return s


@pytest.fixture(scope="module")
def driver_session():
    s = requests.Session()
    email = f"driver_iter61_{uuid.uuid4().hex[:6]}@test.com"
    r = s.post(
        f"{BASE_URL}/api/auth/register",
        json={"name": "Iter61 Driver", "email": email, "password": os.environ.get("TEST_DRIVER_PASSWORD_ALT", "Driver1234!"), "phone": "+33611111111", "role": "driver"},
        timeout=20,
    )
    if r.status_code not in (200, 201):
        pytest.skip(f"Driver register failed: {r.status_code} {r.text[:200]}")
    return s


def test_heatmap_as_driver_200(driver_session):
    r = driver_session.get(f"{BASE_URL}/api/phase2/heatmap", timeout=20)
    assert r.status_code == 200, r.text[:200]
    data = r.json()
    assert "points" in data and isinstance(data["points"], list)
    assert "total_rides" in data
    assert "window_hours" in data


def test_heatmap_as_user_403(user_session):
    r = user_session.get(f"{BASE_URL}/api/phase2/heatmap", timeout=20)
    assert r.status_code == 403


def test_airport_flat_quote_endpoint_used_by_frontend(user_session):
    """Frontend calls POST /api/phase2/airport-flat-quote — verify that exact path."""
    r = user_session.post(
        f"{BASE_URL}/api/phase2/airport-flat-quote",
        json={"pickup_lat": 48.8566, "pickup_lng": 2.3522, "dropoff_lat": 48.86, "dropoff_lng": 2.36},
        timeout=20,
    )
    assert r.status_code == 200, f"airport-flat-quote {r.status_code} {r.text[:200]}"
    data = r.json()
    assert "type" in data


def test_pricing_quote_alias(user_session):
    """Backend exposes /pricing/quote — should also work (current actual route)."""
    r = user_session.post(
        f"{BASE_URL}/api/phase2/pricing/quote",
        json={"pickup_lat": 48.8566, "pickup_lng": 2.3522, "dropoff_lat": 48.86, "dropoff_lng": 2.36},
        timeout=20,
    )
    assert r.status_code == 200, r.text[:200]


def test_tip_invalid_amount(user_session):
    # Create a ride first
    r = user_session.post(
        f"{BASE_URL}/api/rides",
        json={
            "pickup_address": "Paris", "pickup_lat": 48.8566, "pickup_lng": 2.3522,
            "dropoff_address": "Pantin", "dropoff_lat": 48.89, "dropoff_lng": 2.4,
            "vehicle_type": "economy", "payment_method": "cash",
        },
        timeout=20,
    )
    if r.status_code not in (200, 201):
        pytest.skip(f"ride create failed: {r.status_code} {r.text[:200]}")
    ride_id = r.json().get("id") or r.json().get("ride", {}).get("id")
    assert ride_id

    # Tip with invalid amount on incomplete ride
    r2 = user_session.post(f"{BASE_URL}/api/phase2/rides/{ride_id}/tip", json={"amount": 0}, timeout=20)
    assert r2.status_code == 400


def test_waybill_shape(user_session):
    # Create ride
    r = user_session.post(
        f"{BASE_URL}/api/rides",
        json={
            "pickup_address": "Paris", "pickup_lat": 48.8566, "pickup_lng": 2.3522,
            "dropoff_address": "Pantin", "dropoff_lat": 48.89, "dropoff_lng": 2.4,
            "vehicle_type": "economy", "payment_method": "cash",
        },
        timeout=20,
    )
    if r.status_code not in (200, 201):
        pytest.skip("ride create failed")
    ride_id = r.json().get("id") or r.json().get("ride", {}).get("id")
    r2 = user_session.get(f"{BASE_URL}/api/phase2/rides/{ride_id}/waybill", timeout=20)
    assert r2.status_code == 200, r2.text[:200]
    data = r2.json()
    assert data.get("waybill_number", "").startswith("SBD-")
    # Verify nested ride object (backend returns ride.* not flat)
    assert "ride" in data
    assert "passenger" in data
    return data
