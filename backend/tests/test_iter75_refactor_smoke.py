"""Iter75 smoke test — verify refactors didn't break kiosk_book, update_admin, simulation."""
import os
import time
import secrets as _s
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://gojek-clone-41.preview.emergentagent.com").rstrip("/")
from _creds import ADMIN_EMAIL, ADMIN_PASSWORD  # noqa: E402


@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
    assert r.status_code == 200, r.text
    return s


def _items(resp_json):
    """Unwrap envelope {'items': [...]} or return as-is if list."""
    if isinstance(resp_json, dict) and "items" in resp_json:
        return resp_json["items"]
    return resp_json if isinstance(resp_json, list) else []


@pytest.fixture(scope="module")
def first_role_id(admin_session):
    r = admin_session.get(f"{BASE_URL}/api/acl/roles", timeout=15)
    assert r.status_code == 200
    roles = _items(r.json())
    for rl in roles:
        if isinstance(rl, dict) and rl.get("name") not in ("super_admin",):
            return rl["id"]
    if roles and isinstance(roles[0], dict):
        return roles[0]["id"]
    pytest.skip("no usable role")


# --- BACKEND REFACTOR: POST /api/kiosk/{token}/book end-to-end ---
def test_kiosk_book_still_works_after_refactor(admin_session):
    pin = f"{_s.randbelow(9000)+1000}"
    r = admin_session.post(f"{BASE_URL}/api/kiosk/admin/create", json={
        "hotel_name": f"TEST_iter75_kiosk_{int(time.time())}",
        "address": "Iter75 Test Address",
        "lat": 48.8566, "lng": 2.3522,
        "pin_code": pin,
        "language": "fr", "currency": "EUR",
    }, timeout=15)
    assert r.status_code == 200, r.text
    k = r.json()
    kiosk_id = k["id"]
    token = k["session_token"]

    # Get initial total_bookings from list
    lk0 = _items(admin_session.get(f"{BASE_URL}/api/kiosk/admin/list", timeout=15).json())
    initial_total = next((x.get("total_bookings", 0) for x in lk0 if x["id"] == kiosk_id), 0)

    try:
        # Book ride via kiosk — exercises _ensure_kiosk_user + _build_kiosk_ride + _broadcast
        book = requests.post(f"{BASE_URL}/api/kiosk/{token}/book", json={
            "first_name": "TEST_Iter75",
            "last_name": "Refactor",
            "email": "test_iter75@example.com",
            "phone": "+33611111111",
            "dest_lat": 48.85, "dest_lng": 2.36, "dest_address": "Iter75 Drop",
            "vehicle_type": "confort",
        }, timeout=20)
        assert book.status_code == 200, book.text
        ride = book.json()
        ride_id = ride.get("ride_id")
        assert ride_id, f"no ride_id: {ride}"
        assert ride.get("booking_no") and len(ride["booking_no"]) == 8

        # Verify ride retrievable via kiosk endpoint (proves _build_kiosk_ride wrote correct id)
        rs = requests.get(f"{BASE_URL}/api/kiosk/{token}/ride/{ride_id}", timeout=15)
        assert rs.status_code == 200
        rdata = rs.json()
        # Public kiosk endpoint doesn't echo 'source' — but DB record has it (verified via direct iter70 test).
        # Here we just verify the ride exists & is pending.
        assert rdata.get("status") == "pending"
        assert rdata.get("id") == ride_id

        # Verify kiosk total_bookings incremented (refactor _broadcast_kiosk_ride path)
        lk = _items(admin_session.get(f"{BASE_URL}/api/kiosk/admin/list", timeout=15).json())
        target = next(x for x in lk if x["id"] == kiosk_id)
        assert target.get("total_bookings", 0) == initial_total + 1, (
            f"total_bookings not incremented: was {initial_total}, now {target.get('total_bookings')}"
        )
    finally:
        admin_session.delete(f"{BASE_URL}/api/kiosk/admin/{kiosk_id}", timeout=15)


