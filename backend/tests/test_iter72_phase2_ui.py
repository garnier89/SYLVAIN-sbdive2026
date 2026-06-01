"""Iter72 — Phase 2 features regression + new endpoints.

Covers:
- Driver phone login → GET/PUT/GET /api/phase2/driver/destination-mode
- /api/phase2/heatmap (driver-only)
- 9 catalog endpoints (including the new bidding_posts)
- Tip endpoint shape (auth + 404 on missing ride)
- Pool enable endpoint shape (404/403 paths)
- Regression: /api/admin/reports/negotiation-gap?days=30 has 13 keys
- Regression: phone-register success + duplicate 400
"""
import os
import uuid
import requests
import pytest
from tests._creds import ADMIN_EMAIL, ADMIN_PASSWORD, DRIVER_PASSWORD_FR

BASE = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001").rstrip("/")
API = f"{BASE}/api"
DRIVER_PHONE = os.environ.get("TEST_DRIVER_PHONE", "+33644112233")


# ── fixtures ──
@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=20)
    assert r.status_code == 200, r.text
    s.headers.update({"Authorization": f"Bearer {r.json()['access_token']}"})
    return s


@pytest.fixture(scope="module")
def driver_session():
    s = requests.Session()
    r = s.post(f"{API}/auth/phone-login", json={"phone": DRIVER_PHONE, "password": DRIVER_PASSWORD_FR}, timeout=20)
    if r.status_code != 200:
        pytest.skip(f"driver phone-login failed: {r.status_code} {r.text[:200]}")
    s.headers.update({"Authorization": f"Bearer {r.json()['access_token']}"})
    return s


@pytest.fixture(scope="module")
def user_session():
    """Fresh phone-registered user (or login of test2 if exists)."""
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": "test2@example.com", "password": "TestPass123!"}, timeout=20)
    if r.status_code == 200:
        s.headers.update({"Authorization": f"Bearer {r.json()['access_token']}"})
        return s
    suffix = str(uuid.uuid4().int)[:8]
    r2 = s.post(f"{API}/auth/phone-register", json={
        "phone": f"+33{suffix}", "password": "TestPass123!", "name": "TEST_Iter72User"
    }, timeout=20)
    assert r2.status_code == 200, r2.text
    s.headers.update({"Authorization": f"Bearer {r2.json()['access_token']}"})
    return s


# ── 1. Driver Destination Mode ──
def test_destination_mode_get_initial(driver_session):
    r = driver_session.get(f"{API}/phase2/driver/destination-mode", timeout=20)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "active" in data and "target" in data


def test_destination_mode_enable_then_disable(driver_session):
    # ENABLE
    payload = {"active": True, "address": "Paris Centre", "lat": 48.8566, "lng": 2.3522, "radius_km": 5}
    r = driver_session.put(f"{API}/phase2/driver/destination-mode", json=payload, timeout=20)
    assert r.status_code == 200, r.text
    assert r.json().get("destination_mode_active") is True

    # GET → active true with target
    g = driver_session.get(f"{API}/phase2/driver/destination-mode", timeout=20)
    assert g.status_code == 200
    d = g.json()
    assert d["active"] is True
    assert d["target"] is not None
    assert abs(d["target"]["lat"] - 48.8566) < 0.01
    assert abs(d["target"]["lng"] - 2.3522) < 0.01

    # DISABLE
    r2 = driver_session.put(f"{API}/phase2/driver/destination-mode", json={"active": False}, timeout=20)
    assert r2.status_code == 200
    g2 = driver_session.get(f"{API}/phase2/driver/destination-mode", timeout=20)
    d2 = g2.json()
    assert d2["active"] is False
    assert d2["target"] is None


def test_destination_mode_forbids_non_driver(user_session):
    r = user_session.put(f"{API}/phase2/driver/destination-mode", json={"active": False}, timeout=20)
    assert r.status_code == 403


# ── 2. Heatmap ──
def test_heatmap_driver_ok(driver_session):
    r = driver_session.get(f"{API}/phase2/heatmap", timeout=20)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "points" in data
    assert isinstance(data["points"], list)


def test_heatmap_forbids_user(user_session):
    r = user_session.get(f"{API}/phase2/heatmap", timeout=20)
    assert r.status_code == 403


# ── 3. Catalogs ──
@pytest.mark.parametrize("collection", [
    "beauty_salons", "pet_providers", "car_services", "towing_partners",
    "nearby_businesses", "ondemand_services", "marketplace_listings",
    "carpool_trips", "bidding_posts",
])
def test_catalog_list(collection):
    r = requests.get(f"{API}/phase2/catalogs/{collection}", timeout=20)
    assert r.status_code == 200, f"{collection}: {r.status_code} {r.text[:200]}"
    assert isinstance(r.json(), list)


# ── 4. Tip endpoint shape ──
def test_tip_requires_auth():
    r = requests.post(f"{API}/phase2/rides/nonexistent/tip", json={"amount": 5}, timeout=20)
    assert r.status_code in (401, 403)


def test_tip_404_on_missing_ride(user_session):
    r = user_session.post(f"{API}/phase2/rides/nonexistent-ride-xyz/tip", json={"amount": 5}, timeout=20)
    assert r.status_code == 404


# ── 5. Pool enable endpoint shape ──
def test_pool_enable_requires_auth():
    r = requests.put(f"{API}/phase2/pool/enable/abc", json={"enabled": True}, timeout=20)
    assert r.status_code in (401, 403)


def test_pool_enable_404_on_missing_ride(user_session):
    r = user_session.put(f"{API}/phase2/pool/enable/nonexistent-ride-xyz", json={"enabled": True}, timeout=20)
    assert r.status_code == 404


# ── 6. Regression: negotiation-gap 13 keys ──
def test_negotiation_gap_13_keys(admin_session):
    r = admin_session.get(f"{API}/admin/reports/negotiation-gap?days=30", timeout=30)
    assert r.status_code == 200, r.text
    data = r.json()
    expected = {
        "period_days", "total_rides", "negotiated_count", "accepted_at_offer_count",
        "avg_gap_abs", "avg_gap_pct", "total_proposed", "total_accepted",
        "total_revenue_gap", "daily", "zones", "vehicles", "samples"
    }
    missing = expected - set(data.keys())
    assert not missing, f"Missing: {missing}"


# ── 7. Regression: phone-register works + duplicate 400 ──
def test_phone_register_and_duplicate():
    suffix = str(uuid.uuid4().int)[:8]
    phone = f"+33{suffix}"
    r = requests.post(f"{API}/auth/phone-register", json={
        "phone": phone, "password": "TestPass123!", "name": "TEST_Iter72"
    }, timeout=20)
    assert r.status_code == 200, r.text
    # duplicate
    r2 = requests.post(f"{API}/auth/phone-register", json={
        "phone": phone, "password": "TestPass123!"
    }, timeout=20)
    assert r2.status_code == 400
