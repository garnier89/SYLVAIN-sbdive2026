"""Iter172 — Integration tests for /api/zones admin CRUD + /api/zones/resolve.

Covers:
- Admin auth guards (401 unauth) on every admin endpoint.
- Admin list returns seeded zones (Pointe-à-Pitre, Fort-de-France, Dakar) with shortcut_count.
- Full zone CRUD (POST/PUT/DELETE) with cookie auth.
- Programmed shortcuts get/put + count reflects.
- /resolve geo match, label match, no-match (null zone), and schedule day/time filter.
"""
import os
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://gojek-clone-41.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = os.environ.get("TEST_ADMIN_EMAIL", "admin@superapp.com")
ADMIN_PASSWORD = os.environ.get("TEST_ADMIN_PASSWORD", "SuperAdmin123!")


def _admin_session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=30)
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    return s


# ── auth guards ───────────────────────────────────────────────────────────────
def test_admin_list_requires_auth():
    r = requests.get(f"{BASE_URL}/api/zones/admin/list", timeout=15)
    assert r.status_code == 401, f"expected 401 got {r.status_code}"


def test_admin_create_requires_auth():
    r = requests.post(f"{BASE_URL}/api/zones/admin", json={"name": "x"}, timeout=15)
    assert r.status_code == 401


def test_admin_update_requires_auth():
    r = requests.put(f"{BASE_URL}/api/zones/admin/zone_xxx", json={"name": "x"}, timeout=15)
    assert r.status_code == 401


def test_admin_delete_requires_auth():
    r = requests.delete(f"{BASE_URL}/api/zones/admin/zone_xxx", timeout=15)
    assert r.status_code == 401


def test_admin_get_shortcuts_requires_auth():
    r = requests.get(f"{BASE_URL}/api/zones/admin/zone_pap/shortcuts", timeout=15)
    assert r.status_code == 401


def test_admin_put_shortcuts_requires_auth():
    r = requests.put(f"{BASE_URL}/api/zones/admin/zone_pap/shortcuts", json={"entries": []}, timeout=15)
    assert r.status_code == 401


# ── seeded zones present ──────────────────────────────────────────────────────
def test_admin_list_returns_seeded_zones():
    s = _admin_session()
    r = s.get(f"{BASE_URL}/api/zones/admin/list", timeout=20)
    assert r.status_code == 200, r.text
    zones = r.json().get("zones") or []
    names = {z["name"] for z in zones}
    assert "Pointe-à-Pitre" in names
    assert "Fort-de-France" in names
    assert "Dakar" in names
    # shortcut_count is populated for each
    for z in zones:
        assert "shortcut_count" in z
        assert isinstance(z["shortcut_count"], int)
    # Pointe-à-Pitre seeded with 3 shortcuts
    pap = next(z for z in zones if z["name"] == "Pointe-à-Pitre")
    assert pap["shortcut_count"] >= 3


