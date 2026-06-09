"""Phase 5 — Statuts de fidélité (loyalty tiers).

Both clients and drivers earn loyalty points (separate from the driver dispatch
score). Points come from completed rides (+ first-ride and referral bonuses) and
unlock tiers Silver → Gold → Platinum → Diamond. Tiers grant concrete perks:
  • Driver: reduced commission (and a dispatch-priority weight, exposed for later).
  • Client: a booking discount (exposed; applied progressively).
All thresholds, point rules and perks are admin-configurable.
"""
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Request, HTTPException

from core.config import db
from core.deps import get_current_user, require_role

router = APIRouter(prefix="/loyalty", tags=["loyalty"])

DEFAULT_LOYALTY = {
    "enabled": True,
    "points_per_ride": 10,
    "bonus_first_ride": 50,
    "bonus_referral": 20,
    "tiers": [
        {"key": "silver", "name": "Silver", "min_points": 0, "color": "#9CA3AF",
         "driver_commission_discount_pct": 0, "client_discount_pct": 0, "dispatch_priority": 0},
        {"key": "gold", "name": "Gold", "min_points": 500, "color": "#F59E0B",
         "driver_commission_discount_pct": 5, "client_discount_pct": 3, "dispatch_priority": 1},
        {"key": "platinum", "name": "Platinum", "min_points": 1500, "color": "#60A5FA",
         "driver_commission_discount_pct": 10, "client_discount_pct": 5, "dispatch_priority": 2},
        {"key": "diamond", "name": "Diamond", "min_points": 4000, "color": "#22D3EE",
         "driver_commission_discount_pct": 15, "client_discount_pct": 8, "dispatch_priority": 3},
    ],
}


# ═══════════════════════ CONFIG ═══════════════════════

async def get_loyalty_config():
    doc = await db.service_configs.find_one({"service_key": "loyalty"}, {"_id": 0})
    settings = (doc or {}).get("settings") or {}
    cfg = {**DEFAULT_LOYALTY, **settings}
    cfg["enabled"] = bool(cfg.get("enabled", True))
    for k in ("points_per_ride", "bonus_first_ride", "bonus_referral"):
        try:
            cfg[k] = max(0, int(cfg.get(k, DEFAULT_LOYALTY[k])))
        except (TypeError, ValueError):
            cfg[k] = DEFAULT_LOYALTY[k]
    tiers = cfg.get("tiers") or DEFAULT_LOYALTY["tiers"]
    cfg["tiers"] = sorted(tiers, key=lambda t: int(t.get("min_points", 0)))
    return cfg


def compute_tier(points, tiers):
    """Highest tier whose min_points <= points."""
    current = tiers[0]
    for t in tiers:
        if points >= int(t.get("min_points", 0)):
            current = t
    return current


def _next_tier(points, tiers):
    for t in tiers:
        if int(t.get("min_points", 0)) > points:
            return t
    return None


@router.get("/config")
async def public_loyalty_config():
    """Public tiers config (for the loyalty showcase on client/driver apps)."""
    return await get_loyalty_config()


@router.get("/admin/config")
async def admin_get_loyalty_config(request: Request):
    await require_role(request, ["admin"])
    return await get_loyalty_config()


@router.put("/admin/config")
async def admin_save_loyalty_config(request: Request):
    await require_role(request, ["admin"])
    body = await request.json()
    settings = {}
    if "enabled" in body:
        settings["enabled"] = bool(body["enabled"])
    for k in ("points_per_ride", "bonus_first_ride", "bonus_referral"):
        if k in body:
            try:
                settings[k] = max(0, int(body[k]))
            except (TypeError, ValueError):
                settings[k] = DEFAULT_LOYALTY[k]
    if isinstance(body.get("tiers"), list) and body["tiers"]:
        clean = []
        for t in body["tiers"]:
            clean.append({
                "key": str(t.get("key") or t.get("name", "tier")).lower().replace(" ", "_"),
                "name": str(t.get("name") or t.get("key") or "Tier"),
                "min_points": max(0, int(t.get("min_points") or 0)),
                "color": str(t.get("color") or "#9CA3AF"),
                "driver_commission_discount_pct": max(0, min(100, float(t.get("driver_commission_discount_pct") or 0))),
                "client_discount_pct": max(0, min(100, float(t.get("client_discount_pct") or 0))),
                "dispatch_priority": max(0, int(t.get("dispatch_priority") or 0)),
            })
        settings["tiers"] = sorted(clean, key=lambda x: x["min_points"])
    await db.service_configs.update_one(
        {"service_key": "loyalty"},
        {"$set": {"settings": {**(await _raw_settings()), **settings}, "service_key": "loyalty"}},
        upsert=True,
    )
    return await get_loyalty_config()


async def _raw_settings():
    doc = await db.service_configs.find_one({"service_key": "loyalty"}, {"_id": 0})
    return (doc or {}).get("settings") or {}


# ═══════════════════════ POINTS ENGINE ═══════════════════════

