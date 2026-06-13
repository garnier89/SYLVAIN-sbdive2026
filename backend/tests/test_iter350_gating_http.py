"""Iter350 — HTTP gating + auth non-regression (Firebase + Twilio feature flags off).

Tests the externally-exposed endpoints via REACT_APP_BACKEND_URL to verify:
 1. Firebase phone-OTP endpoints are properly gated when credentials missing
 2. Masked-call endpoints require auth
 3. Existing email + phone login flows still work (non-regression)
"""
import os
import pytest
import requests
from dotenv import load_dotenv

load_dotenv("/app/frontend/.env")

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
ADMIN_EMAIL = "admin@superapp.com"
ADMIN_PASSWORD = "SuperAdmin123!"
DRIVER_PHONE = "+33644112233"
DRIVER_PASSWORD = "Chauffeur2026!"


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
                      timeout=15)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    data = r.json()
    tok = data.get("access_token") or data.get("token")
    assert tok, f"no token in admin login response: {data}"
    return tok


# ============================================================
# Firebase gating
# ============================================================

def test_firebase_status_disabled():
    r = requests.get(f"{BASE_URL}/api/auth/firebase/status", timeout=10)
    assert r.status_code == 200
    body = r.json()
    assert "enabled" in body
    assert body["enabled"] is False, f"Firebase should be disabled w/o creds: {body}"


def test_firebase_verify_phone_requires_auth():
    # No Authorization header → must reject (401/403) before checking firebase_enabled.
    r = requests.post(f"{BASE_URL}/api/auth/firebase/verify-phone",
                      json={"id_token": "fake"}, timeout=10)
    assert r.status_code in (401, 403), f"expected 401/403, got {r.status_code}: {r.text}"


def test_firebase_verify_phone_authed_but_disabled(admin_token):
    # With valid auth but firebase disabled → 503
    r = requests.post(f"{BASE_URL}/api/auth/firebase/verify-phone",
                      json={"id_token": "anything"},
                      headers={"Authorization": f"Bearer {admin_token}"},
                      timeout=10)
    assert r.status_code == 503, f"expected 503 (firebase disabled), got {r.status_code}: {r.text}"


def test_firebase_login_disabled_returns_503():
    r = requests.post(f"{BASE_URL}/api/auth/firebase/login",
                      json={"id_token": "fake"}, timeout=10)
    assert r.status_code == 503, f"expected 503, got {r.status_code}: {r.text}"


# ============================================================
# Calls gating
# ============================================================

def test_calls_status_requires_auth():
    r = requests.get(f"{BASE_URL}/api/calls/ride/test/status", timeout=10)
    assert r.status_code in (401, 403), f"expected 401/403, got {r.status_code}: {r.text}"


# ============================================================
# Auth non-regression
# ============================================================

def test_admin_email_login(admin_token):
    # admin_token fixture itself validates 200 + token. Now ping /me.
    r = requests.get(f"{BASE_URL}/api/auth/me",
                     headers={"Authorization": f"Bearer {admin_token}"},
                     timeout=10)
    assert r.status_code == 200, f"GET /auth/me failed: {r.status_code} {r.text}"
    me = r.json()
    assert me.get("email") == ADMIN_EMAIL
    assert me.get("role") == "admin"


def test_driver_phone_login():
    r = requests.post(f"{BASE_URL}/api/auth/phone-login",
                      json={"phone": DRIVER_PHONE, "password": DRIVER_PASSWORD},
                      timeout=15)
    assert r.status_code == 200, f"phone login failed: {r.status_code} {r.text}"
    data = r.json()
    tok = data.get("access_token") or data.get("token")
    assert tok, f"no token in phone login response: {data}"
    user = data.get("user") or {}
    assert user.get("phone") == DRIVER_PHONE or user.get("role") in ("driver", "user")
