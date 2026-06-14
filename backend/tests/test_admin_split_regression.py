"""Regression tests for routes/admin.py → routes/admin/ package split.

Goal: exercise endpoints across ALL 11 admin domain modules (especially write ops)
to detect any helper/constant that didn't make it into _common during the split.
A NameError/AttributeError 500 here would indicate a missing helper.
"""
import os
import time
import uuid

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://gojek-clone-41.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@superapp.com"
ADMIN_PASSWORD = "SuperAdmin123!"


# ---------- fixtures ----------
@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=20)
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text[:300]}"
    data = r.json()
    token = data.get("access_token") or data.get("token")
    user = data.get("user") or {}
    assert token, f"No token in login response: {data}"
    assert user.get("role") == "admin", f"Expected admin role, got {user.get('role')} → {data}"
    return token


@pytest.fixture(scope="session")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


def _ok(r, *codes):
    codes = codes or (200,)
    assert r.status_code in codes, f"{r.request.method} {r.request.url} → {r.status_code} {r.text[:400]}"
    return r


# ---------- Auth (precondition) ----------
class TestAdminAuth:
    def test_admin_login_returns_role_admin(self, admin_token):
        # If fixture succeeds we already verified the contract.
        assert admin_token


# ---------- Vehicle types ----------
class TestVehicleTypesDomain:
    def test_list(self, admin_headers):
        r = _ok(requests.get(f"{API}/admin/vehicle-types", headers=admin_headers, timeout=15))
        body = r.json()
        assert isinstance(body, (list, dict))

    def test_crud_vehicle_type(self, admin_headers):
        slug = f"test_vt_{uuid.uuid4().hex[:6]}"
        payload = {
            "slug": slug,
            "label": "Test Vehicle",
            "name": "Test Vehicle",
            "category": "vtc",
        }
        r = requests.post(f"{API}/admin/vehicle-types", json=payload, headers=admin_headers, timeout=15)
        assert r.status_code in (200, 201), f"create VT: {r.status_code} {r.text[:400]}"

        # update by slug (route is /vehicle-types/{slug}) — use a whitelisted VT field
        upd = requests.put(f"{API}/admin/vehicle-types/{slug}", json={"name_fr": "Test Vehicle v2", "base_fare": 6.0}, headers=admin_headers, timeout=15)
        assert upd.status_code in (200, 204), f"update VT: {upd.status_code} {upd.text[:400]}"

        # delete
        d = requests.delete(f"{API}/admin/vehicle-types/{slug}", headers=admin_headers, timeout=15)
        assert d.status_code in (200, 204), f"delete VT: {d.status_code} {d.text[:400]}"


# ---------- Driver categories ----------
class TestDriverCategoriesDomain:
    def test_list(self, admin_headers):
        r = _ok(requests.get(f"{API}/admin/driver-categories", headers=admin_headers, timeout=15))
        assert isinstance(r.json(), (list, dict))

    def test_crud_driver_category(self, admin_headers):
        suffix = uuid.uuid4().hex[:6]
        explicit_id = f"test_dc_{suffix}"
        payload = {
            "id": explicit_id,
            "service": "taxi",
            "vehicle_class": "car",
            "taxi_sub": "vtc",
            "label": f"Test DC {suffix}",
            "documents": [{"key": "id_card", "label": "Pièce d'identité", "required": True}],
            "order": 99,
            "active": True,
        }
        r = requests.post(f"{API}/admin/driver-categories", json=payload, headers=admin_headers, timeout=15)
        assert r.status_code in (200, 201), f"create DC: {r.status_code} {r.text[:400]}"

        upd = requests.put(
            f"{API}/admin/driver-categories/{explicit_id}",
            json={**payload, "label": f"Test DC {suffix} v2"},
            headers=admin_headers, timeout=15,
        )
        assert upd.status_code in (200, 204), f"update DC: {upd.status_code} {upd.text[:400]}"

        d = requests.delete(f"{API}/admin/driver-categories/{explicit_id}", headers=admin_headers, timeout=15)
        assert d.status_code in (200, 204), f"delete DC: {d.status_code} {d.text[:400]}"


# ---------- Merchants ----------
class TestMerchantsDomain:
    def test_list_all(self, admin_headers):
        r = _ok(requests.get(f"{API}/admin/merchants?status=all", headers=admin_headers, timeout=20))
        body = r.json()
        assert isinstance(body, (list, dict))

    def test_list_pending(self, admin_headers):
        r = _ok(requests.get(f"{API}/admin/merchants?status=pending", headers=admin_headers, timeout=20))
        assert isinstance(r.json(), (list, dict))


