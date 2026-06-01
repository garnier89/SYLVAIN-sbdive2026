"""
Audit logs (V3Cube trips_status_logs + user_status_logs + admin actions trace).

Iteration 75 — Trace exhaustive de toute action sensible sur la plateforme.
Conformité GDPR + audit interne.
"""
from fastapi import APIRouter, Depends, Request, HTTPException, Query
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, timezone
import uuid
import functools

from core.config import db
from core.deps import get_current_user
from core.permissions import require_permission

router = APIRouter(prefix="/audit", tags=["audit"])


async def log_action(
    *,
    actor_id: str,
    actor_role: str,
    action: str,
    target_type: Optional[str] = None,
    target_id: Optional[str] = None,
    payload_before: Optional[dict] = None,
    payload_after: Optional[dict] = None,
    reason: Optional[str] = None,
    ip_address: Optional[str] = None,
    user_agent: Optional[str] = None,
):
    """Direct call — log an action. Use this in route handlers for fine-grained audit."""
    doc = {
        "id": f"audit_{uuid.uuid4().hex[:14]}",
        "actor_id": actor_id,
        "actor_role": actor_role,
        "action": action,
        "target_type": target_type,
        "target_id": target_id,
        "payload_before": payload_before,
        "payload_after": payload_after,
        "reason": reason,
        "ip_address": ip_address,
        "user_agent": user_agent,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    try:
        await db.audit_logs.insert_one(doc)
    except Exception:
        # Audit log failure must never break the main operation
        pass


def audit(action: str, target_type: Optional[str] = None):
    """Decorator factory for FastAPI endpoint handlers.

    Usage:
        @router.post("/admin/drivers/{driver_id}/approve")
        @audit("driver.approve", target_type="driver")
        async def approve_driver(driver_id: str, request: Request, current_user=Depends(get_current_user)):
            ...
    """
    def decorator(func):
        @functools.wraps(func)
        async def wrapper(*args, **kwargs):
            request: Optional[Request] = kwargs.get("request")
            current_user: Optional[dict] = kwargs.get("current_user")
            target_id = None
            # Try common id param names
            for key in ("driver_id", "user_id", "merchant_id", "ride_id", "order_id", "id", "item_id"):
                if key in kwargs:
                    target_id = kwargs.get(key)
                    break
            result = await func(*args, **kwargs)
            if current_user:
                await log_action(
                    actor_id=current_user.get("id"),
                    actor_role=current_user.get("role", "unknown"),
                    action=action,
                    target_type=target_type,
                    target_id=target_id,
                    ip_address=(request.client.host if request and request.client else None) if request else None,
                    user_agent=(request.headers.get("user-agent") if request else None),
                )
            return result
        return wrapper
    return decorator


@router.get("/logs")
async def list_audit_logs(
    actor_id: Optional[str] = None,
    target_type: Optional[str] = None,
    target_id: Optional[str] = None,
    action: Optional[str] = None,
    from_date: Optional[str] = Query(None, alias="from"),
    to_date: Optional[str] = Query(None, alias="to"),
    limit: int = 100,
    offset: int = 0,
    current_user: dict = Depends(require_permission("super.audit.view")),
):
    query = {}
    if actor_id:
        query["actor_id"] = actor_id
    if target_type:
        query["target_type"] = target_type
    if target_id:
        query["target_id"] = target_id
    if action:
        query["action"] = {"$regex": f"^{action}", "$options": "i"}
    if from_date or to_date:
        query["created_at"] = {}
        if from_date:
            query["created_at"]["$gte"] = from_date
        if to_date:
            query["created_at"]["$lte"] = to_date
    total = await db.audit_logs.count_documents(query)
    items = await db.audit_logs.find(query, {"_id": 0}).sort("created_at", -1).skip(offset).limit(min(limit, 500)).to_list(500)
    return {"items": items, "total": total, "limit": limit, "offset": offset}


@router.get("/actions")
async def list_action_types(current_user: dict = Depends(require_permission("super.audit.view"))):
    """Distinct action keys present in the logs (for filter UI)."""
    pipeline = [{"$group": {"_id": "$action", "count": {"$sum": 1}}}, {"$sort": {"count": -1}}, {"$limit": 100}]
    cur = db.audit_logs.aggregate(pipeline)
    out = [{"action": d["_id"], "count": d["count"]} async for d in cur]
    return {"items": out}
