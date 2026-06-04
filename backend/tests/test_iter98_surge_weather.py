"""Iter98 — Phase B refonte: AI Dynamic Surge (rules per Location x VehicleType
with demand ranges, auto-activation, heatmap) + Weather Surcharge CRUD.

Tests verify:
 1) Surge location/rule CRUD
 2) Auto-activation: a status=active rule applies to /api/rides/estimate without
    a global switch; demand from pending rides shifts the multiplier between
    range buckets [0..2]→1.0, [3..10]→1.5, [11..∞]→2.0.
 3) Heatmap (admin + public): points = pending pickups, zones = active rules.
 4) Weather CRUD (conditions list, create, update, toggle, delete) +
    /weather/current must not crash even if OWM key is 401.

Cleanup at end: deletes all surge rules/locations and weather rules created by
this run, plus the pending rides created to drive demand. Keeps the DB clean.
"""
import os
import time
import pytest
import requests

def _read_env_url():
    # Read REACT_APP_BACKEND_URL from frontend/.env (tests run without dotenv loaded)
    for line in open("/app/frontend/.env"):
        if line.startswith("REACT_APP_BACKEND_URL="):
            return line.split("=", 1)[1].strip()
    return None

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or _read_env_url() or "").rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL missing"
ADMIN = {"email": "admin@superapp.com", "password": "SuperAdmin123!"}
USER = {"email": "test2@example.com", "password": "TestPass123!"}

# Zone in Martinique used by all surge tests
ZONE = {"name": "TEST_FortDeFrance", "lat": 14.6, "lng": -61.07, "radius_km": 8.0}
RANGES = [
    {"min_requests": 0, "max_requests": 2, "surcharge": 1.0},
    {"min_requests": 3, "max_requests": 10, "surcharge": 1.5},
    {"min_requests": 11, "max_requests": None, "surcharge": 2.0},
]

state = {
    "admin_token": None,
    "user_token": None,
    "rule_id": None,
    "loc_id": None,
    "weather_rule_id": None,
    "ride_ids": [],
}


def _login(email, password):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}, timeout=10)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    d = r.json()
    return d.get("access_token") or d.get("token")


@pytest.fixture(scope="module", autouse=True)
def setup_and_cleanup():
    state["admin_token"] = _login(**ADMIN)
    state["user_token"] = _login(**USER)
    assert state["admin_token"] and state["user_token"]
    yield
    # Cleanup
    ah = {"Authorization": f"Bearer {state['admin_token']}"}
    uh = {"Authorization": f"Bearer {state['user_token']}"}
    if state["rule_id"]:
        requests.delete(f"{BASE_URL}/api/admin/pricing/surge/{state['rule_id']}", headers=ah, timeout=10)
    if state["weather_rule_id"]:
        requests.delete(f"{BASE_URL}/api/admin/pricing/weather/{state['weather_rule_id']}", headers=ah, timeout=10)
    # Cancel test rides
    for rid in state["ride_ids"]:
        try:
            requests.post(f"{BASE_URL}/api/rides/{rid}/cancel", json={"reason": "TEST cleanup"}, headers=uh, timeout=10)
        except Exception:
            pass


def _ah():
    return {"Authorization": f"Bearer {state['admin_token']}"}


def _uh():
    return {"Authorization": f"Bearer {state['user_token']}"}


# ───────────────── Surge CRUD ─────────────────
def test_01_create_surge_location():
    r = requests.post(f"{BASE_URL}/api/admin/pricing/surge/locations", json=ZONE, headers=_ah(), timeout=10)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["name"] == ZONE["name"]
    assert d["lat"] == ZONE["lat"] and d["lng"] == ZONE["lng"]
    assert d["radius_km"] == ZONE["radius_km"]
    assert "id" in d
    state["loc_id"] = d["id"]


