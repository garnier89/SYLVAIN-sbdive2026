"""
Iter70 - SB Drive Tab (Kiosk) backend tests.
Covers admin CRUD + public unlock/info/nearest-driver/estimate/book/ride status.
"""
import os
import pytest
import requests
import uuid

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # Fallback - read from frontend/.env (no default URLs hardcoded)
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
                break

ADMIN_EMAIL = "admin@superapp.com"
ADMIN_PASSWORD = os.environ.get("TEST_ADMIN_PASSWORD", "SuperAdmin123!")


@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login",
               json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="module")
def created_kiosk(admin_session):
    """Create a fresh kiosk for testing (clean state)."""
    pin = "5678"  # different from existing 1234
    payload = {
        "hotel_name": f"TEST_Hotel_{uuid.uuid4().hex[:6]}",
        "address": "Ducos 97224, Martinique",
        "lat": 14.5882,
        "lng": -60.9494,
        "pin_code": pin,
        "language": "fr",
        "currency": "EUR",
    }
    r = admin_session.post(f"{BASE_URL}/api/kiosk/admin/create", json=payload)
    assert r.status_code == 200, f"create failed: {r.status_code} {r.text}"
    data = r.json()
    assert "id" in data and "session_token" in data and "kiosk_url" in data
    yield {**data, "pin_code": pin, "hotel_name": payload["hotel_name"]}
    # cleanup
    admin_session.delete(f"{BASE_URL}/api/kiosk/admin/{data['id']}")


# ===================== Admin endpoints =====================

class TestAdminKiosk:
    def test_create_requires_admin(self):
        # Unauthenticated should be 401/403
        r = requests.post(f"{BASE_URL}/api/kiosk/admin/create",
                          json={"hotel_name": "X", "address": "X", "lat": 0, "lng": 0, "pin_code": "1234"})
        assert r.status_code in (401, 403)

    def test_create_kiosk(self, created_kiosk):
        assert created_kiosk["id"].startswith("kiosk_")
        assert len(created_kiosk["session_token"]) > 20

    def test_list_kiosks(self, admin_session, created_kiosk):
        r = admin_session.get(f"{BASE_URL}/api/kiosk/admin/list")
        assert r.status_code == 200
        data = r.json()
        assert "items" in data
        ids = [k["id"] for k in data["items"]]
        assert created_kiosk["id"] in ids

    def test_update_kiosk(self, admin_session, created_kiosk):
        new_name = f"TEST_Updated_{uuid.uuid4().hex[:4]}"
        r = admin_session.put(
            f"{BASE_URL}/api/kiosk/admin/{created_kiosk['id']}",
            json={
                "hotel_name": new_name,
                "address": created_kiosk["hotel_name"],
                "lat": 14.6,
                "lng": -61.0,
                "pin_code": created_kiosk["pin_code"],
                "language": "fr",
                "currency": "EUR",
            }
        )
        assert r.status_code == 200
        assert r.json().get("updated") is True

    def test_regenerate_token(self, admin_session, created_kiosk):
        r = admin_session.post(f"{BASE_URL}/api/kiosk/admin/{created_kiosk['id']}/regenerate-token")
        assert r.status_code == 200
        new_token = r.json().get("session_token")
        assert new_token and new_token != created_kiosk["session_token"]
        # Update fixture token for downstream tests
        created_kiosk["session_token"] = new_token

    def test_create_invalid_pin(self, admin_session):
        r = admin_session.post(f"{BASE_URL}/api/kiosk/admin/create",
                               json={"hotel_name": "X", "address": "Y", "lat": 0, "lng": 0, "pin_code": "ab"})
        assert r.status_code == 400


# ===================== Public kiosk endpoints =====================

