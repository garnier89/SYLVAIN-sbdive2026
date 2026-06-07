"""
Rewards config geo-scoping (per-zone overrides, V3Cube).

Validates:
- Admin global config loads.
- Saving with `_zone` creates a per-zone override (city>state>country resolution).
- GET with country/state returns the override; other zones fall back to global.
- Global config stays unchanged when a zone override is saved.
- Zones list reflects the override; DELETE removes it (falls back to global).
- Driver `my-active-rewards?location=` returns the zone-specific guarantees.
Cleans up the override at the end.
"""
import os
import pytest
import requests
from pathlib import Path


def _load_backend_url():
    url = os.environ.get('REACT_APP_BACKEND_URL')
    if not url:
        env_path = Path('/app/frontend/.env')
        if env_path.exists():
            for line in env_path.read_text().splitlines():
                if line.startswith('REACT_APP_BACKEND_URL='):
                    url = line.split('=', 1)[1].strip()
                    break
    if not url:
        raise RuntimeError("REACT_APP_BACKEND_URL not configured")
    return url.rstrip('/')


BASE_URL = _load_backend_url()
from _creds import ADMIN_EMAIL, ADMIN_PASSWORD  # noqa: E402

MQ_ZONE = {"country": "MQ", "state": "Martinique", "city": ""}


def _login(email, password):
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    token = r.json().get("access_token") or r.json().get("token")
    if token:
        s.headers.update({"Authorization": f"Bearer {token}"})
    return s


@pytest.fixture(scope="module")
def admin():
    return _login(ADMIN_EMAIL, ADMIN_PASSWORD)


@pytest.fixture(scope="module")
def mq_override(admin):
    payload = {
        "_zone": MQ_ZONE,
        "guarantees": [{"id": "g_mq", "name": "Garantie Martinique 80", "active": True,
                        "start_hour": "00:00", "end_hour": "23:59", "min_revenue": 80,
                        "acceptance_rate": 0, "max_cancellation": 100, "zone": "Martinique",
                        "start_date": "", "end_date": ""}],
        "regard_vehicles": [],
        "points": {"initial_points": 100, "palettes": []},
        "sub_category_bonus": {"enabled": True, "particulier": 5, "vtc": 0, "taxi": 0},
    }
    r = admin.put(f"{BASE_URL}/api/admin/rewards/config", json=payload)
    assert r.status_code == 200 and r.json()["zone_key"] == "MQ|Martinique"
    yield
    admin.request("DELETE", f"{BASE_URL}/api/admin/rewards/config/zone", json={"_zone": MQ_ZONE})


def _global_min_revenue(admin):
    return admin.get(f"{BASE_URL}/api/admin/rewards/config").json()["guarantees"][0]["min_revenue"]


def test_zone_override_resolution(admin, mq_override):
    g = _global_min_revenue(admin)
    mq = admin.get(f"{BASE_URL}/api/admin/rewards/config", params={"country": "MQ", "state": "Martinique"}).json()
    assert mq["guarantees"][0]["min_revenue"] == 80
    assert mq["sub_category_bonus"]["particulier"] == 5
    # Another zone falls back to global
    fr = admin.get(f"{BASE_URL}/api/admin/rewards/config", params={"country": "FR"}).json()
    assert fr["guarantees"][0]["min_revenue"] == g
    # Global unchanged
    assert _global_min_revenue(admin) == g


def test_zones_list(admin, mq_override):
    zones = admin.get(f"{BASE_URL}/api/admin/rewards/config/zones").json()["zones"]
    assert any(z["zone_key"] == "MQ|Martinique" for z in zones)


def test_driver_sees_zone_rewards(admin, mq_override):
    drv = _login("jean.dupont@demo.sb", "Driver123!")
    res = drv.get(f"{BASE_URL}/api/drivers/my-active-rewards",
                  params={"location": "Fort-de-France, Martinique"}).json()
    names = [g["name"] for g in res.get("guarantees", [])]
    assert "Garantie Martinique 80" in names


def test_delete_override_falls_back(admin):
    # create then delete, confirm MQ returns global afterwards
    admin.put(f"{BASE_URL}/api/admin/rewards/config", json={
        "_zone": MQ_ZONE, "guarantees": [{"id": "g_mq", "name": "X", "active": True,
        "start_hour": "00:00", "end_hour": "23:59", "min_revenue": 999, "acceptance_rate": 0,
        "max_cancellation": 100, "zone": "Martinique"}],
        "regard_vehicles": [], "points": {"palettes": []}, "sub_category_bonus": {"enabled": False}})
    g = _global_min_revenue(admin)
    d = admin.request("DELETE", f"{BASE_URL}/api/admin/rewards/config/zone", json={"_zone": MQ_ZONE})
    assert d.json()["deleted"] == 1
    mq = admin.get(f"{BASE_URL}/api/admin/rewards/config", params={"country": "MQ", "state": "Martinique"}).json()
    assert mq["guarantees"][0]["min_revenue"] == g