# ---------- Users / stats / wallet ----------
class TestUsersDomain:
    def test_admin_stats(self, admin_headers):
        r = _ok(requests.get(f"{API}/admin/stats", headers=admin_headers, timeout=15))
        assert isinstance(r.json(), dict)

    def test_wallet_reserve_config_get_put(self, admin_headers):
        g = _ok(requests.get(f"{API}/admin/wallet-reserve-config", headers=admin_headers, timeout=15))
        cur = g.json() if isinstance(g.json(), dict) else {}
        # PUT same value back to avoid behavior change
        p = requests.put(f"{API}/admin/wallet-reserve-config", json=cur or {"reserve_amount": 0}, headers=admin_headers, timeout=15)
        assert p.status_code in (200, 204), f"PUT wallet-reserve-config: {p.status_code} {p.text[:300]}"

    def test_get_user_by_id_and_credit_wallet(self, admin_headers):
        # find admin user from /auth/me
        me = requests.get(f"{API}/auth/me", headers=admin_headers, timeout=15)
        if me.status_code != 200:
            pytest.skip("auth/me unavailable")
        uid = me.json().get("id") or me.json().get("_id")
        if not uid:
            pytest.skip("no user id from /auth/me")
        g = requests.get(f"{API}/admin/users/{uid}", headers=admin_headers, timeout=15)
        assert g.status_code in (200, 404), f"GET admin/users/{{id}}: {g.status_code} {g.text[:300]}"
        # credit 0 (no-op to avoid state change but exercises the route + helper imports)
        c = requests.post(f"{API}/admin/users/{uid}/wallet/credit", json={"amount": 0, "reason": "TEST_split_regression"}, headers=admin_headers, timeout=15)
        # Some impls reject amount=0; we mostly care that we don't get a NameError 500.
        assert c.status_code != 500 or "NameError" not in c.text and "AttributeError" not in c.text, f"credit wallet 500: {c.text[:400]}"
        assert c.status_code in (200, 201, 204, 400, 422), f"credit wallet: {c.status_code} {c.text[:400]}"


# ---------- Settings / CRUD / backup ----------
class TestSettingsDomain:
    def test_settings_get(self, admin_headers):
        r = _ok(requests.get(f"{API}/admin/settings", headers=admin_headers, timeout=15))
        assert isinstance(r.json(), (dict, list))

    def test_settings_put_noop(self, admin_headers):
        g = requests.get(f"{API}/admin/settings", headers=admin_headers, timeout=15).json()
        payload = g if isinstance(g, dict) else {}
        p = requests.put(f"{API}/admin/settings", json=payload, headers=admin_headers, timeout=15)
        assert p.status_code in (200, 204), f"PUT settings: {p.status_code} {p.text[:300]}"

    @pytest.mark.parametrize("key", ["ride", "delivery", "transport", "general"])
    def test_service_config(self, admin_headers, key):
        r = requests.get(f"{API}/admin/service-config/{key}", headers=admin_headers, timeout=15)
        # 404 acceptable for keys not configured; 500 NameError is NOT.
        assert r.status_code in (200, 404), f"service-config/{key}: {r.status_code} {r.text[:300]}"
        if r.status_code == 500:
            pytest.fail(f"500 on service-config/{key}: {r.text[:400]}")

    @pytest.mark.parametrize("collection", ["banners", "promocodes", "faqs"])
    def test_crud_collection_list(self, admin_headers, collection):
        r = requests.get(f"{API}/admin/crud/{collection}", headers=admin_headers, timeout=20)
        assert r.status_code == 200, f"crud/{collection}: {r.status_code} {r.text[:300]}"

    def test_db_backup(self, admin_headers):
        r = requests.get(f"{API}/admin/db-backup", headers=admin_headers, timeout=60)
        # tolerate large response / 200 / 202
        assert r.status_code in (200, 202), f"db-backup: {r.status_code} {r.text[:300]}"


