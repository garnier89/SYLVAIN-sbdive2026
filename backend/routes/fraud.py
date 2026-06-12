"""Admin anti-fraud dashboard — alerts feed, wallet risk scoring, account blocking.

Gated by the `super.fraud.*` permissions. Legacy super-admins (no role_ids) hold
`super.all` and therefore pass automatically.
"""
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, Request, HTTPException, Depends

from core.config import db
from core.permissions import require_permission
from core.fraud import record_fraud_event
from routes.audit_logs import log_action

router = APIRouter(prefix="/fraud", tags=["fraud"])


@router.get("/summary")
async def fraud_summary(current_user: dict = Depends(require_permission("super.fraud.view"))):
    now = datetime.now(timezone.utc)
    today = now.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    return {
        "open_alerts": await db.fraud_events.count_documents({"resolved": False}),
        "critical": await db.fraud_events.count_documents({"resolved": False, "severity": "critical"}),
        "high": await db.fraud_events.count_documents({"resolved": False, "severity": "high"}),
        "blocked_users": await db.users.count_documents({"is_blocked": True}),
        "events_today": await db.fraud_events.count_documents({"created_at": {"$gte": today}}),
    }


@router.get("/alerts")
async def fraud_alerts(resolved: Optional[bool] = None, severity: Optional[str] = None,
                       limit: int = 100, current_user: dict = Depends(require_permission("super.fraud.view"))):
    q = {}
    if resolved is not None:
        q["resolved"] = resolved
    if severity:
        q["severity"] = severity
    items = await db.fraud_events.find(q, {"_id": 0}).sort("created_at", -1).limit(min(limit, 500)).to_list(500)
    uids = list({i.get("user_id") for i in items if i.get("user_id")})
    users = {u["id"]: u for u in await db.users.find(
        {"id": {"$in": uids}}, {"_id": 0, "id": 1, "name": 1, "email": 1, "is_blocked": 1}).to_list(2000)}
    for i in items:
        u = users.get(i.get("user_id")) or {}
        i["user_name"] = u.get("name")
        i["user_email"] = u.get("email")
        i["user_blocked"] = u.get("is_blocked", False)
    return {"items": items, "total": len(items)}


@router.post("/alerts/{alert_id}/resolve")
async def resolve_alert(alert_id: str, request: Request,
                        current_user: dict = Depends(require_permission("super.fraud.manage"))):
    body = await request.json()
    res = await db.fraud_events.update_one({"id": alert_id}, {"$set": {
        "resolved": True, "resolved_by": current_user["id"],
        "resolved_at": datetime.now(timezone.utc).isoformat(), "resolution_note": body.get("note", ""),
    }})
    if not res.matched_count:
        raise HTTPException(404, "Alerte introuvable")
    return {"message": "resolved"}


@router.get("/wallet-risk")
async def wallet_risk(current_user: dict = Depends(require_permission("super.fraud.view"))):
    """Top users by 7-day wallet velocity (transfers out, refunds, deposits)."""
    since = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
    pipeline = [
        {"$match": {"created_at": {"$gte": since}}},
        {"$group": {
            "_id": "$user_id",
            "transfer_out": {"$sum": {"$cond": [{"$and": [{"$eq": ["$type", "Transfer"]}, {"$lt": ["$amount", 0]}]}, {"$abs": "$amount"}, 0]}},
            "transfer_count": {"$sum": {"$cond": [{"$and": [{"$eq": ["$type", "Transfer"]}, {"$lt": ["$amount", 0]}]}, 1, 0]}},
            "refunds": {"$sum": {"$cond": [{"$eq": ["$type", "Refund"]}, "$amount", 0]}},
            "deposits": {"$sum": {"$cond": [{"$eq": ["$type", "Deposit"]}, "$amount", 0]}},
        }},
        {"$sort": {"transfer_out": -1}},
        {"$limit": 25},
    ]
    rows = [r async for r in db.wallet_transactions.aggregate(pipeline)]
    uids = [r["_id"] for r in rows if r["_id"]]
    users = {u["id"]: u for u in await db.users.find(
        {"id": {"$in": uids}}, {"_id": 0, "id": 1, "name": 1, "email": 1, "is_blocked": 1}).to_list(2000)}
    out = []
    for r in rows:
        u = users.get(r["_id"]) or {}
        out.append({
            "user_id": r["_id"], "user_name": u.get("name"), "user_email": u.get("email"),
            "is_blocked": u.get("is_blocked", False),
            "transfer_out": round(r["transfer_out"], 2), "transfer_count": r["transfer_count"],
            "refunds": round(r["refunds"], 2), "deposits": round(r["deposits"], 2),
        })
    return {"items": out, "window_days": 7}


@router.post("/users/{user_id}/block")
async def block_user(user_id: str, request: Request,
                     current_user: dict = Depends(require_permission("super.fraud.manage"))):
    body = await request.json()
    reason = body.get("reason", "Activité frauduleuse suspectée")
    u = await db.users.find_one({"id": user_id}, {"_id": 0, "id": 1, "role": 1})
    if not u:
        raise HTTPException(404, "Utilisateur introuvable")
    if u.get("role") == "admin":
        raise HTTPException(400, "Impossible de bloquer un administrateur")
    await db.users.update_one({"id": user_id}, {"$set": {
        "is_blocked": True, "blocked_reason": reason,
        "blocked_at": datetime.now(timezone.utc).isoformat(), "blocked_by": current_user["id"],
    }})
    await record_fraud_event(event_type="account.blocked", severity="high", user_id=user_id,
                             actor_id=current_user["id"], description=f"Compte bloqué: {reason}")
    await log_action(actor_id=current_user["id"], actor_role="admin", action="fraud.block_user",
                     target_type="user", target_id=user_id, reason=reason)
    return {"message": "Utilisateur bloqué"}


@router.post("/users/{user_id}/unblock")
async def unblock_user(user_id: str, request: Request,
                       current_user: dict = Depends(require_permission("super.fraud.manage"))):
    res = await db.users.update_one({"id": user_id}, {
        "$set": {"is_blocked": False},
        "$unset": {"blocked_reason": "", "blocked_at": "", "blocked_by": ""},
    })
    if not res.matched_count:
        raise HTTPException(404, "Utilisateur introuvable")
    await log_action(actor_id=current_user["id"], actor_role="admin", action="fraud.unblock_user",
                     target_type="user", target_id=user_id)
    return {"message": "Utilisateur débloqué"}
