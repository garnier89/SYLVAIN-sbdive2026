"""Iter100 — Test public ride-profiles / business-trip-reasons + create ride with new fields."""
import os
import pytest
import requests

BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
RIDER = {"email": "rider.qa@demo.sb", "password": "Rider123!"}


@pytest.fixture(scope="module")
def rider_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE}/api/auth/login", json=RIDER)
    assert r.status_code == 200, r.text
    token = r.json().get("access_token") or r.json().get("token")
    assert token
    s.headers.update({"Authorization": f"Bearer {token}"})
    return s


# ───────────────── Public config endpoints ─────────────────
class TestPublicConfig:
    def test_ride_profiles_public(self):
        r = requests.get(f"{BASE}/api/config/ride-profiles")
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, list) and len(data) >= 2
        names = {p["short_name"] for p in data}
        assert "Business" in names and "Personnel" in names
        # All required fields present
        for p in data:
            assert {"id", "short_name", "org_type", "title_description"} <= set(p.keys())
            assert p.get("status", "active") == "active"

    def test_business_trip_reasons_public(self):
        r = requests.get(f"{BASE}/api/config/business-trip-reasons")
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, list) and len(data) >= 3
        labels = {x["trip_reason"] for x in data}
        # Expected seeded values
        assert any("Bureau" in l for l in labels)
        assert any("Visite client" in l for l in labels)
        assert any("aéroport" in l or "aeroport" in l.lower() for l in labels)


# ───────────────── POST /api/rides with new fields ─────────────────
class TestRideCreationWithProfile:
    def test_create_ride_business_with_reason(self, rider_client):
        payload = {
            "pickup_address": "1 Rue de Rivoli, Paris",
            "pickup_lat": 48.8566,
            "pickup_lng": 2.3522,
            "dropoff_address": "Aéroport CDG, Roissy",
            "dropoff_lat": 49.0097,
            "dropoff_lng": 2.5479,
            "vehicle_type": "sb",
            "payment_method": "cash",
            "ride_profile": "Business",
            "ride_profile_org_type": "Business",
            "business_trip_reason": "Visite client / partenaire",
        }
        r = rider_client.post(f"{BASE}/api/rides", json=payload)
        assert r.status_code in (200, 201), r.text
        ride = r.json()
        assert ride.get("ride_profile") == "Business"
        assert ride.get("ride_profile_org_type") == "Business"
        assert ride.get("business_trip_reason") == "Visite client / partenaire"
        ride_id = ride["id"]

        # GET to verify persistence
        g = rider_client.get(f"{BASE}/api/rides/{ride_id}")
        assert g.status_code == 200, g.text
        got = g.json()
        assert got["ride_profile"] == "Business"
        assert got["ride_profile_org_type"] == "Business"
        assert got["business_trip_reason"] == "Visite client / partenaire"

        # Cleanup — cancel ride
        try:
            rider_client.post(f"{BASE}/api/rides/{ride_id}/cancel", json={"reason": "TEST_cleanup"})
        except Exception:
            pass

    def test_create_ride_personal_no_reason(self, rider_client):
        payload = {
            "pickup_address": "Place de la République, Paris",
            "pickup_lat": 48.8674,
            "pickup_lng": 2.3636,
            "dropoff_address": "Tour Eiffel, Paris",
            "dropoff_lat": 48.8584,
            "dropoff_lng": 2.2945,
            "vehicle_type": "sb",
            "payment_method": "cash",
            "ride_profile": "Personnel",
            "ride_profile_org_type": "Personal",
        }
        r = rider_client.post(f"{BASE}/api/rides", json=payload)
        assert r.status_code in (200, 201), r.text
        ride = r.json()
        assert ride.get("ride_profile") == "Personnel"
        assert ride.get("ride_profile_org_type") == "Personal"
        assert ride.get("business_trip_reason") in (None, "")

        ride_id = ride["id"]
        g = rider_client.get(f"{BASE}/api/rides/{ride_id}")
        assert g.status_code == 200
        got = g.json()
        assert got["ride_profile"] == "Personnel"
        assert got["ride_profile_org_type"] == "Personal"

        try:
            rider_client.post(f"{BASE}/api/rides/{ride_id}/cancel", json={"reason": "TEST_cleanup"})
        except Exception:
            pass

    def test_create_ride_without_profile_still_works(self, rider_client):
        """Backward compat: rides created without the new fields should still work."""
        payload = {
            "pickup_address": "Gare de Lyon, Paris",
            "pickup_lat": 48.8443,
            "pickup_lng": 2.3743,
            "dropoff_address": "Gare du Nord, Paris",
            "dropoff_lat": 48.8809,
            "dropoff_lng": 2.3553,
            "vehicle_type": "sb",
            "payment_method": "cash",
        }
        r = rider_client.post(f"{BASE}/api/rides", json=payload)
        assert r.status_code in (200, 201), r.text
        ride = r.json()
        assert ride.get("ride_profile") in (None, "")
        ride_id = ride["id"]
        try:
            rider_client.post(f"{BASE}/api/rides/{ride_id}/cancel", json={"reason": "TEST_cleanup"})
        except Exception:
            pass
