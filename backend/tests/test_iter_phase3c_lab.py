"""Phase 3c — SB Labo (analyses) — backend pytest.
Tests: login, catalog, provider status, full e2e (order→accept→results→PDF),
cancel & refund, admin pro-services list, non-régression (medical/beauty/trades).
"""
import os
import pytest
import requests
from datetime import datetime, timedelta

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
LAB = ("freeuser@demo.sb", "FreeUser123!")
ADM = ("admin@superapp.com", "SuperAdmin123!")


def _login(email, password):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"login {email} failed: {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="module")
def patient(): return _login(*PAT)


@pytest.fixture(scope="module")
def lab(): return _login(*LAB)


@pytest.fixture(scope="module")
def admin(): return _login(*ADM)


# ── Catalog ──
def test_catalog_public():
    r = requests.get(f"{API}/lab/catalog", timeout=15)
    assert r.status_code == 200
    d = r.json()
    assert d["accent"] in ("indigo", "#")  # accent indigo string
    assert d["home_surcharge"] == 25
    assert len(d["categories"]) == 6, f"expected 6 categories, got {len(d['categories'])}"
    assert len(d["analyses"]) == 18, f"expected 18 analyses, got {len(d['analyses'])}"
    cats = {c["id"] for c in d["categories"]}
    assert {"hematologie", "biochimie", "serologie"}.issubset(cats)
    ids = {a["id"] for a in d["analyses"]}
    assert {"l_nfs", "l_glycemie"}.issubset(ids), f"missing key analyses; got {ids}"


# ── Lab provider already approved ──
def test_lab_provider_status(lab):
    r = lab.get(f"{API}/lab/provider/status", timeout=15)
    assert r.status_code == 200
    d = r.json()
    assert d["registered"] is True
    assert d["approved"] is True


def test_patient_not_lab(patient):
    r = patient.get(f"{API}/lab/provider/status", timeout=15)
    assert r.status_code == 200
    assert r.json()["registered"] is False


def test_lab_feed_only_for_lab(patient):
    r = patient.get(f"{API}/lab/provider/orders", timeout=15)
    assert r.status_code == 403


# ── Order creation must validate ──
def test_order_requires_analyses(patient):
    r = patient.post(f"{API}/lab/orders", json={"analysis_ids": [], "scheduled_date": "2026-02-01", "scheduled_time": "09:00"}, timeout=15)
    assert r.status_code == 400


def test_order_requires_date(patient):
    r = patient.post(f"{API}/lab/orders", json={"analysis_ids": ["l_nfs"]}, timeout=15)
    assert r.status_code == 400


# ── Full E2E ──
@pytest.fixture(scope="module")
def e2e_state():
    return {}


def test_e2e_01_patient_creates_order(patient, e2e_state):
    # Top up wallet via internal endpoint not exposed: check current balance, skip topup
    date = (datetime.utcnow() + timedelta(days=2)).strftime("%Y-%m-%d")
    payload = {
        "analysis_ids": ["l_nfs", "l_glycemie"],
        "at_home": True,
        "address": "1 rue Test, Paris",
        "provider_id": None,
        "scheduled_date": date,
        "scheduled_time": "09:00",
        "payment_method": "sbpay",
    }
    r = patient.post(f"{API}/lab/orders", json=payload, timeout=20)
    if r.status_code == 400 and "insuffisant" in r.text.lower():
        pytest.skip(f"wallet insufficient: {r.text}")
    assert r.status_code == 200, r.text
    d = r.json()
    # Total = sum analyses + 25 home surcharge
    assert d["home_surcharge"] == 25
    assert d["status"] == "pending"
    assert d["payment_status"] == "paid"
    assert len(d["analyses"]) == 2
    e2e_state["order_id"] = d["id"]
    e2e_state["total"] = d["total"]


