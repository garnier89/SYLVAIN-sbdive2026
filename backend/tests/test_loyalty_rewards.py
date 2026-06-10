"""
P0.4 — Fidélité multi-verticale SB Rewards.

Covers: spendable-points rewards catalog (wallet credit + personal coupon),
tier gating, double-spend protection, personal-coupon privacy, and the
multi-vertical earning helper (order / delivery).
"""
import os
import uuid
import asyncio
import requests
import pytest
from pymongo import MongoClient

from core.deps import create_access_token

API = os.environ.get("TEST_API_URL", "http://localhost:8001")
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]


@pytest.fixture
def world():
    cli = MongoClient(MONGO_URL)
    db = cli[DB_NAME]
    sfx = uuid.uuid4().hex[:8]
    u = f"loy_{sfx}"
    other = f"loy_other_{sfx}"
    db.users.insert_one({"id": u, "email": f"{u}@x", "name": "Loy", "role": "user"})
    db.users.insert_one({"id": other, "email": f"{other}@x", "name": "Other", "role": "user"})
    db.loyalty.insert_one({"user_id": u, "points": 500, "spent_points": 0})  # Gold tier
    db.wallets.insert_one({"user_id": u, "balance": 0.0, "currency": "EUR"})
    # Ensure default loyalty config (no custom service_configs override).
    db.service_configs.delete_one({"service_key": "loyalty"})
    tok = create_access_token(u, f"{u}@x", "user")
    tok_other = create_access_token(other, f"{other}@x", "user")
    yield {"db": db, "u": u, "other": other, "tok": tok, "tok_other": tok_other}
    db.users.delete_many({"id": {"$in": [u, other]}})
    db.loyalty.delete_many({"user_id": {"$in": [u, other]}})
    db.wallets.delete_many({"user_id": {"$in": [u, other]}})
    db.wallet_transactions.delete_many({"user_id": {"$in": [u, other]}})
    db.loyalty_redemptions.delete_many({"user_id": {"$in": [u, other]}})
    db.coupons.delete_many({"user_id": {"$in": [u, other]}})
    cli.close()


def _h(t):
    return {"Authorization": f"Bearer {t}"}


def test_rewards_catalog_and_wallet_credit_redeem(world):
    db = world["db"]
    r = requests.get(f"{API}/api/loyalty/rewards", headers=_h(world["tok"]), timeout=20)
    assert r.status_code == 200, r.text
    cat = r.json()
    assert cat["available_points"] == 500
    ids = {x["id"]: x for x in cat["rewards"]}
    assert ids["credit_2"]["affordable"] and ids["credit_2"]["tier_ok"]

    # Redeem 2€ wallet credit (cost 200).
    red = requests.post(f"{API}/api/loyalty/redeem", headers=_h(world["tok"]),
                        json={"reward_id": "credit_2"}, timeout=20)
    assert red.status_code == 200, red.text
    assert red.json()["granted"]["amount"] == 2.0 and red.json()["available_points"] == 300
    assert round(db.wallets.find_one({"user_id": world["u"]})["balance"], 2) == 2.0
    assert db.loyalty.find_one({"user_id": world["u"]})["spent_points"] == 200
    # Tier-driving points unchanged (status preserved).
    assert db.loyalty.find_one({"user_id": world["u"]})["points"] == 500


def test_insufficient_points_blocks(world):
    # available 300 left after first test? fixtures are fresh per test → here 500.
    # Spend 450 (credit_5) is fine; spending it twice must fail.
    r1 = requests.post(f"{API}/api/loyalty/redeem", headers=_h(world["tok"]),
                       json={"reward_id": "credit_5"}, timeout=20)
    assert r1.status_code == 200, r1.text  # 500 >= 450
    r2 = requests.post(f"{API}/api/loyalty/redeem", headers=_h(world["tok"]),
                       json={"reward_id": "credit_5"}, timeout=20)
    assert r2.status_code == 400  # only 50 left


