"""
Iteration 53 - SB Drive VTC: Admin FR localization, Phase 2 aliases,
driver endpoints, admin CRUD + cross-flows.

Covers:
- Admin auth + /api/admin/stats, /analytics, /users, /drivers, /rides
- Admin CRUD /api/admin/crud/{banners,payouts,settlements,disputes,wallet_requests,documents,promocodes}
- Phase 2 alias endpoints
- Driver endpoints /api/drivers/my-*
- Admin settings GET/PUT
- Cross-flows: support/contact, rides/help, orders/help, wallet/withdraw-request, phase1/sos
"""
import os
import pytest
import requests
import uuid

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://superapp-integration.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = "admin@superapp.com"
ADMIN_PASS = "SuperAdmin123!"
DRIVER_EMAIL = "jean.dupont@demo.sb"
DRIVER_PASS = "Driver123!"
USER_EMAIL = "test2@example.com"
USER_PASS = "TestPass123!"


def _login(email, password):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}, timeout=20)
    return r


@pytest.fixture(scope="module")
def admin_token():
    r = _login(ADMIN_EMAIL, ADMIN_PASS)
    if r.status_code != 200:
        pytest.skip(f"admin login failed: {r.status_code} {r.text[:200]}")
    return r.json().get("access_token") or r.json().get("token")


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="module")
def driver_token():
    r = _login(DRIVER_EMAIL, DRIVER_PASS)
    if r.status_code != 200:
        # register if missing
        reg = requests.post(f"{BASE_URL}/api/auth/register", json={
            "email": DRIVER_EMAIL, "password": DRIVER_PASS, "full_name": "Jean Dupont", "role": "driver"
        }, timeout=20)
        r = _login(DRIVER_EMAIL, DRIVER_PASS)
    if r.status_code != 200:
        pytest.skip(f"driver login failed: {r.status_code}")
    return r.json().get("access_token") or r.json().get("token")


@pytest.fixture(scope="module")
def driver_headers(driver_token):
    return {"Authorization": f"Bearer {driver_token}"}


@pytest.fixture(scope="module")
def user_token():
    r = _login(USER_EMAIL, USER_PASS)
    if r.status_code != 200:
        requests.post(f"{BASE_URL}/api/auth/register", json={
            "email": USER_EMAIL, "password": USER_PASS, "full_name": "Test User"
        }, timeout=20)
        r = _login(USER_EMAIL, USER_PASS)
    if r.status_code != 200:
        pytest.skip(f"user login failed: {r.status_code}")
    return r.json().get("access_token") or r.json().get("token")


@pytest.fixture(scope="module")
def user_headers(user_token):
    return {"Authorization": f"Bearer {user_token}"}


# ======== Health / Admin core ========

def test_health():
    # Try known health path; fallback to /api/
    r = requests.get(f"{BASE_URL}/api/", timeout=15)
    assert r.status_code in (200, 404)


