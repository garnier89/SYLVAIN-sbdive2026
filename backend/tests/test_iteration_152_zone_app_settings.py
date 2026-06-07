"""Iteration 152 — Zone-scoped App Settings + Taxi Hall competition gate.

Covers:
  * GET /api/config/app-settings (global + new taxi_hall_* keys)
  * PUT /api/config/admin/app-settings with _zone {country/state/city} (override)
  * GET /api/config/app-settings?country=&state=&city= (zone resolution)
  * GET /api/config/admin/app-settings/zones (zone list)
  * GET /api/rides/taxi-hall/eligibility
  * POST /api/rides/taxi-hall enforces competition gate (403)
  * Cleanup: removes all zone overrides + restores global taxi_hall_require_competition=false
"""
import os
import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")

ADMIN_EMAIL = "admin@superapp.com"
ADMIN_PASS = "SuperAdmin123!"
DRIVER_EMAIL = "jean.dupont@demo.sb"
DRIVER_PASS = "Driver123!"


def _login(email, password):
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, f"login {email} -> {r.status_code} {r.text[:200]}"
    data = r.json()
    tok = data.get("access_token") or data.get("token")
    assert tok, f"login token missing in {data}"
    return tok


@pytest.fixture(scope="module")
def admin_token():
    return _login(ADMIN_EMAIL, ADMIN_PASS)


@pytest.fixture(scope="module")
def driver_token():
    return _login(DRIVER_EMAIL, DRIVER_PASS)


