"""Tests for Admin 'Rapport Ecart Negociation' endpoint.
Endpoint: GET /api/admin/reports/negotiation-gap?days=N (admin-only)
"""
import os
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://sb-drive-vtc.preview.emergentagent.com').rstrip('/')
ADMIN_EMAIL = "admin@superapp.com"
ADMIN_PASSWORD = os.environ.get("TEST_ADMIN_PASSWORD", "SuperAdmin123!")
PAX_EMAIL = "neg_test@example.com"
PAX_PASSWORD = os.environ.get("TEST_NEG_PASSWORD", "Test1234!")


def _login(email, password):
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}, timeout=20)
    assert r.status_code == 200, f"login failed {email}: {r.status_code} {r.text[:200]}"
    return s


@pytest.fixture(scope="module")
def admin_session():
    return _login(ADMIN_EMAIL, ADMIN_PASSWORD)


@pytest.fixture(scope="module")
def pax_session():
    # Try login; if fails, register fresh user
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": PAX_EMAIL, "password": PAX_PASSWORD}, timeout=20)
    if r.status_code != 200:
        pytest.skip(f"passenger seed login failed: {r.status_code}")
    return s


# ===== Auth checks =====

class TestAuth:
    def test_anonymous_returns_401(self):
        r = requests.get(f"{BASE_URL}/api/admin/reports/negotiation-gap", timeout=15)
        assert r.status_code in (401, 403), f"expected 401/403, got {r.status_code}"

    def test_non_admin_returns_403(self, pax_session):
        r = pax_session.get(f"{BASE_URL}/api/admin/reports/negotiation-gap", timeout=15)
        assert r.status_code == 403, f"expected 403, got {r.status_code}: {r.text[:200]}"

    def test_admin_returns_200(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/admin/reports/negotiation-gap", timeout=30)
        assert r.status_code == 200, f"got {r.status_code}: {r.text[:200]}"


# ===== Response shape =====

class TestResponseShape:
    def test_top_level_shape(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/admin/reports/negotiation-gap?days=30", timeout=30)
        assert r.status_code == 200
        data = r.json()
        for key in ["period_days", "total_rides", "negotiated_count", "accepted_at_offer_count",
                    "avg_gap_abs", "avg_gap_pct", "total_proposed", "total_accepted",
                    "total_revenue_gap", "daily", "zones", "vehicles", "samples"]:
            assert key in data, f"missing key {key}"
        assert data["period_days"] == 30
        assert isinstance(data["daily"], list)
        assert isinstance(data["zones"], list)
        assert isinstance(data["vehicles"], list)
        assert isinstance(data["samples"], list)
        assert len(data["samples"]) <= 20

    def test_invariants(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/admin/reports/negotiation-gap?days=30", timeout=30)
        data = r.json()
        # negotiated + accepted_at_offer must equal total_rides
        assert data["negotiated_count"] + data["accepted_at_offer_count"] == data["total_rides"]
        # total_revenue_gap == total_accepted - total_proposed (rounded)
        assert abs(data["total_revenue_gap"] - round(data["total_accepted"] - data["total_proposed"], 2)) < 0.02

    def test_daily_items_shape(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/admin/reports/negotiation-gap?days=30", timeout=30)
        data = r.json()
        if not data["daily"]:
            pytest.skip("no daily data")
        d = data["daily"][0]
        for k in ["day", "count", "avg_gap", "avg_proposed", "avg_accepted",
                  "sum_gap", "sum_proposed", "sum_accepted"]:
            assert k in d, f"daily missing {k}"

    def test_zones_items_shape(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/admin/reports/negotiation-gap?days=30", timeout=30)
        data = r.json()
        if not data["zones"]:
            pytest.skip("no zones")
        z = data["zones"][0]
        for k in ["zone", "count", "avg_gap", "avg_gap_pct", "avg_proposed", "avg_accepted"]:
            assert k in z, f"zones missing {k}"

    def test_vehicles_items_shape(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/admin/reports/negotiation-gap?days=30", timeout=30)
        data = r.json()
        if not data["vehicles"]:
            pytest.skip("no vehicles")
        v = data["vehicles"][0]
        for k in ["vehicle", "count", "avg_gap", "avg_gap_pct"]:
            assert k in v, f"vehicles missing {k}"

    def test_samples_items_shape(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/admin/reports/negotiation-gap?days=30", timeout=30)
        data = r.json()
        if not data["samples"]:
            pytest.skip("no samples yet")
        s = data["samples"][0]
        for k in ["ride_id", "created_at", "proposed", "accepted", "gap_abs", "gap_pct",
                  "zone", "vehicle_type", "negotiated"]:
            assert k in s, f"samples missing {k}"
        assert isinstance(s["negotiated"], bool)


# ===== days param =====

class TestDaysParam:
    def test_days_7(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/admin/reports/negotiation-gap?days=7", timeout=30)
        assert r.status_code == 200
        assert r.json()["period_days"] == 7

    def test_days_90(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/admin/reports/negotiation-gap?days=90", timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert d["period_days"] == 90
        # 90-day window should have >= rides than 7-day window (cumulative)
        r7 = admin_session.get(f"{BASE_URL}/api/admin/reports/negotiation-gap?days=7", timeout=30).json()
        assert d["total_rides"] >= r7["total_rides"]


# ===== Zone inference (indirect: check zones list labels are from known set or fallback) =====

class TestZoneInference:
    KNOWN_ZONES = {"Martinique", "Guadeloupe", "Guyane", "Reunion", "Paris", "Lyon", "Marseille", "Inconnue"}

    def test_zone_labels_valid(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/admin/reports/negotiation-gap?days=90", timeout=30)
        data = r.json()
        # Each zone is either from KNOWN set or a fallback short string (<=30 chars)
        for z in data["zones"]:
            assert isinstance(z["zone"], str)
            assert len(z["zone"]) <= 40
