"""Iter 205 - Backend e2e for COVOITURAGE (carpool) + V3Cube SERVICE CATEGORY CRUD."""
import os
import uuid
import requests
import pytest
from dotenv import load_dotenv

load_dotenv("/app/frontend/.env")
BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE}/api"

ADMIN = ("admin@superapp.com", "SuperAdmin123!")
USER_A = ("jean.dupont@demo.sb", "Driver123!")
USER_B = ("test2@example.com", "TestPass123!")


def _login(email, pw):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": email, "password": pw}, timeout=15)
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="module")
def admin():
    return _login(*ADMIN)


@pytest.fixture(scope="module")
def user_a():
    return _login(*USER_A)


@pytest.fixture(scope="module")
def user_b():
    return _login(*USER_B)


# ────────────────── COVOITURAGE ──────────────────
class TestCarpool:
    ride_id = None

    def test_publish_trip(self, user_a):
        payload = {
            "pickup_address": "TEST_Fort-de-France",
            "dropoff_address": "TEST_Le Marin",
            "departure_date": "2099-01-15T10:00",
            "available_seats": 2,
            "price_per_seat": 12.5,
        }
        r = user_a.post(f"{API}/carpool/rides", json=payload, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["pickup_address"] == "TEST_Fort-de-France"
        assert data["dropoff_address"] == "TEST_Le Marin"
        assert data["available_seats"] == 2
        assert data["price_per_seat"] == 12.5
        assert data["status"] == "open"
        assert data["passengers"] == []
        assert "id" in data and data["id"].startswith("carpool_")
        assert "_id" not in data
        TestCarpool.ride_id = data["id"]

    def test_list_includes_new_trip(self, user_b):
        r = user_b.get(f"{API}/carpool/rides", timeout=15)
        assert r.status_code == 200
        rides = r.json()
        assert isinstance(rides, list)
        ids = [x["id"] for x in rides]
        assert TestCarpool.ride_id in ids

    def test_owner_cannot_book_own(self, user_a):
        r = user_a.post(f"{API}/carpool/rides/{TestCarpool.ride_id}/book", timeout=15)
        assert r.status_code == 400

    def test_book_seat_decrements(self, user_b):
        r = user_b.post(f"{API}/carpool/rides/{TestCarpool.ride_id}/book", timeout=15)
        assert r.status_code == 200, r.text
        # verify state via list
        rides = user_b.get(f"{API}/carpool/rides", timeout=15).json()
        ride = next(x for x in rides if x["id"] == TestCarpool.ride_id)
        assert len(ride["passengers"]) == 1
        assert ride["passengers"][0]["user_id"]

    def test_double_book_rejected(self, user_b):
        r = user_b.post(f"{API}/carpool/rides/{TestCarpool.ride_id}/book", timeout=15)
        assert r.status_code == 400

    def test_search_filter_by_pickup(self, user_b):
        r = user_b.get(f"{API}/carpool/rides", params={"pickup": "TEST_Fort"}, timeout=15)
        assert r.status_code == 200
        rides = r.json()
        assert any(x["id"] == TestCarpool.ride_id for x in rides)


# ────────────────── SERVICE CATEGORY CRUD ──────────────────
class TestServiceCategoryCRUD:
    key = f"test_cat_{uuid.uuid4().hex[:6]}"

    def test_create_with_view_type_and_images(self, admin):
        payload = {
            "key": TestServiceCategoryCRUD.key,
            "name": "TEST Catégorie",
            "icon": "🚙",
            "view_type": "icon_banner",
            "banner_image": "https://example.com/banner.jpg",
            "service_image": "https://example.com/service.jpg",
            "list_description": "Description courte",
            "description": "Description longue détaillée",
        }
        r = admin.post(f"{API}/admin/service-categories", json=payload, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["key"] == TestServiceCategoryCRUD.key
        assert data["name"] == "TEST Catégorie"
        assert data["view_type"] == "icon_banner"
        assert data["banner_image"] == "https://example.com/banner.jpg"
        assert data["service_image"] == "https://example.com/service.jpg"
        assert data["list_description"] == "Description courte"
        assert data["description"] == "Description longue détaillée"
        assert data.get("is_custom") is True
        assert "_id" not in data

    def test_duplicate_key_rejected(self, admin):
        r = admin.post(f"{API}/admin/service-categories",
                       json={"key": TestServiceCategoryCRUD.key, "name": "Dup"}, timeout=15)
        assert r.status_code == 409

    def test_update_view_type_and_desc(self, admin):
        r = admin.put(
            f"{API}/admin/service-categories/{TestServiceCategoryCRUD.key}",
            json={"view_type": "banner", "description": "Updated long desc",
                  "list_description": "Updated short"},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["view_type"] == "banner"
        assert data["description"] == "Updated long desc"
        assert data["list_description"] == "Updated short"

    def test_public_list_includes_custom(self, user_b):
        r = user_b.get(f"{API}/service-categories", timeout=15)
        assert r.status_code == 200
        keys = [c["key"] for c in r.json()]
        assert TestServiceCategoryCRUD.key in keys

    def test_toggle_active_still_works(self, admin):
        r = admin.post(f"{API}/admin/service-categories/{TestServiceCategoryCRUD.key}/toggle", timeout=15)
        assert r.status_code == 200
        assert r.json()["active"] is False
        # toggle back
        admin.post(f"{API}/admin/service-categories/{TestServiceCategoryCRUD.key}/toggle", timeout=15)

    def test_toggle_home_regression(self, admin):
        r = admin.post(f"{API}/admin/service-categories/{TestServiceCategoryCRUD.key}/toggle-home", timeout=15)
        assert r.status_code == 200
        assert "visible_home" in r.json()

    def test_reorder_regression(self, admin):
        cats = admin.get(f"{API}/admin/service-categories", timeout=15).json()
        keys = [c["key"] for c in cats]
        r = admin.post(f"{API}/admin/service-categories/reorder",
                       json={"ordered_keys": keys}, timeout=15)
        assert r.status_code == 200
        assert r.json()["count"] == len(keys)

    def test_delete_removes_from_public(self, admin, user_b):
        r = admin.delete(f"{API}/admin/service-categories/{TestServiceCategoryCRUD.key}", timeout=15)
        assert r.status_code == 200
        r2 = user_b.get(f"{API}/service-categories", timeout=15)
        keys = [c["key"] for c in r2.json()]
        assert TestServiceCategoryCRUD.key not in keys
        # double-delete is 404
        r3 = admin.delete(f"{API}/admin/service-categories/{TestServiceCategoryCRUD.key}", timeout=15)
        assert r3.status_code == 404
