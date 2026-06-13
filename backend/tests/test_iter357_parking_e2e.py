"""Iter357 — Parking horaires + tarif nuit + distance/tri + prix serveur + décrément.

Covers the REVIEW REQUEST:
  - Public GET /api/parking/spots?lat&lng -> distance_km, is_open, tri proximité, backfill defaults.
  - POST /api/parking/reservations -> total_price calculé serveur, available_spots décrémenté.
  - Parking fermé -> 400 'fermé'; available_spots=0 -> 400 'Plus de place'.
  - Admin POST/PUT /api/admin/parking/spots persiste les nouveaux champs.
"""
import os
import time
import uuid

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://gojek-clone-41.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = "admin@superapp.com"
ADMIN_PASSWORD = "SuperAdmin123!"


# ------- fixtures --------

@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login",
               json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=20)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="module")
def client_session():
    s = requests.Session()
    email = f"qa_parking_{uuid.uuid4().hex[:8]}@test.com"
    password = "AccessQA123!"
    reg = s.post(f"{BASE_URL}/api/auth/register",
                 json={"email": email, "password": password, "name": "QA Parking", "phone": "+33600000000"},
                 timeout=20)
    assert reg.status_code in (200, 201), f"register failed: {reg.status_code} {reg.text}"
    # If register doesn't auto-login, login explicitly
    if not s.cookies:
        lg = s.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}, timeout=20)
        assert lg.status_code == 200
    return s


# ------- 1) Public /spots with lat/lng -------

def test_public_spots_sorted_by_distance_and_enriched():
    r = requests.get(f"{BASE_URL}/api/parking/spots", params={"lat": 48.86, "lng": 2.34}, timeout=20)
    assert r.status_code == 200
    spots = r.json().get("spots", [])
    assert len(spots) >= 2, "expected at least 2 spots in DB"
    # backfilled defaults present
    for s in spots:
        assert "is_open" in s, "is_open missing"
        assert "price_per_hour_night" in s, "price_per_hour_night missing (backfill)"
        assert "open_24h" in s
        # distance only when lat/lng available
        if s.get("lat"):
            assert "distance_km" in s, f"distance_km missing on spot {s.get('id')}"
    # sorted ascending by distance_km when provided
    distances = [s["distance_km"] for s in spots if "distance_km" in s]
    assert distances == sorted(distances), f"spots not sorted by distance: {distances}"


def test_public_spots_without_geo_no_distance_no_error():
    r = requests.get(f"{BASE_URL}/api/parking/spots", timeout=20)
    assert r.status_code == 200
    spots = r.json().get("spots", [])
    assert len(spots) >= 1
    # no distance_km when lat/lng absent
    assert all("distance_km" not in s for s in spots)


# ------- 2) Server-side pricing + availability decrement -------

def test_reservation_price_is_server_side_and_decrements_availability(client_session):
    # snapshot park_1 state
    pre = requests.get(f"{BASE_URL}/api/parking/spots/park_1", timeout=20).json()
    assert pre.get("price_per_hour"), "park_1 missing price_per_hour"
    initial_avail = int(pre.get("available_spots", 0))
    if initial_avail <= 0:
        pytest.skip("park_1 has no availability — re-seed required")
    # Force a daytime start so the day rate applies (12:00 UTC)
    start = "2026-06-13T12:00:00+00:00"
    payload = {"spot_id": "park_1", "duration_hours": 2,
               "start_time": start, "vehicle_plate": "QA-001-TEST",
               "total_price": 999.99}  # client tampering must be ignored
    r = client_session.post(f"{BASE_URL}/api/parking/reservations", json=payload, timeout=20)
    assert r.status_code == 200, f"reservation failed: {r.status_code} {r.text}"
    body = r.json()
    expected = round(float(pre["price_per_hour"]) * 2, 2)
    assert body["total_price"] == expected, f"server price mismatch: got {body['total_price']} expected {expected}"
    # availability decremented
    post = requests.get(f"{BASE_URL}/api/parking/spots/park_1", timeout=20).json()
    assert int(post["available_spots"]) == initial_avail - 1, \
        f"availability not decremented: {initial_avail} -> {post['available_spots']}"


