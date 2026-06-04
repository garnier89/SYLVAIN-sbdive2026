"""
Buy, Sell & Rent Real Estate (V3Cube classifieds model).
Users post property listings (sale/rent · residential/commercial/land),
others browse/filter and contact the owner (call or in-app inquiry/offer).
App owner monetises via paid "featured" plans (admin-managed).
"""
from fastapi import APIRouter, Request, HTTPException
import uuid
from datetime import datetime, timezone
from typing import Optional, List
from pydantic import BaseModel, Field

from core.config import db
from core.deps import get_current_user

router = APIRouter(prefix="/real-estate", tags=["real-estate"])

LISTING_TYPES = {"sale", "rent"}
CATEGORIES = {"residential", "commercial", "land"}
STATUSES = {"active", "sold", "rented", "inactive"}


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
        [("is_featured", -1), ("created_at", -1)]
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
    return items


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
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.property_inquiries.insert_one(inquiry)
    inquiry.pop("_id", None)
    await db.property_listings.update_one({"id": listing_id}, {"$inc": {"inquiries_count": 1}})
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
    return items


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
