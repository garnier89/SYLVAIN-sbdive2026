"""Iter355 — HTTP end-to-end tests for /api/admin/parking/* + /api/parking/spots."""
import os
import uuid

import pytest
import requests
from dotenv import load_dotenv

load_dotenv("/app/frontend/.env")
BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
ADMIN_EMAIL = "admin@superapp.com"
ADMIN_PASSWORD = "SuperAdmin123!"


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE}/api/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=20)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


def test_admin_parking_list_requires_auth():
    r = requests.get(f"{BASE}/api/admin/parking/spots", timeout=15)
    assert r.status_code in (401, 403), f"expected 401/403, got {r.status_code} {r.text}"


def test_admin_parking_list_authenticated(admin_headers):
    r = requests.get(f"{BASE}/api/admin/parking/spots", headers=admin_headers, timeout=20)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "spots" in data and "count" in data
    assert isinstance(data["spots"], list)
    assert data["count"] >= 4, f"expected >=4 seeded spots, got {data['count']}"
    # id format
    for s in data["spots"]:
        assert s["id"].startswith("park_")


def test_admin_parking_crud_full_roundtrip(admin_headers):
    name = f"TEST_QA_{uuid.uuid4().hex[:6]}"
    payload = {
        "name": name,
        "address": "1 rue de la QA, Paris",
        "lat": 48.8566,
        "lng": 2.3522,
        "price_per_hour": 2.5,
        "total_spots": 30,
        "available_spots": 30,
        "features": ["Couvert", "Sécurisé"],
    }
    # CREATE
    c = requests.post(f"{BASE}/api/admin/parking/spots", json=payload,
                      headers=admin_headers, timeout=20)
    assert c.status_code in (200, 201), c.text
    spot = c.json().get("spot") or c.json()
    pid = spot["id"]
    assert pid.startswith("park_")
    assert spot["name"] == name
    assert spot["total_spots"] == 30
    assert spot["features"] == ["Couvert", "Sécurisé"]
    assert spot.get("active", True) is True

    try:
        # appears in public list (active)
        pub = requests.get(f"{BASE}/api/parking/spots", timeout=15)
        assert pub.status_code == 200
        public_ids = [s["id"] for s in pub.json().get("spots", [])]
        assert pid in public_ids

        # UPDATE
        u = requests.put(f"{BASE}/api/admin/parking/spots/{pid}",
                        json={"price_per_hour": 4.0, "available_spots": 10},
                        headers=admin_headers, timeout=20)
        assert u.status_code == 200, u.text
        upd = u.json().get("spot") or u.json()
        assert float(upd["price_per_hour"]) == 4.0
        assert int(upd["available_spots"]) == 10

        # TOGGLE inactive
        t = requests.patch(f"{BASE}/api/admin/parking/spots/{pid}/toggle",
                          headers=admin_headers, timeout=20)
        assert t.status_code == 200, t.text
        toggled = t.json().get("spot") or t.json()
        assert toggled["active"] is False

        # not in public anymore
        pub2 = requests.get(f"{BASE}/api/parking/spots", timeout=15)
        assert pub2.status_code == 200
        public_ids2 = [s["id"] for s in pub2.json().get("spots", [])]
        assert pid not in public_ids2, "inactive spot must NOT appear in public list"

        # TOGGLE back active to confirm symmetry
        t2 = requests.patch(f"{BASE}/api/admin/parking/spots/{pid}/toggle",
                           headers=admin_headers, timeout=20)
        assert t2.status_code == 200
        assert (t2.json().get("spot") or t2.json())["active"] is True

    finally:
        # DELETE
        d = requests.delete(f"{BASE}/api/admin/parking/spots/{pid}",
                           headers=admin_headers, timeout=20)
        assert d.status_code in (200, 204), d.text

        # confirm removed from admin list
        r = requests.get(f"{BASE}/api/admin/parking/spots", headers=admin_headers, timeout=20)
        assert pid not in [s["id"] for s in r.json()["spots"]]


def test_public_parking_spots_open():
    r = requests.get(f"{BASE}/api/parking/spots", timeout=15)
    assert r.status_code == 200
    data = r.json()
    assert "spots" in data and isinstance(data["spots"], list)
    assert len(data["spots"]) >= 4
