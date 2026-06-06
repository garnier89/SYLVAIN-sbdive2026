"""
Cancellation debt — when a passenger owes a cancellation fee they cannot
immediately settle (no wallet balance), an unpaid debt is recorded.

Behaviour (V3Cube parity):
- A debt NO LONGER blocks new bookings. Instead it is *carried forward* onto the
  passenger's next ride. On completion of that ride the debt is settled:
    * cash ride    → the passenger pays (fare + debt) in cash to the NEW driver,
      so the debt amount is debited from the new driver's wallet and credited to
      the PREVIOUS (wronged) driver.
    * wallet ride  → the debt is charged to the passenger's wallet and credited
      to the previous driver.
    * card/sbpaygo → collected with the digital ride payment (simulated); the
      previous driver is still credited.
- The passenger may also settle the debt at any time from the wallet (DebtBanner).
"""
from fastapi import APIRouter, Request, HTTPException
import uuid
from datetime import datetime, timezone

from core.config import db
from core.deps import get_current_user

router = APIRouter(prefix="/debts", tags=["debts"])


def _now():
    return datetime.now(timezone.utc).isoformat()


# ── Wallet helpers ────────────────────────────────────────────────────────
async def _credit_wallet(user_id, amount, description, ride_id=None):
    amount = round(float(amount or 0), 2)
    if not user_id or amount <= 0:
        return
    wallet = await db.wallets.find_one({"user_id": user_id})
    bal = float((wallet or {}).get("balance", 0.0) or 0.0)
    new_bal = round(bal + amount, 2)
    if wallet:
        await db.wallets.update_one({"user_id": user_id}, {"$set": {"balance": new_bal}})
    else:
        await db.wallets.insert_one({"user_id": user_id, "balance": new_bal, "currency": "EUR", "created_at": _now()})
    await db.wallet_transactions.insert_one({
        "id": f"tx_{uuid.uuid4().hex[:12]}", "user_id": user_id,
        "type": "credit", "amount": amount, "balance_after": new_bal,
        "description": description, "ride_id": ride_id, "created_at": _now(),
    })


async def _debit_wallet(user_id, amount, description, ride_id=None):
    amount = round(float(amount or 0), 2)
    if not user_id or amount <= 0:
        return
    wallet = await db.wallets.find_one({"user_id": user_id})
    bal = float((wallet or {}).get("balance", 0.0) or 0.0)
    new_bal = round(bal - amount, 2)
    if wallet:
        await db.wallets.update_one({"user_id": user_id}, {"$set": {"balance": new_bal}})
    else:
        await db.wallets.insert_one({"user_id": user_id, "balance": new_bal, "currency": "EUR", "created_at": _now()})
    await db.wallet_transactions.insert_one({
        "id": f"tx_{uuid.uuid4().hex[:12]}", "user_id": user_id,
        "type": "debit", "amount": amount, "balance_after": new_bal,
        "description": description, "ride_id": ride_id, "created_at": _now(),
    })


async def _reimburse_driver(driver_id, amount, ride_id=None):
    """Credit the wronged previous driver's wallet (cancellation reimbursement)."""
    amount = round(float(amount or 0), 2)
    if not driver_id or amount <= 0:
        return
    drv = await db.drivers.find_one({"id": driver_id}, {"_id": 0, "user_id": 1})
    duid = (drv or {}).get("user_id")
    if not duid:
        return
    await _credit_wallet(duid, amount, "Remboursement annulation passager", ride_id)
    try:
        from core.notifications import create_notification
        await create_notification(
            duid, "earning", "Remboursement d'annulation 💸",
            f"+{amount:.2f} € — frais d'annulation d'un passager",
            data={"amount": amount, "ride_id": ride_id, "kind": "cancellation_refund"},
        )
    except Exception:
        pass


# ── Helpers (imported by rides.py) ───────────────────────────────────────
async def get_unpaid_debt_total(user_id):
    items = await db.cancellation_debts.find(
        {"user_id": user_id, "paid": False}, {"_id": 0, "amount": 1}
    ).to_list(200)
    return round(sum(float(i.get("amount", 0) or 0) for i in items), 2)


