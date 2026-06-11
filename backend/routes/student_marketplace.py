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


# ======================= SELLER REPUTATION =======================
SELLER_CONFIG_ID = "student_seller_config"
DEFAULT_SELLER_CONFIG = {"id": SELLER_CONFIG_ID, "trusted_min_sales": 5, "trusted_min_rating": 4.5}


async def get_seller_config() -> dict:
    cfg = await db.student_seller_config.find_one({"id": SELLER_CONFIG_ID}, {"_id": 0})
    if not cfg:
        cfg = {**DEFAULT_SELLER_CONFIG, "updated_at": _now()}
        await db.student_seller_config.insert_one(dict(cfg))
        cfg.pop("_id", None)
    return {**DEFAULT_SELLER_CONFIG, **cfg}


async def recompute_seller_stats(seller_id: str) -> dict:
    """Recompute and cache a seller's sales count + rating + trusted badge."""
    sales_count = await db.student_market_orders.count_documents({"seller_id": seller_id, "status": "paid"})
    reviews = await db.student_seller_reviews.find({"seller_id": seller_id}, {"_id": 0, "rating": 1}).to_list(5000)
    rating_count = len(reviews)
    rating_avg = round(sum(float(r.get("rating", 0)) for r in reviews) / rating_count, 2) if rating_count else 0.0
    cfg = await get_seller_config()
    trusted = (sales_count >= int(cfg["trusted_min_sales"])
               and rating_count >= 1
               and rating_avg >= float(cfg["trusted_min_rating"]))
    stats = {"user_id": seller_id, "sales_count": sales_count, "rating_avg": rating_avg,
             "rating_count": rating_count, "trusted": trusted, "updated_at": _now()}
    await db.student_seller_stats.update_one({"user_id": seller_id}, {"$set": stats}, upsert=True)
    return stats


async def _attach_seller_stats(cards: list) -> list:
    seller_ids = list({c["user_id"] for c in cards if c.get("user_id")})
    if not seller_ids:
        return cards
    cfg = await get_seller_config()
    min_sales, min_rating = int(cfg["trusted_min_sales"]), float(cfg["trusted_min_rating"])
    rows = await db.student_seller_stats.find({"user_id": {"$in": seller_ids}}, {"_id": 0}).to_list(len(seller_ids))
    by_id = {r["user_id"]: r for r in rows}
    for c in cards:
        s = by_id.get(c.get("user_id"))
        sales = s.get("sales_count", 0) if s else 0
        r_avg = s.get("rating_avg", 0.0) if s else 0.0
        r_cnt = s.get("rating_count", 0) if s else 0
        c["seller_rating"] = r_avg
        c["seller_rating_count"] = r_cnt
        c["seller_sales"] = sales
        c["seller_trusted"] = bool(sales >= min_sales and r_cnt >= 1 and r_avg >= min_rating)
    return cards


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


# ======================= CAMPUS DEAL ALERTS =======================
DEFAULT_ALERT = {"enabled": True, "categories": [], "zone_ids": [], "digest_enabled": True}


async def get_alert_prefs(user_id: str) -> dict:
    """Return the student's deal-alert prefs, creating an enabled-by-default doc
    on first access (the 'automatic' behaviour: all categories, all campuses)."""
    rec = await db.student_market_alerts.find_one({"user_id": user_id}, {"_id": 0})
    if not rec:
        rec = {"user_id": user_id, **DEFAULT_ALERT, "created_at": _now()}
        await db.student_market_alerts.insert_one(dict(rec))
        rec.pop("_id", None)
    return rec


async def _notify_campus_deal(listing: dict) -> None:
    """Notify students who follow this category near this campus zone. NEVER raises."""
    try:
        zone_id = listing.get("zone_id")
        if not zone_id:
            return  # only campus-tagged listings trigger 'near your campus' alerts
        cat = listing.get("category")
        q = {
            "enabled": {"$ne": False},
            "user_id": {"$ne": listing["user_id"]},
            "$and": [
                {"$or": [{"categories": []}, {"categories": cat}]},
                {"$or": [{"zone_ids": []}, {"zone_ids": zone_id}]},
            ],
        }
        recipients = await db.student_market_alerts.find(q, {"_id": 0, "user_id": 1}).limit(500).to_list(500)
        if not recipients:
            return
        cat_label = CATEGORY_LABELS.get(cat, cat)
        zone_name = listing.get("zone_name") or "ton campus"
        title = f"Bonne affaire près de {zone_name} 🎓"
        body = f"{cat_label} · {listing['title']} — {float(listing['price']):.2f} €"
        payload = {"type": "student_deal", "title": title, "body": body,
                   "data": {"listing_id": listing["id"], "category": cat, "url": "/sb-student/marketplace"}}
        from core.webpush import send_web_push_to_user
        for r in recipients:
            uid = r.get("user_id")
            if not uid:
                continue
            await create_notification(uid, "student_deal", title, body,
                                      data={"listing_id": listing["id"], "category": cat,
                                            "zone_id": zone_id, "url": "/sb-student/marketplace"})
            try:
                await send_web_push_to_user(uid, payload)
            except Exception:
                pass
    except Exception:
        pass



