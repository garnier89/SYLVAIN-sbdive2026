"""Iter51: Tests for GET /api/drivers/my-active-rewards endpoint.

Covers:
- Auth gating (unauthenticated + non-driver)
- Vehicle matching for car/moto/velo
- Active flag, date window, time window filtering
- Guarantee eligibility based on acceptance/cancellation rates
- Response shape
"""
import os
import pytest
import requests
from datetime import datetime, timedelta, timezone

def _load_base():
    url = os.environ.get("REACT_APP_BACKEND_URL")
    if not url:
        # Fallback: read from frontend/.env
        try:
            with open("/app/frontend/.env") as f:
                for line in f:
                    if line.startswith("REACT_APP_BACKEND_URL="):
                        return line.split("=", 1)[1].strip().rstrip("/")
        except Exception:
            pass
    return (url or "").rstrip("/")

BASE = _load_base()
assert BASE, "REACT_APP_BACKEND_URL not configured"

ADMIN_EMAIL = "admin@superapp.com"
ADMIN_PASSWORD = os.environ.get("TEST_ADMIN_PASSWORD", "SuperAdmin123!")
DRIVER_EMAIL = "testdriver@example.com"
DRIVER_PASSWORD = os.environ.get("TEST_DRIVER_PASSWORD", "Driver123!")


