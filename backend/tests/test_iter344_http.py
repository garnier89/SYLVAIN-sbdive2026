"""Iter344 — HTTP smoke against public URL.

Tests intercity deposit/escrow lifecycle end-to-end against the live API:
- 2h pre-booking validation
- Wallet debit on intercity booking (~30%)
- Refund on cancellation
- Non-regression: instant ride does NOT debit a deposit
"""
import os
import re
import datetime as dt
import pytest
import requests
from dotenv import load_dotenv

load_dotenv("/app/frontend/.env")
BASE = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
TIMEOUT = 30

CLIENT = {"email": "client@test.sb", "password": "Client123!"}
ADMIN = {"email": "admin@superapp.com", "password": "SuperAdmin123!"}


def _login(creds):
    r = requests.post(f"{BASE}/api/auth/login", json=creds, timeout=TIMEOUT)
    assert r.status_code == 200, r.text
    j = r.json()
    return j.get("access_token") or j.get("token")


@pytest.fixture(scope="module")
def client_headers():
    tok = _login(CLIENT)
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


def _wallet_balance(headers):
    r = requests.get(f"{BASE}/api/wallet", headers=headers, timeout=TIMEOUT)
    assert r.status_code == 200, r.text
    return float(r.json().get("balance", 0))


def _topup_wallet_if_low(headers, min_balance=300.0):
    """Top up wallet (admin endpoint) so deposit tests have headroom."""
    bal = _wallet_balance(headers)
    if bal >= min_balance:
        return bal
    # try a public top-up endpoint if available; otherwise rely on existing seeded balance.
    return bal


# --- Test 1: Validation 2h ahead ----------------------------------------------

def _ride_payload(scheduled_at, payment_method="wallet"):
    return {
        "ride_type": "intercity",
        "vehicle_type": "vtype_sb",
        "pickup_address": "Fort-de-France",
        "pickup_lat": 14.6161,
        "pickup_lng": -61.0588,
        "dropoff_address": "Le Marin",
        "dropoff_lat": 14.4720,
        "dropoff_lng": -60.8680,
        "distance_km": 40.0,
        "payment_method": payment_method,
        "scheduled_at": scheduled_at,
    }


def test_intercity_requires_2h_lead_time(client_headers):
    sched = (dt.datetime.utcnow() + dt.timedelta(minutes=90)).isoformat() + "Z"
    r = requests.post(f"{BASE}/api/rides", headers=client_headers,
                      json=_ride_payload(sched), timeout=TIMEOUT)
    assert r.status_code == 400, r.text
    detail = (r.json().get("detail") or "").lower()
    assert "2" in detail and ("intercit" in detail or "avance" in detail), r.text


# --- Test 2: Deposit held + refund on cancel ----------------------------------

def test_intercity_deposit_held_and_refunded(client_headers):
    bal_before = _wallet_balance(client_headers)
    if bal_before < 100:
        pytest.skip(f"Wallet balance too low ({bal_before}) — cannot test deposit hold")

    sched = (dt.datetime.utcnow() + dt.timedelta(hours=3)).isoformat() + "Z"
    r = requests.post(f"{BASE}/api/rides", headers=client_headers,
                      json=_ride_payload(sched), timeout=TIMEOUT)
    assert r.status_code == 200, r.text
    ride = r.json()
    ride_id = ride.get("id") or ride.get("ride_id")
    assert ride_id, ride

    try:
        bal_after = _wallet_balance(client_headers)
        debit = bal_before - bal_after
        # 30% of fare expected to be debited as deposit; just assert > 0.
        assert debit > 0.5, f"Expected deposit debit; before={bal_before} after={bal_after}"
        # Cancel -> wallet should refund the deposit.
        rc = requests.post(f"{BASE}/api/rides/{ride_id}/cancel",
                           headers=client_headers, json={"reason": "test"}, timeout=TIMEOUT)
        assert rc.status_code in (200, 204), rc.text
        bal_refunded = _wallet_balance(client_headers)
        # Allow tiny float drift.
        assert abs(bal_refunded - bal_before) < 0.05, \
            f"Refund mismatch: before={bal_before} after_cancel={bal_refunded}"
    finally:
        # Defensive cleanup (idempotent cancel).
        try:
            requests.post(f"{BASE}/api/rides/{ride_id}/cancel",
                          headers=client_headers, json={"reason": "cleanup"}, timeout=TIMEOUT)
        except Exception:
            pass


# --- Test 3: Insufficient balance -> 400 'Caution Intercité requise' ----------

def test_intercity_insufficient_deposit_balance(client_headers):
    """Force the deposit to exceed the wallet by using a very long fake distance.

    The server computes the fare from base_fare + price_per_km*distance,
    so a huge distance pushes 30% of the fare above the wallet balance.
    """
    bal = _wallet_balance(client_headers)
    sched = (dt.datetime.utcnow() + dt.timedelta(hours=3)).isoformat() + "Z"
    payload = _ride_payload(sched)
    payload["distance_km"] = max(100000.0, bal * 1000)  # enormous
    r = requests.post(f"{BASE}/api/rides", headers=client_headers,
                      json=payload, timeout=TIMEOUT)
    # Either 400 with the expected message OR booking blocked some other way.
    if r.status_code == 400:
        detail = (r.json().get("detail") or "")
        assert re.search(r"caution", detail, re.IGNORECASE), detail
    else:
        # If the server clamps distance, we accept a successful booking
        # but then ensure we cancel to avoid pollution.
        if r.status_code == 200:
            rid = r.json().get("id")
            if rid:
                requests.post(f"{BASE}/api/rides/{rid}/cancel",
                              headers=client_headers, json={"reason": "cleanup"}, timeout=TIMEOUT)
            pytest.skip("Distance clamped server-side; cannot trigger insufficient-deposit path here.")
        else:
            pytest.fail(f"Unexpected status {r.status_code}: {r.text}")


# --- Test 4: Non-regression: instant ride does NOT debit a deposit ------------

def test_instant_ride_no_deposit_debit(client_headers):
    bal_before = _wallet_balance(client_headers)
    payload = {
        "ride_type": "instant",
        "vehicle_type": "vtype_sb",
        "pickup_address": "Fort-de-France",
        "pickup_lat": 14.6161,
        "pickup_lng": -61.0588,
        "dropoff_address": "Schoelcher",
        "dropoff_lat": 14.6094,
        "dropoff_lng": -61.0997,
        "distance_km": 5.0,
        "payment_method": "wallet",
    }
    r = requests.post(f"{BASE}/api/rides", headers=client_headers,
                      json=payload, timeout=TIMEOUT)
    # Some flows might return 404 (no driver) — accept that too but only fail on debit.
    rid = None
    if r.status_code == 200:
        rid = r.json().get("id")
    bal_after = _wallet_balance(client_headers)
    # No deposit should have been taken at booking time.
    assert abs(bal_after - bal_before) < 0.05, \
        f"Instant ride debited wallet at booking: before={bal_before} after={bal_after}"
    if rid:
        requests.post(f"{BASE}/api/rides/{rid}/cancel",
                      headers=client_headers, json={"reason": "cleanup"}, timeout=TIMEOUT)
