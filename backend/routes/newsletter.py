"""
Newsletter (parité Xjekplus / V3Cube).

Distinct from News (in-app articles) and Promo Banners (home carousel).
Lets clients subscribe with their email, and lets the admin send email
campaigns to all active subscribers via Resend, keeping a campaign history.

Collections:
  - newsletter_subscribers : {id, email, name, status: active|unsubscribed, created_at}
  - newsletter_campaigns   : {id, subject, body, recipients, status, sent_at}
"""
from fastapi import APIRouter, Request, HTTPException
from datetime import datetime, timezone
import os
import uuid
import asyncio

from core.config import db
from core.deps import require_role

router = APIRouter(prefix="/newsletter", tags=["newsletter"])

_SEND_PERM = "users.newsletter.send"

_SEED_SUBSCRIBERS = [
    ("marie.l@email.com", "Marie L.", "active"),
    ("jean.d@email.com", "Jean D.", "active"),
    ("amadou.b@email.com", "Amadou B.", "active"),
    ("sophie.m@email.com", "Sophie M.", "unsubscribed"),
]


async def seed_newsletter():
    """Idempotent seed of a few demo subscribers."""
    if await db.newsletter_subscribers.count_documents({}) > 0:
        return
    now = datetime.now(timezone.utc).isoformat()
    docs = [
        {
            "id": f"sub_{uuid.uuid4().hex[:10]}",
            "email": email,
            "name": name,
            "status": status,
            "created_at": now,
        }
        for (email, name, status) in _SEED_SUBSCRIBERS
    ]
    await db.newsletter_subscribers.insert_many(docs)


def _public(doc: dict) -> dict:
    doc.pop("_id", None)
    return doc


# ===== Public =====

@router.post("/subscribe")
async def subscribe(request: Request):
    """Public: a visitor subscribes with their email."""
    body = await request.json()
    email = (body.get("email") or "").strip().lower()
    name = (body.get("name") or "").strip()
    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="Email invalide")
    existing = await db.newsletter_subscribers.find_one({"email": email})
    if existing:
        await db.newsletter_subscribers.update_one(
            {"email": email}, {"$set": {"status": "active", "name": name or existing.get("name", "")}}
        )
        return {"message": "Déjà abonné", "status": "active"}
    doc = {
        "id": f"sub_{uuid.uuid4().hex[:10]}",
        "email": email,
        "name": name,
        "status": "active",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.newsletter_subscribers.insert_one(doc)
    return {"message": "Abonnement réussi", "status": "active"}


# ===== Admin =====

@router.get("/admin/subscribers")
async def list_subscribers(request: Request):
    await require_role(request, ["admin"], permission=_SEND_PERM)
    items = await db.newsletter_subscribers.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    active = sum(1 for s in items if s.get("status") == "active")
    return {
        "subscribers": items,
        "total": len(items),
        "active": active,
        "unsubscribed": len(items) - active,
    }


@router.delete("/admin/subscribers/{sub_id}")
async def delete_subscriber(sub_id: str, request: Request):
    await require_role(request, ["admin"], permission=_SEND_PERM)
    result = await db.newsletter_subscribers.delete_one({"id": sub_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Abonné introuvable")
    return {"message": "Supprimé"}


@router.get("/admin/campaigns")
async def list_campaigns(request: Request):
    await require_role(request, ["admin"], permission=_SEND_PERM)
    items = await db.newsletter_campaigns.find({}, {"_id": 0}).sort("sent_at", -1).to_list(100)
    return items


@router.post("/admin/send")
async def send_newsletter(request: Request):
    await require_role(request, ["admin"], permission=_SEND_PERM)
    body = await request.json()
    subject = (body.get("subject") or "").strip()
    content = (body.get("body") or "").strip()
    if not subject or not content:
        raise HTTPException(status_code=400, detail="Sujet et contenu requis")

    recipients = await db.newsletter_subscribers.find(
        {"status": "active"}, {"_id": 0, "email": 1}
    ).to_list(5000)
    emails = [r["email"] for r in recipients if r.get("email")]

    status = "recorded"
    error = None
    api_key = os.environ.get("RESEND_API_KEY")
    if api_key and emails:
        try:
            import resend
            resend.api_key = api_key
            sender = os.environ.get("SENDER_EMAIL") or "onboarding@resend.dev"
            html = f"<div style='font-family:sans-serif;line-height:1.6'>{content}</div>"
            await asyncio.to_thread(
                resend.Emails.send,
                {"from": f"SB Drive VTC <{sender}>", "to": emails, "subject": subject, "html": html},
            )
            status = "sent"
        except Exception as e:  # noqa: BLE001
            status = "failed"
            error = str(e)[:300]

    campaign = {
        "id": f"camp_{uuid.uuid4().hex[:10]}",
        "subject": subject,
        "body": content,
        "recipients": len(emails),
        "status": status,
        "error": error,
        "sent_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.newsletter_campaigns.insert_one(dict(campaign))
    campaign.pop("_id", None)
    return campaign
