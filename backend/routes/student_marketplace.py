"""
SB Drive Student — Phase 6: Student marketplace (C2C) + AI (Gemini via Emergent LLM key).

A dedicated peer-to-peer marketplace for students with student-specific
categories (Livres, Logement, Coloc, Matériel, Services). Posting a listing is
reserved to VERIFIED students; browsing/buying is open to everyone logged in.
Purchases are settled instantly from the buyer's SB Pay wallet and credited to
the seller's wallet (C2C, no commission for students).

AI features (Gemini 3 Flash, same grounded pattern as routes/assistant.py):
  - /ai/suggest : fair-price estimate + auto-generated listing description.
  - /ai/search  : natural-language search over the real student catalog.

Everything lives under /api/student/marketplace and is fully isolated
(collection `student_listings` / `student_market_orders`).
"""
import os
import re
import json
import uuid
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, HTTPException, Request, Query
from pydantic import BaseModel

from core.config import db
from core.deps import get_current_user
from core.notifications import create_notification

router = APIRouter(prefix="/student/marketplace", tags=["student-marketplace"])

EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY", "")
MODEL_PROVIDER, MODEL_NAME = "gemini", "gemini-3-flash-preview"

CATEGORIES = [
    {"slug": "livres", "label": "Livres & manuels", "icon": "BookOpen"},
    {"slug": "logement", "label": "Logement", "icon": "House"},
    {"slug": "coloc", "label": "Coloc", "icon": "UsersThree"},
    {"slug": "materiel", "label": "Matériel", "icon": "Laptop"},
    {"slug": "services", "label": "Services", "icon": "Wrench"},
]
CATEGORY_SLUGS = {c["slug"] for c in CATEGORIES}
CATEGORY_LABELS = {c["slug"]: c["label"] for c in CATEGORIES}
CONDITIONS = {"neuf", "tres_bon", "bon", "use"}

BOOST_CONFIG_ID = "student_market_config"
DEFAULT_BOOST_CONFIG = {
    "id": BOOST_CONFIG_ID,
    "enabled": True,
    "plans": [
        {"id": "boost_3d", "days": 3, "points": 50, "price_eur": 1.0},
        {"id": "boost_7d", "days": 7, "points": 100, "price_eur": 2.0},
    ],
}


_SEARCH_STOPWORDS = {
    "cherche", "chercher", "veux", "voudrais", "besoin", "trouve", "trouver",
    "pour", "avec", "dans", "une", "des", "les", "pas", "cher", "chere",
    "moins", "petit", "grand", "marche", "etudiant", "etudiante", "vends",
}



def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


async def _is_verified_student(user_id: str) -> bool:
    p = await db.student_profiles.find_one({"user_id": user_id}, {"_id": 0, "status": 1})
    return bool(p and p.get("status") == "verified")


def _is_boosted(listing: dict) -> bool:
    bu = listing.get("boosted_until")
    if not bu:
        return False
    try:
        return datetime.fromisoformat(bu) > datetime.now(timezone.utc)
    except (ValueError, TypeError):
        return False


async def get_boost_config() -> dict:
    cfg = await db.student_market_config.find_one({"id": BOOST_CONFIG_ID}, {"_id": 0})
    if not cfg:
        cfg = {**DEFAULT_BOOST_CONFIG, "updated_at": _now()}
        await db.student_market_config.insert_one(dict(cfg))
        cfg.pop("_id", None)
    return cfg


# ======================= WALLET HELPERS =======================
async def _ensure_wallet(user_id: str) -> dict:
    w = await db.wallets.find_one({"user_id": user_id})
    if not w:
        w = {"user_id": user_id, "balance": 0.0, "currency": "EUR", "created_at": _now()}
        await db.wallets.insert_one(dict(w))
    return w


async def _wallet_tx(user_id: str, type_: str, amount: float, balance_after: float, description: str):
    await db.wallet_transactions.insert_one({
        "id": f"wtx_{uuid.uuid4().hex[:12]}", "user_id": user_id, "type": type_,
        "amount": round(amount, 2), "balance_after": round(balance_after, 2),
        "description": description, "created_at": _now(),
    })


# ======================= AI HELPERS =======================
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


# ======================= CATEGORIES =======================
@router.get("/categories")
async def categories(request: Request):
    await get_current_user(request)
    return {"categories": CATEGORIES, "conditions": sorted(CONDITIONS)}


