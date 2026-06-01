"""Iter59 — Sponsored / featured listings backend test (catalogs + admin feature/unfeature)."""
import os
import pytest
import requests
from datetime import datetime, timezone, timedelta

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # Read from frontend/.env as fallback
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
    except Exception:
        pass

ADMIN_EMAIL = "admin@superapp.com"
ADMIN_PASSWORD = os.environ.get("TEST_ADMIN_PASSWORD", "SuperAdmin123!")
USER_EMAIL = "test2@example.com"
USER_PASSWORD = os.environ.get("TEST_USER_PASSWORD", "TestPass123!")


@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="module")
def user_session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": USER_EMAIL, "password": USER_PASSWORD})
    if r.status_code != 200:
        pytest.skip("user login failed")
    return s


# ───────── Public catalogs: featured sorting + fields ─────────

@pytest.mark.parametrize("col,expected_first_id,expected_name", [
    ("beauty_salons", "bs_01", "L'Atelier Coiffure"),
    ("car_services", "cs_02", "Garage Mécanique Bastille"),
    ("towing_partners", "tw_01", "Dépann'Express 24/7"),
])
def test_featured_item_first(col, expected_first_id, expected_name):
    r = requests.get(f"{BASE_URL}/api/phase2/catalogs/{col}")
    assert r.status_code == 200, r.text
    items = r.json()
    assert isinstance(items, list) and len(items) > 0
    first = items[0]
    assert first.get("id") == expected_first_id, f"{col} first id is {first.get('id')} not {expected_first_id}"
    assert first.get("is_featured") is True
    # Name partial check (handle apostrophe variants)
    assert expected_name.split(" ")[0].lower() in (first.get("name") or "").lower()
    # Featured fields exist
    assert "featured_until" in first
    assert "featured_priority" in first


# ───────── Admin feature/unfeature flow on bs_02 ─────────

def test_admin_feature_unfeature_bs02(admin_session):
    # Feature bs_02 for 7 days, priority 5
    r = admin_session.post(
        f"{BASE_URL}/api/phase2/admin/catalogs/beauty_salons/bs_02/feature",
        json={"duration_days": 7, "priority": 5},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert "featured_until" in body
    until = datetime.fromisoformat(body["featured_until"].replace("Z", "+00:00"))
    delta = until - datetime.now(timezone.utc)
    assert 6 <= delta.days <= 7, f"featured_until is {delta.days} days away"
    assert body.get("priority") == 5

    # Verify via public catalog
    r2 = requests.get(f"{BASE_URL}/api/phase2/catalogs/beauty_salons")
    items = r2.json()
    bs02 = next((i for i in items if i["id"] == "bs_02"), None)
    assert bs02 is not None
    assert bs02.get("is_featured") is True
    assert bs02.get("featured_priority") == 5

    # Now unfeature
    r3 = admin_session.delete(f"{BASE_URL}/api/phase2/admin/catalogs/beauty_salons/bs_02/feature")
    assert r3.status_code == 200, r3.text
    r4 = requests.get(f"{BASE_URL}/api/phase2/catalogs/beauty_salons")
    bs02_after = next((i for i in r4.json() if i["id"] == "bs_02"), None)
    assert bs02_after is not None
    assert bs02_after.get("is_featured") in (False, None)


# ───────── Admin list featured only ─────────

def test_admin_list_featured(admin_session):
    r = admin_session.get(f"{BASE_URL}/api/phase2/admin/catalogs/beauty_salons/featured")
    assert r.status_code == 200, r.text
    items = r.json()
    assert isinstance(items, list)
    # bs_01 should be in featured list
    ids = [i["id"] for i in items]
    assert "bs_01" in ids
    for it in items:
        assert it.get("is_featured") is True


# ───────── Auth/permission gates ─────────

def test_admin_endpoints_require_auth():
    r = requests.post(f"{BASE_URL}/api/phase2/admin/catalogs/beauty_salons/bs_01/feature", json={"duration_days": 1})
    assert r.status_code in (401, 403)
    r2 = requests.delete(f"{BASE_URL}/api/phase2/admin/catalogs/beauty_salons/bs_01/feature")
    assert r2.status_code in (401, 403)
    r3 = requests.get(f"{BASE_URL}/api/phase2/admin/catalogs/beauty_salons/featured")
    assert r3.status_code in (401, 403)


def test_admin_endpoints_forbid_non_admin(user_session):
    r = user_session.post(f"{BASE_URL}/api/phase2/admin/catalogs/beauty_salons/bs_01/feature", json={"duration_days": 1})
    assert r.status_code in (401, 403)


# ───────── Edge cases: 404 ─────────

def test_feature_unknown_collection(admin_session):
    r = admin_session.post(
        f"{BASE_URL}/api/phase2/admin/catalogs/users/some_id/feature",
        json={"duration_days": 1},
    )
    assert r.status_code == 404
    r2 = admin_session.delete(f"{BASE_URL}/api/phase2/admin/catalogs/users/some_id/feature")
    assert r2.status_code == 404


def test_feature_unknown_item(admin_session):
    r = admin_session.post(
        f"{BASE_URL}/api/phase2/admin/catalogs/beauty_salons/nonexistent_id_xyz/feature",
        json={"duration_days": 1},
    )
    assert r.status_code == 404


# ───────── Auto-expiry ─────────

def test_auto_expiry(admin_session):
    """Feature bs_03 then poison featured_until to past via direct admin endpoint —
    here we test via small duration: feature for 0.0001 days ~ 8.6 sec? duration_days is int,
    so instead simulate by feature then call admin again with a JSON forcing duration=-1 (negative)."""
    # Feature with duration_days = -1 → featured_until in the past
    r = admin_session.post(
        f"{BASE_URL}/api/phase2/admin/catalogs/beauty_salons/bs_03/feature",
        json={"duration_days": -1, "priority": 1},
    )
    assert r.status_code == 200, r.text
    # Now trigger auto-expiry via GET catalogs
    r2 = requests.get(f"{BASE_URL}/api/phase2/catalogs/beauty_salons")
    bs03 = next((i for i in r2.json() if i["id"] == "bs_03"), None)
    assert bs03 is not None
    assert bs03.get("is_featured") in (False, None), f"bs_03 should be auto-expired but is_featured={bs03.get('is_featured')}"
