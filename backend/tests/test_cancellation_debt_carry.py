"""In-process tests for the cancellation-debt CARRY-FORWARD flow.

Validates the behaviour requested by the user:
- An unpaid cancellation debt no longer blocks booking; it is carried onto the
  next ride.
- On completion of a CASH ride, the carried debt is debited from the NEW
  driver's wallet and credited (reimbursed) to the PREVIOUS (wronged) driver.
- On a WALLET ride, the passenger's wallet is debited; the previous driver is
  still reimbursed.
- Settling the debt twice never reimburses twice.
"""
import asyncio
import uuid

from core.config import db
from routes.debts import (
    carry_unpaid_debts_to_ride,
    settle_carried_debts,
    release_carried_debts,
    get_unpaid_debt_total,
)


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


async def _wallet_balance(user_id):
    w = await db.wallets.find_one({"user_id": user_id})
    return float((w or {}).get("balance", 0.0) or 0.0)


async def _seed_driver(label):
    uid = f"u_{label}_{uuid.uuid4().hex[:8]}"
    did = f"d_{label}_{uuid.uuid4().hex[:8]}"
    await db.drivers.insert_one({"id": did, "user_id": uid, "earnings": 0.0})
    await db.wallets.insert_one({"user_id": uid, "balance": 0.0, "currency": "EUR"})
    return did, uid


async def _cleanup(ids):
    await db.cancellation_debts.delete_many({"id": {"$in": ids["debts"]}})
    await db.drivers.delete_many({"id": {"$in": ids["drivers"]}})
    await db.wallets.delete_many({"user_id": {"$in": ids["users"]}})
    await db.wallet_transactions.delete_many({"user_id": {"$in": ids["users"]}})
    await db.notifications.delete_many({"user_id": {"$in": ids["users"]}})


# ── Test: cash ride reimburses the previous driver from the new driver ──────
def test_cash_ride_carries_and_reimburses_previous_driver():
    async def run():
        passenger = f"u_pax_{uuid.uuid4().hex[:8]}"
        prev_did, prev_uid = await _seed_driver("prev")
        new_did, new_uid = await _seed_driver("new")
        await db.wallets.insert_one({"user_id": passenger, "balance": 0.0, "currency": "EUR"})
        fee = 5.0
        debt_id = f"debt_{uuid.uuid4().hex[:8]}"
        await db.cancellation_debts.insert_one({
            "id": debt_id, "user_id": passenger, "ride_id": "ride_old",
            "amount": fee, "reason": "cancellation", "paid": False,
            "owed_to_driver_id": prev_did, "carried_ride_id": None,
        })
        ids = {"debts": [debt_id], "drivers": [prev_did, new_did], "users": [passenger, prev_uid, new_uid]}
        try:
            # Booking is no longer blocked: the debt is carried onto the new ride.
            ride_id = f"ride_{uuid.uuid4().hex[:8]}"
            carried = await carry_unpaid_debts_to_ride(passenger, ride_id)
            assert carried["amount"] == fee, carried
            assert debt_id in carried["debt_ids"]
            # debt now flagged carried
            d = await db.cancellation_debts.find_one({"id": debt_id})
            assert d["carried_ride_id"] == ride_id

            prev_before = await _wallet_balance(prev_uid)
            new_before = await _wallet_balance(new_uid)

            # Complete a CASH ride driven by the NEW driver
            ride = {"id": ride_id, "user_id": passenger, "driver_id": new_did, "payment_method": "cash"}
            await settle_carried_debts(ride, carried)

            assert round(await _wallet_balance(prev_uid) - prev_before, 2) == fee, "prev driver reimbursed"
            assert round(await _wallet_balance(new_uid) - new_before, 2) == -fee, "new driver debited"
            d = await db.cancellation_debts.find_one({"id": debt_id})
            assert d["paid"] is True
            assert await get_unpaid_debt_total(passenger) == 0.0
        finally:
            await _cleanup(ids)

    _run(run())


