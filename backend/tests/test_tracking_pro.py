"""Backend tests for SB Tracking Pro (subscription + premium gating)."""
import os
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://gojek-clone-41.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


def _session(email, password, name="Tester"):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=20)
    if r.status_code != 200:
        s.post(f"{API}/auth/register", json={"email": email, "password": password, "name": name}, timeout=20)
        r = s.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=20)
    tok = r.json().get("access_token") or r.json().get("token")
    s.headers.update({"Authorization": f"Bearer {tok}", "Content-Type": "application/json"})
    return s


def _free():
    return _session("freegate@demo.sb", "FreeGate123!", "Free Gate")


def test_pro_status_lists_packages():
    s = _free()
    r = s.get(f"{API}/tracking-pro/status", timeout=20)
    assert r.status_code == 200
    body = r.json()
    assert "active" in body and isinstance(body.get("packages"), list)
    ids = {p["id"] for p in body["packages"]}
    assert {"pro_monthly", "pro_annual"} <= ids


def test_checkout_creates_stripe_session():
    s = _free()
    r = s.post(f"{API}/tracking-pro/checkout", json={"package_id": "pro_monthly", "origin_url": BASE_URL}, timeout=30)
    assert r.status_code == 200, r.text
    assert r.json()["url"].startswith("https://")
    assert r.json()["session_id"].startswith("cs_")


def test_checkout_invalid_package():
    s = _free()
    assert s.post(f"{API}/tracking-pro/checkout", json={"package_id": "free", "origin_url": BASE_URL}, timeout=20).status_code == 400


def test_free_user_is_gated_on_premium():
    s = _free()
    # security center
    assert s.get(f"{API}/security/overview", timeout=20).status_code == 402
    # fleet command
    s.post(f"{API}/fleet/seed-demo", timeout=20)
    vid = s.get(f"{API}/fleet/vehicles", timeout=20).json()["vehicles"][0]["id"]
    assert s.post(f"{API}/fleet/vehicles/{vid}/command", json={"command": "locate"}, timeout=20).status_code == 402
    # pdf reports
    assert s.get(f"{API}/fleet/report.pdf", timeout=20).status_code == 402
    assert s.get(f"{API}/employees/report.pdf", timeout=20).status_code == 402
    # supervisor invite
    assert s.post(f"{API}/employees", json={"name": "TEST_Sup", "member_role": "supervisor"}, timeout=20).status_code == 402


def test_pro_user_not_gated():
    s = _session("famtester@demo.sb", "FamTest123!")  # granted Pro via conftest
    assert s.get(f"{API}/security/overview", timeout=20).status_code == 200
    assert s.get(f"{API}/employees/report.pdf", timeout=20).status_code == 200
