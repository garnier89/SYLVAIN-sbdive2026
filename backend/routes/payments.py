import os
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Request, HTTPException

from emergentintegrations.payments.stripe.checkout import (
    StripeCheckout, CheckoutSessionRequest, CheckoutSessionResponse, CheckoutStatusResponse
)
from core.config import db
from core.deps import get_current_user

router = APIRouter(prefix="/payments", tags=["payments"])

# Fixed topup packages - NEVER accept amounts from frontend
TOPUP_PACKAGES = {
    "10": 10.0,
    "20": 20.0,
    "50": 50.0,
    "100": 100.0,
}

STRIPE_API_KEY = os.environ.get("STRIPE_API_KEY", "")


def get_stripe(request: Request):
    host_url = str(request.base_url).rstrip("/")
    webhook_url = f"{host_url}/api/webhook/stripe"
    return StripeCheckout(api_key=STRIPE_API_KEY, webhook_url=webhook_url)


@router.post("/checkout")
async def create_checkout(request: Request):
    """Create a Stripe checkout session for wallet topup."""
    user = await get_current_user(request)
    body = await request.json()

    package_id = body.get("package_id")
    custom_amount = body.get("custom_amount")
    origin_url = body.get("origin_url", "")
    # Where to return after Stripe (so drivers stay on /chauffeur/wallet, etc.).
    return_path = body.get("return_path", "/wallet")
    if not isinstance(return_path, str) or not return_path.startswith("/"):
        return_path = "/wallet"

    if not origin_url:
        raise HTTPException(status_code=400, detail="Origin URL required")

    # Server-side amount resolution — NEVER trust a raw price from the client.
    if package_id is not None and str(package_id) in TOPUP_PACKAGES:
        amount = TOPUP_PACKAGES[str(package_id)]
        package_id = str(package_id)
    elif custom_amount is not None:
        try:
            amount = round(float(custom_amount), 2)
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail="Montant invalide")
        if amount < 1 or amount > 5000:
            raise HTTPException(status_code=400, detail="Montant invalide (1 - 5000 €)")
        package_id = "custom"
    else:
        raise HTTPException(status_code=400, detail="Montant invalide")
    sep = "&" if "?" in return_path else "?"
    success_url = f"{origin_url}{return_path}{sep}session_id={{CHECKOUT_SESSION_ID}}"
    cancel_url = f"{origin_url}{return_path}"

    stripe = get_stripe(request)
    checkout_req = CheckoutSessionRequest(
        amount=float(amount),
        currency="eur",
        success_url=success_url,
        cancel_url=cancel_url,
        metadata={
            "user_id": user["id"],
            "package_id": package_id,
            "amount": str(amount),
            "type": "wallet_topup",
        }
    )
    session: CheckoutSessionResponse = await stripe.create_checkout_session(checkout_req)

    # Record transaction as pending BEFORE redirect
    now = datetime.now(timezone.utc).isoformat()
    await db.payment_transactions.insert_one({
        "id": f"pay_{uuid.uuid4().hex[:12]}",
        "session_id": session.session_id,
        "user_id": user["id"],
        "amount": amount,
        "currency": "EUR",
        "type": "wallet_topup",
        "payment_status": "pending",
        "status": "initiated",
        "metadata": {"package_id": package_id},
        "created_at": now,
        "updated_at": now,
    })

    return {"url": session.url, "session_id": session.session_id}


@router.get("/status/{session_id}")
async def get_payment_status(session_id: str, request: Request):
    """Poll payment status and update wallet if paid."""
    user = await get_current_user(request)

    # Find the payment transaction
    tx = await db.payment_transactions.find_one(
        {"session_id": session_id, "user_id": user["id"]},
        {"_id": 0}
    )
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction introuvable")

    # If already processed, return cached status
    if tx.get("payment_status") == "paid":
        return {
            "status": tx["status"],
            "payment_status": "paid",
            "amount": tx["amount"],
            "currency": tx["currency"],
        }

    # Poll Stripe for latest status
    stripe = get_stripe(request)
    status = None
    try:
        status = await stripe.get_checkout_status(session_id)
    except Exception:
        return {
            "status": tx["status"],
            "payment_status": tx["payment_status"],
            "amount": tx["amount"],
            "currency": tx["currency"],
        }

    now = datetime.now(timezone.utc).isoformat()

    if status and status.payment_status == "paid" and tx.get("payment_status") != "paid":
        # Credit wallet - atomic update to prevent double crediting
        result = await db.payment_transactions.update_one(
            {"session_id": session_id, "payment_status": {"$ne": "paid"}},
            {"$set": {"payment_status": "paid", "status": "complete", "updated_at": now}}
        )

        if result.modified_count > 0:
            # Actually credit the wallet
            amount = tx["amount"]
            wallet = await db.wallets.find_one({"user_id": user["id"]}, {"_id": 0})
            new_balance = (wallet["balance"] if wallet else 0) + amount

            await db.wallets.update_one(
                {"user_id": user["id"]},
                {"$inc": {"balance": amount}},
                upsert=True
            )
            await db.wallet_transactions.insert_one({
                "id": f"tx_{uuid.uuid4().hex[:12]}",
                "user_id": user["id"],
                "amount": amount,
                "type": "topup",
                "description": f"Recharge portefeuille - {amount} EUR (Stripe)",
                "balance_after": new_balance,
                "created_at": now,
            })

        return {
            "status": "complete",
            "payment_status": "paid",
            "amount": tx["amount"],
            "currency": tx["currency"],
        }
    elif status and status.status == "expired":
        await db.payment_transactions.update_one(
            {"session_id": session_id},
            {"$set": {"payment_status": "expired", "status": "expired", "updated_at": now}}
        )
        return {
            "status": "expired",
            "payment_status": "expired",
            "amount": tx["amount"],
            "currency": tx["currency"],
        }

    # Still pending
    return {
        "status": status.status if status else "unknown",
        "payment_status": status.payment_status if status else "unknown",
        "amount": tx["amount"],
        "currency": tx["currency"],
    }
