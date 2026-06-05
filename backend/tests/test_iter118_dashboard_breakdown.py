"""Iteration 118 — Dashboard analytics breakdown (Revenue by service + Top zones)."""
import os
import requests

BASE = os.environ.get("REACT_APP_BACKEND_URL", "https://sb-drive-vtc.preview.emergentagent.com")
API = f"{BASE}/api"


def _admin_session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": "admin@superapp.com", "password": "SuperAdmin123!"}, timeout=30)
    assert r.status_code == 200, r.text
    return s


def test_breakdown_structure():
    s = _admin_session()
    r = s.get(f"{API}/admin/analytics/breakdown", timeout=30)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "revenue_by_service" in data
    assert "top_zones" in data
    assert "total_revenue" in data

    services = {x["service"] for x in data["revenue_by_service"]}
    assert {"Taxi / VTC", "Colis", "Boutiques", "Runner / Genie"}.issubset(services)
    for x in data["revenue_by_service"]:
        assert "revenue" in x and "count" in x and "color" in x
        assert isinstance(x["revenue"], (int, float))

    # total_revenue equals sum of service revenues
    total = round(sum(x["revenue"] for x in data["revenue_by_service"]), 2)
    assert abs(total - data["total_revenue"]) < 0.01


def test_top_zones_clean_and_sorted():
    s = _admin_session()
    data = s.get(f"{API}/admin/analytics/breakdown", timeout=30).json()
    zones = data["top_zones"]
    assert len(zones) <= 8
    # sorted by rides desc
    rides = [z["rides"] for z in zones]
    assert rides == sorted(rides, reverse=True)
    # no test/junk leakage
    for z in zones:
        low = z["city"].lower()
        assert "test" not in low
        assert "position" not in low
        assert len(z["city"]) >= 3
        assert "rides" in z and "revenue" in z


def test_breakdown_requires_admin():
    r = requests.get(f"{API}/admin/analytics/breakdown", timeout=30)
    assert r.status_code in (401, 403)