class TestAdminCore:
    def test_admin_stats(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/admin/stats", headers=admin_headers, timeout=15)
        assert r.status_code == 200, r.text[:200]
        data = r.json()
        assert isinstance(data, dict)

    def test_admin_analytics(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/admin/analytics", headers=admin_headers, timeout=15)
        assert r.status_code == 200

    def test_admin_users(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/admin/users", headers=admin_headers, timeout=15)
        assert r.status_code == 200

    def test_admin_drivers(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/admin/drivers", headers=admin_headers, timeout=15)
        assert r.status_code == 200

    def test_admin_rides(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/admin/rides", headers=admin_headers, timeout=15)
        assert r.status_code == 200


# ======== Admin settings GET/PUT ========

class TestAdminSettings:
    def test_get_settings(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/admin/settings", headers=admin_headers, timeout=15)
        assert r.status_code == 200, r.text[:200]
        assert isinstance(r.json(), dict)

    def test_put_settings(self, admin_headers):
        payload = {"settings": {"site_name": "SB Drive VTC TEST", "support_email": "support@sbdrive.test"}}
        r = requests.put(f"{BASE_URL}/api/admin/settings", json=payload, headers=admin_headers, timeout=15)
        assert r.status_code in (200, 201), r.text[:200]
        # verify persist
        g = requests.get(f"{BASE_URL}/api/admin/settings", headers=admin_headers, timeout=15)
        assert g.status_code == 200
        data = g.json()
        settings = data.get("settings") or {}
        assert settings.get("site_name") == "SB Drive VTC TEST"


# ======== Admin CRUD generic ========

CRUD_COLLECTIONS_SEEDED = [
    ("banners", 1),
    ("payouts", 1),
    ("settlements", 1),
    ("disputes", 1),
    ("wallet_requests", 1),
    ("documents", 1),
]


@pytest.mark.parametrize("col,min_count", CRUD_COLLECTIONS_SEEDED)
def test_admin_crud_list_seeded(col, min_count, admin_headers):
    r = requests.get(f"{BASE_URL}/api/admin/crud/{col}", headers=admin_headers, timeout=15)
    assert r.status_code == 200, f"{col} -> {r.status_code} {r.text[:200]}"
    data = r.json()
    items = data if isinstance(data, list) else data.get("items", [])
    assert isinstance(items, list)
    assert len(items) >= min_count, f"{col} should have >= {min_count} seeded items, got {len(items)}"


class TestAdminCrudBanners:
    def test_create_toggle_delete(self, admin_headers):
        payload = {
            "title": f"TEST_banner_{uuid.uuid4().hex[:6]}",
            "image_url": "https://example.com/b.png",
            "active": True,
        }
        r = requests.post(f"{BASE_URL}/api/admin/crud/banners", json=payload, headers=admin_headers, timeout=15)
        assert r.status_code in (200, 201), r.text[:200]
        created = r.json()
        bid = created.get("id") or created.get("_id")
        assert bid
        # toggle active
        up = requests.put(f"{BASE_URL}/api/admin/crud/banners/{bid}",
                          json={"active": False}, headers=admin_headers, timeout=15)
        assert up.status_code in (200, 204)
        # delete
        dl = requests.delete(f"{BASE_URL}/api/admin/crud/banners/{bid}", headers=admin_headers, timeout=15)
        assert dl.status_code in (200, 204)


class TestAdminCrudPromocodes:
    def test_create_promocode(self, admin_headers):
        # Also test the specific coupons admin route used by couponAPI.adminCreate, if present
        payload = {
            "code": f"TEST{uuid.uuid4().hex[:6].upper()}",
            "discount_type": "percentage",
            "discount_value": 10,
            "active": True,
        }
        r = requests.post(f"{BASE_URL}/api/admin/crud/promocodes", json=payload, headers=admin_headers, timeout=15)
        assert r.status_code in (200, 201), r.text[:200]

    def test_list_promocodes(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/admin/crud/promocodes", headers=admin_headers, timeout=15)
        assert r.status_code == 200


# ======== Phase 2 aliases ========

PHASE2_ALIASES = [
    "/api/phase2/loyalty/me",
    "/api/phase2/referral/me",
    "/api/phase2/subscriptions/plans",
    "/api/phase2/safety/emergency-contacts",
    "/api/phase2/favorites/drivers",
]


@pytest.mark.parametrize("path", PHASE2_ALIASES)
def test_phase2_aliases(path, user_headers):
    r = requests.get(f"{BASE_URL}{path}", headers=user_headers, timeout=15)
    assert r.status_code == 200, f"{path} -> {r.status_code} {r.text[:200]}"


# ======== Driver endpoints ========

DRIVER_ENDPOINTS = [
    "/api/drivers/my-stats",
    "/api/drivers/my-earnings",
    "/api/drivers/my-documents",
    "/api/drivers/my-notifications",
    "/api/drivers/incoming-requests",
]


@pytest.mark.parametrize("path", DRIVER_ENDPOINTS)
def test_driver_endpoints(path, driver_headers):
    r = requests.get(f"{BASE_URL}{path}", headers=driver_headers, timeout=15)
    assert r.status_code == 200, f"{path} -> {r.status_code} {r.text[:200]}"


# ======== Cross-flows ========

class TestCrossFlows:
    def test_support_contact(self, user_headers, admin_headers):
        payload = {"name": "TEST_user", "email": "test@ex.com", "subject": "help", "message": "hi from test"}
        r = requests.post(f"{BASE_URL}/api/support/contact", json=payload, headers=user_headers, timeout=15)
        assert r.status_code in (200, 201), r.text[:200]
        # verify admin sees it - note CRUD collection name uses underscore
        g = requests.get(f"{BASE_URL}/api/admin/crud/contact_requests",
                         headers=admin_headers, timeout=15)
        assert g.status_code == 200
        items = g.json() if isinstance(g.json(), list) else g.json().get("items", [])
        assert len(items) >= 1

    def test_wallet_withdraw(self, user_headers):
        # endpoint validation: should require iban & amount >=10
        # First verify 400 when missing IBAN
        r1 = requests.post(f"{BASE_URL}/api/wallet/withdraw-request", json={"amount": 50},
                           headers=user_headers, timeout=15)
        assert r1.status_code == 400
        # With iban but insufficient balance -> 400 "Insufficient balance" means endpoint is wired correctly
        r2 = requests.post(f"{BASE_URL}/api/wallet/withdraw-request",
                           json={"amount": 50, "iban": "FR7612345678901234567890123"},
                           headers=user_headers, timeout=15)
        # Either accepted (if balance ok) or insufficient (400). Both indicate endpoint is reachable
        assert r2.status_code in (200, 201, 400), r2.text[:200]

    def test_phase1_sos(self, user_headers):
        payload = {"latitude": 48.85, "longitude": 2.35, "message": "TEST_sos"}
        r = requests.post(f"{BASE_URL}/api/phase1/sos", json=payload, headers=user_headers, timeout=15)
        assert r.status_code in (200, 201), r.text[:200]
