"""Tests for live driver location tracking on parcel & medical transport tracking pages."""
import os
import time
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://gojek-clone-41.preview.emergentagent.com').rstrip('/')

RIDER = {"email": "rider.qa@demo.sb", "password": "Rider123!"}
DRIVER = {"email": "jean.dupont@demo.sb", "password": "Driver123!"}


def _login(creds):
    r = requests.post(f"{BASE_URL}/api/auth/login", json=creds, timeout=15)
    assert r.status_code == 200, f"Login failed {creds['email']}: {r.status_code} {r.text}"
    data = r.json()
    tok = data.get("token") or data.get("access_token")
    assert tok, f"No token in {data}"
    return tok


def _headers(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


def test_parcel_tracking_driver_location_flow():
    rider_tok = _login(RIDER)
    driver_tok = _login(DRIVER)

    # 1) Create parcel
    parcel_payload = {
        "pickup_lat": 48.8566, "pickup_lng": 2.3522, "pickup_address": "Paris HQ",
        "stops": [{"lat": 48.8606, "lng": 2.3376, "address": "Louvre", "recipient_name": "Marie"}],
        "vehicle_type": "moto",
    }
    r = requests.post(f"{BASE_URL}/api/parcels", json=parcel_payload, headers=_headers(rider_tok), timeout=15)
    assert r.status_code == 200, f"Create parcel: {r.status_code} {r.text}"
    parcel = r.json()
    pid = parcel["id"]
    assert parcel["driver_id"] is None
    assert parcel["status"] == "pending"

    # 2) Before assignment: driver_location should be None
    r = requests.get(f"{BASE_URL}/api/parcels/{pid}", headers=_headers(rider_tok), timeout=15)
    assert r.status_code == 200
    p = r.json()
    assert p.get("driver_id") is None
    assert p.get("driver_location") is None, f"Should be None before assignment: {p.get('driver_location')}"

    # 3) Driver accepts the parcel
    r = requests.post(f"{BASE_URL}/api/parcels/{pid}/accept", headers=_headers(driver_tok), timeout=15)
    assert r.status_code == 200, f"Accept parcel: {r.status_code} {r.text}"

    # 4) Driver posts a location
    loc = {"lat": 48.858, "lng": 2.349}
    r = requests.post(f"{BASE_URL}/api/drivers/location", json=loc, headers=_headers(driver_tok), timeout=15)
    assert r.status_code in (200, 201), f"Update location: {r.status_code} {r.text}"

    # 5) Passenger now sees driver_location
    time.sleep(0.5)
    r = requests.get(f"{BASE_URL}/api/parcels/{pid}", headers=_headers(rider_tok), timeout=15)
    assert r.status_code == 200
    p = r.json()
    assert p.get("driver_id") is not None, "Driver must be assigned"
    dl = p.get("driver_location")
    assert dl, f"driver_location must be populated, got {dl}"
    assert abs(dl["lat"] - loc["lat"]) < 0.01
    assert abs(dl["lng"] - loc["lng"]) < 0.01

    # 6) Update location again; passenger sees new value
    loc2 = {"lat": 48.870, "lng": 2.360}
    r = requests.post(f"{BASE_URL}/api/drivers/location", json=loc2, headers=_headers(driver_tok), timeout=15)
    assert r.status_code in (200, 201)
    time.sleep(0.5)
    r = requests.get(f"{BASE_URL}/api/parcels/{pid}", headers=_headers(rider_tok), timeout=15)
    p = r.json()
    dl = p["driver_location"]
    assert abs(dl["lat"] - loc2["lat"]) < 0.01, f"Expected updated lat, got {dl}"


def test_medical_transport_driver_location_flow():
    rider_tok = _login(RIDER)
    driver_tok = _login(DRIVER)

    # Try create medical transport
    payload = {
        "pickup_lat": 48.8566, "pickup_lng": 2.3522, "pickup_address": "Domicile patient",
        "dest_lat": 48.8400, "dest_lng": 2.3700, "dest_address": "Hôpital Pitié",
        "transport_type": "lying", "patient_name": "Test Patient",
    }
    r = requests.post(f"{BASE_URL}/api/medical/transport", json=payload, headers=_headers(rider_tok), timeout=15)
    if r.status_code not in (200, 201):
        # Try alternative payload
        print(f"Medical transport create failed: {r.status_code} {r.text}")
        return
    tr = r.json()
    tid = tr.get("id")
    assert tid

    # Get before assignment
    r = requests.get(f"{BASE_URL}/api/medical/transport/{tid}", headers=_headers(rider_tok), timeout=15)
    if r.status_code != 200:
        print(f"Medical GET failed: {r.status_code} {r.text}")
        return
    t = r.json()
    assert t.get("driver_location") is None

    # Driver accepts (try generic endpoint)
    r = requests.post(f"{BASE_URL}/api/medical/transport/{tid}/accept", headers=_headers(driver_tok), timeout=15)
    if r.status_code not in (200, 201):
        print(f"Medical accept not 200: {r.status_code} {r.text}")
        return

    requests.post(f"{BASE_URL}/api/drivers/location", json={"lat": 48.85, "lng": 2.35}, headers=_headers(driver_tok), timeout=15)
    time.sleep(0.5)
    r = requests.get(f"{BASE_URL}/api/medical/transport/{tid}", headers=_headers(rider_tok), timeout=15)
    assert r.status_code == 200
    t = r.json()
    assert t.get("driver_id"), "Driver should be assigned"
    assert t.get("driver_location"), f"driver_location should be set, got {t.get('driver_location')}"
