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
    "points_per_order": 5,
    "points_per_delivery": 5,
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
    "rewards": [
        {"id": "credit_2", "name": "2 € offerts en SB Pay", "cost_points": 200, "type": "wallet_credit", "value": 2, "min_tier": "silver"},
        {"id": "credit_5", "name": "5 € offerts en SB Pay", "cost_points": 450, "type": "wallet_credit", "value": 5, "min_tier": "silver"},
        {"id": "ride_10pct", "name": "-10% sur une course", "cost_points": 300, "type": "coupon",
         "discount_type": "Percentage", "value": 10, "max_discount": 10, "service_type": "All", "min_tier": "silver"},
        {"id": "free_delivery", "name": "Livraison offerte (-5 €)", "cost_points": 250, "type": "coupon",
         "discount_type": "Flat", "value": 5, "service_type": "delivery", "min_tier": "gold"},
    ],
}


# ═══════════════════════ CONFIG ═══════════════════════

async def get_loyalty_config():
    doc = await db.service_configs.find_one({"service_key": "loyalty"}, {"_id": 0})
    settings = (doc or {}).get("settings") or {}
    cfg = {**DEFAULT_LOYALTY, **settings}
    cfg["enabled"] = bool(cfg.get("enabled", True))
    for k in ("points_per_ride", "points_per_order", "points_per_delivery", "bonus_first_ride", "bonus_referral"):
        try:
            cfg[k] = max(0, int(cfg.get(k, DEFAULT_LOYALTY[k])))
        except (TypeError, ValueError):
            cfg[k] = DEFAULT_LOYALTY[k]
    tiers = cfg.get("tiers") or DEFAULT_LOYALTY["tiers"]
    cfg["tiers"] = sorted(tiers, key=lambda t: int(t.get("min_points", 0)))
    if not isinstance(cfg.get("rewards"), list) or not cfg.get("rewards"):
        cfg["rewards"] = DEFAULT_LOYALTY["rewards"]
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
    for k in ("points_per_ride", "points_per_order", "points_per_delivery", "bonus_first_ride", "bonus_referral"):
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
    if isinstance(body.get("rewards"), list):
        rclean = []
        for r in body["rewards"]:
            if not r.get("id") or not r.get("name"):
                continue
            item = {
                "id": str(r["id"]).strip(),
                "name": str(r["name"]).strip(),
                "cost_points": max(1, int(r.get("cost_points") or 1)),
                "type": str(r.get("type") or "wallet_credit"),
                "min_tier": str(r.get("min_tier") or "silver"),
            }
            if item["type"] == "wallet_credit":
                item["value"] = round(float(r.get("value") or 0), 2)
            else:  # coupon
                item["discount_type"] = "Percentage" if str(r.get("discount_type")) == "Percentage" else "Flat"
                item["value"] = round(float(r.get("value") or 0), 2)
                item["max_discount"] = round(float(r.get("max_discount") or 999999), 2)
                item["service_type"] = str(r.get("service_type") or "All")
            rclean.append(item)
        settings["rewards"] = rclean
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


