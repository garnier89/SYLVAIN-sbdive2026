"""SB Student Phase 6g — Chat AI quick-replies fallback + seller away auto-reply (in-process)."""
import asyncio
import uuid

from core.config import db
import routes.student_marketplace as sm


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


def test_seller_settings_default():
    async def scenario():
        uid = f"u_{uuid.uuid4().hex[:8]}"
        await db.student_seller_settings.delete_many({"user_id": uid})
        s = await sm.get_seller_settings(uid)
        assert s["away_enabled"] is False and s["away_message"]
        await db.student_seller_settings.delete_many({"user_id": uid})
    _run(scenario())


def test_auto_reply_only_when_away_and_throttled():
    async def scenario():
        seller = f"u_{uuid.uuid4().hex[:8]}"
        cid = f"sconv_{uuid.uuid4().hex[:8]}"
        conv = {"id": cid, "listing_id": "l", "listing_title": "Manuel", "buyer_id": "B", "buyer_name": "Buy",
                "seller_id": seller, "seller_name": "Sell", "unread_buyer": 0, "unread_seller": 0,
                "last_text": "", "created_at": sm._now()}
        await db.student_conversations.insert_one(dict(conv))

        # away OFF -> no auto reply
        await db.student_seller_settings.update_one({"user_id": seller},
            {"$set": {"user_id": seller, "away_enabled": False}}, upsert=True)
        assert await sm._maybe_auto_reply(conv) is None
        assert await db.student_messages.count_documents({"conversation_id": cid, "auto": True}) == 0

        # away ON -> one auto reply
        await db.student_seller_settings.update_one({"user_id": seller},
            {"$set": {"away_enabled": True, "away_message": "À ce soir"}})
        r1 = await sm._maybe_auto_reply(conv)
        assert r1 is not None and r1["auto"] is True and r1["sender_role"] == "seller"
        # second call within 30 min -> throttled (still only one)
        await sm._maybe_auto_reply(conv)
        assert await db.student_messages.count_documents({"conversation_id": cid, "auto": True}) == 1

        await db.student_messages.delete_many({"conversation_id": cid})
        await db.student_conversations.delete_many({"id": cid})
        await db.student_seller_settings.delete_many({"user_id": seller})
    _run(scenario())


def test_fallback_suggestions_exist():
    assert len(sm._FALLBACK_SUGGEST_BUYER) == 3 and len(sm._FALLBACK_SUGGEST_SELLER) == 3
    assert all(isinstance(s, str) and s for s in sm._FALLBACK_SUGGEST_BUYER + sm._FALLBACK_SUGGEST_SELLER)
