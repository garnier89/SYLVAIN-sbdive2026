"""Iteration 252 — SB Drive Student Phase 1 E2E HTTP tests.

Covers: admin config GET/PUT, domains CRUD (+409 duplicate),
email OTP request (active vs unlisted domain), document upload + admin
approve/reject lifecycle, discount quote (not verified=0 vs verified=pct),
admin stats, and admin guards (401/403 for non-admin).
"""
import os
import io
import uuid
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://gojek-clone-41.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@superapp.com"
ADMIN_PASS = "SuperAdmin123!"

# Active default domain (seeded)
ACTIVE_UNIV_EMAIL_DOMAIN = "univ-antilles.fr"


def _session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def _login(s, email, password):
    r = s.post(f"{API}/auth/login", json={"email": email, "password": password})
    return r


@pytest.fixture(scope="module")
def admin_client():
    s = _session()
    r = _login(s, ADMIN_EMAIL, ADMIN_PASS)
    if r.status_code != 200:
        pytest.skip(f"Admin login failed: {r.status_code} {r.text[:200]}")
    return s


@pytest.fixture(scope="module")
def user_client():
    """Register a fresh role=user and return logged-in session."""
    s = _session()
    email = f"test_student_{uuid.uuid4().hex[:8]}@example.com"
    password = "StudentPass123!"
    r = s.post(f"{API}/auth/register", json={
        "name": "Test Student",
        "email": email,
        "password": password,
        "role": "user",
    })
    if r.status_code not in (200, 201):
        pytest.skip(f"User register failed: {r.status_code} {r.text[:200]}")
    # Some apps auto-login on register; ensure session by explicit login
    rl = s.post(f"{API}/auth/login", json={"email": email, "password": password})
    if rl.status_code != 200:
        pytest.skip(f"User login failed: {rl.status_code} {rl.text[:200]}")
    me = s.get(f"{API}/auth/me")
    s._test_user_email = email
    s._test_user_id = (me.json() or {}).get("id") if me.status_code == 200 else None
    return s


# -------------------- ADMIN CONFIG --------------------
class TestAdminConfig:
    def test_get_config_defaults(self, admin_client):
        r = admin_client.get(f"{API}/student/admin/config")
        assert r.status_code == 200, r.text
        cfg = r.json()
        # Required keys exist
        for k in ("ride_discount_pct", "advance_discount_pct", "campus_discount_pct", "daily_cap", "monthly_cap"):
            assert k in cfg, f"missing key {k}"

    def test_put_config_updates_and_persists(self, admin_client):
        # Save original
        orig = admin_client.get(f"{API}/student/admin/config").json()
        payload = {"ride_discount_pct": 30.0, "daily_cap": 8.0}
        r = admin_client.put(f"{API}/student/admin/config", json=payload)
        assert r.status_code == 200, r.text
        updated = r.json()
        assert updated["ride_discount_pct"] == 30.0
        assert updated["daily_cap"] == 8.0
        # GET again
        r2 = admin_client.get(f"{API}/student/admin/config")
        assert r2.status_code == 200
        cfg2 = r2.json()
        assert cfg2["ride_discount_pct"] == 30.0
        assert cfg2["daily_cap"] == 8.0
        # Restore originals
        restore = {k: orig.get(k) for k in ("ride_discount_pct", "daily_cap")}
        admin_client.put(f"{API}/student/admin/config", json=restore)


# -------------------- ADMIN DOMAINS --------------------
class TestAdminDomains:
    created_id = None
    test_domain = f"test-{uuid.uuid4().hex[:6]}.edu"

    def test_list_domains(self, admin_client):
        r = admin_client.get(f"{API}/student/admin/domains")
        assert r.status_code == 200, r.text
        data = r.json()
        assert "domains" in data and isinstance(data["domains"], list)

    def test_create_domain(self, admin_client):
        payload = {"domain": self.test_domain, "country": "SN", "label": "Test U", "enabled": True}
        r = admin_client.post(f"{API}/student/admin/domains", json=payload)
        assert r.status_code == 200, r.text
        d = r.json()["domain"]
        assert d["domain"] == self.test_domain
        assert d["country"] == "SN"
        assert d["enabled"] is True
        TestAdminDomains.created_id = d["id"]

    def test_create_duplicate_returns_409(self, admin_client):
        r = admin_client.post(f"{API}/student/admin/domains", json={
            "domain": self.test_domain, "country": "SN", "label": "Dup", "enabled": True})
        assert r.status_code == 409, r.text

    def test_toggle_disable_then_enable(self, admin_client):
        assert TestAdminDomains.created_id, "previous test must create"
        did = TestAdminDomains.created_id
        r = admin_client.put(f"{API}/student/admin/domains/{did}", json={"enabled": False})
        assert r.status_code == 200, r.text
        assert r.json()["domain"]["enabled"] is False
        r = admin_client.put(f"{API}/student/admin/domains/{did}", json={"enabled": True})
        assert r.status_code == 200
        assert r.json()["domain"]["enabled"] is True

    def test_delete_domain(self, admin_client):
        did = TestAdminDomains.created_id
        if not did:
            pytest.skip("no domain created")
        r = admin_client.delete(f"{API}/student/admin/domains/{did}")
        assert r.status_code == 200, r.text
        assert r.json().get("deleted", 0) >= 1
        # verify gone
        listing = admin_client.get(f"{API}/student/admin/domains").json()["domains"]
        assert not any(x.get("id") == did for x in listing)


