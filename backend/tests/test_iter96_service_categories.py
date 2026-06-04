"""
Iteration 96 — Phase A SERVICES: Manage Taxi service categories.

Validates:
- GET /api/service-categories (public): returns 17 categories with 'active' field.
- GET /api/admin/service-categories (admin): returns list.
- POST /api/admin/service-categories/{key}/toggle: toggles 'active'.
- PUT /api/admin/service-categories/{key}: updates name / name_en / icon.
- After toggling OFF a key (e.g. 'tuktuk'), public GET reflects active=false.

Always restores every category to active=True at the end.
"""
import os
import pytest
import requests
from pathlib import Path


def _load_backend_url():
    url = os.environ.get('REACT_APP_BACKEND_URL')
    if not url:
        env_path = Path('/app/frontend/.env')
        if env_path.exists():
            for line in env_path.read_text().splitlines():
                if line.startswith('REACT_APP_BACKEND_URL='):
                    url = line.split('=', 1)[1].strip()
                    break
    if not url:
        raise RuntimeError("REACT_APP_BACKEND_URL not configured")
    return url.rstrip('/')


BASE_URL = _load_backend_url()
ADMIN_EMAIL = "admin@superapp.com"
ADMIN_PASSWORD = "SuperAdmin123!"

EXPECTED_KEYS = {
    "standard", "pool", "electric", "moto", "rental", "intercity",
    "book_later", "moto_rental", "buddy_driver", "bidding", "airport",
    "pets", "book_for_someone", "tuktuk", "assist", "corporate", "access",
}


@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE_URL}/api/auth/login",
               json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    token = r.json().get("access_token") or r.json().get("token")
    assert token, f"No access_token in response: {r.json()}"
    s.headers.update({"Authorization": f"Bearer {token}"})
    return s


@pytest.fixture(scope="module", autouse=True)
def restore_all_active(admin_session):
    """Teardown: ensure every category is re-activated after the test module."""
    yield
    try:
        r = admin_session.get(f"{BASE_URL}/api/admin/service-categories")
        if r.status_code == 200:
            for c in r.json():
                if not c.get("active", True):
                    admin_session.post(
                        f"{BASE_URL}/api/admin/service-categories/{c['key']}/toggle")
    except Exception as e:
        print(f"[restore_all_active] cleanup error: {e}")


class TestPublicServiceCategories:
    def test_public_list_returns_17_with_active_field(self):
        r = requests.get(f"{BASE_URL}/api/service-categories")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        assert len(data) == 17, f"Expected 17 categories, got {len(data)}"
        keys = {c["key"] for c in data}
        assert keys == EXPECTED_KEYS, f"Key mismatch: extra={keys-EXPECTED_KEYS} missing={EXPECTED_KEYS-keys}"
        for c in data:
            assert "active" in c, f"Missing 'active' in {c['key']}"
            assert isinstance(c["active"], bool)
            assert "name" in c and "icon" in c
            assert "_id" not in c, "MongoDB _id leaked to public response"


class TestAdminServiceCategories:
    def test_admin_list(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/admin/service-categories")
        assert r.status_code == 200
        data = r.json()
        assert len(data) == 17
        for c in data:
            assert "_id" not in c

    def test_toggle_tuktuk_off_then_public_reflects_inactive(self, admin_session):
        # Toggle OFF
        r = admin_session.post(
            f"{BASE_URL}/api/admin/service-categories/tuktuk/toggle")
        assert r.status_code == 200
        body = r.json()
        assert body["key"] == "tuktuk"
        assert body["active"] is False

        # Public GET reflects the change
        pub = requests.get(f"{BASE_URL}/api/service-categories").json()
        tuktuk = next(c for c in pub if c["key"] == "tuktuk")
        assert tuktuk["active"] is False

        # Toggle back ON
        r2 = admin_session.post(
            f"{BASE_URL}/api/admin/service-categories/tuktuk/toggle")
        assert r2.status_code == 200
        assert r2.json()["active"] is True

        pub2 = requests.get(f"{BASE_URL}/api/service-categories").json()
        tuktuk2 = next(c for c in pub2 if c["key"] == "tuktuk")
        assert tuktuk2["active"] is True

    def test_update_category_name_and_icon(self, admin_session):
        # Snapshot current values for 'electric'
        before = next(c for c in admin_session.get(
            f"{BASE_URL}/api/admin/service-categories").json() if c["key"] == "electric")
        original_name = before["name"]
        original_name_en = before.get("name_en", "")
        original_icon = before.get("icon", "🌿")

        # Update
        payload = {"name": "TEST_Green Edited", "name_en": "TEST_Green EN", "icon": "🌱"}
        r = admin_session.put(
            f"{BASE_URL}/api/admin/service-categories/electric", json=payload)
        assert r.status_code == 200
        updated = r.json()
        assert updated["name"] == "TEST_Green Edited"
        assert updated["name_en"] == "TEST_Green EN"
        assert updated["icon"] == "🌱"

        # Verify persistence via public endpoint
        pub = requests.get(f"{BASE_URL}/api/service-categories").json()
        electric = next(c for c in pub if c["key"] == "electric")
        assert electric["name"] == "TEST_Green Edited"
        assert electric["icon"] == "🌱"

        # Restore original values
        restore = admin_session.put(
            f"{BASE_URL}/api/admin/service-categories/electric",
            json={"name": original_name, "name_en": original_name_en, "icon": original_icon})
        assert restore.status_code == 200

    def test_update_unknown_key_returns_404(self, admin_session):
        r = admin_session.put(
            f"{BASE_URL}/api/admin/service-categories/__does_not_exist__",
            json={"name": "x"})
        assert r.status_code == 404

    def test_toggle_unknown_key_returns_404(self, admin_session):
        r = admin_session.post(
            f"{BASE_URL}/api/admin/service-categories/__nope__/toggle")
        assert r.status_code == 404

    def test_admin_endpoint_requires_auth(self):
        r = requests.get(f"{BASE_URL}/api/admin/service-categories")
        assert r.status_code in (401, 403)
