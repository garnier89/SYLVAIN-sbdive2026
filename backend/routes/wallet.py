from fastapi import APIRouter, Request, HTTPException
import uuid
from datetime import datetime, timezone

from core.config import db
from core.deps import get_current_user

router = APIRouter(prefix="/wallet", tags=["wallet"])


@router.get("")
async def get_wallet(request: Request):
    """Get user's wallet balance and recent transactions."""
    user = await get_current_user(request)
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

    return {"balance": wallet["balance"], "currency": wallet.get("currency", "EUR"), "transactions": transactions}


@router.post("/topup")
async def topup_wallet(request: Request):
    """Add money to wallet (Cash/Card/Stripe)."""
    user = await get_current_user(request)
    body = await request.json()
    amount = body.get("amount", 0)

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

    return {"message": "Wallet recharged", "balance": round(new_balance, 2), "transaction": tx}


@router.post("/pay")
async def pay_from_wallet(request: Request):
    """Deduct money from wallet for a ride/order."""
    user = await get_current_user(request)
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

    return {"message": "Payment successful", "balance": round(new_balance, 2), "transaction": tx}


@router.post("/transfer")
async def transfer_wallet(request: Request):
    """Transfer money between wallets."""
    user = await get_current_user(request)
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
    await db.wallets.update_one({"user_id": to_user_id}, {"$set": {"balance": round(new_receiver_balance, 2)}})

    # Create transactions for both
    for tx_data in [
        {"user_id": user["id"], "type": "Transfer", "amount": -amount, "balance_after": round(new_sender_balance, 2), "description": f"Transfert a {receiver.get('name', to_user_id)}"},
        {"user_id": to_user_id, "type": "Transfer", "amount": amount, "balance_after": round(new_receiver_balance, 2), "description": f"Transfert de {user.get('name', user['id'])}"},
    ]:
        tx = {**tx_data, "id": f"tx_{uuid.uuid4().hex[:12]}", "status": "completed", "created_at": now}
        await db.wallet_transactions.insert_one(tx)

    return {"message": "Transfer successful", "balance": round(new_sender_balance, 2)}


@router.post("/refund")
async def refund_to_wallet(request: Request):
    """Refund money back to wallet (admin or system)."""
    user = await get_current_user(request)
    body = await request.json()
    amount = body.get("amount", 0)
    reason = body.get("reason", "Remboursement")

    if amount <= 0:
        raise HTTPException(status_code=400, detail="Le montant doit etre positif")

    wallet = await db.wallets.find_one({"user_id": user["id"]})
    if not wallet:
        wallet = {"user_id": user["id"], "balance": 0.0, "currency": "EUR", "created_at": datetime.now(timezone.utc).isoformat()}
        await db.wallets.insert_one(wallet)

    new_balance = wallet["balance"] + amount
    await db.wallets.update_one({"user_id": user["id"]}, {"$set": {"balance": round(new_balance, 2)}})

    tx = {
        "id": f"tx_{uuid.uuid4().hex[:12]}",
        "user_id": user["id"],
        "type": "Refund",
        "amount": amount,
        "balance_after": round(new_balance, 2),
        "description": reason,
        "status": "completed",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.wallet_transactions.insert_one(tx)
    tx.pop("_id", None)

    return {"message": "Refund processed", "balance": round(new_balance, 2), "transaction": tx}
