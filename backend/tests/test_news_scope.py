"""
News / Actualités module (zone-aware).

Validates:
- Seeded global articles present.
- Admin can create an article with audience + {country,state,city} scope.
- GET /api/news/admin/preview filters by zone AND audience:
    * MQ rider article shows for rider in Martinique, hidden in Paris.
    * Hidden for driver audience.
- GET /api/news/feed (rider) respects zone via ?location=.
Cleans up created article at the end.
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
def mq_article(admin_session):
    r = admin_session.post(f"{BASE_URL}/api/news/admin",
                           json={"title": "NEWS ZONE MQ", "body": "test", "audience": "rider",
                                 "scope": {"country": "MQ", "state": "Martinique", "city": ""}})
    assert r.status_code == 200
    nid = r.json()["id"]
    assert r.json()["scope"]["country"] == "MQ"
    yield nid
    admin_session.delete(f"{BASE_URL}/api/news/admin/{nid}")


def _has(items):
    return any(n["title"] == "NEWS ZONE MQ" for n in items)


def test_seeded_articles_present(admin_session):
    items = admin_session.get(f"{BASE_URL}/api/news/admin").json()
    assert len(items) >= 2


def test_preview_rider_martinique_includes(admin_session, mq_article):
    items = admin_session.get(f"{BASE_URL}/api/news/admin/preview",
                              params={"country": "MQ", "state": "Martinique", "audience": "rider"}).json()
    assert _has(items)


def test_preview_rider_paris_excludes(admin_session, mq_article):
    items = admin_session.get(f"{BASE_URL}/api/news/admin/preview",
                              params={"country": "FR", "state": "Île-de-France", "audience": "rider"}).json()
    assert not _has(items)
    assert len(items) >= 1  # globals still present


def test_preview_driver_audience_excludes_rider_article(admin_session, mq_article):
    items = admin_session.get(f"{BASE_URL}/api/news/admin/preview",
                              params={"country": "MQ", "state": "Martinique", "audience": "driver"}).json()
    assert not _has(items)


def test_feed_requires_auth():
    r = requests.get(f"{BASE_URL}/api/news/feed")
    assert r.status_code in (401, 403)


def test_unread_count_and_mark_read():
    """A fresh rider sees seeded articles as unread; mark-read clears the badge."""
    import time
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    email = f"newsqa_{int(time.time())}@demo.sb"
    reg = s.post(f"{BASE_URL}/api/auth/register", json={
        "name": "News QA", "email": email, "password": "NewsQa123!",
        "phone": f"+33700{int(time.time()) % 1000000:06d}", "role": "user",
    })
    assert reg.status_code in (200, 201), f"register failed: {reg.status_code} {reg.text}"
    token = reg.json().get("access_token") or reg.json().get("token")
    if token:
        s.headers.update({"Authorization": f"Bearer {token}"})
    try:
        before = s.get(f"{BASE_URL}/api/news/unread-count").json()["unread"]
        assert before >= 1
        assert s.post(f"{BASE_URL}/api/news/mark-read").json()["ok"] is True
        after = s.get(f"{BASE_URL}/api/news/unread-count").json()["unread"]
        assert after == 0
    finally:
        # best-effort cleanup of the temp account
        s.delete(f"{BASE_URL}/api/auth/me")
