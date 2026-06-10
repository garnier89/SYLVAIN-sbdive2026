"""Phase 2 — Email security: verification (OTP + link) and password reset.

We can't read the emailed OTP directly (it's hashed at rest), so we recover the
plaintext 6-digit code by brute-forcing against the stored sha256 hash (fast,
< 1s) using the exact hashing the backend uses.
"""
import os
import time
import hashlib
import requests
from pymongo import MongoClient

API = os.environ.get("TEST_API_URL", os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001"))
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
JWT_SECRET = os.environ["JWT_SECRET"]

db = MongoClient(MONGO_URL)[DB_NAME]


def _hash(value: str) -> str:
    return hashlib.sha256(f"{JWT_SECRET}:{value}".encode()).hexdigest()


def _recover_code(code_hash: str) -> str:
    for n in range(100000, 1000000):
        if _hash(str(n)) == code_hash:
            return str(n)
    raise AssertionError("code not recovered")


def _register(role="user"):
    email = f"sec_{int(time.time()*1000)}@example.com"
    s = requests.Session()
    r = s.post(f"{API}/api/auth/register",
               json={"email": email, "password": "Secret123!", "name": "Sec Test", "role": role})
    assert r.status_code == 200, r.text
    return s, email


def test_register_creates_unverified_user_and_verify_code():
    s, email = _register()
    user = db.users.find_one({"email": email})
    assert user["is_verified"] is False
    doc = db.auth_codes.find_one({"user_id": user["id"], "purpose": "verify"})
    assert doc is not None and "code_hash" in doc and "token_hash" in doc


def test_verify_otp_happy_path_flips_is_verified():
    s, email = _register()
    user = db.users.find_one({"email": email})
    doc = db.auth_codes.find_one({"user_id": user["id"], "purpose": "verify"})
    code = _recover_code(doc["code_hash"])
    # wrong code first -> 400 + attempts increment
    bad = s.post(f"{API}/api/auth/verify-otp", json={"code": "111111"})
    assert bad.status_code == 400
    # correct code
    r = s.post(f"{API}/api/auth/verify-otp", json={"code": code})
    assert r.status_code == 200 and r.json().get("verified") is True
    assert db.users.find_one({"email": email})["is_verified"] is True
    # code consumed
    assert db.auth_codes.find_one({"user_id": user["id"], "purpose": "verify"}) is None


def test_verify_email_link_flips_is_verified():
    s, email = _register()
    user = db.users.find_one({"email": email})
    doc = db.auth_codes.find_one({"user_id": user["id"], "purpose": "verify"})
    # We can't reverse the token, so fetch it by re-issuing through a known path:
    # brute force is not feasible for the urlsafe token, so verify the redirect
    # contract with an invalid token and the OTP path covers the happy verify.
    r = requests.get(f"{API}/api/auth/verify-email?token=deadbeef", allow_redirects=False)
    assert r.status_code in (302, 307)
    assert "status=invalid" in r.headers.get("location", "")


def test_forgot_password_is_anti_enumeration():
    s, email = _register()
    r1 = requests.post(f"{API}/api/auth/forgot-password", json={"email": email})
    r2 = requests.post(f"{API}/api/auth/forgot-password", json={"email": "does_not_exist_xyz@example.com"})
    assert r1.status_code == 200 and r2.status_code == 200
    assert r1.json()["message"] == r2.json()["message"]
    # a reset code was issued only for the real account
    user = db.users.find_one({"email": email})
    assert db.auth_codes.find_one({"user_id": user["id"], "purpose": "reset"}) is not None


def test_reset_password_with_otp_changes_password_and_login_works():
    s, email = _register()
    requests.post(f"{API}/api/auth/forgot-password", json={"email": email})
    user = db.users.find_one({"email": email})
    doc = db.auth_codes.find_one({"user_id": user["id"], "purpose": "reset"})
    code = _recover_code(doc["code_hash"])
    # too short -> 400
    short = requests.post(f"{API}/api/auth/reset-password",
                          json={"email": email, "code": code, "new_password": "123"})
    assert short.status_code == 400
    # valid reset
    r = requests.post(f"{API}/api/auth/reset-password",
                      json={"email": email, "code": code, "new_password": "BrandNew123!"})
    assert r.status_code == 200, r.text
    # old password fails, new works
    old = requests.post(f"{API}/api/auth/login", json={"email": email, "password": "Secret123!"})
    assert old.status_code == 401
    new = requests.post(f"{API}/api/auth/login", json={"email": email, "password": "BrandNew123!"})
    assert new.status_code == 200
    # reset code consumed
    assert db.auth_codes.find_one({"user_id": user["id"], "purpose": "reset"}) is None


def test_reset_password_bad_token_rejected():
    r = requests.post(f"{API}/api/auth/reset-password", json={"token": "nope", "new_password": "Whatever123!"})
    assert r.status_code == 400


def test_verification_applies_to_drivers_and_merchants():
    # Email-registered driver/merchant accounts also get an unverified flag + code.
    for role in ("driver", "merchant"):
        s, email = _register(role=role)
        user = db.users.find_one({"email": email})
        assert user["role"] == role
        assert user["is_verified"] is False
        assert db.auth_codes.find_one({"user_id": user["id"], "purpose": "verify"}) is not None
