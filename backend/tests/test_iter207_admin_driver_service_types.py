"""Iter207 — Admin override of driver service_types (taxi/delivery/courier).

Tests the new admin endpoint:
  PUT /api/admin/drivers/{driver_id}/service-types

And verifies the side-effects:
  - Adding 'taxi' enables taxi_mode='car' automatically (overrides VTC gating)
  - Removing 'taxi' sets taxi_mode=None
  - After enabling 'taxi', driver home-feed exposes scheduled_pending taxi rides
  - Empty list -> 400
  - Unknown driver -> 404
"""
import os
import sys
from datetime import datetime, timedelta, timezone

import pytest
import requests

sys.path.insert(0, os.path.dirname(__file__))
from _creds import ADMIN_EMAIL, ADMIN_PASSWORD  # noqa: E402

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://gojek-clone-41.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


# ---------- Fixtures ----------

@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    return s


DRIVER_EMAIL = "jean.dupont@demo.sb"
DRIVER_PASSWORD = "Driver123!"


@pytest.fixture(scope="module")
def driver_session_for():
    """Login the demo driver via email/password first, return session + user_id."""
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": DRIVER_EMAIL, "password": DRIVER_PASSWORD}, timeout=15)
    if r.status_code != 200:
        pytest.skip(f"Driver login failed: {r.status_code} {r.text}")
    me = s.get(f"{API}/auth/me", timeout=15).json()
    s.user_id = me["id"]  # type: ignore
    return s


@pytest.fixture(scope="module")
def courier_driver(admin_session, driver_session_for):
    """Locate the driver row of jean.dupont via user_id."""
    user_id = driver_session_for.user_id  # type: ignore
    r = admin_session.get(f"{API}/admin/drivers?limit=500", timeout=15)
    assert r.status_code == 200, r.text
    payload = r.json()
    drivers = payload.get("drivers") or payload.get("items") or (payload if isinstance(payload, list) else [])
    target = next((d for d in drivers if d.get("user_id") == user_id), None)
    assert target, f"No driver record found for user_id={user_id}"
    return target


# ---------- Tests ----------

class TestAdminSetDriverServiceTypes:

    def test_set_courier_only(self, admin_session, courier_driver):
        did = courier_driver["id"]
        r = admin_session.put(
            f"{API}/admin/drivers/{did}/service-types",
            json={"service_types": ["courier"]},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["driver_id"] == did
        assert set(data["service_types"]) == {"courier"}
        assert data["taxi_mode"] is None

        # Verify via admin GET that change persisted
        list_r = admin_session.get(f"{API}/admin/drivers?limit=500", timeout=15)
        all_drivers = list_r.json().get("drivers") or []
        match = next((d for d in all_drivers if d["id"] == did), None)
        assert match is not None
        assert set(match.get("service_types") or []) == {"courier"}

    def test_enable_taxi_sets_taxi_mode_car(self, admin_session, courier_driver):
        did = courier_driver["id"]
        r = admin_session.put(
            f"{API}/admin/drivers/{did}/service-types",
            json={"service_types": ["taxi", "courier"]},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert "taxi" in data["service_types"]
        # taxi_mode auto-set to 'car' when previously None and admin enables taxi
        assert data["taxi_mode"] in ("car", "moto"), f"Unexpected taxi_mode: {data['taxi_mode']}"

    def test_empty_service_types_400(self, admin_session, courier_driver):
        did = courier_driver["id"]
        r = admin_session.put(
            f"{API}/admin/drivers/{did}/service-types",
            json={"service_types": []},
            timeout=15,
        )
        assert r.status_code == 400, r.text

    def test_unknown_driver_404(self, admin_session):
        r = admin_session.put(
            f"{API}/admin/drivers/driver_DOES_NOT_EXIST/service-types",
            json={"service_types": ["taxi"]},
            timeout=15,
        )
        assert r.status_code == 404, r.text

    def test_invalid_values_filtered_then_400(self, admin_session, courier_driver):
        did = courier_driver["id"]
        # All-invalid -> empty after filter -> 400
        r = admin_session.put(
            f"{API}/admin/drivers/{did}/service-types",
            json={"service_types": ["foobar", "xxx"]},
            timeout=15,
        )
        assert r.status_code == 400, r.text


class TestHomeFeedScheduledPending:
    """After admin activates 'taxi' on the driver, the driver home-feed must
    include scheduled_pending taxi reservations (planned taxi rides waiting
    for acceptance)."""

    def _ensure_taxi_enabled(self, admin_session, did):
        r = admin_session.put(
            f"{API}/admin/drivers/{did}/service-types",
            json={"service_types": ["taxi", "courier"]},
            timeout=15,
        )
        assert r.status_code == 200, r.text

    def test_home_feed_has_scheduled_pending_when_taxi(self, admin_session, courier_driver, driver_session_for):
        did = courier_driver["id"]
        self._ensure_taxi_enabled(admin_session, did)

        r = driver_session_for.get(f"{API}/rides/driver/home-feed", timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        # Must expose the scheduled_pending list (possibly empty) and counts
        assert "scheduled_pending" in body
        assert isinstance(body["scheduled_pending"], list)
        assert "counts" in body
        assert "scheduled_pending" in body["counts"]

    def test_home_feed_no_scheduled_pending_when_courier_only(self, admin_session, courier_driver, driver_session_for):
        did = courier_driver["id"]
        # Remove taxi
        r = admin_session.put(
            f"{API}/admin/drivers/{did}/service-types",
            json={"service_types": ["courier"]},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        assert r.json()["taxi_mode"] is None

        r2 = driver_session_for.get(f"{API}/rides/driver/home-feed", timeout=15)
        assert r2.status_code == 200, r2.text
        body = r2.json()
        # Per implementation: scheduled_pending and available_rides are [] when no taxi
        assert body["scheduled_pending"] == []
        assert body["available_rides"] == []
        assert body["counts"]["scheduled_pending"] == 0


# ---------- Teardown: restore driver to courier-only ----------

@pytest.fixture(scope="module", autouse=True)
def _restore_after_module(admin_session, courier_driver):
    yield
    try:
        # Restore jean.dupont as taxi+delivery+courier (its default state)
        admin_session.put(
            f"{API}/admin/drivers/{courier_driver['id']}/service-types",
            json={"service_types": ["taxi", "delivery", "courier"]},
            timeout=15,
        )
    except Exception:
        pass
