from fastapi import APIRouter, Request, HTTPException
import uuid
import asyncio
import math
from datetime import datetime, timezone, timedelta
from typing import Optional

from core.config import db
from core.deps import get_current_user, require_role
from models.schemas import OrderCreate, OrderResponse
from core.websocket import manager

router = APIRouter(prefix="/orders", tags=["orders"])

# Default delivery-speed surcharges (EUR) — overridable via admin delivery-settings.
DELIVERY_DEFAULTS = {
    "commission_percent": 15.0,
    "default_delivery_fee": 2.5,
    "express_surcharge": 3.0,
    "priority_surcharge": 2.0,
    "dispatch_radius_km": 5.0,
}


async def _delivery_settings() -> dict:
    doc = await db.app_config.find_one({"key": "delivery"}, {"_id": 0}) or {}
    return {**DELIVERY_DEFAULTS, **{k: v for k, v in doc.items() if k != "key"}}


def _speed_surcharge(speed: str, cfg: dict) -> float:
    if speed == "express":
        return float(cfg.get("express_surcharge", 3.0))
    if speed == "priority":
        return float(cfg.get("priority_surcharge", 2.0))
    return 0.0


def _haversine_km(lat1, lng1, lat2, lng2):
    if None in (lat1, lng1, lat2, lng2):
        return 9999
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlng / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


async def _nearby_delivery_drivers(lat, lng, radius_km):
    """Online, approved drivers offering 'delivery' service within radius (nearest first)."""
    cursor = db.drivers.find(
        {"status": "approved", "is_online": True},
        {"_id": 0, "user_id": 1, "current_lat": 1, "current_lng": 1, "service_types": 1},
    )
    out = []
    async for d in cursor:
        svc = d.get("service_types") or ["taxi", "delivery"]
        if "delivery" not in svc:
            continue
        loc = manager.get_driver_location(d["user_id"]) or {}
        dlat = loc.get("lat", d.get("current_lat"))
        dlng = loc.get("lng", d.get("current_lng"))
        if dlat is None or dlng is None:
            continue
        dist = _haversine_km(lat, lng, dlat, dlng)
        if dist <= radius_km:
            out.append((dist, d["user_id"]))
    out.sort(key=lambda x: x[0])
    return [uid for _, uid in out]


def _is_dispatchable(o: dict) -> bool:
    """An order is offered to couriers when there's no driver yet and it's ready
    (express/priority orders are lined up earlier, from 'accepted')."""
    if o.get("driver_id"):
        return False
    speed = o.get("delivery_speed", "standard")
    if speed in ("express", "priority"):
        return o.get("status") in ("accepted", "preparing", "ready")
    return o.get("status") == "ready"


# ── Food order lifecycle simulation ──
# Stages a meal order moves through, with the elapsed-time (seconds since the
# order was placed) at which it auto-advances. This lets the customer's tracking
# screen progress all the way to delivery even when no live merchant/driver is
# processing the order (MVP/demo). Tune these to change the perceived pace.
ORDER_STAGES = ["pending", "accepted", "preparing", "ready", "picked_up", "delivered"]
_STAGE_INDEX = {s: i for i, s in enumerate(ORDER_STAGES)}
DEMO_ORDER_SCHEDULE = [
    ("accepted", 20),     # Confirmée — 20 s
    ("preparing", 50),    # En préparation — 50 s
    ("ready", 110),       # Prête — ~2 min
    ("picked_up", 180),   # En livraison — 3 min
    ("delivered", 300),   # Livrée — 5 min
]
ORDER_DELIVERED_SEC = DEMO_ORDER_SCHEDULE[-1][1]


