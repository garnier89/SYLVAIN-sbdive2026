"""Iter 88 — Saved & recent places (raccourcis Maison/Travail/récents)."""
import os
import requests

BASE = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001").rstrip("/")
API = f"{BASE}/api"
USER = {"email": os.environ.get("SEED_TEST_EMAIL", "test2@example.com"), "password": os.environ.get("SEED_TEST_PASSWORD", "TestPass123!")}


def _session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json=USER)
    assert r.status_code == 200, r.text
    return s


def test_saved_places_crud():
    s = _session()
    # set home + work
    assert s.put(f"{API}/places/saved/home", json={"address": "10 Rue Maison", "lat": 48.9, "lng": 2.3}).status_code == 200
    assert s.put(f"{API}/places/saved/work", json={"address": "5 Rue Travail", "lat": 48.8, "lng": 2.4}).status_code == 200
    d = s.get(f"{API}/places/saved").json()
    assert d["home"]["address"] == "10 Rue Maison"
    assert d["work"]["address"] == "5 Rue Travail"
    # invalid kind
    assert s.put(f"{API}/places/saved/garage", json={"address": "x"}).status_code == 400
    # missing address
    assert s.put(f"{API}/places/saved/home", json={}).status_code == 400
    # delete home
    assert s.delete(f"{API}/places/saved/home").status_code == 200
    assert s.get(f"{API}/places/saved").json()["home"] is None


def test_recent_places_dedupe_and_cap():
    s = _session()
    for i in range(10):
        s.post(f"{API}/places/recent", json={"address": f"Addr {i}", "lat": 48.0 + i / 100, "lng": 2.0})
    # duplicate should move to top, not add
    s.post(f"{API}/places/recent", json={"address": "Addr 0", "lat": 48.0, "lng": 2.0})
    recent = s.get(f"{API}/places/saved").json()["recent"]
    assert len(recent) <= 8
    assert recent[0]["address"] == "Addr 0"


def test_requires_auth():
    assert requests.get(f"{API}/places/saved").status_code in (401, 403)
