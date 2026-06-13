"""Iter349d — admin debts management + driver activity report + online sessions."""
import sys
import asyncio
import uuid

import pytest
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")
sys.path.insert(0, "/app/backend")

from core.config import db  # noqa: E402
from core import online_sessions as OS  # noqa: E402

_LOOP = asyncio.new_event_loop()
asyncio.set_event_loop(_LOOP)


def run(coro):
    return _LOOP.run_until_complete(coro)


def test_online_session_open_close_and_minutes():
    uid = f"test_onl_{uuid.uuid4().hex[:6]}"
    try:
        # open
        run(OS.mark_online(uid))
        s = run(db.driver_online_sessions.find_one({"driver_user_id": uid, "offline_at": None}))
        assert s is not None
        # idempotent — no second open session
        run(OS.mark_online(uid))
        cnt = run(db.driver_online_sessions.count_documents({"driver_user_id": uid, "offline_at": None}))
        assert cnt == 1
        # close
        run(OS.mark_offline(uid))
        closed = run(db.driver_online_sessions.find_one({"driver_user_id": uid}))
        assert closed["offline_at"] is not None
        assert closed["minutes"] >= 0
        # aggregate sees it
        agg = run(OS.online_minutes_by_driver("2000-01-01T00:00:00", "2999-01-01T00:00:00"))
        assert uid in agg
    finally:
        run(db.driver_online_sessions.delete_many({"driver_user_id": uid}))


def test_debts_overview_shape():
    from routes import debts_admin as DA
    # Direct enrich helper works without raising and returns wallet balance key.
    info = run(DA._enrich_user("nonexistent_user_zzz"))
    assert info["user_id"] == "nonexistent_user_zzz"
    assert "wallet_balance" in info and "name" in info


def test_driver_activity_default_range():
    from routes import driver_activity_admin as DAA
    start, end = DAA._default_range(None, None)
    assert start < end
    start2, end2 = DAA._default_range("2026-01-01", "2026-01-31")
    assert start2.startswith("2026-01-01") and end2.startswith("2026-01-31")
