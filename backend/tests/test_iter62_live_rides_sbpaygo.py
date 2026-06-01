"""Iter 62 - Tests for (a) admin live-rides, (b) SB PayGo auto-debit at completion, (c) change-password."""
import os
import time
import pytest
import requests

def _read_env_url():
    val = os.environ.get("REACT_APP_BACKEND_URL")
    if val:
        return val.rstrip("/")
    # Fallback: read frontend/.env
    try:
        for line in open("/app/frontend/.env"):
            if line.startswith("REACT_APP_BACKEND_URL="):
                return line.split("=", 1)[1].strip().rstrip("/")
    except Exception:
        pass
    raise RuntimeError("REACT_APP_BACKEND_URL not set")

BASE = _read_env_url()
API = f"{BASE}/api"

ADMIN = {"email": "admin@superapp.com", "password": os.environ.get("TEST_ADMIN_PASSWORD", "SuperAdmin123!")}
USER = {"email": "neg_test@example.com", "password": os.environ.get("TEST_NEG_PASSWORD", "Test1234!")}


def login(email, password):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"login {email} -> {r.status_code} {r.text[:200]}"
    return s


@pytest.fixture(scope="module")
def admin_session():
    return login(ADMIN["email"], ADMIN["password"])


@pytest.fixture(scope="module")
def user_session():
    return login(USER["email"], USER["password"])


# === (A) ADMIN LIVE RIDES ===
class TestAdminLiveRides:
    def test_admin_can_get_live_rides(self, admin_session):
        r = admin_session.get(f"{API}/admin/live-rides", timeout=15)
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        assert "rides" in d and isinstance(d["rides"], list)
        assert "counts" in d and isinstance(d["counts"], dict)
        assert "total" in d and isinstance(d["total"], int)
        for k in ("pending", "accepted", "arriving", "in_progress"):
            assert k in d["counts"]
        assert d["total"] == len(d["rides"])

    def test_live_rides_status_subset(self, admin_session):
        r = admin_session.get(f"{API}/admin/live-rides", timeout=15)
        d = r.json()
        valid = {"pending", "accepted", "arriving", "in_progress"}
        for ride in d["rides"]:
            assert ride.get("status") in valid

    def test_live_rides_shape_has_required_fields(self, admin_session):
        d = admin_session.get(f"{API}/admin/live-rides", timeout=15).json()
        if not d["rides"]:
            pytest.skip("no active rides to inspect shape")
        sample = d["rides"][0]
        # Must include either coords or pickup/dropoff addresses + passenger info hooks
        # spec says pickup_lat/lng, dropoff_lat/lng, passenger_name, driver_name (may be None)
        for fld in ("pickup_lat", "pickup_lng", "dropoff_lat", "dropoff_lng"):
            assert fld in sample, f"{fld} missing in ride payload"
        assert "passenger_name" in sample or "user_id" in sample

    def test_non_admin_forbidden(self, user_session):
        r = user_session.get(f"{API}/admin/live-rides", timeout=15)
        assert r.status_code == 403, f"expected 403, got {r.status_code}: {r.text[:200]}"


# === (C) CHANGE PASSWORD ===
class TestChangePassword:
    def test_short_new_password_rejected(self, user_session):
        r = user_session.post(f"{API}/auth/change-password",
                              json={"current_password": USER["password"], "new_password": "123"}, timeout=10)
        assert r.status_code == 400

    def test_wrong_current_rejected(self, user_session):
        r = user_session.post(f"{API}/auth/change-password",
                              json={"current_password": "WRONG_pwd_999", "new_password": "Newpass123!"}, timeout=10)
        assert r.status_code == 400

    def test_change_and_revert(self):
        # Use isolated session to avoid breaking shared user_session
        s = login(USER["email"], USER["password"])
        new_pw = "Iter62New!"
        r = s.post(f"{API}/auth/change-password",
                   json={"current_password": USER["password"], "new_password": new_pw}, timeout=10)
        assert r.status_code == 200, r.text[:200]
        body = r.json()
        assert body.get("ok") is True

        # Old password should now fail
        bad = requests.post(f"{API}/auth/login", json={"email": USER["email"], "password": USER["password"]}, timeout=10)
        assert bad.status_code == 401

        # New password should login
        good = requests.post(f"{API}/auth/login", json={"email": USER["email"], "password": new_pw}, timeout=10)
        assert good.status_code == 200

        # Revert
        s2 = login(USER["email"], new_pw)
        rev = s2.post(f"{API}/auth/change-password",
                      json={"current_password": new_pw, "new_password": USER["password"]}, timeout=10)
        assert rev.status_code == 200


