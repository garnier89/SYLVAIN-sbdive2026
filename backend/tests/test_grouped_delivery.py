"""
P2.2 — Achats groupés intelligents (smart grouped delivery).

Covers the matching engine directly (async core/grouping.py):
- two compatible grouped orders → batched, savings credited (idempotent),
- a far drop-off → not batched → goes SOLO after the window,
- config update (discount %).
"""
import os
import uuid
import asyncio
import pytest
from pymongo import MongoClient

from core.config import db as motor_db
from core.grouping import (
    try_form_batches, expire_stale_groupables, get_grouping_config,
    update_grouping_config, GROUPING_CFG_ID, optimize_route,
)

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


@pytest.fixture
def world():
    cli = MongoClient(MONGO_URL)
    db = cli[DB_NAME]
    sfx = uuid.uuid4().hex[:8]
    # Two nearby merchants (Paris center, ~0.3 km apart)
    m1, m2 = f"gm1_{sfx}", f"gm2_{sfx}"
    db.merchants.insert_one({"id": m1, "user_id": f"mu1_{sfx}", "store_name": "Boulangerie A", "lat": 48.8566, "lng": 2.3522})
    db.merchants.insert_one({"id": m2, "user_id": f"mu2_{sfx}", "store_name": "Épicerie B", "lat": 48.8580, "lng": 2.3530})
    u1, u2, u3 = f"gu1_{sfx}", f"gu2_{sfx}", f"gu3_{sfx}"
    for u in (u1, u2, u3):
        db.users.insert_one({"id": u, "email": f"{u}@x", "name": u, "role": "user"})
        db.wallets.insert_one({"user_id": u, "balance": 0.0, "currency": "EUR"})

    def mk(oid, uid, mid, dlat, dlng, fee=2.5):
        db.orders.insert_one({
            "id": oid, "user_id": uid, "merchant_id": mid, "driver_id": None,
            "status": "ready", "delivery_speed": "grouped", "groupable": True,
            "group_status": "pending", "batch_id": None, "group_savings": 0.0,
            "delivery_fee": fee, "delivery_address": "Addr",
            "delivery_lat": dlat, "delivery_lng": dlng,
            "items": [], "total": 20.0, "payment_method": "wallet",
            "created_at": "2020-01-01T00:00:00+00:00",  # old → eligible to expire
        })

    # o1 & o2: nearby drop-offs (~0.2 km) → compatible.
    o1, o2 = f"go1_{sfx}", f"go2_{sfx}"
    mk(o1, u1, m1, 48.8606, 2.3376)
    mk(o2, u2, m2, 48.8608, 2.3380)
    # o3: far drop-off (~5 km) → incompatible.
    o3 = f"go3_{sfx}"
    mk(o3, u3, m1, 48.9000, 2.4000)

    yield {"db": db, "m": [m1, m2], "u": [u1, u2, u3], "o": [o1, o2, o3]}

    db.merchants.delete_many({"id": {"$in": [m1, m2]}})
    db.users.delete_many({"id": {"$in": [u1, u2, u3]}})
    db.wallets.delete_many({"user_id": {"$in": [u1, u2, u3]}})
    db.wallet_transactions.delete_many({"user_id": {"$in": [u1, u2, u3]}})
    db.group_savings_ledger.delete_many({"user_id": {"$in": [u1, u2, u3]}})
    db.orders.delete_many({"id": {"$in": [o1, o2, o3]}})
    db.delivery_batches.delete_many({"order_ids": {"$in": [o1, o2, o3]}})
    cli.close()


def test_default_config():
    cfg = _run(get_grouping_config())
    assert cfg["enabled"] is True
    assert cfg["discount_pct"] == 30.0


def test_compatible_orders_batched_and_credited(world):
    db = world["db"]
    o1, o2, o3 = world["o"]
    u1, u2 = world["u"][0], world["u"][1]

    # The background grouping loop may also process these on the shared DB; we
    # assert on the resulting state rather than who formed the batch.
    _run(try_form_batches())
    _run(try_form_batches())

    r1 = db.orders.find_one({"id": o1})
    r2 = db.orders.find_one({"id": o2})
    r3 = db.orders.find_one({"id": o3})
    assert r1["group_status"] == "grouped" and r1["batch_id"]
    assert r2["group_status"] == "grouped" and r2["batch_id"]
    assert r1["batch_id"] == r2["batch_id"]
    # o3 (far) must NOT be in the batch.
    assert r3["group_status"] == "pending" and r3["batch_id"] is None

    # Savings = 30% of 2.5 = 0.75, credited to each wallet.
    assert round(r1["group_savings"], 2) == 0.75
    assert round(db.wallets.find_one({"user_id": u1})["balance"], 2) == 0.75
    assert round(db.wallets.find_one({"user_id": u2})["balance"], 2) == 0.75

    batch = db.delivery_batches.find_one({"id": r1["batch_id"]})
    assert batch and batch["size"] == 2
    assert len(batch["route"]) == 4  # 2 pickups + 2 dropoffs


def test_idempotent_no_double_credit(world):
    db = world["db"]
    u1 = world["u"][0]
    _run(try_form_batches())
    _run(try_form_batches())  # second pass must not re-credit
    assert round(db.wallets.find_one({"user_id": u1})["balance"], 2) == 0.75
    assert db.group_savings_ledger.count_documents({"user_id": u1}) == 1


def test_lonely_order_goes_solo(world):
    db = world["db"]
    o3 = world["o"][2]
    _run(try_form_batches())
    flipped = _run(expire_stale_groupables())
    assert flipped >= 1
    r3 = db.orders.find_one({"id": o3})
    assert r3["group_status"] == "solo"


def test_config_update_clamped():
    cfg = _run(update_grouping_config({"discount_pct": 200, "max_batch_size": 5}))
    assert cfg["discount_pct"] == 90.0  # clamped
    assert cfg["max_batch_size"] == 5
    # restore default
    _run(update_grouping_config({"discount_pct": 30.0, "max_batch_size": 3}))


def test_optimize_route_orders_stops():
    orders = [
        {"id": "a", "merchant_id": "m1", "_merchant": {"store_name": "M1", "lat": 0.0, "lng": 0.0},
         "delivery_address": "A", "delivery_lat": 0.01, "delivery_lng": 0.0},
        {"id": "b", "merchant_id": "m1", "_merchant": {"store_name": "M1", "lat": 0.0, "lng": 0.0},
         "delivery_address": "B", "delivery_lat": 0.02, "delivery_lng": 0.0},
    ]
    route = optimize_route(orders)
    # one unique pickup + two dropoffs
    assert [s["type"] for s in route].count("pickup") == 1
    assert [s["type"] for s in route].count("dropoff") == 2
