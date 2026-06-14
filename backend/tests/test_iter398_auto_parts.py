"""SB Auto Pièces (e-commerce) — backend tests.

Covers public catalogue, order creation with wallet debit + stock decrement,
admin CRUD on products and order status workflow (incl. cancel = refund + restock).
"""
import os
import time
import pytest
import requests

BASE = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE}/api"

CLIENT = {"email": "famtester@demo.sb", "password": "FamTest123!"}
ADMIN = {"email": "admin@superapp.com", "password": "SuperAdmin123!"}


def _token(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=20)
    assert r.status_code == 200, f"login failed for {creds['email']}: {r.text}"
    j = r.json()
    return j.get("access_token") or j.get("token")


@pytest.fixture(scope="module")
def client_headers():
    return {"Authorization": f"Bearer {_token(CLIENT)}"}


@pytest.fixture(scope="module")
def admin_headers():
    return {"Authorization": f"Bearer {_token(ADMIN)}"}


# ── Public catalogue ────────────────────────────────────────────────────────
class TestCatalogue:
    def test_categories(self):
        r = requests.get(f"{API}/auto-parts/categories", timeout=20)
        assert r.status_code == 200
        j = r.json()
        assert len(j["categories"]) == 10
        assert j["delivery_fee"] == 5.90

    def test_products_seeded(self):
        r = requests.get(f"{API}/auto-parts/products", timeout=20)
        assert r.status_code == 200
        items = r.json()
        assert len(items) >= 24, f"expected ~28 seeded, got {len(items)}"
        for p in items[:3]:
            for k in ("id", "name", "brand", "category", "type", "price", "stock"):
                assert k in p
            assert "_id" not in p

    def test_filter_by_type_moto(self):
        r = requests.get(f"{API}/auto-parts/products", params={"type": "moto"}, timeout=20)
        assert r.status_code == 200
        items = r.json()
        assert len(items) > 0
        assert all(p["type"] == "moto" for p in items)

    def test_filter_by_category(self):
        r = requests.get(f"{API}/auto-parts/products", params={"category": "freinage"}, timeout=20)
        assert r.status_code == 200
        items = r.json()
        assert all(p["category"] == "freinage" for p in items)

    def test_search(self):
        r = requests.get(f"{API}/auto-parts/products", params={"q": "Bosch"}, timeout=20)
        assert r.status_code == 200
        assert all("bosch" in (p["name"] + p["brand"]).lower() for p in r.json())

    def test_brands(self):
        r = requests.get(f"{API}/auto-parts/brands", timeout=20)
        assert r.status_code == 200
        assert isinstance(r.json()["brands"], list) and len(r.json()["brands"]) > 0

    def test_product_detail_and_404(self):
        items = requests.get(f"{API}/auto-parts/products", timeout=20).json()
        r = requests.get(f"{API}/auto-parts/products/{items[0]['id']}", timeout=20)
        assert r.status_code == 200 and r.json()["id"] == items[0]["id"]
        assert requests.get(f"{API}/auto-parts/products/nope_xx", timeout=20).status_code == 404


# ── Orders ──────────────────────────────────────────────────────────────────
class TestOrders:
    def _pick(self, n=1):
        items = requests.get(f"{API}/auto-parts/products", timeout=20).json()
        return [{"product_id": p["id"], "qty": 1} for p in items[:n]], items[:n]

    def test_empty_cart(self, client_headers):
        r = requests.post(f"{API}/auto-parts/orders", headers=client_headers,
                          json={"items": [], "fulfillment": "pickup", "payment_method": "sbpay"}, timeout=20)
        assert r.status_code == 400

    def test_delivery_missing_address(self, client_headers):
        items, _ = self._pick(1)
        r = requests.post(f"{API}/auto-parts/orders", headers=client_headers,
                          json={"items": items, "fulfillment": "delivery", "payment_method": "sbpay"}, timeout=20)
        assert r.status_code == 400

    def test_order_delivery_sbpay_debits_wallet_and_decrements_stock(self, client_headers):
        items, products = self._pick(2)
        # Snapshot stock
        before = {p["id"]: p["stock"] for p in products}
        # Wallet before
        me = requests.get(f"{API}/auth/me", headers=client_headers, timeout=20).json()
        w_before = requests.get(f"{API}/wallet/balance", headers=client_headers, timeout=20)
        bal_before = w_before.json().get("balance") if w_before.status_code == 200 else None

        payload = {
            "items": items, "fulfillment": "delivery",
            "address": "12 rue de Paris, Honiara",
            "payment_method": "sbpay",
        }
        r = requests.post(f"{API}/auto-parts/orders", headers=client_headers, json=payload, timeout=30)
        assert r.status_code == 200, r.text
        order = r.json()
        expected_sub = round(sum(p["price"] for p in products), 2)
        assert order["subtotal"] == expected_sub
        assert order["delivery_fee"] == 5.90
        assert order["total"] == round(expected_sub + 5.90, 2)
        assert order["status"] == "confirmed"
        assert order["payment_status"] == "paid"
        if bal_before is not None and order.get("balance") is not None:
            assert round(bal_before - order["total"], 2) == round(order["balance"], 2)

        # Stock decrement check
        for p in products:
            cur = requests.get(f"{API}/auto-parts/products/{p['id']}", timeout=20).json()
            assert cur["stock"] == before[p["id"]] - 1
        TestOrders._last_order_id = order["id"]
        TestOrders._user_id = me["id"]

    def test_order_pickup_no_delivery_fee(self, client_headers):
        items, products = self._pick(1)
        r = requests.post(f"{API}/auto-parts/orders", headers=client_headers,
                          json={"items": items, "fulfillment": "pickup", "payment_method": "sbpay"}, timeout=20)
        assert r.status_code == 200, r.text
        o = r.json()
        assert o["delivery_fee"] == 0.0
        assert o["total"] == round(products[0]["price"], 2)

    def test_list_orders(self, client_headers):
        r = requests.get(f"{API}/auto-parts/orders", headers=client_headers, timeout=20)
        assert r.status_code == 200
        assert isinstance(r.json(), list) and len(r.json()) >= 1

    def test_get_order(self, client_headers):
        oid = getattr(TestOrders, "_last_order_id", None)
        assert oid
        r = requests.get(f"{API}/auto-parts/orders/{oid}", headers=client_headers, timeout=20)
        assert r.status_code == 200 and r.json()["id"] == oid

    def test_insufficient_stock(self, client_headers):
        items = requests.get(f"{API}/auto-parts/products", timeout=20).json()
        p = items[0]
        r = requests.post(f"{API}/auto-parts/orders", headers=client_headers,
                          json={"items": [{"product_id": p["id"], "qty": 999999}],
                                "fulfillment": "pickup", "payment_method": "sbpay"}, timeout=20)
        assert r.status_code == 400


