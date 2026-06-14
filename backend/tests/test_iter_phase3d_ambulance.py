"""Phase 3d — SB Urgences (ambulance) — backend pytest.
Tests: emergency types, validation, instant dispatch e2e (create→live→complete),
cancel, history, ownership isolation.
"""
import os
import requests

def _read_env():
    try:
        with open('/app/frontend/.env') as f:
            for line in f:
                if line.startswith('REACT_APP_BACKEND_URL='):
                    return line.split('=', 1)[1].strip()
    except Exception:
        pass
    return ''


BASE = (os.environ.get('REACT_APP_BACKEND_URL') or _read_env()).rstrip('/')
API = f"{BASE}/api"

PAT = ("famtester@demo.sb", "FamTest123!")
OTHER = ("freeuser@demo.sb", "FreeUser123!")


def _login(email, password):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"login {email} failed: {r.status_code} {r.text}"
    return s


def test_emergency_types_public():
    r = requests.get(f"{API}/ambulance/emergency-types", timeout=15)
    assert r.status_code == 200
    d = r.json()
    assert len(d["emergency_types"]) == 8
    assert {n["number"] for n in d["emergency_numbers"]} == {"15", "112", "18"}


def test_create_requires_position():
    s = _login(*PAT)
    r = s.post(f"{API}/ambulance/requests", json={"emergency_type": "cardiac"}, timeout=15)
    assert r.status_code == 400


def test_create_invalid_type():
    s = _login(*PAT)
    r = s.post(f"{API}/ambulance/requests",
               json={"emergency_type": "nope", "pickup_lat": 48.85, "pickup_lng": 2.35}, timeout=15)
    assert r.status_code == 400


def test_full_lifecycle():
    s = _login(*PAT)
    r = s.post(f"{API}/ambulance/requests", json={
        "emergency_type": "cardiac", "pickup_lat": 48.8566, "pickup_lng": 2.3522,
        "pickup_address": "5 rue de Test", "patient_name": "Papa", "symptoms": "Douleur"}, timeout=15)
    assert r.status_code == 200, r.text
    req = r.json()
    rid = req["id"]
    # Instant dispatch: en_route immediately, crew + interpolated position present.
    assert req["status"] == "en_route"
    assert req["crew"]["name"]
    assert req["live"]["ambulance_position"] is not None
    assert req["live"]["eta_minutes"] >= 0

    # Live get
    r = s.get(f"{API}/ambulance/requests/{rid}", timeout=15)
    assert r.status_code == 200
    assert r.json()["live"]["status"] in ("en_route", "arrived")

    # History contains it
    r = s.get(f"{API}/ambulance/requests", timeout=15)
    assert any(o["id"] == rid for o in r.json())

    # Complete
    r = s.post(f"{API}/ambulance/requests/{rid}/complete", timeout=15)
    assert r.status_code == 200 and r.json()["ok"] is True
    # Idempotent guard
    r = s.post(f"{API}/ambulance/requests/{rid}/complete", timeout=15)
    assert r.status_code == 404


def test_cancel():
    s = _login(*PAT)
    r = s.post(f"{API}/ambulance/requests", json={
        "emergency_type": "accident", "pickup_lat": 48.85, "pickup_lng": 2.30}, timeout=15)
    rid = r.json()["id"]
    r = s.post(f"{API}/ambulance/requests/{rid}/cancel", timeout=15)
    assert r.status_code == 200
    r = s.get(f"{API}/ambulance/requests/{rid}", timeout=15)
    assert r.json()["status"] == "cancelled"


def test_ownership_isolation():
    s1 = _login(*PAT)
    r = s1.post(f"{API}/ambulance/requests", json={
        "emergency_type": "burn", "pickup_lat": 48.80, "pickup_lng": 2.40}, timeout=15)
    rid = r.json()["id"]
    s2 = _login(*OTHER)
    r = s2.get(f"{API}/ambulance/requests/{rid}", timeout=15)
    assert r.status_code == 404
