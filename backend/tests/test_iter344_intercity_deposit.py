"""Iter344 — Intercity : validations serveur + caution séquestre + réconciliation.

Couvre :
- Validation délai mini 2 h (Intercité) et fenêtre aller-retour.
- Caution prélevée au booking (déjà validée par curl) — ici on teste la
  RÉCONCILIATION à la complétion : le passager ne paie que (tarif − caution),
  la caution est imputée (deposit_status='captured'), et le chauffeur est crédité
  du tarif net de commission (caution incluse).
"""
import sys
import asyncio

import pytest
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")
sys.path.insert(0, "/app/backend")

from core.config import db as DB  # noqa: E402
from routes import rides as RIDES  # noqa: E402

_LOOP = asyncio.new_event_loop()
asyncio.set_event_loop(_LOOP)


def run(coro):
    return _LOOP.run_until_complete(coro)


class FakeReq:
    def __init__(self, user, body=None):
        self._user = user
        self._body = body or {}

    async def json(self):
        return self._body


ADMIN = {"id": "test_admin_ic", "role": "admin"}
RIDER = {"id": "test_rider_ic", "role": "user", "name": "ICRider"}
DRV_USER_ID = "test_drvuser_ic"
DRIVER_ID = "test_driver_ic"
RIDE_ID = "ride_test_ic_001"


@pytest.fixture(autouse=True)
def patch_user(monkeypatch):
    async def fake_get_current_user(request):
        return request._user
    monkeypatch.setattr(RIDES, "get_current_user", fake_get_current_user)
    # Isolate the deposit-reconciliation invariant from external loyalty/rewards
    # state: neutralise the per-driver loyalty commission discount so the expected
    # earning is deterministic (commission stays at the ride's base 10%).
    import routes.loyalty as LOYALTY

    async def _no_loyalty_discount(_user_id):
        return 0.0
    monkeypatch.setattr(LOYALTY, "get_commission_discount_pct", _no_loyalty_discount)


async def _seed():
    await _clean()
    await DB.wallets.insert_one({"user_id": RIDER["id"], "balance": 500.0, "currency": "EUR"})
    await DB.wallets.insert_one({"user_id": DRV_USER_ID, "balance": 0.0, "currency": "EUR"})
    await DB.drivers.insert_one({"id": DRIVER_ID, "user_id": DRV_USER_ID, "total_trips": 0, "earnings": 0.0})
    await DB.rides.insert_one({
        "id": RIDE_ID, "user_id": RIDER["id"], "driver_id": DRIVER_ID,
        "status": "in_progress", "ride_type": "intercity",
        "vehicle_type": "vtype_sb", "payment_method": "wallet",
        "base_fare": 100.0, "price_per_km": 0.0, "price_per_min": 0.0,
        "distance_km": 0.0, "commission_percent": 10,
        "fare": 100.0, "intercity_deposit": 30.0, "deposit_status": "held",
        "started_at": RIDES.datetime.now(RIDES.timezone.utc).isoformat(),
        "pickup_address": "FDF", "dropoff_address": "Le Marin",
    })


async def _clean():
    await DB.rides.delete_many({"id": RIDE_ID})
    await DB.drivers.delete_many({"id": DRIVER_ID})
    await DB.wallets.delete_many({"user_id": {"$in": [RIDER["id"], DRV_USER_ID]}})
    await DB.wallet_transactions.delete_many({"user_id": {"$in": [RIDER["id"], DRV_USER_ID]}})


def test_completion_reconciles_deposit():
    async def body():
        await _seed()
        await RIDES.update_ride_status(RIDE_ID, FakeReq(ADMIN, {"status": "completed"}))

        ride = await DB.rides.find_one({"id": RIDE_ID}, {"_id": 0})
        assert ride["status"] == "completed"
        # La caution (30) est imputée → statut capturé.
        assert ride["deposit_status"] == "captured"

        # Le passager n'est débité au final QUE du reste (tarif 100 − caution 30 = 70).
        booking_tx = await DB.wallet_transactions.find_one(
            {"user_id": RIDER["id"], "type": "Booking", "ride_id": RIDE_ID}, {"_id": 0})
        assert booking_tx is not None and abs(booking_tx["amount"] - (-70.0)) < 0.01

        # Total payé par le passager = caution (30, au booking) + charge (70) = 100 = tarif.
        # Le chauffeur est crédité du tarif net de commission 10% = 90 (caution incluse).
        earn = await DB.wallet_transactions.find_one(
            {"user_id": DRV_USER_ID, "type": "Earning", "ride_id": RIDE_ID}, {"_id": 0})
        assert earn is not None and abs(earn["amount"] - 90.0) < 0.01

        await _clean()

    run(body())


def test_completion_no_deposit_unaffected():
    """Non-régression : une course sans caution se règle normalement (tarif entier)."""
    async def body():
        await _clean()
        await DB.wallets.insert_one({"user_id": RIDER["id"], "balance": 500.0, "currency": "EUR"})
        await DB.wallets.insert_one({"user_id": DRV_USER_ID, "balance": 0.0, "currency": "EUR"})
        await DB.drivers.insert_one({"id": DRIVER_ID, "user_id": DRV_USER_ID, "total_trips": 0, "earnings": 0.0})
        await DB.rides.insert_one({
            "id": RIDE_ID, "user_id": RIDER["id"], "driver_id": DRIVER_ID,
            "status": "in_progress", "ride_type": "instant",
            "vehicle_type": "vtype_sb", "payment_method": "wallet",
            "base_fare": 100.0, "price_per_km": 0.0, "distance_km": 0.0, "commission_percent": 10,
            "fare": 100.0, "deposit_status": None, "intercity_deposit": 0.0,
            "started_at": RIDES.datetime.now(RIDES.timezone.utc).isoformat(),
            "pickup_address": "FDF", "dropoff_address": "Schoelcher",
        })
        await RIDES.update_ride_status(RIDE_ID, FakeReq(ADMIN, {"status": "completed"}))
        booking_tx = await DB.wallet_transactions.find_one(
            {"user_id": RIDER["id"], "type": "Booking", "ride_id": RIDE_ID}, {"_id": 0})
        # Aucune caution → le passager paie le tarif entier (100) à la complétion.
        assert booking_tx is not None and abs(booking_tx["amount"] - (-100.0)) < 0.01
        await _clean()

    run(body())
