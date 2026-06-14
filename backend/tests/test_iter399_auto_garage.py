"""iter399 — Auto Parts garage + brand filter regression."""
import os
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://gojek-clone-41.preview.emergentagent.com').rstrip('/')
CREDS = {"email": "famtester@demo.sb", "password": "FamTest123!"}


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json=CREDS, timeout=30)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text[:200]}"
    return s


def test_brands_endpoint():
    r = requests.get(f"{BASE_URL}/api/auto-parts/brands", timeout=30)
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data.get("brands"), list)
    assert "Renault" in data["brands"]


def test_products_unfiltered_count():
    r = requests.get(f"{BASE_URL}/api/auto-parts/products", timeout=30)
    assert r.status_code == 200
    products = r.json()
    assert len(products) >= 26  # 26 seed products


def test_products_brand_filter_returns_brand_plus_universel():
    r = requests.get(f"{BASE_URL}/api/auto-parts/products?brand=Renault", timeout=30)
    assert r.status_code == 200
    products = r.json()
    assert len(products) > 0
    # Each product must be compatible with Renault or Universel
    for p in products:
        compat = p.get("compat", [])
        assert "Renault" in compat or "Universel" in compat, f"Bad compat {compat} for {p['name']}"


def test_products_brand_filter_yamaha():
    r = requests.get(f"{BASE_URL}/api/auto-parts/products?brand=Yamaha", timeout=30)
    assert r.status_code == 200
    products = r.json()
    assert len(products) > 0
    for p in products:
        compat = p.get("compat", [])
        assert "Yamaha" in compat or "Universel" in compat


def test_garage_list_requires_auth():
    r = requests.get(f"{BASE_URL}/api/auto-parts/garage", timeout=30)
    assert r.status_code in (401, 403)


def test_garage_crud_flow(client):
    # List initial
    r = client.get(f"{BASE_URL}/api/auto-parts/garage", timeout=30)
    assert r.status_code == 200
    initial = r.json()
    assert isinstance(initial, list)

    # Add a vehicle
    payload = {"brand": "Peugeot", "model": "TEST_208", "year": "2020", "vehicle_type": "auto"}
    r = client.post(f"{BASE_URL}/api/auto-parts/garage", json=payload, timeout=30)
    assert r.status_code == 200, r.text
    veh = r.json()
    assert veh["brand"] == "Peugeot"
    assert veh["model"] == "TEST_208"
    assert "id" in veh
    vid = veh["id"]

    # Verify persistence via GET
    r = client.get(f"{BASE_URL}/api/auto-parts/garage", timeout=30)
    assert r.status_code == 200
    listed = r.json()
    assert any(v["id"] == vid for v in listed)

    # Add without brand -> 400
    r = client.post(f"{BASE_URL}/api/auto-parts/garage", json={"brand": ""}, timeout=30)
    assert r.status_code == 400

    # Delete
    r = client.delete(f"{BASE_URL}/api/auto-parts/garage/{vid}", timeout=30)
    assert r.status_code == 200

    # Verify removed
    r = client.get(f"{BASE_URL}/api/auto-parts/garage", timeout=30)
    assert all(v["id"] != vid for v in r.json())

    # Delete non-existent -> 404
    r = client.delete(f"{BASE_URL}/api/auto-parts/garage/veh_doesnotexist", timeout=30)
    assert r.status_code == 404


def test_order_flow_with_sbpay(client):
    # Pick a cheap universel product
    r = requests.get(f"{BASE_URL}/api/auto-parts/products?q=Bougies", timeout=30)
    assert r.status_code == 200
    products = r.json()
    assert len(products) > 0
    prod = products[0]
    payload = {
        "items": [{"product_id": prod["id"], "qty": 1}],
        "fulfillment": "delivery",
        "address": "TEST_1 rue de la paix",
        "payment_method": "sbpay",
    }
    r = client.post(f"{BASE_URL}/api/auto-parts/orders", json=payload, timeout=30)
    # Either success or insufficient balance (acceptable)
    assert r.status_code in (200, 400), r.text
    if r.status_code == 200:
        order = r.json()
        assert order["status"] == "confirmed"
        assert order["payment_status"] == "paid"
        # Verify listed
        r2 = client.get(f"{BASE_URL}/api/auto-parts/orders", timeout=30)
        assert r2.status_code == 200
        assert any(o["id"] == order["id"] for o in r2.json())
