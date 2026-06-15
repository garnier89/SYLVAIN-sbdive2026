from routes.admin._common import (
    Request,
    _aggregate_negotiation_rides,
    _earnings_summary,
    _extract_city,
    _finalize_daily,
    _finalize_vehicles,
    _finalize_zones,
    _infer_zone,
    _is_valid_city,
    _ride_status_map,
    _time_slot,
    datetime,
    db,
    require_role,
    router,
    timedelta,
    timezone,
)

@router.get("/analytics/delivery-monthly")
async def get_delivery_monthly(request: Request):
    """Monthly counts for Store Deliveries and Delivery Genie/Runner (last 12 months)."""
    await require_role(request, ["admin"])

    # Build the last 12 month buckets (oldest → newest)
    now = datetime.now(timezone.utc)
    y, m = now.year, now.month
    months_back = []
    for _ in range(12):
        months_back.append((y, m))
        m -= 1
        if m == 0:
            m = 12
            y -= 1
    months_back.reverse()
    MONTH_ABBR = ["", "Jan", "Fév", "Mar", "Avr", "Mai", "Juin", "Juil", "Aoû", "Sep", "Oct", "Nov", "Déc"]
    label = {(yy, mm): f"{MONTH_ABBR[mm]} {yy}" for (yy, mm) in months_back}

    def _bucket_key(iso):
        try:
            d = datetime.fromisoformat(str(iso).replace("Z", "+00:00"))
            return (d.year, d.month)
        except (TypeError, ValueError):
            return None

    # Store deliveries (orders collection)
    store_monthly = {k: 0 for k in months_back}
    store_total = 0
    async for o in db.orders.find({}, {"_id": 0, "created_at": 1}):
        store_total += 1
        bk = _bucket_key(o.get("created_at"))
        if bk in store_monthly:
            store_monthly[bk] += 1

    # Delivery Genie / Runner (runner_orders collection, split by service_type)
    runner_monthly = {k: {"runner": 0, "genie": 0} for k in months_back}
    gr_total = 0
    async for r in db.runner_orders.find({}, {"_id": 0, "created_at": 1, "service_type": 1}):
        gr_total += 1
        bk = _bucket_key(r.get("created_at"))
        if bk in runner_monthly:
            st = "genie" if (r.get("service_type") == "genie") else "runner"
            runner_monthly[bk][st] += 1

    buckets = months_back
    return {
        "store_deliveries": {
            "total": store_total,
            "monthly": [{"month": label[k], "count": store_monthly[k]} for k in buckets],
        },
        "delivery_genie_runner": {
            "total": gr_total,
            "monthly": [{"month": label[k], "runner": runner_monthly[k]["runner"], "genie": runner_monthly[k]["genie"]} for k in buckets],
        },
    }


