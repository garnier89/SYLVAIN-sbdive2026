"""iter188 — UX growth (referral nudge): GET /api/referral/my-pending.

Covers:
  • GET /referral/my-pending requires auth (401/403 when unauth)
  • Fresh user → {pending: false}
  • Client B applies Client A's referral code (POST /referral/apply) →
    Client B's my-pending returns {pending:true, remaining:1, reward_amount:5, currency:'EUR'}
"""
import os
import time
import uuid

import pytest
import requests


def _load_backend_url():
    url = os.environ.get("REACT_APP_BACKEND_URL")
    if url:
        return url.rstrip("/")
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                return line.split("=", 1)[1].strip().rstrip("/")
    raise RuntimeError("REACT_APP_BACKEND_URL not set")


BASE_URL = _load_backend_url()
API = f"{BASE_URL}/api"


def _post(path, token=None, json=None):
    h = {"Content-Type": "application/json"}
    if token:
        h["Authorization"] = f"Bearer {token}"
    return requests.post(f"{API}{path}", json=json or {}, headers=h, timeout=30)


def _get(path, token=None):
    h = {}
    if token:
        h["Authorization"] = f"Bearer {token}"
    return requests.get(f"{API}{path}", headers=h, timeout=30)


def _register(name="UX Tester", role="user"):
    suffix = uuid.uuid4().hex[:8]
    payload = {
        "name": name,
        "email": f"test_iter188_{suffix}@example.com",
        "password": "TestPass123!",
        "phone": f"+3361{int(time.time() * 1000) % 100000000:08d}",
        "role": role,
    }
    r = _post("/auth/register", json=payload)
    assert r.status_code in (200, 201), f"register: {r.status_code} {r.text}"
    data = r.json()
    token = data.get("access_token") or data.get("token")
    user = data.get("user", {})
    return {"token": token, "user": user, "email": payload["email"]}


# ───────── tests ─────────

class TestReferralMyPending:
    def test_unauth_forbidden(self):
        r = _get("/referral/my-pending")
        assert r.status_code in (401, 403), r.text

    def test_fresh_user_returns_pending_false(self):
        u = _register("Fresh Pending User")
        r = _get("/referral/my-pending", token=u["token"])
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("pending") is False, data

    def test_apply_code_then_pending_true_with_progress(self):
        # 1. Register Client A (referrer) — get his code
        a = _register("Referrer A")
        code_resp = _get("/referral/my-code", token=a["token"])
        assert code_resp.status_code == 200, code_resp.text
        code = code_resp.json().get("code")
        assert code and len(code) > 0

        # 2. Register Client B (referee) and apply A's code
        b = _register("Referee B")
        ap = _post("/referral/apply", token=b["token"], json={"code": code})
        assert ap.status_code == 200, ap.text
        ap_data = ap.json()
        # Expected client→client default: 5 EUR, 1 ride required
        assert ap_data.get("status") == "pending"
        assert float(ap_data.get("reward_amount", 0)) == 5.0
        assert int(ap_data.get("rides_required", 0)) == 1
        assert ap_data.get("currency") == "EUR"

        # 3. B's my-pending should now be pending:true remaining:1
        r = _get("/referral/my-pending", token=b["token"])
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("pending") is True, d
        assert int(d.get("remaining", -1)) == 1
        assert int(d.get("rides_required", -1)) == 1
        assert int(d.get("referred_ride_count", -1)) == 0
        assert float(d.get("reward_amount", 0)) == 5.0
        assert d.get("currency") == "EUR"
        assert d.get("referrer_name", "") == "Referrer A"

        # 4. A's own my-pending must remain false (A is the referrer, not referee)
        r2 = _get("/referral/my-pending", token=a["token"])
        assert r2.status_code == 200
        assert r2.json().get("pending") is False
