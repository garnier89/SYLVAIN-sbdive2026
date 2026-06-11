"""SB Student Phase 6h — Price offers/negotiation: settle helper + offer lifecycle (in-process)."""
import asyncio
import uuid

from core.config import db
import routes.student_marketplace as sm


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


def test_settle_purchase_transfers_at_agreed_price():
    async def scenario():
        buyer = {"id": f"u_{uuid.uuid4().hex[:8]}", "name": "Buy"}
        seller = f"u_{uuid.uuid4().hex[:8]}"
        lid = f"slist_{uuid.uuid4().hex[:8]}"
        await db.wallets.insert_one({"user_id": buyer["id"], "balance": 100.0, "currency": "EUR"})
        await db.wallets.insert_one({"user_id": seller, "balance": 0.0, "currency": "EUR"})
        listing = {"id": lid, "user_id": seller, "seller_name": "S", "title": "Velo", "price": 120.0,
                   "category": "materiel", "status": "active", "created_at": sm._now()}
        await db.student_listings.insert_one(dict(listing))
        # settle at agreed (negotiated) price 90, not the listing price 120
        res = await sm._settle_purchase(listing, buyer, 90.0)
        assert res["order"]["amount"] == 90.0 and res["balance"] == 10.0
        bw = await db.wallets.find_one({"user_id": buyer["id"]})
        sw = await db.wallets.find_one({"user_id": seller})
        l2 = await db.student_listings.find_one({"id": lid})
        assert abs(bw["balance"] - 10.0) < 0.01 and abs(sw["balance"] - 90.0) < 0.01 and l2["status"] == "sold"
        await db.wallets.delete_many({"user_id": {"$in": [buyer["id"], seller]}})
        await db.student_listings.delete_many({"id": lid})
        await db.student_market_orders.delete_many({"listing_id": lid})
        await db.student_seller_stats.delete_many({"user_id": seller})
    _run(scenario())


def test_settle_purchase_insufficient_balance_raises():
    async def scenario():
        from fastapi import HTTPException
        buyer = {"id": f"u_{uuid.uuid4().hex[:8]}", "name": "Buy"}
        await db.wallets.insert_one({"user_id": buyer["id"], "balance": 5.0, "currency": "EUR"})
        listing = {"id": "x", "user_id": "S", "title": "T", "price": 50.0, "status": "active"}
        raised = False
        try:
            await sm._settle_purchase(listing, buyer, 50.0)
        except HTTPException as e:
            raised = e.status_code == 400
        assert raised
        await db.wallets.delete_many({"user_id": buyer["id"]})
    _run(scenario())


def test_settle_purchase_blocks_own_listing_and_inactive():
    async def scenario():
        from fastapi import HTTPException
        buyer = {"id": "SAME", "name": "X"}
        own = {"id": "o", "user_id": "SAME", "title": "T", "price": 10.0, "status": "active"}
        try:
            await sm._settle_purchase(own, buyer, 10.0); assert False
        except HTTPException as e:
            assert e.status_code == 400
        sold = {"id": "s", "user_id": "OTHER", "title": "T", "price": 10.0, "status": "sold"}
        try:
            await sm._settle_purchase(sold, {"id": "B", "name": "B"}, 10.0); assert False
        except HTTPException as e:
            assert e.status_code == 400
    _run(scenario())
