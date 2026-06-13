"""Backend tests for Home Banners analytics (iter 364).

Covers:
- POST /api/home-banners/{id}/impression|click|dismiss — log to banner_events + counters
- User attribution via cookie/Bearer (logged-in user → real name, else 'Visiteur anonyme')
- Geo attribution via body {location} or {country,city}
- GET /api/admin/home-banners/analytics — per-banner totals, CTR, close_rate, by_zone
- GET /api/admin/home-banners/{id}/events — sorted desc, filter by event type
- Admin gating on analytics + events
"""
import os
from datetime import datetime
import pytest
import requests


def _read_env_url():
    v = os.environ.get("REACT_APP_BACKEND_URL")
    if v:
        return v
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                return line.split("=", 1)[1].strip()
    raise RuntimeError("REACT_APP_BACKEND_URL not found")


BASE_URL = _read_env_url().rstrip("/")
ADMIN_EMAIL = "admin@superapp.com"
ADMIN_PASS = "SuperAdmin123!"
USER_EMAIL = "test2@example.com"
USER_PASS = "TestPass123!"


@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE_URL}/api/auth/login",
               json={"email": ADMIN_EMAIL, "password": ADMIN_PASS})
    assert r.status_code == 200, r.text
    tok = r.json().get("access_token") or r.json().get("token")
    s.headers.update({"Authorization": f"Bearer {tok}"})
    return s


@pytest.fixture(scope="module")
def user_session():
    """User session relying on httpOnly cookie (axios withCredentials parity)."""
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE_URL}/api/auth/login",
               json={"email": USER_EMAIL, "password": USER_PASS})
    if r.status_code != 200:
        pytest.skip(f"User login failed: {r.status_code}")
    return s


@pytest.fixture(scope="module")
def test_banner(admin_session):
    """Dedicated banner for analytics tests — clean slate of events."""
    r = admin_session.post(f"{BASE_URL}/api/admin/home-banners", json={
        "title": "TEST_iter364 analytics banner",
        "subtitle": "analytics test",
        "variant": "entry",
        "active": True,
        "scope": {},
    })
    assert r.status_code == 200, r.text
    bid = r.json()["id"]
    yield bid
    admin_session.delete(f"{BASE_URL}/api/admin/home-banners/{bid}")


# ============================================================ tracking + log
class TestEventLogging:
    def test_impression_logs_event_and_counter(self, admin_session, test_banner):
        # Baseline impressions count
        r0 = admin_session.get(f"{BASE_URL}/api/admin/home-banners")
        b0 = next(b for b in r0.json()["banners"] if b["id"] == test_banner)
        imp0 = b0.get("impressions") or 0

        # Anonymous impression with location
        r = requests.post(
            f"{BASE_URL}/api/home-banners/{test_banner}/impression",
            json={"location": "Fort-de-France, Martinique"},
        )
        assert r.status_code == 200
        assert r.json().get("ok") is True

        # Counter bumped
        r1 = admin_session.get(f"{BASE_URL}/api/admin/home-banners")
        b1 = next(b for b in r1.json()["banners"] if b["id"] == test_banner)
        assert (b1.get("impressions") or 0) == imp0 + 1

        # Event recorded
        ev = admin_session.get(
            f"{BASE_URL}/api/admin/home-banners/{test_banner}/events"
        )
        assert ev.status_code == 200
        events = ev.json()["events"]
        assert len(events) >= 1
        first = events[0]
        assert first["event"] == "impression"
        assert first["user_name"] == "Visiteur anonyme"
        # Either city or country was resolved from "Fort-de-France, Martinique"
        assert (first.get("city") or first.get("country") or "").strip() != ""
        assert "created_at" in first and first["created_at"]

    def test_click_and_dismiss_log_and_increment(self, admin_session, test_banner):
        r0 = admin_session.get(f"{BASE_URL}/api/admin/home-banners")
        b0 = next(b for b in r0.json()["banners"] if b["id"] == test_banner)
        c0 = b0.get("clicks") or 0
        d0 = b0.get("dismiss_count") or 0

        rc = requests.post(
            f"{BASE_URL}/api/home-banners/{test_banner}/click",
            json={"country": "MQ", "city": "Fort-de-France"},
        )
        rd = requests.post(
            f"{BASE_URL}/api/home-banners/{test_banner}/dismiss",
            json={"country": "MQ", "city": "Fort-de-France"},
        )
        assert rc.status_code == 200
        assert rd.status_code == 200

        r1 = admin_session.get(f"{BASE_URL}/api/admin/home-banners")
        b1 = next(b for b in r1.json()["banners"] if b["id"] == test_banner)
        assert (b1.get("clicks") or 0) == c0 + 1
        assert (b1.get("dismiss_count") or 0) == d0 + 1


