"""
SB Drive Student — Phase 4: Student safety + Safe Ride Night.

- Safety settings (auto trip-share + prefer top-rated drivers) per student.
- Safe Ride Night: generates a public trip-share link, flags the ride
  (safe_ride_night → dispatch prioritises best-rated drivers), and returns the
  link + trusted contacts so the client shares the live tracking with the
  contact of trust (reuses the existing trip-share + emergency-contacts infra).
- Enhanced driver verification: trust card (rating, trips, verified docs, since).
- Recommended (best-rated, nearby) drivers for night-time peace of mind.

Endpoints under /api/student/safety.
"""
import math
import os
import secrets
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request, Query
from pydantic import BaseModel

from core.config import db
from core.deps import get_current_user

router = APIRouter(prefix="/student/safety", tags=["student-safety"])


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _haversine_km(lat1, lng1, lat2, lng2) -> float:
    R = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


# ==================== SETTINGS ====================
@router.get("/settings")
async def get_settings(request: Request):
    user = await get_current_user(request)
    profile = await db.student_profiles.find_one({"user_id": user["id"]}, {"_id": 0, "safety": 1})
    safety = (profile or {}).get("safety") or {}
    contacts_count = await db.emergency_contacts.count_documents({"user_id": user["id"]})
    return {
        "auto_share": bool(safety.get("auto_share", True)),
        "prefer_top_drivers": bool(safety.get("prefer_top_drivers", True)),
        "min_driver_rating": float(safety.get("min_driver_rating", 4.0) or 4.0),
        "contacts_count": contacts_count,
    }


class SettingsBody(BaseModel):
    auto_share: bool | None = None
    prefer_top_drivers: bool | None = None
    min_driver_rating: float | None = None


@router.put("/settings")
async def update_settings(body: SettingsBody, request: Request):
    user = await get_current_user(request)
    # ensure profile exists
    if not await db.student_profiles.find_one({"user_id": user["id"]}):
        await db.student_profiles.insert_one({"user_id": user["id"], "status": "none", "created_at": _now()})
    patch = {}
    if body.auto_share is not None:
        patch["safety.auto_share"] = bool(body.auto_share)
    if body.prefer_top_drivers is not None:
        patch["safety.prefer_top_drivers"] = bool(body.prefer_top_drivers)
    if body.min_driver_rating is not None:
        patch["safety.min_driver_rating"] = max(1.0, min(5.0, float(body.min_driver_rating)))
    if patch:
        patch["updated_at"] = _now()
        await db.student_profiles.update_one({"user_id": user["id"]}, {"$set": patch})
    return await get_settings(request)


# ==================== SAFE RIDE NIGHT ====================
class SafeRideStartBody(BaseModel):
    ride_id: str


@router.post("/safe-ride/start")
async def start_safe_ride(body: SafeRideStartBody, request: Request):
    """Flag the ride as Safe Ride Night, create a public trip-share link, and
    return the link + trusted contacts so the client shares it with the contact
    of trust (live tracking)."""
    user = await get_current_user(request)
    ride = await db.rides.find_one({"id": body.ride_id}, {"_id": 0})
    if not ride:
        raise HTTPException(status_code=404, detail="Course introuvable")
    if ride.get("user_id") != user["id"]:
        raise HTTPException(status_code=403, detail="Non autorisé")

    existing = await db.trip_shares.find_one({"ride_id": body.ride_id, "created_by": user["id"]}, {"_id": 0, "token": 1})
    token = existing["token"] if existing else secrets.token_urlsafe(9)
    if not existing:
        await db.trip_shares.insert_one({
            "token": token, "ride_id": body.ride_id, "created_by": user["id"],
            "created_by_role": "rider", "created_at": _now(),
        })
    await db.rides.update_one({"id": body.ride_id}, {"$set": {"safe_ride_night": True, "share_token": token}})
    await db.users.update_one({"id": user["id"]}, {"$set": {"auto_share_trip": True}})

    contacts = await db.emergency_contacts.find({"user_id": user["id"]}, {"_id": 0}).to_list(5)
    share_url = f"{os.environ.get('FRONTEND_URL', '').rstrip('/')}/t/{token}"
    await db.student_safe_rides.update_one(
        {"ride_id": body.ride_id},
        {"$set": {"ride_id": body.ride_id, "user_id": user["id"], "token": token,
                  "contacts": [{"name": c.get("name"), "phone": c.get("phone")} for c in contacts],
                  "created_at": _now(), "status": "active"}},
        upsert=True,
    )
    return {
        "ok": True, "token": token, "share_url": share_url,
        "contacts": contacts, "contacts_count": len(contacts),
        "needs_contact": len(contacts) == 0,
    }


@router.get("/safe-ride/active")
async def active_safe_rides(request: Request):
    user = await get_current_user(request)
    items = await db.student_safe_rides.find(
        {"user_id": user["id"], "status": "active"}, {"_id": 0}).sort("created_at", -1).to_list(20)
    return {"safe_rides": items}


# ==================== ENHANCED DRIVER VERIFICATION ====================
@router.get("/driver/{driver_id}/trust")
async def driver_trust(driver_id: str, request: Request):
    await get_current_user(request)
    drv = await db.drivers.find_one(
        {"$or": [{"id": driver_id}, {"user_id": driver_id}]},
        {"_id": 0, "id": 1, "user_id": 1, "rating": 1, "status": 1, "documents": 1, "created_at": 1, "total_trips": 1},
    )
    if not drv:
        raise HTTPException(status_code=404, detail="Chauffeur introuvable")
    docs = drv.get("documents") or []
    approved_docs = sum(1 for d in docs if d.get("status") == "approved")
    total_trips = drv.get("total_trips")
    if total_trips is None:
        total_trips = await db.rides.count_documents({"driver_id": drv["id"], "status": "completed"})
    ratings = await db.ratings.find({"driver_id": drv["id"]}, {"_id": 0, "rating": 1}).to_list(500)
    avg = round(sum(int(r.get("rating", 5)) for r in ratings) / len(ratings), 2) if ratings else round(float(drv.get("rating", 5.0) or 5.0), 2)
    return {
        "driver_id": drv["id"],
        "rating": avg,
        "ratings_count": len(ratings),
        "total_trips": total_trips,
        "verified": drv.get("status") == "approved",
        "documents_approved": approved_docs,
        "member_since": (drv.get("created_at") or "")[:10],
        "enhanced_verified": drv.get("status") == "approved" and approved_docs >= 2 and avg >= 4.0,
    }


@router.get("/recommended-drivers")
async def recommended_drivers(request: Request, lat: float = Query(...), lng: float = Query(...), radius_km: float = 8.0):
    """Best-rated online drivers near the pickup — for night-time peace of mind."""
    await get_current_user(request)
    cursor = db.drivers.find(
        {"status": "approved", "is_online": True},
        {"_id": 0, "id": 1, "user_id": 1, "rating": 1, "current_lat": 1, "current_lng": 1, "vehicle_type": 1},
    )
    out = []
    async for d in cursor:
        dlat, dlng = d.get("current_lat"), d.get("current_lng")
        if dlat is None or dlng is None:
            continue
        dist = _haversine_km(lat, lng, dlat, dlng)
        if dist > radius_km:
            continue
        out.append({
            "driver_id": d["id"], "rating": round(float(d.get("rating", 5.0) or 5.0), 2),
            "distance_km": round(dist, 2), "vehicle_type": d.get("vehicle_type"),
        })
    out.sort(key=lambda x: (-x["rating"], x["distance_km"]))
    return {"drivers": out[:10]}
