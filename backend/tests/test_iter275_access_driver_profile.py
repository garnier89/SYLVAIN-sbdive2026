"""Iter 275 - SB Drive Access: Driver profile (photo + bio + trainings) admin flow + booking enrichment."""
import os
import io
import base64
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://gojek-clone-41.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = "admin@superapp.com"
ADMIN_PASSWORD = "SuperAdmin123!"


@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=30)
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    token = r.json().get("token") or r.json().get("access_token")
    if token:
        s.headers.update({"Authorization": f"Bearer {token}"})
    return s


@pytest.fixture(scope="module")
def driver_id(admin_session):
    r = admin_session.get(f"{BASE_URL}/api/access/admin/drivers", timeout=30)
    assert r.status_code == 200, r.text
    items = r.json().get("items", [])
    assert len(items) > 0, "No drivers in DB"
    # Prefer a certified driver
    certified = [d for d in items if d.get("access_certified")]
    if not certified:
        # certify the first
        d0 = items[0]
        rc = admin_session.post(f"{BASE_URL}/api/access/admin/drivers/{d0['id']}/certify", timeout=30)
        assert rc.status_code == 200, rc.text
        return d0["id"]
    return certified[0]["id"]


def test_admin_list_drivers_has_profile_fields(admin_session):
    r = admin_session.get(f"{BASE_URL}/api/access/admin/drivers", timeout=30)
    assert r.status_code == 200
    items = r.json().get("items", [])
    assert len(items) > 0
    keys = items[0].keys()
    for k in ("id", "name", "access_certified"):
        assert k in keys
    # Profile fields should be returned (may be empty)
    for k in ("access_photo", "access_bio", "access_trainings"):
        assert k in keys, f"missing {k} on driver doc"


def test_update_driver_profile_bio_and_trainings(admin_session, driver_id):
    body = {
        "access_bio": "TEST iter275 bio - Chauffeur formé au transport adapté",
        "access_trainings": ["Langue des signes", "Aide PMR", "  ", "Premiers secours"],
    }
    r = admin_session.put(f"{BASE_URL}/api/access/admin/drivers/{driver_id}/profile", json=body, timeout=30)
    assert r.status_code == 200, r.text
    doc = r.json()
    assert doc["id"] == driver_id
    assert doc["access_bio"].startswith("TEST iter275 bio")
    # blank strings stripped
    assert doc["access_trainings"] == ["Langue des signes", "Aide PMR", "Premiers secours"]

    # Persist check via GET
    r2 = admin_session.get(f"{BASE_URL}/api/access/admin/drivers", timeout=30)
    assert r2.status_code == 200
    found = next((d for d in r2.json().get("items", []) if d["id"] == driver_id), None)
    assert found is not None
    assert found["access_bio"].startswith("TEST iter275 bio")
    assert "Langue des signes" in found["access_trainings"]


def test_update_driver_profile_empty_body_400(admin_session, driver_id):
    r = admin_session.put(f"{BASE_URL}/api/access/admin/drivers/{driver_id}/profile", json={}, timeout=30)
    assert r.status_code == 400


def test_update_driver_profile_unknown_driver_404(admin_session):
    r = admin_session.put(
        f"{BASE_URL}/api/access/admin/drivers/sim_driver_does_not_exist_xxx/profile",
        json={"access_bio": "x"}, timeout=30,
    )
    assert r.status_code == 404


def test_upload_image_returns_relative_url(admin_session):
    # Tiny PNG (1x1 red)
    png_bytes = base64.b64decode(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
    )
    files = {"file": ("tiny.png", io.BytesIO(png_bytes), "image/png")}
    r = admin_session.post(f"{BASE_URL}/api/uploads/image", files=files, timeout=30)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "url" in data
    assert data["url"].startswith("/api/uploads/"), f"unexpected url: {data['url']}"

    # Image should be retrievable
    r2 = requests.get(f"{BASE_URL}{data['url']}", timeout=30)
    assert r2.status_code == 200
    assert r2.headers.get("content-type", "").startswith("image/")
    return data["url"]


def test_update_driver_photo_persists(admin_session, driver_id):
    # First upload an image, then set as photo
    png_bytes = base64.b64decode(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
    )
    files = {"file": ("tiny.png", io.BytesIO(png_bytes), "image/png")}
    up = admin_session.post(f"{BASE_URL}/api/uploads/image", files=files, timeout=30)
    assert up.status_code == 200
    url = up.json()["url"]

    r = admin_session.put(
        f"{BASE_URL}/api/access/admin/drivers/{driver_id}/profile",
        json={"access_photo": url}, timeout=30,
    )
    assert r.status_code == 200
    doc = r.json()
    assert doc["access_photo"] == url


def test_booking_enrichment_has_matched_driver_fields(admin_session, driver_id):
    """Create a booking and ensure matched_driver_photo/bio/trainings are populated when a certified driver exists."""
    # Ensure target driver is certified + has bio
    admin_session.put(
        f"{BASE_URL}/api/access/admin/drivers/{driver_id}/profile",
        json={
            "access_bio": "Chauffeur formé au transport adapté (iter275)",
            "access_trainings": ["Langue des signes", "Aide PMR"],
        }, timeout=30,
    )
    admin_session.post(f"{BASE_URL}/api/access/admin/drivers/{driver_id}/certify", timeout=30)

    # Login as paul user
    s = requests.Session()
    rl = s.post(f"{BASE_URL}/api/auth/login", json={"email": "paul.vendeur@example.com", "password": "Test1234!"}, timeout=30)
    if rl.status_code != 200:
        pytest.skip(f"paul user login failed: {rl.status_code} {rl.text}")
    tok = rl.json().get("token") or rl.json().get("access_token")
    if tok:
        s.headers.update({"Authorization": f"Bearer {tok}"})

    # Get categories via /api/access/config
    rc = s.get(f"{BASE_URL}/api/access/config", timeout=30)
    assert rc.status_code == 200
    cats = rc.json().get("categories", [])
    if not cats:
        pytest.skip("No access categories available")

    payload = {
        "category_key": cats[0]["key"],
        "pickup": {"lat": 48.8566, "lng": 2.3522, "address": "Chatelet"},
        "dropoff": {"lat": 48.876, "lng": 2.359, "address": "Paris10"},
        "needs": [],
        "trip_type": "standard",
    }
    rb = s.post(f"{BASE_URL}/api/access/bookings", json=payload, timeout=30)
    assert rb.status_code in (200, 201), rb.text
    booking = rb.json()
    # Expected fields exist (may be null when no certified driver)
    for k in ("matched_driver_photo", "matched_driver_bio", "matched_driver_trainings"):
        assert k in booking, f"missing {k} in booking response"
    # Since we certified one with bio, at least bio should be populated
    assert booking.get("matched_driver_bio"), f"matched_driver_bio empty: {booking}"
    assert isinstance(booking.get("matched_driver_trainings"), list)
    assert any("PMR" in t or "signes" in t for t in booking["matched_driver_trainings"])
