import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Request, HTTPException

from core.config import db
from core.deps import get_current_user

router = APIRouter(tags=["donations", "livechat"])


# ═══════════ DONATIONS ═══════════

@router.get("/donations")
async def get_donations(request: Request):
    """Get active donation campaigns."""
    await get_current_user(request)
    donations = await db.donations.find(
        {"status": "active"},
        {"_id": 0}
    ).sort("display_order", 1).to_list(50)
    return donations


@router.post("/donations", tags=["admin"])
async def create_donation(request: Request):
    """Admin: Create a donation campaign."""
    user = await get_current_user(request)
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    body = await request.json()
    doc = {
        "id": f"don_{uuid.uuid4().hex[:12]}",
        "title": body.get("title", ""),
        "description": body.get("description", ""),
        "image": body.get("image", ""),
        "link": body.get("link", ""),
        "status": "active",
        "display_order": body.get("display_order", 0),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.donations.insert_one(doc)
    doc.pop("_id", None)
    return doc


# ═══════════ LIVE CHAT ═══════════

@router.get("/livechat/messages")
async def get_chat_messages(request: Request):
    """Get chat messages for the current user."""
    user = await get_current_user(request)
    messages = await db.livechat_messages.find(
        {"user_id": user["id"]},
        {"_id": 0}
    ).sort("created_at", 1).to_list(200)
    return messages


@router.post("/livechat/send")
async def send_chat_message(request: Request):
    """Send a message in live chat."""
    user = await get_current_user(request)
    body = await request.json()
    message = body.get("message", "").strip()
    if not message:
        raise HTTPException(status_code=400, detail="Message vide")

    now = datetime.now(timezone.utc).isoformat()

    # Save user message
    user_msg = {
        "id": f"msg_{uuid.uuid4().hex[:12]}",
        "user_id": user["id"],
        "sender": "user",
        "message": message,
        "created_at": now,
    }
    await db.livechat_messages.insert_one(user_msg)
    user_msg.pop("_id", None)

    # Auto-reply from support (simulated)
    auto_replies = {
        "bonjour": "Bonjour ! Comment puis-je vous aider aujourd'hui ?",
        "aide": "Je suis là pour vous aider. Quel est votre problème ?",
        "course": "Pour toute question sur vos courses, consultez l'historique dans votre profil ou décrivez votre problème ici.",
        "paiement": "Pour les problèmes de paiement, vérifiez votre portefeuille. Si le problème persiste, décrivez-le ici.",
        "annul": "Pour annuler une course, allez dans vos réservations. Des frais d'annulation peuvent s'appliquer.",
    }

    reply_text = None
    msg_lower = message.lower()
    for keyword, reply in auto_replies.items():
        if keyword in msg_lower:
            reply_text = reply
            break

    if not reply_text:
        reply_text = "Merci pour votre message. Un agent va vous répondre sous peu. En attendant, n'hésitez pas à détailler votre demande."

    reply_msg = {
        "id": f"msg_{uuid.uuid4().hex[:12]}",
        "user_id": user["id"],
        "sender": "support",
        "message": reply_text,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.livechat_messages.insert_one(reply_msg)
    reply_msg.pop("_id", None)

    return {"user_message": user_msg, "reply": reply_msg}
