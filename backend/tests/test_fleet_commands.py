"""Backend tests for SB Tracking — real command-and-control pipeline (fleet)."""
import os
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://gojek-clone-41.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"
EMAIL = "famtester@demo.sb"
PASSWORD = "FamTest123!"


def _session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=20)
    tok = r.json().get("access_token") or r.json().get("token")
    s.headers.update({"Authorization": f"Bearer {tok}", "Content-Type": "application/json"})
    return s


def _first_vehicle(s):
    s.post(f"{API}/fleet/seed-demo", timeout=20)
    return s.get(f"{API}/fleet/vehicles", timeout=20).json()["vehicles"][0]["id"]


def test_critical_command_requires_confirm():
    s = _session()
    vid = _first_vehicle(s)
    r = s.post(f"{API}/fleet/vehicles/{vid}/command", json={"command": "engine_cut"}, timeout=20)
    assert r.status_code == 409


def test_engine_cut_and_restore_lifecycle():
    s = _session()
    vid = _first_vehicle(s)
    cut = s.post(f"{API}/fleet/vehicles/{vid}/command", json={"command": "engine_cut", "confirm": True}, timeout=20)
    assert cut.status_code == 200, cut.text
    body = cut.json()
    assert body["command"]["status"] == "acked"
    assert body["engine_locked"] is True
    restore = s.post(f"{API}/fleet/vehicles/{vid}/command", json={"command": "engine_restore"}, timeout=20)
    assert restore.json()["engine_locked"] is False


def test_lock_unlock_state():
    s = _session()
    vid = _first_vehicle(s)
    assert s.post(f"{API}/fleet/vehicles/{vid}/command", json={"command": "lock"}, timeout=20).json()["locked"] is True
    assert s.post(f"{API}/fleet/vehicles/{vid}/command", json={"command": "unlock"}, timeout=20).json()["locked"] is False


def test_command_history():
    s = _session()
    vid = _first_vehicle(s)
    s.post(f"{API}/fleet/vehicles/{vid}/command", json={"command": "locate"}, timeout=20)
    r = s.get(f"{API}/fleet/vehicles/{vid}/commands", timeout=20)
    assert r.status_code == 200
    cmds = r.json()["commands"]
    assert len(cmds) >= 1
    assert all("status" in c and "label" in c for c in cmds)


def test_unknown_command_rejected():
    s = _session()
    vid = _first_vehicle(s)
    assert s.post(f"{API}/fleet/vehicles/{vid}/command", json={"command": "nuke"}, timeout=20).status_code == 400
