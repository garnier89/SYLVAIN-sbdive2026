"""Backend tests for iteration 151: Geo-scoped admin configs (auto-promotions + vouchers)
plus the public /geo endpoints (countries/states/cities) used by ZoneScopePicker.

Covers:
  - GET /api/geo/countries  -> 250 items including MQ Martinique
  - GET /api/geo/states?country=MQ  -> ["Martinique"]
  - GET /api/geo/cities?country=MQ  -> Fort-de-France, Le Lamentin, ...
  - Auto-promotion scoped to MQ:
      * GET /api/auto-promotions/best?amount=20&pickup="Fort-de-France, Martinique" -> promo
      * GET /api/auto-promotions/best?amount=20&pickup="Paris, France" -> null
  - GLOBAL auto-promotion (no scope) applies in both Paris and Martinique
  - Voucher scoped to MQ:
      * POST /api/vouchers/validate (pickup=Paris)        -> valid:false + "n'est pas disponible dans votre zone"
      * POST /api/vouchers/validate (pickup=Martinique)   -> valid:true, discount 5
  - Cleans up promos / vouchers / rider account at end.
"""
import os
import uuid
import pytest
import requests
from dotenv import load_dotenv

load_dotenv("/app/frontend/.env")
BASE = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/") + "/api"

ADMIN_EMAIL = "admin@superapp.com"
ADMIN_PASS = "SuperAdmin123!"