async def _broadcast_delivery_offers(now):
    """Notify nearby online courier drivers about dispatchable orders (once each).
    Priority/express orders are offered earlier and flagged so the driver app can
    surface them first."""
    cfg = await _delivery_settings()
    radius = float(cfg.get("dispatch_radius_km", 5.0))
    cursor = db.orders.find(
        {"driver_id": None, "status": {"$in": ["accepted", "preparing", "ready"]}, "dispatch_notified": {"$ne": True}},
        {"_id": 0},
    )
    async for o in cursor:
        if not _is_dispatchable(o):
            continue
        merchant = await db.merchants.find_one({"id": o.get("merchant_id")}, {"_id": 0, "lat": 1, "lng": 1, "store_name": 1})
        if not merchant:
            continue
        drivers = await _nearby_delivery_drivers(merchant.get("lat"), merchant.get("lng"), radius)
        payload = {
            "type": "new_delivery_offer",
            "order_id": o["id"],
            "merchant_name": merchant.get("store_name"),
            "earning": o.get("delivery_fee"),
            "total": o.get("total"),
            "delivery_speed": o.get("delivery_speed", "standard"),
            "priority": bool(o.get("priority")),
        }
        for uid in drivers[:10]:
            await manager.send_personal_message(payload, uid)
        await db.orders.update_one(
            {"id": o["id"]},
            {"$set": {"dispatch_notified": True, "dispatch_notified_at": now.isoformat(), "dispatch_drivers_count": len(drivers)}},
        )


async def order_auto_progress_loop():
    """Demo/MVP simulation: advance active food orders through their lifecycle
    based on elapsed time so the customer's tracking reaches delivery even with no
    live actor. Real drivers take over once they claim: when a driver is assigned,
    the loop stops at 'ready' and lets the driver control picked_up/delivered.
    Scheduled orders stay pending until their scheduled time."""
    while True:
        try:
            now = datetime.now(timezone.utc)
            cursor = db.orders.find(
                {"status": {"$in": ["pending", "accepted", "preparing", "ready", "picked_up"]}},
                {"_id": 0, "id": 1, "status": 1, "created_at": 1, "user_id": 1, "payment_method": 1,
                 "driver_id": 1, "delivery_speed": 1, "scheduled_at": 1},
            )
            async for o in cursor:
                # Scheduled orders: hold until their scheduled time, then progress from there.
                ref_iso = o.get("created_at")
                if o.get("delivery_speed") == "scheduled" and o.get("scheduled_at"):
                    ref_iso = o.get("scheduled_at")
                try:
                    ref = datetime.fromisoformat(str(ref_iso).replace("Z", "+00:00"))
                except (ValueError, TypeError):
                    continue
                if ref.tzinfo is None:
                    ref = ref.replace(tzinfo=timezone.utc)
                elapsed = (now - ref).total_seconds()
                if elapsed < 0:
                    continue  # scheduled in the future — stays pending
                target = o["status"]
                for status, threshold in DEMO_ORDER_SCHEDULE:
                    if elapsed >= threshold:
                        target = status
                # A claimed order is driver-controlled past 'ready'.
                if o.get("driver_id") and _STAGE_INDEX.get(target, 0) > _STAGE_INDEX["ready"]:
                    target = "ready"
                if _STAGE_INDEX.get(target, 0) > _STAGE_INDEX.get(o["status"], 0):
                    update = {"status": target}
                    if target == "delivered":
                        update["payment_status"] = "completed" if o.get("payment_method") != "cash" else "pending"
                    res = await db.orders.update_one({"id": o["id"], "status": o["status"]}, {"$set": update})
                    if res.modified_count:
                        await manager.send_personal_message(
                            {"type": "order_status", "order_id": o["id"], "status": target}, o["user_id"]
                        )
            await _broadcast_delivery_offers(now)
        except Exception:
            pass
        await asyncio.sleep(10)


