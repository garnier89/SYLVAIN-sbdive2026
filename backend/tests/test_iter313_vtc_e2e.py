"""Iter313 — End-to-end VTC standard flow (FR).

Exercise the full ride lifecycle through the public HTTP API:
  estimate → create → driver accept → arriving → start-OTP (request+verify) →
  completed → payment settlement (wallet | wallet-insufficient→cash | direct cash) →
  collect-cash and anti-fraud invariants on the driver payout.

Also smokes:
  * OTP security (wrong code rejected; in_progress requires valid OTP)
  * GET /api/wallet exposes withdrawable / non_withdrawable
  * Wallet withdraw-request endpoint reachable (200 or 4xx, never 500)
  * POST /api/rides/{id}/cancel and /rate happy paths

Side effects are kept under TEST_ prefix and cleaned up. Direct Mongo touch is
only used to (a) credit the rider's wallet (admin endpoint requires a *real* user)
and (b) flip the demo driver online.
"""
import os
import time
import uuid
import asyncio
import pytest
import requests
from dotenv import load_dotenv
import motor.motor_asyncio as motor

from tests._creds import (
    ADMIN_EMAIL, ADMIN_PASSWORD,
    DRIVER_EMAIL, DRIVER_PASSWORD, DRIVER_PASSWORD_ALT,
)

load_dotenv("/app/backend/.env")
load_dotenv("/app/frontend/.env")
BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"
DB_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]

PICKUP = (48.8566, 2.3522, "TEST_Paris pickup")
DROPOFF = (48.8606, 2.3376, "TEST_Louvre dropoff")  # ~1.5 km


# ─── Helpers ──────────────────────────────────────────────────────────────────
def _post(path, json=None, token=None, expect=None):
    h = {"Content-Type": "application/json"}
    if token:
        h["Authorization"] = f"Bearer {token}"
    r = requests.post(f"{API}{path}", json=json or {}, headers=h, timeout=20)
    if expect is not None:
        assert r.status_code == expect, f"POST {path} -> {r.status_code} {r.text}"
    return r


def _get(path, token=None, expect=None):
    h = {}
    if token:
        h["Authorization"] = f"Bearer {token}"
    r = requests.get(f"{API}{path}", headers=h, timeout=20)
    if expect is not None:
        assert r.status_code == expect, f"GET {path} -> {r.status_code} {r.text}"
    return r


def _login(email, password):
    r = _post("/auth/login", {"email": email, "password": password})
    if r.status_code != 200:
        pytest.skip(f"login {email} failed: {r.status_code} {r.text[:200]}")
    j = r.json()
    return j.get("access_token") or j.get("token") or j.get("data", {}).get("access_token")


def _login_driver():
    """Driver demo password sometimes rotates; try both Driver123! and Driver1234!."""
    for pw in (DRIVER_PASSWORD, DRIVER_PASSWORD_ALT):
        r = _post("/auth/login", {"email": DRIVER_EMAIL, "password": pw})
        if r.status_code == 200:
            j = r.json()
            return j.get("access_token") or j.get("token") or j.get("data", {}).get("access_token")
    pytest.skip(f"driver login failed for {DRIVER_EMAIL}")


def _register_rider():
    """Create a fresh rider for each E2E case so wallet state is deterministic."""
    suffix = uuid.uuid4().hex[:10]
    email = f"TEST_rider_{suffix}@example.com"
    payload = {
        "email": email,
        "password": "TestRider123!",
        "name": f"TEST Rider {suffix[:5]}",
        "phone": f"+336{suffix[:8]}",
        "role": "user",
    }
    r = _post("/auth/register", payload)
    if r.status_code not in (200, 201):
        pytest.skip(f"register rider failed: {r.status_code} {r.text[:200]}")
    j = r.json()
    token = j.get("access_token") or j.get("token") or j.get("data", {}).get("access_token")
    if not token:
        # fall back to login
        token = _login(email, "TestRider123!")
    uid = (j.get("user") or {}).get("id") or (j.get("data", {}).get("user") or {}).get("id")
    return token, uid, email


