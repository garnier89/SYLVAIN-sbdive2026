"""Pack B Driver Pro endpoints tests (iter 84).

Covers /api/driver-pro/* :
- vehicles CRUD + set-primary + duplicate plate
- bank GET/PUT (masking, IBAN validation)
- earnings stats (day/week/month buckets)
- gallery list/add/delete
- admin cancellation-reasons CRUD + driver list
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://gojek-clone-41.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

from _creds import ADMIN_EMAIL, ADMIN_PASSWORD, DRIVER_EMAIL, DRIVER_PASSWORD  # noqa: E402,F401


def _login(session: requests.Session, email: str, password: str) -> int:
    r = session.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=30)
    return r.status_code


@pytest.fixture(scope="module")
def driver_session():
    s = requests.Session()
    code = _login(s, DRIVER_EMAIL, DRIVER_PASSWORD)
    if code != 200:
        pytest.skip(f"Driver login failed: {code}")
    return s


@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    code = _login(s, ADMIN_EMAIL, ADMIN_PASSWORD)
    if code != 200:
        pytest.skip(f"Admin login failed: {code}")
    return s


# ------------------- Cancellation reasons (driver-visible list) -------------------

class TestCancellationReasonsList:
    def test_list_requires_auth_or_public(self, driver_session):
        # uses get_current_user-free signature? Actually code uses request only without calling get_current_user, so public
        r = driver_session.get(f"{API}/driver-pro/cancellation-reasons", params={"user_type": "Driver"})
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)

    def test_list_unauth(self):
        r = requests.get(f"{API}/driver-pro/cancellation-reasons?user_type=Driver", timeout=15)
        # endpoint signature has no auth dep -> 200 expected
        assert r.status_code == 200


# ------------------- Vehicles CRUD -------------------

class TestVehicles:
    plate = f"TEST-{uuid.uuid4().hex[:6].upper()}"
    created_id = None

    def test_list_initial(self, driver_session):
        r = driver_session.get(f"{API}/driver-pro/vehicles")
        assert r.status_code == 200
        body = r.json()
        assert "items" in body and "count" in body
        assert isinstance(body["items"], list)

    def test_create_missing_field(self, driver_session):
        r = driver_session.post(f"{API}/driver-pro/vehicles", json={"brand": "Renault"})
        assert r.status_code == 400

    def test_create_ok(self, driver_session):
        payload = {
            "brand": "TEST_Renault",
            "model": "Clio",
            "plate": TestVehicles.plate,
            "year": 2022,
            "color": "Bleu",
            "vehicle_type": "Berline",
        }
        r = driver_session.post(f"{API}/driver-pro/vehicles", json=payload)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["plate"] == TestVehicles.plate.upper()
        assert "id" in data
        TestVehicles.created_id = data["id"]
        # GET to verify persistence
        gr = driver_session.get(f"{API}/driver-pro/vehicles")
        ids = [v["id"] for v in gr.json()["items"]]
        assert TestVehicles.created_id in ids

    def test_create_duplicate_plate(self, driver_session):
        payload = {
            "brand": "Peugeot", "model": "208", "plate": TestVehicles.plate,
            "year": 2021, "color": "Noir", "vehicle_type": "Berline",
        }
        r = driver_session.post(f"{API}/driver-pro/vehicles", json=payload)
        assert r.status_code == 400

    def test_set_primary(self, driver_session):
        assert TestVehicles.created_id
        r = driver_session.post(f"{API}/driver-pro/vehicles/{TestVehicles.created_id}/set-primary")
        assert r.status_code == 200

    def test_update(self, driver_session):
        assert TestVehicles.created_id
        r = driver_session.put(
            f"{API}/driver-pro/vehicles/{TestVehicles.created_id}",
            json={"color": "Rouge", "year": 2023},
        )
        assert r.status_code == 200

    def test_delete(self, driver_session):
        assert TestVehicles.created_id
        r = driver_session.delete(f"{API}/driver-pro/vehicles/{TestVehicles.created_id}")
        assert r.status_code == 200
        # confirm gone
        gr = driver_session.get(f"{API}/driver-pro/vehicles")
        ids = [v["id"] for v in gr.json()["items"]]
        assert TestVehicles.created_id not in ids


# ------------------- Bank -------------------

class TestBank:
    def test_get_initial(self, driver_session):
        r = driver_session.get(f"{API}/driver-pro/bank")
        assert r.status_code == 200
        # could already exist from prior tests; just verify dict
        assert isinstance(r.json(), dict)

    def test_put_invalid_iban(self, driver_session):
        r = driver_session.put(f"{API}/driver-pro/bank", json={
            "account_holder": "Jean Dupont", "iban": "FR123", "bic": "BNPAFRPP",
        })
        assert r.status_code == 400

    def test_put_ok(self, driver_session):
        iban = "FR7612345678901234567890123"
        r = driver_session.put(f"{API}/driver-pro/bank", json={
            "account_holder": "Jean Dupont", "iban": iban, "bic": "BNPAFRPP",
        })
        assert r.status_code == 200, r.text
        assert r.json().get("iban_last4") == iban[-4:]

    def test_get_after_put_masked(self, driver_session):
        r = driver_session.get(f"{API}/driver-pro/bank")
        assert r.status_code == 200
        data = r.json()
        assert "iban_masked" in data
        assert "iban" not in data
        assert "****" in data["iban_masked"]


# ------------------- Earnings stats -------------------

class TestEarningsStats:
    def test_week(self, driver_session):
        r = driver_session.get(f"{API}/driver-pro/earnings/stats", params={"period": "week"})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["period"] == "week"
        assert d["bucket"] == "day"
        assert "total" in d and "count" in d and isinstance(d["points"], list)

    def test_day(self, driver_session):
        r = driver_session.get(f"{API}/driver-pro/earnings/stats", params={"period": "day"})
        assert r.status_code == 200
        assert r.json()["bucket"] == "hour"

    def test_month(self, driver_session):
        r = driver_session.get(f"{API}/driver-pro/earnings/stats", params={"period": "month"})
        assert r.status_code == 200
        assert r.json()["bucket"] == "day"


# ------------------- Gallery -------------------

class TestGallery:
    created_id = None
    SMALL_IMG = (
        "data:image/png;base64,"
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
    )

    def test_list(self, driver_session):
        r = driver_session.get(f"{API}/driver-pro/gallery")
        assert r.status_code == 200
        assert "items" in r.json() and "count" in r.json()

    def test_add(self, driver_session):
        r = driver_session.post(f"{API}/driver-pro/gallery", json={
            "file_url": TestGallery.SMALL_IMG,
            "mime_type": "image/png",
            "caption": "TEST_photo",
            "category": "vehicle",
        })
        assert r.status_code == 200, r.text
        data = r.json()
        assert "id" in data
        TestGallery.created_id = data["id"]

    def test_delete(self, driver_session):
        assert TestGallery.created_id
        r = driver_session.delete(f"{API}/driver-pro/gallery/{TestGallery.created_id}")
        assert r.status_code == 200


# ------------------- Admin cancellation reasons CRUD -------------------

class TestAdminCancellationReasons:
    created_id = None

    def test_list(self, admin_session):
        r = admin_session.get(f"{API}/driver-pro/admin/cancellation-reasons")
        assert r.status_code == 200, r.text
        assert isinstance(r.json(), list)

    def test_create(self, admin_session):
        r = admin_session.post(f"{API}/driver-pro/admin/cancellation-reasons", json={
            "reason_fr": "TEST_motif_iter84",
            "reason_en": "TEST_reason_iter84",
            "user_type": "Driver",
            "display_order": 99,
        })
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["reason_fr"] == "TEST_motif_iter84"
        TestAdminCancellationReasons.created_id = data["id"]

    def test_update(self, admin_session):
        rid = TestAdminCancellationReasons.created_id
        assert rid
        r = admin_session.put(f"{API}/driver-pro/admin/cancellation-reasons/{rid}", json={
            "reason_fr": "TEST_motif_iter84_v2", "display_order": 100,
        })
        assert r.status_code == 200

    def test_delete(self, admin_session):
        rid = TestAdminCancellationReasons.created_id
        assert rid
        r = admin_session.delete(f"{API}/driver-pro/admin/cancellation-reasons/{rid}")
        assert r.status_code == 200

    def test_non_admin_forbidden(self, driver_session):
        r = driver_session.get(f"{API}/driver-pro/admin/cancellation-reasons")
        assert r.status_code in (401, 403)
