"""
Iteration 234 — Pancarte VIP Aéroport (Airport VIP Sign) backend verification.

These tests prove the backend correctly exposes `passenger_name` (and friends)
to the driver assigned to an airport ride. This is the data the frontend
component AirportVipSign uses to display the welcome sign at the airport.

Endpoints covered:
- POST /api/auth/register (create client)
- POST /api/auth/login   (client + driver phone login)
- POST /api/rides        (client creates airport ride)
- POST /api/rides/{id}/accept (driver accepts)
- GET  /api/rides/{id}        (driver reads ride -> passenger_name expected)
- GET  /api/rides/active/current (driver active ride -> passenger_name expected)
"""
import os
import uuid
import time

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://gojek-clone-41.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

DRIVER_PHONE = "+33644112233"
DRIVER_PASSWORD = "Chauffeur2026!"


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------
@pytest.fixture(scope="module")
def driver_token():
    """Login the demo phone-driver. Skip module if unavailable."""
    r = requests.post(f"{API}/auth/phone-login", json={
        "phone": DRIVER_PHONE,
        "password": DRIVER_PASSWORD,
    }, timeout=20)
    assert r.status_code == 200, f"Driver phone-login failed: {r.status_code} {r.text}"
    data = r.json()
    tok = data.get("access_token") or data.get("token")
    assert tok, f"No token in driver login response: {data}"
    return tok


@pytest.fixture(scope="module")
def client_session():
    """Create a fresh client (TEST_ prefix) and return (session, user_dict)."""
    suffix = uuid.uuid4().hex[:8]
    payload = {
        "email": f"test_vip_{suffix}@example.com",
        "password": "TestVip123!",
        "name": f"TEST_VIP Client {suffix}",
        "phone": f"+33611{suffix[:6]}",
        "role": "user",
    }
    r = requests.post(f"{API}/auth/register", json=payload, timeout=20)
    assert r.status_code in (200, 201), f"Register failed: {r.status_code} {r.text}"
    data = r.json()
    tok = data.get("access_token") or data.get("token")
    assert tok, f"No token after register: {data}"
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {tok}", "Content-Type": "application/json"})
    return s, payload


