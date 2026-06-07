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
from core.geo_scope import clean_scope, scope_matches, resolve_zone_from_text
from core.notifications import create_notification

router = APIRouter(prefix="/news", tags=["news"])

AUDIENCES = {"all", "rider", "driver"}
_WRITE_PERM = "content.cms.edit"


def _now():
    return datetime.now(timezone.utc).isoformat()


def _serialize(n: dict) -> dict:
    n.pop("_id", None)
    return n


@router.get("/feed")
async def news_feed(request: Request, location: str = ""):
    """In-app feed for the current user (audience derived from role), filtered by
    the request zone resolved from the browser-geocoded `location` (empty = all)."""
    user = await get_current_user(request)
    audience = "driver" if user.get("role") == "driver" else "rider"
    items = await db.news.find(
        {"status": "published", "audience": {"$in": ["all", audience]}}, {"_id": 0}
    ).to_list(500)
    if location:
        zone = resolve_zone_from_text(location)
        items = [n for n in items if scope_matches(n.get("scope"), zone)]
    items.sort(key=lambda n: (n.get("pinned", False), n.get("published_at") or n.get("created_at") or ""), reverse=True)
    return items


@router.get("/unread-count")
async def news_unread_count(request: Request, location: str = ""):
    """Number of published articles (audience + zone matched) newer than the user's
    last read timestamp. Also refreshes the user's last_zone (for zone-targeted push)."""
    user = await get_current_user(request)
    audience = "driver" if user.get("role") == "driver" else "rider"
    last_read = user.get("news_last_read_at") or ""
    items = await db.news.find(
        {"status": "published", "audience": {"$in": ["all", audience]}}, {"_id": 0}
    ).to_list(500)
    zone = None
    if location:
        zone = resolve_zone_from_text(location)
        await db.users.update_one(
            {"id": user["id"]},
            {"$set": {"last_zone": clean_scope(zone) if zone else {"country": "", "state": "", "city": ""}}},
        )
    count = 0
    for n in items:
        if location and not scope_matches(n.get("scope"), zone):
            continue
        pub = n.get("published_at") or n.get("created_at") or ""
        if pub > last_read:
            count += 1
    return {"unread": count}


@router.post("/mark-read")
async def mark_news_read(request: Request):
    """Mark the feed as read for the current user (clears the unread badge)."""
    user = await get_current_user(request)
    await db.users.update_one({"id": user["id"]}, {"$set": {"news_last_read_at": _now()}})
    return {"ok": True}


def _eligible_roles(audience: str):
    if audience == "rider":
        return ["user"]
    if audience == "driver":
        return ["driver"]
    return ["user", "driver"]


async def _notify_article_published(article: dict):
    """Push a notification to eligible users when an article is published.

    Zone-scoped articles only reach users whose last known zone matches; global
    articles reach all users of the matching audience. Best-effort, capped."""
    scope = article.get("scope")
    is_global = not (scope and scope.get("country"))
    roles = _eligible_roles(article.get("audience", "all"))
    users = await db.users.find({"role": {"$in": roles}}, {"_id": 0, "id": 1, "last_zone": 1}).to_list(5000)
    body = article.get("title", "Nouvelle actualité")
    for u in users:
        if not is_global and not scope_matches(scope, u.get("last_zone")):
            continue
        await create_notification(
            u["id"], "news", "Nouvelle actualité", body,
            data={"news_id": article.get("id")}, push=True,
        )


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
        "scope": clean_scope(body.get("scope")),
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
    if article["status"] == "published":
        await _notify_article_published(article)
    return _serialize(article)


@router.get("/admin")
async def list_news(request: Request):
    await require_role(request, ["admin"], permission=_WRITE_PERM)
    return await db.news.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)


@router.get("/admin/preview")
async def admin_preview_news(request: Request, country: str = "", state: str = "", city: str = "", audience: str = "rider"):
    """Admin 'Aperçu par zone': published articles a client of the given zone +
    audience would see in their feed (reuses the same scope_matches logic)."""
    await require_role(request, ["admin"], permission=_WRITE_PERM)
    aud = audience if audience in ("rider", "driver") else "rider"
    items = await db.news.find(
        {"status": "published", "audience": {"$in": ["all", aud]}}, {"_id": 0}
    ).to_list(500)
    if country:
        zone = {"country": country.upper(), "state": state, "city": city}
        items = [n for n in items if scope_matches(n.get("scope"), zone)]
    items.sort(key=lambda n: (n.get("pinned", False), n.get("published_at") or n.get("created_at") or ""), reverse=True)
    return items


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
    updated = await db.news.find_one({"id": news_id}, {"_id": 0})
    # Push only when an article transitions from non-published to published.
    if payload["status"] == "published" and existing.get("status") != "published":
        await _notify_article_published(updated)
    return updated


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
    if new_status == "published":
        article = await db.news.find_one({"id": news_id}, {"_id": 0})
        await _notify_article_published(article)
    return {"id": news_id, "status": new_status}


@router.delete("/admin/{news_id}")
async def delete_news(news_id: str, request: Request):
    await require_role(request, ["admin"], permission=_WRITE_PERM)
    res = await db.news.delete_one({"id": news_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Article introuvable")
    return {"deleted": True, "id": news_id}


_SEED_NEWS = [
    {"title": "Bienvenue sur SB Drive VTC", "body": "Découvrez nos services de transport et de livraison, disponibles près de chez vous. Profitez de courses fiables et de livraisons rapides.", "audience": "all", "pinned": True},
    {"title": "Nouveau : suivez vos courses en temps réel", "body": "Suivez votre chauffeur en direct sur la carte, recevez l'ETA et partagez votre trajet avec vos proches en un tap.", "audience": "rider", "pinned": False},
]


async def seed_news():
    """Seed a couple of global published articles once (idempotent)."""
    if await db.news.count_documents({}) > 0:
        return
    now = _now()
    docs = [{
        "id": f"news_{uuid.uuid4().hex[:12]}",
        "title": a["title"], "body": a["body"], "image_url": "",
        "audience": a["audience"], "pinned": a["pinned"],
        "scope": {"country": "", "state": "", "city": ""},
        "status": "published", "views": 0, "created_at": now, "published_at": now,
    } for a in _SEED_NEWS]
    await db.news.insert_many(docs)
