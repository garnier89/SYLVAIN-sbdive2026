"""Iter 95 — Scheduling restrictions + in-ride route update.

Covers:
 - GET /api/config/scheduling defaults
 - POST /api/rides scheduled_at < now+60min → 400
 - POST /api/rides scheduled_at = now+2h vehicle=sb → 200
 - POST /api/rides pool + scheduled_at → 400 with French detail
 - POST /api/rides/{id}/update-route on pending/accepted/in_progress
"""
import os
from datetime import datetime, timezone, timedelta

import pytest
import requests

def _read_backend_url():
    url = os.environ.get("REACT_APP_BACKEND_URL")
    if not url:
        # Read from /app/frontend/.env
        try:
            with open("/app/frontend/.env", "r", encoding="utf-8") as fh:
                for line in fh:
                    line = line.strip()
                    if line.startswith("REACT_APP_BACKEND_URL="):
                        url = line.split("=", 1)[1].strip().strip('"').strip("'")
                        break
        except OSError:
            pass
    assert url, "REACT_APP_BACKEND_URL not configured"
    return url.rstrip("/")


BASE_URL = _read_backend_url()

ADMIN_EMAIL = "admin@superapp.com"
ADMIN_PASSWORD = "SuperAdmin123!"
DRIVER_EMAIL = "jean.dupont@demo.sb"
DRIVER_PASSWORD = "Driver123!"

# Paris pickup/dropoff
PICKUP = {"pickup_lat": 48.8566, "pickup_lng": 2.3522, "pickup_address": "Châtelet, Paris"}
DROPOFF = {"dropoff_lat": 48.8738, "dropoff_lng": 2.2950, "dropoff_address": "Arc de Triomphe, Paris"}


def _login(email: str, password: str) -> requests.Session:
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"login failed {email}: {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="module")
def passenger_session():
    return _login(ADMIN_EMAIL, ADMIN_PASSWORD)


@pytest.fixture(scope="module")
def driver_session():
    return _login(DRIVER_EMAIL, DRIVER_PASSWORD)


# --- /api/config/scheduling ---------------------------------------------------

def test_get_scheduling_config_defaults():
    r = requests.get(f"{BASE_URL}/api/config/scheduling", timeout=10)
    assert r.status_code == 200
    data = r.json()
    assert data["enabled"] is True
    # Admin may have changed it; tolerate but verify shape.
    assert isinstance(data["min_advance_minutes"], int)
    assert isinstance(data["max_advance_days"], int)
    assert "pool" in data["disabled_modes"]
    assert "bidding" in data["disabled_modes"]


# --- /api/rides scheduled_at validation --------------------------------------

