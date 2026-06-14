"""Iter 389 — Backend tests for consultation PDF report + history.

Covers:
- POST /api/video-consult/sessions/{id}/end returns {ok, email_sent:true}
- GET /api/video-consult/sessions/{id}/report.pdf streams a real PDF
- GET /api/video-consult/sessions/{id}/report.pdf 404 for non-owner
- GET /api/video-consult/sessions returns the user's sessions
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://gojek-clone-41.preview.emergentagent.com").rstrip("/")

FAM_EMAIL = "famtester@demo.sb"
FAM_PASSWORD = "FamTest123!"
FREE_EMAIL = "freeuser@demo.sb"
FREE_PASSWORD = "FreeUser123!"


def _login(session: requests.Session, email: str, password: str) -> bool:
    r = session.post(f"{BASE_URL}/api/auth/login",
                     json={"email": email, "password": password}, timeout=20)
    return r.status_code == 200


@pytest.fixture(scope="module")
def fam_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    if not _login(s, FAM_EMAIL, FAM_PASSWORD):
        pytest.skip("famtester login failed")
    return s


@pytest.fixture(scope="module")
def free_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    if not _login(s, FREE_EMAIL, FREE_PASSWORD):
        pytest.skip("freeuser login failed")
    return s


def _create_and_join(client: requests.Session, duration_min: int = 15, price_per_min: float = 2.50) -> str:
    body = {
        "provider_id": "vp_doc1",
        "provider_name": "Dr. Sophie Martin",
        "category": "doctor",
        "duration_min": duration_min,
        "total_price": round(price_per_min * duration_min, 2),
        "notes": "TEST_iter389 patient notes here.",
    }
    r = client.post(f"{BASE_URL}/api/video-consult/sessions", json=body, timeout=20)
    assert r.status_code == 200, r.text
    sid = r.json()["id"]
    j = client.post(f"{BASE_URL}/api/video-consult/sessions/{sid}/join", timeout=20)
    assert j.status_code == 200, j.text
    return sid


# ── End returns email_sent:true ─────────────────────────────────────────
def test_end_returns_email_sent_true(fam_client):
    sid = _create_and_join(fam_client)
    r = fam_client.post(f"{BASE_URL}/api/video-consult/sessions/{sid}/end", timeout=20)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d.get("ok") is True
    assert d.get("email_sent") is True, f"email_sent expected True, got {d}"


# ── PDF download returns a real PDF ────────────────────────────────────
def test_download_report_pdf(fam_client):
    sid = _create_and_join(fam_client)
    # End first (status -> completed) — optional, PDF should still be served
    end = fam_client.post(f"{BASE_URL}/api/video-consult/sessions/{sid}/end", timeout=20)
    assert end.status_code == 200
    r = fam_client.get(f"{BASE_URL}/api/video-consult/sessions/{sid}/report.pdf", timeout=20)
    assert r.status_code == 200, r.text
    assert r.headers.get("content-type", "").startswith("application/pdf"), r.headers
    cd = r.headers.get("content-disposition", "")
    assert "attachment" in cd.lower(), f"content-disposition: {cd}"
    assert ".pdf" in cd.lower(), f"content-disposition: {cd}"
    body = r.content
    assert body[:4] == b"%PDF", f"missing %PDF magic bytes, got {body[:8]!r}"
    assert len(body) > 500, f"PDF suspiciously small: {len(body)} bytes"


# ── 404 when the session belongs to someone else ───────────────────────
def test_download_report_404_for_other_user(fam_client, free_client):
    sid = _create_and_join(fam_client)
    # End the session (still owned by fam)
    fam_client.post(f"{BASE_URL}/api/video-consult/sessions/{sid}/end", timeout=20)
    # free user tries to download fam's PDF
    r = free_client.get(f"{BASE_URL}/api/video-consult/sessions/{sid}/report.pdf", timeout=15)
    assert r.status_code == 404, f"Expected 404, got {r.status_code} body={r.text}"


def test_download_report_404_for_unknown_id(fam_client):
    r = fam_client.get(f"{BASE_URL}/api/video-consult/sessions/nope_nonexistent_xxx/report.pdf", timeout=15)
    assert r.status_code == 404


# ── List sessions returns the user's sessions (history) ────────────────
def test_list_sessions_includes_completed(fam_client):
    sid = _create_and_join(fam_client)
    fam_client.post(f"{BASE_URL}/api/video-consult/sessions/{sid}/end", timeout=20)
    r = fam_client.get(f"{BASE_URL}/api/video-consult/sessions", timeout=15)
    assert r.status_code == 200, r.text
    d = r.json()
    # Response may be either list or dict with 'sessions' key
    sessions = d if isinstance(d, list) else d.get("sessions", [])
    assert isinstance(sessions, list)
    ids = [s.get("id") for s in sessions]
    assert sid in ids, f"freshly-ended session {sid} not present in list (ids={ids[:5]}...)"
    completed = [s for s in sessions if s.get("status") == "completed"]
    assert len(completed) >= 1, "expected at least one completed session in history"
    # Each completed session should have provider_name + duration + total_price
    s0 = completed[0]
    for k in ("provider_name", "duration_min", "total_price", "id"):
        assert k in s0, f"missing key {k} in session: {s0}"
