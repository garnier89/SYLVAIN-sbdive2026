"""
Pourboire (tip) — real money movement.

The tip must debit the client's SB Pay wallet and credit the FULL amount to the
driver's withdrawable wallet (db.wallets), be idempotent, award no cashback and
have no ceiling. Card tips go through Stripe Checkout (not exercised here — needs
a real Stripe redirect), so this covers the wallet path + validation.
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
def seeded():
    cli = MongoClient(MONGO_URL)
    db = cli[DB_NAME]
    sfx = uuid.uuid4().hex[:8]
    client_id = f"tt_cli_{sfx}"
    driver_uid = f"tt_drvu_{sfx}"
    driver_id = f"tt_drv_{sfx}"
    ride_id = f"tt_ride_{sfx}"
    client_email = f"tipcli_{sfx}@demo.sb"

    db.users.insert_one({"id": client_id, "email": client_email, "name": "Tip Client", "role": "user"})
    db.users.insert_one({"id": driver_uid, "email": f"tipdrv_{sfx}@demo.sb", "name": "Tip Driver", "role": "driver"})
    db.drivers.insert_one({"id": driver_id, "user_id": driver_uid, "earnings": 0, "total_tips": 0})
    db.wallets.insert_one({"user_id": client_id, "balance": 100.0, "currency": "EUR"})
    db.wallets.insert_one({"user_id": driver_uid, "balance": 0.0, "currency": "EUR"})
    db.rides.insert_one({
        "id": ride_id, "user_id": client_id, "driver_id": driver_id,
        "status": "completed", "payment_method": "card", "final_fare": 20.0,
    })

    token = create_access_token(client_id, client_email, "user")
    yield {"client_id": client_id, "driver_uid": driver_uid, "driver_id": driver_id,
           "ride_id": ride_id, "token": token, "db": db}

    # cleanup
    db.users.delete_many({"id": {"$in": [client_id, driver_uid]}})
    db.drivers.delete_many({"id": driver_id})
    db.wallets.delete_many({"user_id": {"$in": [client_id, driver_uid]}})
    db.rides.delete_many({"id": ride_id})
    db.wallet_transactions.delete_many({"user_id": {"$in": [client_id, driver_uid]}})
    db.cashback_ledger.delete_many({"user_id": {"$in": [client_id, driver_uid]}})
    cli.close()


def _h(token):
    return {"Authorization": f"Bearer {token}"}


def test_wallet_tip_moves_real_money_and_is_idempotent(seeded):
    db = seeded["db"]
    h = _h(seeded["token"])

    r = requests.post(f"{API}/api/phase2/rides/{seeded['ride_id']}/tip",
                      headers=h, json={"amount": 5, "method": "wallet"}, timeout=20)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["status"] == "paid" and d["amount"] == 5 and d["method"] == "wallet"

    # Client debited, driver credited the FULL amount.
    assert round(db.wallets.find_one({"user_id": seeded["client_id"]})["balance"], 2) == 95.0
    assert round(db.wallets.find_one({"user_id": seeded["driver_uid"]})["balance"], 2) == 5.0

    # Ride marked paid + driver stats bumped.
    ride = db.rides.find_one({"id": seeded["ride_id"]})
    assert ride["tip_status"] == "paid" and ride["tip_amount"] == 5
    drv = db.drivers.find_one({"id": seeded["driver_id"]})
    assert round(drv["total_tips"], 2) == 5.0 and round(drv["earnings"], 2) == 5.0

    # NO cashback on tips.
    assert db.cashback_ledger.count_documents({"user_id": seeded["client_id"]}) == 0

    # Idempotent: second tip on the same ride is rejected.
    r2 = requests.post(f"{API}/api/phase2/rides/{seeded['ride_id']}/tip",
                       headers=h, json={"amount": 3, "method": "wallet"}, timeout=20)
    assert r2.status_code == 400
    assert round(db.wallets.find_one({"user_id": seeded["client_id"]})["balance"], 2) == 95.0


def test_wallet_tip_insufficient_balance(seeded):
    db = seeded["db"]
    db.wallets.update_one({"user_id": seeded["client_id"]}, {"$set": {"balance": 1.0}})
    r = requests.post(f"{API}/api/phase2/rides/{seeded['ride_id']}/tip",
                      headers=_h(seeded["token"]), json={"amount": 5, "method": "wallet"}, timeout=20)
    assert r.status_code == 400
    # Nothing moved.
    assert round(db.wallets.find_one({"user_id": seeded["driver_uid"]})["balance"], 2) == 0.0
    assert db.rides.find_one({"id": seeded["ride_id"]}).get("tip_status") != "paid"


def test_card_tip_returns_stripe_session(seeded):
    r = requests.post(f"{API}/api/phase2/rides/{seeded['ride_id']}/tip",
                      headers=_h(seeded["token"]),
                      json={"amount": 5, "method": "card", "origin_url": "https://example.com"}, timeout=30)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["method"] == "card" and d["status"] == "pending"
    assert d.get("url", "").startswith("http") and d.get("session_id")
    # Driver not yet credited (awaits payment confirmation).
    assert round(seeded["db"].wallets.find_one({"user_id": seeded["driver_uid"]})["balance"], 2) == 0.0


def test_card_tip_below_minimum_rejected(seeded):
    r = requests.post(f"{API}/api/phase2/rides/{seeded['ride_id']}/tip",
                      headers=_h(seeded["token"]),
                      json={"amount": 0.5, "method": "card", "origin_url": "https://example.com"}, timeout=20)
    assert r.status_code == 400
