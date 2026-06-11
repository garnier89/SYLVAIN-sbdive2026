"""SB Student Phase 6d — Weekly campus deal digest builder + eligibility (in-process)."""
import asyncio
import uuid
from datetime import datetime, timezone, timedelta

from core.config import db
import routes.student_digest as sd


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


def test_digest_config_seed():
    async def scenario():
        await db.student_digest_config.delete_one({"id": sd.CONFIG_ID})
        cfg = await sd.get_digest_config()
        assert cfg["enabled"] is True and cfg["send_day"] == 0 and cfg["send_hour"] == 9
    _run(scenario())


def test_build_digest_orders_boosted_then_views_and_respects_zone():
    async def scenario():
        uid = f"u_{uuid.uuid4().hex[:8]}"
        zone = f"cz_{uuid.uuid4().hex[:6]}"
        other_zone = f"cz_{uuid.uuid4().hex[:6]}"
        await db.campus_zones.insert_one({"id": zone, "enabled": True, "name": "Z", "lat": 0, "lng": 0})
        now = datetime.now(timezone.utc)
        # recent: a (plain, views 1), b (boosted), c (plain, views 9), d (other zone), e (old)
        base = {"status": "active", "category": "materiel", "price": 10.0, "condition": "bon"}
        await db.student_listings.insert_one({"id": "a", "user_id": "seller", "zone_id": zone, "views": 1, "created_at": now.isoformat(), **base})
        await db.student_listings.insert_one({"id": "b", "user_id": "seller", "zone_id": zone, "views": 0, "created_at": now.isoformat(),
                                              "boosted_until": (now + timedelta(days=1)).isoformat(), **base})
        await db.student_listings.insert_one({"id": "c", "user_id": "seller", "zone_id": zone, "views": 9, "created_at": now.isoformat(), **base})
        await db.student_listings.insert_one({"id": "d", "user_id": "seller", "zone_id": other_zone, "views": 99, "created_at": now.isoformat(), **base})
        await db.student_listings.insert_one({"id": "e", "user_id": "seller", "zone_id": zone, "views": 50,
                                              "created_at": (now - timedelta(days=10)).isoformat(), **base})

        prefs = {"user_id": uid, "zone_ids": [zone], "categories": []}
        items = await sd.build_digest_for(prefs, 6)
        ids = [i["id"] for i in items]
        assert ids[0] == "b"          # boosted first
        assert ids[1] == "c"          # then most viewed
        assert "d" not in ids         # other zone excluded
        assert "e" not in ids         # >7 days excluded

        # category filter narrows it
        prefs2 = {"user_id": uid, "zone_ids": [zone], "categories": ["livres"]}
        assert await sd.build_digest_for(prefs2, 6) == []

        await db.student_listings.delete_many({"id": {"$in": ["a", "b", "c", "d", "e"]}})
        await db.campus_zones.delete_many({"id": {"$in": [zone, other_zone]}})
    _run(scenario())


def test_seller_excluded_from_own_digest():
    async def scenario():
        seller = f"u_{uuid.uuid4().hex[:8]}"
        zone = f"cz_{uuid.uuid4().hex[:6]}"
        await db.campus_zones.insert_one({"id": zone, "enabled": True, "name": "Z", "lat": 0, "lng": 0})
        await db.student_listings.insert_one({"id": "own", "user_id": seller, "zone_id": zone, "status": "active",
                                              "category": "materiel", "price": 5.0, "views": 5,
                                              "created_at": datetime.now(timezone.utc).isoformat()})
        items = await sd.build_digest_for({"user_id": seller, "zone_ids": [zone], "categories": []}, 6)
        assert items == []  # never see your own listing
        await db.student_listings.delete_many({"id": "own"})
        await db.campus_zones.delete_many({"id": zone})
    _run(scenario())
