"""
V3Cube Pack A — Taxi Avancé backend tests
- /api/rides/scheduled/list (auth required)
- /api/rides/{id}/reschedule
- /api/rides/rental-packages
- /api/rides/airport-multipliers
- POST /api/rides Pack A field persistence
"""
import os
from datetime import datetime, timedelta, timezone

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://gojek-clone-41.preview.emergentagent.com").rstrip("/")
USER_EMAIL = "test2@example.com"
USER_PWD = "TestPass123!"


# --- Fixtures ---

@pytest.fixture(scope="session")
def user_token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": USER_EMAIL, "password": USER_PWD}, timeout=15)
    if r.status_code != 200:
        pytest.skip(f"User login failed: {r.status_code} {r.text[:200]}")
    return r.json()["access_token"]


@pytest.fixture
def auth_headers(user_token):
    return {"Authorization": f"Bearer {user_token}", "Content-Type": "application/json"}


def _future_iso(hours=2):
    return (datetime.now(timezone.utc) + timedelta(hours=hours)).isoformat()


def _base_ride(**overrides):
    body = {
        "pickup_lat": 48.8584, "pickup_lng": 2.2945, "pickup_address": "Tour Eiffel",
        "dropoff_lat": 48.8606, "dropoff_lng": 2.3376, "dropoff_address": "Louvre",
        "vehicle_type": "comfort", "payment_method": "cash",
    }
    body.update(overrides)
    return body


# --- Tests ---

# scheduled/list endpoint
class TestScheduledList:
    def test_scheduled_list_requires_auth(self):
        r = requests.get(f"{BASE_URL}/api/rides/scheduled/list", timeout=10)
        assert r.status_code in (401, 403), f"expected auth-required, got {r.status_code}"

    def test_scheduled_list_authed(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/rides/scheduled/list", headers=auth_headers, timeout=10)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "items" in data and "count" in data
        assert isinstance(data["items"], list)
        assert data["count"] == len(data["items"])


# rental-packages endpoint
class TestRentalPackages:
    def test_default_packages(self):
        r = requests.post(f"{BASE_URL}/api/rides/rental-packages", timeout=10)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "packages" in d
        slugs = [p["slug"] for p in d["packages"]]
        assert "2h_20km" in slugs and "4h_40km" in slugs and "8h_80km" in slugs


# airport-multipliers endpoint
class TestAirportMultipliers:
    def test_default_config(self):
        r = requests.post(f"{BASE_URL}/api/rides/airport-multipliers", timeout=10)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("multiplier") == 1.25
        assert d.get("min_fare") == 25.0 or d.get("min_fare") == 25
        assert d.get("waiting_fee_per_min") == 0.5


# Ride creation Pack A persistence
class TestRideCreatePackA:
    def _create_and_verify(self, headers, payload, expected_fields):
        r = requests.post(f"{BASE_URL}/api/rides", headers=headers, json=payload, timeout=15)
        assert r.status_code == 200, f"POST /api/rides {r.status_code}: {r.text[:400]}"
        body = r.json()
        for k, v in expected_fields.items():
            assert body.get(k) == v, f"field {k}: expected {v}, got {body.get(k)}"
        # verify persistence via GET
        rid = body["id"]
        g = requests.get(f"{BASE_URL}/api/rides/{rid}", headers=headers, timeout=10)
        assert g.status_code == 200
        gb = g.json()
        for k, v in expected_fields.items():
            assert gb.get(k) == v, f"GET persistence field {k}: expected {v}, got {gb.get(k)}"
        return body

    def test_scheduled_ride_persists(self, auth_headers):
        sched = _future_iso(3)
        payload = _base_ride(ride_type="scheduled", scheduled_at=sched)
        self._create_and_verify(auth_headers, payload, {"ride_type": "scheduled", "scheduled_at": sched})

    def test_airport_ride_persists(self, auth_headers):
        payload = _base_ride(ride_type="airport", flight_number="AF1234", scheduled_at=_future_iso(4))
        self._create_and_verify(auth_headers, payload, {"ride_type": "airport", "flight_number": "AF1234"})

    def test_rental_ride_persists(self, auth_headers):
        payload = _base_ride(ride_type="rental", rental_package="2h_20km", rental_hours=2)
        self._create_and_verify(auth_headers, payload, {
            "ride_type": "rental", "rental_package": "2h_20km", "rental_hours": 2,
        })

    def test_buddy_ride_persists(self, auth_headers):
        payload = _base_ride(ride_type="buddy_driver", buddy_hours=4)
        self._create_and_verify(auth_headers, payload, {"ride_type": "buddy_driver", "buddy_hours": 4})

    def test_corporate_ride_persists(self, auth_headers):
        payload = _base_ride(ride_type="corporate", corporate_account_id="ACME-2026")
        self._create_and_verify(auth_headers, payload, {
            "ride_type": "corporate", "corporate_account_id": "ACME-2026",
        })


# reschedule endpoint - depends on having a scheduled ride
class TestReschedule:
    def test_reschedule_pending_ride(self, auth_headers):
        sched = _future_iso(5)
        create = requests.post(f"{BASE_URL}/api/rides", headers=auth_headers,
                               json=_base_ride(ride_type="scheduled", scheduled_at=sched), timeout=15)
        assert create.status_code == 200, create.text
        rid = create.json()["id"]
        new_at = _future_iso(10)
        r = requests.put(f"{BASE_URL}/api/rides/{rid}/reschedule",
                         headers=auth_headers, json={"scheduled_at": new_at}, timeout=10)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("scheduled_at") == new_at
        # confirm persistence
        g = requests.get(f"{BASE_URL}/api/rides/{rid}", headers=auth_headers, timeout=10)
        assert g.json().get("scheduled_at") == new_at

    def test_reschedule_missing_field_400(self, auth_headers):
        # need a valid ride first
        sched = _future_iso(6)
        create = requests.post(f"{BASE_URL}/api/rides", headers=auth_headers,
                               json=_base_ride(ride_type="scheduled", scheduled_at=sched), timeout=15)
        rid = create.json()["id"]
        r = requests.put(f"{BASE_URL}/api/rides/{rid}/reschedule",
                         headers=auth_headers, json={}, timeout=10)
        assert r.status_code == 400

    def test_scheduled_list_includes_new_ride(self, auth_headers):
        sched = _future_iso(7)
        create = requests.post(f"{BASE_URL}/api/rides", headers=auth_headers,
                               json=_base_ride(ride_type="scheduled", scheduled_at=sched), timeout=15)
        rid = create.json()["id"]
        lst = requests.get(f"{BASE_URL}/api/rides/scheduled/list", headers=auth_headers, timeout=10)
        assert lst.status_code == 200
        ids = [it["id"] for it in lst.json().get("items", [])]
        assert rid in ids
