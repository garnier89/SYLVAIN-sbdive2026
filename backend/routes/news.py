"""News / Actualités (parité V3Cube) — fil d'actualités rider & chauffeur.

Distinct from Newsletter (email subscription). Admin publishes articles
(title, body, image, audience) that appear in an in-app feed for riders
and/or drivers.
"""
from fastapi import APIRouter, Request, HTTPException
import uuid
from datetime import datetime, timezone

from core.config import db
from core.deps import get_current_user, require_role

router = APIRouter(prefix="/news", tags=["news"])

AUDIENCES = {"all", "rider", "driver"}
_WRITE_PERM = "content.cms.edit"


def _now():
    return datetime.now(timezone.utc).isoformat()


def _serialize(n: dict) -> dict:
    n.pop("_id", None)
    return n


@router.get("/feed")
async def news_feed(request: Request):
    """In-app feed for the current user (audience derived from role)."""
    user = await get_current_user(request)
    audience = "driver" if user.get("role") == "driver" else "rider"
    items = await db.news.find(
        {"status": "published", "audience": {"$in": ["all", audience]}}, {"_id": 0}
    ).to_list(500)
    items.sort(key=lambda n: (n.get("pinned", False), n.get("published_at") or n.get("created_at") or ""), reverse=True)
    return items


# ───────────────────────── Admin CRUD ─────────────────────────
def _clean_payload(body: dict) -> dict:
    title = (body.get("title") or "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="Titre requis")
    audience = body.get("audience", "all")
    if audience not in AUDIENCES:
        raise HTTPException(status_code=400, detail="Audience invalide")
    return {
        "title": title,
        "body": (body.get("body") or "").strip(),
        "image_url": (body.get("image_url") or "").strip(),
        "audience": audience,
        "pinned": bool(body.get("pinned", False)),
        "status": "published" if body.get("status", "published") == "published" else "draft",
    }


@router.post("/admin")
async def create_news(request: Request):
    await require_role(request, ["admin"], permission=_WRITE_PERM)
    body = await request.json()
    payload = _clean_payload(body)
    now = _now()
    article = {
        "id": f"news_{uuid.uuid4().hex[:12]}", **payload,
        "views": 0, "created_at": now,
        "published_at": now if payload["status"] == "published" else None,
    }
    await db.news.insert_one(article)
    return _serialize(article)


@router.get("/admin")
async def list_news(request: Request):
    await require_role(request, ["admin"], permission=_WRITE_PERM)
    return await db.news.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)


@router.put("/admin/{news_id}")
async def update_news(news_id: str, request: Request):
    await require_role(request, ["admin"], permission=_WRITE_PERM)
    body = await request.json()
    payload = _clean_payload(body)
    existing = await db.news.find_one({"id": news_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Article introuvable")
    if payload["status"] == "published" and not existing.get("published_at"):
        payload["published_at"] = _now()
    await db.news.update_one({"id": news_id}, {"$set": payload})
    return await db.news.find_one({"id": news_id}, {"_id": 0})


@router.put("/admin/{news_id}/toggle")
async def toggle_news(news_id: str, request: Request):
    await require_role(request, ["admin"], permission=_WRITE_PERM)
    n = await db.news.find_one({"id": news_id}, {"_id": 0})
    if not n:
        raise HTTPException(status_code=404, detail="Article introuvable")
    new_status = "draft" if n.get("status") == "published" else "published"
    updates = {"status": new_status}
    if new_status == "published" and not n.get("published_at"):
        updates["published_at"] = _now()
    await db.news.update_one({"id": news_id}, {"$set": updates})
    return {"id": news_id, "status": new_status}


@router.delete("/admin/{news_id}")
async def delete_news(news_id: str, request: Request):
    await require_role(request, ["admin"], permission=_WRITE_PERM)
    res = await db.news.delete_one({"id": news_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Article introuvable")
    return {"deleted": True, "id": news_id}
