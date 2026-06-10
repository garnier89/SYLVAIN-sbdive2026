"""
App marchand — gestion de stock (feature 'c') + ordre temps réel (feature 'a').

Couvre l'endpoint d'ajustement rapide de stock (set / delta, plancher 0,
flags low/out) et le flag merchant_managed qui désactive l'auto-progress demo.
"""
import os
import uuid
import requests
import pytest
from pymongo import MongoClient

from core.deps import create_access_token

API = os.environ.get("TEST_API_URL", "http://localhost:8001")
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]


@pytest.fixture
def shop():
    cli = MongoClient(MONGO_URL)
    db = cli[DB_NAME]
    sfx = uuid.uuid4().hex[:8]
    uid = f"msu_{sfx}"
    mid = f"ms_{sfx}"
    db.users.insert_one({"id": uid, "email": f"{uid}@x", "name": "Shop", "role": "merchant"})
    db.merchants.insert_one({"id": mid, "user_id": uid, "store_name": "Stock Shop", "lat": 48.8, "lng": 2.3})
    pid = f"msp_{sfx}"
    db.products.insert_one({"id": pid, "merchant_id": mid, "name": "Item", "price": 5.0,
                            "category": "Plats", "is_available": True, "stock": 20, "low_stock_threshold": 5})
    tok = create_access_token(uid, f"{uid}@x", "merchant")
    yield {"db": db, "uid": uid, "mid": mid, "pid": pid, "tok": tok}
    db.users.delete_one({"id": uid})
    db.merchants.delete_one({"id": mid})
    db.products.delete_many({"merchant_id": mid})
    db.orders.delete_many({"merchant_id": mid})
    cli.close()


def _h(tok):
    return {"Authorization": f"Bearer {tok}"}


def test_set_stock_absolute(shop):
    r = requests.post(f"{API}/api/merchants/products/{shop['pid']}/stock",
                      json={"stock": 8}, headers=_h(shop["tok"]))
    assert r.status_code == 200
    d = r.json()
    assert d["stock"] == 8 and d["out_of_stock"] is False and d["low_stock"] is False


def test_delta_into_low_then_out(shop):
    requests.post(f"{API}/api/merchants/products/{shop['pid']}/stock", json={"stock": 6}, headers=_h(shop["tok"]))
    d = requests.post(f"{API}/api/merchants/products/{shop['pid']}/stock", json={"delta": -3}, headers=_h(shop["tok"])).json()
    assert d["stock"] == 3 and d["low_stock"] is True and d["out_of_stock"] is False
    d2 = requests.post(f"{API}/api/merchants/products/{shop['pid']}/stock", json={"delta": -10}, headers=_h(shop["tok"])).json()
    assert d2["stock"] == 0 and d2["out_of_stock"] is True  # floored at 0


def test_stock_requires_param(shop):
    r = requests.post(f"{API}/api/merchants/products/{shop['pid']}/stock", json={}, headers=_h(shop["tok"]))
    assert r.status_code == 400


def test_other_merchant_cannot_adjust(shop):
    other = create_access_token("intruder_x", "intruder@x", "merchant")
    r = requests.post(f"{API}/api/merchants/products/{shop['pid']}/stock", json={"delta": -1}, headers=_h(other))
    assert r.status_code in (401, 403, 404)


def test_create_product_with_threshold(shop):
    payload = {"name": "Croissant", "description": "beurre", "price": 1.2, "category": "Boulangerie",
               "is_available": True, "stock": 4, "low_stock_threshold": 6}
    r = requests.post(f"{API}/api/merchants/products", json=payload, headers=_h(shop["tok"]))
    assert r.status_code == 200
    assert r.json().get("low_stock_threshold") == 6


def test_merchant_status_sets_managed_flag(shop):
    db = shop["db"]
    oid = f"mso_{uuid.uuid4().hex[:8]}"
    db.orders.insert_one({"id": oid, "merchant_id": shop["mid"], "user_id": "client_x",
                          "status": "pending", "total": 12.0, "items": [], "payment_method": "cash",
                          "created_at": "2026-01-01T00:00:00+00:00"})
    r = requests.post(f"{API}/api/orders/{oid}/status", json={"status": "accepted"}, headers=_h(shop["tok"]))
    assert r.status_code == 200
    o = db.orders.find_one({"id": oid})
    assert o["status"] == "accepted" and o.get("merchant_managed") is True