# ============================================================ user attribution
class TestUserAttribution:
    def test_logged_in_user_name_recorded(self, admin_session, user_session, test_banner):
        # Send impression with auth cookie (axios-equivalent: withCredentials)
        r = user_session.post(
            f"{BASE_URL}/api/home-banners/{test_banner}/impression",
            json={"location": "Paris, France"},
        )
        assert r.status_code == 200

        ev = admin_session.get(
            f"{BASE_URL}/api/admin/home-banners/{test_banner}/events?event=impression&limit=5"
        )
        assert ev.status_code == 200
        events = ev.json()["events"]
        assert events, "expected at least one impression event"
        # The most recent one should be the authenticated impression
        latest = events[0]
        assert latest["user_name"] != "Visiteur anonyme"
        assert latest.get("user_id"), "user_id should be populated for logged-in user"


# ============================================================ analytics
class TestAnalytics:
    def test_analytics_requires_admin(self):
        r = requests.get(f"{BASE_URL}/api/admin/home-banners/analytics")
        assert r.status_code in (401, 403)

    def test_analytics_shape_and_math(self, admin_session, test_banner):
        # Seed a controlled number of events with city tags to test CTR + by_zone.
        # 4 impressions, 1 click, 1 dismiss → CTR=25%, close_rate=25%
        for _ in range(3):
            requests.post(f"{BASE_URL}/api/home-banners/{test_banner}/impression",
                          json={"country": "MQ", "city": "Le Lamentin"})
        requests.post(f"{BASE_URL}/api/home-banners/{test_banner}/impression",
                      json={"country": "MQ", "city": "Fort-de-France"})
        requests.post(f"{BASE_URL}/api/home-banners/{test_banner}/click",
                      json={"country": "MQ", "city": "Le Lamentin"})
        requests.post(f"{BASE_URL}/api/home-banners/{test_banner}/dismiss",
                      json={"country": "MQ", "city": "Fort-de-France"})

        r = admin_session.get(f"{BASE_URL}/api/admin/home-banners/analytics")
        assert r.status_code == 200
        data = r.json()
        assert "banners" in data and "totals" in data
        tot = data["totals"]
        for k in ("impressions", "clicks", "dismisses", "ctr", "close_rate"):
            assert k in tot

        b = next((x for x in data["banners"] if x["id"] == test_banner), None)
        assert b is not None
        # Math: CTR = 100*clicks/impressions
        if b["impressions"]:
            assert b["ctr"] == round(100 * b["clicks"] / b["impressions"], 1)
            assert b["close_rate"] == round(100 * b["dismisses"] / b["impressions"], 1)

        # by_zone: at least one zone should be Le Lamentin or Fort-de-France
        zones = {z["zone"]: z for z in b.get("by_zone", [])}
        assert any(c in zones for c in ("Le Lamentin", "Fort-de-France", "MQ"))
        # Sum of by_zone impressions == total banner impressions (this banner only)
        zsum = sum(z["impressions"] for z in b["by_zone"])
        assert zsum == b["impressions"], f"by_zone sum {zsum} != total {b['impressions']}"
        # CTR on a zone with clicks > 0 should be computed
        for z in b["by_zone"]:
            if z["impressions"]:
                assert z["ctr"] == round(100 * z["clicks"] / z["impressions"], 1)


# ============================================================ events filter
class TestEventsListing:
    def test_events_sorted_desc_and_filter(self, admin_session, test_banner):
        # Generate one of each type
        requests.post(f"{BASE_URL}/api/home-banners/{test_banner}/impression",
                      json={"city": "Saint-Pierre"})
        requests.post(f"{BASE_URL}/api/home-banners/{test_banner}/click",
                      json={"city": "Saint-Pierre"})
        requests.post(f"{BASE_URL}/api/home-banners/{test_banner}/dismiss",
                      json={"city": "Saint-Pierre"})

        # No filter → mixed events, sorted desc
        all_ev = admin_session.get(
            f"{BASE_URL}/api/admin/home-banners/{test_banner}/events?limit=50"
        )
        assert all_ev.status_code == 200
        items = all_ev.json()["events"]
        assert items
        # Required fields present
        for it in items:
            for k in ("event", "user_name", "created_at"):
                assert k in it
        # Desc sort
        ts = [it["created_at"] for it in items]
        assert ts == sorted(ts, reverse=True), "events must be sorted by created_at desc"

        # Filter by each event type
        for kind in ("impression", "click", "dismiss"):
            fr = admin_session.get(
                f"{BASE_URL}/api/admin/home-banners/{test_banner}/events?event={kind}&limit=50"
            )
            assert fr.status_code == 200
            for it in fr.json()["events"]:
                assert it["event"] == kind

    def test_events_invalid_filter_returns_all(self, admin_session, test_banner):
        # Invalid event filter is ignored (falls back to no filter)
        r = admin_session.get(
            f"{BASE_URL}/api/admin/home-banners/{test_banner}/events?event=bogus"
        )
        assert r.status_code == 200

    def test_events_requires_admin(self, test_banner):
        r = requests.get(f"{BASE_URL}/api/admin/home-banners/{test_banner}/events")
        assert r.status_code in (401, 403)
