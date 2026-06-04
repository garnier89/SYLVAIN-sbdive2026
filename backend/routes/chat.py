"""
In-app chat coursier ↔ client, rattaché à une livraison (colis) ou un transport médical.
Garde la conversation dans l'app (traçabilité, pas de partage de numéro).
Real-time via polling côté client (léger et robuste).
"""
from fastapi import APIRouter, Request, HTTPException
import uuid
from datetime import datetime, timezone

from core.config import db
from core.deps import get_current_user

router = APIRouter(prefix="/chat", tags=["chat"])

REF_COLLECTIONS = {"parcel": "parcels", "transport": "medical_transport"}


async def _resolve_thread(ref_type: str, ref_id: str, user: dict) -> dict:
    coll = REF_COLLECTIONS.get(ref_type)
    if not coll:
        raise HTTPException(status_code=400, detail="Type de conversation invalide")
    doc = await db[coll].find_one({"id": ref_id}, {"_id": 0, "user_id": 1, "driver_id": 1})
    if not doc:
        raise HTTPException(status_code=404, detail="Conversation introuvable")
    if user["id"] not in (doc.get("user_id"), doc.get("driver_id")) and user["role"] not in ["admin", "dispatcher"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    role = "client" if user["id"] == doc.get("user_id") else "driver"
    return {"doc": doc, "role": role}


@router.get("/{ref_type}/{ref_id}/messages")
async def list_messages(ref_type: str, ref_id: str, request: Request, after: str = None):
    user = await get_current_user(request)
    await _resolve_thread(ref_type, ref_id, user)
    query = {"ref_type": ref_type, "ref_id": ref_id}
    if after:
        query["created_at"] = {"$gt": after}
    msgs = await db.chat_messages.find(query, {"_id": 0}).sort("created_at", 1).to_list(200)
    # mark messages from the other party as read by this user
    await db.chat_messages.update_many(
        {"ref_type": ref_type, "ref_id": ref_id, "sender_id": {"$ne": user["id"]}, "read": False},
        {"$set": {"read": True}},
    )
    return msgs


@router.post("/{ref_type}/{ref_id}/messages")
async def send_message(ref_type: str, ref_id: str, request: Request):
    user = await get_current_user(request)
    thread = await _resolve_thread(ref_type, ref_id, user)
    body = await request.json()
    text = (body.get("text") or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Message vide")
    msg = {
        "id": f"msg_{uuid.uuid4().hex[:12]}",
        "ref_type": ref_type,
        "ref_id": ref_id,
        "sender_id": user["id"],
        "sender_role": thread["role"],
        "sender_name": user.get("name", "Utilisateur"),
        "text": text[:500],
        "read": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.chat_messages.insert_one(msg)
    msg.pop("_id", None)
    return msg


@router.get("/{ref_type}/{ref_id}/unread")
async def unread_count(ref_type: str, ref_id: str, request: Request):
    user = await get_current_user(request)
    await _resolve_thread(ref_type, ref_id, user)
    n = await db.chat_messages.count_documents(
        {"ref_type": ref_type, "ref_id": ref_id, "sender_id": {"$ne": user["id"]}, "read": False}
    )
    return {"unread": n}
