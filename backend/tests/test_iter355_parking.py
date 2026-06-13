"""Iter355 — admin parking CRUD + DB-backed public /parking/spots."""
import sys
import asyncio
import uuid

import pytest
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")
sys.path.insert(0, "/app/backend")

from core.config import db  # noqa: E402
from routes.gojek_services import seed_parking_spots, DEMO_PARKING_SPOTS  # noqa: E402
from routes.parking_admin import _clean  # noqa: E402

_LOOP = asyncio.new_event_loop()
asyncio.set_event_loop(_LOOP)


def run(coro):
    return _LOOP.run_until_complete(coro)


def test_seed_is_idempotent_and_populates_db():
    run(seed_parking_spots())  # ensure seeded
    count = run(db.parking_space.count_documents({}))
    assert count >= len(DEMO_PARKING_SPOTS)
    run(seed_parking_spots())  # second call must NOT duplicate
    assert run(db.parking_space.count_documents({})) == count


def test_clean_normalises_features_and_types():
    out = _clean({"name": " Park ", "lat": "48.85", "price_per_hour": "3.5",
                  "total_spots": "50", "features": "Couvert, Bornes", "active": False})
    assert out["name"] == "Park"
    assert out["lat"] == 48.85 and isinstance(out["lat"], float)
    assert out["total_spots"] == 50 and isinstance(out["total_spots"], int)
    assert out["features"] == ["Couvert", "Bornes"]
    assert out["active"] is False


def test_crud_roundtrip():
    pid = f"park_{uuid.uuid4().hex[:8]}"
    try:
        run(db.parking_space.insert_one({**_clean({"name": "QA Park"}), "id": pid, "display_order": 999}))
        doc = run(db.parking_space.find_one({"id": pid}, {"_id": 0}))
        assert doc["name"] == "QA Park" and doc["active"] is True
        run(db.parking_space.update_one({"id": pid}, {"$set": {"active": False}}))
        assert run(db.parking_space.find_one({"id": pid}))["active"] is False
        # excluded from public active list
        active_ids = [s["id"] for s in run(db.parking_space.find({"active": {"$ne": False}}, {"_id": 0, "id": 1}).to_list(500))]
        assert pid not in active_ids
    finally:
        run(db.parking_space.delete_one({"id": pid}))
