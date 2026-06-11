"""In-process tests for the SBPAYGO Connect foundation (SB Drive side).

Validates the FEATURE-GATED OAuth2 + charge-fallback wrapper:
- Disabled by default (no env) -> every helper is a safe no-op.
- Fully configured -> authorize URL built, token exchange stores tokens,
  charge proxy debits the external balance via the (mocked) partner API.
- Defensive: partner timeout / HTTP error never raises; returns success=False.
"""
import asyncio
import uuid

import httpx
import respx

from core.config import db
import routes.sbpaygo_connect as sc


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


_ENV = {
    "SBPAYGO_ENABLED": "true",
    "SBPAYGO_CLIENT_ID": "cid_test",
    "SBPAYGO_CLIENT_SECRET": "secret_test",
    "SBPAYGO_AUTHORIZE_URL": "https://sbpaygo.test/oauth/authorize",
    "SBPAYGO_TOKEN_URL": "https://sbpaygo.test/oauth/token",
    "SBPAYGO_CHARGE_URL": "https://sbpaygo.test/payments/charge",
    "SBPAYGO_REDIRECT_URI": "https://drive.test/api/connect/oauth/callback",
    "FRONTEND_URL": "https://drive.test",
}


def _enable(monkeypatch):
    for k, v in _ENV.items():
        monkeypatch.setenv(k, v)


# ---------- Feature flag ----------
def test_disabled_by_default(monkeypatch):
    for k in _ENV:
        monkeypatch.delenv(k, raising=False)
    cfg = sc._cfg()
    assert sc._fully_configured(cfg) is False
    # Helper is a safe no-op when disabled.
    res = _run(sc.attempt_sbpaygo_charge("u_x", 5.0))
    assert res == {"success": False, "error_code": "disabled"}


def test_fully_configured(monkeypatch):
    _enable(monkeypatch)
    assert sc._fully_configured(sc._cfg()) is True


# ---------- OAuth callback token exchange ----------
def test_oauth_callback_stores_token(monkeypatch):
    _enable(monkeypatch)
    uid = f"u_{uuid.uuid4().hex[:8]}"
    state = uuid.uuid4().hex

    async def scenario():
        from datetime import datetime, timezone
        await db.sbpaygo_oauth_states.insert_one(
            {"state": state, "user_id": uid, "created_at": datetime.now(timezone.utc).isoformat()}
        )
        with respx.mock:
            respx.post(_ENV["SBPAYGO_TOKEN_URL"]).mock(
                return_value=httpx.Response(200, json={
                    "access_token": "ACCESS_123", "refresh_token": "REFRESH_123",
                    "token_type": "Bearer", "expires_in": 3600, "scope": "payments",
                })
            )
            resp = await sc.oauth_callback(code="CODE", state=state)
        assert resp.status_code == 302
        assert "sbpaygo_link_status=success" in resp.headers["location"]
        tok = await db.sbpaygo_tokens.find_one({"user_id": uid, "provider": "sbpaygo"})
        assert tok and tok["access_token"] == "ACCESS_123"
        # state consumed
        assert await db.sbpaygo_oauth_states.find_one({"state": state}) is None
        # cleanup
        await db.sbpaygo_tokens.delete_many({"user_id": uid})

    _run(scenario())


def test_oauth_callback_invalid_state(monkeypatch):
    _enable(monkeypatch)
    resp = _run(sc.oauth_callback(code="CODE", state="does-not-exist"))
    assert resp.status_code == 302
    assert "error=invalid_state" in resp.headers["location"]


# ---------- Charge proxy ----------
def test_charge_success(monkeypatch):
    _enable(monkeypatch)
    uid = f"u_{uuid.uuid4().hex[:8]}"

    async def scenario():
        from datetime import datetime, timezone, timedelta
        await db.sbpaygo_tokens.insert_one({
            "user_id": uid, "provider": "sbpaygo", "access_token": "ACCESS_123",
            "token_type": "Bearer",
            "expires_at": (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat(),
        })
        with respx.mock:
            respx.post(_ENV["SBPAYGO_CHARGE_URL"]).mock(
                return_value=httpx.Response(200, json={"transaction_id": "tx_ext_1", "status": "ok"})
            )
            res = await sc.attempt_sbpaygo_charge(uid, 12.5, ref="ride_1")
        assert res["success"] is True
        assert res["external_reference"] == "tx_ext_1"
        log = await db.sbpaygo_connect_log.find_one({"user_id": uid})
        assert log and log["amount"] == 12.5
        await db.sbpaygo_tokens.delete_many({"user_id": uid})
        await db.sbpaygo_connect_log.delete_many({"user_id": uid})

    _run(scenario())


def test_charge_no_token(monkeypatch):
    _enable(monkeypatch)
    res = _run(sc.attempt_sbpaygo_charge(f"u_{uuid.uuid4().hex[:8]}", 5.0))
    assert res == {"success": False, "error_code": "no_token"}


def test_charge_partner_error_is_defensive(monkeypatch):
    _enable(monkeypatch)
    uid = f"u_{uuid.uuid4().hex[:8]}"

    async def scenario():
        from datetime import datetime, timezone, timedelta
        await db.sbpaygo_tokens.insert_one({
            "user_id": uid, "provider": "sbpaygo", "access_token": "ACCESS_123",
            "token_type": "Bearer",
            "expires_at": (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat(),
        })
        with respx.mock:
            respx.post(_ENV["SBPAYGO_CHARGE_URL"]).mock(return_value=httpx.Response(500))
            res = await sc.attempt_sbpaygo_charge(uid, 5.0)
        assert res["success"] is False
        assert res["error_code"].startswith("http_")
        await db.sbpaygo_tokens.delete_many({"user_id": uid})

    _run(scenario())
