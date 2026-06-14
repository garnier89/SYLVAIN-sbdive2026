from routes.admin._common import *  # noqa: F401,F403

@router.get("/zone-alerts")
async def list_zone_alerts(request: Request):
    """Active driver-shortage zone alerts (for the admin live banner)."""
    await require_role(request, ["admin"], permission="dashboard.view")
    now_iso = datetime.now(timezone.utc).isoformat()
    alerts = await db.zone_alerts.find({"status": "active"}, {"_id": 0}).sort("created_at", -1).to_list(100)
    for a in alerts:
        a["bonus_active"] = bool(a.get("bonus_active_until") and a["bonus_active_until"] > now_iso)
    return {"alerts": alerts}


@router.post("/zone-alerts/{alert_id}/bonus")
async def activate_zone_bonus(alert_id: str, request: Request):
    """Declare a temporary driver bonus on the alert's zone (manual trigger)."""
    await require_role(request, ["admin"], permission="dashboard.view")
    from core.zone_alerts import get_alert_cfg
    from core.websocket import manager
    body = await request.json()
    cfg = await get_alert_cfg()
    try:
        amount = float(body.get("bonus_amount") if body.get("bonus_amount") is not None else cfg["bonus_amount"])
    except (TypeError, ValueError):
        amount = float(cfg["bonus_amount"])
    try:
        duration = int(body.get("duration_minutes") if body.get("duration_minutes") is not None else cfg["bonus_duration_minutes"])
    except (TypeError, ValueError):
        duration = int(cfg["bonus_duration_minutes"])
    amount = max(0.0, min(amount, 1000.0))
    duration = max(5, min(duration, 1440))
    until = (datetime.now(timezone.utc) + timedelta(minutes=duration)).isoformat()
    alert = await db.zone_alerts.find_one({"id": alert_id}, {"_id": 0})
    if not alert:
        raise HTTPException(status_code=404, detail="Alerte introuvable")
    await db.zone_alerts.update_one(
        {"id": alert_id},
        {"$set": {"bonus_amount": round(amount, 2), "bonus_active_until": until}},
    )
    try:
        await manager.broadcast_to_drivers({
            "type": "zone_bonus_active",
            "zone": alert["zone"],
            "bonus_amount": round(amount, 2),
            "bonus_active_until": until,
        })
    except Exception:
        pass
    return {"message": "Prime activée", "zone": alert["zone"], "bonus_amount": round(amount, 2), "bonus_active_until": until}


@router.post("/zone-alerts/{alert_id}/dismiss")
async def dismiss_zone_alert(alert_id: str, request: Request):
    """Dismiss a zone alert (and clear any active bonus)."""
    await require_role(request, ["admin"], permission="dashboard.view")
    res = await db.zone_alerts.update_one(
        {"id": alert_id},
        {"$set": {"status": "dismissed", "bonus_active_until": None, "dismissed_at": datetime.now(timezone.utc).isoformat()}},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Alerte introuvable")
    return {"message": "Alerte ignorée"}



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


# ============================================================
# Heatmap endpoints (Admin Heat View - Google Maps)
# ============================================================

@router.get("/heatmap/drivers")
async def heatmap_drivers(request: Request):
    """Return active driver positions as heatmap points (for density visualisation)."""
    await require_role(request, ["admin"], permission="dashboard.view")
    cursor = db.drivers.find(
        {
            "is_online": True,
            "current_lat": {"$exists": True, "$ne": None},
            "current_lng": {"$exists": True, "$ne": None},
        },
        {"_id": 0, "current_lat": 1, "current_lng": 1},
    )
    docs = await cursor.to_list(2000)
    items = [{"lat": d["current_lat"], "lng": d["current_lng"], "weight": 1} for d in docs]
    return {"items": items, "count": len(items)}


@router.get("/heatmap/rides")
async def heatmap_rides(request: Request):
    """Return recent ride pickup points as heatmap (last 24h)."""
    await require_role(request, ["admin"], permission="dashboard.view")
    since = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
    cursor = db.rides.find(
        {
            "created_at": {"$gte": since},
            "pickup_lat": {"$exists": True, "$ne": None},
            "pickup_lng": {"$exists": True, "$ne": None},
        },
        {"_id": 0, "pickup_lat": 1, "pickup_lng": 1},
    )
    docs = await cursor.to_list(5000)
    items = [{"lat": d["pickup_lat"], "lng": d["pickup_lng"], "weight": 1} for d in docs]
    return {"items": items, "count": len(items)}
