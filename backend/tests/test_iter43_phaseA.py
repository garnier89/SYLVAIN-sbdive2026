"""Phase A: Top Chauffeurs + DB Backup + new CRUD collections"""
import os
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://taxi-marketplace-3.preview.emergentagent.com').rstrip('/')
ADMIN_EMAIL = 'admin@superapp.com'
ADMIN_PASSWORD = 'SuperAdmin123!'


@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def admin_token(api):
    r = api.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    tok = r.json().get("access_token") or r.json().get("token")
    assert tok, f"No token in response: {r.json()}"
    return tok


@pytest.fixture(scope="module")
def admin(api, admin_token):
    api.headers.update({"Authorization": f"Bearer {admin_token}"})
    return api


# ===== PUBLIC: /api/drivers/top =====
class TestTopDriversPublic:
    def test_top_no_auth_required(self):
        # Fresh session without auth
        r = requests.get(f"{BASE_URL}/api/drivers/top", timeout=30)
        assert r.status_code == 200, f"Public top endpoint failed: {r.status_code} {r.text[:300]}"
        data = r.json()
        assert "mode" in data
        assert "drivers" in data
        assert isinstance(data["drivers"], list)
        if data["drivers"]:
            d = data["drivers"][0]
            for k in ["driver_id", "name", "points", "total_trips", "rating", "composite_score"]:
                assert k in d, f"Missing key {k} in driver entry: {d}"

    def test_top_composite_mode_sorted(self):
        r = requests.get(f"{BASE_URL}/api/drivers/top", timeout=30)
        data = r.json()
        drivers = data["drivers"]
        if len(drivers) >= 2 and data.get("mode") == "composite":
            scores = [d["composite_score"] for d in drivers]
            assert scores == sorted(scores, reverse=True), "composite not sorted desc"


# ===== ADMIN: /api/admin/top-drivers-config =====
class TestTopDriversConfig:
    def test_get_config(self, admin):
        r = admin.get(f"{BASE_URL}/api/admin/top-drivers-config")
        assert r.status_code == 200, r.text
        data = r.json()
        settings = data.get("settings", data)
        assert "mode" in settings
        assert "max_shown" in settings
        assert "manual_driver_ids" in settings

    def test_put_config_composite(self, admin):
        payload = {"mode": "composite", "max_shown": 8, "manual_driver_ids": []}
        r = admin.put(f"{BASE_URL}/api/admin/top-drivers-config", json=payload)
        assert r.status_code == 200, r.text
        # Verify persistence
        r2 = admin.get(f"{BASE_URL}/api/admin/top-drivers-config")
        s = r2.json().get("settings", {})
        assert s["mode"] == "composite"
        assert s["max_shown"] == 8

    def test_put_config_manual_affects_public(self, admin):
        # Grab real driver_ids from /api/drivers/top
        r = requests.get(f"{BASE_URL}/api/drivers/top")
        drivers = r.json().get("drivers", [])
        if len(drivers) < 2:
            pytest.skip("Need at least 2 approved drivers for manual-mode test")

        manual_ids = [drivers[1]["driver_id"], drivers[0]["driver_id"]]  # reversed order
        payload = {"mode": "manual", "max_shown": 10, "manual_driver_ids": manual_ids}
        r = admin.put(f"{BASE_URL}/api/admin/top-drivers-config", json=payload)
        assert r.status_code == 200

        # Verify public endpoint uses manual order
        r2 = requests.get(f"{BASE_URL}/api/drivers/top")
        data = r2.json()
        assert data["mode"] == "manual"
        returned_ids = [d["driver_id"] for d in data["drivers"]]
        assert returned_ids == manual_ids, f"Expected {manual_ids}, got {returned_ids}"

        # Restore composite
        admin.put(f"{BASE_URL}/api/admin/top-drivers-config",
                  json={"mode": "composite", "max_shown": 10, "manual_driver_ids": []})


# ===== ADMIN: /api/admin/db-backup =====
class TestDbBackup:
    def test_db_backup(self, admin):
        r = admin.get(f"{BASE_URL}/api/admin/db-backup")
        assert r.status_code == 200, r.text
        data = r.json()
        assert "collections" in data
        assert "total" in data
        assert isinstance(data["collections"], list)
        assert data["total"] == len(data["collections"])
        if data["collections"]:
            c = data["collections"][0]
            assert "collection" in c
            assert "count" in c


# ===== ADMIN: CRUD on new collections =====
NEW_COLLECTIONS = [
    "vehicle_makes", "vehicle_models", "master_services", "cancel_reasons",
    "email_templates", "sms_templates", "sos_requests", "contact_requests",
    "withdraw_requests", "order_help_requests", "trip_help_requests", "push_notifications",
]


@pytest.mark.parametrize("collection", NEW_COLLECTIONS)
class TestNewCRUDCollections:
    def test_crud_lifecycle(self, admin, collection):
        # CREATE
        payload = {"name": f"TEST_{collection}", "description": "pytest created"}
        r = admin.post(f"{BASE_URL}/api/admin/crud/{collection}", json=payload)
        assert r.status_code in (200, 201), f"[{collection}] CREATE failed: {r.status_code} {r.text}"
        created = r.json()
        assert "id" in created
        item_id = created["id"]

        # LIST
        r = admin.get(f"{BASE_URL}/api/admin/crud/{collection}")
        assert r.status_code == 200
        items = r.json()
        assert any(it.get("id") == item_id for it in items), f"[{collection}] created id missing in list"

        # UPDATE
        r = admin.put(f"{BASE_URL}/api/admin/crud/{collection}/{item_id}",
                      json={"description": "updated"})
        assert r.status_code == 200, f"[{collection}] UPDATE failed: {r.text}"

        # Verify update
        r = admin.get(f"{BASE_URL}/api/admin/crud/{collection}")
        items = r.json()
        updated = next((it for it in items if it.get("id") == item_id), None)
        assert updated is not None
        assert updated.get("description") == "updated"

        # DELETE
        r = admin.delete(f"{BASE_URL}/api/admin/crud/{collection}/{item_id}")
        assert r.status_code == 200

        # Verify delete
        r = admin.get(f"{BASE_URL}/api/admin/crud/{collection}")
        items = r.json()
        assert not any(it.get("id") == item_id for it in items), f"[{collection}] not deleted"
