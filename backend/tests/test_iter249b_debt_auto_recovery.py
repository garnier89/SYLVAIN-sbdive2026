"""Iteration 249b — Auto-recovery of outstanding debt on wallet top-up.

When the passenger tops up the wallet, any outstanding ride/cancellation debt is
recovered FIRST (oldest first, partial allowed) before the balance can be spent.
"""
import os
import uuid
import requests
from datetime import datetime, timezone
from pymongo import MongoClient

from _creds import ADMIN_EMAIL, ADMIN_PASSWORD, TEST_USER_EMAIL, TEST_USER_PASSWORD

API = os.environ.get("TEST_API_URL", os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001"))
db = MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]


def _login(email, pw):
    s = requests.Session()
    r = s.post(f"{API}/api/auth/login", json={"email": email, "password": pw})
    assert r.status_code == 200, r.text
    return s, r.json()["user"]["id"]


def test_topup_auto_recovers_debt():
    s, uid = _login(TEST_USER_EMAIL, TEST_USER_PASSWORD)
    before = db.wallets.find_one({"user_id": uid}, {"_id": 0, "balance": 1})
    db.wallets.update_one({"user_id": uid}, {"$set": {"balance": 0.0, "currency": "EUR"}}, upsert=True)
    debt_id = f"debt_test_{uuid.uuid4().hex[:8]}"
    db.cancellation_debts.insert_one({
        "id": debt_id, "user_id": uid, "ride_id": None, "amount": 6.0,
        "reason": "ride_balance", "paid": False, "owed_to_driver_id": None,
        "carried_ride_id": None, "created_at": datetime.now(timezone.utc).isoformat(), "paid_at": None,
    })
    try:
        # Top up 10 € → 6 € debt recovered → net balance 4 €.
        r = s.post(f"{API}/api/wallet/topup", json={"amount": 10, "payment_method": "card"})
        assert r.status_code == 200, r.text
        body = r.json()
        assert abs(float(body.get("debt_recovered") or 0) - 6.0) < 0.01, body
        assert abs(float(body["balance"]) - 4.0) < 0.01, body
        debt = db.cancellation_debts.find_one({"id": debt_id}, {"_id": 0})
        assert debt["paid"] is True and debt.get("auto_settled") is True
    finally:
        db.cancellation_debts.delete_one({"id": debt_id})
        db.cancellation_debts.delete_many({"user_id": uid, "reason": "ride_balance", "paid": False})
        if before:
            db.wallets.update_one({"user_id": uid}, {"$set": {"balance": before.get("balance", 0)}})


def test_partial_recovery_leaves_remaining_debt():
    s, uid = _login(TEST_USER_EMAIL, TEST_USER_PASSWORD)
    before = db.wallets.find_one({"user_id": uid}, {"_id": 0, "balance": 1})
    db.wallets.update_one({"user_id": uid}, {"$set": {"balance": 0.0, "currency": "EUR"}}, upsert=True)
    debt_id = f"debt_test_{uuid.uuid4().hex[:8]}"
    db.cancellation_debts.insert_one({
        "id": debt_id, "user_id": uid, "ride_id": None, "amount": 8.0,
        "reason": "ride_balance", "paid": False, "owed_to_driver_id": None,
        "carried_ride_id": None, "created_at": datetime.now(timezone.utc).isoformat(), "paid_at": None,
    })
    try:
        # Top up 5 € → only 5 € recovered → debt left at 3 €, balance 0.
        r = s.post(f"{API}/api/wallet/topup", json={"amount": 5, "payment_method": "card"})
        assert r.status_code == 200, r.text
        body = r.json()
        assert abs(float(body.get("debt_recovered") or 0) - 5.0) < 0.01, body
        assert abs(float(body["balance"])) < 0.01, body
        debt = db.cancellation_debts.find_one({"id": debt_id}, {"_id": 0})
        assert debt["paid"] is False and abs(float(debt["amount"]) - 3.0) < 0.01
    finally:
        db.cancellation_debts.delete_one({"id": debt_id})
        db.cancellation_debts.delete_many({"user_id": uid, "reason": "ride_balance", "paid": False})
        if before:
            db.wallets.update_one({"user_id": uid}, {"$set": {"balance": before.get("balance", 0)}})
