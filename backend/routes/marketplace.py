from fastapi import APIRouter, Request, HTTPException, Depends
import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional

from core.config import db
from core.deps import get_current_user
from core.permissions import require_permission
from core.notifications import create_notification
from core.websocket import manager

router = APIRouter(prefix="/marketplace", tags=["marketplace"])


def _norm_kind(v):
    """Canonical listing kind for the marketplace tiles: 'vehicle' or 'item'."""
    v = (v or "").strip().lower()
    if v in ("vehicle", "cars", "car", "véhicule", "vehicule", "vehicules"):
        return "vehicle"
    return "item"


# ===== In-app buyer <-> seller messaging =====

# Unified buyer<->seller threads work across the SB Market verticals: classic
# marketplace items/vehicles AND real-estate listings (single thread infra).
_THREAD_LISTING_COLLECTIONS = {
    "marketplace": "marketplace_listings",
    "realestate": "property_listings",
}


@router.post("/threads")
async def start_thread(request: Request):
    """Get or create a conversation thread between the current user (buyer) and a
    listing's seller. Supports `item_type` = marketplace (default) | realestate."""
    buyer = await get_current_user(request)
    body = await request.json()
    listing_id = body.get("listing_id")
    item_type = (body.get("item_type") or "marketplace").strip().lower()
    coll = _THREAD_LISTING_COLLECTIONS.get(item_type, "marketplace_listings")
    listing = await db[coll].find_one({"id": listing_id}, {"_id": 0})
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

    if item_type == "realestate":
        imgs = listing.get("images") or []
        listing_image = listing.get("thumbnail") or (imgs[0] if imgs else "")
        seller_name = listing.get("owner_name", "Vendeur")
    else:
        listing_image = listing.get("image", "")
        seller_name = listing.get("seller_name", "Vendeur")

    now = datetime.now(timezone.utc).isoformat()
    thread = {
        "id": f"thr_{uuid.uuid4().hex[:12]}",
        "item_type": item_type,
        "listing_id": listing_id,
        "listing_title": listing.get("title", ""),
        "listing_image": listing_image,
        "buyer_id": buyer["id"],
        "buyer_name": buyer.get("name", "Acheteur"),
        "seller_id": seller_id,
        "seller_name": seller_name,
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

    kind = _norm_kind(body.get("kind") or body.get("type"))
    images = body.get("images", [])
    listing = {
        "id": f"listing_{uuid.uuid4().hex[:12]}",
        "user_id": user["id"],
        "seller_name": user.get("name", ""),
        "seller_phone": user.get("phone", ""),
        "seller_verified": True,  # creation is gated by approved KYC
        "kind": kind,  # vehicle | item  (canonical discriminant for the tiles)
        "type": "cars" if kind == "vehicle" else "items",
        "title": body["title"],
        "description": body.get("description", ""),
        "price": body["price"],
        "currency": body.get("currency", "EUR"),
        "purchasable": bool(body.get("purchasable", False)),  # fixed-price → "Acheter" button
        "category": body.get("category", ""),
        "location": body.get("location", ""),
        "images": images,
        "image": images[0] if images else "",
        "listing_type": body.get("listing_type", "sell"),  # sell, rent
        "rent_period": body.get("rent_period") or ("day" if body.get("listing_type") == "rent" else None),
        "vehicle": body.get("vehicle") or {} if kind == "vehicle" else {},
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
    kind: Optional[str] = None,
    category: Optional[str] = None,
    listing_type: Optional[str] = None,
    search: Optional[str] = None,
    limit: int = 100, skip: int = 0
):
    query = {"status": "active"}
    if kind:
        query["kind"] = _norm_kind(kind)
    else:
        # marketplace tiles only show vehicles & items (real estate has its own module)
        query["kind"] = {"$in": ["vehicle", "item"]}
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

    await _expire_mp_featured()
    listings = await db.marketplace_listings.find(query, {"_id": 0}).sort(
        [("is_featured", -1), ("featured_priority", -1), ("created_at", -1)]).skip(skip).limit(limit).to_list(limit)
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


@router.patch("/listings/{listing_id}/purchasable")
async def set_purchasable(listing_id: str, request: Request):
    """Seller toggles whether a listing is buyable online at a fixed price."""
    user = await get_current_user(request)
    body = await request.json()
    update = {"purchasable": bool(body.get("purchasable", False))}
    if body.get("price") is not None:
        update["price"] = float(body["price"])
    r = await db.marketplace_listings.update_one({"id": listing_id, "user_id": user["id"]}, {"$set": update})
    if not r.matched_count:
        raise HTTPException(status_code=404, detail="Listing not found")
    return {"ok": True, **update}


@router.put("/listings/{listing_id}")
async def update_listing(listing_id: str, request: Request):
    """Owner (or admin) edits an existing vehicle/product listing."""
    user = await get_current_user(request)
    listing = await db.marketplace_listings.find_one({"id": listing_id}, {"_id": 0})
    if not listing:
        raise HTTPException(status_code=404, detail="Annonce introuvable")
    if listing["user_id"] != user["id"] and user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Accès refusé")
    body = await request.json()
    update = {}
    for f in ("title", "description", "currency", "category", "location", "rent_period"):
        if f in body and body[f] is not None:
            update[f] = body[f]
    if "price" in body and body["price"] is not None:
        update["price"] = float(body["price"])
    if "purchasable" in body:
        update["purchasable"] = bool(body["purchasable"])
    if "listing_type" in body and body["listing_type"] in ("sell", "rent"):
        update["listing_type"] = body["listing_type"]
        if body["listing_type"] == "rent" and not (body.get("rent_period") or listing.get("rent_period")):
            update["rent_period"] = "day"
    if "kind" in body:
        kind = _norm_kind(body["kind"])
        update["kind"] = kind
        update["type"] = "cars" if kind == "vehicle" else "items"
    if "vehicle" in body and (update.get("kind", listing.get("kind")) == "vehicle"):
        update["vehicle"] = body["vehicle"] or {}
    if "images" in body:
        imgs = body["images"] or []
        update["images"] = imgs
        update["image"] = imgs[0] if imgs else ""
    if update:
        update["updated_at"] = datetime.now(timezone.utc).isoformat()
        await db.marketplace_listings.update_one({"id": listing_id}, {"$set": update})
    return {**listing, **update}


# ===== Boost / mise en avant payante (parité avec l'immobilier) ==========
DEFAULT_COUNTRY = "default"


async def _expire_mp_featured():
    now = datetime.now(timezone.utc).isoformat()
    await db.marketplace_listings.update_many(
        {"is_featured": True, "featured_until": {"$ne": None, "$lt": now}},
        {"$set": {"is_featured": False, "featured_priority": 0}},
    )


@router.get("/boost-plans")
async def mp_boost_plans(request: Request, country: Optional[str] = None):
    await get_current_user(request)
    plans = []
    if country:
        plans = await db.marketplace_boost_plans.find({"country": country, "active": True}, {"_id": 0}).sort("duration_days", 1).to_list(50)
    if not plans:
        plans = await db.marketplace_boost_plans.find({"country": DEFAULT_COUNTRY, "active": True}, {"_id": 0}).sort("duration_days", 1).to_list(50)
    return plans


@router.post("/listings/{listing_id}/boost/pay")
async def mp_boost_pay(listing_id: str, request: Request):
    user = await get_current_user(request)
    body = await request.json()
    plan = await db.marketplace_boost_plans.find_one({"id": body.get("plan_id"), "active": True}, {"_id": 0})
    if not plan:
        raise HTTPException(status_code=404, detail="Plan de boost introuvable")
    listing = await db.marketplace_listings.find_one({"id": listing_id}, {"_id": 0})
    if not listing:
        raise HTTPException(status_code=404, detail="Annonce introuvable")
    if listing["user_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    amount = round(float(plan["price"]), 2)
    now = datetime.now(timezone.utc)
    ts = now.isoformat()
    res = await db.wallets.update_one(
        {"user_id": user["id"], "balance": {"$gte": amount}}, {"$inc": {"balance": -amount}})
    if res.modified_count == 0:
        raise HTTPException(status_code=400, detail="Solde SB Pay insuffisant")
    w = await db.wallets.find_one({"user_id": user["id"]}, {"_id": 0})
    new_balance = round(w["balance"], 2)
    await db.wallet_transactions.insert_one({
        "id": f"tx_{uuid.uuid4().hex[:12]}", "user_id": user["id"], "type": "Booking",
        "amount": -amount, "balance_after": new_balance,
        "description": f"Boost annonce — {plan.get('label') or str(plan['duration_days'])+' j'}",
        "status": "completed", "created_at": ts})
    until = (now + timedelta(days=int(plan["duration_days"]))).isoformat()
    await db.marketplace_listings.update_one(
        {"id": listing_id},
        {"$set": {"is_featured": True, "featured_until": until, "featured_priority": int(plan.get("priority", 5))}})
    await db.payment_transactions.insert_one({
        "id": f"pay_{uuid.uuid4().hex[:12]}", "user_id": user["id"], "amount": amount,
        "currency": str(plan["currency"]).upper(), "type": "marketplace_boost",
        "payment_method": "wallet", "payment_status": "paid", "status": "complete",
        "metadata": {"listing_id": listing_id, "plan_id": plan["id"], "duration_days": plan["duration_days"]},
        "created_at": ts, "updated_at": ts})
    return {"success": True, "listing_id": listing_id, "balance": new_balance}


# ===== Buy / pay flow =====================================================
# Money model: direct-to-seller minus a platform commission. The platform
# collects payment (SB PayGo wallet or Stripe card) and credits the seller's
# in-app wallet with (amount - commission); the commission is the platform's
# revenue. Optional courier delivery adds a flat fee (kept by the platform to
# fund the courier). Escrow/Stripe-Connect can be layered on later.

async def get_mp_settings():
    s = await db.marketplace_settings.find_one({"id": "singleton"}, {"_id": 0})
    if not s:
        s = {"id": "singleton", "commission_pct": 10.0, "delivery_fee": 5.0}
        await db.marketplace_settings.insert_one(dict(s))
    return s


@router.get("/settings")
async def marketplace_settings():
    s = await get_mp_settings()
    return {"commission_pct": s.get("commission_pct", 10.0), "delivery_fee": s.get("delivery_fee", 5.0)}


# ===== Admin dashboard (moderation + settings) ===========================

@router.get("/admin/listings")
async def admin_list_listings(
    kind: Optional[str] = None, status: Optional[str] = None, search: Optional[str] = None,
    limit: int = 200, current_user: dict = Depends(require_permission("content.manage")),
):
    """All marketplace listings (vehicles + items, every status) for moderation."""
    query = {"kind": {"$in": ["vehicle", "item"]}}
    if kind:
        query["kind"] = _norm_kind(kind)
    if status:
        query["status"] = status
    if search:
        query["$or"] = [
            {"title": {"$regex": search, "$options": "i"}},
            {"seller_name": {"$regex": search, "$options": "i"}},
        ]
    listings = await db.marketplace_listings.find(query, {"_id": 0}).sort(
        [("is_featured", -1), ("created_at", -1)]).limit(limit).to_list(limit)
    counts = {
        "vehicle": await db.marketplace_listings.count_documents({"kind": "vehicle"}),
        "item": await db.marketplace_listings.count_documents({"kind": "item"}),
    }
    return {"listings": listings, "total": len(listings), "counts": counts}


@router.delete("/admin/listings/{listing_id}")
async def admin_delete_listing(listing_id: str, current_user: dict = Depends(require_permission("content.manage"))):
    r = await db.marketplace_listings.delete_one({"id": listing_id})
    if not r.deleted_count:
        raise HTTPException(status_code=404, detail="Annonce introuvable")
    return {"ok": True}


@router.post("/admin/listings/{listing_id}/toggle")
async def admin_toggle_listing(listing_id: str, current_user: dict = Depends(require_permission("content.manage"))):
    l = await db.marketplace_listings.find_one({"id": listing_id}, {"_id": 0})
    if not l:
        raise HTTPException(status_code=404, detail="Annonce introuvable")
    new_status = "inactive" if l.get("status") == "active" else "active"
    await db.marketplace_listings.update_one({"id": listing_id}, {"$set": {"status": new_status}})
    return {"ok": True, "status": new_status}


@router.post("/admin/listings/{listing_id}/feature")
async def admin_feature_listing(listing_id: str, current_user: dict = Depends(require_permission("content.manage"))):
    l = await db.marketplace_listings.find_one({"id": listing_id}, {"_id": 0})
    if not l:
        raise HTTPException(status_code=404, detail="Annonce introuvable")
    val = not bool(l.get("is_featured"))
    await db.marketplace_listings.update_one({"id": listing_id}, {"$set": {"is_featured": val}})
    return {"ok": True, "is_featured": val}


@router.get("/admin/settings")
async def admin_get_settings(current_user: dict = Depends(require_permission("content.manage"))):
    s = await get_mp_settings()
    return {"commission_pct": s.get("commission_pct", 10.0), "delivery_fee": s.get("delivery_fee", 5.0)}


@router.put("/admin/settings")
async def admin_set_settings(request: Request, current_user: dict = Depends(require_permission("content.manage"))):
    body = await request.json()
    update = {}
    if body.get("commission_pct") is not None:
        update["commission_pct"] = max(0.0, min(float(body["commission_pct"]), 50.0))
    if body.get("delivery_fee") is not None:
        update["delivery_fee"] = max(0.0, float(body["delivery_fee"]))
    if update:
        await db.marketplace_settings.update_one({"id": "singleton"}, {"$set": update}, upsert=True)
    s = await get_mp_settings()
    return {"commission_pct": s.get("commission_pct", 10.0), "delivery_fee": s.get("delivery_fee", 5.0)}


# ===== Admin: boost plans CRUD (parité immobilier) =======================
@router.get("/admin/boost-plans")
async def mp_admin_boost_plans(current_user: dict = Depends(require_permission("content.manage"))):
    return await db.marketplace_boost_plans.find({}, {"_id": 0}).sort([("country", 1), ("duration_days", 1)]).to_list(200)


@router.post("/admin/boost-plans")
async def mp_admin_create_plan(request: Request, current_user: dict = Depends(require_permission("content.manage"))):
    body = await request.json()
    plan = {"id": f"mboost_{uuid.uuid4().hex[:10]}",
            "country": str(body.get("country") or "default"), "country_label": body.get("country_label"),
            "currency": str(body.get("currency") or "EUR"), "duration_days": max(1, int(body.get("duration_days") or 7)),
            "price": max(0.0, float(body.get("price") or 0)), "priority": int(body.get("priority") or 5),
            "label": body.get("label"), "active": bool(body.get("active", True)),
            "created_at": datetime.now(timezone.utc).isoformat()}
    await db.marketplace_boost_plans.insert_one(dict(plan))
    return {"ok": True, "plan": plan}


@router.put("/admin/boost-plans/{plan_id}")
async def mp_admin_update_plan(plan_id: str, request: Request, current_user: dict = Depends(require_permission("content.manage"))):
    body = await request.json()
    update = {}
    for f in ("country", "country_label", "currency", "label"):
        if f in body:
            update[f] = body[f]
    if "duration_days" in body:
        update["duration_days"] = max(1, int(body["duration_days"]))
    if "price" in body:
        update["price"] = max(0.0, float(body["price"]))
    if "priority" in body:
        update["priority"] = int(body["priority"])
    if "active" in body:
        update["active"] = bool(body["active"])
    if update:
        await db.marketplace_boost_plans.update_one({"id": plan_id}, {"$set": update})
    plan = await db.marketplace_boost_plans.find_one({"id": plan_id}, {"_id": 0})
    return {"ok": True, "plan": plan}


@router.post("/admin/boost-plans/{plan_id}/toggle")
async def mp_admin_toggle_plan(plan_id: str, current_user: dict = Depends(require_permission("content.manage"))):
    plan = await db.marketplace_boost_plans.find_one({"id": plan_id}, {"_id": 0})
    if not plan:
        raise HTTPException(status_code=404, detail="Plan introuvable")
    val = not plan.get("active", True)
    await db.marketplace_boost_plans.update_one({"id": plan_id}, {"$set": {"active": val}})
    return {"ok": True, "active": val}


@router.delete("/admin/boost-plans/{plan_id}")
async def mp_admin_delete_plan(plan_id: str, current_user: dict = Depends(require_permission("content.manage"))):
    await db.marketplace_boost_plans.delete_one({"id": plan_id})
    return {"ok": True}


_MP_SEED_COUNTRIES = [("FR", "France 🇫🇷"), ("MQ", "Martinique 🇲🇶"), ("GP", "Guadeloupe 🇬🇵"), ("GF", "Guyane 🇬🇫"), ("default", "Par défaut (tous)")]
_MP_SEED_TIERS = [(7, 3.99, 5, "Boost 7 jours"), (15, 6.99, 7, "Boost 15 jours"), (30, 11.99, 9, "Boost 30 jours · visibilité max")]


async def seed_marketplace_boost_plans():
    if await db.marketplace_boost_plans.count_documents({}) > 0:
        return
    docs = []
    for code, label in _MP_SEED_COUNTRIES:
        for days, price, priority, plan_label in _MP_SEED_TIERS:
            docs.append({"id": f"mboost_{uuid.uuid4().hex[:10]}", "country": code, "country_label": label,
                         "currency": "EUR", "duration_days": days, "price": price, "priority": priority,
                         "label": plan_label, "active": True, "created_at": datetime.now(timezone.utc).isoformat()})
    if docs:
        await db.marketplace_boost_plans.insert_many(docs)


async def _ensure_wallet(user_id):
    w = await db.wallets.find_one({"user_id": user_id})
    if not w:
        w = {"user_id": user_id, "balance": 0.0, "currency": "EUR", "created_at": datetime.now(timezone.utc).isoformat()}
        await db.wallets.insert_one(dict(w))
    return w


async def _wallet_tx(user_id, type_, amount, balance_after, description):
    await db.wallet_transactions.insert_one({
        "id": f"wtx_{uuid.uuid4().hex[:12]}", "user_id": user_id, "type": type_,
        "amount": round(amount, 2), "balance_after": round(balance_after, 2),
        "description": description, "created_at": datetime.now(timezone.utc).isoformat(),
    })


async def _credit_seller_and_notify(order):
    """Idempotent: credit the seller's wallet (amount - commission) and notify
    them of the new paid order. Guarded by order.payout_done."""
    if order.get("payout_done"):
        return
    seller_id = order["seller_id"]
    w = await _ensure_wallet(seller_id)
    payout = order["seller_payout"]
    new_bal = round(w["balance"] + payout, 2)
    await db.wallets.update_one({"user_id": seller_id}, {"$set": {"balance": new_bal}})
    await _wallet_tx(seller_id, "Vente", payout, new_bal, f"Vente · {order['listing_title']}")
    await db.marketplace_orders.update_one({"id": order["id"]}, {"$set": {"payout_done": True}})
    await create_notification(
        seller_id, "marketplace_order",
        f"Vente · {order['listing_title']}",
        f"{order['buyer_name']} a acheté votre article. {order['seller_payout']:.2f} € crédités sur votre portefeuille.",
        data={"order_id": order["id"], "listing_id": order["listing_id"]},
    )
    await manager.send_personal_message(
        {"type": "marketplace_order", "order_id": order["id"], "listing_title": order["listing_title"]},
        seller_id,
    )


async def _build_order(listing, buyer, fulfillment, delivery_address):
    s = await get_mp_settings()
    price = float(listing["price"])
    commission = round(price * float(s.get("commission_pct", 10.0)) / 100.0, 2)
    delivery_fee = float(s.get("delivery_fee", 5.0)) if fulfillment == "delivery" else 0.0
    total = round(price + delivery_fee, 2)
    return {
        "id": f"order_{uuid.uuid4().hex[:12]}",
        "listing_id": listing["id"], "listing_title": listing.get("title", ""),
        "listing_image": listing.get("image", ""),
        "buyer_id": buyer["id"], "buyer_name": buyer.get("name", "Acheteur"),
        "seller_id": listing["user_id"], "seller_name": listing.get("seller_name", "Vendeur"),
        "amount": total, "item_price": price, "commission": commission,
        "seller_payout": round(price - commission, 2),
        "delivery_fee": delivery_fee, "fulfillment": fulfillment,
        "delivery_address": delivery_address or "",
        "payment_method": None, "status": "pending_payment", "payout_done": False,
        "payment_ref": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }


async def _load_purchasable_listing(listing_id, buyer):
    listing = await db.marketplace_listings.find_one({"id": listing_id}, {"_id": 0})
    if not listing:
        raise HTTPException(status_code=404, detail="Annonce introuvable")
    if not listing.get("purchasable"):
        raise HTTPException(status_code=400, detail="Cette annonce n'est pas achetable en ligne")
    if listing["user_id"] == buyer["id"]:
        raise HTTPException(status_code=400, detail="Vous ne pouvez pas acheter votre propre article")
    return listing


@router.post("/orders/wallet")
async def buy_with_wallet(request: Request):
    """Instant purchase paid from the buyer's SB PayGo wallet."""
    buyer = await get_current_user(request)
    body = await request.json()
    listing = await _load_purchasable_listing(body.get("listing_id"), buyer)
    order = await _build_order(listing, buyer, body.get("fulfillment", "pickup"), body.get("delivery_address"))
    w = await _ensure_wallet(buyer["id"])
    if w["balance"] < order["amount"]:
        raise HTTPException(status_code=400, detail="Solde portefeuille insuffisant")
    new_bal = round(w["balance"] - order["amount"], 2)
    await db.wallets.update_one({"user_id": buyer["id"]}, {"$set": {"balance": new_bal}})
    await _wallet_tx(buyer["id"], "Achat", -order["amount"], new_bal, f"Achat · {order['listing_title']}")
    order["payment_method"] = "wallet"
    order["status"] = "paid"
    await db.marketplace_orders.insert_one(dict(order))
    await _credit_seller_and_notify(order)
    order.pop("_id", None)
    return {"ok": True, "order": order, "balance": new_bal}


@router.post("/orders/checkout")
async def buy_with_card(request: Request):
    """Start a Stripe Checkout session for a card purchase. Amount is computed
    server-side (never trusted from the client)."""
    from emergentintegrations.payments.stripe.checkout import StripeCheckout, CheckoutSessionRequest
    from core.config import STRIPE_API_KEY
    buyer = await get_current_user(request)
    body = await request.json()
    listing = await _load_purchasable_listing(body.get("listing_id"), buyer)
    order = await _build_order(listing, buyer, body.get("fulfillment", "pickup"), body.get("delivery_address"))
    order["payment_method"] = "card"

    origin = (body.get("origin_url") or "").rstrip("/")
    host_url = str(request.base_url)
    webhook_url = f"{host_url}api/webhook/stripe"
    stripe_checkout = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url=webhook_url)
    success_url = f"{origin}/marketplace/order/success?session_id={{CHECKOUT_SESSION_ID}}"
    cancel_url = f"{origin}/marketplace"
    req = CheckoutSessionRequest(
        amount=float(order["amount"]), currency="eur",
        success_url=success_url, cancel_url=cancel_url,
        metadata={"order_id": order["id"], "type": "marketplace_purchase",
                  "buyer_id": buyer["id"], "seller_id": order["seller_id"]},
    )
    session = await stripe_checkout.create_checkout_session(req)
    order["payment_ref"] = session.session_id
    await db.marketplace_orders.insert_one(dict(order))
    await db.payment_transactions.insert_one({
        "id": f"ptx_{uuid.uuid4().hex[:12]}", "session_id": session.session_id,
        "order_id": order["id"], "user_id": buyer["id"], "amount": float(order["amount"]),
        "currency": "eur", "payment_status": "initiated", "status": "open",
        "metadata": {"order_id": order["id"], "type": "marketplace_purchase"},
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return {"url": session.url, "session_id": session.session_id, "order_id": order["id"]}


async def _finalize_paid_session(session_id, payment_status):
    """Idempotently finalize a Stripe session: mark order paid + credit seller."""
    tx = await db.payment_transactions.find_one({"session_id": session_id}, {"_id": 0})
    if not tx:
        return None
    if payment_status == "paid" and tx.get("payment_status") != "paid":
        await db.payment_transactions.update_one(
            {"session_id": session_id}, {"$set": {"payment_status": "paid", "status": "complete"}})
        order = await db.marketplace_orders.find_one({"id": tx["order_id"]}, {"_id": 0})
        if order and order.get("status") != "paid":
            await db.marketplace_orders.update_one(
                {"id": order["id"]}, {"$set": {"status": "paid", "updated_at": datetime.now(timezone.utc).isoformat()}})
            order["status"] = "paid"
            await _credit_seller_and_notify(order)
        return order
    return await db.marketplace_orders.find_one({"id": tx["order_id"]}, {"_id": 0})


@router.get("/checkout/status/{session_id}")
async def checkout_status(session_id: str, request: Request):
    from emergentintegrations.payments.stripe.checkout import StripeCheckout
    from core.config import STRIPE_API_KEY
    await get_current_user(request)
    stripe_checkout = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url=f"{str(request.base_url)}api/webhook/stripe")
    status = await stripe_checkout.get_checkout_status(session_id)
    order = await _finalize_paid_session(session_id, status.payment_status)
    return {"payment_status": status.payment_status, "status": status.status,
            "order": order}


@router.get("/orders")
async def my_orders(request: Request):
    buyer = await get_current_user(request)
    orders = await db.marketplace_orders.find(
        {"buyer_id": buyer["id"], "status": {"$ne": "pending_payment"}}, {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    return {"orders": orders}


@router.get("/orders/sold")
async def my_sales(request: Request):
    seller = await get_current_user(request)
    orders = await db.marketplace_orders.find(
        {"seller_id": seller["id"], "status": {"$ne": "pending_payment"}}, {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    return {"orders": orders}


@router.post("/orders/{order_id}/status")
async def update_order_status(order_id: str, request: Request):
    """Seller marks 'shipped'; buyer marks 'completed' (received)."""
    user = await get_current_user(request)
    body = await request.json()
    new_status = body.get("status")
    order = await db.marketplace_orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Commande introuvable")
    allowed = {
        ("shipped", order["seller_id"]),
        ("completed", order["buyer_id"]),
        ("cancelled", order["seller_id"]),
    }
    if (new_status, user["id"]) not in allowed:
        raise HTTPException(status_code=403, detail="Action non autorisée")
    await db.marketplace_orders.update_one(
        {"id": order_id}, {"$set": {"status": new_status, "updated_at": datetime.now(timezone.utc).isoformat()}})
    other = order["buyer_id"] if user["id"] == order["seller_id"] else order["seller_id"]
    labels = {"shipped": "expédiée", "completed": "confirmée reçue", "cancelled": "annulée"}
    await create_notification(
        other, "marketplace_order", f"Commande {labels.get(new_status, new_status)}",
        f"« {order['listing_title']} » : commande {labels.get(new_status, new_status)}.",
        data={"order_id": order_id, "listing_id": order["listing_id"]})
    return {"ok": True, "status": new_status}


# Stripe webhook (mounted at /api/webhook/stripe via the central api_router).
stripe_webhook_router = APIRouter(tags=["webhook"])


@stripe_webhook_router.post("/webhook/stripe")
async def stripe_webhook(request: Request):
    from emergentintegrations.payments.stripe.checkout import StripeCheckout
    from core.config import STRIPE_API_KEY
    body = await request.body()
    sig = request.headers.get("Stripe-Signature")
    stripe_checkout = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url=f"{str(request.base_url)}api/webhook/stripe")
    try:
        event = await stripe_checkout.handle_webhook(body, sig)
    except Exception:
        return {"received": False}
    if event.session_id:
        await _finalize_paid_session(event.session_id, event.payment_status)
    return {"received": True}
