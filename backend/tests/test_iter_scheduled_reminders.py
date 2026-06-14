"""iter — Rappels SMS programmés + fenêtres de planification configurables.

Vérifie :
1. `get_scheduling_config` expose et borne les nouvelles clés (fenêtres + SMS).
2. `run_scheduled_ride_reminders` est un no-op propre quand SMS désactivé / Twilio off.
3. `run_scheduled_ride_reminders` envoie un SMS au client + chauffeur dans la fenêtre,
   et est idempotent (flag `reminder_sms_sent`).
4. Aucune course hors fenêtre n'est rappelée.
"""
import asyncio
import uuid
from datetime import datetime, timezone, timedelta

import pytest

from core.config import db
import routes.rides as rides
import routes.config as config_mod


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


# ── 1. Config exposes + clamps new keys ────────────────────────────────────
def test_scheduling_config_defaults_and_clamp():
    async def _t():
        await db.service_configs.delete_one({"service_key": "scheduling"})
        cfg = await config_mod.get_scheduling_config()
        assert cfg["driver_start_window_min"] == 40
        assert cfg["anti_double_booking_min"] == 30
        assert cfg["driver_conflict_min"] == 45
        assert cfg["sms_reminder_enabled"] is True
        assert cfg["sms_reminder_min"] == 30
        # Persist out-of-range / overrides and re-read (clamped).
        await db.service_configs.update_one(
            {"service_key": "scheduling"},
            {"$set": {"settings": {"driver_start_window_min": 9999, "sms_reminder_min": 1,
                                   "sms_reminder_enabled": False}}},
            upsert=True,
        )
        cfg = await config_mod.get_scheduling_config()
        assert cfg["driver_start_window_min"] == 240   # clamped hi
        assert cfg["sms_reminder_min"] == 5            # clamped lo
        assert cfg["sms_reminder_enabled"] is False
        await db.service_configs.delete_one({"service_key": "scheduling"})
    _run(_t())


# ── 2. No-op when reminder disabled ─────────────────────────────────────────
def test_reminder_noop_when_disabled():
    async def _t():
        await db.service_configs.update_one(
            {"service_key": "scheduling"},
            {"$set": {"settings": {"sms_reminder_enabled": False}}}, upsert=True)
        res = await rides.run_scheduled_ride_reminders()
        assert res["sent"] == 0
        await db.service_configs.delete_one({"service_key": "scheduling"})
    _run(_t())


# ── 3 & 4. Sends to client+driver in window, idempotent, ignores out-of-window
def test_reminder_sends_and_is_idempotent(monkeypatch):
    sent = []

    async def fake_send_sms(to, body):
        sent.append((to, body))
        return True

    monkeypatch.setattr(rides, "_scheduling_windows", rides._scheduling_windows)
    # Patch the names used INSIDE run_scheduled_ride_reminders (imported locally).
    import core.sms as sms_mod
    monkeypatch.setattr(sms_mod, "send_sms", fake_send_sms)
    monkeypatch.setattr(sms_mod, "sms_enabled", lambda: True)

    async def _t():
        await db.service_configs.update_one(
            {"service_key": "scheduling"},
            {"$set": {"settings": {"sms_reminder_enabled": True, "sms_reminder_min": 30}}},
            upsert=True)

        suffix = uuid.uuid4().hex[:8]
        cuid = f"u_client_{suffix}"
        duid = f"u_driver_{suffix}"
        did = f"drv_{suffix}"
        await db.users.insert_one({"id": cuid, "phone": "+33611111111", "name": "Client T", "email": f"{cuid}@t.sb"})
        await db.users.insert_one({"id": duid, "phone": "+33622222222", "name": "Driver T", "email": f"{duid}@t.sb"})
        await db.drivers.insert_one({"id": did, "user_id": duid})

        now = datetime.now(timezone.utc)
        in_window = f"ride_inwin_{suffix}"
        out_window = f"ride_outwin_{suffix}"
        await db.rides.insert_one({
            "id": in_window, "user_id": cuid, "driver_id": did, "status": "accepted",
            "scheduled_at": (now + timedelta(minutes=15)).isoformat(),
            "pickup_address": "Fort-de-France",
        })
        await db.rides.insert_one({
            "id": out_window, "user_id": cuid, "driver_id": did, "status": "accepted",
            "scheduled_at": (now + timedelta(minutes=120)).isoformat(),
            "pickup_address": "Le Lamentin",
        })

        res = await rides.run_scheduled_ride_reminders()
        # client + driver of the in-window ride only
        assert res["sent"] == 2, res
        assert res["rides"] == 1
        phones = {p for p, _ in sent}
        assert "+33611111111" in phones and "+33622222222" in phones

        ride_doc = await db.rides.find_one({"id": in_window}, {"_id": 0, "reminder_sms_sent": 1})
        assert ride_doc["reminder_sms_sent"] is True

        # Idempotent : second run sends nothing more.
        sent.clear()
        res2 = await rides.run_scheduled_ride_reminders()
        assert res2["sent"] == 0
        assert sent == []

        # cleanup
        await db.users.delete_many({"id": {"$in": [cuid, duid]}})
        await db.drivers.delete_one({"id": did})
        await db.rides.delete_many({"id": {"$in": [in_window, out_window]}})
        await db.service_configs.delete_one({"service_key": "scheduling"})

    _run(_t())
