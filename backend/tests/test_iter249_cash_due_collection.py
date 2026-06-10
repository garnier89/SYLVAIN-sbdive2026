"""Iteration 249 — Wallet shortfall → cash due → driver Reçu/Non reçu → debt.

- Completing a wallet ride with insufficient balance charges what the wallet can
  cover and flags the remainder as `cash_due_to_driver` (payment_status=cash_due).
- Driver 'Non reçu' records a carried `ride_balance` debt and sets payment_status=debt.
- Driver 'Reçu' marks payment_status=paid and clears the due (no debt).
"""
import os
import uuid
import requests
from datetime import datetime, timezone
from pymongo import MongoClient

from _creds import ADMIN_EMAIL, ADMIN_PASSWORD

API = os.environ.get("TEST_API_URL", os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001"))
db = MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]


def _admin():
    s = requests.Session()
    r = s.post(f"{API}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, r.text
    return s


def _setup_ride(uid, did, balance, fare):
    rid = f"ride_test_{uuid.uuid4().hex[:8]}"
    db.wallets.update_one({"user_id": uid}, {"$set": {"balance": float(balance), "currency": "EUR"}}, upsert=True)
    db.rides.insert_one({
        "id": rid, "user_id": uid, "driver_id": did, "status": "in_progress",
        "payment_method": "wallet", "vehicle_type": "sb", "estimated_fare": fare,
        "final_fare": None, "distance_km": 5, "pickup_address": "A", "dropoff_address": "B",
        "started_at": "2026-06-10T10:00:00+00:00", "pickup_lat": 0, "pickup_lng": 0,
    })
    return rid


def test_wallet_shortfall_then_not_received_creates_debt():
    s = _admin()
    drv = db.drivers.find_one({}, {"_id": 0, "id": 1})
    user = db.users.find_one({"role": "user"}, {"_id": 0, "id": 1})
    uid, did = user["id"], drv["id"]
    before = db.wallets.find_one({"user_id": uid}, {"_id": 0, "balance": 1})

    rid = _setup_ride(uid, did, balance=8.0, fare=20.0)
    try:
        r = s.post(f"{API}/api/rides/{rid}/status", json={"status": "completed", "extra_charges": {}})
        assert r.status_code == 200, r.text
        ride = db.rides.find_one({"id": rid}, {"_id": 0})
        final = float(ride["final_fare"])
        cash_due = float(ride.get("cash_due_to_driver") or 0)
        assert ride["payment_status"] == "cash_due"
        assert abs(cash_due - round(final - 8.0, 2)) < 0.01, (final, cash_due)
        # Wallet charged the available 8 € (a small cashback may be credited back).
        assert round(db.wallets.find_one({"user_id": uid})["balance"], 2) < 1.0

        r2 = s.post(f"{API}/api/rides/{rid}/collect-cash", json={"received": False})
        assert r2.status_code == 200, r2.text
        assert r2.json()["received"] is False
        ride2 = db.rides.find_one({"id": rid}, {"_id": 0})
        assert ride2["payment_status"] == "debt"
        assert float(ride2.get("cash_due_to_driver") or 0) == 0.0
        debt = db.cancellation_debts.find_one({"ride_id": rid, "reason": "ride_balance"}, {"_id": 0})
        assert debt and abs(float(debt["amount"]) - cash_due) < 0.01
        assert debt["paid"] is False and debt["owed_to_driver_id"] is None
    finally:
        db.rides.delete_one({"id": rid})
        db.cancellation_debts.delete_many({"ride_id": rid})
        if before:
            db.wallets.update_one({"user_id": uid}, {"$set": {"balance": before.get("balance", 0)}})


def test_cash_received_marks_paid():
    s = _admin()
    drv = db.drivers.find_one({}, {"_id": 0, "id": 1})
    user = db.users.find_one({"role": "user"}, {"_id": 0, "id": 1})
    uid, did = user["id"], drv["id"]
    before = db.wallets.find_one({"user_id": uid}, {"_id": 0, "balance": 1})

    rid = _setup_ride(uid, did, balance=2.0, fare=15.0)
    try:
        s.post(f"{API}/api/rides/{rid}/status", json={"status": "completed", "extra_charges": {}})
        ride = db.rides.find_one({"id": rid}, {"_id": 0})
        assert float(ride.get("cash_due_to_driver") or 0) > 0
        r = s.post(f"{API}/api/rides/{rid}/collect-cash", json={"received": True})
        assert r.status_code == 200, r.text
        ride2 = db.rides.find_one({"id": rid}, {"_id": 0})
        assert ride2["payment_status"] == "paid"
        assert float(ride2.get("cash_due_to_driver") or 0) == 0.0
        assert float(ride2.get("cash_collected") or 0) > 0
        assert db.cancellation_debts.count_documents({"ride_id": rid}) == 0
    finally:
        db.rides.delete_one({"id": rid})
        db.cancellation_debts.delete_many({"ride_id": rid})
        if before:
            db.wallets.update_one({"user_id": uid}, {"$set": {"balance": before.get("balance", 0)}})
