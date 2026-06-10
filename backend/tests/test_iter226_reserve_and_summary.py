"""Iter 226 — Cashback monthly summary + SB Pay reserve/region engine.

Phase A:
 - GET /finance/cashback/summary returns {this_month, all_time, currency}.
 - Earning a new cashback (via /finance/sbpaygo/pay-ride for amount >= min)
   bumps this_month and all_time.

Phase B (reserve + region):
 - Admin GET/PUT /admin/wallet-reserve-config (non-admin forbidden).
 - Merchant reserve auto-credit idempotent (1 EUR).
 - Approved driver reserve auto-credit idempotent (50 EUR Europe default).
 - Client gets reserve=0/can_withdraw=false; withdraw-request -> 403.
 - Driver withdraw-request: reserve floor + withdraw_min enforced; admin doc
   created with role+region; balance frozen into pending_withdraw.
 - PUT /admin/users/{id}/region switches floor to driver_africa (2 EUR).
"""
import os
import uuid
import pytest
import requests
from pymongo import MongoClient


def _load_env(p, key):
    if os.path.exists(p):
        with open(p) as f:
            for line in f:
                if line.startswith(key + "="):
                    return line.split("=", 1)[1].strip().strip('"').strip("'")
    return None


BASE = (os.environ.get("REACT_APP_BACKEND_URL")
        or _load_env("/app/frontend/.env", "REACT_APP_BACKEND_URL")).rstrip("/")
API = f"{BASE}/api"
MONGO_URL = os.environ.get("MONGO_URL") or _load_env("/app/backend/.env", "MONGO_URL")
DB_NAME = os.environ.get("DB_NAME") or _load_env("/app/backend/.env", "DB_NAME")

USER_EMAIL, USER_PW = "test2@example.com", "TestPass123!"
ADMIN_EMAIL, ADMIN_PW = "admin@superapp.com", "SuperAdmin123!"
MERCH_EMAIL, MERCH_PW = "merchant@example.com", "Merchant123!"
DRIVER_EMAIL, DRIVER_PW = "jean.dupont@demo.sb", "Driver123!"


def _login(email, pw):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": pw}, timeout=20)
    assert r.status_code == 200, f"login {email}: {r.status_code} {r.text[:200]}"
    return r.json().get("token") or r.json().get("access_token")


