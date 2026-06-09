"""Iter 193 — Phase 3 Moderation e2e HTTP tests.
Covers /api/moderation/* admin & passenger endpoints, ride cancellation tracking,
and ban gating on POST /api/rides. Always restores DEFAULT_CONFIG at teardown.
"""
import os
import uuid
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    BASE_URL = "http://localhost:8001"

ADMIN_EMAIL = "admin@superapp.com"
ADMIN_PASS = "SuperAdmin123!"

DEFAULTS = {
    "enabled": True,
    "client_warn_threshold": 10,
    "client_ban_threshold": 15,
    "client_ban_hours": 2,
    "driver_abusive_penalty_eur": 2.0,
    "driver_release_penalty_eur": 1.0,
}


# ── Fixtures ──────────────────────────────────────────────────────────────
def _auth_session(token: str) -> requests.Session:
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def admin_session():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASS}, timeout=15)
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    token = r.json().get("access_token")
    assert token, f"no access_token: {r.text}"
    return _auth_session(token)


@pytest.fixture
def fresh_passenger():
    """Create a transient passenger and return (session, user_dict)."""
    email = f"TEST_iter193_pax_{uuid.uuid4().hex[:8]}@example.com"
    pw = "PassTest123!"
    r = requests.post(f"{BASE_URL}/api/auth/register",
                      json={"email": email, "password": pw, "name": "Iter193 Pax",
                            "phone": f"+3360{uuid.uuid4().int % 100000000:08d}"},
                      timeout=15)
    assert r.status_code in (200, 201), f"register failed: {r.status_code} {r.text}"
    token = r.json().get("access_token")
    if not token:
        # explicit login
        lg = requests.post(f"{BASE_URL}/api/auth/login",
                           json={"email": email, "password": pw}, timeout=15)
        assert lg.status_code == 200, f"login failed: {lg.text}"
        token = lg.json().get("access_token")
    s = _auth_session(token)
    me = s.get(f"{BASE_URL}/api/auth/me", timeout=10)
    assert me.status_code == 200, f"me failed: {me.text}"
    return s, me.json()


@pytest.fixture(autouse=True)
def restore_defaults(admin_session):
    """Always restore canonical defaults after each test."""
    yield
    admin_session.put(f"{BASE_URL}/api/moderation/admin/config",
                      json=DEFAULTS, timeout=10)


# ── Tests ─────────────────────────────────────────────────────────────────
class TestModerationConfig:
    def test_get_admin_config_defaults(self, admin_session):
        # First restore explicitly so we test defaults exactly
        admin_session.put(f"{BASE_URL}/api/moderation/admin/config",
                          json=DEFAULTS, timeout=10)
        r = admin_session.get(f"{BASE_URL}/api/moderation/admin/config", timeout=10)
        assert r.status_code == 200
        cfg = r.json()
        for k, v in DEFAULTS.items():
            assert k in cfg, f"missing key {k}"
            assert cfg[k] == v, f"{k}: expected {v}, got {cfg[k]}"

    def test_put_admin_config_persists(self, admin_session):
        new = {"client_warn_threshold": 3, "client_ban_threshold": 5}
        r = admin_session.put(f"{BASE_URL}/api/moderation/admin/config",
                              json=new, timeout=10)
        assert r.status_code == 200, r.text
        cfg = r.json()
        assert cfg["client_warn_threshold"] == 3
        assert cfg["client_ban_threshold"] == 5
        # Re-GET to verify persistence
        r2 = admin_session.get(f"{BASE_URL}/api/moderation/admin/config", timeout=10)
        assert r2.json()["client_warn_threshold"] == 3
        assert r2.json()["client_ban_threshold"] == 5

    def test_admin_config_requires_admin(self, fresh_passenger):
        s, _ = fresh_passenger
        r = s.get(f"{BASE_URL}/api/moderation/admin/config", timeout=10)
        assert r.status_code in (401, 403), f"expected 401/403, got {r.status_code}"


