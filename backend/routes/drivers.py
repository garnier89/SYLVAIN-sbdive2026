from fastapi import APIRouter, Request, HTTPException, File, UploadFile, Query
import uuid
from datetime import datetime, timezone, timedelta

from core.config import db, APP_NAME
from core.deps import get_current_user, put_object
from models.schemas import DriverCreate, DriverProfile
from core.websocket import manager

router = APIRouter(prefix="/drivers", tags=["drivers"])


@router.post("/push-token")
async def register_push_token(request: Request):
    """Store the driver's Expo push token for remote mission alerts."""
    user = await get_current_user(request)
    body = await request.json()
    token = body.get("token")
    if not token:
        raise HTTPException(status_code=400, detail="Token requis")
    await db.drivers.update_one(
        {"user_id": user["id"]},
        {"$set": {"push_token": token, "push_token_updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    return {"ok": True}


@router.post("/register", response_model=DriverProfile)
async def register_driver(data: DriverCreate, request: Request):
    user = await get_current_user(request)
    existing = await db.drivers.find_one({"user_id": user["id"]})
    if existing:
        raise HTTPException(status_code=400, detail="Already registered as driver")

    # Service types: taxi (courses), delivery (livreur — marchands), courier (coursier — colis). Default all.
    allowed = {"taxi", "delivery", "courier"}
    service_types = [s for s in (data.service_types or []) if s in allowed]
    if not service_types:
        service_types = ["taxi", "delivery", "courier"]

    driver = {
        "id": f"driver_{uuid.uuid4().hex[:12]}",
        "user_id": user["id"],
        "vehicle_type": data.vehicle_type,
        "vehicle_number": data.vehicle_number,
        "vehicle_model": data.vehicle_model,
        "license_number": data.license_number,
        "service_types": service_types,
        "status": "pending",
        "is_online": False,
        "current_lat": None,
        "current_lng": None,
        "rating": 5.0,
        "total_trips": 0,
        "earnings": 0.0,
        "documents": [],
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.drivers.insert_one(driver)
    await db.users.update_one({"id": user["id"]}, {"$set": {"role": "driver"}})
    driver.pop("_id", None)
    return DriverProfile(**driver)


@router.get("/profile", response_model=DriverProfile)
async def get_driver_profile(request: Request):
    user = await get_current_user(request)
    driver = await db.drivers.find_one({"user_id": user["id"]}, {"_id": 0})
    if not driver:
        raise HTTPException(status_code=404, detail="Driver profile not found")
    return DriverProfile(**driver)


@router.put("/service-types")
async def update_service_types(request: Request):
    """Driver chooses which services they handle: taxi, delivery, or both."""
    user = await get_current_user(request)
    body = await request.json()
    allowed = {"taxi", "delivery", "courier"}
    service_types = [s for s in (body.get("service_types") or []) if s in allowed]
    if not service_types:
        raise HTTPException(status_code=400, detail="Sélectionnez au moins un service (taxi, livreur ou coursier)")
    result = await db.drivers.update_one(
        {"user_id": user["id"]},
        {"$set": {"service_types": service_types}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Driver profile not found")
    return {"message": "Services mis à jour", "service_types": service_types}


@router.post("/toggle-online")
async def toggle_driver_online(request: Request):
    user = await get_current_user(request)
    driver = await db.drivers.find_one({"user_id": user["id"]})
    if not driver:
        raise HTTPException(status_code=404, detail="Driver profile not found")
    if driver["status"] != "approved":
        raise HTTPException(status_code=400, detail="Driver not approved")
    new_status = not driver["is_online"]
    await db.drivers.update_one({"user_id": user["id"]}, {"$set": {"is_online": new_status}})
    return {"is_online": new_status}


@router.post("/location")
async def update_driver_location(request: Request):
    user = await get_current_user(request)
    body = await request.json()
    lat, lng = body.get("lat"), body.get("lng")
    await db.drivers.update_one({"user_id": user["id"]}, {"$set": {"current_lat": lat, "current_lng": lng}})
    manager.update_driver_location(user["id"], lat, lng)
    # Push live position to customers of this driver's active food deliveries
    driver = await db.drivers.find_one({"user_id": user["id"]}, {"_id": 0, "id": 1})
    if driver:
        async for o in db.orders.find(
            {"driver_id": driver["id"], "status": {"$in": ["ready", "picked_up"]}},
            {"_id": 0, "user_id": 1},
        ):
            await manager.send_personal_message({"type": "driver_location", "lat": lat, "lng": lng}, o["user_id"])
    return {"message": "Location updated"}


@router.post("/documents")
async def upload_driver_document(request: Request, file: UploadFile = File(...), doc_type: str = Query(...)):
    user = await get_current_user(request)
    driver = await db.drivers.find_one({"user_id": user["id"]})
    if not driver:
        raise HTTPException(status_code=404, detail="Driver profile not found")

    ext = file.filename.split(".")[-1] if "." in file.filename else "bin"
    path = f"{APP_NAME}/drivers/{user['id']}/{doc_type}_{uuid.uuid4().hex[:8]}.{ext}"
    data = await file.read()
    result = put_object(path, data, file.content_type or "application/octet-stream")

    doc_record = {
        "type": doc_type, "path": result["path"], "filename": file.filename,
        "uploaded_at": datetime.now(timezone.utc).isoformat(), "status": "pending"
    }
    await db.drivers.update_one({"user_id": user["id"]}, {"$push": {"documents": doc_record}})
    return {"message": "Document uploaded", "path": result["path"]}



@router.get("/earnings")
async def get_driver_earnings(request: Request):
    user = await get_current_user(request)
    driver = await db.drivers.find_one({"user_id": user["id"]}, {"_id": 0})
    if not driver:
        raise HTTPException(status_code=404, detail="Driver profile not found")

    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    week_start = (now - timedelta(days=now.weekday())).replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0).isoformat()

    # Fetch completed rides for this driver
    all_rides = await db.rides.find(
        {"driver_id": user["id"], "status": "completed"},
        {"_id": 0, "estimated_fare": 1, "created_at": 1, "pickup_address": 1, "dropoff_address": 1, "distance_km": 1}
    ).sort("created_at", -1).to_list(500)

    today_earnings = sum(r.get("estimated_fare", 0) for r in all_rides if r.get("created_at", "") >= today_start)
    week_earnings = sum(r.get("estimated_fare", 0) for r in all_rides if r.get("created_at", "") >= week_start)
    month_earnings = sum(r.get("estimated_fare", 0) for r in all_rides if r.get("created_at", "") >= month_start)
    total_earnings = sum(r.get("estimated_fare", 0) for r in all_rides)

    today_trips = len([r for r in all_rides if r.get("created_at", "") >= today_start])
    week_trips = len([r for r in all_rides if r.get("created_at", "") >= week_start])

    recent_rides = all_rides[:20]

    return {
        "today": round(today_earnings, 2),
        "week": round(week_earnings, 2),
        "month": round(month_earnings, 2),
        "total": round(total_earnings, 2),
        "today_trips": today_trips,
        "week_trips": week_trips,
        "total_trips": driver.get("total_trips", 0),
        "rating": driver.get("rating", 5.0),
        "recent_rides": recent_rides,
    }


@router.get("/ride-history")
async def get_driver_ride_history(request: Request):
    user = await get_current_user(request)
    driver = await db.drivers.find_one({"user_id": user["id"]})
    if not driver:
        raise HTTPException(status_code=404, detail="Driver profile not found")

    rides = await db.rides.find(
        {"driver_id": user["id"]},
        {"_id": 0}
    ).sort("created_at", -1).limit(20).to_list(20)

    return {"rides": rides}



# ===== DRIVER ACTIVITY / POINTS =====

async def _get_rewards_points_config():
    """Read points config from service_configs (or defaults)."""
    from routes.admin import get_rewards_config
    cfg = await get_rewards_config()
    return cfg["points"]


def _resolve_palette(points: int, palettes: list):
    for p in palettes:
        if p["min_points"] <= points <= p["max_points"]:
            return p
    # Overflow: points exceed all ranges → return the highest palette
    if palettes:
        highest = max(palettes, key=lambda p: p["max_points"])
        if points > highest["max_points"]:
            return highest
    return palettes[0] if palettes else None


async def _ensure_driver_stats(driver: dict, points_cfg: dict):
    """Ensure driver has initial points/activity fields."""
    updates = {}
    if "points" not in driver:
        updates["points"] = points_cfg["initial_points"]
    if "offered_count" not in driver:
        updates["offered_count"] = 0
    if "accepted_count" not in driver:
        updates["accepted_count"] = 0
    if "refused_count" not in driver:
        updates["refused_count"] = 0
    if "cancelled_count" not in driver:
        updates["cancelled_count"] = 0
    if "acceptance_rate" not in driver:
        updates["acceptance_rate"] = 100
    if "cancellation_rate" not in driver:
        updates["cancellation_rate"] = 0
    if updates:
        await db.drivers.update_one({"id": driver["id"]}, {"$set": updates})
        driver.update(updates)
    return driver


async def _recompute_rates(driver_id: str):
    d = await db.drivers.find_one({"id": driver_id}, {"_id": 0})
    if not d:
        return
    offered = d.get("offered_count", 0) or (d.get("accepted_count", 0) + d.get("refused_count", 0))
    accepted = d.get("accepted_count", 0)
    cancelled = d.get("cancelled_count", 0)
    acceptance = round((accepted / offered) * 100) if offered > 0 else 100
    cancellation = round((cancelled / max(accepted, 1)) * 100) if accepted > 0 else 0
    await db.drivers.update_one(
        {"id": driver_id},
        {"$set": {"acceptance_rate": acceptance, "cancellation_rate": cancellation}},
    )


@router.get("/my-activity")
async def get_my_activity(request: Request):
    """Return the driver's activity dashboard: points, palette, acceptance rate, score."""
    user = await get_current_user(request)
    driver = await db.drivers.find_one({"user_id": user["id"]}, {"_id": 0})
    if not driver:
        raise HTTPException(status_code=404, detail="Driver profile not found")

    points_cfg = await _get_rewards_points_config()
    driver = await _ensure_driver_stats(driver, points_cfg)
    palette = _resolve_palette(driver.get("points", 0), points_cfg["palettes"])

    # Activity score: weighted composite (points 50% + acceptance 30% + (100-cancellation) 20%)
    points_pct = min(driver.get("points", 0), 100)
    acceptance = driver.get("acceptance_rate", 100)
    cancellation = driver.get("cancellation_rate", 0)
    activity_score = round(points_pct * 0.5 + acceptance * 0.3 + (100 - cancellation) * 0.2)

    # Count today's completed rides
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    today_completed = await db.rides.count_documents({
        "driver_id": driver["id"],
        "status": "completed",
        "completed_at": {"$gte": today_start},
    })

    return {
        "points": driver.get("points", 0),
        "initial_points": points_cfg["initial_points"],
        "palette": {
            "name": palette["name"] if palette else "",
            "color": palette["color"] if palette else "#9CA3AF",
            "priority_access": palette["priority_access"] if palette else False,
            "max_ride_amount": palette["max_ride_amount"] if palette else 0,
            "min_points": palette["min_points"] if palette else 0,
            "max_points": palette["max_points"] if palette else 100,
        },
        "acceptance_rate": acceptance,
        "cancellation_rate": cancellation,
        "activity_score": activity_score,
        "offered_count": driver.get("offered_count", 0),
        "accepted_count": driver.get("accepted_count", 0),
        "refused_count": driver.get("refused_count", 0),
        "cancelled_count": driver.get("cancelled_count", 0),
        "total_trips": driver.get("total_trips", 0),
        "today_completed": today_completed,
        "rating": driver.get("rating", 5.0),
        "manual_priority": driver.get("manual_priority", False),
        "has_priority": driver.get("manual_priority", False) or (palette["priority_access"] if palette else False),
        "rules": {
            "points_per_ride_accepted": points_cfg.get("points_per_ride_accepted", 2),
            "points_per_ride_completed": points_cfg.get("points_per_ride_completed", 3),
            "points_lost_per_refuse": points_cfg.get("points_lost_per_refuse", 5),
            "points_lost_per_cancel": points_cfg.get("points_lost_per_cancel", 10),
        },
    }


@router.get("/my-score-history")
async def get_my_score_history(request: Request):
    """Return the driver's recent score_log entries + next-palette distance."""
    user = await get_current_user(request)
    driver = await db.drivers.find_one({"user_id": user["id"]}, {"_id": 0, "points": 1, "score_log": 1})
    if not driver:
        raise HTTPException(status_code=404, detail="Driver profile not found")

    points_cfg = await _get_rewards_points_config()
    palettes = sorted(points_cfg.get("palettes", []), key=lambda p: p["min_points"])
    current_points = driver.get("points") or 0
    current_palette = _resolve_palette(current_points, palettes)
    next_palette = None
    points_to_next = None
    for p in palettes:
        if p["min_points"] > current_points:
            next_palette = p
            points_to_next = p["min_points"] - current_points
            break

    log = list(reversed(driver.get("score_log") or []))[:50]  # most recent first
    total_gained = sum(e["delta"] for e in log if e.get("delta", 0) > 0)
    total_lost = sum(-e["delta"] for e in log if e.get("delta", 0) < 0)

    return {
        "current_points": current_points,
        "current_palette": {
            "name": current_palette["name"] if current_palette else "",
            "color": current_palette["color"] if current_palette else "#9CA3AF",
            "min_points": current_palette["min_points"] if current_palette else 0,
            "max_points": current_palette["max_points"] if current_palette else 100,
        } if current_palette else None,
        "next_palette": {
            "name": next_palette["name"],
            "color": next_palette["color"],
            "min_points": next_palette["min_points"],
            "points_to_reach": points_to_next,
        } if next_palette else None,
        "history": log,
        "totals": {"gained": total_gained, "lost": total_lost, "entries": len(driver.get("score_log") or [])},
    }


@router.get("/my-earnings-breakdown")
async def get_my_earnings_breakdown(request: Request):
    """Return the driver's earnings split into today, this week (Mon-Sun) and this month."""
    user = await get_current_user(request)
    driver = await db.drivers.find_one({"user_id": user["id"]}, {"_id": 0, "id": 1})
    if not driver:
        raise HTTPException(status_code=404, detail="Driver profile not found")

    now = datetime.now(timezone.utc)
    start_of_day = now.replace(hour=0, minute=0, second=0, microsecond=0)
    start_of_week = (start_of_day - timedelta(days=start_of_day.weekday()))
    start_of_month = start_of_day.replace(day=1)

    async def sum_fares(since_iso: str) -> dict:
        pipeline = [
            {"$match": {
                "driver_id": driver["id"],
                "status": "completed",
                "completed_at": {"$gte": since_iso},
            }},
            {"$group": {"_id": None, "total": {"$sum": "$final_fare"}, "count": {"$sum": 1}}},
        ]
        rows = await db.rides.aggregate(pipeline).to_list(1)
        if rows:
            return {"earnings": round(rows[0]["total"] or 0, 2), "trips": rows[0]["count"]}
        return {"earnings": 0.0, "trips": 0}

    today = await sum_fares(start_of_day.isoformat())
    week = await sum_fares(start_of_week.isoformat())
    month = await sum_fares(start_of_month.isoformat())

    return {
        "today": today,
        "week": week,
        "month": month,
        "currency": "EUR",
        "as_of": now.isoformat(),
    }


@router.post("/refuse-ride/{ride_id}")
async def refuse_ride(ride_id: str, request: Request):
    """Driver refuses an offered ride → lose points + increment offered/refused counters."""
    user = await get_current_user(request)
    driver = await db.drivers.find_one({"user_id": user["id"]}, {"_id": 0})
    if not driver:
        raise HTTPException(status_code=404, detail="Driver profile not found")

    ride = await db.rides.find_one({"id": ride_id}, {"_id": 0})
    if not ride:
        raise HTTPException(status_code=404, detail="Ride not found")
    if ride.get("status") != "pending":
        raise HTTPException(status_code=400, detail="Ride is no longer pending")

    points_cfg = await _get_rewards_points_config()
    loss = int(points_cfg.get("points_lost_per_refuse", 5))
    current_points = driver.get("points", points_cfg["initial_points"])
    new_points = max(0, current_points - loss)

    await db.drivers.update_one(
        {"id": driver["id"]},
        {
            "$set": {"points": new_points},
            "$inc": {"offered_count": 1, "refused_count": 1},
            "$push": {"refused_ride_ids": ride_id},
        },
    )
    await _recompute_rates(driver["id"])

    return {
        "message": "Ride refused",
        "points": new_points,
        "points_lost": loss,
    }



# ===== TOP CHAUFFEURS PUBLIC RANKING =====

@router.get("/top")
async def get_top_drivers():
    """Public endpoint: returns top drivers based on composite score (points, trips, rating) or admin manual list."""
    cfg_doc = await db.service_configs.find_one({"service_key": "top_drivers"}, {"_id": 0}) or {}
    settings = cfg_doc.get("settings", {})
    mode = settings.get("mode", "composite")
    max_shown = int(settings.get("max_shown", 10))
    manual_ids = settings.get("manual_driver_ids", [])

    # Pull approved drivers
    drivers = await db.drivers.find({"status": "approved"}, {"_id": 0}).to_list(500)

    # Enrich with user name
    enriched = []
    for d in drivers:
        u = await db.users.find_one({"id": d["user_id"]}, {"_id": 0, "name": 1, "avatar_url": 1}) or {}
        pts = d.get("points", 0)
        trips = d.get("total_trips", 0)
        rating = d.get("rating", 5.0)
        # composite score: 40% points (0-100), 40% trips capped at 500, 20% rating (0-5)
        composite = round(pts * 0.4 + min(trips, 500) / 5.0 * 0.4 + rating / 5.0 * 100 * 0.2, 1)
        enriched.append({
            "driver_id": d["id"],
            "name": u.get("name", "Chauffeur"),
            "avatar_url": u.get("avatar_url"),
            "vehicle_type": d.get("vehicle_type"),
            "vehicle_model": d.get("vehicle_model"),
            "points": pts,
            "total_trips": trips,
            "rating": round(rating, 1),
            "composite_score": composite,
            "manual_priority": d.get("manual_priority", False),
        })

    if mode == "manual" and manual_ids:
        ranked = [e for e in enriched if e["driver_id"] in manual_ids]
        ranked.sort(key=lambda x: manual_ids.index(x["driver_id"]))
    elif mode == "points":
        ranked = sorted(enriched, key=lambda x: -x["points"])
    else:  # composite
        ranked = sorted(enriched, key=lambda x: -x["composite_score"])

    return {"mode": mode, "drivers": ranked[:max_shown]}


# ===== ACTIVE REWARDS for the current driver =====

def _vehicle_matches(regard_type: str, driver_vehicle_type: str) -> bool:
    if not regard_type or not driver_vehicle_type:
        return True
    rt = regard_type.lower()
    vt = driver_vehicle_type.lower()
    mapping = {
        "voiture": ("car", "taxi", "sb", "sedan", "suv", "premium"),
        "moto": ("moto", "motorcycle", "bike", "scooter"),
        "velo": ("velo", "bike", "bicycle"),
    }
    for label, aliases in mapping.items():
        if label in rt:
            return vt in aliases or any(a in vt for a in aliases)
    return rt in vt or vt in rt


def _in_date_window(start_date: str, end_date: str, now_iso: str) -> bool:
    today = now_iso[:10]
    if start_date and today < start_date:
        return False
    if end_date and today > end_date:
        return False
    return True


def _in_time_window(start_time: str, end_time: str, now_hm: str) -> bool:
    s = start_time or "00:00"
    e = end_time or "23:59"
    if s <= e:
        return s <= now_hm <= e
    # window over midnight
    return now_hm >= s or now_hm <= e


@router.get("/my-active-rewards")
async def get_my_active_rewards(request: Request):
    """Returns only the rewards currently active for the caller driver."""
    from routes.admin import get_rewards_config
    user = await get_current_user(request)
    driver = await db.drivers.find_one({"user_id": user["id"]}, {"_id": 0})
    if not driver:
        raise HTTPException(status_code=404, detail="Driver profile not found")

    cfg = await get_rewards_config()
    now = datetime.now(timezone.utc)
    now_iso = now.isoformat()
    now_hm = now.strftime("%H:%M")

    active_vehicle_rewards = []
    for r in (cfg.get("regard_vehicles") or []):
        if not r.get("active"):
            continue
        if not _vehicle_matches(r.get("type") or "", driver.get("vehicle_type") or ""):
            continue
        if not _in_date_window(r.get("start_date", ""), r.get("end_date", ""), now_iso):
            continue
        if not _in_time_window(r.get("start_time", ""), r.get("end_time", ""), now_hm):
            continue
        active_vehicle_rewards.append(r)

    active_guarantees = []
    acceptance = driver.get("acceptance_rate", 100)
    cancellation = driver.get("cancellation_rate", 0)
    for g in (cfg.get("guarantees") or []):
        if not g.get("active"):
            continue
        if not _in_date_window(g.get("start_date", ""), g.get("end_date", ""), now_iso):
            continue
        if not _in_time_window(g.get("start_hour", ""), g.get("end_hour", ""), now_hm):
            continue
        eligible = acceptance >= (g.get("acceptance_rate") or 0) and cancellation <= (g.get("max_cancellation") or 100)
        active_guarantees.append({**g, "eligible": eligible})

    return {
        "vehicle_rewards": active_vehicle_rewards,
        "guarantees": active_guarantees,
        "any_active": bool(active_vehicle_rewards) or bool(active_guarantees),
        "checked_at": now_iso,
        "driver_vehicle_type": driver.get("vehicle_type"),
        "driver_acceptance_rate": acceptance,
        "driver_cancellation_rate": cancellation,
    }



# ═══════════ ALIASES for UI-expected driver endpoints ═══════════

@router.get("/my-stats")
async def my_stats(request: Request):
    """Alias combining profile + activity."""
    user = await get_current_user(request)
    d = await db.drivers.find_one({"user_id": user["id"]}, {"_id": 0})
    if not d:
        raise HTTPException(status_code=404, detail="Driver profile not found")
    return {
        "total_trips": d.get("total_trips", 0),
        "earnings": d.get("earnings", 0),
        "rating": d.get("rating", 5.0),
        "points": d.get("points", 0),
        "acceptance_rate": d.get("acceptance_rate", 100),
        "cancellation_rate": d.get("cancellation_rate", 0),
        "is_online": d.get("is_online", False),
        "status": d.get("status"),
        "vehicle_type": d.get("vehicle_type"),
        "vehicle_model": d.get("vehicle_model"),
        "vehicle_number": d.get("vehicle_number"),
    }


@router.get("/my-earnings")
async def my_earnings_alias(request: Request):
    """Stats per period."""
    user = await get_current_user(request)
    d = await db.drivers.find_one({"user_id": user["id"]}, {"_id": 0})
    if not d:
        raise HTTPException(status_code=404, detail="Driver profile not found")
    from datetime import timedelta
    now = datetime.now(timezone.utc)
    today = now.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    week = (now - timedelta(days=7)).isoformat()
    month = (now - timedelta(days=30)).isoformat()

    rides_today = await db.rides.find({"driver_id": d["id"], "status": "completed", "completed_at": {"$gte": today}}, {"_id": 0}).to_list(100)
    rides_week = await db.rides.find({"driver_id": d["id"], "status": "completed", "completed_at": {"$gte": week}}, {"_id": 0}).to_list(500)
    rides_month = await db.rides.find({"driver_id": d["id"], "status": "completed", "completed_at": {"$gte": month}}, {"_id": 0}).to_list(2000)

    def total(rides):
        return sum((r.get("final_fare") or r.get("estimated_fare") or 0) * 0.9 for r in rides)

    return {
        "today": {"earnings": round(total(rides_today), 2), "rides": len(rides_today)},
        "week": {"earnings": round(total(rides_week), 2), "rides": len(rides_week)},
        "month": {"earnings": round(total(rides_month), 2), "rides": len(rides_month)},
        "total_lifetime": d.get("earnings", 0),
    }


@router.get("/my-documents")
async def my_documents(request: Request):
    user = await get_current_user(request)
    d = await db.drivers.find_one({"user_id": user["id"]}, {"_id": 0})
    if not d:
        raise HTTPException(status_code=404, detail="Driver profile not found")
    return {
        "license_url": d.get("license_url"),
        "insurance_url": d.get("insurance_url"),
        "vehicle_registration_url": d.get("vehicle_registration_url"),
        "identity_url": d.get("identity_url"),
        "status": d.get("status"),
        "documents_verified": d.get("status") == "approved",
    }


@router.get("/my-notifications")
async def my_notifications(request: Request):
    user = await get_current_user(request)
    items = await db.notifications.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(50)
    return items


@router.get("/incoming-requests")
async def incoming_requests(request: Request):
    """Alias of /api/rides/pending/available for drivers."""
    user = await get_current_user(request)
    if user.get("role") != "driver":
        raise HTTPException(status_code=403, detail="Driver only")
    d = await db.drivers.find_one({"user_id": user["id"]}, {"_id": 0})
    if not d or not d.get("is_online"):
        return []
    # Only "taxi" drivers receive taxi ride requests
    svc = d.get("service_types") or ["taxi", "delivery"]
    if "taxi" not in svc:
        return []
    # Optional destination-mode filtering
    target = d.get("destination_mode_target") if d.get("destination_mode_active") else None
    rides = await db.rides.find({"status": "pending", "vehicle_type": d.get("vehicle_type")}, {"_id": 0}).sort("created_at", -1).to_list(30)
    if target and target.get("lat"):
        from math import radians, cos, sin, asin, sqrt
        def km(lat1, lon1, lat2, lon2):
            R = 6371
            dlat = radians(lat2 - lat1)
            dlon = radians(lon2 - lon1)
            a = sin(dlat/2)**2 + cos(radians(lat1))*cos(radians(lat2))*sin(dlon/2)**2
            return 2*R*asin(sqrt(a))
        rides = [r for r in rides if km(r.get("dropoff_lat", 0), r.get("dropoff_lng", 0), target["lat"], target["lng"]) <= target.get("radius_km", 5)]
    return rides

