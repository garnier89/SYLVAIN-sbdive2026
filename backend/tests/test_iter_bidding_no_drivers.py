"""iter — Les courses « Enchères / Proposition de tarif » se créent même sans
chauffeur en ligne (modèle d'enchère inversée), alors que les courses instantanées
standard sont bloquées (409 no_drivers_available) pour proposer la planification.

Le test bascule TEMPORAIREMENT les chauffeurs en ligne hors-ligne puis les restaure
systématiquement (try/finally), pour ne pas perturber l'environnement de preview.
"""
import asyncio
import requests

from core.config import db

BASE_URL = "http://localhost:8001"
PICKUP = {"pickup_address": "35 Rue Emile Reynaud, Paris", "pickup_lat": 48.897, "pickup_lng": 2.385}
DROPOFF = {"dropoff_address": "Place Louis Armand, Paris", "dropoff_lat": 48.844, "dropoff_lng": 2.373}


def _login():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": "famtester@demo.sb", "password": "FamTest123!"}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def test_bidding_created_without_online_drivers_standard_blocked():
    async def _get_online():
        docs = await db.drivers.find({"status": "approved", "is_online": True}, {"_id": 0, "id": 1}).to_list(1000)
        return [d["id"] for d in docs]

    async def _set_online(ids, val):
        if ids:
            await db.drivers.update_many({"id": {"$in": ids}}, {"$set": {"is_online": val}})

    loop = asyncio.get_event_loop()
    online_ids = loop.run_until_complete(_get_online())
    created_id = None
    try:
        loop.run_until_complete(_set_online(online_ids, False))
        tok = _login()
        H = {"Authorization": f"Bearer {tok}"}
        base = {**PICKUP, **DROPOFF, "vehicle_type": "sb", "payment_method": "cash"}

        # Standard instant → 409 no_drivers_available
        r1 = requests.post(f"{BASE_URL}/api/rides", headers=H,
                           json={**base, "ride_type": "instant", "mode_id": "standard"}, timeout=20)
        assert r1.status_code == 409, r1.text
        detail = r1.json().get("detail")
        assert isinstance(detail, dict) and detail.get("code") == "no_drivers_available"

        # Bidding (proposition de tarif) → 200 même sans chauffeur
        r2 = requests.post(f"{BASE_URL}/api/rides", headers=H,
                           json={**base, "ride_type": "bidding", "mode_id": "bidding", "proposed_fare": 14.0}, timeout=20)
        assert r2.status_code == 200, r2.text
        d2 = r2.json()
        created_id = d2.get("id")
        assert d2.get("status") == "pending"
        assert created_id
    finally:
        loop.run_until_complete(_set_online(online_ids, True))
        if created_id:
            loop.run_until_complete(db.rides.delete_one({"id": created_id}))
