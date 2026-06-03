"""
Corporate Accounts (V3Cube Pack C — B2B).

A company (corporate account) is created by an admin with a billing email,
a join code, a discount %, and a monthly credit limit. Employees join the
account with the code and can charge their rides directly to the company.

Collections:
  - corporate_accounts : {id, name, join_code, billing_email, contact_phone,
        address, discount_pct, monthly_credit_limit, credit_used, is_active, ...}
  - corporate_members  : {id, corporate_id, user_id, user_email, user_name,
        member_role, status, created_at}
  - corporate_charges  : {id, corporate_id, ride_id, user_id, user_name,
        gross_fare, discount, net_fare, month, created_at}
"""
from fastapi import APIRouter, Request, HTTPException, Depends
from datetime import datetime, timezone
import uuid
import secrets
import string

from core.config import db
from core.deps import get_current_user
from core.permissions import require_permission

router = APIRouter(prefix="/corporate", tags=["corporate"])


def _gen_join_code(name: str) -> str:
    prefix = "".join(c for c in (name or "SB").upper() if c.isalnum())[:6] or "SB"
    suffix = "".join(secrets.choice(string.ascii_uppercase + string.digits) for _ in range(4))
    return f"{prefix}-{suffix}"


# ============================================================
# Internal helpers (used by routes/rides.py)
# ============================================================

async def resolve_corporate_for_booking(user_id: str, code_or_id: str):
    """Return the corporate account if the user is an active member, else None."""
    if not code_or_id:
        return None
    code = code_or_id.strip().upper()
    account = await db.corporate_accounts.find_one(
        {"$or": [{"join_code": code}, {"id": code_or_id}], "is_active": True}, {"_id": 0}
    )
    if not account:
        return None
    member = await db.corporate_members.find_one(
        {"corporate_id": account["id"], "user_id": user_id, "status": "active"}, {"_id": 0}
    )
    if not member:
        return None
    return account


async def record_corporate_charge(account_id: str, ride: dict, gross_fare: float):
    """Record a completed corporate ride on the company ledger."""
    account = await db.corporate_accounts.find_one({"id": account_id}, {"_id": 0})
    if not account:
        return
    discount_pct = float(account.get("discount_pct", 0))
    discount = round(gross_fare * discount_pct / 100, 2)
    net = round(gross_fare - discount, 2)
    now = datetime.now(timezone.utc)
    charge = {
        "id": f"cch_{uuid.uuid4().hex[:10]}",
        "corporate_id": account_id,
        "ride_id": ride.get("id"),
        "booking_no": ride.get("booking_no"),
        "user_id": ride.get("user_id"),
        "user_name": ride.get("book_for_name") or ride.get("driver_name") or "Employé",
        "pickup_address": ride.get("pickup_address"),
        "dropoff_address": ride.get("dropoff_address"),
        "gross_fare": round(gross_fare, 2),
        "discount": discount,
        "net_fare": net,
        "month": now.strftime("%Y-%m"),
        "created_at": now.isoformat(),
    }
    await db.corporate_charges.insert_one(charge)
    await db.corporate_accounts.update_one(
        {"id": account_id},
        {"$inc": {"credit_used": net, "total_rides": 1, "total_revenue": net}},
    )


# ============================================================
# User endpoints
# ============================================================

@router.get("/my")
async def my_corporate_accounts(request: Request):
    """List the corporate accounts the current user is an active member of."""
    user = await get_current_user(request)
    members = await db.corporate_members.find(
        {"user_id": user["id"], "status": "active"}, {"_id": 0}
    ).to_list(50)
    out = []
    for m in members:
        acc = await db.corporate_accounts.find_one(
            {"id": m["corporate_id"], "is_active": True},
            {"_id": 0, "id": 1, "name": 1, "join_code": 1, "discount_pct": 1},
        )
        if acc:
            out.append({**acc, "member_role": m.get("member_role", "employee")})
    return {"items": out, "count": len(out)}


