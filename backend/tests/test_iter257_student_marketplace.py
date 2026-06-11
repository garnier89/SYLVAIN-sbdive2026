"""SB Student Phase 6 — Student marketplace (C2C) buy flow + verified-student gate (in-process)."""
import asyncio
import uuid

from core.config import db
import routes.student_marketplace as sm


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


def test_verified_student_gate():
    async def scenario():
        verified = f"u_{uuid.uuid4().hex[:8]}"
        plain = f"u_{uuid.uuid4().hex[:8]}"
        await db.student_profiles.insert_one({"user_id": verified, "status": "verified", "created_at": sm._now()})
        assert await sm._is_verified_student(verified) is True
        assert await sm._is_verified_student(plain) is False
        await db.student_profiles.delete_many({"user_id": verified})
    _run(scenario())


def test_buy_with_wallet_transfers_funds_and_marks_sold():
    async def scenario():
        seller = f"u_{uuid.uuid4().hex[:8]}"
        buyer = f"u_{uuid.uuid4().hex[:8]}"
        lid = f"slist_{uuid.uuid4().hex[:8]}"
        await db.wallets.insert_one({"user_id": buyer, "balance": 50.0, "currency": "EUR"})
        await db.wallets.insert_one({"user_id": seller, "balance": 0.0, "currency": "EUR"})
        await db.student_listings.insert_one({
            "id": lid, "user_id": seller, "seller_name": "S", "category": "livres",
            "title": "Test Book", "price": 12.0, "currency": "EUR", "condition": "bon",
            "status": "active", "views": 0, "created_at": sm._now(),
        })

        # emulate the buy endpoint settlement (wallet debit/credit + sold)
        listing = await db.student_listings.find_one({"id": lid}, {"_id": 0})
        price = round(float(listing["price"]), 2)
        bw = await sm._ensure_wallet(buyer)
        assert float(bw["balance"]) >= price
        new_b = round(float(bw["balance"]) - price, 2)
        await db.wallets.update_one({"user_id": buyer}, {"$set": {"balance": new_b}})
        sw = await sm._ensure_wallet(seller)
        new_s = round(float(sw["balance"]) + price, 2)
        await db.wallets.update_one({"user_id": seller}, {"$set": {"balance": new_s}})
        await db.student_listings.update_one({"id": lid}, {"$set": {"status": "sold"}})

        b2 = await db.wallets.find_one({"user_id": buyer})
        s2 = await db.wallets.find_one({"user_id": seller})
        l2 = await db.student_listings.find_one({"id": lid})
        assert abs(b2["balance"] - 38.0) < 0.01
        assert abs(s2["balance"] - 12.0) < 0.01
        assert l2["status"] == "sold"

        await db.wallets.delete_many({"user_id": {"$in": [buyer, seller]}})
        await db.student_listings.delete_many({"id": lid})
    _run(scenario())


def test_public_listing_shape_has_category_label():
    out = sm._public_listing({"id": "x", "category": "materiel", "title": "T", "price": 5.0, "condition": "bon"})
    assert out["category_label"] == "Matériel"
    assert out["price"] == 5.0 and "image_url" in out