# ======================= LISTINGS =======================
def _public_listing(l: dict) -> dict:
    return {
        "id": l.get("id"), "user_id": l.get("user_id"), "seller_name": l.get("seller_name"),
        "category": l.get("category"), "category_label": CATEGORY_LABELS.get(l.get("category"), l.get("category")),
        "title": l.get("title"), "description": l.get("description"), "price": l.get("price"),
        "currency": l.get("currency", "EUR"), "condition": l.get("condition"),
        "image_url": l.get("image_url"), "location": l.get("location"), "status": l.get("status"),
        "views": l.get("views", 0), "created_at": l.get("created_at"),
        "boosted": _is_boosted(l), "boosted_until": l.get("boosted_until"),
    }


@router.get("/listings")
async def list_listings(
    request: Request,
    category: str = Query(""), search: str = Query(""),
    limit: int = 60, skip: int = 0,
):
    await get_current_user(request)
    q = {"status": "active"}
    if category and category in CATEGORY_SLUGS:
        q["category"] = category
    if search:
        rx = {"$regex": re.escape(search), "$options": "i"}
        q["$or"] = [{"title": rx}, {"description": rx}]
    rows = await db.student_listings.find(q, {"_id": 0}).sort("created_at", -1).skip(max(0, skip)).limit(min(limit, 100)).to_list(min(limit, 100))
    total = await db.student_listings.count_documents(q)
    cards = [_public_listing(r) for r in rows]
    # Boosted listings float to the top of their list (most recent boost first).
    cards.sort(key=lambda c: (c["boosted"], c.get("boosted_until") or "", c.get("created_at") or ""), reverse=True)
    return {"listings": cards, "total": total}


@router.get("/my-listings")
async def my_listings(request: Request):
    user = await get_current_user(request)
    rows = await db.student_listings.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return {"listings": [_public_listing(r) for r in rows]}


@router.get("/listings/{listing_id}")
async def get_listing(listing_id: str, request: Request):
    await get_current_user(request)
    l = await db.student_listings.find_one({"id": listing_id}, {"_id": 0})
    if not l:
        raise HTTPException(status_code=404, detail="Annonce introuvable")
    await db.student_listings.update_one({"id": listing_id}, {"$inc": {"views": 1}})
    return _public_listing(l)


class ListingCreate(BaseModel):
    category: str
    title: str
    description: str = ""
    price: float
    condition: str = "bon"
    image_url: str | None = None
    location: str | None = ""


