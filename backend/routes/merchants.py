from fastapi import APIRouter, Request, HTTPException
import uuid
from datetime import datetime, timezone
from zoneinfo import ZoneInfo
from typing import Optional

from core.config import db
from core.deps import get_current_user, calculate_distance
from models.schemas import MerchantCreate, ProductCreate

router = APIRouter(prefix="/merchants", tags=["merchants"])

# Local timezone used to evaluate flash-discount windows.
FLASH_TZ = ZoneInfo("Europe/Paris")


def _flash_is_active(flash: dict, now=None) -> bool:
    """True if a flash discount window is currently open."""
    if not flash or not flash.get("enabled"):
        return False
    try:
        pct = float(flash.get("pct") or 0)
    except (TypeError, ValueError):
        return False
    if pct <= 0:
        return False
    now = now or datetime.now(FLASH_TZ)
    days = flash.get("days") or []
    if days and now.weekday() not in days:
        return False
    start = str(flash.get("start_time") or "")
    end = str(flash.get("end_time") or "")
    if ":" not in start or ":" not in end:
        return False
    cur = now.strftime("%H:%M")
    if start <= end:
        return start <= cur <= end
    # Window crossing midnight (e.g. 22:00 → 02:00)
    return cur >= start or cur <= end


def compute_effective_discount(m: dict):
    """Return (effective_pct, flash_active). Flash overrides base when higher."""
    base = float(m.get("discount_pct") or 0)
    flash = m.get("flash_discount") or {}
    if _flash_is_active(flash):
        fpct = float(flash.get("pct") or 0)
        return (max(base, fpct), True)
    return (base, False)


def _enrich_merchant(m: dict) -> dict:
    """Add client-facing defaults used by the apps (non-breaking)."""
    if m.get("delivery_fee") is None:
        m["delivery_fee"] = 2.5
    if "is_open" not in m:
        m["is_open"] = bool(m.get("is_active", True))
    if "eta_min" not in m:
        m["eta_min"] = 30
    if not m.get("cuisine"):
        m["cuisine"] = _STORE_TYPE_CUISINE.get(m.get("store_type"), "")
    if m.get("discount_pct") is None:
        m["discount_pct"] = 0
    eff, flash_active = compute_effective_discount(m)
    m["effective_discount_pct"] = eff
    m["flash_active"] = flash_active
    return m


_STORE_TYPE_CUISINE = {
    "restaurant": "Cuisine variée",
    "grocery": "Épicerie",
    "florist": "Fleuriste",
    "stationery": "Papeterie",
    "wine": "Cave & Spiritueux",
    "construction": "Bricolage",
}


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


async def _avg_price_map(merchant_ids: list) -> dict:
    """Average product price per merchant → shown as 'prix par personne'."""
    if not merchant_ids:
        return {}
    pipeline = [
        {"$match": {"merchant_id": {"$in": merchant_ids}, "is_available": True}},
        {"$group": {"_id": "$merchant_id", "avg": {"$avg": "$price"}}},
    ]
    out = {}
    async for row in db.products.aggregate(pipeline):
        out[row["_id"]] = round(float(row["avg"]), 2)
    return out


@router.get("")
async def list_merchants(store_type: Optional[str] = None, lat: Optional[float] = None, lng: Optional[float] = None):
    query = {"is_active": True}
    if store_type:
        query["store_type"] = store_type
    merchants = await db.merchants.find(query, {"_id": 0}).to_list(100)
    avg_map = await _avg_price_map([m["id"] for m in merchants])
    for m in merchants:
        _enrich_merchant(m)
        m["price_per_person"] = avg_map.get(m["id"])
    if lat and lng:
        for m in merchants:
            m["distance"] = calculate_distance(lat, lng, m["lat"], m["lng"])
        merchants.sort(key=lambda x: x["distance"])
    return merchants


def validate_flash_discount(raw) -> dict:
    """Sanitize a flash-discount config from request body."""
    if not isinstance(raw, dict):
        return {"enabled": False, "pct": 0, "start_time": "", "end_time": "", "days": []}
    try:
        pct = max(0.0, min(90.0, round(float(raw.get("pct") or 0), 2)))
    except (TypeError, ValueError):
        pct = 0
    days = [d for d in (raw.get("days") or []) if isinstance(d, int) and 0 <= d <= 6]
    return {
        "enabled": bool(raw.get("enabled")),
        "pct": pct,
        "start_time": str(raw.get("start_time") or ""),
        "end_time": str(raw.get("end_time") or ""),
        "days": days,
    }


@router.get("/me")
async def get_my_merchant(request: Request):
    """Current merchant's own storefront (for the merchant settings page)."""
    user = await get_current_user(request)
    m = await db.merchants.find_one({"user_id": user["id"]}, {"_id": 0})
    if not m:
        raise HTTPException(status_code=404, detail="Vous n'êtes pas marchand")
    _enrich_merchant(m)
    return m


@router.put("/me")
async def update_my_merchant(request: Request):
    """Merchant self-service edit of cuisine / discount / delivery settings."""
    user = await get_current_user(request)
    body = await request.json()
    update = {}
    if "cuisine" in body:
        update["cuisine"] = str(body["cuisine"]).strip()
    if "description" in body:
        update["description"] = str(body["description"]).strip()
    if "discount_pct" in body:
        try:
            update["discount_pct"] = max(0.0, min(90.0, round(float(body["discount_pct"]), 2)))
        except (TypeError, ValueError):
            pass
    if "delivery_fee" in body:
        try:
            update["delivery_fee"] = max(0.0, round(float(body["delivery_fee"]), 2))
        except (TypeError, ValueError):
            pass
    if "eta_min" in body:
        try:
            update["eta_min"] = max(1, int(body["eta_min"]))
        except (TypeError, ValueError):
            pass
    if "flash_discount" in body:
        update["flash_discount"] = validate_flash_discount(body["flash_discount"])
    if "image_url" in body:
        update["image_url"] = str(body["image_url"]).strip()
    if "gallery" in body and isinstance(body["gallery"], list):
        update["gallery"] = [str(g) for g in body["gallery"]][:12]
    if not update:
        raise HTTPException(status_code=400, detail="Aucun champ à mettre à jour")
    res = await db.merchants.update_one({"user_id": user["id"]}, {"$set": update})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Vous n'êtes pas marchand")
    m = await db.merchants.find_one({"user_id": user["id"]}, {"_id": 0})
    _enrich_merchant(m)
    return m


@router.get("/{merchant_id}")
async def get_merchant(merchant_id: str):
    merchant = await db.merchants.find_one({"id": merchant_id}, {"_id": 0})
    if not merchant:
        raise HTTPException(status_code=404, detail="Merchant not found")
    _enrich_merchant(merchant)
    avg_map = await _avg_price_map([merchant_id])
    merchant["price_per_person"] = avg_map.get(merchant_id)
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