# ---------- Rewards (the critical cross-module helper) ----------
class TestRewardsDomain:
    def test_rewards_config_get(self, admin_headers):
        r = _ok(requests.get(f"{API}/admin/rewards/config", headers=admin_headers, timeout=15))
        body = r.json()
        assert isinstance(body, dict)
        # DEFAULT_REWARDS_CONFIG likely has these keys; tolerate missing but ensure non-empty dict
        assert len(body) >= 1

    def test_rewards_config_zones(self, admin_headers):
        r = _ok(requests.get(f"{API}/admin/rewards/config/zones", headers=admin_headers, timeout=15))
        assert isinstance(r.json(), (list, dict))

    def test_rewards_config_put_roundtrip(self, admin_headers):
        cur = requests.get(f"{API}/admin/rewards/config", headers=admin_headers, timeout=15).json()
        p = requests.put(f"{API}/admin/rewards/config", json=cur, headers=admin_headers, timeout=15)
        assert p.status_code in (200, 204), f"PUT rewards/config: {p.status_code} {p.text[:400]}"


# ---------- Analytics ----------
class TestAnalyticsDomain:
    @pytest.mark.parametrize("endpoint", [
        "/admin/analytics?period=week",
        "/admin/analytics/breakdown",
        "/admin/analytics/delivery-monthly",
        "/admin/reports/negotiation-gap",
        "/admin/reports/no-driver-stats",
    ])
    def test_endpoint(self, admin_headers, endpoint):
        r = requests.get(f"{API}{endpoint}", headers=admin_headers, timeout=30)
        assert r.status_code == 200, f"{endpoint}: {r.status_code} {r.text[:400]}"


# ---------- Monitoring ----------
class TestMonitoringDomain:
    @pytest.mark.parametrize("endpoint", [
        "/admin/live-rides",
        "/admin/heatmap/drivers",
        "/admin/heatmap/rides",
        "/admin/zone-alerts",
    ])
    def test_endpoint(self, admin_headers, endpoint):
        r = requests.get(f"{API}{endpoint}", headers=admin_headers, timeout=20)
        assert r.status_code == 200, f"{endpoint}: {r.status_code} {r.text[:400]}"


# ---------- Onboarding ----------
class TestOnboardingDomain:
    def test_onboarding_list(self, admin_headers):
        r = requests.get(f"{API}/admin/onboarding", headers=admin_headers, timeout=15)
        assert r.status_code == 200, f"onboarding: {r.status_code} {r.text[:300]}"


# ---------- Cross-module helper consumers ----------
class TestCrossModuleRewardsHelper:
    """routes/drivers.py and routes/rides.py do `from routes.admin import get_rewards_config`.
    If the re-export is broken, those endpoints would raise ImportError at request time."""

    def test_get_rewards_config_importable(self):
        # In-process import to assert the package re-export still resolves.
        import importlib, sys, os as _os
        backend_dir = _os.path.abspath(_os.path.join(_os.path.dirname(__file__), ".."))
        if backend_dir not in sys.path:
            sys.path.insert(0, backend_dir)
        mod = importlib.import_module("routes.admin")
        assert hasattr(mod, "get_rewards_config"), "routes.admin.get_rewards_config missing"
        assert hasattr(mod, "DEFAULT_REWARDS_CONFIG"), "routes.admin.DEFAULT_REWARDS_CONFIG missing"
        assert hasattr(mod, "_clean_driver_category"), "routes.admin._clean_driver_category missing"
        # call it — must not raise (it's an async helper)
        import asyncio
        coro_or_val = mod.get_rewards_config()
        if asyncio.iscoroutine(coro_or_val):
            cfg = asyncio.new_event_loop().run_until_complete(coro_or_val)
        else:
            cfg = coro_or_val
        assert isinstance(cfg, dict)

    def test_driver_facing_rewards_path(self, admin_headers):
        """Hit a driver-side endpoint that lazily imports get_rewards_config (rewards-related driver endpoint).
        If the import is broken, response would 500 with ImportError."""
        # Try a few candidate driver endpoints; we only care none 500 due to missing helper.
        candidates = [
            "/drivers/rewards/config",
            "/drivers/rewards",
            "/drivers/loyalty",
            "/drivers/me/rewards",
        ]
        any_hit = False
        for ep in candidates:
            r = requests.get(f"{API}{ep}", headers=admin_headers, timeout=15)
            if r.status_code == 500 and ("ImportError" in r.text or "NameError" in r.text or "AttributeError" in r.text):
                pytest.fail(f"{ep} raised import-related 500: {r.text[:400]}")
            if r.status_code in (200, 401, 403, 404, 405, 422):
                any_hit = True
        assert any_hit, "No driver rewards-related endpoint reachable for cross-module test"
