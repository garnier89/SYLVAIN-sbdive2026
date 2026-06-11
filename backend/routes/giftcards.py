"""Gift cards (cartes cadeaux) — purchase paid from the buyer's wallet, redeem
credits the recipient's wallet. Endpoints under /api/giftcards/* to match the
client (GiftCardsPage) and admin (AdminGiftCards) frontends."""
import uuid
import os
from datetime import datetime, timezone

from fastapi import APIRouter, Request, HTTPException

from core.config import db
from core.deps import get_current_user

router = APIRouter(prefix="/giftcards", tags=["giftcards"])

GIFTCARD_TEMPLATES = [
    {"id": "classic", "name": "Classique", "image_url": "https://images.unsplash.com/photo-1549465220-1a8b9238cd48?w=500&q=70"},
    {"id": "birthday", "name": "Anniversaire", "image_url": "https://images.unsplash.com/photo-1530103862676-de8c9debad1d?w=500&q=70"},
    {"id": "celebration", "name": "Félicitations", "image_url": "https://images.unsplash.com/photo-1513151233558-d860c5398176?w=500&q=70"},
    {"id": "thanks", "name": "Merci", "image_url": "https://images.unsplash.com/photo-1607344645866-009c320b63e0?w=500&q=70"},
]
GIFTCARD_AMOUNTS = [10, 20, 30, 50, 75, 100, 150, 200]


@router.get("/templates")
async def list_templates():
    return {"templates": GIFTCARD_TEMPLATES, "amounts": GIFTCARD_AMOUNTS}


@router.post("/purchase")
async def purchase_gift_card(request: Request):
    """Buy a gift card — paid from the buyer's SB Pay wallet (consistent with the
    rest of the platform). Drivers keep their non-withdrawable reserve."""
    user = await get_current_user(request)
    body = await request.json()
    try:
        amount = round(float(body.get("amount", 0)), 2)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="Montant invalide")
    if amount < 5 or amount > 500:
        raise HTTPException(status_code=400, detail="Le montant doit être entre 5 et 500 €")

    # Drivers must keep their reserve (consistent with withdraw / send / refund).
    floor = 0.0
    if user.get("role") == "driver":
        from core.wallet_reserve import ensure_reserve_credited
        floor = await ensure_reserve_credited(user)

    # Atomic debit guarded by available balance (balance - reserve >= amount).
    res = await db.wallets.update_one(
        {"user_id": user["id"], "balance": {"$gte": round(amount + floor, 2)}},
        {"$inc": {"balance": -amount}},
    )
    if res.modified_count == 0:
        raise HTTPException(status_code=400, detail="Solde insuffisant. Rechargez votre portefeuille pour acheter une carte cadeau.")

    now = datetime.now(timezone.utc).isoformat()
    code = f"GIFT-{uuid.uuid4().hex[:8].upper()}"
    doc = {
        "id": f"gc_{uuid.uuid4().hex[:10]}",
        "code": code,
        "amount": amount,
        "template_id": body.get("template_id"),
        "sender_id": user["id"],
        "sender_name": user.get("name"),
        "recipient_email": (body.get("recipient_email") or "").strip().lower(),
        "recipient_name": (body.get("recipient_name") or "").strip(),
        "message": (body.get("message") or "").strip()[:200],
        "status": "active",
        "redeemed": False,
        "redeemed_by_user_id": None,
        "redeemed_at": None,
        "created_at": now,
    }
    await db.gift_cards.insert_one(doc)
    await db.wallet_transactions.insert_one({
        "id": f"wt_{uuid.uuid4().hex[:10]}", "user_id": user["id"], "amount": -amount,
        "type": "debit", "source": "gift_card_purchase", "reference": code,
        "description": f"Achat carte cadeau {code}", "status": "completed", "created_at": now,
    })

    # Email the recipient the code, if an address was given (non-blocking).
    if doc["recipient_email"]:
        try:
            from core.email import fire, send_gift_card_email
            frontend = os.environ.get("FRONTEND_URL", "").rstrip("/")
            fire(send_gift_card_email(doc["recipient_email"], doc["recipient_name"],
                                      user.get("name", ""), amount, code, doc["message"],
                                      f"{frontend}/giftcards"))
        except Exception:
            pass

    doc.pop("_id", None)
    return doc


@router.post("/redeem")
async def redeem_gift_card(request: Request):
    user = await get_current_user(request)
    body = await request.json()
    code = (body.get("code") or "").strip().upper()
    if not code:
        raise HTTPException(status_code=400, detail="Code requis")
    gc = await db.gift_cards.find_one({"code": code}, {"_id": 0})
    if not gc:
        raise HTTPException(status_code=404, detail="Carte cadeau introuvable")
    if gc.get("status") != "active" or gc.get("redeemed"):
        raise HTTPException(status_code=400, detail="Cette carte cadeau a déjà été utilisée")
    if gc.get("sender_id") == user["id"]:
        raise HTTPException(status_code=400, detail="Vous ne pouvez pas utiliser votre propre carte cadeau")

    now = datetime.now(timezone.utc).isoformat()
    await db.gift_cards.update_one({"code": code}, {"$set": {
        "status": "redeemed", "redeemed": True,
        "redeemed_by_user_id": user["id"], "redeemed_at": now,
    }})
    await db.wallets.update_one(
        {"user_id": user["id"]},
        {"$inc": {"balance": gc["amount"]}, "$setOnInsert": {"user_id": user["id"], "created_at": now}},
        upsert=True,
    )
    await db.wallet_transactions.insert_one({
        "id": f"wt_{uuid.uuid4().hex[:10]}", "user_id": user["id"], "amount": gc["amount"],
        "type": "credit", "source": "gift_card", "reference": code,
        "description": f"Carte cadeau {code}", "status": "completed", "created_at": now,
    })
    # Auto-recover any outstanding debt FIRST after receiving funds.
    from routes.debts import auto_settle_debts_from_wallet
    await auto_settle_debts_from_wallet(user["id"])
    return {"message": "Carte cadeau créditée sur votre portefeuille", "amount": gc["amount"], "code": code}


@router.get("/my-cards")
async def my_gift_cards(request: Request):
    """Cards purchased by the current user (sent), most recent first."""
    user = await get_current_user(request)
    cards = await db.gift_cards.find({"sender_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return cards
