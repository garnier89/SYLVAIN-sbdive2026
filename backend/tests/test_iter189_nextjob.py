"""iter189 — Phase 4 'Prochaine course' dispatch MVP.

Covers:
  • GET /api/config/ride-search exposes next_job_enabled (default True)
    and next_job_lead_minutes (default 5, clamped to 1..30).
  • REGRESSION: a FREE approved+online driver can still accept a pending
    instant ride (the normal /api/rides/{id}/accept flow is not broken).
  • NEXT-JOB ASSIGNMENT: a driver with an in-progress ride A can be
    assigned a second pending ride B via /api/rides/{B}/accept — ride B's
    driver_id matches the driver after the call.
"""
import os
import time
import uuid

import pytest
import requests


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

# Demo taxi driver credentials (Paris area)
DEMO_DRIVERS = [
    ("jean.dupont@demo.sb", "Driver123!"),
    ("amadou.diallo@demo.sb", "Driver123!"),
    ("sophie.martin@demo.sb", "Driver123!"),
]

# Paris pickup / dropoff
PICKUP = {"lat": 48.8566, "lng": 2.3522, "addr": "Châtelet, Paris"}
DROPOFF = {"lat": 48.8606, "lng": 2.3376, "addr": "Louvre, Paris"}


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


def _register_client(prefix="iter189"):
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


def _create_ride(client_token, vehicle_type="berline"):
    payload = {
        "pickup_lat": PICKUP["lat"],
        "pickup_lng": PICKUP["lng"],
        "pickup_address": PICKUP["addr"],
        "dropoff_lat": DROPOFF["lat"],
        "dropoff_lng": DROPOFF["lng"],
        "dropoff_address": DROPOFF["addr"],
        "vehicle_type": vehicle_type,
        "payment_method": "cash",
        "ride_type": "instant",
    }
    r = _post("/rides", token=client_token, json=payload)
    return r


# ── Config ────────────────────────────────────────────────────────────────


class TestRideSearchConfigNextJob:
    """GET /config/ride-search exposes the new next-job fields with defaults."""

    def test_defaults_present(self):
        r = _get("/config/ride-search")
        assert r.status_code == 200, r.text
        data = r.json()
        assert "next_job_enabled" in data, "missing next_job_enabled"
        assert "next_job_lead_minutes" in data, "missing next_job_lead_minutes"
        assert data["next_job_enabled"] is True
        # Default is 5, but admin may have written something else previously —
        # what we strictly assert is the clamped 1..30 range + integer type.
        assert isinstance(data["next_job_lead_minutes"], int)
        assert 1 <= data["next_job_lead_minutes"] <= 30


# ── Regression: free driver can still accept an instant ride ──────────────


class TestRegressionFreeDriverAccept:
    """A free approved+online driver must still receive & accept pending rides."""

    def test_free_driver_can_accept_pending_ride(self):
        # Find a working demo driver
        driver_token = None
        for email, pw in DEMO_DRIVERS:
            t = _login(email, pw)
            if t:
                driver_token = t
                driver_email = email
                break
        if not driver_token:
            pytest.skip("No demo driver login worked")

        # Go online + push a location near the pickup so they can be matched
        _put("/drivers/online", token=driver_token, json={"is_online": True})
        _post("/drivers/location", token=driver_token, json={
            "lat": PICKUP["lat"], "lng": PICKUP["lng"],
        })

        # Create a fresh client and pending instant ride
        client_token = _register_client()
        r = _create_ride(client_token)
        assert r.status_code in (200, 201), f"create ride: {r.status_code} {r.text}"
        ride = r.json()
        ride_id = ride.get("id") or ride.get("ride_id")
        assert ride_id, f"no ride id in response: {ride}"
        assert ride.get("status") == "pending"
        assert ride.get("driver_id") in (None, "")

        # Driver accepts
        r = _post(f"/rides/{ride_id}/accept", token=driver_token)
        assert r.status_code == 200, f"accept: {r.status_code} {r.text}"

        # GET to verify persistence — ride is accepted and assigned
        r = _get(f"/rides/{ride_id}", token=driver_token)
        assert r.status_code == 200, r.text
        fetched = r.json()
        assert fetched["status"] == "accepted", fetched
        assert fetched.get("driver_id"), "driver_id was not set after accept"

        # Cleanup — cancel the test ride so the driver is free for next test
        try:
            _post(f"/rides/{ride_id}/cancel", token=client_token,
                  json={"reason": "test cleanup"})
        except Exception:
            pass


