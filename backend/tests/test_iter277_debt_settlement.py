"""Régression — règlement de dette portée sur une course espèces (invariant financier).

Scénario : course classique 20€ + dette portée 10€ (due à un ancien chauffeur).
Paiement espèces, chauffeur confirme « Reçu » → il a encaissé 30€, on lui débite 10€
du portefeuille et on reverse 10€ à l'ancien chauffeur ; la dette est marquée payée.

Utilise un client motor frais (le `core.config.db` partagé casse entre asyncio.run)
et pilote les vrais endpoints HTTP."""
import os
import asyncio
import uuid
from datetime import datetime, timezone
from pathlib import Path

import requests
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv(Path(__file__).resolve().parents[1] / ".env")
load_dotenv(Path(__file__).resolve().parents[2] / "frontend" / ".env")
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")


def _login(email, password):
    r = requests.post(f"{BASE}/api/auth/login", json={"email": email, "password": password}, timeout=30)
    r.raise_for_status()
    d = r.json()
    return d.get("token") or d.get("access_token")


def test_cash_ride_settles_carried_debt():
    state = {}

    async def seed(db):
        now = datetime.now(timezone.utc).isoformat()
        paul = await db.users.find_one({"email": "paul.vendeur@example.com"}, {"_id": 0, "id": 1})
        drv = await db.users.find_one({"email": "jean.dupont@demo.sb"}, {"_id": 0, "id": 1})
        nd = await db.drivers.find_one({"user_id": drv["id"]}, {"_id": 0, "id": 1, "user_id": 1})
        od = await db.drivers.find_one({"id": {"$ne": nd["id"]}}, {"_id": 0, "id": 1, "user_id": 1})
        await db.wallets.update_one({"user_id": nd["user_id"]}, {"$set": {"balance": 100.0}}, upsert=True)
        await db.wallets.update_one({"user_id": od["user_id"]}, {"$set": {"balance": 50.0}}, upsert=True)
        await db.cancellation_debts.delete_many({"user_id": paul["id"]})
        did = f"debt_{uuid.uuid4().hex[:10]}"
        rid = f"ride_pytest_{uuid.uuid4().hex[:8]}"
        await db.cancellation_debts.insert_one({
            "id": did, "user_id": paul["id"], "ride_id": "old", "amount": 10.0,
            "reason": "ride_balance", "paid": False, "owed_to_driver_id": od["id"],
            "carried_ride_id": rid, "created_at": now, "paid_at": None})
        await db.rides.insert_one({
            "id": rid, "user_id": paul["id"], "driver_id": nd["id"], "status": "in_progress",
            "payment_method": "cash", "vehicle_type": "standard", "estimated_fare": 20.0,
            "final_fare": 20.0, "distance_km": 5.0, "duration_mins": 12, "commission_percent": 10,
            "pickup_address": "A", "dropoff_address": "B", "pickup_lat": 48.85, "pickup_lng": 2.35,
            "dropoff_lat": 48.86, "dropoff_lng": 2.36,
            "carried_debt": {"amount": 10.0, "debt_ids": [did], "owed": [{"driver_id": od["id"], "amount": 10.0}]},
            "created_at": now})
        state.update(ride_id=rid, debt_id=did, paul=paul["id"],
                     nd_user=nd["user_id"], od_user=od["user_id"])

    async def verify(db):
        ride = await db.rides.find_one({"id": state["ride_id"]}, {"_id": 0, "fare_breakdown": 1, "cash_collected": 1})
        bd = ride.get("fare_breakdown") or {}
        assert bd.get("carried_debt") == 10.0
        assert bd.get("total_net") == 30.0           # fare 20 + debt 10
        assert ride.get("cash_collected") == 30.0    # driver collected fare + debt
        nd = await db.wallets.find_one({"user_id": state["nd_user"]}, {"_id": 0, "balance": 1})
        od = await db.wallets.find_one({"user_id": state["od_user"]}, {"_id": 0, "balance": 1})
        assert nd["balance"] == 90.0                 # debited the 10 they forward
        assert od["balance"] == 60.0                 # old driver reimbursed
        debt = await db.cancellation_debts.find_one({"id": state["debt_id"]}, {"_id": 0, "paid": 1})
        assert debt["paid"] is True

    async def cleanup(db):
        await db.rides.delete_one({"id": state["ride_id"]})
        await db.cancellation_debts.delete_many({"user_id": state["paul"]})
        await db.wallets.update_one({"user_id": state["paul"]}, {"$set": {"balance": 0.0}})

    def run(fn):
        async def w():
            client = AsyncIOMotorClient(MONGO_URL)
            try:
                await fn(client[DB_NAME])
            finally:
                client.close()
        asyncio.run(w())

    run(seed)
    try:
        tok = _login("jean.dupont@demo.sb", "Driver123!")
        h = {"Authorization": f"Bearer {tok}"}
        r1 = requests.post(f"{BASE}/api/rides/{state['ride_id']}/status", headers=h,
                           json={"status": "completed", "extra_charges": {}}, timeout=30)
        assert r1.status_code == 200, r1.text
        r2 = requests.post(f"{BASE}/api/rides/{state['ride_id']}/collect-cash", headers=h,
                           json={"received": True}, timeout=30)
        assert r2.status_code == 200, r2.text
        assert r2.json().get("amount") == 30.0        # fare + debt collected in cash
        run(verify)
    finally:
        run(cleanup)
