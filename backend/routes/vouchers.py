"""Vouchers (parité V3Cube) — bons à usage limité, distincts des Promocodes.

A voucher is a redeemable CODE the rider enters at booking/payment. It supports
a flexible model covering the requested behaviours:
  - (a) code entered at payment that reduces the fare,
  - (b) fixed-amount single-use bon (per_user_limit / total_quota),
  - (c) promo-like code with a validity window + total quota.

Discount can be `fixed` (€) or `percentage` (with optional max_discount cap).
"""
from fastapi import APIRouter, Request, HTTPException
import uuid
from datetime import datetime, timezone

from core.config import db
from core.deps import get_current_user, require_role

router = APIRouter(prefix="/vouchers", tags=["vouchers"])

DISCOUNT_TYPES = {"fixed", "percentage"}
_WRITE_PERM = "billing.promocodes.create"


def _now():
    return datetime.now(timezone.utc)


def _parse_dt(s):
    if not s:
        return None
    try:
        dt = datetime.fromisoformat(s)
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except (ValueError, TypeError):
        return None


def _compute_discount(v: dict, amount: float) -> float:
    val = float(v.get("value", 0) or 0)
    if val <= 0 or amount <= 0:
        return 0.0
    if v.get("discount_type") == "percentage":
        d = amount * (val / 100)
        cap = float(v.get("max_discount", 0) or 0)
        if cap > 0:
            d = min(d, cap)
        return round(min(d, amount), 2)
    return round(min(val, amount), 2)


async def validate_voucher(code: str, user_id: str, amount: float):
    """Return (voucher, discount, error). error is a user-facing string or None."""
    code = (code or "").strip().upper()
    if not code:
        return None, 0.0, "Code requis"
    v = await db.vouchers.find_one({"code": code}, {"_id": 0})
    if not v:
        return None, 0.0, "Code voucher invalide"
    if v.get("status") != "active":
        return None, 0.0, "Ce voucher n'est plus actif"
    now = _now()
    vf, vu = _parse_dt(v.get("valid_from")), _parse_dt(v.get("valid_until"))
    if vf and now < vf:
        return None, 0.0, "Ce voucher n'est pas encore valable"
    if vu and now > vu:
        return None, 0.0, "Ce voucher a expiré"
    min_amt = float(v.get("min_order_amount", 0) or 0)
    if amount < min_amt:
        return None, 0.0, f"Montant minimum requis : {min_amt:.2f} €"
    total_quota = int(v.get("total_quota", 0) or 0)
    if total_quota > 0 and int(v.get("used_count", 0) or 0) >= total_quota:
        return None, 0.0, "Ce voucher a atteint sa limite d'utilisation"
    per_user = int(v.get("per_user_limit", 1) or 0)
    if per_user > 0:
        used_by_user = await db.voucher_redemptions.count_documents({"voucher_id": v["id"], "user_id": user_id})
        if used_by_user >= per_user:
            return None, 0.0, "Vous avez déjà utilisé ce voucher"
    discount = _compute_discount(v, amount)
    if discount <= 0:
        return None, 0.0, "Ce voucher ne s'applique pas à ce montant"
    return v, discount, None


async def redeem_voucher(voucher_id: str, user_id: str, ride_id: str, discount: float):
    await db.voucher_redemptions.insert_one({
        "id": f"vred_{uuid.uuid4().hex[:12]}",
        "voucher_id": voucher_id, "user_id": user_id, "ride_id": ride_id,
        "discount": discount, "redeemed_at": _now().isoformat(),
    })
    await db.vouchers.update_one({"id": voucher_id}, {"$inc": {"used_count": 1}})


