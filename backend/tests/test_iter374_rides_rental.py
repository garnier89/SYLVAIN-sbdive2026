"""Iter 374 — Dedicated tests for the extracted `routes/rides_rental.py` sub-router.

Locks the rental (mise à disposition) meter lifecycle plus the airport-multiplier
and rental-package config readers, after the Phase-4 split.
"""
import os
import uuid

import requests


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


def _rider():
    s = requests.Session()
    r = s.post(f"{BASE}/api/auth/register", json={
        "name": "Rental Rider", "email": f"rent_{uuid.uuid4().hex[:8]}@test.sb",
        "password": "Test1234!", "role": "user"}, timeout=30)
    assert r.status_code == 200, r.text[:200]
    return s


def _new_rental_ride(rider):
    body = {
        "pickup_lat": 14.6037, "pickup_lng": -61.0594, "pickup_address": "Fort-de-France",
        "dropoff_lat": 14.61, "dropoff_lng": -60.99, "dropoff_address": "Le Lamentin",
        "vehicle_type": "sb", "payment_method": "cash",
        "ride_type": "rental", "rental_hours": 2,
    }
    r = rider.post(f"{BASE}/api/rides", json=body, timeout=30)
    assert r.status_code == 200, r.text[:200]
    j = r.json()
    assert j.get("ride_type") == "rental", f"not a rental ride: {j.get('ride_type')}"
    return j["id"]


def _new_standard_ride(rider):
    body = {
        "pickup_lat": 14.6037, "pickup_lng": -61.0594, "pickup_address": "FdF",
        "dropoff_lat": 14.61, "dropoff_lng": -60.99, "dropoff_address": "Lamentin",
        "vehicle_type": "sb", "payment_method": "cash",
    }
    r = rider.post(f"{BASE}/api/rides", json=body, timeout=30)
    assert r.status_code == 200, r.text[:200]
    return r.json()["id"]


# ── rental meter lifecycle ─────────────────────────────────────────────────
def test_rental_full_lifecycle():
    rider = _rider()
    rid = _new_rental_ride(rider)

    # start
    st = rider.post(f"{BASE}/api/rides/{rid}/rental/start", timeout=30)
    assert st.status_code == 200, st.text[:200]
    ride = rider.get(f"{BASE}/api/rides/{rid}", timeout=30).json()
    assert ride["status"] == "in_progress"
    assert ride.get("rental_started_at")

    # add-stop
    ad = rider.post(f"{BASE}/api/rides/{rid}/rental/add-stop",
                    json={"address": "Schoelcher", "lat": 14.61, "lng": -61.10}, timeout=30)
    assert ad.status_code == 200, ad.text[:200]
    assert any(s["address"] == "Schoelcher" for s in ad.json()["stops"])

    # live meter
    mt = rider.get(f"{BASE}/api/rides/{rid}/rental/meter", timeout=30)
    assert mt.status_code == 200, mt.text[:200]
    meter = mt.json()
    assert isinstance(meter, dict) and len(meter) > 0

    # end
    en = rider.post(f"{BASE}/api/rides/{rid}/rental/end", json={"actual_km": 18}, timeout=30)
    assert en.status_code == 200, en.text[:200]
    assert "meter" in en.json()


def test_rental_start_is_idempotent():
    rider = _rider()
    rid = _new_rental_ride(rider)
    r1 = rider.post(f"{BASE}/api/rides/{rid}/rental/start", timeout=30)
    r2 = rider.post(f"{BASE}/api/rides/{rid}/rental/start", timeout=30)
    assert r1.status_code == 200 and r2.status_code == 200


def test_add_stop_requires_address():
    rider = _rider()
    rid = _new_rental_ride(rider)
    r = rider.post(f"{BASE}/api/rides/{rid}/rental/add-stop", json={"lat": 14.6, "lng": -61.0}, timeout=30)
    assert r.status_code == 400


def test_rental_endpoints_reject_non_rental_ride():
    rider = _rider()
    rid = _new_standard_ride(rider)
    r = rider.get(f"{BASE}/api/rides/{rid}/rental/meter", timeout=30)
    assert r.status_code == 400


def test_rental_endpoints_404_on_missing_ride():
    rider = _rider()
    assert rider.get(f"{BASE}/api/rides/nope_xyz/rental/meter", timeout=30).status_code == 404
    assert rider.post(f"{BASE}/api/rides/nope_xyz/rental/start", timeout=30).status_code == 404


def test_rental_end_requires_started_meter():
    rider = _rider()
    rid = _new_rental_ride(rider)  # not started
    r = rider.post(f"{BASE}/api/rides/{rid}/rental/end", json={"actual_km": 10}, timeout=30)
    assert r.status_code == 400


# ── config readers ─────────────────────────────────────────────────────────
def test_airport_multipliers_config():
    rider = _rider()
    r = rider.post(f"{BASE}/api/rides/airport-multipliers", timeout=30)
    assert r.status_code == 200, r.text[:200]
    d = r.json()
    assert "multiplier" in d and "currency" in d


def test_rental_packages_config():
    rider = _rider()
    r = rider.post(f"{BASE}/api/rides/rental-packages", timeout=30)
    assert r.status_code == 200, r.text[:200]
    d = r.json()
    assert "packages" in d and isinstance(d["packages"], list) and len(d["packages"]) >= 1
