"""
Iter 195 — On-Demand Services (« Services à la demande ») Lot 1.

Covers:
- GET /api/services/ondemand-categories (24 cats, sorted by order)
- GET /api/services/providers?category=coiffeur&lat&lng (distance_km + price_from)
- GET /api/services/providers/{id} (profile + services + gallery)
- POST /api/services/bookings (status=confirmed when provider_id present)
- GET /api/services/bookings (list user's bookings)
- Admin CRUD: GET/POST/PUT/DELETE /api/services/admin/providers
- Admin: GET/PUT /api/services/admin/ondemand-categories
"""

import os
import uuid

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@superapp.com"
ADMIN_PASSWORD = "SuperAdmin123!"
USER_EMAIL = "test2@example.com"
USER_PASSWORD = "TestPass123!"


def _login(email: str, password: str) -> str:
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=20)
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text[:200]}"
    return r.json()["access_token"]


@pytest.fixture(scope="session")
def user_token():
    return _login(USER_EMAIL, USER_PASSWORD)


@pytest.fixture(scope="session")
def admin_token():
    return _login(ADMIN_EMAIL, ADMIN_PASSWORD)


@pytest.fixture(scope="session")
def user_headers(user_token):
    return {"Authorization": f"Bearer {user_token}"}


@pytest.fixture(scope="session")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


