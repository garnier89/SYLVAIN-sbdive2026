"""Tourisme — "Explorer une autre ville" : géocodage d'une ville + suppression
des partenaires curés (home-market) lors de l'exploration d'une autre ville.
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


def test_geocode_known_city():
    r = requests.get(f"{API}/nearby/geocode", params={"q": "Marseille"}, timeout=15)
    assert r.status_code == 200, r.text
    d = r.json()
    assert "lat" in d and "lng" in d and d["name"]
    assert 43.0 < d["lat"] < 43.6 and 5.0 < d["lng"] < 5.7  # Marseille bbox


def test_geocode_unknown_city_404():
    r = requests.get(f"{API}/nearby/geocode", params={"q": "zzzqqxnotacity999"}, timeout=15)
    assert r.status_code == 404


def test_geocode_requires_min_length():
    r = requests.get(f"{API}/nearby/geocode", params={"q": "a"}, timeout=15)
    assert r.status_code == 422  # min_length=2


def test_featured_suppressed_when_exploring():
    # Far city + featured=false → no home-market curated partner pollutes the list
    r = requests.get(f"{API}/nearby/live", params={
        "lat": 14.6036, "lng": -61.0667, "category": "Café", "radius_m": 10000, "featured": "false"}, timeout=20)
    assert r.status_code == 200
    items = r.json()["items"]
    assert all(not i.get("is_featured") for i in items)
