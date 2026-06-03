"""
Saved & recent places (Iter 88) — raccourcis Maison / Travail / récents.

Collection: user_places (un document par utilisateur)
  { user_id, home: {address,lat,lng}, work: {address,lat,lng}, recent: [ {...}, ... ] }
"""
from fastapi import APIRouter, Request, HTTPException
from datetime import datetime, timezone

from core.config import db
from core.deps import get_current_user

router = APIRouter(prefix="/places", tags=["places"])

VALID_KINDS = {"home", "work"}


def _place_from_body(body: dict):
    address = (body.get("address") or "").strip()
    if not address:
        raise HTTPException(400, "Adresse requise")
    return {
        "address": address,
        "lat": body.get("lat"),
        "lng": body.get("lng"),
    }


@router.get("/saved")
async def get_saved(request: Request):
    user = await get_current_user(request)
    doc = await db.user_places.find_one({"user_id": user["id"]}, {"_id": 0}) or {}
    return {
        "home": doc.get("home"),
        "work": doc.get("work"),
        "recent": doc.get("recent", [])[:8],
    }


@router.put("/saved/{kind}")
async def set_saved(kind: str, request: Request):
    if kind not in VALID_KINDS:
        raise HTTPException(400, "Type invalide (home|work)")
    user = await get_current_user(request)
    place = _place_from_body(await request.json())
    await db.user_places.update_one(
        {"user_id": user["id"]},
        {"$set": {kind: place, "user_id": user["id"]}},
        upsert=True,
    )
    return {"message": "saved", "kind": kind, "place": place}


@router.delete("/saved/{kind}")
async def delete_saved(kind: str, request: Request):
    if kind not in VALID_KINDS:
        raise HTTPException(400, "Type invalide")
    user = await get_current_user(request)
    await db.user_places.update_one({"user_id": user["id"]}, {"$unset": {kind: ""}})
    return {"message": "deleted", "kind": kind}


@router.post("/recent")
async def add_recent(request: Request):
    user = await get_current_user(request)
    place = _place_from_body(await request.json())
    place["used_at"] = datetime.now(timezone.utc).isoformat()
    # Prepend, de-dupe by address, cap at 8
    doc = await db.user_places.find_one({"user_id": user["id"]}, {"_id": 0, "recent": 1}) or {}
    recent = [p for p in doc.get("recent", []) if p.get("address") != place["address"]]
    recent.insert(0, place)
    await db.user_places.update_one(
        {"user_id": user["id"]},
        {"$set": {"recent": recent[:8], "user_id": user["id"]}},
        upsert=True,
    )
    return {"message": "ok", "count": len(recent[:8])}
