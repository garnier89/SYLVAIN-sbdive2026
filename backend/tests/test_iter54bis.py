"""Regression tests for iter54bis:
- POST /api/rides/estimate with full payload (no 422)
- POST /api/phase2/runner/book (simple + multiple)
- GET  /api/phase2/runner/my
"""
import os
import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")


# ------------------- fixtures -------------------
@pytest.fixture(scope="module")
def user_session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": "test2@example.com", "password": os.environ.get("TEST_USER_PASSWORD", "TestPass123!")},
    )
    if r.status_code != 200:
        # try register then login
        s.post(
            f"{BASE_URL}/api/auth/register",
            json={
                "email": "test2@example.com",
                "password": os.environ.get("TEST_USER_PASSWORD", "TestPass123!"),
                "name": "Test2",
                "phone": "+33600000002",
                "role": "user",
            },
        )
        r = s.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "test2@example.com", "password": os.environ.get("TEST_USER_PASSWORD", "TestPass123!")},
        )
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return s


# ------------------- rides/estimate (regression) -------------------
class TestRidesEstimate:
    def test_estimate_full_payload(self, user_session):
        payload = {
            "pickup_lat": 48.8566,
            "pickup_lng": 2.3522,
            "pickup_address": "Paris, France",
            "dropoff_lat": 45.7640,
            "dropoff_lng": 4.8357,
            "dropoff_address": "Lyon, France",
            "vehicle_type": "sb",
            "payment_method": "cash",
        }
        r = user_session.post(f"{BASE_URL}/api/rides/estimate", json=payload)
        assert r.status_code == 200, f"expected 200, got {r.status_code}: {r.text}"
        data = r.json()
        assert "estimated_fare" in data or "fare" in data or "price" in data, data
        # distance in km sanity check if present
        if "distance_km" in data:
            assert data["distance_km"] > 100  # Paris-Lyon ~465km


# ------------------- phase2 runner -------------------
class TestRunnerBooking:
    def test_runner_book_simple(self, user_session):
        payload = {
            "service_type": "runner",
            "mode": "simple",
            "pickup_address": "10 rue de Rivoli, Paris",
            "pickup_lat": 48.8566,
            "pickup_lng": 2.3522,
            "pickup_note": "Code 1234",
            "package_type": "document",
            "estimated_fare": 12.5,
            "drops": [
                {
                    "address": "15 avenue des Champs, Paris",
                    "lat": 48.8700,
                    "lng": 2.3500,
                    "name": "Alice",
                    "phone": "+33611111111",
                }
            ],
        }
        r = user_session.post(f"{BASE_URL}/api/phase2/runner/book", json=payload)
        assert r.status_code == 200, f"expected 200, got {r.status_code}: {r.text}"
        body = r.json()
        assert "order" in body
        assert body["order"]["mode"] == "simple"
        assert body["order"]["pickup"]["address"].startswith("10 rue")
        assert len(body["order"]["drops"]) == 1
        # no raw ObjectId
        assert "_id" not in body["order"]

    def test_runner_book_multiple(self, user_session):
        payload = {
            "service_type": "runner",
            "mode": "multiple",
            "pickup_address": "Gare du Nord, Paris",
            "pickup_lat": 48.8809,
            "pickup_lng": 2.3553,
            "package_type": "small",
            "estimated_fare": 22.0,
            "drops": [
                {"address": "Stop A", "lat": 48.87, "lng": 2.33, "phone": "+33611111112"},
                {"address": "Stop B", "lat": 48.86, "lng": 2.34, "phone": "+33611111113"},
            ],
        }
        r = user_session.post(f"{BASE_URL}/api/phase2/runner/book", json=payload)
        assert r.status_code == 200, f"expected 200, got {r.status_code}: {r.text}"
        assert r.json()["order"]["mode"] == "multiple"
        assert len(r.json()["order"]["drops"]) == 2

    def test_runner_book_missing_pickup(self, user_session):
        r = user_session.post(
            f"{BASE_URL}/api/phase2/runner/book",
            json={"mode": "simple", "drops": [{"address": "x", "lat": 1, "lng": 2}]},
        )
        assert r.status_code == 400

    def test_runner_my(self, user_session):
        # ensure at least one exists by booking first
        user_session.post(
            f"{BASE_URL}/api/phase2/runner/book",
            json={
                "mode": "simple",
                "pickup_address": "TEST_pickup",
                "pickup_lat": 48.8,
                "pickup_lng": 2.3,
                "drops": [{"address": "TEST_drop", "lat": 48.9, "lng": 2.4, "phone": "0"}],
            },
        )
        r = user_session.get(f"{BASE_URL}/api/phase2/runner/my")
        assert r.status_code == 200
        items = r.json()
        assert isinstance(items, list)
        assert len(items) >= 1
        assert "_id" not in items[0]
