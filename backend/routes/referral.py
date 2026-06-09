"""Phase 2 — Parrainage (Referrals).

Name-based referral codes (e.g. "Sylvain02" for a client, "Sylvain02P" for a
driver) and role-differentiated, *conditional* rewards that only pay out once
the referred user qualifies:

  • Driver  → Driver : 50 € each, after the new driver completes 20 rides / 30 days
  • Driver  → Client : 5 € each, after the new client's 1st ride
  • Client  → Client : 5 € each, after the new client's 1st ride
  • Client  → Driver : 5 € each, after the new driver's 1st ride (default combo)

All amounts and thresholds are configurable by the admin.
"""
import re
import uuid
import secrets
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Request, HTTPException

from core.config import db
from core.deps import get_current_user

router = APIRouter(prefix="/referral", tags=["referral"])

REFERRAL_CURRENCY = "EUR"

DEFAULT_CONFIG = {
    "enabled": True,
    "currency": REFERRAL_CURRENCY,
    "reward_client_client": 5.0,    # client refers a client
    "reward_driver_client": 5.0,    # driver refers a client
    "reward_client_driver": 5.0,    # client refers a driver
    "reward_driver_driver": 50.0,   # driver refers a driver
    "client_rides_required": 1,             # rides before a client referral pays
    "driver_driver_rides_required": 20,     # rides before a driver→driver referral pays
    "driver_driver_window_days": 30,        # window for the driver→driver threshold
}


# ═══════════════════════ CONFIG ═══════════════════════

async def get_referral_config():
    doc = await db.referral_config.find_one({"key": "default"}, {"_id": 0}) or {}
    cfg = dict(DEFAULT_CONFIG)
    cfg.update({k: v for k, v in doc.items() if k != "key"})
    return cfg


@router.get("/config")
async def read_referral_config(request: Request):
    """Admin: read the referral configuration."""
    user = await get_current_user(request)
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    return await get_referral_config()


@router.put("/config")
async def save_referral_config(request: Request):
    """Admin: persist the referral configuration."""
    user = await get_current_user(request)
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    body = await request.json()
    update = {}
    for key in DEFAULT_CONFIG:
        if key in body:
            if key == "enabled":
                update[key] = bool(body[key])
            elif key.startswith("reward_"):
                update[key] = round(float(body[key] or 0), 2)
            elif key == "currency":
                update[key] = str(body[key] or REFERRAL_CURRENCY)
            else:
                update[key] = int(body[key] or 0)
    await db.referral_config.update_one(
        {"key": "default"}, {"$set": {**update, "key": "default"}}, upsert=True,
    )
    return await get_referral_config()


# ═══════════════════════ HELPERS ═══════════════════════

async def _is_driver(user_id: str) -> bool:
    """A user is treated as a driver if they have a driver profile or driver role."""
    u = await db.users.find_one({"id": user_id}, {"_id": 0, "role": 1})
    if u and u.get("role") == "driver":
        return True
    d = await db.drivers.find_one({"user_id": user_id}, {"_id": 0, "id": 1})
    return bool(d)


async def generate_name_code(name: str, is_driver: bool) -> str:
    """Build a unique, name-based code: <FirstName><NN>[P]. Drivers get a 'P' suffix."""
    first = (name or "").strip().split(" ")[0] if (name or "").strip() else "User"
    base = "".join(c for c in first if c.isalnum())[:12]
    base = (base[:1].upper() + base[1:]) if base else "User"
    suffix = "P" if is_driver else ""
    for n in range(1, 100):
        code = f"{base}{n:02d}{suffix}"
        dup = await db.users.find_one(
            {"referral_code_own": re.compile(f"^{re.escape(code)}$", re.IGNORECASE)},
            {"_id": 0, "id": 1},
        )
        if not dup:
            return code
    return f"{base}{secrets.randbelow(9000) + 1000}{suffix}"


async def _ensure_code(user_id: str) -> str:
    """Return the user's referral code, generating a name-based one if missing."""
    u = await db.users.find_one({"id": user_id}, {"_id": 0, "referral_code_own": 1, "name": 1}) or {}
    code = u.get("referral_code_own")
    if code:
        return code
    code = await generate_name_code(u.get("name", ""), await _is_driver(user_id))
    await db.users.update_one({"id": user_id}, {"$set": {"referral_code_own": code}})
    return code