# ── full CRUD ─────────────────────────────────────────────────────────────────
def test_full_zone_crud_and_shortcuts():
    s = _admin_session()
    # CREATE
    payload = {
        "name": "TEST_ZONE_Iter172", "country": "FR", "region": "IDF", "city": "Paris",
        "lat": 48.8566, "lng": 2.3522, "radius_km": 5, "aliases": "paris, idf",
        "is_active": True, "display_order": 99,
    }
    r = s.post(f"{BASE_URL}/api/zones/admin", json=payload, timeout=20)
    assert r.status_code == 200, r.text
    created = r.json()
    zid = created["id"]
    try:
        assert created["name"] == "TEST_ZONE_Iter172"
        assert created["city"] == "Paris"
        assert created["radius_km"] == 5
        assert "paris" in created["aliases"]

        # Verify present in list
        r2 = s.get(f"{BASE_URL}/api/zones/admin/list", timeout=20)
        ids = {z["id"] for z in r2.json()["zones"]}
        assert zid in ids

        # UPDATE
        upd = dict(payload, name="TEST_ZONE_Iter172_upd", radius_km=8)
        r3 = s.put(f"{BASE_URL}/api/zones/admin/{zid}", json=upd, timeout=20)
        assert r3.status_code == 200, r3.text
        assert r3.json()["name"] == "TEST_ZONE_Iter172_upd"
        assert r3.json()["radius_km"] == 8

        # GET shortcuts (empty)
        rs = s.get(f"{BASE_URL}/api/zones/admin/{zid}/shortcuts", timeout=20)
        assert rs.status_code == 200
        assert rs.json()["entries"] == []

        # PUT shortcuts — 2 entries, one scheduled
        entries = [
            {"service": {"id": "z-taxi", "name": "Taxi VTC", "path": "/course?mode=standard",
                         "iconName": "Taxi", "bg": "bg-slate-100", "iconColor": "text-gray-600"},
             "schedule": {"enabled": False}},
            {"service": {"id": "z-bars", "name": "Bars", "path": "/nearby?category=Bar",
                         "iconName": "Wine", "bg": "bg-slate-100", "iconColor": "text-gray-600"},
             "schedule": {"enabled": True, "days": [4, 5, 6], "start_time": "18:00", "end_time": "23:59"}},
        ]
        rsp = s.put(f"{BASE_URL}/api/zones/admin/{zid}/shortcuts", json={"entries": entries}, timeout=20)
        assert rsp.status_code == 200
        assert rsp.json()["count"] == 2

        # shortcut_count reflects
        r4 = s.get(f"{BASE_URL}/api/zones/admin/list", timeout=20)
        z_row = next(z for z in r4.json()["zones"] if z["id"] == zid)
        assert z_row["shortcut_count"] == 2
    finally:
        # DELETE
        rd = s.delete(f"{BASE_URL}/api/zones/admin/{zid}", timeout=20)
        assert rd.status_code == 200
        # confirm removed
        r5 = s.get(f"{BASE_URL}/api/zones/admin/list", timeout=20)
        ids = {z["id"] for z in r5.json()["zones"]}
        assert zid not in ids
        # shortcuts also removed (re-fetch returns 404)
        rs2 = s.get(f"{BASE_URL}/api/zones/admin/{zid}/shortcuts", timeout=15)
        assert rs2.status_code == 404


def test_create_zone_requires_name():
    s = _admin_session()
    r = s.post(f"{BASE_URL}/api/zones/admin", json={"name": "  "}, timeout=15)
    assert r.status_code == 400


# ── public resolve ────────────────────────────────────────────────────────────
def test_resolve_geo_matches_pap():
    r = requests.get(f"{BASE_URL}/api/zones/resolve",
                     params={"lat": 16.2412, "lng": -61.534}, timeout=15)
    assert r.status_code == 200
    data = r.json()
    assert data["zone"] is not None
    assert data["zone"]["name"] == "Pointe-à-Pitre"
    assert data["trend_zone"] == "pointe-à-pitre"


def test_resolve_label_match_dakar():
    r = requests.get(f"{BASE_URL}/api/zones/resolve",
                     params={"label": "Plateau, Dakar, Sénégal"}, timeout=15)
    assert r.status_code == 200
    d = r.json()
    assert d["zone"] and d["zone"]["name"] == "Dakar"


def test_resolve_no_match_returns_null_zone():
    r = requests.get(f"{BASE_URL}/api/zones/resolve",
                     params={"label": "Tokyo, Japan"}, timeout=15)
    assert r.status_code == 200
    d = r.json()
    assert d["zone"] is None
    assert d["trend_zone"]  # falls back to last 2 parts of label
    assert d["shortcuts"] == []


def test_resolve_schedule_active_friday_evening():
    # Pointe-à-Pitre seeded Bars entry: enabled days=[4,5,6] 18:00-23:59
    # dow=5 (Fri), mins=1140 (19:00) → must include Bars
    r = requests.get(f"{BASE_URL}/api/zones/resolve",
                     params={"lat": 16.2412, "lng": -61.534, "dow": 5, "mins": 1140}, timeout=15)
    assert r.status_code == 200
    names = [s["name"] for s in r.json()["shortcuts"]]
    assert "Bars" in names


def test_resolve_schedule_inactive_monday():
    # dow=1 (Mon) → Bars must NOT appear
    r = requests.get(f"{BASE_URL}/api/zones/resolve",
                     params={"lat": 16.2412, "lng": -61.534, "dow": 1, "mins": 1140}, timeout=15)
    assert r.status_code == 200
    names = [s["name"] for s in r.json()["shortcuts"]]
    assert "Bars" not in names
    # Always-on Taxi/Food should still be present
    assert "Taxi VTC" in names
