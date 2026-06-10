"""Smart grouped delivery engine (P2.2 — Achats groupés intelligents).

Batches compatible *grouped* delivery orders so a single courier can deliver
several at once → a reduced delivery fee (credited back to each customer as
savings) and an optimized multi-stop route.

Matching is a deterministic geo-heuristic (robust + testable): two orders are
compatible when their merchants are in the same cluster (within a radius) AND
their drop-off points are near each other, within a time window. An optional
AI (Gemini) eco/route summary is generated fire-and-forget for the batch.

Customer-facing rule (validated with user):
  - A "grouped" order pays the FULL delivery fee at checkout.
  - When it is actually batched with another order, the group discount is
    CREDITED back to the customer's SB Pay wallet as savings (idempotent).
  - If no compatible order is found within the window, it goes SOLO at the
    full standard price (no discount).
"""
import uuid
import asyncio
import logging
import math
from datetime import datetime, timezone, timedelta

from core.config import db
from core.websocket import manager

logger = logging.getLogger(__name__)

GROUPING_CFG_ID = "default"

# Admin-configurable defaults. discount_pct is "à configurer" → 30% default.
DEFAULT_GROUPING = {
    "id": GROUPING_CFG_ID,
    "enabled": True,
    "discount_pct": 30.0,        # % of the delivery fee credited back when grouped
    "max_batch_size": 3,         # max orders per batch (incl. the first)
    "merchant_radius_km": 1.5,   # merchants within this distance are "same cluster"
    "dropoff_radius_km": 1.2,    # drop-offs within this distance are "near"
    "window_minutes": 8,         # wait this long for a partner before going solo
}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _haversine_km(lat1, lng1, lat2, lng2):
    if None in (lat1, lng1, lat2, lng2):
        return 9999.0
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlng / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


async def get_grouping_config() -> dict:
    cfg = await db.grouping_config.find_one({"id": GROUPING_CFG_ID}, {"_id": 0})
    if not cfg:
        cfg = {**DEFAULT_GROUPING, "updated_at": _now()}
        await db.grouping_config.insert_one(dict(cfg))
    return {**DEFAULT_GROUPING, **cfg}


async def update_grouping_config(body: dict) -> dict:
    update = {"id": GROUPING_CFG_ID, "updated_at": _now()}
    if "enabled" in body:
        update["enabled"] = bool(body["enabled"])
    for k in ("discount_pct", "merchant_radius_km", "dropoff_radius_km"):
        if k in body:
            try:
                update[k] = max(0.0, float(body[k]))
            except (TypeError, ValueError):
                pass
    if "discount_pct" in update:
        update["discount_pct"] = min(update["discount_pct"], 90.0)
    for k in ("max_batch_size", "window_minutes"):
        if k in body:
            try:
                update[k] = max(1, int(body[k]))
            except (TypeError, ValueError):
                pass
    await db.grouping_config.update_one({"id": GROUPING_CFG_ID}, {"$set": update}, upsert=True)
    return await get_grouping_config()


async def _credit_group_savings(user_id: str, amount: float, order_id: str) -> float:
    """Idempotently credit grouped-delivery savings to the SB Pay wallet
    (one credit per order via a unique ledger key)."""
    if not user_id or amount <= 0:
        return 0.0
    amount = round(float(amount), 2)
    try:
        await db.group_savings_ledger.insert_one({
            "id": f"gs_{uuid.uuid4().hex[:12]}",
            "key": f"group:{order_id}",
            "user_id": user_id,
            "order_id": order_id,
            "amount": amount,
            "created_at": _now(),
        })
    except Exception:
        return 0.0  # already credited (unique index on key)
    now = _now()
    await db.wallets.update_one(
        {"user_id": user_id},
        {"$inc": {"balance": amount},
         "$setOnInsert": {"user_id": user_id, "currency": "EUR", "created_at": now}},
        upsert=True,
    )
    w = await db.wallets.find_one({"user_id": user_id}, {"_id": 0})
    await db.wallet_transactions.insert_one({
        "id": f"tx_{uuid.uuid4().hex[:12]}",
        "user_id": user_id,
        "type": "Économie groupée",
        "amount": amount,
        "balance_after": round((w or {}).get("balance", 0), 2),
        "description": "Économie livraison groupée 🌱",
        "service": "grouped_delivery",
        "ref_id": order_id,
        "status": "completed",
        "created_at": now,
    })
    return amount


