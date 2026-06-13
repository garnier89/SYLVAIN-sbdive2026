"""Admin — Rapport d'activité chauffeur complet.

Aggregates per-driver activity over a period from the data we actually have:
  * rides         → received(≈accepted+refused) / accepted / completed /
                    cancelled-by-driver / scheduled-accepted / gross revenue.
  * dispatch_sessions.declined → offers refused.
  * moderation_events (kind='accept_release') → scheduled bookings released.
  * driver_online_sessions → time online.
Admin/dispatcher only.
"""
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, Request

from core.config import db
from core.deps import require_role
from core.online_sessions import online_minutes_by_driver

router = APIRouter(prefix="/admin/driver-activity", tags=["admin-driver-activity"])


def _default_range(date_from, date_to):
    end = (date_to + "T23:59:59") if date_to else datetime.now(timezone.utc).isoformat()
    start = (date_from + "T00:00:00") if date_from \
        else (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
    return start, end


@router.get("")
async def driver_activity(request: Request, date_from: Optional[str] = None,
                          date_to: Optional[str] = None, q: Optional[str] = None):
    await require_role(request, ["admin", "dispatcher"])
    start, end = _default_range(date_from, date_to)
    rng = {"$gte": start, "$lte": end}

    # 1) Rides aggregation by driver (drivers.id)
    rides_pipe = [
        {"$match": {"driver_id": {"$ne": None}, "created_at": rng}},
        {"$group": {
            "_id": "$driver_id",
            "accepted": {"$sum": {"$cond": [{"$ifNull": ["$accepted_at", False]}, 1, 0]}},
            "completed": {"$sum": {"$cond": [{"$eq": ["$status", "completed"]}, 1, 0]}},
            "cancelled_driver": {"$sum": {"$cond": [{"$eq": ["$cancelled_by", "driver"]}, 1, 0]}},
            "scheduled_accepted": {"$sum": {"$cond": [
                {"$and": [{"$ifNull": ["$scheduled_at", False]}, {"$ifNull": ["$accepted_at", False]}]}, 1, 0]}},
            "revenue": {"$sum": {"$cond": [{"$eq": ["$status", "completed"]},
                {"$ifNull": ["$final_fare", {"$ifNull": ["$estimated_fare", 0]}]}, 0]}},
        }},
    ]
    rides_by = {r["_id"]: r async for r in db.rides.aggregate(rides_pipe)}

    # 2) Offers refused (declined) from dispatch_sessions updated in range
    refused = {}
    async for s in db.dispatch_sessions.find(
            {"updated_at": rng}, {"_id": 0, "declined": 1}):
        for did in (s.get("declined") or []):
            refused[did] = refused.get(did, 0) + 1

    # 3) Scheduled bookings released (penalties)
    released = {}
    async for e in db.moderation_events.find(
            {"kind": "accept_release", "created_at": rng}, {"_id": 0, "driver_id": 1}):
        did = e.get("driver_id")
        if did:
            released[did] = released.get(did, 0) + 1

    # 4) Online minutes by driver user_id
    online_min = await online_minutes_by_driver(start, end)

    # 5) Build rows for all drivers that have any signal, enrich with name
    driver_ids = set(rides_by) | set(refused) | set(released)
    rows = []
    # Map drivers.id -> user_id + fetch ones referenced
    drv_docs = await db.drivers.find(
        {"id": {"$in": list(driver_ids)}} if driver_ids else {"_id": None},
        {"_id": 0, "id": 1, "user_id": 1}).to_list(1000)
    # Also include drivers that were online but have no rides
    online_uids = set(online_min)
    extra = await db.drivers.find(
        {"user_id": {"$in": list(online_uids)}}, {"_id": 0, "id": 1, "user_id": 1}).to_list(1000)
    by_id = {d["id"]: d for d in drv_docs + extra}
    # Ensure online-only drivers are represented
    for d in extra:
        driver_ids.add(d["id"])

    user_ids = [by_id[i]["user_id"] for i in driver_ids if i in by_id]
    users = {u["id"]: u async for u in db.users.find(
        {"id": {"$in": user_ids}}, {"_id": 0, "id": 1, "name": 1, "phone": 1})}

    for did in driver_ids:
        d = by_id.get(did)
        uid = d.get("user_id") if d else None
        u = users.get(uid, {}) if uid else {}
        r = rides_by.get(did, {})
        accepted = r.get("accepted", 0)
        ref = refused.get(did, 0)
        rows.append({
            "driver_id": did,
            "name": u.get("name") or "—",
            "phone": u.get("phone") or "",
            "online_minutes": online_min.get(uid, 0.0) if uid else 0.0,
            "received": accepted + ref,
            "accepted": accepted,
            "refused": ref,
            "completed": r.get("completed", 0),
            "cancelled": r.get("cancelled_driver", 0),
            "scheduled_accepted": r.get("scheduled_accepted", 0),
            "released": released.get(did, 0),
            "revenue": round(r.get("revenue", 0) or 0, 2),
            "acceptance_rate": round(100.0 * accepted / (accepted + ref), 0) if (accepted + ref) else None,
        })
    rows.sort(key=lambda x: (x["completed"], x["accepted"]), reverse=True)

    if q:
        ql = q.lower()
        rows = [x for x in rows if ql in x["name"].lower() or ql in x["phone"]]

    totals = {
        "drivers": len(rows),
        "online_hours": round(sum(x["online_minutes"] for x in rows) / 60, 1),
        "received": sum(x["received"] for x in rows),
        "accepted": sum(x["accepted"] for x in rows),
        "refused": sum(x["refused"] for x in rows),
        "completed": sum(x["completed"] for x in rows),
        "cancelled": sum(x["cancelled"] for x in rows),
        "released": sum(x["released"] for x in rows),
        "revenue": round(sum(x["revenue"] for x in rows), 2),
    }
    return {"range": {"from": start, "to": end}, "totals": totals, "drivers": rows}