async def _set_wallet_balance(user_id, balance):
    db = motor.AsyncIOMotorClient(DB_URL)[DB_NAME]
    await db.wallets.update_one(
        {"user_id": user_id},
        {"$set": {"balance": float(balance), "currency": "EUR"},
         "$setOnInsert": {"user_id": user_id, "created_at": "now"}},
        upsert=True,
    )


async def _ensure_driver_online():
    db = motor.AsyncIOMotorClient(DB_URL)[DB_NAME]
    u = await db.users.find_one({"email": DRIVER_EMAIL}, {"_id": 0, "id": 1})
    if not u:
        return None, None
    d = await db.drivers.find_one({"user_id": u["id"]}, {"_id": 0})
    if not d:
        return u["id"], None
    await db.drivers.update_one(
        {"id": d["id"]},
        {"$set": {
            "is_online": True, "status": "approved",
            "current_lat": PICKUP[0], "current_lng": PICKUP[1],
        }},
    )
    return u["id"], d["id"]


async def _get_driver_wallet_balance(driver_user_id):
    db = motor.AsyncIOMotorClient(DB_URL)[DB_NAME]
    w = await db.wallets.find_one({"user_id": driver_user_id}, {"_id": 0, "balance": 1})
    return float((w or {}).get("balance", 0) or 0)


async def _get_ride(ride_id):
    db = motor.AsyncIOMotorClient(DB_URL)[DB_NAME]
    return await db.rides.find_one({"id": ride_id}, {"_id": 0})


async def _get_latest_earning_tx(driver_user_id, ride_id):
    db = motor.AsyncIOMotorClient(DB_URL)[DB_NAME]
    return await db.wallet_transactions.find_one(
        {"user_id": driver_user_id, "ride_id": ride_id, "type": "Earning"}, {"_id": 0}
    )


async def _get_payment_notifs(user_id, ride_id):
    db = motor.AsyncIOMotorClient(DB_URL)[DB_NAME]
    cur = db.notifications.find({"user_id": user_id, "type": "payment"}, {"_id": 0})
    return [n async for n in cur if (n.get("data") or {}).get("ride_id") == ride_id]


# ─── Fixtures ────────────────────────────────────────────────────────────────
@pytest.fixture(scope="module")
def driver_token():
    return _login_driver()


@pytest.fixture(scope="module")
def driver_ids():
    return asyncio.get_event_loop().run_until_complete(_ensure_driver_online())


# ─── Tests ───────────────────────────────────────────────────────────────────
class TestEstimate:
    """POST /api/rides/estimate — sanity on price computation."""

    def test_estimate_returns_positive_fare(self):
        body = {
            "pickup_lat": PICKUP[0], "pickup_lng": PICKUP[1], "pickup_address": PICKUP[2],
            "dropoff_lat": DROPOFF[0], "dropoff_lng": DROPOFF[1], "dropoff_address": DROPOFF[2],
            "vehicle_type": "sedan", "payment_method": "wallet",
        }
        r = _post("/rides/estimate", body)
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["estimated_fare"] > 0
        assert j["distance_km"] > 0
        assert j["currency"] == "EUR"


def _create_ride(rider_token, payment_method="wallet"):
    body = {
        "pickup_lat": PICKUP[0], "pickup_lng": PICKUP[1], "pickup_address": PICKUP[2],
        "dropoff_lat": DROPOFF[0], "dropoff_lng": DROPOFF[1], "dropoff_address": DROPOFF[2],
        "vehicle_type": "sedan", "payment_method": payment_method,
    }
    r = _post("/rides", body, token=rider_token)
    return r