def _reward_for(cfg: dict, referrer_is_driver: bool, referred_is_driver: bool):
    """Return (amount, rides_required, window_days) for a referrer→referred combo."""
    if referrer_is_driver and referred_is_driver:
        return (
            cfg["reward_driver_driver"],
            cfg["driver_driver_rides_required"],
            cfg["driver_driver_window_days"],
        )
    if referrer_is_driver and not referred_is_driver:
        return (cfg["reward_driver_client"], cfg["client_rides_required"], 0)
    if (not referrer_is_driver) and referred_is_driver:
        return (cfg["reward_client_driver"], cfg["client_rides_required"], 0)
    return (cfg["reward_client_client"], cfg["client_rides_required"], 0)


async def _credit_wallet(user_id: str, amount: float, tx_type: str, description: str, now: str):
    wallet = await db.wallets.find_one({"user_id": user_id})
    if wallet:
        await db.wallets.update_one({"user_id": user_id}, {"$inc": {"balance": amount}})
        balance_after = wallet.get("balance", 0) + amount
    else:
        await db.wallets.insert_one({"user_id": user_id, "balance": amount, "created_at": now})
        balance_after = amount
    await db.wallet_transactions.insert_one({
        "id": f"tx_{uuid.uuid4().hex[:12]}",
        "user_id": user_id,
        "amount": amount,
        "type": tx_type,
        "description": description,
        "balance_after": round(balance_after, 2),
        "created_at": now,
    })


async def _qualify_referral(referred_user_id: str):
    """Increment a pending referral's ride counter for the referred user and pay
    out both parties once the threshold is reached within the time window."""
    ref = await db.referrals.find_one(
        {"referred_id": referred_user_id, "status": "pending"}, {"_id": 0})
    if not ref:
        return
    now_dt = datetime.now(timezone.utc)
    now = now_dt.isoformat()

    # Window expiry (driver→driver 30-day rule)
    expires_at = ref.get("expires_at")
    if expires_at:
        try:
            if now_dt > datetime.fromisoformat(expires_at):
                await db.referrals.update_one({"id": ref["id"]}, {"$set": {"status": "expired"}})
                return
        except (ValueError, TypeError):
            pass

    new_count = int(ref.get("referred_ride_count", 0)) + 1
    rides_required = int(ref.get("rides_required", 1))
    await db.referrals.update_one({"id": ref["id"]}, {"$set": {"referred_ride_count": new_count}})

    if new_count < rides_required:
        return

    # Threshold met → credit both parties
    amount = round(float(ref.get("reward_amount", 0)), 2)
    currency = ref.get("currency", REFERRAL_CURRENCY)
    if amount > 0:
        await _credit_wallet(
            ref["referrer_id"], amount, "referral_credit",
            f"Parrainage validé — {ref.get('referred_name', 'votre filleul')} a atteint l'objectif", now)
        await _credit_wallet(
            referred_user_id, amount, "referral_bonus",
            f"Bonus de parrainage validé — code {ref.get('code', '')}", now)
    await db.referrals.update_one({"id": ref["id"]}, {"$set": {
        "status": "completed",
        "amount_earned": amount,
        "qualified_at": now,
    }})
    # Phase 5: reward the referrer with loyalty points on a qualified referral.
    try:
        from routes.loyalty import award_loyalty_points, get_loyalty_config
        bonus = int((await get_loyalty_config()).get("bonus_referral", 0))
        if bonus > 0:
            await award_loyalty_points(ref["referrer_id"], bonus, "referral_bonus")
    except Exception:
        pass
    try:
        from core.notifications import create_notification
        await create_notification(
            ref["referrer_id"], "reward", "Parrainage validé 🎉",
            f"+{amount:.2f} {currency} — {ref.get('referred_name', 'votre filleul')} a rempli les conditions.",
            data={"referral_id": ref["id"], "amount": amount},
        )
    except Exception:
        pass


