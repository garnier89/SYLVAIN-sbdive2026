"""Iter56 — TaxiBidding live-stats endpoint + non-regression on UserHome flows."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://gojek-clone-41.preview.emergentagent.com").rstrip("/")


@pytest.fixture(scope="module")
def user_session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE_URL}/api/auth/login", json={
        "email": "test2@example.com", "password": os.environ.get("TEST_USER_PASSWORD", "TestPass123!")
    })
    if r.status_code != 200:
        pytest.skip(f"User login failed {r.status_code}: {r.text[:200]}")
    return s


# ───────── New endpoint: GET /api/phase2/taxi-bidding/live-stats ─────────
class TestTaxiBiddingLiveStats:
    def test_live_stats_with_paris_coords(self, user_session):
        r = user_session.get(
            f"{BASE_URL}/api/phase2/taxi-bidding/live-stats",
            params={"lat": 48.8566, "lng": 2.3522},
        )
        assert r.status_code == 200, r.text
        data = r.json()
        # All required fields present
        for key in ["online_drivers_nearby", "avg_accepted_fare", "avg_fare_samples",
                    "acceptance_rate_percent", "radius_km"]:
            assert key in data, f"missing {key} in response: {data}"
        assert isinstance(data["online_drivers_nearby"], int)
        assert data["online_drivers_nearby"] >= 0
        assert isinstance(data["avg_fare_samples"], int)
        assert data["radius_km"] == 15

    def test_live_stats_without_coords(self, user_session):
        # Should also work without lat/lng
        r = user_session.get(f"{BASE_URL}/api/phase2/taxi-bidding/live-stats")
        assert r.status_code == 200, r.text
        data = r.json()
        assert "online_drivers_nearby" in data

    def test_live_stats_custom_radius(self, user_session):
        r = user_session.get(
            f"{BASE_URL}/api/phase2/taxi-bidding/live-stats",
            params={"lat": 48.8566, "lng": 2.3522, "radius_km": 5},
        )
        assert r.status_code == 200
        assert r.json()["radius_km"] == 5


# ───────── Non-regression: estimate + ride creation flow used by find-driver-btn ─────────
class TestTaxiBiddingFlow:
    def test_estimate_endpoint(self, user_session):
        r = user_session.post(f"{BASE_URL}/api/rides/estimate", json={
            "pickup_lat": 48.8566, "pickup_lng": 2.3522, "pickup_address": "Paris",
            "dropoff_lat": 45.764, "dropoff_lng": 4.835, "dropoff_address": "Lyon",
            "vehicle_type": "sb", "payment_method": "cash",
        })
        assert r.status_code == 200, r.text
        data = r.json()
        assert "estimated_fare" in data
        assert data["estimated_fare"] > 0

    def test_ride_create_with_proposed_fare(self, user_session):
        # Used by find-driver-btn when fare is set
        r = user_session.post(f"{BASE_URL}/api/rides", json={
            "pickup_lat": 48.8566, "pickup_lng": 2.3522, "pickup_address": "TEST_Paris",
            "dropoff_lat": 48.85, "dropoff_lng": 2.36, "dropoff_address": "TEST_Bastille",
            "vehicle_type": "sb", "payment_method": "cash", "proposed_fare": 12.5,
        })
        assert r.status_code in (200, 201), r.text
        ride = r.json()
        assert "id" in ride
        # GET ride to verify persistence
        gr = user_session.get(f"{BASE_URL}/api/rides/{ride['id']}")
        assert gr.status_code == 200
        assert gr.json().get("proposed_fare") == 12.5


# ───────── Non-regression: UserHome dependent endpoints ─────────
class TestUserHomeDeps:
    def test_top_drivers(self, user_session):
        # Used by TopDriversWidget now on FavoriteDriversPage
        r = user_session.get(f"{BASE_URL}/api/drivers/top")
        assert r.status_code == 200
        body = r.json()
        assert "drivers" in body
        assert isinstance(body["drivers"], list)

    def test_favorite_drivers_list(self, user_session):
        r = user_session.get(f"{BASE_URL}/api/phase1/favorite-drivers")
        assert r.status_code == 200
        assert isinstance(r.json(), list)