# === (B) SB PAYGO AUTO-DEBIT AT COMPLETION ===
class TestSbPayGoAutoDebit:
    @pytest.fixture(scope="class")
    def driver_session(self):
        # Register a fresh driver for this test
        ts = int(time.time())
        email = f"drv_iter62_{ts}@test.com"
        pwd = os.environ.get("TEST_DRIVER_PASSWORD_ALT", "Driver1234!")
        s = requests.Session()
        reg = s.post(f"{API}/auth/register", json={
            "email": email, "password": pwd, "name": f"Iter62 Drv {ts}", "role": "driver", "phone": f"+33600{ts % 1000000:06d}"
        }, timeout=15)
        if reg.status_code not in (200, 201):
            pytest.skip(f"driver register failed: {reg.status_code} {reg.text[:200]}")
        # Driver profile creation may be auto, attempt to list/approve
        return s, email

    def test_full_sbpaygo_flow(self, user_session, admin_session, driver_session):
        # 1) Top up wallet to 50€
        topup = user_session.post(f"{API}/finance/sbpaygo/topup", json={"amount": 50.0}, timeout=15)
        if topup.status_code == 404:
            # try alt path
            topup = user_session.post(f"{API}/finance/topup", json={"amount": 50.0, "method": "sbpaygo"}, timeout=15)
        assert topup.status_code in (200, 201), f"topup failed: {topup.status_code} {topup.text[:300]}"

        bal_resp = user_session.get(f"{API}/finance/balance", timeout=10)
        assert bal_resp.status_code == 200
        initial_bal = bal_resp.json().get("balance", 0)
        assert initial_bal >= 50, f"expected balance>=50 after topup, got {initial_bal}"

        # 2) Create ride with sbpaygo payment method
        ride_payload = {
            "vehicle_type": "economy",
            "pickup_address": "Paris Gare du Nord",
            "pickup_lat": 48.8809, "pickup_lng": 2.3553,
            "dropoff_address": "Tour Eiffel",
            "dropoff_lat": 48.8584, "dropoff_lng": 2.2945,
            "distance_km": 5.0,
            "duration_min": 15,
            "estimated_fare": 10.0,
            "payment_method": "sbpaygo",
        }
        cr = user_session.post(f"{API}/rides", json=ride_payload, timeout=15)
        assert cr.status_code in (200, 201), f"create ride: {cr.status_code} {cr.text[:300]}"
        ride = cr.json()
        ride_id = ride.get("id") or ride.get("ride_id")
        assert ride_id

        # 3) Driver accepts (use admin to force-assign, since driver onboarding may be incomplete)
        # Try driver accept first
        drv_sess, drv_email = driver_session
        accept = drv_sess.post(f"{API}/rides/{ride_id}/accept", timeout=15)
        if accept.status_code not in (200, 201):
            # Admin assigns: try /admin/rides/{id}/assign or status change directly
            # Use admin to step ride through statuses (admin has rights per code)
            for st in ["accepted", "arriving", "in_progress", "completed"]:
                rr = admin_session.post(f"{API}/rides/{ride_id}/status", json={"status": st}, timeout=15)
                assert rr.status_code == 200, f"admin status->{st}: {rr.status_code} {rr.text[:200]}"
        else:
            for st in ["arriving", "in_progress", "completed"]:
                rr = drv_sess.post(f"{API}/rides/{ride_id}/status", json={"status": st}, timeout=15)
                if rr.status_code != 200:
                    rr = admin_session.post(f"{API}/rides/{ride_id}/status", json={"status": st}, timeout=15)
                assert rr.status_code == 200, f"->{st}: {rr.status_code} {rr.text[:200]}"

        # 4) Verify balance debited by ride.final_fare (backend may apply surcharges)
        rget = user_session.get(f"{API}/rides/{ride_id}", timeout=10)
        assert rget.status_code == 200
        rdata = rget.json()
        debited = rdata.get("final_fare") or rdata.get("estimated_fare")
        bal2 = user_session.get(f"{API}/finance/balance", timeout=10).json()
        new_bal = bal2.get("balance", 0)
        assert abs(new_bal - (initial_bal - debited)) < 0.05, \
            f"balance not debited correctly: before={initial_bal}, after={new_bal}, expected={initial_bal - debited} (debit={debited})"

        # 5) Verify transaction logged
        assert rdata.get("payment_status") == "paid", f"payment_status={rdata.get('payment_status')}"
        assert rdata.get("paid_with") == "sbpaygo"

        # Check transactions via /finance endpoint
        txs = user_session.get(f"{API}/finance/transactions", timeout=10)
        if txs.status_code == 200:
            tx_list = txs.json() if isinstance(txs.json(), list) else txs.json().get("transactions", [])
            matching = [t for t in tx_list if t.get("ride_id") == ride_id and t.get("type") == "debit"]
            assert matching, f"no matching debit tx for ride {ride_id}"
