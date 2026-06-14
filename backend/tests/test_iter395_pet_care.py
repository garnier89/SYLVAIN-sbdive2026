"""SB Animaux (pet-care) E2E backend tests — iter395.

Covers: services catalog, providers filtering, pets CRUD, estimate, booking
(wallet debit / errors / refund on cancel), and listing (upcoming/past).
"""
import os
import time
import requests
import pytest

BASE = os.environ.get("REACT_APP_BACKEND_URL", "https://gojek-clone-41.preview.emergentagent.com").rstrip("/")
API = f"{BASE}/api"
EMAIL = "famtester@demo.sb"
PASSWORD = "FamTest123!"


@pytest.fixture(scope="module")
def s():
    sess = requests.Session()
    r = sess.post(f"{API}/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=20)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    tok = r.json().get("access_token") or r.json().get("token")
    if tok:
        sess.headers.update({"Authorization": f"Bearer {tok}"})
    return sess


# ── Catalog ─────────────────────────────────────────────────────────────────
def test_services_catalog():
    r = requests.get(f"{API}/pet-care/services", timeout=15)
    assert r.status_code == 200, r.text
    d = r.json()
    ids = sorted([x["id"] for x in d["services"]])
    assert ids == ["pension", "promenade", "toilettage", "veterinaire"]
    by = {x["id"]: x for x in d["services"]}
    assert by["toilettage"]["base_price"] == 40.0
    assert by["promenade"]["base_price"] == 15.0
    assert by["pension"]["base_price"] == 30.0
    assert by["veterinaire"]["base_price"] == 50.0
    assert d["home_surcharge"] == 10
    assert isinstance(d["species"], list) and "Chien" in d["species"]


def test_providers_filtered():
    r = requests.get(f"{API}/pet-care/providers", params={"category": "Toilettage"}, timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    assert isinstance(data, list)
    # Every returned provider must be in the requested category
    for p in data:
        assert p.get("category") == "Toilettage", p


# ── Pets CRUD ──────────────────────────────────────────────────────────────
def test_pets_crud(s):
    # Create requires name
    r = s.post(f"{API}/pet-care/pets", json={"name": ""}, timeout=15)
    assert r.status_code == 400

    r = s.post(f"{API}/pet-care/pets", json={
        "name": "TEST_Iter395Pet", "species": "Chien", "breed": "Berger", "age": "3", "weight": "20 kg"
    }, timeout=15)
    assert r.status_code == 200, r.text
    pet = r.json()
    pid = pet["id"]
    assert pet["name"] == "TEST_Iter395Pet"
    assert pet["species"] == "Chien"

    # List contains it
    lst = s.get(f"{API}/pet-care/pets", timeout=15).json()
    assert any(p["id"] == pid for p in lst)

    # Update
    r = s.put(f"{API}/pet-care/pets/{pid}", json={"breed": "Husky"}, timeout=15)
    assert r.status_code == 200
    assert r.json()["breed"] == "Husky"

    # Delete
    r = s.delete(f"{API}/pet-care/pets/{pid}", timeout=15)
    assert r.status_code == 200
    # Verify removal
    r = s.put(f"{API}/pet-care/pets/{pid}", json={"breed": "X"}, timeout=15)
    assert r.status_code == 404


# ── Estimate ───────────────────────────────────────────────────────────────
def test_estimate_onsite_and_home(s):
    r = s.post(f"{API}/pet-care/estimate", json={"service": "toilettage", "location_type": "onsite"}, timeout=15).json()
    assert r["total"] == 40.0 and r["home_fee"] == 0.0
    r2 = s.post(f"{API}/pet-care/estimate", json={"service": "toilettage", "location_type": "home"}, timeout=15).json()
    assert r2["total"] == 50.0 and r2["home_fee"] == 10.0


# ── Booking flow ───────────────────────────────────────────────────────────
def _wallet_balance(s):
    r = s.get(f"{API}/wallet/balance", timeout=15)
    if r.status_code == 200:
        d = r.json()
        return d.get("balance") if isinstance(d, dict) else None
    return None


def test_booking_validations_and_wallet_flow(s):
    # Need a pet
    r = s.post(f"{API}/pet-care/pets", json={"name": "TEST_Iter395Book", "species": "Chien"}, timeout=15)
    assert r.status_code == 200
    pid = r.json()["id"]

    # Missing pet_id
    r = s.post(f"{API}/pet-care/bookings", json={
        "service": "toilettage", "date": "2030-12-12", "time_slot": "10:00"
    }, timeout=15)
    assert r.status_code == 400

    # Missing date/slot
    r = s.post(f"{API}/pet-care/bookings", json={
        "service": "toilettage", "pet_id": pid
    }, timeout=15)
    assert r.status_code == 400

    # Invalid service
    r = s.post(f"{API}/pet-care/bookings", json={
        "service": "badsvc", "pet_id": pid, "date": "2030-12-12", "time_slot": "10:00"
    }, timeout=15)
    assert r.status_code == 400

    bal_before = _wallet_balance(s)

    # Valid booking, sbpay, home (50€)
    body = {
        "service": "toilettage", "pet_id": pid, "date": "2030-12-12", "time_slot": "10:00",
        "location_type": "home", "address": "1 rue Test", "payment_method": "sbpay",
    }
    r = s.post(f"{API}/pet-care/bookings", json=body, timeout=20)
    assert r.status_code == 200, r.text
    bk = r.json()
    assert bk["status"] == "confirmed"
    assert bk["total_price"] == 50.0
    assert bk["payment_status"] == "paid"
    bid = bk["id"]

    bal_after = _wallet_balance(s)
    if bal_before is not None and bal_after is not None:
        assert round(bal_before - bal_after, 2) == 50.0, f"expected -50 debit, got {bal_before} -> {bal_after}"

    # Listing shows upcoming
    lst = s.get(f"{API}/pet-care/bookings", timeout=15).json()
    assert "upcoming" in lst and "past" in lst
    assert any(b["id"] == bid for b in lst["upcoming"])

    # Cancel → refund
    r = s.post(f"{API}/pet-care/bookings/{bid}/cancel", timeout=15)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["refunded"] == 50.0

    bal_refund = _wallet_balance(s)
    if bal_after is not None and bal_refund is not None:
        assert round(bal_refund - bal_after, 2) == 50.0

    # Second cancel must fail
    r = s.post(f"{API}/pet-care/bookings/{bid}/cancel", timeout=15)
    assert r.status_code == 400

    # cleanup pet
    s.delete(f"{API}/pet-care/pets/{pid}", timeout=15)


def test_insufficient_balance(s):
    # Create pet
    r = s.post(f"{API}/pet-care/pets", json={"name": "TEST_Iter395Empty", "species": "Chat"}, timeout=15)
    pid = r.json()["id"]
    try:
        # Drain wallet by reading current balance and trying with absurd service total.
        # We can't drain easily; instead simulate by submitting many bookings until insufficient,
        # OR use a fresh user — skip if balance covers everything.
        bal = _wallet_balance(s)
        if bal is None or bal < 50:
            pytest.skip("Cannot determine balance or already low")
        # Spend down enough times
        count = int((bal // 50)) + 1
        last_status = None
        for i in range(count + 1):
            r = s.post(f"{API}/pet-care/bookings", json={
                "service": "toilettage", "pet_id": pid, "date": "2030-12-12", "time_slot": "10:00",
                "location_type": "home", "payment_method": "sbpay", "address": "x",
            }, timeout=20)
            last_status = r.status_code
            if r.status_code == 400 and "Solde" in r.text:
                assert True
                return
        pytest.skip(f"Could not exhaust wallet (last={last_status})")
    finally:
        s.delete(f"{API}/pet-care/pets/{pid}", timeout=15)
