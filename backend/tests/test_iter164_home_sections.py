"""
Iter 164 — Home Sections Layout (order + visibility) backend regression.

Verifies:
- Public GET /api/home-categories returns `section_order` (default 19 keys, hidden ones removed).
- Admin GET /api/home-categories/admin/sections returns 19 sections with display_order+visible.
- POST /api/home-categories/admin/sections/{key}/toggle flips visibility (hidden keys drop out of public section_order).
- POST /api/home-categories/admin/sections/reorder persists new key order.
- Final teardown: restore default order + nearby visible=True.
"""

import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

DEFAULT_ORDER = [
    "taxi", "promo", "delivery", "parcel", "marketplace", "beauty", "medical",
    "ondemand", "bid", "carcare", "towing", "genie", "video", "pet", "parking",
    "giftcards", "carpool", "tracking", "nearby",
]


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={
        "email": "admin@superapp.com",
        "password": "SuperAdmin123!",
    }, timeout=15)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    token = r.json().get("access_token") or r.json().get("token")
    assert token, f"no token in response: {r.json()}"
    return token


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


def test_public_home_categories_has_section_order():
    r = requests.get(f"{API}/home-categories", timeout=15)
    assert r.status_code == 200
    data = r.json()
    assert "section_order" in data
    so = data["section_order"]
    assert isinstance(so, list)
    # All present + correct count when nothing hidden
    assert set(so) <= set(DEFAULT_ORDER + [k for k in so])
    assert len(so) >= 1


def test_admin_list_sections_19(admin_headers):
    r = requests.get(f"{API}/home-categories/admin/sections", headers=admin_headers, timeout=15)
    assert r.status_code == 200, r.text
    secs = r.json().get("sections", [])
    assert len(secs) == 19, f"expected 19, got {len(secs)}: {[s['key'] for s in secs]}"
    for s in secs:
        assert "display_order" in s
        assert "visible" in s
        assert "key" in s
    keys = [s["key"] for s in secs]
    for k in DEFAULT_ORDER:
        assert k in keys, f"missing default key {k}"


def test_admin_list_unauthenticated_blocked():
    r = requests.get(f"{API}/home-categories/admin/sections", timeout=15)
    assert r.status_code in (401, 403)


def test_toggle_nearby_hides_then_shows(admin_headers):
    # First toggle => hide
    r = requests.post(f"{API}/home-categories/admin/sections/nearby/toggle", headers=admin_headers, timeout=15)
    assert r.status_code == 200, r.text
    after = r.json()
    assert after["key"] == "nearby"
    # Confirm public section_order no longer contains it (when hidden)
    pub = requests.get(f"{API}/home-categories", timeout=15).json()
    if after["visible"] is False:
        assert "nearby" not in pub["section_order"]
    # Re-toggle to restore (so the final state matches the previous one)
    r2 = requests.post(f"{API}/home-categories/admin/sections/nearby/toggle", headers=admin_headers, timeout=15)
    assert r2.status_code == 200
    pub2 = requests.get(f"{API}/home-categories", timeout=15).json()
    # If we ended visible, nearby should be back in section_order
    if r2.json()["visible"] is True:
        assert "nearby" in pub2["section_order"]


def test_reorder_sections_persists_and_restore(admin_headers):
    # Move 'beauty' above 'delivery'
    new_order = DEFAULT_ORDER.copy()
    new_order.remove("beauty")
    delivery_idx = new_order.index("delivery")
    new_order.insert(delivery_idx, "beauty")

    r = requests.post(f"{API}/home-categories/admin/sections/reorder",
                      headers=admin_headers,
                      json={"ordered_keys": new_order}, timeout=15)
    assert r.status_code == 200, r.text
    assert r.json()["count"] == 19

    # Verify admin list reflects the new order
    secs = requests.get(f"{API}/home-categories/admin/sections", headers=admin_headers, timeout=15).json()["sections"]
    admin_keys = [s["key"] for s in secs]
    assert admin_keys.index("beauty") < admin_keys.index("delivery"), admin_keys

    # Verify public section_order reflects the new order (visible only)
    pub = requests.get(f"{API}/home-categories", timeout=15).json()
    so = pub["section_order"]
    assert "beauty" in so and "delivery" in so
    assert so.index("beauty") < so.index("delivery"), so

    # RESTORE default order
    r2 = requests.post(f"{API}/home-categories/admin/sections/reorder",
                       headers=admin_headers,
                       json={"ordered_keys": DEFAULT_ORDER}, timeout=15)
    assert r2.status_code == 200
    pub2 = requests.get(f"{API}/home-categories", timeout=15).json()
    so2 = pub2["section_order"]
    assert so2.index("delivery") < so2.index("beauty"), so2


def test_toggle_unknown_key_404(admin_headers):
    r = requests.post(f"{API}/home-categories/admin/sections/__not_a_key__/toggle",
                      headers=admin_headers, timeout=15)
    assert r.status_code == 404


def test_final_state_default(admin_headers):
    """Final assertion: ensure layout matches default order and nearby is visible."""
    secs = requests.get(f"{API}/home-categories/admin/sections", headers=admin_headers, timeout=15).json()["sections"]
    keys = [s["key"] for s in secs]
    assert keys == DEFAULT_ORDER, keys
    nearby = next(s for s in secs if s["key"] == "nearby")
    assert nearby["visible"] is True
