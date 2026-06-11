"""Iter288 — Tests HTTP des "gates" photos d'état des lieux du module Moto Self-Drive.

Vérifie:
  - POST /api/moto-rental/{id}/deposit-checkout         → 400 si <2 pickup_photos
  - POST /api/moto-rental/{id}/pickup-photos            → 400 si <2 photos, 200 sinon
  - POST /api/moto-rental/admin/rentals/{id}/return     → 400 si <2 return_photos
  - Après upload >=2 photos, deposit-checkout retourne 200 (avec url Stripe) ou no_deposit.

Note: utilise les comptes seed paul.vendeur / admin et crée une moto/rental dédiée.
"""
import os
import time
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

    # S'assurer que Paul a un solde suffisant (crédit admin si besoin)
    # Solde requis: prix d'1 jour à 10€ (cf moto créée plus bas)
    try:
        requests.post(
            f"{BASE_URL}/api/admin/wallet/credit",
            headers=_h(admin_token),
            json={"user_id": user["id"], "amount": 50, "description": "TEST_iter288"},
            timeout=10,
        )
    except Exception:
        pass

    # Créer une moto dédiée avec deposit_amount=20 (Stripe minimum) pour ce test
    moto_payload = {
        "name": f"TEST_iter288_{uuid.uuid4().hex[:6]}",
        "model": "Test 50cc",
        "license_class": "A1",
        "price_per_day": 10.0,
        "deposit_amount": 20.0,
        "location_name": "TEST_Agence",
        "image_url": "",
        "plate": "TEST-001",
        "description": "TEST iter288 moto",
    }
    r = requests.post(f"{BASE_URL}/api/moto-rental/admin/fleet", headers=_h(admin_token), json=moto_payload, timeout=15)
    assert r.status_code == 200, f"create moto failed: {r.status_code} {r.text}"
    moto = r.json()["moto"]
    moto_id = moto["id"]

    # Paul réserve la moto (book)
    book_payload = {
        "moto_id": moto_id,
        "start_at": "2027-01-10T09:00",
        "end_at": "2027-01-11T09:00",
        "license_doc_url": "http://example.com/permis.jpg",
        "id_doc_url": "http://example.com/cni.jpg",
    }
    r = requests.post(f"{BASE_URL}/api/moto-rental/book", headers=_h(user_token), json=book_payload, timeout=15)
    assert r.status_code == 200, f"book failed: {r.status_code} {r.text}"
    rental_id = r.json()["rental"]["id"]

    # Admin valide le permis -> awaiting_pickup
    r = requests.post(
        f"{BASE_URL}/api/moto-rental/admin/rentals/{rental_id}/license",
        headers=_h(admin_token),
        json={"approve": True},
        timeout=15,
    )
    assert r.status_code == 200, f"license approve failed: {r.status_code} {r.text}"

    yield {
        "user_token": user_token,
        "admin_token": admin_token,
        "user_id": user["id"],
        "moto_id": moto_id,
        "rental_id": rental_id,
    }

    # Cleanup: désactive la moto
    try:
        requests.delete(f"{BASE_URL}/api/moto-rental/admin/fleet/{moto_id}", headers=_h(admin_token), timeout=10)
    except Exception:
        pass


def test_deposit_checkout_blocked_without_pickup_photos(ctx):
    """POST /moto-rental/{id}/deposit-checkout → 400 si <2 pickup_photos."""
    r = requests.post(
        f"{BASE_URL}/api/moto-rental/{ctx['rental_id']}/deposit-checkout",
        headers=_h(ctx["user_token"]),
        json={"origin_url": BASE_URL},
        timeout=15,
    )
    assert r.status_code == 400, f"expected 400, got {r.status_code}: {r.text}"
    body = r.json()
    detail = (body.get("detail") or "").lower()
    assert "photos" in detail and ("retrait" in detail or "état des lieux" in detail), f"unexpected detail: {detail}"


