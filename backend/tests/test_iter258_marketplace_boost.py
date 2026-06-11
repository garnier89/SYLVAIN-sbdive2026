"""SB Student Phase 6b — Marketplace boost (Top annonce) config + boost helpers (in-process)."""
import asyncio
import uuid
from datetime import datetime, timezone, timedelta

from core.config import db
import routes.student_marketplace as sm


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


def test_boost_config_seed_has_default_plans():
    async def scenario():
        await db.student_market_config.delete_one({"id": sm.BOOST_CONFIG_ID})
        cfg = await sm.get_boost_config()
        ids = {p["id"] for p in cfg["plans"]}
        assert {"boost_3d", "boost_7d"} <= ids
        assert cfg["enabled"] is True
    _run(scenario())


def test_is_boosted_detects_active_and_expired():
    future = (datetime.now(timezone.utc) + timedelta(days=2)).isoformat()
    past = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
    assert sm._is_boosted({"boosted_until": future}) is True
    assert sm._is_boosted({"boosted_until": past}) is False
    assert sm._is_boosted({}) is False


def test_boosted_listing_floats_to_top_and_public_shape():
    async def scenario():
        cat = "livres"
        a = f"slist_{uuid.uuid4().hex[:8]}"
        b = f"slist_{uuid.uuid4().hex[:8]}"
        now = datetime.now(timezone.utc)
        # a created later (newer) but NOT boosted; b older but boosted
        await db.student_listings.insert_one({"id": a, "user_id": "u", "category": cat, "title": "A", "price": 5.0,
                                              "condition": "bon", "status": "active", "created_at": now.isoformat()})
        await db.student_listings.insert_one({"id": b, "user_id": "u", "category": cat, "title": "B", "price": 5.0,
                                              "condition": "bon", "status": "active",
                                              "created_at": (now - timedelta(days=3)).isoformat(),
                                              "boosted_until": (now + timedelta(days=1)).isoformat()})
        rows = await db.student_listings.find({"status": "active", "category": cat}, {"_id": 0}).to_list(50)
        cards = [sm._public_listing(r) for r in rows]
        cards.sort(key=lambda c: (c["boosted"], c.get("boosted_until") or "", c.get("created_at") or ""), reverse=True)
        # boosted B must come before A even though A is newer
        ids_in_order = [c["id"] for c in cards if c["id"] in (a, b)]
        assert ids_in_order[0] == b
        assert any(c["id"] == b and c["boosted"] for c in cards)
        await db.student_listings.delete_many({"id": {"$in": [a, b]}})
    _run(scenario())
