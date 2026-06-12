"""Iter300 — Sécurité & Fraude : verrouillage wallet + dashboard admin anti-fraude."""
import os
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://gojek-clone-41.preview.emergentagent.com").rstrip("/")
USER_EMAIL, USER_PWD = "paul.vendeur@example.com", "Test1234!"
ADMIN_EMAIL, ADMIN_PWD = "admin@superapp.com", "SuperAdmin123!"


def _login(email, pwd):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": pwd}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def _h(t):
    return {"Authorization": f"Bearer {t}", "Content-Type": "application/json"}


def test_user_cannot_self_refund():
    t = _login(USER_EMAIL, USER_PWD)
    r = requests.post(f"{BASE_URL}/api/wallet/refund", headers=_h(t), json={"amount": 500}, timeout=15)
    assert r.status_code == 403


def test_user_cannot_unverified_topup():
    t = _login(USER_EMAIL, USER_PWD)
    r = requests.post(f"{BASE_URL}/api/wallet/topup", headers=_h(t), json={"amount": 200}, timeout=15)
    assert r.status_code == 403


def test_user_cannot_access_fraud_dashboard():
    t = _login(USER_EMAIL, USER_PWD)
    r = requests.get(f"{BASE_URL}/api/fraud/summary", headers=_h(t), timeout=15)
    assert r.status_code == 403


def test_admin_fraud_dashboard_and_block_cycle():
    at = _login(ADMIN_EMAIL, ADMIN_PWD)
    # summary + alerts + risk reachable
    for path in ("/api/fraud/summary", "/api/fraud/alerts?resolved=false", "/api/fraud/wallet-risk"):
        r = requests.get(f"{BASE_URL}{path}", headers=_h(at), timeout=15)
        assert r.status_code == 200, f"{path} -> {r.status_code}"
    # block / unblock a normal user
    pt = _login(USER_EMAIL, USER_PWD)
    uid = requests.get(f"{BASE_URL}/api/auth/me", headers=_h(pt), timeout=15).json()["id"]
    rb = requests.post(f"{BASE_URL}/api/fraud/users/{uid}/block", headers=_h(at), json={"reason": "pytest"}, timeout=15)
    assert rb.status_code == 200
    # blocked user cannot transfer
    rt = requests.post(f"{BASE_URL}/api/wallet/transfer", headers=_h(pt), json={"to_user_id": "x", "amount": 5}, timeout=15)
    assert rt.status_code == 403
    # unblock restores
    ru = requests.post(f"{BASE_URL}/api/fraud/users/{uid}/unblock", headers=_h(at), json={}, timeout=15)
    assert ru.status_code == 200


def test_admin_cannot_be_blocked():
    at = _login(ADMIN_EMAIL, ADMIN_PWD)
    auid = requests.get(f"{BASE_URL}/api/auth/me", headers=_h(at), timeout=15).json()["id"]
    r = requests.post(f"{BASE_URL}/api/fraud/users/{auid}/block", headers=_h(at), json={}, timeout=15)
    assert r.status_code == 400
