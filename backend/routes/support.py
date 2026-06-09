"""
« Parler en direct » — support chat with an AI agent (GPT-4o-mini via Emergent
universal key) and human escalation to the admin support inbox.

Flow:
  - User (client / chauffeur / marchand) opens a thread and chats.
  - While status == 'ai', each user message gets an automatic AI reply.
  - User can tap « Parler à un conseiller » → status = 'escalated' → the admin
    sees it in the support inbox and replies (sender = 'agent').

Collections:
  - support_threads  : one active thread per user
  - support_messages : {thread_id, sender: user|ai|agent, text, created_at}
"""
import os
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Request, HTTPException

from core.config import db
from core.deps import get_current_user, require_role

router = APIRouter(prefix="/support", tags=["support"])

ROLE_LABEL = {"user": "client", "client": "client", "driver": "chauffeur",
              "merchant": "marchand", "admin": "client"}

SYSTEM_PROMPT = (
    "Tu es l'assistant virtuel de SB Drive VTC, une super-app de transport (VTC), "
    "livraison (repas, courses, fleurs, pharmacie...), services à la demande "
    "(bricoleur, coiffeur, ménage, mécanicien...) et marketplace. "
    "Réponds TOUJOURS en français, de façon concise (2 à 4 phrases), polie et utile. "
    "Tu aides aussi bien les CLIENTS que les CHAUFFEURS et les MARCHANDS.\n\n"
    "Connaissances clés :\n"
    "- Courses VTC : réserver depuis l'accueil, choisir le type de véhicule, suivre le "
    "chauffeur en temps réel, payer en espèces, portefeuille ou carte. L'annulation est "
    "possible mais des frais peuvent s'appliquer si elle est tardive ; trop d'annulations "
    "entraînent un avertissement puis une suspension temporaire.\n"
    "- Livraison : commander chez un marchand, suivre la commande, frais de livraison "
    "variables, réductions et « réduction flash » possibles.\n"
    "- Services à la demande : choisir une catégorie, un prestataire puis réserver une "
    "prestation (paiement espèces).\n"
    "- Portefeuille : recharger, payer, voir le solde. Parrainage : inviter des amis pour "
    "gagner des récompenses. Fidélité : gagner des points par course pour des réductions.\n"
    "- Chauffeurs : passer en ligne via le bouton vert « En ligne », accepter des courses, "
    "gains crédités au portefeuille, retraits vers IBAN, points de priorité, bouton SOS.\n"
    "- Marchands : gérer la boutique, les produits, les commandes, et la cuisine / réduction "
    "/ réduction flash dans les Paramètres.\n\n"
    "Règles : si tu ne connais pas la réponse, ou si la demande nécessite une action humaine "
    "(litige, remboursement, problème de compte, urgence, paiement), invite poliment "
    "l'utilisateur à cliquer sur « Parler à un conseiller » pour être mis en relation avec le "
    "support humain. Ne donne jamais d'informations sensibles."
)


def _now():
    return datetime.now(timezone.utc).isoformat()


async def _get_active_thread(user: dict):
    return await db.support_threads.find_one(
        {"user_id": user["id"], "status": {"$ne": "closed"}}, {"_id": 0}
    )


async def _create_thread(user: dict):
    role = ROLE_LABEL.get(user.get("role", "user"), "client")
    thread = {
        "id": f"sup_{uuid.uuid4().hex[:12]}",
        "user_id": user["id"],
        "user_role": role,
        "user_name": user.get("name") or user.get("email") or "Utilisateur",
        "user_phone": user.get("phone", ""),
        "status": "ai",
        "created_at": _now(),
        "updated_at": _now(),
        "last_message_at": _now(),
        "last_preview": "",
        "unread_admin": 0,
        "unread_user": 0,
    }
    await db.support_threads.insert_one(dict(thread))
    return thread


async def _add_message(thread_id: str, user_id: str, sender: str, text: str):
    msg = {
        "id": f"smsg_{uuid.uuid4().hex[:12]}",
        "thread_id": thread_id,
        "user_id": user_id,
        "sender": sender,
        "text": text,
        "created_at": _now(),
    }
    await db.support_messages.insert_one(dict(msg))
    return msg


async def _ai_reply(thread: dict, user_text: str, history: list) -> str:
    """Generate an AI answer with GPT-4o-mini, injecting recent transcript."""
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
    except Exception:
        return ("Notre assistant est momentanément indisponible. Cliquez sur "
                "« Parler à un conseiller » pour être mis en relation avec le support.")
    key = os.environ.get("EMERGENT_LLM_KEY")
    if not key:
        return ("Notre assistant est momentanément indisponible. Cliquez sur "
                "« Parler à un conseiller » pour être mis en relation avec le support.")
    system = SYSTEM_PROMPT + f"\n\n(Tu parles à un {thread.get('user_role', 'client')}.)"
    recent = [m for m in history if m["sender"] in ("user", "ai", "agent")][-10:]
    if recent:
        lines = []
        for m in recent:
            who = {"user": "Utilisateur", "ai": "Assistant", "agent": "Conseiller"}[m["sender"]]
            lines.append(f"{who}: {m['text']}")
        system += "\n\nHistorique récent :\n" + "\n".join(lines)
    try:
        chat = LlmChat(api_key=key, session_id=thread["id"], system_message=system).with_model("openai", "gpt-4o-mini")
        resp = await chat.send_message(UserMessage(text=user_text))
        return (resp or "").strip() or "Je n'ai pas compris, pouvez-vous reformuler ?"
    except Exception:
        return ("Désolé, je rencontre un souci technique. Cliquez sur « Parler à un "
                "conseiller » pour parler au support humain.")


