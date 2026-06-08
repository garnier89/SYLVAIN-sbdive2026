"""E2E for the driver home modernization endpoints:
- GET /rides/driver/home-feed (scheduled/upcoming/available/deliveries + counts)
- POST /rides/taxi-hall (street-hail in-progress ride)
"""
import os
import requests

API = os.environ.get("API_URL") or "https://gojek-clone-41.preview.emergentagent.com"
BASE = f"{API}/api"


def _login(email, password):
    r = requests.post(f"{BASE}/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, f"login {email} -> {r.status_code} {r.text}"
    return r.json().get("token") or r.json().get("access_token")


def main():
    dtok = _login("jean.dupont@demo.sb", "Driver123!")
    h = {"Authorization": f"Bearer {dtok}"}

    # home-feed
    r = requests.get(f"{BASE}/rides/driver/home-feed", headers=h)
    assert r.status_code == 200, f"home-feed -> {r.status_code} {r.text}"
    feed = r.json()
    for key in ("scheduled_pending", "upcoming", "available_rides", "available_deliveries", "counts"):
        assert key in feed, f"home-feed missing {key}"
    assert set(feed["counts"].keys()) == {"scheduled_pending", "upcoming", "available_rides", "available_deliveries"}
    print("home-feed counts:", feed["counts"])

    # taxi-hall
    r = requests.post(f"{BASE}/rides/taxi-hall", headers=h, json={
        "pickup_lat": 48.8566, "pickup_lng": 2.3522, "pickup_address": "Position",
        "dropoff_lat": 48.8738, "dropoff_lng": 2.295, "dropoff_address": "Arc de Triomphe",
        "vehicle_type": "sb", "distance_km": 6.2, "duration_mins": 18, "estimated_fare": 14.5,
    })
    assert r.status_code == 200, f"taxi-hall -> {r.status_code} {r.text}"
    ride = r.json()
    assert ride["status"] == "in_progress" and ride.get("is_taxi_hall") is True
    assert ride.get("passenger_name")
    print("taxi-hall ride:", ride["id"], ride["status"])

    # complete to reset (driver may already hold other accepted demo rides)
    r = requests.post(f"{BASE}/rides/{ride['id']}/status", headers=h, json={"status": "completed", "extra_charges": {}})
    assert r.status_code == 200, f"complete -> {r.status_code} {r.text}"

    print("ALL OK ✅")


if __name__ == "__main__":
    main()
