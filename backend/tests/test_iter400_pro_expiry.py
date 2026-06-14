"""iter400 — SB Tracking Pro expiry reminders (run_pro_expiry_reminders)."""
import asyncio
import uuid
from datetime import datetime, timezone, timedelta

import pytest

from core.config import db
from routes.tracking_pro import run_pro_expiry_reminders, grant_pro


def _now():
    return datetime.now(timezone.utc)


async def _mk_user():
    uid = f"user_{uuid.uuid4().hex[:12]}"
    await db.users.insert_one({"id": uid, "email": f"{uid}@demo.sb", "name": "Pro Test",
                               "role": "user", "is_verified": True, "created_at": _now().isoformat()})
    return uid


async def _set_sub(uid, *, expires_in_days, reminded_at=None):
    await db.pro_subscriptions.update_one(
        {"user_id": uid},
        {"$set": {"user_id": uid, "plan": "pro_monthly", "status": "active",
                  "expires_at": (_now() + timedelta(days=expires_in_days)).isoformat(),
                  "reminded_at": reminded_at}},
        upsert=True)


async def _cleanup(uid):
    await db.users.delete_one({"id": uid})
    await db.pro_subscriptions.delete_one({"user_id": uid})
    await db.notifications.delete_many({"user_id": uid})


def test_reminder_sent_when_expiring_in_2_days():
    async def run():
        uid = await _mk_user()
        try:
            await _set_sub(uid, expires_in_days=2)
            sent = await run_pro_expiry_reminders()
            assert sent >= 1
            sub = await db.pro_subscriptions.find_one({"user_id": uid})
            assert sub.get("reminded_at")  # stamped
            notif = await db.notifications.find_one({"user_id": uid, "type": "pro_expiry"})
            assert notif is not None
            assert "Pro" in notif["title"]
        finally:
            await _cleanup(uid)
    asyncio.get_event_loop().run_until_complete(run())


def test_idempotent_within_24h():
    async def run():
        uid = await _mk_user()
        try:
            await _set_sub(uid, expires_in_days=1)
            assert await _count_for(uid) == 0
            await run_pro_expiry_reminders()
            first = await _count_for(uid)
            # second pass should NOT re-notify (reminded_at < 24h)
            await run_pro_expiry_reminders()
            second = await _count_for(uid)
            assert second == first == 1
        finally:
            await _cleanup(uid)
    asyncio.get_event_loop().run_until_complete(run())


def test_no_reminder_when_far_from_expiry():
    async def run():
        uid = await _mk_user()
        try:
            await _set_sub(uid, expires_in_days=20)
            await run_pro_expiry_reminders()
            assert await _count_for(uid) == 0
        finally:
            await _cleanup(uid)
    asyncio.get_event_loop().run_until_complete(run())


def test_renewal_resets_reminded_at():
    async def run():
        uid = await _mk_user()
        try:
            await _set_sub(uid, expires_in_days=1, reminded_at=_now().isoformat())
            await grant_pro(uid, "pro_monthly", "sess_test")
            sub = await db.pro_subscriptions.find_one({"user_id": uid})
            assert sub.get("reminded_at") is None  # cleared on renewal
        finally:
            await _cleanup(uid)
    asyncio.get_event_loop().run_until_complete(run())


async def _count_for(uid):
    return await db.notifications.count_documents({"user_id": uid, "type": "pro_expiry"})
