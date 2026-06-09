"""iter190 — 'Prochaine course' admin config + effective zone resolution.

Covers:
  • GET /api/config/next-job/admin (admin only; 403 for non-admin)
  • PUT /api/config/next-job/admin (persists enabled/lead_minutes + zone_overrides;
    clamps lead_minutes to 1..30)
  • GET /api/config/next-job?lat=&lng= effective resolution:
      - no resolved zone (zone inactive) → returns the GLOBAL config (zone_id null)
      - active zone with override=false → enabled returns false (override wins)
"""
import os
import time
import uuid

import pytest
import requests

from pymongo import MongoClient


def _load_backend_url():
    url = os.environ.get("REACT_APP_BACKEND_URL")
    if url:
        return url.rstrip("/")
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                return line.split("=", 1)[1].strip().rstrip("/")
    raise RuntimeError("REACT_APP_BACKEND_URL not set")


BASE_URL = _load_backend_url()
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@superapp.com"
ADMIN_PASSWORD = "SuperAdmin123!"
DRIVER_EMAIL = "jean.dupont@demo.sb"
DRIVER_PASSWORD = "Driver123!"


def _post(path, token=None, json=None):
    h = {"Content-Type": "application/json"}
    if token:
        h["Authorization"] = f"Bearer {token}"
    return requests.post(f"{API}{path}", json=json or {}, headers=h, timeout=30)


def _put(path, token=None, json=None):
    h = {"Content-Type": "application/json"}
    if token:
        h["Authorization"] = f"Bearer {token}"
    return requests.put(f"{API}{path}", json=json or {}, headers=h, timeout=30)


def _get(path, token=None, params=None):
    h = {}
    if token:
        h["Authorization"] = f"Bearer {token}"
    return requests.get(f"{API}{path}", headers=h, params=params, timeout=30)


def _login(email, password):
    r = _post("/auth/login", json={"email": email, "password": password})
    if r.status_code != 200:
        return None
    data = r.json()
    return data.get("access_token") or data.get("token")


def _register_client(prefix="iter190"):
    suffix = uuid.uuid4().hex[:8]
    payload = {
        "name": f"{prefix} Client",
        "email": f"test_{prefix}_{suffix}@example.com",
        "password": "TestPass123!",
        "phone": f"+3361{int(time.time() * 1000) % 100000000:08d}",
        "role": "user",
    }
    r = _post("/auth/register", json=payload)
    assert r.status_code in (200, 201), f"register: {r.status_code} {r.text}"
    data = r.json()
    return data.get("access_token") or data.get("token")


@pytest.fixture(scope="module")
def admin_token():
    t = _login(ADMIN_EMAIL, ADMIN_PASSWORD)
    if not t:
        pytest.skip("admin login failed")
    return t


@pytest.fixture(scope="module")
def mongo():
    url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
    db_name = os.environ.get("DB_NAME", "test_database")
    return MongoClient(url)[db_name]


# ── Admin endpoint: AuthZ ─────────────────────────────────────────────────


class TestAdminAuthz:
    def test_non_admin_get_403(self):
        client_token = _register_client("iter190_az")
        r = _get("/config/next-job/admin", token=client_token)
        assert r.status_code == 403, f"expected 403, got {r.status_code}: {r.text}"

    def test_non_admin_put_403(self):
        client_token = _register_client("iter190_az2")
        r = _put("/config/next-job/admin", token=client_token,
                 json={"enabled": True, "lead_minutes": 5})
        assert r.status_code == 403, f"expected 403, got {r.status_code}: {r.text}"

    def test_anonymous_get_401_or_403(self):
        r = _get("/config/next-job/admin")
        assert r.status_code in (401, 403), r.text


# ── Admin endpoint: GET shape ─────────────────────────────────────────────


class TestAdminGetShape:
    def test_shape(self, admin_token):
        r = _get("/config/next-job/admin", token=admin_token)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "enabled" in body and isinstance(body["enabled"], bool)
        assert "lead_minutes" in body and isinstance(body["lead_minutes"], int)
        assert 1 <= body["lead_minutes"] <= 30
        assert "zones" in body and isinstance(body["zones"], list)
        if body["zones"]:
            z = body["zones"][0]
            assert "id" in z and "name" in z and "is_active" in z
            # override may be true / false / None
            assert "override" in z


# ── Admin endpoint: PUT persistence + clamp ───────────────────────────────


