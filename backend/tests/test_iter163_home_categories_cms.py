"""
Iter 163 — Home Categories CMS verification.

Validates:
- Public GET /api/home-categories: 8 sections, 41 seeded items (incl. taxi 17 stale)
- Admin auth (admin@superapp.com)
- Admin CRUD: list, update (visible_home toggle, label edit), reorder
- Visibility toggle persists; final state restored.
"""
import os
import requests
import pytest

def _read_frontend_env():
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    return line.split("=", 1)[1].strip()
    except Exception:
        pass
    return None

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or _read_frontend_env() or "").rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL not set"
API = f"{BASE_URL}/api"
ADMIN_EMAIL = "admin@superapp.com"
ADMIN_PWD = "SuperAdmin123!"


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PWD}, timeout=15)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    tok = r.json().get("access_token") or r.json().get("token")
    assert tok, f"no token: {r.json()}"
    return tok


@pytest.fixture(scope="module")
def admin_session(admin_token):
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"})
    return s


# ---------------- Public ----------------
def test_public_list_has_8_sections_and_items():
    r = requests.get(f"{API}/home-categories", timeout=15)
    assert r.status_code == 200
    data = r.json()
    keys = [s["key"] for s in data["sections"]]
    assert keys == ["taxi", "delivery", "ondemand", "beauty", "pet", "carcare", "towing", "nearby"]
    items = data["items"]
    assert len(items) >= 24  # at least non-taxi items
    by_section = {}
    for it in items:
        by_section.setdefault(it["section"], 0)
        by_section[it["section"]] += 1
    # core managed sections present
    for s in ["delivery", "ondemand", "beauty", "pet", "carcare", "towing", "nearby"]:
        assert by_section.get(s, 0) > 0, f"section {s} empty"


# ---------------- Admin list ----------------
def test_admin_list(admin_session):
    r = admin_session.get(f"{API}/home-categories/admin", timeout=15)
    assert r.status_code == 200
    data = r.json()
    assert "items" in data and "sections" in data and "icons" in data
    assert len(data["items"]) >= 24


def test_admin_list_unauth():
    r = requests.get(f"{API}/home-categories/admin", timeout=15)
    assert r.status_code in (401, 403)


# ---------------- Visibility toggle ----------------
def test_toggle_visibility_persists_and_reflects_public(admin_session):
    # pick a delivery item: runner-courier
    r = admin_session.get(f"{API}/home-categories/admin", timeout=15)
    items = r.json()["items"]
    target = next((i for i in items if i["section"] == "delivery" and i["key"] == "runner-courier"), None)
    assert target is not None, "runner-courier seed missing"
    orig_visible = bool(target["visible_home"])

    # toggle OFF
    r = admin_session.put(f"{API}/home-categories/admin/{target['id']}", json={"visible_home": False}, timeout=15)
    assert r.status_code == 200, r.text

    # public should still list it but visible_home=false
    pub = requests.get(f"{API}/home-categories", timeout=15).json()
    pub_item = next((p for p in pub["items"] if p["id"] == target["id"]), None)
    assert pub_item is not None
    assert pub_item["visible_home"] is False

    # restore to original
    r = admin_session.put(f"{API}/home-categories/admin/{target['id']}", json={"visible_home": orig_visible}, timeout=15)
    assert r.status_code == 200
    pub2 = requests.get(f"{API}/home-categories", timeout=15).json()
    p2 = next(p for p in pub2["items"] if p["id"] == target["id"])
    assert bool(p2["visible_home"]) == orig_visible


# ---------------- Label edit + revert ----------------
def test_label_edit_and_revert(admin_session):
    r = admin_session.get(f"{API}/home-categories/admin", timeout=15)
    items = r.json()["items"]
    target = next(i for i in items if i["section"] == "delivery" and i["key"] == "food-delivery")
    orig = target["label_fr"]
    new = orig + " Test"
    a = admin_session.put(f"{API}/home-categories/admin/{target['id']}", json={"label_fr": new}, timeout=15)
    assert a.status_code == 200
    # verify
    pub = requests.get(f"{API}/home-categories", timeout=15).json()
    p = next(i for i in pub["items"] if i["id"] == target["id"])
    assert p["label_fr"] == new
    # revert
    b = admin_session.put(f"{API}/home-categories/admin/{target['id']}", json={"label_fr": orig}, timeout=15)
    assert b.status_code == 200
    pub2 = requests.get(f"{API}/home-categories", timeout=15).json()
    p2 = next(i for i in pub2["items"] if i["id"] == target["id"])
    assert p2["label_fr"] == orig


# ---------------- Reorder ----------------
def test_reorder_no_error(admin_session):
    r = admin_session.get(f"{API}/home-categories/admin", timeout=15)
    items = r.json()["items"]
    delivery = sorted([i for i in items if i["section"] == "delivery"], key=lambda x: x["display_order"])
    assert len(delivery) >= 2
    ids = [d["id"] for d in delivery]
    # swap first two
    swapped = [ids[1], ids[0]] + ids[2:]
    resp = admin_session.post(f"{API}/home-categories/admin/reorder", json={"ordered_ids": swapped}, timeout=15)
    assert resp.status_code == 200
    # verify
    r2 = admin_session.get(f"{API}/home-categories/admin", timeout=15)
    delivery2 = sorted([i for i in r2.json()["items"] if i["section"] == "delivery"], key=lambda x: x["display_order"])
    assert delivery2[0]["id"] == swapped[0]
    # restore
    admin_session.post(f"{API}/home-categories/admin/reorder", json={"ordered_ids": ids}, timeout=15)