@router.post("", response_model=OrderResponse)
async def create_order(data: OrderCreate, request: Request):
    user = await get_current_user(request)
    merchant = await db.merchants.find_one({"id": data.merchant_id}, {"_id": 0})
    if not merchant:
        raise HTTPException(status_code=404, detail="Merchant not found")

    items_with_details = []
    subtotal = 0.0
    for item in data.items:
        product = await db.products.find_one({"id": item.product_id}, {"_id": 0})
        if not product:
            raise HTTPException(status_code=404, detail=f"Product {item.product_id} not found")
        item_total = product["price"] * item.quantity
        subtotal += item_total
        items_with_details.append({"product_id": item.product_id, "name": product["name"], "price": product["price"], "quantity": item.quantity, "total": item_total})

    settings = await _delivery_settings()
    commission_percent = float(settings.get("commission_percent", 15.0))
    default_fee = float(settings.get("default_delivery_fee", 2.5))
    base_delivery_fee = merchant.get("delivery_fee")
    if base_delivery_fee is None:
        base_delivery_fee = default_fee
    base_delivery_fee = float(base_delivery_fee)
    speed = data.delivery_speed if data.delivery_speed in ("standard", "express", "priority", "scheduled", "grouped") else "standard"
    surcharge = _speed_surcharge(speed, settings)
    delivery_fee = round(base_delivery_fee + surcharge, 2)
    is_grouped = speed == "grouped"
    from routes.merchants import compute_effective_discount
    discount_pct, _flash = compute_effective_discount(merchant)
    discount = round(subtotal * discount_pct / 100, 2)
    discounted_subtotal = round(subtotal - discount, 2)
    commission = round(discounted_subtotal * commission_percent / 100, 2)
    merchant_payout = round(discounted_subtotal - commission, 2)
    total = round(discounted_subtotal + delivery_fee, 2)
    order = {
        "id": f"order_{uuid.uuid4().hex[:12]}", "user_id": user["id"], "merchant_id": data.merchant_id,
        "driver_id": None, "items": items_with_details, "subtotal": round(subtotal, 2),
        "discount_pct": discount_pct, "discount": discount,
        "delivery_fee": delivery_fee, "delivery_speed": speed,
        "delivery_surcharge": surcharge, "priority": speed in ("express", "priority"),
        "groupable": is_grouped,
        "group_status": "pending" if is_grouped else None,
        "batch_id": None,
        "group_savings": 0.0,
        "scheduled_at": data.scheduled_at if speed == "scheduled" else None,
        "commission_percent": commission_percent,
        "commission": commission, "merchant_payout": merchant_payout,
        "total": round(total, 2), "order_type": data.order_type or "food",
        "status": "pending", "delivery_address": data.delivery_address,
        "delivery_lat": data.delivery_lat, "delivery_lng": data.delivery_lng,
        "payment_method": data.payment_method, "payment_status": "pending",
        "special_instructions": data.special_instructions,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "estimated_delivery": (datetime.now(timezone.utc) + timedelta(seconds=ORDER_DELIVERED_SEC)).isoformat()
    }
    await db.orders.insert_one(order)
    # Notify the merchant of the incoming order (live dashboard)
    if merchant.get("user_id"):
        await manager.send_personal_message(
            {"type": "new_order", "order_id": order["id"], "total": order["total"]},
            merchant["user_id"],
        )
    order.pop("_id", None)
    order["created_at"] = datetime.fromisoformat(order["created_at"])
    order["estimated_delivery"] = datetime.fromisoformat(order["estimated_delivery"])
    return OrderResponse(**order)


# ── Driver food-delivery jobs + live tracking + admin settings ──
# (defined before "/{order_id}" so the static paths are not captured by the dynamic route)

@router.get("/available-deliveries")
async def available_deliveries(request: Request):
    user = await get_current_user(request)
    if user["role"] != "driver":
        raise HTTPException(status_code=403, detail="Drivers only")
    # Only "delivery" (livreur) drivers receive delivery orders
    driver = await db.drivers.find_one({"user_id": user["id"]}, {"_id": 0, "service_types": 1})
    svc = (driver or {}).get("service_types") or ["taxi", "delivery"]
    if "delivery" not in svc:
        return []
    # Dispatchable = ready (all speeds) + express/priority lined up from 'accepted'.
    raw = await db.orders.find(
        {"driver_id": None, "status": {"$in": ["accepted", "preparing", "ready"]}},
        {"_id": 0},
    ).sort("created_at", 1).limit(60).to_list(60)
    orders = [o for o in raw if _is_dispatchable(o)]
    # Priority/express first, then oldest first.
    orders.sort(key=lambda o: (0 if o.get("priority") else 1, o.get("created_at")))
    out = []
    for o in orders[:30]:
        m = await db.merchants.find_one({"id": o["merchant_id"]}, {"_id": 0, "store_name": 1, "address": 1, "lat": 1, "lng": 1})
        out.append({
            "id": o["id"],
            "merchant": {"name": (m or {}).get("store_name"), "address": (m or {}).get("address"), "lat": (m or {}).get("lat"), "lng": (m or {}).get("lng")},
            "delivery_address": o.get("delivery_address"), "delivery_lat": o.get("delivery_lat"), "delivery_lng": o.get("delivery_lng"),
            "items_count": sum(int(i.get("quantity", 1)) for i in o.get("items", [])),
            "total": o.get("total"), "earning": o.get("delivery_fee"),
            "delivery_speed": o.get("delivery_speed", "standard"), "priority": bool(o.get("priority")),
            "batch_id": o.get("batch_id"), "grouped": o.get("group_status") == "grouped",
            "status": o.get("status"), "created_at": o.get("created_at"),
        })
    return out


