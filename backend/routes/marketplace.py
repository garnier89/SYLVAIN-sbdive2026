from fastapi import APIRouter, Request, HTTPException
import uuid
from datetime import datetime, timezone
from typing import Optional

from core.config import db
from core.deps import get_current_user

router = APIRouter(prefix="/marketplace", tags=["marketplace"])


@router.post("/listings")
async def create_listing(request: Request):
    user = await get_current_user(request)
    # Selling gate: KYC must be approved (+ driver account active/ever-active).
    from routes.kyc import can_user_sell
    gate = await can_user_sell(user)
    if not gate["can_sell"]:
        raise HTTPException(status_code=403, detail=gate["reason"] or "Vérification d'identité requise pour vendre.")
    body = await request.json()

    images = body.get("images", [])
    listing = {
        "id": f"listing_{uuid.uuid4().hex[:12]}",
        "user_id": user["id"],
        "seller_name": user.get("name", ""),
        "seller_phone": user.get("phone", ""),
        "seller_verified": True,  # creation is gated by approved KYC
        "type": body.get("type", "items"),  # real-estate, cars, items
        "title": body["title"],
        "description": body.get("description", ""),
        "price": body["price"],
        "currency": body.get("currency", "EUR"),
        "category": body.get("category", ""),
        "location": body.get("location", ""),
        "images": images,
        "image": images[0] if images else "",
        "listing_type": body.get("listing_type", "sell"),  # sell, rent
        "is_featured": False,
        "status": "active",
        "views": 0,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.marketplace_listings.insert_one(listing)
    listing.pop("_id", None)
    return listing


@router.get("/listings")
async def list_listings(
    type: Optional[str] = None,
    category: Optional[str] = None,
    listing_type: Optional[str] = None,
    search: Optional[str] = None,
    limit: int = 20, skip: int = 0
):
    query = {"status": "active"}
    if type:
        query["type"] = type
    if category:
        query["category"] = category
    if listing_type:
        query["listing_type"] = listing_type
    if search:
        query["$or"] = [
            {"title": {"$regex": search, "$options": "i"}},
            {"description": {"$regex": search, "$options": "i"}}
        ]

    listings = await db.marketplace_listings.find(query, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    total = await db.marketplace_listings.count_documents(query)
    return {"listings": listings, "total": total}


@router.get("/my-listings")
async def my_listings(request: Request):
    user = await get_current_user(request)
    listings = await db.marketplace_listings.find(
        {"user_id": user["id"]}, {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    return {"listings": listings, "total": len(listings)}


@router.get("/listings/{listing_id}")
async def get_listing(listing_id: str):
    listing = await db.marketplace_listings.find_one({"id": listing_id}, {"_id": 0})
    if not listing:
        raise HTTPException(status_code=404, detail="Listing not found")
    await db.marketplace_listings.update_one({"id": listing_id}, {"$inc": {"views": 1}})
    return listing


@router.delete("/listings/{listing_id}")
async def delete_listing(listing_id: str, request: Request):
    user = await get_current_user(request)
    result = await db.marketplace_listings.delete_one({"id": listing_id, "user_id": user["id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Listing not found")
    return {"message": "Listing deleted"}
