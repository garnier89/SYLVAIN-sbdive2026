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
    # SB Pay is now the single unified wallet (db.wallets).
    wallet = await db.wallets.find_one({"user_id": user["id"]}, {"_id": 0})
    if not wallet:
        wallet = {
            "user_id": user["id"],
            "balance": 0.0,
            "currency": "EUR",
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.wallets.insert_one(dict(wallet))
    txs = await db.wallet_transactions.find(
        {"user_id": user["id"]}, {"_id": 0}
    ).sort("created_at", -1).limit(10).to_list(10)
    norm = [{
        "id": t.get("id"),
        "type": "credit" if t.get("amount", 0) >= 0 else "debit",
        "amount": abs(round(t.get("amount", 0), 2)),
        "label": t.get("description") or t.get("type"),
        "created_at": t.get("created_at"),
    } for t in txs]
    return {
        "balance": round(wallet.get("balance", 0.0), 2),
        "currency": wallet.get("currency", "EUR"),
        "transactions": norm,
    }


# ============ SB PayGo ZONES (geographic availability) ============
DEFAULT_ZONES = [
    {"id": "fr_idf", "country": "FR", "country_label": "France", "region": "Île-de-France", "city": "Paris", "enabled": True,  "currency": "EUR"},
    {"id": "fr_paca","country": "FR", "country_label": "France", "region": "PACA",          "city": "Marseille","enabled": False,"currency": "EUR"},
    {"id": "ci_abj", "country": "CI", "country_label": "Côte d'Ivoire", "region": "Abidjan", "city": "Abidjan", "enabled": False, "currency": "XOF"},
    {"id": "sn_dkr", "country": "SN", "country_label": "Sénégal", "region": "Dakar", "city": "Dakar", "enabled": False, "currency": "XOF"},
    {"id": "be_bxl", "country": "BE", "country_label": "Belgique", "region": "Bruxelles-Capitale", "city": "Bruxelles", "enabled": False, "currency": "EUR"},
]


async def ensure_zones_seeded():
    for z in DEFAULT_ZONES:
        existing = await db.sbpaygo_zones.find_one({"id": z["id"]})
        if not existing:
            await db.sbpaygo_zones.insert_one({**z, "updated_at": datetime.now(timezone.utc).isoformat()})


@router.get("/finance/sbpaygo/availability")
async def sbpaygo_availability(country: str | None = None, city: str | None = None):
    """
    PUBLIC — Check if SB PayGo is available for a given country/city.
    Client app calls this on load to decide whether to display SB PayGo
    in the payment-method picker and the side menu.
    """
    await ensure_zones_seeded()
    q = {"enabled": True}
    if country: q["country"] = country.upper()
    if city: q["city"] = {"$regex": f"^{city}", "$options": "i"}
    zone = await db.sbpaygo_zones.find_one(q, {"_id": 0})
    if not zone and country:
        # Fallback: any enabled zone in this country
        zone = await db.sbpaygo_zones.find_one({"country": country.upper(), "enabled": True}, {"_id": 0})
    return {
        "available": bool(zone),
        "zone": zone,
    }


@router.get("/admin/sbpaygo/zones")
async def admin_list_zones(request: Request):
    user = await get_current_user(request)
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    await ensure_zones_seeded()
    zones = await db.sbpaygo_zones.find({}, {"_id": 0}).sort([("country", 1), ("city", 1)]).to_list(500)
    return {"zones": zones}


class ZoneUpsert(BaseModel):
    country: str
    country_label: str
    region: str | None = ""
    city: str | None = ""
    enabled: bool = False
    currency: str = "EUR"


@router.post("/admin/sbpaygo/zones")
async def admin_create_zone(body: ZoneUpsert, request: Request):
    user = await get_current_user(request)
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    zone_id = f"{body.country.lower()}_{(body.city or 'all').lower().replace(' ', '_')[:12]}_{uuid.uuid4().hex[:4]}"
    doc = {
        "id": zone_id,
        "country": body.country.upper(),
        "country_label": body.country_label,
        "region": body.region or "",
        "city": body.city or "",
        "enabled": body.enabled,
        "currency": body.currency,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.sbpaygo_zones.insert_one(doc)
    doc.pop("_id", None)
    return {"zone": doc}


class ZonePatch(BaseModel):
    enabled: bool | None = None
    region: str | None = None
    city: str | None = None
    currency: str | None = None
    country_label: str | None = None


@router.put("/admin/sbpaygo/zones/{zone_id}")
async def admin_update_zone(zone_id: str, body: ZonePatch, request: Request):
    user = await get_current_user(request)
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    patch = {k: v for k, v in body.dict().items() if v is not None}
    if not patch:
        raise HTTPException(status_code=400, detail="Nothing to update")
    patch["updated_at"] = datetime.now(timezone.utc).isoformat()
    res = await db.sbpaygo_zones.update_one({"id": zone_id}, {"$set": patch})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Zone not found")
    z = await db.sbpaygo_zones.find_one({"id": zone_id}, {"_id": 0})
    return {"zone": z}


@router.delete("/admin/sbpaygo/zones/{zone_id}")
async def admin_delete_zone(zone_id: str, request: Request):
    user = await get_current_user(request)
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    res = await db.sbpaygo_zones.delete_one({"id": zone_id})
    return {"deleted": res.deleted_count}


# ============ Pay a ride with SB PayGo balance ============
class PayRideBody(BaseModel):
    ride_id: str
    amount: float


@router.post("/finance/sbpaygo/pay-ride")
async def sbpaygo_pay_ride(body: PayRideBody, request: Request):
    """Deduct the ride amount from the unified SB Pay wallet and mark the ride as paid."""
    user = await get_current_user(request)
    if body.amount <= 0:
        raise HTTPException(status_code=400, detail="Montant invalide")
    amount = round(float(body.amount), 2)
    res = await db.wallets.update_one(
        {"user_id": user["id"], "balance": {"$gte": amount}},
        {"$inc": {"balance": -amount}},
    )
    if res.modified_count == 0:
        raise HTTPException(status_code=400, detail="Solde SB Pay insuffisant")
    now = datetime.now(timezone.utc).isoformat()
    w = await db.wallets.find_one({"user_id": user["id"]}, {"_id": 0})
    await db.wallet_transactions.insert_one({
        "id": f"tx_{uuid.uuid4().hex[:12]}",
        "user_id": user["id"],
        "type": "Booking",
        "amount": -amount,
        "balance_after": round(w["balance"], 2),
        "description": f"Paiement course {body.ride_id}",
        "ride_id": body.ride_id,
        "status": "completed",
        "created_at": now,
    })
    await db.rides.update_one(
        {"id": body.ride_id, "user_id": user["id"]},
        {"$set": {"paid_with": "sbpay", "paid_at": now}},
    )
    return {"ok": True, "balance": round(w["balance"], 2)}




class TopUpBody(BaseModel):
    amount: float
    source: str = "card"  # card | bank | mobile_money


@router.post("/finance/sbpaygo/topup")
async def sbpaygo_topup(body: TopUpBody, request: Request):
    """Deprecated: SB Pay top-up is now handled via secure Stripe checkout
    (POST /api/payments/checkout). No simulated/fake credits are issued."""
    await get_current_user(request)
    raise HTTPException(
        status_code=400,
        detail="Rechargez votre solde SB Pay par paiement sécurisé (carte) depuis le portefeuille.",
    )


class SendBody(BaseModel):
    recipient_phone: str
    amount: float
    note: str | None = None


@router.post("/finance/sbpaygo/send")
async def sbpaygo_send(body: SendBody, request: Request):
    """Send funds from the unified SB Pay wallet to another user (by phone)."""
    user = await get_current_user(request)
    if body.amount <= 0:
        raise HTTPException(status_code=400, detail="Montant invalide")
    amount = round(float(body.amount), 2)
    res = await db.wallets.update_one(
        {"user_id": user["id"], "balance": {"$gte": amount}},
        {"$inc": {"balance": -amount}},
    )
    if res.modified_count == 0:
        raise HTTPException(status_code=400, detail="Solde insuffisant")
    now = datetime.now(timezone.utc).isoformat()
    sender = await db.wallets.find_one({"user_id": user["id"]}, {"_id": 0})
    note_suffix = f" — {body.note}" if body.note else ""
    await db.wallet_transactions.insert_one({
        "id": f"tx_{uuid.uuid4().hex[:12]}",
        "user_id": user["id"],
        "type": "Transfer",
        "amount": -amount,
        "balance_after": round(sender["balance"], 2),
        "description": f"Envoi à {body.recipient_phone}{note_suffix}",
        "recipient_phone": body.recipient_phone,
        "status": "completed",
        "created_at": now,
    })
    # Credit recipient if found
    recipient = await db.users.find_one({"phone": body.recipient_phone})
    if recipient:
        await db.wallets.update_one(
            {"user_id": recipient["id"]},
            {
                "$inc": {"balance": amount},
                "$setOnInsert": {"user_id": recipient["id"], "currency": "EUR", "created_at": now},
            },
            upsert=True,
        )
        rw = await db.wallets.find_one({"user_id": recipient["id"]}, {"_id": 0})
        await db.wallet_transactions.insert_one({
            "id": f"tx_{uuid.uuid4().hex[:12]}",
            "user_id": recipient["id"],
            "type": "Transfer",
            "amount": amount,
            "balance_after": round(rw["balance"], 2),
            "description": f"Reçu de {user.get('name', user.get('email', ''))}{note_suffix}",
            "sender_id": user["id"],
            "status": "completed",
            "created_at": now,
        })
    return {"ok": True, "balance": round(sender["balance"], 2), "recipient_found": bool(recipient)}



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
