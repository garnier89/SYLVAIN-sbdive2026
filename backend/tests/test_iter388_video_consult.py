"""Iter 388 — Backend tests for the Jitsi-based Video Consultation flow.
Covers: providers list, session create (no debit), join (debit + idempotent),
end (status completed + join-after-end 400), and insufficient balance case.
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


# ── Providers ────────────────────────────────────────────────────────────
def test_list_providers():
    r = requests.get(f"{BASE_URL}/api/video-consult/providers", timeout=15)
    assert r.status_code == 200
    data = r.json()
    assert "providers" in data and isinstance(data["providers"], list)
    assert len(data["providers"]) >= 5
    cats = {p["category"] for p in data["providers"]}
    assert {"doctor", "lawyer", "tutor"}.issubset(cats)


# ── Session lifecycle ────────────────────────────────────────────────────
def _create_session(client: requests.Session, duration_min: int = 15, price_per_min: float = 2.50):
    body = {
        "provider_id": "vp_doc1",
        "provider_name": "Dr. Sophie Martin",
        "category": "doctor",
        "duration_min": duration_min,
        "total_price": round(price_per_min * duration_min, 2),
        "notes": "TEST_iter388",
    }
    r = client.post(f"{BASE_URL}/api/video-consult/sessions", json=body, timeout=20)
    return r


def _wallet_balance(client: requests.Session) -> float:
    r = client.get(f"{BASE_URL}/api/wallet", timeout=15)
    if r.status_code != 200:
        return None
    d = r.json()
    return float(d.get("balance", d.get("wallet", {}).get("balance", 0)) or 0)


def test_create_session_no_debit(fam_client):
    bal_before = _wallet_balance(fam_client)
    r = _create_session(fam_client, 15, 2.50)
    assert r.status_code == 200, r.text
    s = r.json()
    assert s["status"] == "scheduled"
    assert s["payment_status"] == "pending"
    assert s["room_name"].startswith("sbconsult-")
    assert len(s["room_name"]) > len("sbconsult-") + 10
    assert s["total_price"] == 37.50
    # No debit at creation
    if bal_before is not None:
        bal_after = _wallet_balance(fam_client)
        assert abs(bal_after - bal_before) < 0.01, f"Wallet must NOT be debited at create. before={bal_before} after={bal_after}"


def test_join_debits_then_idempotent(fam_client):
    # Fresh session
    r = _create_session(fam_client, 15, 2.50)
    assert r.status_code == 200
    sid = r.json()["id"]
    total = r.json()["total_price"]

    bal_before = _wallet_balance(fam_client)
    # First join — debit
    r1 = fam_client.post(f"{BASE_URL}/api/video-consult/sessions/{sid}/join", timeout=20)
    assert r1.status_code == 200, r1.text
    d1 = r1.json()
    assert d1["room_name"].startswith("sbconsult-")
    assert d1.get("balance") is not None, "first join must return new balance"
    if bal_before is not None:
        bal_after = _wallet_balance(fam_client)
        net_debit = bal_before - bal_after
        # Net debit = total − cashback (~2%). Allow [total*0.95, total*1.01].
        assert 0 < net_debit <= total * 1.01, (
            f"Wallet must be debited (after cashback credit). before={bal_before} after={bal_after} net={net_debit} total={total}")
        assert net_debit >= total * 0.95, (
            f"Debit too small. net={net_debit} total={total} (cashback should be < 5%)")

    # Second join — idempotent, no new debit
    bal_mid = _wallet_balance(fam_client)
    r2 = fam_client.post(f"{BASE_URL}/api/video-consult/sessions/{sid}/join", timeout=20)
    assert r2.status_code == 200, r2.text
    d2 = r2.json()
    assert d2.get("balance") is None, f"2nd join must NOT re-debit; balance expected None got {d2.get('balance')}"
    if bal_mid is not None:
        bal_final = _wallet_balance(fam_client)
        assert abs(bal_final - bal_mid) < 0.01, "Second join must not change wallet"


def test_end_then_join_blocked(fam_client):
    r = _create_session(fam_client, 15, 2.50)
    assert r.status_code == 200
    sid = r.json()["id"]
    # Join first so it can be ended
    j = fam_client.post(f"{BASE_URL}/api/video-consult/sessions/{sid}/join", timeout=20)
    assert j.status_code == 200
    # End
    e = fam_client.post(f"{BASE_URL}/api/video-consult/sessions/{sid}/end", timeout=15)
    assert e.status_code == 200
    # Join after end → 400 with French message
    j2 = fam_client.post(f"{BASE_URL}/api/video-consult/sessions/{sid}/join", timeout=15)
    assert j2.status_code == 400
    detail = (j2.json() or {}).get("detail", "")
    assert "terminée" in detail.lower() or "termin" in detail.lower(), f"detail: {detail}"


def test_insufficient_balance(free_client):
    r = _create_session(free_client, 60, 4.00)  # 240€ — should bust most low balances
    assert r.status_code == 200, r.text
    sid = r.json()["id"]
    j = free_client.post(f"{BASE_URL}/api/video-consult/sessions/{sid}/join", timeout=20)
    if j.status_code == 200:
        pytest.skip("freeuser wallet had enough balance; cannot validate insufficient-balance path")
    assert j.status_code == 400
    detail = (j.json() or {}).get("detail", "")
    assert "insuffisant" in detail.lower() or "sb pay" in detail.lower(), f"detail: {detail}"
