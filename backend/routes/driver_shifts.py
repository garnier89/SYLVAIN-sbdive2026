"""
Driver shifts (V3Cube driver_manage_timing).

Iteration 75 — Pointage des chauffeurs (heures de service, horaires hebdomadaires).
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone
import uuid

from core.config import db
from core.deps import get_current_user
from core.permissions import require_permission

router = APIRouter(prefix="/driver-shifts", tags=["driver-shifts"])


class ShiftStartBody(BaseModel):
    vehicle_used: Optional[str] = None
    notes: Optional[str] = None


class ShiftEndBody(BaseModel):
    notes: Optional[str] = None


@router.post("/start")
async def start_shift(body: ShiftStartBody, current_user: dict = Depends(get_current_user)):
    if current_user.get("role") != "driver":
        raise HTTPException(403, "Driver only")
    # Close any open shift first
    await db.driver_shifts.update_many(
        {"driver_id": current_user["id"], "status": "active"},
        {"$set": {"status": "ended", "end_at": datetime.now(timezone.utc).isoformat(), "ended_reason": "new_shift_started"}},
    )
    shift = {
        "id": f"shift_{uuid.uuid4().hex[:12]}",
        "driver_id": current_user["id"],
        "start_at": datetime.now(timezone.utc).isoformat(),
        "end_at": None,
        "duration_min": 0,
        "total_rides": 0,
        "total_earnings": 0.0,
        "vehicle_used": body.vehicle_used,
        "notes": body.notes,
        "status": "active",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.driver_shifts.insert_one(shift)
    # Set driver as online
    await db.drivers.update_one({"user_id": current_user["id"]}, {"$set": {"is_online": True, "current_shift_id": shift["id"]}})
    shift.pop("_id", None)
    return shift


@router.post("/end")
async def end_shift(body: ShiftEndBody, current_user: dict = Depends(get_current_user)):
    if current_user.get("role") != "driver":
        raise HTTPException(403, "Driver only")
    shift = await db.driver_shifts.find_one({"driver_id": current_user["id"], "status": "active"})
    if not shift:
        raise HTTPException(404, "No active shift")
    end_at = datetime.now(timezone.utc)
    start_at = datetime.fromisoformat(shift["start_at"].replace("Z", "+00:00")) if isinstance(shift["start_at"], str) else shift["start_at"]
    duration = int((end_at - start_at).total_seconds() / 60)
    # Count rides completed during the shift
    rides = await db.rides.count_documents({
        "driver_id": current_user["id"],
        "status": "completed",
        "created_at": {"$gte": shift["start_at"]},
    })
    # Earnings during the shift
    pipeline = [
        {"$match": {"driver_id": current_user["id"], "status": "completed", "created_at": {"$gte": shift["start_at"]}}},
        {"$group": {"_id": None, "total": {"$sum": "$final_fare"}}},
    ]
    agg = await db.rides.aggregate(pipeline).to_list(1)
    earnings = float(agg[0]["total"]) if agg else 0.0
    await db.driver_shifts.update_one({"id": shift["id"]}, {"$set": {
        "end_at": end_at.isoformat(),
        "duration_min": duration,
        "total_rides": rides,
        "total_earnings": earnings,
        "status": "ended",
        "notes": (shift.get("notes") or "") + (("\n" + body.notes) if body.notes else ""),
    }})
    await db.drivers.update_one({"user_id": current_user["id"]}, {"$set": {"is_online": False}, "$unset": {"current_shift_id": ""}})
    return {"ended": True, "duration_min": duration, "total_rides": rides, "total_earnings": earnings}


@router.get("/my")
async def my_shifts(
    limit: int = 30,
    current_user: dict = Depends(get_current_user),
):
    if current_user.get("role") != "driver":
        raise HTTPException(403, "Driver only")
    items = await db.driver_shifts.find(
        {"driver_id": current_user["id"]},
        {"_id": 0},
    ).sort("start_at", -1).limit(limit).to_list(limit)
    return {"items": items, "total": len(items)}


@router.get("/my/active")
async def my_active_shift(current_user: dict = Depends(get_current_user)):
    if current_user.get("role") != "driver":
        raise HTTPException(403, "Driver only")
    shift = await db.driver_shifts.find_one({"driver_id": current_user["id"], "status": "active"}, {"_id": 0})
    return {"shift": shift}


@router.get("/admin/by-driver/{driver_id}")
async def admin_driver_shifts(
    driver_id: str,
    from_date: Optional[str] = Query(None, alias="from"),
    to_date: Optional[str] = Query(None, alias="to"),
    current_user: dict = Depends(require_permission("drivers.view")),
):
    query = {"driver_id": driver_id}
    if from_date or to_date:
        query["start_at"] = {}
        if from_date:
            query["start_at"]["$gte"] = from_date
        if to_date:
            query["start_at"]["$lte"] = to_date
    items = await db.driver_shifts.find(query, {"_id": 0}).sort("start_at", -1).to_list(500)
    return {"items": items, "total": len(items)}


@router.get("/admin/summary")
async def admin_shifts_summary(
    current_user: dict = Depends(require_permission("drivers.view")),
):
    """Stats globales : nombre d'actifs maintenant + cumul mois courant."""
    now = datetime.now(timezone.utc)
    active = await db.driver_shifts.count_documents({"status": "active"})
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0).isoformat()
    pipeline = [
        {"$match": {"start_at": {"$gte": month_start}}},
        {"$group": {"_id": None, "shifts": {"$sum": 1}, "minutes": {"$sum": "$duration_min"}, "rides": {"$sum": "$total_rides"}, "earnings": {"$sum": "$total_earnings"}}},
    ]
    agg = await db.driver_shifts.aggregate(pipeline).to_list(1)
    stats = agg[0] if agg else {"shifts": 0, "minutes": 0, "rides": 0, "earnings": 0}
    return {
        "active_shifts": active,
        "month_to_date": {
            "total_shifts": stats.get("shifts", 0),
            "total_hours": round(stats.get("minutes", 0) / 60, 1),
            "total_rides": stats.get("rides", 0),
            "total_earnings": round(stats.get("earnings", 0), 2),
        },
    }
