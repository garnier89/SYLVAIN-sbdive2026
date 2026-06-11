"""
SBPAYGO Connect — SB Drive side of the bridge to the external sbpaygo.com platform.

Implements a defensive, FEATURE-GATED OAuth2 Authorization Code flow + a payment
"charge" proxy that lets an SB Drive user fall back on their external SBPAYGO
balance when their internal SB Pay wallet is short.

CRITICAL DESIGN RULES
---------------------
1. The whole feature is OFF unless every required env var is set
   (SBPAYGO_ENABLED=true + client id/secret + authorize/token/charge URLs +
   redirect URI). With empty vars (the default) every endpoint behaves as if the
   feature does not exist (404) and `attempt_sbpaygo_charge` is a no-op that
   returns success=False. The existing wallet flows are NEVER affected.
2. Every outbound call to sbpaygo.com is wrapped in timeouts + try/except so an
   incomplete / unreliable partner API can never block or crash SB Drive.

Endpoints (all under /api):
  GET  /connect/status                 (auth)   -> feature flags + link state
  POST /connect/oauth/authorize        (auth)   -> {url, state} to redirect the user
  GET  /connect/oauth/callback         (public) -> partner redirect, token exchange
  POST /connect/charge                 (auth)   -> debit external balance (defensive)
  POST /connect/unlink                 (auth)   -> forget stored tokens
"""
import os
import secrets
from datetime import datetime, timezone, timedelta
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import RedirectResponse
from pydantic import BaseModel

from core.config import db, logger
from core.deps import get_current_user

router = APIRouter(tags=["sbpaygo-connect"])

# ---- Outbound HTTP safety ----
_TIMEOUT = httpx.Timeout(10.0, connect=5.0)
_STATE_TTL_MIN = 10


def _cfg() -> dict:
    """Read SBPAYGO Connect config from the environment (no hardcoded secrets)."""
    return {
        "enabled": os.environ.get("SBPAYGO_ENABLED", "").lower() in ("1", "true", "yes"),
        "client_id": os.environ.get("SBPAYGO_CLIENT_ID", "").strip(),
        "client_secret": os.environ.get("SBPAYGO_CLIENT_SECRET", "").strip(),
        "authorize_url": os.environ.get("SBPAYGO_AUTHORIZE_URL", "").strip(),
        "token_url": os.environ.get("SBPAYGO_TOKEN_URL", "").strip(),
        "charge_url": os.environ.get("SBPAYGO_CHARGE_URL", "").strip(),
        "redirect_uri": os.environ.get("SBPAYGO_REDIRECT_URI", "").strip(),
        "scope": os.environ.get("SBPAYGO_SCOPE", "openid profile balance payments").strip(),
        "frontend_url": os.environ.get("FRONTEND_URL", "").strip(),
    }


def _fully_configured(cfg: dict) -> bool:
    return bool(
        cfg["enabled"]
        and cfg["client_id"]
        and cfg["client_secret"]
        and cfg["authorize_url"]
        and cfg["token_url"]
        and cfg["charge_url"]
        and cfg["redirect_uri"]
    )


def _require_configured() -> dict:
    cfg = _cfg()
    if not _fully_configured(cfg):
        # Hide the feature entirely when disabled / not yet provisioned.
        raise HTTPException(status_code=404, detail="Not found")
    return cfg


async def _get_valid_token(user_id: str) -> dict | None:
    now = datetime.now(timezone.utc).isoformat()
    return await db.sbpaygo_tokens.find_one(
        {"user_id": user_id, "provider": "sbpaygo", "expires_at": {"$gt": now}},
        {"_id": 0},
    )


# ============ STATUS ============
@router.get("/connect/status")
async def connect_status(request: Request):
    """Tell the client whether SBPAYGO Connect is available and linked for this user."""
    user = await get_current_user(request)
    cfg = _cfg()
    configured = _fully_configured(cfg)
    linked = False
    if configured:
        linked = bool(await _get_valid_token(user["id"]))
    return {"enabled": cfg["enabled"], "configured": configured, "linked": linked}