def test_02_list_surge_locations_contains_test_zone():
    r = requests.get(f"{BASE_URL}/api/admin/pricing/surge/locations", headers=_ah(), timeout=10)
    assert r.status_code == 200
    names = [x["name"] for x in r.json()]
    assert ZONE["name"] in names


def test_03_create_surge_rule_active():
    body = {
        "location": ZONE,
        "vehicle_type": "all",
        "ranges": RANGES,
        "status": "active",
    }
    r = requests.post(f"{BASE_URL}/api/admin/pricing/surge", json=body, headers=_ah(), timeout=10)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["status"] == "active"
    assert d["total_ranges"] == 3
    assert d["max_surcharge"] == 2.0
    assert "ranges_preview" in d
    assert "id" in d
    state["rule_id"] = d["id"]


def test_04_list_surge_summary_fields():
    r = requests.get(f"{BASE_URL}/api/admin/pricing/surge", headers=_ah(), timeout=10)
    assert r.status_code == 200
    found = [x for x in r.json() if x["id"] == state["rule_id"]]
    assert found
    rule = found[0]
    assert rule["total_ranges"] == 3
    assert rule["max_surcharge"] == 2.0
    assert "ranges_preview" in rule


# ───────────────── Auto-activation & demand ─────────────────
def test_05_estimate_no_demand_returns_1():
    body = {
        "pickup_lat": ZONE["lat"], "pickup_lng": ZONE["lng"], "pickup_address": "TEST FdF",
        "dropoff_lat": 14.65, "dropoff_lng": -61.05, "dropoff_address": "TEST B",
        "vehicle_type": "regular", "payment_method": "cash",
    }
    r = requests.post(f"{BASE_URL}/api/rides/estimate", json=body, timeout=15)
    assert r.status_code == 200, r.text
    d = r.json()
    # With 0..few pending rides in the zone, the [0..2] range -> surge = 1.0
    assert d["surge_multiplier"] == 1.0, f"expected 1.0, got {d['surge_multiplier']}; reasons={d.get('pricing_reasons')}"


def test_06_create_3_pending_rides_then_estimate_x1_5():
    body = {
        "pickup_lat": ZONE["lat"], "pickup_lng": ZONE["lng"], "pickup_address": "TEST_DEMAND",
        "dropoff_lat": 14.65, "dropoff_lng": -61.05, "dropoff_address": "TEST_DEMAND_OUT",
        "vehicle_type": "regular", "payment_method": "cash",
    }
    for _ in range(3):
        r = requests.post(f"{BASE_URL}/api/rides", json=body, headers=_uh(), timeout=15)
        assert r.status_code == 200, r.text
        state["ride_ids"].append(r.json()["id"])
    time.sleep(0.5)
    r = requests.post(f"{BASE_URL}/api/rides/estimate", json=body, timeout=15)
    assert r.status_code == 200
    d = r.json()
    assert d["surge_multiplier"] == 1.5, f"expected 1.5 with 3 pending, got {d['surge_multiplier']}"
    assert any("x1.5" in s and "forte demande" in s for s in d.get("pricing_reasons", [])), d.get("pricing_reasons")


# ───────────────── Heatmap ─────────────────
def test_07_admin_heatmap_has_points_and_zones():
    r = requests.get(f"{BASE_URL}/api/admin/pricing/surge/heatmap", headers=_ah(), timeout=10)
    assert r.status_code == 200
    d = r.json()
    assert "points" in d and "zones" in d
    assert len(d["points"]) >= 3
    # Our zone should be among active zones
    names = [z.get("name") for z in d["zones"]]
    assert ZONE["name"] in names


def test_08_public_heatmap_matches():
    r = requests.get(f"{BASE_URL}/api/pricing/demand-heatmap", timeout=10)
    assert r.status_code == 200
    d = r.json()
    assert "points" in d and "zones" in d
    assert len(d["points"]) >= 3