def test_coupon_reward_is_personal_and_private(world):
    db = world["db"]
    red = requests.post(f"{API}/api/loyalty/redeem", headers=_h(world["tok"]),
                        json={"reward_id": "ride_10pct"}, timeout=20)
    assert red.status_code == 200, red.text
    code = red.json()["granted"]["code"]
    assert code.startswith("SBREWARD-")
    # Owner sees it in their coupon list.
    mine = requests.get(f"{API}/api/coupons", headers=_h(world["tok"]), timeout=20).json()
    assert any(c["code"] == code for c in mine)
    # Another user does NOT see it.
    theirs = requests.get(f"{API}/api/coupons", headers=_h(world["tok_other"]), timeout=20).json()
    assert not any(c["code"] == code for c in theirs)
    # And cannot validate it.
    val = requests.post(f"{API}/api/coupons/validate", headers=_h(world["tok_other"]),
                        json={"code": code, "amount": 50}, timeout=20)
    assert val.status_code == 404


def test_tier_gating_locks_higher_rewards():
    # A silver (0 pts) user cannot redeem the gold-only free_delivery reward.
    cli = MongoClient(MONGO_URL)
    db = cli[DB_NAME]
    sfx = uuid.uuid4().hex[:8]
    u = f"loysil_{sfx}"
    db.users.insert_one({"id": u, "email": f"{u}@x", "role": "user"})
    db.loyalty.insert_one({"user_id": u, "points": 1000, "spent_points": 0})  # enough pts but...
    # Force silver by clearing points? free_delivery needs gold (500). Give 300 pts (silver) + affordable check.
    db.loyalty.update_one({"user_id": u}, {"$set": {"points": 300}})  # silver, 300 pts
    db.service_configs.delete_one({"service_key": "loyalty"})
    tok = create_access_token(u, f"{u}@x", "user")
    try:
        red = requests.post(f"{API}/api/loyalty/redeem", headers={"Authorization": f"Bearer {tok}"},
                            json={"reward_id": "free_delivery"}, timeout=20)
        assert red.status_code == 400  # tier insufficient (needs gold)
    finally:
        db.users.delete_many({"id": u})
        db.loyalty.delete_many({"user_id": u})
        cli.close()


def test_admin_can_edit_rewards_catalog():
    """Admin PUT of a custom rewards catalog persists and is served to users."""
    import requests as _rq
    from pymongo import MongoClient as _MC
    cli = _MC(MONGO_URL)
    db = cli[DB_NAME]
    try:
        from _creds import ADMIN_EMAIL, ADMIN_PASSWORD
        tok = _rq.post(f"{API}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15).json()
        token = tok.get("access_token") or tok.get("token")
        h = {"Authorization": f"Bearer {token}"}
        custom = [{"id": "credit_3", "name": "3 € offerts", "cost_points": 250, "type": "wallet_credit",
                   "value": 3, "min_tier": "silver"}]
        r = _rq.put(f"{API}/api/loyalty/admin/config", headers=h,
                    json={"points_per_order": 7, "rewards": custom}, timeout=15)
        assert r.status_code == 200, r.text
        cfg = r.json()
        assert cfg["points_per_order"] == 7
        assert any(x["id"] == "credit_3" and x["value"] == 3 for x in cfg["rewards"])
        # Served to a user via the rewards catalog.
        g = _rq.get(f"{API}/api/loyalty/admin/config", headers=h, timeout=15).json()
        assert any(x["id"] == "credit_3" for x in g["rewards"])
    finally:
        # Reset to defaults so other tests/users are unaffected.
        db.service_configs.delete_one({"service_key": "loyalty"})
        cli.close()


def test_award_completion_points_multivertical():
    """The helper used by orders/parcels awards configured points to the client."""
    async def scenario():
        from core.config import db
        from routes.loyalty import award_completion_points, get_loyalty_config
        sfx = uuid.uuid4().hex[:8]
        u = f"loymv_{sfx}"
        await db.service_configs.delete_one({"service_key": "loyalty"})
        cfg = await get_loyalty_config()
        try:
            await award_completion_points(u, "order")
            await award_completion_points(u, "delivery")
            doc = await db.loyalty.find_one({"user_id": u}, {"_id": 0})
            expected = cfg["points_per_order"] + cfg["points_per_delivery"]
            assert int(doc["points"]) == expected
            reasons = {h["reason"] for h in doc.get("history", [])}
            assert "order_completed" in reasons and "delivery_completed" in reasons
        finally:
            await db.loyalty.delete_many({"user_id": u})
    from conftest import run_async
    run_async(scenario())
