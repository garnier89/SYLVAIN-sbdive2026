"""Admin — Gestion des dettes clients.

Surfaces the existing `cancellation_debts` engine (routes/debts.py) to admins:
list debtors, drill into a client's unpaid debts, and act — recover from the
client's wallet, waive (write-off), or remind. Admin-only.
"""
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Request

from core.config import db
from core.deps import require_role
from routes.debts import auto_settle_debts_from_wallet
from routes.audit_logs import log_action

router = APIRouter(prefix="/admin/debts", tags=["admin-debts"])


def _now():
    return datetime.now(timezone.utc).isoformat()


async def _enrich_user(user_id: str) -> dict:
    u = await db.users.find_one({"id": user_id},
                                {"_id": 0, "id": 1, "name": 1, "phone": 1, "email": 1}) or {}
    w = await db.wallets.find_one({"user_id": user_id}, {"_id": 0, "balance": 1}) or {}
    return {
        "user_id": user_id,
        "name": u.get("name") or "—",
        "phone": u.get("phone") or "",
        "email": u.get("email") or "",
        "wallet_balance": round(float(w.get("balance", 0) or 0), 2),
    }


@router.get("/overview")
async def debts_overview(request: Request, date_from: Optional[str] = None, date_to: Optional[str] = None):
    await require_role(request, ["admin"])
    # Outstanding debtors (grouped)
    pipeline = [
        {"$match": {"paid": False, "amount": {"$gt": 0}}},
        {"$group": {"_id": "$user_id",
                    "total": {"$sum": "$amount"},
                    "count": {"$sum": 1},
                    "oldest": {"$min": "$created_at"}}},
        {"$sort": {"total": -1}},
        {"$limit": 200},
    ]
    groups = await db.cancellation_debts.aggregate(pipeline).to_list(200)
    debtors = []
    for g in groups:
        info = await _enrich_user(g["_id"])
        info.update({"total": round(g["total"], 2), "count": g["count"], "oldest": g["oldest"]})
        debtors.append(info)

    total_outstanding = round(sum(d["total"] for d in debtors), 2)
    total_unpaid_count = sum(d["count"] for d in debtors)

    # Period recovery / waivers
    pmatch = {"paid": True}
    if date_from:
        pmatch["paid_at"] = {"$gte": date_from}
    if date_to:
        pmatch.setdefault("paid_at", {})["$lte"] = date_to + "T23:59:59"
    recovered = waived = 0.0
    paid_docs = await db.cancellation_debts.find(pmatch, {"_id": 0, "amount": 1, "waived": 1}).to_list(5000)
    for p in paid_docs:
        amt = float(p.get("amount", 0) or 0)
        if p.get("waived"):
            waived = round(waived + amt, 2)
        else:
            recovered = round(recovered + amt, 2)

    return {
        "kpis": {
            "total_outstanding": total_outstanding,
            "debtors_count": len(debtors),
            "unpaid_debts": total_unpaid_count,
            "avg_debt": round(total_outstanding / len(debtors), 2) if debtors else 0.0,
            "recovered_period": recovered,
            "waived_period": waived,
        },
        "debtors": debtors,
    }


@router.get("/user/{user_id}")
async def debts_user(user_id: str, request: Request):
    await require_role(request, ["admin"])
    info = await _enrich_user(user_id)
    unpaid = await db.cancellation_debts.find(
        {"user_id": user_id, "paid": False}, {"_id": 0}).sort("created_at", 1).to_list(200)
    history = await db.cancellation_debts.find(
        {"user_id": user_id, "paid": True}, {"_id": 0}).sort("paid_at", -1).limit(50).to_list(50)
    info["unpaid"] = unpaid
    info["unpaid_total"] = round(sum(float(i.get("amount", 0) or 0) for i in unpaid), 2)
    info["history"] = history
    return info


@router.post("/user/{user_id}/collect")
async def debts_collect(user_id: str, request: Request):
    """Recover the client's debts from their wallet balance (oldest first)."""
    admin = await require_role(request, ["admin"])
    recovered = await auto_settle_debts_from_wallet(user_id)
    await log_action(actor_id=admin["id"], actor_role=admin.get("role", "admin"),
                     action="debt_collect", target_type="user", target_id=user_id,
                     payload_after={"recovered": recovered})
    remaining = await db.cancellation_debts.count_documents({"user_id": user_id, "paid": False})
    return {"recovered": round(recovered, 2), "remaining_debts": remaining}


@router.post("/user/{user_id}/waive")
async def debts_waive(user_id: str, request: Request):
    """Write off (forgive) all the client's unpaid debts — platform absorbs."""
    admin = await require_role(request, ["admin"])
    unpaid = await db.cancellation_debts.find(
        {"user_id": user_id, "paid": False}, {"_id": 0, "amount": 1}).to_list(200)
    total = round(sum(float(i.get("amount", 0) or 0) for i in unpaid), 2)
    res = await db.cancellation_debts.update_many(
        {"user_id": user_id, "paid": False},
        {"$set": {"paid": True, "paid_at": _now(), "waived": True, "waived_by": admin["id"]}})
    await log_action(actor_id=admin["id"], actor_role=admin.get("role", "admin"),
                     action="debt_waive", target_type="user", target_id=user_id,
                     payload_after={"amount": total, "count": res.modified_count})
    return {"waived_amount": total, "waived_count": res.modified_count}


@router.post("/user/{user_id}/remind")
async def debts_remind(user_id: str, request: Request):
    """Re-send the client an in-app notification to settle their debt."""
    admin = await require_role(request, ["admin"])
    unpaid = await db.cancellation_debts.find(
        {"user_id": user_id, "paid": False}, {"_id": 0, "amount": 1}).to_list(200)
    total = round(sum(float(i.get("amount", 0) or 0) for i in unpaid), 2)
    if total <= 0:
        return {"reminded": False, "total": 0.0}
    from core.notifications import create_notification
    await create_notification(
        user_id, "debt", "Solde dû à régler 💶",
        f"Vous avez {total:.2f} € de solde dû. Réglez-le depuis votre portefeuille pour éviter qu'il soit ajouté à votre prochaine course.",
        data={"amount": total, "action": "pay_debt", "url": "/wallet?action=debt"})
    await log_action(actor_id=admin["id"], actor_role=admin.get("role", "admin"),
                     action="debt_remind", target_type="user", target_id=user_id,
                     payload_after={"amount": total})
    return {"reminded": True, "total": total}
