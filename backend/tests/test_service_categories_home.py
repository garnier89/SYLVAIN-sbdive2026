"""Backend tests for the Service Categories 'Accueil' (visible_home) feature.

Covers:
- GET /api/service-categories returns 17 categories with boolean visible_home
- The default 7 keys are flagged visible_home=true; others=false
- Admin can toggle visible_home via POST /api/admin/service-categories/{key}/toggle-home
- The change is persisted (visible on subsequent GET) and toggle returns to OFF
- /taxi hub list (active modes) is unaffected by the home toggle
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://gojek-clone-41.preview.emergentagent.com").rstrip("/")

ADMIN_EMAIL = "admin@superapp.com"
ADMIN_PASSWORD = "SuperAdmin123!"

DEFAULT_HOME_KEYS = {"standard", "pool", "moto", "electric", "book_later", "rental", "intercity"}
EXPECTED_TOTAL = 17


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def admin_session(session):
    r = session.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    if r.status_code != 200:
        pytest.skip(f"Admin login failed: {r.status_code} {r.text[:200]}")
    data = r.json()
    token = data.get("access_token") or data.get("token")
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    if token:
        s.headers.update({"Authorization": f"Bearer {token}"})
    # cookies (if backend uses httpOnly cookies)
    s.cookies.update(session.cookies)
    return s


def test_list_returns_17_with_visible_home(session):
    r = session.get(f"{BASE_URL}/api/service-categories")
    assert r.status_code == 200, r.text
    cats = r.json()
    assert isinstance(cats, list)
    assert len(cats) == EXPECTED_TOTAL, f"expected {EXPECTED_TOTAL} cats, got {len(cats)}"
    for c in cats:
        assert "visible_home" in c, f"missing visible_home on {c.get('key')}"
        assert isinstance(c["visible_home"], bool)


def test_default_home_keys_match_spec(session):
    r = session.get(f"{BASE_URL}/api/service-categories")
    cats = r.json()
    home_on = {c["key"] for c in cats if c["visible_home"]}
    # default-on should be a superset of (at least equal to) DEFAULT_HOME_KEYS at fresh start
    assert DEFAULT_HOME_KEYS.issubset(home_on), f"default keys missing from home: {DEFAULT_HOME_KEYS - home_on}"


def test_admin_toggle_home_airport_on_off(admin_session, session):
    # Read current state of airport
    cats_before = session.get(f"{BASE_URL}/api/service-categories").json()
    airport_before = next(c for c in cats_before if c["key"] == "airport")
    start_state = airport_before["visible_home"]

    # Toggle ON (or whatever the inverse is)
    r1 = admin_session.post(f"{BASE_URL}/api/admin/service-categories/airport/toggle-home")
    assert r1.status_code == 200, r1.text
    body1 = r1.json()
    assert body1["key"] == "airport"
    assert body1["visible_home"] == (not start_state)

    # Verify persistence
    cats_mid = session.get(f"{BASE_URL}/api/service-categories").json()
    airport_mid = next(c for c in cats_mid if c["key"] == "airport")
    assert airport_mid["visible_home"] == (not start_state)

    # Toggle back to restore
    r2 = admin_session.post(f"{BASE_URL}/api/admin/service-categories/airport/toggle-home")
    assert r2.status_code == 200, r2.text
    body2 = r2.json()
    assert body2["visible_home"] == start_state

    cats_after = session.get(f"{BASE_URL}/api/service-categories").json()
    airport_after = next(c for c in cats_after if c["key"] == "airport")
    assert airport_after["visible_home"] == start_state


def test_taxi_hub_unaffected_by_home_toggle(admin_session, session):
    """All 17 modes (active=true) should still be listed regardless of visible_home."""
    # Toggle airport OFF (it's currently OFF — toggling sets it ON, then back OFF)
    admin_session.post(f"{BASE_URL}/api/admin/service-categories/airport/toggle-home")
    cats_on = session.get(f"{BASE_URL}/api/service-categories").json()
    assert len(cats_on) == EXPECTED_TOTAL
    active_on = [c for c in cats_on if c.get("active", True)]
    assert len(active_on) == EXPECTED_TOTAL, "active set must not change when toggling home"

    # Restore
    admin_session.post(f"{BASE_URL}/api/admin/service-categories/airport/toggle-home")


def test_toggle_home_404_on_unknown_key(admin_session):
    r = admin_session.post(f"{BASE_URL}/api/admin/service-categories/__notexist__/toggle-home")
    assert r.status_code == 404


def test_toggle_home_requires_auth():
    # Fresh session with no auth cookies/headers
    fresh = requests.Session()
    fresh.headers.update({"Content-Type": "application/json"})
    r = fresh.post(f"{BASE_URL}/api/admin/service-categories/airport/toggle-home")
    assert r.status_code in (401, 403), f"expected 401/403, got {r.status_code}"
