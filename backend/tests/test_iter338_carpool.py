"""Iter338 — Covoiturage sécurisé (escrow SB Pay) : flux complet.

Couvre : création, réservation avec débit séquestre, rollback sur solde
insuffisant, annulation/remboursement passager, complétion/paiement chauffeur
(commission), impossibilité de réserver son propre trajet.
"""
import os
import sys
import asyncio

import pytest
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")
sys.path.insert(0, "/app/backend")

from core.config import db as DB  # noqa: E402  (même client motor que carpool)
from routes import carpool  # noqa: E402

# Boucle persistante (motor lie son client à la 1re boucle ; asyncio.run la ferme).
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
def patch_user(monkeypatch):
    async def fake_get_current_user(request):
        return request._user

    monkeypatch.setattr(carpool, "get_current_user", fake_get_current_user)


async def _set_balance(uid, bal):
    await DB.wallets.update_one({"user_id": uid}, {"$set": {"balance": float(bal)}}, upsert=True)


async def _balance(uid):
    w = await DB.wallets.find_one({"user_id": uid}, {"_id": 0, "balance": 1})
    return round(float((w or {}).get("balance", 0) or 0), 2)


DRIVER = {"id": "test_drv_cp", "name": "Drv", "phone": "+596690000001"}
PAX = {"id": "test_pax_cp", "name": "Pax", "phone": "+596690000002"}


def test_escrow_book_and_complete():
    async def body():
        await _set_balance(PAX["id"], 100.0)
        await _set_balance(DRIVER["id"], 0.0)
        ride = await carpool.create_carpool_ride(FakeReq(DRIVER, {
            "pickup_address": "A", "dropoff_address": "B",
            "departure_date": "2027-01-01T09:00", "available_seats": 3, "price_per_seat": 20}))
        rid = ride["id"]
        res = await carpool.book_carpool_seat(rid, FakeReq(PAX, {"seats": 2}))
        assert res["amount_paid"] == 40.0
        assert await _balance(PAX["id"]) == 60.0
        assert await _balance(DRIVER["id"]) == 0.0  # séquestre, pas encore reversé
        done = await carpool.complete_carpool_ride(rid, FakeReq(DRIVER))
        assert done["driver_credited"] == 34.0 and done["commission"] == 6.0
        assert await _balance(DRIVER["id"]) == 34.0
        r = await DB.carpool_rides.find_one({"id": rid})
        assert r["status"] == "completed"
        await DB.carpool_rides.delete_one({"id": rid})

    run(body())


def test_insufficient_balance_rolls_back_seats():
    async def body():
        await _set_balance(PAX["id"], 10.0)
        ride = await carpool.create_carpool_ride(FakeReq(DRIVER, {
            "pickup_address": "C", "dropoff_address": "D",
            "departure_date": "2027-01-02T09:00", "available_seats": 3, "price_per_seat": 50}))
        rid = ride["id"]
        with pytest.raises(Exception):
            await carpool.book_carpool_seat(rid, FakeReq(PAX, {"seats": 1}))
        r = await DB.carpool_rides.find_one({"id": rid})
        assert r["seats_taken"] == 0 and r["status"] == "open"
        await DB.carpool_rides.delete_one({"id": rid})

    run(body())


def test_passenger_cancel_refunds():
    async def body():
        await _set_balance(PAX["id"], 100.0)
        ride = await carpool.create_carpool_ride(FakeReq(DRIVER, {
            "pickup_address": "E", "dropoff_address": "F",
            "departure_date": "2027-01-03T09:00", "available_seats": 3, "price_per_seat": 15}))
        rid = ride["id"]
        await carpool.book_carpool_seat(rid, FakeReq(PAX, {"seats": 1}))
        assert await _balance(PAX["id"]) == 85.0
        out = await carpool.cancel_carpool_booking(rid, FakeReq(PAX))
        assert out["refunded"] == 15.0
        assert await _balance(PAX["id"]) == 100.0
        r = await DB.carpool_rides.find_one({"id": rid})
        assert r["seats_taken"] == 0
        await DB.carpool_rides.delete_one({"id": rid})

    run(body())


def test_cannot_book_own_ride():
    async def body():
        ride = await carpool.create_carpool_ride(FakeReq(DRIVER, {
            "pickup_address": "G", "dropoff_address": "H",
            "departure_date": "2027-01-04T09:00", "available_seats": 2, "price_per_seat": 10}))
        rid = ride["id"]
        with pytest.raises(Exception):
            await carpool.book_carpool_seat(rid, FakeReq(DRIVER, {"seats": 1}))
        await DB.carpool_rides.delete_one({"id": rid})

    run(body())


def test_rating_flow_and_average():
    async def body():
        await _set_balance(PAX["id"], 100.0)
        await DB.users.update_one(
            {"id": DRIVER["id"]},
            {"$set": {"id": DRIVER["id"], "email": "test_drv_cp@unit.test"},
             "$unset": {"cp_driver_rating_sum": "", "cp_driver_rating_count": ""}}, upsert=True)
        await DB.users.update_one(
            {"id": PAX["id"]}, {"$set": {"id": PAX["id"], "email": "test_pax_cp@unit.test"}}, upsert=True)
        await DB.carpool_ratings.delete_many({"ratee_id": {"$in": [DRIVER["id"], PAX["id"]]}})
        ride = await carpool.create_carpool_ride(FakeReq(DRIVER, {
            "pickup_address": "R1", "dropoff_address": "R2",
            "departure_date": "2027-02-01T09:00", "available_seats": 2, "price_per_seat": 10}))
        rid = ride["id"]
        await carpool.book_carpool_seat(rid, FakeReq(PAX, {"seats": 1}))
        # Notation interdite avant complétion
        with pytest.raises(Exception):
            await carpool.rate_carpool(rid, FakeReq(PAX, {"ratee_id": DRIVER["id"], "stars": 5}))
        await carpool.complete_carpool_ride(rid, FakeReq(DRIVER))
        # Passager note le chauffeur 4★
        out = await carpool.rate_carpool(rid, FakeReq(PAX, {"ratee_id": DRIVER["id"], "stars": 4}))
        assert out["ok"] and out["stars"] == 4
        # Doublon refusé
        with pytest.raises(Exception):
            await carpool.rate_carpool(rid, FakeReq(PAX, {"ratee_id": DRIVER["id"], "stars": 2}))
        # La note apparaît dans la recherche (driver_rating == 4.0)
        u = await DB.users.find_one({"id": DRIVER["id"]}, {"_id": 0, "cp_driver_rating_sum": 1, "cp_driver_rating_count": 1})
        assert u["cp_driver_rating_count"] == 1 and u["cp_driver_rating_sum"] == 4
        await DB.carpool_rides.delete_one({"id": rid})
        await DB.carpool_ratings.delete_many({"ride_id": rid})

    run(body())