# ------- 3) Admin CRUD persists new fields + closed/full enforcement -------

def _create_admin_spot(admin_session, **overrides):
    base = {
        "name": f"TEST_iter357_{uuid.uuid4().hex[:6]}",
        "address": "1 Rue de Test",
        "lat": 48.85, "lng": 2.35,
        "price_per_hour": 4.5,
        "price_per_hour_night": 2.5,
        "total_spots": 10, "available_spots": 5,
        "rating": 4.0, "features": "Couvert, Test",
        "image_url": "https://example.com/p.jpg",
        "active": True,
        "open_24h": True,
        "open_time": "06:00", "close_time": "23:00",
        "night_start": "20:00", "night_end": "06:00",
    }
    base.update(overrides)
    r = admin_session.post(f"{BASE_URL}/api/admin/parking/spots", json=base, timeout=20)
    assert r.status_code == 200, f"admin create failed: {r.status_code} {r.text}"
    return r.json()


def test_admin_create_persists_new_fields(admin_session):
    spot = _create_admin_spot(admin_session,
                              open_24h=False, open_time="07:30", close_time="22:30",
                              price_per_hour_night=3.25, night_start="21:00", night_end="05:00")
    try:
        # verify persistence via admin GET list
        listing = admin_session.get(f"{BASE_URL}/api/admin/parking/spots", timeout=20).json()
        found = next((s for s in listing["spots"] if s["id"] == spot["id"]), None)
        assert found, "created spot not in admin list"
        assert found["open_24h"] is False
        assert found["open_time"] == "07:30"
        assert found["close_time"] == "22:30"
        assert found["price_per_hour_night"] == 3.25
        assert found["night_start"] == "21:00"
        assert found["night_end"] == "05:00"

        # PUT update overrides correctly
        upd = admin_session.put(f"{BASE_URL}/api/admin/parking/spots/{spot['id']}",
                                json={**spot, "price_per_hour_night": 4.75, "night_start": "22:30"}, timeout=20)
        assert upd.status_code == 200
        again = admin_session.get(f"{BASE_URL}/api/admin/parking/spots", timeout=20).json()
        f2 = next((s for s in again["spots"] if s["id"] == spot["id"]), None)
        assert f2["price_per_hour_night"] == 4.75
        assert f2["night_start"] == "22:30"
    finally:
        admin_session.delete(f"{BASE_URL}/api/admin/parking/spots/{spot['id']}", timeout=20)


def test_reservation_on_closed_spot_returns_400(admin_session, client_session):
    # Create a spot whose opening window is impossible (00:00 -> 00:01) => closed almost always
    spot = _create_admin_spot(admin_session, open_24h=False,
                              open_time="00:00", close_time="00:01",
                              available_spots=5)
    try:
        # wait until 00:01 -> 23:59 is no longer "open"; we crafted a 1-min window which is closed 99.9%
        # If the test happens to fall in that minute we retry once.
        attempt = client_session.post(f"{BASE_URL}/api/parking/reservations",
                                      json={"spot_id": spot["id"], "duration_hours": 1}, timeout=20)
        if attempt.status_code == 200:
            time.sleep(60)
            attempt = client_session.post(f"{BASE_URL}/api/parking/reservations",
                                          json={"spot_id": spot["id"], "duration_hours": 1}, timeout=20)
        assert attempt.status_code == 400, f"expected 400 closed, got {attempt.status_code}: {attempt.text}"
        assert "fermé" in attempt.text.lower() or "ferme" in attempt.text.lower()
    finally:
        admin_session.delete(f"{BASE_URL}/api/admin/parking/spots/{spot['id']}", timeout=20)


def test_reservation_full_spot_returns_400(admin_session, client_session):
    spot = _create_admin_spot(admin_session, available_spots=0, total_spots=10)
    try:
        r = client_session.post(f"{BASE_URL}/api/parking/reservations",
                                json={"spot_id": spot["id"], "duration_hours": 1}, timeout=20)
        assert r.status_code == 400, f"expected 400 full, got {r.status_code}: {r.text}"
        assert "plus de place" in r.text.lower()
    finally:
        admin_session.delete(f"{BASE_URL}/api/admin/parking/spots/{spot['id']}", timeout=20)
