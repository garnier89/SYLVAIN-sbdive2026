"""SB Student Phase 5 — rewards points + events shuttle (in-process)."""
import asyncio
import uuid

from core.config import db
import routes.student_rewards as rw
import routes.student_events as ev


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


def test_award_ride_points_idempotent_for_verified_student():
    async def scenario():
        uid = f"u_{uuid.uuid4().hex[:8]}"
        rid = f"ride_{uuid.uuid4().hex[:8]}"
        await db.student_profiles.insert_one({"user_id": uid, "status": "verified", "created_at": rw._now()})
        await rw.ensure_seeded()
        await db.student_rewards_config.update_one({"id": rw.CONFIG_ID}, {"$set": {"enabled": True, "points_per_ride": 10, "points_per_euro": 0}})
        ride = {"id": rid, "final_fare": 12.0}
        await rw.award_ride_points(uid, ride)
        await rw.award_ride_points(uid, ride)  # second time must NOT double
        bal = await rw.get_balance(uid)
        assert bal == 10
        await db.student_profiles.delete_many({"user_id": uid})
        await db.student_points_ledger.delete_many({"user_id": uid})
    _run(scenario())


def test_no_points_for_unverified():
    async def scenario():
        uid = f"u_{uuid.uuid4().hex[:8]}"
        await db.student_profiles.insert_one({"user_id": uid, "status": "pending", "created_at": rw._now()})
        await rw.award_ride_points(uid, {"id": f"ride_{uuid.uuid4().hex[:6]}", "final_fare": 10})
        assert await rw.get_balance(uid) == 0
        await db.student_profiles.delete_many({"user_id": uid})
    _run(scenario())


def test_award_and_balance():
    async def scenario():
        uid = f"u_{uuid.uuid4().hex[:8]}"
        await rw.award_points(uid, 100, "admin")
        await rw.award_points(uid, -30, "redeem:x")
        assert await rw.get_balance(uid) == 70
        await db.student_points_ledger.delete_many({"user_id": uid})
    _run(scenario())


def test_event_seats_taken():
    async def scenario():
        eid = f"ev_{uuid.uuid4().hex[:8]}"
        await db.student_event_reservations.insert_many([
            {"id": "r1", "event_id": eid, "user_id": "a", "seats": 2, "status": "confirmed"},
            {"id": "r2", "event_id": eid, "user_id": "b", "seats": 1, "status": "confirmed"},
            {"id": "r3", "event_id": eid, "user_id": "c", "seats": 5, "status": "cancelled"},  # ignored
        ])
        assert await ev._seats_taken(eid) == 3
        await db.student_event_reservations.delete_many({"event_id": eid})
    _run(scenario())
