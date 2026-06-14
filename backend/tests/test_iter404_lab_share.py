"""Phase 3c bridge - Partage des résultats avec un médecin (POST /api/lab/orders/{id}/share)."""
import os
import requests
import uuid


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

PAT = ("famtester@demo.sb", "FamTest123!")
DOC = ("freeuser@demo.sb", "FreeUser123!")


def _login(email, password):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"login {email} failed: {r.status_code} {r.text}"
    return s


def _find_results_ready_order(s):
    r = s.get(f"{API}/lab/orders", timeout=15)
    assert r.status_code == 200
    data = r.json()
    # API split: returns dict with 'upcoming'/'past' or list
    pool = []
    if isinstance(data, dict):
        for k in ("upcoming", "past", "orders"):
            v = data.get(k) or []
            if isinstance(v, list):
                pool.extend(v)
    elif isinstance(data, list):
        pool = data
    for o in pool:
        if o.get("status") == "results_ready":
            return o
    return None


def test_share_unknown_email_returns_404():
    s = _login(*PAT)
    o = _find_results_ready_order(s)
    if not o:
        import pytest
        pytest.skip("No results_ready order for famtester to test share")
    r = s.post(f"{API}/lab/orders/{o['id']}/share",
               json={"practitioner_email": f"nobody_{uuid.uuid4().hex[:6]}@demo.sb"}, timeout=15)
    assert r.status_code == 404, r.text


def test_share_valid_practitioner_succeeds():
    s = _login(*PAT)
    o = _find_results_ready_order(s)
    if not o:
        import pytest
        pytest.skip("No results_ready order for famtester to test share")
    r = s.post(f"{API}/lab/orders/{o['id']}/share",
               json={"practitioner_email": DOC[0]}, timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("ok") is True
    assert "shared_with" in data and data["shared_with"]


def test_share_missing_email_returns_400():
    s = _login(*PAT)
    o = _find_results_ready_order(s)
    if not o:
        import pytest
        pytest.skip("No results_ready order")
    r = s.post(f"{API}/lab/orders/{o['id']}/share", json={"practitioner_email": ""}, timeout=15)
    assert r.status_code == 400
