"""Iter 206 — Pool config (GET /api/config/pool) + admin save + enforcement on create_ride."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
                break

ADMIN_EMAIL = "admin@superapp.com"
ADMIN_PASS = "SuperAdmin123!"


def _login(email, password):
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}, timeout=20)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="module")
def admin_session():
    return _login(ADMIN_EMAIL, ADMIN_PASS)


@pytest.fixture(scope="module")
def rider_session():
    # Register a fresh rider (idempotent — fallback to login if already exists)
    email = "TEST_pool_rider_iter206@example.com"
    pw = "Rider2026!"
    s = requests.Session()
    s.post(f"{BASE_URL}/api/auth/register", json={
        "name": "Test Pool Rider", "email": email, "password": pw, "phone": "+33611002206"
    }, timeout=20)
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": pw}, timeout=20)
    assert r.status_code == 200, f"rider login failed: {r.text}"
    return s


def test_public_pool_config_shape():
    r = requests.get(f"{BASE_URL}/api/config/pool", timeout=15)
    assert r.status_code == 200
    data = r.json()
    for key in ["enabled", "pool_percentage", "available_seats",
                "max_seats_per_booking", "discount_percent", "max_stops",
                "eligible_vehicle_slugs", "payment_methods"]:
        assert key in data, f"missing key {key} in /api/config/pool response"
    assert isinstance(data["eligible_vehicle_slugs"], list)
    assert isinstance(data["payment_methods"], list)


def test_admin_save_pool_then_public_reflects(admin_session):
    payload = {
        "enable_pool": True,
        "pool_percentage": 90,
        "available_seats": 4,
        "max_seats_per_booking": 2,
        "max_stops": 2,
        "share_discount_percent": 25,
        "eligible_vehicle_slugs": ["sb", "confort"],
        "payment_methods": ["cash"],
    }
    r = admin_session.put(f"{BASE_URL}/api/admin/service-config/pool",
                          json={"settings": payload}, timeout=20)
    assert r.status_code in (200, 201), f"save pool failed: {r.status_code} {r.text}"

    pub = requests.get(f"{BASE_URL}/api/config/pool", timeout=15).json()
    assert set(pub["eligible_vehicle_slugs"]) == {"sb", "confort"}
    assert pub["payment_methods"] == ["cash"]
    assert pub["max_stops"] == 2


def test_create_ride_pool_rejects_ineligible_vehicle(rider_session):
    # luxe is NOT in the eligible_vehicle_slugs we just saved (sb, confort)
    body = {
        "pickup_lat": 48.8566, "pickup_lng": 2.3522, "pickup_address": "Paris",
        "dropoff_lat": 48.8606, "dropoff_lng": 2.3376, "dropoff_address": "Louvre",
        "vehicle_type": "luxe", "payment_method": "cash",
        "pool_enabled": True, "seats_required": 1,
    }
    r = rider_session.post(f"{BASE_URL}/api/rides", json=body, timeout=20)
    assert r.status_code == 400, f"expected 400 for ineligible vehicle, got {r.status_code} {r.text}"
    assert "éligible" in r.text or "eligible" in r.text.lower()


def test_create_ride_pool_rejects_disallowed_payment(rider_session):
    # eligible_vehicle_slugs has 'sb' -> ok, but payment 'card' is NOT allowed
    body = {
        "pickup_lat": 48.8566, "pickup_lng": 2.3522, "pickup_address": "Paris",
        "dropoff_lat": 48.8606, "dropoff_lng": 2.3376, "dropoff_address": "Louvre",
        "vehicle_type": "sb", "payment_method": "card",
        "pool_enabled": True, "seats_required": 1,
    }
    r = rider_session.post(f"{BASE_URL}/api/rides", json=body, timeout=20)
    assert r.status_code == 400, f"expected 400 for disallowed payment, got {r.status_code} {r.text}"
    assert "paiement" in r.text.lower() or "payment" in r.text.lower()


def test_create_ride_pool_rejects_too_many_stops(rider_session):
    body = {
        "pickup_lat": 48.8566, "pickup_lng": 2.3522, "pickup_address": "Paris",
        "dropoff_lat": 48.8606, "dropoff_lng": 2.3376, "dropoff_address": "Louvre",
        "vehicle_type": "sb", "payment_method": "cash",
        "pool_enabled": True, "seats_required": 1,
        "stops": [
            {"lat": 48.857, "lng": 2.34, "address": "stop1"},
            {"lat": 48.858, "lng": 2.35, "address": "stop2"},
            {"lat": 48.859, "lng": 2.36, "address": "stop3"},
        ],
    }
    r = rider_session.post(f"{BASE_URL}/api/rides", json=body, timeout=20)
    assert r.status_code == 400, f"expected 400 for too many stops, got {r.status_code} {r.text}"
    assert "arrêt" in r.text.lower() or "stop" in r.text.lower()


def test_restore_permissive_pool(admin_session):
    """Cleanup — restore permissive pool config so other tests aren't affected."""
    payload = {
        "enable_pool": True,
        "pool_percentage": 90,
        "available_seats": 4,
        "max_seats_per_booking": 2,
        "max_stops": 2,
        "share_discount_percent": 25,
        "eligible_vehicle_slugs": [],
        "payment_methods": ["cash", "card", "wallet", "sbpaygo"],
    }
    r = admin_session.put(f"{BASE_URL}/api/admin/service-config/pool",
                          json={"settings": payload}, timeout=20)
    assert r.status_code in (200, 201)
    pub = requests.get(f"{BASE_URL}/api/config/pool", timeout=15).json()
    assert pub["eligible_vehicle_slugs"] == []
    assert set(pub["payment_methods"]) == {"cash", "card", "wallet", "sbpaygo"}


def test_taxi_advanced_estimate_with_real_slugs(rider_session):
    """Non-regression: estimates for known slugs return a price > 0."""
    for slug in ["sb", "confort", "luxe", "airport", "moto"]:
        r = rider_session.post(f"{BASE_URL}/api/rides/estimate", json={
            "pickup_lat": 48.8566, "pickup_lng": 2.3522, "pickup_address": "Paris",
            "dropoff_lat": 48.88, "dropoff_lng": 2.30, "dropoff_address": "Étoile",
            "vehicle_type": slug, "payment_method": "cash",
        }, timeout=20)
        assert r.status_code == 200, f"estimate failed for {slug}: {r.text}"
        data = r.json()
        assert float(data.get("estimated_fare", 0)) > 0, f"fare not >0 for {slug}: {data}"
