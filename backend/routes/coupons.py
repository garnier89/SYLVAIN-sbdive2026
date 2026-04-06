from fastapi import APIRouter, Request, HTTPException
import uuid
from datetime import datetime, timezone

from core.config import db
from core.deps import get_current_user, require_role

router = APIRouter(prefix="/coupons", tags=["coupons"])


@router.post("/validate")
async def validate_coupon(request: Request):
    """Validate a coupon code and return discount info."""
    user = await get_current_user(request)
    body = await request.json()
    code = body.get("code", "").strip().upper()
    amount = body.get("amount", 0)
    service_type = body.get("service_type", "Ride")

    if not code:
        raise HTTPException(status_code=400, detail="Code promo requis")

    coupon = await db.coupons.find_one({"code": code, "status": "active"}, {"_id": 0})
    if not coupon:
        raise HTTPException(status_code=404, detail="Code promo invalide ou expire")

    # Check expiry
    now = datetime.now(timezone.utc)
    if coupon.get("expiry_date"):
        try:
            expiry = datetime.fromisoformat(coupon["expiry_date"]).replace(tzinfo=timezone.utc)
        except (ValueError, TypeError):
            expiry = None
        if expiry and now > expiry:
            raise HTTPException(status_code=400, detail="Code promo expire")

    # Check usage limit
    if coupon.get("usage_limit", 0) > 0 and coupon.get("used", 0) >= coupon["usage_limit"]:
        raise HTTPException(status_code=400, detail="Code promo usage limite atteinte")

    # Check per-user limit
    user_usage = await db.coupon_usage.count_documents({"coupon_code": code, "user_id": user["id"]})
    if coupon.get("per_user_limit", 1) > 0 and user_usage >= coupon.get("per_user_limit", 1):
        raise HTTPException(status_code=400, detail="Vous avez deja utilise ce code promo")

    # Calculate discount
    discount_type = coupon.get("discount_type", "Flat")
    discount_value = coupon.get("discount_value", 0)

    if discount_type == "Percentage":
        discount = min(amount * (discount_value / 100), coupon.get("max_discount", 999999))
    else:
        discount = min(discount_value, amount)

    return {
        "valid": True,
        "code": code,
        "discount_type": discount_type,
        "discount_value": discount_value,
        "discount_amount": round(discount, 2),
        "message": f"Reduction de {round(discount, 2)} EUR appliquee",
    }


@router.post("/apply")
async def apply_coupon(request: Request):
    """Apply coupon and mark as used."""
    user = await get_current_user(request)
    body = await request.json()
    code = body.get("code", "").strip().upper()
    ride_id = body.get("ride_id")
    order_id = body.get("order_id")
    amount = body.get("amount", 0)

    # Re-validate
    coupon = await db.coupons.find_one({"code": code, "status": "active"}, {"_id": 0})
    if not coupon:
        raise HTTPException(status_code=404, detail="Code promo invalide")

    discount_type = coupon.get("discount_type", "Flat")
    discount_value = coupon.get("discount_value", 0)
    if discount_type == "Percentage":
        discount = min(amount * (discount_value / 100), coupon.get("max_discount", 999999))
    else:
        discount = min(discount_value, amount)

    # Record usage
    usage = {
        "id": f"cu_{uuid.uuid4().hex[:12]}",
        "coupon_code": code,
        "user_id": user["id"],
        "ride_id": ride_id,
        "order_id": order_id,
        "discount_applied": round(discount, 2),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.coupon_usage.insert_one(usage)
    await db.coupons.update_one({"code": code}, {"$inc": {"used": 1}})

    return {
        "applied": True,
        "discount_amount": round(discount, 2),
        "final_amount": round(max(amount - discount, 0), 2),
    }


@router.get("")
async def list_active_coupons(request: Request):
    """List all active coupons (user-visible)."""
    await get_current_user(request)
    now = datetime.now(timezone.utc).isoformat()
    coupons = await db.coupons.find(
        {"status": "active"},
        {"_id": 0, "code": 1, "description": 1, "discount_type": 1, "discount_value": 1, "max_discount": 1, "expiry_date": 1}
    ).to_list(50)
    return coupons


# Admin endpoints
@router.post("/admin/create")
async def create_coupon(request: Request):
    """Create a new coupon (admin only)."""
    await require_role(request, ["admin"])
    body = await request.json()

    code = body.get("code", "").strip().upper()
    if not code:
        raise HTTPException(status_code=400, detail="Code requis")

    existing = await db.coupons.find_one({"code": code})
    if existing:
        raise HTTPException(status_code=400, detail="Ce code existe deja")

    coupon = {
        "id": f"coupon_{uuid.uuid4().hex[:12]}",
        "code": code,
        "description": body.get("description", ""),
        "discount_type": body.get("discount_type", "Flat"),
        "discount_value": body.get("discount_value", 0),
        "max_discount": body.get("max_discount", 999999),
        "usage_limit": body.get("usage_limit", 0),
        "per_user_limit": body.get("per_user_limit", 1),
        "used": 0,
        "service_type": body.get("service_type", "All"),
        "status": "active",
        "expiry_date": body.get("expiry_date"),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.coupons.insert_one(coupon)
    coupon.pop("_id", None)
    return coupon


@router.get("/admin/all")
async def admin_list_coupons(request: Request):
    """List all coupons (admin only)."""
    await require_role(request, ["admin"])
    coupons = await db.coupons.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return coupons
