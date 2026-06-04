"""Iter99 — Tests for Rental Packages / Ride Profiles / Business Trip Reasons (Taxi extra modules)."""
import os
import pytest
import requests

BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
ADMIN = {"email": "admin@superapp.com", "password": "SuperAdmin123!"}


@pytest.fixture(scope="module")
def admin_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE}/api/auth/login", json=ADMIN)
    assert r.status_code == 200, r.text
    s.headers.update({"Authorization": f"Bearer {r.json()['access_token']}"})
    return s


# ───────────────── Rental Packages ─────────────────
class TestRentalPackages:
    def test_vehicles_list(self, admin_client):
        r = admin_client.get(f"{BASE}/api/admin/rental-packages/vehicles")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list) and len(data) > 0
        v0 = data[0]
        assert "slug" in v0 and "name" in v0 and "count" in v0

    def test_crud_and_public(self, admin_client):
        # CREATE
        payload = {"vehicle_type": "sb", "hours": 2, "km": 20, "price": 36}
        r = admin_client.post(f"{BASE}/api/admin/rental-packages", json=payload)
        assert r.status_code == 200, r.text
        pkg = r.json()
        assert pkg["vehicle_type"] == "sb"
        assert pkg["hours"] == 2.0 and pkg["km"] == 20.0 and pkg["price"] == 36.0
        pkg_id = pkg["id"]

        # LIST filtered
        r = admin_client.get(f"{BASE}/api/admin/rental-packages?vehicle_type=sb")
        assert r.status_code == 200
        ids = [p["id"] for p in r.json()]
        assert pkg_id in ids

        # Vehicles counter incremented
        r = admin_client.get(f"{BASE}/api/admin/rental-packages/vehicles")
        v = next((x for x in r.json() if x["slug"] == "sb"), None)
        assert v is not None and v["count"] >= 1

        # UPDATE
        r = admin_client.put(f"{BASE}/api/admin/rental-packages/{pkg_id}", json={"price": 40})
        assert r.status_code == 200
        assert r.json()["price"] == 40.0

        # PUBLIC
        r = requests.get(f"{BASE}/api/config/rental-packages?vehicle_type=sb")
        assert r.status_code == 200
        assert any(p["id"] == pkg_id for p in r.json())

        # DELETE
        r = admin_client.delete(f"{BASE}/api/admin/rental-packages/{pkg_id}")
        assert r.status_code == 200 and r.json().get("deleted") is True
        # Verify removed
        r = admin_client.get(f"{BASE}/api/admin/rental-packages?vehicle_type=sb")
        assert all(p["id"] != pkg_id for p in r.json())


# ───────────────── Ride Profiles ─────────────────
class TestRideProfiles:
    def test_seed_and_crud(self, admin_client):
        r = admin_client.get(f"{BASE}/api/admin/ride-profiles")
        assert r.status_code == 200
        seeded = r.json()
        assert len(seeded) >= 2
        names = [p["short_name"] for p in seeded]
        assert "Business" in names and "Personnel" in names

        # CREATE
        payload = {"short_name": "TEST_iter99", "org_type": "Business",
                   "profile_title": "T", "title_description": "D"}
        r = admin_client.post(f"{BASE}/api/admin/ride-profiles", json=payload)
        assert r.status_code == 200, r.text
        item = r.json()
        item_id = item["id"]
        assert item["short_name"] == "TEST_iter99"
        assert item["status"] == "active"

        # UPDATE
        r = admin_client.put(f"{BASE}/api/admin/ride-profiles/{item_id}",
                             json={"profile_title": "Updated"})
        assert r.status_code == 200 and r.json()["profile_title"] == "Updated"

        # TOGGLE
        r = admin_client.post(f"{BASE}/api/admin/ride-profiles/{item_id}/toggle")
        assert r.status_code == 200 and r.json()["status"] == "inactive"

        # Public excludes inactive
        r = requests.get(f"{BASE}/api/config/ride-profiles")
        assert r.status_code == 200
        assert all(p["id"] != item_id for p in r.json())

        # DELETE
        r = admin_client.delete(f"{BASE}/api/admin/ride-profiles/{item_id}")
        assert r.status_code == 200


# ───────────────── Business Trip Reasons ─────────────────
class TestTripReasons:
    def test_seed_and_crud(self, admin_client):
        r = admin_client.get(f"{BASE}/api/admin/business-trip-reasons")
        assert r.status_code == 200
        seeded = r.json()
        assert len(seeded) >= 3

        payload = {"trip_reason": "TEST_iter99 reason", "profile_short_name": "Business",
                   "org_type": "Business", "profile_title": "PT", "title_description": "TD"}
        r = admin_client.post(f"{BASE}/api/admin/business-trip-reasons", json=payload)
        assert r.status_code == 200, r.text
        item_id = r.json()["id"]

        r = admin_client.put(f"{BASE}/api/admin/business-trip-reasons/{item_id}",
                             json={"trip_reason": "TEST_updated"})
        assert r.status_code == 200 and r.json()["trip_reason"] == "TEST_updated"

        r = admin_client.post(f"{BASE}/api/admin/business-trip-reasons/{item_id}/toggle")
        assert r.status_code == 200 and r.json()["status"] == "inactive"

        r = requests.get(f"{BASE}/api/config/business-trip-reasons")
        assert r.status_code == 200
        assert all(p["id"] != item_id for p in r.json())

        r = admin_client.delete(f"{BASE}/api/admin/business-trip-reasons/{item_id}")
        assert r.status_code == 200