# ── Test: wallet ride debits the passenger, reimburses previous driver ──────
def test_wallet_ride_debits_passenger_and_reimburses_previous_driver():
    async def run():
        passenger = f"u_pax_{uuid.uuid4().hex[:8]}"
        prev_did, prev_uid = await _seed_driver("prev")
        new_did, new_uid = await _seed_driver("new")
        await db.wallets.insert_one({"user_id": passenger, "balance": 50.0, "currency": "EUR"})
        fee = 5.0
        debt_id = f"debt_{uuid.uuid4().hex[:8]}"
        await db.cancellation_debts.insert_one({
            "id": debt_id, "user_id": passenger, "ride_id": "ride_old",
            "amount": fee, "reason": "cancellation", "paid": False,
            "owed_to_driver_id": prev_did, "carried_ride_id": None,
        })
        ids = {"debts": [debt_id], "drivers": [prev_did, new_did], "users": [passenger, prev_uid, new_uid]}
        try:
            ride_id = f"ride_{uuid.uuid4().hex[:8]}"
            carried = await carry_unpaid_debts_to_ride(passenger, ride_id)
            prev_before = await _wallet_balance(prev_uid)
            pax_before = await _wallet_balance(passenger)
            new_before = await _wallet_balance(new_uid)

            ride = {"id": ride_id, "user_id": passenger, "driver_id": new_did, "payment_method": "wallet"}
            await settle_carried_debts(ride, carried)

            assert round(await _wallet_balance(prev_uid) - prev_before, 2) == fee
            assert round(await _wallet_balance(passenger) - pax_before, 2) == -fee
            assert round(await _wallet_balance(new_uid) - new_before, 2) == 0.0, "new driver untouched on wallet ride"
        finally:
            await _cleanup(ids)

    _run(run())


# ── Test: releasing a carried debt lets it follow the next ride ─────────────
def test_release_carried_debt_reattaches_to_next_ride():
    async def run():
        passenger = f"u_pax_{uuid.uuid4().hex[:8]}"
        prev_did, prev_uid = await _seed_driver("prev")
        fee = 5.0
        debt_id = f"debt_{uuid.uuid4().hex[:8]}"
        await db.cancellation_debts.insert_one({
            "id": debt_id, "user_id": passenger, "ride_id": "ride_old",
            "amount": fee, "reason": "cancellation", "paid": False,
            "owed_to_driver_id": prev_did, "carried_ride_id": None,
        })
        ids = {"debts": [debt_id], "drivers": [prev_did], "users": [passenger, prev_uid]}
        try:
            ride_a = f"ride_{uuid.uuid4().hex[:8]}"
            c1 = await carry_unpaid_debts_to_ride(passenger, ride_a)
            assert c1["amount"] == fee
            # ride A cancelled -> release
            await release_carried_debts(ride_a)
            d = await db.cancellation_debts.find_one({"id": debt_id})
            assert d["carried_ride_id"] is None
            # ride B can pick it up again
            ride_b = f"ride_{uuid.uuid4().hex[:8]}"
            c2 = await carry_unpaid_debts_to_ride(passenger, ride_b)
            assert c2["amount"] == fee
        finally:
            await _cleanup(ids)

    _run(run())


# ── Test: double-settlement never double-reimburses ─────────────────────────
def test_settle_twice_is_idempotent():
    async def run():
        passenger = f"u_pax_{uuid.uuid4().hex[:8]}"
        prev_did, prev_uid = await _seed_driver("prev")
        new_did, new_uid = await _seed_driver("new")
        await db.wallets.insert_one({"user_id": passenger, "balance": 0.0, "currency": "EUR"})
        fee = 5.0
        debt_id = f"debt_{uuid.uuid4().hex[:8]}"
        await db.cancellation_debts.insert_one({
            "id": debt_id, "user_id": passenger, "ride_id": "ride_old",
            "amount": fee, "reason": "cancellation", "paid": False,
            "owed_to_driver_id": prev_did, "carried_ride_id": None,
        })
        ids = {"debts": [debt_id], "drivers": [prev_did, new_did], "users": [passenger, prev_uid, new_uid]}
        try:
            ride_id = f"ride_{uuid.uuid4().hex[:8]}"
            carried = await carry_unpaid_debts_to_ride(passenger, ride_id)
            ride = {"id": ride_id, "user_id": passenger, "driver_id": new_did, "payment_method": "cash"}
            prev_before = await _wallet_balance(prev_uid)
            await settle_carried_debts(ride, carried)
            await settle_carried_debts(ride, carried)  # second call must be a no-op
            assert round(await _wallet_balance(prev_uid) - prev_before, 2) == fee, "reimbursed exactly once"
        finally:
            await _cleanup(ids)

    _run(run())


if __name__ == "__main__":
    test_cash_ride_carries_and_reimburses_previous_driver()
    test_wallet_ride_debits_passenger_and_reimburses_previous_driver()
    test_release_carried_debt_reattaches_to_next_ride()
    test_settle_twice_is_idempotent()
    print("ALL DEBT-CARRY TESTS PASSED")
