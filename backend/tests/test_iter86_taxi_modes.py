"""
Iter 86 — Toutes les options taxi (16 modes). Backend coverage:
new vehicle types pricing + ride creation with mode-specific fields.
"""
import os
import requests

BASE = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001").rstrip("/")
API = f"{BASE}/api"
USER_EMAIL = os.environ.get("SEED_TEST_EMAIL", "test2@example.com")
USER_PASSWORD = os.environ.get("SEED_TEST_PASSWORD", "TestPass123!")

PICKUP = {"pickup_lat": 48.85, "pickup_lng": 2.35, "pickup_address": "A"}
DROP = {"dropoff_lat": 48.88, "dropoff_lng": 2.34, "dropoff_address": "B"}


def _session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": USER_EMAIL, "password": USER_PASSWORD})
    assert r.status_code == 200, r.text
    return s


def test_new_vehicle_types_estimate():
    s = _session()
    for v in ("pets", "tuktuk", "assist", "accessible", "electric", "pool"):
        r = s.post(f"{API}/rides/estimate", json={**PICKUP, **DROP, "vehicle_type": v, "payment_method": "cash"})
        assert r.status_code == 200, (v, r.text)
        assert r.json()["estimated_fare"] > 0, v


def test_pets_ride_fields_persist():
    s = _session()
    r = s.post(f"{API}/rides", json={**PICKUP, **DROP, "vehicle_type": "pets", "payment_method": "cash",
                                      "ride_type": "instant", "pets_count": 2, "pets_size": "large"})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["pets_count"] == 2
    assert d["pets_size"] == "large"


def test_assist_and_access_fields():
    s = _session()
    r = s.post(f"{API}/rides", json={**PICKUP, **DROP, "vehicle_type": "assist", "payment_method": "cash",
                                      "ride_type": "instant", "assist_needs": "wheelchair"})
    assert r.status_code == 200, r.text
    assert r.json()["assist_needs"] == "wheelchair"

    r = s.post(f"{API}/rides", json={**PICKUP, **DROP, "vehicle_type": "accessible", "payment_method": "cash",
                                      "ride_type": "instant", "handicap_accessibility": True})
    assert r.status_code == 200, r.text
    assert r.json()["handicap_accessibility"] is True


def test_pool_and_bookforsomeone():
    s = _session()
    r = s.post(f"{API}/rides", json={**PICKUP, **DROP, "vehicle_type": "pool", "payment_method": "cash",
                                      "ride_type": "instant", "pool_enabled": True})
    assert r.status_code == 200, r.text
    assert r.json()["pool_enabled"] is True

    r = s.post(f"{API}/rides", json={**PICKUP, **DROP, "vehicle_type": "sb", "payment_method": "cash",
                                      "ride_type": "instant", "book_for_name": "Marie", "book_for_phone": "+33600000000"})
    assert r.status_code == 200, r.text
    assert r.json()["book_for_name"] == "Marie"
