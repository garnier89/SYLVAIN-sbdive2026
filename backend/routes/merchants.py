from fastapi import APIRouter, Request, HTTPException
import uuid
from datetime import datetime, timezone
from typing import Optional

from core.config import db
from core.deps import get_current_user, calculate_distance
from models.schemas import MerchantCreate, ProductCreate

router = APIRouter(prefix="/merchants", tags=["merchants"])


@router.post("/register")
async def register_merchant(data: MerchantCreate, request: Request):
    user = await get_current_user(request)
    existing = await db.merchants.find_one({"user_id": user["id"]})
    if existing:
        raise HTTPException(status_code=400, detail="Already registered as merchant")

    merchant = {
        "id": f"merchant_{uuid.uuid4().hex[:12]}",
        "user_id": user["id"],
        "store_name": data.store_name, "store_type": data.store_type,
        "address": data.address, "lat": data.lat, "lng": data.lng,
        "description": data.description, "rating": 5.0, "total_orders": 0,
        "is_active": True, "opening_hours": "09:00-22:00", "image_url": None,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.merchants.insert_one(merchant)
    await db.users.update_one({"id": user["id"]}, {"$set": {"role": "merchant"}})
    merchant.pop("_id", None)
    return merchant


@router.get("")
async def list_merchants(store_type: Optional[str] = None, lat: Optional[float] = None, lng: Optional[float] = None):
    query = {"is_active": True}
    if store_type:
        query["store_type"] = store_type
    merchants = await db.merchants.find(query, {"_id": 0}).to_list(100)
    if lat and lng:
        for m in merchants:
            m["distance"] = calculate_distance(lat, lng, m["lat"], m["lng"])
        merchants.sort(key=lambda x: x["distance"])
    return merchants


@router.get("/{merchant_id}")
async def get_merchant(merchant_id: str):
    merchant = await db.merchants.find_one({"id": merchant_id}, {"_id": 0})
    if not merchant:
        raise HTTPException(status_code=404, detail="Merchant not found")
    return merchant


@router.get("/{merchant_id}/products")
async def get_merchant_products(merchant_id: str):
    products = await db.products.find({"merchant_id": merchant_id, "is_available": True}, {"_id": 0}).sort("created_at", -1).limit(100).to_list(100)
    return products


@router.post("/products")
async def add_product(data: ProductCreate, request: Request):
    user = await get_current_user(request)
    merchant = await db.merchants.find_one({"user_id": user["id"]})
    if not merchant:
        raise HTTPException(status_code=403, detail="Not a merchant")
    product = {
        "id": f"prod_{uuid.uuid4().hex[:12]}", "merchant_id": merchant["id"],
        **data.model_dump(), "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.products.insert_one(product)
    product.pop("_id", None)
    return product


@router.put("/products/{product_id}")
async def update_product(product_id: str, data: ProductCreate, request: Request):
    user = await get_current_user(request)
    merchant = await db.merchants.find_one({"user_id": user["id"]})
    if not merchant:
        raise HTTPException(status_code=403, detail="Not a merchant")
    result = await db.products.update_one({"id": product_id, "merchant_id": merchant["id"]}, {"$set": data.model_dump()})
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Product not found")
    return {"message": "Product updated"}


@router.delete("/products/{product_id}")
async def delete_product(product_id: str, request: Request):
    user = await get_current_user(request)
    merchant = await db.merchants.find_one({"user_id": user["id"]})
    if not merchant:
        raise HTTPException(status_code=403, detail="Not a merchant")
    result = await db.products.delete_one({"id": product_id, "merchant_id": merchant["id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Product not found")
    return {"message": "Product deleted"}