def _h(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


def _me(tok):
    r = requests.get(f"{API}/auth/me", headers=_h(tok), timeout=15)
    assert r.status_code == 200
    return r.json()


@pytest.fixture(scope="module")
def admin_tok():
    return _login(ADMIN_EMAIL, ADMIN_PW)


@pytest.fixture(scope="module")
def user_tok():
    return _login(USER_EMAIL, USER_PW)


@pytest.fixture(scope="module")
def merch_tok():
    return _login(MERCH_EMAIL, MERCH_PW)


@pytest.fixture(scope="module")
def driver_tok():
    return _login(DRIVER_EMAIL, DRIVER_PW)


@pytest.fixture(scope="module")
def mongo():
    c = MongoClient(MONGO_URL)
    return c[DB_NAME]


def _admin_credit(admin_tok, uid, amount, note="iter226"):
    r = requests.post(f"{API}/admin/users/{uid}/wallet/credit", headers=_h(admin_tok),
                      json={"amount": amount, "note": note}, timeout=20)
    assert r.status_code in (200, 201), f"credit failed {r.status_code} {r.text[:200]}"


def _reset_reserve_default(admin_tok):
    r = requests.put(f"{API}/admin/wallet-reserve-config", headers=_h(admin_tok),
                     json={"driver_europe": 50, "driver_africa": 2, "merchant": 1,
                           "withdraw_min": 10}, timeout=15)
    assert r.status_code == 200, r.text[:200]


# ────────────────────── PHASE A — cashback summary ─────────────────────────

def test_cashback_summary_shape_and_increment(admin_tok, user_tok):
    me = _me(user_tok)
    # Snapshot
    r0 = requests.get(f"{API}/finance/cashback/summary", headers=_h(user_tok), timeout=15)
    assert r0.status_code == 200, r0.text
    j0 = r0.json()
    for k in ("this_month", "all_time", "currency"):
        assert k in j0, f"missing {k}"
    assert j0["currency"] == "EUR"
    before_month = float(j0["this_month"])
    before_all = float(j0["all_time"])

    # Earn a cashback (2% of 20 = 0.40 default)
    _admin_credit(admin_tok, me["id"], 100, "iter226 summary")
    ride_id = f"test_ride_sum_{uuid.uuid4().hex[:8]}"
    r = requests.post(f"{API}/finance/sbpaygo/pay-ride", headers=_h(user_tok),
                      json={"ride_id": ride_id, "amount": 25.0}, timeout=20)
    assert r.status_code == 200, r.text
    cb = round(float(r.json().get("cashback", 0)), 2)
    assert cb > 0, r.json()

    r1 = requests.get(f"{API}/finance/cashback/summary", headers=_h(user_tok), timeout=15)
    j1 = r1.json()
    assert round(float(j1["this_month"]) - before_month, 2) == cb
    assert round(float(j1["all_time"]) - before_all, 2) == cb


def test_cashback_summary_requires_auth():
    r = requests.get(f"{API}/finance/cashback/summary", timeout=10)
    assert r.status_code in (401, 403)


# ────────────────────── PHASE B — reserve-config admin ─────────────────────

def test_reserve_config_admin_get(admin_tok):
    _reset_reserve_default(admin_tok)
    r = requests.get(f"{API}/admin/wallet-reserve-config", headers=_h(admin_tok), timeout=15)
    assert r.status_code == 200, r.text
    j = r.json()
    assert float(j["driver_europe"]) == 50.0
    assert float(j["driver_africa"]) == 2.0
    assert float(j["merchant"]) == 1.0
    assert float(j["withdraw_min"]) == 10.0


def test_reserve_config_non_admin_forbidden(user_tok):
    r = requests.get(f"{API}/admin/wallet-reserve-config", headers=_h(user_tok), timeout=15)
    assert r.status_code in (401, 403), r.text


def test_reserve_config_put_clamp_negative(admin_tok):
    r = requests.put(f"{API}/admin/wallet-reserve-config", headers=_h(admin_tok),
                     json={"driver_europe": -10}, timeout=15)
    assert r.status_code == 200, r.text
    j = r.json()
    assert float(j["driver_europe"]) == 0.0
    _reset_reserve_default(admin_tok)


# ────────────────────── PHASE B — merchant reserve gift ────────────────────

def test_merchant_reserve_idempotent_gift(admin_tok, merch_tok, mongo):
    _reset_reserve_default(admin_tok)
    me = _me(merch_tok)
    # Reset wallet/state so the test is deterministic
    mongo.wallets.delete_many({"user_id": me["id"]})
    mongo.wallet_transactions.delete_many({"user_id": me["id"], "type": "Reserve"})

    r1 = requests.get(f"{API}/wallet", headers=_h(merch_tok), timeout=20)
    assert r1.status_code == 200, r1.text
    j1 = r1.json()
    assert float(j1["reserve"]) == 1.0
    assert j1["can_withdraw"] is True
    assert float(j1["balance"]) >= 1.0
    bal_after_first = float(j1["balance"])

    # Reserve transaction must exist exactly once
    res_txs = list(mongo.wallet_transactions.find({"user_id": me["id"], "type": "Reserve"}))
    assert len(res_txs) == 1, f"expected 1 Reserve tx got {len(res_txs)}"

    # 2nd call: balance unchanged, still 1 Reserve tx
    r2 = requests.get(f"{API}/wallet", headers=_h(merch_tok), timeout=20)
    assert r2.status_code == 200
    j2 = r2.json()
    assert round(float(j2["balance"]), 2) == round(bal_after_first, 2)
    assert len(list(mongo.wallet_transactions.find({"user_id": me["id"], "type": "Reserve"}))) == 1


# ────────────────────── PHASE B — driver reserve + withdraw ────────────────

def test_driver_reserve_and_withdraw_flow(admin_tok, driver_tok, mongo):
    _reset_reserve_default(admin_tok)
    me = _me(driver_tok)
    # Ensure driver is approved + region default europe; reset wallet
    mongo.drivers.update_one({"user_id": me["id"]}, {"$set": {"status": "approved"}}, upsert=False)
    mongo.users.update_one({"id": me["id"]}, {"$unset": {"region": ""}})
    mongo.wallets.delete_many({"user_id": me["id"]})
    mongo.wallet_transactions.delete_many({"user_id": me["id"], "type": "Reserve"})
    mongo.admin_withdraw_requests.delete_many({"user_id": me["id"]})

    r = requests.get(f"{API}/wallet", headers=_h(driver_tok), timeout=20)
    assert r.status_code == 200, r.text
    j = r.json()
    assert float(j["reserve"]) == 50.0, j
    assert j["can_withdraw"] is True
    assert float(j["balance"]) >= 50.0  # reserve gifted
    assert float(j.get("withdrawable", 0)) == 0.0  # balance == reserve, nothing withdrawable

    # Idempotency: second call doesn't gift again
    res_txs = list(mongo.wallet_transactions.find({"user_id": me["id"], "type": "Reserve"}))
    assert len(res_txs) == 1
    requests.get(f"{API}/wallet", headers=_h(driver_tok), timeout=20)
    assert len(list(mongo.wallet_transactions.find({"user_id": me["id"], "type": "Reserve"}))) == 1

    # Fund driver wallet above reserve for withdrawal
    _admin_credit(admin_tok, me["id"], 80, "iter226 driver fund")
    r = requests.get(f"{API}/wallet", headers=_h(driver_tok), timeout=20)
    j = r.json()
    balance = float(j["balance"])
    withdrawable = float(j["withdrawable"])
    assert withdrawable == round(balance - 50.0, 2), j

    # Withdraw below min -> 400
    r_min = requests.post(f"{API}/wallet/withdraw-request", headers=_h(driver_tok),
                         json={"amount": 5, "iban": "FR7630006000011234567890189"}, timeout=15)
    assert r_min.status_code == 400, r_min.text

    # Withdraw above withdrawable -> 400 mentioning reserve
    too_big = round(withdrawable + 5, 2)
    r_big = requests.post(f"{API}/wallet/withdraw-request", headers=_h(driver_tok),
                         json={"amount": too_big, "iban": "FR7630006000011234567890189"}, timeout=15)
    assert r_big.status_code == 400, r_big.text
    err = r_big.json().get("detail", "")
    assert "réserve" in err.lower() or "reserve" in err.lower() or "max" in err.lower()

    # Valid withdrawal at exactly withdrawable
    amount = min(withdrawable, 20.0)
    if amount < 10:
        pytest.skip("not enough withdrawable for min withdrawal")
    r_ok = requests.post(f"{API}/wallet/withdraw-request", headers=_h(driver_tok),
                        json={"amount": amount, "iban": "FR7630006000011234567890189"}, timeout=15)
    assert r_ok.status_code == 200, r_ok.text
    doc = r_ok.json()
    assert doc["status"] == "pending"
    assert doc["role"] == "driver"
    assert doc["region"] == "europe"
    assert float(doc["amount"]) == amount

    # Balance decreased + pending_withdraw increased
    r_w = requests.get(f"{API}/wallet", headers=_h(driver_tok), timeout=20)
    jw = r_w.json()
    assert round(float(jw["balance"]), 2) == round(balance - amount, 2)
    assert round(float(jw["pending_withdraw"]), 2) == amount


# ────────────────────── PHASE B — client cannot withdraw ───────────────────

def test_client_no_reserve_and_no_withdraw(user_tok):
    r = requests.get(f"{API}/wallet", headers=_h(user_tok), timeout=15)
    assert r.status_code == 200, r.text
    j = r.json()
    assert float(j["reserve"]) == 0.0
    assert j["can_withdraw"] is False
    rw = requests.post(f"{API}/wallet/withdraw-request", headers=_h(user_tok),
                       json={"amount": 20, "iban": "FR7630006000011234567890189"}, timeout=15)
    assert rw.status_code == 403, rw.text


# ────────────────────── PHASE B — region override ──────────────────────────

def test_admin_set_region_africa_changes_floor(admin_tok, driver_tok, mongo):
    _reset_reserve_default(admin_tok)
    me = _me(driver_tok)
    # Make sure driver still approved
    mongo.drivers.update_one({"user_id": me["id"]}, {"$set": {"status": "approved"}}, upsert=False)
    # Switch to africa
    r = requests.put(f"{API}/admin/users/{me['id']}/region", headers=_h(admin_tok),
                     json={"region": "africa"}, timeout=15)
    assert r.status_code == 200, r.text
    assert r.json()["region"] == "africa"

    # Reload wallet — floor should now be 2 (africa)
    rw = requests.get(f"{API}/wallet", headers=_h(driver_tok), timeout=15)
    jw = rw.json()
    assert float(jw["reserve"]) == 2.0, jw

    # Reset back to europe for follow-up tests
    requests.put(f"{API}/admin/users/{me['id']}/region", headers=_h(admin_tok),
                 json={"region": "europe"}, timeout=15)
    # Restore reserve to 50 for cleanliness (will be updated on next /wallet call)
    requests.get(f"{API}/wallet", headers=_h(driver_tok), timeout=15)


def test_zzz_reset_reserve_default(admin_tok, driver_tok, mongo):
    _reset_reserve_default(admin_tok)
    me = _me(driver_tok)
    mongo.users.update_one({"id": me["id"]}, {"$unset": {"region": ""}})
    # Cancel any pending withdraw rows we created so the dashboard is clean
    mongo.admin_withdraw_requests.delete_many({"user_id": me["id"], "status": "pending"})
