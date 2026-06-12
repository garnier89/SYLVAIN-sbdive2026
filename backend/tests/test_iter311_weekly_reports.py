"""Iter311 — Rapports hebdo étendus : section Commerçants dans le rapport global,
gate Taxi/VTC sur le relevé individuel (export_allowed), pipeline d'envoi (test mode)."""
import os
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://gojek-clone-41.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL, ADMIN_PWD = "admin@superapp.com", "SuperAdmin123!"


def _login(email, pwd):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": pwd}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def _h(t):
    return {"Authorization": f"Bearer {t}", "Content-Type": "application/json"}


def test_preview_has_merchants_and_driver_gate():
    t = _login(ADMIN_EMAIL, ADMIN_PWD)
    r = requests.get(f"{BASE_URL}/api/admin/weekly-reports/preview", headers=_h(t), timeout=30)
    assert r.status_code == 200, r.text
    d = r.json()
    for k in ("merchants", "active_merchants", "total_merchant_revenue", "drivers", "active_drivers"):
        assert k in d, f"missing {k}"
    # each merchant row well-formed
    for m in d["merchants"]:
        assert {"merchant_id", "name", "orders", "revenue", "commission", "net"}.issubset(m.keys())
    # each driver row carries the export gate flag
    for drv in d["drivers"]:
        assert "export_allowed" in drv and "taxi_sub" in drv


def test_config_exposes_restrict_flag():
    t = _login(ADMIN_EMAIL, ADMIN_PWD)
    r = requests.get(f"{BASE_URL}/api/admin/weekly-reports/config", headers=_h(t), timeout=15)
    assert r.status_code == 200, r.text
    assert "restrict_driver_email_to_authorized" in r.json()


def test_send_now_test_mode_pipeline():
    t = _login(ADMIN_EMAIL, ADMIN_PWD)
    r = requests.post(f"{BASE_URL}/api/admin/weekly-reports/send-now", headers=_h(t),
                      json={"test_email": "delivered@resend.dev"}, timeout=40)
    assert r.status_code == 200, r.text
    res = r.json()
    # global report must have gone out without failures
    assert res.get("failed", 0) == 0, res
    assert res.get("sent", 0) >= 1, res