# ── Public endpoints (no auth required) ──────────────────────────────────────
class TestOnDemandPublic:
    def test_categories_returns_24_sorted(self):
        r = requests.get(f"{API}/services/ondemand-categories", timeout=15)
        assert r.status_code == 200, r.text
        cats = r.json()
        assert isinstance(cats, list)
        assert len(cats) == 24, f"expected 24 active categories, got {len(cats)}"
        # Check sort by order
        orders = [c["order"] for c in cats]
        assert orders == sorted(orders), "categories not sorted by order"
        # Check required fields
        slugs = {c["slug"] for c in cats}
        for must in {"bricoleur", "menage", "massage", "coiffeur"}:
            assert must in slugs, f"missing category {must}"
        sample = cats[0]
        for k in ("slug", "name", "icon", "color", "order"):
            assert k in sample, f"missing key {k}"

    def test_providers_coiffeur_with_geo(self):
        r = requests.get(
            f"{API}/services/providers",
            params={"category": "coiffeur", "lat": 48.85, "lng": 2.35},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        provs = r.json()
        assert isinstance(provs, list)
        assert len(provs) == 2, f"expected 2 coiffeur providers, got {len(provs)}"
        names = {p["name"] for p in provs}
        assert {"Sylvain G", "Amir B."}.issubset(names)
        # distance_km + price_from computed
        for p in provs:
            assert p["distance_km"] is not None, f"distance not computed for {p['name']}"
            assert isinstance(p["price_from"], (int, float)) and p["price_from"] > 0
        # Sorted by distance ascending
        dists = [p["distance_km"] for p in provs]
        assert dists == sorted(dists), f"providers not sorted by distance: {dists}"

    def test_provider_detail_sylvain(self):
        r = requests.get(f"{API}/services/providers/svp_coiffeur_sylvain", timeout=15)
        assert r.status_code == 200, r.text
        p = r.json()
        assert p["id"] == "svp_coiffeur_sylvain"
        assert p["name"] == "Sylvain G"
        assert isinstance(p.get("services"), list) and len(p["services"]) >= 1
        # Check Coupe Homme Classique exists at 17.19
        chc = next((s for s in p["services"] if s["name"] == "Coupe Homme Classique"), None)
        assert chc is not None, "service 'Coupe Homme Classique' missing"
        assert abs(chc["price"] - 17.19) < 0.001
        assert isinstance(p.get("gallery"), list)

    def test_provider_detail_404(self):
        r = requests.get(f"{API}/services/providers/nope_xxx", timeout=15)
        assert r.status_code == 404


# ── User bookings ────────────────────────────────────────────────────────────
class TestServiceBookings:
    def test_create_booking_confirmed_then_list(self, user_headers):
        payload = {
            "category": "coiffeur",
            "service_key": "s1",
            "service_name": "Coupe Homme Classique",
            "provider_id": "svp_coiffeur_sylvain",
            "provider_name": "Sylvain G",
            "base_price": 17.19,
            "quantity": 1,
            "address": "10 rue de Test, Paris",
            "is_instant": True,
            "payment_method": "cash",
        }
        r = requests.post(f"{API}/services/bookings", json=payload, headers=user_headers, timeout=20)
        assert r.status_code == 200, r.text
        bk = r.json()
        assert bk["status"] == "confirmed"
        assert bk["provider_id"] == "svp_coiffeur_sylvain"
        assert abs(bk["price"] - 17.19) < 0.001
        assert bk["base_price"] == 17.19
        assert bk["payment_method"] == "cash"
        booking_id = bk["id"]

        # List should now include this booking
        lr = requests.get(f"{API}/services/bookings", headers=user_headers, timeout=20)
        assert lr.status_code == 200
        ids = [b["id"] for b in lr.json()]
        assert booking_id in ids


# ── Admin CRUD ───────────────────────────────────────────────────────────────
class TestAdminProvidersCRUD:
    def test_admin_list_providers(self, admin_headers):
        r = requests.get(f"{API}/services/admin/providers", headers=admin_headers, timeout=15)
        assert r.status_code == 200, r.text
        provs = r.json()
        assert isinstance(provs, list) and len(provs) >= 9

    def test_admin_provider_full_crud(self, admin_headers):
        # Create
        body = {
            "name": f"TEST_Prov_{uuid.uuid4().hex[:6]}",
            "category_slug": "bricoleur",
            "rating": 4.2,
            "reviews_count": 12,
            "lat": 48.85,
            "lng": 2.35,
            "address": "Test addr",
            "phone": "+33600000000",
            "bio": "test bio",
            "services": [{"id": "s1", "name": "Test svc", "price": 10.0, "duration_min": 30}],
            "is_active": True,
        }
        cr = requests.post(f"{API}/services/admin/providers", json=body,
                           headers=admin_headers, timeout=15)
        assert cr.status_code == 200, cr.text
        prov = cr.json()
        pid = prov["id"]
        assert pid.startswith("svp_")
        assert prov["name"] == body["name"]

        try:
            # Update
            ur = requests.put(f"{API}/services/admin/providers/{pid}",
                              json={"rating": 4.9, "bio": "updated bio"},
                              headers=admin_headers, timeout=15)
            assert ur.status_code == 200, ur.text
            updated = ur.json()
            assert abs(updated["rating"] - 4.9) < 0.001
            assert updated["bio"] == "updated bio"

            # Verify via list
            lr = requests.get(f"{API}/services/admin/providers",
                              params={"category": "bricoleur"},
                              headers=admin_headers, timeout=15)
            assert lr.status_code == 200
            assert any(p["id"] == pid for p in lr.json())
        finally:
            # Delete (cleanup)
            dr = requests.delete(f"{API}/services/admin/providers/{pid}",
                                 headers=admin_headers, timeout=15)
            assert dr.status_code == 200
            assert dr.json().get("deleted") is True

        # Confirm deletion
        lr2 = requests.get(f"{API}/services/admin/providers",
                           params={"category": "bricoleur"},
                           headers=admin_headers, timeout=15)
        assert not any(p["id"] == pid for p in lr2.json())

    def test_admin_categories_list_and_update(self, admin_headers):
        r = requests.get(f"{API}/services/admin/ondemand-categories",
                         headers=admin_headers, timeout=15)
        assert r.status_code == 200, r.text
        cats = r.json()
        assert len(cats) == 24
        target = next(c for c in cats if c["slug"] == "decorateur")
        original_active = target.get("is_active", True)
        original_order = target.get("order")

        # Toggle is_active off then back on
        u = requests.put(
            f"{API}/services/admin/ondemand-categories/decorateur",
            json={"is_active": not original_active},
            headers=admin_headers, timeout=15,
        )
        assert u.status_code == 200, u.text
        assert u.json()["is_active"] is (not original_active)
        # Restore
        u2 = requests.put(
            f"{API}/services/admin/ondemand-categories/decorateur",
            json={"is_active": original_active, "order": original_order},
            headers=admin_headers, timeout=15,
        )
        assert u2.status_code == 200

    def test_admin_provider_requires_admin(self, user_headers):
        # Regular user must NOT be able to list admin providers
        r = requests.get(f"{API}/services/admin/providers", headers=user_headers, timeout=15)
        assert r.status_code in (401, 403), f"expected 401/403, got {r.status_code}: {r.text[:120]}"
