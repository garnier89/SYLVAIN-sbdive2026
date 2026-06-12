"""Iter308 — Anti-fraude payout chauffeur : rapport d'activité, solde retirable
(exclut transferts/cashback/remboursements), et blocage retrait inactif > 6 mois."""
import os
import requests
from datetime import datetime, timezone, timedelta

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://gojek-clone-41.preview.emergentagent.com").rstrip("/")
DRIVER_EMAIL, DRIVER_PWD = "jean.dupont@demo.sb", "Driver123!"


def _login(email, pwd):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": pwd}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def _h(t):
    return {"Authorization": f"Bearer {t}", "Content-Type": "application/json"}


REPORT_KEYS = {
    "trips", "gross", "commission", "net", "cash_received", "card_received",
    "cancellation_fees", "balance", "reserve", "pending_withdraw",
    "non_withdrawable", "withdrawable", "currency",
}


def test_report_shape_and_keys():
    t = _login(DRIVER_EMAIL, DRIVER_PWD)
    r = requests.get(f"{BASE_URL}/api/drivers/report", headers=_h(t), timeout=20)
    assert r.status_code == 200, r.text
    d = r.json()
    assert REPORT_KEYS.issubset(set(d.keys())), d.keys()
    # net = gross - commission (within rounding)
    assert abs(d["net"] - (d["gross"] - d["commission"])) < 0.05


def test_report_date_filter():
    t = _login(DRIVER_EMAIL, DRIVER_PWD)
    # A 1-day window far in the past should yield zero trips.
    r = requests.get(f"{BASE_URL}/api/drivers/report?from=2000-01-01&to=2000-01-02", headers=_h(t), timeout=20)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["trips"] == 0
    assert d["gross"] == 0.0


def test_wallet_exposes_non_withdrawable():
    t = _login(DRIVER_EMAIL, DRIVER_PWD)
    r = requests.get(f"{BASE_URL}/api/wallet", headers=_h(t), timeout=15)
    assert r.status_code == 200, r.text
    w = r.json()
    assert "non_withdrawable" in w
    assert "withdrawable" in w
    # withdrawable never exceeds balance - reserve - pending - non_withdrawable
    expected = max(0.0, w["balance"] - w.get("reserve", 0) - w.get("pending_withdraw", 0) - w.get("non_withdrawable", 0))
    assert abs(w["withdrawable"] - round(expected, 2)) < 0.02


def test_report_exposes_export_gate():
    t = _login(DRIVER_EMAIL, DRIVER_PWD)
    r = requests.get(f"{BASE_URL}/api/drivers/report", headers=_h(t), timeout=20)
    assert r.status_code == 200, r.text
    d = r.json()
    assert "export_allowed" in d
    # A non Taxi/VTC (and non-authorized) driver must be blocked from export.
    if not d["export_allowed"]:
        ex = requests.get(f"{BASE_URL}/api/drivers/report/export?format=csv", headers=_h(t), timeout=20)
        assert ex.status_code == 403, ex.text