def test_pickup_photos_requires_at_least_two(ctx):
    """POST /pickup-photos → 400 si <2 photos."""
    # 0 photo
    r = requests.post(
        f"{BASE_URL}/api/moto-rental/{ctx['rental_id']}/pickup-photos",
        headers=_h(ctx["user_token"]),
        json={"photos": []},
        timeout=15,
    )
    assert r.status_code == 400, f"expected 400 with 0 photos, got {r.status_code}: {r.text}"
    # 1 photo
    r = requests.post(
        f"{BASE_URL}/api/moto-rental/{ctx['rental_id']}/pickup-photos",
        headers=_h(ctx["user_token"]),
        json={"photos": ["https://example.com/p1.jpg"]},
        timeout=15,
    )
    assert r.status_code == 400, f"expected 400 with 1 photo, got {r.status_code}: {r.text}"
    assert "2" in r.json().get("detail", ""), "detail should mention minimum 2"


def test_pickup_photos_ok_with_two_then_deposit_checkout_succeeds(ctx):
    """Upload 2 photos → 200 ; deposit-checkout → 200 (url Stripe ou no_deposit)."""
    r = requests.post(
        f"{BASE_URL}/api/moto-rental/{ctx['rental_id']}/pickup-photos",
        headers=_h(ctx["user_token"]),
        json={"photos": ["https://example.com/p1.jpg", "https://example.com/p2.jpg"]},
        timeout=15,
    )
    assert r.status_code == 200, f"upload 2 photos failed: {r.status_code} {r.text}"
    assert len(r.json()["pickup_photos"]) == 2

    # Persistence GET via /my
    rg = requests.get(f"{BASE_URL}/api/moto-rental/my", headers=_h(ctx["user_token"]), timeout=10)
    assert rg.status_code == 200
    mine = [x for x in rg.json()["rentals"] if x["id"] == ctx["rental_id"]]
    assert mine and len(mine[0].get("pickup_photos") or []) == 2

    # Deposit-checkout doit maintenant retourner 200
    r = requests.post(
        f"{BASE_URL}/api/moto-rental/{ctx['rental_id']}/deposit-checkout",
        headers=_h(ctx["user_token"]),
        json={"origin_url": BASE_URL},
        timeout=20,
    )
    assert r.status_code == 200, f"deposit-checkout should succeed: {r.status_code} {r.text}"
    data = r.json()
    # Soit une session Stripe (deposit_amount>0), soit no_deposit=true (caution 0)
    assert data.get("url") or data.get("no_deposit") is True, f"unexpected body: {data}"


def test_admin_return_blocked_without_return_photos(ctx):
    """POST /admin/rentals/{id}/return → 400 si <2 return_photos."""
    # Statut peut être awaiting_pickup (si pas de Stripe payé) ou active (si caution payée).
    # Les deux sont acceptés par l'endpoint, donc le gate photos est testable.
    r = requests.post(
        f"{BASE_URL}/api/moto-rental/admin/rentals/{ctx['rental_id']}/return",
        headers=_h(ctx["admin_token"]),
        json={"damage_fees": 0},
        timeout=15,
    )
    assert r.status_code == 400, f"expected 400, got {r.status_code}: {r.text}"
    detail = (r.json().get("detail") or "").lower()
    assert "photos" in detail and "retour" in detail, f"unexpected detail: {detail}"

    # Avec 1 seule photo → toujours 400
    r = requests.post(
        f"{BASE_URL}/api/moto-rental/admin/rentals/{ctx['rental_id']}/return",
        headers=_h(ctx["admin_token"]),
        json={"return_photos": ["https://example.com/r1.jpg"], "damage_fees": 0},
        timeout=15,
    )
    assert r.status_code == 400, f"expected 400 with 1 photo, got {r.status_code}: {r.text}"


def test_admin_return_succeeds_with_two_photos(ctx):
    """Avec >=2 return_photos, la clôture passe à 200/returned."""
    r = requests.post(
        f"{BASE_URL}/api/moto-rental/admin/rentals/{ctx['rental_id']}/return",
        headers=_h(ctx["admin_token"]),
        json={"return_photos": ["https://example.com/r1.jpg", "https://example.com/r2.jpg"], "damage_fees": 0},
        timeout=20,
    )
    assert r.status_code == 200, f"admin return failed: {r.status_code} {r.text}"
    assert r.json().get("status") == "returned"

    # Persistence : GET /my doit montrer return_photos=2
    rg = requests.get(f"{BASE_URL}/api/moto-rental/my", headers=_h(ctx["user_token"]), timeout=10)
    mine = [x for x in rg.json()["rentals"] if x["id"] == ctx["rental_id"]]
    assert mine and len(mine[0].get("return_photos") or []) == 2
    assert mine[0]["status"] == "returned"
