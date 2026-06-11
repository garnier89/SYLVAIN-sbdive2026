"""Iter289 — Tests HTTP e2e du module Car Self-Drive (location voiture libre-service).

Couvre le flux complet : admin crée une voiture → user réserve → admin valide permis
→ gates photos (retrait/retour) → clôture. Mêmes garde-fous que le module moto.
"""
import os
import uuid
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://gojek-clone-41.preview.emergentagent.com").rstrip("/")
USER_EMAIL = "paul.vendeur@example.com"
USER_PASSWORD = "Test1234!"
ADMIN_EMAIL = "admin@superapp.com"
ADMIN_PASSWORD = "SuperAdmin123!"


def _login(email, password):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"Login failed for {email}: {r.status_code} {r.text}"
    return r.json()["access_token"], r.json()["user"]


def _h(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def ctx():
    user_token, user = _login(USER_EMAIL, USER_PASSWORD)
    admin_token, admin = _login(ADMIN_EMAIL, ADMIN_PASSWORD)

    try:
        requests.post(f"{BASE_URL}/api/admin/wallet/credit", headers=_h(admin_token),
                      json={"user_id": user["id"], "amount": 50, "description": "TEST_iter289"}, timeout=10)
    except Exception:
        pass

    car_payload = {
        "name": f"TEST_iter289_{uuid.uuid4().hex[:6]}", "make": "Test", "model": "Test City",
        "year": 2024, "category": "economy", "transmission": "manual", "seats": 5, "fuel": "Essence",
        "price_per_day": 10.0, "deposit_amount": 20.0, "location_name": "TEST_Agence",
        "image_url": "", "plate": "TEST-C01", "description": "TEST iter289 car",
    }
    r = requests.post(f"{BASE_URL}/api/car-rental/admin/fleet", headers=_h(admin_token), json=car_payload, timeout=15)
    assert r.status_code == 200, f"create car failed: {r.status_code} {r.text}"
    car_id = r.json()["car"]["id"]

    book_payload = {
        "car_id": car_id, "start_at": "2027-01-10T09:00", "end_at": "2027-01-11T09:00",
        "license_doc_url": "http://example.com/permis.jpg", "id_doc_url": "http://example.com/cni.jpg",
    }
    r = requests.post(f"{BASE_URL}/api/car-rental/book", headers=_h(user_token), json=book_payload, timeout=15)
    assert r.status_code == 200, f"book failed: {r.status_code} {r.text}"
    rental_id = r.json()["rental"]["id"]

    r = requests.post(f"{BASE_URL}/api/car-rental/admin/rentals/{rental_id}/license",
                      headers=_h(admin_token), json={"approve": True}, timeout=15)
    assert r.status_code == 200, f"license approve failed: {r.status_code} {r.text}"

    yield {"user_token": user_token, "admin_token": admin_token,
           "user_id": user["id"], "car_id": car_id, "rental_id": rental_id}

    try:
        requests.delete(f"{BASE_URL}/api/car-rental/admin/fleet/{car_id}", headers=_h(admin_token), timeout=10)
    except Exception:
        pass


def test_fleet_seeded():
    token, _ = _login(USER_EMAIL, USER_PASSWORD)
    r = requests.get(f"{BASE_URL}/api/car-rental/fleet", headers=_h(token), timeout=10)
    assert r.status_code == 200
    assert isinstance(r.json().get("cars"), list)


def test_deposit_checkout_blocked_without_pickup_photos(ctx):
    r = requests.post(f"{BASE_URL}/api/car-rental/{ctx['rental_id']}/deposit-checkout",
                      headers=_h(ctx["user_token"]), json={"origin_url": BASE_URL}, timeout=15)
    assert r.status_code == 400, f"expected 400, got {r.status_code}: {r.text}"
    detail = (r.json().get("detail") or "").lower()
    assert "photos" in detail and ("retrait" in detail or "état des lieux" in detail)


def test_pickup_photos_requires_two(ctx):
    r = requests.post(f"{BASE_URL}/api/car-rental/{ctx['rental_id']}/pickup-photos",
                      headers=_h(ctx["user_token"]), json={"photos": ["https://example.com/p1.jpg"]}, timeout=15)
    assert r.status_code == 400, f"expected 400 with 1 photo, got {r.status_code}: {r.text}"


def test_pickup_then_deposit_checkout_succeeds(ctx):
    r = requests.post(f"{BASE_URL}/api/car-rental/{ctx['rental_id']}/pickup-photos",
                      headers=_h(ctx["user_token"]),
                      json={"photos": ["https://example.com/p1.jpg", "https://example.com/p2.jpg"]}, timeout=15)
    assert r.status_code == 200 and len(r.json()["pickup_photos"]) == 2

    r = requests.post(f"{BASE_URL}/api/car-rental/{ctx['rental_id']}/deposit-checkout",
                      headers=_h(ctx["user_token"]), json={"origin_url": BASE_URL}, timeout=20)
    assert r.status_code == 200, f"deposit-checkout should succeed: {r.status_code} {r.text}"
    data = r.json()
    assert data.get("url") or data.get("no_deposit") is True


def test_admin_return_blocked_without_photos(ctx):
    r = requests.post(f"{BASE_URL}/api/car-rental/admin/rentals/{ctx['rental_id']}/return",
                      headers=_h(ctx["admin_token"]), json={"damage_fees": 0}, timeout=15)
    assert r.status_code == 400
    detail = (r.json().get("detail") or "").lower()
    assert "photos" in detail and "retour" in detail


def test_admin_return_succeeds_with_two_photos(ctx):
    r = requests.post(f"{BASE_URL}/api/car-rental/admin/rentals/{ctx['rental_id']}/return",
                      headers=_h(ctx["admin_token"]),
                      json={"return_photos": ["https://example.com/r1.jpg", "https://example.com/r2.jpg"], "damage_fees": 0},
                      timeout=20)
    assert r.status_code == 200 and r.json().get("status") == "returned"
    rg = requests.get(f"{BASE_URL}/api/car-rental/my", headers=_h(ctx["user_token"]), timeout=10)
    mine = [x for x in rg.json()["rentals"] if x["id"] == ctx["rental_id"]]
    assert mine and len(mine[0].get("return_photos") or []) == 2