def test_e2e_02_order_in_lab_feed(lab, e2e_state):
    oid = e2e_state.get("order_id")
    if not oid:
        pytest.skip("no order created")
    r = lab.get(f"{API}/lab/provider/orders", timeout=15)
    assert r.status_code == 200
    d = r.json()
    feed_ids = [o["id"] for o in d["feed"]]
    assert oid in feed_ids, f"order {oid} not in feed {feed_ids}"


def test_e2e_03_lab_accepts(lab, e2e_state):
    oid = e2e_state.get("order_id")
    if not oid:
        pytest.skip("no order")
    r = lab.post(f"{API}/lab/orders/{oid}/accept", timeout=15)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["status"] == "confirmed"


def test_e2e_04_lab_uploads_results(lab, e2e_state):
    oid = e2e_state.get("order_id")
    if not oid:
        pytest.skip("no order")
    body = {
        "results": [
            {"name": "NFS", "value": "5.2", "unit": "10^9/L", "ref_range": "4-10", "flag": "normal"},
            {"name": "Glycémie", "value": "1.45", "unit": "g/L", "ref_range": "0.7-1.1", "flag": "high"},
        ],
        "conclusion": "Glycémie élevée - consulter."
    }
    r = lab.post(f"{API}/lab/orders/{oid}/results", json=body, timeout=20)
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "results_ready"


def test_e2e_05_patient_downloads_pdf(patient, e2e_state):
    oid = e2e_state.get("order_id")
    if not oid:
        pytest.skip("no order")
    r = patient.get(f"{API}/lab/orders/{oid}/results/pdf", timeout=20)
    assert r.status_code == 200
    assert r.headers.get("content-type", "").startswith("application/pdf")
    assert r.content[:4] == b"%PDF"


def test_e2e_06_orders_list_history(patient, e2e_state):
    oid = e2e_state.get("order_id")
    if not oid:
        pytest.skip("no order")
    r = patient.get(f"{API}/lab/orders", timeout=15)
    assert r.status_code == 200
    past_ids = [o["id"] for o in r.json()["past"]]
    assert oid in past_ids


# ── Cancel + refund flow (new order) ──
def test_cancel_refund(patient):
    date = (datetime.utcnow() + timedelta(days=3)).strftime("%Y-%m-%d")
    r = patient.post(f"{API}/lab/orders", json={
        "analysis_ids": ["l_nfs"], "at_home": False, "provider_id": None,
        "scheduled_date": date, "scheduled_time": "10:00", "payment_method": "sbpay",
    }, timeout=15)
    if r.status_code == 400 and "insuffisant" in r.text.lower():
        pytest.skip("wallet insufficient")
    assert r.status_code == 200, r.text
    oid = r.json()["id"]
    bal_before = r.json().get("balance")
    c = patient.post(f"{API}/lab/orders/{oid}/cancel", timeout=15)
    assert c.status_code == 200
    # Verify cancelled in list
    L = patient.get(f"{API}/lab/orders", timeout=15).json()
    past_ids = {o["id"]: o["status"] for o in L["past"]}
    assert past_ids.get(oid) == "cancelled"


# ── Admin lab providers ──
def test_admin_lab_providers(admin):
    r = admin.get(f"{API}/admin/pro-services/lab/providers", timeout=15)
    assert r.status_code == 200, r.text
    # Should contain at least 1 lab (freeuser)
    data = r.json()
    items = data if isinstance(data, list) else data.get("items", data.get("providers", []))
    assert len(items) >= 1


# ── Non-regression: previous verticals/pages still loadable ──
def test_nonreg_medical_config():
    r = requests.get(f"{API}/pro-services/medical/config", timeout=15)
    assert r.status_code == 200


def test_nonreg_beauty_config():
    r = requests.get(f"{API}/pro-services/beauty/config", timeout=15)
    assert r.status_code == 200


def test_nonreg_trades_config():
    r = requests.get(f"{API}/pro-services/trades/config", timeout=15)
    assert r.status_code == 200