async def settle_cancellation_fee(user_id, ride_id, fee, owed_to_driver_id=None):
    """Charge the fee from the wallet if possible (and reimburse the wronged
    driver); otherwise record an unpaid debt that follows the next ride."""
    fee = round(float(fee or 0), 2)
    if fee <= 0:
        return {"fee": 0.0, "debt_created": False, "paid_from_wallet": False}
    wallet = await db.wallets.find_one({"user_id": user_id})
    bal = float((wallet or {}).get("balance", 0.0) or 0.0)
    if bal >= fee:
        await _debit_wallet(user_id, fee, "Frais d'annulation", ride_id)
        await _reimburse_driver(owed_to_driver_id, fee, ride_id)
        return {"fee": fee, "debt_created": False, "paid_from_wallet": True}
    debt = {
        "id": f"debt_{uuid.uuid4().hex[:12]}", "user_id": user_id, "ride_id": ride_id,
        "amount": fee, "reason": "cancellation", "paid": False,
        "owed_to_driver_id": owed_to_driver_id, "carried_ride_id": None,
        "created_at": _now(), "paid_at": None,
    }
    await db.cancellation_debts.insert_one(debt)
    return {"fee": fee, "debt_created": True, "paid_from_wallet": False, "debt_amount": fee}


async def carry_unpaid_debts_to_ride(user_id, ride_id):
    """Attach all not-yet-carried unpaid debts to a freshly created ride.
    Returns {amount, debt_ids, owed:[{driver_id, amount}]} (amount 0 if none)."""
    items = await db.cancellation_debts.find(
        {"user_id": user_id, "paid": False,
         "$or": [{"carried_ride_id": None}, {"carried_ride_id": {"$exists": False}}]},
        {"_id": 0},
    ).to_list(200)
    if not items:
        return {"amount": 0.0, "debt_ids": [], "owed": []}
    debt_ids = [i["id"] for i in items]
    await db.cancellation_debts.update_many(
        {"id": {"$in": debt_ids}}, {"$set": {"carried_ride_id": ride_id}}
    )
    owed = {}
    for i in items:
        d = i.get("owed_to_driver_id") or "_none"
        owed[d] = round(owed.get(d, 0.0) + float(i.get("amount", 0) or 0), 2)
    total = round(sum(float(i.get("amount", 0) or 0) for i in items), 2)
    return {
        "amount": total, "debt_ids": debt_ids,
        "owed": [{"driver_id": (None if k == "_none" else k), "amount": v} for k, v in owed.items()],
    }


async def release_carried_debts(ride_id):
    """Un-attach carried debts when their carrier ride is cancelled, so they
    follow the passenger's next ride instead."""
    await db.cancellation_debts.update_many(
        {"carried_ride_id": ride_id, "paid": False}, {"$set": {"carried_ride_id": None}}
    )


async def settle_carried_debts(ride, carried):
    """Settle the debts carried by a completed ride. Re-reads the debts so an
    already-paid debt (e.g. settled from the wallet meanwhile) is skipped —
    prevents any double reimbursement."""
    debt_ids = (carried or {}).get("debt_ids") or []
    if not debt_ids:
        return
    items = await db.cancellation_debts.find(
        {"id": {"$in": debt_ids}, "paid": False}, {"_id": 0}
    ).to_list(200)
    if not items:
        return
    amount = round(sum(float(i.get("amount", 0) or 0) for i in items), 2)
    if amount <= 0:
        return
    pm = ride.get("payment_method")
    passenger_id = ride.get("user_id")
    new_driver_id = ride.get("driver_id")
    ride_id = ride.get("id")
    # 1) Reimburse the wronged previous driver(s)
    for i in items:
        await _reimburse_driver(i.get("owed_to_driver_id"), float(i.get("amount", 0) or 0), ride_id)
    # 2) Source the funds
    if pm == "cash":
        # Passenger paid (fare + debt) in cash to the NEW driver → debit them.
        if new_driver_id:
            drv = await db.drivers.find_one({"id": new_driver_id}, {"_id": 0, "user_id": 1})
            await _debit_wallet((drv or {}).get("user_id"), amount,
                                "Reversement dette annulation (encaissée en espèces)", ride_id)
    elif pm == "wallet":
        await _debit_wallet(passenger_id, amount, "Dette d'annulation réglée avec la course", ride_id)
    # card / sbpaygo → collected with the digital ride payment (simulated)
    # 3) Mark these debts paid
    await db.cancellation_debts.update_many(
        {"id": {"$in": [i["id"] for i in items]}},
        {"$set": {"paid": True, "paid_at": _now(), "settled_via_ride_id": ride_id}},
    )


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
    """Settle all unpaid cancellation debts from the wallet balance (and
    reimburse the wronged drivers)."""
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
    await _debit_wallet(user["id"], total, "Règlement dette d'annulation")
    for i in items:
        await _reimburse_driver(i.get("owed_to_driver_id"), float(i.get("amount", 0) or 0), i.get("ride_id"))
    now = _now()
    await db.cancellation_debts.update_many(
        {"user_id": user["id"], "paid": False},
        {"$set": {"paid": True, "paid_at": now}},
    )
    new_bal = round(bal - total, 2)
    return {"message": "Dette réglée", "paid": True, "total": total, "balance": new_bal}
