"""Ride payment reconciliation helpers (extracted from routes/rides.py — Phase 3).

Pure-ish payment/settlement logic shared by the ride handlers:
  - cash-eligibility for drivers,
  - wallet feasibility check,
  - mid-ride switch-to-cash guard,
  - Intercity deposit refund,
  - ride invoice numbering.

These are imported back into routes/rides.py (and re-exported there for
backward compatibility with routes/phase1.py and the test-suite).
"""
import os
import uuid
from datetime import datetime, timezone

from core.config import db
from core.websocket import manager

# Cash rides are only offered to drivers whose wallet balance is at least this
# amount (so they can refund change / cover platform fees). Drivers below it
# simply never receive cash-payment ride requests. Override via env if needed.
CASH_RIDE_MIN_BALANCE = float(os.environ.get("CASH_RIDE_MIN_BALANCE", "1.0"))

VALID_PAYMENT_METHODS = {"cash", "card", "wallet", "sbpaygo"}


async def _driver_meets_cash_minimum(user_id: str) -> bool:
    """True if the driver's wallet balance is >= the cash-ride minimum."""
    w = await db.wallets.find_one({"user_id": user_id}, {"_id": 0, "balance": 1})
    return bool(w) and float(w.get("balance", 0) or 0) >= CASH_RIDE_MIN_BALANCE


async def _payment_feasibility(user_id: str, method: str, fare: float):
    """For wallet, check the balance and compute the cash shortfall. Other
    methods are considered feasible at this stage (CB hold handled separately)."""
    if method == "wallet":
        wallet = await db.wallets.find_one({"user_id": user_id})
        bal = float((wallet or {}).get("balance", 0.0) or 0.0)
        if bal < fare:
            return {"sufficient": False, "balance": round(bal, 2), "shortfall": round(fare - bal, 2), "difference_in_cash": True}
        return {"sufficient": True, "balance": round(bal, 2), "shortfall": 0.0, "difference_in_cash": False}
    return {"sufficient": True, "balance": None, "shortfall": 0.0, "difference_in_cash": False}


async def switch_to_cash_if_needed(ride: dict, driver_user_id: str, now: str):
    """Mid-ride payment guard. When a ride paid via the SB Pay wallet starts but
    the rider's balance can't cover the fare (card/wallet effectively failed), the
    ride is switched to CASH and the driver is FLASHED in real time so they collect
    cash instead. Returns the flash payload (or None when no switch was needed)."""
    pm = (ride.get("payment_method") or "").strip().lower()
    if pm not in ("wallet", "sbpay", "sbpaygo"):
        return None
    fare = float(ride.get("final_fare") or ride.get("estimated_fare") or 0)
    if fare <= 0:
        return None
    wallet = await db.wallets.find_one({"user_id": ride["user_id"]}, {"_id": 0, "balance": 1})
    bal = float((wallet or {}).get("balance", 0) or 0)
    if bal >= fare:
        return None
    shortfall = round(fare - bal, 2)
    await db.rides.update_one({"id": ride["id"]}, {"$set": {
        "payment_method": "cash",
        "payment_switched_to_cash": True,
        "payment_switch_reason": "insufficient_wallet",
        "original_payment_method": pm,
        "payment_shortfall": shortfall,
        "difference_in_cash": True,
        "payment_switched_at": now,
    }})
    flash = {
        "type": "payment_switched_to_cash",
        "ride_id": ride["id"],
        "amount": round(fare, 2),
        "shortfall": shortfall,
        "from_method": pm,
        "message": (f"💳➡️💵 Paiement basculé en espèces : le portefeuille du client "
                    f"ne couvre pas la course. Encaissez {fare:.2f} € en espèces."),
        "timestamp": now,
    }
    if driver_user_id:
        await manager.send_personal_message(flash, driver_user_id)
    await manager.send_to_ride_room(ride["id"], flash, exclude=ride.get("user_id"))
    # Warn the RIDER in real time so they prepare cash and avoid friction at drop-off.
    rider_id = ride.get("user_id")
    if rider_id:
        await manager.send_personal_message({
            "type": "payment_switched_to_cash",
            "ride_id": ride["id"],
            "amount": round(fare, 2),
            "role": "rider",
            "message": (f"Solde insuffisant — préparez le paiement en espèces "
                        f"({fare:.2f} €) auprès du chauffeur."),
            "timestamp": now,
        }, rider_id)
    try:
        from core.notifications import create_notification
        if driver_user_id:
            await create_notification(
                driver_user_id, "payment", "Paiement basculé en espèces 💵",
                f"La carte / le portefeuille du client ne couvre pas la course "
                f"({fare:.2f} €). Encaissez le montant en espèces.",
                data={"ride_id": ride["id"], "amount": round(fare, 2), "kind": "payment_switch"},
            )
        if rider_id:
            await create_notification(
                rider_id, "payment", "Préparez le paiement en espèces 💵",
                f"Votre solde SB Pay ne couvre pas la course ({fare:.2f} €). "
                f"Le paiement se fera en espèces auprès du chauffeur.",
                data={"ride_id": ride["id"], "amount": round(fare, 2), "kind": "payment_switch"},
            )
    except Exception:
        pass
    return flash


async def _refund_intercity_deposit(ride: dict, reason: str = "cancelled") -> float:
    """Rembourse au passager la caution Intercité encore en séquestre (annulation)."""
    if (ride or {}).get("deposit_status") != "held":
        return 0.0
    amt = round(float(ride.get("intercity_deposit") or 0), 2)
    if amt <= 0:
        await db.rides.update_one({"id": ride["id"]}, {"$set": {"deposit_status": "refunded"}})
        return 0.0
    await db.wallets.update_one({"user_id": ride["user_id"]}, {"$inc": {"balance": amt}}, upsert=True)
    w = await db.wallets.find_one({"user_id": ride["user_id"]}, {"_id": 0, "balance": 1})
    await db.wallet_transactions.insert_one({
        "id": f"tx_{uuid.uuid4().hex[:12]}", "user_id": ride["user_id"], "type": "Refund",
        "amount": amt, "balance_after": round((w or {}).get("balance", 0), 2),
        "description": "Remboursement caution Intercité (annulation)", "ride_id": ride["id"],
        "status": "completed", "created_at": datetime.now(timezone.utc).isoformat()})
    await db.rides.update_one({"id": ride["id"]}, {"$set": {"deposit_status": "refunded", "intercity_deposit_refunded": amt}})
    return amt


async def _ride_invoice_number() -> str:
    from core.billing import next_number
    return await next_number("SB-C")
