"""Iter312 — Garde de paiement en cours de course : si le portefeuille SB Pay du
client ne couvre pas la course au démarrage, la course bascule en ESPÈCES et le
chauffeur est notifié en temps réel."""
import os
import uuid
import asyncio
from datetime import datetime, timezone

import pytest
from dotenv import load_dotenv
import motor.motor_asyncio as motor

load_dotenv("/app/backend/.env")
DB_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]


def _now():
    return datetime.now(timezone.utc).isoformat()


async def _seed_and_run(balance, fare, pm="wallet"):
    import sys
    sys.path.insert(0, "/app/backend")
    from routes.rides import switch_to_cash_if_needed

    db = motor.AsyncIOMotorClient(DB_URL)[DB_NAME]
    rider_id = f"u_test_{uuid.uuid4().hex[:8]}"
    drv_user = f"u_drv_{uuid.uuid4().hex[:8]}"
    ride_id = f"ride_test_{uuid.uuid4().hex[:8]}"
    await db.wallets.insert_one({"user_id": rider_id, "balance": balance, "currency": "EUR", "created_at": _now()})
    ride = {
        "id": ride_id, "user_id": rider_id, "driver_id": "drv_x",
        "payment_method": pm, "estimated_fare": fare, "status": "arriving",
    }
    await db.rides.insert_one({**ride, "created_at": _now()})
    flash = await switch_to_cash_if_needed(ride, drv_user, _now())
    updated = await db.rides.find_one({"id": ride_id}, {"_id": 0})
    notif = await db.notifications.find_one({"user_id": drv_user, "type": "payment"}, {"_id": 0})
    rider_notif = await db.notifications.find_one({"user_id": rider_id, "type": "payment"}, {"_id": 0})
    # cleanup
    await db.wallets.delete_one({"user_id": rider_id})
    await db.rides.delete_one({"id": ride_id})
    await db.notifications.delete_many({"user_id": {"$in": [drv_user, rider_id]}})
    return flash, updated, notif, rider_notif


def test_insufficient_wallet_switches_to_cash_and_flashes():
    flash, updated, notif, rider_notif = asyncio.get_event_loop().run_until_complete(_seed_and_run(balance=2.0, fare=12.0))
    assert flash is not None
    assert flash["type"] == "payment_switched_to_cash"
    assert flash["amount"] == 12.0
    assert updated["payment_method"] == "cash"
    assert updated["payment_switched_to_cash"] is True
    assert updated["original_payment_method"] == "wallet"
    assert notif is not None  # driver got a persistent notification
    assert rider_notif is not None  # rider was warned to prepare cash


def test_sufficient_wallet_does_not_switch():
    flash, updated, notif, rider_notif = asyncio.get_event_loop().run_until_complete(_seed_and_run(balance=50.0, fare=12.0))
    assert flash is None
    assert updated["payment_method"] == "wallet"
    assert not updated.get("payment_switched_to_cash")


def test_cash_ride_untouched():
    flash, updated, notif, rider_notif = asyncio.get_event_loop().run_until_complete(_seed_and_run(balance=0.0, fare=12.0, pm="cash"))
    assert flash is None
    assert updated["payment_method"] == "cash"