# ── Next-job assignment via /accept while busy on a first ride ────────────


class TestNextJobAssignmentViaAccept:
    """The reuse of /accept must allow a busy driver (in_progress on A) to
    be assigned to a second pending ride B (the 'Prochaine course' flow)."""

    def test_busy_driver_can_be_assigned_second_pending_ride(self):
        # Login driver
        driver_token = None
        for email, pw in DEMO_DRIVERS:
            t = _login(email, pw)
            if t:
                driver_token = t
                break
        if not driver_token:
            pytest.skip("No demo driver login worked")

        # who am I (driver user id) — used to confirm driver_id assignment
        me = _get("/auth/me", token=driver_token)
        assert me.status_code == 200, me.text
        driver_user_id = me.json().get("id")

        _put("/drivers/online", token=driver_token, json={"is_online": True})
        _post("/drivers/location", token=driver_token, json={
            "lat": DROPOFF["lat"], "lng": DROPOFF["lng"],
        })

        # ── Ride A: create, accept, drive through to in_progress
        client_a = _register_client("iter189a")
        rA = _create_ride(client_a)
        assert rA.status_code in (200, 201), rA.text
        ride_a_id = rA.json().get("id")

        r = _post(f"/rides/{ride_a_id}/accept", token=driver_token)
        assert r.status_code == 200, f"accept A: {r.status_code} {r.text}"

        # Transition: accepted → arriving (via /status), then in_progress via OTP
        r = _post(f"/rides/{ride_a_id}/status", token=driver_token,
                  json={"status": "arriving"})
        assert r.status_code == 200, (
            f"status->arriving: {r.status_code} {r.text}"
        )
        # Passenger requests start OTP, driver verifies → in_progress
        r = _post(f"/phase1/rides/{ride_a_id}/start-otp/request",
                  token=client_a)
        assert r.status_code == 200, f"otp request: {r.status_code} {r.text}"
        otp_code = r.json().get("otp")
        assert otp_code, r.json()
        r = _post(f"/phase1/rides/{ride_a_id}/start-otp/verify",
                  token=driver_token, json={"otp": otp_code})
        assert r.status_code == 200, f"otp verify: {r.status_code} {r.text}"

        # Verify A is in_progress and assigned to this driver
        r = _get(f"/rides/{ride_a_id}", token=driver_token)
        assert r.status_code == 200
        a_doc = r.json()
        assert a_doc["status"] == "in_progress", a_doc
        driver_id_on_a = a_doc.get("driver_id")
        assert driver_id_on_a

        # ── Ride B: another client creates a pending ride
        client_b = _register_client("iter189b")
        rB = _create_ride(client_b)
        assert rB.status_code in (200, 201), rB.text
        ride_b_id = rB.json().get("id")
        assert rB.json().get("status") == "pending"

        # The busy driver reserves ride B via the SAME /accept endpoint
        r = _post(f"/rides/{ride_b_id}/accept", token=driver_token)
        assert r.status_code == 200, (
            f"reserve next (accept B while in_progress on A): "
            f"{r.status_code} {r.text}"
        )

        # GET both rides to confirm persistence + assignment
        r = _get(f"/rides/{ride_b_id}", token=driver_token)
        assert r.status_code == 200, r.text
        b_doc = r.json()
        assert b_doc.get("driver_id") == driver_id_on_a, (
            f"B should be assigned to the same driver as A: "
            f"A.driver_id={driver_id_on_a} vs B.driver_id={b_doc.get('driver_id')}"
        )
        # B should be 'accepted' now (reserved)
        assert b_doc["status"] == "accepted", b_doc

        # And ride A should still be in_progress (B did not steal A's slot)
        r = _get(f"/rides/{ride_a_id}", token=driver_token)
        assert r.status_code == 200
        assert r.json()["status"] == "in_progress"

        # Cleanup: cancel both rides
        for rid, ctok in ((ride_a_id, client_a), (ride_b_id, client_b)):
            try:
                _post(f"/rides/{rid}/cancel", token=ctok,
                      json={"reason": "test cleanup"})
            except Exception:
                pass
