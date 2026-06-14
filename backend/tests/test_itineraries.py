"""Backend tests for /api/itineraries (Circuits) — Feature A."""
import os
import pytest
import requests

BASE = os.environ.get("REACT_APP_BACKEND_URL", "https://gojek-clone-41.preview.emergentagent.com").rstrip("/")
API = f"{BASE}/api"

EMAIL = "famtester@demo.sb"
PASSWORD = "FamTest123!"


@pytest.fixture(scope="module")
def auth_session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login/email", json={"email": EMAIL, "password": PASSWORD}, timeout=15)
    if r.status_code != 200:
        # try classic /auth/login
        r = s.post(f"{API}/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=15)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    return s


def test_existing_seed_public_token():
    """Pre-seeded circuit must be readable WITHOUT auth via share_token zOJll541Jkoq."""
    r = requests.get(f"{API}/itineraries/public/zOJll541Jkoq", timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("title") == "Découverte Fort-de-France"
    assert isinstance(data.get("places"), list) and len(data["places"]) >= 1
    assert "owner_name" in data


def test_public_invalid_token_returns_404():
    r = requests.get(f"{API}/itineraries/public/this_token_does_not_exist_xyz", timeout=15)
    assert r.status_code == 404


def test_list_itineraries_requires_auth():
    r = requests.get(f"{API}/itineraries", timeout=15)
    assert r.status_code in (401, 403)


def test_list_itineraries_authenticated(auth_session):
    r = auth_session.get(f"{API}/itineraries", timeout=15)
    assert r.status_code == 200
    items = r.json()
    assert isinstance(items, list)
    # famtester should have at least one circuit ("Découverte Fort-de-France")
    titles = [it.get("title") for it in items]
    assert "Découverte Fort-de-France" in titles, f"Expected seeded circuit missing. Got: {titles}"


def test_create_itinerary_missing_title(auth_session):
    r = auth_session.post(f"{API}/itineraries", json={"places": [{"name": "X"}]}, timeout=15)
    assert r.status_code == 400


def test_create_itinerary_no_places(auth_session):
    r = auth_session.post(f"{API}/itineraries", json={"title": "TEST_empty"}, timeout=15)
    assert r.status_code == 400


def test_create_list_delete_full_flow(auth_session):
    payload = {
        "title": "TEST_Circuit_API_QA",
        "city": "Fort-de-France",
        "places": [
            {"name": "Place de la Savane", "category": "park", "address": "Fort-de-France", "lat": 14.6, "lng": -61.07},
            {"name": "Cathédrale Saint-Louis", "category": "church", "address": "FDF", "lat": 14.605, "lng": -61.073},
        ],
    }
    cr = auth_session.post(f"{API}/itineraries", json=payload, timeout=15)
    assert cr.status_code == 200, cr.text
    created = cr.json()
    assert created["title"] == payload["title"]
    assert created["city"] == "Fort-de-France"
    assert len(created["places"]) == 2
    assert isinstance(created.get("share_token"), str) and len(created["share_token"]) >= 6
    assert created["id"].startswith("itin_")

    itin_id = created["id"]
    token = created["share_token"]

    # GET list — must include new circuit
    lr = auth_session.get(f"{API}/itineraries", timeout=15)
    assert lr.status_code == 200
    ids = [it["id"] for it in lr.json()]
    assert itin_id in ids

    # GET public via share_token (no auth)
    pr = requests.get(f"{API}/itineraries/public/{token}", timeout=15)
    assert pr.status_code == 200
    pdata = pr.json()
    assert pdata["title"] == payload["title"]
    assert len(pdata["places"]) == 2
    assert pdata["places"][0]["name"] == "Place de la Savane"

    # DELETE
    dr = auth_session.delete(f"{API}/itineraries/{itin_id}", timeout=15)
    assert dr.status_code == 200
    assert dr.json().get("id") == itin_id

    # GET again — should not be in list
    lr2 = auth_session.get(f"{API}/itineraries", timeout=15)
    assert itin_id not in [it["id"] for it in lr2.json()]

    # Public token should now 404
    pr2 = requests.get(f"{API}/itineraries/public/{token}", timeout=15)
    assert pr2.status_code == 404


def test_max_places_validation(auth_session):
    places = [{"name": f"P{i}"} for i in range(30)]
    r = auth_session.post(f"{API}/itineraries", json={"title": "TEST_max", "places": places}, timeout=15)
    assert r.status_code == 400
