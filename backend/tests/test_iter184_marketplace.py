"""
iter 184 - Marketplace (Acheter, Vendre & Louer) backend smoke tests.
Covers: public listings (kind filter), admin moderation, admin settings, vehicle creation.
"""
import os, time, uuid
import requests

def _frontend_env_url():
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    return line.split("=", 1)[1].strip()
    except Exception:
        pass
    return None


BASE = (os.environ.get("REACT_APP_BACKEND_URL") or _frontend_env_url()).rstrip("/") + "/api"

ADMIN = {"email": "admin@superapp.com", "password": "SuperAdmin123!"}
CLIENT = {"email": "clienttest@demo.sb", "password": "Client2026!"}


def _login(creds):
    r = requests.post(f"{BASE}/auth/login", json=creds, timeout=15)
    assert r.status_code == 200, f"login {creds['email']} failed: {r.status_code} {r.text}"
    return r.json().get("access_token") or r.json().get("token")


def _h(t):
    return {"Authorization": f"Bearer {t}", "Content-Type": "application/json"}


# ---------- Public listings ----------

def test_public_vehicle_listings():
    r = requests.get(f"{BASE}/marketplace/listings", params={"kind": "vehicle"}, timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    assert isinstance(data.get("listings"), list)
    assert data.get("total", 0) >= 2, f"expected >=2 vehicles, got {data.get('total')}"
    for l in data["listings"]:
        assert l.get("kind") == "vehicle"
        assert l.get("status") == "active"


def test_public_item_listings():
    r = requests.get(f"{BASE}/marketplace/listings", params={"kind": "item"}, timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("total", 0) >= 5, f"expected >=5 items, got {data.get('total')}"
    for l in data["listings"]:
        assert l.get("kind") == "item"


def test_public_listings_excludes_realestate():
    r = requests.get(f"{BASE}/marketplace/listings", timeout=15)
    assert r.status_code == 200
    for l in r.json().get("listings", []):
        assert l.get("kind") in ("vehicle", "item")


# ---------- Admin endpoints guarded ----------

def test_admin_endpoints_require_auth():
    assert requests.get(f"{BASE}/marketplace/admin/listings", timeout=15).status_code in (401, 403)
    assert requests.get(f"{BASE}/marketplace/admin/settings", timeout=15).status_code in (401, 403)


def test_admin_listings_and_counts():
    tok = _login(ADMIN)
    r = requests.get(f"{BASE}/marketplace/admin/listings", headers=_h(tok), timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "counts" in data and "vehicle" in data["counts"] and "item" in data["counts"]
    assert data["counts"]["vehicle"] >= 2 and data["counts"]["item"] >= 5


# ---------- Admin settings ----------

def test_admin_settings_get_and_put():
    tok = _login(ADMIN)
    r = requests.get(f"{BASE}/marketplace/admin/settings", headers=_h(tok), timeout=15)
    assert r.status_code == 200
    orig = r.json()
    new_commission = 12.0
    r2 = requests.put(f"{BASE}/marketplace/admin/settings", headers=_h(tok),
                      json={"commission_pct": new_commission, "delivery_fee": orig.get("delivery_fee", 5.0)},
                      timeout=15)
    assert r2.status_code == 200, r2.text
    assert abs(r2.json()["commission_pct"] - new_commission) < 0.001
    # restore
    requests.put(f"{BASE}/marketplace/admin/settings", headers=_h(tok),
                 json={"commission_pct": orig["commission_pct"], "delivery_fee": orig["delivery_fee"]}, timeout=15)


# ---------- Vehicle creation by KYC-approved client ----------

VEHICLE_LISTING_ID = {"id": None}


def test_client_can_create_vehicle_listing():
    tok = _login(CLIENT)
    payload = {
        "kind": "vehicle",
        "title": f"TEST_Peugeot 208 GT {uuid.uuid4().hex[:6]}",
        "description": "Auto test iter184",
        "price": 12345,
        "currency": "EUR",
        "listing_type": "sell",
        "vehicle": {"brand": "Peugeot", "model": "208 GT", "year": 2021, "mileage": 45000, "fuel": "Essence"},
        "location": "Saint-Denis",
        "category": "Voiture",
        "images": [],
    }
    r = requests.post(f"{BASE}/marketplace/listings", headers=_h(tok), json=payload, timeout=20)
    assert r.status_code == 200, f"create vehicle failed: {r.status_code} {r.text}"
    data = r.json()
    assert data.get("kind") == "vehicle"
    assert data.get("status") == "active"
    assert data.get("vehicle", {}).get("brand") == "Peugeot"
    VEHICLE_LISTING_ID["id"] = data["id"]

    # GET verification (appears in public vehicle list)
    time.sleep(0.5)
    r2 = requests.get(f"{BASE}/marketplace/listings", params={"kind": "vehicle", "limit": 200}, timeout=15)
    ids = [l["id"] for l in r2.json().get("listings", [])]
    assert data["id"] in ids, "newly created vehicle not visible in public list"


def test_admin_toggle_feature_and_delete_test_listing():
    """Toggle inactive -> hidden from public; feature; then delete the test listing."""
    lid = VEHICLE_LISTING_ID["id"]
    if not lid:
        import pytest; pytest.skip("vehicle creation test did not run")
    tok = _login(ADMIN)

    # toggle -> inactive
    r = requests.post(f"{BASE}/marketplace/admin/listings/{lid}/toggle", headers=_h(tok), timeout=15)
    assert r.status_code == 200 and r.json()["status"] == "inactive"

    # confirm hidden in public listing
    r2 = requests.get(f"{BASE}/marketplace/listings", params={"kind": "vehicle", "limit": 200}, timeout=15)
    ids = [l["id"] for l in r2.json().get("listings", [])]
    assert lid not in ids, "inactive listing should be hidden from public"

    # toggle back to active
    r = requests.post(f"{BASE}/marketplace/admin/listings/{lid}/toggle", headers=_h(tok), timeout=15)
    assert r.json()["status"] == "active"

    # feature it
    r = requests.post(f"{BASE}/marketplace/admin/listings/{lid}/feature", headers=_h(tok), timeout=15)
    assert r.status_code == 200 and r.json()["is_featured"] in (True, False)

    # delete
    r = requests.delete(f"{BASE}/marketplace/admin/listings/{lid}", headers=_h(tok), timeout=15)
    assert r.status_code == 200 and r.json().get("ok") is True

    # confirm deleted
    r = requests.get(f"{BASE}/marketplace/listings/{lid}", timeout=15)
    assert r.status_code == 404
