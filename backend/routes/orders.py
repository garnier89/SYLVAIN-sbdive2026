from fastapi import APIRouter, Request, HTTPException
import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional

from core.config import db
from core.deps import get_current_user
from models.schemas import OrderCreate, OrderResponse
from core.websocket import manager

router = APIRouter(prefix="/orders", tags=["orders"])


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

    delivery_fee = 2.50
    total = subtotal + delivery_fee
    order = {
        "id": f"order_{uuid.uuid4().hex[:12]}", "user_id": user["id"], "merchant_id": data.merchant_id,
        "driver_id": None, "items": items_with_details, "subtotal": round(subtotal, 2),
        "delivery_fee": delivery_fee, "total": round(total, 2), "order_type": data.order_type,
        "status": "pending", "delivery_address": data.delivery_address,
        "delivery_lat": data.delivery_lat, "delivery_lng": data.delivery_lng,
        "payment_method": data.payment_method, "payment_status": "pending",
        "special_instructions": data.special_instructions,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "estimated_delivery": (datetime.now(timezone.utc) + timedelta(minutes=45)).isoformat()
    }
    await db.orders.insert_one(order)
    order.pop("_id", None)
    order["created_at"] = datetime.fromisoformat(order["created_at"])
    order["estimated_delivery"] = datetime.fromisoformat(order["estimated_delivery"])
    return OrderResponse(**order)


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
