"""Backend tests for Home Banners CMS (iter 363).

Covers:
- Public GET /api/home-banners (seed, ordering, scope, scheduling)
- Public dismiss/impression tracking
- Admin CRUD with require_permission("content.manage") gating
- Reorder
- Promo banners scheduling + dismiss endpoint
"""
import os
from datetime import datetime, timedelta, timezone
import pytest
import requests

def _read_env_url():
    v = os.environ.get("REACT_APP_BACKEND_URL")
    if v:
        return v
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    return line.split("=", 1)[1].strip()
    except Exception:
        pass
    raise RuntimeError("REACT_APP_BACKEND_URL not found")


BASE_URL = _read_env_url().rstrip("/")
ADMIN_EMAIL = "admin@superapp.com"
ADMIN_PASS = "SuperAdmin123!"


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def admin_token(session):
    r = session.post(f"{BASE_URL}/api/auth/login",
                     json={"email": ADMIN_EMAIL, "password": ADMIN_PASS})
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    return r.json().get("access_token") or r.json().get("token")


@pytest.fixture(scope="module")
def admin_session(session, admin_token):
    s = requests.Session()
    s.headers.update({
        "Content-Type": "application/json",
        "Authorization": f"Bearer {admin_token}",
    })
    return s


# ---------------------------------------------------------------- Public list
class TestHomeBannersPublic:
    def test_public_list_default_seed(self, session):
        r = session.get(f"{BASE_URL}/api/home-banners")
        assert r.status_code == 200
        data = r.json()
        assert "banners" in data
        keys = [b["key"] for b in data["banners"]]
        assert "sb_student" in keys
        assert "instant_delivery" in keys
        # Variants
        by_key = {b["key"]: b for b in data["banners"]}
        assert by_key["sb_student"]["variant"] == "entry"
        assert by_key["instant_delivery"]["variant"] == "hero"
        # Ordered by display_order
        orders = [b["display_order"] for b in data["banners"]]
        assert orders == sorted(orders)
        # Mongo _id excluded
        for b in data["banners"]:
            assert "_id" not in b

    def test_public_list_active_only(self, session):
        r = session.get(f"{BASE_URL}/api/home-banners")
        assert r.status_code == 200
        for b in r.json()["banners"]:
            assert b["active"] is True


# ---------------------------------------------------------------- Admin gating
class TestAdminGating:
    def test_admin_list_unauthenticated(self, session):
        r = session.get(f"{BASE_URL}/api/admin/home-banners")
        assert r.status_code in (401, 403)

    def test_admin_create_unauthenticated(self, session):
        r = session.post(f"{BASE_URL}/api/admin/home-banners", json={"title": "x"})
        assert r.status_code in (401, 403)