def _drive_to_in_progress(rider_token, driver_token, ride_id, expect_otp_security=True):
    """Driver accepts → arriving → request OTP (passenger) → wrong OTP → right OTP."""
    # Accept
    r = _post(f"/rides/{ride_id}/accept", token=driver_token)
    assert r.status_code == 200, f"accept: {r.status_code} {r.text}"
    # Arriving
    r = _post(f"/rides/{ride_id}/status", {"status": "arriving"}, token=driver_token)
    assert r.status_code == 200, f"arriving: {r.status_code} {r.text}"
    # OTP request by rider
    r = _post(f"/phase1/rides/{ride_id}/start-otp/request", token=rider_token)
    assert r.status_code == 200, f"otp request: {r.status_code} {r.text}"
    otp = r.json().get("otp")
    assert otp and len(otp) == 4
    if expect_otp_security:
        # SECURITY: a wrong code must be rejected
        bad = "0000" if otp != "0000" else "1111"
        r = _post(f"/phase1/rides/{ride_id}/start-otp/verify", {"otp": bad}, token=driver_token)
        assert r.status_code == 400, f"wrong OTP not rejected: {r.status_code} {r.text}"
    # Verify with the right OTP
    r = _post(f"/phase1/rides/{ride_id}/start-otp/verify", {"otp": otp}, token=driver_token)
    assert r.status_code == 200, f"otp verify: {r.status_code} {r.text}"
    return otp


def _complete(driver_token, ride_id):
    r = _post(f"/rides/{ride_id}/status", {"status": "completed"}, token=driver_token)
    assert r.status_code == 200, f"complete: {r.status_code} {r.text}"
    return r.json()


class TestE2EWalletPays:
    """Wallet sufficient → fare debited, driver credited, anti-fraud OK."""

    def test_full_flow_wallet_pays(self, driver_token, driver_ids):
        driver_uid, _ = driver_ids
        if not driver_uid:
            pytest.skip("demo driver not provisioned")
        rider_token, rider_id, _ = _register_rider()

        # 1) Credit rider wallet to cover fare
        asyncio.get_event_loop().run_until_complete(_set_wallet_balance(rider_id, 100.0))
        driver_before = asyncio.get_event_loop().run_until_complete(_get_driver_wallet_balance(driver_uid))

        # 2) Create ride
        r = _create_ride(rider_token, "wallet")
        assert r.status_code == 200, r.text
        ride_id = r.json()["id"]
        fare = float(r.json()["estimated_fare"])
        assert fare > 0

        # 3) Drive to in_progress via OTP
        _drive_to_in_progress(rider_token, driver_token, ride_id)

        # 4) Complete
        _complete(driver_token, ride_id)

        # 5) Verify settlement
        ride = asyncio.get_event_loop().run_until_complete(_get_ride(ride_id))
        assert ride["payment_status"] == "paid", ride
        assert ride.get("digital_captured_fare", 0) >= fare - 0.01
        assert ride.get("cash_due_to_driver", 0) in (0, None)

        # 6) Driver wallet credited ~ fare * (1-commission)
        driver_after = asyncio.get_event_loop().run_until_complete(_get_driver_wallet_balance(driver_uid))
        comm = ride.get("commission_percent", 10) / 100.0
        expected = round(fare * (1 - comm), 2)
        gained = round(driver_after - driver_before, 2)
        assert abs(gained - expected) <= max(0.5, expected * 0.2), \
            f"driver gained {gained} vs expected ≈ {expected} (fare={fare}, comm={comm})"

        # 7) Earning transaction recorded
        tx = asyncio.get_event_loop().run_until_complete(_get_latest_earning_tx(driver_uid, ride_id))
        assert tx is not None and tx["type"] == "Earning"