async def award_completion_points(user_id: str, kind: str):
    """Award loyalty points to a client when a non-ride vertical completes.
    kind: 'order' (food/marketplace) | 'delivery' (parcel/coursier)."""
    if not user_id:
        return
    cfg = await get_loyalty_config()
    if not cfg.get("enabled", True):
        return
    pts = int(cfg.get("points_per_order" if kind == "order" else "points_per_delivery", 5))
    if pts > 0:
        await award_loyalty_points(user_id, pts, f"{kind}_completed", role="client")


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
    spent = int(doc.get("spent_points", 0))
    tier = compute_tier(points, tiers)
    nxt = _next_tier(points, tiers)
    is_driver = user.get("role") == "driver" or bool(await db.drivers.find_one({"user_id": user["id"]}, {"_id": 0, "id": 1}))
    return {
        "enabled": cfg["enabled"],
        "points": points,
        "spent_points": spent,
        "available_points": max(0, points - spent),
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


# ═══════════════════════ REWARDS CATALOG ═══════════════════════

def _tier_rank(tier_key, tiers):
    for i, t in enumerate(tiers):
        if t.get("key") == tier_key:
            return i
    return 0


@router.get("/rewards")
async def list_rewards(request: Request):
    """Rewards catalog + the user's available (spendable) points balance."""
    user = await get_current_user(request)
    cfg = await get_loyalty_config()
    doc = await db.loyalty.find_one({"user_id": user["id"]}, {"_id": 0, "points": 1, "spent_points": 1}) or {}
    points = int(doc.get("points", 0))
    spent = int(doc.get("spent_points", 0))
    available = max(0, points - spent)
    user_rank = _tier_rank(compute_tier(points, cfg["tiers"])["key"], cfg["tiers"])
    rewards = []
    for r in cfg.get("rewards", []):
        need_rank = _tier_rank(r.get("min_tier", "silver"), cfg["tiers"])
        rewards.append({**r,
                        "affordable": available >= int(r.get("cost_points", 0)),
                        "tier_ok": user_rank >= need_rank})
    return {"available_points": available, "points": points, "spent_points": spent,
            "tiers": cfg["tiers"], "rewards": rewards}


@router.get("/my-redemptions")
async def my_redemptions(request: Request):
    user = await get_current_user(request)
    items = await db.loyalty_redemptions.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(50)
    return items


@router.post("/redeem")
async def redeem_reward(request: Request):
    """Spend points on a catalog reward → grant SB Pay credit or a personal coupon.
    Tier-status points are preserved; only the spendable balance is reduced."""
    user = await get_current_user(request)
    body = await request.json()
    reward_id = (body.get("reward_id") or "").strip()
    cfg = await get_loyalty_config()
    if not cfg.get("enabled", True):
        raise HTTPException(status_code=400, detail="Programme de fidélité désactivé")
    reward = next((r for r in cfg.get("rewards", []) if r.get("id") == reward_id), None)
    if not reward:
        raise HTTPException(status_code=404, detail="Récompense introuvable")

    doc = await db.loyalty.find_one({"user_id": user["id"]}, {"_id": 0, "points": 1, "spent_points": 1}) or {}
    points = int(doc.get("points", 0))
    spent = int(doc.get("spent_points", 0))
    available = max(0, points - spent)
    cost = int(reward.get("cost_points", 0))
    user_rank = _tier_rank(compute_tier(points, cfg["tiers"])["key"], cfg["tiers"])
    need_rank = _tier_rank(reward.get("min_tier", "silver"), cfg["tiers"])
    if user_rank < need_rank:
        raise HTTPException(status_code=400, detail="Statut de fidélité insuffisant pour cette récompense")
    if available < cost:
        raise HTTPException(status_code=400, detail="Points insuffisants")

    # Atomically reserve the points (guards against double-spend).
    res = await db.loyalty.update_one(
        {"user_id": user["id"],
         "$expr": {"$gte": [{"$subtract": ["$points", {"$ifNull": ["$spent_points", 0]}]}, cost]}},
        {"$inc": {"spent_points": cost}},
        upsert=False,
    )
    if res.modified_count == 0:
        raise HTTPException(status_code=400, detail="Points insuffisants")

    now = datetime.now(timezone.utc).isoformat()
    granted = {"type": reward["type"]}
    try:
        if reward["type"] == "wallet_credit":
            amount = round(float(reward.get("value", 0)), 2)
            await db.wallets.update_one(
                {"user_id": user["id"]},
                {"$inc": {"balance": amount}, "$setOnInsert": {"user_id": user["id"], "currency": "EUR", "created_at": now}},
                upsert=True,
            )
            w = await db.wallets.find_one({"user_id": user["id"]}, {"_id": 0})
            await db.wallet_transactions.insert_one({
                "id": f"tx_{uuid.uuid4().hex[:12]}", "user_id": user["id"], "type": "Reward",
                "amount": amount, "balance_after": round((w or {}).get("balance", 0), 2),
                "description": f"Récompense fidélité : {reward['name']}", "status": "completed", "created_at": now,
            })
            granted["amount"] = amount
        else:  # coupon (personal, user-targeted)
            code = f"SBREWARD-{uuid.uuid4().hex[:6].upper()}"
            await db.coupons.insert_one({
                "id": f"coupon_{uuid.uuid4().hex[:12]}", "code": code,
                "description": f"Récompense fidélité — {reward['name']}",
                "discount_type": reward.get("discount_type", "Flat"),
                "discount_value": reward.get("value", 0),
                "max_discount": reward.get("max_discount", 999999),
                "usage_limit": 1, "per_user_limit": 1, "used": 0,
                "service_type": reward.get("service_type", "All"),
                "user_id": user["id"], "status": "active",
                "expiry_date": None, "created_at": now,
            })
            granted["code"] = code
    except Exception:
        # Roll back the reserved points if granting failed.
        await db.loyalty.update_one({"user_id": user["id"]}, {"$inc": {"spent_points": -cost}})
        raise HTTPException(status_code=500, detail="Échec de l'attribution de la récompense")

    await db.loyalty_redemptions.insert_one({
        "id": f"red_{uuid.uuid4().hex[:12]}", "user_id": user["id"],
        "reward_id": reward_id, "reward_name": reward["name"], "cost_points": cost,
        "granted": granted, "created_at": now,
    })
    new_available = available - cost
    return {"message": "Récompense obtenue", "reward": reward["name"], "granted": granted,
            "available_points": new_available}
