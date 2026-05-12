"""
Finance & Payment Methods management.

Provides:
- Admin CRUD for payment-method config (toggle enabled, store merchant_id/api_key)
- Public list of ENABLED methods for client/checkout
- Finance module: balance stub + SB PayGo SSO redirect link
- Toggle to activate/deactivate the entire Finance module
"""
import os
import uuid
import hashlib
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from core.config import db
from core.deps import get_current_user

router = APIRouter(tags=["finance"])


# Default seed for payment methods
DEFAULT_METHODS = [
    {"id": "cash",         "label": "Espèces",       "icon": "Money",       "enabled": True,  "needs_redirect": False, "merchant_id": "", "api_key": "", "order": 1},
    {"id": "card",         "label": "Carte bancaire","icon": "CreditCard",  "enabled": True,  "needs_redirect": False, "merchant_id": "", "api_key": "", "order": 2},
    {"id": "wallet",       "label": "Portefeuille SB","icon": "Wallet",     "enabled": True,  "needs_redirect": False, "merchant_id": "", "api_key": "", "order": 3},
    {"id": "orange_money", "label": "Orange Money",  "icon": "DeviceMobile","enabled": True,  "needs_redirect": True,  "merchant_id": "", "api_key": "", "order": 4},
    {"id": "mtn_money",    "label": "MTN Money",     "icon": "DeviceMobile","enabled": True,  "needs_redirect": True,  "merchant_id": "", "api_key": "", "order": 5},
    {"id": "wave",         "label": "Wave",          "icon": "Waves",       "enabled": False, "needs_redirect": True,  "merchant_id": "", "api_key": "", "order": 6},
    {"id": "sbpaygo",      "label": "SB PayGo",      "icon": "Bank",        "enabled": False, "needs_redirect": True,  "merchant_id": "", "api_key": "", "order": 7},
]

FINANCE_CONFIG_KEY = "finance_module"


async def ensure_seeded():
    """Seed payment_methods + finance module config if missing (idempotent)."""
    for m in DEFAULT_METHODS:
        existing = await db.payment_methods.find_one({"id": m["id"]})
        if not existing:
            await db.payment_methods.insert_one({**m, "updated_at": datetime.now(timezone.utc).isoformat()})
    cfg = await db.finance_config.find_one({"id": FINANCE_CONFIG_KEY})
    if not cfg:
        await db.finance_config.insert_one({
            "id": FINANCE_CONFIG_KEY,
            "enabled": True,
            "sbpaygo_base_url": os.environ.get("SBPAYGO_BASE_URL", "https://sbpaygo.com"),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        })


# ============ PUBLIC ============
@router.get("/config/payment-methods")
async def list_enabled_methods():
    """Return only ENABLED payment methods, sorted by display order. Used by client checkout pages."""
    await ensure_seeded()
    methods = await db.payment_methods.find({"enabled": True}, {"_id": 0, "api_key": 0}).sort("order", 1).to_list(50)
    return {"methods": methods}


# ============ ADMIN ============
@router.get("/admin/payment-methods")
async def admin_list_methods(request: Request):
    user = await get_current_user(request)
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    await ensure_seeded()
    methods = await db.payment_methods.find({}, {"_id": 0}).sort("order", 1).to_list(50)
    cfg = await db.finance_config.find_one({"id": FINANCE_CONFIG_KEY}, {"_id": 0}) or {}
    return {"methods": methods, "finance_module": cfg}


class MethodUpdate(BaseModel):
    enabled: bool | None = None
    merchant_id: str | None = None
    api_key: str | None = None
    label: str | None = None


@router.put("/admin/payment-methods/{method_id}")
async def admin_update_method(method_id: str, body: MethodUpdate, request: Request):
    user = await get_current_user(request)
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    update = {k: v for k, v in body.dict().items() if v is not None}
    if not update:
        raise HTTPException(status_code=400, detail="Nothing to update")
    update["updated_at"] = datetime.now(timezone.utc).isoformat()
    res = await db.payment_methods.update_one({"id": method_id}, {"$set": update})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Method not found")
    doc = await db.payment_methods.find_one({"id": method_id}, {"_id": 0})
    return {"method": doc}


class FinanceModuleUpdate(BaseModel):
    enabled: bool | None = None
    sbpaygo_base_url: str | None = None


