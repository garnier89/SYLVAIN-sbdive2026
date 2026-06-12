"""Iter340 — Covoiturage : ADMIN config (GET/PUT/403) + driver reviews (note moyenne, badge Super)."""
import os
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/") or "https://gojek-clone-41.preview.emergentagent.com"


def _login(email, password):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"login {email} -> {r.status_code} {r.text[:200]}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def admin_token():
    return _login("admin@superapp.com", "SuperAdmin123!")


@pytest.fixture(scope="module")
def client_token():
    return _login("client@test.sb", "Client123!")


@pytest.fixture(scope="module")
def driver_token():
    return _login("driver@test.sb", "Driver123!")


# ── ADMIN CONFIG GET/PUT ────────────────────────────────────────────────
def test_admin_get_config(admin_token):
    r = requests.get(f"{BASE_URL}/api/carpool/admin/config",
                     headers={"Authorization": f"Bearer {admin_token}"}, timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    for k in ("enabled", "commission_percent", "max_seats_per_booking",
              "max_seats_per_ride", "auto_release_hours", "currency"):
        assert k in data, f"missing key {k} in {data}"


def test_admin_put_config_persists(admin_token):
    h = {"Authorization": f"Bearer {admin_token}"}
    # Set commission to 18 and verify persistence
    r = requests.put(f"{BASE_URL}/api/carpool/admin/config",
                     headers=h, json={"commission_percent": 18, "max_seats_per_booking": 4,
                                       "auto_release_hours": 24, "enabled": True}, timeout=15)
    assert r.status_code == 200, r.text
    assert float(r.json()["commission_percent"]) == 18.0
    # Re-GET
    r2 = requests.get(f"{BASE_URL}/api/carpool/admin/config", headers=h, timeout=15)
    assert r2.status_code == 200
    assert float(r2.json()["commission_percent"]) == 18.0
    assert int(r2.json()["auto_release_hours"]) == 24
    # Restore commission to 15
    r3 = requests.put(f"{BASE_URL}/api/carpool/admin/config",
                      headers=h, json={"commission_percent": 15, "auto_release_hours": 12}, timeout=15)
    assert r3.status_code == 200
    assert float(r3.json()["commission_percent"]) == 15.0


def test_admin_config_forbidden_for_non_admin(client_token):
    h = {"Authorization": f"Bearer {client_token}"}
    r = requests.get(f"{BASE_URL}/api/carpool/admin/config", headers=h, timeout=15)
    assert r.status_code in (401, 403), f"expected 401/403, got {r.status_code} {r.text[:200]}"
    r2 = requests.put(f"{BASE_URL}/api/carpool/admin/config", headers=h,
                      json={"commission_percent": 99}, timeout=15)
    assert r2.status_code in (401, 403)


# ── DRIVER REVIEWS (Super badge) ───────────────────────────────────────
def test_driver_reviews_super(client_token):
    # Find the seeded driver via search FR-de-France -> Sainte-Anne
    h = {"Authorization": f"Bearer {client_token}"}
    s = requests.get(f"{BASE_URL}/api/carpool/rides", headers=h, timeout=15)
    assert s.status_code == 200, s.text
    rides = s.json() if isinstance(s.json(), list) else s.json().get("rides", [])
    # Find ride with driver having rating
    target = None
    for r in rides:
        if (r.get("driver_rating") or 0) and r.get("driver_ratings_count", 0) >= 5:
            target = r
            break
    assert target is not None, f"No ride with super driver seeded. Rides sample: {rides[:3]}"
    assert target.get("driver_super") is True
    assert target["driver_rating"] >= 4.7

    rev = requests.get(f"{BASE_URL}/api/carpool/drivers/{target['driver_id']}/reviews",
                       headers=h, timeout=15)
    assert rev.status_code == 200, rev.text
    data = rev.json()
    assert data["rating"] is not None and data["rating"] >= 4.7
    assert data["count"] >= 5
    assert data["is_super_driver"] is True
    assert isinstance(data["reviews"], list) and len(data["reviews"]) >= 1
    # Validate one review's structure
    rv = data["reviews"][0]
    assert "stars" in rv and "rater_name" in rv


def test_driver_reviews_unknown_returns_empty():
    r = requests.get(f"{BASE_URL}/api/carpool/drivers/unknown_xxx/reviews", timeout=15)
    assert r.status_code == 200
    d = r.json()
    assert d["count"] == 0 and d["is_super_driver"] is False and d["reviews"] == []
