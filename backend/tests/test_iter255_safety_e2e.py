"""SB Student Phase 4 — HTTP e2e tests for /api/student/safety/* + emergency contacts.

Covers:
- GET/PUT /api/student/safety/settings (defaults + persistence)
- Trusted contacts CRUD via /api/emergency-contacts
- POST /api/student/safety/safe-ride/start (owner OK, foreign 403, missing 404)
- GET /api/student/safety/safe-ride/active
- GET /api/student/safety/driver/{id}/trust
- GET /api/student/safety/recommended-drivers
"""
import os
import uuid
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://gojek-clone-41.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


def _register_user(prefix="iter255"):
    email = f"{prefix}_{uuid.uuid4().hex[:10]}@example.com"
    password = "Test1234!"
    s = requests.Session()
    r = s.post(f"{API}/auth/register", json={
        "email": email, "password": password, "name": "Iter255 Tester", "phone": f"+33{uuid.uuid4().int % 10**9:09d}"
    }, timeout=20)
    if r.status_code not in (200, 201):
        # Try login if already exists
        r = s.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=20)
    assert r.status_code in (200, 201), f"register/login failed: {r.status_code} {r.text}"
    return s, email


def _create_ride(s):
    payload = {
        "pickup_lat": -20.879, "pickup_lng": 55.448, "pickup_address": "Test Origin",
        "dropoff_lat": -20.882, "dropoff_lng": 55.455, "dropoff_address": "Test Dest",
        "vehicle_type": "moto",
        "payment_method": "cash",
    }
    r = s.post(f"{API}/rides", json=payload, timeout=20)
    assert r.status_code in (200, 201), f"create ride failed: {r.status_code} {r.text}"
    data = r.json()
    return data.get("id") or data.get("ride_id") or (data.get("ride") or {}).get("id")


# ============== SETTINGS ==============
def test_settings_defaults_and_persistence():
    s, _ = _register_user("set")
    r = s.get(f"{API}/student/safety/settings", timeout=15)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["auto_share"] is True
    assert d["prefer_top_drivers"] is True
    assert float(d["min_driver_rating"]) == 4.0
    assert d["contacts_count"] == 0

    # PUT update
    r2 = s.put(f"{API}/student/safety/settings", json={
        "auto_share": False, "prefer_top_drivers": False, "min_driver_rating": 4.7
    }, timeout=15)
    assert r2.status_code == 200, r2.text
    d2 = r2.json()
    assert d2["auto_share"] is False
    assert d2["prefer_top_drivers"] is False
    assert abs(float(d2["min_driver_rating"]) - 4.7) < 0.01

    # GET persistence
    r3 = s.get(f"{API}/student/safety/settings", timeout=15)
    d3 = r3.json()
    assert d3["auto_share"] is False
    assert d3["prefer_top_drivers"] is False
    assert abs(float(d3["min_driver_rating"]) - 4.7) < 0.01


# ============== CONTACTS ==============
def test_emergency_contacts_crud_and_count():
    s, _ = _register_user("ec")
    # initial count
    r = s.get(f"{API}/student/safety/settings", timeout=15)
    assert r.json()["contacts_count"] == 0

    # add contact (mounted at /api/phase1/emergency-contacts)
    r1 = s.post(f"{API}/phase1/emergency-contacts", json={"name": "TEST_Maman", "phone": "+262692111222"}, timeout=15)
    assert r1.status_code in (200, 201), r1.text
    cid = (r1.json().get("id") or r1.json().get("contact", {}).get("id"))
    assert cid

    # list
    r2 = s.get(f"{API}/phase1/emergency-contacts", timeout=15)
    assert r2.status_code == 200
    items = r2.json()
    items_list = items if isinstance(items, list) else items.get("contacts", [])
    assert any(c.get("id") == cid for c in items_list)

    # settings reflects
    r3 = s.get(f"{API}/student/safety/settings", timeout=15)
    assert r3.json()["contacts_count"] >= 1

    # delete
    r4 = s.delete(f"{API}/phase1/emergency-contacts/{cid}", timeout=15)
    assert r4.status_code in (200, 204)
    r5 = s.get(f"{API}/student/safety/settings", timeout=15)
    assert r5.json()["contacts_count"] == 0


