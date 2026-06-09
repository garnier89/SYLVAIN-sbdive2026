from fastapi import APIRouter, Request, HTTPException
import uuid
import asyncio
from datetime import datetime, timezone, timedelta
from typing import Optional

from core.config import db
from core.deps import get_current_user, require_role
from models.schemas import OrderCreate, OrderResponse
from core.websocket import manager

router = APIRouter(prefix="/orders", tags=["orders"])

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


async def order_auto_progress_loop():
    """Demo/MVP simulation: advance active food orders through their lifecycle
    (Confirmée → En préparation → Prête → En livraison → Livrée) based on elapsed
    time, so the customer's order tracking reaches delivery without a live
    merchant/driver. Only moves FORWARD and never past what a real actor already set."""
    while True:
        try:
            now = datetime.now(timezone.utc)
            cursor = db.orders.find(
                {"status": {"$in": ["pending", "accepted", "preparing", "ready", "picked_up"]}},
                {"_id": 0, "id": 1, "status": 1, "created_at": 1, "user_id": 1, "payment_method": 1},
            )
            async for o in cursor:
                try:
                    created = datetime.fromisoformat(str(o.get("created_at")).replace("Z", "+00:00"))
                except (ValueError, TypeError):
                    continue
                if created.tzinfo is None:
                    created = created.replace(tzinfo=timezone.utc)
                elapsed = (now - created).total_seconds()
                target = o["status"]
                for status, threshold in DEMO_ORDER_SCHEDULE:
                    if elapsed >= threshold:
                        target = status
                if _STAGE_INDEX.get(target, 0) > _STAGE_INDEX.get(o["status"], 0):
                    update = {"status": target}
                    if target == "delivered":
                        update["payment_status"] = "completed" if o.get("payment_method") != "cash" else "pending"
                    res = await db.orders.update_one({"id": o["id"], "status": o["status"]}, {"$set": update})
                    if res.modified_count:
                        await manager.send_personal_message(
                            {"type": "order_status", "order_id": o["id"], "status": target}, o["user_id"]
                        )
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

    settings = await db.app_config.find_one({"key": "delivery"}, {"_id": 0}) or {}
    commission_percent = float(settings.get("commission_percent", 15.0))
    default_fee = float(settings.get("default_delivery_fee", 2.5))
    delivery_fee = merchant.get("delivery_fee")
    if delivery_fee is None:
        delivery_fee = default_fee
    delivery_fee = float(delivery_fee)
    discount_pct = float(merchant.get("discount_pct") or 0)
    discount = round(subtotal * discount_pct / 100, 2)
    discounted_subtotal = round(subtotal - discount, 2)
    commission = round(discounted_subtotal * commission_percent / 100, 2)
    merchant_payout = round(discounted_subtotal - commission, 2)
    total = round(discounted_subtotal + delivery_fee, 2)
    order = {
        "id": f"order_{uuid.uuid4().hex[:12]}", "user_id": user["id"], "merchant_id": data.merchant_id,
        "driver_id": None, "items": items_with_details, "subtotal": round(subtotal, 2),
        "discount_pct": discount_pct, "discount": discount,
        "delivery_fee": round(delivery_fee, 2), "commission_percent": commission_percent,
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
    orders = await db.orders.find({"status": "ready", "driver_id": None}, {"_id": 0}).sort("created_at", 1).limit(30).to_list(30)
    out = []
    for o in orders:
        m = await db.merchants.find_one({"id": o["merchant_id"]}, {"_id": 0, "store_name": 1, "address": 1, "lat": 1, "lng": 1})
        out.append({
            "id": o["id"],
            "merchant": {"name": (m or {}).get("store_name"), "address": (m or {}).get("address"), "lat": (m or {}).get("lat"), "lng": (m or {}).get("lng")},
            "delivery_address": o.get("delivery_address"), "delivery_lat": o.get("delivery_lat"), "delivery_lng": o.get("delivery_lng"),
            "items_count": sum(int(i.get("quantity", 1)) for i in o.get("items", [])),
            "total": o.get("total"), "earning": o.get("delivery_fee"),
            "created_at": o.get("created_at"),
        })
    return out


@router.get("/driver/active")
async def driver_active_orders(request: Request):
    user = await get_current_user(request)
    driver = await db.drivers.find_one({"user_id": user["id"]})
    if not driver:
        return []
    orders = await db.orders.find(
        {"driver_id": driver["id"], "status": {"$in": ["ready", "picked_up"]}},
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
    doc = await db.app_config.find_one({"key": "delivery"}, {"_id": 0}) or {}
    return {"commission_percent": float(doc.get("commission_percent", 15.0)), "default_delivery_fee": float(doc.get("default_delivery_fee", 2.5))}


@router.put("/admin/delivery-settings")
async def set_delivery_settings(request: Request):
    await require_role(request, ["admin"], permission="server.settings.edit")
    body = await request.json()
    update = {"key": "delivery"}
    if "commission_percent" in body:
        update["commission_percent"] = float(body["commission_percent"])
    if "default_delivery_fee" in body:
        update["default_delivery_fee"] = float(body["default_delivery_fee"])
    await db.app_config.update_one({"key": "delivery"}, {"$set": update}, upsert=True)
    doc = await db.app_config.find_one({"key": "delivery"}, {"_id": 0}) or {}
    return {"commission_percent": float(doc.get("commission_percent", 15.0)), "default_delivery_fee": float(doc.get("default_delivery_fee", 2.5))}


@router.post("/{order_id}/claim")
async def claim_order(order_id: str, request: Request):
    user = await get_current_user(request)
    driver = await db.drivers.find_one({"user_id": user["id"]})
    if not driver:
        raise HTTPException(status_code=403, detail="Not a driver")
    res = await db.orders.update_one(
        {"id": order_id, "driver_id": None, "status": "ready"},
        {"$set": {"driver_id": driver["id"]}},
    )
    if res.modified_count == 0:
        raise HTTPException(status_code=409, detail="Commande déjà prise ou non disponible")
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    await manager.send_personal_message({"type": "order_driver_assigned", "order_id": order_id}, order["user_id"])
    return {"message": "claimed", "order_id": order_id}


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
    await db.orders.update_one({"id": order_id}, {"$set": update_data})
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
