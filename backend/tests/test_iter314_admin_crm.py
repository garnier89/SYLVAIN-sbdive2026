"""Iter 314 — Admin CRM: manual driver & merchant creation/deletion.

Covers the fleet rule (Taxi/VTC require a company name; Particulier does not),
bcrypt-hashed passwords (created accounts can log in), and deletion cleanup.

Run: pytest backend/tests/test_iter314_admin_crm.py -v
"""
import os
import uuid
import requests

API = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001").rstrip("/") + "/api"
ADMIN = {"email": "admin@superapp.com", "password": "SuperAdmin123!"}


def _admin_session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json=ADMIN, timeout=20)
    assert r.status_code == 200, r.text
    token = r.json()["access_token"]
    s.headers.update({"Authorization": f"Bearer {token}"})
    return s


def test_driver_fleet_rule_and_lifecycle():
    s = _admin_session()
    # VTC without a company name must be rejected (fleet rule).
    bad = s.post(f"{API}/admin/drivers", json={
        "first_name": "T", "last_name": "VTC", "email": f"vtc_{uuid.uuid4().hex[:8]}@demo.sb",
        "password": "Driver123!", "service_types": ["taxi"], "taxi_mode": "car", "taxi_sub": "vtc",
    }, timeout=20)
    assert bad.status_code == 400

    # VTC with a company name succeeds.
    em = f"vtc_{uuid.uuid4().hex[:8]}@demo.sb"
    ok = s.post(f"{API}/admin/drivers", json={
        "first_name": "Marc", "last_name": "VTC", "email": em, "password": "Driver123!",
        "service_types": ["taxi"], "taxi_mode": "car", "taxi_sub": "vtc",
        "company_name": "Antilles VTC SARL", "vehicle_type": "Berline",
    }, timeout=20)
    assert ok.status_code == 200, ok.text
    driver = ok.json()["driver"]
    assert driver["company_name"] == "Antilles VTC SARL"
    assert driver["taxi_sub"] == "vtc"

    # Created account can log in (bcrypt hash verified by auth).
    login = requests.post(f"{API}/auth/login", json={"email": em, "password": "Driver123!"}, timeout=20)
    assert login.status_code == 200, login.text

    # Delete cleans up.
    dele = s.delete(f"{API}/admin/drivers/{driver['id']}", timeout=20)
    assert dele.status_code == 200, dele.text
    gone = requests.post(f"{API}/auth/login", json={"email": em, "password": "Driver123!"}, timeout=20)
    assert gone.status_code != 200


def test_particulier_no_company_required():
    s = _admin_session()
    em = f"part_{uuid.uuid4().hex[:8]}@demo.sb"
    ok = s.post(f"{API}/admin/drivers", json={
        "first_name": "Jean", "last_name": "Particulier", "email": em, "password": "Driver123!",
        "service_types": ["delivery", "courier"], "taxi_sub": "particulier", "vehicle_type": "velo",
    }, timeout=20)
    assert ok.status_code == 200, ok.text
    did = ok.json()["driver"]["id"]
    s.delete(f"{API}/admin/drivers/{did}", timeout=20)


def test_merchant_create_and_delete():
    s = _admin_session()
    em = f"store_{uuid.uuid4().hex[:8]}@demo.sb"
    ok = s.post(f"{API}/admin/merchants", json={
        "name": "Resto Admin", "email": em, "password": "Merch123!",
        "store_name": "Chez Admin", "store_type": "restaurant", "address": "Fort-de-France",
    }, timeout=20)
    assert ok.status_code == 200, ok.text
    m = ok.json()
    assert m["approval_status"] == "approved" and m["is_active"] is True

    login = requests.post(f"{API}/auth/login", json={"email": em, "password": "Merch123!"}, timeout=20)
    assert login.status_code == 200, login.text

    dele = s.delete(f"{API}/admin/merchants/{m['id']}", timeout=20)
    assert dele.status_code == 200, dele.text
