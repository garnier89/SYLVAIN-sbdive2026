"""Iter296 — Tests e2e Phase 1 : édition Marketplace, boost payant Marketplace, favoris (immo+marketplace)."""
import os
import uuid
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://gojek-clone-41.preview.emergentagent.com").rstrip("/")
USER_EMAIL = "paul.vendeur@example.com"
USER_PASSWORD = "Test1234!"
ADMIN_EMAIL = "admin@superapp.com"
ADMIN_PASSWORD = "SuperAdmin123!"


def _login(email, password):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"Login failed {email}: {r.status_code} {r.text}"
    return r.json()["access_token"], r.json()["user"]


def _h(t):
    return {"Authorization": f"Bearer {t}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def ctx():
    ut, user = _login(USER_EMAIL, USER_PASSWORD)
    at, admin = _login(ADMIN_EMAIL, ADMIN_PASSWORD)
    try:
        requests.post(f"{BASE_URL}/api/admin/wallet/credit", headers=_h(at),
                      json={"user_id": user["id"], "amount": 50, "description": "TEST_iter296"}, timeout=10)
    except Exception:
        pass
    # KYC approuvé requis pour vendre → on l'assure en base (setup de test)
    import asyncio
    from motor.motor_asyncio import AsyncIOMotorClient
    from dotenv import load_dotenv
    load_dotenv()
    mc = AsyncIOMotorClient(os.environ["MONGO_URL"])
    mdb = mc[os.environ["DB_NAME"]]

    async def _approve_kyc():
        await mdb.kyc_documents.update_one(
            {"user_id": user["id"]},
            {"$set": {"user_id": user["id"], "status": "approved"}}, upsert=True)
    asyncio.get_event_loop().run_until_complete(_approve_kyc())

    # créer une annonce marketplace (véhicule à vendre)
    r = requests.post(f"{BASE_URL}/api/marketplace/listings", headers=_h(ut),
                      json={"title": f"TEST296 {uuid.uuid4().hex[:5]}", "description": "test", "price": 5000,
                            "kind": "vehicle", "category": "voiture", "listing_type": "sell",
                            "location": "Fort-de-France", "images": ["http://x/1.jpg"],
                            "vehicle": {"make": "Renault", "model": "Clio", "year": 2020}}, timeout=15)
    assert r.status_code in (200, 201), r.text
    listing_id = r.json().get("id") or r.json().get("listing", {}).get("id")
    assert listing_id
    yield {"ut": ut, "at": at, "user_id": user["id"], "listing_id": listing_id}
    try:
        requests.delete(f"{BASE_URL}/api/marketplace/listings/{listing_id}", headers=_h(ut), timeout=10)
    except Exception:
        pass


def test_edit_listing(ctx):
    r = requests.put(f"{BASE_URL}/api/marketplace/listings/{ctx['listing_id']}", headers=_h(ctx["ut"]),
                     json={"title": "TEST296 modifié", "price": 4500, "listing_type": "rent", "rent_period": "day"}, timeout=15)
    assert r.status_code == 200, r.text
    g = requests.get(f"{BASE_URL}/api/marketplace/listings/{ctx['listing_id']}", headers=_h(ctx["ut"]), timeout=10)
    d = g.json()
    assert d["title"] == "TEST296 modifié" and float(d["price"]) == 4500 and d["listing_type"] == "rent"


def test_edit_forbidden_for_non_owner(ctx):
    other_email = "marie.user@example.com"
    try:
        ot, _ = _login(other_email, "Test1234!")
    except AssertionError:
        pytest.skip("compte secondaire indisponible")
    r = requests.put(f"{BASE_URL}/api/marketplace/listings/{ctx['listing_id']}", headers=_h(ot),
                     json={"title": "hack"}, timeout=15)
    assert r.status_code == 403


def test_boost_plans_listed(ctx):
    r = requests.get(f"{BASE_URL}/api/marketplace/boost-plans?country=MQ", headers=_h(ctx["ut"]), timeout=10)
    assert r.status_code == 200 and len(r.json()) >= 1


def test_boost_pay_features_listing(ctx):
    plans = requests.get(f"{BASE_URL}/api/marketplace/boost-plans?country=default", headers=_h(ctx["ut"]), timeout=10).json()
    cheapest = sorted(plans, key=lambda p: p["price"])[0]
    r = requests.post(f"{BASE_URL}/api/marketplace/listings/{ctx['listing_id']}/boost/pay", headers=_h(ctx["ut"]),
                      json={"plan_id": cheapest["id"]}, timeout=15)
    assert r.status_code == 200, r.text
    assert r.json().get("success") is True
    g = requests.get(f"{BASE_URL}/api/marketplace/listings/{ctx['listing_id']}", headers=_h(ctx["ut"]), timeout=10)
    assert g.json().get("is_featured") is True


def test_favorites_toggle_and_list(ctx):
    # marketplace favori
    r = requests.post(f"{BASE_URL}/api/favorites/toggle", headers=_h(ctx["ut"]),
                      json={"item_type": "marketplace", "item_id": ctx["listing_id"]}, timeout=10)
    assert r.status_code == 200 and r.json()["favorited"] is True
    ids = requests.get(f"{BASE_URL}/api/favorites/ids?item_type=marketplace", headers=_h(ctx["ut"]), timeout=10).json()
    assert ctx["listing_id"] in ids["ids"]
    lst = requests.get(f"{BASE_URL}/api/favorites?item_type=marketplace", headers=_h(ctx["ut"]), timeout=10).json()
    assert any(f["item_id"] == ctx["listing_id"] for f in lst["favorites"])
    # untoggle
    r2 = requests.post(f"{BASE_URL}/api/favorites/toggle", headers=_h(ctx["ut"]),
                       json={"item_type": "marketplace", "item_id": ctx["listing_id"]}, timeout=10)
    assert r2.json()["favorited"] is False
    ids2 = requests.get(f"{BASE_URL}/api/favorites/ids?item_type=marketplace", headers=_h(ctx["ut"]), timeout=10).json()
    assert ctx["listing_id"] not in ids2["ids"]


def test_favorites_invalid_type(ctx):
    r = requests.post(f"{BASE_URL}/api/favorites/toggle", headers=_h(ctx["ut"]),
                      json={"item_type": "bogus", "item_id": "x"}, timeout=10)
    assert r.status_code == 400
