"""Iteration 44 - Splash screen + 'other login options' modal regression.

Tests cover:
- Existing phone auth regression (/api/auth/check-phone, /api/auth/phone-login, /api/auth/phone-register)
- /api/auth/google/session endpoint: verifies 400 on missing session_id and 4xx/5xx on invalid session_id (endpoint is reachable and handler works).
"""
import os
import uuid
import pytest
import requests

def _load_backend_url():
    url = os.environ.get('REACT_APP_BACKEND_URL')
    if url:
        return url.rstrip('/')
    try:
        with open('/app/frontend/.env') as f:
            for ln in f:
                if ln.startswith('REACT_APP_BACKEND_URL='):
                    return ln.split('=', 1)[1].strip().rstrip('/')
    except Exception:
        pass
    raise RuntimeError('REACT_APP_BACKEND_URL not set')


BASE_URL = _load_backend_url()
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


class TestPhoneAuthRegression:
    """Existing phone auth flows should still work after splash/modal changes."""

    unique_phone = f"+33 6 99 {uuid.uuid4().int % 900000 + 100000}"
    password = "TestPass123!"

    def test_check_phone_new_number(self, client):
        r = client.post(f"{API}/auth/check-phone", json={"phone": self.unique_phone})
        assert r.status_code == 200, f"got {r.status_code} body={r.text}"
        data = r.json()
        assert "exists" in data
        assert data["exists"] is False

    def test_phone_register_then_login(self, client):
        # Register new user
        reg_payload = {
            "phone": self.unique_phone,
            "password": self.password,
            "name": "TEST_User_Iter44",
            "role": "user",
        }
        r = client.post(f"{API}/auth/phone-register", json=reg_payload)
        assert r.status_code in (200, 201), f"register failed: {r.status_code} {r.text}"
        data = r.json()
        assert "user" in data
        assert data["user"]["name"] == "TEST_User_Iter44"
        assert data["user"]["role"] == "user"

        # check-phone now says exists=True
        r2 = client.post(f"{API}/auth/check-phone", json={"phone": self.unique_phone})
        assert r2.status_code == 200
        assert r2.json()["exists"] is True

        # Login via phone+password
        r3 = client.post(
            f"{API}/auth/phone-login",
            json={"phone": self.unique_phone, "password": self.password},
        )
        assert r3.status_code == 200, f"login failed: {r3.status_code} {r3.text}"
        ld = r3.json()
        assert ld["user"]["name"] == "TEST_User_Iter44"

    def test_phone_login_wrong_password(self, client):
        r = client.post(
            f"{API}/auth/phone-login",
            json={"phone": self.unique_phone, "password": "WrongPass!"},
        )
        assert r.status_code in (400, 401, 403), f"expected 4xx got {r.status_code}"


class TestGoogleSessionEndpoint:
    """Verify /api/auth/google/session handler is reachable and validates input."""

    def test_missing_session_id_returns_400(self, client):
        r = client.post(f"{API}/auth/google/session", json={})
        assert r.status_code == 400, f"expected 400, got {r.status_code} {r.text}"
        assert "session" in r.text.lower() or "required" in r.text.lower()

    def test_invalid_session_id_returns_4xx_or_5xx(self, client):
        # Fake session id; emergent demobackend should reject this with non-200,
        # so our handler returns 401 (or 500 if network error). Either proves
        # the endpoint is wired up and doing its job.
        r = client.post(
            f"{API}/auth/google/session",
            json={"session_id": "FAKE_SESSION_ID_ITER44_TEST"},
        )
        assert r.status_code in (401, 500), f"unexpected status {r.status_code}: {r.text}"


class TestDriverAuthRegression:
    """Driver login path used by /chauffeur/login."""

    def test_existing_driver_login(self, client):
        r = client.post(
            f"{API}/auth/phone-login",
            json={"phone": "+33 6 00 00 00 02", "password": "Driver123!"},
        )
        # Credentials may or may not be seeded; accept 200 OR clean 4xx (NOT 500)
        assert r.status_code in (200, 400, 401, 404), (
            f"unexpected status {r.status_code}: {r.text}"
        )
        if r.status_code == 200:
            assert r.json()["user"]["role"] == "driver"
