"""iter197 — Flash discount on merchants (storefront + admin + order pricing).

Covers PUT /api/merchants/me (merchant), PUT /api/admin/merchants/{id} (admin),
GET enrichment (effective_discount_pct + flash_active), and order pricing
applying the flash discount when active.
"""
import os
import requests
import pytest

def _load_base_url():
    url = os.environ.get("REACT_APP_BACKEND_URL")
    if not url:
        # Fallback to frontend .env (test env may not export it)
        try:
            with open("/app/frontend/.env") as f:
                for line in f:
                    if line.startswith("REACT_APP_BACKEND_URL="):
                        url = line.split("=", 1)[1].strip()
                        break
        except Exception:
            pass
    assert url, "REACT_APP_BACKEND_URL not configured"
    return url.rstrip("/") + "/api"

BASE_URL = _load_base_url()

ADMIN = ("admin@superapp.com", "SuperAdmin123!")
MERCHANT = ("merchant@example.com", "Merchant123!")
USER = ("test2@example.com", "TestPass123!")


def _login(s, email, password):
    r = s.post(f"{BASE_URL}/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture(scope="module")
def merchant_sess():
    s = requests.Session()
    _login(s, *MERCHANT)
    yield s
    # Always restore: disable flash
    s.put(f"{BASE_URL}/merchants/me", json={"flash_discount": {"enabled": False, "pct": 0, "start_time": "", "end_time": "", "days": []}})


@pytest.fixture(scope="module")
def admin_sess():
    s = requests.Session()
    _login(s, *ADMIN)
    return s


@pytest.fixture(scope="module")
def user_sess():
    s = requests.Session()
    _login(s, *USER)
    return s


@pytest.fixture(scope="module")
def merchant_id(merchant_sess):
    r = merchant_sess.get(f"{BASE_URL}/merchants/me")
    assert r.status_code == 200, r.text
    return r.json()["id"]


# ── Merchant PUT /merchants/me with flash_discount ──
class TestMerchantFlash:
    def test_set_flash_active_window(self, merchant_sess):
        payload = {"flash_discount": {"enabled": True, "pct": 30, "start_time": "00:00", "end_time": "23:59", "days": []}}
        r = merchant_sess.put(f"{BASE_URL}/merchants/me", json=payload)
        assert r.status_code == 200, r.text
        m = r.json()
        assert m["flash_discount"]["enabled"] is True
        assert m["flash_discount"]["pct"] == 30
        assert m["flash_active"] is True
        assert m["effective_discount_pct"] == 30

    def test_get_me_persists(self, merchant_sess):
        r = merchant_sess.get(f"{BASE_URL}/merchants/me")
        assert r.status_code == 200
        m = r.json()
        assert m["flash_active"] is True
        assert m["effective_discount_pct"] == 30

    def test_public_get_reflects_flash(self, merchant_id):
        r = requests.get(f"{BASE_URL}/merchants/{merchant_id}")
        assert r.status_code == 200
        m = r.json()
        assert m["flash_active"] is True
        assert m["effective_discount_pct"] == 30

    def test_set_flash_inactive_window(self, merchant_sess, merchant_id):
        # Window 03:00–03:30 — unlikely to cover most test times; verify via flash_active
        payload = {"flash_discount": {"enabled": True, "pct": 25, "start_time": "03:00", "end_time": "03:30", "days": []}}
        r = merchant_sess.put(f"{BASE_URL}/merchants/me", json=payload)
        assert r.status_code == 200
        # Re-fetch through public endpoint
        from datetime import datetime
        from zoneinfo import ZoneInfo
        now = datetime.now(ZoneInfo("Europe/Paris")).strftime("%H:%M")
        in_window = "03:00" <= now <= "03:30"
        r2 = requests.get(f"{BASE_URL}/merchants/{merchant_id}")
        m = r2.json()
        assert m["flash_active"] is in_window
        if not in_window:
            assert m["effective_discount_pct"] == m.get("discount_pct", 0)

    def test_re_enable_for_order_test(self, merchant_sess):
        payload = {"flash_discount": {"enabled": True, "pct": 30, "start_time": "00:00", "end_time": "23:59", "days": []}}
        r = merchant_sess.put(f"{BASE_URL}/merchants/me", json=payload)
        assert r.status_code == 200
        assert r.json()["flash_active"] is True


# ── Admin PUT /admin/merchants/{id} accepts flash_discount ──
class TestAdminFlash:
    def test_admin_set_flash(self, admin_sess, merchant_id):
        payload = {"flash_discount": {"enabled": True, "pct": 15, "start_time": "00:00", "end_time": "23:59", "days": [0, 1, 2, 3, 4, 5, 6]}}
        r = admin_sess.put(f"{BASE_URL}/admin/merchants/{merchant_id}", json=payload)
        assert r.status_code == 200, r.text
        # Verify via public GET
        m = requests.get(f"{BASE_URL}/merchants/{merchant_id}").json()
        assert m["flash_discount"]["pct"] == 15
        assert m["flash_active"] is True
        assert m["effective_discount_pct"] == 15

    def test_admin_validates_pct_cap(self, admin_sess, merchant_id):
        # 200 -> clamped to 90
        r = admin_sess.put(f"{BASE_URL}/admin/merchants/{merchant_id}",
                           json={"flash_discount": {"enabled": True, "pct": 200, "start_time": "00:00", "end_time": "23:59", "days": []}})
        assert r.status_code == 200
        m = requests.get(f"{BASE_URL}/merchants/{merchant_id}").json()
        assert m["flash_discount"]["pct"] == 90

    def test_admin_restores_for_order_test(self, admin_sess, merchant_id):
        # Merchant fixture will reset at teardown; set 30 here for the order pricing test
        payload = {"flash_discount": {"enabled": True, "pct": 30, "start_time": "00:00", "end_time": "23:59", "days": []}}
        r = admin_sess.put(f"{BASE_URL}/admin/merchants/{merchant_id}", json=payload)
        assert r.status_code == 200


# ── Order pricing uses flash discount ──
class TestOrderFlashPricing:
    def test_order_applies_flash_30pct(self, user_sess, merchant_id):
        # Get a product from merchant
        products = requests.get(f"{BASE_URL}/merchants/{merchant_id}/products").json()
        assert isinstance(products, list) and len(products) > 0, "No products on Resto Demo SB"
        # Pick a product with price ~9.90 if available; else first
        p = next((x for x in products if abs(float(x.get("price", 0)) - 9.90) < 0.01), products[0])
        order = {
            "merchant_id": merchant_id,
            "items": [{"product_id": p["id"], "quantity": 2}],
            "delivery_address": "1 Rue de Test, Paris",
            "delivery_lat": 48.8566,
            "delivery_lng": 2.3522,
            "order_type": "food",
            "payment_method": "cash",
        }
        r = user_sess.post(f"{BASE_URL}/orders", json=order)
        assert r.status_code == 200, r.text
        o = r.json()
        # Pricing assertions
        assert o["discount_pct"] == 30
        subtotal_expected = round(float(p["price"]) * 2, 2)
        assert abs(o["subtotal"] - subtotal_expected) < 0.01
        expected_discount = round(subtotal_expected * 30 / 100, 2)
        assert abs(o["discount"] - expected_discount) < 0.01
        # Total = subtotal - discount + delivery_fee
        expected_total = round(subtotal_expected - expected_discount + float(o["delivery_fee"]), 2)
        assert abs(o["total"] - expected_total) < 0.02


# ── Restoration sanity ──
def test_zz_restore_flash_off(merchant_sess, merchant_id):
    r = merchant_sess.put(f"{BASE_URL}/merchants/me",
                          json={"flash_discount": {"enabled": False, "pct": 0, "start_time": "", "end_time": "", "days": []}})
    assert r.status_code == 200
    m = requests.get(f"{BASE_URL}/merchants/{merchant_id}").json()
    assert m["flash_active"] is False
