"""SB Tracking Pro — abonnement Stripe (accès premium par gestionnaire).

Implémente l'offre payante via Stripe Checkout (emergentintegrations, clé de test
gérée `sk_test_emergent`). L'entitlement « Pro » est porté par le **gestionnaire**
(propriétaire de la flotte / équipe) ; ses employés & superviseurs en héritent
pour les fonctions liées à son organisation.

Comme la clé gérée ne supporte que des paiements Checkout ponctuels, un achat
accorde un **accès limité dans le temps** (mensuel = 30 j, annuel = 365 j) qui se
prolonge à chaque renouvellement. Le code des webhooks/statuts est idempotent.

Fonctions Pro (gated) : Commande & contrôle flotte, Centre de sécurité,
Rapports PDF, Rôle Superviseur, véhicules/employés illimités.
"""
import os
import uuid
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Request, HTTPException

from emergentintegrations.payments.stripe.checkout import (
    StripeCheckout, CheckoutSessionRequest, CheckoutSessionResponse,
)
from core.config import db
from core.deps import get_current_user

router = APIRouter(prefix="/tracking-pro", tags=["tracking-pro"])

STRIPE_API_KEY = os.environ.get("STRIPE_API_KEY", "")

PRO_PACKAGES = {
    "pro_monthly": {"amount": 19.99, "days": 30, "label": "SB Tracking Pro — Mensuel"},
    "pro_annual": {"amount": 191.90, "days": 365, "label": "SB Tracking Pro — Annuel"},
}
# Free-tier limits (beyond these → Pro required)
FREE_VEHICLE_LIMIT = 2
FREE_EMPLOYEE_LIMIT = 3


def _now_dt():
    return datetime.now(timezone.utc)


def _get_stripe(request: Request):
    host_url = str(request.base_url).rstrip("/")
    return StripeCheckout(api_key=STRIPE_API_KEY, webhook_url=f"{host_url}/api/webhook/stripe")


# ----------------------------------------------------------------- entitlement helpers
async def is_pro(user_id: str) -> bool:
    sub = await db.pro_subscriptions.find_one({"user_id": user_id}, {"_id": 0, "expires_at": 1})
    if not sub or not sub.get("expires_at"):
        return False
    try:
        return datetime.fromisoformat(sub["expires_at"]) > _now_dt()
    except Exception:
        return False


async def get_pro_status(user_id: str) -> dict:
    sub = await db.pro_subscriptions.find_one({"user_id": user_id}, {"_id": 0})
    active = False
    days_left = 0
    if sub and sub.get("expires_at"):
        try:
            exp = datetime.fromisoformat(sub["expires_at"])
            active = exp > _now_dt()
            days_left = max(0, (exp - _now_dt()).days)
        except Exception:
            pass
    return {
        "active": active,
        "plan": (sub or {}).get("plan"),
        "expires_at": (sub or {}).get("expires_at"),
        "days_left": days_left,
    }


async def require_pro(user_id: str):
    if not await is_pro(user_id):
        raise HTTPException(status_code=402, detail="Fonctionnalité réservée à SB Tracking Pro")


async def grant_pro(user_id: str, plan: str, session_id: str):
    """Extend (or start) the user's Pro access. Idempotent at call site (txn flip)."""
    days = PRO_PACKAGES.get(plan, {}).get("days", 30)
    sub = await db.pro_subscriptions.find_one({"user_id": user_id}, {"_id": 0})
    base = _now_dt()
    if sub and sub.get("expires_at"):
        try:
            cur = datetime.fromisoformat(sub["expires_at"])
            if cur > base:
                base = cur
        except Exception:
            pass
    expires = (base + timedelta(days=days)).isoformat()
    await db.pro_subscriptions.update_one(
        {"user_id": user_id},
        {"$set": {"user_id": user_id, "plan": plan, "status": "active",
                  "expires_at": expires, "last_session_id": session_id,
                  "reminded_at": None,
                  "updated_at": _now_dt().isoformat()},
         "$setOnInsert": {"started_at": _now_dt().isoformat()}},
        upsert=True,
    )


# ----------------------------------------------------------------- API
@router.get("/status")
async def pro_status(request: Request):
    user = await get_current_user(request)
    st = await get_pro_status(user["id"])
    st["packages"] = [
        {"id": k, "amount": v["amount"], "days": v["days"], "label": v["label"]}
        for k, v in PRO_PACKAGES.items()
    ]
    return st