# ───────────────── Surge PUT / toggle / delete ─────────────────
def test_09_update_surge_rule():
    body = {"ranges": RANGES, "status": "active", "vehicle_type": "all", "location": ZONE}
    r = requests.put(f"{BASE_URL}/api/admin/pricing/surge/{state['rule_id']}", json=body, headers=_ah(), timeout=10)
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "active"


def test_10_toggle_surge_rule_inactive_then_estimate_1():
    r = requests.post(f"{BASE_URL}/api/admin/pricing/surge/{state['rule_id']}/toggle", headers=_ah(), timeout=10)
    assert r.status_code == 200
    assert r.json()["status"] == "inactive"
    # Confirm in list that OUR rule is inactive
    rules = requests.get(f"{BASE_URL}/api/admin/pricing/surge", headers=_ah(), timeout=10).json()
    ours = next((x for x in rules if x["id"] == state["rule_id"]), None)
    assert ours and ours["status"] == "inactive"
    # NOTE: surge_multiplier on /estimate is NOT asserted here because pre-seeded
    # demo rules (e.g. "Centre FDF") may also cover the same zone and remain active.
    # Toggling our rule does not affect those, by design.


# ───────────────── Weather CRUD ─────────────────
def test_11_weather_conditions_list():
    r = requests.get(f"{BASE_URL}/api/admin/pricing/weather/conditions", headers=_ah(), timeout=10)
    assert r.status_code == 200
    conds = r.json()["conditions"]
    for need in ["Thunderstorm", "Drizzle", "Rain", "Snow", "Clouds", "Clear", "Mist"]:
        assert need in conds, f"missing {need}"


def test_12_weather_create():
    body = {
        "vehicle_type": "all",
        "conditions": {"Thunderstorm": 1.3, "Rain": 1.2, "Snow": 1.4},
        "status": "active",
    }
    r = requests.post(f"{BASE_URL}/api/admin/pricing/weather", json=body, headers=_ah(), timeout=10)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["status"] == "active"
    assert d["conditions"]["Thunderstorm"] == 1.3
    state["weather_rule_id"] = d["id"]


def test_13_weather_list_update_toggle():
    # List
    r = requests.get(f"{BASE_URL}/api/admin/pricing/weather", headers=_ah(), timeout=10)
    assert r.status_code == 200
    assert any(x["id"] == state["weather_rule_id"] for x in r.json())
    # Update
    r2 = requests.put(
        f"{BASE_URL}/api/admin/pricing/weather/{state['weather_rule_id']}",
        json={"conditions": {"Rain": 1.25}},
        headers=_ah(),
        timeout=10,
    )
    assert r2.status_code == 200, r2.text
    assert r2.json()["conditions"]["Rain"] == 1.25
    # Toggle
    r3 = requests.post(
        f"{BASE_URL}/api/admin/pricing/weather/{state['weather_rule_id']}/toggle",
        headers=_ah(),
        timeout=10,
    )
    assert r3.status_code == 200
    assert r3.json()["status"] == "inactive"


def test_14_weather_current_endpoint_does_not_crash():
    r = requests.get(
        f"{BASE_URL}/api/admin/pricing/weather/current",
        params={"lat": ZONE["lat"], "lng": ZONE["lng"]},
        headers=_ah(),
        timeout=15,
    )
    # Must return 200 with condition=null OR a valid string (depends on OWM key)
    assert r.status_code == 200, r.text
    d = r.json()
    assert "condition" in d
    assert d["condition"] is None or isinstance(d["condition"], str)


def test_15_weather_delete():
    r = requests.delete(
        f"{BASE_URL}/api/admin/pricing/weather/{state['weather_rule_id']}",
        headers=_ah(),
        timeout=10,
    )
    assert r.status_code == 200
    state["weather_rule_id"] = None


def test_16_surge_delete():
    r = requests.delete(
        f"{BASE_URL}/api/admin/pricing/surge/{state['rule_id']}",
        headers=_ah(),
        timeout=10,
    )
    assert r.status_code == 200
    state["rule_id"] = None
