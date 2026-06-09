from fastapi import APIRouter, Request, HTTPException
import uuid
from datetime import datetime, timezone
from zoneinfo import ZoneInfo
from typing import Optional

from core.config import db
from core.deps import get_current_user, calculate_distance
from models.schemas import MerchantCreate, ProductCreate, MerchantReviewCreate

router = APIRouter(prefix="/merchants", tags=["merchants"])

# Local timezone used to evaluate flash-discount windows.
FLASH_TZ = ZoneInfo("Europe/Paris")

# Structured opening-hours keys (Monday-first, matches datetime.weekday()).
DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]

# Structured storefront categories (FR) used across the marketplace.
STOREFRONT_CATEGORIES = [
    "Épiceries", "Boulangeries", "Pharmacies", "Fleuristes", "Boucheries",
    "Poissonneries", "Supermarchés", "Commerces indépendants", "Producteurs locaux",
    "Restaurant", "Autre",
]


def _default_hours_from_legacy(opening_hours: str) -> dict:
    """Build a structured 7-day schedule from a legacy 'HH:MM-HH:MM' string."""
    o, c = "09:00", "22:00"
    if isinstance(opening_hours, str) and "-" in opening_hours:
        parts = opening_hours.replace(" ", "").split("-")
        if len(parts) == 2 and ":" in parts[0] and ":" in parts[1]:
            o, c = parts[0], parts[1]
    return {d: {"closed": False, "slots": [[o, c]]} for d in DAY_KEYS}


def validate_hours(raw) -> Optional[dict]:
    """Sanitize a structured opening-hours config (max 2 slots/day)."""
    if not isinstance(raw, dict):
        return None
    out = {}
    for d in DAY_KEYS:
        day = raw.get(d) or {}
        slots = []
        for s in (day.get("slots") or []):
            if isinstance(s, (list, tuple)) and len(s) == 2:
                o, c = str(s[0]), str(s[1])
                if ":" in o and ":" in c:
                    slots.append([o, c])
        out[d] = {"closed": bool(day.get("closed")), "slots": slots[:2]}
    return out


def _hours_open_now(hours: dict, now=None) -> bool:
    now = now or datetime.now(FLASH_TZ)
    day = (hours or {}).get(DAY_KEYS[now.weekday()]) or {}
    if day.get("closed"):
        return False
    cur = now.strftime("%H:%M")
    for slot in day.get("slots", []):
        if len(slot) == 2 and slot[0] <= cur <= slot[1]:
            return True
    return False


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
    if "eta_min" not in m:
        m["eta_min"] = 30
    if not m.get("cuisine"):
        m["cuisine"] = _STORE_TYPE_CUISINE.get(m.get("store_type"), "")
    if m.get("discount_pct") is None:
        m["discount_pct"] = 0
    if m.get("phone") is None:
        m["phone"] = ""
    if m.get("banner_url") is None:
        m["banner_url"] = ""
    if not m.get("storefront_category"):
        m["storefront_category"] = ""
    if m.get("review_count") is None:
        m["review_count"] = 0
    # Structured hours: backfill from legacy 'opening_hours' string when absent.
    if not isinstance(m.get("hours"), dict):
        m["hours"] = _default_hours_from_legacy(m.get("opening_hours", "09:00-22:00"))
    # Open state: prefer structured hours, fall back to is_active.
    m["is_open"] = _hours_open_now(m["hours"]) if m.get("is_active", True) else False
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
    if "banner_url" in body:
        update["banner_url"] = str(body["banner_url"]).strip()
    if "phone" in body:
        update["phone"] = str(body["phone"]).strip()
    if "storefront_category" in body:
        cat = str(body["storefront_category"]).strip()
        update["storefront_category"] = cat if cat in STOREFRONT_CATEGORIES else cat
    if "hours" in body:
        hrs = validate_hours(body["hours"])
        if hrs is not None:
            update["hours"] = hrs
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


@router.get("/meta/categories")
async def storefront_categories():
    """Structured FR storefront categories used by merchant settings."""
    return {"categories": STOREFRONT_CATEGORIES}