# ============ OAUTH: AUTHORIZE ============
@router.post("/connect/oauth/authorize")
async def oauth_authorize(request: Request):
    """
    Generate the SBPAYGO authorization URL with a signed, single-use `state`
    tied to the current SB Drive user. The SPA opens this URL; SBPAYGO then
    redirects back to /connect/oauth/callback.
    """
    user = await get_current_user(request)
    cfg = _require_configured()
    state = secrets.token_urlsafe(32)
    await db.sbpaygo_oauth_states.insert_one({
        "state": state,
        "user_id": user["id"],
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    params = {
        "response_type": "code",
        "client_id": cfg["client_id"],
        "redirect_uri": cfg["redirect_uri"],
        "scope": cfg["scope"],
        "state": state,
    }
    return {"url": f"{cfg['authorize_url']}?{urlencode(params)}", "state": state}


async def _pop_state(state: str) -> str | None:
    doc = await db.sbpaygo_oauth_states.find_one({"state": state})
    if not doc:
        return None
    await db.sbpaygo_oauth_states.delete_one({"_id": doc["_id"]})
    # Reject stale states (> TTL minutes).
    try:
        created = datetime.fromisoformat(doc["created_at"])
        if datetime.now(timezone.utc) - created > timedelta(minutes=_STATE_TTL_MIN):
            return None
    except Exception:
        return None
    return doc.get("user_id")


def _frontend_redirect(cfg: dict, status: str, error: str | None = None) -> RedirectResponse:
    base = cfg.get("frontend_url") or "/"
    qs = {"sbpaygo_link_status": status}
    if error:
        qs["error"] = error
    return RedirectResponse(url=f"{base.rstrip('/')}/wallet?{urlencode(qs)}", status_code=302)


# ============ OAUTH: CALLBACK (PUBLIC) ============
@router.get("/connect/oauth/callback")
async def oauth_callback(
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
):
    """PUBLIC — SBPAYGO redirects the user-agent here after consent."""
    cfg = _require_configured()
    if error:
        return _frontend_redirect(cfg, "error", error)
    if not code or not state:
        return _frontend_redirect(cfg, "error", "missing_code_or_state")

    user_id = await _pop_state(state)
    if not user_id:
        return _frontend_redirect(cfg, "error", "invalid_state")

    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            resp = await client.post(
                cfg["token_url"],
                data={
                    "grant_type": "authorization_code",
                    "code": code,
                    "redirect_uri": cfg["redirect_uri"],
                    "client_id": cfg["client_id"],
                    "client_secret": cfg["client_secret"],
                },
                headers={"Accept": "application/json"},
            )
            resp.raise_for_status()
            data = resp.json()
    except httpx.TimeoutException:
        logger.warning("SBPAYGO token exchange timeout")
        return _frontend_redirect(cfg, "error", "timeout")
    except Exception as e:  # noqa: BLE001 — partner API may fail in many ways
        logger.warning(f"SBPAYGO token exchange failed: {e}")
        return _frontend_redirect(cfg, "error", "token_exchange_failed")

    access_token = data.get("access_token")
    if not access_token:
        return _frontend_redirect(cfg, "error", "missing_access_token")

    expires_in = int(data.get("expires_in", 3600) or 3600)
    now = datetime.now(timezone.utc)
    await db.sbpaygo_tokens.update_one(
        {"user_id": user_id, "provider": "sbpaygo"},
        {"$set": {
            "user_id": user_id,
            "provider": "sbpaygo",
            "access_token": access_token,
            "refresh_token": data.get("refresh_token"),
            "token_type": data.get("token_type", "Bearer"),
            "scope": data.get("scope"),
            "expires_at": (now + timedelta(seconds=expires_in)).isoformat(),
            "updated_at": now.isoformat(),
        }},
        upsert=True,
    )
    return _frontend_redirect(cfg, "success")


# ============ CHARGE (defensive fallback) ============
async def attempt_sbpaygo_charge(user_id: str, amount: float, currency: str = "EUR",
                                 ref: str | None = None) -> dict:
    """
    Best-effort debit of the user's external SBPAYGO balance.
    NEVER raises. Returns {success, external_reference?, error_code?}.
    Safe to call from any payment flow: when the feature is off or the partner
    fails, it simply returns success=False and the caller keeps its own behaviour.
    """
    cfg = _cfg()
    if not _fully_configured(cfg):
        return {"success": False, "error_code": "disabled"}
    if amount is None or amount <= 0:
        return {"success": False, "error_code": "invalid_amount"}

    token = await _get_valid_token(user_id)
    if not token:
        return {"success": False, "error_code": "no_token"}

    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            resp = await client.post(
                cfg["charge_url"],
                json={
                    "amount": round(float(amount), 2),
                    "currency": currency,
                    "user_id": user_id,
                    "reference": ref,
                },
                headers={
                    "Authorization": f"{token.get('token_type', 'Bearer')} {token['access_token']}",
                    "Accept": "application/json",
                },
            )
            resp.raise_for_status()
            data = resp.json()
    except httpx.TimeoutException:
        logger.warning("SBPAYGO charge timeout")
        return {"success": False, "error_code": "timeout"}
    except httpx.HTTPStatusError as e:
        logger.warning(f"SBPAYGO charge HTTP {e.response.status_code}")
        return {"success": False, "error_code": f"http_{e.response.status_code}"}
    except Exception as e:  # noqa: BLE001
        logger.warning(f"SBPAYGO charge failed: {e}")
        return {"success": False, "error_code": "http_error"}

    ext_ref = data.get("transaction_id") or data.get("id")
    await db.sbpaygo_connect_log.insert_one({
        "user_id": user_id,
        "amount": round(float(amount), 2),
        "currency": currency,
        "reference": ref,
        "external_reference": ext_ref,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return {"success": True, "external_reference": ext_ref}


class ChargeBody(BaseModel):
    amount: float
    currency: str = "EUR"
    reference: str | None = None


@router.post("/connect/charge")
async def connect_charge(body: ChargeBody, request: Request):
    """Authenticated wrapper to trigger an external SBPAYGO charge (defensive)."""
    user = await get_current_user(request)
    _require_configured()
    result = await attempt_sbpaygo_charge(user["id"], body.amount, body.currency, body.reference)
    if not result.get("success"):
        raise HTTPException(status_code=402, detail=f"Paiement SBPAYGO indisponible ({result.get('error_code')})")
    return result


# ============ UNLINK ============
@router.post("/connect/unlink")
async def connect_unlink(request: Request):
    user = await get_current_user(request)
    res = await db.sbpaygo_tokens.delete_many({"user_id": user["id"], "provider": "sbpaygo"})
    return {"ok": True, "removed": res.deleted_count}
