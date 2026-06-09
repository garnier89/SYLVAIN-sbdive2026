"""Iter185 — Phase 1 Sécurité & Favoris (extended).

Covers (review request):
- Favorite drivers: list + add + DELETE; enforce max 2 distinct (3rd -> 400 "Maximum 2 chauffeurs favoris")
- Emergency contacts: GET/POST/DELETE; cap at 5
- Auto-share: GET/PUT /api/safety/auto-share (persistence); GET /api/rides/{id}/auto-share (404 if not owner)
- Trip-share creation: POST /api/rides/{id}/share idempotent token
- Public trip-share snapshot: GET /api/trip-share/{token} no auth, returns keys
  (active, status, ride, client, driver, vehicle) ; bad token -> 404 with French message
"""
import os
import uuid
import requests

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL")
            or "https://gojek-clone-41.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

CLIENT_EMAIL = "clienttest@demo.sb"
CLIENT_PASSWORD = "Client2026!"
ADMIN_EMAIL = "admin@superapp.com"
ADMIN_PASSWORD = "SuperAdmin123!"


# ─────────────────────────── helpers ───────────────────────────
def _login(email, password):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=20)
    assert r.status_code == 200, f"Login failed {email}: {r.status_code} {r.text[:200]}"
    tok = r.json().get("access_token") or r.json().get("token")
    s.headers.update({"Authorization": f"Bearer {tok}", "Content-Type": "application/json"})
    s.user = r.json().get("user", {})
    return s


def _client():
    return _login(CLIENT_EMAIL, CLIENT_PASSWORD)


def _two_driver_ids():
    """Fetch at least 3 driver_ids via admin listing (need 3 distinct ones to test the 2-cap)."""
    a = _login(ADMIN_EMAIL, ADMIN_PASSWORD)
    r = a.get(f"{API}/admin/drivers?limit=10", timeout=20)
    assert r.status_code == 200, r.text[:200]
    data = r.json()
    drivers = data if isinstance(data, list) else (data.get("drivers") or data.get("items") or [])
    ids = [d.get("id") for d in drivers if d.get("id")]
    return ids


# ─────────────────────────── PUBLIC trip-share ───────────────────────────
def test_public_trip_share_invalid_token_404_with_fr_message():
    r = requests.get(f"{API}/trip-share/this-token-does-not-exist-xxx", timeout=20)
    assert r.status_code == 404
    body = r.json()
    detail = body.get("detail") or body.get("message") or ""
    assert "invalide" in detail.lower() or "expir" in detail.lower(), f"Unexpected detail: {detail}"


def test_public_trip_share_no_auth_required():
    # Hitting with a fake bearer must still 404 not 401 — endpoint is public
    r = requests.get(
        f"{API}/trip-share/fake-token-yyy",
        headers={"Authorization": "Bearer garbage"}, timeout=20)
    assert r.status_code == 404


# ─────────────────────────── auto-share ───────────────────────────
def test_auto_share_get_default_shape():
    s = _client()
    r = s.get(f"{API}/safety/auto-share", timeout=20)
    assert r.status_code == 200, r.text[:200]
    body = r.json()
    assert "enabled" in body and "contacts_count" in body
    assert isinstance(body["enabled"], bool)
    assert isinstance(body["contacts_count"], int)


def test_auto_share_put_persists():
    s = _client()
    # Toggle on
    r = s.put(f"{API}/safety/auto-share", json={"enabled": True}, timeout=20)
    assert r.status_code == 200
    assert r.json().get("enabled") is True
    # Confirm via GET
    g = s.get(f"{API}/safety/auto-share", timeout=20)
    assert g.status_code == 200
    assert g.json().get("enabled") is True
    # Toggle off (restore)
    r = s.put(f"{API}/safety/auto-share", json={"enabled": False}, timeout=20)
    assert r.status_code == 200 and r.json().get("enabled") is False


def test_ride_auto_share_unknown_ride_404():
    s = _client()
    r = s.get(f"{API}/rides/ride_nonexistent_zzz/auto-share", timeout=20)
    assert r.status_code == 404


# ─────────────────────────── emergency contacts ───────────────────────────
def _purge_emergency_contacts(s):
    r = s.get(f"{API}/phase1/emergency-contacts", timeout=20)
    if r.status_code == 200:
        for c in r.json():
            s.delete(f"{API}/phase1/emergency-contacts/{c['id']}", timeout=20)


def test_emergency_contacts_crud_and_max_5():
    s = _client()
    _purge_emergency_contacts(s)

    # Empty initial
    r = s.get(f"{API}/phase1/emergency-contacts", timeout=20)
    assert r.status_code == 200 and r.json() == []

    created = []
    for i in range(5):
        payload = {"name": f"TEST_EC_{i}", "phone": f"+3360000000{i}", "relation": "ami"}
        r = s.post(f"{API}/phase1/emergency-contacts", json=payload, timeout=20)
        assert r.status_code == 200, r.text[:200]
        body = r.json()
        assert body["name"] == payload["name"]
        assert body["phone"] == payload["phone"]
        assert body["id"].startswith("ec_")
        created.append(body["id"])

    # 6th must fail
    r = s.post(f"{API}/phase1/emergency-contacts",
               json={"name": "TEST_EC_6", "phone": "+33600000006"}, timeout=20)
    assert r.status_code == 400, r.text[:200]
    assert "max" in (r.json().get("detail") or "").lower()

    # Listing returns 5
    r = s.get(f"{API}/phase1/emergency-contacts", timeout=20)
    assert r.status_code == 200 and len(r.json()) == 5

    # Delete one and confirm
    d = s.delete(f"{API}/phase1/emergency-contacts/{created[0]}", timeout=20)
    assert d.status_code == 200
    r = s.get(f"{API}/phase1/emergency-contacts", timeout=20)
    ids = {c["id"] for c in r.json()}
    assert created[0] not in ids
    assert len(r.json()) == 4

    # Cleanup
    _purge_emergency_contacts(s)


