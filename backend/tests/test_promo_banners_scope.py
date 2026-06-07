"""
Promo Banners geo-scoping (V3Cube banners visible per zone).

Validates:
- Admin can create a banner with a {country,state,city} scope.
- GET /api/promo-banners?location=... filters by resolved zone:
    * MQ-scoped banner shows for a Martinique location, hidden for Paris.
    * Global (no scope) banners always show.
    * No location param at all → all active banners returned (safe fallback).
Cleans up the created banner at the end.
"""
import os
import pytest
import requests
from pathlib import Path


def _load_backend_url():
    url = os.environ.get('REACT_APP_BACKEND_URL')
    if not url:
        env_path = Path('/app/frontend/.env')
        if env_path.exists():
            for line in env_path.read_text().splitlines():
                if line.startswith('REACT_APP_BACKEND_URL='):
                    url = line.split('=', 1)[1].strip()
                    break
    if not url:
        raise RuntimeError("REACT_APP_BACKEND_URL not configured")
    return url.rstrip('/')


BASE_URL = _load_backend_url()
from _creds import ADMIN_EMAIL, ADMIN_PASSWORD  # noqa: E402


@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE_URL}/api/auth/login",
               json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    token = r.json().get("access_token") or r.json().get("token")
    if token:
        s.headers.update({"Authorization": f"Bearer {token}"})
    return s


@pytest.fixture(scope="module")
def mq_banner(admin_session):
    r = admin_session.post(f"{BASE_URL}/api/promo-banners/admin",
                           json={"title": "ZONE TEST MQ", "scope": {"country": "MQ", "state": "Martinique", "city": ""}})
    assert r.status_code == 200
    bid = r.json()["id"]
    assert r.json()["scope"]["country"] == "MQ"
    yield bid
    admin_session.delete(f"{BASE_URL}/api/promo-banners/admin/{bid}")


def _has_mq(items):
    return any(b["title"] == "ZONE TEST MQ" for b in items)


def test_no_location_returns_all(mq_banner):
    items = requests.get(f"{BASE_URL}/api/promo-banners").json()["items"]
    assert _has_mq(items)


def test_martinique_location_includes_mq(mq_banner):
    items = requests.get(f"{BASE_URL}/api/promo-banners",
                         params={"location": "Fort-de-France, Martinique"}).json()["items"]
    assert _has_mq(items)


def test_paris_location_excludes_mq_keeps_global(mq_banner):
    items = requests.get(f"{BASE_URL}/api/promo-banners",
                         params={"location": "Paris, France"}).json()["items"]
    assert not _has_mq(items)
    # global (scope-less) banners still present
    assert len(items) >= 1
    assert all(not b.get("scope", {}).get("country") or b["scope"]["country"] == "FR" for b in items)


def test_explicit_country_param(mq_banner):
    # MQ banner is scoped to state=Martinique, so the request zone must include it.
    items = requests.get(f"{BASE_URL}/api/promo-banners",
                         params={"country": "MQ", "state": "Martinique"}).json()["items"]
    assert _has_mq(items)
    items_fr = requests.get(f"{BASE_URL}/api/promo-banners",
                            params={"country": "FR"}).json()["items"]
    assert not _has_mq(items_fr)
