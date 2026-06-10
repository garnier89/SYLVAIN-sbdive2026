"""
SB Assistant — AI shopping assistant (Gemini 3 Flash via Emergent LLM key).

emergentintegrations has no native function-calling, so we use the recommended
grounded pattern:
  1. LLM extracts a structured search intent (JSON) from the message + history.
  2. We query the REAL catalog (db.products / db.merchants) ourselves.
  3. LLM composes a short French reply grounded ONLY on those results.
Nothing is invented — every product/merchant shown comes from the database.
"""
import os
import re
import json
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Request, HTTPException

from core.config import db
from core.deps import get_current_user

router = APIRouter(prefix="/assistant", tags=["assistant"])

EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY", "")
MODEL_PROVIDER, MODEL_NAME = "gemini", "gemini-3-flash-preview"
STORE_TYPES = ["restaurant", "grocery", "florist", "wine", "stationery", "construction"]

INTENT_SYS = (
    "Tu es l'analyseur d'intention d'un assistant de shopping (livraison & boutiques locales). "
    "À partir du message client et de l'historique, renvoie UNIQUEMENT un objet JSON valide, sans texte autour, "
    "avec ces clés : "
    '{"intent": "search_products"|"search_merchants"|"chat", '
    '"keywords": "<termes de recherche ou \'\'>", '
    f'"store_type": un de {STORE_TYPES} ou null, '
    '"max_price": nombre ou null, '
    '"open_now": true|false, '
    '"sort": "cheapest"|"rating"|null}. '
    "search_products = le client cherche un article/plat précis (ex: baguette, pizza, vin). "
    "search_merchants = le client cherche un type de commerce (ex: une épicerie, un restaurant, un fleuriste). "
    "chat = salutation ou question générale. Réponds en JSON strict."
)

REPLY_SYS = (
    "Tu es SB Assistant, l'assistant shopping de l'app SB (livraison & commerces locaux), chaleureux et concis. "
    "Tu réponds en français. Tu ne dois JAMAIS inventer de produits, prix ou commerces : utilise UNIQUEMENT "
    "les résultats fournis. S'il n'y a aucun résultat, dis-le gentiment et propose de reformuler ou une alternative. "
    "Sois bref (2-3 phrases), invite à commander quand c'est pertinent. N'invente pas d'horaires."
)


def _new_chat(session_suffix: str, system: str):
    from emergentintegrations.llm.chat import LlmChat
    return LlmChat(api_key=EMERGENT_LLM_KEY, session_id=session_suffix, system_message=system).with_model(MODEL_PROVIDER, MODEL_NAME)


async def _ask(session_suffix: str, system: str, text: str) -> str:
    from emergentintegrations.llm.chat import UserMessage
    chat = _new_chat(session_suffix, system)
    return await chat.send_message(UserMessage(text=text))


def _parse_json(raw: str) -> dict:
    if not raw:
        return {}
    raw = raw.strip()
    if raw.startswith("```"):
        raw = raw.strip("`")
        raw = re.sub(r"^json\s*", "", raw, flags=re.I)
    m = re.search(r"\{.*\}", raw, re.DOTALL)
    try:
        return json.loads(m.group(0)) if m else {}
    except (json.JSONDecodeError, ValueError):
        return {}


def _is_open(opening_hours: str) -> bool:
    if not opening_hours or "-" not in opening_hours:
        return True  # unknown hours → don't claim closed
    try:
        from zoneinfo import ZoneInfo
        now = datetime.now(ZoneInfo("Europe/Paris"))
    except Exception:
        now = datetime.now(timezone.utc)
    cur = now.hour * 60 + now.minute
    try:
        start_s, end_s = opening_hours.split("-")
        sh, sm = [int(x) for x in start_s.split(":")]
        eh, em = [int(x) for x in end_s.split(":")]
        start, end = sh * 60 + sm, eh * 60 + em
    except (ValueError, IndexError):
        return True
    return start <= cur <= end if end >= start else (cur >= start or cur <= end)


async def _merchant_card(m: dict) -> dict:
    return {
        "id": m.get("id"), "store_name": m.get("store_name"), "store_type": m.get("store_type"),
        "cuisine": m.get("cuisine"), "rating": m.get("rating"), "eta_min": m.get("eta_min"),
        "delivery_fee": m.get("delivery_fee"), "discount_pct": m.get("discount_pct"),
        "address": m.get("address"), "image_url": m.get("image_url"),
        "open": _is_open(m.get("opening_hours")), "opening_hours": m.get("opening_hours"),
    }


_STOPWORDS = {
    "ouvert", "ouverte", "ouverts", "ouvertes", "maintenant", "près", "pres", "proche", "autour",
    "restaurant", "restaurants", "resto", "commerce", "commerces", "magasin", "magasins", "boutique",
    "boutiques", "trouve", "trouver", "cherche", "chercher", "veux", "voudrais", "besoin", "moi",
    "une", "un", "des", "du", "de", "la", "le", "les", "pas", "cher", "chere", "chère", "moins",
    "produit", "produits", "article", "articles", "svp", "stp",
}


def _clean_keywords(kw: str) -> str:
    if not kw:
        return ""
    words = [w for w in re.split(r"[\s,]+", kw.strip()) if w and w.lower() not in _STOPWORDS]
    return " ".join(words).strip()


