"""Auto-stop (Taxi Hall): client name/phone + account matching."""
import os
import requests

API = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001").rstrip("/")
DRIVER = {"email": "jean.dupont@demo.sb", "password": "Driver123!"}


def _driver():
    s = requests.Session()
    r = s.post(f"{API}/api/auth/login", json=DRIVER, timeout=30)
    assert r.status_code == 200, r.text
    return s


def _new_user_with_phone():
    import uuid
    s = requests.Session()
    phone = "07" + str(uuid.uuid4().int)[:8]
    email = f"hailtest_{uuid.uuid4().hex[:8]}@demo.sb"
    r = s.post(f"{API}/api/auth/register", json={"email": email, "password": "Buyer2026!", "name": "Hail Match", "phone": phone}, timeout=30)
    assert r.status_code in (200, 201), r.text
    return phone


def _taxi_hall(driver, name, phone):
    return driver.post(f"{API}/api/rides/taxi-hall", json={
        "pickup_lat": 48.85, "pickup_lng": 2.35, "pickup_address": "Rue A",
        "dropoff_lat": 48.87, "dropoff_lng": 2.33, "dropoff_address": "Rue B",
        "vehicle_type": "sb", "distance_km": 3, "estimated_fare": 9,
        "client_name": name, "client_phone": phone,
    }, timeout=30)


def test_taxi_hall_guest_keeps_entered_name():
    d = _driver()
    r = _taxi_hall(d, "Marie Invitee", "0799000111")
    assert r.status_code == 200, r.text
    ride = r.json()
    assert ride["client_matched"] is False
    assert ride["passenger_name"] == "Marie Invitee"
    assert ride["user_id"] is None
    assert ride["guest_phone"] == "0799000111"


def test_taxi_hall_matches_existing_account():
    phone = _new_user_with_phone()
    d = _driver()
    r = _taxi_hall(d, "Tapé Au Volant", phone)
    assert r.status_code == 200, r.text
    ride = r.json()
    assert ride["client_matched"] is True
    assert ride["passenger_name"] == "Hail Match"  # account name, not the typed one
    assert ride["user_id"] is not None
