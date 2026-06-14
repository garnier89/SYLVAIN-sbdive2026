"""Iteration 406 — Medical marketplace (pro_services vertical=medical).
Tests: config (label/accent/cats/svcs), providers seed, next-slots,
consultation booking (status confirmed + video_room + cashback flow),
infirmier booking (no video_room), SB Pay debit/refund on cancel.
"""
import os
import requests
import pytest

def _get_base():
    url = os.environ.get("REACT_APP_BACKEND_URL")
    if not url:
        try:
            with open("/app/frontend/.env") as f:
                for line in f:
                    if line.startswith("REACT_APP_BACKEND_URL="):
                        url = line.split("=", 1)[1].strip()
                        break
        except Exception:
            pass
    return (url or "").rstrip("/")


BASE_URL = _get_base()
API = f"{BASE_URL}/api"

PATIENT = ("famtester@demo.sb", "FamTest123!")


@pytest.fixture(scope="module")
def patient_session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": PATIENT[0], "password": PATIENT[1]}, timeout=15)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return s


# -- Public config --
def test_medical_config():
    r = requests.get(f"{API}/pro-services/medical/config", timeout=10)
    assert r.status_code == 200
    d = r.json()
    assert d["label"] == "SB Santé — Praticiens"
    assert d["accent"] == "teal"
    assert len(d["categories"]) == 12
    assert len(d["services"]) == 14
    cat_ids = {c["id"] for c in d["categories"]}
    assert {"generaliste", "cardiologie", "dermatologie", "infirmier"} <= cat_ids


def test_medical_providers_seed():
    r = requests.get(f"{API}/pro-services/medical/providers", timeout=10)
    assert r.status_code == 200
    providers = r.json()
    assert isinstance(providers, list)
    assert len(providers) >= 9, f"expected >=9 approved providers, got {len(providers)}"
    # All approved
    assert all(p.get("verification_status") == "approved" for p in providers)


def test_medical_next_slots():
    r = requests.get(f"{API}/pro-services/medical/providers", timeout=10)
    pid = r.json()[0]["id"]
    r2 = requests.get(f"{API}/pro-services/medical/providers/{pid}/next-slots", timeout=10)
    assert r2.status_code == 200
    slots = r2.json().get("slots", [])
    assert len(slots) == 3
    assert all("date" in s and "time" in s and "label" in s for s in slots)


# -- Bookings --
def _pick_provider(category):
    r = requests.get(f"{API}/pro-services/medical/providers", params={"category": category}, timeout=10)
    return r.json()[0]


def _wallet_balance(session):
    r = session.get(f"{API}/wallet/balance", timeout=10)
    if r.status_code == 200:
        return float(r.json().get("balance", 0))
    return None


def test_consultation_booking_generates_video_room(patient_session):
    prov = _pick_provider("generaliste")
    slots = requests.get(f"{API}/pro-services/medical/providers/{prov['id']}/next-slots", timeout=10).json()["slots"]
    slot = slots[0]
    payload = {
        "service_id": "m_generaliste", "at_home": False, "address": "",
        "provider_id": prov["id"], "scheduled_date": slot["date"],
        "scheduled_time": slot["time"], "payment_method": "cash", "urgent": False,
    }
    r = patient_session.post(f"{API}/pro-services/medical/bookings", json=payload, timeout=15)
    assert r.status_code == 200, r.text
    b = r.json()
    assert b["status"] == "confirmed"
    assert b["video_room"] and b["video_room"].startswith("sbconsult-")
    assert b["category"] == "generaliste"
    # Cleanup
    patient_session.post(f"{API}/pro-services/medical/bookings/{b['id']}/cancel", timeout=10)


def test_infirmier_booking_no_video_room(patient_session):
    prov = _pick_provider("infirmier")
    slots = requests.get(f"{API}/pro-services/medical/providers/{prov['id']}/next-slots", timeout=10).json()["slots"]
    slot = slots[0]
    payload = {
        "service_id": "m_inj", "at_home": True, "address": "1 rue test",
        "provider_id": prov["id"], "scheduled_date": slot["date"],
        "scheduled_time": slot["time"], "payment_method": "cash", "urgent": False,
    }
    r = patient_session.post(f"{API}/pro-services/medical/bookings", json=payload, timeout=15)
    assert r.status_code == 200, r.text
    b = r.json()
    assert b["status"] == "confirmed"
    assert b.get("video_room") in (None, "")
    assert b["category"] == "infirmier"
    patient_session.post(f"{API}/pro-services/medical/bookings/{b['id']}/cancel", timeout=10)


def test_sbpay_debit_and_refund_on_cancel(patient_session):
    before = _wallet_balance(patient_session)
    prov = _pick_provider("generaliste")
    slots = requests.get(f"{API}/pro-services/medical/providers/{prov['id']}/next-slots", timeout=10).json()["slots"]
    slot = slots[1] if len(slots) > 1 else slots[0]
    payload = {
        "service_id": "m_generaliste", "at_home": False, "address": "",
        "provider_id": prov["id"], "scheduled_date": slot["date"],
        "scheduled_time": slot["time"], "payment_method": "sbpay", "urgent": False,
    }
    r = patient_session.post(f"{API}/pro-services/medical/bookings", json=payload, timeout=15)
    if r.status_code == 400 and "insuffisant" in r.text.lower():
        pytest.skip("wallet too low to test SB Pay debit")
    assert r.status_code == 200, r.text
    b = r.json()
    total = b["total"]
    if before is not None and "balance" in b and b["balance"] is not None:
        assert round(before - total, 2) == round(b["balance"], 2)
    # Cancel -> refund
    r2 = patient_session.post(f"{API}/pro-services/medical/bookings/{b['id']}/cancel", timeout=10)
    assert r2.status_code == 200
    after = _wallet_balance(patient_session)
    if before is not None and after is not None:
        assert round(after, 2) == round(before, 2), f"refund mismatch: before={before} after={after}"


def test_my_bookings_endpoint(patient_session):
    r = patient_session.get(f"{API}/pro-services/medical/bookings", timeout=10)
    assert r.status_code == 200
    d = r.json()
    assert "upcoming" in d and "past" in d


# -- Non-regression beauty/trades --
def test_beauty_config_still_works():
    r = requests.get(f"{API}/pro-services/beauty/config", timeout=10)
    assert r.status_code == 200
    assert r.json()["accent"] == "pink"


def test_trades_config_still_works():
    r = requests.get(f"{API}/pro-services/trades/config", timeout=10)
    assert r.status_code == 200
    assert r.json()["accent"] == "amber"
