"""Itinéraires touristiques (Circuits) — sauvegarde + partage par lien public.

Permet à un utilisateur d'enregistrer un circuit (liste ordonnée de POI/étapes
construite depuis la page « Commerces & Tourisme »), de le retrouver dans
« Mes circuits », et de le partager via un lien public en lecture seule.

Collection: itineraries
  { id, user_id, title, city, places: [{name, category, address, lat, lng,
    place_id?, image?}], route_info?, share_token, created_at, updated_at }
"""
import secrets
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Request, HTTPException

from core.config import db
from core.deps import get_current_user

router = APIRouter(prefix="/itineraries", tags=["itineraries"])

MAX_PLACES = 25


def _clean_place(p: dict) -> dict:
    name = (p.get("name") or "").strip()
    if not name:
        return None
    return {
        "name": name[:160],
        "category": (p.get("category") or "").strip()[:60],
        "address": (p.get("address") or "").strip()[:240],
        "lat": p.get("lat"),
        "lng": p.get("lng"),
        "place_id": p.get("place_id"),
        "image": p.get("image"),
    }


def _public_view(it: dict, owner_name: str | None = None) -> dict:
    return {
        "id": it["id"],
        "title": it.get("title"),
        "city": it.get("city"),
        "places": it.get("places", []),
        "route_info": it.get("route_info"),
        "share_token": it.get("share_token"),
        "owner_name": owner_name,
        "created_at": it.get("created_at"),
    }


@router.post("")
async def create_itinerary(request: Request):
    user = await get_current_user(request)
    body = await request.json()
    title = (body.get("title") or "").strip()
    if not title:
        raise HTTPException(400, "Titre requis")
    raw_places = body.get("places") or []
    places = [q for q in (_clean_place(p) for p in raw_places) if q]
    if not places:
        raise HTTPException(400, "Ajoutez au moins une étape au circuit")
    if len(places) > MAX_PLACES:
        raise HTTPException(400, f"Maximum {MAX_PLACES} étapes")
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "id": f"itin_{uuid.uuid4().hex[:12]}",
        "user_id": user["id"],
        "title": title[:120],
        "city": (body.get("city") or "").strip()[:120] or None,
        "places": places,
        "route_info": body.get("route_info") or None,
        "share_token": secrets.token_urlsafe(9),
        "created_at": now,
        "updated_at": now,
    }
    await db.itineraries.insert_one(dict(doc))
    doc.pop("_id", None)
    return doc


@router.get("")
async def list_itineraries(request: Request):
    user = await get_current_user(request)
    items = await db.itineraries.find(
        {"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return items


@router.get("/{itin_id}")
async def get_itinerary(itin_id: str, request: Request):
    user = await get_current_user(request)
    it = await db.itineraries.find_one({"id": itin_id, "user_id": user["id"]}, {"_id": 0})
    if not it:
        raise HTTPException(404, "Circuit introuvable")
    return it


@router.delete("/{itin_id}")
async def delete_itinerary(itin_id: str, request: Request):
    user = await get_current_user(request)
    res = await db.itineraries.delete_one({"id": itin_id, "user_id": user["id"]})
    if res.deleted_count == 0:
        raise HTTPException(404, "Circuit introuvable")
    return {"message": "deleted", "id": itin_id}


@router.get("/public/{token}")
async def get_public_itinerary(token: str):
    """PUBLIC — lecture seule d'un circuit partagé (sans auth)."""
    it = await db.itineraries.find_one({"share_token": token}, {"_id": 0})
    if not it:
        raise HTTPException(404, "Circuit introuvable ou lien expiré")
    owner = await db.users.find_one({"id": it.get("user_id")}, {"_id": 0, "name": 1}) or {}
    return _public_view(it, owner.get("name"))
