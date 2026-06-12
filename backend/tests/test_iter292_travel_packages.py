"""Iter292 — Tests HTTP e2e des forfaits combinés Vol + Hôtel (travel_packages)."""
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
                      json={"user_id": user["id"], "amount": 2000, "description": "TEST_iter292"}, timeout=10)
    except Exception:
        pass

    # Vol + hôtel + chambre dédiés (prix faibles)
    rf = requests.post(f"{BASE_URL}/api/flights/admin/flights", headers=_h(admin_token),
                       json={"airline": f"PKG_{uuid.uuid4().hex[:5]}", "flight_number": "PK1", "origin": "PkgVille",
                             "destination": "PkgDest", "departure_at": "2027-10-01T08:00", "arrival_at": "2027-10-01T11:00",
                             "cabin_class": "economy", "price": 100, "seats_total": 5}, timeout=15)
    flight_id = rf.json()["flight"]["id"]
    rh = requests.post(f"{BASE_URL}/api/hotels/admin/hotels", headers=_h(admin_token),
                       json={"name": f"PKG_{uuid.uuid4().hex[:5]}", "city": "PkgDest", "stars": 4}, timeout=15)
    hotel_id = rh.json()["hotel"]["id"]
    rr = requests.post(f"{BASE_URL}/api/hotels/admin/hotels/{hotel_id}/rooms", headers=_h(admin_token),
                       json={"name": "Chambre Pkg", "capacity": 2, "price_per_night": 50, "total_units": 3}, timeout=15)
    room_id = rr.json()["room"]["id"]

    rp = requests.post(f"{BASE_URL}/api/travel-packages/admin/packages", headers=_h(admin_token),
                       json={"title": "TEST Forfait", "flight_id": flight_id, "hotel_id": hotel_id,
                             "room_id": room_id, "nights": 3, "discount_pct": 10}, timeout=15)
    assert rp.status_code == 200, rp.text
    package_id = rp.json()["package"]["id"]
    yield {"user_token": user_token, "admin_token": admin_token, "user_id": user["id"],
           "flight_id": flight_id, "hotel_id": hotel_id, "room_id": room_id, "package_id": package_id}
    try:
        requests.delete(f"{BASE_URL}/api/travel-packages/admin/packages/{package_id}", headers=_h(admin_token), timeout=10)
        requests.delete(f"{BASE_URL}/api/flights/admin/flights/{flight_id}", headers=_h(admin_token), timeout=10)
        requests.delete(f"{BASE_URL}/api/hotels/admin/hotels/{hotel_id}", headers=_h(admin_token), timeout=10)
    except Exception:
        pass


def test_admin_options():
    token, _ = _login(ADMIN_EMAIL, ADMIN_PASSWORD)
    r = requests.get(f"{BASE_URL}/api/travel-packages/admin/options", headers=_h(token), timeout=10)
    assert r.status_code == 200
    assert all(k in r.json() for k in ("flights", "hotels", "rooms"))


def test_list_and_detail_with_pricing(ctx):
    r = requests.get(f"{BASE_URL}/api/travel-packages", headers=_h(ctx["user_token"]), timeout=10)
    assert r.status_code == 200
    pkg = next((p for p in r.json()["packages"] if p["id"] == ctx["package_id"]), None)
    assert pkg is not None
    # base = vol 100 + 3 nuits * 50 = 250 ; remise 10% -> 225
    assert pkg["base_total"] == 250.0 and pkg["final_total"] == 225.0 and pkg["savings"] == 25.0


def test_quote(ctx):
    r = requests.post(f"{BASE_URL}/api/travel-packages/{ctx['package_id']}/quote", headers=_h(ctx["user_token"]),
                      json={"travelers": 2, "rooms_count": 1, "check_in": "2027-10-01"}, timeout=10)
    assert r.status_code == 200, r.text
    d = r.json()
    # vol 100*2 + 3*50*1 = 350 ; -10% = 315
    assert d["base_total"] == 350.0 and d["final_total"] == 315.0
    assert d["check_out"] == "2027-10-04" and d["available"] is True


def test_book_creates_both_bookings_then_cancel_refunds(ctx):
    r = requests.post(f"{BASE_URL}/api/travel-packages/{ctx['package_id']}/book", headers=_h(ctx["user_token"]),
                      json={"passengers": [{"name": "Paul", "type": "adult"}], "rooms_count": 1, "check_in": "2027-10-01"}, timeout=20)
    assert r.status_code == 200, r.text
    bk = r.json()["booking"]
    # 1 voyageur : 100 + 150 = 250 ; -10% = 225
    assert bk["total_price"] == 225.0 and bk["savings"] == 25.0
    fb_id, hb_id = bk["flight_booking_id"], bk["hotel_booking_id"]

    # Apparaît dans Mes vols ET Mes séjours (réservations sous-jacentes confirmées)
    rv = requests.get(f"{BASE_URL}/api/flights/bookings/my", headers=_h(ctx["user_token"]), timeout=10)
    assert any(x["id"] == fb_id and x["status"] == "confirmed" for x in rv.json()["bookings"])
    rh = requests.get(f"{BASE_URL}/api/hotels/bookings/my", headers=_h(ctx["user_token"]), timeout=10)
    assert any(x["id"] == hb_id and x["status"] == "confirmed" for x in rh.json()["bookings"])

    # Annulation groupée → remboursement du total remisé + sous-jacentes annulées
    rc = requests.post(f"{BASE_URL}/api/travel-packages/bookings/{bk['id']}/cancel", headers=_h(ctx["user_token"]), timeout=15)
    assert rc.status_code == 200 and rc.json()["refunded"] == 225.0
    rv2 = requests.get(f"{BASE_URL}/api/flights/bookings/my", headers=_h(ctx["user_token"]), timeout=10)
    assert any(x["id"] == fb_id and x["status"] == "cancelled" for x in rv2.json()["bookings"])
    rh2 = requests.get(f"{BASE_URL}/api/hotels/bookings/my", headers=_h(ctx["user_token"]), timeout=10)
    assert any(x["id"] == hb_id and x["status"] == "cancelled" for x in rh2.json()["bookings"])


def test_book_requires_passenger(ctx):
    r = requests.post(f"{BASE_URL}/api/travel-packages/{ctx['package_id']}/book", headers=_h(ctx["user_token"]),
                      json={"passengers": [], "rooms_count": 1}, timeout=15)
    assert r.status_code == 400
