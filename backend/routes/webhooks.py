import os
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Request

from emergentintegrations.payments.stripe.checkout import StripeCheckout
from core.config import db

router = APIRouter(tags=["webhooks"])

STRIPE_API_KEY = os.environ.get("STRIPE_API_KEY", "")


@router.post("/webhook/stripe")
async def stripe_webhook(request: Request):
    """Handle Stripe webhook events."""
    body = await request.body()
    sig = request.headers.get("Stripe-Signature", "")

    host_url = str(request.base_url).rstrip("/")
    webhook_url = f"{host_url}/api/webhook/stripe"
    stripe = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url=webhook_url)

    try:
        event = await stripe.handle_webhook(body, sig)
    except Exception:
        return {"status": "error", "message": "Invalid webhook"}

    event_type = getattr(event, "event_type", "") or ""

    # ── Litige / chargeback Stripe ──────────────────────────────────────────
    # La banque du client conteste un paiement → Stripe récupère les fonds.
    # On débite le portefeuille, on signale et on bloque les récidivistes.
    if "dispute" in event_type.lower() or "charge.dispute" in event_type.lower():
        try:
            from core.fraud import process_chargeback, record_fraud_event
            session_id = getattr(event, "session_id", None)
            meta = getattr(event, "metadata", {}) or {}
            tx = None
            if session_id:
                tx = await db.payment_transactions.find_one({"session_id": session_id}, {"_id": 0})
            user_id = (tx or {}).get("user_id") or meta.get("user_id")
            amount = (tx or {}).get("amount") or meta.get("amount")
            if user_id and amount:
                await process_chargeback(user_id=user_id, amount=float(amount),
                                         reference=getattr(event, "event_id", "") or "stripe-dispute",
                                         source="stripe_webhook")
            else:
                # Impossible de rapprocher automatiquement → alerte critique pour traitement manuel
                await record_fraud_event(
                    event_type="wallet.chargeback_unmapped", severity="critical",
                    description="Litige Stripe reçu mais non rapproché à un utilisateur — à traiter manuellement.",
                    metadata={"event_id": getattr(event, "event_id", None), "session_id": session_id, "stripe_metadata": meta},
                )
        except Exception:
            pass
        return {"status": "ok"}

    if event.payment_status == "paid":
        session_id = event.session_id
        now = datetime.now(timezone.utc).isoformat()

        # Atomic update to prevent double processing
        result = await db.payment_transactions.update_one(
            {"session_id": session_id, "payment_status": {"$ne": "paid"}},
            {"$set": {"payment_status": "paid", "status": "complete", "updated_at": now}}
        )

        if result.modified_count > 0:
            tx = await db.payment_transactions.find_one({"session_id": session_id}, {"_id": 0})
            if tx:
                user_id = tx["user_id"]
                amount = tx["amount"]

                wallet = await db.wallets.find_one({"user_id": user_id}, {"_id": 0})
                new_balance = (wallet["balance"] if wallet else 0) + amount

                await db.wallets.update_one(
                    {"user_id": user_id},
                    {"$inc": {"balance": amount}},
                    upsert=True
                )
                await db.wallet_transactions.insert_one({
                    "id": f"tx_{uuid.uuid4().hex[:12]}",
                    "user_id": user_id,
                    "amount": amount,
                    "type": "topup",
                    "description": f"Recharge portefeuille - {amount} EUR (Stripe)",
                    "balance_after": new_balance,
                    "created_at": now,
                })

    return {"status": "ok"}