@router.get("/me/stats")
async def my_merchant_stats(request: Request):
    """Mini-stats for the current merchant's dashboard."""
    user = await get_current_user(request)
    merchant = await db.merchants.find_one({"user_id": user["id"]}, {"_id": 0})
    if not merchant:
        raise HTTPException(status_code=404, detail="Vous n'êtes pas marchand")
    mid = merchant["id"]
    orders = await db.orders.find({"merchant_id": mid}, {"_id": 0}).to_list(1000)
    today = datetime.now(FLASH_TZ).date().isoformat()
    delivered = [o for o in orders if o.get("status") == "delivered"]
    pending = [o for o in orders if o.get("status") in ("pending", "accepted", "preparing", "ready")]
    today_orders = [o for o in orders if str(o.get("created_at", ""))[:10] == today]
    revenue = round(sum(float(o.get("total") or 0) for o in delivered), 2)
    today_revenue = round(sum(float(o.get("total") or 0) for o in today_orders if o.get("status") == "delivered"), 2)
    # Top products (by quantity ordered)
    counts = {}
    for o in orders:
        for it in (o.get("items") or []):
            name = it.get("name") or it.get("product_name") or "—"
            counts[name] = counts.get(name, 0) + int(it.get("quantity") or 1)
    top = sorted(counts.items(), key=lambda x: -x[1])[:5]
    products_total = await db.products.count_documents({"merchant_id": mid})
    out_of_stock = await db.products.count_documents({"merchant_id": mid, "stock": {"$lte": 0, "$ne": None}})
    return {
        "total_orders": len(orders),
        "delivered_orders": len(delivered),
        "pending_orders": len(pending),
        "today_orders": len(today_orders),
        "revenue": revenue,
        "today_revenue": today_revenue,
        "rating": round(float(merchant.get("rating") or 5.0), 1),
        "review_count": int(merchant.get("review_count") or 0),
        "products_total": products_total,
        "out_of_stock": out_of_stock,
        "top_products": [{"name": n, "qty": q} for n, q in top],
    }



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


@router.get("/{merchant_id}/reviews")
async def list_merchant_reviews(merchant_id: str):
    """Public list of customer reviews for a storefront."""
    reviews = await db.merchant_reviews.find(
        {"merchant_id": merchant_id}, {"_id": 0}
    ).sort("created_at", -1).limit(100).to_list(100)
    return reviews


@router.post("/{merchant_id}/reviews")
async def add_merchant_review(merchant_id: str, data: MerchantReviewCreate, request: Request):
    """Add a review — restricted to customers with a completed order from this merchant."""
    user = await get_current_user(request)
    merchant = await db.merchants.find_one({"id": merchant_id})
    if not merchant:
        raise HTTPException(status_code=404, detail="Boutique introuvable")
    rating = max(1, min(5, int(data.rating)))
    eligible = await db.orders.find_one({
        "merchant_id": merchant_id, "user_id": user["id"],
        "status": {"$in": ["delivered", "completed"]},
    })
    if not eligible:
        raise HTTPException(status_code=403, detail="Seuls les clients ayant commandé peuvent laisser un avis")
    review = {
        "id": f"mrev_{uuid.uuid4().hex[:12]}",
        "merchant_id": merchant_id,
        "user_id": user["id"],
        "user_name": user.get("name") or "Client",
        "rating": rating,
        "comment": (data.comment or "").strip()[:600],
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    # One review per customer per merchant — upsert keeps it fresh.
    await db.merchant_reviews.update_one(
        {"merchant_id": merchant_id, "user_id": user["id"]},
        {"$set": review}, upsert=True,
    )
    # Recompute merchant aggregate rating + count.
    agg = await db.merchant_reviews.aggregate([
        {"$match": {"merchant_id": merchant_id}},
        {"$group": {"_id": None, "avg": {"$avg": "$rating"}, "n": {"$sum": 1}}},
    ]).to_list(1)
    if agg:
        await db.merchants.update_one(
            {"id": merchant_id},
            {"$set": {"rating": round(float(agg[0]["avg"]), 1), "review_count": int(agg[0]["n"])}},
        )
    return review


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
