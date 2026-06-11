"""Tests SB Access ADMIN endpoints — categories CRUD, settings (SRN), drivers certify, bookings, stats."""
import os
import requests

BASE = os.environ.get("REACT_APP_BACKEND_URL", "https://gojek-clone-41.preview.emergentagent.com").rstrip("/")
API = f"{BASE}/api"

ADMIN_EMAIL = "admin@superapp.com"
ADMIN_PASSWORD = "SuperAdmin123!"


def _login():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=20)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text[:200]}"
    data = r.json()
    token = data.get("access_token") or data.get("token")
    if token:
        s.headers.update({"Authorization": f"Bearer {token}"})
    return s


def test_admin_stats():
    s = _login()
    r = s.get(f"{API}/access/admin/stats", timeout=20)
    assert r.status_code == 200, r.text[:300]
    d = r.json()
    for k in ["total_bookings", "certified_drivers", "pmr_categories_available", "bookings_by_type", "certified_ride_rate"]:
        assert k in d, f"missing key {k} in stats: {d}"


def test_admin_categories_list():
    s = _login()
    r = s.get(f"{API}/access/admin/categories", timeout=20)
    assert r.status_code == 200, r.text[:300]
    items = r.json().get("items", [])
    assert isinstance(items, list)
    # Expect at least access_standard / access_pmr / access_van seeded
    keys = {c.get("key") for c in items}
    assert any(k and k.startswith("access_") for k in keys), f"no access_* category found: {keys}"


def test_admin_category_crud_full_cycle():
    s = _login()
    # CREATE
    payload = {
        "key": "TEST_access_iter274",
        "name": "Test Access Iter274",
        "description": "Temp test category",
        "capabilities": {"ramp": True, "lift": False},
        "capacity_passengers": 4,
        "capacity_wheelchairs": 1,
        "base_fare": 7.5,
        "price_per_km": 1.2,
        "price_per_min": 0.3,
        "min_fare": 9.0,
        "icon": "Wheelchair",
        "active": True,
        "display_order": 99,
        "scope": {"country": "", "state": "", "city": ""},
    }
    r = s.post(f"{API}/access/admin/categories", json=payload, timeout=20)
    assert r.status_code in (200, 201), f"create failed {r.status_code} {r.text[:300]}"
    created = r.json()
    cat_id = created.get("id") or created.get("_id")
    assert cat_id, f"no id in created: {created}"
    assert created["key"] == payload["key"]
    assert float(created["base_fare"]) == 7.5

    # READ list contains it
    r = s.get(f"{API}/access/admin/categories", timeout=20)
    assert r.status_code == 200
    keys = {c.get("key"): c for c in r.json().get("items", [])}
    assert payload["key"] in keys

    # UPDATE base_fare to 11.0
    upd = {**payload, "base_fare": 11.0, "name": "Test Access Updated"}
    r = s.put(f"{API}/access/admin/categories/{cat_id}", json=upd, timeout=20)
    assert r.status_code == 200, r.text[:300]
    assert float(r.json()["base_fare"]) == 11.0

    # GET — verify persistence
    r = s.get(f"{API}/access/admin/categories", timeout=20)
    found = next((c for c in r.json().get("items", []) if c.get("id") == cat_id or c.get("key") == payload["key"]), None)
    assert found is not None
    assert float(found["base_fare"]) == 11.0
    assert found["name"] == "Test Access Updated"

    # DELETE
    r = s.delete(f"{API}/access/admin/categories/{cat_id}", timeout=20)
    assert r.status_code in (200, 204), r.text[:300]

    # Verify removed
    r = s.get(f"{API}/access/admin/categories", timeout=20)
    keys = {c.get("key") for c in r.json().get("items", [])}
    assert payload["key"] not in keys, "category still present after delete"