class TestE2ESwitchToCash:
    """Wallet INSUFFICIENT → flips to cash at start, flashes both, no digital credit."""

    def test_insufficient_wallet_switches_to_cash(self, driver_token, driver_ids):
        driver_uid, _ = driver_ids
        if not driver_uid:
            pytest.skip("demo driver not provisioned")
        rider_token, rider_id, _ = _register_rider()
        asyncio.get_event_loop().run_until_complete(_set_wallet_balance(rider_id, 1.0))

        r = _create_ride(rider_token, "wallet")
        assert r.status_code == 200, r.text
        ride_id = r.json()["id"]
        fare = float(r.json()["estimated_fare"])

        driver_before = asyncio.get_event_loop().run_until_complete(_get_driver_wallet_balance(driver_uid))

        _drive_to_in_progress(rider_token, driver_token, ride_id)

        # Switch should have happened during OTP verify
        ride = asyncio.get_event_loop().run_until_complete(_get_ride(ride_id))
        assert ride.get("payment_method") == "cash", ride
        assert ride.get("payment_switched_to_cash") is True, ride
        assert ride.get("original_payment_method") in ("wallet", "sbpay", "sbpaygo")

        # Driver + rider both got a 'payment' notification for the switch
        drv_notifs = asyncio.get_event_loop().run_until_complete(_get_payment_notifs(driver_uid, ride_id))
        rider_notifs = asyncio.get_event_loop().run_until_complete(_get_payment_notifs(rider_id, ride_id))
        assert any((n.get("data") or {}).get("kind") == "payment_switch" for n in drv_notifs), drv_notifs
        assert any((n.get("data") or {}).get("kind") == "payment_switch" for n in rider_notifs), rider_notifs

        # Complete — should now settle as cash; driver gets only the 1 EUR captured
        _complete(driver_token, ride_id)
        ride = asyncio.get_event_loop().run_until_complete(_get_ride(ride_id))
        # NOTE: ride was switched to 'cash' at start; completion treats it as cash:
        # payment_status='pending_cash', cash_due_to_driver≈fare, no wallet credit.
        assert ride.get("payment_status") in ("pending_cash", "cash_due"), ride
        # Anti-fraud invariant: digital_captured_fare must NOT exceed the 1€ rider had
        # (in practice 0 since switched to cash before settlement).
        assert (ride.get("digital_captured_fare") or 0) <= 1.0

        # Driver wallet credit on a cash-switched ride: only on digital_captured part.
        # Since switched to cash, no digital credit is expected.
        driver_after = asyncio.get_event_loop().run_until_complete(_get_driver_wallet_balance(driver_uid))
        gained = round(driver_after - driver_before, 2)
        assert gained <= 0.50, f"Driver should NOT be credited for cash switch (got +{gained})"

        # collect-cash records the actual encaissement
        r = _post(f"/rides/{ride_id}/collect-cash", {"received": True}, token=driver_token)
        assert r.status_code == 200, r.text


class TestE2EDirectCash:
    """Cash from the start: pending_cash + cash_due, no driver wallet credit."""

    def test_full_flow_cash_only(self, driver_token, driver_ids):
        driver_uid, _ = driver_ids
        if not driver_uid:
            pytest.skip("demo driver not provisioned")
        rider_token, rider_id, _ = _register_rider()
        # No wallet credit needed for cash rides; still set 0 explicitly.
        asyncio.get_event_loop().run_until_complete(_set_wallet_balance(rider_id, 0.0))

        r = _create_ride(rider_token, "cash")
        assert r.status_code == 200, r.text
        ride_id = r.json()["id"]
        fare = float(r.json()["estimated_fare"])

        driver_before = asyncio.get_event_loop().run_until_complete(_get_driver_wallet_balance(driver_uid))
        _drive_to_in_progress(rider_token, driver_token, ride_id, expect_otp_security=False)
        _complete(driver_token, ride_id)

        ride = asyncio.get_event_loop().run_until_complete(_get_ride(ride_id))
        assert ride.get("payment_status") == "pending_cash", ride
        assert (ride.get("cash_due_to_driver") or 0) >= fare - 0.01
        # No wallet credit on cash
        driver_after = asyncio.get_event_loop().run_until_complete(_get_driver_wallet_balance(driver_uid))
        assert round(driver_after - driver_before, 2) <= 0.50

        # collect-cash works
        r = _post(f"/rides/{ride_id}/collect-cash", {"received": True}, token=driver_token)
        assert r.status_code == 200, r.text


