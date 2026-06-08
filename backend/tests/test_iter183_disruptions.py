"""Iter183 — Tests for transport disruptions / strikes (perturbations / grèves).

Covers:
- Admin CRUD (create/update/toggle/delete) with cookie auth + 401 guards.
- Public /transport/disruptions exposes active strikes first + has_strike flag.
- Inactive disruptions are hidden from the public active list.
- /transport/disruptions/history returns persisted items (active + resolved).
"""
import os
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://gojek-clone-41.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = os.environ.get("TEST_ADMIN_EMAIL", "admin@superapp.com")
ADMIN_PASSWORD = os.environ.get("TEST_ADMIN_PASSWORD", "SuperAdmin123!")


def _admin_session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=30)
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    return s


def test_admin_disruptions_auth_guard():
    r = requests.get(f"{BASE_URL}/api/transport/admin/disruptions", timeout=20)
    assert r.status_code in (401, 403)
    r = requests.post(f"{BASE_URL}/api/transport/admin/disruptions", json={"title": "x"}, timeout=20)
    assert r.status_code in (401, 403)


def test_disruption_lifecycle_and_public_exposure():
    s = _admin_session()
    # create a strike
    r = s.post(f"{BASE_URL}/api/transport/admin/disruptions",
               json={"type": "strike", "title": "Grève test iter183",
                     "message": "Bus à l'arrêt", "routes": "A, B"}, timeout=20)
    assert r.status_code == 200, r.text
    d = r.json()
    did = d["id"]
    assert d["type"] == "strike"
    assert d["active"] is True
    assert d["routes"] == ["A", "B"]  # comma string parsed into list
    assert d["severity"] == "high"

    try:
        # public active list: strike present, has_strike true, strikes first
        pub = requests.get(f"{BASE_URL}/api/transport/disruptions", timeout=20).json()
        assert pub["has_strike"] is True
        assert any(x["id"] == did for x in pub["disruptions"])
        assert pub["disruptions"][0]["type"] == "strike"

        # toggle inactive -> hidden from public
        r = s.put(f"{BASE_URL}/api/transport/admin/disruptions/{did}",
                  json={"type": "strike", "title": "Grève test iter183",
                        "message": "Bus à l'arrêt", "routes": ["A", "B"], "active": False}, timeout=20)
        assert r.status_code == 200 and r.json()["active"] is False
        pub = requests.get(f"{BASE_URL}/api/transport/disruptions", timeout=20).json()
        assert not any(x["id"] == did for x in pub["disruptions"])

        # still present in history
        hist = requests.get(f"{BASE_URL}/api/transport/disruptions/history", timeout=20).json()
        assert any(x["id"] == did for x in hist["items"])
    finally:
        r = s.delete(f"{BASE_URL}/api/transport/admin/disruptions/{did}", timeout=20)
        assert r.status_code == 200
        # removed from admin list
        adm = s.get(f"{BASE_URL}/api/transport/admin/disruptions", timeout=20).json()
        assert not any(x["id"] == did for x in adm["disruptions"])


def test_create_requires_title():
    s = _admin_session()
    r = s.post(f"{BASE_URL}/api/transport/admin/disruptions", json={"type": "delay", "title": "  "}, timeout=20)
    assert r.status_code == 400
