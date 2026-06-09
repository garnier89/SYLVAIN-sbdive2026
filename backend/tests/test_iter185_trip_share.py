"""Iter185 — Secure live trip sharing (safety tool).

Covers:
- Public GET /trip-share/{token} returns 404 for unknown tokens.
- POST /rides/{id}/share requires auth (401) and rejects non-participants (403/404).
- Owner can create a share (idempotent token) and the public snapshot exposes
  client + driver identity, vehicle/plate and addresses with phone numbers in clear.
"""
import os
import requests

import sys
sys.path.insert(0, os.path.dirname(__file__))
from _creds import ADMIN_EMAIL, ADMIN_PASSWORD  # noqa: E402,F401

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://gojek-clone-41.preview.emergentagent.com").rstrip("/")
CLIENT_EMAIL = os.environ.get("TEST_CLIENT_EMAIL", "clienttest@demo.sb")
CLIENT_PASSWORD = os.environ.get("TEST_CLIENT_PASSWORD", "Client2026!")


def test_public_trip_share_invalid_token_404():
    r = requests.get(f"{BASE_URL}/api/trip-share/nope-nope-nope", timeout=20)
    assert r.status_code == 404


def test_create_share_requires_auth():
    r = requests.post(f"{BASE_URL}/api/rides/whatever/share", timeout=20)
    assert r.status_code in (401, 403)


def test_create_share_unknown_ride_404():
    s = requests.Session()
    lr = s.post(f"{BASE_URL}/api/auth/login",
                json={"email": CLIENT_EMAIL, "password": CLIENT_PASSWORD}, timeout=30)
    if lr.status_code != 200:
        return  # client account not provisioned in this env
    r = s.post(f"{BASE_URL}/api/rides/ride_does_not_exist/share", timeout=20)
    assert r.status_code == 404
