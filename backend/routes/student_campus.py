"""
SB Drive Student — Phase 2: Pass Campus (subscriptions) + Recurring bookings.

- Pass Campus: admin-managed subscription plans (monthly / semester) giving a
  permanent discount %, included wallet credits, and priority booking. Purchased
  from the SB Pay wallet.
- Recurring bookings: saved daily/weekly trip templates (Campus↔Résidence, etc.)
  with next-occurrence computation. "Book next" deep-links to the booking screen
  pre-filled (reuses the fully-tested ride creation flow — no duplication).

All endpoints under /api/student/campus. Defensive + isolated; never affects
existing wallet/ride flows.
"""
import uuid
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from core.config import db
from core.deps import get_current_user

router = APIRouter(prefix="/student/campus", tags=["student-campus"])


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


DEFAULT_PLANS = [
    {
        "id": "plan_monthly", "name": "Pass Mensuel", "type": "monthly", "price": 19.99,
        "duration_days": 30, "discount_pct": 25.0, "included_credits": 5.0,
        "priority_booking": True, "loyalty_bonus_pct": 0.0, "enabled": True,
        "perks": ["Réductions permanentes -25%", "Priorité de réservation", "5 € de crédits inclus"],
    },
    {
        "id": "plan_semester", "name": "Pass Semestriel", "type": "semester", "price": 89.99,
        "duration_days": 180, "discount_pct": 30.0, "included_credits": 10.0,
        "priority_booking": True, "loyalty_bonus_pct": 10.0, "enabled": True,
        "perks": ["Réductions permanentes -30%", "Priorité de réservation", "10 € de crédits inclus", "Bonus fidélité +10%"],
    },
]


async def ensure_plans_seeded():
    if await db.campus_plans.count_documents({}) == 0:
        for p in DEFAULT_PLANS:
            await db.campus_plans.insert_one({**p, "created_at": _now()})


async def get_active_subscription(user_id: str) -> dict | None:
    return await db.campus_subscriptions.find_one(
        {"user_id": user_id, "status": "active", "expires_at": {"$gt": _now()}}, {"_id": 0}
    )


# ==================== PASS CAMPUS — STUDENT ====================
@router.get("/plans")
async def list_plans(request: Request):
    await get_current_user(request)
    await ensure_plans_seeded()
    plans = await db.campus_plans.find({"enabled": True}, {"_id": 0}).to_list(50)
    return {"plans": plans}


@router.get("/subscription")
async def my_subscription(request: Request):
    user = await get_current_user(request)
    sub = await get_active_subscription(user["id"])
    return {"subscription": sub}


class SubscribeBody(BaseModel):
    plan_id: str


@router.post("/subscribe")
async def subscribe(body: SubscribeBody, request: Request):
    user = await get_current_user(request)
    await ensure_plans_seeded()
    plan = await db.campus_plans.find_one({"id": body.plan_id, "enabled": True}, {"_id": 0})
    if not plan:
        raise HTTPException(status_code=404, detail="Pass introuvable")
    if await get_active_subscription(user["id"]):
        raise HTTPException(status_code=409, detail="Vous avez déjà un Pass Campus actif")

    price = float(plan.get("price", 0) or 0)
    wallet = await db.wallets.find_one({"user_id": user["id"]})
    if not wallet or wallet.get("balance", 0) < price:
        raise HTTPException(status_code=400, detail="Solde SB Pay insuffisant pour souscrire ce Pass")

    new_balance = round(wallet["balance"] - price, 2)
    await db.wallets.update_one({"user_id": user["id"]}, {"$set": {"balance": new_balance}})
    await db.wallet_transactions.insert_one({
        "id": f"tx_{uuid.uuid4().hex[:12]}", "user_id": user["id"], "type": "Booking",
        "amount": -price, "balance_after": new_balance,
        "description": f"Souscription {plan['name']}", "status": "completed", "created_at": _now(),
    })

    # Grant included credits back to the wallet.
    credits = float(plan.get("included_credits", 0) or 0)
    if credits > 0:
        bal2 = round(new_balance + credits, 2)
        await db.wallets.update_one({"user_id": user["id"]}, {"$set": {"balance": bal2}})
        await db.wallet_transactions.insert_one({
            "id": f"tx_{uuid.uuid4().hex[:12]}", "user_id": user["id"], "type": "Topup",
            "amount": credits, "balance_after": bal2,
            "description": f"Crédits inclus {plan['name']}", "status": "completed", "created_at": _now(),
        })
        new_balance = bal2

    now = datetime.now(timezone.utc)
    sub = {
        "id": f"sub_{uuid.uuid4().hex[:10]}", "user_id": user["id"], "plan_id": plan["id"],
        "plan_name": plan["name"], "type": plan["type"], "discount_pct": plan.get("discount_pct", 0.0),
        "priority_booking": plan.get("priority_booking", False),
        "loyalty_bonus_pct": plan.get("loyalty_bonus_pct", 0.0),
        "started_at": now.isoformat(),
        "expires_at": (now + timedelta(days=int(plan.get("duration_days", 30)))).isoformat(),
        "status": "active", "credits_granted": credits, "price_paid": price, "created_at": now.isoformat(),
    }
    await db.campus_subscriptions.insert_one(dict(sub))
    sub.pop("_id", None)
    try:
        from core.notifications import create_notification
        await create_notification(user["id"], "student", "Pass Campus activé 🎓",
                                  f"Votre {plan['name']} est actif. Profitez de vos avantages !",
                                  data={"plan_id": plan["id"]})
    except Exception:
        pass
    return {"ok": True, "subscription": sub, "balance": new_balance}


