"""Shared SB Pay debit & refund helpers with automatic cash-fallback.

Used by parcels, Coursier Express and medical-transport bookings: the fare is
debited from the unified SB Pay wallet (db.wallets) BEFORE the driver search is
launched. If the balance is insufficient the booking is NOT blocked — it silently
falls back to cash ("payé en espèces") and the caller warns the user.

NOTE: 'wallet' and the legacy 'sbpaygo' label now point to the SAME unified
wallet (db.wallets) since the SB Pay unification (P0.3).
"""
import uuid
from datetime import datetime, timezone

from core.config import db
from core.cashback import award_cashback

WALLET_METHODS = ("wallet", "sbpaygo", "sbpay")


async def debit_with_fallback(user_id: str, amount: float, method: str, description: str,
                              service: str = "", ref_id=None) -> dict:
    """Try to debit the unified SB Pay wallet up-front. On insufficient balance,
    fall back to cash instead of raising.

    Returns dict:
      - cash / card        -> {"paid": False, "method": <method>, "fallback_to_cash": False}
      - wallet OK          -> {"paid": True,  "method": "wallet", "fallback_to_cash": False}
      - wallet short       -> {"paid": False, "method": "cash",   "fallback_to_cash": True}
    """
    if method not in WALLET_METHODS or amount is None or amount <= 0:
        return {"paid": False, "method": method, "fallback_to_cash": False}

    ts = datetime.now(timezone.utc).isoformat()
    amount = round(float(amount), 2)

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
    cashback = 0.0
    if service:
        cashback = await award_cashback(user_id, amount, "sbpay", service, ref_id=ref_id)
    return {"paid": True, "method": "wallet", "fallback_to_cash": False, "cashback": cashback}


async def refund_user(user_id: str, amount: float, method: str, description: str):
    """Credit back the user's unified SB Pay wallet (used on cancellation)."""
    if amount is None or amount <= 0 or method not in WALLET_METHODS:
        return
    ts = datetime.now(timezone.utc).isoformat()
    amount = round(float(amount), 2)
    await db.wallets.update_one({"user_id": user_id}, {"$inc": {"balance": amount}}, upsert=True)
    w = await db.wallets.find_one({"user_id": user_id}, {"_id": 0})
    await db.wallet_transactions.insert_one({
        "id": f"tx_{uuid.uuid4().hex[:12]}", "user_id": user_id, "type": "Refund",
        "amount": amount, "balance_after": round((w or {}).get("balance", 0), 2),
        "description": description, "status": "completed", "created_at": ts,
    })