@router.put("/admin/finance/module")
async def admin_update_finance_module(body: FinanceModuleUpdate, request: Request):
    user = await get_current_user(request)
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    update = {k: v for k, v in body.dict().items() if v is not None}
    update["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.finance_config.update_one({"id": FINANCE_CONFIG_KEY}, {"$set": update}, upsert=True)
    cfg = await db.finance_config.find_one({"id": FINANCE_CONFIG_KEY}, {"_id": 0})
    return {"finance_module": cfg}


# ============ FINANCE (client/driver) ============
@router.get("/finance/status")
async def finance_status():
    """Public status — is Finance module enabled?"""
    cfg = await db.finance_config.find_one({"id": FINANCE_CONFIG_KEY}, {"_id": 0}) or {"enabled": True}
    return {"enabled": cfg.get("enabled", True), "sbpaygo_base_url": cfg.get("sbpaygo_base_url", "https://sbpaygo.com")}


@router.get("/finance/balance")
async def finance_balance(request: Request):
    """Return current user's SB PayGo balance + recent transactions (stub)."""
    user = await get_current_user(request)
    # Pull or create user wallet doc
    wallet = await db.sbpaygo_wallets.find_one({"user_id": user["id"]}, {"_id": 0})
    if not wallet:
        wallet = {
            "user_id": user["id"],
            "balance": 0.0,
            "currency": "EUR",
            "transactions": [],
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.sbpaygo_wallets.insert_one(wallet)
        wallet.pop("_id", None)
    return {
        "balance": wallet.get("balance", 0.0),
        "currency": wallet.get("currency", "EUR"),
        "transactions": wallet.get("transactions", [])[-10:],
    }


class TopUpBody(BaseModel):
    amount: float
    source: str = "card"  # card | bank | mobile_money


@router.post("/finance/sbpaygo/topup")
async def sbpaygo_topup(body: TopUpBody, request: Request):
    """Add funds to user's SB PayGo wallet (in-app, no redirect)."""
    user = await get_current_user(request)
    if body.amount <= 0 or body.amount > 5000:
        raise HTTPException(status_code=400, detail="Montant invalide (0 - 5000 €)")
    now = datetime.now(timezone.utc).isoformat()
    tx = {
        "id": f"tx_{uuid.uuid4().hex[:10]}",
        "type": "credit",
        "amount": body.amount,
        "label": f"Recharge via {body.source}",
        "source": body.source,
        "created_at": now,
    }
    await db.sbpaygo_wallets.update_one(
        {"user_id": user["id"]},
        {
            "$inc": {"balance": body.amount},
            "$push": {"transactions": tx},
            "$setOnInsert": {"user_id": user["id"], "currency": "EUR", "created_at": now},
        },
        upsert=True,
    )
    wallet = await db.sbpaygo_wallets.find_one({"user_id": user["id"]}, {"_id": 0})
    return {"ok": True, "balance": wallet.get("balance", 0.0), "tx": tx}


class SendBody(BaseModel):
    recipient_phone: str
    amount: float
    note: str | None = None


@router.post("/finance/sbpaygo/send")
async def sbpaygo_send(body: SendBody, request: Request):
    """Send funds to another user identified by phone number."""
    user = await get_current_user(request)
    if body.amount <= 0:
        raise HTTPException(status_code=400, detail="Montant invalide")
    wallet = await db.sbpaygo_wallets.find_one({"user_id": user["id"]})
    if not wallet or wallet.get("balance", 0) < body.amount:
        raise HTTPException(status_code=400, detail="Solde insuffisant")
    now = datetime.now(timezone.utc).isoformat()
    tx_out = {
        "id": f"tx_{uuid.uuid4().hex[:10]}",
        "type": "debit",
        "amount": body.amount,
        "label": f"Envoi à {body.recipient_phone}",
        "recipient_phone": body.recipient_phone,
        "note": body.note,
        "created_at": now,
    }
    await db.sbpaygo_wallets.update_one(
        {"user_id": user["id"]},
        {"$inc": {"balance": -body.amount}, "$push": {"transactions": tx_out}},
    )
    # Credit recipient if found
    recipient = await db.users.find_one({"phone": body.recipient_phone})
    if recipient:
        tx_in = {
            "id": f"tx_{uuid.uuid4().hex[:10]}",
            "type": "credit",
            "amount": body.amount,
            "label": f"Reçu de {user.get('name', user.get('email', ''))}",
            "sender_id": user["id"],
            "note": body.note,
            "created_at": now,
        }
        await db.sbpaygo_wallets.update_one(
            {"user_id": recipient["id"]},
            {
                "$inc": {"balance": body.amount},
                "$push": {"transactions": tx_in},
                "$setOnInsert": {"user_id": recipient["id"], "currency": "EUR", "created_at": now},
            },
            upsert=True,
        )
    new_wallet = await db.sbpaygo_wallets.find_one({"user_id": user["id"]}, {"_id": 0})
    return {"ok": True, "balance": new_wallet.get("balance", 0.0), "recipient_found": bool(recipient)}



@router.post("/finance/sbpaygo/sso-link")
async def sbpaygo_sso_link(request: Request):
    """
    Generate a single-use SSO redirect URL pointing to sbpaygo.com
    with a signed token derived from the SB Drive user identity.
    The real SB PayGo backend must validate the token via the shared secret.
    """
    user = await get_current_user(request)
    cfg = await db.finance_config.find_one({"id": FINANCE_CONFIG_KEY}, {"_id": 0}) or {}
    if not cfg.get("enabled", True):
        raise HTTPException(status_code=403, detail="Module Finance désactivé")

    base = cfg.get("sbpaygo_base_url", "https://sbpaygo.com")
    secret = os.environ.get("SBPAYGO_SHARED_SECRET", "dev-secret-change-me")
    nonce = uuid.uuid4().hex
    payload = f"{user['id']}|{user.get('email','')}|{nonce}"
    signature = hashlib.sha256(f"{payload}|{secret}".encode()).hexdigest()
    token = f"{user['id']}.{nonce}.{signature}"

    sso_url = f"{base}/sso?token={token}&email={user.get('email','')}&name={user.get('name','')}"
    # Audit-log the SSO attempt
    await db.sbpaygo_sso_log.insert_one({
        "id": f"sso_{nonce}",
        "user_id": user["id"],
        "user_email": user.get("email"),
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return {"url": sso_url, "expires_in": 300}
