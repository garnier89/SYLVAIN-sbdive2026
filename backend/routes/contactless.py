"""Phase D — Paiement « sans contact » (face-to-face QR / 6-digit code).

A payee (driver or merchant) enters an amount and generates a payment request
with a QR code + a 6-digit code. The client scans the QR (deep link) or enters
the code, then pays via SB Pay wallet or Stripe card. The platform takes a
configurable commission; the net amount is credited to the payee's withdrawable
SB Pay wallet (db.wallets) and the payer earns cashback.

Reuses the tip/Stripe-Checkout architecture (db.wallets credit + atomic gate).
"""
import os
import uuid
import random
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Request, HTTPException

from core.config import db
from core.deps import get_current_user, require_role
from core.cashback import award_cashback
from core.websocket import manager

router = APIRouter(prefix="/contactless", tags=["contactless"])

CFG_ID = "contactless"
DEFAULT_CFG = {
    "id": CFG_ID,
    "enabled": True,
    "commission_percent": 10.0,   # platform cut on the gross amount
    "expiry_minutes": 15,
    "max_amount": 2000.0,
    "min_card": 1.0,
}
PAYEE_ROLES = ("driver", "merchant")


def _now():
    return datetime.now(timezone.utc).isoformat()


async def get_contactless_config() -> dict:
    cfg = await db.contactless_config.find_one({"id": CFG_ID}, {"_id": 0})
    if not cfg:
        cfg = {**DEFAULT_CFG, "updated_at": _now()}
        await db.contactless_config.insert_one(dict(cfg))
    return {**DEFAULT_CFG, **cfg}


def _is_expired(req: dict) -> bool:
    exp = req.get("expires_at")
    return bool(exp and exp < _now())


async def _gen_code() -> str:
    """6-digit code, unique among currently-pending requests."""
    for _ in range(12):
        code = f"{random.randint(0, 999999):06d}"
        clash = await db.contactless_payments.find_one(
            {"code": code, "status": "pending"}, {"_id": 0, "id": 1}
        )
        if not clash:
            return code
    return f"{random.randint(0, 999999):06d}"


def _public(req: dict) -> dict:
    """Payer-facing view of a request."""
    return {
        "id": req["id"],
        "amount": req["amount"],
        "currency": "EUR",
        "payee_name": req.get("payee_name"),
        "payee_role": req.get("payee_role"),
        "status": req.get("status"),
        "expires_at": req.get("expires_at"),
        "expired": _is_expired(req) and req.get("status") == "pending",
    }


async def _credit_payee(req: dict, gross: float, method: str, source_ref: str) -> dict:
    """Take the platform commission and credit the NET to the payee's withdrawable
    SB Pay wallet. Caller guarantees this runs at most once per request."""
    cfg = await get_contactless_config()
    pct = max(0.0, min(float(cfg.get("commission_percent", 10) or 0), 90.0))
    gross = round(float(gross), 2)
    commission = round(gross * pct / 100.0, 2)
    net = round(gross - commission, 2)
    now = _now()
    payee_id = req["payee_id"]

    await db.wallets.update_one(
        {"user_id": payee_id},
        {"$inc": {"balance": net},
         "$setOnInsert": {"user_id": payee_id, "currency": "EUR", "created_at": now}},
        upsert=True,
    )
    w = await db.wallets.find_one({"user_id": payee_id}, {"_id": 0})
    await db.wallet_transactions.insert_one({
        "id": f"tx_{uuid.uuid4().hex[:12]}",
        "user_id": payee_id,
        "type": "Encaissement",
        "amount": net,
        "balance_after": round((w or {}).get("balance", 0), 2),
        "description": f"Encaissement sans contact #{req['id'][-6:].upper()} ({'carte' if method == 'card' else 'SB Pay'})"
                       + (f" · commission {commission:.2f} €" if commission > 0 else ""),
        "contactless_id": req["id"],
        "commission": commission,
        "status": "completed",
        "created_at": now,
    })
    if req.get("payee_role") == "driver":
        drv = await db.drivers.find_one({"user_id": payee_id}, {"_id": 0, "id": 1})
        if drv:
            await db.drivers.update_one({"id": drv["id"]}, {"$inc": {"earnings": net}})

    try:
        from core.notifications import create_notification
        await create_notification(
            payee_id, "earning", "Paiement reçu 💳",
            f"+{net:.2f} € encaissés (sans contact)" + (f", commission {commission:.2f} €" if commission > 0 else ""),
            data={"contactless_id": req["id"], "amount": net, "kind": "contactless"},
        )
    except Exception:
        pass
    try:
        await manager.send_personal_message({
            "type": "contactless_paid",
            "request_id": req["id"],
            "amount": gross,
            "net": net,
        }, payee_id)
    except Exception:
        pass
    return {"commission": commission, "net": net}


