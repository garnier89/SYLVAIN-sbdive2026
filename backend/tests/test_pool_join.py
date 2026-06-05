"""Pool join (real in-app Taxi Pool matching) — POST /api/phase2/pool/join/{target}.

Two users create overlapping pending pool rides; user1 joins user2's ride and they
are grouped (shared pool_group_id, members=2, match flagged joined=True).
"""
import os
import uuid
import requests
import pytest
from _creds import RIDER_PASSWORD

BASE = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001").rstrip("/")
API = f"{BASE}/api"

RIDE_A = {
    "pickup_address": "FdF Centre", "pickup_lat": 14.6037, "pickup_lng": -61.0594,
    "dropoff_address": "Schoelcher", "dropoff_lat": 14.6113, "dropoff_lng": -61.0890,
    "vehicle_type": "sb", "pool_enabled": True, "payment_method": "cash", "seats_required": 1,
}
RIDE_B = {
    "pickup_address": "FdF Mairie", "pickup_lat": 14.6050, "pickup_lng": -61.0600,
    "dropoff_address": "Schoelcher Plage", "dropoff_lat": 14.6120, "dropoff_lng": -61.0900,
    "vehicle_type": "sb", "pool_enabled": True, "payment_method": "cash", "seats_required": 1,
}


def _new_user():
    s = requests.Session()
    suffix = uuid.uuid4().hex[:8]
    r = s.post(f"{API}/auth/register", json={
        "name": f"PoolJoin {suffix}", "email": f"pj_{suffix}@demo.sb",
        "password": "Pool123!", "phone": f"+336{suffix}", "role": "user",
    }, timeout=20)
    if r.status_code not in (200, 201):
        pytest.skip(f"cannot register user: {r.status_code} {r.text[:120]}")
    tok = r.json().get("access_token")
    if tok:
        s.headers.update({"Authorization": f"Bearer {tok}"})
    return s


def _create_ride(session, payload):
    r = session.post(f"{API}/rides", json=payload, timeout=20)
    if r.status_code not in (200, 201):
        pytest.skip(f"cannot create ride: {r.status_code} {r.text[:160]}")
    return r.json()["id"]


def test_pool_join_groups_two_riders():
    s1, s2 = _new_user(), _new_user()
    ra = _create_ride(s1, RIDE_A)
    rb = _create_ride(s2, RIDE_B)

    # Before join: match present, not joined, no group
    m0 = s1.get(f"{API}/phase2/pool/matches/{ra}", timeout=20).json()
    assert m0["group_members"] == 0
    assert any(m["ride_id"] == rb and m["joined"] is False for m in m0["matches"]), m0

    # Join
    j = s1.post(f"{API}/phase2/pool/join/{rb}", json={"ride_id": ra}, timeout=20)
    assert j.status_code == 200, j.text
    jd = j.json()
    assert jd["members"] == 2
    assert jd["pool_group_id"]

    # After join: same group, members=2, match flagged joined
    m1 = s1.get(f"{API}/phase2/pool/matches/{ra}", timeout=20).json()
    assert m1["group_members"] == 2
    assert m1["your_group_id"] == jd["pool_group_id"]
    assert any(m["ride_id"] == rb and m["joined"] is True for m in m1["matches"]), m1

    # cleanup own ride
    s1.post(f"{API}/rides/{ra}/cancel", json={"reason": "test"}, timeout=10)


def test_pool_join_errors():
    s1 = _new_user()
    ra = _create_ride(s1, RIDE_A)
    # join own ride -> 400
    assert s1.post(f"{API}/phase2/pool/join/{ra}", json={"ride_id": ra}, timeout=20).status_code == 400
    # join nonexistent -> 404
    assert s1.post(f"{API}/phase2/pool/join/ride_zzz", json={"ride_id": ra}, timeout=20).status_code == 404
    # missing ride_id -> 400
    assert s1.post(f"{API}/phase2/pool/join/ride_zzz", json={}, timeout=20).status_code == 400
    s1.post(f"{API}/rides/{ra}/cancel", json={"reason": "test"}, timeout=10)
