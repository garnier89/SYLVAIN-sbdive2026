"""Iter 539 — HTTP regression for admin broadcast manager: segments + scheduling.

Covers (via public REACT_APP_BACKEND_URL):
- GET /admin/notifications/broadcasts returns: items, audiences (8 incl. driver_offline,
  driver_zone, client_inactive, client_inactive_zone), zones, inactivity_presets,
  zone_audiences, inactivity_audiences.
- POST /admin/notifications/broadcasts/preview for driver_offline, client_inactive
  (7d >= 30d), driver_zone (valid zone_id), client_inactive_zone.
- POST /broadcasts with audience driver_zone or client_inactive_zone w/o zone_id → 400.
  With valid zone_id → persist zone_id/zone_name.
- Scheduling: future schedule_at → status 'scheduled'; past → 'draft'.
- PUT /broadcasts/{id} can change schedule_at + targeting.
- inactivity: create with client_inactive + inactive_days preset; verify persistence.

Strictly avoids sending to large audiences. Cleans up all created data.
"""
import os
import requests
import pytest
from datetime import datetime, timezone, timedelta


def _base():
    b = os.environ.get("REACT_APP_BACKEND_URL")
    if not b:
        try:
            with open("/app/frontend/.env") as f:
                for line in f:
                    if line.startswith("REACT_APP_BACKEND_URL="):
                        b = line.strip().split("=", 1)[1]
                        break
        except FileNotFoundError:
            pass
    return (b or "").rstrip("/")


API = f"{_base()}/api"
ADMIN_EMAIL = "admin@superapp.com"
ADMIN_PWD = "SuperAdmin123!"


@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PWD}, timeout=15)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    token = r.json().get("access_token") or r.json().get("token")
    if token:
        s.headers.update({"Authorization": f"Bearer {token}"})
    return s


@pytest.fixture(scope="module")
def listing(admin_session):
    r = admin_session.get(f"{API}/admin/notifications/broadcasts", timeout=20)
    assert r.status_code == 200, r.text
    return r.json()


# --- List shape -------------------------------------------------------------

def test_list_shape_audiences_zones_presets(listing):
    assert isinstance(listing.get("items"), list)
    vals = {a["value"] for a in listing.get("audiences", [])}
    expected = {"all", "client", "driver", "merchant",
                "driver_offline", "driver_zone",
                "client_inactive", "client_inactive_zone"}
    assert expected.issubset(vals), f"audiences missing: {expected - vals}"
    # zones list (may be empty in fresh DBs but key present)
    assert isinstance(listing.get("zones"), list)
    presets = [p["value"] for p in listing.get("inactivity_presets", [])]
    assert presets == [7, 14, 21, 30, 60, 90]
    assert set(listing.get("zone_audiences", [])) == {"driver_zone", "client_inactive_zone"}
    assert set(listing.get("inactivity_audiences", [])) == {"client_inactive", "client_inactive_zone"}


# --- Preview ----------------------------------------------------------------

def test_preview_driver_offline(admin_session):
    r = admin_session.post(f"{API}/admin/notifications/broadcasts/preview",
                           json={"audience": "driver_offline"}, timeout=15)
    assert r.status_code == 200, r.text
    assert isinstance(r.json().get("count"), int)


def test_preview_client_inactive_7_ge_30(admin_session):
    r7 = admin_session.post(f"{API}/admin/notifications/broadcasts/preview",
                            json={"audience": "client_inactive", "inactive_days": 7}, timeout=20)
    r30 = admin_session.post(f"{API}/admin/notifications/broadcasts/preview",
                             json={"audience": "client_inactive", "inactive_days": 30}, timeout=20)
    assert r7.status_code == 200 and r30.status_code == 200
    c7, c30 = r7.json()["count"], r30.json()["count"]
    assert c7 >= c30, f"7d ({c7}) must be >= 30d ({c30})"


def test_preview_driver_zone_with_valid_zone(admin_session, listing):
    zones = listing.get("zones") or []
    if not zones:
        pytest.skip("no zones configured")
    zid = zones[0]["id"]
    r = admin_session.post(f"{API}/admin/notifications/broadcasts/preview",
                           json={"audience": "driver_zone", "zone_id": zid}, timeout=20)
    assert r.status_code == 200, r.text
    assert isinstance(r.json().get("count"), int)


def test_preview_client_inactive_zone(admin_session, listing):
    zones = listing.get("zones") or []
    if not zones:
        pytest.skip("no zones configured")
    zid = zones[0]["id"]
    r = admin_session.post(f"{API}/admin/notifications/broadcasts/preview",
                           json={"audience": "client_inactive_zone", "zone_id": zid,
                                 "inactive_days": 30}, timeout=20)
    assert r.status_code == 200, r.text
    assert isinstance(r.json().get("count"), int)


