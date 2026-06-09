"""Iter209 — Auto-surge par commune, demand-heatmap, nearby-offline-drivers."""
import os
import time
import uuid
from datetime import datetime, timezone, timedelta

import pytest
import requests

BASE = (os.environ.get("REACT_APP_BACKEND_URL") or "").rstrip("/")
FDF_LAT, FDF_LNG = 14.6037, -61.0594


@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    r = s.post(f"{BASE}/api/auth/login", json={"email": "admin@superapp.com", "password": "SuperAdmin123!"})
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text[:200]}"
    tok = r.json().get("access_token") or r.json().get("token")
    if tok:
        s.headers.update({"Authorization": f"Bearer {tok}"})
    return s


@pytest.fixture(scope="module")
def db():
    from motor.motor_asyncio import AsyncIOMotorClient
    import asyncio
    cli = AsyncIOMotorClient(os.environ["MONGO_URL"])
    return cli[os.environ["DB_NAME"]]


def _save_surge(s, enabled, cap=2.0, tiers=None):
    payload = {
        "enabled": enabled,
        "cap": cap,
        "tiers": tiers or [
            {"min_pending": 3, "multiplier": 1.2},
            {"min_pending": 6, "multiplier": 1.5},
            {"min_pending": 10, "multiplier": 1.8},
        ],
    }
    r = s.put(f"{BASE}/api/admin/dispatch/auto-surge", json=payload)
    assert r.status_code == 200, r.text
    return r.json()["config"]


# ── Auto-surge config GET/PUT ──────────────────────────────
def test_get_auto_surge_returns_shape(admin_session):
    r = admin_session.get(f"{BASE}/api/admin/dispatch/auto-surge")
    assert r.status_code == 200
    j = r.json()
    assert {"enabled", "cap", "tiers"} <= set(j.keys())
    assert isinstance(j["tiers"], list) and len(j["tiers"]) >= 1


def test_put_auto_surge_persists(admin_session):
    cfg = _save_surge(admin_session, True, cap=2.0)
    assert cfg["enabled"] is True
    assert cfg["cap"] == 2.0
    assert cfg["tiers"][0]["min_pending"] == 3
    # re-GET
    r = admin_session.get(f"{BASE}/api/admin/dispatch/auto-surge")
    assert r.json()["enabled"] is True


# ── Estimate surge tiers ───────────────────────────────────
SEED_TAG = "iter209_seed"


def _seed_pending_rides(s, n):
    """Create N pending rides at Fort-de-France pickup using admin direct DB write
    via the rides API is hard (auth as passenger). Instead, write directly through mongo."""
    import asyncio
    from motor.motor_asyncio import AsyncIOMotorClient
    cli = AsyncIOMotorClient(os.environ["MONGO_URL"])
    d = cli[os.environ["DB_NAME"]]

    async def insert():
        now = datetime.now(timezone.utc).isoformat()
        docs = []
        for i in range(n):
            docs.append({
                "id": f"r_{SEED_TAG}_{uuid.uuid4().hex[:8]}",
                "user_id": "seed_user",
                "pickup_address": "Fort-de-France",
                "pickup_lat": FDF_LAT + (i * 0.0001),
                "pickup_lng": FDF_LNG + (i * 0.0001),
                "dropoff_address": "Schoelcher",
                "dropoff_lat": 14.61, "dropoff_lng": -61.10,
                "vehicle_type": "sb",
                "status": "pending",
                "driver_id": None,
                "estimated_fare": 12.0,
                "payment_method": "cash",
                "created_at": now,
                "_seed": SEED_TAG,
            })
        if docs:
            await d.rides.insert_many(docs)
        return len(docs)
    return asyncio.get_event_loop().run_until_complete(insert()) if False else asyncio.new_event_loop().run_until_complete(insert())


