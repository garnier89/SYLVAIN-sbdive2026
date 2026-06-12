"""Iter342 — Covoiturage : matching inversé (Demandes) + fulfill flow + auth admin revenue.

Couvre :
- CRUD demandes : POST /api/carpool/requests, GET /api/carpool/requests,
  GET /api/carpool/my-requests, POST /api/carpool/requests/{id}/cancel.
- Fulfill : POST /api/carpool/rides {request_id} -> la demande passe à 'fulfilled' et
  une notification est créée pour le passager.
- Auth : GET /api/carpool/admin/revenue refuse anonyme (401) et utilisateur normal (403).
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
        if request._user is None:
            from fastapi import HTTPException
            raise HTTPException(status_code=401, detail="Auth requise")
        return request._user

    async def fake_require_role(request, roles):
        from fastapi import HTTPException
        if request._user is None:
            raise HTTPException(status_code=401, detail="Auth requise")
        if (request._user.get("role") or "user") not in roles:
            raise HTTPException(status_code=403, detail="Accès refusé")
        return request._user

    monkeypatch.setattr(carpool, "get_current_user", fake_get_current_user)
    monkeypatch.setattr(carpool, "require_role", fake_require_role)


PAX = {"id": "test_pax_req", "name": "PaxReq", "phone": "+596690000021"}
PAX2 = {"id": "test_pax_req2", "name": "PaxReq2", "phone": "+596690000022"}
DRIVER = {"id": "test_drv_req", "name": "DrvReq", "phone": "+596690000023"}
ADMIN = {"id": "test_admin_req", "role": "admin"}


def _cleanup():
    async def _do():
        await DB.carpool_requests.delete_many({"passenger_id": {"$in": [PAX["id"], PAX2["id"]]}})
        await DB.carpool_rides.delete_many({"driver_id": DRIVER["id"]})
        await DB.notifications.delete_many({"user_id": {"$in": [PAX["id"], PAX2["id"]]}})
    run(_do())


def test_create_list_my_cancel_request():
    _cleanup()

    async def body():
        # CREATE
        created = await carpool.create_carpool_request(FakeReq(PAX, {
            "pickup_address": "TEST_Fort-de-France",
            "dropoff_address": "TEST_Saint-Pierre",
            "departure_date": "2027-04-01T08:30",
            "seats_needed": 2,
            "max_price": 12.5,
            "notes": "TEST_iter342 demande",
        }))
        assert created["id"].startswith("cpreq_")
        assert created["status"] == "open"
        assert created["passenger_id"] == PAX["id"]
        assert created["seats_needed"] == 2
        assert created["max_price"] == 12.5
        rid = created["id"]

        # LIST (public, open only)
        lst = await carpool.list_carpool_requests(pickup="TEST_Fort", dropoff="TEST_Saint")
        assert any(r["id"] == rid for r in lst), "La demande doit apparaître dans la liste open"

        # MY-REQUESTS
        mine = await carpool.my_carpool_requests(FakeReq(PAX))
        assert any(r["id"] == rid for r in mine)

        # Autre passager ne peut PAS annuler (404)
        from fastapi import HTTPException
        with pytest.raises(HTTPException) as e:
            await carpool.cancel_carpool_request(rid, FakeReq(PAX2))
        assert e.value.status_code == 404

        # CANCEL par owner
        out = await carpool.cancel_carpool_request(rid, FakeReq(PAX))
        assert out["ok"] is True

        # Ne doit plus apparaître dans la liste open
        lst2 = await carpool.list_carpool_requests(pickup="TEST_Fort")
        assert not any(r["id"] == rid for r in lst2), "Une demande annulée ne doit plus être listée"

        # Mais dans my-requests (statut cancelled), elle reste visible
        mine2 = await carpool.my_carpool_requests(FakeReq(PAX))
        match = next((r for r in mine2 if r["id"] == rid), None)
        assert match is not None and match["status"] == "cancelled"

    run(body())
    _cleanup()


def test_create_request_validation():
    async def body():
        from fastapi import HTTPException
        with pytest.raises(HTTPException) as e:
            await carpool.create_carpool_request(FakeReq(PAX, {
                "pickup_address": "", "dropoff_address": "B"}))
        assert e.value.status_code == 400

    run(body())


def test_fulfill_request_via_ride_creation_sends_notification():
    _cleanup()

    async def body():
        # 1) Passager publie une demande
        await DB.wallets.update_one({"user_id": PAX["id"]}, {"$set": {"balance": 50.0}}, upsert=True)
        req = await carpool.create_carpool_request(FakeReq(PAX, {
            "pickup_address": "TEST_Lamentin",
            "dropoff_address": "TEST_Trinité",
            "departure_date": "2027-04-02T07:00",
            "seats_needed": 1,
            "max_price": 8.0,
        }))
        req_id = req["id"]

        # 2) Chauffeur crée un trajet ciblant cette demande
        ride = await carpool.create_carpool_ride(FakeReq(DRIVER, {
            "pickup_address": "TEST_Lamentin",
            "dropoff_address": "TEST_Trinité",
            "departure_date": "2027-04-02T07:00",
            "available_seats": 3,
            "price_per_seat": 7,
            "request_id": req_id,
        }))
        assert ride["id"].startswith("carpool_")

        # 3) La demande doit être 'fulfilled' avec ride_id
        doc = await DB.carpool_requests.find_one({"id": req_id}, {"_id": 0})
        assert doc["status"] == "fulfilled"
        assert doc["ride_id"] == ride["id"]
        assert doc.get("fulfilled_at")

        # 4) Une notification doit être envoyée au passager
        notif = await DB.notifications.find_one(
            {"user_id": PAX["id"], "type": "carpool_request_fulfilled"}, {"_id": 0})
        assert notif is not None
        assert notif.get("data", {}).get("ride_id") == ride["id"]
        assert notif.get("data", {}).get("request_id") == req_id

        # 5) La demande ne doit plus apparaître dans la liste open
        lst = await carpool.list_carpool_requests(pickup="TEST_Lamentin")
        assert not any(r["id"] == req_id for r in lst)

    run(body())
    _cleanup()


def test_admin_revenue_requires_admin_role():
    async def body():
        from fastapi import HTTPException
        # Anonyme -> 401
        with pytest.raises(HTTPException) as e:
            await carpool.carpool_admin_revenue(FakeReq(None))
        assert e.value.status_code == 401

        # Utilisateur non-admin -> 403
        with pytest.raises(HTTPException) as e2:
            await carpool.carpool_admin_revenue(FakeReq({"id": "u1", "role": "user"}))
        assert e2.value.status_code == 403

        # Admin -> 200 (schéma de réponse complet)
        rev = await carpool.carpool_admin_revenue(FakeReq(ADMIN))
        assert "currency" in rev and "commission_percent" in rev
        k = rev["kpis"]
        for key in ("total_commission", "total_gross", "total_payout",
                    "rides_completed", "seats_sold", "active_drivers",
                    "avg_commission_per_ride"):
            assert key in k
        assert isinstance(rev["top_drivers"], list)
        assert isinstance(rev["daily"], list)

    run(body())
