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
        "purchasable": bool(body.get("purchasable", False)),  # fixed-price → "Acheter" button
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
