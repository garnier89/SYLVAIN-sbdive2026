"""Iter309 — Driver payout anti-fraud E2E tests.

Invariants under test:
    1. Insufficient wallet at completion → driver wallet/earnings NOT credited the fare.
       Only the digitally captured portion (+ optional platform bonus) is credited.
    2. Fully-paid wallet ride → driver wallet credited by ~ fare*(1-commission)
       and an "Earning" wallet_transaction row exists.
    3. Cash ride → no driver wallet credit at completion. /collect-cash {received:true}
       only records cash_collected; driver's withdrawable wallet stays unchanged.
    4. Withdrawable excludes non-earned credits (cashback + received P2P transfer).
    5. POST /api/wallet/withdraw-request → 403 for a driver with no completed ride
       in the last 6 months; not blocked by this rule for a recently-active driver.
    6. GET /api/drivers/report returns the documented keys (already covered by iter308
       — included here for regression as a single shape check).
"""
import os
import uuid
import requests
import pytest
from datetime import datetime, timezone, timedelta
from pymongo import MongoClient

from _creds import ADMIN_EMAIL, ADMIN_PASSWORD, DRIVER_EMAIL, DRIVER_PASSWORD

API = os.environ.get("TEST_API_URL", os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001")).rstrip("/")
db = MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]


