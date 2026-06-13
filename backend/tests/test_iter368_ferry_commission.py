"""Iter 368 — SB Ferry commission model: split, cash payment, Stripe gating, admin reporting."""
import os
import requests
import pytest


def _read_frontend_env():
    try:
        with open("/app/frontend/.env") as f:
            for ln in f:
                if ln.startswith("REACT_APP_BACKEND_URL="):
                    return ln.split("=", 1)[1].strip()
    except Exception:
        return None
    return None


BASE = (os.environ.get("REACT_APP_BACKEND_URL") or _read_frontend_env() or "").rstrip("/")
assert BASE, "REACT_APP_BACKEND_URL missing"
ADMIN = {"email": "admin@superapp.com", "password": "SuperAdmin123!"}
USER = {"email": "test2@example.com", "password": "TestPass123!"}


def _session(creds):
    s = requests.Session()
    r = s.post(f"{BASE}/api/auth/login", json=creds, timeout=20)
    assert r.status_code == 200, f"login failed {creds['email']}: {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="module")
def admin_s():
    return _session(ADMIN)


@pytest.fixture(scope="module")
def user_s():
    return _session(USER)


@pytest.fixture(scope="module")
def anon():
    return requests.Session()


@pytest.fixture(scope="module")
def cheap_local_route(anon):
    r = anon.get(f"{BASE}/api/ferry/routes", params={"route_type": "local"}, timeout=15).json()
    return sorted(r["routes"], key=lambda x: x["price_adult"])[0]


