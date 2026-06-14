"""iter — Règle « sans chauffeur en ligne » (demande explicite utilisateur) :
quand AUCUN chauffeur n'est connecté, on ne peut NI commander un taxi standard NI
négocier le tarif (enchères) → la seule option proposée est de PLANIFIER le trajet.
Les DEUX retournent 409 no_drivers_available (avec can_schedule=True).

Le test bascule TEMPORAIREMENT les chauffeurs en ligne hors-ligne puis les restaure
systématiquement (try/finally) pour ne pas perturber la preview.
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


def test_standard_and_bidding_blocked_without_drivers_only_scheduling():
    async def _get_online():
        docs = await db.drivers.find({"status": "approved", "is_online": True}, {"_id": 0, "id": 1}).to_list(1000)
        return [d["id"] for d in docs]

    async def _set_online(ids, val):
        if ids:
            await db.drivers.update_many({"id": {"$in": ids}}, {"$set": {"is_online": val}})

    loop = asyncio.get_event_loop()
    online_ids = loop.run_until_complete(_get_online())
    sched_id = None
    try:
        loop.run_until_complete(_set_online(online_ids, False))
        tok = _login()
        H = {"Authorization": f"Bearer {tok}"}
        base = {**PICKUP, **DROPOFF, "vehicle_type": "sb", "payment_method": "cash"}

        def assert_no_drivers(resp):
            assert resp.status_code == 409, resp.text
            d = resp.json().get("detail")
            assert isinstance(d, dict) and d.get("code") == "no_drivers_available"
            assert d.get("can_schedule") is True

        # Standard instant → bloqué
        assert_no_drivers(requests.post(f"{BASE_URL}/api/rides", headers=H,
                          json={**base, "ride_type": "instant", "mode_id": "standard"}, timeout=20))
        # Enchères / proposition de tarif → AUSSI bloqué (pas de négociation en direct)
        assert_no_drivers(requests.post(f"{BASE_URL}/api/rides", headers=H,
                          json={**base, "ride_type": "bidding", "mode_id": "bidding", "proposed_fare": 14.0}, timeout=20))

        # En revanche, PLANIFIER (scheduled_at futur) reste possible sans chauffeur.
        from datetime import datetime, timezone, timedelta
        sched = (datetime.now(timezone.utc) + timedelta(hours=3)).isoformat()
        r3 = requests.post(f"{BASE_URL}/api/rides", headers=H,
                           json={**base, "ride_type": "scheduled", "mode_id": "book_later", "scheduled_at": sched}, timeout=20)
        assert r3.status_code == 200, r3.text
        sched_id = r3.json().get("id")
        assert r3.json().get("status") == "pending"
    finally:
        loop.run_until_complete(_set_online(online_ids, True))
        if sched_id:
            loop.run_until_complete(db.rides.delete_one({"id": sched_id}))
