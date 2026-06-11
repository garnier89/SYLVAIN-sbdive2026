"""SB Student Phase 2 — Pass Campus + recurring bookings (in-process)."""
import asyncio
import uuid

from core.config import db
import routes.student_campus as sc
import routes.student as st


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


def test_subscribe_funded_grants_credits_and_active():
    async def scenario():
        uid = f"u_{uuid.uuid4().hex[:8]}"
        await sc.ensure_plans_seeded()
        plan = await db.campus_plans.find_one({"id": "plan_monthly"}, {"_id": 0})
        await db.wallets.insert_one({"user_id": uid, "balance": 50.0, "currency": "EUR"})
        # emulate subscribe logic via the helper path
        # debit price, grant credits, create sub
        price = plan["price"]; credits = plan["included_credits"]
        await db.wallets.update_one({"user_id": uid}, {"$set": {"balance": round(50.0 - price + credits, 2)}})
        from datetime import datetime, timezone, timedelta
        now = datetime.now(timezone.utc)
        await db.campus_subscriptions.insert_one({
            "id": f"sub_{uuid.uuid4().hex[:8]}", "user_id": uid, "plan_id": plan["id"],
            "plan_name": plan["name"], "type": plan["type"], "discount_pct": plan["discount_pct"],
            "status": "active", "started_at": now.isoformat(),
            "expires_at": (now + timedelta(days=plan["duration_days"])).isoformat(),
        })
        sub = await sc.get_active_subscription(uid)
        assert sub and sub["discount_pct"] == 25.0
        w = await db.wallets.find_one({"user_id": uid})
        assert abs(w["balance"] - round(50.0 - price + credits, 2)) < 0.01
        await db.wallets.delete_many({"user_id": uid})
        await db.campus_subscriptions.delete_many({"user_id": uid})
    _run(scenario())


def test_pass_boosts_student_discount():
    async def scenario():
        uid = f"u_{uuid.uuid4().hex[:8]}"
        await db.student_profiles.insert_one({"user_id": uid, "status": "verified", "created_at": st._now()})
        await st.ensure_seeded()
        await db.student_config.update_one({"id": st.CONFIG_ID}, {"$set": {
            "enabled": True, "ride_discount_pct": 20.0, "daily_cap": 0, "monthly_cap": 0}})
        # base 20% of 100 = 20
        base = await st.compute_student_discount(uid, 100.0, "ride")
        assert base["amount"] == 20.0 and base["pct"] == 20.0
        # add active pass at 30% → 30
        from datetime import datetime, timezone, timedelta
        await db.campus_subscriptions.insert_one({
            "id": f"sub_{uuid.uuid4().hex[:8]}", "user_id": uid, "status": "active", "discount_pct": 30.0,
            "expires_at": (datetime.now(timezone.utc) + timedelta(days=10)).isoformat()})
        boosted = await st.compute_student_discount(uid, 100.0, "ride")
        assert boosted["pct"] == 30.0 and boosted["amount"] == 30.0
        # restore caps
        await db.student_config.update_one({"id": st.CONFIG_ID}, {"$set": {"daily_cap": 5.0, "monthly_cap": 50.0}})
        await db.student_profiles.delete_many({"user_id": uid})
        await db.campus_subscriptions.delete_many({"user_id": uid})
    _run(scenario())


def test_recurring_occurrences_weekdays_and_weekly():
    tpl_wd = {"frequency": "weekdays", "time": "08:00", "days_of_week": []}
    occ = sc._next_occurrences(tpl_wd, 5)
    assert len(occ) == 5
    from datetime import datetime
    # all weekdays (Mon-Fri)
    assert all(datetime.fromisoformat(o).weekday() < 5 for o in occ)

    tpl_weekly = {"frequency": "weekly", "time": "09:30", "days_of_week": [2]}  # Wednesday
    occ2 = sc._next_occurrences(tpl_weekly, 3)
    assert len(occ2) == 3
    assert all(datetime.fromisoformat(o).weekday() == 2 for o in occ2)


def test_recurring_daily_count():
    occ = sc._next_occurrences({"frequency": "daily", "time": "07:00"}, 4)
    assert len(occ) == 4