# ── Admin ───────────────────────────────────────────────────────────────────
class TestAdmin:
    def test_admin_list_products(self, admin_headers):
        r = requests.get(f"{API}/admin/auto-parts/products", headers=admin_headers, timeout=20)
        assert r.status_code == 200
        j = r.json()
        assert "products" in j and "categories" in j
        assert len(j["categories"]) == 10

    def test_admin_crud_product(self, admin_headers):
        # create
        payload = {"name": "TEST_ Plaquettes essai", "brand": "TestBrand",
                   "category": "freinage", "price": 19.99, "stock": 5,
                   "compat": ["Renault"], "description": "Test"}
        r = requests.post(f"{API}/admin/auto-parts/products", headers=admin_headers, json=payload, timeout=20)
        assert r.status_code == 200, r.text
        prod = r.json()
        pid = prod["id"]
        assert prod["type"] == "auto" and prod["price"] == 19.99
        # update
        r = requests.put(f"{API}/admin/auto-parts/products/{pid}", headers=admin_headers,
                         json={"price": 29.99, "stock": 10}, timeout=20)
        assert r.status_code == 200 and r.json()["price"] == 29.99 and r.json()["stock"] == 10
        # delete (= deactivate)
        r = requests.delete(f"{API}/admin/auto-parts/products/{pid}", headers=admin_headers, timeout=20)
        assert r.status_code == 200
        # verify not in public list
        listed = requests.get(f"{API}/auto-parts/products", timeout=20).json()
        assert not any(p["id"] == pid for p in listed)

    def test_admin_invalid_category(self, admin_headers):
        r = requests.post(f"{API}/admin/auto-parts/products", headers=admin_headers,
                          json={"name": "X", "category": "nope"}, timeout=20)
        assert r.status_code == 400

    def test_admin_orders_and_status_workflow(self, client_headers, admin_headers):
        # Create a fresh order to test status transitions
        items = requests.get(f"{API}/auto-parts/products", timeout=20).json()
        product = items[0]
        stock_before = product["stock"]
        order_resp = requests.post(
            f"{API}/auto-parts/orders", headers=client_headers,
            json={"items": [{"product_id": product["id"], "qty": 1}],
                  "fulfillment": "pickup", "payment_method": "sbpay"}, timeout=20)
        assert order_resp.status_code == 200, order_resp.text
        oid = order_resp.json()["id"]
        order_total = order_resp.json()["total"]

        # Admin orders list + revenue
        r = requests.get(f"{API}/admin/auto-parts/orders", headers=admin_headers, timeout=20)
        assert r.status_code == 200
        j = r.json()
        assert any(o["id"] == oid for o in j["orders"])
        assert j["revenue"] >= order_total
        assert j["statuses"] == ["confirmed", "preparing", "shipped", "ready", "delivered", "cancelled"]

        # Transitions: preparing → shipped
        for st in ("preparing", "shipped"):
            r = requests.post(f"{API}/admin/auto-parts/orders/{oid}/status",
                              headers=admin_headers, json={"status": st}, timeout=20)
            assert r.status_code == 200 and r.json()["status"] == st

        # invalid status
        r = requests.post(f"{API}/admin/auto-parts/orders/{oid}/status",
                          headers=admin_headers, json={"status": "weird"}, timeout=20)
        assert r.status_code == 400

        # cancel → refund + restock
        # Get wallet balance before cancel
        w_before = requests.get(f"{API}/wallet/balance", headers=client_headers, timeout=20).json().get("balance")
        r = requests.post(f"{API}/admin/auto-parts/orders/{oid}/status",
                          headers=admin_headers, json={"status": "cancelled"}, timeout=20)
        assert r.status_code == 200
        # restock check
        time.sleep(0.5)
        cur = requests.get(f"{API}/auto-parts/products/{product['id']}", timeout=20).json()
        # stock_before was the value *before* the order; the order decremented by 1,
        # then cancel restocked +1 → equal to stock_before.
        assert cur["stock"] == stock_before
        # refund check
        w_after = requests.get(f"{API}/wallet/balance", headers=client_headers, timeout=20).json().get("balance")
        if w_before is not None and w_after is not None:
            assert round(w_after - w_before, 2) == round(order_total, 2)


# ── Auth gating ─────────────────────────────────────────────────────────────
class TestAuthGuards:
    def test_admin_requires_admin(self, client_headers):
        r = requests.get(f"{API}/admin/auto-parts/products", headers=client_headers, timeout=20)
        assert r.status_code in (401, 403)

    def test_orders_requires_auth(self):
        r = requests.get(f"{API}/auto-parts/orders", timeout=20)
        assert r.status_code in (401, 403)
