from fastapi import APIRouter, Request, HTTPException
import uuid
import random
import string
from datetime import datetime, timezone

from core.config import db
from core.deps import get_current_user

router = APIRouter(prefix="/referral", tags=["referral"])

# V3Cube config: REFERRAL_AMOUNT=5, REFERRAL_SCHEME_ENABLE=Yes, REFERRAL_LEVEL=5
REFERRAL_AMOUNT = 5.0
REFERRAL_CURRENCY = "EUR"


def generate_referral_code(prefix="SB"):
    """Generate unique referral code like SB-A3K7X2."""
    chars = string.ascii_uppercase + string.digits
    code = ''.join(random.choices(chars, k=6))
    return f"{prefix}-{code}"


@router.get("/my-code")
async def get_my_referral_code(request: Request):
    """Get or generate the user's referral code."""
    user = await get_current_user(request)
    existing = await db.users.find_one({"id": user["id"]}, {"_id": 0, "referral_code_own": 1, "name": 1})

    code = existing.get("referral_code_own")
    if not code:
        # Generate unique code
        for _ in range(10):
            code = generate_referral_code()
            dup = await db.users.find_one({"referral_code_own": code})
            if not dup:
                break
        await db.users.update_one({"id": user["id"]}, {"$set": {"referral_code_own": code}})

    # Get referral stats
    referrals = await db.referrals.find({"referrer_id": user["id"]}, {"_id": 0}).to_list(100)
    total_earned = sum(r.get("amount_earned", 0) for r in referrals)

    return {
        "code": code,
        "total_referrals": len(referrals),
        "total_earned": round(total_earned, 2),
        "currency": REFERRAL_CURRENCY,
        "amount_per_referral": REFERRAL_AMOUNT,
        "referrals": referrals,
    }


@router.post("/validate")
async def validate_referral_code(request: Request):
    """Validate a referral code before registration."""
    body = await request.json()
    code = body.get("code", "").strip().upper()
    if not code:
        raise HTTPException(status_code=400, detail="Code de parrainage requis")

    referrer = await db.users.find_one({"referral_code_own": code}, {"_id": 0, "id": 1, "name": 1})
    if not referrer:
        raise HTTPException(status_code=404, detail="Code de parrainage invalide")

    return {"valid": True, "referrer_name": referrer.get("name", "Utilisateur")}


@router.post("/apply")
async def apply_referral(request: Request):
    """Apply a referral after registration — credits both referrer and new user."""
    user = await get_current_user(request)
    body = await request.json()
    code = body.get("code", "").strip().upper()
    if not code:
        raise HTTPException(status_code=400, detail="Code de parrainage requis")

    # Check if user already used a referral
    existing_ref = await db.referrals.find_one({"referred_id": user["id"]})
    if existing_ref:
        raise HTTPException(status_code=400, detail="Vous avez déjà utilisé un code de parrainage")

    referrer = await db.users.find_one({"referral_code_own": code}, {"_id": 0, "id": 1, "name": 1})
    if not referrer:
        raise HTTPException(status_code=404, detail="Code de parrainage invalide")

    if referrer["id"] == user["id"]:
        raise HTTPException(status_code=400, detail="Vous ne pouvez pas utiliser votre propre code")

    now = datetime.now(timezone.utc).isoformat()

    # Create referral record
    referral_doc = {
        "id": f"ref_{uuid.uuid4().hex[:12]}",
        "referrer_id": referrer["id"],
        "referrer_name": referrer.get("name", ""),
        "referred_id": user["id"],
        "referred_name": user.get("name", ""),
        "code": code,
        "amount_earned": REFERRAL_AMOUNT,
        "currency": REFERRAL_CURRENCY,
        "status": "completed",
        "created_at": now,
    }
    await db.referrals.insert_one(referral_doc)

    # Credit referrer wallet
    referrer_wallet = await db.wallets.find_one({"user_id": referrer["id"]})
    if referrer_wallet:
        await db.wallets.update_one({"user_id": referrer["id"]}, {"$inc": {"balance": REFERRAL_AMOUNT}})
    else:
        await db.wallets.insert_one({"user_id": referrer["id"], "balance": REFERRAL_AMOUNT, "created_at": now})

    await db.wallet_transactions.insert_one({
        "id": f"tx_{uuid.uuid4().hex[:12]}",
        "user_id": referrer["id"],
        "amount": REFERRAL_AMOUNT,
        "type": "referral_credit",
        "description": f"Bonus parrainage - {user.get('name', 'Nouvel utilisateur')} a rejoint avec votre code",
        "balance_after": (referrer_wallet["balance"] if referrer_wallet else 0) + REFERRAL_AMOUNT,
        "created_at": now,
    })

    # Credit new user wallet too (welcome bonus)
    user_wallet = await db.wallets.find_one({"user_id": user["id"]})
    if user_wallet:
        await db.wallets.update_one({"user_id": user["id"]}, {"$inc": {"balance": REFERRAL_AMOUNT}})
    else:
        await db.wallets.insert_one({"user_id": user["id"], "balance": REFERRAL_AMOUNT, "created_at": now})

    await db.wallet_transactions.insert_one({
        "id": f"tx_{uuid.uuid4().hex[:12]}",
        "user_id": user["id"],
        "amount": REFERRAL_AMOUNT,
        "type": "referral_bonus",
        "description": f"Bonus de bienvenue - Code parrainage {code} utilisé",
        "balance_after": (user_wallet["balance"] if user_wallet else 0) + REFERRAL_AMOUNT,
        "created_at": now,
    })

    # Store referral on new user
    await db.users.update_one({"id": user["id"]}, {"$set": {"referred_by": referrer["id"], "referral_code_used": code}})

    return {
        "message": f"Parrainage appliqué ! Vous et {referrer.get('name', 'votre parrain')} recevez {REFERRAL_AMOUNT} {REFERRAL_CURRENCY}",
        "amount_credited": REFERRAL_AMOUNT,
        "currency": REFERRAL_CURRENCY,
    }


@router.get("/stats")
async def get_referral_stats(request: Request):
    """Get referral statistics for the current user."""
    user = await get_current_user(request)

    # Ensure user has a referral code
    user_doc = await db.users.find_one({"id": user["id"]}, {"_id": 0, "referral_code_own": 1})
    code = user_doc.get("referral_code_own")
    if not code:
        code = generate_referral_code()
        for _ in range(10):
            dup = await db.users.find_one({"referral_code_own": code})
            if not dup:
                break
            code = generate_referral_code()
        await db.users.update_one({"id": user["id"]}, {"$set": {"referral_code_own": code}})

    referrals = await db.referrals.find({"referrer_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(100)
    total_earned = sum(r.get("amount_earned", 0) for r in referrals)

    return {
        "code": code,
        "amount_per_referral": REFERRAL_AMOUNT,
        "total_referrals": len(referrals),
        "total_earned": round(total_earned, 2),
        "currency": REFERRAL_CURRENCY,
        "referrals": referrals,
    }
