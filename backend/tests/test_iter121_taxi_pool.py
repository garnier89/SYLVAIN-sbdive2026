"""Taxi Pool (SHARED ride) pricing — updated model:
  - 1st seat = standard private fare MINUS a pool discount (sharing rebate).
  - Each extra seat the same booking reserves = +pool_percentage% of the
    discounted 1st-seat price: total(n) = base*(1 + (n-1)*pct/100).
  - Per-booking seats are capped (max_seats_per_booking, bounded by capacity).
Admin-configurable per Vehicle Type / global pool config."""
import os
import time

import requests

BASE = os.environ.get("REACT_APP_BACKEND_URL", "https://gojek-clone-41.preview.emergentagent.com")
API = f"{BASE}/api"

TRIP = {
    "pickup_lat": 48.8566, "pickup_lng": 2.3522, "pickup_address": "Paris",
    "dropoff_lat": 48.8606, "dropoff_lng": 2.3376, "dropoff_address": "Louvre",
    "vehicle_type": "pool", "payment_method": "cash",
}


def _user_session():
    s = requests.Session()
    email = f"pooltest_{int(time.time()*1000)}@demo.sb"
    r = s.post(f"{API}/auth/register", json={
        "email": email, "password": "Pool123!", "name": "Pool QA",
        "phone": "+596690000009", "role": "user",
    }, timeout=30)
    assert r.status_code == 200, r.text
    return s


def test_first_seat_is_discounted_vs_private():
    base = requests.post(f"{API}/rides/estimate", json={**TRIP}, timeout=30).json()
    pool1 = requests.post(f"{API}/rides/estimate", json={**TRIP, "pool_enabled": True, "seats_required": 1}, timeout=30).json()
    assert pool1["seats_required"] == 1
    # Pool is a SHARED ride → genuinely cheaper than a private ride.
    disc = pool1["pool_discount_percent"]
    assert disc and disc > 0
    expected = round(base["estimated_fare"] * (1 - disc / 100.0), 2)
    assert abs(pool1["estimated_fare"] - expected) < 0.02
    assert pool1["estimated_fare"] < base["estimated_fare"]
    # original_fare = the private reference fare; savings reported.
    assert pool1["original_fare"] == base["estimated_fare"]
    assert pool1["pool_savings"] and pool1["pool_savings"] > 0
    assert pool1["available_seats"] is not None
    assert pool1["pool_percentage"] is not None


def test_seat_pricing_linear_pool_percentage():
    """total(n) = base*(1 + (n-1)*pct/100) where base is the discounted 1st-seat price."""
    r1 = requests.post(f"{API}/rides/estimate", json={**TRIP, "pool_enabled": True, "seats_required": 1}, timeout=30).json()
    r2 = requests.post(f"{API}/rides/estimate", json={**TRIP, "pool_enabled": True, "seats_required": 2}, timeout=30).json()
    base = r1["estimated_fare"]
    pct = r1["pool_percentage"]
    assert abs(r2["estimated_fare"] - round(base * (1 + (pct / 100.0)), 2)) < 0.02


def test_seats_clamped_to_per_booking_cap():
    r1 = requests.post(f"{API}/rides/estimate", json={**TRIP, "pool_enabled": True, "seats_required": 1}, timeout=30).json()
    cap = max(1, min(r1["max_seats_per_booking"], r1["available_seats"]))
    over = requests.post(f"{API}/rides/estimate", json={**TRIP, "pool_enabled": True, "seats_required": cap + 5}, timeout=30).json()
    assert over["seats_required"] == cap


def test_create_pool_ride_persists_seats_and_fare():
    s = _user_session()
    base = s.post(f"{API}/rides", json={**TRIP}, timeout=30).json()["estimated_fare"]
    est = requests.post(f"{API}/rides/estimate", json={**TRIP, "pool_enabled": True, "seats_required": 2}, timeout=30).json()
    rp = s.post(f"{API}/rides", json={**TRIP, "pool_enabled": True, "seats_required": 2}, timeout=30)
    assert rp.status_code in (200, 201), rp.text
    d = rp.json()
    assert d["seats_required"] == est["seats_required"]
    assert d["pool_enabled"] is True
    # Persisted pool fare matches the discounted-base linear estimate.
    disc = est["pool_discount_percent"]
    pct = est["pool_percentage"]
    pool_base = base * (1 - disc / 100.0)
    expected = round(pool_base * (1 + (est["seats_required"] - 1) * pct / 100.0), 2)
    assert abs(d["estimated_fare"] - expected) < 0.05


def test_non_pool_unaffected():
    s = _user_session()
    r = s.post(f"{API}/rides", json={**TRIP}, timeout=30)
    d = r.json()
    assert d["pool_enabled"] is False
    assert d["original_fare"] is None
    assert d["seats_required"] == 1


def test_intercity_round_trip_multiplier():
    """Intercity round-trip (aller-retour) bills the one-way fare ~1.9x."""
    one = requests.post(f"{API}/rides/estimate", json={
        "pickup_lat": 48.8566, "pickup_lng": 2.3522, "pickup_address": "Paris",
        "dropoff_lat": 45.76, "dropoff_lng": 4.83, "dropoff_address": "Lyon",
        "vehicle_type": "confort", "payment_method": "cash", "ride_type": "intercity",
    }, timeout=30).json()
    rt = requests.post(f"{API}/rides/estimate", json={
        "pickup_lat": 48.8566, "pickup_lng": 2.3522, "pickup_address": "Paris",
        "dropoff_lat": 45.76, "dropoff_lng": 4.83, "dropoff_address": "Lyon",
        "vehicle_type": "confort", "payment_method": "cash", "ride_type": "intercity", "round_trip": True,
    }, timeout=30).json()
    assert rt["is_intercity"] is True
    assert rt["round_trip"] is True
    assert rt["estimated_fare"] > one["estimated_fare"] * 1.5
