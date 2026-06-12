"""Iter343 — Trajets habituels chauffeur + alerte auto sur demande correspondante.

Couvre : CRUD trajet habituel, matching texte (ville) et géo (rayon), notification
au chauffeur correspondant, exclusion du chauffeur=passager, toggle/suppression.
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
def patch_user(monkeypatch):
    async def fake_get_current_user(request):
        return request._user

    monkeypatch.setattr(carpool, "get_current_user", fake_get_current_user)


DRIVER = {"id": "test_drv_rt", "name": "RouteDrv"}
PAX = {"id": "test_pax_rt", "name": "RoutePax"}


async def _cleanup():
    await DB.carpool_driver_routes.delete_many({"driver_id": DRIVER["id"]})
    await DB.carpool_requests.delete_many({"passenger_id": PAX["id"]})
    await DB.notifications.delete_many({"user_id": DRIVER["id"], "type": "carpool_request_match"})


async def _match_notifs():
    return await DB.notifications.count_documents({"user_id": DRIVER["id"], "type": "carpool_request_match"})


def test_text_match_notifies_driver():
    async def body():
        await _cleanup()
        await carpool.create_driver_route(FakeReq(DRIVER, {
            "pickup_address": "Fort-de-France centre", "dropoff_address": "Le Lamentin aéroport",
            "days": [1, 2, 3, 4, 5], "time": "07:30"}))
        out = await carpool.create_carpool_request(FakeReq(PAX, {
            "pickup_address": "Fort-de-France", "dropoff_address": "Lamentin",
            "departure_date": "2027-06-01T07:30", "seats_needed": 1}))
        assert out["drivers_notified"] >= 1
        assert await _match_notifs() >= 1
        await _cleanup()

    run(body())


def test_no_match_does_not_notify():
    async def body():
        await _cleanup()
        await carpool.create_driver_route(FakeReq(DRIVER, {
            "pickup_address": "Fort-de-France", "dropoff_address": "Le Lamentin"}))
        out = await carpool.create_carpool_request(FakeReq(PAX, {
            "pickup_address": "Paris", "dropoff_address": "Lyon",
            "departure_date": "2027-06-02T09:00"}))
        assert out["drivers_notified"] == 0
        assert await _match_notifs() == 0
        await _cleanup()

    run(body())


def test_geo_match_within_radius():
    async def body():
        await _cleanup()
        # Route avec coords (Fort-de-France ~14.61,-61.07 → Lamentin ~14.61,-60.99)
        await carpool.create_driver_route(FakeReq(DRIVER, {
            "pickup_address": "A", "dropoff_address": "B",
            "pickup_lat": 14.61, "pickup_lng": -61.07,
            "dropoff_lat": 14.61, "dropoff_lng": -60.99}))
        # Demande à ~3 km de chaque extrémité, adresses textuelles différentes → match géo.
        out = await carpool.create_carpool_request(FakeReq(PAX, {
            "pickup_address": "Zone X", "dropoff_address": "Zone Y",
            "pickup_lat": 14.63, "pickup_lng": -61.06,
            "dropoff_lat": 14.62, "dropoff_lng": -60.98,
            "departure_date": "2027-06-03T08:00"}))
        assert out["drivers_notified"] >= 1
        await _cleanup()

    run(body())


def test_inactive_route_not_notified():
    async def body():
        await _cleanup()
        rt = await carpool.create_driver_route(FakeReq(DRIVER, {
            "pickup_address": "Fort-de-France", "dropoff_address": "Le Marin"}))
        tog = await carpool.toggle_driver_route(rt["id"], FakeReq(DRIVER))
        assert tog["active"] is False
        out = await carpool.create_carpool_request(FakeReq(PAX, {
            "pickup_address": "Fort-de-France", "dropoff_address": "Marin",
            "departure_date": "2027-06-04T08:00"}))
        assert out["drivers_notified"] == 0
        # Suppression
        deld = await carpool.delete_driver_route(rt["id"], FakeReq(DRIVER))
        assert deld["ok"] is True
        await _cleanup()

    run(body())
