"""
Iter 87 — Home Categories CMS + hub payment/promo.
"""
import os
import requests

BASE = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001").rstrip("/")
API = f"{BASE}/api"
ADMIN = {"email": os.environ.get("ADMIN_EMAIL", "admin@superapp.com"), "password": os.environ.get("ADMIN_PASSWORD", "SuperAdmin123!")}
USER = {"email": os.environ.get("SEED_TEST_EMAIL", "test2@example.com"), "password": os.environ.get("SEED_TEST_PASSWORD", "TestPass123!")}


def _session(creds):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json=creds)
    assert r.status_code == 200, r.text
    return s


def test_public_categories_seeded():
    r = requests.get(f"{API}/home-categories?section=taxi")
    assert r.status_code == 200, r.text
    d = r.json()
    assert len(d["items"]) >= 16
    assert all(i["status"] == "active" for i in d["items"])
    assert len(d["sections"]) >= 8


def test_admin_crud_and_reorder():
    admin = _session(ADMIN)
    # create
    r = admin.post(f"{API}/home-categories/admin", json={
        "section": "taxi", "label_fr": "Test Cat 87", "icon_name": "Leaf",
        "target_route": "/taxi?mode=electric", "visible_home": True,
    })
    assert r.status_code == 200, r.text
    cid = r.json()["id"]
    assert r.json()["icon_name"] == "Leaf"

    # update + toggle visibility
    r = admin.put(f"{API}/home-categories/admin/{cid}", json={"label_fr": "Test Cat 87 Edit", "visible_home": False})
    assert r.status_code == 200, r.text

    # reorder (just include our id)
    items = admin.get(f"{API}/home-categories/admin").json()["items"]
    taxi_ids = [i["id"] for i in items if i["section"] == "taxi"]
    r = admin.post(f"{API}/home-categories/admin/reorder", json={"ordered_ids": list(reversed(taxi_ids))})
    assert r.status_code == 200, r.text

    # delete
    r = admin.delete(f"{API}/home-categories/admin/{cid}")
    assert r.status_code == 200, r.text


def test_permission_guard():
    user = _session(USER)
    assert user.get(f"{API}/home-categories/admin").status_code == 403
    assert user.post(f"{API}/home-categories/admin", json={"section": "taxi", "label_fr": "x"}).status_code == 403


def test_image_size_guard():
    admin = _session(ADMIN)
    big = "data:image/png;base64," + ("A" * 11_000_001)
    r = admin.post(f"{API}/home-categories/admin", json={"section": "taxi", "label_fr": "Big", "image_url": big})
    assert r.status_code == 413


def test_ride_with_promo_and_payment_method():
    """Hub passes payment_method + coupon_code; ride creation must accept card payment."""
    user = _session(USER)
    payload = {
        "pickup_lat": 48.85, "pickup_lng": 2.35, "pickup_address": "A",
        "dropoff_lat": 48.88, "dropoff_lng": 2.34, "dropoff_address": "B",
        "vehicle_type": "sb", "payment_method": "card", "ride_type": "instant",
    }
    r = user.post(f"{API}/rides", json=payload)
    assert r.status_code == 200, r.text
    assert r.json()["payment_method"] == "card"
