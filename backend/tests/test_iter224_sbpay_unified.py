"""
Iter 224 — SB Pay unified wallet tests.
Validates: unified balance (GET /wallet == GET /finance/balance),
Stripe checkout (preset + custom + invalid),
topup disabled, send + pay-ride debit/credit db.wallets,
pharmacy/real_estate unified payment methods.
"""
import os
import uuid
import pytest
import requests

def _load_frontend_env():
    p = "/app/frontend/.env"
    if os.path.exists(p):
        with open(p) as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL"):
                    return line.split("=", 1)[1].strip().strip('"').strip("'")
    return None

BASE = (os.environ.get("REACT_APP_BACKEND_URL") or _load_frontend_env()).rstrip("/")
API = f"{BASE}/api"

USER_EMAIL = "test2@example.com"
USER_PW = "TestPass123!"
ADMIN_EMAIL = "admin@superapp.com"
ADMIN_PW = "SuperAdmin123!"
MERCH_EMAIL = "merchant@example.com"
MERCH_PW = "Merchant123!"


def _login(email, pw):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": pw}, timeout=20)
    assert r.status_code == 200, f"login failed {email}: {r.status_code} {r.text}"
    j = r.json()
    return j.get("token") or j.get("access_token")


@pytest.fixture(scope="module")
def user_token():
    return _login(USER_EMAIL, USER_PW)


@pytest.fixture(scope="module")
def admin_token():
    return _login(ADMIN_EMAIL, ADMIN_PW)


