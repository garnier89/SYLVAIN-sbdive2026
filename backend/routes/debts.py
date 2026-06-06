"""
Cancellation debt — when a passenger owes a cancellation fee they cannot
immediately settle (no wallet balance), an unpaid debt is recorded. The debt
blocks new bookings and is surfaced to the client until paid.
"""
from fastapi import APIRouter, Request, HTTPException
import uuid
from datetime import datetime, timezone

from core.config import db
from core.deps import get_current_user

router = APIRouter(prefix="/debts", tags=["debts"])


# ── Helpers (imported by rides.py) ───────────────────────────────────────
async def get_unpaid_debt_total(user_id: str) -> float:
    items = await db.cancellation_debts.find(
        {"user_id": user_id, "paid": False}, {"_id": 0, "amount": 1}
    ).to_list(200)
    return round(sum(float(i.get("amount", 0) or 0) for i in items), 2)


async def settle_cancellation_fee(user_id: str, ride_id: str, fee: float) -> dict:
    """Charge the fee from the wallet if possible; otherwise record a debt."""
    fee = round(float(fee or 0), 2)
    if fee <= 0:
        return {"fee": 0.0, "debt_created": False, "paid_from_wallet": False}
    wallet = await db.wallets.find_one({"user_id": user_id})
    bal = float((wallet or {}).get("balance", 0.0) or 0.0)
    if bal >= fee:
        new_bal = round(bal - fee, 2)
        await db.wallets.update_one({"user_id": user_id}, {"$set": {"balance": new_bal}})
        await db.wallet_transactions.insert_one({
            "id": f"tx_{uuid.uuid4().hex[:12]}", "user_id": user_id,
            "type": "debit", "amount": fee, "balance_after": new_bal,
            "description": "Frais d'annulation", "ride_id": ride_id,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        return {"fee": fee, "debt_created": False, "paid_from_wallet": True}
    debt = {
        "id": f"debt_{uuid.uuid4().hex[:12]}", "user_id": user_id, "ride_id": ride_id,
        "amount": fee, "reason": "cancellation", "paid": False,
        "created_at": datetime.now(timezone.utc).isoformat(), "paid_at": None,
    }
    await db.cancellation_debts.insert_one(debt)
    return {"fee": fee, "debt_created": True, "paid_from_wallet": False, "debt_amount": fee}


# ── Endpoints ─────────────────────────────────────────────────────────────
@router.get("/me")
async def my_debts(request: Request):
    user = await get_current_user(request)
    items = await db.cancellation_debts.find(
        {"user_id": user["id"], "paid": False}, {"_id": 0}
    ).sort("created_at", 1).to_list(200)
    total = round(sum(float(i.get("amount", 0) or 0) for i in items), 2)
    return {"has_debt": total > 0, "total": total, "items": items}


@router.post("/pay")
async def pay_debts(request: Request):
    """Settle all unpaid cancellation debts from the wallet balance."""
    user = await get_current_user(request)
    items = await db.cancellation_debts.find(
        {"user_id": user["id"], "paid": False}, {"_id": 0}
    ).to_list(200)
    total = round(sum(float(i.get("amount", 0) or 0) for i in items), 2)
    if total <= 0:
        return {"message": "Aucune dette", "paid": True, "total": 0.0}
    wallet = await db.wallets.find_one({"user_id": user["id"]})
    bal = float((wallet or {}).get("balance", 0.0) or 0.0)
    if bal < total:
        raise HTTPException(
            status_code=402,
            detail=f"Solde insuffisant ({bal:.2f} €) pour régler la dette de {total:.2f} €. Rechargez votre portefeuille.",
        )
    new_bal = round(bal - total, 2)
    now = datetime.now(timezone.utc).isoformat()
    await db.wallets.update_one({"user_id": user["id"]}, {"$set": {"balance": new_bal}})
    await db.wallet_transactions.insert_one({
        "id": f"tx_{uuid.uuid4().hex[:12]}", "user_id": user["id"],
        "type": "debit", "amount": total, "balance_after": new_bal,
        "description": "Règlement dette d'annulation", "created_at": now,
    })
    await db.cancellation_debts.update_many(
        {"user_id": user["id"], "paid": False},
        {"$set": {"paid": True, "paid_at": now}},
    )
    return {"message": "Dette réglée", "paid": True, "total": total, "balance": new_bal}
