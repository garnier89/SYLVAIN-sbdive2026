"""Iteration 250 — Phase 1 cash settlement chain (extra coverage).

Already covered by iter249/iter249b (NOT re-tested here):
  - wallet shortfall → cash_due + Non reçu → ride_balance debt
  - cash received → paid
  - top-up auto-recovery (full + partial)

This file adds the missing coverage requested by the review:
  (A) Cash payment_method ride: completion → cash_due_to_driver == final_fare
      AND collect-cash {received:true} marks ride paid (no debt).
  (B) Authorization guard on POST /api/rides/{id}/collect-cash:
      a non-owner / non-admin user receives 403.
  (C) Transfer-based auto-recovery: an incoming wallet transfer to a passenger
      with an outstanding ride_balance debt deducts the debt FIRST.
"""
import os
import uuid
import requests
from datetime import datetime, timezone
from pymongo import MongoClient

from _creds import (
    ADMIN_EMAIL, ADMIN_PASSWORD,
    TEST_USER_EMAIL, TEST_USER_PASSWORD,
    DRIVER_EMAIL, DRIVER_PASSWORD,
)

API = os.environ.get(
    "TEST_API_URL",
    os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001"),
).rstrip("/")
db = MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]


def _login(email, pw):
    s = requests.Session()
    r = s.post(f"{API}/api/auth/login", json={"email": email, "password": pw})
    assert r.status_code == 200, f"login {email} -> {r.status_code} {r.text}"
    body = r.json()
    return s, body["user"]["id"], body["user"].get("role")


def _admin():
    s, uid, role = _login(ADMIN_EMAIL, ADMIN_PASSWORD)
    return s


def _make_ride(uid, did, payment_method, fare, wallet_balance=None):
    rid = f"ride_test_{uuid.uuid4().hex[:8]}"
    if wallet_balance is not None:
        db.wallets.update_one(
            {"user_id": uid},
            {"$set": {"balance": float(wallet_balance), "currency": "EUR"}},
            upsert=True,
        )
    db.rides.insert_one({
        "id": rid, "user_id": uid, "driver_id": did, "status": "in_progress",
        "payment_method": payment_method, "vehicle_type": "sb",
        "estimated_fare": fare, "final_fare": None, "distance_km": 5,
        "pickup_address": "A", "dropoff_address": "B",
        "started_at": "2026-06-10T10:00:00+00:00",
        "pickup_lat": 0, "pickup_lng": 0,
    })
    return rid


def _restore_wallet(uid, before):
    if before is not None:
        db.wallets.update_one(
            {"user_id": uid},
            {"$set": {"balance": float(before.get("balance", 0) or 0)}},
            upsert=True,
        )


# --------------------------------------------------------------------------
# (A) Cash ride: full fare becomes cash_due, then driver marks Reçu.
# --------------------------------------------------------------------------
def test_cash_ride_full_amount_due_then_received_marks_paid():
    s = _admin()
    drv = db.drivers.find_one({}, {"_id": 0, "id": 1})
    user = db.users.find_one({"role": "user"}, {"_id": 0, "id": 1})
    assert drv and user, "Seed data missing (driver/user)"
    uid, did = user["id"], drv["id"]
    before = db.wallets.find_one({"user_id": uid}, {"_id": 0, "balance": 1})

    rid = _make_ride(uid, did, payment_method="cash", fare=12.0, wallet_balance=50.0)
    try:
        r = s.post(f"{API}/api/rides/{rid}/status",
                   json={"status": "completed", "extra_charges": {}})
        assert r.status_code == 200, r.text
        ride = db.rides.find_one({"id": rid}, {"_id": 0})
        final = float(ride["final_fare"])
        cash_due = float(ride.get("cash_due_to_driver") or 0)
        # For a cash ride, the whole fare is owed in cash.
        assert abs(cash_due - final) < 0.01, (final, cash_due)
        assert ride["payment_status"] in ("pending_cash", "cash_due"), ride["payment_status"]
        # Wallet must NOT have been debited for a cash ride.
        bal_after = float(db.wallets.find_one({"user_id": uid})["balance"])
        assert abs(bal_after - 50.0) < 0.01, bal_after

        # Driver marks Reçu (admin acts on behalf for the test).
        r2 = s.post(f"{API}/api/rides/{rid}/collect-cash", json={"received": True})
        assert r2.status_code == 200, r2.text
        ride2 = db.rides.find_one({"id": rid}, {"_id": 0})
        assert ride2["payment_status"] == "paid"
        assert float(ride2.get("cash_due_to_driver") or 0) == 0.0
        assert abs(float(ride2.get("cash_collected") or 0) - final) < 0.01
        assert db.cancellation_debts.count_documents({"ride_id": rid}) == 0
    finally:
        db.rides.delete_one({"id": rid})
        db.cancellation_debts.delete_many({"ride_id": rid})
        _restore_wallet(uid, before)


