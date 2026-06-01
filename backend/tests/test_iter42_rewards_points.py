"""Iteration 42 - Rewards & Points System backend tests.
Covers:
  - Admin rewards config (GET/PUT)
  - Admin priority drivers (GET/PUT/DELETE)
  - Driver my-activity (GET)
  - Refuse-ride flow (points deduction)
  - Ride accept/complete/cancel point hooks
"""
import os
import uuid
import pytest
import requests
import time

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://taxi-marketplace-3.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@superapp.com"
ADMIN_PASSWORD = os.environ.get("TEST_ADMIN_PASSWORD", "SuperAdmin123!")
DRIVER_EMAIL = "testdriver@example.com"
DRIVER_PASSWORD = os.environ.get("TEST_DRIVER_PASSWORD", "Driver123!")


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=15)
    if r.status_code != 200:
        return None
    return r.json().get("token") or r.json().get("access_token")


def _headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def admin_token():
    tok = _login(ADMIN_EMAIL, ADMIN_PASSWORD)
    if not tok:
        pytest.skip("Admin login failed")
    return tok


@pytest.fixture(scope="module")
def driver_info(admin_token):
    """Ensure testdriver exists, is approved. Return (token, driver_doc)."""
    # Try login first
    tok = _login(DRIVER_EMAIL, DRIVER_PASSWORD)
    if not tok:
        # register
        requests.post(f"{API}/auth/register", json={
            "name": "Test Driver", "email": DRIVER_EMAIL, "password": DRIVER_PASSWORD,
            "phone": "+33600000001", "role": "driver"
        }, timeout=15)
        tok = _login(DRIVER_EMAIL, DRIVER_PASSWORD)
        if not tok:
            pytest.skip("Driver login failed")
        # register driver profile
        requests.post(f"{API}/drivers/register", headers=_headers(tok), json={
            "vehicle_type": "economic", "vehicle_number": "AB-123-CD",
            "vehicle_model": "Renault Clio", "license_number": "DL-TEST-001"
        }, timeout=15)

    # Fetch profile
    prof = requests.get(f"{API}/drivers/profile", headers=_headers(tok), timeout=15)
    if prof.status_code != 200:
        pytest.skip(f"Driver profile fetch failed: {prof.status_code}")
    driver_doc = prof.json()

    # Approve driver if not approved — use admin direct update via priority-drivers? No direct approve endpoint.
    # Try admin driver approve endpoint
    if driver_doc.get("status") != "approved":
        # try /api/admin/drivers/{id}/approve or status update
        approve_urls = [
            f"{API}/admin/drivers/{driver_doc['id']}/approve",
            f"{API}/admin/drivers/{driver_doc['id']}/status",
        ]
        approved = False
        for url in approve_urls:
            r = requests.post(url, headers=_headers(admin_token), json={"status": "approved"}, timeout=10)
            if r.status_code in (200, 201, 204):
                approved = True
                break
        if not approved:
            # Fallback: update via mongo through service-config? Use the DB directly via a backend endpoint if exists
            # Try PUT
            for url in approve_urls:
                r = requests.put(url, headers=_headers(admin_token), json={"status": "approved"}, timeout=10)
                if r.status_code in (200, 201, 204):
                    approved = True
                    break
        if not approved:
            # Direct DB update through mongo
            try:
                from pymongo import MongoClient
                mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
                db_name = os.environ.get("DB_NAME", "test_database")
                client = MongoClient(mongo_url)
                client[db_name].drivers.update_one({"id": driver_doc["id"]}, {"$set": {"status": "approved"}})
                approved = True
            except Exception as e:
                print("Direct mongo approve failed:", e)
        # re-fetch
        prof = requests.get(f"{API}/drivers/profile", headers=_headers(tok), timeout=15)
        driver_doc = prof.json()

    return tok, driver_doc


