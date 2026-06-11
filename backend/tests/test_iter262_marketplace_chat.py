"""SB Student Phase 6f — Buyer↔seller messaging: conversation create, unread, read-reset (in-process)."""
import asyncio
import uuid

from core.config import db
import routes.student_marketplace as sm


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


def test_conversation_view_role_and_unread():
    conv = {"id": "c1", "listing_id": "l1", "listing_title": "T", "buyer_id": "B", "buyer_name": "Buy",
            "seller_id": "S", "seller_name": "Sell", "unread_buyer": 2, "unread_seller": 3, "last_text": "hi"}
    vb = sm._conversation_view(conv, "B")
    assert vb["my_role"] == "buyer" and vb["other_name"] == "Sell" and vb["unread"] == 2
    vs = sm._conversation_view(conv, "S")
    assert vs["my_role"] == "seller" and vs["other_name"] == "Buy" and vs["unread"] == 3


def test_post_message_increments_other_unread_and_updates_last():
    async def scenario():
        cid = f"sconv_{uuid.uuid4().hex[:8]}"
        conv = {"id": cid, "listing_id": "l", "listing_title": "Cam", "buyer_id": "B", "buyer_name": "Buy",
                "seller_id": "S", "seller_name": "Sell", "unread_buyer": 0, "unread_seller": 0,
                "last_text": "", "created_at": sm._now()}
        await db.student_conversations.insert_one(dict(conv))
        # buyer sends -> seller unread +1
        await sm._post_message(conv, {"id": "B", "name": "Buy"}, "Dispo ?", "buyer")
        c = await db.student_conversations.find_one({"id": cid})
        assert c["unread_seller"] == 1 and c["unread_buyer"] == 0 and c["last_text"] == "Dispo ?"
        # seller replies -> buyer unread +1
        await sm._post_message(c, {"id": "S", "name": "Sell"}, "Oui", "seller")
        c2 = await db.student_conversations.find_one({"id": cid})
        assert c2["unread_buyer"] == 1
        msgs = await db.student_messages.find({"conversation_id": cid}, {"_id": 0}).sort("created_at", 1).to_list(10)
        assert [m["sender_role"] for m in msgs] == ["buyer", "seller"]
        await db.student_messages.delete_many({"conversation_id": cid})
        await db.student_conversations.delete_many({"id": cid})
    _run(scenario())