@router.post("/subscription/cancel")
async def cancel_subscription(request: Request):
    user = await get_current_user(request)
    sub = await get_active_subscription(user["id"])
    if not sub:
        raise HTTPException(status_code=404, detail="Aucun Pass actif")
    await db.campus_subscriptions.update_one(
        {"id": sub["id"]}, {"$set": {"status": "cancelled", "cancelled_at": _now()}})
    return {"ok": True}


# ==================== RECURRING BOOKINGS ====================
VALID_FREQ = {"daily", "weekdays", "weekly"}


class RecurringBody(BaseModel):
    label: str
    pickup: dict
    dropoff: dict
    mode: str = "moto"
    frequency: str = "weekdays"
    days_of_week: list[int] = []        # 0=Mon .. 6=Sun (used for weekly)
    time: str = "08:00"                  # HH:MM
    start_date: str | None = None        # YYYY-MM-DD
    end_date: str | None = None
    active: bool = True


def _next_occurrences(tpl: dict, count: int = 5) -> list[str]:
    freq = tpl.get("frequency", "weekdays")
    try:
        hh, mm = [int(x) for x in (tpl.get("time") or "08:00").split(":")]
    except Exception:
        hh, mm = 8, 0
    dows = set(tpl.get("days_of_week") or [])
    now = datetime.now(timezone.utc)
    start = now
    if tpl.get("start_date"):
        try:
            sd = datetime.fromisoformat(tpl["start_date"]).replace(tzinfo=timezone.utc)
            start = max(now, sd)
        except Exception:
            pass
    end = None
    if tpl.get("end_date"):
        try:
            end = datetime.fromisoformat(tpl["end_date"]).replace(tzinfo=timezone.utc)
        except Exception:
            end = None
    out = []
    d = start
    for _ in range(120):  # scan up to ~120 days ahead
        if len(out) >= count:
            break
        candidate = d.replace(hour=hh, minute=mm, second=0, microsecond=0)
        if candidate >= now and (end is None or candidate <= end):
            wd = candidate.weekday()
            ok = (freq == "daily") or (freq == "weekdays" and wd < 5) or (freq == "weekly" and wd in dows)
            if ok:
                out.append(candidate.isoformat())
        d = d + timedelta(days=1)
    return out


@router.get("/recurring")
async def list_recurring(request: Request):
    user = await get_current_user(request)
    items = await db.recurring_bookings.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(100)
    for it in items:
        it["next_occurrences"] = _next_occurrences(it, 3)
    return {"recurring": items}


@router.post("/recurring")
async def create_recurring(body: RecurringBody, request: Request):
    user = await get_current_user(request)
    if body.frequency not in VALID_FREQ:
        raise HTTPException(status_code=400, detail="Fréquence invalide")
    doc = {
        "id": f"rec_{uuid.uuid4().hex[:10]}", "user_id": user["id"], "label": body.label.strip() or "Trajet récurrent",
        "pickup": body.pickup, "dropoff": body.dropoff, "mode": body.mode,
        "frequency": body.frequency, "days_of_week": body.days_of_week, "time": body.time,
        "start_date": body.start_date, "end_date": body.end_date, "active": body.active,
        "created_at": _now(),
    }
    await db.recurring_bookings.insert_one(dict(doc))
    doc.pop("_id", None)
    doc["next_occurrences"] = _next_occurrences(doc, 3)
    return {"recurring": doc}


