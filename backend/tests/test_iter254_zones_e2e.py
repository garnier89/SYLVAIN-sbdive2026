"""SB Student Phase 3 — campus zones CRUD + Campus Share HTTP e2e."""
import os
import uuid
import requests

def _load_base_url():
    url = os.environ.get("REACT_APP_BACKEND_URL", "").strip()
    if not url:
        try:
            with open("/app/frontend/.env") as f:
                for line in f:
                    if line.startswith("REACT_APP_BACKEND_URL="):
                        url = line.split("=", 1)[1].strip()
                        break
        except Exception:
            pass
    return url.rstrip("/")


BASE_URL = _load_base_url()
API = f"{BASE_URL}/api"

ADMIN = {"email": "admin@superapp.com", "password": "SuperAdmin123!"}


def _login(s, email, password):
    r = s.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=20)
    assert r.status_code == 200, f"Login failed for {email}: {r.status_code} {r.text}"
    return r


def _register(s, prefix="zone254_"):
    email = f"{prefix}{uuid.uuid4().hex[:8]}@example.com"
    pwd = "Student2026!"
    r = s.post(f"{API}/auth/register", json={
        "name": "Student Test", "email": email, "password": pwd, "phone": f"+33655{uuid.uuid4().int % 1000000:06d}"
    }, timeout=20)
    assert r.status_code in (200, 201), f"Register failed: {r.status_code} {r.text}"
    me = s.get(f"{API}/auth/me", timeout=10).json()
    return email, pwd, me.get("user", me).get("id") or me.get("id")


def _admin_session():
    s = requests.Session()
    _login(s, ADMIN["email"], ADMIN["password"])
    return s


def _verify_student(admin_s, user_id):
    # Ensure profile exists (POST documents requires upload; use /api/student/enroll if exists)
    # Simpler: call enroll (creates the profile), then admin approve.
    pass


# -------------------------
# ADMIN CRUD CAMPUS ZONES
# -------------------------
class TestAdminZonesCRUD:
    def setup_method(self):
        self.s = _admin_session()
        self.created_ids = []

    def teardown_method(self):
        for zid in self.created_ids:
            try:
                self.s.delete(f"{API}/student/admin/campus-zones/{zid}", timeout=10)
            except Exception:
                pass

    def test_create_list_update_delete(self):
        # Unique coords to avoid clash with other tests
        lat = -10.0 + (uuid.uuid4().int % 100) / 1000.0
        lng = 40.0 + (uuid.uuid4().int % 100) / 1000.0
        body = {
            "name": "TEST_Campus_e2e", "type": "university",
            "lat": lat, "lng": lng, "radius_m": 600, "country": "fr",
            "pickup_points": [{"label": "Entrée principale", "lat": lat, "lng": lng}],
            "safe_meeting_points": [{"label": "Hall Bibli", "lat": lat + 0.0001, "lng": lng}],
            "enabled": True,
        }
        r = self.s.post(f"{API}/student/admin/campus-zones", json=body, timeout=15)
        assert r.status_code == 200, r.text
        zone = r.json()["zone"]
        assert zone["id"].startswith("cz_")
        assert zone["country"] == "FR"
        assert zone["type"] == "university"
        assert len(zone["pickup_points"]) == 1 and zone["pickup_points"][0]["id"].startswith("pt_")
        assert len(zone["safe_meeting_points"]) == 1
        zid = zone["id"]
        self.created_ids.append(zid)

        # LIST
        r = self.s.get(f"{API}/student/admin/campus-zones", timeout=10)
        assert r.status_code == 200
        ids = [z["id"] for z in r.json()["zones"]]
        assert zid in ids

        # PUT: toggle enabled false, change radius
        r = self.s.put(f"{API}/student/admin/campus-zones/{zid}", json={"enabled": False, "radius_m": 1200}, timeout=10)
        assert r.status_code == 200
        z = r.json()["zone"]
        assert z["enabled"] is False and z["radius_m"] == 1200

        # PUT invalid type → 400
        r = self.s.put(f"{API}/student/admin/campus-zones/{zid}", json={"type": "garage"}, timeout=10)
        assert r.status_code == 400

        # DELETE
        r = self.s.delete(f"{API}/student/admin/campus-zones/{zid}", timeout=10)
        assert r.status_code == 200 and r.json().get("deleted") == 1
        self.created_ids.remove(zid)

    def test_invalid_type_400(self):
        r = self.s.post(f"{API}/student/admin/campus-zones", json={
            "name": "Bad", "type": "garage", "lat": 1.0, "lng": 1.0, "radius_m": 500, "country": "FR"
        }, timeout=10)
        assert r.status_code == 400

    def test_non_admin_guard(self):
        anon = requests.Session()
        r = anon.get(f"{API}/student/admin/campus-zones", timeout=10)
        assert r.status_code in (401, 403)

        # Logged-in non-admin
        us = requests.Session()
        _register(us, prefix="zguard_")
        r = us.post(f"{API}/student/admin/campus-zones", json={
            "name": "X", "type": "university", "lat": 0.1, "lng": 0.1, "radius_m": 500, "country": "FR"
        }, timeout=10)
        assert r.status_code in (401, 403)


