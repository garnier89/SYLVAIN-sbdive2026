"""
Web Push (PWA) — Phase 1 socle.

Covers the public VAPID key endpoint, admin notification-settings GET/PUT
persistence, and subscription validation. Uses the live API (same pattern as
the other integration tests in this folder).
"""
import requests

from _creds import ADMIN_EMAIL, ADMIN_PASSWORD


def _admin_token(api_url):
    r = requests.post(f"{api_url}/api/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
    r.raise_for_status()
    d = r.json()
    return d.get("access_token") or d.get("token")


def test_vapid_public_key_is_public(api_url):
    r = requests.get(f"{api_url}/api/push/vapid-public-key", timeout=15)
    assert r.status_code == 200
    key = r.json().get("publicKey")
    assert isinstance(key, str) and len(key) > 80  # base64url P-256 server key


def test_subscribe_requires_auth(api_url):
    r = requests.post(f"{api_url}/api/push/subscribe", json={"endpoint": "x"}, timeout=15)
    assert r.status_code in (401, 403)


def test_admin_notification_settings_roundtrip(api_url):
    token = _admin_token(api_url)
    h = {"Authorization": f"Bearer {token}"}

    # Read defaults
    r = requests.get(f"{api_url}/api/admin/notifications/settings", headers=h, timeout=15)
    assert r.status_code == 200
    base = r.json()
    assert "arrival_distance_m" in base and "messages" in base

    # Update
    payload = {
        "arrival_distance_m": 175,
        "chaining_enabled": True,
        "chaining_time_min": 7,
        "chaining_distance_km": 2.5,
        "messages": {"driver_arrived": "Votre chauffeur est devant chez vous"},
    }
    r = requests.put(f"{api_url}/api/admin/notifications/settings", headers=h, json=payload, timeout=15)
    assert r.status_code == 200
    upd = r.json()
    assert upd["arrival_distance_m"] == 175
    assert upd["chaining_time_min"] == 7
    assert upd["messages"]["driver_arrived"] == "Votre chauffeur est devant chez vous"

    # Persisted
    r = requests.get(f"{api_url}/api/admin/notifications/settings", headers=h, timeout=15)
    assert r.json()["arrival_distance_m"] == 175

    # Reset to spec default
    requests.put(f"{api_url}/api/admin/notifications/settings", headers=h, json={
        "arrival_distance_m": 200, "chaining_enabled": True,
        "chaining_time_min": 5, "chaining_distance_km": 3, "messages": {},
    }, timeout=15)
