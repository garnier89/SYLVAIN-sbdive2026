"""
Mobile Money payouts (disbursement / B2C) — Orange Money, MTN MoMo, Wave.

Replaces the manual "mark paid" step for Africa Mobile Money withdrawals with a
real provider call. Safety model:

  mode = "sandbox"  → NO real money. Calls are SIMULATED (the flow + UI can be
                      tested end-to-end). This is the default.
  mode = "live"     → real provider API calls, but ONLY when live_enabled is True
                      (a deliberate double-confirm). Otherwise the call is blocked.

The platform wallet is in EUR; West-African Mobile Money payouts are in XOF.
The CFA franc is pegged to the euro at the fixed rate 1 EUR = 655.957 XOF.

Credential completeness (set in backend/.env) before going live:
  - Wave   : full WAVE_API_KEY (the one provided was truncated). Signing secret present.
  - MTN    : a *Disbursement*-product subscription key + (live) IP whitelisting by MTN.
  - Orange : B2C/disbursement product activation + endpoint (the keys provided are
             Web Payment / collection, not disbursement) → ORANGE_B2C_BASE_* empty.
"""
import os
import time
import json
import uuid
import hmac
import hashlib
from datetime import datetime, timezone

import httpx

from core.config import db

XOF_PER_EUR = 655.957  # fixed CFA peg
CFG_ID = "default"
DEFAULT_PAYOUT_CFG = {"id": CFG_ID, "mode": "sandbox", "live_enabled": False}


class PayoutError(Exception):
    """Raised when a payout cannot be executed (config/credentials/provider error)."""


def _env(name: str) -> str:
    return (os.environ.get(name) or "").strip()


def eur_to_xof(amount_eur: float) -> int:
    return int(round(float(amount_eur) * XOF_PER_EUR))


async def get_payout_config() -> dict:
    cfg = await db.payout_provider_config.find_one({"id": CFG_ID}, {"_id": 0})
    if not cfg:
        cfg = {**DEFAULT_PAYOUT_CFG,
               "mode": _env("PAYOUT_MODE") or "sandbox",
               "live_enabled": _env("PAYOUT_LIVE_ENABLED").lower() == "true",
               "updated_at": datetime.now(timezone.utc).isoformat()}
        await db.payout_provider_config.insert_one(dict(cfg))
    return {**DEFAULT_PAYOUT_CFG, **cfg}


async def effective_mode() -> str:
    cfg = await get_payout_config()
    if cfg.get("mode") == "live" and cfg.get("live_enabled"):
        return "live"
    if cfg.get("mode") == "live" and not cfg.get("live_enabled"):
        # Mode live demandé mais non confirmé → on bloque toute sortie d'argent réelle.
        raise PayoutError("Mode live non confirmé : activez « live_enabled » après vérification des identifiants.")
    return "sandbox"


# ───────────────────────────── WAVE ─────────────────────────────

async def wave_payout(amount_xof: int, mobile: str, name: str, client_reference: str, idem_key: str) -> dict:
    api_key = _env("WAVE_API_KEY")
    if not api_key:
        raise PayoutError("WAVE_API_KEY manquante ou incomplète (la clé fournie était tronquée).")
    base = _env("WAVE_BASE_URL") or "https://api.wave.com"
    secret = _env("WAVE_SIGNING_SECRET")
    body_dict = {"currency": "XOF", "receive_amount": str(amount_xof),
                 "name": name, "mobile": mobile, "client_reference": client_reference}
    body = json.dumps(body_dict, separators=(",", ":"), ensure_ascii=False)
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json",
               "idempotency-key": idem_key}
    if secret:
        ts = int(time.time())
        sig = hmac.new(secret.encode(), f"{ts}{body}".encode(), hashlib.sha256).hexdigest()
        headers["Wave-Signature"] = f"t={ts},v1={sig}"
    async with httpx.AsyncClient(timeout=20.0) as c:
        r = await c.post(f"{base}/v1/payout", headers=headers, content=body)
    data = r.json() if r.content else {}
    if r.status_code >= 400:
        raise PayoutError(data.get("error_message") or f"Wave erreur HTTP {r.status_code}")
    return {"provider_ref": data.get("id"), "status": _map_wave(data.get("status"))}


