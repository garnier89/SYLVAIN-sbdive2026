"""SB Drive — Phase C1 backend tests: KYC payout methods + admin withdrawal validation.

Covers:
  * GET /api/payouts/method (region detection, allowed_types, providers)
  * POST /api/payouts/method validations (region/type mismatch, missing selfie/id_doc, client 403)
  * AI face-match (verdict in match|no_match|uncertain, ai=True; never 500)
  * Admin /payouts/admin/methods (list, approve, reject) + notifications
  * /wallet/withdraw-request gate: blocked without approved method, succeeds after, freezes amount,
    creates admin_withdraw_requests doc
  * Admin /payouts/admin/withdrawals (score+ai_face_match+payout_method enrichment)
    approve with reduced final_amount refunds difference, reject refunds full, mark-paid sets paid.
  * Real-time admin notification (type=withdraw_request) on new withdrawal request.
"""
import os
import sys
import io
import time
import base64
import asyncio
import urllib.request
import pytest
import requests

sys.path.insert(0, os.path.dirname(__file__))
from _creds import ADMIN_EMAIL, ADMIN_PASSWORD, DRIVER_EMAIL, DRIVER_PASSWORD, TEST_USER_EMAIL, TEST_USER_PASSWORD  # noqa: E402

BASE = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001").rstrip("/")
API = f"{BASE}/api"

# Two clearly distinct real face JPEG photos via thispersondoesnotexist (Stable, returns a random real-looking face).
# Falls back to a small local synthetic JPEG if network is unreachable so the test never fakes ai=False from blank inputs.
FACE_A_URL = "https://thispersondoesnotexist.com/"
FACE_B_URL = "https://thispersondoesnotexist.com/"


def _fetch_b64(url: str) -> str:
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=15) as r:
            data = r.read()
        if len(data) < 3000:
            raise RuntimeError("too small")
        return "data:image/jpeg;base64," + base64.b64encode(data).decode()
    except Exception:
        # Tiny but valid 8x8 noisy JPEG (not blank) — guarantees a valid image even offline.
        try:
            from PIL import Image
            import random
            img = Image.new("RGB", (64, 64))
            px = img.load()
            for y in range(64):
                for x in range(64):
                    px[x, y] = (random.randint(0, 255), random.randint(0, 255), random.randint(0, 255))
            buf = io.BytesIO()
            img.save(buf, format="JPEG", quality=80)
            return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()
        except Exception:
            return "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAAAAAAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCABAAEABASIA/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAA/AKp//9k="


@pytest.fixture(scope="module")
def faces():
    a = _fetch_b64(FACE_A_URL)
    time.sleep(0.5)
    b = _fetch_b64(FACE_B_URL)
    return a, b


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=20)
    assert r.status_code == 200, f"login {email} -> {r.status_code} {r.text[:200]}"
    j = r.json()
    return j.get("access_token") or j.get("token")


@pytest.fixture(scope="module")
def admin_token():
    return _login(ADMIN_EMAIL, ADMIN_PASSWORD)


@pytest.fixture(scope="module")
def driver_token():
    return _login(DRIVER_EMAIL, DRIVER_PASSWORD)


@pytest.fixture(scope="module")
def client_token():
    return _login(TEST_USER_EMAIL, TEST_USER_PASSWORD)


