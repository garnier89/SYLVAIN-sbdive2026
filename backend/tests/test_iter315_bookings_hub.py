"""Tests for the Admin « Réservations & Commandes » hub (iter 315).

Covers: overview/live/scheduled/rides/orders + manual ride/order + cancel/reschedule/reassign.
"""
import os
import time
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
ADMIN_EMAIL = "admin@superapp.com"
ADMIN_PASSWORD = "SuperAdmin123!"


@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=20)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text[:200]}"
    tok = r.json().get("access_token") or r.json().get("token")
    if tok:
        s.headers.update({"Authorization": f"Bearer {tok}"})
    return s


def test_overview(admin_session):
    r = admin_session.get(f"{BASE_URL}/api/admin/bookings/overview", timeout=15)
    assert r.status_code == 200, r.text
    d = r.json()
    for k in ("live_rides", "upcoming_reservations", "orders_today", "completed_today", "revenue_today", "cancellation_rate"):
        assert k in d, f"missing key {k}"


def test_live(admin_session):
    r = admin_session.get(f"{BASE_URL}/api/admin/bookings/live", timeout=15)
    assert r.status_code == 200, r.text
    assert "rides" in r.json()


def test_scheduled(admin_session):
    r = admin_session.get(f"{BASE_URL}/api/admin/bookings/scheduled", timeout=15)
    assert r.status_code == 200, r.text
    payload = r.json()
    assert "rides" in payload
    # If any expired exist, display_status should be set
    for r0 in payload["rides"][:5]:
        assert "display_status" in r0


def test_rides_history(admin_session):
    r = admin_session.get(f"{BASE_URL}/api/admin/bookings/rides?limit=10", timeout=15)
    assert r.status_code == 200, r.text
    assert "rides" in r.json()


def test_orders_list(admin_session):
    r = admin_session.get(f"{BASE_URL}/api/admin/bookings/orders?limit=10", timeout=15)
    assert r.status_code == 200, r.text
    assert "orders" in r.json()


def test_manual_ride_instant_and_cancel(admin_session):
    payload = {
        "customer_name": "TEST_Hub Client",
        "customer_phone": "+5960102030" + str(int(time.time()) % 10),
        "pickup_address": "TEST 1 Rue de Test",
        "dropoff_address": "TEST 99 Avenue Cible",
        "pickup_lat": 14.6, "pickup_lng": -61.05,
        "dropoff_lat": 14.61, "dropoff_lng": -61.06,
        "vehicle_type": "sb", "payment_method": "cash",
    }
    r = admin_session.post(f"{BASE_URL}/api/admin/bookings/manual-ride", json=payload, timeout=20)
    assert r.status_code == 200, r.text
    ride = r.json()["ride"]
    assert ride["status"] == "pending"
    rid = ride["id"]

    # Cancel
    r2 = admin_session.post(f"{BASE_URL}/api/admin/bookings/ride/{rid}/cancel", json={"reason": "test"}, timeout=15)
    assert r2.status_code == 200, r2.text
    assert r2.json().get("cancelled") is True


def test_manual_ride_scheduled_then_reschedule(admin_session):
    from datetime import datetime, timedelta, timezone
    sched = (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()
    payload = {
        "customer_name": "TEST_Sched", "customer_phone": "+59611111" + str(int(time.time()) % 1000),
        "pickup_address": "TEST sched pickup", "dropoff_address": "TEST sched dropoff",
        "scheduled_at": sched,
    }
    r = admin_session.post(f"{BASE_URL}/api/admin/bookings/manual-ride", json=payload, timeout=20)
    assert r.status_code == 200, r.text
    rid = r.json()["ride"]["id"]
    assert r.json()["ride"]["scheduled_at"] is not None

    new_sched = (datetime.now(timezone.utc) + timedelta(days=2)).isoformat()
    r2 = admin_session.post(f"{BASE_URL}/api/admin/bookings/ride/{rid}/reschedule", json={"scheduled_at": new_sched}, timeout=15)
    assert r2.status_code == 200, r2.text
    assert r2.json().get("rescheduled") is True


def test_manual_ride_missing_address(admin_session):
    r = admin_session.post(f"{BASE_URL}/api/admin/bookings/manual-ride", json={"customer_phone": "+596000", "pickup_address": "", "dropoff_address": ""}, timeout=15)
    assert r.status_code == 400


def test_manual_order_courier(admin_session):
    payload = {
        "kind": "courier",
        "customer_name": "TEST_Order Client",
        "customer_phone": "+59622222" + str(int(time.time()) % 1000),
        "delivery_address": "TEST 5 Rue Livraison",
        "amount": 25.5,
        "package_description": "Documents",
    }
    r = admin_session.post(f"{BASE_URL}/api/admin/bookings/manual-order", json=payload, timeout=20)
    assert r.status_code == 200, r.text
    o = r.json()["order"]
    assert o["total"] == 25.5
    assert o["order_type"] == "courier"


def test_manual_order_missing_address(admin_session):
    r = admin_session.post(f"{BASE_URL}/api/admin/bookings/manual-order", json={"kind": "delivery", "customer_phone": "+596000"}, timeout=15)
    assert r.status_code == 400


def test_reassign_invalid_driver(admin_session):
    # Need an actively pending ride id
    r = admin_session.get(f"{BASE_URL}/api/admin/bookings/live", timeout=15)
    rides = r.json().get("rides", [])
    pending = next((x for x in rides if x.get("status") == "pending"), None)
    if not pending:
        pytest.skip("No pending ride available")
    r2 = admin_session.post(f"{BASE_URL}/api/admin/bookings/ride/{pending['id']}/reassign", json={"driver_id": "driver_does_not_exist_xyz"}, timeout=15)
    assert r2.status_code == 404