def optimize_route(orders_with_merchant: list) -> list:
    """Nearest-neighbour multi-stop route: pickups (unique merchants) first,
    then drop-offs. Each stop = {type, order_id, label, lat, lng}."""
    pickups = {}
    dropoffs = []
    for o in orders_with_merchant:
        m = o.get("_merchant") or {}
        mid = o.get("merchant_id")
        if mid and mid not in pickups and m.get("lat") is not None:
            pickups[mid] = {"type": "pickup", "merchant_id": mid,
                            "label": m.get("store_name") or "Commerce",
                            "lat": m.get("lat"), "lng": m.get("lng")}
        dropoffs.append({"type": "dropoff", "order_id": o["id"],
                         "label": (o.get("delivery_address") or "Livraison")[:50],
                         "lat": o.get("delivery_lat"), "lng": o.get("delivery_lng")})

    def _nn(points, start):
        remaining = [p for p in points if p.get("lat") is not None]
        route, cur = [], start
        while remaining:
            i = min(range(len(remaining)),
                    key=lambda j: _haversine_km(cur["lat"], cur["lng"], remaining[j]["lat"], remaining[j]["lng"]))
            cur = remaining.pop(i)
            route.append(cur)
        return route

    pickup_list = list(pickups.values())
    if not pickup_list:
        return _nn(dropoffs, {"lat": dropoffs[0]["lat"], "lng": dropoffs[0]["lng"]}) if dropoffs else []
    ordered_pickups = _nn(pickup_list[1:], pickup_list[0]) if len(pickup_list) > 1 else []
    ordered_pickups = [pickup_list[0]] + ordered_pickups
    last = ordered_pickups[-1]
    ordered_dropoffs = _nn(dropoffs, last)
    return ordered_pickups + ordered_dropoffs


async def _orders_with_merchant(orders: list) -> list:
    mids = list({o.get("merchant_id") for o in orders})
    merchants = {m["id"]: m async for m in db.merchants.find(
        {"id": {"$in": mids}}, {"_id": 0, "id": 1, "lat": 1, "lng": 1, "store_name": 1})}
    for o in orders:
        o["_merchant"] = merchants.get(o.get("merchant_id"), {})
    return orders


def _compatible(a: dict, b: dict, cfg: dict) -> bool:
    ma, mb = a.get("_merchant") or {}, b.get("_merchant") or {}
    if ma.get("lat") is None or mb.get("lat") is None:
        return False
    if _haversine_km(ma["lat"], ma["lng"], mb["lat"], mb["lng"]) > cfg["merchant_radius_km"]:
        return False
    if a.get("delivery_lat") is None or b.get("delivery_lat") is None:
        return False
    if _haversine_km(a["delivery_lat"], a["delivery_lng"],
                     b["delivery_lat"], b["delivery_lng"]) > cfg["dropoff_radius_km"]:
        return False
    return True


async def try_form_batches() -> int:
    """Greedily batch compatible pending grouped orders. Returns batches formed."""
    cfg = await get_grouping_config()
    if not cfg.get("enabled"):
        return 0
    pending = await db.orders.find(
        {"groupable": True, "group_status": "pending", "batch_id": None, "driver_id": None,
         "status": {"$in": ["pending", "accepted", "preparing", "ready"]}},
        {"_id": 0},
    ).sort("created_at", 1).to_list(200)
    if len(pending) < 2:
        return 0
    pending = await _orders_with_merchant(pending)

    used = set()
    batches_formed = 0
    for i, base in enumerate(pending):
        if base["id"] in used:
            continue
        batch = [base]
        for j in range(i + 1, len(pending)):
            cand = pending[j]
            if cand["id"] in used or len(batch) >= cfg["max_batch_size"]:
                continue
            if all(_compatible(member, cand, cfg) for member in batch):
                batch.append(cand)
        if len(batch) < 2:
            continue
        if await _commit_batch(batch, cfg):
            for o in batch:
                used.add(o["id"])
            batches_formed += 1
    return batches_formed


