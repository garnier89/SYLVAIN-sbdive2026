"""Iter341 — Dashboard admin « Revenus Covoiturage » : endpoint d'agrégation.

Couvre : agrégation des commissions sur trajets terminés, KPIs (commission,
brut, reversé chauffeur, places, chauffeurs actifs), top chauffeurs, série
quotidienne, et validation/clamp de la config admin.
"""
import sys
import asyncio

import pytest
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")
sys.path.insert(0, "/app/backend")

from core.config import db as DB  # noqa: E402
from routes import carpool  # noqa: E402

_LOOP = asyncio.new_event_loop()
asyncio.set_event_loop(_LOOP)


def run(coro):
    return _LOOP.run_until_complete(coro)


class FakeReq:
    def __init__(self, user, body=None):
        self._user = user
        self._body = body or {}
        self.headers = {"content-length": "1"} if body else {}

    async def json(self):
        return self._body


@pytest.fixture(autouse=True)
def patch_deps(monkeypatch):
    async def fake_get_current_user(request):
        return request._user

    async def fake_require_role(request, roles):
        return request._user

    monkeypatch.setattr(carpool, "get_current_user", fake_get_current_user)
    monkeypatch.setattr(carpool, "require_role", fake_require_role)


DRIVER = {"id": "test_drv_rev", "name": "RevDrv", "phone": "+596690000011"}
PAX = {"id": "test_pax_rev", "name": "RevPax", "phone": "+596690000012"}
ADMIN = {"id": "test_admin_rev", "role": "admin"}


async def _set_balance(uid, bal):
    await DB.wallets.update_one({"user_id": uid}, {"$set": {"balance": float(bal)}}, upsert=True)


def test_revenue_aggregates_completed_ride():
    async def body():
        await _set_balance(PAX["id"], 100.0)
        await _set_balance(DRIVER["id"], 0.0)
        ride = await carpool.create_carpool_ride(FakeReq(DRIVER, {
            "pickup_address": "RevA", "dropoff_address": "RevB",
            "departure_date": "2027-03-01T09:00", "available_seats": 3, "price_per_seat": 20}))
        rid = ride["id"]
        await carpool.book_carpool_seat(rid, FakeReq(PAX, {"seats": 2}))  # 40€ séquestre
        await carpool.complete_carpool_ride(rid, FakeReq(DRIVER))  # commission 15% = 6€, payout 34€

        rev = await carpool.carpool_admin_revenue(FakeReq(ADMIN))
        k = rev["kpis"]
        assert k["total_commission"] >= 6.0
        assert k["total_gross"] >= 40.0
        assert k["total_payout"] >= 34.0
        assert k["rides_completed"] >= 1
        assert k["seats_sold"] >= 2
        # Le chauffeur de test figure dans le top, avec sa commission isolée.
        mine = next((d for d in rev["top_drivers"] if d["driver_id"] == DRIVER["id"]), None)
        assert mine is not None
        assert mine["commission"] == 6.0 and mine["gross"] == 40.0 and mine["seats"] == 2
        # Série quotidienne renseignée.
        assert any(pt["commission"] >= 6.0 for pt in rev["daily"])

        await DB.carpool_rides.delete_one({"id": rid})
        await DB.carpool_commissions.delete_many({"ride_id": rid})

    run(body())


def test_revenue_date_filter_excludes_out_of_range():
    async def body():
        await _set_balance(PAX["id"], 100.0)
        ride = await carpool.create_carpool_ride(FakeReq(DRIVER, {
            "pickup_address": "RevC", "dropoff_address": "RevD",
            "departure_date": "2027-03-02T09:00", "available_seats": 2, "price_per_seat": 10}))
        rid = ride["id"]
        await carpool.book_carpool_seat(rid, FakeReq(PAX, {"seats": 1}))
        await carpool.complete_carpool_ride(rid, FakeReq(DRIVER))

        # Plage très ancienne → ce trajet (complété aujourd'hui) doit être exclu.
        rev = await carpool.carpool_admin_revenue(FakeReq(ADMIN), date_from="2020-01-01", date_to="2020-01-31")
        mine = next((d for d in rev["top_drivers"] if d["driver_id"] == DRIVER["id"]), None)
        assert mine is None

        await DB.carpool_rides.delete_one({"id": rid})
        await DB.carpool_commissions.delete_many({"ride_id": rid})

    run(body())


def test_config_clamps_out_of_range_values():
    async def body():
        await carpool.carpool_admin_set(FakeReq(ADMIN, {
            "commission_percent": 200, "max_seats_per_booking": 99, "auto_release_hours": -5}))
        cfg = await carpool.get_carpool_config()
        assert cfg["commission_percent"] == 100.0
        assert cfg["max_seats_per_booking"] == 8
        assert cfg["auto_release_hours"] == 1
        # Restaure les valeurs par défaut.
        await carpool.carpool_admin_set(FakeReq(ADMIN, {
            "commission_percent": 15, "max_seats_per_booking": 4, "auto_release_hours": 12}))

    run(body())