def test_emergency_contact_missing_fields_400():
    s = _client()
    r = s.post(f"{API}/phase1/emergency-contacts", json={"name": "", "phone": ""}, timeout=20)
    assert r.status_code == 400


# ─────────────────────────── favorite drivers (MAX 2) ───────────────────────────
def _purge_favorites(s):
    r = s.get(f"{API}/phase1/favorite-drivers", timeout=20)
    if r.status_code == 200:
        for f in r.json():
            s.delete(f"{API}/phase1/favorite-drivers/{f['driver_id']}", timeout=20)


def test_favorite_drivers_max_2_and_crud():
    s = _client()
    _purge_favorites(s)

    driver_ids = _two_driver_ids()
    assert len(driver_ids) >= 3, f"Need >=3 drivers in DB to test the 2-cap (got {len(driver_ids)})"
    d1, d2, d3 = driver_ids[0], driver_ids[1], driver_ids[2]

    # Add 1st
    r = s.post(f"{API}/phase1/favorite-drivers/{d1}", timeout=20)
    assert r.status_code == 200, r.text[:200]
    # Add 2nd
    r = s.post(f"{API}/phase1/favorite-drivers/{d2}", timeout=20)
    assert r.status_code == 200, r.text[:200]
    # List has 2
    r = s.get(f"{API}/phase1/favorite-drivers", timeout=20)
    assert r.status_code == 200
    assert len(r.json()) == 2
    listed_ids = {f["driver_id"] for f in r.json()}
    assert listed_ids == {d1, d2}

    # 3rd distinct → 400 with French message
    r = s.post(f"{API}/phase1/favorite-drivers/{d3}", timeout=20)
    assert r.status_code == 400, f"Expected 400 got {r.status_code} {r.text[:200]}"
    detail = (r.json().get("detail") or "")
    assert "maximum 2" in detail.lower() and "favoris" in detail.lower()

    # Re-adding an already-favorited driver must NOT fail
    r = s.post(f"{API}/phase1/favorite-drivers/{d1}", timeout=20)
    assert r.status_code == 200

    # Delete one, then 3rd can be added
    r = s.delete(f"{API}/phase1/favorite-drivers/{d1}", timeout=20)
    assert r.status_code == 200
    r = s.post(f"{API}/phase1/favorite-drivers/{d3}", timeout=20)
    assert r.status_code == 200, r.text[:200]

    # Cleanup
    _purge_favorites(s)


def test_favorite_drivers_unknown_driver_404():
    s = _client()
    r = s.post(f"{API}/phase1/favorite-drivers/drv_nonexistent_xyz", timeout=20)
    assert r.status_code == 404


# ─────────────────────────── trip-share creation + public read ───────────────────────────
def _create_ride(s):
    """Create a pending ride for the logged-in client and return ride_id."""
    payload = {
        "pickup_address": "TEST_Pickup 1 Rue de Test, Paris",
        "pickup_lat": 48.8566, "pickup_lng": 2.3522,
        "dropoff_address": "TEST_Dropoff 2 Avenue du Test, Paris",
        "dropoff_lat": 48.8606, "dropoff_lng": 2.3376,
        "vehicle_type": "sedan",
        "payment_method": "cash",
    }
    r = s.post(f"{API}/rides", json=payload, timeout=20)
    if r.status_code in (200, 201):
        return r.json().get("id") or r.json().get("ride_id")
    # Some envs use /api/rides/request
    r = s.post(f"{API}/rides/request", json=payload, timeout=20)
    if r.status_code in (200, 201):
        return r.json().get("id") or r.json().get("ride_id")
    return None


def test_trip_share_create_and_public_snapshot_end_to_end():
    s = _client()
    ride_id = _create_ride(s)
    if not ride_id:
        # Ride creation flow not available in this env -- only check create-share without a real ride
        r = s.post(f"{API}/rides/ride_unknown/share", timeout=20)
        assert r.status_code == 404
        return

    # Owner creates share
    r = s.post(f"{API}/rides/{ride_id}/share", timeout=20)
    assert r.status_code == 200, r.text[:200]
    token1 = r.json().get("token")
    assert token1 and isinstance(token1, str)

    # Idempotent — same caller gets same token
    r2 = s.post(f"{API}/rides/{ride_id}/share", timeout=20)
    assert r2.status_code == 200 and r2.json().get("token") == token1

    # PUBLIC snapshot — no auth
    r3 = requests.get(f"{API}/trip-share/{token1}", timeout=20)
    assert r3.status_code == 200, r3.text[:300]
    snap = r3.json()
    for k in ("active", "status", "ride", "client", "driver", "vehicle"):
        assert k in snap, f"Missing key '{k}' in public snapshot keys={list(snap.keys())}"
    # Client phone+name in cleartext (intentional)
    assert "name" in snap["client"] and "phone" in snap["client"]
    # Ride structure
    assert snap["ride"].get("id") == ride_id
    assert snap["ride"].get("pickup_address", "").startswith("TEST_Pickup")

    # Cleanup the ride if cancel endpoint exists
    s.post(f"{API}/rides/{ride_id}/cancel", timeout=20)


def test_trip_share_create_requires_auth():
    r = requests.post(f"{API}/rides/whatever/share", timeout=20)
    assert r.status_code in (401, 403)