def _login(email, password):
    r = requests.post(f"{BASE}/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text}"
    return r.json().get("access_token") or r.json()["token"]


@pytest.fixture(scope="module")
def admin_token():
    return _login(ADMIN_EMAIL, ADMIN_PASS)


@pytest.fixture(scope="module")
def admin_h(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def rider():
    """Register a fresh test rider for the session and return (token, user_id, email)."""
    email = f"TEST_zone_rider_{uuid.uuid4().hex[:8]}@example.com"
    password = os.environ.get("TEST_NEW_USER_PASSWORD", "Rider123!")
    r = requests.post(f"{BASE}/auth/register", json={
        "email": email, "password": password, "name": "TEST Zone Rider",
        "phone": f"+3360000{uuid.uuid4().hex[:4]}", "role": "user",
    }, timeout=15)
    assert r.status_code in (200, 201), f"register failed: {r.status_code} {r.text}"
    token = _login(email, password)
    me = requests.get(f"{BASE}/auth/me", headers={"Authorization": f"Bearer {token}"}, timeout=10).json()
    return {"token": token, "id": me.get("id"), "email": email, "h": {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}}


# ────────────────── /geo endpoints ──────────────────
class TestGeoEndpoints:
    def test_countries_includes_martinique(self):
        r = requests.get(f"{BASE}/geo/countries", timeout=15)
        assert r.status_code == 200
        data = r.json()
        items = data["items"]
        assert isinstance(items, list)
        assert data["total"] >= 240, f"expected ~250 countries, got {data['total']}"
        codes = {c["code"] for c in items}
        assert "MQ" in codes, "MQ Martinique missing from /geo/countries"
        mq = next(c for c in items if c["code"] == "MQ")
        assert "Martinique" in mq["name"]

    def test_states_mq(self):
        r = requests.get(f"{BASE}/geo/states", params={"country": "MQ"}, timeout=10)
        assert r.status_code == 200
        assert r.json()["items"] == ["Martinique"]

    def test_states_fr_has_idf(self):
        r = requests.get(f"{BASE}/geo/states", params={"country": "FR"}, timeout=10)
        assert r.status_code == 200
        assert "Île-de-France" in r.json()["items"]

    def test_cities_mq(self):
        r = requests.get(f"{BASE}/geo/cities", params={"country": "MQ"}, timeout=10)
        assert r.status_code == 200
        cities = r.json()["items"]
        assert "Fort-de-France" in cities
        assert "Le Lamentin" in cities

    def test_cities_unknown_country(self):
        r = requests.get(f"{BASE}/geo/cities", params={"country": "ZZ"}, timeout=10)
        assert r.status_code == 200
        assert r.json()["items"] == []


# ────────────────── Auto-promotion scope ──────────────────
@pytest.fixture(scope="module")
def mq_promo(admin_h):
    body = {
        "title": "TEST MQ Promo 5€",
        "eligibility_criteria": "every_trip",
        "discount_type": "flat",
        "discount_amount": 5,
        "service_type": "all",
        "scope": {"country": "MQ", "state": "", "city": ""},
        "status": "active",
    }
    r = requests.post(f"{BASE}/auto-promotions/admin", json=body, headers=admin_h, timeout=15)
    assert r.status_code in (200, 201), f"create promo failed: {r.status_code} {r.text}"
    promo = r.json()
    yield promo
    # Cleanup
    requests.delete(f"{BASE}/auto-promotions/admin/{promo['id']}", headers=admin_h, timeout=10)


@pytest.fixture(scope="module")
def global_promo(admin_h):
    body = {
        "title": "TEST Global Promo 3€",
        "eligibility_criteria": "every_trip",
        "discount_type": "flat",
        "discount_amount": 3,
        "service_type": "all",
        "scope": {"country": "", "state": "", "city": ""},
        "status": "active",
    }
    r = requests.post(f"{BASE}/auto-promotions/admin", json=body, headers=admin_h, timeout=15)
    assert r.status_code in (200, 201)
    promo = r.json()
    yield promo
    requests.delete(f"{BASE}/auto-promotions/admin/{promo['id']}", headers=admin_h, timeout=10)


class TestAutoPromoScope:
    def test_create_promo_has_scope_persisted(self, mq_promo, admin_h):
        # GET to verify persistence
        r = requests.get(f"{BASE}/auto-promotions/admin", headers=admin_h, timeout=10)
        assert r.status_code == 200
        found = next((p for p in r.json() if p["id"] == mq_promo["id"]), None)
        assert found is not None
        assert found["scope"] == {"country": "MQ", "state": "", "city": ""}
        assert found["status"] == "active"
        assert found["discount_amount"] == 5

    def test_best_paris_returns_global_only(self, rider, mq_promo, global_promo):
        r = requests.get(f"{BASE}/auto-promotions/best",
                         params={"amount": 20, "pickup": "10 rue de Rivoli, Paris, France"},
                         headers=rider["h"], timeout=10)
        assert r.status_code == 200
        promo = r.json()["promo"]
        assert promo is not None, "Global promo should apply in Paris"
        assert promo["id"] == global_promo["id"], f"Paris should pick GLOBAL promo (3€), got {promo}"

    def test_best_martinique_picks_mq_promo(self, rider, mq_promo, global_promo):
        r = requests.get(f"{BASE}/auto-promotions/best",
                         params={"amount": 20, "pickup": "Aéroport Aimé Césaire, Le Lamentin, Martinique"},
                         headers=rider["h"], timeout=10)
        assert r.status_code == 200
        promo = r.json()["promo"]
        assert promo is not None
        # MQ promo is 5€, global is 3€ -> MQ wins
        assert promo["id"] == mq_promo["id"], f"Martinique should pick MQ promo (5€), got {promo}"
        assert promo["discount_amount"] == 5

    def test_best_no_pickup_treated_as_no_zone(self, rider, mq_promo, global_promo):
        # No pickup => zone is None => only global promos match
        r = requests.get(f"{BASE}/auto-promotions/best", params={"amount": 20},
                         headers=rider["h"], timeout=10)
        assert r.status_code == 200
        promo = r.json()["promo"]
        assert promo is not None
        assert promo["id"] == global_promo["id"]


# ────────────────── Voucher scope ──────────────────
@pytest.fixture(scope="module")
def mq_voucher(admin_h):
    code = f"TESTZONE{uuid.uuid4().hex[:5].upper()}"
    body = {
        "code": code,
        "title": "TEST Zone Voucher",
        "discount_type": "fixed",
        "value": 5,
        "per_user_limit": 5,
        "scope": {"country": "MQ", "state": "", "city": ""},
        "status": "active",
    }
    r = requests.post(f"{BASE}/vouchers/admin", json=body, headers=admin_h, timeout=15)
    assert r.status_code in (200, 201), f"voucher create failed: {r.status_code} {r.text}"
    v = r.json()
    yield v
    requests.delete(f"{BASE}/vouchers/admin/{v['id']}", headers=admin_h, timeout=10)


class TestVoucherScope:
    def test_voucher_scope_persisted(self, mq_voucher, admin_h):
        r = requests.get(f"{BASE}/vouchers/admin", headers=admin_h, timeout=10)
        assert r.status_code == 200
        found = next((v for v in r.json() if v["id"] == mq_voucher["id"]), None)
        assert found is not None
        assert found["scope"] == {"country": "MQ", "state": "", "city": ""}

    def test_validate_paris_rejected(self, rider, mq_voucher):
        r = requests.post(f"{BASE}/vouchers/validate",
                          json={"code": mq_voucher["code"], "amount": 20, "pickup_address": "Paris, France"},
                          headers=rider["h"], timeout=10)
        assert r.status_code == 200
        data = r.json()
        assert data["valid"] is False
        assert "zone" in data["message"].lower(), f"expected zone-rejection message, got {data}"

    def test_validate_martinique_accepted(self, rider, mq_voucher):
        r = requests.post(f"{BASE}/vouchers/validate",
                          json={"code": mq_voucher["code"], "amount": 20,
                                "pickup_address": "Aéroport, Le Lamentin, Martinique"},
                          headers=rider["h"], timeout=10)
        assert r.status_code == 200
        data = r.json()
        assert data["valid"] is True, f"expected valid voucher, got {data}"
        assert data["discount"] == 5
        assert data["code"] == mq_voucher["code"]

    def test_validate_no_pickup_rejected_for_scoped(self, rider, mq_voucher):
        # No pickup_address => zone None => scoped voucher should be rejected
        r = requests.post(f"{BASE}/vouchers/validate",
                          json={"code": mq_voucher["code"], "amount": 20},
                          headers=rider["h"], timeout=10)
        assert r.status_code == 200
        assert r.json()["valid"] is False


# ────────────────── Regression: unscoped voucher (global) ──────────────────
@pytest.fixture(scope="module")
def global_voucher(admin_h):
    code = f"TESTGLB{uuid.uuid4().hex[:5].upper()}"
    body = {
        "code": code,
        "title": "TEST Global Voucher",
        "discount_type": "fixed",
        "value": 2,
        "per_user_limit": 5,
        "scope": {"country": "", "state": "", "city": ""},
        "status": "active",
    }
    r = requests.post(f"{BASE}/vouchers/admin", json=body, headers=admin_h, timeout=15)
    assert r.status_code in (200, 201)
    v = r.json()
    yield v
    requests.delete(f"{BASE}/vouchers/admin/{v['id']}", headers=admin_h, timeout=10)


class TestGlobalRegression:
    def test_global_voucher_works_paris(self, rider, global_voucher):
        r = requests.post(f"{BASE}/vouchers/validate",
                          json={"code": global_voucher["code"], "amount": 20,
                                "pickup_address": "Paris, France"},
                          headers=rider["h"], timeout=10)
        assert r.status_code == 200
        assert r.json()["valid"] is True

    def test_global_voucher_works_martinique(self, rider, global_voucher):
        r = requests.post(f"{BASE}/vouchers/validate",
                          json={"code": global_voucher["code"], "amount": 20,
                                "pickup_address": "Fort-de-France, Martinique"},
                          headers=rider["h"], timeout=10)
        assert r.status_code == 200
        assert r.json()["valid"] is True

    def test_global_voucher_works_no_pickup(self, rider, global_voucher):
        r = requests.post(f"{BASE}/vouchers/validate",
                          json={"code": global_voucher["code"], "amount": 20},
                          headers=rider["h"], timeout=10)
        assert r.status_code == 200
        assert r.json()["valid"] is True


# ────────────────── App Settings regression (donation flag) ──────────────────
class TestAppSettingsRegression:
    def test_save_app_settings_then_get_returns_new_value(self, admin_h):
        # Public GET returns the settings dict directly (flat)
        cur = requests.get(f"{BASE}/config/app-settings", timeout=10).json()
        settings = cur.get("settings", cur)  # support both shapes
        original_donation = settings.get("enable_donation", True)
        full = dict(settings)
        full["enable_donation"] = False
        r = requests.put(f"{BASE}/config/admin/app-settings", json=full,
                         headers=admin_h, timeout=10)
        assert r.status_code == 200, f"PUT settings failed: {r.status_code} {r.text}"
        after = requests.get(f"{BASE}/config/app-settings", timeout=10).json()
        after_settings = after.get("settings", after)
        assert after_settings["enable_donation"] is False
        # Restore
        full["enable_donation"] = original_donation
        requests.put(f"{BASE}/config/admin/app-settings", json=full,
                     headers=admin_h, timeout=10)
        restored = requests.get(f"{BASE}/config/app-settings", timeout=10).json()
        restored_settings = restored.get("settings", restored)
        assert restored_settings["enable_donation"] == original_donation
