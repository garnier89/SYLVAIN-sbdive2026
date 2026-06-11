"""
SB Drive Student — Phase 5a: Student rewards (loyalty dédié).

Points earned on completed student rides (+ referrals + manual admin awards),
redeemable against a catalog (free rides, partner discounts, vouchers).
Defensive: awarding never raises and never affects the ride flow.

Endpoints under /api/student/rewards.
"""
import uuid
import secrets
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from core.config import db
from core.deps import get_current_user

router = APIRouter(prefix="/student/rewards", tags=["student-rewards"])

CONFIG_ID = "student_rewards_config"

DEFAULT_CONFIG = {
    "id": CONFIG_ID, "enabled": True,
    "points_per_ride": 10, "points_per_referral": 50,
    "points_per_euro": 0, "signup_bonus": 20,
}

DEFAULT_CATALOG = [
    {"title": "Course gratuite (jusqu'à 10 €)", "type": "free_ride", "cost_points": 500, "value": 10.0, "enabled": True},
    {"title": "Bon d'achat 5 € partenaire", "type": "voucher", "cost_points": 300, "value": 5.0, "enabled": True},
    {"title": "-20 % chez un partenaire étudiant", "type": "partner_discount", "cost_points": 200, "value": 20.0, "enabled": True},
]


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


async def ensure_seeded():
    if not await db.student_rewards_config.find_one({"id": CONFIG_ID}):
        await db.student_rewards_config.insert_one({**DEFAULT_CONFIG, "updated_at": _now()})
    if await db.student_rewards_catalog.count_documents({}) == 0:
        for c in DEFAULT_CATALOG:
            await db.student_rewards_catalog.insert_one({"id": f"rw_{uuid.uuid4().hex[:8]}", **c, "created_at": _now()})


async def get_config() -> dict:
    await ensure_seeded()
    return await db.student_rewards_config.find_one({"id": CONFIG_ID}, {"_id": 0}) or dict(DEFAULT_CONFIG)


async def get_balance(user_id: str) -> int:
    rows = await db.student_points_ledger.find({"user_id": user_id}, {"_id": 0, "delta": 1}).to_list(20000)
    return int(sum(int(r.get("delta", 0) or 0) for r in rows))


async def award_points(user_id: str, delta: int, reason: str, ride_id: str = None) -> None:
    """Add (or remove) points. NEVER raises."""
    try:
        if not delta:
            return
        await db.student_points_ledger.insert_one({
            "id": f"pl_{uuid.uuid4().hex[:10]}", "user_id": user_id, "delta": int(delta),
            "reason": reason, "ride_id": ride_id, "created_at": _now(),
        })
    except Exception:
        pass


async def award_ride_points(user_id: str, ride: dict) -> None:
    """Award per-ride points to a verified student, once per ride. NEVER raises."""
    try:
        profile = await db.student_profiles.find_one({"user_id": user_id}, {"_id": 0, "status": 1})
        if not profile or profile.get("status") != "verified":
            return
        cfg = await get_config()
        if not cfg.get("enabled", True):
            return
        ride_id = ride.get("id")
        # idempotency: only one ride award per ride
        if ride_id and await db.student_points_ledger.find_one({"ride_id": ride_id, "reason": "ride"}):
            return
        pts = int(cfg.get("points_per_ride", 0) or 0)
        if cfg.get("points_per_euro"):
            fare = float(ride.get("final_fare") or ride.get("estimated_fare") or 0)
            pts += int(fare * float(cfg["points_per_euro"]))
        if pts > 0:
            await award_points(user_id, pts, "ride", ride_id)
    except Exception:
        pass


# ==================== STUDENT ====================
@router.get("/me")
async def my_rewards(request: Request):
    user = await get_current_user(request)
    balance = await get_balance(user["id"])
    ledger = await db.student_points_ledger.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).limit(50).to_list(50)
    redemptions = await db.student_redemptions.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).limit(50).to_list(50)
    return {"balance": balance, "ledger": ledger, "redemptions": redemptions}


@router.get("/catalog")
async def catalog(request: Request):
    await get_current_user(request)
    await ensure_seeded()
    items = await db.student_rewards_catalog.find({"enabled": True}, {"_id": 0}).sort("cost_points", 1).to_list(100)
    return {"rewards": items}


