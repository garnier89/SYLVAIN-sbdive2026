"""Iter290 — Tests HTTP e2e du module Hôtels (réservation de chambres, inventaire admin)."""
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
                      json={"user_id": user["id"], "amount": 500, "description": "TEST_iter290"}, timeout=10)
    except Exception:
        pass

    # Hôtel + chambre dédiés (1 unité pour tester l'épuisement de la dispo)
    r = requests.post(f"{BASE_URL}/api/hotels/admin/hotels", headers=_h(admin_token),
                      json={"name": f"TEST_iter290_{uuid.uuid4().hex[:6]}", "city": "TestCity", "stars": 3,
                            "amenities": ["Wifi"], "description": "test"}, timeout=15)
    assert r.status_code == 200, r.text
    hotel_id = r.json()["hotel"]["id"]
    r = requests.post(f"{BASE_URL}/api/hotels/admin/hotels/{hotel_id}/rooms", headers=_h(admin_token),
                      json={"name": "Chambre Test", "capacity": 2, "price_per_night": 50, "total_units": 1}, timeout=15)
    assert r.status_code == 200, r.text
    room_id = r.json()["room"]["id"]
    yield {"user_token": user_token, "admin_token": admin_token, "user_id": user["id"],
           "hotel_id": hotel_id, "room_id": room_id}
    try:
        requests.delete(f"{BASE_URL}/api/hotels/admin/hotels/{hotel_id}", headers=_h(admin_token), timeout=10)
    except Exception:
        pass


def test_list_and_cities_seeded():
    token, _ = _login(USER_EMAIL, USER_PASSWORD)
    r = requests.get(f"{BASE_URL}/api/hotels", headers=_h(token), timeout=10)
    assert r.status_code == 200 and isinstance(r.json().get("hotels"), list)
    rc = requests.get(f"{BASE_URL}/api/hotels/cities", headers=_h(token), timeout=10)
    assert rc.status_code == 200 and isinstance(rc.json().get("cities"), list)


def test_detail_with_rooms_and_availability(ctx):
    r = requests.get(f"{BASE_URL}/api/hotels/{ctx['hotel_id']}?check_in=2027-03-01&check_out=2027-03-04",
                     headers=_h(ctx["user_token"]), timeout=10)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["nights"] == 3
    rooms = d["rooms"]
    assert rooms and rooms[0]["available_units"] == 1
    assert rooms[0]["total_for_stay"] == 150.0


def test_quote(ctx):
    r = requests.post(f"{BASE_URL}/api/hotels/quote", headers=_h(ctx["user_token"]),
                      json={"room_id": ctx["room_id"], "check_in": "2027-03-01", "check_out": "2027-03-04", "rooms_count": 1}, timeout=10)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["nights"] == 3 and d["total_price"] == 150.0 and d["enough_availability"] is True


def test_quote_invalid_dates(ctx):
    r = requests.post(f"{BASE_URL}/api/hotels/quote", headers=_h(ctx["user_token"]),
                      json={"room_id": ctx["room_id"], "check_in": "2027-03-04", "check_out": "2027-03-01"}, timeout=10)
    assert r.status_code == 400


def test_book_then_availability_exhausted_then_cancel(ctx):
    # Réserver l'unique chambre
    r = requests.post(f"{BASE_URL}/api/hotels/book", headers=_h(ctx["user_token"]),
                      json={"room_id": ctx["room_id"], "check_in": "2027-04-01", "check_out": "2027-04-03",
                            "guests": 2, "rooms_count": 1}, timeout=15)
    assert r.status_code == 200, r.text
    booking_id = r.json()["booking"]["id"]
    assert r.json()["booking"]["total_price"] == 100.0

    # Deuxième réservation chevauchante → plus de dispo (409)
    r2 = requests.post(f"{BASE_URL}/api/hotels/book", headers=_h(ctx["user_token"]),
                       json={"room_id": ctx["room_id"], "check_in": "2027-04-02", "check_out": "2027-04-04",
                             "guests": 1, "rooms_count": 1}, timeout=15)
    assert r2.status_code == 409, f"expected 409, got {r2.status_code}: {r2.text}"

    # Mes réservations contient la résa confirmée
    rm = requests.get(f"{BASE_URL}/api/hotels/bookings/my", headers=_h(ctx["user_token"]), timeout=10)
    assert rm.status_code == 200
    assert any(b["id"] == booking_id and b["status"] == "confirmed" for b in rm.json()["bookings"])

    # Annuler (avant check-in → remboursé) → la dispo se libère
    rc = requests.post(f"{BASE_URL}/api/hotels/bookings/{booking_id}/cancel", headers=_h(ctx["user_token"]), timeout=15)
    assert rc.status_code == 200 and rc.json()["refunded"] == 100.0
    # Après annulation, on peut re-réserver
    r3 = requests.post(f"{BASE_URL}/api/hotels/book", headers=_h(ctx["user_token"]),
                       json={"room_id": ctx["room_id"], "check_in": "2027-04-02", "check_out": "2027-04-04",
                             "guests": 1, "rooms_count": 1}, timeout=15)
    assert r3.status_code == 200, f"re-book after cancel should succeed: {r3.text}"
    # cleanup
    requests.post(f"{BASE_URL}/api/hotels/bookings/{r3.json()['booking']['id']}/cancel", headers=_h(ctx["user_token"]), timeout=10)
