"""Iter 365 — SB Ferry: backend tests (public search, booking, admin CRUD, gating)."""
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


# ---------- Public ports/routes ----------
class TestPublic:
    def test_ports(self, anon):
        r = anon.get(f"{BASE}/api/ferry/ports", timeout=15)
        assert r.status_code == 200
        ports = r.json()["ports"]
        assert len(ports) >= 9
        # spot-check schema
        sample = ports[0]
        for k in ("id", "name", "city", "island", "lat", "lng"):
            assert k in sample, f"missing {k}"

    def test_routes_seeded_16(self, anon):
        r = anon.get(f"{BASE}/api/ferry/routes", timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert data["count"] >= 16
        types = {x["route_type"] for x in data["routes"]}
        assert {"local", "inter_island"} <= types

    def test_routes_filter_type(self, anon):
        r = anon.get(f"{BASE}/api/ferry/routes", params={"route_type": "local"}, timeout=15)
        assert r.status_code == 200
        assert all(x["route_type"] == "local" for x in r.json()["routes"])

    def test_routes_filter_from_to(self, anon):
        # FdF -> Trois-Ilets local
        rp = anon.get(f"{BASE}/api/ferry/ports", timeout=15).json()["ports"]
        fdf = next(p["id"] for p in rp if "Fort-de-France" in p["city"])
        trois = next(p["id"] for p in rp if "Trois-Îlets" in p["city"])
        r = anon.get(f"{BASE}/api/ferry/routes",
                     params={"from_port": fdf, "to_port": trois}, timeout=15)
        assert r.status_code == 200
        routes = r.json()["routes"]
        assert len(routes) >= 1
        assert all(x["from_port_id"] == fdf and x["to_port_id"] == trois for x in routes)

    def test_route_detail_404(self, anon):
        r = anon.get(f"{BASE}/api/ferry/routes/frt_doesnotexist", timeout=15)
        assert r.status_code == 404


# ---------- Booking E2E + edge cases ----------
class TestBooking:
    @pytest.fixture(scope="class")
    def cheap_local_route(self, anon):
        r = anon.get(f"{BASE}/api/ferry/routes", params={"route_type": "local"}, timeout=15).json()
        # smallest price route
        return sorted(r["routes"], key=lambda x: x["price_adult"])[0]

    def test_invalid_time_returns_400(self, user_s, cheap_local_route):
        body = {"route_id": cheap_local_route["id"], "adults": 1, "children": 0,
                "travel_date": "2026-12-31", "departure_time": "23:59",
                "payment_method": "sbpay"}
        r = user_s.post(f"{BASE}/api/ferry/bookings", json=body, timeout=15)
        assert r.status_code == 400
        assert "Horaire" in r.json().get("detail", "")

    def test_missing_date_returns_400(self, user_s, cheap_local_route):
        body = {"route_id": cheap_local_route["id"], "adults": 1, "children": 0,
                "travel_date": "", "departure_time": "",
                "payment_method": "sbpay"}
        r = user_s.post(f"{BASE}/api/ferry/bookings", json=body, timeout=15)
        assert r.status_code == 400

    def test_unknown_route_404(self, user_s):
        body = {"route_id": "frt_xxx", "adults": 1, "children": 0,
                "travel_date": "2026-12-31", "departure_time": "07:30",
                "payment_method": "sbpay"}
        r = user_s.post(f"{BASE}/api/ferry/bookings", json=body, timeout=15)
        assert r.status_code == 404

    def test_booking_requires_auth(self, anon, cheap_local_route):
        body = {"route_id": cheap_local_route["id"], "adults": 1, "children": 0,
                "travel_date": "2026-12-31", "departure_time": cheap_local_route["departure_times"][0],
                "payment_method": "sbpay"}
        r = anon.post(f"{BASE}/api/ferry/bookings", json=body, timeout=15)
        assert r.status_code in (401, 403)

    def test_insufficient_balance(self, anon, cheap_local_route):
        # Register a fresh user (balance=0), try to book inter-island (expensive)
        import uuid as _u
        email = f"TEST_iter365_{_u.uuid4().hex[:8]}@example.com"
        reg = anon.post(f"{BASE}/api/auth/register",
                        json={"email": email, "password": "TestPass123!",
                              "name": "Test Iter365", "phone": "+33600000000"},
                        timeout=20)
        if reg.status_code not in (200, 201):
            pytest.skip(f"register endpoint unavailable: {reg.status_code}")
        s = requests.Session()
        lg = s.post(f"{BASE}/api/auth/login",
                    json={"email": email, "password": "TestPass123!"}, timeout=15)
        assert lg.status_code == 200
        # find expensive inter-island route
        ri = s.get(f"{BASE}/api/ferry/routes", params={"route_type": "inter_island"}, timeout=15).json()
        exp = sorted(ri["routes"], key=lambda x: -x["price_adult"])[0]
        body = {"route_id": exp["id"], "adults": 1, "children": 0,
                "travel_date": "2026-12-31", "departure_time": exp["departure_times"][0],
                "payment_method": "sbpay"}
        r = s.post(f"{BASE}/api/ferry/bookings", json=body, timeout=15)
        assert r.status_code == 400
        assert "insuffisant" in r.json().get("detail", "").lower()

    def test_book_and_verify(self, user_s, cheap_local_route):
        # Ensure wallet has funds
        me = user_s.get(f"{BASE}/api/wallet", timeout=15).json()
        bal = float(me.get("balance", 0) or 0)
        total_needed = cheap_local_route["price_adult"] * 2 + cheap_local_route["price_child"] * 1
        if bal < total_needed + 5:
            pytest.skip(f"Balance {bal} < {total_needed}; need top-up manually")
        body = {"route_id": cheap_local_route["id"], "adults": 2, "children": 1,
                "travel_date": "2026-12-31",
                "departure_time": cheap_local_route["departure_times"][0],
                "payment_method": "sbpay"}
        r = user_s.post(f"{BASE}/api/ferry/bookings", json=body, timeout=15)
        assert r.status_code == 200, r.text
        b = r.json()
        assert b["booking_ref"].startswith("SBF-")
        assert b["status"] == "confirmed"
        expected = round(2 * cheap_local_route["price_adult"] + 1 * cheap_local_route["price_child"], 2)
        assert b["total"] == expected
        assert b["qr_payload"]
        # Wallet debited (booking debits `total`; cashback may credit a small fraction back)
        me2 = user_s.get(f"{BASE}/api/wallet", timeout=15).json()
        net_delta = round(bal - float(me2["balance"]), 2)
        # delta should be between (expected * 0.85) and expected (cashback typically 1-15%)
        assert 0 < net_delta <= expected, f"Unexpected wallet delta: {net_delta} vs total {expected}"
        # GET my bookings includes it
        mine = user_s.get(f"{BASE}/api/ferry/bookings", timeout=15).json()["bookings"]
        assert any(x["id"] == b["id"] for x in mine)
        # Detail attaches from_port
        det = user_s.get(f"{BASE}/api/ferry/bookings/{b['id']}", timeout=15).json()
        assert det["from_port"] and "lat" in det["from_port"] and "lng" in det["from_port"]


# ---------- Admin CRUD + gating ----------
class TestAdmin:
    def test_admin_routes_gated(self, anon):
        r = anon.get(f"{BASE}/api/admin/ferry/routes", timeout=15)
        assert r.status_code in (401, 403)

    def test_admin_bookings_gated(self, anon):
        r = anon.get(f"{BASE}/api/admin/ferry/bookings", timeout=15)
        assert r.status_code in (401, 403)

    def test_admin_user_forbidden(self, user_s):
        r = user_s.get(f"{BASE}/api/admin/ferry/routes", timeout=15)
        assert r.status_code in (401, 403)

    def test_admin_routes_list(self, admin_s):
        r = admin_s.get(f"{BASE}/api/admin/ferry/routes", timeout=15)
        assert r.status_code == 200
        assert r.json()["count"] >= 16

    def test_admin_ports_companies(self, admin_s):
        rp = admin_s.get(f"{BASE}/api/admin/ferry/ports", timeout=15).json()
        rc = admin_s.get(f"{BASE}/api/admin/ferry/companies", timeout=15).json()
        assert len(rp["ports"]) >= 9
        assert len(rc["companies"]) >= 3

    def test_admin_bookings_stats(self, admin_s):
        r = admin_s.get(f"{BASE}/api/admin/ferry/bookings", timeout=15).json()
        assert "count" in r and "revenue" in r

    def test_admin_route_crud_full(self, admin_s):
        # ports/companies
        rp = admin_s.get(f"{BASE}/api/admin/ferry/ports", timeout=15).json()["ports"]
        rc = admin_s.get(f"{BASE}/api/admin/ferry/companies", timeout=15).json()["companies"]
        # Create
        payload = {
            "company_id": rc[0]["id"], "company_name": rc[0]["name"],
            "from_port_id": rp[0]["id"], "from_label": f"{rp[0]['city']} ({rp[0]['island']})",
            "to_port_id": rp[1]["id"], "to_label": f"{rp[1]['city']} ({rp[1]['island']})",
            "route_type": "local", "duration_min": 25,
            "price_adult": 9.5, "price_child": 5.0,
            "departure_times": ["10:00", "14:00"], "is_active": True,
        }
        created = admin_s.post(f"{BASE}/api/admin/ferry/routes", json=payload, timeout=15)
        assert created.status_code == 200, created.text
        cid = created.json()["id"]
        assert created.json()["price_adult"] == 9.5
        # Update
        upd = admin_s.put(f"{BASE}/api/admin/ferry/routes/{cid}",
                          json={"price_adult": 11.0, "departure_times": "08:00, 12:00"},
                          timeout=15)
        assert upd.status_code == 200
        # verify GET (admin list)
        routes = admin_s.get(f"{BASE}/api/admin/ferry/routes", timeout=15).json()["routes"]
        cur = next(x for x in routes if x["id"] == cid)
        assert cur["price_adult"] == 11.0
        assert cur["departure_times"] == ["08:00", "12:00"]
        # Toggle
        tog = admin_s.patch(f"{BASE}/api/admin/ferry/routes/{cid}/toggle", timeout=15)
        assert tog.status_code == 200
        assert tog.json()["is_active"] is False
        tog2 = admin_s.patch(f"{BASE}/api/admin/ferry/routes/{cid}/toggle", timeout=15)
        assert tog2.json()["is_active"] is True
        # Delete
        dl = admin_s.delete(f"{BASE}/api/admin/ferry/routes/{cid}", timeout=15)
        assert dl.status_code == 200
        # gone
        dl2 = admin_s.delete(f"{BASE}/api/admin/ferry/routes/{cid}", timeout=15)
        assert dl2.status_code == 404