async def award_loyalty_points(user_id: str, points: int, reason: str, role: str = None):
    """Add loyalty points to a user and notify them when they reach a new tier."""
    if not user_id or points <= 0:
        return
    cfg = await get_loyalty_config()
    if not cfg.get("enabled", True):
        return
    tiers = cfg["tiers"]
    now = datetime.now(timezone.utc).isoformat()
    doc = await db.loyalty.find_one({"user_id": user_id}, {"_id": 0, "points": 1})
    before = int((doc or {}).get("points", 0))
    after = before + int(points)
    before_tier = compute_tier(before, tiers)["key"]
    after_tier_obj = compute_tier(after, tiers)
    await db.loyalty.update_one(
        {"user_id": user_id},
        {"$inc": {"points": int(points)},
         "$set": {"tier_key": after_tier_obj["key"], "role": role, "updated_at": now},
         "$push": {"history": {"points": int(points), "reason": reason, "at": now}}},
        upsert=True,
    )
    if after_tier_obj["key"] != before_tier:
        try:
            from core.notifications import create_notification
            await create_notification(
                user_id, "reward", f"Statut {after_tier_obj['name']} débloqué 🏆",
                f"Félicitations ! Vous êtes désormais membre {after_tier_obj['name']}.",
                data={"tier": after_tier_obj["key"], "points": after},
            )
        except Exception:
            pass


async def get_commission_discount_pct(driver_user_id: str) -> float:
    """Driver's current loyalty commission-discount percentage (0 if disabled/none)."""
    if not driver_user_id:
        return 0.0
    cfg = await get_loyalty_config()
    if not cfg.get("enabled", True):
        return 0.0
    doc = await db.loyalty.find_one({"user_id": driver_user_id}, {"_id": 0, "points": 1})
    points = int((doc or {}).get("points", 0))
    tier = compute_tier(points, cfg["tiers"])
    return float(tier.get("driver_commission_discount_pct", 0) or 0)


async def get_client_discount(user_id: str):
    """Client's current loyalty booking discount → (pct, tier_name). (0, None) if off."""
    if not user_id:
        return 0.0, None
    cfg = await get_loyalty_config()
    if not cfg.get("enabled", True):
        return 0.0, None
    doc = await db.loyalty.find_one({"user_id": user_id}, {"_id": 0, "points": 1})
    points = int((doc or {}).get("points", 0))
    tier = compute_tier(points, cfg["tiers"])
    return float(tier.get("client_discount_pct", 0) or 0), tier.get("name")


async def apply_loyalty_on_completion(ride: dict, driver_user_id: str = None):
    """Award per-ride loyalty points to the passenger and the driver on completion,
    including the first-ride bonus."""
    cfg = await get_loyalty_config()
    if not cfg.get("enabled", True):
        return
    per_ride = int(cfg.get("points_per_ride", 10))
    first_bonus = int(cfg.get("bonus_first_ride", 50))

    passenger = ride.get("user_id")
    if passenger:
        prior = await db.rides.count_documents(
            {"user_id": passenger, "status": "completed", "id": {"$ne": ride.get("id")}})
        await award_loyalty_points(passenger, per_ride, "ride_completed", role="client")
        if prior == 0 and first_bonus > 0:
            await award_loyalty_points(passenger, first_bonus, "first_ride_bonus", role="client")

    if driver_user_id:
        prior_d = await db.rides.count_documents(
            {"driver_id": ride.get("driver_id"), "status": "completed", "id": {"$ne": ride.get("id")}})
        await award_loyalty_points(driver_user_id, per_ride, "ride_completed", role="driver")
        if prior_d == 0 and first_bonus > 0:
            await award_loyalty_points(driver_user_id, first_bonus, "first_ride_bonus", role="driver")


# ═══════════════════════ USER ENDPOINT ═══════════════════════

@router.get("/my-discount")
async def my_discount(request: Request):
    """Client's current loyalty booking discount (shown at checkout)."""
    user = await get_current_user(request)
    pct, tier_name = await get_client_discount(user["id"])
    return {"discount_pct": pct, "tier_name": tier_name}


@router.get("/me")
async def my_loyalty(request: Request):
    """Current user's loyalty status: points, tier, progress and perks."""
    user = await get_current_user(request)
    cfg = await get_loyalty_config()
    tiers = cfg["tiers"]
    doc = await db.loyalty.find_one({"user_id": user["id"]}, {"_id": 0}) or {}
    points = int(doc.get("points", 0))
    tier = compute_tier(points, tiers)
    nxt = _next_tier(points, tiers)
    is_driver = user.get("role") == "driver" or bool(await db.drivers.find_one({"user_id": user["id"]}, {"_id": 0, "id": 1}))
    return {
        "enabled": cfg["enabled"],
        "points": points,
        "tier": tier,
        "next_tier": nxt,
        "points_to_next": max(0, int(nxt["min_points"]) - points) if nxt else 0,
        "is_driver": is_driver,
        "perk": (
            {"label": f"-{tier.get('driver_commission_discount_pct', 0)}% de commission", "value": tier.get("driver_commission_discount_pct", 0)}
            if is_driver else
            {"label": f"-{tier.get('client_discount_pct', 0)}% sur vos courses", "value": tier.get("client_discount_pct", 0)}
        ),
        "tiers": tiers,
        "history": (doc.get("history") or [])[-20:][::-1],
    }