class TestAdminPutPersist:
    def test_persist_and_clamp(self, admin_token):
        # snapshot current state to restore
        before = _get("/config/next-job/admin", token=admin_token).json()

        try:
            # 1) basic persist (in-range)
            r = _put("/config/next-job/admin", token=admin_token,
                     json={"enabled": False, "lead_minutes": 7})
            assert r.status_code == 200, r.text
            body = r.json()
            assert body["enabled"] is False
            assert body["lead_minutes"] == 7
            # GET to confirm persistence
            r2 = _get("/config/next-job/admin", token=admin_token)
            assert r2.status_code == 200
            assert r2.json()["enabled"] is False
            assert r2.json()["lead_minutes"] == 7

            # 2) clamp upper bound (>30 → 30)
            r = _put("/config/next-job/admin", token=admin_token,
                     json={"enabled": True, "lead_minutes": 999})
            assert r.status_code == 200, r.text
            assert r.json()["lead_minutes"] == 30

            # 3) clamp lower bound: negative input → 1 (works via max(1,..))
            r = _put("/config/next-job/admin", token=admin_token,
                     json={"enabled": True, "lead_minutes": -5})
            assert r.status_code == 200, r.text
            assert r.json()["lead_minutes"] == 1
            # NOTE: input 0 falls back to default 5 (because `body["lead_minutes"] or 5`).
            # Not technically out of [1..30] but inconsistent with explicit clamping.
            r = _put("/config/next-job/admin", token=admin_token,
                     json={"enabled": True, "lead_minutes": 0})
            assert r.status_code == 200, r.text
            assert r.json()["lead_minutes"] in (1, 5)

            # 4) zone overrides round-trip
            r = _get("/config/next-job/admin", token=admin_token)
            zones = r.json().get("zones", [])
            if zones:
                zid = zones[0]["id"]
                r = _put("/config/next-job/admin", token=admin_token,
                         json={"enabled": True, "lead_minutes": 5,
                               "zone_overrides": {zid: False}})
                assert r.status_code == 200, r.text
                got = next((z for z in r.json()["zones"] if z["id"] == zid), None)
                assert got and got["override"] is False, got
        finally:
            # restore baseline
            restore_overrides = {z["id"]: z["override"] for z in before.get("zones", []) if z.get("override") is not None}
            _put("/config/next-job/admin", token=admin_token, json={
                "enabled": before["enabled"],
                "lead_minutes": before["lead_minutes"],
                "zone_overrides": restore_overrides,
            })


# ── Effective resolution ──────────────────────────────────────────────────


class TestNextJobEffective:
    """GET /config/next-job?lat&lng resolution behavior."""

    def test_no_active_zone_returns_global(self, admin_token):
        # Ensure a known global state
        _put("/config/next-job/admin", token=admin_token,
             json={"enabled": True, "lead_minutes": 6, "zone_overrides": {}})
        # Coords far from any active zone (mid-Atlantic). Since all seed zones
        # are is_active=false in this env, zone resolution returns None and
        # the response should be the global config.
        r = _get("/config/next-job", params={"lat": 0, "lng": -30})
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["enabled"] is True
        assert data["lead_minutes"] == 6
        assert data["zone_id"] is None

    def test_anonymous_can_call_effective(self):
        # effective resolution does not require auth (driver-facing)
        r = _get("/config/next-job", params={"lat": 14.6, "lng": -61.1})
        assert r.status_code == 200, r.text
        body = r.json()
        assert set(["enabled", "lead_minutes", "zone_id", "zone_name"]).issubset(body.keys())

    def test_active_zone_override_wins(self, admin_token, mongo):
        """Temporarily activate a zone, set its override=false, expect the
        effective endpoint to return enabled=false even though global=true."""
        # Find a zone with a known center
        zone = mongo.zones.find_one({}, {"_id": 0})
        if not zone:
            pytest.skip("no zones seeded")
        zid = zone["id"]
        # Pick a center point from the zone (try several common schemas)
        center = None
        if zone.get("lat") is not None and zone.get("lng") is not None:
            center = (zone["lat"], zone["lng"])
        elif zone.get("center"):
            center = (zone["center"].get("lat"), zone["center"].get("lng"))
        elif zone.get("polygon"):
            pts = zone["polygon"]
            if pts and isinstance(pts, list):
                p0 = pts[0]
                if isinstance(p0, dict):
                    center = (p0.get("lat"), p0.get("lng"))
                elif isinstance(p0, (list, tuple)) and len(p0) >= 2:
                    center = (p0[0], p0[1])
        if not center or center[0] is None:
            pytest.skip(f"zone {zid} has no usable geometry")

        was_active = zone.get("is_active", False)
        # Snapshot global config
        before = _get("/config/next-job/admin", token=admin_token).json()

        try:
            # Activate the zone
            mongo.zones.update_one({"id": zid}, {"$set": {"is_active": True}})
            # Set global enabled=true, override=false for that zone
            r = _put("/config/next-job/admin", token=admin_token,
                     json={"enabled": True, "lead_minutes": 5,
                           "zone_overrides": {zid: False}})
            assert r.status_code == 200, r.text

            # Effective resolution at the zone center should return enabled=false
            r = _get("/config/next-job", params={"lat": center[0], "lng": center[1]})
            assert r.status_code == 200, r.text
            data = r.json()
            # zone resolved
            assert data.get("zone_id") == zid, f"expected zone {zid}, got {data}"
            # override (False) wins over global (True)
            assert data["enabled"] is False, data
        finally:
            # restore state
            mongo.zones.update_one({"id": zid}, {"$set": {"is_active": was_active}})
            restore_overrides = {z["id"]: z["override"] for z in before.get("zones", []) if z.get("override") is not None}
            _put("/config/next-job/admin", token=admin_token, json={
                "enabled": before["enabled"],
                "lead_minutes": before["lead_minutes"],
                "zone_overrides": restore_overrides,
            })