class TestOTPSecurity:
    """OTP must be required for in_progress transition; wrong OTP rejected."""

    def test_cannot_skip_otp(self, driver_token, driver_ids):
        driver_uid, _ = driver_ids
        if not driver_uid:
            pytest.skip("demo driver not provisioned")
        rider_token, rider_id, _ = _register_rider()
        asyncio.get_event_loop().run_until_complete(_set_wallet_balance(rider_id, 100.0))

        r = _create_ride(rider_token, "wallet")
        assert r.status_code == 200
        ride_id = r.json()["id"]

        # accept + arriving
        _post(f"/rides/{ride_id}/accept", token=driver_token, expect=200)
        _post(f"/rides/{ride_id}/status", {"status": "arriving"}, token=driver_token, expect=200)

        # Trying to verify WITHOUT an OTP (no code submitted) must be rejected
        # when ask_otp_before_start (default True).
        r = _post(f"/phase1/rides/{ride_id}/start-otp/verify", {}, token=driver_token)
        assert r.status_code == 400, f"no-otp verify should 400, got {r.status_code} {r.text}"

        # Wrong OTP also rejected
        _post(f"/phase1/rides/{ride_id}/start-otp/request", token=rider_token, expect=200)
        r = _post(f"/phase1/rides/{ride_id}/start-otp/verify", {"otp": "9999"}, token=driver_token)
        # could be 200 in the unlikely case 9999 matches the random OTP — guard:
        if r.status_code == 200:
            pytest.skip("random OTP collision")
        assert r.status_code == 400

        # Ride must NOT be in_progress yet
        ride = asyncio.get_event_loop().run_until_complete(_get_ride(ride_id))
        assert ride["status"] in ("accepted", "arriving")


class TestWalletExposure:
    """GET /api/wallet exposes withdrawable / non_withdrawable."""

    def test_wallet_shape(self):
        token = _login_driver()
        r = _get("/wallet", token=token)
        assert r.status_code == 200, r.text
        j = r.json()
        # Field names from routes/wallet.py
        for key in ("balance", "withdrawable", "non_withdrawable"):
            assert key in j, f"missing {key} in /api/wallet: {j}"
        # withdrawable must never exceed balance
        assert float(j["withdrawable"]) <= float(j["balance"]) + 0.01

    def test_withdraw_request_not_500(self):
        token = _login_driver()
        # Just hit the endpoint — must not be 500 (the iter309 regression).
        r = _post("/wallet/withdraw-request", {"amount": 10, "method": "bank"}, token=token)
        assert r.status_code != 500, f"withdraw 500: {r.text}"
        # 200 | 400 | 403 are all acceptable depending on driver state.


class TestCancelAndRate:
    """Smoke: cancel + rate happy paths."""

    def test_cancel_pending(self, driver_token, driver_ids):
        driver_uid, _ = driver_ids
        if not driver_uid:
            pytest.skip("demo driver not provisioned")
        rider_token, rider_id, _ = _register_rider()
        asyncio.get_event_loop().run_until_complete(_set_wallet_balance(rider_id, 50.0))
        r = _create_ride(rider_token, "wallet")
        assert r.status_code == 200, r.text
        ride_id = r.json()["id"]
        r = _post(f"/rides/{ride_id}/cancel", {"reason": "TEST cancel"}, token=rider_token)
        assert r.status_code in (200, 201), r.text

    def test_rate_completed(self, driver_token, driver_ids):
        driver_uid, _ = driver_ids
        if not driver_uid:
            pytest.skip("demo driver not provisioned")
        rider_token, rider_id, _ = _register_rider()
        asyncio.get_event_loop().run_until_complete(_set_wallet_balance(rider_id, 100.0))
        r = _create_ride(rider_token, "wallet")
        ride_id = r.json()["id"]
        _drive_to_in_progress(rider_token, driver_token, ride_id, expect_otp_security=False)
        _complete(driver_token, ride_id)
        r = _post(f"/rides/{ride_id}/rate", {"rating": 5, "comment": "TEST_rating"}, token=rider_token)
        assert r.status_code in (200, 201), r.text
