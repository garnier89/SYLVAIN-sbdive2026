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


def test_csv_import_drivers_skips_invalid_rows():
    s = _admin_session()
    r = uuid.uuid4().hex[:8]
    csv = "first_name,last_name,email,service_types,taxi_sub,taxi_mode,company_name,vehicle_type,status\n"
    csv += f"Alpha,One,impa_{r}@demo.sb,delivery|courier,particulier,,,velo,approved\n"
    csv += f"Beta,Two,impb_{r}@demo.sb,taxi,vtc,car,,Berline,approved\n"  # VTC w/o company -> skip
    csv += f"Gamma,Three,impc_{r}@demo.sb,taxi,vtc,car,Flotte ABC,Berline,approved\n"
    res = s.post(f"{API}/admin/import/drivers", json={"csv": csv}, timeout=30)
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["created"] == 2 and data["skipped"] == 1
    skipped = [x for x in data["results"] if x["status"] == "skipped"][0]
    assert "société" in skipped["reason"] or "flotte" in skipped["reason"]
    # A created account uses the generated password.
    created = [x for x in data["results"] if x["status"] == "created"][0]
    assert created.get("password")
    login = requests.post(f"{API}/auth/login", json={"email": created["email"], "password": created["password"]}, timeout=20)
    assert login.status_code == 200


def test_csv_import_merchants_reports():
    s = _admin_session()
    r = uuid.uuid4().hex[:8]
    csv = "name,email,store_name,store_type,address\n"
    csv += f"Marie,m1_{r}@demo.sb,Boutique Un,restaurant,Fort-de-France\n"
    csv += f",m2_{r}@demo.sb,Sans Nom,shop,FDF\n"  # missing name -> skip
    res = s.post(f"{API}/admin/import/merchants", json={"csv": csv}, timeout=30)
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["created"] == 1 and data["skipped"] == 1


def test_sequential_dispatch_flow():
    s = _admin_session()
    import time as _t
    ph = '+59669' + str(uuid.uuid4().int)[:7]
    mr = s.post(f"{API}/admin/bookings/manual-ride", json={
        "pickup_address": "A", "dropoff_address": "B", "pickup_lat": 14.6, "pickup_lng": -61.07,
        "dropoff_lat": 14.61, "dropoff_lng": -60.99, "customer_phone": ph, "customer_name": "Disp Test",
    }, timeout=20)
    assert mr.status_code == 200, mr.text
    rid = mr.json()["ride"]["id"]
    try:
        ad = s.post(f"{API}/admin/bookings/ride/{rid}/auto-dispatch", timeout=20)
        # If no online drivers in this env, endpoint returns 400 — skip gracefully.
        if ad.status_code == 400:
            return
        assert ad.status_code == 200, ad.text
        sess = ad.json()["session"]
        assert sess["status"] == "offering" and len(sess["chain"]) >= 1
        assert sess["current_driver_id"]
        # Decline -> advance (only if chain has >1 driver)
        if len(sess["chain"]) > 1:
            dr = s.post(f"{API}/admin/bookings/ride/{rid}/offer-respond", json={"accept": False}, timeout=20).json()
            assert dr["session"]["index"] == 1
        # Accept -> ride assigned
        ac = s.post(f"{API}/admin/bookings/ride/{rid}/offer-respond", json={"accept": True}, timeout=20)
        assert ac.status_code == 200 and ac.json()["accepted"] is True
        st = s.get(f"{API}/admin/bookings/ride/{rid}/dispatch-status", timeout=20).json()["session"]
        assert st["status"] == "accepted"
    finally:
        s.post(f"{API}/admin/bookings/ride/{rid}/dispatch-cancel", timeout=20)
        s.post(f"{API}/admin/bookings/ride/{rid}/cancel", json={"reason": "cleanup"}, timeout=20)


def test_onboarding_dashboard_and_remind():
    s = _admin_session()
    # Create a pending (just-invited) driver.
    em = f"onb_{uuid.uuid4().hex[:8]}@demo.sb"
    ok = s.post(f"{API}/admin/drivers", json={
        "first_name": "Onb", "last_name": "Test", "email": em, "password": "Driver123!",
        "service_types": ["delivery"], "taxi_sub": "particulier", "vehicle_type": "velo",
    }, timeout=20)
    assert ok.status_code == 200, ok.text
    did = ok.json()["driver"]["id"]

    ob = s.get(f"{API}/admin/onboarding", timeout=30)
    assert ob.status_code == 200, ob.text
    data = ob.json()
    assert "drivers" in data and "merchants" in data
    for k in ("total", "activated", "pending", "activation_rate", "pending_list"):
        assert k in data["drivers"]
    # Our brand-new driver is in the pending list (0 trips = not activated).
    assert any(p["id"] == did for p in data["drivers"]["pending_list"])

    # Individual remind (best-effort send to a non-verified address -> counts as sent attempt or failed, but 200).
    r = s.post(f"{API}/admin/onboarding/remind", json={"kind": "driver", "ids": [did]}, timeout=30)
    assert r.status_code == 200, r.text
    assert r.json()["total"] == 1

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
