"""Iteration 121 — Taxi Pool (V3Cube model): 1st seat = full fare,
each extra seat = pool_percentage% of 1st seat. Admin-configurable, capacity-clamped."""
import os
import time

import requests

BASE = os.environ.get("REACT_APP_BACKEND_URL", "https://sb-drive-vtc.preview.emergentagent.com")
API = f"{BASE}/api"

TRIP = {
    "pickup_lat": 48.8566, "pickup_lng": 2.3522, "pickup_address": "Paris",
    "dropoff_lat": 48.8606, "dropoff_lng": 2.3376, "dropoff_address": "Louvre",
    "vehicle_type": "pool", "payment_method": "cash",
}


def _user_session():
    s = requests.Session()
    email = f"pooltest_{int(time.time()*1000)}@demo.sb"
    r = s.post(f"{API}/auth/register", json={
        "email": email, "password": "Pool123!", "name": "Pool QA",
        "phone": "+596690000009", "role": "user",
    }, timeout=30)
    assert r.status_code == 200, r.text
    return s


def test_first_seat_is_full_fare_no_discount():
    base = requests.post(f"{API}/rides/estimate", json={**TRIP}, timeout=30).json()
    pool1 = requests.post(f"{API}/rides/estimate", json={**TRIP, "pool_enabled": True, "seats_required": 1}, timeout=30).json()
    # 1st seat = full fare (NO discount on first seat, V3Cube model)
    assert pool1["seats_required"] == 1
    assert abs(pool1["estimated_fare"] - base["estimated_fare"]) < 0.01
    assert pool1["original_fare"] == base["estimated_fare"]
    assert pool1["available_seats"] is not None
    assert pool1["pool_percentage"] is not None


def test_seat_pricing_linear_pool_percentage():
    """V3Cube: total(n) = F * (1 + (n-1)*pct/100). Default pct=90 -> 2 seats ratio 1.9, 4 seats 3.7."""
    r1 = requests.post(f"{API}/rides/estimate", json={**TRIP, "pool_enabled": True, "seats_required": 1}, timeout=30).json()
    r2 = requests.post(f"{API}/rides/estimate", json={**TRIP, "pool_enabled": True, "seats_required": 2}, timeout=30).json()
    F = r1["estimated_fare"]
    pct = r1["pool_percentage"]
    assert abs(r2["estimated_fare"] - round(F * (1 + (pct / 100.0)), 2)) < 0.02
    # ratio = 1 + pct/100
    assert abs(r2["estimated_fare"] / F - (1 + pct / 100.0)) < 0.02


def test_seats_clamped_to_available():
    r1 = requests.post(f"{API}/rides/estimate", json={**TRIP, "pool_enabled": True, "seats_required": 1}, timeout=30).json()
    cap = r1["available_seats"]
    over = requests.post(f"{API}/rides/estimate", json={**TRIP, "pool_enabled": True, "seats_required": cap + 5}, timeout=30).json()
    assert over["seats_required"] == cap


def test_create_pool_ride_persists_seats_and_fare():
    s = _user_session()
    base = s.post(f"{API}/rides", json={**TRIP}, timeout=30).json()["estimated_fare"]
    est = requests.post(f"{API}/rides/estimate", json={**TRIP, "pool_enabled": True, "seats_required": 2}, timeout=30).json()
    rp = s.post(f"{API}/rides", json={**TRIP, "pool_enabled": True, "seats_required": 2}, timeout=30)
    assert rp.status_code in (200, 201), rp.text
    d = rp.json()
    assert d["seats_required"] == 2
    assert d["pool_enabled"] is True
    pct = est["pool_percentage"]
    assert abs(d["estimated_fare"] - round(base * (1 + pct / 100.0), 2)) < 0.02


def test_non_pool_unaffected():
    s = _user_session()
    r = s.post(f"{API}/rides", json={**TRIP}, timeout=30)
    d = r.json()
    assert d["pool_enabled"] is False
    assert d["original_fare"] is None
    assert d["seats_required"] == 1
