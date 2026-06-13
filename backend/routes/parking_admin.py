"""Admin — gestion des parkings (places de stationnement éditables).

CRUD sur la collection `parking_space` consommée par l'app client
(`GET /api/parking/spots`). Permet à l'admin d'ajouter/modifier/supprimer des
parkings (nom, adresse, GPS, tarif, places, équipements, photo, visibilité).
"""
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Request, HTTPException

from core.config import db
from core.deps import require_role

router = APIRouter(prefix="/admin/parking", tags=["admin-parking"])


def _now():
    return datetime.now(timezone.utc).isoformat()


def _clean(body: dict) -> dict:
    """Normalise the editable fields of a parking spot."""
    feats = body.get("features")
    if isinstance(feats, str):
        feats = [f.strip() for f in feats.split(",") if f.strip()]
    out = {
        "name": (body.get("name") or "").strip(),
        "address": (body.get("address") or "").strip(),
        "lat": float(body.get("lat") or 0),
        "lng": float(body.get("lng") or 0),
        "price_per_hour": float(body.get("price_per_hour") or 0),
        "price_per_hour_night": float(body.get("price_per_hour_night") or body.get("price_per_hour") or 0),
        "total_spots": int(body.get("total_spots") or 0),
        "available_spots": int(body.get("available_spots") or 0),
        "rating": float(body.get("rating") or 0),
        "features": feats if isinstance(feats, list) else [],
        "image_url": (body.get("image_url") or "").strip(),
        "active": bool(body.get("active", True)),
        "open_24h": bool(body.get("open_24h", True)),
        "open_time": (body.get("open_time") or "06:00").strip(),
        "close_time": (body.get("close_time") or "23:00").strip(),
        "night_start": (body.get("night_start") or "20:00").strip(),
        "night_end": (body.get("night_end") or "06:00").strip(),
    }
    if "display_order" in body and body.get("display_order") is not None:
        out["display_order"] = int(body["display_order"])
    return out


@router.get("/spots")
async def admin_list_spots(request: Request):
    await require_role(request, ["admin", "manager"], permission="content.manage")
    spots = await db.parking_space.find({}, {"_id": 0}).sort("display_order", 1).to_list(500)
    return {"spots": spots, "count": len(spots)}


@router.post("/spots")
async def admin_create_spot(request: Request):
    await require_role(request, ["admin", "manager"], permission="content.manage")
    body = await request.json()
    data = _clean(body)
    if not data["name"]:
        raise HTTPException(status_code=400, detail="Le nom du parking est requis")
    last = await db.parking_space.find_one({}, sort=[("display_order", -1)])
    data["display_order"] = (last.get("display_order", 0) + 1) if last else 0
    data["id"] = f"park_{uuid.uuid4().hex[:10]}"
    data["created_at"] = _now()
    await db.parking_space.insert_one(dict(data))
    data.pop("_id", None)
    return data


@router.put("/spots/{spot_id}")
async def admin_update_spot(spot_id: str, request: Request):
    await require_role(request, ["admin", "manager"], permission="content.manage")
    body = await request.json()
    existing = await db.parking_space.find_one({"id": spot_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Parking introuvable")
    data = _clean(body)
    data["updated_at"] = _now()
    await db.parking_space.update_one({"id": spot_id}, {"$set": data})
    return {**existing, **data}


@router.patch("/spots/{spot_id}/toggle")
async def admin_toggle_spot(spot_id: str, request: Request):
    await require_role(request, ["admin", "manager"], permission="content.manage")
    existing = await db.parking_space.find_one({"id": spot_id}, {"_id": 0, "active": 1})
    if not existing:
        raise HTTPException(status_code=404, detail="Parking introuvable")
    new_val = not existing.get("active", True)
    await db.parking_space.update_one({"id": spot_id}, {"$set": {"active": new_val, "updated_at": _now()}})
    return {"id": spot_id, "active": new_val}


@router.delete("/spots/{spot_id}")
async def admin_delete_spot(spot_id: str, request: Request):
    await require_role(request, ["admin", "manager"], permission="content.manage")
    res = await db.parking_space.delete_one({"id": spot_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Parking introuvable")
    return {"ok": True, "deleted": spot_id}