# ============== SAFE RIDE NIGHT ==============
def test_safe_ride_start_owner_and_active_list():
    s, _ = _register_user("sr")
    ride_id = _create_ride(s)
    assert ride_id

    r = s.post(f"{API}/student/safety/safe-ride/start", json={"ride_id": ride_id}, timeout=20)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d.get("ok") is True
    assert d.get("token")
    assert d.get("share_url", "").endswith(f"/t/{d['token']}")
    assert "contacts" in d
    assert d.get("needs_contact") is True  # no contacts added yet

    # Active list
    r2 = s.get(f"{API}/student/safety/safe-ride/active", timeout=15)
    assert r2.status_code == 200
    items = r2.json().get("safe_rides", [])
    assert any(i.get("ride_id") == ride_id for i in items)


def test_safe_ride_start_foreign_403_and_missing_404():
    s_owner, _ = _register_user("sr_owner")
    ride_id = _create_ride(s_owner)

    s_other, _ = _register_user("sr_other")
    r = s_other.post(f"{API}/student/safety/safe-ride/start", json={"ride_id": ride_id}, timeout=20)
    assert r.status_code == 403, f"expected 403 got {r.status_code} {r.text}"

    r2 = s_owner.post(f"{API}/student/safety/safe-ride/start", json={"ride_id": "nonexistent_ride_xyz"}, timeout=20)
    assert r2.status_code == 404, f"expected 404 got {r2.status_code} {r2.text}"


# ============== DRIVER TRUST ==============
def test_driver_trust_existing():
    s, _ = _register_user("trust")
    # Get a driver via admin endpoint
    adm = requests.Session()
    lr = adm.post(f"{API}/auth/login", json={"email": "admin@superapp.com", "password": "SuperAdmin123!"}, timeout=15)
    if lr.status_code != 200:
        import pytest
        pytest.skip("Admin login failed")
    r = adm.get(f"{API}/admin/drivers", timeout=15)
    if r.status_code != 200:
        import pytest
        pytest.skip("No /admin/drivers")
    items = r.json()
    items = items if isinstance(items, list) else items.get("drivers", [])
    if not items:
        import pytest
        pytest.skip("No drivers available")
    drv = items[0]
    drv_id = drv.get("id")
    r2 = s.get(f"{API}/student/safety/driver/{drv_id}/trust", timeout=15)
    assert r2.status_code == 200, r2.text
    d = r2.json()
    for k in ("rating", "ratings_count", "total_trips", "verified", "documents_approved", "member_since", "enhanced_verified"):
        assert k in d, f"missing key: {k}"
    # also try user_id lookup
    if drv.get("user_id"):
        r3 = s.get(f"{API}/student/safety/driver/{drv['user_id']}/trust", timeout=15)
        assert r3.status_code == 200


def test_driver_trust_404():
    s, _ = _register_user("trust404")
    r = s.get(f"{API}/student/safety/driver/nonexistent_driver_xyz/trust", timeout=15)
    assert r.status_code == 404


# ============== RECOMMENDED DRIVERS ==============
def test_recommended_drivers():
    s, _ = _register_user("rec")
    r = s.get(f"{API}/student/safety/recommended-drivers", params={"lat": -20.879, "lng": 55.448}, timeout=15)
    assert r.status_code == 200, r.text
    d = r.json()
    assert "drivers" in d
    arr = d["drivers"]
    # Verify sorting: rating desc, distance asc
    for i in range(len(arr) - 1):
        a, b = arr[i], arr[i + 1]
        assert (a["rating"], -a["distance_km"]) >= (b["rating"], -b["distance_km"])
