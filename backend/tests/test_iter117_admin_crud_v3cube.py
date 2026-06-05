"""iter117 — V3Cube admin parity: CRUD for 7 new collections + 4 fixed service-config pages.

Admin endpoints under test:
- GET/POST/PUT/DELETE /api/admin/crud/{collection}
- GET/PUT /api/admin/service-config/{key}

Collections: weather_surcharge, personal_driver, auto_promotions, vouchers, faqs, help_articles, donations
Config keys: currency, language, seo, maps-api
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
ADMIN_EMAIL = "admin@superapp.com"
ADMIN_PASSWORD = "SuperAdmin123!"

NEW_COLLECTIONS = [
    "weather_surcharge",
    "personal_driver",
    "auto_promotions",
    "vouchers",
    "faqs",
    "help_articles",
    "donations",
]

CONFIG_KEYS = ["currency", "language", "seo", "maps-api"]


@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    if r.status_code != 200:
        pytest.skip(f"Admin login failed: {r.status_code} {r.text}")
    data = r.json()
    token = data.get("access_token") or data.get("token")
    if token:
        s.headers["Authorization"] = f"Bearer {token}"
    return s


# ===== Admin CRUD for 7 V3Cube collections =====
@pytest.mark.parametrize("collection", NEW_COLLECTIONS)
def test_crud_list_returns_200(admin_session, collection):
    r = admin_session.get(f"{BASE_URL}/api/admin/crud/{collection}")
    assert r.status_code == 200, f"{collection}: {r.status_code} {r.text}"
    assert isinstance(r.json(), list)


@pytest.mark.parametrize("collection", NEW_COLLECTIONS)
def test_crud_full_cycle(admin_session, collection):
    """Create -> GET list -> Update -> Delete -> verify removed."""
    payload = {"name": f"TEST_iter117_{collection}", "status": "active"}
    # CREATE
    r = admin_session.post(f"{BASE_URL}/api/admin/crud/{collection}", json=payload)
    assert r.status_code in (200, 201), f"POST {collection}: {r.status_code} {r.text}"
    created = r.json()
    assert "id" in created
    assert created["name"] == payload["name"]
    item_id = created["id"]

    # VERIFY persisted (GET list)
    r2 = admin_session.get(f"{BASE_URL}/api/admin/crud/{collection}")
    assert r2.status_code == 200
    names = [it.get("name") for it in r2.json()]
    assert payload["name"] in names, f"Created item not persisted in {collection}"

    # UPDATE
    new_name = f"TEST_iter117_{collection}_UPDATED"
    r3 = admin_session.put(f"{BASE_URL}/api/admin/crud/{collection}/{item_id}", json={"name": new_name})
    assert r3.status_code == 200, f"PUT {collection}: {r3.status_code} {r3.text}"

    # VERIFY update
    r4 = admin_session.get(f"{BASE_URL}/api/admin/crud/{collection}")
    names2 = [it.get("name") for it in r4.json()]
    assert new_name in names2

    # DELETE
    r5 = admin_session.delete(f"{BASE_URL}/api/admin/crud/{collection}/{item_id}")
    assert r5.status_code == 200, f"DELETE {collection}: {r5.status_code} {r5.text}"

    # VERIFY removed
    r6 = admin_session.get(f"{BASE_URL}/api/admin/crud/{collection}")
    ids = [it.get("id") for it in r6.json()]
    assert item_id not in ids


# ===== Service-config for the 4 fixed pages =====
@pytest.mark.parametrize("key", CONFIG_KEYS)
def test_service_config_get(admin_session, key):
    r = admin_session.get(f"{BASE_URL}/api/admin/service-config/{key}")
    assert r.status_code == 200, f"GET {key}: {r.status_code} {r.text}"
    data = r.json()
    assert "service_key" in data or "settings" in data


@pytest.mark.parametrize("key", CONFIG_KEYS)
def test_service_config_put_persists(admin_session, key):
    marker = f"TEST_iter117_{key}_value"
    payload = {"settings": {"test_field": marker, "enabled": True}}
    r = admin_session.put(f"{BASE_URL}/api/admin/service-config/{key}", json=payload)
    assert r.status_code == 200, f"PUT {key}: {r.status_code} {r.text}"

    # GET to verify
    r2 = admin_session.get(f"{BASE_URL}/api/admin/service-config/{key}")
    assert r2.status_code == 200
    data = r2.json()
    settings = data.get("settings", {})
    assert settings.get("test_field") == marker
    assert settings.get("enabled") is True


# ===== Negative: unknown collection =====
def test_crud_unknown_collection_rejected(admin_session):
    r = admin_session.get(f"{BASE_URL}/api/admin/crud/__not_a_real_collection__")
    assert r.status_code in (400, 404)