@pytest.fixture(scope="module")
def admin_h(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def driver_h(driver_token):
    return {"Authorization": f"Bearer {driver_token}", "Content-Type": "application/json"}


# ── 1. GET /api/config/app-settings (global default) ───────────────────────
class TestAppSettingsGlobalDefaults:
    def test_global_returns_new_keys_with_defaults(self):
        r = requests.get(f"{BASE_URL}/api/config/app-settings", timeout=15)
        assert r.status_code == 200
        d = r.json()
        # New iteration 152 keys
        assert "taxi_hall_require_competition" in d
        assert "taxi_hall_min_acceptance_rate" in d
        assert "taxi_hall_max_cancellation_rate" in d
        assert "radius_show_online_drivers_km" in d
        # The defaults per DEFAULT_APP_SETTINGS
        assert d["taxi_hall_require_competition"] is False
        assert d["taxi_hall_min_acceptance_rate"] == 80
        assert d["taxi_hall_max_cancellation_rate"] == 30
        assert d["radius_show_online_drivers_km"] == 35
        # Regression keys still present
        for k in ("taxi_hail_option", "enable_donation", "enable_pool"):
            assert k in d


# ── 2. PUT /admin/app-settings with _zone (MQ override) ───────────────────
class TestZoneOverride:
    def test_put_mq_country_override_then_resolution(self, admin_h):
        body = {
            "_zone": {"country": "MQ"},
            "radius_show_online_drivers_km": 50,
            "taxi_hall_require_competition": True,
            "taxi_hall_min_acceptance_rate": 85,
        }
        r = requests.put(f"{BASE_URL}/api/config/admin/app-settings",
                         headers=admin_h, json=body, timeout=15)
        assert r.status_code == 200, r.text
        # MQ resolution
        r2 = requests.get(f"{BASE_URL}/api/config/app-settings?country=MQ", timeout=15)
        assert r2.status_code == 200
        mq = r2.json()
        assert mq["radius_show_online_drivers_km"] == 50
        assert mq["taxi_hall_require_competition"] is True
        assert mq["taxi_hall_min_acceptance_rate"] == 85
        # Global resolution unchanged
        rg = requests.get(f"{BASE_URL}/api/config/app-settings", timeout=15).json()
        assert rg["radius_show_online_drivers_km"] == 35
        assert rg["taxi_hall_require_competition"] is False
        # FR resolution falls back to global (no FR override)
        rf = requests.get(f"{BASE_URL}/api/config/app-settings?country=FR", timeout=15).json()
        assert rf["radius_show_online_drivers_km"] == 35
        assert rf["taxi_hall_require_competition"] is False

    def test_admin_zones_lists_mq(self, admin_h):
        r = requests.get(f"{BASE_URL}/api/config/admin/app-settings/zones",
                         headers=admin_h, timeout=15)
        assert r.status_code == 200
        zones = r.json().get("zones") or []
        keys = [z.get("zone_key") for z in zones]
        assert "MQ" in keys, f"MQ not in zones {keys}"

    def test_city_specificity(self, admin_h):
        # Create a city-specific override only
        body = {
            "_zone": {"country": "MQ", "state": "Martinique", "city": "Fort-de-France"},
            "radius_show_online_drivers_km": 7,
            "taxi_hall_require_competition": True,
        }
        r = requests.put(f"{BASE_URL}/api/config/admin/app-settings",
                         headers=admin_h, json=body, timeout=15)
        assert r.status_code == 200
        # City-level resolution returns the new value
        d_city = requests.get(
            f"{BASE_URL}/api/config/app-settings?country=MQ&state=Martinique&city=Fort-de-France",
            timeout=15).json()
        assert d_city["radius_show_online_drivers_km"] == 7
        # Country-only resolution still returns the MQ-level (50, from earlier test)
        d_country = requests.get(f"{BASE_URL}/api/config/app-settings?country=MQ", timeout=15).json()
        assert d_country["radius_show_online_drivers_km"] == 50
        # An unknown city falls back to MQ country (50)
        d_other_city = requests.get(
            f"{BASE_URL}/api/config/app-settings?country=MQ&state=Martinique&city=Le%20Lamentin",
            timeout=15).json()
        assert d_other_city["radius_show_online_drivers_km"] == 50


# ── 3. Taxi Hall eligibility (driver) + 403 gate on POST ─────────────────
class TestTaxiHallEligibility:
    def test_default_eligible(self, driver_h, admin_h):
        # Ensure global is permissive
        requests.put(f"{BASE_URL}/api/config/admin/app-settings",
                     headers=admin_h,
                     json={"taxi_hall_require_competition": False}, timeout=15)
        r = requests.get(f"{BASE_URL}/api/rides/taxi-hall/eligibility",
                         headers=driver_h, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ("eligible", "require_competition", "acceptance_rate",
                  "cancellation_rate", "min_acceptance_rate",
                  "max_cancellation_rate", "enabled"):
            assert k in d, f"missing key {k} in {d}"
        assert d["eligible"] is True
        assert d["require_competition"] is False

    def test_ineligible_when_threshold_above_rate(self, driver_h, admin_h):
        # Force global gate to be impossible
        body = {
            "taxi_hall_require_competition": True,
            "taxi_hall_min_acceptance_rate": 101,
            "taxi_hall_max_cancellation_rate": 30,
        }
        r = requests.put(f"{BASE_URL}/api/config/admin/app-settings",
                         headers=admin_h, json=body, timeout=15)
        assert r.status_code == 200, r.text
        # Eligibility now false
        r2 = requests.get(f"{BASE_URL}/api/rides/taxi-hall/eligibility",
                          headers=driver_h, timeout=15)
        assert r2.status_code == 200
        d = r2.json()
        assert d["require_competition"] is True
        assert d["eligible"] is False
        reason = (d.get("reason") or "").lower()
        assert reason, f"missing reason: {d}"
        assert ("acceptation" in reason) or ("acceptance" in reason) or ("taux" in reason)

        # POST /api/rides/taxi-hall returns 403 with the reason
        post_body = {
            "pickup_address": "Paris, France",
            "dropoff_address": "Paris, France",
        }
        r3 = requests.post(f"{BASE_URL}/api/rides/taxi-hall",
                           headers=driver_h, json=post_body, timeout=15)
        assert r3.status_code == 403, f"expected 403, got {r3.status_code} {r3.text[:200]}"
        det = (r3.json().get("detail") or "").lower()
        assert ("acceptation" in det) or ("acceptance" in det) or ("taux" in det)


# ── 4. Cleanup ─────────────────────────────────────────────────────────────
class TestCleanup:
    def test_zzz_cleanup(self, admin_h):
        """Remove every zone override + restore global taxi_hall_require_competition=false."""
        # Restore global
        r = requests.put(f"{BASE_URL}/api/config/admin/app-settings",
                         headers=admin_h,
                         json={
                             "taxi_hall_require_competition": False,
                             "taxi_hall_min_acceptance_rate": 80,
                             "taxi_hall_max_cancellation_rate": 30,
                             "radius_show_online_drivers_km": 35,
                         }, timeout=15)
        assert r.status_code == 200
        # Remove zone overrides via Mongo directly
        import asyncio
        import sys
        sys.path.insert(0, "/app/backend")
        from core.config import db  # noqa: E402

        async def _wipe():
            res = await db.service_configs.delete_many(
                {"service_key": "app_settings",
                 "zone_key": {"$nin": ["", None], "$exists": True}}
            )
            return res.deleted_count

        deleted = asyncio.run(_wipe())
        # Confirm zones list now empty
        z = requests.get(f"{BASE_URL}/api/config/admin/app-settings/zones",
                         headers=admin_h, timeout=15).json()
        assert (z.get("zones") or []) == [], f"zones not cleaned: {z}"
        # Final sanity: MQ resolves to defaults again
        d = requests.get(f"{BASE_URL}/api/config/app-settings?country=MQ", timeout=15).json()
        assert d["radius_show_online_drivers_km"] == 35
        assert d["taxi_hall_require_competition"] is False
        print(f"Cleanup deleted {deleted} zone override docs")
