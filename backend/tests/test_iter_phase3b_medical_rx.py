"""Phase 3b — e-prescriptions backend tests.

Validates:
- Login (famtester patient, freeuser approved practitioner, admin)
- Practitioner status endpoints
- POST /api/medical/prescriptions (403 if not approved, 201 if approved)
- GET /api/medical/prescriptions (patient inbox)
- GET /api/medical/prescriptions/issued (practitioner outbox)
- GET /api/medical/prescriptions/{id}/pdf returns application/pdf
- Admin pro-services medical list endpoint
"""
import os
import pytest
import requests

def _load_base_url():
    u = os.environ.get("REACT_APP_BACKEND_URL")
    if not u:
        try:
            with open("/app/frontend/.env") as f:
                for ln in f:
                    if ln.startswith("REACT_APP_BACKEND_URL="):
                        u = ln.split("=", 1)[1].strip()
                        break
        except Exception:
            pass
    assert u, "REACT_APP_BACKEND_URL missing"
    return u.rstrip("/")


BASE_URL = _load_base_url()

PATIENT = {"email": "famtester@demo.sb", "password": "FamTest123!"}
PRAC = {"email": "freeuser@demo.sb", "password": "FreeUser123!"}
ADMIN = {"email": "admin@superapp.com", "password": "SuperAdmin123!"}


def _login(creds):
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json=creds, timeout=20)
    assert r.status_code == 200, f"login {creds['email']} -> {r.status_code} {r.text[:200]}"
    return s


@pytest.fixture(scope="module")
def patient_sess():
    return _login(PATIENT)


@pytest.fixture(scope="module")
def prac_sess():
    return _login(PRAC)


@pytest.fixture(scope="module")
def admin_sess():
    return _login(ADMIN)


# ── Practitioner status ───────────────────────────────────────────
def test_patient_status_not_registered(patient_sess):
    r = patient_sess.get(f"{BASE_URL}/api/medical/practitioner/status", timeout=15)
    assert r.status_code == 200
    d = r.json()
    assert d.get("registered") is False
    assert d.get("approved") is False


def test_prac_status_approved(prac_sess):
    r = prac_sess.get(f"{BASE_URL}/api/medical/practitioner/status", timeout=15)
    assert r.status_code == 200
    d = r.json()
    assert d.get("registered") is True
    assert d.get("approved") is True


# ── Categories (12 specialties) ──────────────────────────────────
def test_medical_categories_count(prac_sess):
    r = prac_sess.get(f"{BASE_URL}/api/pro-services/medical/provider/me", timeout=15)
    assert r.status_code == 200
    d = r.json()
    cats = d.get("categories") or []
    ids = [c.get("id") for c in cats]
    assert len(cats) >= 12, f"expected >=12 specialties, got {len(cats)}: {ids}"
    for must in ("generaliste", "cardiologie", "infirmier"):
        assert must in ids, f"missing specialty {must}"


# ── Issue prescription: 403 unapproved patient ───────────────────
def test_unapproved_user_cannot_issue(patient_sess):
    payload = {
        "patient_email": PATIENT["email"],
        "diagnosis": "TEST_should_fail",
        "medications": [{"name": "Paracetamol", "dosage": "500mg", "duration": "3j"}],
    }
    r = patient_sess.post(f"{BASE_URL}/api/medical/prescriptions", json=payload, timeout=15)
    assert r.status_code == 403, f"expected 403 got {r.status_code} {r.text[:200]}"


# ── Full E2E: practitioner issues, patient receives, PDF download ─
@pytest.fixture(scope="module")
def issued_rx(prac_sess):
    payload = {
        "patient_email": PATIENT["email"],
        "diagnosis": "TEST_Angine Phase3b",
        "medications": [
            {"name": "Amoxicilline", "dosage": "1g", "duration": "7 jours"},
            {"name": "Doliprane", "dosage": "1000mg", "duration": "5 jours"},
        ],
        "notes": "Test e2e iter402",
    }
    r = prac_sess.post(f"{BASE_URL}/api/medical/prescriptions", json=payload, timeout=20)
    assert r.status_code == 200, f"issue failed {r.status_code} {r.text[:300]}"
    d = r.json()
    assert d.get("id", "").startswith("rx_")
    assert d.get("patient_name") is not None
    assert len(d.get("medications", [])) == 2
    assert d["medications"][0]["name"] == "Amoxicilline"
    return d


def test_practitioner_issued_list_contains(prac_sess, issued_rx):
    r = prac_sess.get(f"{BASE_URL}/api/medical/prescriptions/issued", timeout=15)
    assert r.status_code == 200
    docs = r.json()
    assert any(x.get("id") == issued_rx["id"] for x in docs), "issued rx not in practitioner outbox"


def test_patient_inbox_contains(patient_sess, issued_rx):
    r = patient_sess.get(f"{BASE_URL}/api/medical/prescriptions", timeout=15)
    assert r.status_code == 200
    docs = r.json()
    assert any(x.get("id") == issued_rx["id"] for x in docs), "rx not in patient inbox"


def test_pdf_download(patient_sess, issued_rx):
    r = patient_sess.get(f"{BASE_URL}/api/medical/prescriptions/{issued_rx['id']}/pdf", timeout=20)
    assert r.status_code == 200
    assert r.headers.get("content-type", "").startswith("application/pdf")
    assert len(r.content) > 500  # not empty
    assert r.content[:4] == b"%PDF", "not a PDF file"


# ── Admin pro-services medical ─────────────────────────────────
def test_admin_medical_list(admin_sess):
    r = admin_sess.get(f"{BASE_URL}/api/admin/pro-services/medical/providers", timeout=15)
    assert r.status_code == 200, r.text[:200]
    data = r.json()
    # accept either list or {items: [...]} envelope
    items = data if isinstance(data, list) else (data.get("items") or data.get("providers") or [])
    assert any(p.get("user_email") == PRAC["email"] or p.get("name") for p in items), "no providers listed"


# ── Non-regression: beauty + métiers verticals reachable ─────────
def test_beauty_vertical_reachable():
    r = requests.get(f"{BASE_URL}/api/pro-services/beauty/config", timeout=15)
    assert r.status_code == 200, r.text[:200]


def test_metiers_vertical_reachable():
    r = requests.get(f"{BASE_URL}/api/pro-services/trades/config", timeout=15)
    assert r.status_code == 200, r.text[:200]


def test_medical_vertical_config():
    r = requests.get(f"{BASE_URL}/api/pro-services/medical/config", timeout=15)
    assert r.status_code == 200, r.text[:200]
    d = r.json()
    cats = d.get("categories") or []
    assert len(cats) >= 12, f"expected >=12 medical specialties, got {len(cats)}"