async def process_referral_on_ride_completion(passenger_user_id: str, driver_id: str = None):
    """Called when a ride completes — advances qualification for the passenger and,
    when present, the driver who completed the ride."""
    try:
        if passenger_user_id:
            await _qualify_referral(passenger_user_id)
        if driver_id:
            d = await db.drivers.find_one({"id": driver_id}, {"_id": 0, "user_id": 1})
            if d and d.get("user_id"):
                await _qualify_referral(d["user_id"])
    except Exception as e:
        import logging
        logging.getLogger("referral").warning("referral qualification failed: %s", e)


async def create_pending_referral(referrer_id: str, referred_user: dict):
    """Create a PENDING referral at signup time (reusable from the auth flow).
    No-op when disabled, self-referral, already referred, or referrer missing."""
    cfg = await get_referral_config()
    if not cfg.get("enabled", True) or not referrer_id:
        return None
    if referrer_id == referred_user.get("id"):
        return None
    if await db.referrals.find_one({"referred_id": referred_user["id"]}):
        return None
    referrer = await db.users.find_one({"id": referrer_id}, {"_id": 0, "id": 1, "name": 1})
    if not referrer:
        return None
    referrer_is_driver = await _is_driver(referrer_id)
    referred_is_driver = await _is_driver(referred_user["id"])
    amount, rides_required, window_days = _reward_for(cfg, referrer_is_driver, referred_is_driver)
    now_dt = datetime.now(timezone.utc)
    now = now_dt.isoformat()
    expires_at = (now_dt + timedelta(days=window_days)).isoformat() if window_days else None
    doc = {
        "id": f"ref_{uuid.uuid4().hex[:12]}",
        "referrer_id": referrer["id"],
        "referrer_name": referrer.get("name", ""),
        "referrer_role": "driver" if referrer_is_driver else "client",
        "referred_id": referred_user["id"],
        "referred_name": referred_user.get("name", ""),
        "referred_role": "driver" if referred_is_driver else "client",
        "code": referred_user.get("referral_code_used", ""),
        "reward_amount": amount,
        "currency": cfg["currency"],
        "rides_required": rides_required,
        "window_days": window_days,
        "expires_at": expires_at,
        "referred_ride_count": 0,
        "amount_earned": 0,
        "status": "pending",
        "created_at": now,
    }
    await db.referrals.insert_one(doc)
    return doc



# ═══════════════════════ USER ENDPOINTS ═══════════════════════

@router.get("/my-code")
async def get_my_referral_code(request: Request):
    """Get or generate the user's name-based referral code + summary."""
    user = await get_current_user(request)
    code = await _ensure_code(user["id"])
    cfg = await get_referral_config()
    referrals = await db.referrals.find({"referrer_id": user["id"]}, {"_id": 0}).to_list(200)
    total_earned = sum(r.get("amount_earned", 0) for r in referrals)
    pending = [r for r in referrals if r.get("status") == "pending"]
    is_driver = await _is_driver(user["id"])
    amount = cfg["reward_driver_driver"] if is_driver else cfg["reward_client_client"]
    return {
        "code": code,
        "total_referrals": len(referrals),
        "pending_referrals": len(pending),
        "total_earned": round(total_earned, 2),
        "currency": cfg["currency"],
        "amount_per_referral": amount,
        "is_driver": is_driver,
        "referrals": referrals,
    }


@router.post("/validate")
async def validate_referral_code(request: Request):
    """Validate a referral code before/at registration (case-insensitive)."""
    body = await request.json()
    code = (body.get("code") or "").strip()
    if not code:
        raise HTTPException(status_code=400, detail="Code de parrainage requis")
    referrer = await db.users.find_one(
        {"referral_code_own": re.compile(f"^{re.escape(code)}$", re.IGNORECASE)},
        {"_id": 0, "id": 1, "name": 1})
    if not referrer:
        raise HTTPException(status_code=404, detail="Code de parrainage invalide")
    return {"valid": True, "referrer_name": referrer.get("name", "Utilisateur")}


