"""
Unified delivery search — queries ALL delivery verticals at once.

Powers the home "Que voulez-vous vous faire livrer ?" search bar: matches
real merchants (any store_type) by name AND their products by name, returning
results the client can tap to open the store directly. No mocked data.

Collection: merchants, products
"""
import re
from fastapi import APIRouter
from typing import Optional

from core.config import db

router = APIRouter(prefix="/search", tags=["search"])

# store_type -> human label shown in the results UI
STORE_TYPE_LABELS = {
    "restaurant": "Restaurant",
    "grocery": "Épicerie",
    "florist": "Fleuriste",
    "stationery": "Papeterie",
    "wine": "Cave à vins",
    "construction": "Matériaux",
    "pharmacy": "Pharmacie",
}


def _enrich(m: dict) -> dict:
    if m.get("delivery_fee") is None:
        m["delivery_fee"] = 2.5
    if "eta_min" not in m:
        m["eta_min"] = 30
    m["store_type_label"] = STORE_TYPE_LABELS.get(m.get("store_type"), "Commerce")
    return m


@router.get("/delivery")
async def search_delivery(q: Optional[str] = None, limit: int = 20):
    """Search merchants + products across every delivery vertical."""
    term = (q or "").strip()
    if len(term) < 2:
        return {"query": term, "stores": [], "products": []}

    rx = {"$regex": re.escape(term), "$options": "i"}

    # 1) Stores matching by name (any vertical)
    stores = await db.merchants.find(
        {"is_active": True, "store_name": rx}, {"_id": 0}
    ).limit(limit).to_list(limit)
    for s in stores:
        _enrich(s)

    # 2) Products matching by name, joined back to their (active) store
    raw_products = await db.products.find(
        {"is_available": True, "name": rx}, {"_id": 0}
    ).limit(limit * 2).to_list(limit * 2)

    merchant_ids = list({p["merchant_id"] for p in raw_products})
    merchants = await db.merchants.find(
        {"id": {"$in": merchant_ids}, "is_active": True}, {"_id": 0}
    ).to_list(200)
    mmap = {m["id"]: _enrich(m) for m in merchants}

    products = []
    for p in raw_products:
        m = mmap.get(p["merchant_id"])
        if not m:
            continue
        products.append({
            "id": p["id"],
            "name": p["name"],
            "price": p.get("price"),
            "category": p.get("category"),
            "image_url": p.get("image_url"),
            "merchant_id": m["id"],
            "merchant_name": m["store_name"],
            "store_type": m.get("store_type"),
            "store_type_label": m.get("store_type_label"),
        })
        if len(products) >= limit:
            break

    return {"query": term, "stores": stores, "products": products}
