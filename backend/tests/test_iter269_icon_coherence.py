"""Iter269 — Icon dashboard coherence across surfaces.

Validates the contract that fuels the user-visible behaviour:
- /api/service-categories exposes an `icon` field (image url OR emoji)
- /api/store-categories exposes an `icon` field
- /api/ondemand-categories is reachable for /all-services
- Admin can PUT `icon` on a taxi service-category and the client GET sees it
- Upload via /api/uploads/image returns a relative URL
"""
import os, io, base64
import requests

BASE = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
ADMIN = {"email": "admin@superapp.com", "password": "SuperAdmin123!"}
CLIENT = {"email": "capture.user@example.com", "password": "Capture123!"}

PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
)


def _login(creds):
    s = requests.Session()
    r = s.post(f"{BASE}/api/auth/login", json=creds, timeout=30)
    assert r.status_code == 200, f"login failed {creds['email']}: {r.status_code} {r.text[:200]}"
    tok = r.json().get("access_token") or r.json().get("token")
    if tok:
        s.headers.update({"Authorization": f"Bearer {tok}"})
    return s


# ---- 1. Uploads return relative url --------------------------------------
def test_uploads_image_returns_relative_url():
    s = _login(ADMIN)
    up = s.post(f"{BASE}/api/uploads/image", files={"file": ("a.png", io.BytesIO(PNG), "image/png")}, timeout=30)
    assert up.status_code == 200, up.text[:200]
    body = up.json()
    assert "url" in body and body["url"].startswith("/api/uploads/"), body
    # Image is publicly fetchable
    fetched = requests.get(f"{BASE}{body['url']}", timeout=20)
    assert fetched.status_code == 200
    assert fetched.headers.get("content-type", "").startswith("image/")


# ---- 2. Service categories (taxi) expose icon ----------------------------
def test_service_categories_expose_icon_field():
    cats = requests.get(f"{BASE}/api/service-categories", timeout=30).json()
    assert isinstance(cats, list) and cats, "service-categories must not be empty"
    # icon field must be present on at least one taxi-like cat (emoji or url)
    taxi_like = [c for c in cats if (c.get("type") or "").lower() in ("taxi", "ride", "transport") or "taxi" in (c.get("key") or "").lower()]
    sample = taxi_like or cats
    has_icon = any(isinstance(c.get("icon"), str) and c.get("icon").strip() for c in sample)
    assert has_icon, f"no icon set on any service-category sample: {[{k:c.get(k) for k in ('key','name','icon','type')} for c in sample[:5]]}"


# ---- 3. Admin can PUT icon on service-category and client sees it --------
def test_admin_set_service_category_icon_propagates_to_client():
    s = _login(ADMIN)
    # find a taxi-typed service category
    cats = s.get(f"{BASE}/api/admin/service-categories", timeout=30).json()
    assert isinstance(cats, list) and cats, "admin service-categories empty"
    target = next((c for c in cats if (c.get("type") or "").lower() in ("taxi", "ride")), cats[0])
    original = target.get("icon")
    new_icon = "🚖"
    try:
        upd = s.put(f"{BASE}/api/admin/service-categories/{target.get('key') or target.get('id')}",
                    json={"icon": new_icon}, timeout=30)
        assert upd.status_code in (200, 204), f"update failed: {upd.status_code} {upd.text[:200]}"
        # public list reflects the change
        pub = requests.get(f"{BASE}/api/service-categories", timeout=30).json()
        match_key = target.get("key") or target.get("id")
        one = next((c for c in pub if (c.get("key") == match_key or c.get("id") == match_key)), None)
        assert one and one.get("icon") == new_icon, f"client did not see updated icon: {one}"
    finally:
        if original is not None:
            s.put(f"{BASE}/api/admin/service-categories/{target.get('key') or target.get('id')}",
                  json={"icon": original}, timeout=30)


# ---- 4. Store categories expose icon (for /all-delivery) -----------------
def test_store_categories_expose_icon_for_client():
    pub = requests.get(f"{BASE}/api/store-categories", timeout=30).json()
    assert isinstance(pub, list) and pub, "store-categories empty"
    # at least one must have a non-empty icon
    icons = [c.get("icon") for c in pub if c.get("icon")]
    assert icons, f"no icons set on store-categories: {pub[:3]}"


# ---- 5. On-demand categories reachable for /all-services -----------------
def test_ondemand_categories_endpoint_alive():
    r = requests.get(f"{BASE}/api/services/ondemand-categories", timeout=30)
    # Endpoint must exist and return a list
    assert r.status_code == 200, f"ondemand-categories status {r.status_code}: {r.text[:200]}"
    data = r.json()
    assert isinstance(data, list), f"expected list, got {type(data)}"


# ---- 6. Client can login (smoke for UI tests) ----------------------------
def test_client_login_works():
    s = _login(CLIENT)
    me = s.get(f"{BASE}/api/auth/me", timeout=20)
    assert me.status_code == 200, me.text[:200]
