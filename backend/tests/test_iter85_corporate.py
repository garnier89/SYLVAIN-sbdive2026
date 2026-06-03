"""
Pack C — Corporate Accounts (B2B) tests.
Covers: admin CRUD, member management, user join/my, ride discount + charge ledger,
permission guards.
"""
import os
import uuid
import requests

BASE = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001").rstrip("/")
API = f"{BASE}/api"

ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "admin@superapp.com")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "SuperAdmin123!")
USER_EMAIL = os.environ.get("SEED_TEST_EMAIL", "test2@example.com")
USER_PASSWORD = os.environ.get("SEED_TEST_PASSWORD", "TestPass123!")


def _session(email, password):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return s


def test_admin_create_and_member_flow():
    admin = _session(ADMIN_EMAIL, ADMIN_PASSWORD)
    # create
    r = admin.post(f"{API}/corporate/admin", json={"name": "Test Corp Iter85", "discount_pct": 15})
    assert r.status_code == 200, r.text
    corp = r.json()
    cid = corp["id"]
    assert corp["join_code"]
    assert corp["discount_pct"] == 15

    # add member by user email
    r = admin.post(f"{API}/corporate/admin/{cid}/members", json={"email": USER_EMAIL})
    assert r.status_code == 200, r.text

    # detail shows member
    r = admin.get(f"{API}/corporate/admin/{cid}")
    assert r.status_code == 200
    detail = r.json()
    assert any(m["user_email"] == USER_EMAIL for m in detail["members"])

    # user sees account in /my
    user = _session(USER_EMAIL, USER_PASSWORD)
    r = user.get(f"{API}/corporate/my")
    assert r.status_code == 200
    assert any(a["id"] == cid for a in r.json()["items"])

    # cleanup
    admin.delete(f"{API}/corporate/admin/{cid}")


def test_join_by_code():
    code = f"JOIN{uuid.uuid4().hex[:5].upper()}"
    admin = _session(ADMIN_EMAIL, ADMIN_PASSWORD)
    r = admin.post(f"{API}/corporate/admin", json={"name": "JoinCorp", "join_code": code, "discount_pct": 5})
    assert r.status_code == 200
    cid = r.json()["id"]

    user = _session(USER_EMAIL, USER_PASSWORD)
    r = user.post(f"{API}/corporate/join", json={"join_code": code})
    assert r.status_code == 200, r.text
    # joining again -> 400
    r = user.post(f"{API}/corporate/join", json={"join_code": code})
    assert r.status_code == 400
    # invalid code -> 404
    r = user.post(f"{API}/corporate/join", json={"join_code": "BADCODE000"})
    assert r.status_code == 404

    # leave
    r = user.post(f"{API}/corporate/leave/{cid}")
    assert r.status_code == 200
    admin.delete(f"{API}/corporate/admin/{cid}")


def test_ride_discount_and_invoice():
    code = f"RIDE{uuid.uuid4().hex[:5].upper()}"
    admin = _session(ADMIN_EMAIL, ADMIN_PASSWORD)
    r = admin.post(f"{API}/corporate/admin", json={"name": "RideCorp", "join_code": code, "discount_pct": 20})
    cid = r.json()["id"]
    admin.post(f"{API}/corporate/admin/{cid}/members", json={"email": USER_EMAIL})

    user = _session(USER_EMAIL, USER_PASSWORD)
    payload = {
        "pickup_lat": 48.85, "pickup_lng": 2.35, "pickup_address": "Paris",
        "dropoff_lat": 48.88, "dropoff_lng": 2.34, "dropoff_address": "Gare du Nord",
        "vehicle_type": "premium", "payment_method": "cash",
    }
    # baseline ride (no corporate) — uses haversine like the corporate path
    base = user.post(f"{API}/rides", json={**payload, "ride_type": "instant"}).json()
    base_fare = base["estimated_fare"]
    r = user.post(f"{API}/rides", json={**payload, "ride_type": "corporate", "corporate_account_id": code})
    assert r.status_code == 200, r.text
    ride = r.json()
    # 20% discount applied vs baseline
    assert abs(ride["estimated_fare"] - round(base_fare * 0.8, 2)) < 0.05, (ride["estimated_fare"], base_fare)
    assert ride["corporate_account_id"] == cid

    # non-member / invalid code -> 403
    r = user.post(f"{API}/rides", json={**payload, "ride_type": "corporate", "corporate_account_id": "NOPE9999"})
    assert r.status_code == 403

    # invoice endpoint reachable
    r = admin.get(f"{API}/corporate/admin/{cid}/invoice")
    assert r.status_code == 200
    assert "total_net" in r.json()

    admin.delete(f"{API}/corporate/admin/{cid}")


def test_permission_guard_non_admin():
    user = _session(USER_EMAIL, USER_PASSWORD)
    r = user.get(f"{API}/corporate/admin")
    assert r.status_code == 403
    r = user.post(f"{API}/corporate/admin", json={"name": "Hack"})
    assert r.status_code == 403
