"""Iteration 222 — Airport Transfer extras: AF1006 cancelled + flight-refresh endpoint."""
import os
import time
from datetime import datetime, timedelta, timezone

import requests

BASE = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001").rstrip("/")
API = f"{BASE}/api"
ADMIN = {"email": "admin@superapp.com", "password": "SuperAdmin123!"}


def _login(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=15)
    r.raise_for_status()
    return r.json()["access_token"]


def _register_client():
    em = f"TEST_iter222_{int(time.time()*1000)}@example.com"
    r = requests.post(f"{API}/auth/register", json={"email": em, "password": "Client123!", "name": "AirX"}, timeout=15)
    r.raise_for_status()
    return r.json()["access_token"]


def _future_iso(hours=3):
    return (datetime.now(timezone.utc) + timedelta(hours=hours)).strftime("%Y-%m-%dT%H:%M")


def _ensure_airport(admin_token):
    h = {"Authorization": f"Bearer {admin_token}"}
    # Reuse an existing or create
    pub = requests.get(f"{API}/phase2/airports", timeout=15).json()
    if pub:
        return pub[0]
    az = requests.post(f"{API}/phase2/config/airport-zones", headers=h, json={
        "name": "Iter222 Airport", "code": "I22", "lat": 14.591, "lng": -61.003,
        "radius_km": 5, "free_wait_minutes": 45, "luggage_fee": 5, "shuttle_discount_pct": 30,
    }, timeout=15).json()
    return az


def test_af1006_cancelled_flight_status():
    admin = _login(ADMIN)
    _ensure_airport(admin)
    ct = _register_client()
    ch = {"Authorization": f"Bearer {ct}"}
    body = {
        "pickup_lat": 14.591, "pickup_lng": -61.003, "pickup_address": "FDF",
        "dropoff_lat": 14.604, "dropoff_lng": -61.07, "dropoff_address": "FDF center",
        "vehicle_type": "sb", "payment_method": "cash", "ride_type": "airport", "mode_id": "airport",
        "flight_number": "AF1006", "airport_terminal": "T1", "flight_arrival_time": "12:00",
        "luggage_assist": False, "shared_shuttle": False, "scheduled_at": _future_iso(4),
    }
    r = requests.post(f"{API}/rides", headers=ch, json=body, timeout=20)
    assert r.status_code == 200, r.text
    ride = r.json()
    assert ride["flight_status"]["status"] == "cancelled"

    # admin counts -> cancelled_flights >= 1
    ah = {"Authorization": f"Bearer {admin}"}
    res = requests.get(f"{API}/phase2/admin/airport/reservations", headers=ah, timeout=15).json()
    assert res["counts"]["cancelled_flights"] >= 1


def test_flight_refresh_endpoint():
    admin = _login(ADMIN)
    _ensure_airport(admin)
    ct = _register_client()
    ch = {"Authorization": f"Bearer {ct}"}
    body = {
        "pickup_lat": 14.591, "pickup_lng": -61.003, "pickup_address": "FDF",
        "dropoff_lat": 14.604, "dropoff_lng": -61.07, "dropoff_address": "FDF center",
        "vehicle_type": "sb", "payment_method": "cash", "ride_type": "airport", "mode_id": "airport",
        "flight_number": "AF1002", "airport_terminal": "T1", "flight_arrival_time": "10:00",
        "scheduled_at": _future_iso(5),
    }
    r = requests.post(f"{API}/rides", headers=ch, json=body, timeout=20)
    assert r.status_code == 200, r.text
    ride = r.json()
    ride_id = ride["id"]

    # Refresh flight: airport ride -> 200 + flight_status returned
    rr = requests.post(f"{API}/phase2/rides/{ride_id}/flight-refresh", headers=ch, timeout=15)
    assert rr.status_code == 200, rr.text
    data = rr.json()
    assert "flight_status" in data
    assert data["flight_status"]["status"] == "delayed"


def test_flight_refresh_non_airport_returns_400():
    ct = _register_client()
    ch = {"Authorization": f"Bearer {ct}"}
    # Create a regular instant ride
    body = {
        "pickup_lat": 14.6, "pickup_lng": -61.05, "pickup_address": "A",
        "dropoff_lat": 14.61, "dropoff_lng": -61.06, "dropoff_address": "B",
        "vehicle_type": "sb", "payment_method": "cash",
        "scheduled_at": _future_iso(2),
    }
    r = requests.post(f"{API}/rides", headers=ch, json=body, timeout=20)
    if r.status_code != 200:
        # No drivers might block instant; rely on scheduled
        import pytest
        pytest.skip(f"Could not create non-airport ride: {r.status_code} {r.text[:120]}")
    rid = r.json()["id"]
    rr = requests.post(f"{API}/phase2/rides/{rid}/flight-refresh", headers=ch, timeout=15)
    assert rr.status_code == 400, rr.text
