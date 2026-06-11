"""Iter257 — e2e HTTP tests for SB Student Marketplace (Phase 6)."""
import os
import uuid
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://gojek-clone-41.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"
SELLER_EMAIL = "test2@example.com"
SELLER_PW = "TestPass123!"


def _session_login(email, password):
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, f"login {email} failed: {r.status_code} {r.text}"
    return s


def _register_and_login(prefix="buyer"):
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    email = f"TEST_iter257_{prefix}_{uuid.uuid4().hex[:8]}@test.sb"
    pw = "Test1234!@#"
    r = s.post(f"{API}/auth/register",
               json={"email": email, "password": pw, "name": f"Test {prefix}", "phone": f"+3367{uuid.uuid4().int % 10000000:07d}"},
               timeout=30)
    assert r.status_code in (200, 201), f"register failed: {r.status_code} {r.text}"
    # auto-login? try login if cookie not set
    if "session" not in s.cookies and "access_token" not in s.cookies:
        r2 = s.post(f"{API}/auth/login", json={"email": email, "password": pw}, timeout=30)
        assert r2.status_code == 200
    return s, email


@pytest.fixture(scope="module")
def seller():
    return _session_login(SELLER_EMAIL, SELLER_PW)


@pytest.fixture(scope="module")
def buyer():
    s, _ = _register_and_login("buyer")
    # top up buyer wallet
    r = s.post(f"{API}/wallet/topup", json={"amount": 200.0}, timeout=30)
    # tolerate alternative endpoints
    if r.status_code not in (200, 201):
        # try alternate
        r2 = s.post(f"{API}/wallet/deposit", json={"amount": 200.0}, timeout=30)
        assert r2.status_code in (200, 201), f"topup failed: {r.status_code} {r.text} / {r2.status_code} {r2.text}"
    return s


# 1) categories
def test_categories(seller):
    r = seller.get(f"{API}/student/marketplace/categories", timeout=30)
    assert r.status_code == 200, r.text
    j = r.json()
    slugs = {c["slug"] for c in j["categories"]}
    assert slugs == {"livres", "logement", "coloc", "materiel", "services"}
    assert "conditions" in j and "neuf" in j["conditions"]


# 2) verified-student gate (non-student gets 403)
def test_create_listing_non_student_forbidden():
    s, _ = _register_and_login("nonstu")
    body = {"category": "livres", "title": "TEST_iter257 Manuel Droit", "description": "test", "price": 10.0, "condition": "bon"}
    r = s.post(f"{API}/student/marketplace/listings", json=body, timeout=30)
    assert r.status_code == 403, f"expected 403, got {r.status_code} {r.text}"


# 3) verified student can publish
def test_create_listing_verified_ok(seller):
    body = {
        "category": "livres",
        "title": f"TEST_iter257 Livre {uuid.uuid4().hex[:6]}",
        "description": "Manuel en bon état",
        "price": 15.0, "condition": "bon", "location": "Schoelcher",
    }
    r = seller.post(f"{API}/student/marketplace/listings", json=body, timeout=30)
    assert r.status_code == 200, r.text
    j = r.json()
    assert j["ok"] is True
    assert j["listing"]["id"].startswith("slist_")
    assert j["listing"]["status"] == "active"
    assert j["listing"]["category_label"] == "Livres & manuels"


# 4) buy flow with wallet debit/credit/sold + second buy = 400
def test_buy_flow_full(seller, buyer):
    # seller creates a listing
    title = f"TEST_iter257 BuyFlow {uuid.uuid4().hex[:6]}"
    r = seller.post(f"{API}/student/marketplace/listings",
                    json={"category": "materiel", "title": title, "price": 25.0, "condition": "bon", "description": "iter257"},
                    timeout=30)
    assert r.status_code == 200, r.text
    lid = r.json()["listing"]["id"]

    # buyer balance before
    rb = buyer.get(f"{API}/wallet", timeout=30)
    assert rb.status_code == 200, rb.text
    bal_before = float(rb.json().get("balance", 0))
    assert bal_before >= 25.0, f"buyer needs >=25€, got {bal_before}"

    # seller balance before
    rs = seller.get(f"{API}/wallet", timeout=30)
    assert rs.status_code == 200, rs.text
    sbal_before = float(rs.json().get("balance", 0))

    # buy
    r = buyer.post(f"{API}/student/marketplace/listings/{lid}/buy", timeout=30)
    assert r.status_code == 200, r.text
    j = r.json()
    assert j["ok"] is True
    assert j["order"]["amount"] == 25.0
    assert j["order"]["status"] == "paid"
    expected_buyer_bal = round(bal_before - 25.0, 2)
    assert abs(j["balance"] - expected_buyer_bal) < 0.01

    # verify buyer wallet debited
    rb2 = buyer.get(f"{API}/wallet", timeout=30)
    assert abs(float(rb2.json()["balance"]) - expected_buyer_bal) < 0.01

    # verify seller wallet credited full amount (no commission)
    rs2 = seller.get(f"{API}/wallet", timeout=30)
    assert abs(float(rs2.json()["balance"]) - (sbal_before + 25.0)) < 0.01

    # listing now sold
    rl = seller.get(f"{API}/student/marketplace/listings/{lid}", timeout=30)
    assert rl.status_code == 200
    assert rl.json()["status"] == "sold"

    # second buy fails
    r2 = buyer.post(f"{API}/student/marketplace/listings/{lid}/buy", timeout=30)
    assert r2.status_code == 400
    assert "disponible" in r2.json().get("detail", "").lower()


# 5) AI suggest
def test_ai_suggest(seller):
    body = {"category": "livres", "title": "Manuel Droit Civil L1 Dalloz", "condition": "bon", "details": "Édition 2022, peu annoté"}
    r = seller.post(f"{API}/student/marketplace/ai/suggest", json=body, timeout=90)
    assert r.status_code == 200, r.text
    j = r.json()
    assert isinstance(j.get("suggested_price"), (int, float)) and j["suggested_price"] > 0
    assert j.get("price_low") is not None and j.get("price_high") is not None
    assert isinstance(j.get("description"), str) and len(j["description"]) > 10
    assert isinstance(j.get("tips"), str)


# 6) AI search grounded
def test_ai_search_grounded(seller):
    # ensure at least one active listing exists
    seller.post(f"{API}/student/marketplace/listings",
                json={"category": "livres", "title": f"TEST_iter257 AIsearch livre {uuid.uuid4().hex[:6]}",
                      "price": 8.0, "condition": "bon", "description": "Manuel mathematiques"}, timeout=30)
    r = seller.post(f"{API}/student/marketplace/ai/search",
                    json={"query": "je cherche un manuel pas cher"}, timeout=90)
    assert r.status_code == 200, r.text
    j = r.json()
    assert isinstance(j.get("reply"), str) and len(j["reply"]) > 0
    assert isinstance(j.get("listings"), list)
    # grounded: every returned listing must be a real one (have an id starting with slist_)
    for l in j["listings"]:
        assert l.get("id", "").startswith("slist_"), f"hallucinated listing: {l}"
    # category may be 'livres' or None
    assert j.get("category") in (None, "livres", "logement", "coloc", "materiel", "services")