def _map_wave(s: str) -> str:
    s = (s or "").lower()
    if s in ("succeeded", "successful", "success"):
        return "paid"
    if s in ("failed", "reversed", "cancelled"):
        return "failed"
    return "processing"


async def wave_status(payout_id: str) -> str:
    api_key = _env("WAVE_API_KEY")
    base = _env("WAVE_BASE_URL") or "https://api.wave.com"
    secret = _env("WAVE_SIGNING_SECRET")
    headers = {"Authorization": f"Bearer {api_key}"}
    if secret:
        ts = int(time.time())
        sig = hmac.new(secret.encode(), str(ts).encode(), hashlib.sha256).hexdigest()
        headers["Wave-Signature"] = f"t={ts},v1={sig}"
    async with httpx.AsyncClient(timeout=15.0) as c:
        r = await c.get(f"{base}/v1/payout/{payout_id}", headers=headers)
    return _map_wave((r.json() or {}).get("status")) if r.status_code < 400 else "processing"


# ───────────────────────────── MTN MoMo ─────────────────────────────

def _mtn_cfg(mode: str) -> dict:
    sfx = "LIVE" if mode == "live" else "SANDBOX"
    return {
        "base": _env(f"MTN_BASE_URL_{sfx}"),
        "target": _env(f"MTN_TARGET_ENV_{sfx}"),
        "sub_key": _env(f"MTN_DISBURSEMENT_SUBSCRIPTION_KEY_{sfx}"),
        "api_user": _env(f"MTN_API_USER_{sfx}"),
        "api_key": _env(f"MTN_API_KEY_{sfx}"),
    }


async def _mtn_token(cfg: dict) -> str:
    async with httpx.AsyncClient(timeout=15.0) as c:
        r = await c.post(
            f"{cfg['base']}/disbursement/token/",
            headers={"Ocp-Apim-Subscription-Key": cfg["sub_key"], "X-Target-Environment": cfg["target"]},
            auth=(cfg["api_user"], cfg["api_key"]),
        )
    if r.status_code >= 400:
        raise PayoutError(f"MTN token erreur HTTP {r.status_code}")
    return r.json()["access_token"]


async def mtn_payout(amount_xof: int, mobile: str, external_id: str, reference_id: str, mode: str) -> dict:
    cfg = _mtn_cfg(mode)
    if not (cfg["sub_key"] and cfg["api_user"] and cfg["api_key"]):
        raise PayoutError("MTN MoMo : clé d'abonnement *Disbursement* + API user/key requis (voir .env).")
    token = await _mtn_token(cfg)
    body = {"amount": str(amount_xof), "currency": "XOF", "externalId": external_id,
            "payee": {"partyIdType": "MSISDN", "partyId": mobile.lstrip("+")},
            "payerMessage": "Retrait SB Pay", "payeeNote": "Versement chauffeur/marchand"}
    async with httpx.AsyncClient(timeout=20.0) as c:
        r = await c.post(
            f"{cfg['base']}/disbursement/v1_0/transfer",
            headers={"Authorization": f"Bearer {token}", "Ocp-Apim-Subscription-Key": cfg["sub_key"],
                     "X-Target-Environment": cfg["target"], "X-Reference-Id": reference_id,
                     "Content-Type": "application/json"},
            json=body,
        )
    if r.status_code != 202:
        detail = (r.json() if r.content else {}).get("message") or f"MTN erreur HTTP {r.status_code}"
        raise PayoutError(detail)
    # 202 = accepted, processed asynchronously → finalize via mtn_status / callback.
    return {"provider_ref": reference_id, "status": "processing"}


async def mtn_status(reference_id: str, mode: str) -> str:
    cfg = _mtn_cfg(mode)
    token = await _mtn_token(cfg)
    async with httpx.AsyncClient(timeout=15.0) as c:
        r = await c.get(
            f"{cfg['base']}/disbursement/v1_0/transfer/{reference_id}",
            headers={"Authorization": f"Bearer {token}", "Ocp-Apim-Subscription-Key": cfg["sub_key"],
                     "X-Target-Environment": cfg["target"]},
        )
    if r.status_code >= 400:
        return "processing"
    return _map_mtn((r.json() or {}).get("status"))


def _map_mtn(s: str) -> str:
    s = (s or "").upper()
    if s == "SUCCESSFUL":
        return "paid"
    if s == "FAILED":
        return "failed"
    return "processing"


