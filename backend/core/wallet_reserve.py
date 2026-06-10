"""SB Pay wallet reserve & region engine.

Drivers and merchants must keep a non-withdrawable reserve in their SB Pay wallet:
  - Driver  : 50 € in Europe / DOM-TOM, 2 € in Africa
  - Merchant: 1 € everywhere
The reserve is GIFTED by the platform (auto-credited once the account is active)
AND acts as a permanent floor: a withdrawal can never bring the balance below it.
All amounts are admin-editable via db.wallet_reserve_config.

Region is derived from the account country (Africa vs Europe/DOM-TOM) and can be
overridden by the admin per user (users.region).
"""
import uuid
from datetime import datetime, timezone

from core.config import db

RESERVE_CFG_ID = "default"
DEFAULT_RESERVE = {
    "id": RESERVE_CFG_ID,
    "driver_europe": 50.0,
    "driver_africa": 2.0,
    "merchant": 1.0,
    "withdraw_min": 10.0,   # minimum amount a withdrawal request may ask for
}

# ISO-2 codes + common FR/EN names of African countries served (everything else,
# incl. France métropolitaine and the DOM-TOM, is treated as "europe").
_AFRICA = {
    "ci", "côte d'ivoire", "cote d'ivoire", "ivory coast",
    "sn", "sénégal", "senegal",
    "ml", "mali", "bf", "burkina faso", "burkina",
    "tg", "togo", "bj", "bénin", "benin",
    "cm", "cameroun", "cameroon", "gn", "guinée", "guinea",
    "ne", "niger", "cd", "rd congo", "rdc", "congo", "cg",
    "ga", "gabon", "cf", "centrafrique", "td", "tchad", "chad",
    "mr", "mauritanie", "mauritania", "ng", "nigéria", "nigeria",
    "gh", "ghana", "rw", "rwanda", "bi", "burundi",
    "mg", "madagascar", "ke", "kenya", "tz", "tanzanie", "tanzania",
    "ma", "maroc", "morocco", "dz", "algérie", "algeria", "tn", "tunisie", "tunisia",
}


def region_for_country(country) -> str:
    if not country:
        return "europe"
    return "africa" if str(country).strip().lower() in _AFRICA else "europe"


def get_user_region(user: dict) -> str:
    """Explicit admin-set region wins; else derive from the account country."""
    r = (user or {}).get("region")
    if r in ("africa", "europe"):
        return r
    return region_for_country((user or {}).get("country"))


async def get_reserve_config() -> dict:
    cfg = await db.wallet_reserve_config.find_one({"id": RESERVE_CFG_ID}, {"_id": 0})
    if not cfg:
        cfg = {**DEFAULT_RESERVE, "updated_at": datetime.now(timezone.utc).isoformat()}
        await db.wallet_reserve_config.insert_one(dict(cfg))
    return {**DEFAULT_RESERVE, **cfg}


async def get_wallet_floor(user: dict) -> float:
    """Non-withdrawable reserve floor for this user (0 for clients)."""
    role = (user or {}).get("role", "user")
    if role not in ("driver", "merchant"):
        return 0.0
    cfg = await get_reserve_config()
    if role == "merchant":
        return float(cfg.get("merchant", 0) or 0)
    region = get_user_region(user)
    return float(cfg.get("driver_africa" if region == "africa" else "driver_europe", 0) or 0)


async def _is_account_active(user: dict) -> bool:
    """A driver must be approved; a merchant must have a merchant profile."""
    role = user.get("role")
    if role == "merchant":
        return await db.merchants.find_one({"user_id": user["id"]}, {"_id": 0, "id": 1}) is not None
    if role == "driver":
        d = await db.drivers.find_one({"user_id": user["id"]}, {"_id": 0, "status": 1})
        return (d or {}).get("status") == "approved"
    return False


async def ensure_reserve_credited(user: dict) -> float:
    """Idempotently gift the reserve to an active driver/merchant and persist the
    floor on the wallet. Returns the current floor (0 if not applicable)."""
    floor = await get_wallet_floor(user)
    if floor <= 0:
        return 0.0
    if not await _is_account_active(user):
        return floor  # floor known, but reserve not gifted until the account is active
    now = datetime.now(timezone.utc).isoformat()
    wallet = await db.wallets.find_one({"user_id": user["id"]}, {"_id": 0})
    if not wallet:
        await db.wallets.insert_one({"user_id": user["id"], "balance": 0.0, "currency": "EUR", "created_at": now})
        wallet = {"balance": 0.0}
    if wallet.get("reserve_credited"):
        if wallet.get("reserve") != floor:
            await db.wallets.update_one({"user_id": user["id"]}, {"$set": {"reserve": floor}})
        return floor
    # Gift the reserve once and mark it as the floor.
    await db.wallets.update_one(
        {"user_id": user["id"]},
        {"$inc": {"balance": floor}, "$set": {"reserve": floor, "reserve_credited": True}},
    )
    w = await db.wallets.find_one({"user_id": user["id"]}, {"_id": 0})
    await db.wallet_transactions.insert_one({
        "id": f"tx_{uuid.uuid4().hex[:12]}", "user_id": user["id"], "type": "Reserve",
        "amount": floor, "balance_after": round((w or {}).get("balance", floor), 2),
        "description": "Crédit de réserve plateforme (non retirable)",
        "status": "completed", "created_at": now,
    })
    try:
        from core.notifications import create_notification
        await create_notification(
            user["id"], "wallet_reserve",
            "Réserve SB Pay créditée 🎁",
            f"{floor:.2f} € de réserve ont été ajoutés à votre portefeuille pour commencer à travailler. "
            f"Ce montant reste sur votre solde et n'est pas retirable.",
            data={"url": "/wallet", "amount": floor},
        )
    except Exception:
        pass
    return floor
