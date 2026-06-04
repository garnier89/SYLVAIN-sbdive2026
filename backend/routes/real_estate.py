"""
Buy, Sell & Rent Real Estate (V3Cube classifieds model).
Users post property listings (sale/rent · residential/commercial/land),
others browse/filter and contact the owner (call or in-app inquiry/offer).
App owner monetises via paid "featured" plans (admin-managed).
"""
from fastapi import APIRouter, Request, HTTPException
import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional, List
from pydantic import BaseModel, Field

from core.config import db
from core.deps import get_current_user
from core.websocket import manager

router = APIRouter(prefix="/real-estate", tags=["real-estate"])

LISTING_TYPES = {"sale", "rent"}
CATEGORIES = {"residential", "commercial", "land"}
STATUSES = {"active", "sold", "rented", "inactive"}


async def _expire_featured():
    """Auto-expire boosted listings whose featured_until has passed."""
    now = datetime.now(timezone.utc).isoformat()
    await db.property_listings.update_many(
        {"is_featured": True, "featured_until": {"$ne": None, "$lt": now}},
        {"$set": {"is_featured": False, "featured_priority": 0}},
    )


class ListingCreate(BaseModel):
    listing_type: str  # sale | rent
    category: str      # residential | commercial | land
    title: str = Field(..., min_length=3)
    description: Optional[str] = ""
    price: float = Field(..., ge=0)
    rent_period: Optional[str] = None  # month | week | day (rent only)
    property_subtype: Optional[str] = None  # apartment, house, villa, office, shop, plot...
    bedrooms: Optional[int] = None
    bathrooms: Optional[int] = None
    area_sqm: Optional[float] = None
    furnished: Optional[bool] = None
    amenities: List[str] = []
    images: List[str] = []  # base64 data URLs or remote URLs
    address: Optional[str] = None
    city: Optional[str] = None
    country: Optional[str] = None  # country code/key, e.g. FR, MQ, GP, GF
    lat: Optional[float] = None
    lng: Optional[float] = None
    owner_name: Optional[str] = None
    owner_phone: Optional[str] = None


class InquiryCreate(BaseModel):
    message: Optional[str] = ""
    offer_amount: Optional[float] = None
    contact_phone: Optional[str] = None


def _validate(data: ListingCreate):
    if data.listing_type not in LISTING_TYPES:
        raise HTTPException(status_code=400, detail="Type d'annonce invalide")
    if data.category not in CATEGORIES:
        raise HTTPException(status_code=400, detail="Catégorie invalide")


@router.get("/listings")
async def list_listings(
    request: Request,
    listing_type: Optional[str] = None,
    category: Optional[str] = None,
    q: Optional[str] = None,
    min_price: Optional[float] = None,
    max_price: Optional[float] = None,
    city: Optional[str] = None,
    limit: int = 50,
):
    await get_current_user(request)
    await _expire_featured()
    query: dict = {"status": "active"}
    if listing_type in LISTING_TYPES:
        query["listing_type"] = listing_type
    if category in CATEGORIES:
        query["category"] = category
    if city:
        query["city"] = {"$regex": city, "$options": "i"}
    if q:
        query["$or"] = [
            {"title": {"$regex": q, "$options": "i"}},
            {"description": {"$regex": q, "$options": "i"}},
            {"address": {"$regex": q, "$options": "i"}},
        ]
    price_q = {}
    if min_price is not None:
        price_q["$gte"] = min_price
    if max_price is not None:
        price_q["$lte"] = max_price
    if price_q:
        query["price"] = price_q
    items = await db.property_listings.find(query, {"_id": 0}).sort(
        [("is_featured", -1), ("featured_priority", -1), ("created_at", -1)]
    ).to_list(limit)
    # Trim heavy image payload for the list view (keep first as thumbnail)
    for it in items:
        imgs = it.get("images") or []
        it["thumbnail"] = imgs[0] if imgs else None
        it["images_count"] = len(imgs)
        it.pop("images", None)
    return items