class TestKioskPublic:
    def test_unlock_correct_pin(self, created_kiosk):
        r = requests.post(f"{BASE_URL}/api/kiosk/unlock",
                          json={"pin_code": created_kiosk["pin_code"]})
        assert r.status_code == 200
        data = r.json()
        assert data["session_token"] == created_kiosk["session_token"]
        assert data["kiosk_id"] == created_kiosk["id"]
        assert "hotel_name" in data and "address" in data

    def test_unlock_wrong_pin(self):
        r = requests.post(f"{BASE_URL}/api/kiosk/unlock",
                          json={"pin_code": "0000000"})
        assert r.status_code == 401

    def test_kiosk_info(self, created_kiosk):
        token = created_kiosk["session_token"]
        r = requests.get(f"{BASE_URL}/api/kiosk/{token}/info")
        assert r.status_code == 200
        data = r.json()
        assert data["kiosk_id"] == created_kiosk["id"]
        assert "hotel_name" in data and "vehicles" in data
        veh_keys = {v["key"] for v in data["vehicles"]}
        assert {"sb", "confort", "fast", "taxi", "van"}.issubset(veh_keys)

    def test_kiosk_info_invalid_token(self):
        r = requests.get(f"{BASE_URL}/api/kiosk/invalid_token_xyz/info")
        assert r.status_code == 404

    def test_nearest_driver(self, created_kiosk):
        token = created_kiosk["session_token"]
        r = requests.get(f"{BASE_URL}/api/kiosk/{token}/nearest-driver")
        assert r.status_code == 200
        data = r.json()
        assert "available" in data and "drivers_online" in data
        # eta might be None if no drivers within 50km - that's OK
        if data["available"]:
            assert isinstance(data["eta_minutes"], int)
            assert data["eta_minutes"] >= 2

    def test_estimate(self, created_kiosk):
        token = created_kiosk["session_token"]
        # ~13km away
        r = requests.post(f"{BASE_URL}/api/kiosk/{token}/estimate",
                          json={"dest_lat": 14.6700, "dest_lng": -61.0100, "vehicle_type": "sb"})
        assert r.status_code == 200
        data = r.json()
        assert "distance_km" in data and "estimated_fare" in data
        assert data["distance_km"] > 0
        assert data["estimated_fare"] > 0
        assert data["vehicle_type"] == "sb"

    def test_estimate_van_pricing_diff(self, created_kiosk):
        token = created_kiosk["session_token"]
        body = {"dest_lat": 14.67, "dest_lng": -61.01}
        sb = requests.post(f"{BASE_URL}/api/kiosk/{token}/estimate", json={**body, "vehicle_type": "sb"}).json()
        van = requests.post(f"{BASE_URL}/api/kiosk/{token}/estimate", json={**body, "vehicle_type": "van"}).json()
        # Van should be more expensive than SB
        assert van["estimated_fare"] > sb["estimated_fare"]

    def test_book_creates_ride(self, created_kiosk):
        token = created_kiosk["session_token"]
        r = requests.post(f"{BASE_URL}/api/kiosk/{token}/book", json={
            "first_name": "TEST_John",
            "last_name": "Doe",
            "email": "TEST_kiosk@example.com",
            "phone": "+33612345678",
            "dest_lat": 14.67,
            "dest_lng": -61.01,
            "dest_address": "TEST destination",
            "vehicle_type": "confort",
        })
        assert r.status_code == 200
        data = r.json()
        assert "ride_id" in data and "booking_no" in data
        assert len(data["booking_no"]) == 8
        # Persist ride_id for next test
        TestKioskPublic.ride_id = data["ride_id"]

    def test_ride_status(self, created_kiosk):
        token = created_kiosk["session_token"]
        ride_id = getattr(TestKioskPublic, "ride_id", None)
        if not ride_id:
            pytest.skip("Booking test must run first")
        r = requests.get(f"{BASE_URL}/api/kiosk/{token}/ride/{ride_id}")
        assert r.status_code == 200
        data = r.json()
        assert data["id"] == ride_id
        assert data["status"] == "pending"

    def test_ride_status_unknown(self, created_kiosk):
        token = created_kiosk["session_token"]
        r = requests.get(f"{BASE_URL}/api/kiosk/{token}/ride/ride_does_not_exist")
        assert r.status_code == 404