# ======================= CATEGORIES =======================
@router.get("/categories")
async def categories(request: Request):
    await get_current_user(request)
    return {"categories": CATEGORIES, "conditions": sorted(CONDITIONS)}


@router.get("/alerts/me")
async def get_my_alerts(request: Request):
    user = await get_current_user(request)
    return await get_alert_prefs(user["id"])


class AlertPrefs(BaseModel):
    enabled: bool | None = None
    categories: list[str] | None = None
    zone_ids: list[str] | None = None
    digest_enabled: bool | None = None


@router.put("/alerts/me")
async def update_my_alerts(body: AlertPrefs, request: Request):
    user = await get_current_user(request)
    await get_alert_prefs(user["id"])
    update = {}
    if body.enabled is not None:
        update["enabled"] = bool(body.enabled)
    if body.digest_enabled is not None:
        update["digest_enabled"] = bool(body.digest_enabled)
    if body.categories is not None:
        update["categories"] = [c for c in body.categories if c in CATEGORY_SLUGS]
    if body.zone_ids is not None:
        update["zone_ids"] = list(dict.fromkeys([z for z in body.zone_ids if z]))[:50]
    if update:
        update["updated_at"] = _now()
        await db.student_market_alerts.update_one({"user_id": user["id"]}, {"$set": update})
    return await get_alert_prefs(user["id"])


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
        "zone_id": l.get("zone_id"), "zone_name": l.get("zone_name"),
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
    await _attach_seller_stats(cards)
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
    card = _public_listing(l)
    await _attach_seller_stats([card])
    return card


class ListingCreate(BaseModel):
    category: str
    title: str
    description: str = ""
    price: float
    condition: str = "bon"
    image_url: str | None = None
    location: str | None = ""
    zone_id: str | None = None
    lat: float | None = None
    lng: float | None = None


async def _resolve_zone(zone_id: str | None, lat, lng):
    """Resolve the campus zone for a listing: explicit zone_id wins, else geolocate via haversine."""
    try:
        if zone_id:
            z = await db.campus_zones.find_one({"id": zone_id, "enabled": True}, {"_id": 0})
            if z:
                return z.get("id"), z.get("name"), z.get("lat"), z.get("lng")
        if lat is not None and lng is not None:
            from routes.student_zones import find_campus_zone
            z = await find_campus_zone(lat, lng)
            if z:
                return z.get("id"), z.get("name"), float(lat), float(lng)
    except Exception:
        pass
    return None, None, (float(lat) if lat is not None else None), (float(lng) if lng is not None else None)


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
    zone_id, zone_name, zlat, zlng = await _resolve_zone(body.zone_id, body.lat, body.lng)
    listing = {
        "id": f"slist_{uuid.uuid4().hex[:12]}",
        "user_id": user["id"], "seller_name": user.get("name", "Étudiant"),
        "seller_phone": user.get("phone", ""),
        "category": body.category, "title": title[:140],
        "description": (body.description or "").strip()[:2000],
        "price": round(float(body.price), 2), "currency": "EUR",
        "condition": condition, "image_url": (body.image_url or None),
        "location": (body.location or "").strip()[:120],
        "zone_id": zone_id, "zone_name": zone_name, "lat": zlat, "lng": zlng,
        "status": "active", "views": 0, "created_at": _now(),
    }
    await db.student_listings.insert_one(dict(listing))
    await _notify_campus_deal(listing)
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
    await recompute_seller_stats(listing["user_id"])

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



# ======================= MESSAGING (buyer ↔ seller) =======================
def _conversation_view(conv: dict, my_id: str) -> dict:
    is_buyer = conv.get("buyer_id") == my_id
    return {
        "id": conv.get("id"), "listing_id": conv.get("listing_id"),
        "listing_title": conv.get("listing_title"), "listing_image": conv.get("listing_image"),
        "my_role": "buyer" if is_buyer else "seller",
        "other_name": conv.get("seller_name") if is_buyer else conv.get("buyer_name"),
        "other_id": conv.get("seller_id") if is_buyer else conv.get("buyer_id"),
        "last_text": conv.get("last_text", ""), "last_at": conv.get("last_at"),
        "unread": conv.get("unread_buyer", 0) if is_buyer else conv.get("unread_seller", 0),
    }


