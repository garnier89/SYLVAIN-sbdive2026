"""Iter 170 — Functional audit of admin modules: Promocodes, ServiceConfig,
CMS (home-categories, promo-banners, news), Newsletter."""

import os
import random
import string

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://gojek-clone-41.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

from _creds import ADMIN_EMAIL, ADMIN_PASSWORD  # noqa: E402


def _rand_suffix(n=6):
    return "".join(random.choices(string.ascii_uppercase + string.digits, k=n))


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=30)
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    tok = r.json().get("access_token") or r.json().get("token")
    assert tok, f"No token in login response: {r.json()}"
    return tok


@pytest.fixture(scope="module")
def auth_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


# ===== Promocodes =====
class TestPromocodes:
    def test_admin_list_coupons(self, auth_headers):
        r = requests.get(f"{API}/coupons/admin/all", headers=auth_headers, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, list)

    def test_create_coupon_persists(self, auth_headers):
        code = f"AUDIT{_rand_suffix()}"
        payload = {
            "code": code,
            "description": "audit test",
            "discount_type": "Percentage",
            "discount_value": 15,
            "usage_limit": 100,
            "per_user_limit": 1,
            "service_type": "All",
        }
        r = requests.post(f"{API}/coupons/admin/create", json=payload, headers=auth_headers, timeout=30)
        assert r.status_code == 200, r.text
        created = r.json()
        assert created["code"] == code
        assert created["discount_type"] == "Percentage"
        assert created["discount_value"] == 15
        assert created["usage_limit"] == 100
        assert created.get("used") == 0
        assert created.get("status") == "active"

        # Verify via list
        r2 = requests.get(f"{API}/coupons/admin/all", headers=auth_headers, timeout=30)
        assert r2.status_code == 200
        found = [c for c in r2.json() if c.get("code") == code]
        assert len(found) == 1
        assert found[0]["discount_value"] == 15
        assert found[0]["discount_type"] == "Percentage"


# ===== Service Config =====
class TestServiceConfig:
    def test_get_pool_config(self, auth_headers):
        r = requests.get(f"{API}/admin/service-config/pool", headers=auth_headers, timeout=30)
        assert r.status_code == 200, r.text
        assert isinstance(r.json(), dict)

    def test_pool_config_save_and_persist(self, auth_headers):
        # Read current
        cur = requests.get(f"{API}/admin/service-config/pool", headers=auth_headers, timeout=30).json()
        settings = dict(cur.get("settings") or {})
        marker_value = random.randint(1, 9999)
        settings["audit_marker"] = marker_value
        settings["enable_pool"] = True
        r = requests.put(
            f"{API}/admin/service-config/pool",
            json={"settings": settings},
            headers=auth_headers, timeout=30,
        )
        assert r.status_code == 200, r.text
        # Reload
        r2 = requests.get(f"{API}/admin/service-config/pool", headers=auth_headers, timeout=30)
        assert r2.status_code == 200
        loaded = r2.json()
        assert loaded.get("settings", {}).get("audit_marker") == marker_value, f"Persistence failed: {loaded}"

    def test_taxi_booking_config_get(self, auth_headers):
        r = requests.get(f"{API}/admin/service-config/taxi_booking", headers=auth_headers, timeout=30)
        assert r.status_code == 200, r.text
        assert isinstance(r.json(), dict)


# ===== CMS — Home Categories =====
class TestHomeCategoriesCMS:
    def test_admin_list(self, auth_headers):
        r = requests.get(f"{API}/home-categories/admin", headers=auth_headers, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        # The endpoint returns a dict with 'items', 'sections', 'icons'
        assert isinstance(data, dict)
        assert "items" in data and isinstance(data["items"], list)
        assert len(data["items"]) > 0, "No home categories returned"

    def test_sections_list(self, auth_headers):
        r = requests.get(f"{API}/home-categories/admin/sections", headers=auth_headers, timeout=30)
        assert r.status_code == 200, r.text


# ===== CMS — Promo Banners =====
class TestPromoBannersCMS:
    def test_admin_list_banners(self, auth_headers):
        r = requests.get(f"{API}/promo-banners/admin", headers=auth_headers, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, list) or isinstance(data, dict)


# ===== CMS — News =====
class TestNewsCMS:
    def test_admin_list_news(self, auth_headers):
        r = requests.get(f"{API}/news/admin", headers=auth_headers, timeout=30)
        assert r.status_code == 200, r.text


# ===== Newsletter =====
class TestNewsletter:
    def test_subscribe_seed(self):
        # Seed a subscriber so KPIs > 0
        email = f"audit_{_rand_suffix().lower()}@example.test"
        r = requests.post(f"{API}/newsletter/subscribe", json={"email": email}, timeout=30)
        assert r.status_code in [200, 201], r.text

    def test_list_subscribers(self, auth_headers):
        r = requests.get(f"{API}/newsletter/admin/subscribers", headers=auth_headers, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "active" in data
        assert "subscribers" in data
        assert data["active"] >= 1

    def test_list_campaigns(self, auth_headers):
        r = requests.get(f"{API}/newsletter/admin/campaigns", headers=auth_headers, timeout=30)
        assert r.status_code == 200, r.text
        assert isinstance(r.json(), list)

    def test_send_newsletter_creates_campaign(self, auth_headers):
        before = requests.get(f"{API}/newsletter/admin/campaigns", headers=auth_headers, timeout=30).json()
        payload = {"subject": f"Audit {_rand_suffix()}", "body": "Hello from audit test"}
        r = requests.post(f"{API}/newsletter/admin/send", json=payload, headers=auth_headers, timeout=60)
        assert r.status_code == 200, r.text
        camp = r.json()
        assert camp.get("status") in ["recorded", "sent", "failed"]
        assert camp.get("subject", "").startswith("Audit")
        # Verify shows up in history
        after = requests.get(f"{API}/newsletter/admin/campaigns", headers=auth_headers, timeout=30).json()
        assert len(after) >= len(before) + 1
