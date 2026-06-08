"""E2E for the V3Cube driver ride flow backend additions:
- passenger enrichment on the driver ride view
- extra charges + rounding on completion (fare_breakdown)
- driver-rates-passenger endpoint
Run against the live preview backend.
"""
import os
import time
import uuid
import requests

API = os.environ.get("API_URL") or "https://gojek-clone-41.preview.emergentagent.com"
BASE = f"{API}/api"


def _login(email, password):
    r = requests.post(f"{BASE}/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, f"login {email} -> {r.status_code} {r.text}"
    return r.json().get("token") or r.json().get("access_token")


def _h(tok):
    return {"Authorization": f"Bearer {tok}"}


def main():
    # 1. Passenger
    email = f"qa.rideflow.{uuid.uuid4().hex[:6]}@demo.sb"
    r = requests.post(f"{BASE}/auth/register", json={"name": "QA Passager", "email": email, "password": "RideFlow123!", "phone": "+33600000000"})
    assert r.status_code in (200, 201), f"register -> {r.status_code} {r.text}"
    ptok = r.json().get("token") or r.json().get("access_token") or _login(email, "RideFlow123!")

    # 2. Create a ride
    ride_body = {
        "pickup_lat": 48.8566, "pickup_lng": 2.3522, "pickup_address": "Châtelet, Paris",
        "dropoff_lat": 48.8738, "dropoff_lng": 2.295, "dropoff_address": "Arc de Triomphe, Paris",
        "vehicle_type": "sb", "payment_method": "cash",
    }
    r = requests.post(f"{BASE}/rides", json=ride_body, headers=_h(ptok))
    assert r.status_code in (200, 201), f"create ride -> {r.status_code} {r.text}"
    ride = r.json()
    ride_id = ride["id"]
    print("ride created", ride_id, "fare", ride.get("estimated_fare"))

    # 3. Driver online + accept
    dtok = _login("jean.dupont@demo.sb", "Driver123!")
    requests.post(f"{BASE}/drivers/toggle-online", headers=_h(dtok))
    r = requests.post(f"{BASE}/rides/{ride_id}/accept", headers=_h(dtok))
    assert r.status_code == 200, f"accept -> {r.status_code} {r.text}"

    # 4. Driver view enrichment
    r = requests.get(f"{BASE}/rides/{ride_id}", headers=_h(dtok))
    assert r.status_code == 200, f"get ride driver -> {r.status_code} {r.text}"
    dv = r.json()
    assert dv.get("passenger_name"), f"missing passenger_name: {dv.get('passenger_name')}"
    assert dv.get("passenger_rating") is not None, "missing passenger_rating"
    assert "otp" not in dv and "start_otp" not in dv, "OTP must not leak to driver"
    print("enriched passenger:", dv.get("passenger_name"), dv.get("passenger_rating"))

    # 5. arriving
    r = requests.post(f"{BASE}/rides/{ride_id}/status", json={"status": "arriving"}, headers=_h(dtok))
    assert r.status_code == 200, f"arriving -> {r.status_code} {r.text}"

    # 6. start via OTP (passenger sees OTP)
    r = requests.get(f"{BASE}/rides/{ride_id}", headers=_h(ptok))
    otp = r.json().get("start_otp") or r.json().get("otp")
    assert otp, "passenger has no start_otp"
    r = requests.post(f"{BASE}/phase1/rides/{ride_id}/start-otp/verify", json={"otp": otp}, headers=_h(dtok))
    assert r.status_code == 200, f"otp verify -> {r.status_code} {r.text}"

    time.sleep(2)  # accrue some trip time

    # 7. complete with extra charges
    extra = {"toll": 3.5, "other": 1.0, "waiting": 0.5, "note": "Péage A1"}
    r = requests.post(f"{BASE}/rides/{ride_id}/status", json={"status": "completed", "extra_charges": extra}, headers=_h(dtok))
    assert r.status_code == 200, f"complete -> {r.status_code} {r.text}"

    r = requests.get(f"{BASE}/rides/{ride_id}", headers=_h(dtok))
    fb = r.json().get("fare_breakdown") or {}
    assert fb, "missing fare_breakdown"
    assert abs(fb.get("extra_total", 0) - 5.0) < 0.01, f"extra_total wrong: {fb.get('extra_total')}"
    assert "rounding" in fb and "total_net" in fb, f"missing rounding/total_net: {fb}"
    assert fb["total_net"] == round(fb["total_net"]), f"total_net not whole euro: {fb['total_net']}"
    print("fare_breakdown:", {k: fb.get(k) for k in ("subtotal", "extra_total", "rounding", "total_net")})

    # 8. driver rates passenger
    r = requests.post(f"{BASE}/rides/{ride_id}/rate-passenger", json={"rating": 5, "comment": "Bon passager"}, headers=_h(dtok))
    assert r.status_code == 200, f"rate-passenger -> {r.status_code} {r.text}"

    # 8b. non-driver cannot rate passenger
    r = requests.post(f"{BASE}/rides/{ride_id}/rate-passenger", json={"rating": 1}, headers=_h(ptok))
    assert r.status_code == 403, f"passenger should not rate passenger: {r.status_code}"

    print("ALL OK ✅")


if __name__ == "__main__":
    main()
