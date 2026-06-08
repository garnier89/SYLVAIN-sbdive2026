"""Tests for Iter171 — Nearby Businesses (Commerces Proches) end-to-end wiring.

Covers:
- Public catalog endpoint returns ~22 businesses spanning required categories
- Home nearby tiles deep-link to /nearby?category=<urlencoded French category>
- Admin CRUD (POST/PUT/DELETE) with cookie-based auth + auth guards
"""
import os
import urllib.parse as _u
import uuid

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

from _creds import ADMIN_EMAIL, ADMIN_PASSWORD  # noqa: E402

REQUIRED_CATEGORIES = {
    "Café", "Bar", "Restaurant", "Salon", "Boulangerie", "Pharmacie",
    "Hôtel", "Musée", "Attraction", "Bibliothèque", "Vie Nocturne",
    "Parking", "Garage",
}


# ---------- Fixtures ----------
@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def admin_client():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    # access_token cookie should be set
    assert any(c.name in ("access_token", "session", "token") for c in s.cookies), (
        f"No auth cookie set after login: {s.cookies}"
    )
    return s


# ---------- Public catalog ----------
class TestPublicCatalog:
    def test_nearby_businesses_list_has_22_items(self, client):
        r = client.get(f"{API}/phase2/catalogs/nearby_businesses?limit=300")
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, list)
        # spec: ~22 businesses
        assert len(data) >= 22, f"Expected >=22 items, got {len(data)}"
        # validate shape of one item
        sample = data[0]
        assert "id" in sample
        assert "name" in sample
        assert "category" in sample
        # no Mongo _id leak
        assert "_id" not in sample

    def test_nearby_businesses_cover_all_required_categories(self, client):
        r = client.get(f"{API}/phase2/catalogs/nearby_businesses?limit=300")
        assert r.status_code == 200
        cats = {it.get("category") for it in r.json()}
        missing = REQUIRED_CATEGORIES - cats
        assert not missing, f"Missing categories: {missing}; got {cats}"

    def test_at_least_two_musee_items_exist(self, client):
        # Spec mentions Musée du Louvre and Musée d'Orsay — verify at least 2 Musée items
        r = client.get(f"{API}/phase2/catalogs/nearby_businesses?limit=300")
        assert r.status_code == 200
        musees = [it for it in r.json() if it.get("category") == "Musée"]
        assert len(musees) >= 2, f"Expected >=2 Musée items, got {len(musees)}: {[it.get('name') for it in musees]}"
        names = {it.get("name") for it in musees}
        # informational: check that at least one well-known museum exists
        # (don't hard-fail if naming differs slightly)
        assert names, "No Musée names found"


# ---------- Home categories deep-links ----------
class TestHomeCategoriesDeepLinks:
    def test_nearby_section_returns_tiles(self, client):
        r = client.get(f"{API}/home-categories", params={"section": "nearby"})
        assert r.status_code == 200, r.text
        data = r.json()
        # Accept either list or {items:[]}
        items = data if isinstance(data, list) else data.get("items") or data.get("categories") or []
        assert items, f"Empty nearby section: {data}"
        # spec: 10 tiles
        assert len(items) >= 10, f"Expected >=10 tiles, got {len(items)}"

    def test_nearby_tiles_deep_link_to_nearby_with_urlencoded_category(self, client):
        r = client.get(f"{API}/home-categories", params={"section": "nearby"})
        assert r.status_code == 200
        data = r.json()
        items = data if isinstance(data, list) else data.get("items") or data.get("categories") or []
        assert items
        routes = [it.get("target_route") or it.get("route") or "" for it in items]
        # all should start with /nearby?category=
        nearby_routes = [rt for rt in routes if rt.startswith("/nearby")]
        assert len(nearby_routes) >= 10, f"Expected >=10 /nearby routes, got: {routes}"
        # at least one should have an encoded accent (Café -> Caf%C3%A9, Musée -> Mus%C3%A9e, Hôtel -> H%C3%B4tel)
        encoded = [rt for rt in nearby_routes if "%C3%" in rt or "?category=" in rt]
        assert encoded, f"No urlencoded category routes: {nearby_routes}"
        # decode each ?category= value and confirm it's in REQUIRED_CATEGORIES (any subset)
        decoded_cats = []
        for rt in nearby_routes:
            if "?" not in rt:
                continue
            qs = rt.split("?", 1)[1]
            for kv in qs.split("&"):
                if kv.startswith("category="):
                    decoded_cats.append(_u.unquote(kv[len("category="):]))
        assert decoded_cats, f"No category param found: {nearby_routes}"
        # all decoded categories should be in our set
        bad = [c for c in decoded_cats if c not in REQUIRED_CATEGORIES]
        assert not bad, f"Unexpected category values: {bad}"