async def _commit_batch(batch: list, cfg: dict) -> bool:
    batch_id = f"batch_{uuid.uuid4().hex[:12]}"
    order_ids = [o["id"] for o in batch]
    # Atomic-ish guard: only claim orders still pending & unbatched.
    res = await db.orders.update_many(
        {"id": {"$in": order_ids}, "group_status": "pending", "batch_id": None},
        {"$set": {"batch_id": batch_id, "group_status": "grouped",
                  "grouped_at": _now()}},
    )
    if res.modified_count < 2:
        # Lost the race for some members → roll back our partial claim.
        await db.orders.update_many(
            {"id": {"$in": order_ids}, "batch_id": batch_id},
            {"$set": {"batch_id": None, "group_status": "pending"}, "$unset": {"grouped_at": ""}},
        )
        return False

    route = optimize_route(batch)
    total_savings = 0.0
    for o in batch:
        fee = float(o.get("delivery_fee") or 0)
        savings = round(fee * cfg["discount_pct"] / 100.0, 2)
        credited = await _credit_group_savings(o["user_id"], savings, o["id"])
        total_savings += credited
        await db.orders.update_one({"id": o["id"]}, {"$set": {"group_savings": credited}})
        try:
            from core.notifications import create_notification
            await create_notification(
                o["user_id"], "grouped_delivery", "Commande groupée 🌱",
                f"Bonne nouvelle ! Votre livraison a été regroupée — vous économisez {credited:.2f} € crédités sur votre SB Pay.",
                data={"url": f"/order/{o['id']}", "amount": credited},
            )
        except Exception:
            pass

    batch_doc = {
        "id": batch_id,
        "order_ids": order_ids,
        "driver_id": None,
        "status": "pending",
        "route": route,
        "size": len(batch),
        "total_savings": round(total_savings, 2),
        "discount_pct": cfg["discount_pct"],
        "ai_summary": None,
        "created_at": _now(),
    }
    await db.delivery_batches.insert_one(dict(batch_doc))
    logger.info("grouped delivery batch %s formed (%d orders, %.2f € saved)",
                batch_id, len(batch), total_savings)
    # Optional AI eco/route summary (non-blocking).
    asyncio.create_task(_ai_batch_summary(batch_id, batch, route))
    return True


async def expire_stale_groupables() -> int:
    """Grouped orders that waited longer than the window without a partner go
    SOLO (full price, standard handling). Returns the count flipped to solo."""
    cfg = await get_grouping_config()
    cutoff = (datetime.now(timezone.utc) - timedelta(minutes=cfg["window_minutes"])).isoformat()
    res = await db.orders.update_many(
        {"groupable": True, "group_status": "pending", "batch_id": None,
         "created_at": {"$lt": cutoff}},
        {"$set": {"group_status": "solo", "group_savings": 0.0}},
    )
    return res.modified_count


async def _ai_batch_summary(batch_id: str, batch: list, route: list):
    """Short French eco/itinerary blurb for the courier (best-effort, Gemini)."""
    import os
    key = os.environ.get("EMERGENT_LLM_KEY", "")
    if not key:
        return
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        stops = " → ".join(f"{s['type']}:{s['label']}" for s in route)
        sys = ("Tu rédiges une note courte (1 phrase, en français) pour un livreur "
               "qui regroupe plusieurs commandes : mentionne le nombre d'arrêts et "
               "le bénéfice (trajet optimisé, moins de CO₂). Pas d'emoji superflu.")
        chat = LlmChat(api_key=key, session_id=f"batch-{batch_id}", system_message=sys).with_model("gemini", "gemini-3-flash-preview")
        txt = await chat.send_message(UserMessage(text=f"{len(batch)} commandes, itinéraire: {stops}"))
        if txt:
            await db.delivery_batches.update_one({"id": batch_id}, {"$set": {"ai_summary": txt.strip()[:200]}})
    except Exception:
        pass


async def grouping_loop():
    """Background loop: form batches + expire stale groupables."""
    await asyncio.sleep(15)
    while True:
        try:
            await try_form_batches()
            await expire_stale_groupables()
        except Exception as e:
            logger.error("grouping_loop error: %s", e)
        await asyncio.sleep(20)
