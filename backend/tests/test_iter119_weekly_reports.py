"""Iteration 119 — Weekly automated reports (config, preview, send-now, week bounds)."""
import os
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

import requests

BASE = os.environ.get("REACT_APP_BACKEND_URL", "https://gojek-clone-40.preview.emergentagent.com")
API = f"{BASE}/api"


def _admin():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": "admin@superapp.com", "password": "SuperAdmin123!"}, timeout=30)
    assert r.status_code == 200, r.text
    return s


def test_config_requires_admin():
    r = requests.get(f"{API}/admin/weekly-reports/config", timeout=30)
    assert r.status_code in (401, 403)


def test_config_get_and_update_persists():
    s = _admin()
    r = s.get(f"{API}/admin/weekly-reports/config", timeout=30)
    assert r.status_code == 200
    cfg = r.json()
    for k in ["enabled", "timezone", "commission_rate", "non_withdrawable_amount",
              "send_day", "send_hour", "admin_emails", "send_to_drivers"]:
        assert k in cfg
    # API key must be masked, never returned in clear if set
    assert "resend_api_key_set" in cfg

    upd = s.put(f"{API}/admin/weekly-reports/config", json={
        "commission_rate": 18.0, "non_withdrawable_amount": 30.0, "timezone": "Europe/Paris",
    }, timeout=30)
    assert upd.status_code == 200
    cfg2 = s.get(f"{API}/admin/weekly-reports/config", timeout=30).json()
    assert cfg2["commission_rate"] == 18.0
    assert cfg2["non_withdrawable_amount"] == 30.0
    assert cfg2["timezone"] == "Europe/Paris"
    # restore defaults
    s.put(f"{API}/admin/weekly-reports/config", json={
        "commission_rate": 15.0, "non_withdrawable_amount": 20.0, "timezone": "America/Martinique",
    }, timeout=30)


def test_preview_structure():
    s = _admin()
    r = s.get(f"{API}/admin/weekly-reports/preview", timeout=30)
    assert r.status_code == 200, r.text
    d = r.json()
    for k in ["week", "start", "end", "revenue_by_service", "total_revenue",
              "total_commission", "total_transfers", "active_drivers", "drivers"]:
        assert k in d
    assert isinstance(d["drivers"], list)
    # if drivers exist, validate the transfer/net invariants
    for row in d["drivers"]:
        assert row["net"] >= 0 or row["gross"] == 0
        assert row["transfer"] >= 0
        assert row["transfer"] <= max(0, row["amount_on_app"])


def test_send_now_without_key_is_graceful():
    s = _admin()
    r = s.post(f"{API}/admin/weekly-reports/send-now", json={"test_email": "qa@example.com"}, timeout=40)
    assert r.status_code == 200, r.text
    d = r.json()
    assert "sent" in d and "failed" in d and "week" in d


def test_previous_week_bounds_monday_to_sunday():
    from routes.weekly_reports import previous_week_bounds
    tz = "Europe/Paris"
    # Reference: Wednesday 2026-06-10
    ref = datetime(2026, 6, 10, 12, 0, tzinfo=timezone.utc)
    start_iso, end_iso, label = previous_week_bounds(tz, ref)
    start_local = datetime.fromisoformat(start_iso).astimezone(ZoneInfo(tz))
    end_local = datetime.fromisoformat(end_iso).astimezone(ZoneInfo(tz))
    assert start_local.weekday() == 0  # Monday
    assert start_local.hour == 0 and start_local.minute == 0
    assert end_local.weekday() == 6   # Sunday
    # previous full week before 2026-06-10 is 2026-06-01 .. 2026-06-07
    assert start_local.strftime("%Y-%m-%d") == "2026-06-01"
    assert end_local.strftime("%Y-%m-%d") == "2026-06-07"


def test_pdf_generation_valid():
    from routes.weekly_reports import _driver_pdf_bytes, _global_pdf_bytes
    row = {"name": "Test Driver", "completed": 3, "cancelled": 1, "refused": 0,
           "gross": 100.0, "cash": 40.0, "card": 60.0, "wallet": 0.0, "bonus": 0.0,
           "commission": 15.0, "net": 85.0, "amount_on_app": 45.0,
           "non_withdrawable": 20.0, "transfer": 25.0, "driver_id": "d1"}
    report = {"revenue_by_service": [{"service": "Taxi / VTC", "count": 3, "revenue": 100.0}],
              "total_revenue": 100.0, "total_commission": 15.0, "total_transfers": 25.0,
              "active_drivers": 1, "drivers": [row]}
    p1 = _driver_pdf_bytes(row, "01/06/2026 - 07/06/2026", "SB Drive VTC")
    p2 = _global_pdf_bytes(report, "01/06/2026 - 07/06/2026", "SB Drive VTC")
    assert p1[:5] == b"%PDF-" and len(p1) > 800
    assert p2[:5] == b"%PDF-" and len(p2) > 800


def test_history_endpoint():
    s = _admin()
    # trigger an archived (failed, no key) send in test mode
    s.post(f"{API}/admin/weekly-reports/send-now", json={"test_email": "qa@example.com"}, timeout=40)
    r = s.get(f"{API}/admin/weekly-reports/history?limit=10", timeout=30)
    assert r.status_code == 200, r.text
    hist = r.json()
    assert isinstance(hist, list) and len(hist) >= 1
    h = hist[0]
    for k in ["id", "week", "type", "recipient", "status", "created_at"]:
        assert k in h
    # snapshot must NOT leak in the list endpoint
    assert "snapshot" not in h


def test_history_requires_admin():
    r = requests.get(f"{API}/admin/weekly-reports/history", timeout=30)
    assert r.status_code in (401, 403)


def test_resend_unknown_id_404():
    s = _admin()
    r = s.post(f"{API}/admin/weekly-reports/resend/does-not-exist", timeout=30)
    assert r.status_code == 404
