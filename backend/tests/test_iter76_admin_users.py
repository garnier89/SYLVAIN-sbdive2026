"""Iter76: dedicated tests for new admin users CRUD endpoints.

Endpoints:
- GET    /api/admin/users/{id}  (returns user with wallet_balance, 404 if missing)
- POST   /api/admin/users        (creates user + wallet, bcrypt password, dup checks)
- PUT    /api/admin/users/{id}   (partial update, dup checks, is_active toggle)
- DELETE /api/admin/users/{id}   (deletes user + wallet, blocks admin role)
"""
import os
import secrets as _s
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://taxi-marketplace-3.preview.emergentagent.com").rstrip("/")
from _creds import ADMIN_EMAIL, ADMIN_PASSWORD  # noqa: E402


@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login",
               json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
    assert r.status_code == 200, r.text
    return s


def _payload(suffix: str, **over):
    p = {
        "first_name": "TEST_Iter76",
        "last_name": "User",
        "email": f"test_iter76_{suffix}@example.com",
        "password": "Iter76Pass!",
        "country": "FR",
        "phone_code": "+33",
        "phone": f"6{_s.randbelow(10**8):08d}",
        "language": "fr",
        "currency": "EUR",
        "avatar_url": None,
    }
    p.update(over)
    return p


# ----- CREATE -----
def test_create_user_success_and_wallet(admin_session):
    suffix = _s.token_hex(3)
    payload = _payload(suffix)
    r = admin_session.post(f"{BASE_URL}/api/admin/users", json=payload, timeout=15)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["email"] == payload["email"].lower()
    assert body["first_name"] == payload["first_name"]
    assert body["last_name"] == payload["last_name"]
    assert body["country"] == "FR"
    assert body["language"] == "fr"
    assert body["currency"] == "EUR"
    assert body["role"] == "user"
    assert body.get("id", "").startswith("user_")
    assert "password_hash" not in body
    assert "_id" not in body
    user_id = body["id"]
    try:
        # Verify GET returns wallet_balance
        g = admin_session.get(f"{BASE_URL}/api/admin/users/{user_id}", timeout=15)
        assert g.status_code == 200, g.text
        gd = g.json()
        assert gd["id"] == user_id
        assert gd["email"] == payload["email"].lower()
        assert "wallet_balance" in gd
        assert gd["wallet_balance"] == 0
        assert "password_hash" not in gd
    finally:
        admin_session.delete(f"{BASE_URL}/api/admin/users/{user_id}", timeout=15)


def test_create_user_missing_fields_400(admin_session):
    r = admin_session.post(f"{BASE_URL}/api/admin/users",
                           json={"first_name": "", "email": "", "password": ""}, timeout=15)
    assert r.status_code == 400, r.text


def test_create_user_duplicate_email_400(admin_session):
    suffix = _s.token_hex(3)
    p = _payload(suffix)
    r1 = admin_session.post(f"{BASE_URL}/api/admin/users", json=p, timeout=15)
    assert r1.status_code == 200, r1.text
    uid = r1.json()["id"]
    try:
        # same email, different phone
        p2 = _payload(_s.token_hex(3), email=p["email"])
        r2 = admin_session.post(f"{BASE_URL}/api/admin/users", json=p2, timeout=15)
        assert r2.status_code == 400, r2.text
    finally:
        admin_session.delete(f"{BASE_URL}/api/admin/users/{uid}", timeout=15)


def test_create_user_duplicate_phone_400(admin_session):
    suffix = _s.token_hex(3)
    p = _payload(suffix)
    r1 = admin_session.post(f"{BASE_URL}/api/admin/users", json=p, timeout=15)
    assert r1.status_code == 200, r1.text
    uid = r1.json()["id"]
    try:
        # same phone, different email
        p2 = _payload(_s.token_hex(3), phone=p["phone"], phone_code=p["phone_code"])
        r2 = admin_session.post(f"{BASE_URL}/api/admin/users", json=p2, timeout=15)
        assert r2.status_code == 400, r2.text
    finally:
        admin_session.delete(f"{BASE_URL}/api/admin/users/{uid}", timeout=15)


# ----- GET -----
def test_get_user_404(admin_session):
    r = admin_session.get(f"{BASE_URL}/api/admin/users/user_does_not_exist_xyz", timeout=15)
    assert r.status_code == 404


