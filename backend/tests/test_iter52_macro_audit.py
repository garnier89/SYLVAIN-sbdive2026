"""
Iteration 52 - Macro Audit of SB Drive VTC platform.
Enumerates reachability + minimal shape of key admin / client / driver / phase2 endpoints.
Goal: identify dead/missing APIs that block real-user flows.
"""
import os
import pytest
import requests

BASE = os.environ.get("REACT_APP_BACKEND_URL", "https://taxi-marketplace-3.preview.emergentagent.com").rstrip("/")
ADMIN = {"email": "admin@superapp.com", "password": "SuperAdmin123!"}
DRIVER = {"email": "testdriver@example.com", "password": "Driver123!"}


@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    r = s.post(f"{BASE}/api/auth/login", json=ADMIN, timeout=20)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text[:200]}"
    return s


@pytest.fixture(scope="module")
def driver_session():
    s = requests.Session()
    r = s.post(f"{BASE}/api/auth/login", json=DRIVER, timeout=20)
    if r.status_code != 200:
        pytest.skip(f"driver login failed: {r.status_code}")
    return s


# --- admin endpoints that back sidebar pages ---
ADMIN_GETS = [
    "/api/admin/stats",
    "/api/admin/analytics",
    "/api/admin/users",
    "/api/admin/drivers",
    "/api/admin/rides",
    "/api/admin/orders",
    "/api/admin/merchants",
    "/api/admin/revenue",
    "/api/admin/promocodes",
    "/api/admin/vehicle-types",
    "/api/admin/banners",
    "/api/admin/gift-cards",
    "/api/admin/referral-settings",
    "/api/admin/stores",
    "/api/admin/payouts",
    "/api/admin/settlements",
    "/api/admin/disputes",
    "/api/admin/wallet-requests",
    "/api/admin/sos-requests",
    "/api/admin/contact-requests",
    "/api/admin/withdraw-requests",
    "/api/admin/order-help-requests",
    "/api/admin/trip-help-requests",
    "/api/admin/push-notifications",
    "/api/admin/email-templates",
    "/api/admin/sms-templates",
    "/api/admin/cancel-reasons",
    "/api/admin/master-services",
    "/api/admin/vehicle-makes",
    "/api/admin/vehicle-models",
    "/api/admin/geo-fence",
    "/api/admin/rewards/config",
    "/api/admin/priority-drivers",
    "/api/admin/top-drivers-config",
    "/api/admin/db-backup",
    "/api/admin/reports/negotiation-gap",
    "/api/admin/service-config/genie",
    "/api/admin/service-config/runner",
    "/api/admin/service-config/ondemand",
    "/api/admin/service-config/video",
    "/api/admin/service-config/bids",
    "/api/admin/service-config/marketplace",
    "/api/admin/service-config/tracking",
    "/api/admin/crud/groups",
    "/api/admin/crud/hotels",
    "/api/admin/crud/companies",
    "/api/admin/crud/organizations",
    "/api/admin/crud/pending_requests",
    "/api/admin/crud/vehicle_makes",
    "/api/admin/crud/vehicle_models",
    "/api/admin/crud/master_services",
    "/api/admin/crud/cancel_reasons",
]


@pytest.mark.parametrize("path", ADMIN_GETS)
def test_admin_endpoint_reachable(admin_session, path):
    r = admin_session.get(f"{BASE}{path}", timeout=20)
    assert r.status_code != 404, f"MISSING route: {path}"
    assert r.status_code < 500, f"SERVER ERROR {r.status_code} on {path}: {r.text[:200]}"
    # Expect 200 on most. 401/403 only if auth failed.
    assert r.status_code in (200, 204), f"unexpected {r.status_code} on {path}: {r.text[:150]}"


# --- client-side endpoints ---
CLIENT_GETS = [
    "/api/auth/me",
    "/api/services/list",
    "/api/users/me/favorite-drivers",
    "/api/users/me/emergency-contacts",
    "/api/rides/my-rides",
    "/api/orders/my-orders",
    "/api/wallet/balance",
    "/api/coupons/available",
    "/api/referral/my-code",
    "/api/drivers/top",
]


@pytest.mark.parametrize("path", CLIENT_GETS)
def test_client_endpoint_reachable(admin_session, path):
    # using admin session just to authenticate — we only want to filter 404 vs 401
    r = admin_session.get(f"{BASE}{path}", timeout=15)
    assert r.status_code != 404, f"MISSING route: {path}"
    assert r.status_code < 500, f"500 on {path}: {r.text[:150]}"


# --- driver endpoints ---
DRIVER_GETS = [
    "/api/drivers/my-active-rewards",
    "/api/drivers/my-stats",
    "/api/drivers/my-earnings",
    "/api/drivers/my-documents",
    "/api/drivers/my-notifications",
    "/api/drivers/incoming-requests",
]


@pytest.mark.parametrize("path", DRIVER_GETS)
def test_driver_endpoint_reachable(driver_session, path):
    r = driver_session.get(f"{BASE}{path}", timeout=15)
    assert r.status_code != 404, f"MISSING driver route: {path}"
    assert r.status_code < 500, f"500 on {path}: {r.text[:150]}"


# --- phase2 endpoints ---
PHASE2_GETS = [
    "/api/phase2/loyalty/me",
    "/api/phase2/referral/me",
    "/api/phase2/gift-cards/my",
    "/api/phase2/subscriptions/plans",
    "/api/phase2/safety/emergency-contacts",
    "/api/phase2/favorites/drivers",
]


@pytest.mark.parametrize("path", PHASE2_GETS)
def test_phase2_endpoint_reachable(admin_session, path):
    r = admin_session.get(f"{BASE}{path}", timeout=15)
    # Ok for phase2 to need a non-admin user; we only want to assert NOT 404 and NOT 500
    assert r.status_code != 404, f"MISSING phase2 route: {path}"
    assert r.status_code < 500, f"500 on {path}: {r.text[:150]}"
