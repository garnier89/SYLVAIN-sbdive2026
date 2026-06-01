"""
Driver subscriptions (V3Cube driver_subscription_plan + driver_subscription_details).

Plans payants pour chauffeurs : commission 0%, badge VIP, priorité auto-dispatch.
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, timezone, timedelta
import uuid

from core.config import db
from core.deps import get_current_user
from core.permissions import require_permission

router = APIRouter(prefix="/subscriptions", tags=["subscriptions"])

# ===================== Seed default plans =====================

DEFAULT_PLANS = [
    {
        "name": "Free",
        "price": 0.0,
        "duration_days": 0,  # 0 = permanent (default plan)
        "commission_pct": 20.0,  # 20% commission on each ride
        "perks": ["Accès courses standard"],
        "priority_dispatch": False,
        "vip_badge": False,
        "is_default": True,
        "is_active": True,
    },
    {
        "name": "Pro",
        "price": 19.90,
        "duration_days": 30,
        "commission_pct": 10.0,
        "perks": ["Commission réduite à 10%", "Support prioritaire", "Statistiques avancées"],
        "priority_dispatch": False,
        "vip_badge": False,
        "is_default": False,
        "is_active": True,
    },
    {
        "name": "VIP",
        "price": 49.90,
        "duration_days": 30,
        "commission_pct": 5.0,
        "perks": ["Commission réduite à 5%", "Badge VIP visible aux clients", "Priorité auto-dispatch", "Manager dédié", "Statistiques avancées"],
        "priority_dispatch": True,
        "vip_badge": True,
        "is_default": False,
        "is_active": True,
    },
    {
        "name": "Elite Annual",
        "price": 449.00,
        "duration_days": 365,
        "commission_pct": 3.0,
        "perks": ["Commission ultra-réduite 3%", "Badge VIP Elite", "Priorité auto-dispatch maximale", "Manager dédié", "Formation Pro offerte", "Économie 100€/an vs mensuel VIP"],
        "priority_dispatch": True,
        "vip_badge": True,
        "is_default": False,
        "is_active": True,
    },
]


async def seed_subscription_plans():
    """Idempotent seed of default driver subscription plans."""
    for p in DEFAULT_PLANS:
        existing = await db.subscription_plans.find_one({"name": p["name"]})
        if not existing:
            await db.subscription_plans.insert_one({
                "id": f"plan_{uuid.uuid4().hex[:10]}",
                **p,
                "created_at": datetime.now(timezone.utc).isoformat(),
            })


# ===================== Models =====================

class PlanCreate(BaseModel):
    name: str
    price: float
    duration_days: int
    commission_pct: float
    perks: List[str]
    priority_dispatch: bool = False
    vip_badge: bool = False
    is_active: bool = True


class SubscribeBody(BaseModel):
    plan_id: str
    payment_method: str = "wallet"  # wallet | card | sbpaygo


# ===================== Public endpoints =====================

@router.get("/plans")
async def list_plans():
    """List all active subscription plans (public — for driver app)."""
    items = await db.subscription_plans.find({"is_active": True}, {"_id": 0}).sort("price", 1).to_list(50)
    return {"items": items, "total": len(items)}


@router.get("/my")
async def my_subscription(current_user: dict = Depends(get_current_user)):
    """Current active subscription of the driver."""
    if current_user.get("role") != "driver":
        raise HTTPException(403, "Driver only")
    sub = await db.driver_subscriptions.find_one(
        {"driver_id": current_user["id"], "status": "active"},
        {"_id": 0},
        sort=[("started_at", -1)],
    )
    if not sub:
        # Return default Free plan
        free = await db.subscription_plans.find_one({"is_default": True}, {"_id": 0})
        return {"plan": free, "subscription": None, "is_default": True}
    plan = await db.subscription_plans.find_one({"id": sub["plan_id"]}, {"_id": 0})
    return {"plan": plan, "subscription": sub, "is_default": False}


@router.post("/subscribe")
async def subscribe(body: SubscribeBody, current_user: dict = Depends(get_current_user)):
    """Driver subscribes to a paid plan. Deducts from wallet."""
    if current_user.get("role") != "driver":
        raise HTTPException(403, "Driver only")
    plan = await db.subscription_plans.find_one({"id": body.plan_id, "is_active": True})
    if not plan:
        raise HTTPException(404, "Plan not found or inactive")
    if plan.get("is_default"):
        raise HTTPException(400, "Cannot subscribe to default Free plan")

    # Payment: wallet only for now (Stripe TODO)
    if body.payment_method == "wallet":
        wallet = await db.wallets.find_one({"user_id": current_user["id"]})
        if not wallet or wallet.get("balance", 0) < plan["price"]:
            raise HTTPException(400, f"Insufficient wallet balance (need {plan['price']:.2f}€)")
        await db.wallets.update_one({"user_id": current_user["id"]}, {"$inc": {"balance": -plan["price"]}})
        await db.wallet_transactions.insert_one({
            "id": f"wtx_{uuid.uuid4().hex[:12]}",
            "wallet_user_id": current_user["id"],
            "type": "pay",
            "amount": -plan["price"],
            "currency": "EUR",
            "label": f"Souscription plan {plan['name']}",
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    else:
        raise HTTPException(400, f"Payment method {body.payment_method} not yet supported (Stripe coming)")

    # Cancel any existing active subscription
    await db.driver_subscriptions.update_many(
        {"driver_id": current_user["id"], "status": "active"},
        {"$set": {"status": "replaced", "ended_at": datetime.now(timezone.utc).isoformat()}},
    )
    started = datetime.now(timezone.utc)
    expires = started + timedelta(days=plan["duration_days"])
    sub = {
        "id": f"sub_{uuid.uuid4().hex[:12]}",
        "driver_id": current_user["id"],
        "plan_id": plan["id"],
        "plan_name": plan["name"],
        "started_at": started.isoformat(),
        "expires_at": expires.isoformat(),
        "auto_renew": False,
        "status": "active",
        "payment_method": body.payment_method,
        "amount_paid": plan["price"],
        "commission_pct_locked": plan["commission_pct"],
        "created_at": started.isoformat(),
    }
    await db.driver_subscriptions.insert_one(sub)
    # Update driver flags
    await db.drivers.update_one({"user_id": current_user["id"]}, {"$set": {
        "subscription_id": sub["id"],
        "subscription_plan": plan["name"],
        "subscription_expires_at": expires.isoformat(),
        "vip_badge": plan.get("vip_badge", False),
        "priority_dispatch": plan.get("priority_dispatch", False),
        "commission_pct": plan["commission_pct"],
    }})
    sub.pop("_id", None)
    return {"subscription": sub, "plan": {k: v for k, v in plan.items() if k != "_id"}}


@router.post("/cancel")
async def cancel_subscription(current_user: dict = Depends(get_current_user)):
    """Cancel auto-renew (keeps active until expires_at)."""
    if current_user.get("role") != "driver":
        raise HTTPException(403, "Driver only")
    res = await db.driver_subscriptions.update_one(
        {"driver_id": current_user["id"], "status": "active"},
        {"$set": {"auto_renew": False, "cancellation_requested_at": datetime.now(timezone.utc).isoformat()}},
    )
    if res.matched_count == 0:
        raise HTTPException(404, "No active subscription")
    return {"cancelled": True, "note": "Auto-renew désactivé. Votre abonnement reste actif jusqu'à expiration."}


# ===================== Admin endpoints =====================

@router.get("/admin/plans")
async def admin_list_plans(current_user: dict = Depends(require_permission("billing.view"))):
    items = await db.subscription_plans.find({}, {"_id": 0}).sort("price", 1).to_list(100)
    return {"items": items}


@router.post("/admin/plans")
async def admin_create_plan(body: PlanCreate, current_user: dict = Depends(require_permission("billing.view"))):
    plan = {
        "id": f"plan_{uuid.uuid4().hex[:10]}",
        **body.model_dump(),
        "is_default": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.subscription_plans.insert_one(plan)
    plan.pop("_id", None)
    return plan


@router.put("/admin/plans/{plan_id}")
async def admin_update_plan(plan_id: str, body: PlanCreate, current_user: dict = Depends(require_permission("billing.view"))):
    res = await db.subscription_plans.update_one({"id": plan_id}, {"$set": body.model_dump()})
    if res.matched_count == 0:
        raise HTTPException(404, "Plan not found")
    return {"updated": True}


@router.delete("/admin/plans/{plan_id}")
async def admin_delete_plan(plan_id: str, current_user: dict = Depends(require_permission("billing.view"))):
    plan = await db.subscription_plans.find_one({"id": plan_id})
    if not plan:
        raise HTTPException(404, "Plan not found")
    if plan.get("is_default"):
        raise HTTPException(400, "Cannot delete default plan")
    await db.subscription_plans.delete_one({"id": plan_id})
    return {"deleted": True}


@router.get("/admin/subscriptions")
async def admin_list_subscriptions(status: Optional[str] = None, current_user: dict = Depends(require_permission("billing.view"))):
    query = {}
    if status:
        query["status"] = status
    items = await db.driver_subscriptions.find(query, {"_id": 0}).sort("created_at", -1).limit(500).to_list(500)
    return {"items": items, "total": len(items)}
