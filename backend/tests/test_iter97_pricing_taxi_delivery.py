"""Iter97 — Phase B (surge/weather) + Phase C (taxi-configs) + Phase D (delivery-monthly).

After running this file ALL configs are reset to factory defaults so the rest of
the platform behaves normally (surge OFF, weather OFF, rental 36/72/144,
buddy 20€/h, ttl 30s, all profiles allowed)."""
import os
import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
from _creds import ADMIN_EMAIL, ADMIN_PASSWORD  # noqa: E402
PASSENGER_EMAIL = "test2@example.com"
PASSENGER_PASSWORD = "TestPass123!"

PARIS_PICKUP = {"pickup_lat": 48.8566, "pickup_lng": 2.3522, "pickup_address": "Hôtel de Ville, Paris"}
PARIS_DROP = {"dropoff_lat": 48.8738, "dropoff_lng": 2.2950, "dropoff_address": "Arc de Triomphe, Paris"}


def _login(email, password):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, r.text
    j = r.json()
    return j.get("access_token") or j.get("token")


@pytest.fixture(scope="module")
def admin_token():
    return _login(ADMIN_EMAIL, ADMIN_PASSWORD)


@pytest.fixture(scope="module")
def passenger_token():
    return _login(PASSENGER_EMAIL, PASSENGER_PASSWORD)


def _hdr(tok):
    return {"Authorization": f"Bearer {tok}"}


def _baseline_estimate(token):
    payload = {**PARIS_PICKUP, **PARIS_DROP, "vehicle_type": "standard", "payment_method": "cash"}
    r = requests.post(f"{BASE_URL}/api/rides/estimate", json=payload, headers=_hdr(token), timeout=15)
    assert r.status_code == 200, r.text
    return r.json()


# ───────── Phase B — Surge ─────────
def test_surge_manual_multiplier_applied(admin_token, passenger_token):
    base = _baseline_estimate(passenger_token)
    base_fare = base["estimated_fare"]
    assert base["surge_multiplier"] == 1.0

    settings = {"enabled": True, "mode": "manual", "manual_multiplier": 2.0, "max_multiplier": 3.0}
    r = requests.put(f"{BASE_URL}/api/admin/pricing/surge", json={"settings": settings}, headers=_hdr(admin_token), timeout=10)
    assert r.status_code == 200, r.text
    assert r.json()["enabled"] is True and r.json()["manual_multiplier"] == 2.0

    surged = _baseline_estimate(passenger_token)
    assert surged["surge_multiplier"] == 2.0
    assert abs(surged["estimated_fare"] - round(base_fare * 2.0, 2)) < 0.5
    assert any("majoré" in x.lower() or "majore" in x.lower() for x in surged["pricing_reasons"]), surged["pricing_reasons"]


# ───────── Phase B — Weather ─────────
def test_weather_flat_surcharge_applied(admin_token, passenger_token):
    # surge already manual x2 from previous test → measure delta
    before = _baseline_estimate(passenger_token)
    settings = {"enabled": True, "active_now": True, "type": "flat", "amount": 5, "condition_label": "Pluie"}
    r = requests.put(f"{BASE_URL}/api/admin/pricing/weather", json={"settings": settings}, headers=_hdr(admin_token), timeout=10)
    assert r.status_code == 200, r.text
    after = _baseline_estimate(passenger_token)
    assert after["weather_surcharge"] == 5.0
    assert abs((after["estimated_fare"] - before["estimated_fare"]) - 5.0) < 0.5
    assert any("météo" in x.lower() or "meteo" in x.lower() for x in after["pricing_reasons"])


# ───────── Phase B — Disable + verify reset ─────────
def test_disable_surge_and_weather(admin_token, passenger_token):
    requests.put(f"{BASE_URL}/api/admin/pricing/surge", json={"settings": {"enabled": False, "mode": "auto", "manual_multiplier": 1.5, "max_multiplier": 3.0}}, headers=_hdr(admin_token), timeout=10)
    requests.put(f"{BASE_URL}/api/admin/pricing/weather", json={"settings": {"enabled": False, "active_now": False, "type": "percent", "amount": 15}}, headers=_hdr(admin_token), timeout=10)
    e = _baseline_estimate(passenger_token)
    assert e["surge_multiplier"] == 1.0
    assert e["weather_surcharge"] == 0.0
    assert e["pricing_reasons"] == []


# ───────── Phase C — Taxi options public ─────────
def test_public_taxi_options_shape():
    r = requests.get(f"{BASE_URL}/api/config/taxi-options", timeout=10)
    assert r.status_code == 200
    data = r.json()
    for key in ("rental_packages", "personal_driver", "taxi_bid", "ride_profiles"):
        assert key in data, data.keys()
    assert isinstance(data["rental_packages"]["packages"], list)
    assert "hourly_rate" in data["personal_driver"]
    assert "offer_ttl_seconds" in data["taxi_bid"]