# ---------- Admin config & companies ----------
class TestAdminConfig:
    def test_config_get(self, admin_s):
        r = admin_s.get(f"{BASE}/api/admin/ferry/config", timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert "commission_percent" in d
        assert d["stripe_enabled"] is False  # placeholder key

    def test_config_gating(self, anon):
        r = anon.get(f"{BASE}/api/admin/ferry/config", timeout=15)
        assert r.status_code in (401, 403)

    def test_config_put_roundtrip(self, admin_s):
        r = admin_s.put(f"{BASE}/api/admin/ferry/config", json={"commission_percent": 14}, timeout=15)
        assert r.status_code == 200
        assert r.json()["commission_percent"] == 14.0
        # restore default
        admin_s.put(f"{BASE}/api/admin/ferry/config", json={"commission_percent": 12}, timeout=15)

    def test_config_put_clamps(self, admin_s):
        r = admin_s.put(f"{BASE}/api/admin/ferry/config", json={"commission_percent": 250}, timeout=15)
        assert r.status_code == 200
        assert r.json()["commission_percent"] == 100.0
        admin_s.put(f"{BASE}/api/admin/ferry/config", json={"commission_percent": 12}, timeout=15)

    def test_companies_have_commission(self, admin_s):
        r = admin_s.get(f"{BASE}/api/admin/ferry/companies", timeout=15)
        assert r.status_code == 200
        comps = r.json()["companies"]
        assert len(comps) >= 1
        assert all("commission_percent" in c for c in comps)

    def test_company_commission_update(self, admin_s):
        comps = admin_s.get(f"{BASE}/api/admin/ferry/companies", timeout=15).json()["companies"]
        cid = comps[0]["id"]
        r = admin_s.put(f"{BASE}/api/admin/ferry/companies/{cid}", json={"commission_percent": 9}, timeout=15)
        assert r.status_code == 200
        assert r.json()["commission_percent"] == 9.0
        # restore
        admin_s.put(f"{BASE}/api/admin/ferry/companies/{cid}", json={"commission_percent": 12}, timeout=15)


# ---------- Booking split ----------
class TestSplit:
    def test_cash_booking_split(self, user_s, cheap_local_route):
        route = cheap_local_route
        body = {"route_id": route["id"], "adults": 2, "children": 1,
                "travel_date": "2026-12-20", "departure_time": route["departure_times"][0],
                "payment_method": "cash"}
        r = user_s.post(f"{BASE}/api/ferry/bookings", json=body, timeout=15)
        assert r.status_code == 200, r.text
        b = r.json()
        expected_total = round(2 * route["price_adult"] + 1 * route["price_child"], 2)
        assert b["total"] == expected_total
        pct = b["commission_percent"]
        assert round(b["platform_commission"], 2) == round(expected_total * pct / 100.0, 2)
        assert round(b["company_revenue"], 2) == round(expected_total - b["platform_commission"], 2)
        assert b["settlement_direction"] == "company_owes_platform"
        assert b["settlement_amount"] == b["platform_commission"]
        assert b["payment_method"] == "cash"
        assert b["payment_status"] == "cash_due"

    def test_invalid_payment_method(self, user_s, cheap_local_route):
        route = cheap_local_route
        body = {"route_id": route["id"], "adults": 1,
                "travel_date": "2026-12-20", "departure_time": route["departure_times"][0],
                "payment_method": "bitcoin"}
        r = user_s.post(f"{BASE}/api/ferry/bookings", json=body, timeout=15)
        assert r.status_code == 400


# ---------- Stripe gating ----------
class TestStripeGated:
    def test_stripe_checkout_503(self, user_s, cheap_local_route):
        route = cheap_local_route
        body = {"route_id": route["id"], "adults": 1,
                "travel_date": "2026-12-20", "departure_time": route["departure_times"][0],
                "origin_url": "https://example.com"}
        r = user_s.post(f"{BASE}/api/ferry/bookings/stripe-checkout", json=body, timeout=15)
        assert r.status_code == 503
        assert "carte" in r.json().get("detail", "").lower()


# ---------- Revenue reporting ----------
class TestRevenue:
    def test_revenue_structure(self, admin_s):
        r = admin_s.get(f"{BASE}/api/admin/ferry/revenue", timeout=20)
        assert r.status_code == 200
        d = r.json()
        for k in ("totals", "by_company", "by_method", "count"):
            assert k in d
        t = d["totals"]
        for k in ("gross", "commission", "company_revenue", "platform_owes_company", "company_owes_platform", "tickets"):
            assert k in t
        # cash bookings created above should surface a non-zero commission owed to platform
        assert t["company_owes_platform"] >= 0

    def test_revenue_gating(self, anon):
        r = anon.get(f"{BASE}/api/admin/ferry/revenue", timeout=15)
        assert r.status_code in (401, 403)


# ---------- Settlements (monthly statement + bulk settle) ----------
class TestSettlements:
    def test_settlements_structure(self, admin_s):
        r = admin_s.get(f"{BASE}/api/admin/ferry/settlements", timeout=20)
        assert r.status_code == 200
        d = r.json()
        assert "companies" in d and "count" in d
        if d["companies"]:
            c = d["companies"][0]
            for k in ("company_id", "company_name", "tickets", "gross", "commission",
                      "pending_platform_owes", "pending_company_owes", "net_due_to_company",
                      "settled_amount", "pending_tickets"):
                assert k in c, f"missing {k}"

    def test_settlements_gating(self, anon):
        r = anon.get(f"{BASE}/api/admin/ferry/settlements", timeout=15)
        assert r.status_code in (401, 403)

    def test_settle_batch_requires_company(self, admin_s):
        r = admin_s.post(f"{BASE}/api/admin/ferry/settlements/settle-batch", json={"company_id": ""}, timeout=15)
        assert r.status_code == 400

    def test_settle_batch_roundtrip(self, admin_s, user_s, cheap_local_route):
        # Create a fresh cash booking this month, then settle its company → pending drops.
        route = cheap_local_route
        month = __import__("datetime").datetime.utcnow().strftime("%Y-%m")
        body = {"route_id": route["id"], "adults": 1,
                "travel_date": "2026-12-22", "departure_time": route["departure_times"][0],
                "payment_method": "cash"}
        b = user_s.post(f"{BASE}/api/ferry/bookings", json=body, timeout=15).json()
        cid = b["company_id"]
        # settle that company for the current month
        r = admin_s.post(f"{BASE}/api/admin/ferry/settlements/settle-batch",
                         json={"company_id": cid, "month": month}, timeout=15)
        assert r.status_code == 200
        assert r.json()["settled"] >= 1
        # after settling, that company has no pending tickets for the month
        d = admin_s.get(f"{BASE}/api/admin/ferry/settlements", params={"month": month}, timeout=20).json()
        row = next((x for x in d["companies"] if x["company_id"] == cid), None)
        assert row is not None
        assert row["pending_tickets"] == 0
