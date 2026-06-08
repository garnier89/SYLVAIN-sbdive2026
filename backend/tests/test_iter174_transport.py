"""Iter174 — Integration tests for /api/transport (public transit, MOCK data).

Covers:
- Public /transport/nearby geo match (within radius) returns stops + lines + departures.
- Fallback flag when position is far from any seeded network (Iowa).
- /transport/nearby with mins returns realistic ETAs (sorted, eta_min >= 0).
- /transport/stops/{id}/departures returns the board for one stop.
- Admin auth guards (401 unauth) on admin stops/lines endpoints.
- Admin stop CRUD (create/update/delete) + line CRUD with cookie auth.
"""
import os
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://gojek-clone-41.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = os.environ.get("TEST_ADMIN_EMAIL", "admin@superapp.com")
ADMIN_PASSWORD = os.environ.get("TEST_ADMIN_PASSWORD", "SuperAdmin123!")

# Pointe-à-Pitre (Place de la Victoire) — a seeded network center.
PAP = {"lat": 16.2412, "lng": -61.5340}


def _admin_session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=30)
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    return s


# ── public ────────────────────────────────────────────────────────────────────
def test_nearby_geo_match():
    r = requests.get(f"{BASE_URL}/api/transport/nearby", params={**PAP, "mins": 480}, timeout=20)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["mocked"] is True
    assert data["fallback"] is False
    assert len(data["stops"]) >= 1
    s0 = data["stops"][0]
    assert s0["zone"] == "Pointe-à-Pitre"
    assert s0["distance_m"] == 0  # Place de la Victoire is the exact center
    assert len(s0["lines"]) >= 1
    line0 = s0["lines"][0]
    assert "fare" in line0 and line0["fare"] > 0
    assert "ride_min" in line0
    # at least one line of a non-terminus stop exposes terminus coords for VTC compare
    assert any(l.get("dest_lat") is not None for l in s0["lines"])
    deps = line0["departures"]
    assert len(deps) >= 1
    assert all(d["eta_min"] >= 0 for d in deps)
    # ETAs must be non-decreasing within a line
    etas = [d["eta_min"] for d in deps]
    assert etas == sorted(etas)


def test_nearby_fallback_when_far():
    # Iowa — far from any seeded network → fallback to nearest zone, never empty.
    r = requests.get(f"{BASE_URL}/api/transport/nearby", params={"lat": 41.6, "lng": -93.6, "mins": 600}, timeout=20)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["fallback"] is True
    assert len(data["stops"]) >= 1


def test_stop_departures_board():
    # Resolve a real stop id from nearby, then fetch its board.
    r = requests.get(f"{BASE_URL}/api/transport/nearby", params={**PAP, "mins": 480}, timeout=20)
    stop_id = r.json()["stops"][0]["id"]
    r2 = requests.get(f"{BASE_URL}/api/transport/stops/{stop_id}/departures", params={"mins": 480}, timeout=20)
    assert r2.status_code == 200, r2.text
    board = r2.json()
    assert board["id"] == stop_id
    assert "lines" in board


def test_stop_departures_404():
    r = requests.get(f"{BASE_URL}/api/transport/stops/does-not-exist/departures", timeout=15)
    assert r.status_code == 404


# ── journey planner ─────────────────────────────────────────────────────────────
def test_journey_direct():
    # Gare Routière Bergevin → Aéroport Pôle Caraïbes (same line L1, direct).
    r = requests.get(f"{BASE_URL}/api/transport/journey",
                     params={"from_lat": 16.2380, "from_lng": -61.5410, "to_lat": 16.2653, "to_lng": -61.5267}, timeout=20)
    assert r.status_code == 200, r.text
    plan = r.json()
    assert plan["found"] is True
    assert plan["transfers"] == 0
    rides = [l for l in plan["legs"] if l["type"] == "ride"]
    assert len(rides) == 1
    assert plan["total_min"] > 0 and plan["total_fare"] > 0


def test_journey_with_transfer():
    # Université des Antilles (L2 only) → CHU des Abymes (L1 only) requires a
    # transfer at Place de la Victoire (served by both lines).
    r = requests.get(f"{BASE_URL}/api/transport/journey",
                     params={"from_lat": 16.2230, "from_lng": -61.5100, "to_lat": 16.2614, "to_lng": -61.5180}, timeout=20)
    assert r.status_code == 200, r.text
    plan = r.json()
    assert plan["found"] is True
    assert plan["transfers"] >= 1
    rides = [l for l in plan["legs"] if l["type"] == "ride"]
    assert len(rides) >= 2
    # two tickets → fare is the sum of both legs
    assert plan["total_fare"] >= rides[0]["fare"] + rides[1]["fare"] - 0.001


# ── admin auth guards ───────────────────────────────────────────────────────────
def test_admin_stops_requires_auth():
    r = requests.get(f"{BASE_URL}/api/transport/admin/stops", timeout=15)
    assert r.status_code == 401


def test_admin_lines_requires_auth():
    r = requests.get(f"{BASE_URL}/api/transport/admin/lines", timeout=15)
    assert r.status_code == 401


# ── admin CRUD ──────────────────────────────────────────────────────────────────
def test_admin_stop_crud():
    s = _admin_session()
    # create
    r = s.post(f"{BASE_URL}/api/transport/admin/stops",
               json={"name": "Arrêt Test Pytest", "zone": "Dakar", "type": "bus", "lat": 14.7, "lng": -17.45}, timeout=20)
    assert r.status_code == 200, r.text
    sid = r.json()["id"]
    assert sid
    # update
    r2 = s.put(f"{BASE_URL}/api/transport/admin/stops/{sid}",
               json={"name": "Arrêt Test MAJ", "zone": "Dakar", "type": "brt", "lat": 14.7, "lng": -17.45}, timeout=20)
    assert r2.status_code == 200, r2.text
    assert r2.json()["name"] == "Arrêt Test MAJ"
    assert r2.json()["type"] == "brt"
    # delete
    r3 = s.delete(f"{BASE_URL}/api/transport/admin/stops/{sid}", timeout=20)
    assert r3.status_code == 200 and r3.json()["ok"] is True


def test_admin_line_crud():
    s = _admin_session()
    r = s.post(f"{BASE_URL}/api/transport/admin/lines",
               json={"code": "ZZ", "name": "Ligne Pytest", "mode": "bus", "headway_min": 10,
                     "first_time": "06:00", "last_time": "22:00", "stop_ids": []}, timeout=20)
    assert r.status_code == 200, r.text
    lid = r.json()["id"]
    assert r.json()["code"] == "ZZ"
    # update headway
    r2 = s.put(f"{BASE_URL}/api/transport/admin/lines/{lid}",
               json={"code": "ZZ", "name": "Ligne Pytest", "mode": "bus", "headway_min": 5,
                     "first_time": "06:00", "last_time": "22:00", "stop_ids": []}, timeout=20)
    assert r2.status_code == 200 and r2.json()["headway_min"] == 5
    r3 = s.delete(f"{BASE_URL}/api/transport/admin/lines/{lid}", timeout=20)
    assert r3.status_code == 200 and r3.json()["ok"] is True