# =========================
# ADMIN REWARDS CONFIG
# =========================
class TestRewardsConfig:
    def test_get_rewards_config_default(self, admin_token):
        r = requests.get(f"{API}/admin/rewards/config", headers=_headers(admin_token), timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "regard_vehicles" in data and len(data["regard_vehicles"]) >= 3
        assert "guarantees" in data and len(data["guarantees"]) >= 1
        assert "points" in data and "palettes" in data["points"]
        assert len(data["points"]["palettes"]) == 4
        assert "points_per_ride_completed" in data["points"]
        assert "points_lost_per_refuse" in data["points"]

    def test_put_rewards_config_persists(self, admin_token):
        payload = {
            "regard_vehicles": [
                {"id": "rv_car", "type": "Voiture", "active": True, "bonus_per_trip": 4, "min_trips": 5, "zone": "Martinique"}
            ],
            "guarantees": [
                {"id": "g_day", "name": "GarantieTest", "active": True, "min_revenue": 70}
            ],
            "points": {
                "initial_points": 100, "points_per_ride_accepted": 2,
                "points_per_ride_completed": 3, "points_lost_per_refuse": 5, "points_lost_per_cancel": 10,
                "palettes": [
                    {"id": "p1", "name": "Debutant", "min_points": 0, "max_points": 30, "priority_access": False, "max_ride_amount": 20, "color": "#EF4444"},
                    {"id": "p2", "name": "Standard", "min_points": 31, "max_points": 60, "priority_access": False, "max_ride_amount": 50, "color": "#F59E0B"},
                    {"id": "p3", "name": "Confirme", "min_points": 61, "max_points": 80, "priority_access": True, "max_ride_amount": 100, "color": "#3B82F6"},
                    {"id": "p4", "name": "Expert", "min_points": 81, "max_points": 100, "priority_access": True, "max_ride_amount": 999, "color": "#10B981"},
                ],
            },
        }
        r = requests.put(f"{API}/admin/rewards/config", headers=_headers(admin_token), json=payload, timeout=15)
        assert r.status_code == 200, r.text
        # GET back
        g = requests.get(f"{API}/admin/rewards/config", headers=_headers(admin_token), timeout=15).json()
        assert g["points"]["points_per_ride_completed"] == 3
        assert g["guarantees"][0]["min_revenue"] == 70


# =========================
# ADMIN PRIORITY DRIVERS
# =========================
class TestPriorityDrivers:
    def test_list_priority_drivers(self, admin_token):
        r = requests.get(f"{API}/admin/priority-drivers", headers=_headers(admin_token), timeout=15)
        assert r.status_code == 200, r.text
        arr = r.json()
        assert isinstance(arr, list)
        if arr:
            d = arr[0]
            for key in ["driver_id", "points", "acceptance_rate", "manual_priority", "palette_name", "palette_color"]:
                assert key in d, f"missing {key}"

    def test_set_and_remove_priority(self, admin_token, driver_info):
        _, driver = driver_info
        did = driver["id"]
        # Set manual priority
        r = requests.put(f"{API}/admin/priority-drivers/{did}", headers=_headers(admin_token),
                         json={"manual_priority": True, "note": "VIP"}, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json()["manual_priority"] is True
        # Verify in list
        arr = requests.get(f"{API}/admin/priority-drivers", headers=_headers(admin_token), timeout=15).json()
        row = next((x for x in arr if x["driver_id"] == did), None)
        assert row is not None
        assert row["manual_priority"] is True
        # Remove
        r = requests.delete(f"{API}/admin/priority-drivers/{did}", headers=_headers(admin_token), timeout=15)
        assert r.status_code == 200, r.text
        assert r.json()["manual_priority"] is False


# =========================
# DRIVER MY-ACTIVITY
# =========================
class TestDriverActivity:
    def test_my_activity_schema(self, driver_info):
        tok, _ = driver_info
        r = requests.get(f"{API}/drivers/my-activity", headers=_headers(tok), timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        for key in ["points", "palette", "acceptance_rate", "cancellation_rate",
                    "activity_score", "today_completed", "offered_count", "accepted_count",
                    "refused_count", "cancelled_count", "rules"]:
            assert key in data, f"missing {key}"
        palette = data["palette"]
        for pkey in ["name", "color", "priority_access"]:
            assert pkey in palette
        rules = data["rules"]
        for rkey in ["points_per_ride_accepted", "points_per_ride_completed",
                     "points_lost_per_refuse", "points_lost_per_cancel"]:
            assert rkey in rules, f"missing rule {rkey}"


# =========================
# REFUSE RIDE
# =========================
class TestRefuseRide:
    def test_refuse_ride_deducts_points(self, driver_info):
        tok, driver = driver_info
        if driver.get("status") != "approved":
            pytest.skip("Driver not approved — skipping refuse-ride test")

        # Get baseline
        act0 = requests.get(f"{API}/drivers/my-activity", headers=_headers(tok), timeout=15).json()
        baseline_points = act0["points"]
        baseline_refused = act0["refused_count"]
        baseline_offered = act0["offered_count"]
        loss = act0["rules"]["points_lost_per_refuse"]

        # Create a passenger + ride
        passenger_email = f"testrider_{uuid.uuid4().hex[:6]}@example.com"
        requests.post(f"{API}/auth/register", json={
            "name": "Rider", "email": passenger_email, "password": os.environ.get("TEST_RIDER_PASSWORD", "Rider123!"),
            "phone": "+33611111111", "role": "user"
        }, timeout=15)
        ptok = _login(passenger_email, os.environ.get("TEST_RIDER_PASSWORD", "Rider123!"))
        assert ptok, "Passenger login failed"
        ride_body = {
            "pickup_lat": 14.6, "pickup_lng": -61.08, "pickup_address": "A",
            "dropoff_lat": 14.61, "dropoff_lng": -61.07, "dropoff_address": "B",
            "vehicle_type": driver.get("vehicle_type", "economic"),
            "payment_method": "cash"
        }
        cr = requests.post(f"{API}/rides", headers=_headers(ptok), json=ride_body, timeout=15)
        assert cr.status_code == 200, cr.text
        ride_id = cr.json()["id"]

        # Refuse
        r = requests.post(f"{API}/drivers/refuse-ride/{ride_id}", headers=_headers(tok), timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["points"] == max(0, baseline_points - loss)

        # Verify via my-activity
        act1 = requests.get(f"{API}/drivers/my-activity", headers=_headers(tok), timeout=15).json()
        assert act1["refused_count"] == baseline_refused + 1
        assert act1["offered_count"] == baseline_offered + 1
        assert act1["points"] == max(0, baseline_points - loss)


# =========================
# RIDE POINT HOOKS (accept / complete / cancel)
# =========================
class TestRidePointHooks:
    def _create_ride_as_new_passenger(self, vehicle_type):
        email = f"testrider_{uuid.uuid4().hex[:6]}@example.com"
        requests.post(f"{API}/auth/register", json={
            "name": "Rider", "email": email, "password": os.environ.get("TEST_RIDER_PASSWORD", "Rider123!"),
            "phone": "+33612222222", "role": "user"
        }, timeout=15)
        tok = _login(email, os.environ.get("TEST_RIDER_PASSWORD", "Rider123!"))
        assert tok
        ride_body = {
            "pickup_lat": 14.6, "pickup_lng": -61.08, "pickup_address": "A",
            "dropoff_lat": 14.605, "dropoff_lng": -61.075, "dropoff_address": "B",
            "vehicle_type": vehicle_type, "payment_method": "cash"
        }
        r = requests.post(f"{API}/rides", headers=_headers(tok), json=ride_body, timeout=15)
        assert r.status_code == 200, r.text
        return r.json()["id"], tok

    def test_accept_complete_awards_points(self, driver_info):
        tok, driver = driver_info
        if driver.get("status") != "approved":
            pytest.skip("Driver not approved — skipping")

        act0 = requests.get(f"{API}/drivers/my-activity", headers=_headers(tok), timeout=15).json()
        p0 = act0["points"]
        acc0 = act0["accepted_count"]
        gain_accept = act0["rules"]["points_per_ride_accepted"]
        gain_complete = act0["rules"]["points_per_ride_completed"]

        ride_id, _ptok = self._create_ride_as_new_passenger(driver.get("vehicle_type", "economic"))

        # Accept
        r = requests.post(f"{API}/rides/{ride_id}/accept", headers=_headers(tok), timeout=15)
        assert r.status_code == 200, r.text

        act1 = requests.get(f"{API}/drivers/my-activity", headers=_headers(tok), timeout=15).json()
        assert act1["accepted_count"] == acc0 + 1
        expected_after_accept = min(100, p0 + gain_accept)
        assert act1["points"] == expected_after_accept, f"after accept: {act1['points']} vs {expected_after_accept}"

        # arriving → in_progress → completed
        for st in ["arriving", "in_progress", "completed"]:
            r = requests.post(f"{API}/rides/{ride_id}/status", headers=_headers(tok), json={"status": st}, timeout=15)
            assert r.status_code == 200, f"{st}: {r.text}"

        act2 = requests.get(f"{API}/drivers/my-activity", headers=_headers(tok), timeout=15).json()
        expected_after_complete = min(100, expected_after_accept + gain_complete)
        assert act2["points"] == expected_after_complete, f"after complete: {act2['points']} vs {expected_after_complete}"

    def test_driver_cancel_deducts_points(self, driver_info):
        tok, driver = driver_info
        if driver.get("status") != "approved":
            pytest.skip("Driver not approved — skipping")

        ride_id, _ptok = self._create_ride_as_new_passenger(driver.get("vehicle_type", "economic"))
        # Accept
        r = requests.post(f"{API}/rides/{ride_id}/accept", headers=_headers(tok), timeout=15)
        assert r.status_code == 200, r.text

        act_before = requests.get(f"{API}/drivers/my-activity", headers=_headers(tok), timeout=15).json()
        p_before = act_before["points"]
        cancelled_before = act_before["cancelled_count"]
        loss = act_before["rules"]["points_lost_per_cancel"]

        # driver cancels
        r = requests.post(f"{API}/rides/{ride_id}/status", headers=_headers(tok),
                          json={"status": "cancelled", "cancel_reason": "test"}, timeout=15)
        assert r.status_code == 200, r.text

        act_after = requests.get(f"{API}/drivers/my-activity", headers=_headers(tok), timeout=15).json()
        assert act_after["cancelled_count"] == cancelled_before + 1
        assert act_after["points"] == max(0, p_before - loss)
