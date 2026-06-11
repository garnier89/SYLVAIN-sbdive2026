"""SB Student Phase 6e — Seller reputation: stats, reviews, trusted badge (in-process)."""
import asyncio
import uuid

from core.config import db
import routes.student_marketplace as sm


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


def test_seller_config_seed():
    async def scenario():
        await db.student_seller_config.delete_one({"id": sm.SELLER_CONFIG_ID})
        cfg = await sm.get_seller_config()
        assert cfg["trusted_min_sales"] == 5 and cfg["trusted_min_rating"] == 4.5
    _run(scenario())


def test_recompute_stats_and_trusted_threshold():
    async def scenario():
        seller = f"u_{uuid.uuid4().hex[:8]}"
        await db.student_seller_config.update_one({"id": sm.SELLER_CONFIG_ID},
            {"$set": {"id": sm.SELLER_CONFIG_ID, "trusted_min_sales": 2, "trusted_min_rating": 4.0}}, upsert=True)
        # 2 paid orders + 2 reviews (5 and 4 => avg 4.5)
        for _ in range(2):
            await db.student_market_orders.insert_one({"id": f"smo_{uuid.uuid4().hex[:8]}", "seller_id": seller, "status": "paid"})
        await db.student_seller_reviews.insert_one({"id": f"srev_{uuid.uuid4().hex[:8]}", "seller_id": seller, "order_id": f"o{uuid.uuid4().hex[:6]}", "rating": 5})
        await db.student_seller_reviews.insert_one({"id": f"srev_{uuid.uuid4().hex[:8]}", "seller_id": seller, "order_id": f"o{uuid.uuid4().hex[:6]}", "rating": 4})
        stats = await sm.recompute_seller_stats(seller)
        assert stats["sales_count"] == 2 and stats["rating_count"] == 2 and stats["rating_avg"] == 4.5
        assert stats["trusted"] is True

        # raise threshold -> attach computes trusted live = False
        await db.student_seller_config.update_one({"id": sm.SELLER_CONFIG_ID}, {"$set": {"trusted_min_sales": 10}})
        cards = await sm._attach_seller_stats([{"id": "x", "user_id": seller}])
        assert cards[0]["seller_trusted"] is False
        assert cards[0]["seller_rating"] == 4.5 and cards[0]["seller_sales"] == 2

        # cleanup + restore default
        await db.student_market_orders.delete_many({"seller_id": seller})
        await db.student_seller_reviews.delete_many({"seller_id": seller})
        await db.student_seller_stats.delete_many({"user_id": seller})
        await db.student_seller_config.update_one({"id": sm.SELLER_CONFIG_ID}, {"$set": {"trusted_min_sales": 5, "trusted_min_rating": 4.5}})
    _run(scenario())


def test_attach_defaults_zero_for_unknown_seller():
    async def scenario():
        cards = await sm._attach_seller_stats([{"id": "y", "user_id": f"u_{uuid.uuid4().hex[:8]}"}])
        c = cards[0]
        assert c["seller_rating"] == 0.0 and c["seller_sales"] == 0 and c["seller_trusted"] is False
    _run(scenario())
