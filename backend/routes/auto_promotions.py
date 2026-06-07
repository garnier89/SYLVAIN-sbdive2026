"""AI Based Auto Promotions (parité V3Cube).

Rule-based promotions automatically applied to a rider's fare at booking time,
based on eligibility criteria evaluated against the rider's ride history:
  - first_ride    : rider has 0 completed rides
  - trip_count    : rider's completed-ride count has reached a threshold
  - inactive_user : rider hasn't booked for N days (or never)
  - every_trip    : always eligible

The best (highest) eligible discount is applied automatically — no code needed.
"""
from fastapi import APIRouter, Request, HTTPException
import uuid
from datetime import datetime, timezone, timedelta

from core.config import db
from core.deps import get_current_user, require_role

router = APIRouter(prefix="/auto-promotions", tags=["auto-promotions"])

CRITERIA = {"first_ride", "trip_count", "inactive_user", "every_trip"}
DISCOUNT_TYPES = {"flat", "percentage"}
_WRITE_PERM = "billing.promocodes.create"


def _serialize(p: dict) -> dict:
    p.pop("_id", None)
    return p


async def _completed_rides_count(user_id: str) -> int:
    return await db.rides.count_documents({"user_id": user_id, "status": "completed"})


async def _last_ride_dt(user_id: str):
    doc = await db.rides.find_one({"user_id": user_id}, {"_id": 0, "created_at": 1}, sort=[("created_at", -1)])
    if not doc or not doc.get("created_at"):
        return None
    try:
        return datetime.fromisoformat(doc["created_at"]).replace(tzinfo=timezone.utc) \
            if "+" not in doc["created_at"] else datetime.fromisoformat(doc["created_at"])
    except (ValueError, TypeError):
        return None


def _compute_discount(promo: dict, amount: float) -> float:
    dtype = promo.get("discount_type", "flat")
    val = float(promo.get("discount_amount", 0) or 0)
    if val <= 0 or amount <= 0:
        return 0.0
    if dtype == "percentage":
        capped = amount * (val / 100)
        max_d = float(promo.get("max_discount", 0) or 0)
        if max_d > 0:
            capped = min(capped, max_d)
        return round(min(capped, amount), 2)
    return round(min(val, amount), 2)


async def _is_eligible(promo: dict, user_id: str) -> bool:
    crit = promo.get("eligibility_criteria")
    if crit == "every_trip":
        return True
    if crit == "first_ride":
        return (await _completed_rides_count(user_id)) == 0
    if crit == "trip_count":
        threshold = int(promo.get("trip_count_threshold", 0) or 0)
        return threshold > 0 and (await _completed_rides_count(user_id)) >= threshold
    if crit == "inactive_user":
        days = int(promo.get("inactive_days", 0) or 0)
        if days <= 0:
            return False
        last = await _last_ride_dt(user_id)
        if last is None:
            return True
        return last < datetime.now(timezone.utc) - timedelta(days=days)
    return False


async def evaluate_best_auto_promo(user_id: str, amount: float, service_type: str = "ride"):
    """Return the best eligible active auto-promo for this user, or None.
    Side-effect free (does NOT increment usage)."""
    if amount <= 0:
        return None
    promos = await db.auto_promotions.find({"status": "active"}, {"_id": 0}).to_list(200)
    best = None
    for p in promos:
        svc = p.get("service_type", "all")
        if svc not in ("all", service_type):
            continue
        if not await _is_eligible(p, user_id):
            continue
        discount = _compute_discount(p, amount)
        if discount <= 0:
            continue
        if best is None or discount > best["discount_amount"]:
            best = {
                "id": p["id"], "title": p.get("title", "Promotion"),
                "eligibility_criteria": p.get("eligibility_criteria"),
                "discount_type": p.get("discount_type", "flat"),
                "discount_amount": discount,
            }
    return best


@router.get("/best")
async def best_auto_promo(request: Request, amount: float = 0, service: str = "ride"):
    """Rider-facing: best auto-promo applicable to the given fare amount."""
    user = await get_current_user(request)
    promo = await evaluate_best_auto_promo(user["id"], float(amount or 0), service)
    return {"promo": promo}


# ───────────────────────── Admin CRUD ─────────────────────────
def _clean_payload(body: dict) -> dict:
    crit = body.get("eligibility_criteria")
    if crit not in CRITERIA:
        raise HTTPException(status_code=400, detail="Critère d'éligibilité invalide")
    dtype = body.get("discount_type", "flat")
    if dtype not in DISCOUNT_TYPES:
        raise HTTPException(status_code=400, detail="Type de remise invalide")
    try:
        amount = float(body.get("discount_amount", 0) or 0)
    except (TypeError, ValueError):
        amount = 0.0
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Le montant de la remise doit être supérieur à 0")
    return {
        "title": (body.get("title") or "").strip() or "Promotion",
        "eligibility_criteria": crit,
        "trip_count_threshold": int(body.get("trip_count_threshold", 0) or 0),
        "inactive_days": int(body.get("inactive_days", 0) or 0),
        "discount_type": dtype,
        "discount_amount": amount,
        "max_discount": float(body.get("max_discount", 0) or 0),
        "service_type": body.get("service_type", "all") or "all",
        "status": "active" if body.get("status", "active") == "active" else "inactive",
    }


@router.post("/admin")
async def create_auto_promo(request: Request):
    await require_role(request, ["admin"], permission=_WRITE_PERM)
    body = await request.json()
    promo = {
        "id": f"autopromo_{uuid.uuid4().hex[:12]}",
        **_clean_payload(body),
        "usage_count": 0,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.auto_promotions.insert_one(promo)
    return _serialize(promo)


@router.get("/admin")
async def list_auto_promos(request: Request):
    await require_role(request, ["admin"], permission=_WRITE_PERM)
    promos = await db.auto_promotions.find({}, {"_id": 0}).sort("created_at", -1).to_list(300)
    return promos


@router.put("/admin/{promo_id}")
async def update_auto_promo(promo_id: str, request: Request):
    await require_role(request, ["admin"], permission=_WRITE_PERM)
    body = await request.json()
    updates = {**_clean_payload(body), "updated_at": datetime.now(timezone.utc).isoformat()}
    res = await db.auto_promotions.update_one({"id": promo_id}, {"$set": updates})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Promotion introuvable")
    doc = await db.auto_promotions.find_one({"id": promo_id}, {"_id": 0})
    return doc


@router.put("/admin/{promo_id}/toggle")
async def toggle_auto_promo(promo_id: str, request: Request):
    await require_role(request, ["admin"], permission=_WRITE_PERM)
    doc = await db.auto_promotions.find_one({"id": promo_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Promotion introuvable")
    new_status = "inactive" if doc.get("status") == "active" else "active"
    await db.auto_promotions.update_one({"id": promo_id}, {"$set": {"status": new_status, "updated_at": datetime.now(timezone.utc).isoformat()}})
    return {"id": promo_id, "status": new_status}


@router.delete("/admin/{promo_id}")
async def delete_auto_promo(promo_id: str, request: Request):
    await require_role(request, ["admin"], permission=_WRITE_PERM)
    res = await db.auto_promotions.delete_one({"id": promo_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Promotion introuvable")
    return {"deleted": True, "id": promo_id}
