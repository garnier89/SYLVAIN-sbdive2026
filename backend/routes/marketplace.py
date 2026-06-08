from fastapi import APIRouter, Request, HTTPException
import uuid
from datetime import datetime, timezone
from typing import Optional

from core.config import db
from core.deps import get_current_user
from core.notifications import create_notification
from core.websocket import manager

router = APIRouter(prefix="/marketplace", tags=["marketplace"])


# ===== In-app buyer <-> seller messaging =====

@router.post("/threads")
async def start_thread(request: Request):
    """Get or create a conversation thread between the current user (buyer) and a
    listing's seller."""
    buyer = await get_current_user(request)
    body = await request.json()
    listing_id = body.get("listing_id")
    listing = await db.marketplace_listings.find_one({"id": listing_id}, {"_id": 0})
    if not listing:
        raise HTTPException(status_code=404, detail="Annonce introuvable")
    seller_id = listing.get("user_id")
    if seller_id == buyer["id"]:
        raise HTTPException(status_code=400, detail="Vous êtes le vendeur de cette annonce")

    existing = await db.marketplace_threads.find_one(
        {"listing_id": listing_id, "buyer_id": buyer["id"], "seller_id": seller_id}, {"_id": 0}
    )
    if existing:
        return existing

    now = datetime.now(timezone.utc).isoformat()
    thread = {
        "id": f"thr_{uuid.uuid4().hex[:12]}",
        "listing_id": listing_id,
        "listing_title": listing.get("title", ""),
        "listing_image": listing.get("image", ""),
        "buyer_id": buyer["id"],
        "buyer_name": buyer.get("name", "Acheteur"),
        "seller_id": seller_id,
        "seller_name": listing.get("seller_name", "Vendeur"),
        "last_message": None,
        "last_message_at": None,
        "created_at": now,
    }
    await db.marketplace_threads.insert_one(dict(thread))
    thread.pop("_id", None)
    return thread


@router.get("/threads")
async def my_threads(request: Request):
    user = await get_current_user(request)
    threads = await db.marketplace_threads.find(
        {"$or": [{"buyer_id": user["id"]}, {"seller_id": user["id"]}]}, {"_id": 0}
    ).sort("last_message_at", -1).to_list(100)
    for t in threads:
        t["unread"] = await db.marketplace_messages.count_documents(
            {"thread_id": t["id"], "sender_id": {"$ne": user["id"]}, "read": False}
        )
    return {"threads": threads}


async def _require_participant(thread_id: str, user_id: str) -> dict:
    thread = await db.marketplace_threads.find_one({"id": thread_id}, {"_id": 0})
    if not thread or user_id not in (thread.get("buyer_id"), thread.get("seller_id")):
        raise HTTPException(status_code=404, detail="Conversation introuvable")
    return thread


@router.get("/threads/{thread_id}/messages")
async def thread_messages(thread_id: str, request: Request):
    user = await get_current_user(request)
    thread = await _require_participant(thread_id, user["id"])
    await db.marketplace_messages.update_many(
        {"thread_id": thread_id, "sender_id": {"$ne": user["id"]}, "read": False},
        {"$set": {"read": True}},
    )
    messages = await db.marketplace_messages.find(
        {"thread_id": thread_id}, {"_id": 0}
    ).sort("created_at", 1).to_list(500)
    return {"thread": thread, "messages": messages, "me": user["id"]}


