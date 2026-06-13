"""Favoris / annonces sauvegardées — partagé Immobilier + Marketplace.

Un utilisateur peut sauvegarder (❤️) une annonce immobilière (`property`) ou
marketplace (`marketplace`) et retrouver toutes ses annonces sauvegardées dans
« Mes favoris ». Les favoris sont enrichis à la lecture avec l'annonce actuelle
(les annonces supprimées sont ignorées).
"""
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Request, HTTPException

from core.config import db
from core.deps import get_current_user

router = APIRouter(prefix="/favorites", tags=["favorites"])

ITEM_TYPES = {"property", "marketplace", "nearby"}
_COLLECTION = {"property": "property_listings", "marketplace": "marketplace_listings"}


def _now():
    return datetime.now(timezone.utc).isoformat()


@router.post("/toggle")
async def toggle_favorite(request: Request):
    user = await get_current_user(request)
    body = await request.json()
    item_type = body.get("item_type")
    item_id = body.get("item_id")
    if item_type not in ITEM_TYPES or not item_id:
        raise HTTPException(status_code=400, detail="item_type/item_id invalide")
    existing = await db.favorites.find_one({"user_id": user["id"], "item_type": item_type, "item_id": item_id})
    if existing:
        await db.favorites.delete_one({"id": existing["id"]})
        return {"favorited": False}
    doc = {
        "id": f"fav_{uuid.uuid4().hex[:12]}", "user_id": user["id"],
        "item_type": item_type, "item_id": item_id, "created_at": _now()}
    # Nearby/Google places have no persistent DB record → store a snapshot of the card.
    if item_type == "nearby":
        snap = body.get("snapshot") or {}
        if isinstance(snap, dict):
            doc["snapshot"] = snap
    await db.favorites.insert_one(doc)
    return {"favorited": True}


@router.get("/ids")
async def favorite_ids(request: Request, item_type: str = None):
    """Liste des item_id favoris (pour l'état des boutons cœur)."""
    user = await get_current_user(request)
    q = {"user_id": user["id"]}
    if item_type in ITEM_TYPES:
        q["item_type"] = item_type
    favs = await db.favorites.find(q, {"_id": 0, "item_id": 1, "item_type": 1}).to_list(1000)
    return {"ids": [f["item_id"] for f in favs],
            "by_type": {t: [f["item_id"] for f in favs if f["item_type"] == t] for t in ITEM_TYPES}}


@router.get("")
async def my_favorites(request: Request, item_type: str = None):
    """Favoris enrichis avec l'annonce actuelle (les supprimées sont ignorées)."""
    user = await get_current_user(request)
    q = {"user_id": user["id"]}
    if item_type in ITEM_TYPES:
        q["item_type"] = item_type
    favs = await db.favorites.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)
    out = []
    for f in favs:
        if f["item_type"] == "nearby":
            # Snapshot-backed (Google/admin nearby place) — no collection lookup.
            snap = f.get("snapshot")
            if not snap:
                continue
            out.append({"favorite_id": f["id"], "item_type": "nearby", "item_id": f["item_id"],
                        "saved_at": f["created_at"], "listing": snap})
            continue
        coll = _COLLECTION.get(f["item_type"])
        listing = await db[coll].find_one({"id": f["item_id"]}, {"_id": 0}) if coll else None
        if not listing:
            continue
        if f["item_type"] == "property":
            imgs = listing.get("images") or []
            listing["thumbnail"] = imgs[0] if imgs else None
            listing.pop("images", None)
        out.append({"favorite_id": f["id"], "item_type": f["item_type"], "item_id": f["item_id"],
                    "saved_at": f["created_at"], "listing": listing})
    return {"favorites": out}