@router.post("/apply")
async def apply_referral(request: Request):
    """Apply a referral after registration — records a *pending* reward that pays
    out once the referred user qualifies (1st ride, or 20 rides/30 days for D→D)."""
    user = await get_current_user(request)
    cfg = await get_referral_config()
    if not cfg.get("enabled", True):
        raise HTTPException(status_code=400, detail="Le parrainage est actuellement désactivé")

    body = await request.json()
    code = (body.get("code") or "").strip()
    if not code:
        raise HTTPException(status_code=400, detail="Code de parrainage requis")

    if await db.referrals.find_one({"referred_id": user["id"]}):
        raise HTTPException(status_code=400, detail="Vous avez déjà utilisé un code de parrainage")

    referrer = await db.users.find_one(
        {"referral_code_own": re.compile(f"^{re.escape(code)}$", re.IGNORECASE)},
        {"_id": 0, "id": 1, "name": 1})
    if not referrer:
        raise HTTPException(status_code=404, detail="Code de parrainage invalide")
    if referrer["id"] == user["id"]:
        raise HTTPException(status_code=400, detail="Vous ne pouvez pas utiliser votre propre code")

    referrer_is_driver = await _is_driver(referrer["id"])
    referred_is_driver = await _is_driver(user["id"])
    amount, rides_required, window_days = _reward_for(cfg, referrer_is_driver, referred_is_driver)

    now_dt = datetime.now(timezone.utc)
    now = now_dt.isoformat()
    expires_at = (now_dt + timedelta(days=window_days)).isoformat() if window_days else None

    await db.referrals.insert_one({
        "id": f"ref_{uuid.uuid4().hex[:12]}",
        "referrer_id": referrer["id"],
        "referrer_name": referrer.get("name", ""),
        "referrer_role": "driver" if referrer_is_driver else "client",
        "referred_id": user["id"],
        "referred_name": user.get("name", ""),
        "referred_role": "driver" if referred_is_driver else "client",
        "code": code,
        "reward_amount": amount,
        "currency": cfg["currency"],
        "rides_required": rides_required,
        "window_days": window_days,
        "expires_at": expires_at,
        "referred_ride_count": 0,
        "amount_earned": 0,
        "status": "pending",
        "created_at": now,
    })
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {"referred_by": referrer["id"], "referral_code_used": code}})

    if window_days:
        cond = f"après {rides_required} courses en {window_days} jours"
    else:
        cond = "après votre 1ère course" if rides_required == 1 else f"après {rides_required} courses"
    return {
        "message": f"Code appliqué ! Vous et {referrer.get('name', 'votre parrain')} recevrez "
                   f"{amount:.0f} {cfg['currency']} chacun {cond}.",
        "reward_amount": amount,
        "currency": cfg["currency"],
        "rides_required": rides_required,
        "window_days": window_days,
        "status": "pending",
    }


@router.get("/my-pending")
async def my_pending_referral(request: Request):
    """For the current user AS A REFEREE (filleul): the pending referral they were
    signed up with, with progress toward unlocking the reward. Powers the home
    'Plus que N course(s) pour débloquer X€' nudge."""
    user = await get_current_user(request)
    ref = await db.referrals.find_one(
        {"referred_id": user["id"], "status": "pending"}, {"_id": 0})
    if not ref:
        return {"pending": False}
    rides_required = int(ref.get("rides_required", 1))
    done = int(ref.get("referred_ride_count", 0))
    remaining = max(0, rides_required - done)
    return {
        "pending": True,
        "reward_amount": round(float(ref.get("reward_amount", 0)), 2),
        "currency": ref.get("currency", REFERRAL_CURRENCY),
        "rides_required": rides_required,
        "referred_ride_count": done,
        "remaining": remaining,
        "referrer_name": ref.get("referrer_name", ""),
        "window_days": ref.get("window_days") or 0,
        "expires_at": ref.get("expires_at"),
    }


@router.get("/stats")
async def get_referral_stats(request: Request):
    """Referral statistics for the current user."""
    user = await get_current_user(request)
    code = await _ensure_code(user["id"])
    cfg = await get_referral_config()
    referrals = await db.referrals.find(
        {"referrer_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)
    total_earned = sum(r.get("amount_earned", 0) for r in referrals)
    pending = [r for r in referrals if r.get("status") == "pending"]
    is_driver = await _is_driver(user["id"])
    amount = cfg["reward_driver_driver"] if is_driver else cfg["reward_client_client"]
    return {
        "code": code,
        "amount_per_referral": amount,
        "total_referrals": len(referrals),
        "pending_referrals": len(pending),
        "total_earned": round(total_earned, 2),
        "currency": cfg["currency"],
        "referrals": referrals,
    }