@router.post("/join")
async def join_corporate(request: Request):
    """Join a corporate account using its join code."""
    user = await get_current_user(request)
    body = await request.json()
    code = (body.get("join_code") or "").strip().upper()
    if not code:
        raise HTTPException(status_code=400, detail="Code requis")
    account = await db.corporate_accounts.find_one({"join_code": code, "is_active": True}, {"_id": 0})
    if not account:
        raise HTTPException(status_code=404, detail="Code entreprise invalide ou compte inactif")
    existing = await db.corporate_members.find_one(
        {"corporate_id": account["id"], "user_id": user["id"]}, {"_id": 0}
    )
    if existing:
        if existing.get("status") == "active":
            raise HTTPException(status_code=400, detail="Vous êtes déjà membre de cette entreprise")
        await db.corporate_members.update_one(
            {"id": existing["id"]}, {"$set": {"status": "active"}}
        )
        return {"message": "Réactivé", "corporate_name": account["name"]}
    member = {
        "id": f"cmb_{uuid.uuid4().hex[:10]}",
        "corporate_id": account["id"],
        "user_id": user["id"],
        "user_email": user.get("email"),
        "user_name": user.get("name"),
        "member_role": "employee",
        "status": "active",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.corporate_members.insert_one(member)
    return {"message": "Vous avez rejoint l'entreprise", "corporate_name": account["name"]}


@router.post("/leave/{corporate_id}")
async def leave_corporate(corporate_id: str, request: Request):
    user = await get_current_user(request)
    res = await db.corporate_members.update_one(
        {"corporate_id": corporate_id, "user_id": user["id"]},
        {"$set": {"status": "inactive"}},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Adhésion introuvable")
    return {"message": "Vous avez quitté l'entreprise"}


# ============================================================
# Admin endpoints
# ============================================================

@router.get("/admin")
async def admin_list(current_user: dict = Depends(require_permission("merchants.view"))):
    items = await db.corporate_accounts.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    for it in items:
        it["member_count"] = await db.corporate_members.count_documents(
            {"corporate_id": it["id"], "status": "active"}
        )
    return {"items": items, "total": len(items)}


@router.post("/admin")
async def admin_create(request: Request, current_user: dict = Depends(require_permission("merchants.activate"))):
    body = await request.json()
    name = (body.get("name") or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Nom requis")
    join_code = (body.get("join_code") or "").strip().upper() or _gen_join_code(name)
    if await db.corporate_accounts.find_one({"join_code": join_code}):
        join_code = _gen_join_code(name)
    account = {
        "id": f"corp_{uuid.uuid4().hex[:10]}",
        "name": name,
        "join_code": join_code,
        "billing_email": body.get("billing_email", ""),
        "contact_phone": body.get("contact_phone", ""),
        "address": body.get("address", ""),
        "discount_pct": float(body.get("discount_pct", 0)),
        "monthly_credit_limit": float(body.get("monthly_credit_limit", 0)),
        "credit_used": 0.0,
        "total_rides": 0,
        "total_revenue": 0.0,
        "is_active": bool(body.get("is_active", True)),
        "notes": body.get("notes", ""),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.corporate_accounts.insert_one(account)
    account.pop("_id", None)
    return account


@router.get("/admin/{corporate_id}")
async def admin_detail(corporate_id: str, current_user: dict = Depends(require_permission("merchants.view"))):
    account = await db.corporate_accounts.find_one({"id": corporate_id}, {"_id": 0})
    if not account:
        raise HTTPException(status_code=404, detail="Compte entreprise introuvable")
    members = await db.corporate_members.find(
        {"corporate_id": corporate_id}, {"_id": 0}
    ).sort("created_at", -1).to_list(500)
    charges = await db.corporate_charges.find(
        {"corporate_id": corporate_id}, {"_id": 0}
    ).sort("created_at", -1).limit(50).to_list(50)
    return {"account": account, "members": members, "charges": charges}


@router.put("/admin/{corporate_id}")
async def admin_update(corporate_id: str, request: Request, current_user: dict = Depends(require_permission("merchants.activate"))):
    body = await request.json()
    updates = {}
    for k in ("name", "billing_email", "contact_phone", "address", "notes"):
        if k in body:
            updates[k] = body[k]
    for k in ("discount_pct", "monthly_credit_limit"):
        if k in body:
            updates[k] = float(body[k])
    if "is_active" in body:
        updates["is_active"] = bool(body["is_active"])
    if "join_code" in body and body["join_code"]:
        new_code = body["join_code"].strip().upper()
        clash = await db.corporate_accounts.find_one(
            {"join_code": new_code, "id": {"$ne": corporate_id}}, {"_id": 0, "id": 1}
        )
        if clash:
            raise HTTPException(status_code=400, detail="Ce code est déjà utilisé")
        updates["join_code"] = new_code
    res = await db.corporate_accounts.update_one({"id": corporate_id}, {"$set": updates})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Compte entreprise introuvable")
    return {"message": "updated"}


@router.delete("/admin/{corporate_id}")
async def admin_delete(corporate_id: str, current_user: dict = Depends(require_permission("merchants.activate"))):
    res = await db.corporate_accounts.delete_one({"id": corporate_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Compte entreprise introuvable")
    await db.corporate_members.delete_many({"corporate_id": corporate_id})
    return {"message": "deleted"}


@router.post("/admin/{corporate_id}/members")
async def admin_add_member(corporate_id: str, request: Request, current_user: dict = Depends(require_permission("merchants.activate"))):
    body = await request.json()
    email = (body.get("email") or "").strip().lower()
    if not email:
        raise HTTPException(status_code=400, detail="Email requis")
    account = await db.corporate_accounts.find_one({"id": corporate_id}, {"_id": 0})
    if not account:
        raise HTTPException(status_code=404, detail="Compte entreprise introuvable")
    target = await db.users.find_one({"email": email}, {"_id": 0, "id": 1, "name": 1, "email": 1})
    if not target:
        raise HTTPException(status_code=404, detail="Aucun utilisateur avec cet email")
    existing = await db.corporate_members.find_one(
        {"corporate_id": corporate_id, "user_id": target["id"]}, {"_id": 0}
    )
    if existing:
        await db.corporate_members.update_one(
            {"id": existing["id"]}, {"$set": {"status": "active"}}
        )
        return {"message": "Membre réactivé"}
    member = {
        "id": f"cmb_{uuid.uuid4().hex[:10]}",
        "corporate_id": corporate_id,
        "user_id": target["id"],
        "user_email": target.get("email"),
        "user_name": target.get("name"),
        "member_role": body.get("member_role", "employee"),
        "status": "active",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.corporate_members.insert_one(member)
    member.pop("_id", None)
    return member


@router.delete("/admin/{corporate_id}/members/{member_id}")
async def admin_remove_member(corporate_id: str, member_id: str, current_user: dict = Depends(require_permission("merchants.activate"))):
    res = await db.corporate_members.delete_one({"id": member_id, "corporate_id": corporate_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Membre introuvable")
    return {"message": "removed"}


@router.get("/admin/{corporate_id}/invoice")
async def admin_invoice(corporate_id: str, month: str = None, current_user: dict = Depends(require_permission("merchants.view"))):
    """Monthly invoice summary for a corporate account. month=YYYY-MM (defaults current)."""
    account = await db.corporate_accounts.find_one({"id": corporate_id}, {"_id": 0})
    if not account:
        raise HTTPException(status_code=404, detail="Compte entreprise introuvable")
    month = month or datetime.now(timezone.utc).strftime("%Y-%m")
    charges = await db.corporate_charges.find(
        {"corporate_id": corporate_id, "month": month}, {"_id": 0}
    ).sort("created_at", 1).to_list(2000)
    total_gross = round(sum(c.get("gross_fare", 0) for c in charges), 2)
    total_discount = round(sum(c.get("discount", 0) for c in charges), 2)
    total_net = round(sum(c.get("net_fare", 0) for c in charges), 2)
    return {
        "account": {"id": account["id"], "name": account["name"], "billing_email": account.get("billing_email")},
        "month": month,
        "rides": len(charges),
        "total_gross": total_gross,
        "total_discount": total_discount,
        "total_net": total_net,
        "charges": charges,
    }
