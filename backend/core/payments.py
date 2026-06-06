"""Shared wallet / SB PayGo debit & refund helpers with automatic cash-fallback.

Used by parcels, Coursier Express and medical-transport bookings: the fare is
debited from the wallet / SB PayGo BEFORE the driver search is launched. If the
balance is insufficient the booking is NOT blocked — it silently falls back to
cash ("payé en espèces") and the caller warns the user.
"""
import uuid
from datetime import datetime, timezone

from core.config import db


async def debit_with_fallback(user_id: str, amount: float, method: str, description: str) -> dict:
    """Try to debit wallet / SB PayGo up-front. On insufficient balance, fall back
    to cash instead of raising.

    Returns dict:
      - cash / card           -> {"paid": False, "method": <method>, "fallback_to_cash": False}
      - wallet/sbpaygo OK      -> {"paid": True,  "method": <method>, "fallback_to_cash": False}
      - wallet/sbpaygo short   -> {"paid": False, "method": "cash",   "fallback_to_cash": True}
    """
    if method not in ("wallet", "sbpaygo") or amount is None or amount <= 0:
        return {"paid": False, "method": method, "fallback_to_cash": False}

    ts = datetime.now(timezone.utc).isoformat()
    amount = round(float(amount), 2)

    if method == "wallet":
        res = await db.wallets.update_one(
            {"user_id": user_id, "balance": {"$gte": amount}},
            {"$inc": {"balance": -amount}},
        )
        if res.modified_count == 0:
            return {"paid": False, "method": "cash", "fallback_to_cash": True}
        w = await db.wallets.find_one({"user_id": user_id}, {"_id": 0})
        await db.wallet_transactions.insert_one({
            "id": f"tx_{uuid.uuid4().hex[:12]}", "user_id": user_id, "type": "Booking",
            "amount": -amount, "balance_after": round((w or {}).get("balance", 0), 2),
            "description": description, "status": "completed", "created_at": ts,
        })
        return {"paid": True, "method": "wallet", "fallback_to_cash": False}

    # sbpaygo
    res = await db.sbpaygo_wallets.update_one(
        {"user_id": user_id, "balance": {"$gte": amount}},
        {"$inc": {"balance": -amount},
         "$push": {"transactions": {"id": f"tx_{uuid.uuid4().hex[:10]}", "type": "booking",
                                    "amount": -amount, "description": description, "created_at": ts}}},
    )
    if res.modified_count == 0:
        return {"paid": False, "method": "cash", "fallback_to_cash": True}
    return {"paid": True, "method": "sbpaygo", "fallback_to_cash": False}


async def refund_user(user_id: str, amount: float, method: str, description: str):
    """Credit back the user's wallet / SB PayGo balance (used on cancellation)."""
    if amount is None or amount <= 0 or method not in ("wallet", "sbpaygo"):
        return
    ts = datetime.now(timezone.utc).isoformat()
    amount = round(float(amount), 2)
    if method == "wallet":
        await db.wallets.update_one({"user_id": user_id}, {"$inc": {"balance": amount}})
        w = await db.wallets.find_one({"user_id": user_id}, {"_id": 0})
        await db.wallet_transactions.insert_one({
            "id": f"tx_{uuid.uuid4().hex[:12]}", "user_id": user_id, "type": "Refund",
            "amount": amount, "balance_after": round((w or {}).get("balance", 0), 2),
            "description": description, "status": "completed", "created_at": ts,
        })
    else:
        await db.sbpaygo_wallets.update_one(
            {"user_id": user_id},
            {"$inc": {"balance": amount},
             "$push": {"transactions": {"id": f"tx_{uuid.uuid4().hex[:10]}", "type": "refund",
                                        "amount": amount, "description": description, "created_at": ts}}},
        )