# ═══════════ PAYEE — create / list / cancel ═══════════

@router.post("/requests")
async def create_request(request: Request):
    """Driver/merchant generates a contactless payment request (QR + 6-digit code)."""
    user = await get_current_user(request)
    if user.get("role") not in PAYEE_ROLES:
        raise HTTPException(status_code=403, detail="Réservé aux chauffeurs et marchands")
    cfg = await get_contactless_config()
    if not cfg.get("enabled"):
        raise HTTPException(status_code=400, detail="Paiement sans contact désactivé")
    body = await request.json()
    try:
        amount = round(float(body.get("amount", 0)), 2)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="Montant invalide")
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Montant invalide")
    if amount > float(cfg.get("max_amount", 2000)):
        raise HTTPException(status_code=400, detail=f"Montant maximum {cfg['max_amount']:.0f} €")

    now = datetime.now(timezone.utc)
    expires_at = (now + timedelta(minutes=int(cfg.get("expiry_minutes", 15)))).isoformat()
    code = await _gen_code()
    doc = {
        "id": f"cl_{uuid.uuid4().hex[:12]}",
        "code": code,
        "payee_id": user["id"],
        "payee_role": user.get("role"),
        "payee_name": user.get("name") or user.get("email"),
        "amount": amount,
        "status": "pending",
        "payer_id": None,
        "payment_method": None,
        "commission": None,
        "net_to_payee": None,
        "cashback_awarded": 0.0,
        "session_id": None,
        "created_at": now.isoformat(),
        "expires_at": expires_at,
        "paid_at": None,
    }
    await db.contactless_payments.insert_one(doc)
    doc.pop("_id", None)
    return {
        "id": doc["id"], "code": code, "amount": amount, "currency": "EUR",
        "status": "pending", "expires_at": expires_at,
        "expiry_minutes": int(cfg.get("expiry_minutes", 15)),
    }


@router.get("/my/requests")
async def my_requests(request: Request):
    """Payee polls their own recent requests (to detect when one is paid)."""
    user = await get_current_user(request)
    items = await db.contactless_payments.find(
        {"payee_id": user["id"]}, {"_id": 0}
    ).sort("created_at", -1).to_list(20)
    for it in items:
        if it.get("status") == "pending" and _is_expired(it):
            it["status"] = "expired"
            await db.contactless_payments.update_one({"id": it["id"]}, {"$set": {"status": "expired"}})
    return items


@router.post("/requests/{req_id}/cancel")
async def cancel_request(req_id: str, request: Request):
    user = await get_current_user(request)
    req = await db.contactless_payments.find_one({"id": req_id}, {"_id": 0})
    if not req:
        raise HTTPException(status_code=404, detail="Demande introuvable")
    if req["payee_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Non autorisé")
    if req.get("status") != "pending":
        raise HTTPException(status_code=400, detail="Demande déjà traitée")
    await db.contactless_payments.update_one({"id": req_id}, {"$set": {"status": "cancelled"}})
    return {"message": "Annulé", "status": "cancelled"}


# ═══════════ PAYER — lookup / view / pay / confirm ═══════════

@router.get("/lookup")
async def lookup_by_code(request: Request, code: str):
    """Resolve a 6-digit code to a pending request (manual entry path)."""
    await get_current_user(request)
    code = (code or "").strip()
    req = await db.contactless_payments.find_one({"code": code, "status": "pending"}, {"_id": 0})
    if not req or _is_expired(req):
        raise HTTPException(status_code=404, detail="Code invalide ou expiré")
    return _public(req)


@router.get("/requests/{req_id}")
async def get_request(req_id: str, request: Request):
    """Payer-facing details for the payment screen (from QR deep link or code)."""
    await get_current_user(request)
    req = await db.contactless_payments.find_one({"id": req_id}, {"_id": 0})
    if not req:
        raise HTTPException(status_code=404, detail="Demande introuvable")
    return _public(req)


