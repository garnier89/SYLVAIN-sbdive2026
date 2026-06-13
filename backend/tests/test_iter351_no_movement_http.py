"""Iter351 — HTTP tests for the 'no-movement' admin dispatch endpoints.

Validates:
- GET/PUT /api/admin/dispatch/no-movement/config (admin) round-trip + clamping
- GET /api/admin/dispatch/no-movement/reassignments?hours=48 (admin)
- gating: unauth -> 401/403, PUT requires admin role
"""
import os
import requests
import pytest
from dotenv import load_dotenv

load_dotenv("/app/frontend/.env")

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL must be set"

ADMIN_EMAIL = "admin@superapp.com"
ADMIN_PWD = "SuperAdmin123!"


@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login",
               json={"email": ADMIN_EMAIL, "password": ADMIN_PWD}, timeout=20)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text[:200]}"
    data = r.json()
    token = data.get("access_token") or data.get("token")
    if token:
        s.headers.update({"Authorization": f"Bearer {token}"})
    # also ensure /me works
    me = s.get(f"{BASE_URL}/api/auth/me", timeout=15)
    assert me.status_code == 200, f"/auth/me failed: {me.status_code}"
    assert me.json().get("role") == "admin"
    return s


# ───────────── Gating (no auth) ─────────────
class TestGating:
    def test_get_config_requires_auth(self):
        r = requests.get(f"{BASE_URL}/api/admin/dispatch/no-movement/config", timeout=15)
        assert r.status_code in (401, 403), f"got {r.status_code}: {r.text[:200]}"

    def test_put_config_requires_auth(self):
        r = requests.put(f"{BASE_URL}/api/admin/dispatch/no-movement/config",
                         json={"enabled": True}, timeout=15)
        assert r.status_code in (401, 403)

    def test_reassignments_requires_auth(self):
        r = requests.get(f"{BASE_URL}/api/admin/dispatch/no-movement/reassignments?hours=48",
                         timeout=15)
        assert r.status_code in (401, 403)


# ───────────── Admin reads & writes ─────────────
class TestNoMovementConfig:
    def test_get_config_shape(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/admin/dispatch/no-movement/config", timeout=15)
        assert r.status_code == 200, r.text[:200]
        body = r.json()
        for k in ("enabled", "minutes", "threshold_m"):
            assert k in body, f"missing field {k}"
        assert isinstance(body["enabled"], bool)
        assert isinstance(body["minutes"], int)
        assert isinstance(body["threshold_m"], int)

    def test_put_config_persists_and_clamps(self, admin_session):
        # 1) set to 4 / 120
        r = admin_session.put(
            f"{BASE_URL}/api/admin/dispatch/no-movement/config",
            json={"enabled": True, "minutes": 4, "threshold_m": 120},
            timeout=15,
        )
        assert r.status_code == 200, r.text[:200]
        body = r.json()
        assert body["enabled"] is True
        assert body["minutes"] == 4
        assert body["threshold_m"] == 120

        # 2) GET reflects the same values
        r2 = admin_session.get(f"{BASE_URL}/api/admin/dispatch/no-movement/config", timeout=15)
        assert r2.status_code == 200
        b2 = r2.json()
        assert b2["minutes"] == 4 and b2["threshold_m"] == 120 and b2["enabled"] is True

        # 3) clamp: 9999 minutes / 99999 m → must clamp to 60 / 2000
        r3 = admin_session.put(
            f"{BASE_URL}/api/admin/dispatch/no-movement/config",
            json={"minutes": 9999, "threshold_m": 99999},
            timeout=15,
        )
        assert r3.status_code == 200, r3.text[:200]
        b3 = r3.json()
        assert b3["minutes"] == 60, f"expected clamp to 60 got {b3['minutes']}"
        assert b3["threshold_m"] == 2000, f"expected clamp to 2000 got {b3['threshold_m']}"

        # 4) lower clamp: 0 / 10 → 1 / 30
        r4 = admin_session.put(
            f"{BASE_URL}/api/admin/dispatch/no-movement/config",
            json={"minutes": 0, "threshold_m": 10},
            timeout=15,
        )
        assert r4.status_code == 200
        b4 = r4.json()
        assert b4["minutes"] == 1 and b4["threshold_m"] == 30

        # 5) restore defaults 5 / 150
        r5 = admin_session.put(
            f"{BASE_URL}/api/admin/dispatch/no-movement/config",
            json={"enabled": True, "minutes": 5, "threshold_m": 150},
            timeout=15,
        )
        assert r5.status_code == 200
        b5 = r5.json()
        assert b5["minutes"] == 5 and b5["threshold_m"] == 150 and b5["enabled"] is True


# ───────────── Reassignments list ─────────────
class TestNoMovementReassignments:
    def test_reassignments_shape(self, admin_session):
        r = admin_session.get(
            f"{BASE_URL}/api/admin/dispatch/no-movement/reassignments?hours=48",
            timeout=20,
        )
        assert r.status_code == 200, r.text[:200]
        body = r.json()
        assert "count" in body
        assert "items" in body
        assert isinstance(body["items"], list)
        assert body["count"] == len(body["items"])
        # If any item exists, validate shape
        if body["items"]:
            it = body["items"][0]
            for k in ("ride_id", "driver_id", "driver_name", "created_at"):
                assert k in it, f"item missing {k}: {it}"
