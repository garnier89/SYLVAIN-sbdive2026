"""
Mobile Money payouts (Orange / MTN / Wave) — provider clients + dispatcher + admin flow.

Real provider HTTP is mocked with respx (no money moves). The sandbox mode is
verified to SIMULATE payouts so the full admin flow + UI can be exercised safely.
"""
import os
import uuid
import respx
import httpx
import pytest
import requests
from pymongo import MongoClient

from conftest import run_async
from core.deps import create_access_token

API = os.environ.get("TEST_API_URL", "http://localhost:8001")
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]


def test_eur_to_xof_fixed_peg():
    from core.mobile_money import eur_to_xof
    assert eur_to_xof(1) == 656        # round(655.957)
    assert eur_to_xof(10) == 6560      # round(6559.57)


def test_wave_payout_success_signs_request():
    os.environ["WAVE_API_KEY"] = "wave_ci_prod_TESTKEY"
    os.environ["WAVE_SIGNING_SECRET"] = "wave_ci_AKS_test"

    async def scenario():
        from core.mobile_money import wave_payout
        with respx.mock:
            route = respx.post("https://api.wave.com/v1/payout").mock(
                return_value=httpx.Response(200, json={"id": "pt_123", "status": "succeeded"}))
            res = await wave_payout(6560, "+2250700000000", "Test", "ref1", "idem1")
            assert res["provider_ref"] == "pt_123" and res["status"] == "paid"
            req = route.calls.last.request
            assert req.headers.get("idempotency-key") == "idem1"
            assert "Wave-Signature" in req.headers  # HMAC signature attached
    run_async(scenario())


def test_wave_payout_error_raises():
    os.environ["WAVE_API_KEY"] = "wave_ci_prod_TESTKEY"

    async def scenario():
        from core.mobile_money import wave_payout, PayoutError
        with respx.mock:
            respx.post("https://api.wave.com/v1/payout").mock(
                return_value=httpx.Response(422, json={"error_code": "insufficient-funds",
                                                       "error_message": "Insufficient funds in wallet."}))
            with pytest.raises(PayoutError):
                await wave_payout(100, "+225", "n", "r", "i")
    run_async(scenario())


def test_wave_missing_key_raises():
    os.environ["WAVE_API_KEY"] = ""

    async def scenario():
        from core.mobile_money import wave_payout, PayoutError
        with pytest.raises(PayoutError):
            await wave_payout(100, "+225", "n", "r", "i")
    run_async(scenario())


def test_mtn_payout_returns_processing_with_correct_headers():
    os.environ["MTN_BASE_URL_LIVE"] = "https://proxy.momoapi.mtn.com"
    os.environ["MTN_TARGET_ENV_LIVE"] = "mtnivorycoast"
    os.environ["MTN_DISBURSEMENT_SUBSCRIPTION_KEY_LIVE"] = "subkey"
    os.environ["MTN_API_USER_LIVE"] = "apiuser"
    os.environ["MTN_API_KEY_LIVE"] = "apikey"

    async def scenario():
        from core.mobile_money import mtn_payout
        with respx.mock:
            respx.post("https://proxy.momoapi.mtn.com/disbursement/token/").mock(
                return_value=httpx.Response(200, json={"access_token": "tok", "expires_in": 3600}))
            transfer = respx.post("https://proxy.momoapi.mtn.com/disbursement/v1_0/transfer").mock(
                return_value=httpx.Response(202))
            res = await mtn_payout(6560, "+2250700000000", "ext1", "ref1", "live")
            assert res["status"] == "processing" and res["provider_ref"] == "ref1"
            req = transfer.calls.last.request
            assert req.headers.get("X-Reference-Id") == "ref1"
            assert req.headers.get("X-Target-Environment") == "mtnivorycoast"
    run_async(scenario())