# --------------------------------------------------------------------------
# (B) Authorization guard: a 3rd-party user cannot collect cash.
# --------------------------------------------------------------------------
def test_collect_cash_forbidden_for_non_owner_non_admin():
    a = _admin()
    drv = db.drivers.find_one({}, {"_id": 0, "id": 1, "user_id": 1})
    passenger = db.users.find_one({"role": "user"}, {"_id": 0, "id": 1})
    assert drv and passenger
    uid, did = passenger["id"], drv["id"]
    before = db.wallets.find_one({"user_id": uid}, {"_id": 0, "balance": 1})

    rid = _make_ride(uid, did, payment_method="wallet", fare=18.0, wallet_balance=5.0)
    try:
        # Drive the ride to cash_due as admin.
        r = a.post(f"{API}/api/rides/{rid}/status",
                   json={"status": "completed", "extra_charges": {}})
        assert r.status_code == 200, r.text
        ride = db.rides.find_one({"id": rid}, {"_id": 0})
        assert ride["payment_status"] == "cash_due"
        assert float(ride.get("cash_due_to_driver") or 0) > 0

        # Attacker logs in as the passenger (NOT the driver, NOT admin).
        attacker, attacker_uid, attacker_role = _login(TEST_USER_EMAIL, TEST_USER_PASSWORD)
        assert attacker_role != "admin"
        assert attacker_uid != drv.get("user_id"), \
            "Test setup picked a driver-user as attacker — please use a non-driver test user"
        r2 = attacker.post(f"{API}/api/rides/{rid}/collect-cash", json={"received": True})
        assert r2.status_code in (401, 403), (r2.status_code, r2.text)

        # Verify nothing changed.
        ride2 = db.rides.find_one({"id": rid}, {"_id": 0})
        assert ride2["payment_status"] == "cash_due"
        assert float(ride2.get("cash_due_to_driver") or 0) > 0
        assert db.cancellation_debts.count_documents({"ride_id": rid}) == 0

        # Sanity: admin CAN finish the job.
        r3 = a.post(f"{API}/api/rides/{rid}/collect-cash", json={"received": True})
        assert r3.status_code == 200, r3.text
        ride3 = db.rides.find_one({"id": rid}, {"_id": 0})
        assert ride3["payment_status"] == "paid"
    finally:
        db.rides.delete_one({"id": rid})
        db.cancellation_debts.delete_many({"ride_id": rid})
        _restore_wallet(uid, before)


# --------------------------------------------------------------------------
# (C) Incoming transfer auto-settles outstanding ride_balance debt.
# --------------------------------------------------------------------------
def test_incoming_transfer_recovers_outstanding_debt():
    # Sender = admin (top-up freely), Receiver = standard test user with a debt.
    sender, sender_uid, _ = _login(ADMIN_EMAIL, ADMIN_PASSWORD)
    receiver_login, receiver_uid, _ = _login(TEST_USER_EMAIL, TEST_USER_PASSWORD)

    before_recv = db.wallets.find_one({"user_id": receiver_uid}, {"_id": 0, "balance": 1})
    before_send = db.wallets.find_one({"user_id": sender_uid}, {"_id": 0, "balance": 1})

    # Reset balances to known state and credit sender enough to transfer.
    db.wallets.update_one({"user_id": receiver_uid},
                          {"$set": {"balance": 0.0, "currency": "EUR"}}, upsert=True)
    db.wallets.update_one({"user_id": sender_uid},
                          {"$set": {"balance": 100.0, "currency": "EUR"}}, upsert=True)

    debt_id = f"debt_test_{uuid.uuid4().hex[:8]}"
    db.cancellation_debts.insert_one({
        "id": debt_id, "user_id": receiver_uid, "ride_id": None,
        "amount": 7.0, "reason": "ride_balance", "paid": False,
        "owed_to_driver_id": None, "carried_ride_id": None,
        "created_at": datetime.now(timezone.utc).isoformat(), "paid_at": None,
    })
    try:
        r = sender.post(f"{API}/api/wallet/transfer",
                        json={"to_user_id": receiver_uid, "amount": 10})
        assert r.status_code == 200, r.text

        # Debt must be settled (7 €), receiver net balance must be 3 €.
        debt = db.cancellation_debts.find_one({"id": debt_id}, {"_id": 0})
        assert debt["paid"] is True, debt
        recv_bal = float(db.wallets.find_one({"user_id": receiver_uid})["balance"])
        assert abs(recv_bal - 3.0) < 0.01, recv_bal
    finally:
        db.cancellation_debts.delete_one({"id": debt_id})
        db.cancellation_debts.delete_many(
            {"user_id": receiver_uid, "reason": "ride_balance", "paid": False})
        _restore_wallet(receiver_uid, before_recv)
        _restore_wallet(sender_uid, before_send)
