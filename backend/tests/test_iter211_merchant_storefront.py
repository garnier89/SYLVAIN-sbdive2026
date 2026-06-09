"""P0.1 — Vitrine digitale marchand complète.

Covers: structured hours, storefront category, phone, product stock,
mini-stats, and review eligibility (only customers who ordered).
"""
import os
import uuid
import requests

API = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001").rstrip("/")
MERCHANT = {"email": "merchant@example.com", "password": "Merchant123!"}


def _merchant_session():
    s = requests.Session()
    r = s.post(f"{API}/api/auth/login", json=MERCHANT, timeout=30)
    assert r.status_code == 200, r.text
    return s


def test_categories_public():
    r = requests.get(f"{API}/api/merchants/meta/categories", timeout=30)
    assert r.status_code == 200
    cats = r.json()["categories"]
    assert "Boulangeries" in cats and "Pharmacies" in cats


def test_update_structured_storefront_fields():
    s = _merchant_session()
    payload = {
        "phone": "+596696112233",
        "storefront_category": "Boulangeries",
        "hours": {
            "mon": {"closed": False, "slots": [["08:00", "13:00"], ["15:00", "19:00"]]},
            "sun": {"closed": True, "slots": []},
        },
    }
    r = s.put(f"{API}/api/merchants/me", json=payload, timeout=30)
    assert r.status_code == 200, r.text
    m = r.json()
    assert m["phone"] == "+596696112233"
    assert m["storefront_category"] == "Boulangeries"
    assert m["hours"]["mon"]["slots"] == [["08:00", "13:00"], ["15:00", "19:00"]]
    assert m["hours"]["sun"]["closed"] is True
    # is_open is computed from structured hours
    assert "is_open" in m


def test_product_stock_lifecycle():
    s = _merchant_session()
    mid = s.get(f"{API}/api/merchants/me", timeout=30).json()["id"]
    r = s.post(f"{API}/api/merchants/products", json={
        "name": f"Test Stock {uuid.uuid4().hex[:5]}", "description": "x",
        "price": 1.5, "category": "Boulangerie", "stock": 0,
    }, timeout=30)
    assert r.status_code == 200, r.text
    pid = r.json()["id"]
    assert r.json()["stock"] == 0
    # public catalog exposes stock
    prods = requests.get(f"{API}/api/merchants/{mid}/products", timeout=30).json()
    found = [p for p in prods if p["id"] == pid]
    assert found and found[0]["stock"] == 0
    # cleanup
    s.delete(f"{API}/api/merchants/products/{pid}", timeout=30)


def test_stats_shape():
    s = _merchant_session()
    r = s.get(f"{API}/api/merchants/me/stats", timeout=30)
    assert r.status_code == 200, r.text
    d = r.json()
    for k in ("total_orders", "revenue", "rating", "review_count", "products_total", "top_products"):
        assert k in d


def test_review_requires_order():
    s = _merchant_session()
    mid = s.get(f"{API}/api/merchants/me", timeout=30).json()["id"]
    # fresh user with no order -> 403
    buyer = requests.Session()
    email = f"reviewtest_{uuid.uuid4().hex[:8]}@demo.sb"
    buyer.post(f"{API}/api/auth/register", json={"email": email, "password": "Buyer2026!", "name": "RT"}, timeout=30)
    r = buyer.post(f"{API}/api/merchants/{mid}/reviews", json={"rating": 5, "comment": "no order"}, timeout=30)
    assert r.status_code == 403