# ───────────────────────────── Orange Money ─────────────────────────────

async def orange_payout(amount_xof: int, mobile: str, external_id: str, mode: str) -> dict:
    sfx = "LIVE" if mode == "live" else "SANDBOX"
    base = _env(f"ORANGE_B2C_BASE_{sfx}")
    if not base:
        raise PayoutError(
            "Versement Orange Money non configuré : le produit B2C/disbursement doit être activé par Orange. "
            "Les identifiants fournis sont ceux du Web Payment (encaissement), pas du versement."
        )
    client_id = _env(f"ORANGE_CLIENT_ID_{sfx}")
    client_secret = _env(f"ORANGE_CLIENT_SECRET_{sfx}")
    token_url = _env("ORANGE_TOKEN_URL") or "https://api.orange.com/oauth/v3/token"
    async with httpx.AsyncClient(timeout=20.0) as c:
        tok = await c.post(token_url, data={"grant_type": "client_credentials"}, auth=(client_id, client_secret))
        if tok.status_code >= 400:
            raise PayoutError(f"Orange token erreur HTTP {tok.status_code}")
        access_token = tok.json().get("access_token")
        r = await c.post(
            f"{base}/transfers",
            headers={"Authorization": f"Bearer {access_token}", "Content-Type": "application/json",
                     "X-Merchant-Key": _env(f"ORANGE_MERCHANT_KEY_{sfx}"), "X-Idempotency-Key": external_id},
            json={"amount": str(amount_xof), "currency": "XOF", "receiver_msisdn": mobile, "external_id": external_id},
        )
    data = r.json() if r.content else {}
    if r.status_code not in (200, 201, 202):
        raise PayoutError(data.get("message") or f"Orange erreur HTTP {r.status_code}")
    status = (data.get("status") or "").lower()
    return {"provider_ref": data.get("transaction_id") or data.get("reference"),
            "status": "paid" if status in ("success", "successful") else "processing"}


# ───────────────────────────── Dispatcher ─────────────────────────────

SUPPORTED_AUTO_PROVIDERS = {"orange", "mtn", "wave"}


async def execute_payout(req: dict, method: dict) -> dict:
    """Execute a real (or simulated) Mobile Money payout for an approved withdrawal.
    Returns {provider, mode, amount_xof, provider_ref, status, simulated}."""
    if (method or {}).get("type") != "mobile_money":
        raise PayoutError("Versement automatique disponible uniquement pour le Mobile Money.")
    provider = (method.get("provider") or "").lower()
    if provider not in SUPPORTED_AUTO_PROVIDERS:
        raise PayoutError(f"Opérateur « {provider} » non pris en charge pour le versement automatique.")
    mobile = (method.get("mobile_number") or "").strip()
    name = method.get("holder_name") or method.get("user_name") or "Bénéficiaire"
    if not mobile:
        raise PayoutError("Numéro Mobile Money manquant sur le moyen de retrait.")

    net_eur = req.get("net_amount", req.get("final_amount", req.get("amount")))
    amount_xof = eur_to_xof(net_eur)
    idem = req["id"]
    reference_id = req.get("provider_ref") or str(uuid.uuid4())
    mode = await effective_mode()

    if mode == "sandbox":
        # No real money — simulate a successful payout so the full flow/UI is testable.
        return {"provider": provider, "mode": "sandbox", "amount_xof": amount_xof,
                "provider_ref": f"SIM-{uuid.uuid4().hex[:10].upper()}", "status": "paid", "simulated": True}

    if provider == "wave":
        res = await wave_payout(amount_xof, mobile, name, idem, idem)
    elif provider == "mtn":
        res = await mtn_payout(amount_xof, mobile, idem, reference_id, mode)
    elif provider == "orange":
        res = await orange_payout(amount_xof, mobile, idem, mode)
    return {"provider": provider, "mode": "live", "amount_xof": amount_xof,
            "provider_ref": res.get("provider_ref"), "status": res.get("status", "processing"), "simulated": False}


async def check_payout_status(provider: str, provider_ref: str, mode: str) -> str:
    if mode == "sandbox" or not provider_ref:
        return "paid" if mode == "sandbox" else "processing"
    if provider == "wave":
        return await wave_status(provider_ref)
    if provider == "mtn":
        return await mtn_status(provider_ref, mode)
    return "processing"