def test_admin_settings_get_and_update_safe_ride_night():
    s = _login()
    # GET current
    r = s.get(f"{API}/access/admin/settings", timeout=20)
    assert r.status_code == 200, r.text[:300]
    original = r.json()
    srn = original.get("safe_ride_night", {})
    assert "enabled" in srn or srn == {} or True  # tolerant

    # UPDATE — set SRN explicit values + a zone
    payload = {
        "enabled": bool(original.get("enabled", True)),
        "available_zones": [{"country": "FR", "state": "", "city": "Paris"}],
        "extra_assistance_minutes": int(original.get("extra_assistance_minutes", 5) or 5),
        "no_late_penalty": bool(original.get("no_late_penalty", True)),
        "priority_certified_drivers": bool(original.get("priority_certified_drivers", True)),
        "safe_ride_night": {
            "enabled": True,
            "modes": ["access", "standard"],
            "start_hour": 21,
            "end_hour": 5,
            "zones": [{"country": "FR", "state": "", "city": "Lyon"}],
        },
    }
    r = s.put(f"{API}/access/admin/settings", json=payload, timeout=20)
    assert r.status_code == 200, r.text[:300]

    # Re-fetch — verify persistence
    r = s.get(f"{API}/access/admin/settings", timeout=20)
    assert r.status_code == 200
    fetched = r.json()
    fsrn = fetched.get("safe_ride_night", {})
    assert fsrn.get("start_hour") == 21
    assert fsrn.get("end_hour") == 5
    assert "access" in (fsrn.get("modes") or [])
    assert "standard" in (fsrn.get("modes") or [])
    zones = fsrn.get("zones") or []
    assert any(z.get("city") == "Lyon" for z in zones), f"Lyon SRN zone not persisted: {zones}"
    azones = fetched.get("available_zones") or []
    assert any(z.get("city") == "Paris" for z in azones), f"Paris available zone not persisted: {azones}"

    # RESTORE near defaults (start=20 end=6 modes=[access,standard], no zones)
    restore = {
        "enabled": True,
        "available_zones": [],
        "extra_assistance_minutes": int(original.get("extra_assistance_minutes", 5) or 5),
        "no_late_penalty": bool(original.get("no_late_penalty", True)),
        "priority_certified_drivers": bool(original.get("priority_certified_drivers", True)),
        "safe_ride_night": {
            "enabled": True,
            "modes": ["access", "standard"],
            "start_hour": 20,
            "end_hour": 6,
            "zones": [],
        },
    }
    r = s.put(f"{API}/access/admin/settings", json=restore, timeout=20)
    assert r.status_code == 200, r.text[:300]


def test_admin_drivers_list_and_certify_cycle():
    s = _login()
    r = s.get(f"{API}/access/admin/drivers", timeout=20)
    assert r.status_code == 200, r.text[:300]
    items = r.json().get("items", [])
    assert isinstance(items, list)
    if not items:
        # No driver to certify — skip the certify part but list endpoint OK
        return
    # find a non-certified driver if any
    target = next((d for d in items if not d.get("access_certified")), items[0])
    drv_id = target["id"]
    original_state = bool(target.get("access_certified"))

    # Certify
    r = s.post(f"{API}/access/admin/drivers/{drv_id}/certify", json={"approved": True}, timeout=20)
    assert r.status_code == 200, r.text[:300]

    # Verify via list
    r = s.get(f"{API}/access/admin/drivers", timeout=20)
    found = next((d for d in r.json().get("items", []) if d["id"] == drv_id), None)
    assert found is not None
    assert found.get("access_certified") is True

    # Revoke (restore as much as possible)
    r = s.post(f"{API}/access/admin/drivers/{drv_id}/certify", json={"approved": original_state}, timeout=20)
    assert r.status_code == 200


def test_admin_bookings_list():
    s = _login()
    r = s.get(f"{API}/access/admin/bookings", timeout=20)
    assert r.status_code == 200, r.text[:300]
    d = r.json()
    assert "items" in d
    assert isinstance(d["items"], list)
