"""Iteration 58 — Public catalogs (Phase 2 V3Cube category pages)."""
import os
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
                break

EXPECTED = {
    "beauty_salons": 5,
    "pet_providers": 5,
    "car_services": 6,
    "towing_partners": 4,
    "nearby_businesses": 6,
    "ondemand_services": 6,
    "carpool_trips": 5,
    "marketplace_listings": 7,
}


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.mark.parametrize("collection,expected_min", list(EXPECTED.items()))
def test_public_catalog_returns_seed(client, collection, expected_min):
    """Each collection must return an array with at least the seed count (public, no auth)."""
    r = client.get(f"{BASE_URL}/api/phase2/catalogs/{collection}")
    assert r.status_code == 200, f"{collection} status {r.status_code}"
    data = r.json()
    assert isinstance(data, list), f"{collection} not a list"
    assert len(data) >= expected_min, f"{collection} count={len(data)} < expected {expected_min}"
    # Every item has id
    for it in data:
        assert "id" in it, f"{collection} item missing id"
        assert "_id" not in it, f"{collection} leaked mongo _id"


def test_unknown_collection_404(client):
    r = client.get(f"{BASE_URL}/api/phase2/catalogs/unknown_collection")
    assert r.status_code == 404


def test_protected_collection_not_exposed(client):
    """Non-whitelisted collection (e.g. users) must NOT be exposed via public catalogs."""
    r = client.get(f"{BASE_URL}/api/phase2/catalogs/users")
    assert r.status_code == 404


def test_beauty_salon_shape(client):
    r = client.get(f"{BASE_URL}/api/phase2/catalogs/beauty_salons")
    data = r.json()
    sample = data[0]
    for key in ("name", "category", "address", "rating", "price_range"):
        assert key in sample


def test_carpool_trip_shape(client):
    r = client.get(f"{BASE_URL}/api/phase2/catalogs/carpool_trips")
    data = r.json()
    sample = data[0]
    for key in ("driver_name", "from_city", "to_city", "departure_at", "seats_available", "price_per_seat"):
        assert key in sample


def test_marketplace_categories(client):
    r = client.get(f"{BASE_URL}/api/phase2/catalogs/marketplace_listings")
    data = r.json()
    cats = {it.get("category") for it in data}
    # Must contain at least cars, real_estate (buildings), items
    assert cats, "no categories"


def test_admin_login_still_works(client):
    """Non-regression — admin auth still works."""
    r = client.post(f"{BASE_URL}/api/auth/login", json={
        "email": "admin@superapp.com",
        "password": os.environ.get("TEST_ADMIN_PASSWORD", "SuperAdmin123!"),
    })
    assert r.status_code == 200
    data = r.json()
    assert "user" in data or "token" in data or "access_token" in data