# ── User endpoints ───────────────────────────────────────────────────────
@router.get("/me")
async def my_thread(request: Request):
    user = await get_current_user(request)
    thread = await _get_active_thread(user)
    if not thread:
        return {"thread": None, "messages": []}
    msgs = await db.support_messages.find(
        {"thread_id": thread["id"]}, {"_id": 0}
    ).sort("created_at", 1).to_list(500)
    # reading clears the user's unread counter
    await db.support_threads.update_one({"id": thread["id"]}, {"$set": {"unread_user": 0}})
    return {"thread": thread, "messages": msgs}


@router.post("/message")
async def send_message(request: Request):
    user = await get_current_user(request)
    body = await request.json()
    text = (body.get("text") or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Message vide")
    thread = await _get_active_thread(user) or await _create_thread(user)

    user_msg = await _add_message(thread["id"], user["id"], "user", text)
    update = {"updated_at": _now(), "last_message_at": _now(), "last_preview": text[:80]}
    out_messages = [user_msg]

    if thread["status"] == "escalated":
        # Human handling — flag for the admin inbox, no AI reply.
        update["unread_admin"] = int(thread.get("unread_admin", 0)) + 1
    else:
        history = await db.support_messages.find(
            {"thread_id": thread["id"]}, {"_id": 0}
        ).sort("created_at", 1).to_list(500)
        reply = await _ai_reply(thread, text, history)
        ai_msg = await _add_message(thread["id"], user["id"], "ai", reply)
        out_messages.append(ai_msg)
        update["last_preview"] = reply[:80]

    await db.support_threads.update_one({"id": thread["id"]}, {"$set": update})
    return {"thread_id": thread["id"], "status": thread["status"], "messages": out_messages}


@router.post("/escalate")
async def escalate(request: Request):
    user = await get_current_user(request)
    thread = await _get_active_thread(user) or await _create_thread(user)
    await db.support_threads.update_one(
        {"id": thread["id"]},
        {"$set": {"status": "escalated", "updated_at": _now(),
                  "unread_admin": int(thread.get("unread_admin", 0)) + 1}},
    )
    sys_msg = await _add_message(
        thread["id"], user["id"], "ai",
        "Je transfère votre demande à un conseiller. Un membre de notre équipe "
        "va vous répondre ici dès que possible.",
    )
    return {"status": "escalated", "messages": [sys_msg]}


# ── Admin support inbox ────────────────────────────────────────────────────
@router.get("/admin/threads")
async def admin_threads(request: Request, status: str = None):
    await require_role(request, ["admin"])
    query = {}
    if status:
        query["status"] = status
    threads = await db.support_threads.find(query, {"_id": 0}).sort("last_message_at", -1).to_list(300)
    return threads


@router.get("/admin/threads/{thread_id}")
async def admin_thread_messages(thread_id: str, request: Request):
    await require_role(request, ["admin"])
    thread = await db.support_threads.find_one({"id": thread_id}, {"_id": 0})
    if not thread:
        raise HTTPException(status_code=404, detail="Conversation introuvable")
    msgs = await db.support_messages.find(
        {"thread_id": thread_id}, {"_id": 0}
    ).sort("created_at", 1).to_list(500)
    await db.support_threads.update_one({"id": thread_id}, {"$set": {"unread_admin": 0}})
    return {"thread": thread, "messages": msgs}


@router.post("/admin/threads/{thread_id}/reply")
async def admin_reply(thread_id: str, request: Request):
    await require_role(request, ["admin"])
    body = await request.json()
    text = (body.get("text") or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Message vide")
    thread = await db.support_threads.find_one({"id": thread_id}, {"_id": 0})
    if not thread:
        raise HTTPException(status_code=404, detail="Conversation introuvable")
    if thread.get("status") == "closed":
        raise HTTPException(status_code=400, detail="Conversation clôturée")
    msg = await _add_message(thread_id, thread["user_id"], "agent", text)
    await db.support_threads.update_one(
        {"id": thread_id},
        {"$set": {"status": "escalated", "updated_at": _now(), "last_message_at": _now(),
                  "last_preview": text[:80], "unread_admin": 0},
         "$inc": {"unread_user": 1}},
    )
    return {"message": msg}


@router.post("/admin/threads/{thread_id}/close")
async def admin_close(thread_id: str, request: Request):
    await require_role(request, ["admin"])
    await db.support_threads.update_one({"id": thread_id}, {"$set": {"status": "closed", "updated_at": _now()}})
    return {"status": "closed"}
