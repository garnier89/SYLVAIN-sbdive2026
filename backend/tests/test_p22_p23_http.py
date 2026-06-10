"""
P2.2 & P2.3 — HTTP-level smoke tests over the public ingress URL.

Validates:
- /api/orders/delivery-options exposes the `grouped` option with discount %.
- /api/orders/admin/grouping-config GET/PUT works (admin auth).
- /api/merchants/me/analytics returns real KPIs for the demo merchant.
- /api/merchants/me/ai-insights returns insight fields (Gemini or fallback).
"""
import os
import requests
import pytest

BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")

ADMIN = {"email": "admin@superapp.com", "password": "SuperAdmin123!"}
MERCHANT = {"email": "merchant@example.com", "password": "Merchant123!"}


def _login(creds):
    r = requests.post(f"{BASE}/api/auth/login", json=creds, timeout=15)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text[:200]}"
    body = r.json()
    return body.get("access_token") or body.get("token")


@pytest.fixture(scope="module")
def admin_token():
    return _login(ADMIN)


@pytest.fixture(scope="module")
def merchant_token():
    return _login(MERCHANT)


# ----- P2.2 -----
def test_delivery_options_includes_grouped(admin_token):
    h = {"Authorization": f"Bearer {admin_token}"}
    r = requests.get(f"{BASE}/api/orders/delivery-options", headers=h, timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    items = data if isinstance(data, list) else data.get("options") or data.get("delivery_options") or []
    assert items, f"no options returned: {data}"
    speeds = [o.get("speed") or o.get("id") or o.get("type") for o in items]
    assert "grouped" in speeds, f"`grouped` missing in {speeds}"
    grouped = next(o for o in items if (o.get("speed") or o.get("id") or o.get("type")) == "grouped")
    # group discount % surfaced
    pct_keys = [k for k in grouped.keys() if "discount" in k.lower() or "pct" in k.lower()]
    assert pct_keys, f"no discount field in grouped option: {grouped}"


def test_admin_grouping_config_roundtrip(admin_token):
    h = {"Authorization": f"Bearer {admin_token}"}
    r = requests.get(f"{BASE}/api/orders/admin/grouping-config", headers=h, timeout=15)
    assert r.status_code == 200, r.text
    cfg = r.json()
    assert "discount_pct" in cfg and "enabled" in cfg
    original = float(cfg["discount_pct"])

    # change & verify persistence
    new_val = 25.0 if original != 25.0 else 28.0
    r2 = requests.put(
        f"{BASE}/api/orders/admin/grouping-config",
        headers=h, json={"discount_pct": new_val}, timeout=15,
    )
    assert r2.status_code == 200, r2.text
    assert float(r2.json()["discount_pct"]) == new_val

    r3 = requests.get(f"{BASE}/api/orders/admin/grouping-config", headers=h, timeout=15)
    assert float(r3.json()["discount_pct"]) == new_val

    # restore
    requests.put(f"{BASE}/api/orders/admin/grouping-config", headers=h,
                 json={"discount_pct": original}, timeout=15)


# ----- P2.3 -----
def test_merchant_analytics_real_data(merchant_token):
    h = {"Authorization": f"Bearer {merchant_token}"}
    r = requests.get(f"{BASE}/api/merchants/me/analytics?period=week", headers=h, timeout=20)
    assert r.status_code == 200, r.text
    a = r.json()
    for k in ("revenue", "orders", "avg_order_value", "series", "top_products"):
        assert k in a, f"missing key {k} in analytics payload: {list(a.keys())}"
    assert isinstance(a["series"], list) and len(a["series"]) == 7
    assert isinstance(a["top_products"], list)


def test_merchant_analytics_year_has_12_months(merchant_token):
    h = {"Authorization": f"Bearer {merchant_token}"}
    r = requests.get(f"{BASE}/api/merchants/me/analytics?period=year", headers=h, timeout=20)
    assert r.status_code == 200, r.text
    assert len(r.json()["series"]) == 12


def test_merchant_ai_insights(merchant_token):
    h = {"Authorization": f"Bearer {merchant_token}"}
    r = requests.get(f"{BASE}/api/merchants/me/ai-insights", headers=h, timeout=45)
    assert r.status_code == 200, r.text
    ins = r.json()
    payload = ins.get("insights", ins)
    # Required insight fields (Gemini or rule fallback)
    for k in ("summary", "forecast", "popular", "promos", "stock_alerts"):
        assert k in payload, f"missing key {k} in ai-insights: {list(payload.keys())}"