def _login(email, password):
    s = requests.Session()
    r = s.post(f"{BASE}/api/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"login {email} failed: {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="module")
def admin():
    return _login(ADMIN_EMAIL, ADMIN_PASSWORD)


@pytest.fixture(scope="module")
def driver():
    return _login(DRIVER_EMAIL, DRIVER_PASSWORD)


@pytest.fixture(scope="module")
def default_config(admin):
    r = admin.get(f"{BASE}/api/admin/rewards/config", timeout=15)
    assert r.status_code == 200
    return r.json()


@pytest.fixture(autouse=True)
def _restore_config(admin, default_config):
    yield
    # Always restore defaults after each test
    admin.put(f"{BASE}/api/admin/rewards/config", json=default_config, timeout=15)


def _now_hm_offsets():
    now = datetime.now(timezone.utc)
    before = (now - timedelta(hours=2)).strftime("%H:%M")
    after = (now + timedelta(hours=2)).strftime("%H:%M")
    return before, after


def _set_config(admin, regard_vehicles=None, guarantees=None, points=None, base=None):
    payload = {
        "regard_vehicles": regard_vehicles if regard_vehicles is not None else (base or {}).get("regard_vehicles", []),
        "guarantees": guarantees if guarantees is not None else (base or {}).get("guarantees", []),
        "points": points if points is not None else (base or {}).get("points"),
    }
    r = admin.put(f"{BASE}/api/admin/rewards/config", json=payload, timeout=15)
    assert r.status_code == 200, r.text


# -------- AUTH --------
def test_unauthenticated_rejected():
    r = requests.get(f"{BASE}/api/drivers/my-active-rewards", timeout=15)
    assert r.status_code in (401, 403), f"expected 401/403 got {r.status_code}"


def test_non_driver_rejected(admin):
    # admin has no driver profile → 404 per endpoint logic
    r = admin.get(f"{BASE}/api/drivers/my-active-rewards", timeout=15)
    assert r.status_code in (401, 403, 404), f"expected auth/404 got {r.status_code}"


# -------- RESPONSE SHAPE --------
def test_response_shape(driver):
    r = driver.get(f"{BASE}/api/drivers/my-active-rewards", timeout=15)
    assert r.status_code == 200, r.text
    d = r.json()
    for k in [
        "vehicle_rewards", "guarantees", "any_active", "driver_vehicle_type",
        "driver_acceptance_rate", "driver_cancellation_rate", "checked_at",
    ]:
        assert k in d, f"missing key {k}"
    assert isinstance(d["vehicle_rewards"], list)
    assert isinstance(d["guarantees"], list)
    assert isinstance(d["any_active"], bool)


# -------- VEHICLE MATCHING (driver has vehicle_type=car) --------
def test_default_car_driver_sees_voiture_regard(admin, driver, default_config):
    # Default has only Voiture active → car driver should see 1 reward
    before, after = _now_hm_offsets()
    rv = [
        {"id": "rv_car", "type": "Voiture", "active": True, "start_date": "", "end_date": "",
         "start_time": before, "end_time": after, "zone": "Paris", "bonus_per_trip": 3, "min_trips": 5,
         "description": "Bonus voiture"},
        {"id": "rv_moto", "type": "Moto", "active": True, "start_date": "", "end_date": "",
         "start_time": before, "end_time": after, "zone": "Paris", "bonus_per_trip": 2, "min_trips": 5,
         "description": "Bonus moto"},
    ]
    _set_config(admin, regard_vehicles=rv, base=default_config)
    d = driver.get(f"{BASE}/api/drivers/my-active-rewards", timeout=15).json()
    types = [r["type"] for r in d["vehicle_rewards"]]
    assert "Voiture" in types, f"Voiture should match car driver; got {types}"
    assert "Moto" not in types, f"Moto should NOT match car driver; got {types}"


def test_inactive_regard_excluded(admin, driver, default_config):
    before, after = _now_hm_offsets()
    rv = [{"id": "rv_car", "type": "Voiture", "active": False, "start_time": before, "end_time": after,
           "start_date": "", "end_date": "", "zone": "Paris", "bonus_per_trip": 3, "min_trips": 5}]
    _set_config(admin, regard_vehicles=rv, guarantees=[], base=default_config)
    d = driver.get(f"{BASE}/api/drivers/my-active-rewards", timeout=15).json()
    assert d["vehicle_rewards"] == []
    assert d["any_active"] is False


def test_future_start_date_excluded(admin, driver, default_config):
    future = (datetime.now(timezone.utc) + timedelta(days=5)).date().isoformat()
    rv = [{"id": "rv_car", "type": "Voiture", "active": True, "start_date": future, "end_date": "",
           "start_time": "00:00", "end_time": "23:59", "zone": "", "bonus_per_trip": 3, "min_trips": 0}]
    _set_config(admin, regard_vehicles=rv, guarantees=[], base=default_config)
    d = driver.get(f"{BASE}/api/drivers/my-active-rewards", timeout=15).json()
    assert d["vehicle_rewards"] == []


def test_past_end_date_excluded(admin, driver, default_config):
    past = (datetime.now(timezone.utc) - timedelta(days=5)).date().isoformat()
    rv = [{"id": "rv_car", "type": "Voiture", "active": True, "start_date": "", "end_date": past,
           "start_time": "00:00", "end_time": "23:59", "zone": "", "bonus_per_trip": 3, "min_trips": 0}]
    _set_config(admin, regard_vehicles=rv, guarantees=[], base=default_config)
    d = driver.get(f"{BASE}/api/drivers/my-active-rewards", timeout=15).json()
    assert d["vehicle_rewards"] == []


def test_time_window_outside_excluded(admin, driver, default_config):
    # Build a window that does NOT include now: +3h to +5h
    now = datetime.now(timezone.utc)
    s = (now + timedelta(hours=3)).strftime("%H:%M")
    e = (now + timedelta(hours=5)).strftime("%H:%M")
    # If near midnight rollover, skip gracefully
    if s >= e:
        pytest.skip("time window wraps midnight — skipping")
    rv = [{"id": "rv_car", "type": "Voiture", "active": True, "start_date": "", "end_date": "",
           "start_time": s, "end_time": e, "zone": "", "bonus_per_trip": 3, "min_trips": 0}]
    _set_config(admin, regard_vehicles=rv, guarantees=[], base=default_config)
    d = driver.get(f"{BASE}/api/drivers/my-active-rewards", timeout=15).json()
    assert d["vehicle_rewards"] == [], f"Expected empty, got {d['vehicle_rewards']}"


def test_time_window_inside_included(admin, driver, default_config):
    before, after = _now_hm_offsets()
    rv = [{"id": "rv_car", "type": "Voiture", "active": True, "start_date": "", "end_date": "",
           "start_time": before, "end_time": after, "zone": "Paris", "bonus_per_trip": 5, "min_trips": 3}]
    _set_config(admin, regard_vehicles=rv, guarantees=[], base=default_config)
    d = driver.get(f"{BASE}/api/drivers/my-active-rewards", timeout=15).json()
    assert len(d["vehicle_rewards"]) == 1
    assert d["vehicle_rewards"][0]["bonus_per_trip"] == 5
    assert d["any_active"] is True


def test_velo_not_matching_car_driver(admin, driver, default_config):
    before, after = _now_hm_offsets()
    rv = [{"id": "rv_velo", "type": "Velo", "active": True, "start_date": "", "end_date": "",
           "start_time": before, "end_time": after, "zone": "", "bonus_per_trip": 1, "min_trips": 0}]
    _set_config(admin, regard_vehicles=rv, guarantees=[], base=default_config)
    d = driver.get(f"{BASE}/api/drivers/my-active-rewards", timeout=15).json()
    assert d["vehicle_rewards"] == []


# -------- GUARANTEE ELIGIBILITY --------
def test_guarantee_eligible_true_with_default_driver_stats(admin, driver, default_config):
    # default driver stats: acceptance=100, cancellation=0 → eligible for reasonable thresholds
    before, after = _now_hm_offsets()
    g = [{"id": "g_day", "name": "Garantie Test", "active": True, "start_hour": before, "end_hour": after,
          "min_revenue": 59, "acceptance_rate": 80, "max_cancellation": 10, "zone": "Paris",
          "start_date": "", "end_date": "", "description": "Test"}]
    _set_config(admin, regard_vehicles=[], guarantees=g, base=default_config)
    d = driver.get(f"{BASE}/api/drivers/my-active-rewards", timeout=15).json()
    assert len(d["guarantees"]) == 1
    item = d["guarantees"][0]
    assert "eligible" in item
    # With default driver stats (acceptance 100, cancellation 0) should be True
    if d["driver_acceptance_rate"] >= 80 and d["driver_cancellation_rate"] <= 10:
        assert item["eligible"] is True
    assert item["min_revenue"] == 59


def test_guarantee_eligible_false_when_acceptance_too_low(admin, driver, default_config):
    before, after = _now_hm_offsets()
    # Set unreachable acceptance threshold
    g = [{"id": "g_impossible", "name": "Garantie Impossible", "active": True, "start_hour": before,
          "end_hour": after, "min_revenue": 100, "acceptance_rate": 999, "max_cancellation": 0,
          "zone": "", "start_date": "", "end_date": "", "description": ""}]
    _set_config(admin, regard_vehicles=[], guarantees=g, base=default_config)
    d = driver.get(f"{BASE}/api/drivers/my-active-rewards", timeout=15).json()
    assert len(d["guarantees"]) == 1
    assert d["guarantees"][0]["eligible"] is False


def test_guarantee_inactive_excluded(admin, driver, default_config):
    before, after = _now_hm_offsets()
    g = [{"id": "g_off", "name": "Off", "active": False, "start_hour": before, "end_hour": after,
          "min_revenue": 10, "acceptance_rate": 0, "max_cancellation": 100,
          "zone": "", "start_date": "", "end_date": ""}]
    _set_config(admin, regard_vehicles=[], guarantees=g, base=default_config)
    d = driver.get(f"{BASE}/api/drivers/my-active-rewards", timeout=15).json()
    assert d["guarantees"] == []
    assert d["any_active"] is False


# -------- COMBINED --------
def test_no_active_rewards_returns_any_active_false(admin, driver, default_config):
    _set_config(admin, regard_vehicles=[], guarantees=[], base=default_config)
    d = driver.get(f"{BASE}/api/drivers/my-active-rewards", timeout=15).json()
    assert d["vehicle_rewards"] == []
    assert d["guarantees"] == []
    assert d["any_active"] is False
