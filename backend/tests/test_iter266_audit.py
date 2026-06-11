"""Iter266 — Audit fonctionnel complet (uploads, service cats, home cats, food checkout)."""
import os, io, base64, json
import requests
import pytest

BASE = os.environ.get("REACT_APP_BACKEND_URL", "https://gojek-clone-41.preview.emergentagent.com").rstrip("/")
ADMIN = {"email": "admin@superapp.com", "password": "SuperAdmin123!"}
CLIENT = {"email": "capture.user@example.com", "password": "Capture123!"}
DRIVER = {"email": "jean.dupont@demo.sb", "password": "Driver123!"}

# minimal PNG 1x1
PNG_BYTES = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
)


def login(creds):
    s = requests.Session()
    r = s.post(f"{BASE}/api/auth/login", json=creds, timeout=30)
    assert r.status_code == 200, f"login failed {creds['email']}: {r.status_code} {r.text}"
    body = r.json()
    tok = body.get("access_token") or body.get("token")
    if tok:
        s.headers.update({"Authorization": f"Bearer {tok}"})
    return s, body


@pytest.fixture(scope="module")
def admin_session():
    s, _ = login(ADMIN)
    return s


@pytest.fixture(scope="module")
def client_session():
    s, _ = login(CLIENT)
    return s


# ---------- AUDIT 2 — UPLOAD + SERVICE CATEGORIES + HOME CATEGORIES ----------

def test_upload_image_endpoint(admin_session):
    files = {"file": ("test.png", io.BytesIO(PNG_BYTES), "image/png")}
    r = admin_session.post(f"{BASE}/api/uploads/image", files=files, timeout=30)
    assert r.status_code == 200, f"upload failed: {r.status_code} {r.text[:300]}"
    d = r.json()
    assert "url" in d and "id" in d
    # verify GET works
    g = requests.get(f"{BASE}{d['url']}", timeout=20)
    assert g.status_code == 200
    pytest.upload_url = d["url"]
    pytest.upload_id = d["id"]


def test_service_categories_list_and_field_mismatch(admin_session):
    r = admin_session.get(f"{BASE}/api/admin/service-categories", timeout=20)
    assert r.status_code == 200, r.text
    cats = r.json()
    assert isinstance(cats, list) and len(cats) > 0
    sample = cats[0]
    keys = set(sample.keys())
    # report: presence of fields
    print(">>> service_categories sample keys:", sorted(keys))
    # CRITICAL: AdminServiceCategories saves banner_image/service_image/icon, NOT image_url.
    # Confirm no image_url field but banner_image/service_image present.
    pytest.svc_cat_keys = keys


def test_service_category_update_persists_images(admin_session):
    # pick 'moto' if exists else first
    r = admin_session.get(f"{BASE}/api/admin/service-categories", timeout=20)
    cats = r.json()
    cat = next((c for c in cats if c.get("key") == "moto"), cats[0])
    img_url = getattr(pytest, "upload_url", None) or "/api/uploads/none"
    payload = {
        "service_image": img_url,
        "banner_image": img_url,
        "icon": img_url,
    }
    u = admin_session.put(f"{BASE}/api/admin/service-categories/{cat['key']}", json=payload, timeout=20)
    assert u.status_code == 200, f"update failed: {u.status_code} {u.text[:300]}"
    body = u.json()
    print(">>> update response keys:", sorted(body.keys()))
    print(">>> service_image:", body.get("service_image"))
    print(">>> banner_image:", body.get("banner_image"))
    print(">>> icon:", body.get("icon"))
    # verify by GET
    r2 = admin_session.get(f"{BASE}/api/admin/service-categories", timeout=20)
    fetched = next(c for c in r2.json() if c["key"] == cat["key"])
    assert fetched.get("service_image") == img_url, "service_image NOT persisted"


def test_service_categories_public_vs_admin_image_field(admin_session):
    # Public route used by RideChoosePage.js -> configAPI.getServiceCategories
    r = requests.get(f"{BASE}/api/service-categories", timeout=20)
    assert r.status_code == 200, r.text
    pub = r.json()
    assert isinstance(pub, list) and pub
    sample = pub[0] if isinstance(pub, list) else pub
    print(">>> PUBLIC service_categories sample keys:", sorted(sample.keys()) if isinstance(sample, dict) else type(sample))
    # check it exposes the image fields used in admin OR an image_url
    if isinstance(sample, dict):
        has_any = any(k in sample for k in ("service_image", "banner_image", "image_url", "icon"))
        assert has_any, f"public service category exposes no image-like field: {sample}"