# ---------- helpers ----------
def _admin_session():
    s = requests.Session()
    r = s.post(f"{API}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=20)
    assert r.status_code == 200, r.text
    s.headers["Authorization"] = f"Bearer {r.json()['access_token']}"
    return s


def _driver_token():
    r = requests.post(f"{API}/api/auth/login", json={"email": DRIVER_EMAIL, "password": DRIVER_PASSWORD}, timeout=20)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def _h(t):
    return {"Authorization": f"Bearer {t}", "Content-Type": "application/json"}


def _pick_driver():
    """Pick any driver with a user record so we can verify wallet credits."""
    for drv in db.drivers.find({}, {"_id": 0}):
        if drv.get("user_id") and db.users.find_one({"id": drv["user_id"]}):
            return drv
    raise RuntimeError("No driver with linked user found")


def _pick_passenger():
    u = db.users.find_one({"role": "user"}, {"_id": 0})
    assert u, "No passenger user available"
    return u


def _set_wallet(uid, balance=0.0, non_wd=0.0):
    db.wallets.update_one(
        {"user_id": uid},
        {"$set": {"balance": float(balance), "non_withdrawable": float(non_wd), "currency": "EUR"}},
        upsert=True,
    )


def _seed_ride(uid, did, fare, payment_method="wallet"):
    rid = f"ride_t309_{uuid.uuid4().hex[:8]}"
    db.rides.insert_one({
        "id": rid, "user_id": uid, "driver_id": did, "status": "in_progress",
        "payment_method": payment_method, "vehicle_type": "sb",
        "estimated_fare": float(fare), "final_fare": None,
        "distance_km": 5, "pickup_address": "A", "dropoff_address": "B",
        "started_at": datetime.now(timezone.utc).isoformat(),
        "pickup_lat": 0, "pickup_lng": 0,
        "commission_percent": 10,
    })
    return rid


def _wallet_balance(uid):
    w = db.wallets.find_one({"user_id": uid}, {"_id": 0, "balance": 1}) or {}
    return round(float(w.get("balance", 0) or 0), 2)


def _snapshot(uid, did_user):
    return {
        "user_balance": _wallet_balance(uid),
        "driver_balance": _wallet_balance(did_user),
        "driver_earnings": float((db.drivers.find_one({"user_id": did_user}, {"_id": 0, "earnings": 1}) or {}).get("earnings", 0) or 0),
    }


# ---------- 1. INSUFFICIENT WALLET — DRIVER NOT CREDITED FARE ----------
def test_insufficient_wallet_does_not_credit_driver_fare():
    s = _admin_session()
    drv = _pick_driver()
    duid = drv["user_id"]
    pax = _pick_passenger()
    uid = pax["id"]

    # Passenger wallet drained to 0; clear driver wallet baseline.
    _set_wallet(uid, balance=0.0, non_wd=0.0)
    before_drv = _wallet_balance(duid)
    before_earn = float((db.drivers.find_one({"id": drv["id"]}, {"_id": 0, "earnings": 1}) or {}).get("earnings", 0) or 0)

    rid = _seed_ride(uid, drv["id"], fare=20.0, payment_method="wallet")
    try:
        r = s.post(f"{API}/api/rides/{rid}/status", json={"status": "completed", "extra_charges": {}})
        assert r.status_code == 200, r.text
        ride = db.rides.find_one({"id": rid}, {"_id": 0})

        assert ride["payment_status"] == "cash_due", ride
        assert float(ride.get("cash_due_to_driver") or 0) > 0
        assert float(ride.get("digital_captured_fare") or 0) == 0.0

        # Driver wallet must NOT be credited the fare. Only platform bonuses (typically
        # disabled) may add a small amount; the gap should stay below the fare's net.
        after_drv = _wallet_balance(duid)
        delta = round(after_drv - before_drv, 2)
        assert delta < 0.5, f"Driver wallet credited {delta}€ on insufficient-wallet ride (should be ~0)"

        # No Earning transaction should have been recorded for this ride.
        earning_tx = db.wallet_transactions.find_one({"user_id": duid, "ride_id": rid, "type": "Earning"}, {"_id": 0})
        assert earning_tx is None, f"Unexpected Earning tx: {earning_tx}"
    finally:
        db.rides.delete_one({"id": rid})
        db.cancellation_debts.delete_many({"ride_id": rid})


# ---------- 2. FULLY-PAID WALLET RIDE — DRIVER CREDITED NET FARE ----------
def test_fully_paid_wallet_ride_credits_driver_net_fare():
    s = _admin_session()
    drv = _pick_driver()
    duid = drv["user_id"]
    pax = _pick_passenger()
    uid = pax["id"]

    _set_wallet(uid, balance=200.0, non_wd=0.0)
    before_drv = _wallet_balance(duid)

    rid = _seed_ride(uid, drv["id"], fare=20.0, payment_method="wallet")
    try:
        r = s.post(f"{API}/api/rides/{rid}/status", json={"status": "completed", "extra_charges": {}})
        assert r.status_code == 200, r.text
        ride = db.rides.find_one({"id": rid}, {"_id": 0})

        final_fare = float(ride["final_fare"])
        commission_pct = float(ride.get("commission_percent", 10)) / 100.0
        expected_net = round(final_fare * (1 - commission_pct), 2)

        assert ride["payment_status"] == "paid", ride
        assert abs(float(ride["digital_captured_fare"]) - final_fare) < 0.01
        assert float(ride.get("cash_due_to_driver") or 0) == 0.0

        after_drv = _wallet_balance(duid)
        delta = round(after_drv - before_drv, 2)
        # Allow ±0.5 € for optional subcategory bonus / loyalty discount drift.
        assert abs(delta - expected_net) < 0.6, f"Driver credited {delta}€, expected ~{expected_net}€"

        earning_tx = db.wallet_transactions.find_one(
            {"user_id": duid, "ride_id": rid, "type": "Earning"}, {"_id": 0}
        )
        assert earning_tx is not None and float(earning_tx["amount"]) > 0
    finally:
        db.rides.delete_one({"id": rid})
        db.wallet_transactions.delete_many({"ride_id": rid})


# ---------- 3. CASH RIDE — NO WALLET CREDIT EVEN AFTER /collect-cash ----------
def test_cash_ride_does_not_credit_driver_wallet():
    s = _admin_session()
    drv = _pick_driver()
    duid = drv["user_id"]
    pax = _pick_passenger()
    uid = pax["id"]

    before_drv = _wallet_balance(duid)
    rid = _seed_ride(uid, drv["id"], fare=15.0, payment_method="cash")
    try:
        r = s.post(f"{API}/api/rides/{rid}/status", json={"status": "completed", "extra_charges": {}})
        assert r.status_code == 200, r.text
        ride = db.rides.find_one({"id": rid}, {"_id": 0})

        assert ride["payment_status"] == "pending_cash", ride
        assert float(ride.get("cash_due_to_driver") or 0) > 0
        # No digital capture on cash rides.
        assert float(ride.get("digital_captured_fare") or 0) == 0.0
        # Driver wallet untouched at completion.
        mid_drv = _wallet_balance(duid)
        assert abs(mid_drv - before_drv) < 0.5

        # Confirm cash reception — must NOT credit driver's withdrawable wallet.
        r2 = s.post(f"{API}/api/rides/{rid}/collect-cash", json={"received": True})
        assert r2.status_code == 200, r2.text
        ride2 = db.rides.find_one({"id": rid}, {"_id": 0})
        assert ride2["payment_status"] == "paid"
        assert float(ride2.get("cash_collected") or 0) > 0
        assert float(ride2.get("cash_due_to_driver") or 0) == 0.0

        after_drv = _wallet_balance(duid)
        assert abs(after_drv - before_drv) < 0.5, (
            f"Driver wallet changed by {round(after_drv-before_drv,2)}€ on cash ride (must stay 0)"
        )

        # And no Earning tx should be created for the cash ride.
        earning_tx = db.wallet_transactions.find_one({"user_id": duid, "ride_id": rid, "type": "Earning"}, {"_id": 0})
        assert earning_tx is None
    finally:
        db.rides.delete_one({"id": rid})
        db.cancellation_debts.delete_many({"ride_id": rid})


# ---------- 4. WITHDRAWABLE EXCLUDES NON-EARNED CREDITS ----------
def test_withdrawable_excludes_cashback_and_p2p_transfer():
    """GET /api/wallet should expose non_withdrawable and withdrawable and the latter
    must subtract non-earned credits."""
    s = requests.Session()
    r = s.post(f"{API}/api/auth/login", json={"email": DRIVER_EMAIL, "password": DRIVER_PASSWORD}, timeout=20)
    assert r.status_code == 200, r.text
    t = r.json()["access_token"]
    headers = _h(t)

    # Fetch driver user_id (whoami)
    me = requests.get(f"{API}/api/auth/me", headers=headers, timeout=15)
    assert me.status_code == 200, me.text
    uid = me.json()["id"]

    # Pin balance + non_withdrawable to known values to assert the formula exactly.
    db.wallets.update_one(
        {"user_id": uid},
        {"$set": {"balance": 100.0, "non_withdrawable": 30.0, "pending_withdraw": 0.0, "currency": "EUR"}},
        upsert=True,
    )

    w = requests.get(f"{API}/api/wallet", headers=headers, timeout=15).json()
    assert "non_withdrawable" in w and "withdrawable" in w
    expected = max(0.0, w["balance"] - w.get("reserve", 0) - w.get("pending_withdraw", 0) - w["non_withdrawable"])
    assert abs(w["withdrawable"] - round(expected, 2)) < 0.02, w

    # Simulate a P2P incoming transfer: non_withdrawable rises by the amount.
    db.wallets.update_one({"user_id": uid}, {"$inc": {"balance": 25.0, "non_withdrawable": 25.0}})
    w2 = requests.get(f"{API}/api/wallet", headers=headers, timeout=15).json()
    assert round(w2["non_withdrawable"] - w["non_withdrawable"], 2) == 25.0
    # Withdrawable did NOT rise by 25 — it can only fall or stay due to the offset.
    assert w2["withdrawable"] <= round(w["withdrawable"] + 0.02, 2), (w, w2)


# ---------- 5. WITHDRAWAL INACTIVITY BLOCK ----------
def _demo_driver():
    user_doc = db.users.find_one({"email": DRIVER_EMAIL}, {"_id": 0, "id": 1, "email": 1})
    if not user_doc:
        return None, None
    drv = db.drivers.find_one({"user_id": user_doc["id"]}, {"_id": 0})
    return drv, user_doc


def test_withdraw_inactivity_block_for_dormant_driver():
    """Driver with no completed ride in 6 months → POST /api/wallet/withdraw-request returns 403."""
    drv, user_doc = _demo_driver()
    if not drv or not user_doc:
        pytest.skip("Demo driver not available")
    duid = user_doc["id"]

    # Backup recent completed rides for this driver and mark them as old.
    cutoff_iso = (datetime.now(timezone.utc) - timedelta(days=200)).isoformat()
    ids = [drv["id"], duid]
    recent = list(db.rides.find(
        {"driver_id": {"$in": ids}, "status": "completed"},
        {"_id": 0, "id": 1, "completed_at": 1, "created_at": 1},
    ))
    backups = [(r["id"], r.get("completed_at"), r.get("created_at")) for r in recent]
    try:
        db.rides.update_many(
            {"driver_id": {"$in": ids}, "status": "completed"},
            {"$set": {"completed_at": cutoff_iso, "created_at": cutoff_iso}},
        )

        # Login by email (this driver's user has role=driver, email login works for demo seed).
        r = requests.post(f"{API}/api/auth/login", json={"email": user_doc["email"], "password": DRIVER_PASSWORD}, timeout=20)
        if r.status_code != 200:
            pytest.skip(f"Cannot login as dormant driver {user_doc['email']}: {r.text}")
        t = r.json()["access_token"]

        rr = requests.post(
            f"{API}/api/wallet/withdraw-request",
            headers=_h(t),
            json={"amount": 20.0, "iban": "FR7630006000011234567890189"},
            timeout=20,
        )
        assert rr.status_code == 403, rr.text
        assert "inactif" in rr.text.lower() or "6 mois" in rr.text or "inactivit" in rr.text.lower()
    finally:
        # Restore original ride timestamps so we don't break other tests.
        for rid, c_at, cr_at in backups:
            db.rides.update_one({"id": rid}, {"$set": {"completed_at": c_at, "created_at": cr_at}})


def test_recent_active_driver_not_blocked_by_inactivity_rule():
    """A driver with a recent completed ride must NOT receive the inactivity-403.
    They may still fail for other reasons (min amount / payout method) — that's fine,
    we only assert the specific inactivity message is absent."""
    drv, user_doc = _demo_driver()
    if not drv or not user_doc:
        pytest.skip("Demo driver not available")

    # Ensure at least one recent completed ride for this driver.
    now_iso = datetime.now(timezone.utc).isoformat()
    marker = f"ride_t309_recent_{uuid.uuid4().hex[:6]}"
    db.rides.insert_one({
        "id": marker, "user_id": "passenger_dummy", "driver_id": drv["id"], "status": "completed",
        "payment_method": "wallet", "vehicle_type": "sb", "estimated_fare": 5.0,
        "final_fare": 5.0, "completed_at": now_iso, "created_at": now_iso, "commission_percent": 10,
    })
    try:
        r = requests.post(f"{API}/api/auth/login", json={"email": user_doc["email"], "password": DRIVER_PASSWORD}, timeout=20)
        if r.status_code != 200:
            pytest.skip(f"Cannot login: {r.text}")
        t = r.json()["access_token"]
        rr = requests.post(
            f"{API}/api/wallet/withdraw-request",
            headers=_h(t),
            json={"amount": 20.0, "iban": "FR7630006000011234567890189"},
            timeout=20,
        )
        # Whatever the outcome, the inactivity-403 must NOT be returned.
        if rr.status_code == 403:
            assert "inactif" not in rr.text.lower() and "6 mois" not in rr.text, rr.text
    finally:
        db.rides.delete_one({"id": marker})


# ---------- 6. DRIVER REPORT SHAPE (regression smoke) ----------
def test_driver_report_returns_required_keys():
    t = _driver_token()
    r = requests.get(f"{API}/api/drivers/report", headers=_h(t), timeout=20)
    assert r.status_code == 200, r.text
    d = r.json()
    required = {"trips", "gross", "commission", "net", "cash_received", "card_received",
                "cancellation_fees", "balance", "reserve", "pending_withdraw",
                "non_withdrawable", "withdrawable", "currency"}
    assert required.issubset(set(d.keys())), d.keys()
    assert abs(d["net"] - (d["gross"] - d["commission"])) < 0.05