class RedeemBody(BaseModel):
    reward_id: str


@router.post("/redeem")
async def redeem(body: RedeemBody, request: Request):
    user = await get_current_user(request)
    reward = await db.student_rewards_catalog.find_one({"id": body.reward_id, "enabled": True}, {"_id": 0})
    if not reward:
        raise HTTPException(status_code=404, detail="Récompense introuvable")
    balance = await get_balance(user["id"])
    cost = int(reward.get("cost_points", 0) or 0)
    if balance < cost:
        raise HTTPException(status_code=400, detail=f"Points insuffisants ({balance}/{cost})")
    await award_points(user["id"], -cost, f"redeem:{reward['id']}")
    code = f"SBR-{secrets.token_hex(3).upper()}"
    redemption = {
        "id": f"rd_{uuid.uuid4().hex[:10]}", "user_id": user["id"], "reward_id": reward["id"],
        "reward_title": reward["title"], "type": reward["type"], "value": reward.get("value"),
        "cost_points": cost, "status": "active", "code": code, "created_at": _now(),
    }
    await db.student_redemptions.insert_one(dict(redemption))
    redemption.pop("_id", None)
    return {"ok": True, "redemption": redemption, "balance": balance - cost}


# ==================== ADMIN ====================
async def _require_admin(request: Request):
    user = await get_current_user(request)
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    return user


@router.get("/admin/config")
async def admin_get_config(request: Request):
    await _require_admin(request)
    return await get_config()


class ConfigBody(BaseModel):
    enabled: bool | None = None
    points_per_ride: int | None = None
    points_per_referral: int | None = None
    points_per_euro: float | None = None
    signup_bonus: int | None = None


@router.put("/admin/config")
async def admin_update_config(body: ConfigBody, request: Request):
    await _require_admin(request)
    await ensure_seeded()
    patch = {k: v for k, v in body.dict().items() if v is not None}
    patch["updated_at"] = _now()
    await db.student_rewards_config.update_one({"id": CONFIG_ID}, {"$set": patch})
    return await get_config()


@router.get("/admin/catalog")
async def admin_catalog(request: Request):
    await _require_admin(request)
    await ensure_seeded()
    return {"rewards": await db.student_rewards_catalog.find({}, {"_id": 0}).to_list(100)}


class RewardBody(BaseModel):
    title: str
    type: str = "voucher"
    cost_points: int = 100
    value: float = 0.0
    enabled: bool = True


@router.post("/admin/catalog")
async def admin_create_reward(body: RewardBody, request: Request):
    await _require_admin(request)
    doc = {"id": f"rw_{uuid.uuid4().hex[:8]}", **body.dict(), "created_at": _now()}
    await db.student_rewards_catalog.insert_one(dict(doc))
    doc.pop("_id", None)
    return {"reward": doc}


class RewardPatch(BaseModel):
    title: str | None = None
    type: str | None = None
    cost_points: int | None = None
    value: float | None = None
    enabled: bool | None = None


@router.put("/admin/catalog/{reward_id}")
async def admin_update_reward(reward_id: str, body: RewardPatch, request: Request):
    await _require_admin(request)
    patch = {k: v for k, v in body.dict().items() if v is not None}
    if not patch:
        raise HTTPException(status_code=400, detail="Rien à mettre à jour")
    res = await db.student_rewards_catalog.update_one({"id": reward_id}, {"$set": patch})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Récompense introuvable")
    return {"reward": await db.student_rewards_catalog.find_one({"id": reward_id}, {"_id": 0})}


@router.delete("/admin/catalog/{reward_id}")
async def admin_delete_reward(reward_id: str, request: Request):
    await _require_admin(request)
    res = await db.student_rewards_catalog.delete_one({"id": reward_id})
    return {"deleted": res.deleted_count}


class AwardBody(BaseModel):
    user_id: str
    points: int
    reason: str = "admin"


@router.post("/admin/award")
async def admin_award(body: AwardBody, request: Request):
    await _require_admin(request)
    await award_points(body.user_id, int(body.points), body.reason or "admin")
    return {"ok": True, "balance": await get_balance(body.user_id)}
