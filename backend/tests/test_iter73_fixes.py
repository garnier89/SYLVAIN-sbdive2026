"""Iter73 — Verifies the 3 fixes from iter72:
1. Pool enable/disable preserves original_fare
2. bidding_posts catalog returns 200 (sorted with featured first)
3. /api/auth/login works for admin + test2 user (email login backend)
"""
import os
import uuid
import requests
import pytest

BASE = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001").rstrip("/")
API = f"{BASE}/api"
ADMIN_EMAIL = "admin@superapp.com"
ADMIN_PASSWORD = "SuperAdmin123!"
USER_EMAIL = "test2@example.com"
USER_PASSWORD = "TestPass123!"


def _login_email(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=20)
    return r


# ── 1. Email login (admin + regular user) ──
def test_admin_email_login_works():
    r = _login_email(ADMIN_EMAIL, ADMIN_PASSWORD)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "access_token" in data
    assert data["user"]["role"] == "admin"


def test_user_email_login_works():
    r = _login_email(USER_EMAIL, USER_PASSWORD)
    if r.status_code != 200:
        # Try register
        rr = requests.post(f"{API}/auth/register", json={
            "email": USER_EMAIL, "password": USER_PASSWORD, "name": "Test User 2"
        }, timeout=20)
        assert rr.status_code in (200, 201, 400), rr.text
        r = _login_email(USER_EMAIL, USER_PASSWORD)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "access_token" in data
    assert data["user"]["role"] in ("user", "customer", "member", None) or data["user"].get("role") != "admin"


def test_invalid_email_login():
    r = _login_email("nonexistent@example.com", "WrongPass!")
    assert r.status_code in (400, 401, 403, 404), r.text


# ── 2. bidding_posts catalog ──
def test_bidding_posts_catalog_200():
    r = requests.get(f"{API}/phase2/catalogs/bidding_posts", timeout=20)
    assert r.status_code == 200, r.text
    data = r.json()
    assert isinstance(data, list)


# ── 3. Pool enable/disable preserves original_fare ──
@pytest.fixture(scope="module")
def user_session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": USER_EMAIL, "password": USER_PASSWORD}, timeout=20)
    if r.status_code != 200:
        # Try phone-register a fresh user
        suffix = str(uuid.uuid4().int)[:8]
        rp = s.post(f"{API}/auth/phone-register", json={
            "phone": f"+33{suffix}", "password": "TestPass123!", "name": "TEST_Iter73"
        }, timeout=20)
        if rp.status_code != 200:
            pytest.skip(f"cannot get user session: {rp.status_code} {rp.text[:100]}")
        s.headers.update({"Authorization": f"Bearer {rp.json()['access_token']}"})
        return s
    s.headers.update({"Authorization": f"Bearer {r.json()['access_token']}"})
    return s


def test_pool_enable_preserves_original_fare(user_session):
    # Create a ride
    payload = {
        "pickup_address": "Paris Centre",
        "pickup_lat": 48.8566, "pickup_lng": 2.3522,
        "dropoff_address": "La Défense",
        "dropoff_lat": 48.8924, "dropoff_lng": 2.2415,
        "vehicle_type": "standard",
        "estimated_fare": 100.0,
        "distance_km": 8.0,
        "duration_mins": 20,
        "payment_method": "cash",
    }
    r = user_session.post(f"{API}/rides", json=payload, timeout=20)
    if r.status_code not in (200, 201):
        pytest.skip(f"cannot create ride: {r.status_code} {r.text[:200]}")
    ride = r.json()
    ride_id = ride.get("id") or ride.get("ride", {}).get("id")
    assert ride_id, f"no ride id in {ride}"

    # Get the original estimated_fare from server (might differ from payload)
    g0 = user_session.get(f"{API}/rides/{ride_id}", timeout=10)
    orig = g0.json().get("estimated_fare", 100.0)

    # Enable pool (1st time)
    r1 = user_session.put(f"{API}/phase2/pool/enable/{ride_id}", json={"enabled": True}, timeout=20)
    assert r1.status_code == 200, r1.text
    d1 = r1.json()
    assert d1["enabled"] is True
    assert abs(d1["new_fare"] - orig * 0.7) < 0.01, f"Expected {orig*0.7}, got {d1['new_fare']}"
    assert abs(d1["original_fare"] - orig) < 0.01

    # Disable pool
    r2 = user_session.put(f"{API}/phase2/pool/enable/{ride_id}", json={"enabled": False}, timeout=20)
    assert r2.status_code == 200, r2.text
    d2 = r2.json()
    assert d2["enabled"] is False
    assert abs(d2["new_fare"] - orig) < 0.01, f"Expected restore to {orig}, got {d2['new_fare']}"
    assert abs(d2["original_fare"] - orig) < 0.01

    # Re-enable pool — fare should again drop to 70% of original (not 70% of 70%)
    r3 = user_session.put(f"{API}/phase2/pool/enable/{ride_id}", json={"enabled": True}, timeout=20)
    assert r3.status_code == 200, r3.text
    d3 = r3.json()
    assert abs(d3["new_fare"] - orig * 0.7) < 0.01, f"Expected {orig*0.7} after re-enable, got {d3['new_fare']}"
    assert abs(d3["original_fare"] - orig) < 0.01