@router.get("/analytics")
async def get_analytics(request: Request, period: str = "week"):
    await require_role(request, ["admin"])

    status_map = await _ride_status_map()
    total_earning, completed_count = await _earnings_summary()
    recent_rides = await db.rides.find({}, {"_id": 0}).sort("created_at", -1).limit(5).to_list(5)
    scheduled = await db.rides.find(
        {"scheduled_at": {"$ne": None}}, {"_id": 0}
    ).sort("scheduled_at", -1).limit(5).to_list(5)
    active_drivers = await db.drivers.count_documents({"is_online": True})
    total_drivers = await db.drivers.count_documents({})

    return {
        "ride_status": {
            "in_progress": status_map.get("in_progress", 0) + status_map.get("arriving", 0),
            "completed": status_map.get("completed", 0),
            "cancelled": status_map.get("cancelled", 0),
            "pending": status_map.get("pending", 0),
        },
        "earnings": {
            "total": round(total_earning, 2),
            "commission": round(total_earning * 0.15, 2),  # 15% default
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


@router.get("/analytics/breakdown")
async def get_analytics_breakdown(request: Request, period: str = "all"):
    """Revenue split by service + top cities/zones — fed by real data.
    Optional period filter: today | week | month | all."""
    await require_role(request, ["admin"])

    completed_ride_statuses = ["completed", "delivered", "done"]

    # ---- Period → created_at date filter (ISO strings sort lexicographically) ----
    now = datetime.now(timezone.utc)
    if period == "today":
        start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    elif period == "week":
        start = now - timedelta(days=7)
    elif period == "month":
        start = now - timedelta(days=30)
    else:
        start = None
    date_match = {"created_at": {"$gte": start.isoformat()}} if start else {}

    # ---- Revenue by service ----
    async def _sum(col, fare_field, match=None):
        m = {**(match or {}), **date_match}
        pipeline = [{"$match": m}, {"$group": {"_id": None, "revenue": {"$sum": f"${fare_field}"}, "count": {"$sum": 1}}}]
        res = await db[col].aggregate(pipeline).to_list(1)
        if res:
            return round(res[0].get("revenue", 0) or 0, 2), res[0].get("count", 0)
        return 0, 0

    taxi_rev, taxi_cnt = await _sum("rides", "final_fare", {"status": {"$in": completed_ride_statuses}})
    parcel_rev, parcel_cnt = await _sum("parcels", "fare")
    store_rev, store_cnt = await _sum("orders", "total")
    runner_rev, runner_cnt = await _sum("runner_orders", "estimated_fare")

    revenue_by_service = [
        {"service": "Taxi / VTC", "revenue": taxi_rev, "count": taxi_cnt, "color": "#3B82F6"},
        {"service": "Colis", "revenue": parcel_rev, "count": parcel_cnt, "color": "#8B5CF6"},
        {"service": "Boutiques", "revenue": store_rev, "count": store_cnt, "color": "#EC4899"},
        {"service": "Runner / Genie", "revenue": runner_rev, "count": runner_cnt, "color": "#F59E0B"},
    ]

    # ---- Top zones / cities (from ride + parcel pickup addresses) ----
    zones = {}
    async for r in db.rides.find(date_match, {"_id": 0, "pickup_address": 1, "final_fare": 1, "status": 1}):
        city = _extract_city(r.get("pickup_address"))
        if not _is_valid_city(city):
            continue
        z = zones.setdefault(city, {"city": city, "rides": 0, "revenue": 0.0})
        z["rides"] += 1
        if r.get("status") in completed_ride_statuses:
            z["revenue"] += r.get("final_fare") or 0
    async for p in db.parcels.find(date_match, {"_id": 0, "pickup_address": 1, "fare": 1}):
        city = _extract_city(p.get("pickup_address"))
        if not _is_valid_city(city):
            continue
        z = zones.setdefault(city, {"city": city, "rides": 0, "revenue": 0.0})
        z["rides"] += 1
        z["revenue"] += p.get("fare") or 0

    top_zones = sorted(zones.values(), key=lambda x: x["rides"], reverse=True)[:8]
    for z in top_zones:
        z["revenue"] = round(z["revenue"], 2)

    return {
        "revenue_by_service": revenue_by_service,
        "total_revenue": round(taxi_rev + parcel_rev + store_rev + runner_rev, 2),
        "top_zones": top_zones,
    }



# ===== NEGOTIATION GAP REPORT =====

@router.get("/reports/negotiation-gap")
async def negotiation_gap_report(request: Request, days: int = 30):
    """Report on the gap between passenger proposed_fare and the final accepted fare,
    grouped by day and by pickup zone (vehicle_type as a proxy zone when address parsing fails)."""
    await require_role(request, ["admin"], permission="billing.view")
    from datetime import timedelta
    since = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()

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

    agg = _aggregate_negotiation_rides(rides)
    return {
        "period_days": days,
        **agg["totals"],
        "daily": _finalize_daily(agg["by_day"]),
        "zones": _finalize_zones(agg["by_zone"]),
        "vehicles": _finalize_vehicles(agg["by_vehicle"]),
        "samples": agg["samples"],
    }


@router.get("/reports/no-driver-stats")
async def no_driver_stats(request: Request, days: int = 7):
    """Rides with no driver after relances: how many were converted to bidding or
    scheduled, broken down by pickup zone and time slot — to spot driver shortages."""
    await require_role(request, ["admin"], permission="dashboard.view")
    from datetime import timedelta
    since = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()

    total_rides = await db.rides.count_documents({"created_at": {"$gte": since}})
    rides = await db.rides.find(
        {"created_at": {"$gte": since}, "no_driver_outcome": {"$in": ["bidding", "scheduled"]}},
        {"_id": 0, "id": 1, "created_at": 1, "no_driver_outcome": 1, "no_driver_at": 1,
         "pickup_address": 1, "vehicle_type": 1, "relance_count": 1},
    ).to_list(5000)

    by_zone, by_slot, by_vehicle = {}, {}, {}
    bidding = scheduled = 0
    for r in rides:
        outcome = r.get("no_driver_outcome")
        if outcome == "bidding":
            bidding += 1
        else:
            scheduled += 1
        zone = _infer_zone(r.get("pickup_address"))
        z = by_zone.setdefault(zone, {"zone": zone, "total": 0, "bidding": 0, "scheduled": 0})
        z["total"] += 1
        z[outcome] += 1
        ts = r.get("no_driver_at") or r.get("created_at") or ""
        try:
            hour = datetime.fromisoformat(str(ts).replace("Z", "+00:00")).hour
        except (ValueError, TypeError):
            hour = 0
        slot = _time_slot(hour)
        s = by_slot.setdefault(slot, {"slot": slot, "total": 0, "bidding": 0, "scheduled": 0})
        s["total"] += 1
        s[outcome] += 1
        vt = r.get("vehicle_type") or "—"
        v = by_vehicle.setdefault(vt, {"vehicle_type": vt, "total": 0})
        v["total"] += 1

    no_driver_total = len(rides)
    return {
        "period_days": days,
        "total_rides": total_rides,
        "no_driver_total": no_driver_total,
        "converted_bidding": bidding,
        "scheduled": scheduled,
        "no_driver_rate": round((no_driver_total / total_rides * 100), 2) if total_rides else 0,
        "zones": sorted(by_zone.values(), key=lambda x: -x["total"]),
        "slots": sorted(by_slot.values(), key=lambda x: -x["total"]),
        "vehicles": sorted(by_vehicle.values(), key=lambda x: -x["total"]),
    }