@router.get("/driver/active")
async def driver_active_orders(request: Request):
    user = await get_current_user(request)
    driver = await db.drivers.find_one({"user_id": user["id"]})
    if not driver:
        return []
    orders = await db.orders.find(
        {"driver_id": driver["id"], "status": {"$in": ["accepted", "preparing", "ready", "picked_up"]}},
        {"_id": 0},
    ).sort("created_at", -1).to_list(30)
    for o in orders:
        m = await db.merchants.find_one({"id": o["merchant_id"]}, {"_id": 0, "store_name": 1, "address": 1})
        o["merchant_name"] = (m or {}).get("store_name")
        o["merchant_address"] = (m or {}).get("address")
    return orders


@router.get("/admin/delivery-settings")
async def get_delivery_settings(request: Request):
    await require_role(request, ["admin", "dispatcher"], permission="server.settings.edit")
    return await _delivery_settings()


@router.put("/admin/delivery-settings")
async def set_delivery_settings(request: Request):
    await require_role(request, ["admin"], permission="server.settings.edit")
    body = await request.json()
    update = {"key": "delivery"}
    for k in ("commission_percent", "default_delivery_fee", "express_surcharge", "priority_surcharge", "dispatch_radius_km"):
        if k in body:
            try:
                update[k] = float(body[k])
            except (TypeError, ValueError):
                pass
    await db.app_config.update_one({"key": "delivery"}, {"$set": update}, upsert=True)
    return await _delivery_settings()


@router.get("/delivery-options")
async def delivery_options(request: Request):
    """Public delivery-speed options + current surcharges for the checkout."""
    await get_current_user(request)
    cfg = await _delivery_settings()
    from core.grouping import get_grouping_config
    gcfg = await get_grouping_config()
    options = [
        {"id": "standard", "label": "Standard", "surcharge": 0.0, "desc": "Livraison classique"},
        {"id": "express", "label": "Express", "surcharge": float(cfg["express_surcharge"]), "desc": "Plus rapide, dispatch immédiat"},
        {"id": "priority", "label": "Prioritaire", "surcharge": float(cfg["priority_surcharge"]), "desc": "En tête de file des livreurs"},
        {"id": "scheduled", "label": "Programmée", "surcharge": 0.0, "desc": "Choisissez date et heure"},
    ]
    if gcfg.get("enabled"):
        options.insert(1, {
            "id": "grouped", "label": "Groupée 🌱", "surcharge": 0.0,
            "desc": f"Partagée avec une commande proche · jusqu'à -{gcfg['discount_pct']:.0f}% remboursés",
            "group_discount_pct": gcfg["discount_pct"],
        })
    return {"options": options}


