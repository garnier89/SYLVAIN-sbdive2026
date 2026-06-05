"""Iteration 121 — Taxi Pool activation (shared-ride -30% discount, Pool section only)."""
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


def test_estimate_pool_discount():
    # Non-pool baseline
    r1 = requests.post(f"{API}/rides/estimate", json={**TRIP}, timeout=30)
    assert r1.status_code == 200, r1.text
    base = r1.json()
    assert base["pool_enabled"] is False
    assert base["original_fare"] is None

    # Pool variant
    r2 = requests.post(f"{API}/rides/estimate", json={**TRIP, "pool_enabled": True}, timeout=30)
    assert r2.status_code == 200, r2.text
    pool = r2.json()
    assert pool["pool_enabled"] is True
    assert pool["original_fare"] == base["estimated_fare"]
    # 30% discount
    assert abs(pool["estimated_fare"] - round(base["estimated_fare"] * 0.70, 2)) < 0.01
    assert any("Pool" in reason for reason in pool["pricing_reasons"])


def test_create_pool_ride_applies_discount():
    s = _user_session()
    # baseline non-pool
    rb = s.post(f"{API}/rides", json={**TRIP}, timeout=30)
    assert rb.status_code in (200, 201), rb.text
    base_fare = rb.json()["estimated_fare"]
    assert rb.json().get("pool_enabled") is False
    assert rb.json().get("original_fare") is None

    # pool ride
    rp = s.post(f"{API}/rides", json={**TRIP, "pool_enabled": True}, timeout=30)
    assert rp.status_code in (200, 201), rp.text
    pool = rp.json()
    assert pool["pool_enabled"] is True
    assert pool["original_fare"] == base_fare
    assert abs(pool["estimated_fare"] - round(base_fare * 0.70, 2)) < 0.01


def test_pool_discount_only_when_enabled():
    """A normal (non-pool) booking must never receive the pool discount."""
    s = _user_session()
    r = s.post(f"{API}/rides", json={**TRIP}, timeout=30)
    assert r.status_code in (200, 201)
    d = r.json()
    assert d["pool_enabled"] is False
    assert d["original_fare"] is None
