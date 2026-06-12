from fastapi import APIRouter, Request, HTTPException
import uuid
import os
from datetime import datetime, timezone

from core.config import db
from core.deps import get_current_user
from core.fraud import record_fraud_event, ensure_not_blocked, check_wallet_velocity

router = APIRouter(prefix="/wallet", tags=["wallet"])


@router.get("")
async def get_wallet(request: Request):
    """Get user's wallet balance and recent transactions."""
    user = await get_current_user(request)
    # Auto-credit the platform reserve for active drivers/merchants (idempotent).
    floor = 0.0
    try:
        from core.wallet_reserve import ensure_reserve_credited
        floor = await ensure_reserve_credited(user)
    except Exception:
        pass
    wallet = await db.wallets.find_one({"user_id": user["id"]}, {"_id": 0})
    if not wallet:
        wallet = {
            "user_id": user["id"],
            "balance": 0.0,
            "currency": "EUR",
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.wallets.insert_one(wallet)
        wallet.pop("_id", None)

    transactions = await db.wallet_transactions.find(
        {"user_id": user["id"]}, {"_id": 0}
    ).sort("created_at", -1).limit(50).to_list(50)

    balance = wallet["balance"]
    reserve = float(wallet.get("reserve", floor) or 0)
    pending = float(wallet.get("pending_withdraw", 0) or 0)
    non_withdrawable = float(wallet.get("non_withdrawable", 0) or 0)
    can_withdraw = user.get("role") in ("driver", "merchant")
    withdrawable = round(max(0.0, balance - reserve - pending - non_withdrawable), 2) if can_withdraw else 0.0
    return {
        "balance": balance,
        "currency": wallet.get("currency", "EUR"),
        "transactions": transactions,
        "reserve": round(reserve, 2),
        "pending_withdraw": round(pending, 2),
        "non_withdrawable": round(non_withdrawable, 2),
        "withdrawable": withdrawable,
        "can_withdraw": can_withdraw,
    }


@router.post("/topup")
async def topup_wallet(request: Request):
    """Crédit manuel (recharge en espèces par un agent/admin).
    La recharge grand public passe par le paiement Stripe vérifié (/api/payments/checkout).
    Cet endpoint ne crédite PAS sans vérification : il est réservé aux administrateurs."""
    user = await get_current_user(request)
    body = await request.json()
    amount = body.get("amount", 0)

    # Faille fermée : seul un admin peut créditer sans passage par Stripe.
    if user.get("role") != "admin":
        await record_fraud_event(
            event_type="wallet.topup_unauthorized", severity="critical", user_id=user["id"],
            amount=amount, description="Tentative de rechargement wallet sans paiement vérifié (endpoint réservé admin)",
        )
        raise HTTPException(status_code=403, detail="Rechargement direct non autorisé. Utilisez le paiement sécurisé.")

    if amount <= 0:
        raise HTTPException(status_code=400, detail="Le montant doit etre positif")
    if amount > 200:
        raise HTTPException(status_code=400, detail="Montant maximum par transaction: 200 EUR")

    wallet = await db.wallets.find_one({"user_id": user["id"]})
    if not wallet:
        wallet = {"user_id": user["id"], "balance": 0.0, "currency": "EUR", "created_at": datetime.now(timezone.utc).isoformat()}
        await db.wallets.insert_one(wallet)

    new_balance = wallet["balance"] + amount
    await db.wallets.update_one({"user_id": user["id"]}, {"$set": {"balance": round(new_balance, 2)}})

    tx = {
        "id": f"tx_{uuid.uuid4().hex[:12]}",
        "user_id": user["id"],
        "type": "Deposit",
        "amount": amount,
        "balance_after": round(new_balance, 2),
        "description": f"Rechargement wallet +{amount} EUR",
        "payment_method": body.get("payment_method", "card"),
        "status": "completed",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.wallet_transactions.insert_one(tx)
    tx.pop("_id", None)

    # Recharge receipt email (non-blocking).
    if user.get("email"):
        try:
            from core.billing import next_number
            from core.email import fire, send_wallet_receipt
            ref = await next_number("SB-R")
            frontend = os.environ.get("FRONTEND_URL", "").rstrip("/")
            fire(send_wallet_receipt(
                user["email"], user.get("name", ""), kind="recharge", amount=amount,
                balance_after=round(new_balance, 2), ref=ref, wallet_url=f"{frontend}/wallet",
                method=body.get("payment_method", "card"),
            ))
        except Exception:
            pass

    # Auto-recover any outstanding debt FIRST (before the balance can be spent).
    from routes.debts import auto_settle_debts_from_wallet
    recovered = await auto_settle_debts_from_wallet(user["id"])
    final = await db.wallets.find_one({"user_id": user["id"]}, {"_id": 0, "balance": 1})
    final_balance = round(float((final or {}).get("balance", new_balance) or 0), 2)

    return {"message": "Wallet recharged", "balance": final_balance,
            "debt_recovered": recovered, "transaction": tx}


@router.post("/pay")
async def pay_from_wallet(request: Request):
    """Deduct money from wallet for a ride/order."""
    user = await get_current_user(request)
    await ensure_not_blocked(user)
    body = await request.json()
    amount = body.get("amount", 0)
    ride_id = body.get("ride_id")
    order_id = body.get("order_id")
    description = body.get("description", "Paiement")

    if amount <= 0:
        raise HTTPException(status_code=400, detail="Le montant doit etre positif")

    wallet = await db.wallets.find_one({"user_id": user["id"]})
    if not wallet or wallet["balance"] < amount:
        raise HTTPException(status_code=400, detail="Solde insuffisant")

    new_balance = wallet["balance"] - amount
    await db.wallets.update_one({"user_id": user["id"]}, {"$set": {"balance": round(new_balance, 2)}})

    tx = {
        "id": f"tx_{uuid.uuid4().hex[:12]}",
        "user_id": user["id"],
        "type": "Booking",
        "amount": -amount,
        "balance_after": round(new_balance, 2),
        "description": description,
        "ride_id": ride_id,
        "order_id": order_id,
        "status": "completed",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.wallet_transactions.insert_one(tx)
    tx.pop("_id", None)

    from core.cashback import award_cashback
    svc = "ride" if ride_id else ("order" if order_id else "wallet")
    cb = await award_cashback(user["id"], amount, "sbpay", svc, ref_id=ride_id or order_id)
    final_wallet = await db.wallets.find_one({"user_id": user["id"]}, {"_id": 0})
    return {"message": "Payment successful", "balance": round((final_wallet or {}).get("balance", new_balance), 2), "transaction": tx, "cashback": cb}


@router.post("/transfer")
async def transfer_wallet(request: Request):
    """Transfer money between wallets."""
    user = await get_current_user(request)
    await ensure_not_blocked(user)
    body = await request.json()
    to_user_id = body.get("to_user_id")
    amount = body.get("amount", 0)

    if amount <= 0:
        raise HTTPException(status_code=400, detail="Le montant doit etre positif")
    if to_user_id == user["id"]:
        raise HTTPException(status_code=400, detail="Impossible de transferer a soi-meme")

    sender_wallet = await db.wallets.find_one({"user_id": user["id"]})
    if not sender_wallet or sender_wallet["balance"] < amount:
        raise HTTPException(status_code=400, detail="Solde insuffisant")

    receiver = await db.users.find_one({"id": to_user_id})
    if not receiver:
        raise HTTPException(status_code=404, detail="Utilisateur non trouve")

    # Anti-fraude : détection de vélocité (n'interrompt pas un transfert légitime).
    try:
        for sev, msg in await check_wallet_velocity(user["id"], "transfer", float(amount)):
            await record_fraud_event(event_type="wallet.transfer_velocity", severity=sev,
                                     user_id=user["id"], amount=amount, description=msg,
                                     metadata={"to_user_id": to_user_id})
    except Exception:
        pass

    now = datetime.now(timezone.utc).isoformat()

    # Deduct from sender
    new_sender_balance = sender_wallet["balance"] - amount
    await db.wallets.update_one({"user_id": user["id"]}, {"$set": {"balance": round(new_sender_balance, 2)}})

    # Credit receiver (create wallet if needed)
    receiver_wallet = await db.wallets.find_one({"user_id": to_user_id})
    if not receiver_wallet:
        await db.wallets.insert_one({"user_id": to_user_id, "balance": 0.0, "currency": "EUR", "created_at": now})
        receiver_wallet = {"balance": 0.0}

    new_receiver_balance = receiver_wallet["balance"] + amount
    await db.wallets.update_one(
        {"user_id": to_user_id},
        {"$set": {"balance": round(new_receiver_balance, 2)},
         "$inc": {"non_withdrawable": amount}},
    )

    # Create transactions for both
    for tx_data in [
        {"user_id": user["id"], "type": "Transfer", "amount": -amount, "balance_after": round(new_sender_balance, 2), "description": f"Transfert a {receiver.get('name', to_user_id)}"},
        {"user_id": to_user_id, "type": "Transfer", "amount": amount, "balance_after": round(new_receiver_balance, 2), "description": f"Transfert de {user.get('name', user['id'])}"},
    ]:
        tx = {**tx_data, "id": f"tx_{uuid.uuid4().hex[:12]}", "status": "completed", "created_at": now}
        await db.wallet_transactions.insert_one(tx)

    # Transfer receipts to both parties (non-blocking).
    try:
        from core.billing import next_number
        from core.email import fire, send_wallet_receipt
        frontend = os.environ.get("FRONTEND_URL", "").rstrip("/")
        ref = await next_number("SB-T")
        if user.get("email"):
            fire(send_wallet_receipt(user["email"], user.get("name", ""), kind="transfer_out", amount=amount,
                                     balance_after=round(new_sender_balance, 2), ref=ref,
                                     wallet_url=f"{frontend}/wallet", counterparty=receiver.get("name", "")))
        if receiver.get("email"):
            fire(send_wallet_receipt(receiver["email"], receiver.get("name", ""), kind="transfer_in", amount=amount,
                                     balance_after=round(new_receiver_balance, 2), ref=ref,
                                     wallet_url=f"{frontend}/wallet", counterparty=user.get("name", "")))
    except Exception:
        pass

    # Auto-recover the receiver's outstanding debt FIRST after receiving funds.
    from routes.debts import auto_settle_debts_from_wallet
    await auto_settle_debts_from_wallet(to_user_id)

    return {"message": "Transfer successful", "balance": round(new_sender_balance, 2)}


@router.post("/refund")
async def refund_to_wallet(request: Request):
    """Refund money back to a wallet — réservé aux administrateurs/système.
    Faille fermée : un utilisateur ne peut plus s'auto-créditer."""
    user = await get_current_user(request)
    body = await request.json()
    amount = body.get("amount", 0)
    reason = body.get("reason", "Remboursement")

    if user.get("role") != "admin":
        await record_fraud_event(
            event_type="wallet.refund_unauthorized", severity="critical", user_id=user["id"],
            amount=amount, description="Tentative d'auto-remboursement wallet (endpoint réservé admin)",
        )
        raise HTTPException(status_code=403, detail="Remboursement non autorisé.")

    if amount <= 0:
        raise HTTPException(status_code=400, detail="Le montant doit etre positif")

    # L'admin crédite un utilisateur cible (sinon lui-même par défaut).
    target_id = body.get("target_user_id") or user["id"]
    wallet = await db.wallets.find_one({"user_id": target_id})
    if not wallet:
        wallet = {"user_id": target_id, "balance": 0.0, "currency": "EUR", "created_at": datetime.now(timezone.utc).isoformat()}
        await db.wallets.insert_one(wallet)

    new_balance = wallet["balance"] + amount
    await db.wallets.update_one({"user_id": target_id}, {"$set": {"balance": round(new_balance, 2)}})

    tx = {
        "id": f"tx_{uuid.uuid4().hex[:12]}",
        "user_id": target_id,
        "type": "Refund",
        "amount": amount,
        "balance_after": round(new_balance, 2),
        "description": reason,
        "status": "completed",
        "refunded_by": user["id"],
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.wallet_transactions.insert_one(tx)
    tx.pop("_id", None)

    try:
        from routes.audit_logs import log_action
        await log_action(actor_id=user["id"], actor_role="admin", action="wallet.refund",
                         target_type="user", target_id=target_id, reason=reason,
                         payload_after={"amount": amount})
    except Exception:
        pass

    return {"message": "Refund processed", "balance": round(new_balance, 2), "transaction": tx}
