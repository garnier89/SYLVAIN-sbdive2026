"""Iteration 60 smoke tests - verify backend APIs untouched by frontend refactor."""
import os
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://gojek-clone-40.preview.emergentagent.com').rstrip('/')


@pytest.fixture(scope="module")
def user_session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login",
               json={"email": "neg_test@example.com", "password": os.environ.get("TEST_NEG_PASSWORD", "Test1234!")},
               timeout=15)
    if r.status_code != 200:
        s.post(f"{BASE_URL}/api/auth/register",
               json={"email": "neg_test@example.com", "password": os.environ.get("TEST_NEG_PASSWORD", "Test1234!"), "name": "Neg Test", "role": "user"},
               timeout=15)
        r = s.post(f"{BASE_URL}/api/auth/login",
                   json={"email": "neg_test@example.com", "password": os.environ.get("TEST_NEG_PASSWORD", "Test1234!")},
                   timeout=15)
        if r.status_code != 200:
            pytest.skip(f"User login failed: {r.status_code}")
    return s


# Phase 2 catalogs (correct collection names from backend PUBLIC_CATALOGS set)
@pytest.mark.parametrize("collection", [
    "beauty_salons", "car_services", "towing_partners", "pet_providers",
    "nearby_businesses", "ondemand_services", "carpool_trips", "marketplace_listings",
])
def test_phase2_catalogs(collection):
    r = requests.get(f"{BASE_URL}/api/phase2/catalogs/{collection}", timeout=15)
    assert r.status_code == 200, f"{collection}: {r.status_code} {r.text[:200]}"
    data = r.json()
    assert isinstance(data, list)


# Runner booking - runner mode (correct payload schema)
def test_runner_booking_runner_mode(user_session):
    payload = {
        "service_type": "runner",
        "mode": "simple",
        "package_type": "document",
        "pickup_address": "Paris pickup",
        "pickup_lat": 48.8566,
        "pickup_lng": 2.3522,
        "pickup_note": "Test pickup",
        "drops": [{"address": "Paris drop", "lat": 48.86, "lng": 2.36, "name": "John", "phone": "+33612345678"}],
        "estimated_fare": 12.5,
        "payment_method": "cash",
    }
    r = user_session.post(f"{BASE_URL}/api/phase2/runner/book", json=payload, timeout=15)
    assert r.status_code in (200, 201), f"runner book: {r.status_code} {r.text[:300]}"
    data = r.json()
    assert "order" in data
    assert data["order"]["service_type"] == "runner"


# Runner booking - genie mode (frontend sends service_type='genie')
def test_runner_booking_genie_mode(user_session):
    payload = {
        "service_type": "genie",
        "mode": "simple",
        "package_type": "small",
        "pickup_address": "Carrefour store",
        "pickup_lat": 48.8566,
        "pickup_lng": 2.3522,
        "pickup_note": "Buy 2 baguettes",
        "drops": [{"address": "Home address", "lat": 48.86, "lng": 2.36, "name": "Jane", "phone": "+33611111111"}],
        "estimated_fare": 10.0,
        "payment_method": "cash",
    }
    r = user_session.post(f"{BASE_URL}/api/phase2/runner/book", json=payload, timeout=15)
    assert r.status_code in (200, 201), f"genie book: {r.status_code} {r.text[:300]}"
    data = r.json()
    # NOTE: Backend currently hardcodes service_type='runner' (phase2.py line 506)
    # so genie mode in frontend is currently NOT persisted on backend. Documenting:
    print(f"INFO: order service_type persisted as: {data['order']['service_type']} (frontend sent 'genie')")


# Taxi bidding live-stats
def test_taxi_bidding_live_stats():
    r = requests.get(f"{BASE_URL}/api/phase2/taxi-bidding/live-stats", timeout=15)
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, dict)


# Ride estimate
def test_ride_estimate(user_session):
    payload = {
        "pickup_lat": 48.8566, "pickup_lng": 2.3522, "pickup_address": "Paris",
        "dropoff_lat": 48.88, "dropoff_lng": 2.35, "dropoff_address": "Gare du Nord",
        "vehicle_type": "sb", "payment_method": "cash",
    }
    r = user_session.post(f"{BASE_URL}/api/rides/estimate", json=payload, timeout=15)
    assert r.status_code == 200, f"{r.status_code} {r.text[:300]}"
    data = r.json()
    assert "estimated_fare" in data or "fare" in data or "distance_km" in data


# Vehicle types config (used by RideBookingPage)
def test_vehicle_types_config():
    r = requests.get(f"{BASE_URL}/api/config/vehicle-types", timeout=15)
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    assert len(data) > 0
    assert "slug" in data[0]