@router.post("/checkout")
async def create_checkout(request: Request):
    user = await get_current_user(request)
    body = await request.json()
    package_id = body.get("package_id")
    origin_url = (body.get("origin_url") or "").rstrip("/")
    if package_id not in PRO_PACKAGES:
        raise HTTPException(status_code=400, detail="Forfait invalide")
    if not origin_url:
        raise HTTPException(status_code=400, detail="Origin URL requis")
    amount = PRO_PACKAGES[package_id]["amount"]
    success_url = f"{origin_url}/sb-tracking/pro?session_id={{CHECKOUT_SESSION_ID}}"
    cancel_url = f"{origin_url}/sb-tracking/pro"

    stripe = _get_stripe(request)
    req = CheckoutSessionRequest(
        amount=float(amount), currency="eur",
        success_url=success_url, cancel_url=cancel_url,
        metadata={"user_id": user["id"], "package_id": package_id, "type": "tracking_pro",
                  "amount": str(amount)},
    )
    session: CheckoutSessionResponse = await stripe.create_checkout_session(req)
    now = _now_dt().isoformat()
    await db.payment_transactions.insert_one({
        "id": f"pay_{uuid.uuid4().hex[:12]}", "session_id": session.session_id,
        "user_id": user["id"], "amount": amount, "currency": "EUR", "type": "tracking_pro",
        "payment_status": "pending", "status": "initiated",
        "metadata": {"package_id": package_id, "type": "tracking_pro"},
        "created_at": now, "updated_at": now,
    })
    return {"url": session.url, "session_id": session.session_id}


@router.get("/checkout-status/{session_id}")
async def checkout_status(session_id: str, request: Request):
    user = await get_current_user(request)
    tx = await db.payment_transactions.find_one(
        {"session_id": session_id, "user_id": user["id"]}, {"_id": 0})
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction introuvable")
    if tx.get("payment_status") == "paid":
        return {"status": "complete", "payment_status": "paid", "pro": await get_pro_status(user["id"])}

    stripe = _get_stripe(request)
    try:
        status = await stripe.get_checkout_status(session_id)
    except Exception:
        return {"status": tx["status"], "payment_status": tx["payment_status"], "pro": await get_pro_status(user["id"])}

    now = _now_dt().isoformat()
    if status and status.payment_status == "paid":
        res = await db.payment_transactions.update_one(
            {"session_id": session_id, "payment_status": {"$ne": "paid"}},
            {"$set": {"payment_status": "paid", "status": "complete", "updated_at": now}})
        if res.modified_count > 0:
            await grant_pro(user["id"], tx["metadata"]["package_id"], session_id)
        return {"status": "complete", "payment_status": "paid", "pro": await get_pro_status(user["id"])}
    if status and status.status == "expired":
        await db.payment_transactions.update_one(
            {"session_id": session_id},
            {"$set": {"payment_status": "expired", "status": "expired", "updated_at": now}})
        return {"status": "expired", "payment_status": "expired", "pro": await get_pro_status(user["id"])}
    return {"status": status.status if status else "unknown",
            "payment_status": status.payment_status if status else "unknown",
            "pro": await get_pro_status(user["id"])}


# ----------------------------------------------------------------- background loop
async def run_pro_expiry_reminders() -> int:
    """Notify managers whose Pro access expires within 3 days (or just lapsed),
    at most once per 24h. Returns the number of reminders sent. Idempotent."""
    from core.notifications import create_notification
    from core.email import send_pro_expiry_reminder

    frontend = os.environ.get("FRONTEND_URL", "").rstrip("/")
    renew_url = f"{frontend}/sb-tracking/pro" if frontend else "/sb-tracking/pro"
    sent = 0
    now = _now_dt()
    soon = (now + timedelta(days=3)).isoformat()
    floor = (now - timedelta(days=1)).isoformat()  # lapsed up to 1d ago → final nudge
    remind_after = (now - timedelta(hours=24)).isoformat()
    cursor = db.pro_subscriptions.find({
        "status": "active",
        "expires_at": {"$gte": floor, "$lte": soon},
        "$or": [{"reminded_at": None}, {"reminded_at": {"$exists": False}},
                {"reminded_at": {"$lte": remind_after}}],
    })
    for sub in await cursor.to_list(500):
        try:
            exp = datetime.fromisoformat(sub["expires_at"])
            days_left = max(0, (exp - now).days)
            plan = sub.get("plan", "pro_monthly")
            plan_label = PRO_PACKAGES.get(plan, {}).get("label", "SB Tracking Pro")
            expires_label = exp.strftime("%d/%m/%Y")
            await create_notification(
                sub["user_id"], "pro_expiry",
                "👑 Abonnement SB Tracking Pro",
                f"Votre accès Pro expire le {expires_label}. Renouvelez pour ne rien perdre.",
                {"url": "/sb-tracking/pro", "days_left": days_left})
            u = await db.users.find_one({"id": sub["user_id"]}, {"_id": 0, "email": 1, "name": 1})
            if u and u.get("email"):
                await send_pro_expiry_reminder(
                    u["email"], u.get("name", ""), days_left=days_left,
                    expires_label=expires_label, plan_label=plan_label, renew_url=renew_url)
            await db.pro_subscriptions.update_one(
                {"user_id": sub["user_id"]}, {"$set": {"reminded_at": now.isoformat()}})
            sent += 1
        except Exception:
            pass
    return sent


async def pro_expiry_reminder_loop():
    """Twice a day: send Pro expiry reminders (push/WS + email with renewal link)."""
    import asyncio
    while True:
        try:
            await run_pro_expiry_reminders()
        except Exception:
            pass
        await asyncio.sleep(12 * 3600)  # toutes les 12h