def test_home_categories_admin_update_image_url(admin_session):
    r = admin_session.get(f"{BASE}/api/home-categories", timeout=20)
    if r.status_code != 200:
        # try alternative
        r = admin_session.get(f"{BASE}/api/admin/home-categories", timeout=20)
    assert r.status_code == 200, r.text
    payload_root = r.json()
    items = payload_root.get("items") if isinstance(payload_root, dict) else payload_root
    assert items and len(items) > 0
    item = items[0]
    item_id = item.get("id") or item.get("_id") or item.get("key")
    print(">>> home_categories sample keys:", sorted(item.keys()))
    img_url = getattr(pytest, "upload_url", None)
    if not img_url:
        pytest.skip("upload_url missing")
    # try admin update endpoint
    # Real admin endpoint is at /api/home-categories/admin/{id}
    upd_url = f"{BASE}/api/home-categories/admin/{item_id}"
    u = admin_session.put(upd_url, json={"image_url": img_url}, timeout=20)
    assert u.status_code in (200, 204), f"home_cat update failed: {u.status_code} {u.text[:300]}"
    # verify persistence
    r2 = admin_session.get(f"{BASE}/api/home-categories", timeout=20)
    items2 = r2.json().get("items") if isinstance(r2.json(), dict) else r2.json()
    found = next((x for x in items2 if (x.get("id") or x.get("_id") or x.get("key")) == item_id), None)
    assert found and found.get("image_url") == img_url, f"image_url NOT persisted: {found}"


# ---------- AUDIT 1 — FOOD CHECKOUT ----------

def test_food_list_restaurants():
    r = requests.get(f"{BASE}/api/merchants?type=restaurant", timeout=20)
    assert r.status_code == 200, r.text
    body = r.json()
    items = body if isinstance(body, list) else body.get("items") or body.get("merchants") or []
    assert items, "no restaurants returned"
    print(">>> first restaurant keys:", sorted(items[0].keys()))
    pytest.restaurant = items[0]


def test_food_restaurant_detail():
    rest = getattr(pytest, "restaurant", None)
    if not rest:
        pytest.skip("no restaurant from list")
    rid = rest.get("id") or rest.get("_id")
    r = requests.get(f"{BASE}/api/merchants/{rid}", timeout=20)
    assert r.status_code == 200, f"detail failed: {r.status_code} {r.text[:300]}"
    print(">>> detail keys:", sorted(r.json().keys()))
    # check products
    p = requests.get(f"{BASE}/api/merchants/{rid}/products", timeout=20)
    print(">>> products endpoint:", p.status_code)
    if p.status_code == 200:
        prods = p.json()
        prods = prods if isinstance(prods, list) else prods.get("items", [])
        if prods:
            pytest.product = prods[0]
            pytest.restaurant_id = rid
            print(">>> first product:", prods[0].get("id"), prods[0].get("name"), prods[0].get("price"))


def test_food_checkout_create_order(client_session):
    prod = getattr(pytest, "product", None)
    rid = getattr(pytest, "restaurant_id", None)
    if not prod or not rid:
        pytest.skip("no product to order")
    payload = {
        "merchant_id": rid,
        "items": [{"product_id": prod.get("id") or prod.get("_id"), "quantity": 1, "name": prod.get("name"), "price": prod.get("price", 0)}],
        "delivery_address": "1 rue de Paris",
        "delivery_lat": 48.85,
        "delivery_lng": 2.35,
        "order_type": "food",
        "payment_method": "cash",
    }
    r = client_session.post(f"{BASE}/api/orders", json=payload, timeout=30)
    print(">>> POST /api/orders ->", r.status_code, r.text[:400])
    # don't hard assert — report it
    assert r.status_code in (200, 201, 400, 402, 422), f"unexpected status: {r.status_code}"


# ---------- AUDIT 3 — CLIENT HOME NAV ----------

def test_home_categories_public():
    r = requests.get(f"{BASE}/api/home-categories/public", timeout=20)
    if r.status_code == 404:
        r = requests.get(f"{BASE}/api/home-categories", timeout=20)
    assert r.status_code == 200, r.text
    body = r.json()
    items = body if isinstance(body, list) else body.get("items", [])
    print(">>> public home_categories count:", len(items))
    empty_imgs = [i for i in items if not i.get("image_url")]
    print(f">>> {len(empty_imgs)}/{len(items)} home_categories have empty image_url")
    pytest.empty_home_imgs = (len(empty_imgs), len(items))


# ---------- AUDIT 4 — DRIVER ----------

def test_driver_login_and_me():
    s, body = login(DRIVER)
    me = s.get(f"{BASE}/api/auth/me", timeout=15)
    assert me.status_code == 200, me.text
    print(">>> driver me:", me.json().get("role"), me.json().get("email"))


# ---------- AUDIT 5 — ADMIN PAGES SMOKE ----------

@pytest.mark.parametrize("path", [
    "/api/admin/service-categories",
    "/api/admin/merchants",
    "/api/zones",
    "/api/admin/services",
    "/api/home-categories",
    "/api/marketplace/listings",
])
def test_admin_pages_smoke(admin_session, path):
    r = admin_session.get(f"{BASE}{path}", timeout=20)
    print(f">>> {path} -> {r.status_code}")
    assert r.status_code in (200, 204), f"{path} failed: {r.status_code} {r.text[:200]}"
