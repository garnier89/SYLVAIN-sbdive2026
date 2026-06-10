"""Iteration: Airport Transfer (P2) — backend flow.

Covers:
- Admin can create/list/update an airport zone (with meeting point, free-wait, luggage, shuttle).
- Public airport directory endpoint.
- Airport ride creation applies luggage fee + shuttle discount, stores airport meta + flight status.
- Flight Watch simulation is deterministic and adjusts the pickup time for delayed flights.
- Admin airport reservations dashboard returns the booking with flight info.
"""
import os
import time
from datetime import datetime, timedelta, timezone

import requests

BASE = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001").rstrip("/")
API = f"{BASE}/api"

ADMIN = {"email": "admin@superapp.com", "password": "SuperAdmin123!"}


def _login(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=15)
    r.raise_for_status()
    return r.json()["access_token"]


def _register_client():
    em = f"TEST_airport_{int(time.time()*1000)}@example.com"
    r = requests.post(f"{API}/auth/register", json={"email": em, "password": "Client123!", "name": "Air Test"}, timeout=15)
    r.raise_for_status()
    return r.json()["access_token"]


def _future_iso(hours=3):
    return (datetime.now(timezone.utc) + timedelta(hours=hours)).strftime("%Y-%m-%dT%H:%M")


def test_simulate_flight_status_deterministic():
    from core.airport import simulate_flight_status
    a = simulate_flight_status("AF1002", "2026-06-15T10:00:00")
    b = simulate_flight_status("AF1002", "2026-06-15T10:00:00")
    assert a["status"] == b["status"]  # deterministic
    assert simulate_flight_status("AF1002")["status"] == "delayed"
    assert simulate_flight_status("AF1006")["status"] == "cancelled"
    assert simulate_flight_status("")  is None


def test_admin_airport_crud_and_public_list():
    tok = _login(ADMIN)
    h = {"Authorization": f"Bearer {tok}"}
    payload = {
        "name": "Test Airport FDF", "code": "TFD", "lat": 14.591, "lng": -61.003,
        "radius_km": 4, "meeting_point": "Terminal 1, sortie B", "free_wait_minutes": 45,
        "luggage_fee": 5, "shuttle_discount_pct": 30,
    }
    r = requests.post(f"{API}/phase2/config/airport-zones", headers=h, json=payload, timeout=15)
    assert r.status_code == 200, r.text
    az = r.json()
    assert az["free_wait_minutes"] == 45 and az["meeting_point"].startswith("Terminal")

    # public list
    pub = requests.get(f"{API}/phase2/airports", timeout=15).json()
    assert any(a["id"] == az["id"] for a in pub)

    # update
    r = requests.put(f"{API}/phase2/config/airport-zones/{az['id']}", headers=h, json={"free_wait_minutes": 60}, timeout=15)
    assert r.status_code == 200 and r.json()["free_wait_minutes"] == 60

    # cleanup
    requests.delete(f"{API}/phase2/config/airport-zones/{az['id']}", headers=h, timeout=15)


def test_airport_ride_pricing_and_flight_status():
    admin = _login(ADMIN)
    ah = {"Authorization": f"Bearer {admin}"}
    az = requests.post(f"{API}/phase2/config/airport-zones", headers=ah, json={
        "name": "Pricing Airport", "code": "PRC", "lat": 14.591, "lng": -61.003,
        "radius_km": 5, "free_wait_minutes": 45, "luggage_fee": 5, "shuttle_discount_pct": 30,
    }, timeout=15).json()

    ct = _register_client()
    ch = {"Authorization": f"Bearer {ct}"}
    body = {
        "pickup_lat": 14.591, "pickup_lng": -61.003, "pickup_address": "Aéroport FDF",
        "dropoff_lat": 14.604, "dropoff_lng": -61.07, "dropoff_address": "Fort-de-France",
        "vehicle_type": "sb", "payment_method": "cash", "ride_type": "airport", "mode_id": "airport",
        "flight_number": "AF1002", "airport_terminal": "T1", "flight_arrival_time": "10:00",
        "luggage_assist": True, "luggage_count": 2, "shared_shuttle": True, "scheduled_at": _future_iso(3),
    }
    r = requests.post(f"{API}/rides", headers=ch, json=body, timeout=20)
    assert r.status_code == 200, r.text
    ride = r.json()
    assert ride["ride_type"] == "airport"
    assert ride["luggage_fee"] == 5.0
    assert ride["shared_shuttle"] is True and ride["shuttle_discount"] > 0
    assert ride["free_wait_minutes"] == 45
    assert ride["meeting_point"]
    assert ride["flight_status"]["status"] == "delayed"
    # delayed → pickup time was adjusted forward
    assert ride["flight_status"].get("adjusted_pickup")

    # admin dashboard lists it
    res = requests.get(f"{API}/phase2/admin/airport/reservations", headers=ah, timeout=15).json()
    assert any(x["id"] == ride["id"] for x in res["reservations"])
    assert res["counts"]["delayed"] >= 1

    requests.delete(f"{API}/phase2/config/airport-zones/{az['id']}", headers=ah, timeout=15)


if __name__ == "__main__":
    test_simulate_flight_status_deterministic()
    test_admin_airport_crud_and_public_list()
    test_airport_ride_pricing_and_flight_status()
    print("ALL AIRPORT TESTS PASSED")