# ----- UPDATE -----
def test_update_user_partial_and_persistence(admin_session):
    suffix = _s.token_hex(3)
    p = _payload(suffix)
    r = admin_session.post(f"{BASE_URL}/api/admin/users", json=p, timeout=15)
    assert r.status_code == 200
    uid = r.json()["id"]
    try:
        new_email = f"test_iter76_upd_{suffix}@example.com"
        u = admin_session.put(f"{BASE_URL}/api/admin/users/{uid}", json={
            "first_name": "Iter76Renamed",
            "last_name": "Updated",
            "email": new_email,
            "language": "en",
            "currency": "USD",
            "is_active": False,
        }, timeout=15)
        assert u.status_code == 200, u.text
        assert u.json().get("updated") is True

        g = admin_session.get(f"{BASE_URL}/api/admin/users/{uid}", timeout=15)
        gd = g.json()
        assert gd["first_name"] == "Iter76Renamed"
        assert gd["last_name"] == "Updated"
        assert gd["email"] == new_email.lower()
        assert gd["language"] == "en"
        assert gd["currency"] == "USD"
        assert gd.get("is_suspended") is True
        # name recomputed
        assert "Iter76Renamed" in (gd.get("name") or "")
    finally:
        admin_session.delete(f"{BASE_URL}/api/admin/users/{uid}", timeout=15)


def test_update_user_password_relogin(admin_session):
    suffix = _s.token_hex(3)
    p = _payload(suffix)
    r = admin_session.post(f"{BASE_URL}/api/admin/users", json=p, timeout=15)
    assert r.status_code == 200
    uid = r.json()["id"]
    try:
        new_pwd = "NewPwd123!"
        u = admin_session.put(f"{BASE_URL}/api/admin/users/{uid}",
                              json={"password": new_pwd}, timeout=15)
        assert u.status_code == 200
        # Verify login with new password
        login = requests.post(f"{BASE_URL}/api/auth/login",
                              json={"email": p["email"], "password": new_pwd}, timeout=15)
        assert login.status_code == 200, login.text
    finally:
        admin_session.delete(f"{BASE_URL}/api/admin/users/{uid}", timeout=15)


def test_update_user_email_collision_400(admin_session):
    s1, s2 = _s.token_hex(3), _s.token_hex(3)
    pa = _payload(s1)
    pb = _payload(s2)
    ra = admin_session.post(f"{BASE_URL}/api/admin/users", json=pa, timeout=15)
    rb = admin_session.post(f"{BASE_URL}/api/admin/users", json=pb, timeout=15)
    assert ra.status_code == 200 and rb.status_code == 200
    a_id, b_id = ra.json()["id"], rb.json()["id"]
    try:
        r = admin_session.put(f"{BASE_URL}/api/admin/users/{b_id}",
                              json={"email": pa["email"]}, timeout=15)
        assert r.status_code == 400, r.text
    finally:
        admin_session.delete(f"{BASE_URL}/api/admin/users/{a_id}", timeout=15)
        admin_session.delete(f"{BASE_URL}/api/admin/users/{b_id}", timeout=15)


def test_update_user_phone_collision_400(admin_session):
    s1, s2 = _s.token_hex(3), _s.token_hex(3)
    pa = _payload(s1)
    pb = _payload(s2)
    ra = admin_session.post(f"{BASE_URL}/api/admin/users", json=pa, timeout=15)
    rb = admin_session.post(f"{BASE_URL}/api/admin/users", json=pb, timeout=15)
    assert ra.status_code == 200 and rb.status_code == 200
    a_id, b_id = ra.json()["id"], rb.json()["id"]
    try:
        # try to set B's phone equal to A's phone (raw digits + phone_code)
        r = admin_session.put(f"{BASE_URL}/api/admin/users/{b_id}",
                              json={"phone": pa["phone"], "phone_code": pa["phone_code"]}, timeout=15)
        assert r.status_code == 400, r.text
    finally:
        admin_session.delete(f"{BASE_URL}/api/admin/users/{a_id}", timeout=15)
        admin_session.delete(f"{BASE_URL}/api/admin/users/{b_id}", timeout=15)


def test_update_user_404(admin_session):
    r = admin_session.put(f"{BASE_URL}/api/admin/users/user_nope_xyz",
                          json={"first_name": "X"}, timeout=15)
    assert r.status_code == 404


# ----- DELETE -----
def test_delete_user_removes_wallet(admin_session):
    suffix = _s.token_hex(3)
    p = _payload(suffix)
    r = admin_session.post(f"{BASE_URL}/api/admin/users", json=p, timeout=15)
    uid = r.json()["id"]
    d = admin_session.delete(f"{BASE_URL}/api/admin/users/{uid}", timeout=15)
    assert d.status_code == 200, d.text
    assert d.json().get("deleted") is True
    # GET now 404
    g = admin_session.get(f"{BASE_URL}/api/admin/users/{uid}", timeout=15)
    assert g.status_code == 404


def test_delete_admin_blocked_400(admin_session):
    # The seeded admin must not be deletable through this endpoint
    me = admin_session.get(f"{BASE_URL}/api/auth/me", timeout=15)
    assert me.status_code == 200
    admin_id = me.json().get("id") or me.json().get("user_id")
    if not admin_id:
        pytest.skip("no admin id in /auth/me")
    d = admin_session.delete(f"{BASE_URL}/api/admin/users/{admin_id}", timeout=15)
    assert d.status_code == 400, d.text