@pytest.fixture(scope="module")
def user_headers(user_token):
    return {"Authorization": f"Bearer {user_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


# ---------------- Unified balance ----------------
def test_wallet_and_finance_balance_match(user_headers):
    r1 = requests.get(f"{API}/wallet", headers=user_headers, timeout=20)
    r2 = requests.get(f"{API}/finance/balance", headers=user_headers, timeout=20)
    assert r1.status_code == 200, r1.text
    assert r2.status_code == 200, r2.text
    b1 = r1.json().get("balance")
    b2 = r2.json().get("balance")
    assert b1 is not None and b2 is not None
    assert round(float(b1), 2) == round(float(b2), 2), f"{b1} != {b2}"


# ---------------- Stripe checkout ----------------
def test_checkout_preset_50(user_headers):
    r = requests.post(
        f"{API}/payments/checkout",
        headers=user_headers,
        json={"package_id": "50", "origin_url": BASE},
        timeout=30,
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert "url" in data and data["url"].startswith("http")
    assert "session_id" in data


def test_checkout_custom_33(user_headers):
    r = requests.post(
        f"{API}/payments/checkout",
        headers=user_headers,
        json={"custom_amount": 33, "origin_url": BASE},
        timeout=30,
    )
    assert r.status_code == 200, r.text
    assert "url" in r.json()


def test_checkout_custom_invalid_high(user_headers):
    r = requests.post(
        f"{API}/payments/checkout",
        headers=user_headers,
        json={"custom_amount": 99999, "origin_url": BASE},
        timeout=20,
    )
    assert r.status_code == 400, r.text
    assert "invalide" in r.text.lower() or "invalid" in r.text.lower()


def test_checkout_custom_zero(user_headers):
    r = requests.post(
        f"{API}/payments/checkout",
        headers=user_headers,
        json={"custom_amount": 0, "origin_url": BASE},
        timeout=20,
    )
    assert r.status_code == 400, r.text


# ---------------- Topup disabled ----------------
def test_sbpaygo_topup_disabled(user_headers):
    r = requests.post(
        f"{API}/finance/sbpaygo/topup",
        headers=user_headers,
        json={"amount": 25, "source": "card"},
        timeout=20,
    )
    assert r.status_code == 400, r.text


# ---------------- Admin credit then send / pay-ride ----------------
def _get_user_id(token):
    r = requests.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {token}"}, timeout=20)
    assert r.status_code == 200, r.text
    return r.json()["id"]


@pytest.fixture(scope="module")
def funded_user(user_token, admin_headers):
    uid = _get_user_id(user_token)
    # Credit 200 EUR via admin endpoint
    r = requests.post(
        f"{API}/admin/users/{uid}/wallet/credit",
        headers=admin_headers,
        json={"amount": 200, "note": "iter224 funding"},
        timeout=20,
    )
    assert r.status_code in (200, 201), f"admin credit failed: {r.status_code} {r.text}"
    return uid


def test_send_debits_wallet_and_credits_merchant(user_token, user_headers, funded_user):
    # Get merchant phone via login then /auth/me
    m_tok = _login(MERCH_EMAIL, MERCH_PW)
    m_me = requests.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {m_tok}"}, timeout=20).json()
    m_phone = m_me.get("phone")
    if not m_phone:
        pytest.skip("merchant phone missing")
    # Pre balances
    sender_before = requests.get(f"{API}/wallet", headers=user_headers, timeout=20).json()["balance"]
    recipient_before = requests.get(
        f"{API}/wallet", headers={"Authorization": f"Bearer {m_tok}"}, timeout=20
    ).json()["balance"]
    amt = 7.5
    r = requests.post(
        f"{API}/finance/sbpaygo/send",
        headers=user_headers,
        json={"recipient_phone": m_phone, "amount": amt, "note": "iter224"},
        timeout=20,
    )
    assert r.status_code == 200, r.text
    j = r.json()
    assert j.get("ok") is True
    assert j.get("recipient_found") is True
    # Verify balances
    sender_after = requests.get(f"{API}/wallet", headers=user_headers, timeout=20).json()["balance"]
    recipient_after = requests.get(
        f"{API}/wallet", headers={"Authorization": f"Bearer {m_tok}"}, timeout=20
    ).json()["balance"]
    assert round(sender_before - sender_after, 2) == amt, f"sender {sender_before}->{sender_after}"
    assert round(recipient_after - recipient_before, 2) == amt, f"recipient {recipient_before}->{recipient_after}"


def test_send_insufficient(user_headers, funded_user):
    r = requests.post(
        f"{API}/finance/sbpaygo/send",
        headers=user_headers,
        json={"recipient_phone": "+33000000000", "amount": 999999, "note": "x"},
        timeout=20,
    )
    assert r.status_code == 400, r.text


def test_pay_ride_debits_unified_wallet(user_headers, funded_user):
    bal_before = requests.get(f"{API}/wallet", headers=user_headers, timeout=20).json()["balance"]
    ride_id = f"test_ride_{uuid.uuid4().hex[:8]}"
    amt = 5.0
    r = requests.post(
        f"{API}/finance/sbpaygo/pay-ride",
        headers=user_headers,
        json={"ride_id": ride_id, "amount": amt},
        timeout=20,
    )
    assert r.status_code == 200, r.text
    j = r.json()
    assert j.get("ok") is True
    bal_after = requests.get(f"{API}/wallet", headers=user_headers, timeout=20).json()["balance"]
    assert round(bal_before - bal_after, 2) == amt
    # API-reported balance should match GET /wallet
    assert round(float(j["balance"]), 2) == round(float(bal_after), 2)


def test_pay_ride_insufficient(user_headers):
    r = requests.post(
        f"{API}/finance/sbpaygo/pay-ride",
        headers=user_headers,
        json={"ride_id": "x", "amount": 9999999},
        timeout=20,
    )
    assert r.status_code == 400, r.text
    assert "SB Pay" in r.text or "insuff" in r.text.lower()


# ---------------- Pharmacy & RealEstate unified ----------------
def test_pharmacy_payment_methods_unified(user_headers):
    r = requests.get(f"{API}/pharmacy/payment-methods", headers=user_headers, timeout=20)
    assert r.status_code == 200, r.text
    j = r.json()
    methods = j.get("methods") or j.get("payment_methods") or j
    if isinstance(methods, dict) and "methods" in methods:
        methods = methods["methods"]
    # Should contain a wallet method labeled SB Pay
    ids = [m.get("id") for m in methods]
    assert "wallet" in ids, f"wallet missing: {ids}"
    assert "sbpaygo" not in ids, f"sbpaygo should be removed: {ids}"
    wallet = next(m for m in methods if m.get("id") == "wallet")
    assert "SB Pay" in (wallet.get("label") or ""), wallet
    assert "balance" in wallet


def test_real_estate_boost_payment_methods_unified(user_headers):
    r = requests.get(f"{API}/real-estate/boost/payment-methods", headers=user_headers, timeout=20)
    assert r.status_code == 200, r.text
    j = r.json()
    methods = j.get("methods") or j
    if isinstance(methods, dict) and "methods" in methods:
        methods = methods["methods"]
    ids = [m.get("id") for m in methods]
    assert "wallet" in ids, f"wallet missing: {ids}"
    assert "sbpaygo" not in ids, f"sbpaygo should be removed: {ids}"