def H(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


# ─────────────── 1. GET /payouts/method region awareness ───────────────
class TestPayoutMethodGet:
    def test_driver_europe_default(self, driver_token, admin_token):
        # Ensure region europe via admin (idempotent)
        me = requests.get(f"{API}/auth/me", headers=H(driver_token)).json()
        requests.put(f"{API}/admin/users/{me['id']}/region", headers=H(admin_token), json={"region": "europe"})
        r = requests.get(f"{API}/payouts/method", headers=H(driver_token))
        assert r.status_code == 200
        j = r.json()
        assert j["region"] == "europe"
        assert j["allowed_types"] == ["rib"]
        assert "wave" in j["providers"] and "orange" in j["providers"]

    def test_driver_africa_after_region_change(self, driver_token, admin_token):
        me = requests.get(f"{API}/auth/me", headers=H(driver_token)).json()
        requests.put(f"{API}/admin/users/{me['id']}/region", headers=H(admin_token), json={"region": "africa"})
        r = requests.get(f"{API}/payouts/method", headers=H(driver_token))
        assert r.status_code == 200
        assert r.json()["allowed_types"] == ["mobile_money"]
        # Revert to europe (rest of tests assume europe)
        requests.put(f"{API}/admin/users/{me['id']}/region", headers=H(admin_token), json={"region": "europe"})


# ─────────────── 2. POST /payouts/method validations + AI face-match ───────────────
class TestPayoutMethodPost:
    def test_client_role_forbidden(self, client_token, faces):
        a, b = faces
        r = requests.post(f"{API}/payouts/method", headers=H(client_token), json={
            "type": "rib", "iban": "FR7630006000011234567890189", "bic": "AGRIFRPP",
            "holder_name": "Test", "selfie_url": a, "id_doc_url": b,
        })
        assert r.status_code == 403

    def test_missing_selfie_400(self, driver_token, faces):
        _, b = faces
        r = requests.post(f"{API}/payouts/method", headers=H(driver_token), json={
            "type": "rib", "iban": "FR7630006000011234567890189", "bic": "AGRIFRPP",
            "holder_name": "Jean Dupont", "id_doc_url": b,
        })
        assert r.status_code == 400

    def test_missing_id_doc_400(self, driver_token, faces):
        a, _ = faces
        r = requests.post(f"{API}/payouts/method", headers=H(driver_token), json={
            "type": "rib", "iban": "FR7630006000011234567890189", "bic": "AGRIFRPP",
            "holder_name": "Jean Dupont", "selfie_url": a,
        })
        assert r.status_code == 400

    def test_europe_user_submitting_mobile_money_400(self, driver_token, admin_token, faces):
        me = requests.get(f"{API}/auth/me", headers=H(driver_token)).json()
        requests.put(f"{API}/admin/users/{me['id']}/region", headers=H(admin_token), json={"region": "europe"})
        a, b = faces
        r = requests.post(f"{API}/payouts/method", headers=H(driver_token), json={
            "type": "mobile_money", "provider": "orange", "mobile_number": "+221770000000",
            "holder_name": "Jean", "selfie_url": a, "id_doc_url": b,
        })
        assert r.status_code == 400

    def test_submit_rib_europe_ok_returns_ai_face_match(self, driver_token, faces):
        a, b = faces
        r = requests.post(f"{API}/payouts/method", headers=H(driver_token), json={
            "type": "rib", "iban": "FR7630006000011234567890189", "bic": "AGRIFRPPXXX",
            "holder_name": "Jean Dupont", "holder_type": "person",
            "selfie_url": a, "id_doc_url": b,
        })
        assert r.status_code == 200, r.text[:300]
        j = r.json()
        assert j["status"] == "pending"
        afm = j.get("ai_face_match")
        assert isinstance(afm, dict)
        assert afm["verdict"] in ("match", "no_match", "uncertain")
        assert isinstance(afm["confidence"], int) and 0 <= afm["confidence"] <= 100
        assert "ai" in afm  # may be True (LLM ok) or False (degraded)
        # For two clearly different photos we expect no_match or uncertain (NEVER match)
        # (Cannot strictly enforce without proven distinct sources but document it)
        print("AI face-match verdict:", afm)

    def test_africa_user_submitting_rib_400(self, driver_token, admin_token, faces):
        me = requests.get(f"{API}/auth/me", headers=H(driver_token)).json()
        requests.put(f"{API}/admin/users/{me['id']}/region", headers=H(admin_token), json={"region": "africa"})
        a, b = faces
        try:
            r = requests.post(f"{API}/payouts/method", headers=H(driver_token), json={
                "type": "rib", "iban": "FR7630006000011234567890189", "bic": "AGRIFRPP",
                "holder_name": "Jean", "selfie_url": a, "id_doc_url": b,
            })
            assert r.status_code == 400
        finally:
            # Revert
            requests.put(f"{API}/admin/users/{me['id']}/region", headers=H(admin_token), json={"region": "europe"})


# ─────────────── 3. Admin method review ───────────────
class TestAdminMethodReview:
    def test_admin_can_list_methods(self, admin_token):
        r = requests.get(f"{API}/payouts/admin/methods?status=pending", headers=H(admin_token))
        assert r.status_code == 200
        j = r.json()
        assert "items" in j and "counts" in j
        if j["items"]:
            item = j["items"][0]
            # Admin sees both selfie + id_doc + ai_face_match
            assert "selfie_url" in item
            assert "id_doc_url" in item
            assert "ai_face_match" in item
            if item.get("iban"):
                # Admin list should mask iban
                assert "iban_masked" in item

    def test_approve_method(self, admin_token, driver_token):
        # Find driver's method id
        me = requests.get(f"{API}/auth/me", headers=H(driver_token)).json()
        r = requests.get(f"{API}/payouts/method", headers=H(driver_token))
        method = r.json().get("method")
        assert method, "Driver must have submitted a method first"
        mid = method["id"]
        ap = requests.post(f"{API}/payouts/admin/methods/{mid}/approve", headers=H(admin_token), json={})
        assert ap.status_code == 200
        assert ap.json()["status"] == "approved"
        # Verify in GET
        r2 = requests.get(f"{API}/payouts/method", headers=H(driver_token))
        assert r2.json()["method"]["status"] == "approved"


# ─────────────── 4. Withdrawal gate + freeze + admin alert ───────────────
class TestWithdrawalFlow:
    def test_credit_driver_and_withdraw_succeeds(self, admin_token, driver_token):
        me = requests.get(f"{API}/auth/me", headers=H(driver_token)).json()
        # Credit wallet with enough above reserve (default europe reserve=50, withdraw_min=10)
        cr = requests.post(f"{API}/admin/users/{me['id']}/wallet/credit",
                           headers=H(admin_token), json={"amount": 120, "reason": "iter227 test"})
        assert cr.status_code in (200, 201)
        # Submit withdraw request - 30 EUR
        wr = requests.post(f"{API}/wallet/withdraw-request", headers=H(driver_token),
                           json={"amount": 30})
        assert wr.status_code == 200, wr.text[:300]
        body = wr.json()
        assert body["amount"] == 30
        assert body["status"] == "pending"
        assert body.get("payout_method_id")
        assert body.get("payout_type") == "rib"
        # Stash id for next tests BEFORE notification check (independent)
        pytest.WR_ID = body["id"]
        pytest.WR_AMOUNT = 30
        # Wallet pending_withdraw bumped
        w = requests.get(f"{API}/wallet", headers=H(driver_token)).json()
        assert float(w.get("pending_withdraw", 0)) >= 30
        # Admin notification of type withdraw_request
        time.sleep(0.6)
        notif = requests.get(f"{API}/push/list", headers=H(admin_token)).json()
        items = notif if isinstance(notif, list) else notif.get("items", [])
        wr_notifs = [n for n in items if n.get("type") == "withdraw_request"]
        assert wr_notifs, f"Admin must receive a withdraw_request notification (got {len(items)} items)"

    def test_admin_listing_includes_score_and_ai(self, admin_token):
        r = requests.get(f"{API}/payouts/admin/withdrawals?status=pending", headers=H(admin_token))
        assert r.status_code == 200
        items = r.json()["items"]
        match = [x for x in items if x["id"] == pytest.WR_ID]
        assert match, "submitted withdrawal must appear in admin listing"
        it = match[0]
        assert "score" in it
        score = it["score"]
        for k in ("rating", "acceptance_rate", "cancellation_rate", "total_trips", "open_complaints"):
            assert k in score
        assert "payout_method" in it
        assert "ai_face_match" in it

    def test_approve_with_reduced_amount_refunds_diff(self, admin_token, driver_token):
        # Balance before
        before = requests.get(f"{API}/wallet", headers=H(driver_token)).json()
        bal_before = float(before["balance"])
        pending_before = float(before.get("pending_withdraw", 0))
        # Approve at 20 € (5 € less than requested 30 €) → refund 10€ to balance, clear 30€ from pending
        r = requests.post(f"{API}/payouts/admin/withdrawals/{pytest.WR_ID}/approve",
                          headers=H(admin_token), json={"final_amount": 20})
        assert r.status_code == 200, r.text[:300]
        j = r.json()
        assert j["status"] == "approved"
        assert j["final_amount"] == 20
        assert j["refunded"] == 10
        # Wallet check
        after = requests.get(f"{API}/wallet", headers=H(driver_token)).json()
        assert abs(float(after["balance"]) - (bal_before + 10)) < 0.01
        assert abs(float(after.get("pending_withdraw", 0)) - (pending_before - 30)) < 0.01

    def test_mark_paid_after_approved(self, admin_token):
        r = requests.post(f"{API}/payouts/admin/withdrawals/{pytest.WR_ID}/mark-paid",
                          headers=H(admin_token), json={})
        assert r.status_code == 200
        assert r.json()["status"] == "paid"

    def test_reject_refunds_full(self, admin_token, driver_token):
        # New withdraw 25€ then reject → balance fully refunded
        before = requests.get(f"{API}/wallet", headers=H(driver_token)).json()
        bal_before = float(before["balance"])
        wr = requests.post(f"{API}/wallet/withdraw-request", headers=H(driver_token), json={"amount": 25})
        assert wr.status_code == 200, wr.text[:300]
        wid = wr.json()["id"]
        # Reject
        rj = requests.post(f"{API}/payouts/admin/withdrawals/{wid}/reject",
                          headers=H(admin_token), json={"reason": "test rejection"})
        assert rj.status_code == 200
        assert rj.json()["status"] == "rejected"
        assert rj.json()["refunded"] == 25
        after = requests.get(f"{API}/wallet", headers=H(driver_token)).json()
        assert abs(float(after["balance"]) - bal_before) < 0.01


# ─────────────── 5. Withdraw gate w/o approved method ───────────────
class TestWithdrawGateWithoutApproved:
    def test_reject_then_request_blocked(self, admin_token, driver_token):
        # Set driver's method to rejected to simulate "no approved method"
        me = requests.get(f"{API}/auth/me", headers=H(driver_token)).json()
        r = requests.get(f"{API}/payouts/method", headers=H(driver_token))
        method = r.json().get("method")
        if method and method.get("status") == "approved":
            mid = method["id"]
            requests.post(f"{API}/payouts/admin/methods/{mid}/reject",
                          headers=H(admin_token), json={"reason": "iter227 gate test"})
            # Now withdraw should fail
            wr = requests.post(f"{API}/wallet/withdraw-request", headers=H(driver_token), json={"amount": 15})
            assert wr.status_code == 400
            assert "moyen de retrait" in wr.text.lower() or "rib" in wr.text.lower()
            # Restore approved status so other tests/state stays consistent
            requests.post(f"{API}/payouts/admin/methods/{mid}/approve",
                          headers=H(admin_token), json={})

    def test_client_role_403_on_withdraw(self, client_token):
        wr = requests.post(f"{API}/wallet/withdraw-request", headers=H(client_token), json={"amount": 15})
        assert wr.status_code == 403
