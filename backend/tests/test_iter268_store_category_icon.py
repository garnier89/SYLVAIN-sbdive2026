"""Iter268 — Regression: a delivery (store) category icon set in the dashboard
persists as a small relative URL and is exposed to the client, so uploaded images
show on /all-delivery instead of the hardcoded fallback."""
import os, io, base64
import requests

BASE = os.environ.get("REACT_APP_BACKEND_URL", "https://gojek-clone-41.preview.emergentagent.com").rstrip("/")
ADMIN = {"email": "admin@superapp.com", "password": "SuperAdmin123!"}
PNG_BYTES = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
)


def _admin():
    s = requests.Session()
    r = s.post(f"{BASE}/api/auth/login", json=ADMIN, timeout=30)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    tok = r.json().get("access_token") or r.json().get("token")
    if tok:
        s.headers.update({"Authorization": f"Bearer {tok}"})
    return s


def test_store_category_icon_upload_persists_and_exposed():
    s = _admin()

    # Upload → relative url (not base64)
    files = {"file": ("cat.png", io.BytesIO(PNG_BYTES), "image/png")}
    up = s.post(f"{BASE}/api/uploads/image", files=files, timeout=30)
    assert up.status_code == 200, f"upload failed: {up.status_code} {up.text[:300]}"
    url = up.json()["url"]
    assert url.startswith("/api/uploads/") and "data:" not in url

    # Pick a store category and set its icon
    cats = s.get(f"{BASE}/api/admin/store-categories", timeout=30).json()
    assert cats, "no store categories"
    target = cats[0]
    original = target.get("icon")
    try:
        upd = s.put(f"{BASE}/api/admin/store-categories/{target['key']}", json={"icon": url}, timeout=30)
        assert upd.status_code == 200, f"update failed: {upd.status_code} {upd.text[:300]}"
        assert upd.json().get("icon") == url, "icon not persisted on admin update"

        # Public client endpoint exposes the icon
        pub = requests.get(f"{BASE}/api/store-categories", timeout=30).json()
        one = next((c for c in pub if c["key"] == target["key"]), {})
        assert one.get("icon") == url, "client store-categories endpoint missing icon"
    finally:
        s.put(f"{BASE}/api/admin/store-categories/{target['key']}", json={"icon": original}, timeout=30)