def _cleanup_seed():
    import asyncio
    from motor.motor_asyncio import AsyncIOMotorClient
    cli = AsyncIOMotorClient(os.environ["MONGO_URL"])
    d = cli[os.environ["DB_NAME"]]

    async def run():
        await d.rides.delete_many({"_seed": SEED_TAG})
    asyncio.new_event_loop().run_until_complete(run())


def _estimate(s):
    r = s.post(f"{BASE}/api/rides/estimate", json={
        "pickup_address": "Fort-de-France",
        "pickup_lat": FDF_LAT, "pickup_lng": FDF_LNG,
        "dropoff_address": "Schoelcher",
        "dropoff_lat": 14.61, "dropoff_lng": -61.10,
        "vehicle_type": "sb",
        "payment_method": "cash",
    })
    return r


def test_surge_tier_1_2_with_6_pending(admin_session):
    _cleanup_seed()
    _save_surge(admin_session, True)
    try:
        n = _seed_pending_rides(admin_session, 6)
        assert n == 6
        r = _estimate(admin_session)
        assert r.status_code == 200, r.text
        # The estimate endpoint may return per-vehicle options; locate the one
        body = r.json()
        # Try to find surge_multiplier anywhere
        found_mult = None
        reasons_text = ""
        def walk(o):
            nonlocal found_mult, reasons_text
            if isinstance(o, dict):
                if "surge_multiplier" in o and isinstance(o["surge_multiplier"], (int, float)):
                    found_mult = max(found_mult or 0, o["surge_multiplier"])
                if "reasons" in o and isinstance(o["reasons"], list):
                    reasons_text += " | ".join(str(x) for x in o["reasons"]) + " "
                for v in o.values():
                    walk(v)
            elif isinstance(o, list):
                for v in o:
                    walk(v)
        walk(body)
        assert found_mult is not None and found_mult >= 1.5 - 1e-6, f"expected >=1.5 got {found_mult}, body={body}"
        # Reasons text may or may not be exposed at top level; verify if present.
        if reasons_text.strip():
            assert "forte demande" in reasons_text.lower() or "majoré" in reasons_text.lower(), reasons_text
    finally:
        _cleanup_seed()


def test_surge_disabled_returns_1(admin_session):
    _cleanup_seed()
    _save_surge(admin_session, False)
    try:
        _seed_pending_rides(admin_session, 8)
        r = _estimate(admin_session)
        assert r.status_code == 200
        body = r.json()
        mults = []
        def walk(o):
            if isinstance(o, dict):
                if "surge_multiplier" in o:
                    mults.append(o["surge_multiplier"])
                for v in o.values():
                    walk(v)
            elif isinstance(o, list):
                for v in o:
                    walk(v)
        walk(body)
        # no auto-surge => all returned multipliers should equal 1
        if mults:
            assert max(mults) <= 1.0 + 1e-6, f"expected no surge, got {mults}"
    finally:
        _cleanup_seed()
        _save_surge(admin_session, True)  # leave enabled per user request


def test_surge_tier_x18_with_10_pending(admin_session):
    _cleanup_seed()
    _save_surge(admin_session, True)
    try:
        _seed_pending_rides(admin_session, 10)
        r = _estimate(admin_session)
        assert r.status_code == 200
        body = r.json()
        best = 1.0
        def walk(o):
            nonlocal best
            if isinstance(o, dict):
                if "surge_multiplier" in o and isinstance(o["surge_multiplier"], (int, float)):
                    best = max(best, o["surge_multiplier"])
                for v in o.values():
                    walk(v)
            elif isinstance(o, list):
                for v in o:
                    walk(v)
        walk(body)
        assert best >= 1.8 - 1e-6, f"expected x1.8, got {best}"
        assert best <= 2.0 + 1e-6, f"cap exceeded: {best}"
    finally:
        _cleanup_seed()