async def _post_message(conv: dict, sender: dict, text: str, role: str):
    msg = {
        "id": f"smsg_{uuid.uuid4().hex[:12]}", "conversation_id": conv["id"],
        "sender_id": sender["id"], "sender_name": sender.get("name", "Utilisateur"),
        "sender_role": role, "text": text[:500], "read": False, "created_at": _now(),
    }
    await db.student_messages.insert_one(dict(msg))
    inc = {"unread_seller": 1} if role == "buyer" else {"unread_buyer": 1}
    await db.student_conversations.update_one(
        {"id": conv["id"]},
        {"$set": {"last_text": text[:120], "last_at": msg["created_at"], "last_sender_id": sender["id"]},
         "$inc": inc})
    recipient = conv["seller_id"] if role == "buyer" else conv["buyer_id"]
    try:
        await create_notification(
            recipient, "student_message", f"💬 {msg['sender_name']}",
            f"{text[:80]} · {conv.get('listing_title', '')}",
            data={"url": "/sb-student/marketplace", "conversation_id": conv["id"]})
    except Exception:
        pass
    msg.pop("_id", None)
    return msg


class ContactBody(BaseModel):
    text: str


@router.post("/listings/{listing_id}/contact")
async def contact_seller(listing_id: str, body: ContactBody, request: Request):
    buyer = await get_current_user(request)
    text = (body.text or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Message vide")
    listing = await db.student_listings.find_one({"id": listing_id}, {"_id": 0})
    if not listing:
        raise HTTPException(status_code=404, detail="Annonce introuvable")
    if listing["user_id"] == buyer["id"]:
        raise HTTPException(status_code=400, detail="Vous ne pouvez pas vous contacter vous-même")
    conv = await db.student_conversations.find_one({"listing_id": listing_id, "buyer_id": buyer["id"]}, {"_id": 0})
    if not conv:
        conv = {
            "id": f"sconv_{uuid.uuid4().hex[:12]}", "listing_id": listing_id,
            "listing_title": listing.get("title"), "listing_image": listing.get("image_url"),
            "seller_id": listing["user_id"], "seller_name": listing.get("seller_name", "Vendeur"),
            "buyer_id": buyer["id"], "buyer_name": buyer.get("name", "Acheteur"),
            "last_text": "", "last_at": _now(), "unread_buyer": 0, "unread_seller": 0, "created_at": _now(),
        }
        await db.student_conversations.insert_one(dict(conv))
        conv.pop("_id", None)
    msg = await _post_message(conv, buyer, text, "buyer")
    return {"ok": True, "conversation_id": conv["id"], "message": msg}


@router.get("/conversations")
async def list_conversations(request: Request):
    user = await get_current_user(request)
    rows = await db.student_conversations.find(
        {"$or": [{"buyer_id": user["id"]}, {"seller_id": user["id"]}]}, {"_id": 0}
    ).sort("last_at", -1).to_list(100)
    return {"conversations": [_conversation_view(c, user["id"]) for c in rows]}


@router.get("/conversations/unread-total")
async def conversations_unread_total(request: Request):
    user = await get_current_user(request)
    rows = await db.student_conversations.find(
        {"$or": [{"buyer_id": user["id"]}, {"seller_id": user["id"]}]},
        {"_id": 0, "buyer_id": 1, "unread_buyer": 1, "unread_seller": 1}).to_list(200)
    total = sum((c.get("unread_buyer", 0) if c.get("buyer_id") == user["id"] else c.get("unread_seller", 0)) for c in rows)
    return {"unread": total}


async def _get_my_conversation(cid: str, user: dict) -> dict:
    conv = await db.student_conversations.find_one({"id": cid}, {"_id": 0})
    if not conv or user["id"] not in (conv.get("buyer_id"), conv.get("seller_id")):
        raise HTTPException(status_code=404, detail="Conversation introuvable")
    return conv


@router.get("/conversations/{cid}/messages")
async def list_conversation_messages(cid: str, request: Request, after: str = Query("")):
    user = await get_current_user(request)
    conv = await _get_my_conversation(cid, user)
    q = {"conversation_id": cid}
    if after:
        q["created_at"] = {"$gt": after}
    msgs = await db.student_messages.find(q, {"_id": 0}).sort("created_at", 1).to_list(500)
    # mark the other party's messages as read + reset my unread counter
    await db.student_messages.update_many(
        {"conversation_id": cid, "sender_id": {"$ne": user["id"]}, "read": False}, {"$set": {"read": True}})
    field = "unread_buyer" if conv.get("buyer_id") == user["id"] else "unread_seller"
    await db.student_conversations.update_one({"id": cid}, {"$set": {field: 0}})
    conv[field] = 0
    return {"messages": msgs, "conversation": _conversation_view(conv, user["id"])}


@router.post("/conversations/{cid}/messages")
async def send_conversation_message(cid: str, body: ContactBody, request: Request):
    user = await get_current_user(request)
    conv = await _get_my_conversation(cid, user)
    text = (body.text or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Message vide")
    role = "buyer" if conv.get("buyer_id") == user["id"] else "seller"
    msg = await _post_message(conv, user, text, role)
    return {"ok": True, "message": msg}


# ======================= REVIEWS & SELLER PROFILE =======================
class ReviewBody(BaseModel):
    rating: int
    comment: str = ""


@router.get("/orders/{order_id}/review")
async def get_order_review(order_id: str, request: Request):
    user = await get_current_user(request)
    order = await db.student_market_orders.find_one({"id": order_id}, {"_id": 0})
    if not order or order.get("buyer_id") != user["id"]:
        raise HTTPException(status_code=404, detail="Commande introuvable")
    review = await db.student_seller_reviews.find_one({"order_id": order_id}, {"_id": 0})
    return {"order": order, "review": review, "can_review": review is None}


@router.post("/orders/{order_id}/review")
async def review_seller(order_id: str, body: ReviewBody, request: Request):
    user = await get_current_user(request)
    order = await db.student_market_orders.find_one({"id": order_id}, {"_id": 0})
    if not order or order.get("buyer_id") != user["id"]:
        raise HTTPException(status_code=404, detail="Commande introuvable")
    if order.get("status") != "paid":
        raise HTTPException(status_code=400, detail="Cette commande n'est pas finalisée")
    if await db.student_seller_reviews.find_one({"order_id": order_id}, {"_id": 1}):
        raise HTTPException(status_code=400, detail="Vous avez déjà noté cette transaction")
    rating = int(body.rating)
    if rating < 1 or rating > 5:
        raise HTTPException(status_code=400, detail="La note doit être entre 1 et 5")
    review = {
        "id": f"srev_{uuid.uuid4().hex[:12]}", "order_id": order_id,
        "seller_id": order["seller_id"], "seller_name": order.get("seller_name", "Vendeur"),
        "buyer_id": user["id"], "buyer_name": user.get("name", "Acheteur"),
        "rating": rating, "comment": (body.comment or "").strip()[:500],
        "listing_title": order.get("listing_title", ""), "created_at": _now(),
    }
    await db.student_seller_reviews.insert_one(dict(review))
    stats = await recompute_seller_stats(order["seller_id"])
    try:
        await create_notification(
            order["seller_id"], "student_review", "Nouvel avis ⭐",
            f"{user.get('name', 'Un acheteur')} t'a attribué {rating}/5 — note moyenne {stats['rating_avg']}/5.",
            data={"order_id": order_id})
    except Exception:
        pass
    review.pop("_id", None)
    return {"ok": True, "review": review, "stats": stats}


@router.get("/sellers/{seller_id}")
async def seller_profile(seller_id: str, request: Request):
    await get_current_user(request)
    stats = await db.student_seller_stats.find_one({"user_id": seller_id}, {"_id": 0})
    if not stats:
        stats = await recompute_seller_stats(seller_id)
    user = await db.users.find_one({"id": seller_id}, {"_id": 0, "name": 1})
    listings = await db.student_listings.find({"user_id": seller_id, "status": "active"}, {"_id": 0}).sort("created_at", -1).limit(30).to_list(30)
    reviews = await db.student_seller_reviews.find({"seller_id": seller_id}, {"_id": 0}).sort("created_at", -1).limit(20).to_list(20)
    cfg = await get_seller_config()
    trusted = bool(stats.get("sales_count", 0) >= int(cfg["trusted_min_sales"])
                   and stats.get("rating_count", 0) >= 1
                   and stats.get("rating_avg", 0.0) >= float(cfg["trusted_min_rating"]))
    cards = [_public_listing(l) for l in listings]
    await _attach_seller_stats(cards)
    return {
        "seller": {"id": seller_id, "name": (user or {}).get("name", stats.get("seller_name", "Vendeur")), **stats, "trusted": trusted},
        "listings": cards,
        "reviews": reviews,
    }


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



@router.get("/admin/seller-config")
async def admin_seller_config(request: Request):
    await _require_admin(request)
    return await get_seller_config()


class SellerConfigUpdate(BaseModel):
    trusted_min_sales: int | None = None
    trusted_min_rating: float | None = None


@router.put("/admin/seller-config")
async def admin_update_seller_config(body: SellerConfigUpdate, request: Request):
    await _require_admin(request)
    await get_seller_config()
    update = {}
    if body.trusted_min_sales is not None:
        update["trusted_min_sales"] = max(1, int(body.trusted_min_sales))
    if body.trusted_min_rating is not None:
        update["trusted_min_rating"] = max(1.0, min(5.0, round(float(body.trusted_min_rating), 1)))
    if update:
        update["updated_at"] = _now()
        await db.student_seller_config.update_one({"id": SELLER_CONFIG_ID}, {"$set": update}, upsert=True)
    return await get_seller_config()