def test_orange_not_configured_raises():
    os.environ["ORANGE_B2C_BASE_LIVE"] = ""

    async def scenario():
        from core.mobile_money import orange_payout, PayoutError
        with pytest.raises(PayoutError):
            await orange_payout(100, "+225", "ext", "live")
    run_async(scenario())


def test_effective_mode_live_requires_enabled():
    async def scenario():
        from core.config import db
        from core.mobile_money import effective_mode, PayoutError, CFG_ID
        await db.payout_provider_config.update_one(
            {"id": CFG_ID}, {"$set": {"id": CFG_ID, "mode": "live", "live_enabled": False}}, upsert=True)
        with pytest.raises(PayoutError):
            await effective_mode()
        await db.payout_provider_config.update_one(
            {"id": CFG_ID}, {"$set": {"mode": "sandbox", "live_enabled": False}})
        assert await effective_mode() == "sandbox"
    run_async(scenario())


def test_execute_payout_sandbox_is_simulated():
    async def scenario():
        from core.config import db
        from core.mobile_money import execute_payout, CFG_ID
        await db.payout_provider_config.update_one(
            {"id": CFG_ID}, {"$set": {"id": CFG_ID, "mode": "sandbox", "live_enabled": False}}, upsert=True)
        req = {"id": "wr_test", "net_amount": 10.0}
        method = {"type": "mobile_money", "provider": "mtn", "mobile_number": "+2250700000000", "holder_name": "X"}
        res = await execute_payout(req, method)
        assert res["simulated"] is True and res["status"] == "paid"
        assert res["amount_xof"] == 6560 and res["mode"] == "sandbox"
    run_async(scenario())


def test_execute_payout_rejects_rib():
    async def scenario():
        from core.mobile_money import execute_payout, PayoutError
        with pytest.raises(PayoutError):
            await execute_payout({"id": "x", "net_amount": 5}, {"type": "rib"})
    run_async(scenario())


def test_admin_send_payout_sandbox_flow():
    """Full admin flow: approved Mobile Money withdrawal → /send → sandbox simulated paid."""
    cli = MongoClient(MONGO_URL)
    db = cli[DB_NAME]
    sfx = uuid.uuid4().hex[:8]
    uid = f"po_user_{sfx}"
    req_id = f"wr_{sfx}"
    db.payout_provider_config.update_one({"id": "default"},
                                         {"$set": {"id": "default", "mode": "sandbox", "live_enabled": False}}, upsert=True)
    db.users.insert_one({"id": uid, "email": f"{uid}@x", "name": "Payout User", "role": "driver"})
    db.payout_methods.insert_one({"id": f"pm_{sfx}", "user_id": uid, "type": "mobile_money",
                                  "provider": "wave", "mobile_number": "+2250700000000",
                                  "holder_name": "Payout User", "status": "approved"})
    db.admin_withdraw_requests.insert_one({"id": req_id, "user_id": uid, "amount": 10.0,
                                           "final_amount": 10.0, "net_amount": 10.0, "status": "approved",
                                           "created_at": "2026-06-10T00:00:00+00:00"})
    from _creds import ADMIN_EMAIL, ADMIN_PASSWORD
    tok = requests.post(f"{API}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15).json()
    token = tok.get("access_token") or tok.get("token")
    h = {"Authorization": f"Bearer {token}"}
    try:
        r = requests.post(f"{API}/api/payouts/admin/withdrawals/{req_id}/send", headers=h, json={}, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["status"] == "paid" and d["simulated"] is True
        assert d["amount_xof"] == 6560 and d["provider"] == "wave"
        # Persisted + idempotent (second send rejected).
        assert db.admin_withdraw_requests.find_one({"id": req_id})["status"] == "paid"
        r2 = requests.post(f"{API}/api/payouts/admin/withdrawals/{req_id}/send", headers=h, json={}, timeout=20)
        assert r2.status_code == 400
    finally:
        db.users.delete_many({"id": uid})
        db.payout_methods.delete_many({"user_id": uid})
        db.admin_withdraw_requests.delete_many({"id": req_id})
        cli.close()
