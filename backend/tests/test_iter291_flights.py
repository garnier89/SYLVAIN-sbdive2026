"""Iter291 — Tests HTTP e2e du module Vols (billets d'avion, inventaire admin)."""
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
                      json={"user_id": user["id"], "amount": 500, "description": "TEST_iter291"}, timeout=10)
    except Exception:
        pass

    # Vol dédié avec 1 siège pour tester l'épuisement
    r = requests.post(f"{BASE_URL}/api/flights/admin/flights", headers=_h(admin_token),
                      json={"airline": f"TEST_{uuid.uuid4().hex[:5]}", "flight_number": "TT001",
                            "origin": "TestVille", "origin_code": "TST", "destination": "TestDest", "destination_code": "TSD",
                            "departure_at": "2027-09-01T10:00", "arrival_at": "2027-09-01T13:00",
                            "cabin_class": "economy", "price": 100, "seats_total": 1, "stops": 0}, timeout=15)
    assert r.status_code == 200, r.text
    flight = r.json()["flight"]
    assert flight["duration_min"] == 180
    flight_id = flight["id"]
    yield {"user_token": user_token, "admin_token": admin_token, "user_id": user["id"], "flight_id": flight_id}
    try:
        requests.delete(f"{BASE_URL}/api/flights/admin/flights/{flight_id}", headers=_h(admin_token), timeout=10)
    except Exception:
        pass


def test_search_and_airports_seeded():
    token, _ = _login(USER_EMAIL, USER_PASSWORD)
    r = requests.get(f"{BASE_URL}/api/flights", headers=_h(token), timeout=10)
    assert r.status_code == 200 and isinstance(r.json().get("flights"), list)
    ra = requests.get(f"{BASE_URL}/api/flights/airports", headers=_h(token), timeout=10)
    assert ra.status_code == 200 and "origins" in ra.json() and "destinations" in ra.json()


def test_search_filter_by_route(ctx):
    r = requests.get(f"{BASE_URL}/api/flights?origin=TestVille&destination=TestDest",
                     headers=_h(ctx["user_token"]), timeout=10)
    assert r.status_code == 200
    ids = [f["id"] for f in r.json()["flights"]]
    assert ctx["flight_id"] in ids
    detail = next(f for f in r.json()["flights"] if f["id"] == ctx["flight_id"])
    assert detail["seats_available"] == 1 and detail["cabin_label"] == "Économique"


def test_book_requires_passenger(ctx):
    r = requests.post(f"{BASE_URL}/api/flights/book", headers=_h(ctx["user_token"]),
                      json={"flight_id": ctx["flight_id"], "passengers": []}, timeout=15)
    assert r.status_code == 400


def test_book_then_seats_exhausted_then_cancel(ctx):
    r = requests.post(f"{BASE_URL}/api/flights/book", headers=_h(ctx["user_token"]),
                      json={"flight_id": ctx["flight_id"], "passengers": [{"name": "Paul Test", "type": "adult"}]}, timeout=15)
    assert r.status_code == 200, r.text
    booking_id = r.json()["booking"]["id"]
    assert r.json()["booking"]["total_price"] == 100.0 and r.json()["booking"]["seats_count"] == 1

    # Plus de siège → 409
    r2 = requests.post(f"{BASE_URL}/api/flights/book", headers=_h(ctx["user_token"]),
                       json={"flight_id": ctx["flight_id"], "passengers": [{"name": "Autre", "type": "adult"}]}, timeout=15)
    assert r2.status_code == 409, f"expected 409, got {r2.status_code}: {r2.text}"

    # Mes vols
    rm = requests.get(f"{BASE_URL}/api/flights/bookings/my", headers=_h(ctx["user_token"]), timeout=10)
    assert any(b["id"] == booking_id and b["status"] == "confirmed" for b in rm.json()["bookings"])

    # Annulation (départ futur → remboursé) puis re-réservation possible
    rc = requests.post(f"{BASE_URL}/api/flights/bookings/{booking_id}/cancel", headers=_h(ctx["user_token"]), timeout=15)
    assert rc.status_code == 200 and rc.json()["refunded"] == 100.0
    r3 = requests.post(f"{BASE_URL}/api/flights/book", headers=_h(ctx["user_token"]),
                       json={"flight_id": ctx["flight_id"], "passengers": [{"name": "Encore", "type": "adult"}]}, timeout=15)
    assert r3.status_code == 200, f"re-book after cancel should succeed: {r3.text}"
    requests.post(f"{BASE_URL}/api/flights/bookings/{r3.json()['booking']['id']}/cancel", headers=_h(ctx["user_token"]), timeout=10)
