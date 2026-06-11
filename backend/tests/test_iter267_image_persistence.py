"""Iter267 — Regression: dashboard image upload PERSISTS as a relative URL and
propagates to the client (home_categories). Guards the fix for the root cause
where AdminHomeCategories sent a base64 data-URL that overflowed the request and
silently failed to persist (image_url stayed null)."""
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


def test_home_category_image_upload_persists_and_propagates():
    s = _admin()

    # 1) Upload an image → must return a small RELATIVE url (not base64)
    files = {"file": ("icon.png", io.BytesIO(PNG_BYTES), "image/png")}
    up = s.post(f"{BASE}/api/uploads/image", files=files, timeout=30)
    assert up.status_code == 200, f"upload failed: {up.status_code} {up.text[:300]}"
    url = up.json()["url"]
    assert url.startswith("/api/uploads/"), f"expected relative upload url, got {url!r}"
    assert len(url) < 200 and "data:" not in url, "url must not be a base64 blob"

    # 2) The uploaded image must be publicly servable
    img = requests.get(f"{BASE}{url}", timeout=30)
    assert img.status_code == 200 and img.headers.get("content-type", "").startswith("image/")

    # 3) Persist it on a home category via the admin PUT, then verify it survives a GET
    items = s.get(f"{BASE}/api/home-categories/admin", timeout=30).json().get("items", [])
    assert items, "no home categories to test against"
    target = items[0]
    original = target.get("image_url")
    try:
        upd = s.put(f"{BASE}/api/home-categories/admin/{target['id']}", json={"image_url": url}, timeout=30)
        assert upd.status_code == 200, f"update failed: {upd.status_code} {upd.text[:300]}"

        # Admin list reflects the saved url
        again = s.get(f"{BASE}/api/home-categories/admin", timeout=30).json().get("items", [])
        saved = next((i for i in again if i["id"] == target["id"]), {})
        assert saved.get("image_url") == url, f"image_url not persisted: {saved.get('image_url')!r}"

        # Public endpoint (what the client app reads) also exposes it
        pub = requests.get(f"{BASE}/api/home-categories", params={"section": target.get("section")}, timeout=30)
        pub_items = pub.json().get("items", [])
        pub_one = next((i for i in pub_items if i["id"] == target["id"]), {})
        assert pub_one.get("image_url") == url, "client-facing endpoint missing image_url"
    finally:
        # restore original value so we don't pollute the demo data
        s.put(f"{BASE}/api/home-categories/admin/{target['id']}", json={"image_url": original}, timeout=30)
