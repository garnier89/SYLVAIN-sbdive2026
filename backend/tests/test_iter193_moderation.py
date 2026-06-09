"""Phase 3 — moderation helpers: passenger warn/ban + driver penalties."""
import asyncio
import uuid
import pytest

from core.config import db
from routes import moderation as mod


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


@pytest.fixture(autouse=True)
def _reset_config():
    # Lower thresholds for fast testing, then restore defaults.
    _run(mod._save_moderation_config({
        "enabled": True,
        "client_warn_threshold": 2,
        "client_ban_threshold": 3,
        "client_ban_hours": 2,
        "driver_abusive_penalty_eur": 2.0,
        "driver_release_penalty_eur": 1.0,
    }))
    yield
    _run(mod._save_moderation_config(mod.DEFAULT_CONFIG))


def test_passenger_warn_then_ban_then_reset():
    uid = f"u_{uuid.uuid4().hex[:8]}"
    _run(db.moderation_state.delete_many({"user_id": uid}))

    r1 = _run(mod.register_passenger_cancel(uid))
    assert r1["count"] == 1 and not r1["warned"] and not r1["banned"]

    r2 = _run(mod.register_passenger_cancel(uid))
    assert r2["count"] == 2 and r2["warned"] and not r2["banned"]

    r3 = _run(mod.register_passenger_cancel(uid))
    assert r3["banned"] and r3["ban_until"]
    # Counter reset to 0 after ban
    state = _run(db.moderation_state.find_one({"user_id": uid}))
    assert state["cancel_count"] == 0

    # While banned, check_passenger_ban raises 403
    from fastapi import HTTPException
    with pytest.raises(HTTPException) as ei:
        _run(mod.check_passenger_ban(uid))
    assert ei.value.status_code == 403

    _run(db.moderation_state.delete_many({"user_id": uid}))


def test_driver_penalty_debits_wallet():
    duid = f"du_{uuid.uuid4().hex[:8]}"
    did = f"drv_{uuid.uuid4().hex[:8]}"
    _run(db.drivers.insert_one({"id": did, "user_id": duid}))
    _run(db.wallets.delete_many({"user_id": duid}))
    _run(db.wallets.insert_one({"user_id": duid, "balance": 10.0, "currency": "EUR"}))

    res = _run(mod.apply_driver_penalty(did, "abusive_cancel", "ride_x"))
    assert res["amount"] == 2.0
    w = _run(db.wallets.find_one({"user_id": duid}))
    assert round(w["balance"], 2) == 8.0

    res2 = _run(mod.apply_driver_penalty(did, "accept_release", "ride_x"))
    assert res2["amount"] == 1.0
    w2 = _run(db.wallets.find_one({"user_id": duid}))
    assert round(w2["balance"], 2) == 7.0

    _run(db.drivers.delete_many({"id": did}))
    _run(db.wallets.delete_many({"user_id": duid}))


def test_disabled_config_skips_everything():
    _run(mod._save_moderation_config({"enabled": False}))
    uid = f"u_{uuid.uuid4().hex[:8]}"
    r = _run(mod.register_passenger_cancel(uid))
    assert r["count"] == 0 and not r["banned"]
    # ban check is a no-op when disabled
    _run(mod.check_passenger_ban(uid))