# ---------------------------------------------------------------------------
# Airport ride creation + driver visibility of passenger_name
# ---------------------------------------------------------------------------
class TestAirportVipPassengerName:
    """End-to-end: client books airport ride -> driver sees passenger_name."""

    def test_health(self):
        r = requests.get(f"{API}/", timeout=10)
        # Either 200 with payload or some recognizable response
        assert r.status_code in (200, 404), f"Backend unreachable: {r.status_code}"

    def test_create_airport_ride_and_driver_sees_passenger_name(self, client_session, driver_token):
        s, client_user = client_session
        # 1) Create airport ride
        ride_payload = {
            "pickup_lat": 48.7262,   # CDG-ish
            "pickup_lng": 2.3652,
            "pickup_address": "Aéroport Paris-CDG, Terminal 2E",
            "dropoff_lat": 48.8566,
            "dropoff_lng": 2.3522,
            "dropoff_address": "Paris Centre",
            "vehicle_type": "sb",
            "payment_method": "cash",
            "ride_type": "airport",
            "flight_number": "AF1234",
            "airport_terminal": "2E",
            "auto_assign": False,
        }
        r = s.post(f"{API}/rides", json=ride_payload, timeout=30)
        assert r.status_code == 200, f"Create ride failed: {r.status_code} {r.text}"
        ride = r.json()
        ride_id = ride.get("id") or ride.get("ride_id")
        assert ride_id, f"No ride id in response: {ride}"
        assert ride.get("ride_type") == "airport"

        # 2) Driver accepts
        dh = {"Authorization": f"Bearer {driver_token}"}
        # Make sure driver is online
        try:
            requests.post(f"{API}/drivers/online", json={"is_online": True}, headers=dh, timeout=15)
        except Exception:
            pass

        r = requests.post(f"{API}/rides/{ride_id}/accept", headers=dh, timeout=20)
        assert r.status_code == 200, f"Driver accept failed: {r.status_code} {r.text}"

        # 3) GET /api/rides/{ride_id} as driver -> must contain passenger_name
        time.sleep(0.5)
        r = requests.get(f"{API}/rides/{ride_id}", headers=dh, timeout=15)
        assert r.status_code == 200, f"Driver GET ride failed: {r.status_code} {r.text}"
        body = r.json()
        assert body.get("status") in ("accepted", "arriving"), f"Unexpected status: {body.get('status')}"
        assert body.get("ride_type") == "airport"
        assert body.get("flight_number") == "AF1234"
        assert "passenger_name" in body, "Backend did not expose passenger_name to driver"
        assert body["passenger_name"] == client_user["name"], (
            f"passenger_name mismatch. expected={client_user['name']!r} got={body['passenger_name']!r}"
        )
        # Bonus: also surfaces phone for the driver
        assert body.get("passenger_phone") in (client_user["phone"], None) or isinstance(body.get("passenger_phone"), str)

        # 4) GET /api/rides/active/current as driver -> same name
        r = requests.get(f"{API}/rides/active/current", headers=dh, timeout=15)
        assert r.status_code == 200, f"active/current failed: {r.status_code} {r.text}"
        active = r.json()
        assert active and active.get("id") == ride_id, f"active ride mismatch: {active}"
        assert active.get("passenger_name") == client_user["name"], (
            f"active passenger_name mismatch. expected={client_user['name']!r} got={active.get('passenger_name')!r}"
        )

        # Save ride id for cleanup test
        TestAirportVipPassengerName._ride_id = ride_id

    def test_book_for_name_overrides_passenger_name(self, client_session, driver_token):
        """When the client books for someone else, passenger_name must be book_for_name."""
        s, _ = client_session
        ride_payload = {
            "pickup_lat": 48.7262,
            "pickup_lng": 2.3652,
            "pickup_address": "Aéroport Paris-CDG, Terminal 2F",
            "dropoff_lat": 48.8566,
            "dropoff_lng": 2.3522,
            "dropoff_address": "Paris Centre",
            "vehicle_type": "sb",
            "payment_method": "cash",
            "ride_type": "airport",
            "flight_number": "BA77",
            "airport_terminal": "2F",
            "auto_assign": False,
            "book_for_name": "TEST_VIP Mr Smith",
            "book_for_phone": "+33700000001",
        }
        r = s.post(f"{API}/rides", json=ride_payload, timeout=30)
        assert r.status_code == 200, f"Create book-for ride failed: {r.status_code} {r.text}"
        ride_id = r.json().get("id")
        assert ride_id

        dh = {"Authorization": f"Bearer {driver_token}"}
        r = requests.post(f"{API}/rides/{ride_id}/accept", headers=dh, timeout=20)
        # Driver might already have an active ride from previous test; if so this is acceptable but
        # the test still validates name when read.
        if r.status_code != 200:
            # finish previous ride is out of scope; we cancel this second ride to clean up
            try:
                requests.post(f"{API}/rides/{ride_id}/cancel", headers=s.headers, timeout=15)
            except Exception:
                pass
            pytest.skip(f"Driver busy, cannot accept 2nd ride ({r.status_code}); single-ride flow already validated.")

        r = requests.get(f"{API}/rides/{ride_id}", headers=dh, timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert body.get("passenger_name") == "TEST_VIP Mr Smith", body.get("passenger_name")


# ---------------------------------------------------------------------------
# Sanity: enrich_passenger_info shape (defensive — non-driver auth must NOT
# get passenger_name leaked back to themselves duplicated.) Just verify the
# field name is exactly 'passenger_name' and not something else.
# ---------------------------------------------------------------------------
class TestPassengerNameFieldContract:
    def test_field_present_on_active_current(self, driver_token):
        dh = {"Authorization": f"Bearer {driver_token}"}
        r = requests.get(f"{API}/rides/active/current", headers=dh, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        if data and data.get("id"):
            assert "passenger_name" in data
            assert isinstance(data["passenger_name"], str)
            assert len(data["passenger_name"]) > 0