# ---------------------------------------------------------------- Admin CRUD
class TestAdminCRUD:
    created_ids: list = []

    def test_admin_list_with_close_rate(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/admin/home-banners")
        assert r.status_code == 200
        data = r.json()
        assert "banners" in data
        for b in data["banners"]:
            assert "close_rate" in b
            assert isinstance(b["close_rate"], (int, float))

    def test_create_missing_title_400(self, admin_session):
        r = admin_session.post(f"{BASE_URL}/api/admin/home-banners",
                               json={"title": "", "subtitle": "x"})
        assert r.status_code == 400

    def test_create_update_toggle_delete(self, admin_session):
        # CREATE
        payload = {
            "title": "TEST_iter363 banner",
            "subtitle": "test sub",
            "variant": "entry",
            "icon": "Star",
            "bg_from": "#000000",
            "bg_to": "#111111",
            "target_route": "/test",
            "active": True,
            "dismissible": True,
            "scope": {},
        }
        r = admin_session.post(f"{BASE_URL}/api/admin/home-banners", json=payload)
        assert r.status_code == 200, r.text
        created = r.json()
        assert created["title"] == "TEST_iter363 banner"
        assert created["variant"] == "entry"
        assert "id" in created
        bid = created["id"]
        TestAdminCRUD.created_ids.append(bid)

        # Verify in list
        rl = admin_session.get(f"{BASE_URL}/api/admin/home-banners")
        ids = [b["id"] for b in rl.json()["banners"]]
        assert bid in ids

        # UPDATE — verify updated_at touched
        prev_updated = next(b for b in rl.json()["banners"] if b["id"] == bid)["updated_at"]
        ru = admin_session.put(f"{BASE_URL}/api/admin/home-banners/{bid}",
                               json={"title": "TEST_iter363 updated"})
        assert ru.status_code == 200
        rl2 = admin_session.get(f"{BASE_URL}/api/admin/home-banners")
        nb = next(b for b in rl2.json()["banners"] if b["id"] == bid)
        assert nb["title"] == "TEST_iter363 updated"
        assert nb["updated_at"] != prev_updated

        # TOGGLE
        rt = admin_session.patch(f"{BASE_URL}/api/admin/home-banners/{bid}/toggle")
        assert rt.status_code == 200
        assert rt.json()["active"] is False
        rt2 = admin_session.patch(f"{BASE_URL}/api/admin/home-banners/{bid}/toggle")
        assert rt2.json()["active"] is True

        # DELETE
        rd = admin_session.delete(f"{BASE_URL}/api/admin/home-banners/{bid}")
        assert rd.status_code == 200
        TestAdminCRUD.created_ids.remove(bid)
        # Verify removed
        rl3 = admin_session.get(f"{BASE_URL}/api/admin/home-banners")
        assert bid not in [b["id"] for b in rl3.json()["banners"]]

    def test_update_404(self, admin_session):
        r = admin_session.put(f"{BASE_URL}/api/admin/home-banners/nonexistent_id",
                              json={"title": "x"})
        assert r.status_code == 404

    def test_delete_404(self, admin_session):
        r = admin_session.delete(f"{BASE_URL}/api/admin/home-banners/nonexistent_id")
        assert r.status_code == 404


# ---------------------------------------------------------------- Zone target
class TestZoneTargeting:
    bid: str = ""

    def test_zone_scoped_banner_visibility(self, admin_session, session):
        # Create MQ/Fort-de-France-scoped banner
        r = admin_session.post(f"{BASE_URL}/api/admin/home-banners", json={
            "title": "TEST_iter363 MQ banner",
            "variant": "entry",
            "active": True,
            "scope": {"country": "MQ", "city": "Fort-de-France"},
        })
        assert r.status_code == 200
        TestZoneTargeting.bid = r.json()["id"]
        bid = TestZoneTargeting.bid

        # Without zone → not visible
        r1 = session.get(f"{BASE_URL}/api/home-banners")
        assert bid not in [b["id"] for b in r1.json()["banners"]]

        # With country=FR → not visible
        r2 = session.get(f"{BASE_URL}/api/home-banners?country=FR")
        assert bid not in [b["id"] for b in r2.json()["banners"]]

        # With MQ + Fort-de-France → visible
        r3 = session.get(f"{BASE_URL}/api/home-banners?country=MQ&city=Fort-de-France")
        assert bid in [b["id"] for b in r3.json()["banners"]]

        # Cleanup
        admin_session.delete(f"{BASE_URL}/api/admin/home-banners/{bid}")


# ---------------------------------------------------------------- Scheduling
class TestScheduling:
    def test_future_starts_at_excluded(self, admin_session, session):
        future = (datetime.now(timezone.utc) + timedelta(days=7)).isoformat()
        r = admin_session.post(f"{BASE_URL}/api/admin/home-banners", json={
            "title": "TEST_iter363 future",
            "variant": "entry",
            "active": True,
            "starts_at": future,
        })
        assert r.status_code == 200
        bid = r.json()["id"]
        try:
            pub = session.get(f"{BASE_URL}/api/home-banners")
            assert bid not in [b["id"] for b in pub.json()["banners"]]
        finally:
            admin_session.delete(f"{BASE_URL}/api/admin/home-banners/{bid}")

    def test_past_ends_at_excluded(self, admin_session, session):
        past = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
        r = admin_session.post(f"{BASE_URL}/api/admin/home-banners", json={
            "title": "TEST_iter363 past",
            "variant": "entry",
            "active": True,
            "ends_at": past,
        })
        assert r.status_code == 200
        bid = r.json()["id"]
        try:
            pub = session.get(f"{BASE_URL}/api/home-banners")
            assert bid not in [b["id"] for b in pub.json()["banners"]]
        finally:
            admin_session.delete(f"{BASE_URL}/api/admin/home-banners/{bid}")


# ---------------------------------------------------------------- Tracking
class TestTracking:
    def test_dismiss_and_impression_increment(self, admin_session, session):
        # Find sb_student banner id
        r = admin_session.get(f"{BASE_URL}/api/admin/home-banners")
        sb = next(b for b in r.json()["banners"] if b["key"] == "sb_student")
        bid = sb["id"]
        d0 = sb.get("dismiss_count", 0) or 0
        i0 = sb.get("impressions", 0) or 0

        session.post(f"{BASE_URL}/api/home-banners/{bid}/dismiss")
        session.post(f"{BASE_URL}/api/home-banners/{bid}/impression")

        r2 = admin_session.get(f"{BASE_URL}/api/admin/home-banners")
        sb2 = next(b for b in r2.json()["banners"] if b["id"] == bid)
        assert (sb2.get("dismiss_count") or 0) >= d0 + 1
        assert (sb2.get("impressions") or 0) >= i0 + 1


# ---------------------------------------------------------------- Reorder
class TestReorder:
    def test_reorder(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/admin/home-banners")
        banners = r.json()["banners"]
        if len(banners) < 2:
            pytest.skip("Need at least 2 banners")
        ids = [b["id"] for b in banners]
        reversed_ids = list(reversed(ids))
        rr = admin_session.post(f"{BASE_URL}/api/admin/home-banners/reorder",
                                json={"ordered_ids": reversed_ids})
        assert rr.status_code == 200
        # Verify display_order matches
        r2 = admin_session.get(f"{BASE_URL}/api/admin/home-banners")
        by_id = {b["id"]: b for b in r2.json()["banners"]}
        for i, bid in enumerate(reversed_ids):
            assert by_id[bid]["display_order"] == i

        # Restore original order
        admin_session.post(f"{BASE_URL}/api/admin/home-banners/reorder",
                          json={"ordered_ids": ids})


# ---------------------------------------------------------------- Promo banners
class TestPromoBanners:
    def test_promo_dismiss_endpoint(self, admin_session, session):
        # Get a promo banner id
        pub = session.get(f"{BASE_URL}/api/promo-banners")
        assert pub.status_code == 200
        items = pub.json().get("items", [])
        if not items:
            pytest.skip("No promo banners seeded")
        bid = items[0]["id"]
        r = session.post(f"{BASE_URL}/api/promo-banners/{bid}/dismiss")
        assert r.status_code == 200
        assert r.json().get("ok") is True

    def test_promo_scheduling_excludes_future(self, admin_session, session):
        future = (datetime.now(timezone.utc) + timedelta(days=7)).isoformat()
        r = admin_session.post(f"{BASE_URL}/api/promo-banners/admin", json={
            "title": "TEST_iter363 promo future",
            "status": "active",
            "starts_at": future,
        })
        assert r.status_code == 200
        bid = r.json()["id"]
        try:
            pub = session.get(f"{BASE_URL}/api/promo-banners")
            assert bid not in [b["id"] for b in pub.json().get("items", [])]
        finally:
            admin_session.delete(f"{BASE_URL}/api/promo-banners/admin/{bid}")

    def test_promo_scheduling_excludes_past(self, admin_session, session):
        past = (datetime.now(timezone.utc) - timedelta(days=2)).isoformat()
        r = admin_session.post(f"{BASE_URL}/api/promo-banners/admin", json={
            "title": "TEST_iter363 promo past",
            "status": "active",
            "ends_at": past,
        })
        assert r.status_code == 200
        bid = r.json()["id"]
        try:
            pub = session.get(f"{BASE_URL}/api/promo-banners")
            assert bid not in [b["id"] for b in pub.json().get("items", [])]
        finally:
            admin_session.delete(f"{BASE_URL}/api/promo-banners/admin/{bid}")
