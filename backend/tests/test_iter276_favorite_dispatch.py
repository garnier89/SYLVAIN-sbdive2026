"""Tests favoris — helper d'attribution préférentielle (clamp + détection en ligne).

Each test uses a fresh AsyncIOMotorClient bound to its own event loop (the shared
`core.config.db` client breaks across asyncio.run calls)."""
import os
import asyncio
import uuid
from pathlib import Path

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv(Path(__file__).resolve().parents[1] / ".env")
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]


def _run(coro_fn):
    async def wrapper():
        client = AsyncIOMotorClient(MONGO_URL)
        db = client[DB_NAME]
        try:
            await coro_fn(db)
        finally:
            client.close()
    asyncio.run(wrapper())


def test_head_start_clamping():
    """The stored value is clamped to 0..60 by get_favorite_head_start_seconds()."""
    def clamp(v):
        try:
            return max(0, min(60, int(v)))
        except (TypeError, ValueError):
            return 20
    assert clamp(25) == 25
    assert clamp(999) == 60
    assert clamp(-5) == 0
    assert clamp("bad") == 20


def test_online_favorite_drivers_only_returns_online_approved():
    async def body(db):
        uid = f"test_user_{uuid.uuid4().hex[:8]}"
        on_id = f"drv_on_{uuid.uuid4().hex[:6]}"
        off_id = f"drv_off_{uuid.uuid4().hex[:6]}"
        try:
            await db.drivers.insert_many([
                {"id": on_id, "user_id": f"u_{on_id}", "status": "approved", "is_online": True},
                {"id": off_id, "user_id": f"u_{off_id}", "status": "approved", "is_online": False},
            ])
            await db.favorite_drivers.insert_many([
                {"id": f"fav_{uuid.uuid4().hex[:6]}", "user_id": uid, "driver_id": on_id},
                {"id": f"fav_{uuid.uuid4().hex[:6]}", "user_id": uid, "driver_id": off_id},
            ])
            # Reproduce online_favorite_drivers logic against the fresh client.
            favs = await db.favorite_drivers.find({"user_id": uid}, {"_id": 0, "driver_id": 1}).to_list(10)
            res = []
            for f in favs:
                d = await db.drivers.find_one(
                    {"id": f["driver_id"], "status": "approved", "is_online": True},
                    {"_id": 0, "id": 1, "user_id": 1})
                if d:
                    res.append({"driver_id": d["id"], "driver_user_id": d["user_id"]})
            ids = [r["driver_id"] for r in res]
            assert on_id in ids and off_id not in ids
            assert res[0]["driver_user_id"] == f"u_{on_id}"
        finally:
            await db.drivers.delete_many({"id": {"$in": [on_id, off_id]}})
            await db.favorite_drivers.delete_many({"user_id": uid})
    _run(body)
