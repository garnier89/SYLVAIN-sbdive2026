"""Pharmacy admin configuration tests (iter 115).
Covers: admin settings GET/PUT, categories CRUD, public reflect of settings/categories,
        connectivity (free_threshold + min in estimate, active=false blocks orders).
Resets defaults at end to keep seed clean.
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

USER_EMAIL = "rx.qa@demo.sb"
USER_PASS = "RxQa123!"
ADMIN_EMAIL = "admin@superapp.com"
ADMIN_PASS = "SuperAdmin123!"

DEFAULT_SETTINGS = {
    "active": True,
    "info_note": "Livraison à domicile sous ~45 min.",
    "delivery": {"base": 2.0, "per_km": 0.7, "min": 2.5, "free_threshold": 0.0},
}


def _session(email, password):
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{API}/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, f"login failed {email}: {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="module")
def admin_s():
    return _session(ADMIN_EMAIL, ADMIN_PASS)


@pytest.fixture(scope="module")
def user_s():
    return _session(USER_EMAIL, USER_PASS)


@pytest.fixture(scope="module", autouse=True)
def _reset_defaults(admin_s):
    """Ensure clean defaults before & after tests."""
    admin_s.put(f"{API}/admin/pharmacy/settings", json=DEFAULT_SETTINGS)
    yield
    admin_s.put(f"{API}/admin/pharmacy/settings", json=DEFAULT_SETTINGS)
    # Remove test categories
    cats = admin_s.get(f"{API}/admin/pharmacy/categories").json()
    for c in cats:
        if str(c.get("key", "")).startswith("test_"):
            admin_s.delete(f"{API}/admin/pharmacy/categories/{c['key']}")


# ── Admin settings GET / PUT ─────────────────────────────────────
class TestAdminSettings:
    def test_get_settings(self, admin_s):
        r = admin_s.get(f"{API}/admin/pharmacy/settings")
        assert r.status_code == 200, r.text
        d = r.json()
        assert "active" in d and "info_note" in d and "delivery" in d
        for k in ("base", "per_km", "min", "free_threshold"):
            assert k in d["delivery"]

    def test_put_settings(self, admin_s):
        payload = {
            "active": True,
            "info_note": "TEST_note iter115",
            "delivery": {"base": 1.5, "per_km": 0.5, "min": 3.0, "free_threshold": 10.0},
        }
        r = admin_s.put(f"{API}/admin/pharmacy/settings", json=payload)
        assert r.status_code == 200, r.text
        # Verify GET reflects new values
        g = admin_s.get(f"{API}/admin/pharmacy/settings").json()
        assert g["info_note"] == "TEST_note iter115"
        assert g["delivery"]["min"] == 3.0
        assert g["delivery"]["free_threshold"] == 10.0

    def test_non_admin_forbidden(self, user_s):
        r = user_s.get(f"{API}/admin/pharmacy/settings")
        assert r.status_code in (401, 403), r.text


# ── Connectivity: settings impact public estimate ────────────────
class TestSettingsConnectivity:
    @pytest.fixture(autouse=True)
    def _ctx(self, admin_s, user_s):
        self.admin = admin_s
        self.user = user_s
        # Set min=3, free_threshold=10
        admin_s.put(f"{API}/admin/pharmacy/settings", json={
            "active": True,
            "info_note": "TEST_iter115",
            "delivery": {"base": 2.0, "per_km": 0.7, "min": 3.0, "free_threshold": 10.0},
        })
        # Need a product and pharmacy
        prods = user_s.get(f"{API}/pharmacy/products").json()
        pharms = user_s.get(f"{API}/pharmacy/pharmacies").json()
        # find a cheap product and a pricier setup
        prods_sorted = sorted(prods, key=lambda p: p["price"])
        self.cheap = prods_sorted[0]
        self.pharm = pharms[0]

    def test_min_fee_when_below_threshold(self):
        # Subtotal < threshold (10€) → fee should be min (3.0) when far from pharmacy
        r = self.user.post(f"{API}/pharmacy/orders/estimate", json={
            "items": [{"product_id": self.cheap["id"], "qty": 1}],
            "pharmacy_id": self.pharm["id"],
            "delivery_lat": self.pharm["lat"] + 0.001,
            "delivery_lng": self.pharm["lng"] + 0.001,
        })
        assert r.status_code == 200, r.text
        d = r.json()
        # subtotal below 10 → fee should be at least min (3.0) — base+per_km*0.1km is ~2.07, min wins
        if d["subtotal"] < 10:
            assert d["delivery_fee"] == 3.0, f"expected min fee 3, got {d}"

    def test_free_delivery_above_threshold(self):
        # qty enough so subtotal >= 10€ → fee 0
        qty = max(1, int(10 // self.cheap["price"]) + 2)
        r = self.user.post(f"{API}/pharmacy/orders/estimate", json={
            "items": [{"product_id": self.cheap["id"], "qty": qty}],
            "pharmacy_id": self.pharm["id"],
            "delivery_lat": self.pharm["lat"] + 0.001,
            "delivery_lng": self.pharm["lng"] + 0.001,
        })
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["subtotal"] >= 10, d
        assert d["delivery_fee"] == 0.0, f"expected free delivery, got {d}"


# ── Active toggle blocks order creation ──────────────────────────
class TestActiveToggle:
    def test_inactive_blocks_order(self, admin_s, user_s):
        admin_s.put(f"{API}/admin/pharmacy/settings", json={
            "active": False,
            "info_note": "TEST_inactive",
            "delivery": {"base": 2.0, "per_km": 0.7, "min": 2.5, "free_threshold": 0.0},
        })
        # Public settings should reflect
        ps = user_s.get(f"{API}/pharmacy/settings").json()
        assert ps["active"] is False

        prods = user_s.get(f"{API}/pharmacy/products").json()
        pharms = user_s.get(f"{API}/pharmacy/pharmacies").json()
        r = user_s.post(f"{API}/pharmacy/orders", json={
            "order_type": "catalog",
            "items": [{"product_id": prods[0]["id"], "qty": 1}],
            "pharmacy_id": pharms[0]["id"],
            "delivery_address": "TEST addr",
            "delivery_lat": pharms[0]["lat"] + 0.001,
            "delivery_lng": pharms[0]["lng"] + 0.001,
            "recipient_name": "QA",
            "recipient_phone": "+33600000000",
            "payment_method": "cash",
        })
        assert r.status_code == 400, r.text
        assert "indisponible" in r.text.lower() or "pharmacie" in r.text.lower()

    def test_active_restores_order(self, admin_s, user_s):
        admin_s.put(f"{API}/admin/pharmacy/settings", json=DEFAULT_SETTINGS)
        prods = user_s.get(f"{API}/pharmacy/products").json()
        pharms = user_s.get(f"{API}/pharmacy/pharmacies").json()
        r = user_s.post(f"{API}/pharmacy/orders", json={
            "order_type": "catalog",
            "items": [{"product_id": prods[0]["id"], "qty": 1}],
            "pharmacy_id": pharms[0]["id"],
            "delivery_address": "TEST addr",
            "delivery_lat": pharms[0]["lat"] + 0.001,
            "delivery_lng": pharms[0]["lng"] + 0.001,
            "recipient_name": "QA",
            "recipient_phone": "+33600000000",
            "payment_method": "cash",
        })
        assert r.status_code == 200, r.text
        oid = r.json().get("id")
        assert oid


# ── Categories CRUD ───────────────────────────────────────────────
class TestCategoriesCRUD:
    KEY = f"test_cat_{uuid.uuid4().hex[:6]}"

    def test_list(self, admin_s):
        r = admin_s.get(f"{API}/admin/pharmacy/categories")
        assert r.status_code == 200, r.text
        assert isinstance(r.json(), list)

    def test_create(self, admin_s):
        r = admin_s.post(f"{API}/admin/pharmacy/categories", json={
            "key": self.KEY, "label": "TEST Catégorie", "order": 99,
        })
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["key"] == self.KEY and d["label"] == "TEST Catégorie"

    def test_duplicate_400(self, admin_s):
        r = admin_s.post(f"{API}/admin/pharmacy/categories", json={
            "key": self.KEY, "label": "Dup", "order": 1,
        })
        assert r.status_code == 400, r.text

    def test_public_reflects(self, user_s):
        r = user_s.get(f"{API}/pharmacy/categories")
        assert r.status_code == 200
        cats = r.json().get("categories", [])
        assert any(c["key"] == self.KEY for c in cats), [c["key"] for c in cats]

    def test_update_rename(self, admin_s):
        r = admin_s.put(f"{API}/admin/pharmacy/categories/{self.KEY}", json={
            "key": self.KEY, "label": "TEST Renamed", "order": 50,
        })
        assert r.status_code == 200, r.text
        assert r.json()["label"] == "TEST Renamed"

    def test_delete_blocked_when_used(self, admin_s):
        # Create a product attached to the category
        prod = admin_s.post(f"{API}/admin/pharmacy/products", json={
            "name": "TEST_prod_iter115",
            "category": self.KEY,
            "price": 1.0,
            "image_url": "https://example.com/x.png",
            "active": True,
        })
        # If admin product creation route differs, skip
        if prod.status_code not in (200, 201):
            pytest.skip(f"could not create product to test guard: {prod.status_code} {prod.text}")
        pid = prod.json().get("id")
        r = admin_s.delete(f"{API}/admin/pharmacy/categories/{self.KEY}")
        assert r.status_code == 400, r.text
        # cleanup product
        if pid:
            admin_s.delete(f"{API}/admin/pharmacy/products/{pid}")

    def test_delete(self, admin_s):
        r = admin_s.delete(f"{API}/admin/pharmacy/categories/{self.KEY}")
        assert r.status_code == 200, r.text
        # verify gone
        cats = admin_s.get(f"{API}/admin/pharmacy/categories").json()
        assert not any(c["key"] == self.KEY for c in cats)