@router.post("/requests/{req_id}/pay")
async def pay_request(req_id: str, request: Request):
    """Pay a contactless request. method=wallet debits SB Pay now; method=card
    returns a Stripe Checkout URL (payee credited on confirmation)."""
    user = await get_current_user(request)
    req = await db.contactless_payments.find_one({"id": req_id}, {"_id": 0})
    if not req:
        raise HTTPException(status_code=404, detail="Demande introuvable")
    if req.get("status") == "paid":
        raise HTTPException(status_code=400, detail="Déjà payé")
    if req.get("status") != "pending" or _is_expired(req):
        raise HTTPException(status_code=400, detail="Demande expirée ou annulée")
    if req["payee_id"] == user["id"]:
        raise HTTPException(status_code=400, detail="Impossible de payer votre propre demande")

    body = await request.json()
    method = (body.get("method") or "wallet").strip().lower()
    if method in ("sbpay", "sbpaygo", "wallet"):
        method = "wallet"
    elif method in ("card", "carte", "stripe", "cb"):
        method = "card"
    else:
        raise HTTPException(status_code=400, detail="Moyen de paiement invalide")

    amount = round(float(req["amount"]), 2)
    now = _now()

    # ───────── SB Pay wallet ─────────
    if method == "wallet":
        res = await db.wallets.update_one(
            {"user_id": user["id"], "balance": {"$gte": amount}},
            {"$inc": {"balance": -amount}},
        )
        if res.modified_count == 0:
            raise HTTPException(status_code=400, detail="Solde SB Pay insuffisant")
        # Lock the request to this payer (idempotency for the wallet path).
        lock = await db.contactless_payments.update_one(
            {"id": req_id, "status": "pending"},
            {"$set": {"status": "paid", "payer_id": user["id"], "payment_method": "wallet", "paid_at": now}},
        )
        if lock.modified_count == 0:
            # Lost the race — refund the debit.
            await db.wallets.update_one({"user_id": user["id"]}, {"$inc": {"balance": amount}})
            raise HTTPException(status_code=400, detail="Demande déjà traitée")
        w = await db.wallets.find_one({"user_id": user["id"]}, {"_id": 0})
        await db.wallet_transactions.insert_one({
            "id": f"tx_{uuid.uuid4().hex[:12]}",
            "user_id": user["id"],
            "type": "Paiement",
            "amount": -amount,
            "balance_after": round((w or {}).get("balance", 0), 2),
            "description": f"Paiement sans contact à {req.get('payee_name') or 'bénéficiaire'}",
            "contactless_id": req_id,
            "status": "completed",
            "created_at": now,
        })
        split = await _credit_payee(req, amount, "wallet", req_id)
        cashback = await award_cashback(user["id"], amount, "sbpay", "contactless", ref_id=req_id,
                                        label="Cashback paiement sans contact")
        await db.contactless_payments.update_one({"id": req_id}, {"$set": {
            "commission": split["commission"], "net_to_payee": split["net"], "cashback_awarded": cashback,
        }})
        return {"status": "paid", "method": "wallet", "amount": amount,
                "commission": split["commission"], "net": split["net"], "cashback": cashback}

    # ───────── Card via Stripe Checkout ─────────
    cfg = await get_contactless_config()
    if amount < float(cfg.get("min_card", 1)):
        raise HTTPException(status_code=400, detail=f"Paiement carte : minimum {cfg['min_card']:.0f} €")
    origin_url = (body.get("origin_url") or "").rstrip("/")
    if not origin_url:
        raise HTTPException(status_code=400, detail="origin_url requis pour le paiement par carte")

    from emergentintegrations.payments.stripe.checkout import StripeCheckout, CheckoutSessionRequest
    host_url = str(request.base_url).rstrip("/")
    stripe = StripeCheckout(api_key=os.environ.get("STRIPE_API_KEY", ""), webhook_url=f"{host_url}/api/webhook/stripe")
    success_url = f"{origin_url}/pay/{req_id}?cl_session={{CHECKOUT_SESSION_ID}}"
    cancel_url = f"{origin_url}/pay/{req_id}"
    checkout_req = CheckoutSessionRequest(
        amount=float(amount), currency="eur",
        success_url=success_url, cancel_url=cancel_url,
        metadata={"user_id": user["id"], "contactless_id": req_id, "amount": str(amount), "type": "contactless"},
    )
    session = await stripe.create_checkout_session(checkout_req)
    await db.payment_transactions.insert_one({
        "id": f"pay_{uuid.uuid4().hex[:12]}",
        "session_id": session.session_id,
        "user_id": user["id"],
        "contactless_id": req_id,
        "amount": amount,
        "currency": "EUR",
        "type": "contactless",
        "payment_status": "pending",
        "status": "initiated",
        "created_at": now,
        "updated_at": now,
    })
    await db.contactless_payments.update_one({"id": req_id}, {"$set": {
        "payment_method": "card", "session_id": session.session_id, "payer_id": user["id"],
    }})
    return {"url": session.url, "session_id": session.session_id, "method": "card", "status": "pending", "amount": amount}


