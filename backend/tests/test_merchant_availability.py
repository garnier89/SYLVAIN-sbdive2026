"""
App marchand — mode pause / occupé (busy mode) + auto-reprise.

Couvre l'endpoint /merchants/me/availability, le blocage de commande quand le
commerce est en pause (409), la reprise, et l'auto-reprise quand pause_until
est dépassé (helper _is_paused).
"""
import os
import uuid
from datetime import datetime, timezone, timedelta
import requests
import pytest
from pymongo import MongoClient

from core.deps import create_access_token
from routes.merchants import _is_paused

API = os.environ.get("TEST_API_URL", "http://localhost:8001")
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]


@pytest.fixture
def shop():
    cli = MongoClient(MONGO_URL)
    db = cli[DB_NAME]
    sfx = uuid.uuid4().hex[:8]
    uid, mid, pid = f"avu_{sfx}", f"av_{sfx}", f"avp_{sfx}"
    db.users.insert_one({"id": uid, "email": f"{uid}@x", "name": "Shop", "role": "merchant"})
    db.merchants.insert_one({"id": mid, "user_id": uid, "store_name": "Pause Shop", "lat": 48.8, "lng": 2.3, "is_active": True})
    db.products.insert_one({"id": pid, "merchant_id": mid, "name": "Item", "price": 5.0, "category": "Plats", "is_available": True})
    tok = create_access_token(uid, f"{uid}@x", "merchant")
    yield {"db": db, "uid": uid, "mid": mid, "pid": pid, "tok": tok}
    db.users.delete_one({"id": uid})
    db.merchants.delete_one({"id": mid})
    db.products.delete_many({"merchant_id": mid})
    db.orders.delete_many({"merchant_id": mid})
    cli.close()


def _h(tok):
    return {"Authorization": f"Bearer {tok}"}


def _order_payload(mid, pid):
    return {"merchant_id": mid, "items": [{"product_id": pid, "quantity": 1}],
            "delivery_address": "x", "delivery_lat": 48.8, "delivery_lng": 2.3,
            "order_type": "food", "payment_method": "cash"}


def test_pause_blocks_orders_then_resume(shop):
    # Pause for 30 min.
    r = requests.post(f"{API}/api/merchants/me/availability", json={"accepting_orders": False, "pause_minutes": 30}, headers=_h(shop["tok"]))
    assert r.status_code == 200
    body = r.json()
    assert body["accepting_orders"] is False and body["pause_until"]

    # Order is rejected with 409.
    ro = requests.post(f"{API}/api/orders", json=_order_payload(shop["mid"], shop["pid"]), headers=_h(shop["tok"]))
    assert ro.status_code == 409

    # Resume.
    r2 = requests.post(f"{API}/api/merchants/me/availability", json={"accepting_orders": True}, headers=_h(shop["tok"]))
    assert r2.status_code == 200 and r2.json()["accepting_orders"] is True
    assert r2.json()["pause_until"] is None
    # Now an order is accepted again.
    ro2 = requests.post(f"{API}/api/orders", json=_order_payload(shop["mid"], shop["pid"]), headers=_h(shop["tok"]))
    assert ro2.status_code == 200


def test_is_paused_helper():
    now = datetime.now(timezone.utc)
    assert _is_paused({"accepting_orders": True}) is False
    assert _is_paused({"accepting_orders": False, "pause_until": None}) is True
    future = (now + timedelta(minutes=10)).isoformat()
    assert _is_paused({"accepting_orders": False, "pause_until": future}) is True
    past = (now - timedelta(minutes=10)).isoformat()
    # Pause window elapsed → auto-resume (not paused).
    assert _is_paused({"accepting_orders": False, "pause_until": past}) is False


def test_pause_reflected_in_is_open(shop):
    requests.post(f"{API}/api/merchants/me/availability", json={"accepting_orders": False}, headers=_h(shop["tok"]))
    m = requests.get(f"{API}/api/merchants/{shop['mid']}").json()
    assert m["accepting_orders"] is False
    assert m["is_open"] is False  # pause forces closed