# --- Zone required validation -----------------------------------------------

def test_create_driver_zone_without_zone_id_400(admin_session):
    r = admin_session.post(f"{API}/admin/notifications/broadcasts",
                           json={"title": "TEST_539_x", "body": "x",
                                 "audience": "driver_zone"}, timeout=15)
    assert r.status_code == 400, r.text
    assert "Zone" in (r.json().get("detail") or "")


def test_create_client_inactive_zone_without_zone_id_400(admin_session):
    r = admin_session.post(f"{API}/admin/notifications/broadcasts",
                           json={"title": "TEST_539_x", "body": "x",
                                 "audience": "client_inactive_zone"}, timeout=15)
    assert r.status_code == 400, r.text
    assert "Zone" in (r.json().get("detail") or "")


def test_create_driver_zone_with_valid_zone_persists(admin_session, listing):
    zones = listing.get("zones") or []
    if not zones:
        pytest.skip("no zones configured")
    z = zones[0]
    payload = {"title": "TEST_539 zone", "body": "TEST", "audience": "driver_zone",
               "zone_id": z["id"]}
    r = admin_session.post(f"{API}/admin/notifications/broadcasts", json=payload, timeout=15)
    assert r.status_code in (200, 201), r.text
    created = r.json()
    bid = created["id"]
    try:
        assert created["zone_id"] == z["id"]
        assert created["zone_name"] == z.get("name")
        assert created["audience"] == "driver_zone"
    finally:
        admin_session.delete(f"{API}/admin/notifications/broadcasts/{bid}", timeout=15)


# --- Scheduling -------------------------------------------------------------

def test_schedule_future_status_scheduled(admin_session):
    future = (datetime.now(timezone.utc) + timedelta(hours=2)).isoformat()
    r = admin_session.post(f"{API}/admin/notifications/broadcasts",
                           json={"title": "TEST_539 sched fut", "body": "x",
                                 "audience": "merchant", "schedule_at": future}, timeout=15)
    assert r.status_code in (200, 201), r.text
    c = r.json()
    bid = c["id"]
    try:
        assert c["status"] == "scheduled"
        assert c["schedule_at"]  # stored as ISO UTC
        # Round-trip parseable
        datetime.fromisoformat(c["schedule_at"].replace("Z", "+00:00"))
    finally:
        admin_session.delete(f"{API}/admin/notifications/broadcasts/{bid}", timeout=15)


def test_schedule_past_status_draft(admin_session):
    past = (datetime.now(timezone.utc) - timedelta(hours=2)).isoformat()
    r = admin_session.post(f"{API}/admin/notifications/broadcasts",
                           json={"title": "TEST_539 sched past", "body": "x",
                                 "audience": "merchant", "schedule_at": past}, timeout=15)
    assert r.status_code in (200, 201), r.text
    c = r.json()
    bid = c["id"]
    try:
        assert c["status"] == "draft", f"past schedule should NOT auto-fire, got {c}"
    finally:
        admin_session.delete(f"{API}/admin/notifications/broadcasts/{bid}", timeout=15)


def test_put_updates_schedule_and_targeting(admin_session, listing):
    # Create as draft
    r = admin_session.post(f"{API}/admin/notifications/broadcasts",
                           json={"title": "TEST_539 put", "body": "x",
                                 "audience": "merchant"}, timeout=15)
    assert r.status_code in (200, 201), r.text
    bid = r.json()["id"]
    try:
        new_future = (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()
        # Switch to driver_offline + future schedule
        r2 = admin_session.put(f"{API}/admin/notifications/broadcasts/{bid}",
                               json={"audience": "driver_offline",
                                     "schedule_at": new_future}, timeout=15)
        assert r2.status_code == 200, r2.text
        u = r2.json()
        assert u["audience"] == "driver_offline"
        assert u["status"] == "scheduled"
        assert u["zone_id"] is None
    finally:
        admin_session.delete(f"{API}/admin/notifications/broadcasts/{bid}", timeout=15)


# --- Inactivity persistence -------------------------------------------------

def test_create_client_inactive_persists_inactive_days(admin_session):
    r = admin_session.post(f"{API}/admin/notifications/broadcasts",
                           json={"title": "TEST_539 inact", "body": "x",
                                 "audience": "client_inactive",
                                 "inactive_days": 21}, timeout=15)
    assert r.status_code in (200, 201), r.text
    c = r.json()
    bid = c["id"]
    try:
        assert c["audience"] == "client_inactive"
        assert c["inactive_days"] == 21
        assert c["zone_id"] is None
    finally:
        admin_session.delete(f"{API}/admin/notifications/broadcasts/{bid}", timeout=15)
