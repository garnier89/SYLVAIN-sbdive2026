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


async def auto_settle_debts_from_wallet(user_id):
    """After the wallet is credited (top-up, P2P transfer, gift card, refund),
    automatically recover the passenger's outstanding debts FIRST (oldest first),
    before the balance can be spent elsewhere. Partial recovery is allowed.
    Returns the total amount recovered. Safe to call from any credit path."""
    if not user_id:
        return 0.0
    items = await db.cancellation_debts.find(
        {"user_id": user_id, "paid": False}, {"_id": 0}
    ).sort("created_at", 1).to_list(200)
    if not items:
        return 0.0
    wallet = await db.wallets.find_one({"user_id": user_id})
    bal = round(float((wallet or {}).get("balance", 0.0) or 0.0), 2)
    if bal <= 0:
        return 0.0
    recovered = 0.0
    now = _now()
    for it in items:
        if bal <= 0:
            break
        amt = round(float(it.get("amount", 0) or 0), 2)
        if amt <= 0:
            await db.cancellation_debts.update_one({"id": it["id"]}, {"$set": {"paid": True, "paid_at": now}})
            continue
        pay = round(min(bal, amt), 2)
        await _debit_wallet(user_id, pay, "Recouvrement automatique du solde dû", it.get("ride_id"))
        await _reimburse_driver(it.get("owed_to_driver_id"), pay, it.get("ride_id"))
        bal = round(bal - pay, 2)
        recovered = round(recovered + pay, 2)
        if pay >= amt:
            await db.cancellation_debts.update_one(
                {"id": it["id"]}, {"$set": {"paid": True, "paid_at": now, "auto_settled": True}}
            )
        else:
            await db.cancellation_debts.update_one(
                {"id": it["id"]}, {"$set": {"amount": round(amt - pay, 2)}}
            )
    if recovered > 0:
        try:
            from core.notifications import create_notification
            await create_notification(
                user_id, "debt", "Solde dû déduit 💶",
                f"{recovered:.2f} € de solde dû ont été déduits de votre recharge.",
                data={"amount": recovered, "kind": "debt_auto_settle"},
            )
        except Exception:
            pass
    return recovered


async def record_ride_balance_debt(user_id, ride_id, amount, owed_to_driver_id=None):
    """Record an unpaid ride balance — a wallet shortfall, a recalculated extra,
    or a full cash fare the passenger did not pay — as a debt that follows the
    passenger's next ride. Reuses the `cancellation_debts` collection so the
    DebtBanner, carry-forward and settlement logic all apply unchanged.

    `owed_to_driver_id` stays None for ride balances: the driver's earnings ledger
    is already credited at completion, so the recovered debt reimburses the
    platform (no double reimbursement)."""
    amount = round(float(amount or 0), 2)
    if not user_id or amount <= 0:
        return None
    debt = {
        "id": f"debt_{uuid.uuid4().hex[:12]}", "user_id": user_id, "ride_id": ride_id,
        "amount": amount, "reason": "ride_balance", "paid": False,
        "owed_to_driver_id": owed_to_driver_id, "carried_ride_id": None,
        "created_at": _now(), "paid_at": None,
    }
    await db.cancellation_debts.insert_one(debt)
    try:
        from core.notifications import create_notification
        await create_notification(
            user_id, "debt",
            "Course impayée 🚕",
            f"Un solde de {amount:.2f} € reste à régler. Payez-le depuis votre portefeuille pour éviter qu'il soit ajouté à votre prochaine course.",
            data={"amount": amount, "ride_id": ride_id, "action": "pay_debt", "url": "/wallet?action=debt"},
        )
    except Exception:
        pass
    return debt


async def carry_unpaid_debts_to_ride(user_id, ride_id):
    """Attach ALL the passenger's unpaid debts to a freshly created ride and
    re-point them to that ride. Returns {amount, debt_ids, owed:[...]} (amount 0
    if none).

    Why re-point every time: a debt must NOT get *stuck* on an earlier ride that
    never completes (e.g. an abandoned / still-in-progress / re-pooled ride). By
    re-carrying onto the latest order, completing ANY ride settles the debt. This
    stays cash-safe (the penalty is always shown on the current order so the
    passenger pays fare+debt) and idempotent (settlement re-reads the `paid`
    flag, so the debt is charged exactly once)."""
    items = await db.cancellation_debts.find(
        {"user_id": user_id, "paid": False},
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


async def settle_carried_debts(ride, carried, collected_in_cash=False, max_amount=None):
    """Forward (a portion of) the carried debt to the wronged previous driver(s).

    `max_amount` caps how much is settled (for partial collections); None = all.
    Entries are paid sequentially; a partially-covered entry is reduced in place
    (stays unpaid for the remainder, so it follows the next ride). Returns the
    amount actually forwarded.

      • collected_in_cash=True  → the NEW driver physically collected this amount
        in cash, so we debit it from their wallet, forward it to the old driver,
        AND notify the new driver.
      • collected_in_cash=False → the passenger paid digitally (the debt was part
        of the wallet/card charge); we only forward it, WITHOUT informing the
        current driver."""
    debt_ids = (carried or {}).get("debt_ids") or []
    if not debt_ids:
        return 0.0
    items = await db.cancellation_debts.find(
        {"id": {"$in": debt_ids}, "paid": False}, {"_id": 0}
    ).to_list(200)
    if not items:
        return 0.0
    total_unpaid = round(sum(float(i.get("amount", 0) or 0) for i in items), 2)
    budget = total_unpaid if max_amount is None else round(min(float(max_amount), total_unpaid), 2)
    if budget <= 0:
        return 0.0
    new_driver_id = ride.get("driver_id")
    ride_id = ride.get("id")
    remaining = budget
    forwarded = 0.0
    for i in items:
        if remaining <= 0:
            break
        amt_i = round(float(i.get("amount", 0) or 0), 2)
        pay = round(min(remaining, amt_i), 2)
        await _reimburse_driver(i.get("owed_to_driver_id"), pay, ride_id)
        forwarded = round(forwarded + pay, 2)
        remaining = round(remaining - pay, 2)
        if pay >= amt_i:
            await db.cancellation_debts.update_one(
                {"id": i["id"]},
                {"$set": {"paid": True, "paid_at": _now(), "settled_via_ride_id": ride_id}})
        else:
            await db.cancellation_debts.update_one(
                {"id": i["id"]}, {"$set": {"amount": round(amt_i - pay, 2)}})
    # Source the funds when the new driver collected them in cash
    if collected_in_cash and new_driver_id and forwarded > 0:
        drv = await db.drivers.find_one({"id": new_driver_id}, {"_id": 0, "user_id": 1})
        duid = (drv or {}).get("user_id")
        await _debit_wallet(duid, forwarded,
                            "Reversement dette client (encaissée en espèces)", ride_id)
        if duid:
            try:
                from core.notifications import create_notification
                await create_notification(
                    duid, "debt",
                    "Dette client reversée 🔁",
                    f"{forwarded:.2f} € encaissés en espèces pour une course impayée d'un précédent chauffeur ont été reversés à ce dernier.",
                    data={"amount": forwarded, "ride_id": ride_id, "kind": "debt_forward_cash"},
                )
            except Exception:
                pass
    return forwarded


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
