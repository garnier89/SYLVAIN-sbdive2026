"""Pharmacy module API tests (iter 114).
Covers: pharmacies/categories/products listing & filters, estimate, create catalog & prescription,
        cancel, admin quote/status, admin product+pharmacy CRUD, driver available.
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

USER_EMAIL = "rx.qa@demo.sb"
USER_PASS = "RxQa123!"
ADMIN_EMAIL = "admin@superapp.com"
ADMIN_PASS = "SuperAdmin123!"


def _session(email, password):
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{API}/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="module")
def user_session():
    return _session(USER_EMAIL, USER_PASS)


@pytest.fixture(scope="module")
def admin_session():
    return _session(ADMIN_EMAIL, ADMIN_PASS)


# ── Public catalog ────────────────────────────────────────────────
class TestCatalog:
    def test_pharmacies_seeded(self, user_session):
        r = user_session.get(f"{API}/pharmacy/pharmacies")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list) and len(data) >= 3
        assert all("id" in p and "name" in p and "lat" in p for p in data)

    def test_categories(self, user_session):
        r = user_session.get(f"{API}/pharmacy/categories")
        assert r.status_code == 200
        cats = r.json().get("categories", [])
        assert len(cats) == 8
        assert {c["key"] for c in cats} >= {"pain", "cold", "digestion", "vitamins"}

    def test_products_all(self, user_session):
        r = user_session.get(f"{API}/pharmacy/products")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list) and len(data) >= 12

    def test_products_filter_category(self, user_session):
        r = user_session.get(f"{API}/pharmacy/products", params={"category": "pain"})
        assert r.status_code == 200
        items = r.json()
        assert len(items) >= 1
        assert all(p["category"] == "pain" for p in items)

    def test_products_search(self, user_session):
        r = user_session.get(f"{API}/pharmacy/products", params={"search": "vitamine"})
        assert r.status_code == 200
        items = r.json()
        assert len(items) >= 1
        assert all("vitamin" in p["name"].lower() for p in items)


# ── Estimate + Create (catalog) ───────────────────────────────────
class TestOrderFlow:
    @pytest.fixture(autouse=True)
    def _ctx(self, user_session):
        self.s = user_session
        prods = user_session.get(f"{API}/pharmacy/products").json()
        pharms = user_session.get(f"{API}/pharmacy/pharmacies").json()
        self.product = prods[0]
        self.pharmacy = pharms[0]

    def test_estimate(self):
        body = {
            "items": [{"product_id": self.product["id"], "qty": 2}],
            "pharmacy_id": self.pharmacy["id"],
            "delivery_lat": 48.8600, "delivery_lng": 2.3500,
        }
        r = self.s.post(f"{API}/pharmacy/orders/estimate", json=body)
        assert r.status_code == 200
        d = r.json()
        expected_sub = round(float(self.product["price"]) * 2, 2)
        assert d["subtotal"] == expected_sub
        assert d["delivery_fee"] >= 2.5
        assert d["total"] == round(d["subtotal"] + d["delivery_fee"], 2)

    def test_create_catalog_order(self):
        body = {
            "order_type": "catalog",
            "items": [{"product_id": self.product["id"], "qty": 1}],
            "pharmacy_id": self.pharmacy["id"],
            "delivery_address": "TEST_addr 1",
            "delivery_lat": 48.86, "delivery_lng": 2.35,
            "recipient_name": "QA", "recipient_phone": "+330000",
            "payment_method": "cash",
        }
        r = self.s.post(f"{API}/pharmacy/orders", json=body)
        assert r.status_code == 200, r.text
        o = r.json()
        assert o["status"] == "confirmed"
        assert o["order_type"] == "catalog"
        assert o["medication_total"] == float(self.product["price"])
        assert o["total"] == round(o["medication_total"] + o["delivery_fee"], 2)
        assert o["needs_quote"] is False
        # GET back
        g = self.s.get(f"{API}/pharmacy/orders/{o['id']}")
        assert g.status_code == 200 and g.json()["id"] == o["id"]

    def test_create_catalog_empty_cart_400(self):
        body = {"order_type": "catalog", "items": [],
                "delivery_lat": 48.86, "delivery_lng": 2.35}
        r = self.s.post(f"{API}/pharmacy/orders", json=body)
        assert r.status_code == 400

    def test_create_prescription_no_photo_400(self):
        body = {"order_type": "prescription",
                "delivery_lat": 48.86, "delivery_lng": 2.35}
        r = self.s.post(f"{API}/pharmacy/orders", json=body)
        assert r.status_code == 400

    def test_create_no_coords_400(self):
        body = {"order_type": "catalog",
                "items": [{"product_id": self.product["id"], "qty": 1}]}
        r = self.s.post(f"{API}/pharmacy/orders", json=body)
        assert r.status_code == 400

    def test_create_prescription_order(self):
        body = {
            "order_type": "prescription",
            "prescription_image": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==",
            "prescription_note": "TEST ordonnance",
            "pharmacy_id": self.pharmacy["id"],
            "delivery_lat": 48.86, "delivery_lng": 2.35,
            "delivery_address": "TEST adr rx", "recipient_name": "QA",
            "payment_method": "cash",
        }
        r = self.s.post(f"{API}/pharmacy/orders", json=body)
        assert r.status_code == 200, r.text
        o = r.json()
        assert o["status"] == "pending"
        assert o["needs_quote"] is True
        assert o["medication_total"] == 0.0
        # persisted (image excluded from list)
        lst = self.s.get(f"{API}/pharmacy/orders").json()
        assert any(x["id"] == o["id"] for x in lst)

    def test_cancel_order(self):
        # create then cancel
        body = {"order_type": "catalog",
                "items": [{"product_id": self.product["id"], "qty": 1}],
                "delivery_lat": 48.86, "delivery_lng": 2.35}
        oid = self.s.post(f"{API}/pharmacy/orders", json=body).json()["id"]
        r = self.s.post(f"{API}/pharmacy/orders/{oid}/cancel")
        assert r.status_code == 200
        assert r.json()["status"] == "cancelled"
        # verify
        g = self.s.get(f"{API}/pharmacy/orders/{oid}").json()
        assert g["status"] == "cancelled"


# ── Admin quote + status + CRUD ───────────────────────────────────
class TestAdmin:
    def test_admin_quote_prescription(self, user_session, admin_session):
        prods = user_session.get(f"{API}/pharmacy/products").json()
        # create rx order as user
        body = {
            "order_type": "prescription",
            "prescription_image": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==",
            "delivery_lat": 48.86, "delivery_lng": 2.35,
        }
        oid = user_session.post(f"{API}/pharmacy/orders", json=body).json()["id"]
        # admin quote
        r = admin_session.post(f"{API}/admin/pharmacy/orders/{oid}/quote",
                               json={"medication_total": 23.50})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["medication_total"] == 23.50
        assert d["status"] == "confirmed"
        # GET verifies
        g = admin_session.get(f"{API}/admin/pharmacy/orders/{oid}").json()
        assert g["status"] == "confirmed"
        assert g["needs_quote"] is False
        # status update
        rs = admin_session.post(f"{API}/admin/pharmacy/orders/{oid}/status",
                                json={"status": "preparing"})
        assert rs.status_code == 200 and rs.json()["status"] == "preparing"

    def test_admin_pharmacy_crud(self, admin_session):
        # create
        p = admin_session.post(f"{API}/admin/pharmacy/pharmacies",
                               json={"name": "TEST_Pharma QA", "city": "Paris",
                                     "lat": 48.85, "lng": 2.35}).json()
        pid = p["id"]
        # update
        u = admin_session.put(f"{API}/admin/pharmacy/pharmacies/{pid}",
                              json={"name": "TEST_Pharma QA2", "city": "Lyon"})
        assert u.status_code == 200
        # list contains
        lst = admin_session.get(f"{API}/admin/pharmacy/pharmacies").json()
        assert any(x["id"] == pid and x["name"] == "TEST_Pharma QA2" for x in lst)
        # delete
        d = admin_session.delete(f"{API}/admin/pharmacy/pharmacies/{pid}")
        assert d.status_code == 200

    def test_admin_product_crud(self, admin_session):
        p = admin_session.post(f"{API}/admin/pharmacy/products",
                               json={"name": "TEST_Doliprane QA", "price": 1.5,
                                     "category": "pain"}).json()
        pid = p["id"]
        u = admin_session.put(f"{API}/admin/pharmacy/products/{pid}",
                              json={"name": "TEST_Doliprane QA2", "price": 2.0,
                                    "category": "pain"})
        assert u.status_code == 200
        d = admin_session.delete(f"{API}/admin/pharmacy/products/{pid}")
        assert d.status_code == 200

    def test_driver_available_endpoint(self, user_session):
        # /pharmacy/driver/available is reachable for any authenticated user
        r = user_session.get(f"{API}/pharmacy/driver/available")
        assert r.status_code == 200
        assert isinstance(r.json(), list)
