"""Iter69 — Backend tests for /api/drivers/my-score-history + regressions."""
import os
import pytest
import requests
from pathlib import Path


def _load_base_url():
    url = os.environ.get('REACT_APP_BACKEND_URL', '').strip()
    if url:
        return url.rstrip('/')
    env_file = Path('/app/frontend/.env')
    if env_file.exists():
        for line in env_file.read_text().splitlines():
            if line.startswith('REACT_APP_BACKEND_URL='):
                return line.split('=', 1)[1].strip().rstrip('/')
    return ''


BASE_URL = _load_base_url()
DRIVER_EMAIL = "driver_waybill_1778553153@test.com"
DRIVER_PASS = os.environ.get("TEST_DRIVER_PASSWORD_ALT", "Driver1234!")
USER_EMAIL = "neg_test@example.com"
USER_PASS = os.environ.get("TEST_NEG_PASSWORD", "Test1234!")


def _login(session, email, password):
    r = session.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password})
    return r


@pytest.fixture
def driver_session():
    s = requests.Session()
    r = _login(s, DRIVER_EMAIL, DRIVER_PASS)
    if r.status_code != 200:
        pytest.skip(f"Driver login failed: {r.status_code} {r.text[:200]}")
    return s


@pytest.fixture
def user_session():
    s = requests.Session()
    r = _login(s, USER_EMAIL, USER_PASS)
    if r.status_code != 200:
        pytest.skip(f"User login failed: {r.status_code}")
    return s


# ===== /my-score-history shape =====
class TestScoreHistory:
    def test_score_history_endpoint_returns_full_shape(self, driver_session):
        r = driver_session.get(f"{BASE_URL}/api/drivers/my-score-history")
        assert r.status_code == 200, r.text
        d = r.json()
        # required top-level keys
        for k in ("current_points", "current_palette", "next_palette", "history", "totals"):
            assert k in d, f"missing key {k} in {d.keys()}"
        # types
        assert isinstance(d["current_points"], int)
        assert isinstance(d["history"], list)
        assert len(d["history"]) <= 50
        # totals subkeys
        for k in ("gained", "lost", "entries"):
            assert k in d["totals"]
            assert isinstance(d["totals"][k], int)
        # current_palette structure
        if d["current_palette"]:
            for k in ("name", "color", "min_points", "max_points"):
                assert k in d["current_palette"]
        # next_palette structure if present
        if d["next_palette"]:
            for k in ("name", "color", "min_points", "points_to_reach"):
                assert k in d["next_palette"]
            assert d["next_palette"]["points_to_reach"] > 0

    def test_score_history_history_entries_have_delta_and_at(self, driver_session):
        r = driver_session.get(f"{BASE_URL}/api/drivers/my-score-history")
        assert r.status_code == 200
        d = r.json()
        # iter68 should have added at least 2 entries (+3 / -1)
        if len(d["history"]) > 0:
            for e in d["history"]:
                assert "delta" in e
                assert isinstance(e.get("delta"), int)
        # totals math
        total_gained = sum(max(0, e.get("delta", 0)) for e in d["history"])
        total_lost = sum(-min(0, e.get("delta", 0)) for e in d["history"])
        # if history not capped, totals from endpoint should match (history is capped at 50)
        if d["totals"]["entries"] <= 50:
            assert d["totals"]["gained"] == total_gained
            assert d["totals"]["lost"] == total_lost

    def test_score_history_requires_auth(self):
        s = requests.Session()
        r = s.get(f"{BASE_URL}/api/drivers/my-score-history")
        assert r.status_code in (401, 403)


# ===== Regression: existing driver activity endpoints still work =====
class TestRegressionDriverEndpoints:
    def test_my_activity_works(self, driver_session):
        r = driver_session.get(f"{BASE_URL}/api/drivers/my-activity")
        assert r.status_code == 200
        d = r.json()
        assert "points" in d and "palette" in d

    def test_my_stats_works(self, driver_session):
        r = driver_session.get(f"{BASE_URL}/api/drivers/my-stats")
        assert r.status_code == 200

    def test_top_drivers_public(self):
        r = requests.get(f"{BASE_URL}/api/drivers/top")
        assert r.status_code == 200
        assert "drivers" in r.json()

    def test_profile_works(self, driver_session):
        r = driver_session.get(f"{BASE_URL}/api/drivers/profile")
        assert r.status_code == 200


# ===== Regression: user auth + ride API still works =====
class TestRegressionUserAuth:
    def test_user_login_works(self, user_session):
        r = user_session.get(f"{BASE_URL}/api/auth/me")
        assert r.status_code == 200

    def test_user_rides_list(self, user_session):
        r = user_session.get(f"{BASE_URL}/api/rides")
        assert r.status_code == 200
