"""Backend tests for SB Tracking — Security Center (P3 Lot 2)."""
import os
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://gojek-clone-41.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

EMAIL = "famtester@demo.sb"
PASSWORD = "FamTest123!"


def _session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=20)
    if r.status_code != 200:
        s.post(f"{API}/auth/register", json={"email": EMAIL, "password": PASSWORD, "name": "Fam Tester"}, timeout=20)
        r = s.post(f"{API}/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=20)
    tok = r.json().get("access_token") or r.json().get("token")
    s.headers.update({"Authorization": f"Bearer {tok}", "Content-Type": "application/json"})
    return s


def test_security_overview_structure():
    s = _session()
    # ensure there is some fleet data to score
    s.post(f"{API}/fleet/seed-demo", timeout=20)
    r = s.get(f"{API}/security/overview", timeout=20)
    assert r.status_code == 200, r.text
    body = r.json()
    for key in ("security_score", "counts", "events", "driving_scores"):
        assert key in body
    for key in ("critical", "warning", "info", "unread"):
        assert key in body["counts"]


def test_security_driving_scores_bounded():
    s = _session()
    s.post(f"{API}/fleet/seed-demo", timeout=20)
    body = s.get(f"{API}/security/overview", timeout=20).json()
    for sc in body["driving_scores"]:
        assert 20 <= sc["score"] <= 100
        assert sc["grade"] in ("A", "B", "C", "D")
    if body["driving_scores"]:
        assert body["security_score"] is not None


def test_security_events_have_severity():
    s = _session()
    body = s.get(f"{API}/security/overview", timeout=20).json()
    for e in body["events"]:
        assert e["severity"] in ("critical", "warning", "info")
        assert "source" in e and e["source"] in ("fleet", "family")


def test_security_requires_auth():
    r = requests.get(f"{API}/security/overview", timeout=20)
    assert r.status_code in (401, 403)