@router.post("/{order_id}/claim")
async def claim_order(order_id: str, request: Request):
    user = await get_current_user(request)
    driver = await db.drivers.find_one({"user_id": user["id"]})
    if not driver:
        raise HTTPException(status_code=403, detail="Not a driver")
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order or not _is_dispatchable(order):
        raise HTTPException(status_code=409, detail="Commande déjà prise ou non disponible")
    res = await db.orders.update_one(
        {"id": order_id, "driver_id": None},
        {"$set": {"driver_id": driver["id"]}},
    )
    if res.modified_count == 0:
        raise HTTPException(status_code=409, detail="Commande déjà prise ou non disponible")
    await manager.send_personal_message({"type": "order_driver_assigned", "order_id": order_id}, order["user_id"])

    # Grouped delivery: claiming one order of a batch assigns the whole batch to
    # this courier (single courier delivers several → optimized route).
    claimed_batch = None
    if order.get("batch_id"):
        sibs = await db.orders.update_many(
            {"batch_id": order["batch_id"], "driver_id": None},
            {"$set": {"driver_id": driver["id"]}},
        )
        await db.delivery_batches.update_one(
            {"id": order["batch_id"]},
            {"$set": {"driver_id": driver["id"], "status": "assigned"}},
        )
        claimed_batch = order["batch_id"]
        if sibs.modified_count:
            batch_doc = await db.delivery_batches.find_one({"id": order["batch_id"]}, {"_id": 0, "order_ids": 1})
            for oid in (batch_doc or {}).get("order_ids", []):
                o2 = await db.orders.find_one({"id": oid}, {"_id": 0, "user_id": 1})
                if o2:
                    await manager.send_personal_message({"type": "order_driver_assigned", "order_id": oid}, o2["user_id"])
    return {"message": "claimed", "order_id": order_id, "batch_id": claimed_batch}


@router.get("/batch/{batch_id}")
async def get_delivery_batch(batch_id: str, request: Request):
    """Optimized multi-stop route + orders for a grouped-delivery batch."""
    await get_current_user(request)
    batch = await db.delivery_batches.find_one({"id": batch_id}, {"_id": 0})
    if not batch:
        raise HTTPException(status_code=404, detail="Lot introuvable")
    orders = await db.orders.find({"id": {"$in": batch.get("order_ids", [])}}, {"_id": 0}).to_list(20)
    for o in orders:
        m = await db.merchants.find_one({"id": o["merchant_id"]}, {"_id": 0, "store_name": 1, "address": 1})
        o["merchant_name"] = (m or {}).get("store_name")
        o["merchant_address"] = (m or {}).get("address")
    batch["orders"] = orders
    return batch


@router.get("/admin/grouping-config")
async def get_grouping_config_admin(request: Request):
    await require_role(request, ["admin", "dispatcher"], permission="server.settings.edit")
    from core.grouping import get_grouping_config
    return await get_grouping_config()


@router.put("/admin/grouping-config")
async def set_grouping_config_admin(request: Request):
    await require_role(request, ["admin"], permission="server.settings.edit")
    body = await request.json()
    from core.grouping import update_grouping_config
    return await update_grouping_config(body)


@router.get("/{order_id}/track")
async def track_order(order_id: str, request: Request):
    await get_current_user(request)
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    merchant = await db.merchants.find_one({"id": order["merchant_id"]}, {"_id": 0})
    driver_info = None
    if order.get("driver_id"):
        drv = await db.drivers.find_one({"id": order["driver_id"]}, {"_id": 0})
        if drv:
            loc = manager.get_driver_location(drv["user_id"]) or {}
            lat = loc.get("lat", drv.get("current_lat"))
            lng = loc.get("lng", drv.get("current_lng"))
            du = await db.users.find_one({"id": drv["user_id"]}, {"_id": 0, "name": 1, "phone": 1})
            driver_info = {"name": (du or {}).get("name"), "phone": (du or {}).get("phone"), "lat": lat, "lng": lng}
    return {
        "order_id": order_id, "status": order["status"],
        "merchant": {"name": (merchant or {}).get("store_name"), "lat": (merchant or {}).get("lat"), "lng": (merchant or {}).get("lng"), "address": (merchant or {}).get("address")},
        "delivery": {"address": order.get("delivery_address"), "lat": order.get("delivery_lat"), "lng": order.get("delivery_lng")},
        "driver": driver_info,
        "estimated_delivery": order.get("estimated_delivery"),
    }


@router.get("/{order_id}")
async def get_order(order_id: str, request: Request):
    user = await get_current_user(request)
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order["user_id"] != user["id"] and user["role"] not in ["admin", "dispatcher", "merchant"]:
        merchant = await db.merchants.find_one({"user_id": user["id"]})
        if not merchant or merchant["id"] != order["merchant_id"]:
            raise HTTPException(status_code=403, detail="Access denied")
    return order


