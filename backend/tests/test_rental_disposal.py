"""Iteration: Mise à disposition (rental, P2) — backend live-billing flow.

Covers:
- Rental ride creation applies the fixed package price + stores billing config & stops.
- Live meter (start → add-stop → meter → end) computes time/km overage.
- Completion invoice = package price + overage (rental-aware override).
"""
import os
import time

import requests

BASE = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001").rstrip("/")
API = f"{BASE}/api"
ADMIN = {"email": "admin@superapp.com", "password": "SuperAdmin123!"}


def _login(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=15)
    r.raise_for_status()
    return r.json()["access_token"]


def _register_client():
    em = f"TEST_rental_{int(time.time()*1000)}@example.com"
    r = requests.post(f"{API}/auth/register", json={"email": em, "password": "Client123!", "name": "Rental"}, timeout=15)
    r.raise_for_status()
    return r.json()["access_token"]


def _create_rental(token, pkg="4h_40km"):
    h = {"Authorization": f"Bearer {token}"}
    body = {
        "pickup_lat": 14.6, "pickup_lng": -61.07, "pickup_address": "FDF centre",
        "dropoff_lat": 14.6, "dropoff_lng": -61.07, "dropoff_address": "FDF centre",
        "vehicle_type": "confort", "payment_method": "cash",
        "ride_type": "rental", "mode_id": "rental", "rental_package": pkg, "rental_hours": 4,
        "stops": [{"address": "Schoelcher", "lat": 14.61, "lng": -61.09}],
    }
    r = requests.post(f"{API}/rides", headers=h, json=body, timeout=20)
    assert r.status_code == 200, r.text
    return r.json()


def test_rental_creation_pricing():
    ride = _create_rental(_register_client(), "4h_40km")
    assert ride["ride_type"] == "rental"
    assert ride["rental_package_price"] == 72.0
    assert ride["estimated_fare"] == 72.0
    assert ride["rental_hours_included"] == 4.0 and ride["rental_km_included"] == 40.0
    assert ride["rental_extra_hour_rate"] == 18.0 and ride["rental_extra_km_rate"] == 0.8
    assert len(ride["stops"]) == 1


def test_rental_meter_and_completion():
    ct = _register_client()
    ch = {"Authorization": f"Bearer {ct}"}
    ride = _create_rental(ct, "2h_20km")
    rid = ride["id"]

    # start
    r = requests.post(f"{API}/rides/{rid}/rental/start", headers=ch, timeout=15)
    assert r.status_code == 200 and r.json()["rental_started_at"]

    # add a live stop
    r = requests.post(f"{API}/rides/{rid}/rental/add-stop", headers=ch,
                      json={"address": "Le Lamentin", "lat": 14.61, "lng": -61.0}, timeout=15)
    assert r.status_code == 200 and len(r.json()["stops"]) == 2

    # live meter
    m = requests.get(f"{API}/rides/{rid}/rental/meter", headers=ch, timeout=15).json()
    assert m["hours_included"] == 2.0 and m["km_included"] == 20.0
    assert m["package_price"] == 36.0

    # end with 55 km → 35 km overage * 0.8 = 28
    r = requests.post(f"{API}/rides/{rid}/rental/end", headers=ch, json={"actual_km": 55}, timeout=15)
    assert r.status_code == 200, r.text
    meter = r.json()["meter"]
    assert meter["overage_km"] == 35.0 and meter["overage_fee"] == 28.0
    assert meter["projected_total"] == 64.0

    # complete as admin (driver/admin only) → rental invoice override
    admin = _login(ADMIN)
    r = requests.post(f"{API}/rides/{rid}/status", headers={"Authorization": f"Bearer {admin}"},
                      json={"status": "completed"}, timeout=15)
    assert r.status_code == 200, r.text

    # verify the persisted invoice
    detail = requests.get(f"{API}/rides/{rid}", headers=ch, timeout=15).json()
    assert detail["final_fare"] == 64.0
    fb = detail.get("fare_breakdown") or {}
    assert fb.get("rental") is True and fb.get("package_price") == 36.0 and fb.get("overage_fee") == 28.0


def test_demo_seed_and_reset():
    """Admin one-click demo seed (airports + drivers online) and reset (drivers offline)."""
    admin = _login(ADMIN)
    h = {"Authorization": f"Bearer {admin}"}
    r = requests.post(f"{API}/phase2/admin/demo/seed", headers=h, timeout=20)
    assert r.status_code == 200, r.text
    seed = r.json()
    assert "CDG" in [a["code"] for a in requests.get(f"{API}/phase2/airports", timeout=15).json()]

    st = requests.get(f"{API}/phase2/admin/demo/status", headers=h, timeout=15).json()
    assert all(a["exists"] for a in st["airports"])
    assert any(d["online"] for d in st["drivers"])  # at least one demo driver online

    r = requests.post(f"{API}/phase2/admin/demo/reset", headers=h, timeout=20)
    assert r.status_code == 200, r.text
    st2 = requests.get(f"{API}/phase2/admin/demo/status", headers=h, timeout=15).json()
    assert all(not d["online"] for d in st2["drivers"])  # all demo drivers offline
    # airports kept
    assert all(a["exists"] for a in st2["airports"])


if __name__ == "__main__":
    test_rental_creation_pricing()
    test_rental_meter_and_completion()
    test_demo_seed_and_reset()
    print("ALL RENTAL TESTS PASSED")
