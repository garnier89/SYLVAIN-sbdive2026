"""Iter77: POST /api/admin/users/{id}/wallet/credit — admin manual wallet credit/debit.

Acceptance criteria:
- amount > 0 -> credit, type=admin_credit, wallet balance increases
- amount < 0 -> debit, type=admin_debit, wallet balance decreases
- amount == 0 -> 400 'Montant requis'
- amount not numeric -> 400 'Montant invalide'
- user not found -> 404
- inserts wallet_transactions row with balance_after
- returns {new_balance, amount, type}
"""
import os
import secrets as _s
import requests
import pytest

BASE_URL = os.environ.get(
    "REACT_APP_BACKEND_URL",
    "https://taxi-marketplace-3.preview.emergentagent.com",
).rstrip("/")
from _creds import ADMIN_EMAIL, ADMIN_PASSWORD  # noqa: E402


@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    r = s.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    return s


@pytest.fixture()
def created_user(admin_session):
    suffix = _s.token_hex(3)
    payload = {
        "first_name": "TEST_Iter77",
        "last_name": "Wallet",
        "email": f"test_iter77_{suffix}@example.com",
        "password": "Iter77Pass!",
        "country": "FR",
        "phone_code": "+33",
        "phone": f"6{_s.randbelow(10**8):08d}",
        "language": "fr",
        "currency": "EUR",
    }
    r = admin_session.post(f"{BASE_URL}/api/admin/users", json=payload, timeout=15)
    assert r.status_code == 200, r.text
    uid = r.json()["id"]
    yield uid
    admin_session.delete(f"{BASE_URL}/api/admin/users/{uid}", timeout=15)


# ----- POSITIVE -----
def test_credit_positive_amount_increases_balance(admin_session, created_user):
    r = admin_session.post(
        f"{BASE_URL}/api/admin/users/{created_user}/wallet/credit",
        json={"amount": 25.50, "note": "Test credit positive"},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["amount"] == 25.50
    assert body["type"] == "admin_credit"
    assert body["new_balance"] == pytest.approx(25.50, rel=1e-3)

    # Verify wallet_balance is updated via GET
    g = admin_session.get(f"{BASE_URL}/api/admin/users/{created_user}", timeout=15)
    assert g.status_code == 200
    assert g.json()["wallet_balance"] == pytest.approx(25.50, rel=1e-3)


def test_credit_multiple_credits_accumulate(admin_session, created_user):
    r1 = admin_session.post(
        f"{BASE_URL}/api/admin/users/{created_user}/wallet/credit",
        json={"amount": 100.00}, timeout=15,
    )
    assert r1.status_code == 200
    r2 = admin_session.post(
        f"{BASE_URL}/api/admin/users/{created_user}/wallet/credit",
        json={"amount": 45.50, "note": "deuxieme credit"}, timeout=15,
    )
    assert r2.status_code == 200
    assert r2.json()["new_balance"] == pytest.approx(145.50, rel=1e-3)


def test_debit_negative_amount_decreases_balance(admin_session, created_user):
    # First credit 200
    admin_session.post(
        f"{BASE_URL}/api/admin/users/{created_user}/wallet/credit",
        json={"amount": 200.00}, timeout=15,
    )
    # Then debit 5
    r = admin_session.post(
        f"{BASE_URL}/api/admin/users/{created_user}/wallet/credit",
        json={"amount": -5.00, "note": "remboursement"},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["amount"] == -5.00
    assert body["type"] == "admin_debit"
    assert body["new_balance"] == pytest.approx(195.00, rel=1e-3)


# ----- NEGATIVE -----
def test_credit_zero_amount_returns_400(admin_session, created_user):
    r = admin_session.post(
        f"{BASE_URL}/api/admin/users/{created_user}/wallet/credit",
        json={"amount": 0}, timeout=15,
    )
    assert r.status_code == 400, r.text
    detail = r.json().get("detail", "")
    assert "Montant" in detail or "requis" in detail.lower()


def test_credit_missing_amount_returns_400(admin_session, created_user):
    r = admin_session.post(
        f"{BASE_URL}/api/admin/users/{created_user}/wallet/credit",
        json={"note": "no amount"}, timeout=15,
    )
    # missing -> coerced to 0 -> 400 Montant requis
    assert r.status_code == 400, r.text


def test_credit_invalid_amount_returns_400(admin_session, created_user):
    r = admin_session.post(
        f"{BASE_URL}/api/admin/users/{created_user}/wallet/credit",
        json={"amount": "not-a-number"}, timeout=15,
    )
    assert r.status_code == 400, r.text
    detail = r.json().get("detail", "")
    assert "invalide" in detail.lower() or "Montant" in detail


def test_credit_user_not_found_404(admin_session):
    r = admin_session.post(
        f"{BASE_URL}/api/admin/users/user_doesnt_exist_zzz/wallet/credit",
        json={"amount": 10}, timeout=15,
    )
    assert r.status_code == 404


def test_credit_requires_admin_auth():
    # No session = no cookie -> 401/403
    r = requests.post(
        f"{BASE_URL}/api/admin/users/user_xyz/wallet/credit",
        json={"amount": 10}, timeout=15,
    )
    assert r.status_code in (401, 403)


# ----- SMOKE: end-to-end smoke matching the manual test in agent context -----
def test_smoke_e2e_credit_then_debit_flow(admin_session, created_user):
    """Mirror of the manual validation: start at 145 -> +25.50 -> 170.50 -> -5 -> 165.50."""
    # Bring to 145
    admin_session.post(
        f"{BASE_URL}/api/admin/users/{created_user}/wallet/credit",
        json={"amount": 145.00}, timeout=15,
    )
    # +25.50 -> 170.50
    r = admin_session.post(
        f"{BASE_URL}/api/admin/users/{created_user}/wallet/credit",
        json={"amount": 25.50, "note": "bonus"}, timeout=15,
    )
    assert r.json()["new_balance"] == pytest.approx(170.50, rel=1e-3)
    # -5 -> 165.50
    r = admin_session.post(
        f"{BASE_URL}/api/admin/users/{created_user}/wallet/credit",
        json={"amount": -5, "note": "correction"}, timeout=15,
    )
    assert r.json()["new_balance"] == pytest.approx(165.50, rel=1e-3)
    assert r.json()["type"] == "admin_debit"
