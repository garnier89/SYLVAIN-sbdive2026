"""Iter299 — Adresses enregistrées/récentes (/places) partagées livraisons + taxi."""
import os
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://gojek-clone-41.preview.emergentagent.com").rstrip("/")
USER_EMAIL = "paul.vendeur@example.com"
USER_PASSWORD = "Test1234!"


def _login():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": USER_EMAIL, "password": USER_PASSWORD}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def _h(t):
    return {"Authorization": f"Bearer {t}", "Content-Type": "application/json"}


def test_places_recent_and_saved_cycle():
    t = _login()
    # 1) enregistrer une adresse récente
    place = {"address": "99 Rue Test Pytest, 75001 Paris", "lat": 48.8606, "lng": 2.3376}
    r = requests.post(f"{BASE_URL}/api/places/recent", headers=_h(t), json=place, timeout=15)
    assert r.status_code == 200
    # 2) elle apparaît dans /saved.recent
    r = requests.get(f"{BASE_URL}/api/places/saved", headers=_h(t), timeout=15)
    assert r.status_code == 200
    data = r.json()
    assert any(p.get("address") == place["address"] for p in data.get("recent", []))
    # 3) enregistrer comme Maison + Travail
    for kind in ("home", "work"):
        r = requests.put(f"{BASE_URL}/api/places/saved/{kind}", headers=_h(t), json=place, timeout=15)
        assert r.status_code == 200
    r = requests.get(f"{BASE_URL}/api/places/saved", headers=_h(t), timeout=15)
    d = r.json()
    assert d.get("home", {}).get("address") == place["address"]
    assert d.get("work", {}).get("address") == place["address"]


def test_places_requires_auth():
    r = requests.get(f"{BASE_URL}/api/places/saved", timeout=15)
    assert r.status_code in (401, 403)