# ───────── Phase C — Update each config & verify persistence ─────────
def test_taxi_configs_admin_crud(admin_token):
    # personal_driver
    r = requests.put(f"{BASE_URL}/api/admin/taxi-configs/personal_driver",
                     json={"settings": {"enabled": True, "hourly_rate": 25, "durations": [1, 2, 4, 8]}},
                     headers=_hdr(admin_token), timeout=10)
    assert r.status_code == 200 and r.json()["hourly_rate"] == 25
    # taxi_bid
    r = requests.put(f"{BASE_URL}/api/admin/taxi-configs/taxi_bid",
                     json={"settings": {"enabled": True, "offer_ttl_seconds": 45, "min_increment": 1, "suggested_increases": [1, 2, 5]}},
                     headers=_hdr(admin_token), timeout=10)
    assert r.status_code == 200 and r.json()["offer_ttl_seconds"] == 45
    # rental_packages
    new_packages = [
        {"slug": "2h_20km", "label": "2h", "km": 20, "hours": 2, "price": 40},
        {"slug": "4h_40km", "label": "4h", "km": 40, "hours": 4, "price": 80},
        {"slug": "8h_80km", "label": "8h", "km": 80, "hours": 8, "price": 150},
    ]
    r = requests.put(f"{BASE_URL}/api/admin/taxi-configs/rental_packages",
                     json={"settings": {"packages": new_packages}},
                     headers=_hdr(admin_token), timeout=10)
    assert r.status_code == 200 and r.json()["packages"][0]["price"] == 40
    # ride_profiles
    r = requests.put(f"{BASE_URL}/api/admin/taxi-configs/ride_profiles",
                     json={"settings": {"allow_book_for_other": True, "allow_female_driver": True, "allow_handicap": True, "allow_pets": False}},
                     headers=_hdr(admin_token), timeout=10)
    assert r.status_code == 200 and r.json()["allow_pets"] is False

    # Verify via public endpoint
    pub = requests.get(f"{BASE_URL}/api/config/taxi-options", timeout=10).json()
    assert pub["personal_driver"]["hourly_rate"] == 25
    assert pub["taxi_bid"]["offer_ttl_seconds"] == 45
    assert pub["rental_packages"]["packages"][2]["price"] == 150
    assert pub["ride_profiles"]["allow_pets"] is False

    # Unknown key
    r = requests.put(f"{BASE_URL}/api/admin/taxi-configs/__unknown__",
                     json={"settings": {}}, headers=_hdr(admin_token), timeout=10)
    assert r.status_code == 404


# ───────── Phase D — Delivery analytics ─────────
def test_delivery_monthly_shape(admin_token):
    r = requests.get(f"{BASE_URL}/api/admin/analytics/delivery-monthly", headers=_hdr(admin_token), timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "store_deliveries" in data and "delivery_genie_runner" in data
    sd_m = data["store_deliveries"].get("monthly")
    assert isinstance(sd_m, list) and len(sd_m) == 12
    dgr_m = data["delivery_genie_runner"].get("monthly")
    assert isinstance(dgr_m, list) and len(dgr_m) == 12
    # Each item must carry runner & genie keys
    sample = dgr_m[0]
    assert {"runner", "genie"}.issubset(set(sample.keys())), sample


# ───────── Reset defaults (always last) ─────────
def test_zz_reset_all_defaults(admin_token):
    requests.put(f"{BASE_URL}/api/admin/pricing/surge",
                 json={"settings": {"enabled": False, "mode": "auto", "manual_multiplier": 1.5, "max_multiplier": 3.0,
                                     "radius_km": 5, "tiers": [{"min_ratio": 1.0, "multiplier": 1.2}, {"min_ratio": 2.0, "multiplier": 1.5}, {"min_ratio": 3.0, "multiplier": 2.0}]}},
                 headers=_hdr(admin_token), timeout=10)
    requests.put(f"{BASE_URL}/api/admin/pricing/weather",
                 json={"settings": {"enabled": False, "active_now": False, "type": "percent", "amount": 15, "condition_label": "Pluie / intempéries"}},
                 headers=_hdr(admin_token), timeout=10)
    requests.put(f"{BASE_URL}/api/admin/taxi-configs/personal_driver",
                 json={"settings": {"enabled": True, "hourly_rate": 20, "durations": [1, 2, 4, 8]}},
                 headers=_hdr(admin_token), timeout=10)
    requests.put(f"{BASE_URL}/api/admin/taxi-configs/taxi_bid",
                 json={"settings": {"enabled": True, "offer_ttl_seconds": 30, "min_increment": 1, "suggested_increases": [1, 2, 5]}},
                 headers=_hdr(admin_token), timeout=10)
    requests.put(f"{BASE_URL}/api/admin/taxi-configs/rental_packages",
                 json={"settings": {"packages": [
                     {"slug": "2h_20km", "label": "2h", "km": 20, "hours": 2, "price": 36},
                     {"slug": "4h_40km", "label": "4h", "km": 40, "hours": 4, "price": 72},
                     {"slug": "8h_80km", "label": "8h", "km": 80, "hours": 8, "price": 144},
                 ]}}, headers=_hdr(admin_token), timeout=10)
    requests.put(f"{BASE_URL}/api/admin/taxi-configs/ride_profiles",
                 json={"settings": {"allow_book_for_other": True, "allow_female_driver": True, "allow_handicap": True, "allow_pets": True}},
                 headers=_hdr(admin_token), timeout=10)

    pub = requests.get(f"{BASE_URL}/api/config/taxi-options", timeout=10).json()
    assert pub["personal_driver"]["hourly_rate"] == 20
    assert pub["taxi_bid"]["offer_ttl_seconds"] == 30
    assert pub["rental_packages"]["packages"][2]["price"] == 144
    assert pub["ride_profiles"]["allow_pets"] is True
