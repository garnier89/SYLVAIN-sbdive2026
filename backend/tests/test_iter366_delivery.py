"""Iter 366 — Audit des 12 services de livraison (hub /all-delivery)."""
import os
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # fallback to frontend .env file
    with open("/app/frontend/.env") as fh:
        for ln in fh:
            if ln.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = ln.split("=", 1)[1].strip().rstrip("/")

ADMIN = {"email": "admin@superapp.com", "password": "SuperAdmin123!"}
USER = {"email": "test2@example.com", "password": "TestPass123!"}

EXPECTED_KEYS = {
    "food", "grocery", "medicine", "flowers", "stationery", "wine",
    "water", "supermarket", "construction", "parcel", "genie", "runner",
}


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN, timeout=10)
    assert r.status_code == 200, r.text
    return r.json().get("token") or r.json().get("access_token")


@pytest.fixture(scope="module")
def user_token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json=USER, timeout=10)
    assert r.status_code == 200, r.text
    return r.json().get("token") or r.json().get("access_token")


# === Store categories — public ===
def test_store_categories_public_returns_12():
    r = requests.get(f"{BASE_URL}/api/store-categories", timeout=10)
    assert r.status_code == 200
    cats = r.json()
    keys = {c["key"] for c in cats}
    missing = EXPECTED_KEYS - keys
    assert not missing, f"Missing keys: {missing}"
    # all active by default
    assert all(c.get("active", True) for c in cats if c["key"] in EXPECTED_KEYS)


def test_store_categories_paths_and_age():
    r = requests.get(f"{BASE_URL}/api/store-categories", timeout=10)
    cats = {c["key"]: c for c in r.json()}
    # Paths
    assert cats["food"]["path"] == "/food"
    assert cats["grocery"]["path"] == "/food?type=grocery"
    assert cats["medicine"]["path"] == "/pharmacy"
    assert cats["flowers"]["path"] == "/food?type=florist"
    assert cats["wine"]["path"] == "/food?type=wine"
    assert cats["parcel"]["path"] == "/parcel"
    assert cats["genie"]["path"] == "/runner?mode=genie"
    assert cats["runner"]["path"] == "/runner"
    # Age restrictions: at least wine must be 18+, medicine per seed also 18+
    assert cats["wine"].get("age_restriction") == 18
    assert cats["medicine"].get("age_restriction") == 18


# === Merchants by store_type — used by FoodPage ===
@pytest.mark.parametrize("store_type", [
    "restaurant", "grocery", "florist", "stationery", "wine", "construction",
])
def test_merchants_by_store_type(store_type):
    r = requests.get(f"{BASE_URL}/api/merchants", params={"store_type": store_type}, timeout=10)
    assert r.status_code == 200, f"{store_type}: {r.text}"
    data = r.json()
    # Should be a list (may be empty for some types)
    assert isinstance(data, list), f"{store_type} not list: {type(data)}"
    # Track for later: count
    print(f"[{store_type}] {len(data)} merchants")


def test_merchants_pharmacy_endpoint():
    """Pharmacy may have its own endpoint."""
    # Try both: merchants?store_type=pharmacy and /api/pharmacy/partners
    r1 = requests.get(f"{BASE_URL}/api/merchants", params={"store_type": "pharmacy"}, timeout=10)
    r2 = requests.get(f"{BASE_URL}/api/pharmacy/partners", timeout=10)
    assert r1.status_code == 200 or r2.status_code == 200


# === Parcel estimate ===
def test_parcel_estimate(user_token):
    headers = {"Authorization": f"Bearer {user_token}"}
    payload = {
        "pickup_lat": 14.6037, "pickup_lng": -61.0594,
        "stops": [{"lat": 14.6100, "lng": -61.0800, "address": "Test stop"}],
        "vehicle_type": "moto",
    }
    r = requests.post(f"{BASE_URL}/api/parcels/estimate", json=payload, headers=headers, timeout=10)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "estimated_fare" in data
    assert data["estimated_fare"] > 0


# === Wallet balance for test2 (to know if recharge is needed) ===
def test_user_wallet_balance(user_token):
    headers = {"Authorization": f"Bearer {user_token}"}
    r = requests.get(f"{BASE_URL}/api/wallet", headers=headers, timeout=10)
    assert r.status_code == 200, r.text
    bal = r.json().get("balance", 0)
    print(f"[wallet] test2 balance = {bal}")


# === Admin: store categories CRUD gating ===
def test_admin_list_store_categories(admin_token):
    headers = {"Authorization": f"Bearer {admin_token}"}
    r = requests.get(f"{BASE_URL}/api/admin/store-categories", headers=headers, timeout=10)
    assert r.status_code == 200, r.text
    cats = r.json()
    assert len(cats) >= 12


def test_admin_store_categories_requires_admin(user_token):
    headers = {"Authorization": f"Bearer {user_token}"}
    r = requests.get(f"{BASE_URL}/api/admin/store-categories", headers=headers, timeout=10)
    assert r.status_code in (401, 403)


def test_admin_store_categories_anon_blocked():
    r = requests.get(f"{BASE_URL}/api/admin/store-categories", timeout=10)
    assert r.status_code in (401, 403)


def test_admin_toggle_store_category(admin_token):
    """Toggle a non-critical category and restore."""
    headers = {"Authorization": f"Bearer {admin_token}"}
    # Toggle: backend uses POST /{key}/toggle (no body)
    r = requests.post(
        f"{BASE_URL}/api/admin/store-categories/stationery/toggle",
        headers=headers,
        timeout=10,
    )
    assert r.status_code in (200, 204), r.text
    # Restore
    r2 = requests.post(
        f"{BASE_URL}/api/admin/store-categories/stationery/toggle",
        headers=headers,
        timeout=10,
    )
    assert r2.status_code in (200, 204)


# === Runner / Genie service_type via phase2 ===
def test_phase2_runner_service_types(user_token):
    """Runner & Genie should be registered as service types or callable via estimate."""
    headers = {"Authorization": f"Bearer {user_token}"}
    # Many apps use /api/services or /api/phase2/services — try a few
    candidates = ["/api/phase2/services", "/api/services", "/api/service-categories"]
    found = False
    for path in candidates:
        r = requests.get(f"{BASE_URL}{path}", headers=headers, timeout=10)
        if r.status_code == 200:
            data = r.json()
            txt = str(data).lower()
            if "runner" in txt or "genie" in txt:
                found = True
                break
    # informational only
    print(f"[runner/genie service catalog discoverable]: {found}")
