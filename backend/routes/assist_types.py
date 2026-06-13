"""Types d'assistance SB Access — éditables depuis l'admin (sans toucher au code).

Collection `assist_types` consommée par l'app client (panneau « Type d'assistance »
de SB Access). L'admin peut ajouter / renommer / réordonner / masquer / supprimer
les types (Fauteuil roulant, PMR, Accès, Personne âgée, etc.).
"""
import re
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Request, HTTPException

from core.config import db
from core.deps import require_role

public_router = APIRouter(prefix="/assist-types", tags=["assist-types"])
admin_router = APIRouter(prefix="/admin/assist-types", tags=["admin-assist-types"])

DEFAULTS = [
    {"key": "wheelchair", "label": "Fauteuil roulant"},
    {"key": "pmr", "label": "PMR"},
    {"key": "access", "label": "Accès"},
    {"key": "elderly", "label": "Personne âgée"},
    {"key": "medical", "label": "Sortie médicale"},
    {"key": "luggage", "label": "Aide bagages"},
]


def _now():
    return datetime.now(timezone.utc).isoformat()


def _slug(label: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "_", (label or "").lower()).strip("_")
    return s or f"type_{uuid.uuid4().hex[:6]}"


async def seed_assist_types():
    """Idempotent: seed the default SB Access assistance types if none exist."""
    if await db.assist_types.count_documents({}) > 0:
        return
    for i, t in enumerate(DEFAULTS):
        await db.assist_types.insert_one({
            "id": f"assist_{uuid.uuid4().hex[:10]}", "key": t["key"], "label": t["label"],
            "active": True, "display_order": i, "created_at": _now(),
        })


@public_router.get("")
async def list_assist_types():
    """Active assistance types for the client booking panel."""
    types = await db.assist_types.find(
        {"active": {"$ne": False}}, {"_id": 0, "key": 1, "label": 1}
    ).sort("display_order", 1).to_list(100)
    if not types:
        types = [{"key": t["key"], "label": t["label"]} for t in DEFAULTS]
    return {"types": types}


@admin_router.get("")
async def admin_list(request: Request):
    await require_role(request, ["admin", "manager"], permission="content.manage")
    types = await db.assist_types.find({}, {"_id": 0}).sort("display_order", 1).to_list(200)
    return {"types": types, "count": len(types)}


@admin_router.post("")
async def admin_create(request: Request):
    await require_role(request, ["admin", "manager"], permission="content.manage")
    body = await request.json()
    label = (body.get("label") or "").strip()
    if not label:
        raise HTTPException(status_code=400, detail="Le libellé est requis")
    last = await db.assist_types.find_one({}, sort=[("display_order", -1)])
    key = (body.get("key") or _slug(label)).strip()
    if await db.assist_types.find_one({"key": key}):
        raise HTTPException(status_code=409, detail=f"La clé « {key} » existe déjà")
    doc = {
        "id": f"assist_{uuid.uuid4().hex[:10]}",
        "key": key,
        "label": label,
        "active": bool(body.get("active", True)),
        "display_order": (last.get("display_order", 0) + 1) if last else 0,
        "created_at": _now(),
    }
    await db.assist_types.insert_one(dict(doc))
    doc.pop("_id", None)
    return doc


@admin_router.put("/{type_id}")
async def admin_update(type_id: str, request: Request):
    await require_role(request, ["admin", "manager"], permission="content.manage")
    body = await request.json()
    existing = await db.assist_types.find_one({"id": type_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Type introuvable")
    patch = {"updated_at": _now()}
    if "label" in body:
        patch["label"] = (body.get("label") or "").strip()
    if "key" in body and body.get("key"):
        new_key = _slug(body["key"])
        if await db.assist_types.find_one({"key": new_key, "id": {"$ne": type_id}}):
            raise HTTPException(status_code=409, detail=f"La clé « {new_key} » existe déjà")
        patch["key"] = new_key
    if "active" in body:
        patch["active"] = bool(body["active"])
    if "display_order" in body and body.get("display_order") is not None:
        patch["display_order"] = int(body["display_order"])
    await db.assist_types.update_one({"id": type_id}, {"$set": patch})
    return {**existing, **patch}


@admin_router.patch("/{type_id}/toggle")
async def admin_toggle(type_id: str, request: Request):
    await require_role(request, ["admin", "manager"], permission="content.manage")
    existing = await db.assist_types.find_one({"id": type_id}, {"_id": 0, "active": 1})
    if not existing:
        raise HTTPException(status_code=404, detail="Type introuvable")
    new_val = not existing.get("active", True)
    await db.assist_types.update_one({"id": type_id}, {"$set": {"active": new_val, "updated_at": _now()}})
    return {"id": type_id, "active": new_val}


@admin_router.delete("/{type_id}")
async def admin_delete(type_id: str, request: Request):
    await require_role(request, ["admin", "manager"], permission="content.manage")
    res = await db.assist_types.delete_one({"id": type_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Type introuvable")
    return {"ok": True, "deleted": type_id}