# ── Heatmap ───────────────────────────────────────────────
def test_demand_heatmap_exposes_surge(admin_session):
    _cleanup_seed()
    _save_surge(admin_session, True)
    try:
        _seed_pending_rides(admin_session, 6)
        r = admin_session.get(f"{BASE}/api/admin/dispatch/demand-heatmap")
        assert r.status_code == 200
        j = r.json()
        assert j.get("auto_surge_enabled") is True
        # Find FdF commune entry with surge >=1.5
        fdf = [c for c in j.get("communes", []) if "fort" in c["zone"].lower() and "france" in c["zone"].lower()]
        assert fdf, f"FdF commune not present in heatmap: {[c['zone'] for c in j.get('communes', [])]}"
        assert fdf[0]["surge_multiplier"] >= 1.5 - 1e-6
    finally:
        _cleanup_seed()


# ── Nearby offline drivers ────────────────────────────────
def test_nearby_offline_drivers_endpoint(admin_session):
    r = admin_session.get(f"{BASE}/api/admin/dispatch/nearby-offline-drivers?days=14")
    assert r.status_code == 200
    j = r.json()
    assert set(["drivers", "count", "days"]) <= set(j.keys())
    assert j["days"] == 14
    assert isinstance(j["drivers"], list)
    for d in j["drivers"]:
        assert "driver_id" in d and "name" in d and "phone" in d
        assert "zone" in d and "last_worked" in d


def test_nearby_offline_drivers_includes_seeded_taxi(admin_session):
    """Take an existing taxi driver, force is_online=False, create a completed ride
    with their driver_id within the last 14d, then assert they surface."""
    import asyncio
    from motor.motor_asyncio import AsyncIOMotorClient
    cli = AsyncIOMotorClient(os.environ["MONGO_URL"])
    d = cli[os.environ["DB_NAME"]]
    SEED_RIDE_TAG = "iter209_offline_seed"
    SEED_USER = None
    DRV_ID = None

    async def setup():
        nonlocal SEED_USER, DRV_ID
        drv = await d.drivers.find_one({"status": "approved", "service_types": "taxi"}, {"_id": 0, "id": 1, "user_id": 1})
        if not drv:
            return False
        DRV_ID = drv["id"]
        SEED_USER = drv["user_id"]
        await d.drivers.update_one({"id": DRV_ID}, {"$set": {"is_online": False}})
        now_iso = datetime.now(timezone.utc).isoformat()
        await d.rides.insert_one({
            "id": f"completed_{SEED_RIDE_TAG}_{uuid.uuid4().hex[:8]}",
            "user_id": "seed_user",
            "driver_id": DRV_ID,
            "status": "completed",
            "pickup_address": "FdF", "pickup_lat": FDF_LAT, "pickup_lng": FDF_LNG,
            "dropoff_address": "Schoelcher", "dropoff_lat": 14.61, "dropoff_lng": -61.10,
            "vehicle_type": "sb",
            "estimated_fare": 12.0,
            "created_at": now_iso, "updated_at": now_iso, "completed_at": now_iso,
            "_seed": SEED_RIDE_TAG,
        })
        return True

    async def cleanup():
        await d.rides.delete_many({"_seed": SEED_RIDE_TAG})

    loop = asyncio.new_event_loop()
    ok = loop.run_until_complete(setup())
    if not ok:
        pytest.skip("no taxi driver in DB to seed offline test")
    try:
        r = admin_session.get(f"{BASE}/api/admin/dispatch/nearby-offline-drivers?days=14")
        assert r.status_code == 200
        ids = [x["driver_id"] for x in r.json()["drivers"]]
        assert DRV_ID in ids, f"seeded driver {DRV_ID} not in {ids}"
    finally:
        loop.run_until_complete(cleanup())
        loop.close()


# Cleanup at session end + leave auto_surge enabled
def teardown_module(module):
    try:
        s = requests.Session()
        r = s.post(f"{BASE}/api/auth/login", json={"email": "admin@superapp.com", "password": "SuperAdmin123!"})
        tok = r.json().get("access_token") or r.json().get("token")
        if tok: s.headers.update({"Authorization": f"Bearer {tok}"})
        _save_surge(s, True)
    except Exception:
        pass
    _cleanup_seed()
