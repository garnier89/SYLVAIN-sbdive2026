"""
Phase D — Paiement « sans contact » (QR / code 6 chiffres).

Payee (driver/merchant) generates a request; payer (client) pays via SB Pay or
card. Platform takes a commission; the net is credited to the payee's
withdrawable wallet and the payer earns cashback. Idempotent.
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
def world():
    cli = MongoClient(MONGO_URL)
    db = cli[DB_NAME]
    sfx = uuid.uuid4().hex[:8]
    payer_id = f"cl_payer_{sfx}"
    drv_uid = f"cl_drvu_{sfx}"
    drv_id = f"cl_drv_{sfx}"
    merch_id = f"cl_merch_{sfx}"

    db.users.insert_one({"id": payer_id, "email": f"clpayer_{sfx}@demo.sb", "name": "Payer", "role": "user"})
    db.users.insert_one({"id": drv_uid, "email": f"cldrv_{sfx}@demo.sb", "name": "Driver Payee", "role": "driver"})
    db.users.insert_one({"id": merch_id, "email": f"clmerch_{sfx}@demo.sb", "name": "Merchant Payee", "role": "merchant"})
    db.drivers.insert_one({"id": drv_id, "user_id": drv_uid, "earnings": 0})
    db.wallets.insert_one({"user_id": payer_id, "balance": 100.0, "currency": "EUR"})
    db.wallets.insert_one({"user_id": drv_uid, "balance": 0.0, "currency": "EUR"})
    db.wallets.insert_one({"user_id": merch_id, "balance": 0.0, "currency": "EUR"})
    # Ensure default commission 10%.
    db.contactless_config.update_one({"id": "contactless"},
                                     {"$set": {"id": "contactless", "enabled": True, "commission_percent": 10.0,
                                               "expiry_minutes": 15, "max_amount": 2000.0, "min_card": 1.0}},
                                     upsert=True)

    tokens = {
        "payer": create_access_token(payer_id, "p@x", "user"),
        "driver": create_access_token(drv_uid, "d@x", "driver"),
        "merchant": create_access_token(merch_id, "m@x", "merchant"),
    }
    ids = {"payer_id": payer_id, "drv_uid": drv_uid, "drv_id": drv_id, "merch_id": merch_id}
    yield {"db": db, "tokens": tokens, **ids}

    db.users.delete_many({"id": {"$in": [payer_id, drv_uid, merch_id]}})
    db.drivers.delete_many({"id": drv_id})
    db.wallets.delete_many({"user_id": {"$in": [payer_id, drv_uid, merch_id]}})
    db.wallet_transactions.delete_many({"user_id": {"$in": [payer_id, drv_uid, merch_id]}})
    db.cashback_ledger.delete_many({"user_id": {"$in": [payer_id, drv_uid, merch_id]}})
    db.contactless_payments.delete_many({"payee_id": {"$in": [drv_uid, merch_id]}})
    cli.close()


def _h(t):
    return {"Authorization": f"Bearer {t}"}


def test_driver_creates_and_client_pays_wallet(world):
    db = world["db"]
    # Driver creates a 20 € request.
    r = requests.post(f"{API}/api/contactless/requests", headers=_h(world["tokens"]["driver"]),
                      json={"amount": 20}, timeout=20)
    assert r.status_code == 200, r.text
    req = r.json()
    assert req["status"] == "pending" and len(req["code"]) == 6 and req["amount"] == 20

    # Client resolves the code.
    look = requests.get(f"{API}/api/contactless/lookup", headers=_h(world["tokens"]["payer"]),
                        params={"code": req["code"]}, timeout=20)
    assert look.status_code == 200 and look.json()["id"] == req["id"]

    # Client pays via SB Pay.
    pay = requests.post(f"{API}/api/contactless/requests/{req['id']}/pay",
                        headers=_h(world["tokens"]["payer"]), json={"method": "wallet"}, timeout=20)
    assert pay.status_code == 200, pay.text
    d = pay.json()
    assert d["status"] == "paid" and d["commission"] == 2.0 and d["net"] == 18.0

    # Payer debited gross (20) then +cashback (2% of 20 = 0.40).
    assert round(db.wallets.find_one({"user_id": world["payer_id"]})["balance"], 2) == 80.40
    # Payee credited NET 18.
    assert round(db.wallets.find_one({"user_id": world["drv_uid"]})["balance"], 2) == 18.0
    assert round(db.drivers.find_one({"id": world["drv_id"]})["earnings"], 2) == 18.0
    # Cashback recorded for payer.
    assert db.cashback_ledger.count_documents({"user_id": world["payer_id"], "service": "contactless"}) == 1

    # Idempotent: second pay rejected, balances unchanged.
    pay2 = requests.post(f"{API}/api/contactless/requests/{req['id']}/pay",
                         headers=_h(world["tokens"]["payer"]), json={"method": "wallet"}, timeout=20)
    assert pay2.status_code == 400
    assert round(db.wallets.find_one({"user_id": world["payer_id"]})["balance"], 2) == 80.40


def test_merchant_payee_allowed(world):
    r = requests.post(f"{API}/api/contactless/requests", headers=_h(world["tokens"]["merchant"]),
                      json={"amount": 30}, timeout=20)
    assert r.status_code == 200, r.text
    req = r.json()
    pay = requests.post(f"{API}/api/contactless/requests/{req['id']}/pay",
                        headers=_h(world["tokens"]["payer"]), json={"method": "wallet"}, timeout=20)
    assert pay.status_code == 200, pay.text
    assert round(world["db"].wallets.find_one({"user_id": world["merch_id"]})["balance"], 2) == 27.0  # 30 - 10%


def test_client_cannot_create_request(world):
    r = requests.post(f"{API}/api/contactless/requests", headers=_h(world["tokens"]["payer"]),
                      json={"amount": 10}, timeout=20)
    assert r.status_code == 403


def test_cannot_pay_own_request(world):
    r = requests.post(f"{API}/api/contactless/requests", headers=_h(world["tokens"]["driver"]),
                      json={"amount": 10}, timeout=20)
    req = r.json()
    pay = requests.post(f"{API}/api/contactless/requests/{req['id']}/pay",
                        headers=_h(world["tokens"]["driver"]), json={"method": "wallet"}, timeout=20)
    assert pay.status_code == 400


def test_insufficient_balance_blocks(world):
    db = world["db"]
    db.wallets.update_one({"user_id": world["payer_id"]}, {"$set": {"balance": 1.0}})
    r = requests.post(f"{API}/api/contactless/requests", headers=_h(world["tokens"]["driver"]),
                      json={"amount": 50}, timeout=20)
    req = r.json()
    pay = requests.post(f"{API}/api/contactless/requests/{req['id']}/pay",
                        headers=_h(world["tokens"]["payer"]), json={"method": "wallet"}, timeout=20)
    assert pay.status_code == 400
    assert round(db.wallets.find_one({"user_id": world["drv_uid"]})["balance"], 2) == 0.0


def test_card_payment_returns_stripe_session(world):
    r = requests.post(f"{API}/api/contactless/requests", headers=_h(world["tokens"]["driver"]),
                      json={"amount": 25}, timeout=20)
    req = r.json()
    pay = requests.post(f"{API}/api/contactless/requests/{req['id']}/pay",
                        headers=_h(world["tokens"]["payer"]),
                        json={"method": "card", "origin_url": "https://example.com"}, timeout=30)
    assert pay.status_code == 200, pay.text
    d = pay.json()
    assert d["method"] == "card" and d.get("url", "").startswith("http") and d.get("session_id")
    # Payee not credited until confirmation.
    assert round(world["db"].wallets.find_one({"user_id": world["drv_uid"]})["balance"], 2) == 0.0


def test_admin_config_roundtrip():
    from _creds import ADMIN_EMAIL, ADMIN_PASSWORD
    tok = requests.post(f"{API}/api/auth/login",
                        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15).json()
    token = tok.get("access_token") or tok.get("token")
    h = {"Authorization": f"Bearer {token}"}
    upd = requests.put(f"{API}/api/contactless/admin/config", headers=h,
                       json={"commission_percent": 12, "expiry_minutes": 20}, timeout=15)
    assert upd.status_code == 200, upd.text
    assert upd.json()["commission_percent"] == 12 and upd.json()["expiry_minutes"] == 20
    # restore default
    requests.put(f"{API}/api/contactless/admin/config", headers=h,
                 json={"commission_percent": 10, "expiry_minutes": 15}, timeout=15)