# -------------------- EMAIL VERIFICATION --------------------
class TestEmailVerify:
    def test_request_with_listed_domain(self, user_client):
        email = f"someone@{ACTIVE_UNIV_EMAIL_DOMAIN}"
        r = user_client.post(f"{API}/student/verify/email/request", json={"email": email})
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("ok") is True
        assert "masked_email" in data and "@" in data["masked_email"]

    def test_request_with_unlisted_domain(self, user_client):
        # Cooldown protection: the previous test may set cooldown but unlisted check is BEFORE cooldown
        r = user_client.post(f"{API}/student/verify/email/request", json={"email": "test@gmail.com"})
        assert r.status_code == 400, r.text


# -------------------- DOCUMENT UPLOAD + ADMIN REVIEW --------------------
class TestDocumentFlow:
    def test_upload_doc_sets_pending(self, user_client):
        # multipart upload
        files = {"file": ("card.png", io.BytesIO(b"fake-image-bytes"), "image/png")}
        # Use a new session without JSON header for multipart
        s = requests.Session()
        s.cookies.update(user_client.cookies)
        r = s.post(f"{API}/student/documents?doc_type=student_card", files=files)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("status") == "pending"
        # verify via /me
        me_r = user_client.get(f"{API}/student/me")
        assert me_r.status_code == 200
        me = me_r.json()
        assert me.get("status") == "pending"
        assert len(me.get("documents", [])) >= 1

    def test_admin_approve_sets_verified(self, admin_client, user_client):
        uid = user_client._test_user_id
        assert uid, "user id required"
        r = admin_client.post(f"{API}/student/admin/{uid}/approve")
        assert r.status_code == 200, r.text
        assert r.json().get("status") == "verified"
        # verify
        me = user_client.get(f"{API}/student/me").json()
        assert me["status"] == "verified"
        assert me["badge"] is True

    def test_discount_quote_verified(self, user_client, admin_client):
        # Restore default ride pct 20 just in case
        admin_client.put(f"{API}/student/admin/config", json={"ride_discount_pct": 20.0, "daily_cap": 5.0, "monthly_cap": 50.0, "enabled": True})
        r = user_client.get(f"{API}/student/discount/quote", params={"amount": 20, "kind": "ride"})
        assert r.status_code == 200, r.text
        q = r.json()
        # 20% of 20 = 4.0, under daily cap 5
        assert q["amount"] == 4.0
        assert q["pct"] == 20.0
        assert q["eligible"] is True

    def test_admin_reject_sets_rejected(self, admin_client, user_client):
        uid = user_client._test_user_id
        r = admin_client.post(f"{API}/student/admin/{uid}/reject", json={"reason": "test reject"})
        assert r.status_code == 200, r.text
        assert r.json().get("status") == "rejected"
        me = user_client.get(f"{API}/student/me").json()
        assert me["status"] == "rejected"


# -------------------- DISCOUNT QUOTE (NOT VERIFIED) --------------------
class TestDiscountQuoteNotVerified:
    def test_not_verified_returns_zero(self):
        # Fresh user
        s = _session()
        email = f"nv_{uuid.uuid4().hex[:8]}@example.com"
        s.post(f"{API}/auth/register", json={"name": "NV", "email": email, "password": "Pass1234!", "role": "user"})
        s.post(f"{API}/auth/login", json={"email": email, "password": "Pass1234!"})
        r = s.get(f"{API}/student/discount/quote", params={"amount": 20, "kind": "ride"})
        assert r.status_code == 200, r.text
        q = r.json()
        assert q["amount"] == 0.0
        assert q["eligible"] is False


# -------------------- STATS --------------------
class TestStats:
    def test_admin_stats_shape(self, admin_client):
        r = admin_client.get(f"{API}/student/admin/stats")
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ("enrolled", "verified", "pending", "rejected",
                  "student_rides", "discount_used_month", "discount_used_total",
                  "verification_rate", "active_domains"):
            assert k in d, f"missing stats key {k}"


# -------------------- ADMIN GUARDS --------------------
class TestGuards:
    def test_unauthenticated_blocked(self):
        s = requests.Session()
        r = s.get(f"{API}/student/admin/config")
        assert r.status_code in (401, 403), f"expected 401/403, got {r.status_code}"

    def test_user_role_blocked(self, user_client):
        for ep in ("/student/admin/config", "/student/admin/domains", "/student/admin/stats"):
            r = user_client.get(f"{API}{ep}")
            assert r.status_code in (401, 403), f"{ep} expected 401/403, got {r.status_code}"