@router.post("/{order_id}/status")
async def update_order_status(order_id: str, request: Request):
    user = await get_current_user(request)
    body = await request.json()
    new_status = body.get("status")
    valid_statuses = ["accepted", "preparing", "ready", "picked_up", "delivered", "cancelled"]
    if new_status not in valid_statuses:
        raise HTTPException(status_code=400, detail="Invalid status")
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    allowed = False
    if user["role"] in ["admin", "dispatcher"]:
        allowed = True
    elif user["role"] == "merchant":
        merchant = await db.merchants.find_one({"user_id": user["id"]})
        if merchant and merchant["id"] == order["merchant_id"]:
            allowed = True
    elif user["role"] == "driver":
        driver = await db.drivers.find_one({"user_id": user["id"]})
        if driver and order.get("driver_id") == driver["id"]:
            allowed = True
    if not allowed:
        raise HTTPException(status_code=403, detail="Not authorized")

    update_data = {"status": new_status}
    if new_status == "delivered":
        update_data["payment_status"] = "completed" if order["payment_method"] != "cash" else "pending"
        from core.cashback import award_cashback
        cb = await award_cashback(order["user_id"], order.get("total", 0), order.get("payment_method", ""), "order", ref_id=order_id, label="Cashback commande")
        if cb > 0:
            update_data["cashback_earned"] = cb
    await db.orders.update_one({"id": order_id}, {"$set": update_data})
    if new_status == "delivered" and not order.get("loyalty_awarded"):
        await db.orders.update_one({"id": order_id}, {"$set": {"loyalty_awarded": True}})
        try:
            from routes.loyalty import award_completion_points
            await award_completion_points(order["user_id"], "order")
        except Exception:
            pass
    await manager.send_personal_message({"type": "order_status", "order_id": order_id, "status": new_status}, order["user_id"])
    return {"message": f"Status updated to {new_status}"}


@router.post("/{order_id}/assign-driver")
async def assign_driver_to_order(order_id: str, request: Request):
    from core.deps import require_role
    await require_role(request, ["admin", "dispatcher"], permission="dispatch.assign")
    body = await request.json()
    driver_id = body.get("driver_id")
    driver = await db.drivers.find_one({"id": driver_id})
    if not driver:
        raise HTTPException(status_code=404, detail="Driver not found")
    result = await db.orders.update_one({"id": order_id}, {"$set": {"driver_id": driver_id}})
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Order not found")
    return {"message": "Driver assigned"}


@router.get("")
async def list_orders(request: Request, status: Optional[str] = None, limit: int = 20):
    user = await get_current_user(request)
    query = {}
    if user["role"] == "user":
        query["user_id"] = user["id"]
    elif user["role"] == "merchant":
        merchant = await db.merchants.find_one({"user_id": user["id"]})
        if merchant:
            query["merchant_id"] = merchant["id"]
    elif user["role"] == "driver":
        driver = await db.drivers.find_one({"user_id": user["id"]})
        if driver:
            query["driver_id"] = driver["id"]
    if status:
        query["status"] = status
    orders = await db.orders.find(query, {"_id": 0}).sort("created_at", -1).limit(limit).to_list(limit)
    return orders


@router.post("/{order_id}/rate")
async def rate_order(order_id: str, request: Request):
    user = await get_current_user(request)
    body = await request.json()
    order = await db.orders.find_one({"id": order_id, "user_id": user["id"], "status": "delivered"})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found or not delivered")
    rating = {
        "id": f"rating_{uuid.uuid4().hex[:12]}", "user_id": user["id"], "merchant_id": order["merchant_id"],
        "order_id": order_id, "rating": max(1, min(5, body.get("rating", 5))),
        "comment": body.get("comment"), "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.ratings.insert_one(rating)
    pipeline = [{"$match": {"merchant_id": order["merchant_id"]}}, {"$group": {"_id": None, "avg": {"$avg": "$rating"}}}]
    result = await db.ratings.aggregate(pipeline).to_list(1)
    avg = result[0]["avg"] if result else 5.0
    await db.merchants.update_one({"id": order["merchant_id"]}, {"$set": {"rating": round(avg, 2)}})
    return {"message": "Rating submitted"}