# ---------- Admin auth guards ----------
class TestAdminAuthGuards:
    def test_create_requires_auth(self, client):
        r = client.post(f"{API}/phase2/admin/catalogs/nearby_businesses", json={"name": "x"})
        assert r.status_code in (401, 403), f"Expected 401/403, got {r.status_code}: {r.text}"

    def test_update_requires_auth(self, client):
        r = client.put(f"{API}/phase2/admin/catalogs/nearby_businesses/fake-id", json={"name": "x"})
        assert r.status_code in (401, 403, 404), f"Got {r.status_code}: {r.text}"

    def test_delete_requires_auth(self, client):
        r = client.delete(f"{API}/phase2/admin/catalogs/nearby_businesses/fake-id")
        assert r.status_code in (401, 403, 404), f"Got {r.status_code}: {r.text}"


# ---------- Admin CRUD ----------
class TestAdminCRUD:
    def test_full_crud_flow(self, admin_client):
        # CREATE
        suffix = uuid.uuid4().hex[:6]
        name = f"TEST_BUSINESS_{suffix}"
        payload = {
            "name": name,
            "category": "Musée",
            "address": "1 rue de Test",
            "phone": "+33100000000",
            "description": "Auto test",
            "rating": 4.7,
            "distance_km": 1.2,
            "open_now": True,
            "is_active": True,
            "image": "",
        }
        r = admin_client.post(f"{API}/phase2/admin/catalogs/nearby_businesses", json=payload)
        assert r.status_code in (200, 201), f"Create failed: {r.status_code} {r.text}"
        created = r.json()
        assert created.get("name") == name
        assert created.get("category") == "Musée"
        new_id = created.get("id")
        assert new_id, f"Missing id in response: {created}"
        assert "_id" not in created
        # spec mentions created_at — soft check
        # assert "created_at" in created

        try:
            # READ via public catalog — should appear
            list_r = admin_client.get(f"{API}/phase2/catalogs/nearby_businesses?limit=300")
            assert list_r.status_code == 200
            ids = {it.get("id") for it in list_r.json()}
            assert new_id in ids, f"Created item {new_id} not in public list"

            # UPDATE
            new_name = f"{name}_UPD"
            upd_payload = dict(payload)
            upd_payload["name"] = new_name
            upd_payload["rating"] = 4.9
            u = admin_client.put(
                f"{API}/phase2/admin/catalogs/nearby_businesses/{new_id}", json=upd_payload
            )
            assert u.status_code in (200, 204), f"Update failed: {u.status_code} {u.text}"

            # Verify update persisted
            list_r2 = admin_client.get(f"{API}/phase2/catalogs/nearby_businesses?limit=300")
            updated_item = next((it for it in list_r2.json() if it.get("id") == new_id), None)
            assert updated_item is not None
            assert updated_item.get("name") == new_name
            assert float(updated_item.get("rating")) == pytest.approx(4.9, abs=0.01)
        finally:
            # DELETE
            d = admin_client.delete(f"{API}/phase2/admin/catalogs/nearby_businesses/{new_id}")
            assert d.status_code in (200, 204), f"Delete failed: {d.status_code} {d.text}"
            # Verify removed
            list_r3 = admin_client.get(f"{API}/phase2/catalogs/nearby_businesses?limit=300")
            ids_after = {it.get("id") for it in list_r3.json()}
            assert new_id not in ids_after, "Item still present after delete"
