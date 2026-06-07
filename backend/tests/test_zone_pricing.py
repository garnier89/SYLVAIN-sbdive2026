"""
Per-vehicle-type ZONE PRICING (V3Cube "Tarifs par zone").

Validates that a vehicle type's `zone_overrides` are applied to the fare estimate
based on the ride PICKUP zone:
- A Martinique override (price_per_km=5, base_fare=10) applies for a Fort-de-France
  pickup (zone_tariff label + price_per_km/base_fare overridden + reason).
- A Paris pickup (no matching override) keeps the GLOBAL pricing.
- Removing the override drops the estimated fare for the same Martinique route.
Restores the vehicle type's zone_overrides to [] at the end.
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

SLUG = "sb"
MQ_RIDE = {"vehicle_type": SLUG, "payment_method": "cash",
           "pickup_lat": 14.6036, "pickup_lng": -61.0730, "pickup_address": "Fort-de-France, Martinique",
           "dropoff_lat": 14.6700, "dropoff_lng": -61.0200, "dropoff_address": "Le Lamentin, Martinique"}
PARIS_RIDE = {"vehicle_type": SLUG, "payment_method": "cash",
              "pickup_lat": 48.8566, "pickup_lng": 2.3522, "pickup_address": "Paris, France",
              "dropoff_lat": 48.8606, "dropoff_lng": 2.3376, "dropoff_address": "Louvre, Paris"}


@pytest.fixture(scope="module")
def admin():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    token = r.json().get("access_token") or r.json().get("token")
    if token:
        s.headers.update({"Authorization": f"Bearer {token}"})
    return s


@pytest.fixture(scope="module", autouse=True)
def restore(admin):
    yield
    admin.put(f"{BASE_URL}/api/admin/vehicle-types/{SLUG}", json={"zone_overrides": []})


def _set_override(admin, overrides):
    r = admin.put(f"{BASE_URL}/api/admin/vehicle-types/{SLUG}", json={"zone_overrides": overrides})
    assert r.status_code == 200


def test_zone_pricing_applied_for_martinique(admin):
    _set_override(admin, [{"zone": "Martinique", "price_per_km": 5, "base_fare": 10, "price_per_min": 0, "min_fare": 12}])
    mq = admin.post(f"{BASE_URL}/api/rides/estimate", json=MQ_RIDE).json()
    assert mq.get("zone_tariff") == "Martinique"
    assert mq["price_per_km"] == 5.0
    assert mq["base_fare"] == 10.0
    assert any("Tarif local : Martinique" in r for r in mq.get("pricing_reasons", []))


def test_other_zone_uses_global(admin):
    _set_override(admin, [{"zone": "Martinique", "price_per_km": 5, "base_fare": 10}])
    paris = admin.post(f"{BASE_URL}/api/rides/estimate", json=PARIS_RIDE).json()
    assert paris.get("zone_tariff") in (None, "")
    assert paris["price_per_km"] == 1  # global 'sb' rate


def test_removing_override_lowers_fare(admin):
    _set_override(admin, [{"zone": "Martinique", "price_per_km": 5, "base_fare": 10, "min_fare": 12}])
    with_override = admin.post(f"{BASE_URL}/api/rides/estimate", json=MQ_RIDE).json()["estimated_fare"]
    _set_override(admin, [])
    without = admin.post(f"{BASE_URL}/api/rides/estimate", json=MQ_RIDE).json()["estimated_fare"]
    assert with_override > without, f"expected zoned fare {with_override} > global {without}"