class RecurringPatch(BaseModel):
    label: str | None = None
    time: str | None = None
    frequency: str | None = None
    days_of_week: list[int] | None = None
    active: bool | None = None
    end_date: str | None = None


@router.put("/recurring/{rec_id}")
async def update_recurring(rec_id: str, body: RecurringPatch, request: Request):
    user = await get_current_user(request)
    patch = {k: v for k, v in body.dict().items() if v is not None}
    if "frequency" in patch and patch["frequency"] not in VALID_FREQ:
        raise HTTPException(status_code=400, detail="Fréquence invalide")
    if not patch:
        raise HTTPException(status_code=400, detail="Rien à mettre à jour")
    res = await db.recurring_bookings.update_one({"id": rec_id, "user_id": user["id"]}, {"$set": patch})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Trajet introuvable")
    doc = await db.recurring_bookings.find_one({"id": rec_id}, {"_id": 0})
    doc["next_occurrences"] = _next_occurrences(doc, 3)
    return {"recurring": doc}


@router.delete("/recurring/{rec_id}")
async def delete_recurring(rec_id: str, request: Request):
    user = await get_current_user(request)
    res = await db.recurring_bookings.delete_one({"id": rec_id, "user_id": user["id"]})
    return {"deleted": res.deleted_count}


@router.get("/recurring/{rec_id}/book-next")
async def book_next(rec_id: str, request: Request):
    """Return the next occurrence + a booking payload to pre-fill the booking screen.
    Reuses the existing ride-creation flow on the frontend (no duplication)."""
    user = await get_current_user(request)
    tpl = await db.recurring_bookings.find_one({"id": rec_id, "user_id": user["id"]}, {"_id": 0})
    if not tpl:
        raise HTTPException(status_code=404, detail="Trajet introuvable")
    occ = _next_occurrences(tpl, 1)
    if not occ:
        raise HTTPException(status_code=400, detail="Aucune occurrence à venir")
    return {
        "occurrence_at": occ[0],
        "booking_payload": {
            "pickup": tpl.get("pickup"), "dropoff": tpl.get("dropoff"),
            "mode": tpl.get("mode"), "scheduled_at": occ[0],
        },
    }


# ==================== PASS CAMPUS — ADMIN ====================
async def _require_admin(request: Request):
    user = await get_current_user(request)
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    return user


@router.get("/admin/plans")
async def admin_plans(request: Request):
    await _require_admin(request)
    await ensure_plans_seeded()
    plans = await db.campus_plans.find({}, {"_id": 0}).to_list(50)
    return {"plans": plans}


class PlanBody(BaseModel):
    name: str
    type: str = "monthly"
    price: float = 0.0
    duration_days: int = 30
    discount_pct: float = 0.0
    included_credits: float = 0.0
    priority_booking: bool = True
    loyalty_bonus_pct: float = 0.0
    enabled: bool = True
    perks: list[str] = []


@router.post("/admin/plans")
async def admin_create_plan(body: PlanBody, request: Request):
    await _require_admin(request)
    doc = {"id": f"plan_{uuid.uuid4().hex[:8]}", **body.dict(), "created_at": _now()}
    await db.campus_plans.insert_one(dict(doc))
    doc.pop("_id", None)
    return {"plan": doc}


class PlanPatch(BaseModel):
    name: str | None = None
    price: float | None = None
    duration_days: int | None = None
    discount_pct: float | None = None
    included_credits: float | None = None
    priority_booking: bool | None = None
    loyalty_bonus_pct: float | None = None
    enabled: bool | None = None
    perks: list[str] | None = None


@router.put("/admin/plans/{plan_id}")
async def admin_update_plan(plan_id: str, body: PlanPatch, request: Request):
    await _require_admin(request)
    patch = {k: v for k, v in body.dict().items() if v is not None}
    if not patch:
        raise HTTPException(status_code=400, detail="Rien à mettre à jour")
    res = await db.campus_plans.update_one({"id": plan_id}, {"$set": patch})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Pass introuvable")
    return {"plan": await db.campus_plans.find_one({"id": plan_id}, {"_id": 0})}


@router.delete("/admin/plans/{plan_id}")
async def admin_delete_plan(plan_id: str, request: Request):
    await _require_admin(request)
    res = await db.campus_plans.delete_one({"id": plan_id})
    return {"deleted": res.deleted_count}
