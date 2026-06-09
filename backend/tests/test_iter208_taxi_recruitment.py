"""Iter208 — Admin alert "courier-only drivers in hot taxi zones".

Tests:
  GET  /api/admin/dispatch/taxi-recruitment        (hot zones + candidates)
  POST /api/admin/dispatch/taxi-recruitment/invite (send notification)
And verifies the driver notification is created with proper deep-link.
"""
import os
import sys

import pytest
import requests

sys.path.insert(0, os.path.dirname(__file__))
from _creds import ADMIN_EMAIL, ADMIN_PASSWORD  # noqa: E402

BASE_URL = os.environ.get(
    "REACT_APP_BACKEND_URL", "https://gojek-clone-41.preview.emergentagent.com"
).rstrip("/")
API = f"{BASE_URL}/api"

EXPECTED_ZONE = "ZoneTestRecrutement"
EXPECTED_DRIVER_ID = "driver_3575f54d5180"
DRIVER_EMAIL = "qa.docs.live@demo.sb"
DRIVER_PASSWORD = "Driver123!"


@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    r = s.post(
        f"{API}/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=15,
    )
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="module")
def driver_session():
    s = requests.Session()
    r = s.post(
        f"{API}/auth/login",
        json={"email": DRIVER_EMAIL, "password": DRIVER_PASSWORD},
        timeout=15,
    )
    if r.status_code != 200:
        pytest.skip(f"Driver login failed: {r.status_code} {r.text}")
    return s


# ---------- GET /taxi-recruitment ----------

class TestTaxiRecruitmentList:
    def test_unauth_blocked(self):
        r = requests.get(f"{API}/admin/dispatch/taxi-recruitment", timeout=15)
        assert r.status_code in (401, 403), f"Unauth should be blocked: {r.status_code}"

    def test_admin_returns_hot_zone(self, admin_session):
        r = admin_session.get(f"{API}/admin/dispatch/taxi-recruitment", timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()

        # Top-level shape
        assert "hot_zones" in data and isinstance(data["hot_zones"], list)
        assert "totals" in data and isinstance(data["totals"], dict)
        t = data["totals"]
        assert t["min_pending"] == 3
        assert t["hot_zones"] == len(data["hot_zones"])
        assert isinstance(t["candidates"], int)

        # Seed zone must be present
        zones_by_name = {z["zone"]: z for z in data["hot_zones"]}
        assert EXPECTED_ZONE in zones_by_name, (
            f"Expected hot zone '{EXPECTED_ZONE}' missing. Got: {list(zones_by_name.keys())}"
        )

        z = zones_by_name[EXPECTED_ZONE]
        # Pending >= 3 AND pending > online_taxi (hot rule)
        assert z["pending"] >= 3, f"pending must be ≥3, got {z['pending']}"
        assert z["pending"] > z["online_taxi"], (
            f"pending({z['pending']}) must be > online_taxi({z['online_taxi']})"
        )
        assert z["deficit"] == z["pending"] - z["online_taxi"]
        assert isinstance(z["candidates"], list)

        # Candidate driver shape + must include expected courier-only seed driver
        cand_ids = [c["driver_id"] for c in z["candidates"]]
        assert EXPECTED_DRIVER_ID in cand_ids, (
            f"Expected candidate {EXPECTED_DRIVER_ID} missing. Got: {cand_ids}"
        )
        cand = next(c for c in z["candidates"] if c["driver_id"] == EXPECTED_DRIVER_ID)
        for k in ("driver_id", "name", "is_online", "vehicle_type",
                  "vtc_eligible", "services"):
            assert k in cand, f"missing key {k} in candidate: {cand}"
        # Courier-only -> taxi must NOT be in services
        assert "taxi" not in (cand["services"] or []), (
            f"Candidate should be courier-only, got services={cand['services']}"
        )


# ---------- POST /taxi-recruitment/invite ----------

class TestTaxiRecruitmentInvite:
    def test_unknown_driver_404(self, admin_session):
        r = admin_session.post(
            f"{API}/admin/dispatch/taxi-recruitment/invite",
            json={"driver_id": "driver_does_not_exist_xyz", "zone": EXPECTED_ZONE},
            timeout=15,
        )
        assert r.status_code == 404, f"expected 404, got {r.status_code} {r.text}"

    def test_invite_creates_notification(self, admin_session):
        # Send invite
        r = admin_session.post(
            f"{API}/admin/dispatch/taxi-recruitment/invite",
            json={"driver_id": EXPECTED_DRIVER_ID, "zone": EXPECTED_ZONE},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("driver_id") == EXPECTED_DRIVER_ID
        assert "message" in body

        # Verify notification is persisted in DB with proper data.kind + link.
        import asyncio
        # Always load backend .env (override any stale env value)
        try:
            with open("/app/backend/.env") as f:
                for line in f:
                    line = line.strip()
                    if "=" in line and not line.startswith("#"):
                        k, v = line.split("=", 1)
                        os.environ[k] = v.strip().strip('"').strip("'")
        except Exception:
            pass
        from motor.motor_asyncio import AsyncIOMotorClient

        async def fetch():
            cli = AsyncIOMotorClient(os.environ["MONGO_URL"])
            db = cli[os.environ["DB_NAME"]]
            drv = await db.drivers.find_one({"id": EXPECTED_DRIVER_ID}, {"_id": 0, "user_id": 1})
            assert drv, "Seed driver missing"
            notifs = await db.notifications.find(
                {"user_id": drv["user_id"], "data.kind": "taxi_invite"},
                {"_id": 0},
            ).sort("created_at", -1).to_list(5)
            return notifs

        notifs = asyncio.run(fetch())
        assert notifs, "No taxi_invite notification persisted in DB"
        n = notifs[0]
        assert (n.get("data") or {}).get("link") == "/chauffeur/profile?services=1", n
        assert n.get("type") == "promo", n
        assert "Taxi" in (n.get("title") or ""), n


# ---------- Hot-zone rule sanity ----------

class TestHotZoneRule:
    def test_only_hot_zones_returned(self, admin_session):
        """Every zone in hot_zones must satisfy pending>=3 AND pending>online_taxi."""
        r = admin_session.get(f"{API}/admin/dispatch/taxi-recruitment", timeout=15)
        assert r.status_code == 200
        for z in r.json()["hot_zones"]:
            assert z["pending"] >= 3, z
            assert z["pending"] > z["online_taxi"], z
            # Candidates are courier/delivery without taxi
            for c in z["candidates"]:
                assert "taxi" not in (c["services"] or []), c
