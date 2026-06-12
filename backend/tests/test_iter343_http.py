"""Iter343 — HTTP-level smoke for driver-routes CRUD + auto-alert via public URL."""
import os
import time
import requests
import pytest

BASE = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE:
    # fallback to frontend/.env file
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE = line.split("=", 1)[1].strip().rstrip("/")
API = f"{BASE}/api"


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"login {email} failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def driver_token():
    return _login("driver@test.sb", "Driver123!")


@pytest.fixture(scope="module")
def client_token():
    return _login("client@test.sb", "Client123!")


def _h(tok):
    return {"Authorization": f"Bearer {tok}"}


def test_driver_routes_crud_and_alert(driver_token, client_token):
    # cleanup existing
    def _routes_list(payload):
        if isinstance(payload, list):
            return payload
        return payload.get("routes", payload.get("items", []))

    r = requests.get(f"{API}/carpool/driver-routes", headers=_h(driver_token), timeout=15)
    assert r.status_code == 200
    for rt in _routes_list(r.json()):
        rid = rt.get("id")
        if rid:
            requests.delete(f"{API}/carpool/driver-routes/{rid}", headers=_h(driver_token), timeout=15)

    # CREATE
    payload = {
        "pickup_address": "Fort-de-France centre",
        "dropoff_address": "Le Lamentin aéroport",
        "days": [1, 2, 3, 4, 5],
        "time": "07:30",
    }
    r = requests.post(f"{API}/carpool/driver-routes", json=payload, headers=_h(driver_token), timeout=15)
    assert r.status_code == 200, r.text
    rt = r.json()
    assert "id" in rt and rt.get("active") is True
    route_id = rt["id"]

    # LIST
    r = requests.get(f"{API}/carpool/driver-routes", headers=_h(driver_token), timeout=15)
    assert r.status_code == 200
    routes = _routes_list(r.json())
    assert any(x.get("id") == route_id for x in routes)

    # MATCHING REQUEST from a different user -> drivers_notified>=1
    req_payload = {
        "pickup_address": "Fort-de-France",
        "dropoff_address": "Lamentin",
        "departure_date": "2027-06-15T07:30",
        "seats_needed": 1,
    }
    r = requests.post(f"{API}/carpool/requests", json=req_payload, headers=_h(client_token), timeout=20)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body.get("drivers_notified", 0) >= 1, f"expected notify >=1, got {body}"

    # Verify notification exists for driver
    time.sleep(0.5)
    r = requests.get(f"{API}/drivers/my-notifications", headers=_h(driver_token), timeout=15)
    assert r.status_code == 200
    notifs_payload = r.json()
    notifs = notifs_payload if isinstance(notifs_payload, list) else notifs_payload.get("notifications", notifs_payload.get("items", []))
    types = [n.get("type") for n in notifs]
    assert "carpool_request_match" in types, f"types={types[:10]}"

    # NON-MATCHING REQUEST -> drivers_notified=0
    r = requests.post(
        f"{API}/carpool/requests",
        json={
            "pickup_address": "Paris",
            "dropoff_address": "Lyon",
            "departure_date": "2027-06-16T09:00",
        },
        headers=_h(client_token),
        timeout=15,
    )
    assert r.status_code == 200
    assert r.json().get("drivers_notified", 0) == 0

    # TOGGLE
    r = requests.post(f"{API}/carpool/driver-routes/{route_id}/toggle", headers=_h(driver_token), timeout=15)
    assert r.status_code == 200
    assert r.json().get("active") is False

    # Inactive: matching request should NOT notify driver this time
    r = requests.post(f"{API}/carpool/requests", json=req_payload, headers=_h(client_token), timeout=20)
    assert r.status_code == 200
    assert r.json().get("drivers_notified", 0) == 0

    # DELETE
    r = requests.delete(f"{API}/carpool/driver-routes/{route_id}", headers=_h(driver_token), timeout=15)
    assert r.status_code == 200
    assert r.json().get("ok") is True or r.json().get("deleted") is True

    # Non-owner / unknown delete -> 404
    r = requests.delete(f"{API}/carpool/driver-routes/non-existent-xyz", headers=_h(driver_token), timeout=15)
    assert r.status_code == 404
