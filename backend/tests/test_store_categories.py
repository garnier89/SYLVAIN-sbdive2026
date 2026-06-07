"""
Store Delivery categories (V3Cube Services → Store Delivery).

Validates:
- GET /api/store-categories (public): 9 verticals with active/age_restriction/delivery_vehicle.
- GET /api/admin/store-categories (admin): list.
- POST /api/admin/store-categories/{key}/toggle: toggles active (reflected in public).
- PUT /api/admin/store-categories/{key}: updates name / age_restriction / delivery_vehicle.
- POST /api/admin/store-categories/reorder: reorders by display_order.

Restores every category (active + defaults) at the end.
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
from _creds import ADMIN_EMAIL, ADMIN_PASSWORD  # noqa: E402

EXPECTED_KEYS = {
    "food", "grocery", "medicine", "flowers", "stationery",
    "wine", "water", "supermarket", "construction",
}


@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE_URL}/api/auth/login",
               json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    token = r.json().get("access_token") or r.json().get("token")
    if token:
        s.headers.update({"Authorization": f"Bearer {token}"})
    return s


@pytest.fixture(scope="module", autouse=True)
def restore_defaults(admin_session):
    yield
    try:
        admin_session.put(f"{BASE_URL}/api/admin/store-categories/grocery",
                          json={"name": "Livraison Courses", "age_restriction": 0, "delivery_vehicle": "any"})
        admin_session.post(f"{BASE_URL}/api/admin/store-categories/reorder",
                           json={"ordered_keys": ["food", "grocery", "medicine", "flowers",
                                                  "stationery", "wine", "water", "supermarket", "construction"]})
        r = admin_session.get(f"{BASE_URL}/api/admin/store-categories")
        if r.status_code == 200:
            for c in r.json():
                if not c.get("active", True):
                    admin_session.post(f"{BASE_URL}/api/admin/store-categories/{c['key']}/toggle")
    except Exception as e:
        print(f"[restore_defaults] cleanup error: {e}")


class TestPublicStoreCategories:
    def test_public_list(self):
        r = requests.get(f"{BASE_URL}/api/store-categories")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        keys = {c["key"] for c in data}
        assert keys == EXPECTED_KEYS, f"extra={keys-EXPECTED_KEYS} missing={EXPECTED_KEYS-keys}"
        for c in data:
            assert isinstance(c["active"], bool)
            assert "name" in c and "icon" in c and "path" in c
            assert "age_restriction" in c and "delivery_vehicle" in c
            assert "_id" not in c, "MongoDB _id leaked"
        wine = next(c for c in data if c["key"] == "wine")
        assert wine["age_restriction"] == 18


class TestAdminStoreCategories:
    def test_admin_list(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/admin/store-categories")
        assert r.status_code == 200
        assert len(r.json()) == 9

    def test_toggle_reflects_in_public(self, admin_session):
        r = admin_session.post(f"{BASE_URL}/api/admin/store-categories/wine/toggle")
        assert r.status_code == 200 and r.json()["active"] is False
        pub = requests.get(f"{BASE_URL}/api/store-categories").json()
        wine = next(c for c in pub if c["key"] == "wine")
        assert wine["active"] is False
        # toggle back on
        r2 = admin_session.post(f"{BASE_URL}/api/admin/store-categories/wine/toggle")
        assert r2.json()["active"] is True

    def test_update_fields(self, admin_session):
        r = admin_session.put(f"{BASE_URL}/api/admin/store-categories/grocery",
                              json={"name": "Courses Express", "age_restriction": 21, "delivery_vehicle": "moto"})
        assert r.status_code == 200
        c = r.json()
        assert c["name"] == "Courses Express"
        assert c["age_restriction"] == 21
        assert c["delivery_vehicle"] == "moto"

    def test_update_unknown_404(self, admin_session):
        r = admin_session.put(f"{BASE_URL}/api/admin/store-categories/nope",
                              json={"name": "X"})
        assert r.status_code == 404

    def test_reorder(self, admin_session):
        r = admin_session.post(f"{BASE_URL}/api/admin/store-categories/reorder",
                               json={"ordered_keys": ["grocery", "food", "medicine", "flowers",
                                                      "stationery", "wine", "water", "supermarket", "construction"]})
        assert r.status_code == 200 and r.json()["count"] == 9
        data = admin_session.get(f"{BASE_URL}/api/admin/store-categories").json()
        assert data[0]["key"] == "grocery"

    def test_requires_admin(self):
        r = requests.get(f"{BASE_URL}/api/admin/store-categories")
        assert r.status_code in (401, 403)


class TestStoreCategoryZoneScope:
    """Lot 3: a category scoped to a zone is hidden in non-matching zones."""

    def test_scope_filters_by_location(self, admin_session):
        try:
            r = admin_session.put(f"{BASE_URL}/api/admin/store-categories/wine",
                                  json={"scope": {"country": "FR", "state": "", "city": ""}})
            assert r.status_code == 200 and r.json()["scope"]["country"] == "FR"
            # no location → present (client filters itself)
            allcats = requests.get(f"{BASE_URL}/api/store-categories").json()
            assert any(c["key"] == "wine" for c in allcats)
            # Paris (FR) → present
            paris = requests.get(f"{BASE_URL}/api/store-categories", params={"location": "Paris, France"}).json()
            assert any(c["key"] == "wine" for c in paris)
            # Martinique → hidden
            mq = requests.get(f"{BASE_URL}/api/store-categories", params={"location": "Fort-de-France, Martinique"}).json()
            assert not any(c["key"] == "wine" for c in mq)
            # global categories still present in MQ
            assert any(c["key"] == "food" for c in mq)
        finally:
            admin_session.put(f"{BASE_URL}/api/admin/store-categories/wine",
                              json={"scope": {"country": "", "state": "", "city": ""}})
