"""Cash-ride gating (min wallet balance) + driver→client refund (linked to ride)."""
import os
import time
import requests
from datetime import datetime, timezone
from pymongo import MongoClient

from _creds import DRIVER_EMAIL, DRIVER_PASSWORD, TEST_USER_EMAIL

API = os.environ.get("TEST_API_URL", os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001"))
db = MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]


def _login(email, password):
    s = requests.Session()
    r = s.post(f"{API}/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return s, r.json()["user"]["id"]


def _set_balance(user_id, bal):
    db.wallets.update_one({"user_id": user_id}, {"$set": {"balance": float(bal), "pending_withdraw": 0.0}}, upsert=True)


def _driver_doc_id(user_id):
    return db.drivers.find_one({"user_id": user_id}, {"_id": 0, "id": 1})["id"]


def _insert_ride(rid, payment_method, driver_id, user_id, status="pending"):
    db.rides.insert_one({
        "id": rid, "user_id": user_id, "driver_id": driver_id, "status": status,
        "payment_method": payment_method, "vehicle_type": "comfort", "scheduled_at": None,
        "pickup_address": "A", "dropoff_address": "B", "booking_no": rid,
        "estimated_fare": 12.0, "created_at": datetime.now(timezone.utc).isoformat(),
    })


def test_cash_ride_gating_feed_and_accept():
    s, driver_uid = _login(DRIVER_EMAIL, DRIVER_PASSWORD)
    _, client_uid = _login(TEST_USER_EMAIL, "TestPass123!")
    cash_id, card_id = f"r_cash_{int(time.time()*1000)}", f"r_card_{int(time.time()*1000)}"
    original = db.wallets.find_one({"user_id": driver_uid}, {"_id": 0, "balance": 1, "pending_withdraw": 1}) or {}
    try:
        _insert_ride(cash_id, "cash", None, client_uid)
        _insert_ride(card_id, "card", None, client_uid)

        # Low balance → cash ride hidden, card ride visible, accept cash blocked.
        _set_balance(driver_uid, 0.5)
        ids = {r["id"] for r in s.get(f"{API}/api/rides", params={"status": "pending", "limit": 100}).json()}
        assert cash_id not in ids, "cash ride must be hidden for low-balance driver"
        assert card_id in ids, "card ride must remain visible"
        acc = s.post(f"{API}/api/rides/{cash_id}/accept")
        assert acc.status_code == 403, acc.text

        # Sufficient balance → cash ride visible again.
        _set_balance(driver_uid, 50.0)
        ids = {r["id"] for r in s.get(f"{API}/api/rides", params={"status": "pending", "limit": 100}).json()}
        assert cash_id in ids, "cash ride must be visible when balance >= minimum"
    finally:
        db.rides.delete_many({"id": {"$in": [cash_id, card_id]}})
        db.wallets.update_one({"user_id": driver_uid},
                              {"$set": {"balance": float(original.get("balance", 50.0) or 50.0),
                                        "pending_withdraw": float(original.get("pending_withdraw", 0) or 0)}})


def test_driver_refund_client_respects_reserve():
    s, driver_uid = _login(DRIVER_EMAIL, DRIVER_PASSWORD)
    _, client_uid = _login(TEST_USER_EMAIL, "TestPass123!")
    did = _driver_doc_id(driver_uid)
    rid = f"r_refund_{int(time.time()*1000)}"
    orig_d = db.wallets.find_one({"user_id": driver_uid}, {"_id": 0}) or {}
    orig_c = db.wallets.find_one({"user_id": client_uid}, {"_id": 0, "balance": 1}) or {}
    try:
        _insert_ride(rid, "cash", did, client_uid, status="completed")
        # Give the driver a comfortable balance.
        db.wallets.update_one({"user_id": driver_uid}, {"$set": {"balance": 500.0, "pending_withdraw": 0.0}}, upsert=True)
        client_before = float((db.wallets.find_one({"user_id": client_uid}, {"_id": 0, "balance": 1}) or {}).get("balance", 0) or 0)

        # Over the reserve-protected available amount → 400.
        too_big = s.post(f"{API}/api/rides/{rid}/refund-client", json={"amount": 999999})
        assert too_big.status_code == 400, too_big.text

        # Valid refund of 30 € → client credited, driver debited.
        r = s.post(f"{API}/api/rides/{rid}/refund-client", json={"amount": 30})
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["amount"] == 30.0
        client_after = float(db.wallets.find_one({"user_id": client_uid}, {"_id": 0, "balance": 1})["balance"])
        assert round(client_after - client_before, 2) == 30.0
        # A linked transaction was recorded for the ride.
        assert db.wallet_transactions.find_one({"ride_id": rid, "type": "ride_refund_in"})

        # Negative amount rejected.
        assert s.post(f"{API}/api/rides/{rid}/refund-client", json={"amount": -5}).status_code == 400
    finally:
        db.rides.delete_many({"id": rid})
        db.wallet_transactions.delete_many({"ride_id": rid})
        if orig_d:
            db.wallets.update_one({"user_id": driver_uid}, {"$set": {"balance": float(orig_d.get("balance", 50.0) or 50.0),
                                                                     "pending_withdraw": float(orig_d.get("pending_withdraw", 0) or 0)}})
        db.wallets.update_one({"user_id": client_uid}, {"$set": {"balance": float(orig_c.get("balance", 0) or 0)}})
