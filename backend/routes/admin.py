from fastapi import APIRouter, Request, HTTPException
from datetime import datetime, timezone
import uuid

from core.config import db
from core.deps import require_role

router = APIRouter(prefix="/admin", tags=["admin"])


# ===== DEFAULT REWARDS / POINTS CONFIG =====
DEFAULT_REWARDS_CONFIG = {
    "regard_vehicles": [
        {"id": "rv_car", "type": "Voiture", "icon": "Car", "active": True, "start_date": "", "end_date": "", "start_time": "06:00", "end_time": "23:00", "zone": "Martinique", "bonus_per_trip": 3, "min_trips": 5, "description": "Bonus course voiture"},
        {"id": "rv_moto", "type": "Moto", "icon": "Motorcycle", "active": False, "start_date": "", "end_date": "", "start_time": "08:00", "end_time": "22:00", "zone": "Paris", "bonus_per_trip": 2, "min_trips": 8, "description": "Bonus course moto"},
        {"id": "rv_velo", "type": "Velo", "icon": "Bicycle", "active": False, "start_date": "", "end_date": "", "start_time": "07:00", "end_time": "21:00", "zone": "Fort-de-France", "bonus_per_trip": 1.5, "min_trips": 10, "description": "Bonus course velo"},
    ],
    "guarantees": [
        {"id": "g_day", "name": "Garantie Journee Standard", "active": True, "start_hour": "12:00", "end_hour": "20:00", "min_revenue": 59, "acceptance_rate": 80, "max_cancellation": 10, "zone": "Martinique", "start_date": "", "end_date": "", "description": "Entre 12h et 20h, CA min 59EUR"},
    ],
    "points": {
        "initial_points": 100,
        "points_per_ride_accepted": 2,
        "points_per_ride_completed": 3,
        "points_lost_per_refuse": 5,
        "points_lost_per_cancel": 10,
        "palettes": [
            {"id": "p1", "name": "Debutant", "min_points": 0, "max_points": 30, "priority_access": False, "max_ride_amount": 20, "color": "#EF4444"},
            {"id": "p2", "name": "Standard", "min_points": 31, "max_points": 60, "priority_access": False, "max_ride_amount": 50, "color": "#F59E0B"},
            {"id": "p3", "name": "Confirme", "min_points": 61, "max_points": 80, "priority_access": True, "max_ride_amount": 100, "color": "#3B82F6"},
            {"id": "p4", "name": "Expert", "min_points": 81, "max_points": 100, "priority_access": True, "max_ride_amount": 999, "color": "#10B981"},
        ],
    },
}


async def get_rewards_config():
    """Return the rewards config merged with defaults."""
    doc = await db.service_configs.find_one({"service_key": "rewards"}, {"_id": 0})
    if not doc or not doc.get("settings"):
        return DEFAULT_REWARDS_CONFIG
    s = doc["settings"]
    return {
        "regard_vehicles": s.get("regard_vehicles") or DEFAULT_REWARDS_CONFIG["regard_vehicles"],
        "guarantees": s.get("guarantees") or DEFAULT_REWARDS_CONFIG["guarantees"],
        "points": s.get("points") or DEFAULT_REWARDS_CONFIG["points"],
    }


