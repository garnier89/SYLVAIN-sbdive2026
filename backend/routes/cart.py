from fastapi import APIRouter, Request
from datetime import datetime, timezone

from core.config import db
from core.deps import get_current_user

router = APIRouter(prefix="/cart", tags=["cart"])


@router.get("")
async def get_cart(request: Request):
    user = await get_current_user(request)
    cart = await db.carts.find_one({"user_id": user["id"]}, {"_id": 0})
    if not cart:
        return {"user_id": user["id"], "merchant_id": None, "items": [], "updated_at": None}
    return cart


@router.put("")
async def save_cart(request: Request):
    user = await get_current_user(request)
    body = await request.json()
    merchant_id = body.get("merchant_id")
    items = body.get("items", [])

    if not items:
        await db.carts.delete_one({"user_id": user["id"]})
        return {"user_id": user["id"], "merchant_id": None, "items": [], "updated_at": None}

    cart_doc = {
        "user_id": user["id"],
        "merchant_id": merchant_id,
        "items": items,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.carts.update_one(
        {"user_id": user["id"]},
        {"$set": cart_doc},
        upsert=True,
    )
    return cart_doc


@router.delete("")
async def clear_cart(request: Request):
    user = await get_current_user(request)
    await db.carts.delete_one({"user_id": user["id"]})
    return {"message": "Cart cleared"}