async def search_merchants(intent: dict) -> list:
    q = {"is_active": True}
    if intent.get("store_type") in STORE_TYPES:
        q["store_type"] = intent["store_type"]
    kw = _clean_keywords(intent.get("keywords") or "")
    if kw:
        rx = {"$regex": re.escape(kw), "$options": "i"}
        q["$or"] = [{"store_name": rx}, {"cuisine": rx}, {"description": rx}]
    rows = await db.merchants.find(q, {"_id": 0}).sort("rating", -1).to_list(20)
    cards = [await _merchant_card(m) for m in rows]
    if intent.get("open_now"):
        cards = [c for c in cards if c["open"]]
    return cards[:6]


async def search_products(intent: dict) -> list:
    q = {"is_available": True}
    kw = _clean_keywords(intent.get("keywords") or "")
    if kw:
        rx = {"$regex": re.escape(kw), "$options": "i"}
        q["$or"] = [{"name": rx}, {"description": rx}, {"category": rx}]
    if intent.get("max_price"):
        try:
            q["price"] = {"$lte": float(intent["max_price"])}
        except (TypeError, ValueError):
            pass
    rows = await db.products.find(q, {"_id": 0}).to_list(60)

    # Resolve merchant info (+ optional store_type filter).
    mids = list({r.get("merchant_id") for r in rows})
    merchants = {m["id"]: m async for m in db.merchants.find({"id": {"$in": mids}}, {"_id": 0})}
    store_type = intent.get("store_type") if intent.get("store_type") in STORE_TYPES else None
    out = []
    for r in rows:
        m = merchants.get(r.get("merchant_id"), {})
        if store_type and m.get("store_type") != store_type:
            continue
        if intent.get("open_now") and not _is_open(m.get("opening_hours")):
            continue
        out.append({
            "id": r.get("id"), "name": r.get("name"), "price": r.get("price"),
            "category": r.get("category"), "description": r.get("description"),
            "image_url": r.get("image_url"), "merchant_id": r.get("merchant_id"),
            "merchant_name": m.get("store_name"), "eta_min": m.get("eta_min"),
            "delivery_fee": m.get("delivery_fee"), "open": _is_open(m.get("opening_hours")),
        })
    out.sort(key=lambda p: (p.get("price") or 1e9) if intent.get("sort") == "cheapest" else 0)
    return out[:8]


@router.post("/chat")
async def assistant_chat(request: Request):
    user = await get_current_user(request)
    if not EMERGENT_LLM_KEY:
        raise HTTPException(status_code=503, detail="Assistant IA non configuré (clé LLM manquante).")
    body = await request.json()
    message = (body.get("message") or "").strip()
    if not message:
        raise HTTPException(status_code=400, detail="Message vide")
    session_id = body.get("session_id") or f"asst_{uuid.uuid4().hex[:12]}"

    session = await db.assistant_sessions.find_one({"id": session_id}, {"_id": 0})
    history = (session or {}).get("messages", [])
    hist_text = "\n".join(f"{m['role']}: {m['content']}" for m in history[-6:]) or "(début de conversation)"

    # 1) Intent extraction.
    try:
        raw = await _ask(f"{session_id}-intent", INTENT_SYS,
                         f"Historique:\n{hist_text}\n\nMessage client: {message}")
        intent = _parse_json(raw)
    except Exception:
        intent = {}
    if not intent.get("intent"):
        # Heuristic fallback so the assistant still works if the LLM hiccups.
        intent = {"intent": "search_products", "keywords": message, "open_now": False}

    # 2) Ground on the real catalog.
    products, merchants = [], []
    if intent.get("intent") == "search_products":
        products = await search_products(intent)
        if not products:
            merchants = await search_merchants(intent)
    elif intent.get("intent") == "search_merchants":
        merchants = await search_merchants(intent)

    # 3) Compose a grounded reply.
    ctx = {"produits": [{"name": p["name"], "price": p["price"], "merchant": p["merchant_name"]} for p in products],
           "commerces": [{"nom": m["store_name"], "type": m["store_type"], "ouvert": m["open"], "note": m["rating"]} for m in merchants]}
    try:
        reply = await _ask(f"{session_id}-reply", REPLY_SYS,
                           f"Message client: {message}\nRésultats trouvés (UNIQUEMENT ceux-ci): {json.dumps(ctx, ensure_ascii=False)}\nRédige une réponse courte et utile.")
        reply = (reply or "").strip()
    except Exception:
        reply = ("Voici ce que j'ai trouvé." if (products or merchants)
                 else "Je n'ai rien trouvé pour cette recherche. Pouvez-vous reformuler ?")
    if not reply:
        reply = "Voici ce que j'ai trouvé." if (products or merchants) else "Je n'ai rien trouvé. Essayez d'autres mots-clés."

    now = datetime.now(timezone.utc).isoformat()
    new_msgs = history + [
        {"role": "user", "content": message, "ts": now},
        {"role": "assistant", "content": reply, "ts": now},
    ]
    await db.assistant_sessions.update_one(
        {"id": session_id},
        {"$set": {"messages": new_msgs[-40:], "user_id": user["id"], "updated_at": now},
         "$setOnInsert": {"id": session_id, "created_at": now}},
        upsert=True,
    )
    return {"session_id": session_id, "reply": reply, "products": products, "merchants": merchants,
            "intent": intent.get("intent")}


@router.get("/sessions/{session_id}")
async def assistant_history(session_id: str, request: Request):
    user = await get_current_user(request)
    s = await db.assistant_sessions.find_one({"id": session_id, "user_id": user["id"]}, {"_id": 0})
    if not s:
        raise HTTPException(status_code=404, detail="Session introuvable")
    return {"session_id": session_id, "messages": s.get("messages", [])}
