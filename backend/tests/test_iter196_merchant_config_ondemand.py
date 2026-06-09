"""
Iter 196 – Tests:
1) Admin & Merchant configurable cuisine / discount / delivery / eta on merchants.
2) On-demand services providers seeded for ALL categories (no empty category).
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://gojek-clone-41.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@superapp.com"
ADMIN_PASS = "SuperAdmin123!"
MERCHANT_EMAIL = "merchant@example.com"
MERCHANT_PASS = "Merchant123!"


# ---------- helpers ----------
def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=20)
    assert r.status_code == 200, f"login {email} failed: {r.status_code} {r.text}"
    body = r.json()
    token = body.get("access_token") or body.get("token") or body.get("token_value")
    assert token, f"no token in login response: {body}"
    return token


@pytest.fixture(scope="module")
def admin_token():
    return _login(ADMIN_EMAIL, ADMIN_PASS)


@pytest.fixture(scope="module")
def merchant_token():
    return _login(MERCHANT_EMAIL, MERCHANT_PASS)


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


# ---------- merchant config (admin side) ----------
class TestAdminMerchantUpdate:
    def test_admin_update_merchant_settings_and_persist(self, admin_token, merchant_token):
        # discover the merchant via /merchants/me on the merchant account
        me = requests.get(f"{API}/merchants/me", headers=_auth(merchant_token), timeout=10)
        assert me.status_code == 200, me.text
        merchant = me.json()
        mid = merchant["id"]
        original = {
            "cuisine": merchant.get("cuisine") or "Américain",
            "discount_pct": merchant.get("discount_pct") or 0,
            "delivery_fee": merchant.get("delivery_fee") or 0,
            "eta_min": merchant.get("eta_min") or 30,
        }

        # admin update
        new_payload = {"cuisine": "TEST_Italien", "discount_pct": 15, "delivery_fee": 3.5, "eta_min": 25}
        r = requests.put(f"{API}/admin/merchants/{mid}", json=new_payload, headers=_auth(admin_token), timeout=10)
        assert r.status_code == 200, r.text

        # GET /merchants/{id} reflects update
        g = requests.get(f"{API}/merchants/{mid}", timeout=10)
        assert g.status_code == 200
        m2 = g.json()
        assert m2["cuisine"] == "TEST_Italien"
        assert float(m2["discount_pct"]) == 15.0
        assert float(m2["delivery_fee"]) == 3.5
        assert int(m2["eta_min"]) == 25

        # restore original
        restore = requests.put(
            f"{API}/admin/merchants/{mid}", json=original, headers=_auth(admin_token), timeout=10
        )
        assert restore.status_code == 200

    def test_admin_update_unknown_merchant_404(self, admin_token):
        r = requests.put(
            f"{API}/admin/merchants/does_not_exist_xyz",
            json={"cuisine": "X"},
            headers=_auth(admin_token),
            timeout=10,
        )
        assert r.status_code == 404


class TestMerchantSelfUpdate:
    def test_get_merchants_me_returns_storefront(self, merchant_token):
        r = requests.get(f"{API}/merchants/me", headers=_auth(merchant_token), timeout=10)
        assert r.status_code == 200, r.text
        m = r.json()
        for k in ("id", "cuisine", "discount_pct"):
            assert k in m, f"missing field {k}"
        # name is typically present (may be 'store_name' on some schemas)
        assert m.get("name") or m.get("store_name")

    def test_merchant_self_update_persists(self, merchant_token):
        before = requests.get(f"{API}/merchants/me", headers=_auth(merchant_token), timeout=10).json()
        original = {
            "cuisine": before.get("cuisine") or "Américain",
            "discount_pct": before.get("discount_pct") or 0,
            "delivery_fee": before.get("delivery_fee") or 0,
            "eta_min": before.get("eta_min") or 30,
        }
        payload = {"cuisine": "TEST_Japonais", "discount_pct": 12, "delivery_fee": 2.99, "eta_min": 40}
        r = requests.put(f"{API}/merchants/me", json=payload, headers=_auth(merchant_token), timeout=10)
        assert r.status_code == 200, r.text
        updated = r.json()
        assert updated["cuisine"] == "TEST_Japonais"
        assert float(updated["discount_pct"]) == 12.0

        # cross-check public GET
        pub = requests.get(f"{API}/merchants/{updated['id']}", timeout=10).json()
        assert pub["cuisine"] == "TEST_Japonais"
        assert float(pub["discount_pct"]) == 12.0
        assert float(pub["delivery_fee"]) == 2.99
        assert int(pub["eta_min"]) == 40

        # restore
        restore = requests.put(f"{API}/merchants/me", json=original, headers=_auth(merchant_token), timeout=10)
        assert restore.status_code == 200

    def test_put_me_requires_auth(self):
        r = requests.put(f"{API}/merchants/me", json={"cuisine": "x"}, timeout=10)
        assert r.status_code in (401, 403)


# ---------- on-demand providers ----------
EXPECTED_CATEGORIES = [
    "bricoleur", "menage", "massage", "babysitting", "mecanicien", "gardien",
    "jardinage", "deneigement", "nettoyage-bureau", "profs", "avocats",
    "anti-nuisibles", "dj", "agent-voyage", "coach-fitness", "coiffeur",
    "reparation-auto", "traducteur", "agent-immobilier", "traiteur", "serrurier",
    "reparation-tv", "reparation-ordinateur", "decorateur",
]


class TestOnDemandProviders:
    @pytest.mark.parametrize("slug", EXPECTED_CATEGORIES)
    def test_each_category_has_at_least_one_provider(self, slug):
        r = requests.get(f"{API}/services/providers", params={"category": slug}, timeout=15)
        assert r.status_code == 200, f"{slug} -> {r.status_code} {r.text}"
        data = r.json()
        assert isinstance(data, list), f"{slug} did not return a list"
        assert len(data) >= 1, f"category '{slug}' returned 0 providers"
        # provider shape sanity
        p = data[0]
        assert p.get("category_slug") == slug
        assert p.get("name")
        assert "id" in p

    def test_specific_categories_focus(self):
        focus = ["gardien", "jardinage", "dj", "traiteur", "serrurier", "coach-fitness", "reparation-ordinateur"]
        for slug in focus:
            r = requests.get(f"{API}/services/providers", params={"category": slug}, timeout=15)
            assert r.status_code == 200
            assert len(r.json()) >= 1, f"focus category {slug} empty"

    def test_provider_detail_for_random_seeded_provider(self):
        r = requests.get(f"{API}/services/providers", params={"category": "dj"}, timeout=15)
        assert r.status_code == 200
        provs = r.json()
        assert provs
        pid = provs[0]["id"]
        d = requests.get(f"{API}/services/providers/{pid}", timeout=10)
        assert d.status_code == 200, d.text
        body = d.json()
        assert body["id"] == pid
        assert "services" in body and isinstance(body["services"], list) and len(body["services"]) >= 1