@router.post("/vehicle-types")
async def create_vehicle_type(request: Request):
    await require_role(request, ["admin"])
    body = await request.json()
    slug = body.get("slug")
    if not slug:
        raise HTTPException(status_code=400, detail="slug is required")
    existing = await db.vehicle_types.find_one({"slug": slug})
    if existing:
        raise HTTPException(status_code=409, detail="Vehicle type already exists")
    doc = {
        "slug": slug,
        "name_fr": body.get("name_fr", slug),
        "person_capacity": body.get("person_capacity", 4),
        "min_fare": body.get("min_fare", 10),
        "base_fare": body.get("base_fare", 5),
        "price_per_km": body.get("price_per_km", 1.5),
        "price_per_min": body.get("price_per_min", 0.3),
        "commission_percent": body.get("commission_percent", 15),
        "cancellation_fare": body.get("cancellation_fare", 5),
        "icon_type": body.get("icon_type", "Car"),
        "status": "active",
        "display_order": body.get("display_order", 99),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.vehicle_types.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.put("/vehicle-types/{slug}")
async def update_vehicle_type(slug: str, request: Request):
    await require_role(request, ["admin"])
    body = await request.json()
    update = {}
    for field in ["name_fr", "person_capacity", "min_fare", "base_fare", "price_per_km", "price_per_min", "commission_percent", "cancellation_fare", "icon_type", "status", "display_order"]:
        if field in body:
            update[field] = body[field]
    if not update:
        raise HTTPException(status_code=400, detail="No fields to update")
    result = await db.vehicle_types.update_one({"slug": slug}, {"$set": update})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Vehicle type not found")
    return {"message": f"Vehicle type '{slug}' updated"}


@router.delete("/vehicle-types/{slug}")
async def delete_vehicle_type(slug: str, request: Request):
    await require_role(request, ["admin"])
    result = await db.vehicle_types.delete_one({"slug": slug})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Vehicle type not found")
    return {"message": f"Vehicle type '{slug}' deleted"}


@router.post("/merchants/{merchant_id}/status")
async def update_merchant_status(merchant_id: str, request: Request):
    await require_role(request, ["admin"])
    body = await request.json()
    new_status = body.get("status", "active")
    result = await db.merchants.update_one({"id": merchant_id}, {"$set": {"status": new_status}})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Merchant not found")
    return {"message": f"Merchant status updated to {new_status}"}


@router.get("/stats")
async def get_admin_stats(request: Request):
    await require_role(request, ["admin"])
    users_count = await db.users.count_documents({})
    drivers_count = await db.drivers.count_documents({})
    rides_count = await db.rides.count_documents({})
    orders_count = await db.orders.count_documents({})
    merchants_count = await db.merchants.count_documents({})
    return {
        "users": users_count,
        "drivers": drivers_count,
        "rides": rides_count,
        "orders": orders_count,
        "merchants": merchants_count,
    }


# ===== ADMIN GENERAL SETTINGS =====

@router.get("/settings")
async def get_admin_general_settings(request: Request):
    await require_role(request, ["admin"])
    doc = await db.service_configs.find_one({"service_key": "general"}, {"_id": 0})
    if not doc:
        return {"settings": {}}
    return doc


@router.put("/settings")
async def save_admin_general_settings(request: Request):
    await require_role(request, ["admin"])
    body = await request.json()
    settings = body.get("settings", body)
    await db.service_configs.update_one(
        {"service_key": "general"},
        {"$set": {
            "service_key": "general",
            "settings": settings,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }},
        upsert=True,
    )
    return {"message": "Settings saved", "settings": settings}


@router.get("/analytics")
async def get_analytics(request: Request, period: str = "week"):
    await require_role(request, ["admin"])

    # Ride status breakdown
    pipeline_status = [
        {"$group": {"_id": "$status", "count": {"$sum": 1}}}
    ]
    status_results = await db.rides.aggregate(pipeline_status).to_list(20)
    status_map = {r["_id"]: r["count"] for r in status_results}

    # Recent rides
    recent_rides = await db.rides.find({}, {"_id": 0}).sort("created_at", -1).limit(5).to_list(5)

    # Total earnings
    earning_pipeline = [
        {"$match": {"status": "completed"}},
        {"$group": {"_id": None, "total": {"$sum": "$final_fare"}, "count": {"$sum": 1}}}
    ]
    earning_result = await db.rides.aggregate(earning_pipeline).to_list(1)
    total_earning = earning_result[0]["total"] if earning_result else 0
    completed_count = earning_result[0]["count"] if earning_result else 0

    # Commission calculation (15% default)
    commission_total = total_earning * 0.15

    # Scheduled bookings
    scheduled = await db.rides.find(
        {"scheduled_at": {"$ne": None}}, {"_id": 0}
    ).sort("scheduled_at", -1).limit(5).to_list(5)

    # Active drivers
    active_drivers = await db.drivers.count_documents({"is_online": True})
    total_drivers = await db.drivers.count_documents({})

    # Rides in progress
    in_progress = status_map.get("in_progress", 0) + status_map.get("arriving", 0)
    completed = status_map.get("completed", 0)
    cancelled = status_map.get("cancelled", 0)
    pending = status_map.get("pending", 0)

    return {
        "ride_status": {
            "in_progress": in_progress,
            "completed": completed,
            "cancelled": cancelled,
            "pending": pending,
        },
        "earnings": {
            "total": round(total_earning, 2),
            "commission": round(commission_total, 2),
            "outstanding": 0,
            "org_outstanding": 0,
        },
        "drivers": {
            "active": active_drivers,
            "total": total_drivers,
        },
        "recent_rides": recent_rides,
        "scheduled_bookings": scheduled,
        "completed_rides_count": completed_count,
    }


# ===== SERVICE CONFIGS =====

@router.get("/service-config/{service_key}")
async def get_service_config(service_key: str, request: Request):
    await require_role(request, ["admin"])
    config = await db.service_configs.find_one({"service_key": service_key}, {"_id": 0})
    if not config:
        return {"service_key": service_key, "settings": {}}
    return config


@router.put("/service-config/{service_key}")
async def save_service_config(service_key: str, request: Request):
    await require_role(request, ["admin"])
    body = await request.json()
    settings = body.get("settings", {})
    await db.service_configs.update_one(
        {"service_key": service_key},
        {"$set": {
            "service_key": service_key,
            "settings": settings,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }},
        upsert=True,
    )
    return {"message": f"Config '{service_key}' saved"}


# ===== CRUD ITEMS (groups, vehicles, company, etc.) =====

ALLOWED_CRUD = [
    "groups", "vehicles", "companies", "hotels", "organizations", "pending_requests",
    "vehicle_makes", "vehicle_models", "cancel_reasons", "email_templates", "sms_templates",
    "master_services", "sos_requests", "contact_requests", "withdraw_requests",
    "order_help_requests", "trip_help_requests", "push_notifications",
    "payouts", "settlements", "disputes", "documents",
    "banners", "wallet_requests", "news", "newsletter_subscribers", "promocodes",
    "beauty_salons", "pet_providers", "car_services", "towing_partners",
    "nearby_businesses", "ondemand_services", "carpool_trips", "marketplace_listings",
]


def _crud_col(collection: str):
    if collection not in ALLOWED_CRUD:
        raise HTTPException(status_code=400, detail="Invalid collection")
    return db[f"admin_{collection}"]


@router.get("/crud/{collection}")
async def list_crud_items(collection: str, request: Request):
    await require_role(request, ["admin"])
    col = _crud_col(collection)
    items = await col.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return items


@router.post("/crud/{collection}")
async def create_crud_item(collection: str, request: Request):
    await require_role(request, ["admin"])
    col = _crud_col(collection)
    body = await request.json()
    body["id"] = f"{collection[:3]}_{uuid.uuid4().hex[:8]}"
    body["created_at"] = datetime.now(timezone.utc).isoformat()
    await col.insert_one(body)
    body.pop("_id", None)
    return body


@router.put("/crud/{collection}/{item_id}")
async def update_crud_item(collection: str, item_id: str, request: Request):
    await require_role(request, ["admin"])
    col = _crud_col(collection)
    body = await request.json()
    body.pop("id", None)
    body.pop("_id", None)
    result = await col.update_one({"id": item_id}, {"$set": body})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Item not found")
    return {"message": "Updated"}


@router.delete("/crud/{collection}/{item_id}")
async def delete_crud_item(collection: str, item_id: str, request: Request):
    await require_role(request, ["admin"])
    col = _crud_col(collection)
    result = await col.delete_one({"id": item_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Item not found")
    return {"message": "Deleted"}


# ===== REWARDS CONFIG (vehicle regards + revenue guarantees + driver points) =====

@router.get("/rewards/config")
async def get_admin_rewards_config(request: Request):
    await require_role(request, ["admin"])
    return await get_rewards_config()


@router.put("/rewards/config")
async def save_admin_rewards_config(request: Request):
    await require_role(request, ["admin"])
    body = await request.json()
    settings = {
        "regard_vehicles": body.get("regard_vehicles", DEFAULT_REWARDS_CONFIG["regard_vehicles"]),
        "guarantees": body.get("guarantees", DEFAULT_REWARDS_CONFIG["guarantees"]),
        "points": body.get("points", DEFAULT_REWARDS_CONFIG["points"]),
    }
    await db.service_configs.update_one(
        {"service_key": "rewards"},
        {"$set": {
            "service_key": "rewards",
            "settings": settings,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }},
        upsert=True,
    )
    return {"message": "Rewards config saved", "settings": settings}


# ===== PRIORITY DRIVERS (manually boosted by admin) =====

@router.get("/priority-drivers")
async def list_priority_drivers(request: Request):
    """List all drivers with their priority state (manual + computed from points)."""
    await require_role(request, ["admin"])
    config = await get_rewards_config()
    palettes = config["points"]["palettes"]

    def resolve_palette(points: int):
        for p in palettes:
            if p["min_points"] <= points <= p["max_points"]:
                return p
        return palettes[0] if palettes else None

    drivers = await db.drivers.find({}, {"_id": 0}).to_list(500)
    result = []
    for d in drivers:
        user_doc = await db.users.find_one({"id": d["user_id"]}, {"_id": 0, "name": 1, "email": 1, "phone": 1})
        points = d.get("points", config["points"]["initial_points"])
        palette = resolve_palette(points)
        result.append({
            "driver_id": d["id"],
            "user_id": d["user_id"],
            "name": (user_doc or {}).get("name", "Chauffeur"),
            "email": (user_doc or {}).get("email", ""),
            "phone": (user_doc or {}).get("phone", ""),
            "vehicle_type": d.get("vehicle_type"),
            "vehicle_number": d.get("vehicle_number"),
            "status": d.get("status"),
            "is_online": d.get("is_online", False),
            "points": points,
            "total_trips": d.get("total_trips", 0),
            "rating": d.get("rating", 5.0),
            "manual_priority": d.get("manual_priority", False),
            "manual_priority_note": d.get("manual_priority_note", ""),
            "acceptance_rate": d.get("acceptance_rate", 100),
            "cancellation_rate": d.get("cancellation_rate", 0),
            "palette_name": palette["name"] if palette else "",
            "palette_color": palette["color"] if palette else "#9CA3AF",
            "has_priority": d.get("manual_priority", False) or (palette["priority_access"] if palette else False),
        })
    # Sort: manual priority first, then by points desc
    result.sort(key=lambda x: (not x["manual_priority"], -x["points"]))
    return result


@router.put("/priority-drivers/{driver_id}")
async def set_priority_driver(driver_id: str, request: Request):
    """Toggle/set manual priority for a specific driver."""
    await require_role(request, ["admin"])
    body = await request.json()
    manual_priority = bool(body.get("manual_priority", False))
    note = body.get("note", "")
    result = await db.drivers.update_one(
        {"id": driver_id},
        {"$set": {
            "manual_priority": manual_priority,
            "manual_priority_note": note,
            "manual_priority_updated_at": datetime.now(timezone.utc).isoformat(),
        }},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Driver not found")
    return {"driver_id": driver_id, "manual_priority": manual_priority, "note": note}


@router.delete("/priority-drivers/{driver_id}")
async def remove_priority_driver(driver_id: str, request: Request):
    await require_role(request, ["admin"])
    result = await db.drivers.update_one(
        {"id": driver_id},
        {"$set": {"manual_priority": False, "manual_priority_note": ""}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Driver not found")
    return {"driver_id": driver_id, "manual_priority": False}



# ===== TOP CHAUFFEURS (public ranking + admin manual select) =====

@router.get("/top-drivers-config")
async def get_top_drivers_config(request: Request):
    await require_role(request, ["admin"])
    doc = await db.service_configs.find_one({"service_key": "top_drivers"}, {"_id": 0})
    if not doc:
        return {"settings": {"mode": "composite", "max_shown": 10, "manual_driver_ids": []}}
    return doc


@router.put("/top-drivers-config")
async def save_top_drivers_config(request: Request):
    await require_role(request, ["admin"])
    body = await request.json()
    settings = {
        "mode": body.get("mode", "composite"),  # composite | points | manual
        "max_shown": int(body.get("max_shown", 10)),
        "manual_driver_ids": body.get("manual_driver_ids", []),
    }
    await db.service_configs.update_one(
        {"service_key": "top_drivers"},
        {"$set": {"service_key": "top_drivers", "settings": settings,
                  "updated_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True,
    )
    return {"message": "Top drivers config saved", "settings": settings}


# ===== DB BACKUP (simple collection dump list) =====

@router.get("/db-backup")
async def db_backup_status(request: Request):
    await require_role(request, ["admin"])
    names = await db.list_collection_names()
    stats = []
    for n in names:
        try:
            count = await db[n].count_documents({})
            stats.append({"collection": n, "count": count})
        except Exception:
            pass
    stats.sort(key=lambda x: -x["count"])
    return {"collections": stats, "total": len(stats), "checked_at": datetime.now(timezone.utc).isoformat()}



# ===== NEGOTIATION GAP REPORT =====

@router.get("/reports/negotiation-gap")
async def negotiation_gap_report(request: Request, days: int = 30):
    """Report on the gap between passenger proposed_fare and the final accepted fare,
    grouped by day and by pickup zone (vehicle_type as a proxy zone when address parsing fails)."""
    await require_role(request, ["admin"])
    from datetime import timedelta
    since = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()

    # Only rides that went past negotiation (accepted/completed) with a proposed_fare
    query = {
        "created_at": {"$gte": since},
        "proposed_fare": {"$ne": None, "$gt": 0},
        "status": {"$in": ["accepted", "arriving", "in_progress", "completed"]},
    }
    rides = await db.rides.find(query, {
        "_id": 0,
        "id": 1, "created_at": 1, "proposed_fare": 1, "estimated_fare": 1, "final_fare": 1,
        "vehicle_type": 1, "pickup_address": 1, "dropoff_address": 1, "distance_km": 1,
        "counter_offers": 1, "status": 1,
    }).to_list(5000)

    def infer_zone(addr: str) -> str:
        if not addr:
            return "Inconnue"
        low = addr.lower()
        for token, label in [
            ("martinique", "Martinique"), ("fort-de-france", "Martinique"),
            ("guadeloupe", "Guadeloupe"), ("pointe-a-pitre", "Guadeloupe"),
            ("guyane", "Guyane"), ("reunion", "Reunion"),
            ("paris", "Paris"), ("lyon", "Lyon"), ("marseille", "Marseille"),
        ]:
            if token in low:
                return label
        # fallback: last comma-delimited segment
        parts = [p.strip() for p in addr.split(",") if p.strip()]
        return parts[-1][:30] if parts else "Inconnue"

    by_day = {}
    by_zone = {}
    by_vehicle = {}
    total_gap_abs = 0.0
    total_gap_pct = 0.0
    total_proposed = 0.0
    total_accepted = 0.0
    n = 0
    negotiated_count = 0  # rides where a counter-offer was accepted
    accepted_at_offer_count = 0  # rides where driver accepted passenger's price directly

    samples = []

    for r in rides:
        proposed = float(r.get("proposed_fare") or 0)
        accepted = float(r.get("final_fare") or r.get("estimated_fare") or 0)
        if proposed <= 0 or accepted <= 0:
            continue
        gap_abs = accepted - proposed
        gap_pct = (gap_abs / proposed) * 100 if proposed > 0 else 0
        was_negotiated = any((o or {}).get("status") == "accepted" for o in (r.get("counter_offers") or []))

        n += 1
        total_gap_abs += gap_abs
        total_gap_pct += gap_pct
        total_proposed += proposed
        total_accepted += accepted
        if was_negotiated:
            negotiated_count += 1
        else:
            accepted_at_offer_count += 1

        day = (r.get("created_at") or "")[:10]
        by_day.setdefault(day, {"day": day, "count": 0, "avg_gap": 0, "sum_gap": 0, "sum_proposed": 0, "sum_accepted": 0})
        by_day[day]["count"] += 1
        by_day[day]["sum_gap"] += gap_abs
        by_day[day]["sum_proposed"] += proposed
        by_day[day]["sum_accepted"] += accepted

        zone = infer_zone(r.get("pickup_address") or "")
        by_zone.setdefault(zone, {"zone": zone, "count": 0, "sum_gap": 0, "sum_pct": 0, "sum_proposed": 0, "sum_accepted": 0})
        by_zone[zone]["count"] += 1
        by_zone[zone]["sum_gap"] += gap_abs
        by_zone[zone]["sum_pct"] += gap_pct
        by_zone[zone]["sum_proposed"] += proposed
        by_zone[zone]["sum_accepted"] += accepted

        vt = r.get("vehicle_type") or "unknown"
        by_vehicle.setdefault(vt, {"vehicle": vt, "count": 0, "sum_gap": 0, "sum_pct": 0})
        by_vehicle[vt]["count"] += 1
        by_vehicle[vt]["sum_gap"] += gap_abs
        by_vehicle[vt]["sum_pct"] += gap_pct

        if len(samples) < 20:
            samples.append({
                "ride_id": r["id"],
                "created_at": r.get("created_at"),
                "proposed": round(proposed, 2),
                "accepted": round(accepted, 2),
                "gap_abs": round(gap_abs, 2),
                "gap_pct": round(gap_pct, 1),
                "pickup": r.get("pickup_address"),
                "zone": zone,
                "vehicle_type": vt,
                "negotiated": was_negotiated,
            })

    # Finalize averages
    daily_series = []
    for day in sorted(by_day.keys()):
        d = by_day[day]
        d["avg_gap"] = round(d["sum_gap"] / d["count"], 2) if d["count"] else 0
        d["avg_proposed"] = round(d["sum_proposed"] / d["count"], 2) if d["count"] else 0
        d["avg_accepted"] = round(d["sum_accepted"] / d["count"], 2) if d["count"] else 0
        daily_series.append(d)

    zone_rows = []
    for zone in by_zone:
        z = by_zone[zone]
        z["avg_gap"] = round(z["sum_gap"] / z["count"], 2) if z["count"] else 0
        z["avg_gap_pct"] = round(z["sum_pct"] / z["count"], 1) if z["count"] else 0
        z["avg_proposed"] = round(z["sum_proposed"] / z["count"], 2) if z["count"] else 0
        z["avg_accepted"] = round(z["sum_accepted"] / z["count"], 2) if z["count"] else 0
        zone_rows.append(z)
    zone_rows.sort(key=lambda x: -x["count"])

    vehicle_rows = []
    for vt in by_vehicle:
        v = by_vehicle[vt]
        v["avg_gap"] = round(v["sum_gap"] / v["count"], 2) if v["count"] else 0
        v["avg_gap_pct"] = round(v["sum_pct"] / v["count"], 1) if v["count"] else 0
        vehicle_rows.append(v)
    vehicle_rows.sort(key=lambda x: -x["count"])

    return {
        "period_days": days,
        "total_rides": n,
        "negotiated_count": negotiated_count,
        "accepted_at_offer_count": accepted_at_offer_count,
        "avg_gap_abs": round(total_gap_abs / n, 2) if n else 0,
        "avg_gap_pct": round(total_gap_pct / n, 1) if n else 0,
        "total_proposed": round(total_proposed, 2),
        "total_accepted": round(total_accepted, 2),
        "total_revenue_gap": round(total_accepted - total_proposed, 2),
        "daily": daily_series,
        "zones": zone_rows,
        "vehicles": vehicle_rows,
        "samples": samples,
    }



# ===== LIVE RIDES (Admin real-time monitoring) =====
@router.get("/live-rides")
async def admin_live_rides(request: Request):
    """Return all currently active rides (accepted/arriving/in_progress) with
    pickup/dropoff coords + live driver location from WebSocket manager."""
    await require_role(request, ["admin", "dispatcher"])
    from core.websocket import manager

    rides = await db.rides.find(
        {"status": {"$in": ["pending", "accepted", "arriving", "in_progress"]}},
        {"_id": 0},
    ).sort("created_at", -1).limit(100).to_list(100)

    # Attach live driver location + user contact
    for r in rides:
        if r.get("driver_id"):
            loc = manager.get_driver_location(r["driver_id"])
            if loc:
                r["driver_lat"] = loc.get("lat")
                r["driver_lng"] = loc.get("lng")
                r["driver_last_seen"] = loc.get("timestamp")
        # Attach passenger name/phone for display
        if r.get("user_id"):
            u = await db.users.find_one({"id": r["user_id"]}, {"_id": 0, "name": 1, "phone": 1, "email": 1})
            if u:
                r["passenger_name"] = u.get("name")
                r["passenger_phone"] = u.get("phone")
                r["passenger_email"] = u.get("email")

    # Aggregate counts per status
    counts = {"pending": 0, "accepted": 0, "arriving": 0, "in_progress": 0}
    for r in rides:
        s = r.get("status")
        if s in counts:
            counts[s] += 1

    return {"rides": rides, "counts": counts, "total": len(rides)}