@router.get("/requests/{req_id}/status")
async def pay_status(req_id: str, request: Request, session_id: str):
    """Poll a card payment and credit the payee once paid (idempotent)."""
    user = await get_current_user(request)
    tx = await db.payment_transactions.find_one(
        {"session_id": session_id, "user_id": user["id"], "type": "contactless"}, {"_id": 0}
    )
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction introuvable")
    if tx.get("payment_status") == "paid":
        return {"status": "complete", "payment_status": "paid", "amount": tx["amount"]}

    from emergentintegrations.payments.stripe.checkout import StripeCheckout
    host_url = str(request.base_url).rstrip("/")
    stripe = StripeCheckout(api_key=os.environ.get("STRIPE_API_KEY", ""), webhook_url=f"{host_url}/api/webhook/stripe")
    try:
        status = await stripe.get_checkout_status(session_id)
    except Exception:
        return {"status": tx["status"], "payment_status": tx["payment_status"], "amount": tx["amount"]}

    now = _now()
    if status and status.payment_status == "paid":
        gate = await db.payment_transactions.update_one(
            {"session_id": session_id, "payment_status": {"$ne": "paid"}},
            {"$set": {"payment_status": "paid", "status": "complete", "updated_at": now}},
        )
        if gate.modified_count > 0:
            req = await db.contactless_payments.find_one({"id": req_id}, {"_id": 0})
            if req and req.get("status") != "paid":
                await db.contactless_payments.update_one({"id": req_id}, {"$set": {
                    "status": "paid", "payment_method": "card", "payer_id": user["id"], "paid_at": now,
                }})
                split = await _credit_payee(req, tx["amount"], "card", req_id)
                cashback = await award_cashback(user["id"], tx["amount"], "card", "contactless", ref_id=req_id,
                                                label="Cashback paiement sans contact")
                await db.contactless_payments.update_one({"id": req_id}, {"$set": {
                    "commission": split["commission"], "net_to_payee": split["net"], "cashback_awarded": cashback,
                }})
        return {"status": "complete", "payment_status": "paid", "amount": tx["amount"]}
    elif status and status.status == "expired":
        await db.payment_transactions.update_one(
            {"session_id": session_id}, {"$set": {"payment_status": "expired", "status": "expired", "updated_at": now}}
        )
        return {"status": "expired", "payment_status": "expired", "amount": tx["amount"]}
    return {"status": status.status if status else "unknown",
            "payment_status": status.payment_status if status else "pending", "amount": tx["amount"]}


# ═══════════ ADMIN — config ═══════════

@router.get("/admin/config")
async def admin_get_config(request: Request):
    await require_role(request, ["admin"], permission="billing.view")
    return await get_contactless_config()


@router.put("/admin/config")
async def admin_update_config(request: Request):
    await require_role(request, ["admin"], permission="billing.view")
    body = await request.json()
    fields = {}
    if "enabled" in body:
        fields["enabled"] = bool(body["enabled"])
    for k in ("commission_percent", "max_amount", "min_card"):
        if k in body:
            try:
                fields[k] = round(float(body[k]), 2)
            except (TypeError, ValueError):
                pass
    if "expiry_minutes" in body:
        try:
            fields["expiry_minutes"] = max(1, int(body["expiry_minutes"]))
        except (TypeError, ValueError):
            pass
    if "commission_percent" in fields:
        fields["commission_percent"] = max(0.0, min(fields["commission_percent"], 90.0))
    fields["updated_at"] = _now()
    await db.contactless_config.update_one({"id": CFG_ID}, {"$set": fields}, upsert=True)
    return await get_contactless_config()
