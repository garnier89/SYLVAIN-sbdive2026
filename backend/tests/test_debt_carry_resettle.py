"""Regression for the 'stuck debt' bug: an unpaid cancellation debt must be
RE-carried onto every new ride (not stuck on the first/abandoned one) and must
settle when any carrier ride completes — exactly once."""
import asyncio
import os
import uuid

import pytest

os.environ.setdefault("DB_NAME", os.environ.get("DB_NAME", "test_database"))

from core.config import db  # noqa: E402
from routes.debts import (  # noqa: E402
    carry_unpaid_debts_to_ride,
    settle_carried_debts,
    get_unpaid_debt_total,
)


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


@pytest.fixture
def ctx():
    uid = f"user_test_{uuid.uuid4().hex[:8]}"
    debt_id = f"debt_test_{uuid.uuid4().hex[:8]}"
    ride_a = f"ride_test_{uuid.uuid4().hex[:8]}"
    ride_b = f"ride_test_{uuid.uuid4().hex[:8]}"

    async def setup():
        await db.cancellation_debts.insert_one({
            "id": debt_id, "user_id": uid, "ride_id": "ride_old",
            "amount": 5.0, "reason": "cancellation", "paid": False,
            "owed_to_driver_id": None, "carried_ride_id": None,
            "created_at": "2026-01-01T00:00:00+00:00", "paid_at": None,
        })
    _run(setup())
    yield {"uid": uid, "debt_id": debt_id, "ride_a": ride_a, "ride_b": ride_b}

    async def teardown():
        await db.cancellation_debts.delete_many({"user_id": uid})
        await db.wallets.delete_many({"user_id": uid})
        await db.wallet_transactions.delete_many({"user_id": uid})
    _run(teardown())


def test_debt_recarries_to_latest_ride_and_settles_once(ctx):
    async def scenario():
        # Order ride A -> debt carried to A
        ca = await carry_unpaid_debts_to_ride(ctx["uid"], ctx["ride_a"])
        assert ca["amount"] == 5.0 and ctx["debt_id"] in ca["debt_ids"]
        d = await db.cancellation_debts.find_one({"id": ctx["debt_id"]}, {"_id": 0})
        assert d["carried_ride_id"] == ctx["ride_a"]

        # Order ride B (A never completed) -> debt RE-carried onto B (the fix)
        cb = await carry_unpaid_debts_to_ride(ctx["uid"], ctx["ride_b"])
        assert cb["amount"] == 5.0
        d = await db.cancellation_debts.find_one({"id": ctx["debt_id"]}, {"_id": 0})
        assert d["carried_ride_id"] == ctx["ride_b"], "debt must follow the latest ride"

        # Still owed before any completion
        assert await get_unpaid_debt_total(ctx["uid"]) == 5.0

        # Completing ride B settles the debt (wallet payment debits the passenger)
        ride_b_doc = {"id": ctx["ride_b"], "user_id": ctx["uid"], "driver_id": None,
                      "payment_method": "wallet", "final_fare": 20.0}
        await settle_carried_debts(ride_b_doc, cb)
        assert await get_unpaid_debt_total(ctx["uid"]) == 0.0

        # Completing ride A afterwards must NOT charge again (idempotent)
        ride_a_doc = {"id": ctx["ride_a"], "user_id": ctx["uid"], "driver_id": None,
                      "payment_method": "wallet", "final_fare": 20.0}
        await settle_carried_debts(ride_a_doc, ca)
        assert await get_unpaid_debt_total(ctx["uid"]) == 0.0
        # Passenger wallet debited exactly once (-5.00)
        txs = await db.wallet_transactions.find(
            {"user_id": ctx["uid"], "type": "debit"}, {"_id": 0, "amount": 1}
        ).to_list(50)
        assert len(txs) == 1 and txs[0]["amount"] == 5.0

    _run(scenario())
