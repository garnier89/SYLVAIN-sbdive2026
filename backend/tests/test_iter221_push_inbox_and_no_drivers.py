"""
Iteration 221 — Web Push notifications inbox + no-drivers guard.

Covers:
  • GET /api/push/vapid-public-key (public)
  • POST /api/push/subscribe — validation (400) and unauth (401/403)
  • Admin notification settings GET/PUT/persist + reset
  • GET /api/push/unread-count, GET /api/push/list, POST /api/push/read-all
  • POST /api/rides (instant) must NOT 409 no_drivers_available while
    approved drivers are online (~20 in seed). Other failures are tolerated.
"""
import time
import uuid
import requests

from _creds import ADMIN_EMAIL, ADMIN_PASSWORD


def _login(api_url, email, password):
    r = requests.post(f"{api_url}/api/auth/login",
                      json={"email": email, "password": password}, timeout=15)
    r.raise_for_status()
    d = r.json()
    return d.get("access_token") or d.get("token")


def _register_client(api_url):
    suffix = uuid.uuid4().hex[:8]
    email = f"TEST_iter221_{suffix}@example.com"
    payload = {
        "email": email,
        "password": "Client123!",
        "name": f"Test Iter221 {suffix}",
        "phone": f"+33600{int(time.time()) % 1000000:06d}",
    }
    r = requests.post(f"{api_url}/api/auth/register", json=payload, timeout=20)
    assert r.status_code in (200, 201), f"register {r.status_code}: {r.text[:200]}"
    d = r.json()
    token = d.get("access_token") or d.get("token")
    if not token:
        token = _login(api_url, email, "Client123!")
    return token, email


# -------------------- public VAPID --------------------

def test_vapid_public_key_public(api_url):
    r = requests.get(f"{api_url}/api/push/vapid-public-key", timeout=15)
    assert r.status_code == 200
    key = r.json().get("publicKey")
    assert isinstance(key, str) and len(key) > 40


# -------------------- subscribe validation --------------------

def test_subscribe_unauth_rejected(api_url):
    r = requests.post(f"{api_url}/api/push/subscribe", json={"endpoint": "x"}, timeout=15)
    assert r.status_code in (401, 403), r.text[:200]


def test_subscribe_invalid_body_rejected(api_url):
    token, _ = _register_client(api_url)
    h = {"Authorization": f"Bearer {token}"}
    r = requests.post(f"{api_url}/api/push/subscribe", headers=h, json={"foo": "bar"}, timeout=15)
    # Invalid (missing endpoint/keys) must be 400 (or 422 from pydantic)
    assert r.status_code in (400, 422), f"got {r.status_code}: {r.text[:200]}"


# -------------------- admin settings --------------------

def test_admin_settings_get_put_persist_reset(api_url):
    token = _login(api_url, ADMIN_EMAIL, ADMIN_PASSWORD)
    h = {"Authorization": f"Bearer {token}"}

    r = requests.get(f"{api_url}/api/admin/notifications/settings", headers=h, timeout=15)
    assert r.status_code == 200
    base = r.json()
    assert "arrival_distance_m" in base
    assert "messages" in base

    r = requests.put(
        f"{api_url}/api/admin/notifications/settings", headers=h,
        json={
            "arrival_distance_m": 175,
            "chaining_enabled": True,
            "chaining_time_min": 7,
            "chaining_distance_km": 2.5,
            "messages": {"driver_arrived": "Votre chauffeur est devant chez vous"},
        }, timeout=15)
    assert r.status_code == 200
    assert r.json()["arrival_distance_m"] == 175

    r = requests.get(f"{api_url}/api/admin/notifications/settings", headers=h, timeout=15)
    assert r.json()["arrival_distance_m"] == 175

    # Reset
    requests.put(f"{api_url}/api/admin/notifications/settings", headers=h, json={
        "arrival_distance_m": 200, "chaining_enabled": True,
        "chaining_time_min": 5, "chaining_distance_km": 3, "messages": {},
    }, timeout=15)


# -------------------- inbox --------------------

def test_inbox_unread_list_readall(api_url):
    token, _ = _register_client(api_url)
    h = {"Authorization": f"Bearer {token}"}

    r = requests.get(f"{api_url}/api/push/unread-count", headers=h, timeout=15)
    assert r.status_code == 200, r.text[:200]
    body = r.json()
    assert "count" in body
    assert isinstance(body["count"], int)

    r = requests.get(f"{api_url}/api/push/list", headers=h, timeout=15)
    assert r.status_code == 200, r.text[:200]
    payload = r.json()
    # accept list or {items: [...]} response shape
    items = payload if isinstance(payload, list) else payload.get("items", [])
    assert isinstance(items, list)

    r = requests.post(f"{api_url}/api/push/read-all", headers=h, timeout=15)
    assert r.status_code == 200, r.text[:200]
    body = r.json()
    assert "updated" in body
    assert isinstance(body["updated"], int)

    r = requests.get(f"{api_url}/api/push/unread-count", headers=h, timeout=15)
    assert r.status_code == 200
    assert r.json()["count"] == 0


# -------------------- no-drivers guard (positive: drivers online) --------------------

def test_instant_ride_not_blocked_by_no_drivers(api_url):
    token, _ = _register_client(api_url)
    h = {"Authorization": f"Bearer {token}"}

    # Paris coords; instant request (no scheduled_at).
    payload = {
        "ride_type": "instant",
        "pickup_address": "1 Rue de Rivoli, 75001 Paris",
        "pickup_location": {"lat": 48.8566, "lng": 2.3522},
        "destination_address": "Tour Eiffel, 75007 Paris",
        "destination_location": {"lat": 48.8584, "lng": 2.2945},
        "vehicle_type": "standard",
    }
    r = requests.post(f"{api_url}/api/rides", headers=h, json=payload, timeout=20)
    # Must NOT be a 409 no-drivers; success or other validation failure OK.
    if r.status_code == 409:
        body = {}
        try:
            body = r.json()
        except Exception:
            pass
        detail = str(body.get("detail") or body)
        assert "no_drivers_available" not in detail, (
            f"unexpected no-drivers guard hit while drivers online: {detail}"
        )
    # Either ride created OR another validation error (we accept anything non-409-nodrivers)
    assert r.status_code in (200, 201, 400, 401, 403, 404, 422, 409), (
        f"unexpected status {r.status_code}: {r.text[:200]}"
    )
