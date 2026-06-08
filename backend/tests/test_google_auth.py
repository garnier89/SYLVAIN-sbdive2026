"""Google (Emergent-managed) auth — role_hint wiring & error handling.

A full OAuth round-trip needs a real Emergent session, which we cannot mint in
CI; here we validate the endpoint contract: it accepts session_id + role_hint and
returns 401 (not 500/422) for an invalid session."""
import os

import requests

BASE = os.environ.get("REACT_APP_BACKEND_URL", "https://gojek-clone-41.preview.emergentagent.com")
API = f"{BASE}/api"


def test_missing_session_id_returns_400():
    r = requests.post(f"{API}/auth/google/session", json={"role_hint": "driver"}, timeout=30)
    assert r.status_code == 400, r.text


def test_invalid_session_returns_401_not_500():
    r = requests.post(f"{API}/auth/google/session", json={"session_id": "invalid_xyz", "role_hint": "driver"}, timeout=30)
    assert r.status_code == 401, r.text


def test_role_hint_optional_defaults_ok():
    # Without role_hint the endpoint must still reach the session check (401), not 422.
    r = requests.post(f"{API}/auth/google/session", json={"session_id": "invalid_xyz"}, timeout=30)
    assert r.status_code == 401, r.text