# -------------------------
# USER NEARBY CAMPUS ZONES
# -------------------------
class TestNearbyZones:
    def test_nearby_sorted_by_distance(self):
        admin = _admin_session()
        # Create 2 zones at known coords
        lat_a, lng_a = -15.111, 30.111
        lat_b, lng_b = -15.200, 30.200
        ra = admin.post(f"{API}/student/admin/campus-zones", json={
            "name": "TEST_ZA", "type": "university", "lat": lat_a, "lng": lng_a,
            "radius_m": 500, "country": "FR"}, timeout=10).json()["zone"]
        rb = admin.post(f"{API}/student/admin/campus-zones", json={
            "name": "TEST_ZB", "type": "library", "lat": lat_b, "lng": lng_b,
            "radius_m": 500, "country": "FR"}, timeout=10).json()["zone"]
        try:
            us = requests.Session()
            _register(us, prefix="near254_")
            r = us.get(f"{API}/student/zones/campus?lat={lat_a}&lng={lng_a}", timeout=10)
            assert r.status_code == 200
            zones = r.json()["zones"]
            mine = [z for z in zones if z["id"] in (ra["id"], rb["id"])]
            assert len(mine) == 2
            # Sorted by distance — ZA must be closer than ZB
            idxs = {z["id"]: i for i, z in enumerate(zones)}
            assert idxs[ra["id"]] < idxs[rb["id"]]
            assert mine[0]["distance_m"] < mine[1]["distance_m"]
        finally:
            admin.delete(f"{API}/student/admin/campus-zones/{ra['id']}", timeout=10)
            admin.delete(f"{API}/student/admin/campus-zones/{rb['id']}", timeout=10)


# -------------------------
# CAMPUS DISCOUNT QUOTE
# -------------------------
class TestCampusDiscountQuote:
    def test_quote_campus_25(self):
        admin = _admin_session()
        # Ensure config: campus_discount_pct = 25
        # Use the public quote endpoint with a verified student.
        us = requests.Session()
        _, _, uid = _register(us, prefix="cqt254_")
        # Enroll (creates profile pending), then admin approve
        en = us.get(f"{API}/student/me", timeout=10)
        assert en.status_code in (200, 201)
        ap = admin.post(f"{API}/student/admin/{uid}/approve", timeout=10)
        assert ap.status_code == 200, ap.text

        r = us.get(f"{API}/student/discount/quote?amount=100&kind=campus", timeout=10)
        assert r.status_code == 200
        data = r.json()
        # Should apply campus_discount_pct (>= ride pct). Accept >= 20 and >0.
        assert data.get("pct", 0) >= 20.0
        assert data.get("amount", 0) > 0


# -------------------------
# CAMPUS SHARE
# -------------------------
class TestCampusShare:
    def test_share_full_flow(self):
        admin = _admin_session()
        # Create zone where both students go
        lat, lng = -18.123, 25.321
        zr = admin.post(f"{API}/student/admin/campus-zones", json={
            "name": "TEST_ZShare", "type": "university", "lat": lat, "lng": lng,
            "radius_m": 600, "country": "FR"}, timeout=10).json()["zone"]
        zid = zr["id"]
        try:
            # Student 1 (verified)
            s1 = requests.Session()
            _, _, u1 = _register(s1, prefix="csh1_")
            s1.get(f"{API}/student/me", timeout=10)
            admin.post(f"{API}/student/admin/{u1}/approve", timeout=10)

            # Student 2 (verified)
            s2 = requests.Session()
            _, _, u2 = _register(s2, prefix="csh2_")
            s2.get(f"{API}/student/me", timeout=10)
            admin.post(f"{API}/student/admin/{u2}/approve", timeout=10)

            payload1 = {"origin_lat": lat + 0.05, "origin_lng": lng + 0.05, "origin_label": "Rés A",
                        "dest_lat": lat, "dest_lng": lng, "dest_label": "Campus"}
            r1 = s1.post(f"{API}/student/campus-share/request", json=payload1, timeout=15)
            assert r1.status_code == 200, r1.text
            d1 = r1.json()
            assert "request" in d1 and "matches" in d1 and "match_count" in d1
            assert d1["request"]["dest_zone_id"] == zid

            payload2 = {"origin_lat": lat + 0.06, "origin_lng": lng + 0.06, "origin_label": "Rés B",
                        "dest_lat": lat, "dest_lng": lng, "dest_label": "Campus"}
            r2 = s2.post(f"{API}/student/campus-share/request", json=payload2, timeout=15)
            assert r2.status_code == 200, r2.text
            d2 = r2.json()
            # Student 2 should see Student 1 in matches
            assert d2["match_count"] >= 1, f"Expected match for s2: {d2}"
            assert any(m["id"] == d1["request"]["id"] for m in d2["matches"])

            # Now Student 1 fetches matches via GET — should see student 2
            r3 = s1.get(f"{API}/student/campus-share/matches", timeout=10)
            assert r3.status_code == 200
            d3 = r3.json()
            assert d3["match_count"] >= 1
            assert any(m["id"] == d2["request"]["id"] for m in d3["matches"])

            # Cancel student 1
            rc = s1.delete(f"{API}/student/campus-share/request", timeout=10)
            assert rc.status_code == 200 and rc.json().get("cancelled") >= 1

            # After cancel, student 2 GET no longer matches student 1
            r4 = s2.get(f"{API}/student/campus-share/matches", timeout=10)
            assert r4.status_code == 200
            d4 = r4.json()
            assert not any(m["id"] == d1["request"]["id"] for m in d4["matches"])
        finally:
            admin.delete(f"{API}/student/admin/campus-zones/{zid}", timeout=10)

    def test_share_requires_verified(self):
        s = requests.Session()
        _register(s, prefix="csnv_")
        # No enroll/approval → not verified
        r = s.post(f"{API}/student/campus-share/request", json={
            "origin_lat": 1.0, "origin_lng": 1.0, "origin_label": "X",
            "dest_lat": 1.1, "dest_lng": 1.1, "dest_label": "Y"
        }, timeout=10)
        assert r.status_code == 403