@router.get("/my/listings")
async def my_listings(request: Request):
    user = await get_current_user(request)
    items = await db.property_listings.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(100)
    for it in items:
        imgs = it.get("images") or []
        it["thumbnail"] = imgs[0] if imgs else None
        it["images_count"] = len(imgs)
        it.pop("images", None)
        it["unread_inquiries"] = await db.property_inquiries.count_documents({"listing_id": it["id"], "seen": {"$ne": True}})
    return items


@router.get("/my/unread-count")
async def my_unread_count(request: Request):
    user = await get_current_user(request)
    count = await db.property_inquiries.count_documents({"owner_user_id": user["id"], "seen": {"$ne": True}})
    return {"count": count}


@router.get("/my/inquiries")
async def my_inquiries(request: Request):
    user = await get_current_user(request)
    items = await db.property_inquiries.find({"from_user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return items


@router.post("/listings")
async def create_listing(data: ListingCreate, request: Request):
    user = await get_current_user(request)
    _validate(data)
    if len(data.images) > 12:
        raise HTTPException(status_code=400, detail="Maximum 12 photos")
    listing = {
        "id": f"prop_{uuid.uuid4().hex[:12]}",
        "user_id": user["id"],
        **data.model_dump(),
        "owner_name": data.owner_name or user.get("name"),
        "owner_phone": data.owner_phone or user.get("phone"),
        "status": "active",
        "is_featured": False,
        "featured_until": None,
        "featured_priority": 0,
        "views": 0,
        "inquiries_count": 0,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.property_listings.insert_one(listing)
    listing.pop("_id", None)
    return listing


@router.get("/listings/{listing_id}")
async def get_listing(listing_id: str, request: Request):
    await get_current_user(request)
    listing = await db.property_listings.find_one({"id": listing_id}, {"_id": 0})
    if not listing:
        raise HTTPException(status_code=404, detail="Annonce introuvable")
    await db.property_listings.update_one({"id": listing_id}, {"$inc": {"views": 1}})
    return listing


@router.put("/listings/{listing_id}")
async def update_listing(listing_id: str, data: ListingCreate, request: Request):
    user = await get_current_user(request)
    _validate(data)
    listing = await db.property_listings.find_one({"id": listing_id}, {"_id": 0})
    if not listing:
        raise HTTPException(status_code=404, detail="Annonce introuvable")
    if listing["user_id"] != user["id"] and user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Accès refusé")
    await db.property_listings.update_one({"id": listing_id}, {"$set": data.model_dump()})
    return {**listing, **data.model_dump()}


@router.post("/listings/{listing_id}/status")
async def set_status(listing_id: str, request: Request):
    user = await get_current_user(request)
    body = await request.json()
    new_status = body.get("status")
    if new_status not in STATUSES:
        raise HTTPException(status_code=400, detail="Statut invalide")
    listing = await db.property_listings.find_one({"id": listing_id}, {"_id": 0})
    if not listing:
        raise HTTPException(status_code=404, detail="Annonce introuvable")
    if listing["user_id"] != user["id"] and user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Accès refusé")
    await db.property_listings.update_one({"id": listing_id}, {"$set": {"status": new_status}})
    return {"id": listing_id, "status": new_status}


@router.delete("/listings/{listing_id}")
async def delete_listing(listing_id: str, request: Request):
    user = await get_current_user(request)
    listing = await db.property_listings.find_one({"id": listing_id}, {"_id": 0})
    if not listing:
        raise HTTPException(status_code=404, detail="Annonce introuvable")
    if listing["user_id"] != user["id"] and user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Accès refusé")
    await db.property_listings.delete_one({"id": listing_id})
    return {"ok": True}


@router.post("/listings/{listing_id}/inquiries")
async def create_inquiry(listing_id: str, data: InquiryCreate, request: Request):
    user = await get_current_user(request)
    listing = await db.property_listings.find_one({"id": listing_id}, {"_id": 0})
    if not listing:
        raise HTTPException(status_code=404, detail="Annonce introuvable")
    if listing["user_id"] == user["id"]:
        raise HTTPException(status_code=400, detail="Vous ne pouvez pas contacter votre propre annonce")
    inquiry = {
        "id": f"inq_{uuid.uuid4().hex[:12]}",
        "listing_id": listing_id,
        "listing_title": listing.get("title"),
        "owner_user_id": listing["user_id"],
        "from_user_id": user["id"],
        "from_name": user.get("name"),
        "message": data.message,
        "offer_amount": data.offer_amount,
        "contact_phone": data.contact_phone or user.get("phone"),
        "status": "new",
        "seen": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.property_inquiries.insert_one(inquiry)
    inquiry.pop("_id", None)
    await db.property_listings.update_one({"id": listing_id}, {"$inc": {"inquiries_count": 1}})
    # Real-time signal to the listing owner
    try:
        await manager.send_personal_message({
            "type": "new_property_inquiry",
            "listing_id": listing_id,
            "listing_title": listing.get("title"),
            "from_name": user.get("name"),
            "offer_amount": data.offer_amount,
        }, listing["user_id"])
    except Exception:
        pass
    return inquiry


@router.get("/listings/{listing_id}/inquiries")
async def listing_inquiries(listing_id: str, request: Request):
    user = await get_current_user(request)
    listing = await db.property_listings.find_one({"id": listing_id}, {"_id": 0})
    if not listing:
        raise HTTPException(status_code=404, detail="Annonce introuvable")
    if listing["user_id"] != user["id"] and user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Accès refusé")
    items = await db.property_inquiries.find({"listing_id": listing_id}, {"_id": 0}).sort("created_at", -1).to_list(100)
    # Mark inquiries as seen when the owner opens them
    if listing["user_id"] == user["id"]:
        await db.property_inquiries.update_many({"listing_id": listing_id, "seen": {"$ne": True}}, {"$set": {"seen": True}})
    return items


# ── Boost (self-checkout Stripe) ──────────────────────────────────────────
DEFAULT_COUNTRY = "default"


@router.get("/boost-plans")
async def get_boost_plans(request: Request, country: Optional[str] = None):
    """Active boost plans for a country (falls back to default plans)."""
    await get_current_user(request)
    plans = []
    if country:
        plans = await db.real_estate_boost_plans.find(
            {"country": country, "active": True}, {"_id": 0}
        ).sort("duration_days", 1).to_list(50)
    if not plans:
        plans = await db.real_estate_boost_plans.find(
            {"country": DEFAULT_COUNTRY, "active": True}, {"_id": 0}
        ).sort("duration_days", 1).to_list(50)
    return plans


@router.get("/boost/payment-methods")
async def boost_payment_methods(request: Request):
    """Return the user's available balances for boost payment (wallet + SB PayGo)."""
    user = await get_current_user(request)
    w = await db.wallets.find_one({"user_id": user["id"]}, {"_id": 0})
    sb = await db.sbpaygo_wallets.find_one({"user_id": user["id"]}, {"_id": 0})
    return {
        "methods": [
            {"id": "wallet", "label": "Mon portefeuille", "balance": (w or {}).get("balance", 0.0), "currency": (w or {}).get("currency", "EUR")},
            {"id": "sbpaygo", "label": "SB PayGo", "balance": (sb or {}).get("balance", 0.0), "currency": (sb or {}).get("currency", "EUR")},
        ],
    }


@router.post("/listings/{listing_id}/boost/pay")
async def boost_pay(listing_id: str, request: Request):
    """Pay for a boost using the user's wallet or SB PayGo balance, then feature the listing."""
    user = await get_current_user(request)
    body = await request.json()
    plan_id = body.get("plan_id")
    method = body.get("payment_method")  # 'wallet' | 'sbpaygo'
    if method not in ("wallet", "sbpaygo"):
        raise HTTPException(status_code=400, detail="Méthode de paiement invalide")

    listing = await db.property_listings.find_one({"id": listing_id}, {"_id": 0})
    if not listing:
        raise HTTPException(status_code=404, detail="Annonce introuvable")
    if listing["user_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    plan = await db.real_estate_boost_plans.find_one({"id": plan_id, "active": True}, {"_id": 0})
    if not plan:
        raise HTTPException(status_code=404, detail="Plan de boost introuvable")

    amount = round(float(plan["price"]), 2)
    now = datetime.now(timezone.utc)
    ts = now.isoformat()

    # Atomically debit the chosen wallet only if balance is sufficient
    if method == "wallet":
        res = await db.wallets.update_one(
            {"user_id": user["id"], "balance": {"$gte": amount}},
            {"$inc": {"balance": -amount}},
        )
        if res.modified_count == 0:
            raise HTTPException(status_code=400, detail="Solde portefeuille insuffisant")
        w = await db.wallets.find_one({"user_id": user["id"]}, {"_id": 0})
        new_balance = round(w["balance"], 2)
        await db.wallet_transactions.insert_one({
            "id": f"tx_{uuid.uuid4().hex[:12]}", "user_id": user["id"], "type": "Booking",
            "amount": -amount, "balance_after": new_balance,
            "description": f"Boost annonce — {plan.get('label') or plan['duration_days']+' j'}",
            "status": "completed", "created_at": ts,
        })
    else:  # sbpaygo
        res = await db.sbpaygo_wallets.update_one(
            {"user_id": user["id"], "balance": {"$gte": amount}},
            {"$inc": {"balance": -amount},
             "$push": {"transactions": {"id": f"tx_{uuid.uuid4().hex[:10]}", "type": "boost", "amount": -amount, "description": "Boost annonce immobilière", "created_at": ts}}},
        )
        if res.modified_count == 0:
            raise HTTPException(status_code=400, detail="Solde SB PayGo insuffisant")
        sb = await db.sbpaygo_wallets.find_one({"user_id": user["id"]}, {"_id": 0})
        new_balance = round(sb["balance"], 2)

    # Apply the boost
    until = (now + timedelta(days=int(plan["duration_days"]))).isoformat()
    await db.property_listings.update_one(
        {"id": listing_id},
        {"$set": {"is_featured": True, "featured_until": until, "featured_priority": int(plan.get("priority", 5))}},
    )
    await db.payment_transactions.insert_one({
        "id": f"pay_{uuid.uuid4().hex[:12]}", "user_id": user["id"], "amount": amount,
        "currency": str(plan["currency"]).upper(), "type": "real_estate_boost",
        "payment_method": method, "payment_status": "paid", "status": "complete",
        "metadata": {"listing_id": listing_id, "plan_id": plan_id, "duration_days": plan["duration_days"], "priority": plan.get("priority", 5)},
        "created_at": ts, "updated_at": ts,
    })
    return {"success": True, "listing_id": listing_id, "balance": new_balance, "method": method}


# ── Admin ─────────────────────────────────────────────────────────────────
admin_router = APIRouter(prefix="/admin/real-estate", tags=["admin-real-estate"])


async def _require_admin(request: Request):
    user = await get_current_user(request)
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    return user


@admin_router.get("/listings")
async def admin_list(request: Request, status: Optional[str] = None):
    await _require_admin(request)
    query = {}
    if status in STATUSES:
        query["status"] = status
    items = await db.property_listings.find(query, {"_id": 0}).sort("created_at", -1).to_list(200)
    for it in items:
        imgs = it.get("images") or []
        it["thumbnail"] = imgs[0] if imgs else None
        it["images_count"] = len(imgs)
        it.pop("images", None)
    return items


@admin_router.post("/listings/{listing_id}/toggle-status")
async def admin_toggle(listing_id: str, request: Request):
    await _require_admin(request)
    listing = await db.property_listings.find_one({"id": listing_id}, {"_id": 0})
    if not listing:
        raise HTTPException(status_code=404, detail="Annonce introuvable")
    new_status = "inactive" if listing.get("status") == "active" else "active"
    await db.property_listings.update_one({"id": listing_id}, {"$set": {"status": new_status}})
    return {"id": listing_id, "status": new_status}


@admin_router.post("/listings/{listing_id}/feature")
async def admin_feature(listing_id: str, request: Request):
    await _require_admin(request)
    listing = await db.property_listings.find_one({"id": listing_id}, {"_id": 0})
    if not listing:
        raise HTTPException(status_code=404, detail="Annonce introuvable")
    new_val = not listing.get("is_featured")
    await db.property_listings.update_one({"id": listing_id}, {"$set": {"is_featured": new_val}})
    return {"id": listing_id, "is_featured": new_val}


@admin_router.delete("/listings/{listing_id}")
async def admin_delete(listing_id: str, request: Request):
    await _require_admin(request)
    await db.property_listings.delete_one({"id": listing_id})
    return {"ok": True}


# ── Admin: boost plans CRUD ───────────────────────────────────────────────
class BoostPlan(BaseModel):
    country: str = "default"          # FR | MQ | GP | GF | default
    country_label: Optional[str] = None
    currency: str = "EUR"
    duration_days: int = Field(..., ge=1)
    price: float = Field(..., ge=0)
    priority: int = 5
    label: Optional[str] = None
    active: bool = True


@admin_router.get("/boost-plans")
async def admin_list_plans(request: Request):
    await _require_admin(request)
    return await db.real_estate_boost_plans.find({}, {"_id": 0}).sort([("country", 1), ("duration_days", 1)]).to_list(200)


@admin_router.post("/boost-plans")
async def admin_create_plan(data: BoostPlan, request: Request):
    await _require_admin(request)
    plan = {"id": f"boost_{uuid.uuid4().hex[:10]}", **data.model_dump(), "created_at": datetime.now(timezone.utc).isoformat()}
    await db.real_estate_boost_plans.insert_one(plan)
    plan.pop("_id", None)
    return plan


@admin_router.put("/boost-plans/{plan_id}")
async def admin_update_plan(plan_id: str, data: BoostPlan, request: Request):
    await _require_admin(request)
    r = await db.real_estate_boost_plans.update_one({"id": plan_id}, {"$set": data.model_dump()})
    if r.matched_count == 0:
        raise HTTPException(status_code=404, detail="Plan introuvable")
    return {"id": plan_id, **data.model_dump()}


@admin_router.post("/boost-plans/{plan_id}/toggle")
async def admin_toggle_plan(plan_id: str, request: Request):
    await _require_admin(request)
    plan = await db.real_estate_boost_plans.find_one({"id": plan_id}, {"_id": 0})
    if not plan:
        raise HTTPException(status_code=404, detail="Plan introuvable")
    new_val = not plan.get("active", True)
    await db.real_estate_boost_plans.update_one({"id": plan_id}, {"$set": {"active": new_val}})
    return {"id": plan_id, "active": new_val}


@admin_router.delete("/boost-plans/{plan_id}")
async def admin_delete_plan(plan_id: str, request: Request):
    await _require_admin(request)
    await db.real_estate_boost_plans.delete_one({"id": plan_id})
    return {"ok": True}


# ── Seed default boost plans (idempotent) ─────────────────────────────────
SEED_COUNTRIES = [
    ("FR", "France 🇫🇷", "EUR"),
    ("MQ", "Martinique 🇲🇶", "EUR"),
    ("GP", "Guadeloupe 🇬🇵", "EUR"),
    ("GF", "Guyane 🇬🇫", "EUR"),
    ("default", "Par défaut (tous)", "EUR"),
]
SEED_TIERS = [
    (7, 4.99, 5, "Boost 7 jours"),
    (15, 8.99, 7, "Boost 15 jours"),
    (30, 14.99, 9, "Boost 30 jours · meilleure visibilité"),
]


async def seed_real_estate_boost_plans():
    # Remove any legacy free (price 0) plans — boost is now paid-only (wallet / SB PayGo).
    await db.real_estate_boost_plans.delete_many({"price": {"$lte": 0}})
    if await db.real_estate_boost_plans.count_documents({}) > 0:
        return
    docs = []
    for code, label, currency in SEED_COUNTRIES:
        for days, price, priority, plan_label in SEED_TIERS:
            docs.append({
                "id": f"boost_{uuid.uuid4().hex[:10]}",
                "country": code, "country_label": label, "currency": currency,
                "duration_days": days, "price": price, "priority": priority,
                "label": plan_label, "active": True,
                "created_at": datetime.now(timezone.utc).isoformat(),
            })
    if docs:
        await db.real_estate_boost_plans.insert_many(docs)
