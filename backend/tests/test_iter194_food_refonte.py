"""Iter 194 — FoodPage refonte + merchant enrichment + discount at checkout.

Validates:
- GET /api/merchants?store_type=restaurant returns cuisine/discount_pct/price_per_person/eta_min/delivery_fee
- GET /api/merchants/{id} same enrichment
- POST /api/orders applies merchant discount_pct (Burger Palace = 10%) → total = subtotal - discount + delivery_fee
"""
import os
import uuid
import pytest
import requests

_url = os.environ.get("REACT_APP_BACKEND_URL")
if not _url:
    # Read from frontend/.env
    try:
        with open("/app/frontend/.env") as _f:
            for _line in _f:
                if _line.startswith("REACT_APP_BACKEND_URL="):
                    _url = _line.split("=", 1)[1].strip()
                    break
    except OSError:
        pass
assert _url, "REACT_APP_BACKEND_URL not configured"
BASE_URL = _url.rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def user_token():
    """Register a fresh TEST user and return Bearer token."""
    email = f"TEST_iter194_{uuid.uuid4().hex[:8]}@example.com"
    r = requests.post(
        f"{API}/auth/register",
        json={"name": "Iter194 User", "email": email, "phone": f"+3361{uuid.uuid4().hex[:8]}", "password": "TestPass123!"},
        timeout=15,
    )
    if r.status_code in (200, 201):
        return r.json().get("access_token") or r.json().get("token")
    # Fallback: login the supplied test2 user
    r2 = requests.post(f"{API}/auth/login", json={"email": "test2@example.com", "password": "TestPass123!"}, timeout=15)
    if r2.status_code == 200:
        return r2.json().get("access_token") or r2.json().get("token")
    pytest.skip(f"Cannot obtain user token (register={r.status_code}, login={r2.status_code})")


@pytest.fixture
def auth_headers(user_token):
    return {"Authorization": f"Bearer {user_token}", "Content-Type": "application/json"}


# ── Merchants list with enrichment ──
class TestMerchantList:
    def test_restaurants_have_enrichment(self):
        r = requests.get(f"{API}/merchants", params={"store_type": "restaurant"}, timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list) and len(data) >= 3
        by_id = {m["id"]: m for m in data}

        # Burger Palace
        assert "merchant_burger_palace" in by_id
        bp = by_id["merchant_burger_palace"]
        assert bp.get("cuisine") == "Américain", f"Expected 'Américain', got {bp.get('cuisine')!r}"
        assert bp.get("discount_pct") == 10, f"Expected discount_pct=10, got {bp.get('discount_pct')!r}"
        assert isinstance(bp.get("price_per_person"), (int, float)) and bp["price_per_person"] > 0
        assert "eta_min" in bp and "delivery_fee" in bp

        # Pizza Heaven
        ph = by_id["merchant_pizza_heaven"]
        assert ph.get("cuisine") == "Italien"
        assert ph.get("discount_pct") == 5
        # Pizza avg price per person should be ~12.99 (margherita 14.99, pepperoni 16.99, 4cheese 18.99, garlic 5.99, tiramisu 7.99)
        # mean = (14.99+16.99+18.99+5.99+7.99)/5 = 12.99
        assert abs(ph["price_per_person"] - 12.99) < 0.05, f"Pizza price_per_person={ph['price_per_person']}"

        # Sushi Master
        sm = by_id["merchant_sushi_master"]
        assert sm.get("cuisine") == "Japonais"
        assert sm.get("discount_pct") == 0

    def test_get_single_merchant_enriched(self):
        r = requests.get(f"{API}/merchants/merchant_burger_palace", timeout=15)
        assert r.status_code == 200
        m = r.json()
        assert m.get("cuisine") == "Américain"
        assert m.get("discount_pct") == 10
        assert isinstance(m.get("price_per_person"), (int, float))
        assert m["price_per_person"] > 0


# ── Order creation applies merchant discount ──
class TestOrderDiscount:
    def test_burger_palace_order_applies_10pct_discount(self, auth_headers):
        # Use prod_bp_classic (12.99) x 2 → subtotal 25.98
        payload = {
            "merchant_id": "merchant_burger_palace",
            "items": [{"product_id": "prod_bp_classic", "quantity": 2}],
            "delivery_address": "5 rue Test, Paris",
            "delivery_lat": 48.8566,
            "delivery_lng": 2.3522,
            "payment_method": "cash",
            "order_type": "food",
        }
        r = requests.post(f"{API}/orders", json=payload, headers=auth_headers, timeout=20)
        assert r.status_code == 200, f"Order creation failed: {r.status_code} {r.text}"
        o_create = r.json()
        order_id = o_create["id"]
        # OrderResponse pydantic model strips discount fields → verify via GET (persisted record)
        r2 = requests.get(f"{API}/orders/{order_id}", headers=auth_headers, timeout=15)
        assert r2.status_code == 200, r2.text
        o = r2.json()

        subtotal = round(12.99 * 2, 2)  # 25.98
        assert abs(o["subtotal"] - subtotal) < 0.01, f"subtotal={o['subtotal']}"
        assert o["discount_pct"] == 10, f"discount_pct={o['discount_pct']}"
        expected_discount = round(subtotal * 0.10, 2)  # 2.60
        assert abs(o["discount"] - expected_discount) < 0.02, f"discount={o['discount']} expected {expected_discount}"
        delivery_fee = float(o["delivery_fee"])
        expected_total = round(subtotal - expected_discount + delivery_fee, 2)
        assert abs(o["total"] - expected_total) < 0.02, (
            f"total={o['total']} expected {expected_total} (sub={subtotal} disc={expected_discount} fee={delivery_fee})"
        )
        assert o["status"] == "pending"

    def test_sushi_master_zero_discount(self, auth_headers):
        # Sushi master has discount_pct=0, total should be subtotal + delivery_fee, no discount
        payload = {
            "merchant_id": "merchant_sushi_master",
            "items": [{"product_id": "prod_sm_california", "quantity": 1}],
            "delivery_address": "5 rue Test, Paris",
            "delivery_lat": 48.8566,
            "delivery_lng": 2.3522,
            "payment_method": "cash",
            "order_type": "food",
        }
        r = requests.post(f"{API}/orders", json=payload, headers=auth_headers, timeout=20)
        assert r.status_code == 200, r.text
        oc = r.json()
        r2 = requests.get(f"{API}/orders/{oc['id']}", headers=auth_headers, timeout=15)
        assert r2.status_code == 200
        o = r2.json()
        assert o["discount_pct"] == 0
        assert o["discount"] == 0
        expected = round(o["subtotal"] + float(o["delivery_fee"]), 2)
        assert abs(o["total"] - expected) < 0.02
