"""SB Student Phase 6c — Campus deal alerts: prefs default + match/notify logic (in-process)."""
import asyncio
import uuid

from core.config import db
import routes.student_marketplace as sm


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


def test_alert_prefs_default_is_enabled_all():
    async def scenario():
        uid = f"u_{uuid.uuid4().hex[:8]}"
        await db.student_market_alerts.delete_many({"user_id": uid})
        prefs = await sm.get_alert_prefs(uid)
        assert prefs["enabled"] is True and prefs["categories"] == [] and prefs["zone_ids"] == []
        await db.student_market_alerts.delete_many({"user_id": uid})
    _run(scenario())


def test_notify_campus_deal_respects_category_and_zone_and_excludes_seller():
    async def scenario():
        seller = f"u_{uuid.uuid4().hex[:8]}"
        follower_all = f"u_{uuid.uuid4().hex[:8]}"      # all cats/zones → should be notified
        follower_other = f"u_{uuid.uuid4().hex[:8]}"    # follows 'logement' only → NOT notified
        disabled = f"u_{uuid.uuid4().hex[:8]}"          # disabled → NOT notified
        zone = f"cz_{uuid.uuid4().hex[:6]}"
        await db.student_market_alerts.delete_many({"user_id": {"$in": [seller, follower_all, follower_other, disabled]}})
        await db.student_market_alerts.insert_one({"user_id": follower_all, "enabled": True, "categories": [], "zone_ids": []})
        await db.student_market_alerts.insert_one({"user_id": follower_other, "enabled": True, "categories": ["logement"], "zone_ids": []})
        await db.student_market_alerts.insert_one({"user_id": disabled, "enabled": False, "categories": [], "zone_ids": []})
        await db.student_market_alerts.insert_one({"user_id": seller, "enabled": True, "categories": [], "zone_ids": []})

        listing = {"id": f"slist_{uuid.uuid4().hex[:8]}", "user_id": seller, "category": "livres",
                   "title": "Algo & Prog", "price": 14.0, "zone_id": zone, "zone_name": "Campus X"}
        await sm._notify_campus_deal(listing)

        async def has_deal(uid):
            return await db.notifications.count_documents({"user_id": uid, "type": "student_deal", "data.listing_id": listing["id"]})

        assert await has_deal(follower_all) == 1
        assert await has_deal(follower_other) == 0
        assert await has_deal(disabled) == 0
        assert await has_deal(seller) == 0  # seller never notified of own listing

        await db.notifications.delete_many({"data.listing_id": listing["id"]})
        await db.student_market_alerts.delete_many({"user_id": {"$in": [seller, follower_all, follower_other, disabled]}})
    _run(scenario())


def test_no_zone_listing_does_not_notify():
    async def scenario():
        follower = f"u_{uuid.uuid4().hex[:8]}"
        await db.student_market_alerts.insert_one({"user_id": follower, "enabled": True, "categories": [], "zone_ids": []})
        listing = {"id": f"slist_{uuid.uuid4().hex[:8]}", "user_id": "seller", "category": "livres",
                   "title": "No zone", "price": 5.0, "zone_id": None}
        await sm._notify_campus_deal(listing)
        cnt = await db.notifications.count_documents({"user_id": follower, "data.listing_id": listing["id"]})
        assert cnt == 0
        await db.student_market_alerts.delete_many({"user_id": follower})
    _run(scenario())
