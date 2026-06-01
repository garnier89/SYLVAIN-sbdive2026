"""Iter67 backend tests — Auto-dispatch config/stats endpoints + loop behavior."""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://taxi-marketplace-3.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = "admin@superapp.com"
ADMIN_PASSWORD = os.environ.get("TEST_ADMIN_PASSWORD", "SuperAdmin123!")
USER_EMAIL = "neg_test@example.com"
USER_PASSWORD = os.environ.get("TEST_NEG_PASSWORD", "Test1234!")


@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="module")
def user_session():
    s = requests.Session()
    # try login; if fails, try register
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": USER_EMAIL, "password": USER_PASSWORD}, timeout=15)
    if r.status_code != 200:
        s.post(f"{BASE_URL}/api/auth/register", json={
            "email": USER_EMAIL, "password": USER_PASSWORD, "name": "Neg Test", "phone": "+33600000099"
        }, timeout=15)
        r = s.post(f"{BASE_URL}/api/auth/login", json={"email": USER_EMAIL, "password": USER_PASSWORD}, timeout=15)
    if r.status_code != 200:
        pytest.skip(f"user login failed: {r.status_code}")
    return s


# ============ AUTO-DISPATCH CONFIG ENDPOINTS ============
class TestAutoDispatchConfig:
    def test_get_config_admin_ok(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/admin/auto-dispatch/config", timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "config" in data
        cfg = data["config"]
        for key in ["enabled", "first_escalation_seconds", "second_escalation_seconds",
                    "auto_cancel_after_seconds", "radius_km", "first_palettes", "second_palettes"]:
            assert key in cfg, f"missing key {key}"
        assert isinstance(cfg["first_palettes"], list)
        assert isinstance(cfg["second_palettes"], list)

    def test_get_config_unauth_blocked(self):
        r = requests.get(f"{BASE_URL}/api/admin/auto-dispatch/config", timeout=15)
        assert r.status_code in (401, 403), f"expected 401/403 got {r.status_code}"

    def test_get_config_non_admin_blocked(self, user_session):
        r = user_session.get(f"{BASE_URL}/api/admin/auto-dispatch/config", timeout=15)
        assert r.status_code == 403, f"expected 403 got {r.status_code}"

    def test_put_config_partial_merge(self, admin_session):
        # capture current
        cur = admin_session.get(f"{BASE_URL}/api/admin/auto-dispatch/config", timeout=15).json()["config"]
        new_radius = 7 if cur.get("radius_km") != 7 else 8
        r = admin_session.put(
            f"{BASE_URL}/api/admin/auto-dispatch/config",
            json={"radius_km": new_radius},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        merged = r.json()["config"]
        assert merged["radius_km"] == new_radius
        # other defaults preserved
        assert "first_escalation_seconds" in merged
        assert "first_palettes" in merged

        # GET to verify persistence
        r2 = admin_session.get(f"{BASE_URL}/api/admin/auto-dispatch/config", timeout=15).json()["config"]
        assert r2["radius_km"] == new_radius

        # restore
        admin_session.put(f"{BASE_URL}/api/admin/auto-dispatch/config",
                          json={"radius_km": cur.get("radius_km", 5)}, timeout=15)

    def test_put_config_palettes_array(self, admin_session):
        cur = admin_session.get(f"{BASE_URL}/api/admin/auto-dispatch/config", timeout=15).json()["config"]
        r = admin_session.put(
            f"{BASE_URL}/api/admin/auto-dispatch/config",
            json={"first_palettes": ["Expert"]},
            timeout=15,
        )
        assert r.status_code == 200
        assert r.json()["config"]["first_palettes"] == ["Expert"]
        # restore
        admin_session.put(f"{BASE_URL}/api/admin/auto-dispatch/config",
                          json={"first_palettes": cur.get("first_palettes", ["Expert", "Confirme"])}, timeout=15)

    def test_put_config_empty_400(self, admin_session):
        r = admin_session.put(f"{BASE_URL}/api/admin/auto-dispatch/config", json={}, timeout=15)
        assert r.status_code == 400


# ============ AUTO-DISPATCH STATS ============
class TestAutoDispatchStats:
    def test_get_stats_admin_ok(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/admin/auto-dispatch/stats", timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        for key in ["tier_0_no_escalation", "tier_1_priority", "tier_2_all", "tier_minus_1_cancelled"]:
            assert key in data
            assert isinstance(data[key], int)

    def test_get_stats_non_admin_blocked(self, user_session):
        r = user_session.get(f"{BASE_URL}/api/admin/auto-dispatch/stats", timeout=15)
        assert r.status_code == 403


# ============ AUTO-DISPATCH LOOP E2E ============
class TestAutoDispatchLoop:
    """Create a pending ride, wait, verify escalation tier got bumped."""

    def test_pending_ride_escalates_to_tier_1(self, admin_session, user_session):
        # Set tight thresholds so we don't have to wait a long time
        admin_session.put(f"{BASE_URL}/api/admin/auto-dispatch/config", json={
            "enabled": True,
            "first_escalation_seconds": 5,
            "second_escalation_seconds": 15,
            "auto_cancel_after_seconds": 300,  # avoid auto-cancel during test
            "radius_km": 5,
            "first_palettes": ["Expert", "Confirme", "Standard", "Debutant"],
            "second_palettes": ["Expert", "Confirme", "Standard", "Debutant"],
        }, timeout=15)

        # Create a pending ride
        payload = {
            "pickup_address": "TEST_iter67 Paris",
            "pickup_lat": 48.857,
            "pickup_lng": 2.347,
            "dropoff_address": "TEST_iter67 Dest",
            "dropoff_lat": 48.860,
            "dropoff_lng": 2.360,
            "vehicle_type": "berline",
            "payment_method": "cash",
            "distance_km": 2.5,
            "estimated_fare": 12.5,
        }
        r = user_session.post(f"{BASE_URL}/api/rides", json=payload, timeout=15)
        if r.status_code not in (200, 201):
            pytest.skip(f"ride create returned {r.status_code}: {r.text[:200]}")
        ride = r.json()
        ride_id = ride.get("id") or ride.get("ride_id") or ride.get("_id")
        assert ride_id, f"no id in response: {ride}"

        # baseline tier_1
        before = admin_session.get(f"{BASE_URL}/api/admin/auto-dispatch/stats", timeout=15).json()
        # wait > first_escalation_seconds + loop interval (5s + 5s = 10s, give 18s buffer)
        time.sleep(18)
        after = admin_session.get(f"{BASE_URL}/api/admin/auto-dispatch/stats", timeout=15).json()

        # Check via admin rides list / direct lookup if possible
        # Stats should increment by at least 1 (or stay same if ride was already accepted by a real driver)
        delta_t1 = after["tier_1_priority"] - before["tier_1_priority"]
        delta_t2 = after["tier_2_all"] - before["tier_2_all"]
        delta_tc = after["tier_minus_1_cancelled"] - before["tier_minus_1_cancelled"]
        # acceptable: tier_1 OR tier_2 incremented (single-pass escalation may skip t1),
        # OR ride was cancelled (no drivers found is also normal proof loop works)
        assert delta_t1 >= 1 or delta_t2 >= 1 or delta_tc >= 1, (
            f"expected escalation to increment, before={before} after={after}"
        )

        # cleanup: restore defaults
        admin_session.put(f"{BASE_URL}/api/admin/auto-dispatch/config", json={
            "first_escalation_seconds": 30,
            "second_escalation_seconds": 60,
            "auto_cancel_after_seconds": 120,
        }, timeout=15)


# ============ REGRESSION: GOD'S VIEW & related endpoints ============
class TestRegression:
    def test_admin_stats_endpoint(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/admin/stats", timeout=15)
        assert r.status_code == 200

    def test_admin_analytics_endpoint(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/admin/analytics", timeout=15)
        assert r.status_code == 200

    def test_auth_me_admin(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/auth/me", timeout=15)
        assert r.status_code == 200
        assert r.json().get("role") == "admin"