@router.post("/threads/{thread_id}/messages")
async def send_message(thread_id: str, request: Request):
    user = await get_current_user(request)
    thread = await _require_participant(thread_id, user["id"])
    body = await request.json()
    text = (body.get("text") or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Message vide")
    now = datetime.now(timezone.utc).isoformat()
    msg = {
        "id": f"msg_{uuid.uuid4().hex[:12]}",
        "thread_id": thread_id,
        "sender_id": user["id"],
        "sender_name": user.get("name", ""),
        "text": text[:2000],
        "read": False,
        "created_at": now,
    }
    await db.marketplace_messages.insert_one(dict(msg))
    await db.marketplace_threads.update_one(
        {"id": thread_id}, {"$set": {"last_message": text[:120], "last_message_at": now}}
    )
    other_id = thread["seller_id"] if user["id"] == thread["buyer_id"] else thread["buyer_id"]
    sender_name = user.get("name") or "Quelqu’un"
    await create_notification(
        other_id, "marketplace_message",
        f"Message · {thread.get('listing_title', 'Annonce')}",
        f"{sender_name}: {text[:80]}",
        data={"thread_id": thread_id, "listing_id": thread.get("listing_id")},
    )
    msg.pop("_id", None)
    # Real-time push (replaces the old 4s polling). Sent to BOTH participants so
    # open chat windows append instantly; the frontend dedupes by message id.
    ws_payload = {
        "type": "marketplace_message",
        "thread_id": thread_id,
        "listing_title": thread.get("listing_title", "Annonce"),
        "message": msg,
    }
    for uid in {other_id, user["id"]}:
        await manager.send_personal_message(ws_payload, uid)
    return msg


@router.post("/threads/{thread_id}/read")
async def mark_thread_read(thread_id: str, request: Request):
    """Lightweight, event-driven read receipt: mark the other party's messages as
    read for the current user (called when a WS message arrives in an open chat)."""
    user = await get_current_user(request)
    await _require_participant(thread_id, user["id"])
    await db.marketplace_messages.update_many(
        {"thread_id": thread_id, "sender_id": {"$ne": user["id"]}, "read": False},
        {"$set": {"read": True}},
    )
    return {"ok": True}


@router.post("/listings")
async def create_listing(request: Request):
    user = await get_current_user(request)
    # Selling gate: KYC must be approved (+ driver account active/ever-active).
    from routes.kyc import can_user_sell
    gate = await can_user_sell(user)
    if not gate["can_sell"]:
        raise HTTPException(status_code=403, detail=gate["reason"] or "Vérification d'identité requise pour vendre.")
    body = await request.json()

    images = body.get("images", [])
    listing = {
        "id": f"listing_{uuid.uuid4().hex[:12]}",
        "user_id": user["id"],
        "seller_name": user.get("name", ""),
        "seller_phone": user.get("phone", ""),
        "seller_verified": True,  # creation is gated by approved KYC
        "type": body.get("type", "items"),  # real-estate, cars, items
        "title": body["title"],
        "description": body.get("description", ""),
        "price": body["price"],
        "currency": body.get("currency", "EUR"),
        "category": body.get("category", ""),
        "location": body.get("location", ""),
        "images": images,
        "image": images[0] if images else "",
        "listing_type": body.get("listing_type", "sell"),  # sell, rent
        "is_featured": False,
        "status": "active",
        "views": 0,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.marketplace_listings.insert_one(listing)
    listing.pop("_id", None)
    return listing


@router.get("/listings")
async def list_listings(
    type: Optional[str] = None,
    category: Optional[str] = None,
    listing_type: Optional[str] = None,
    search: Optional[str] = None,
    limit: int = 20, skip: int = 0
):
    query = {"status": "active"}
    if type:
        query["type"] = type
    if category:
        query["category"] = category
    if listing_type:
        query["listing_type"] = listing_type
    if search:
        query["$or"] = [
            {"title": {"$regex": search, "$options": "i"}},
            {"description": {"$regex": search, "$options": "i"}}
        ]

    listings = await db.marketplace_listings.find(query, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    total = await db.marketplace_listings.count_documents(query)
    return {"listings": listings, "total": total}


@router.get("/my-listings")
async def my_listings(request: Request):
    user = await get_current_user(request)
    listings = await db.marketplace_listings.find(
        {"user_id": user["id"]}, {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    return {"listings": listings, "total": len(listings)}


@router.get("/listings/{listing_id}")
async def get_listing(listing_id: str):
    listing = await db.marketplace_listings.find_one({"id": listing_id}, {"_id": 0})
    if not listing:
        raise HTTPException(status_code=404, detail="Listing not found")
    await db.marketplace_listings.update_one({"id": listing_id}, {"$inc": {"views": 1}})
    return listing


@router.delete("/listings/{listing_id}")
async def delete_listing(listing_id: str, request: Request):
    user = await get_current_user(request)
    result = await db.marketplace_listings.delete_one({"id": listing_id, "user_id": user["id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Listing not found")
    return {"message": "Listing deleted"}