@router.post("/validate")
async def validate_voucher_endpoint(request: Request):
    """Rider-facing: check a voucher code against a fare amount."""
    user = await get_current_user(request)
    body = await request.json()
    code = body.get("code", "")
    amount = float(body.get("amount", 0) or 0)
    v, discount, error = await validate_voucher(code, user["id"], amount)
    if error:
        return {"valid": False, "message": error}
    return {"valid": True, "voucher_id": v["id"], "code": v["code"], "title": v.get("title", v["code"]),
            "discount": discount, "discount_type": v.get("discount_type"), "message": "Voucher appliqué"}


# ───────────────────────── Admin CRUD ─────────────────────────
def _clean_payload(body: dict) -> dict:
    code = (body.get("code") or "").strip().upper()
    if not code:
        raise HTTPException(status_code=400, detail="Code requis")
    dtype = body.get("discount_type", "fixed")
    if dtype not in DISCOUNT_TYPES:
        raise HTTPException(status_code=400, detail="Type de remise invalide")
    try:
        value = float(body.get("value", 0) or 0)
    except (TypeError, ValueError):
        value = 0.0
    if value <= 0:
        raise HTTPException(status_code=400, detail="La valeur doit être supérieure à 0")
    return {
        "code": code,
        "title": (body.get("title") or "").strip() or code,
        "discount_type": dtype,
        "value": value,
        "max_discount": float(body.get("max_discount", 0) or 0),
        "min_order_amount": float(body.get("min_order_amount", 0) or 0),
        "total_quota": int(body.get("total_quota", 0) or 0),
        "per_user_limit": int(body.get("per_user_limit", 1) or 0),
        "valid_from": (body.get("valid_from") or "") or None,
        "valid_until": (body.get("valid_until") or "") or None,
        "status": "active" if body.get("status", "active") == "active" else "inactive",
    }


@router.post("/admin")
async def create_voucher(request: Request):
    await require_role(request, ["admin"], permission=_WRITE_PERM)
    body = await request.json()
    payload = _clean_payload(body)
    if await db.vouchers.find_one({"code": payload["code"]}, {"_id": 1}):
        raise HTTPException(status_code=400, detail="Ce code voucher existe déjà")
    voucher = {"id": f"voucher_{uuid.uuid4().hex[:12]}", **payload, "used_count": 0,
               "created_at": _now().isoformat()}
    await db.vouchers.insert_one(voucher)
    voucher.pop("_id", None)
    return voucher


@router.get("/admin")
async def list_vouchers(request: Request):
    await require_role(request, ["admin"], permission=_WRITE_PERM)
    return await db.vouchers.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)


@router.put("/admin/{voucher_id}")
async def update_voucher(voucher_id: str, request: Request):
    await require_role(request, ["admin"], permission=_WRITE_PERM)
    body = await request.json()
    payload = _clean_payload(body)
    dup = await db.vouchers.find_one({"code": payload["code"], "id": {"$ne": voucher_id}}, {"_id": 1})
    if dup:
        raise HTTPException(status_code=400, detail="Ce code voucher existe déjà")
    res = await db.vouchers.update_one({"id": voucher_id}, {"$set": payload})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Voucher introuvable")
    return await db.vouchers.find_one({"id": voucher_id}, {"_id": 0})


@router.put("/admin/{voucher_id}/toggle")
async def toggle_voucher(voucher_id: str, request: Request):
    await require_role(request, ["admin"], permission=_WRITE_PERM)
    v = await db.vouchers.find_one({"id": voucher_id}, {"_id": 0})
    if not v:
        raise HTTPException(status_code=404, detail="Voucher introuvable")
    new_status = "inactive" if v.get("status") == "active" else "active"
    await db.vouchers.update_one({"id": voucher_id}, {"$set": {"status": new_status}})
    return {"id": voucher_id, "status": new_status}


@router.delete("/admin/{voucher_id}")
async def delete_voucher(voucher_id: str, request: Request):
    await require_role(request, ["admin"], permission=_WRITE_PERM)
    res = await db.vouchers.delete_one({"id": voucher_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Voucher introuvable")
    return {"deleted": True, "id": voucher_id}