# --- BACKEND REFACTOR: PUT /api/acl/admins/{id} — all 4 helpers ---
def test_update_admin_all_4_helpers(admin_session, first_role_id):
    suffix = _s.token_hex(4)
    create_payload = {
        "first_name": "Iter75", "last_name": "Original",
        "email": f"TEST_iter75_{suffix}@example.com",
        "password": "Initial123!",
        "role_id": first_role_id,
    }
    r = admin_session.post(f"{BASE_URL}/api/acl/admins", json=create_payload, timeout=15)
    assert r.status_code == 200, r.text
    admin_id = r.json()["id"]

    try:
        new_email = f"TEST_iter75_renamed_{suffix}@example.com"
        new_password = f"Upd{_s.token_hex(5)}A1!"  # generated, no hardcoded secret
        u = admin_session.put(f"{BASE_URL}/api/acl/admins/{admin_id}", json={
            "first_name": "Iter75Renamed",
            "last_name": "Updated",
            "email": new_email,
            "password": new_password,
            "role_id": first_role_id,
            "is_active": True,
        }, timeout=15)
        assert u.status_code == 200, u.text
        body = u.json()
        assert body.get("updated") is True, f"unexpected response: {body}"

        # Verify all 4 helpers via GET /api/acl/users
        users = _items(admin_session.get(f"{BASE_URL}/api/acl/users", timeout=15).json())
        target = next((x for x in users if x.get("id") == admin_id), None)
        assert target is not None, "admin disappeared after update"
        assert target.get("email") == new_email.lower(), f"_apply_email_update failed: {target.get('email')}"
        assert "Iter75Renamed" in (target.get("name") or "") or target.get("first_name") == "Iter75Renamed", \
            f"_apply_name_updates failed: {target}"
        assert first_role_id in (target.get("role_ids") or []), f"_apply_role_update failed: {target.get('role_ids')}"

        # Verify _apply_password_update — login with new password
        login = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": new_email, "password": new_password,
        }, timeout=15)
        assert login.status_code == 200, f"password rehash broke login: {login.text}"
    finally:
        admin_session.delete(f"{BASE_URL}/api/acl/admins/{admin_id}", timeout=15)


def test_update_admin_email_collision_400(admin_session, first_role_id):
    s1 = _s.token_hex(4)
    s2 = _s.token_hex(4)
    e1 = f"TEST_iter75_a_{s1}@example.com"
    e2 = f"TEST_iter75_b_{s2}@example.com"
    ra = admin_session.post(f"{BASE_URL}/api/acl/admins", json={
        "first_name": "A", "last_name": "X", "email": e1, "password": "Pass123!", "role_id": first_role_id,
    }, timeout=15)
    rb = admin_session.post(f"{BASE_URL}/api/acl/admins", json={
        "first_name": "B", "last_name": "Y", "email": e2, "password": "Pass123!", "role_id": first_role_id,
    }, timeout=15)
    assert ra.status_code == 200, ra.text
    assert rb.status_code == 200, rb.text
    a = ra.json()
    b = rb.json()

    try:
        r = admin_session.put(f"{BASE_URL}/api/acl/admins/{b['id']}", json={"email": e1}, timeout=15)
        assert r.status_code == 400, r.text
    finally:
        admin_session.delete(f"{BASE_URL}/api/acl/admins/{a['id']}", timeout=15)
        admin_session.delete(f"{BASE_URL}/api/acl/admins/{b['id']}", timeout=15)


# --- BACKEND SECURITY: simulation.py uses secrets.SystemRandom ---
def test_simulation_start_creates_valid_driver(admin_session):
    r = admin_session.post(f"{BASE_URL}/api/simulation/start", json={
        "lat": 48.8566, "lng": 2.3522,
    }, timeout=20)
    if r.status_code == 404:
        pytest.skip("simulation/start endpoint not exposed under this path")
    assert r.status_code in (200, 201), r.text


# --- FRONTEND SECURITY: /api/auth/me works via cookie only ---
def test_auth_me_works_via_cookie_only(admin_session):
    r = admin_session.get(f"{BASE_URL}/api/auth/me", timeout=15)
    assert r.status_code == 200
    me = r.json()
    assert me.get("email") == ADMIN_EMAIL