@router.post("/listings")
async def create_listing(body: ListingCreate, request: Request):
    user = await get_current_user(request)
    if not await _is_verified_student(user["id"]):
        raise HTTPException(status_code=403, detail="Réservé aux étudiants vérifiés. Validez votre statut SB Student pour publier.")
    if body.category not in CATEGORY_SLUGS:
        raise HTTPException(status_code=400, detail="Catégorie invalide")
    title = (body.title or "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="Titre requis")
    if body.price is None or body.price < 0:
        raise HTTPException(status_code=400, detail="Prix invalide")
    condition = body.condition if body.condition in CONDITIONS else "bon"
    listing = {
        "id": f"slist_{uuid.uuid4().hex[:12]}",
        "user_id": user["id"], "seller_name": user.get("name", "Étudiant"),
        "seller_phone": user.get("phone", ""),
        "category": body.category, "title": title[:140],
        "description": (body.description or "").strip()[:2000],
        "price": round(float(body.price), 2), "currency": "EUR",
        "condition": condition, "image_url": (body.image_url or None),
        "location": (body.location or "").strip()[:120],
        "status": "active", "views": 0, "created_at": _now(),
    }
    await db.student_listings.insert_one(dict(listing))
    return {"ok": True, "listing": _public_listing(listing)}


@router.delete("/listings/{listing_id}")
async def delete_listing(listing_id: str, request: Request):
    user = await get_current_user(request)
    r = await db.student_listings.delete_one({"id": listing_id, "user_id": user["id"]})
    if not r.deleted_count:
        raise HTTPException(status_code=404, detail="Annonce introuvable")
    return {"ok": True}


# ======================= BOOST (Top annonce) =======================
@router.get("/boost/plans")
async def boost_plans(request: Request):
    user = await get_current_user(request)
    cfg = await get_boost_config()
    balance = 0
    try:
        from routes.student_rewards import get_balance
        balance = await get_balance(user["id"])
    except Exception:
        balance = 0
    return {"enabled": cfg.get("enabled", True), "plans": cfg.get("plans", []), "points_balance": balance}


class BoostBody(BaseModel):
    plan_id: str
    method: str = "wallet"  # wallet | points


@router.post("/listings/{listing_id}/boost")
async def boost_listing(listing_id: str, body: BoostBody, request: Request):
    user = await get_current_user(request)
    listing = await db.student_listings.find_one({"id": listing_id}, {"_id": 0})
    if not listing:
        raise HTTPException(status_code=404, detail="Annonce introuvable")
    if listing["user_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Vous n'êtes pas le propriétaire de cette annonce")
    if listing.get("status") != "active":
        raise HTTPException(status_code=400, detail="Seules les annonces actives peuvent être boostées")
    cfg = await get_boost_config()
    if not cfg.get("enabled", True):
        raise HTTPException(status_code=400, detail="Le boost est désactivé")
    plan = next((p for p in cfg.get("plans", []) if p.get("id") == body.plan_id), None)
    if not plan:
        raise HTTPException(status_code=404, detail="Forfait de boost introuvable")
    method = body.method if body.method in ("wallet", "points") else "wallet"
    days = int(plan.get("days", 0) or 0)

    charged_amount, charged_points = 0.0, 0
    if method == "points":
        from routes.student_rewards import get_balance, award_points
        cost = int(plan.get("points", 0) or 0)
        bal = await get_balance(user["id"])
        if bal < cost:
            raise HTTPException(status_code=400, detail=f"Points insuffisants ({bal}/{cost})")
        await award_points(user["id"], -cost, f"boost:{listing_id}", None)
        charged_points = cost
    else:
        price = round(float(plan.get("price_eur", 0) or 0), 2)
        w = await _ensure_wallet(user["id"])
        if float(w.get("balance", 0)) < price:
            raise HTTPException(status_code=400, detail="Solde portefeuille insuffisant. Rechargez votre SB Pay.")
        new_bal = round(float(w["balance"]) - price, 2)
        await db.wallets.update_one({"user_id": user["id"]}, {"$set": {"balance": new_bal}})
        await _wallet_tx(user["id"], "Boost annonce", -price, new_bal, f"Top annonce · {listing['title']}")
        charged_amount = price

    # Extend boost from the later of now / current expiry.
    base = datetime.now(timezone.utc)
    if _is_boosted(listing):
        try:
            base = max(base, datetime.fromisoformat(listing["boosted_until"]))
        except (ValueError, TypeError):
            pass
    new_until = (base + timedelta(days=days)).isoformat()
    await db.student_listings.update_one({"id": listing_id}, {"$set": {"boosted_until": new_until, "boosted_at": _now()}})

    await db.student_market_boosts.insert_one({
        "id": f"sbst_{uuid.uuid4().hex[:12]}", "listing_id": listing_id, "user_id": user["id"],
        "plan_id": plan["id"], "days": days, "method": method,
        "amount_eur": charged_amount, "points": charged_points,
        "boosted_until": new_until, "created_at": _now(),
    })
    return {"ok": True, "boosted_until": new_until, "method": method,
            "amount_eur": charged_amount, "points": charged_points}



# ======================= BUY (wallet C2C) =======================
@router.post("/listings/{listing_id}/buy")
async def buy_listing(listing_id: str, request: Request):
    buyer = await get_current_user(request)
    listing = await db.student_listings.find_one({"id": listing_id}, {"_id": 0})
    if not listing:
        raise HTTPException(status_code=404, detail="Annonce introuvable")
    if listing.get("status") != "active":
        raise HTTPException(status_code=400, detail="Cette annonce n'est plus disponible")
    if listing["user_id"] == buyer["id"]:
        raise HTTPException(status_code=400, detail="Vous ne pouvez pas acheter votre propre annonce")
    price = round(float(listing["price"]), 2)
    w = await _ensure_wallet(buyer["id"])
    if float(w.get("balance", 0)) < price:
        raise HTTPException(status_code=400, detail="Solde portefeuille insuffisant. Rechargez votre SB Pay.")

    # Debit buyer
    buyer_bal = round(float(w["balance"]) - price, 2)
    await db.wallets.update_one({"user_id": buyer["id"]}, {"$set": {"balance": buyer_bal}})
    await _wallet_tx(buyer["id"], "Achat étudiant", -price, buyer_bal, f"Achat · {listing['title']}")

    # Credit seller (full amount, no commission for students)
    sw = await _ensure_wallet(listing["user_id"])
    seller_bal = round(float(sw["balance"]) + price, 2)
    await db.wallets.update_one({"user_id": listing["user_id"]}, {"$set": {"balance": seller_bal}})
    await _wallet_tx(listing["user_id"], "Vente étudiante", price, seller_bal, f"Vente · {listing['title']}")

    order = {
        "id": f"smo_{uuid.uuid4().hex[:12]}", "listing_id": listing_id,
        "listing_title": listing["title"], "category": listing.get("category"),
        "image_url": listing.get("image_url"),
        "buyer_id": buyer["id"], "buyer_name": buyer.get("name", "Acheteur"),
        "seller_id": listing["user_id"], "seller_name": listing.get("seller_name", "Vendeur"),
        "amount": price, "payment_method": "wallet", "status": "paid", "created_at": _now(),
    }
    await db.student_market_orders.insert_one(dict(order))
    await db.student_listings.update_one({"id": listing_id}, {"$set": {"status": "sold", "sold_at": _now()}})

    try:
        await create_notification(
            listing["user_id"], "student_marketplace", f"Vente · {listing['title']}",
            f"{buyer.get('name', 'Un étudiant')} a acheté votre annonce. {price:.2f} € crédités sur votre portefeuille.",
            data={"order_id": order["id"], "listing_id": listing_id})
    except Exception:
        pass
    order.pop("_id", None)
    return {"ok": True, "order": order, "balance": buyer_bal}


@router.get("/orders")
async def my_orders(request: Request):
    user = await get_current_user(request)
    rows = await db.student_market_orders.find({"buyer_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return {"orders": rows}


@router.get("/sales")
async def my_sales(request: Request):
    user = await get_current_user(request)
    rows = await db.student_market_orders.find({"seller_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return {"orders": rows}


# ======================= AI: price + description =======================
SUGGEST_SYS = (
    "Tu es l'assistant IA de la marketplace étudiante SB Student. À partir d'un article qu'un étudiant veut vendre "
    "(catégorie, titre, état, détails), tu estimes un PRIX JUSTE d'occasion entre étudiants en euros et tu rédiges "
    "une description d'annonce courte, honnête et attractive (2-3 phrases, en français, tutoiement amical). "
    "Catégories possibles : Livres & manuels, Logement, Coloc, Matériel, Services. "
    "Renvoie UNIQUEMENT un objet JSON valide sans texte autour : "
    '{"suggested_price": <nombre EUR>, "price_low": <nombre>, "price_high": <nombre>, '
    '"description": "<texte d\'annonce>", "tips": "<1 court conseil pour vendre vite>"}. '
    "Les prix doivent être réalistes pour un budget étudiant."
)


class SuggestBody(BaseModel):
    category: str
    title: str
    condition: str = "bon"
    details: str = ""


@router.post("/ai/suggest")
async def ai_suggest(body: SuggestBody, request: Request):
    await get_current_user(request)
    if not EMERGENT_LLM_KEY:
        raise HTTPException(status_code=503, detail="IA non configurée (clé LLM manquante).")
    cat_label = CATEGORY_LABELS.get(body.category, body.category)
    cond_label = {"neuf": "neuf", "tres_bon": "très bon état", "bon": "bon état", "use": "usé"}.get(body.condition, body.condition)
    prompt = (
        f"Catégorie : {cat_label}\nTitre : {body.title}\nÉtat : {cond_label}\n"
        f"Détails : {body.details or '(aucun)'}\n\nEstime le prix juste et rédige l'annonce."
    )
    try:
        raw = await _ask(f"smkt-suggest-{uuid.uuid4().hex[:8]}", SUGGEST_SYS, prompt)
        out = _parse_json(raw)
    except Exception:
        out = {}
    if not out.get("description"):
        raise HTTPException(status_code=502, detail="L'IA n'a pas pu générer de suggestion. Réessayez.")
    return {
        "suggested_price": out.get("suggested_price"),
        "price_low": out.get("price_low"),
        "price_high": out.get("price_high"),
        "description": (out.get("description") or "").strip(),
        "tips": (out.get("tips") or "").strip(),
    }


# ======================= AI: smart search =======================
SEARCH_INTENT_SYS = (
    "Tu analyses la requête d'un étudiant cherchant un article sur la marketplace étudiante. "
    "Renvoie UNIQUEMENT un JSON valide : "
    '{"keywords": "<mots-clés de recherche ou \'\'>", '
    f'"category": un de {sorted(CATEGORY_SLUGS)} ou null, '
    '"max_price": <nombre ou null>, "sort": "cheapest"|null}. '
    "livres=manuels/livres ; logement=appartement/studio/chambre à louer ; coloc=colocation/colocataire ; "
    "materiel=ordinateur/calculatrice/meuble/électronique ; services=cours particuliers/déménagement/aide."
)

SEARCH_REPLY_SYS = (
    "Tu es l'assistant de la marketplace étudiante SB Student, amical et concis (français, tutoiement). "
    "Tu ne dois JAMAIS inventer d'annonces ou de prix : utilise UNIQUEMENT les résultats fournis. "
    "S'il n'y a aucun résultat, dis-le gentiment et propose de reformuler. Réponds en 1-2 phrases."
)


class SearchBody(BaseModel):
    query: str


@router.post("/ai/search")
async def ai_search(body: SearchBody, request: Request):
    await get_current_user(request)
    message = (body.query or "").strip()
    if not message:
        raise HTTPException(status_code=400, detail="Requête vide")
    if not EMERGENT_LLM_KEY:
        raise HTTPException(status_code=503, detail="IA non configurée (clé LLM manquante).")

    # 1) intent
    try:
        raw = await _ask(f"smkt-intent-{uuid.uuid4().hex[:8]}", SEARCH_INTENT_SYS, f"Requête : {message}")
        intent = _parse_json(raw)
    except Exception:
        intent = {}

    # 2) ground on the real catalog
    q = {"status": "active"}
    cat = intent.get("category")
    if cat in CATEGORY_SLUGS:
        q["category"] = cat
    kw = (intent.get("keywords") or message).strip()
    words = [w for w in re.split(r"[\s,]+", kw) if len(w) >= 3 and w.lower() not in _SEARCH_STOPWORDS]
    if words:
        ors = []
        for w in words:
            rx = {"$regex": re.escape(w), "$options": "i"}
            ors += [{"title": rx}, {"description": rx}]
        q["$or"] = ors
    if intent.get("max_price"):
        try:
            q["price"] = {"$lte": float(intent["max_price"])}
        except (TypeError, ValueError):
            pass
    sort = [("price", 1)] if intent.get("sort") == "cheapest" else [("created_at", -1)]
    rows = await db.student_listings.find(q, {"_id": 0}).sort(sort).limit(12).to_list(12)
    listings = [_public_listing(r) for r in rows]

    # 3) compose reply
    ctx = [{"titre": l["title"], "prix": l["price"], "categorie": l["category_label"]} for l in listings]
    try:
        reply = await _ask(
            f"smkt-reply-{uuid.uuid4().hex[:8]}", SEARCH_REPLY_SYS,
            f"Requête : {message}\nRésultats (UNIQUEMENT ceux-ci) : {json.dumps(ctx, ensure_ascii=False)}\nRédige une réponse courte.")
        reply = (reply or "").strip()
    except Exception:
        reply = ""
    if not reply:
        reply = (f"J'ai trouvé {len(listings)} annonce(s) qui pourraient t'intéresser."
                 if listings else "Je n'ai rien trouvé pour cette recherche. Essaie d'autres mots-clés.")
    return {"reply": reply, "listings": listings, "category": cat}



# ======================= ADMIN (boost config + revenue) =======================
async def _require_admin(request: Request):
    user = await get_current_user(request)
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    return user


@router.get("/admin/boost/config")
async def admin_boost_config(request: Request):
    await _require_admin(request)
    return await get_boost_config()


class BoostPlan(BaseModel):
    id: str | None = None
    days: int
    points: int
    price_eur: float


class BoostConfigUpdate(BaseModel):
    enabled: bool | None = None
    plans: list[BoostPlan] | None = None


@router.put("/admin/boost/config")
async def admin_update_boost_config(body: BoostConfigUpdate, request: Request):
    await _require_admin(request)
    await get_boost_config()
    update = {}
    if body.enabled is not None:
        update["enabled"] = bool(body.enabled)
    if body.plans is not None:
        plans = []
        for p in body.plans:
            days = max(1, int(p.days))
            plans.append({
                "id": p.id or f"boost_{days}d",
                "days": days,
                "points": max(0, int(p.points)),
                "price_eur": max(0.0, round(float(p.price_eur), 2)),
            })
        update["plans"] = plans
    if update:
        update["updated_at"] = _now()
        await db.student_market_config.update_one({"id": BOOST_CONFIG_ID}, {"$set": update}, upsert=True)
    return await get_boost_config()


@router.get("/admin/boost/revenue")
async def admin_boost_revenue(request: Request):
    await _require_admin(request)
    rows = await db.student_market_boosts.find({}, {"_id": 0}).to_list(20000)
    total_eur = round(sum(float(r.get("amount_eur", 0) or 0) for r in rows), 2)
    total_points = int(sum(int(r.get("points", 0) or 0) for r in rows))
    active = await db.student_listings.count_documents({"boosted_until": {"$gt": _now()}})
    recent = await db.student_market_boosts.find({}, {"_id": 0}).sort("created_at", -1).limit(20).to_list(20)
    return {
        "total_boosts": len(rows), "revenue_eur": total_eur, "points_spent": total_points,
        "active_boosts": active, "recent": recent,
    }