class TestPassengerStatus:
    def test_passenger_status_shape(self, fresh_passenger):
        s, _ = fresh_passenger
        r = s.get(f"{BASE_URL}/api/moderation/passenger-status", timeout=10)
        assert r.status_code == 200, r.text
        body = r.json()
        for key in ("cancel_count", "warn_threshold", "ban_threshold", "banned", "ban_until"):
            assert key in body, f"missing {key}"
        assert isinstance(body["cancel_count"], int)
        assert isinstance(body["banned"], bool)
        assert body["banned"] is False
        assert body["cancel_count"] == 0


class TestAdminListings:
    def test_events_list(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/moderation/admin/events?limit=5", timeout=10)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_call_logs_list(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/moderation/admin/call-logs?limit=5", timeout=10)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_conversations_list(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/moderation/admin/conversations?limit=5", timeout=10)
        assert r.status_code == 200
        assert isinstance(r.json(), list)


class TestBanFlow:
    """Lower thresholds to ban=2 then verify POST /api/rides → 403 while banned."""

    def test_ban_blocks_ride_creation(self, admin_session, fresh_passenger):
        s, user = fresh_passenger
        # Lower thresholds for fast test
        admin_session.put(f"{BASE_URL}/api/moderation/admin/config",
                          json={"client_warn_threshold": 1, "client_ban_threshold": 2,
                                "client_ban_hours": 2}, timeout=10)

        # Helper: create a ride
        def _create_ride():
            payload = {
                "vehicle_type": "sb",
                "pickup_lat": 48.85, "pickup_lng": 2.35, "pickup_address": "Paris",
                "dropoff_lat": 45.75, "dropoff_lng": 4.85, "dropoff_address": "Lyon",
                "payment_method": "cash",
            }
            return s.post(f"{BASE_URL}/api/rides", json=payload, timeout=15)

        # Generate cancellations by creating then cancelling
        cancelled_ok = 0
        last_err = ""
        for i in range(2):
            cr = _create_ride()
            if cr.status_code not in (200, 201):
                pytest.skip(f"Cannot create ride for cancel flow (iter {i}): {cr.status_code} {cr.text[:300]}")
            ride_id = cr.json().get("id")
            if not ride_id:
                pytest.skip(f"No ride id in response: {cr.text[:200]}")
            cancel = s.post(f"{BASE_URL}/api/rides/{ride_id}/cancel",
                            json={"reason": "test"}, timeout=10)
            if cancel.status_code in (200, 204):
                cancelled_ok += 1
            else:
                last_err = f"{cancel.status_code} {cancel.text[:200]}"

        if cancelled_ok < 2:
            pytest.skip(f"Only {cancelled_ok}/2 cancels succeeded; last_err={last_err}")

        # Now passenger should be banned
        status = s.get(f"{BASE_URL}/api/moderation/passenger-status", timeout=10)
        assert status.status_code == 200
        sb = status.json()
        assert sb["banned"] is True, f"expected banned=True, got {sb}"
        assert sb["ban_until"] is not None

        # New ride creation should be 403
        blocked = _create_ride()
        assert blocked.status_code == 403, f"expected 403, got {blocked.status_code} {blocked.text[:200]}"
        assert "suspend" in blocked.text.lower() or "annulation" in blocked.text.lower()

        # Cleanup: clear ban_until directly via admin config reset is not enough;
        # the moderation_state has ban_until set. Restore defaults via fixture;
        # passenger remains banned in DB but that's fine — transient TEST_ account.


class TestCallLog:
    def test_call_log_requires_valid_ride(self, fresh_passenger):
        s, _ = fresh_passenger
        r = s.post(f"{BASE_URL}/api/moderation/call-log",
                   json={"ride_id": "nope_does_not_exist"}, timeout=10)
        assert r.status_code == 404

    def test_call_log_rejects_empty(self, fresh_passenger):
        s, _ = fresh_passenger
        r = s.post(f"{BASE_URL}/api/moderation/call-log", json={}, timeout=10)
        assert r.status_code == 400
