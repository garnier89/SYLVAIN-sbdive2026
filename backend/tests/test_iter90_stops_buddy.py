"""Iter 90 — multi-stop pricing + buddy_driver + stops persistence."""
import os
import requests

BASE = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001").rstrip("/")
API = f"{BASE}/api"
USER = {"email": os.environ.get("SEED_TEST_EMAIL", "test2@example.com"), "password": os.environ.get("SEED_TEST_PASSWORD", "TestPass123!")}

DIRECT = {
    "pickup_lat": 48.85, "pickup_lng": 2.35, "pickup_address": "A",
    "dropoff_lat": 48.88, "dropoff_lng": 2.34, "dropoff_address": "B",
    "vehicle_type": "sb", "payment_method": "cash",
}


def _session():
    s = requests.Session()
    assert s.post(f"{API}/auth/login", json=USER).status_code == 200
    return s


def test_multistop_increases_distance_and_fare():
    s = _session()
    direct = s.post(f"{API}/rides/estimate", json=DIRECT).json()
    detour = s.post(f"{API}/rides/estimate", json={**DIRECT, "stops": [{"address": "X", "lat": 48.80, "lng": 2.45}]}).json()
    assert detour["distance_km"] > direct["distance_km"]
    assert detour["estimated_fare"] >= direct["estimated_fare"]


def test_create_ride_with_stops_persists_and_prices_through_waypoints():
    s = _session()
    r = s.post(f"{API}/rides", json={**DIRECT, "ride_type": "instant", "stops": [{"address": "X", "lat": 48.80, "lng": 2.45}]})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d.get("stops") and len(d["stops"]) == 1
    # fare reflects detour (greater than a direct trip's typical fare)
    direct = s.post(f"{API}/rides/estimate", json=DIRECT).json()
    assert d["estimated_fare"] >= direct["estimated_fare"]


def test_buddy_driver_ride():
    s = _session()
    r = s.post(f"{API}/rides", json={
        "pickup_lat": 48.85, "pickup_lng": 2.35, "pickup_address": "A",
        "dropoff_lat": 48.85, "dropoff_lng": 2.35, "dropoff_address": "A",
        "vehicle_type": "confort", "payment_method": "cash",
        "ride_type": "buddy_driver", "buddy_hours": 4,
    })
    assert r.status_code == 200, r.text
    assert r.json()["buddy_hours"] == 4
    assert r.json()["ride_type"] == "buddy_driver"