def test_create_ride_scheduled_too_soon_returns_400(passenger_session):
    sched = (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat()
    payload = {
        **PICKUP, **DROPOFF,
        "vehicle_type": "sb",
        "payment_method": "cash",
        "scheduled_at": sched,
    }
    r = passenger_session.post(f"{BASE_URL}/api/rides", json=payload, timeout=15)
    assert r.status_code == 400, r.text
    assert "60" in r.json().get("detail", "") or "minutes" in r.json().get("detail", "").lower()


def test_create_ride_scheduled_ok_sb_returns_200(passenger_session):
    sched = (datetime.now(timezone.utc) + timedelta(hours=2)).isoformat()
    payload = {
        **PICKUP, **DROPOFF,
        "vehicle_type": "sb",
        "payment_method": "cash",
        "scheduled_at": sched,
    }
    r = passenger_session.post(f"{BASE_URL}/api/rides", json=payload, timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["status"] == "pending"
    assert data["vehicle_type"] == "sb"
    assert data.get("scheduled_at") is not None


def test_create_ride_pool_scheduled_returns_400(passenger_session):
    sched = (datetime.now(timezone.utc) + timedelta(hours=2)).isoformat()
    payload = {
        **PICKUP, **DROPOFF,
        "vehicle_type": "pool",
        "payment_method": "cash",
        "pool_enabled": True,
        "scheduled_at": sched,
    }
    r = passenger_session.post(f"{BASE_URL}/api/rides", json=payload, timeout=15)
    assert r.status_code == 400, r.text
    detail = r.json().get("detail", "")
    assert "Pool" in detail or "pool" in detail.lower()


# --- /api/rides/{id}/update-route --------------------------------------------

@pytest.fixture
def pending_ride(passenger_session):
    payload = {
        **PICKUP, **DROPOFF,
        "vehicle_type": "sb",
        "payment_method": "cash",
    }
    r = passenger_session.post(f"{BASE_URL}/api/rides", json=payload, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()


def test_update_route_pending(passenger_session, pending_ride):
    ride_id = pending_ride["id"]
    body = {
        "dropoff_lat": 48.8606, "dropoff_lng": 2.3376,
        "dropoff_address": "Louvre, Paris",
        "stops": [{"lat": 48.8584, "lng": 2.2945, "address": "Eiffel Tower"}],
    }
    r = passenger_session.post(f"{BASE_URL}/api/rides/{ride_id}/update-route", json=body, timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["dropoff_address"] == "Louvre, Paris"
    assert data["distance_km"] != pending_ride["distance_km"]
    assert data.get("estimated_fare") is not None


def test_update_route_accepted(passenger_session, driver_session, pending_ride):
    ride_id = pending_ride["id"]
    # Driver accepts
    r_acc = driver_session.post(f"{BASE_URL}/api/rides/{ride_id}/accept", timeout=15)
    assert r_acc.status_code == 200, r_acc.text
    # Passenger updates route
    body = {
        "dropoff_lat": 48.8530, "dropoff_lng": 2.3499,
        "dropoff_address": "Notre-Dame, Paris",
    }
    r = passenger_session.post(f"{BASE_URL}/api/rides/{ride_id}/update-route", json=body, timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["dropoff_address"] == "Notre-Dame, Paris"
    assert data["status"] == "accepted"


def test_update_route_in_progress_dropoff_ok_pickup_blocked(passenger_session, driver_session, pending_ride):
    ride_id = pending_ride["id"]
    # Driver accepts → arriving → verify OTP to start
    assert driver_session.post(f"{BASE_URL}/api/rides/{ride_id}/accept", timeout=15).status_code == 200
    assert driver_session.post(
        f"{BASE_URL}/api/rides/{ride_id}/status", json={"status": "arriving"}, timeout=15
    ).status_code == 200
    # Fetch OTP as passenger
    r_ride = passenger_session.get(f"{BASE_URL}/api/rides/{ride_id}", timeout=10)
    assert r_ride.status_code == 200
    otp = r_ride.json().get("start_otp")
    assert otp, "passenger should see start_otp"
    # Driver verifies OTP → in_progress
    r_verify = driver_session.post(
        f"{BASE_URL}/api/phase1/rides/{ride_id}/start-otp/verify",
        json={"otp": otp}, timeout=15,
    )
    assert r_verify.status_code == 200, r_verify.text

    # Now in_progress: pickup change must be blocked
    r_pickup = passenger_session.post(
        f"{BASE_URL}/api/rides/{ride_id}/update-route",
        json={"pickup_lat": 48.8000, "pickup_lng": 2.4000, "pickup_address": "Other"},
        timeout=15,
    )
    assert r_pickup.status_code == 400, r_pickup.text
    assert "départ" in r_pickup.json().get("detail", "").lower() or "pickup" in r_pickup.json().get("detail", "").lower()

    # Dropoff change must succeed
    r_drop = passenger_session.post(
        f"{BASE_URL}/api/rides/{ride_id}/update-route",
        json={"dropoff_lat": 48.8867, "dropoff_lng": 2.3431, "dropoff_address": "Sacré-Cœur"},
        timeout=15,
    )
    assert r_drop.status_code == 200, r_drop.text
    assert r_drop.json()["dropoff_address"] == "Sacré-Cœur"
