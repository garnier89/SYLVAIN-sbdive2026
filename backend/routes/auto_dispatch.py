"""
Auto-dispatch service for SB Drive VTC.

When a ride stays in `pending` status for too long without driver acceptance,
the dispatcher escalates the ride to priority drivers in widening radius.

Config (stored in `service_configs` under `auto_dispatch`):
  enabled: bool
  first_escalation_seconds: int (default 30)
  second_escalation_seconds: int (default 60)
  auto_cancel_after_seconds: int (default 120)
  radius_km: int (default 5)
  first_palettes: [str]  (e.g. ["Expert", "Confirme"])
  second_palettes: [str] (e.g. ["Expert", "Confirme", "Standard"])

Stats tracked per ride:
  auto_dispatch_tier: 0 (no escalation yet) | 1 (priority only) | 2 (all) | -1 (cancelled)
  auto_dispatch_log: [{ tier, at, drivers_notified }]
"""
import asyncio
import math
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Request, HTTPException
from pydantic import BaseModel

from core.config import db, logger
from core.deps import require_role
from core.websocket import manager

router = APIRouter(prefix="/admin/auto-dispatch", tags=["auto-dispatch"])

CONFIG_KEY = "auto_dispatch"

DEFAULT_CONFIG = {
    "enabled": True,
    "first_escalation_seconds": 30,
    "second_escalation_seconds": 60,
    "auto_cancel_after_seconds": 120,
    "radius_km": 5,
    "first_palettes": ["Expert", "Confirme"],
    "second_palettes": ["Expert", "Confirme", "Standard"],
    # === Scheduled (planned) rides ===
    # A planned ride waits in the driver agenda pool until this many minutes
    # before its pickup time; only then does it enter live dispatch (broadcast +
    # escalation). Before that it must NOT be escalated or auto-cancelled.
    "scheduled_lead_minutes": 15,
    # === Driver Quality Scoring ===
    "scoring_enabled": True,
    "accept_bonus_points": 2,        # +N points when a driver accepts an escalated ride
    "no_response_penalty": 1,        # -N points when a driver was offered tier-1 but didn't accept before tier-2 / cancel
    "min_points_floor": 0,           # don't let points go below this
    # === Anti-abuse / driver discipline (Phase 4 control tower) ===
    # After this many REFUSALS (declines) within refusal_window_minutes the
    # driver app is automatically switched OFFLINE. 0 = disabled.
    "max_refusals_before_offline": 0,
    "refusal_window_minutes": 60,
    # A driver is FLAGGED in the dispatch control tower when their accept-then-
    # cancel ratio on CARD/CB rides reaches cb_cancel_flag_pct (%), provided they
    # have at least cb_cancel_flag_min cancellations (avoids tiny-sample flags).
    "cb_cancel_flag_pct": 30,
    "cb_cancel_flag_min": 3,
    # === Favorite drivers (preferential matching) ===
    # When a customer with online favorite driver(s) books, the request is offered
    # EXCLUSIVELY to the favorite(s) for this many seconds before the general
    # broadcast. 0 = disabled (no head-start). Clamped 0..60.
    "favorite_head_start_seconds": 20,
}


async def get_config():
    doc = await db.service_configs.find_one({"service_key": CONFIG_KEY}, {"_id": 0})
    if not doc or not doc.get("settings"):
        return DEFAULT_CONFIG
    merged = {**DEFAULT_CONFIG, **doc["settings"]}
    return merged


def _haversine_km(lat1, lng1, lat2, lng2):
    if None in (lat1, lng1, lat2, lng2):
        return 9999
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlng / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


async def _palette_for(points, points_cfg):
    """Map driver points → palette name based on rewards config."""
    palettes = (points_cfg or {}).get("palettes") or []
    for p in palettes:
        if p["min_points"] <= (points or 0) <= p["max_points"]:
            return p["name"]
    return "Standard"


async def _drivers_in_radius(pickup_lat, pickup_lng, radius_km, allowed_palettes, points_cfg, prioritize_rating=False):
    """Find approved online drivers within radius matching allowed palettes."""
    cursor = db.drivers.find(
        {"status": "approved", "is_online": True},
        {"_id": 0, "id": 1, "user_id": 1, "points": 1, "current_lat": 1, "current_lng": 1, "vehicle_type": 1, "rating": 1},
    )
    matches = []
    async for d in cursor:
        loc = manager.get_driver_location(d["user_id"]) or {}
        lat = loc.get("lat", d.get("current_lat"))
        lng = loc.get("lng", d.get("current_lng"))
        if lat is None or lng is None:
            continue
        dist = _haversine_km(pickup_lat, pickup_lng, lat, lng)
        if dist > radius_km:
            continue
        palette = await _palette_for(d.get("points"), points_cfg)
        if palette not in allowed_palettes:
            continue
        matches.append({**d, "distance_km": round(dist, 2), "palette": palette})
    if prioritize_rating:
        # Safe Ride Night — best-rated drivers first, then nearest.
        matches.sort(key=lambda x: (-(float(x.get("rating", 5.0) or 5.0)), x["distance_km"]))
    else:
        matches.sort(key=lambda x: x["distance_km"])
    return matches


async def _adjust_driver_points(user_id: str, delta: int, reason: str, ride_id: str, floor: int = 0):
    """Increment/decrement driver.points and append a score_log entry. Keeps floor."""
    if not user_id or delta == 0:
        return
    drv = await db.drivers.find_one({"user_id": user_id}, {"_id": 0, "points": 1})
    if not drv:
        return
    current = drv.get("points") or 0
    new_pts = max(floor, current + delta)
    real_delta = new_pts - current
    if real_delta == 0:
        return
    entry = {
        "at": datetime.now(timezone.utc).isoformat(),
        "delta": real_delta,
        "reason": reason,
        "ride_id": ride_id,
    }
    await db.drivers.update_one(
        {"user_id": user_id},
        {"$set": {"points": new_pts}, "$push": {"score_log": {"$each": [entry], "$slice": -200}}},
    )
    logger.info(f"Scoring driver={user_id} {real_delta:+d} → {new_pts} ({reason})")


async def award_escalation_bonus(ride: dict):
    """Called by rides.py when a previously-escalated ride gets accepted.
    Award accept_bonus_points to the accepting driver."""
    cfg = await get_config()
    if not cfg.get("scoring_enabled"):
        return
    if ride.get("auto_dispatch_tier", 0) <= 0:
        return  # ride wasn't escalated, no bonus
    driver_user_id = ride.get("driver_id")
    if not driver_user_id:
        return
    await _adjust_driver_points(
        driver_user_id,
        cfg["accept_bonus_points"],
        f"Acceptation course escaladée (tier {ride['auto_dispatch_tier']})",
        ride["id"],
        floor=cfg["min_points_floor"],
    )


async def _penalize_non_responders(ride: dict, cfg: dict):
    """When a ride escalates past tier 1 or gets auto-cancelled, deduct points
    from drivers who received the offer but didn't accept."""
    if not cfg.get("scoring_enabled"):
        return
    offered = ride.get("offered_to_drivers") or []
    penalized = set(ride.get("penalized_drivers") or [])
    accepting_driver = ride.get("driver_id")
    for uid in offered:
        if uid in penalized or uid == accepting_driver:
            continue
        await _adjust_driver_points(
            uid,
            -cfg["no_response_penalty"],
            "Non-réponse à une offre prioritaire",
            ride["id"],
            floor=cfg["min_points_floor"],
        )
        penalized.add(uid)
    if penalized:
        await db.rides.update_one(
            {"id": ride["id"]},
            {"$set": {"penalized_drivers": list(penalized)}},
        )


async def _escalate_ride(ride, tier, allowed_palettes, radius_km, points_cfg):
    drivers = await _drivers_in_radius(
        ride["pickup_lat"], ride["pickup_lng"], radius_km, allowed_palettes, points_cfg,
        prioritize_rating=bool(ride.get("safe_ride_night")),
    )
    notified_user_ids = [d["user_id"] for d in drivers[:10]]  # cap at 10 per escalation
    payload = {
        "type": "priority_ride_offer",
        "ride_id": ride["id"],
        "booking_no": ride.get("booking_no"),
        "pickup_lat": ride["pickup_lat"],
        "pickup_lng": ride["pickup_lng"],
        "pickup_address": ride["pickup_address"],
        "dropoff_address": ride["dropoff_address"],
        "vehicle_type": ride["vehicle_type"],
        "estimated_fare": ride["estimated_fare"],
        "distance_km": ride["distance_km"],
        "tier": tier,
        "palettes": allowed_palettes,
    }
    for uid in notified_user_ids:
        await manager.send_personal_message(payload, uid)

    now = datetime.now(timezone.utc).isoformat()
    log_entry = {"tier": tier, "at": now, "drivers_notified": len(notified_user_ids), "palettes": allowed_palettes}
    # Track every driver who ever received the offer for this ride (dedup via $addToSet)
    await db.rides.update_one(
        {"id": ride["id"]},
        {
            "$set": {"auto_dispatch_tier": tier},
            "$push": {"auto_dispatch_log": log_entry},
            "$addToSet": {"offered_to_drivers": {"$each": notified_user_ids}},
        },
    )
    logger.info(
        f"AutoDispatch ride={ride['id']} tier={tier} notified={len(notified_user_ids)} palettes={allowed_palettes}"
    )
    return len(notified_user_ids)


async def _auto_cancel_ride(ride):
    now = datetime.now(timezone.utc).isoformat()
    # Penalize drivers who never responded to the priority offers
    cfg = await get_config()
    await _penalize_non_responders(ride, cfg)
    await db.rides.update_one(
        {"id": ride["id"]},
        {
            "$set": {
                "status": "cancelled",
                "cancelled_at": now,
                "cancelled_by": "auto_dispatch",
                "cancel_reason": "Aucun chauffeur disponible (auto-dispatch)",
                "auto_dispatch_tier": -1,
            }
        },
    )
    # Notify user
    await manager.send_personal_message(
        {
            "type": "ride_auto_cancelled",
            "ride_id": ride["id"],
            "reason": "Aucun chauffeur disponible dans votre zone.",
        },
        ride["user_id"],
    )
    # Notify admins
    await manager.broadcast_to_admins(
        {
            "type": "ride_auto_cancelled",
            "ride_id": ride["id"],
            "booking_no": ride.get("booking_no"),
            "reason": "auto_dispatch_failed",
        }
    )
    logger.warning(f"AutoDispatch CANCELLED ride={ride['id']} after timeout")


def _dispatch_action(age_seconds, current_tier, cfg) -> str:
    """Pure decision: what to do with a pending ride given its age + escalation tier.

    Returns one of: 'cancel' | 'escalate_2' | 'escalate_1' | 'none'.
    Mirrors the original elif-chain priority (cancel > 2nd escalation > 1st)."""
    if age_seconds >= cfg["auto_cancel_after_seconds"] and current_tier != -1:
        return "cancel"
    if age_seconds >= cfg["second_escalation_seconds"] and current_tier < 2:
        return "escalate_2"
    if age_seconds >= cfg["first_escalation_seconds"] and current_tier < 1:
        return "escalate_1"
    return "none"


async def _resolve_radius_km(ride: dict, cfg) -> float:
    """Zone-aware search radius: low-supply zones widen, dense zones tighten.

    Falls back to cfg['radius_km'] on any lookup error."""
    radius_km = cfg["radius_km"]
    try:
        from core.geo_scope import resolve_zone_from_text
        from routes.config import get_app_settings_config
        zone = resolve_zone_from_text(ride.get("pickup_address") or "")
        zr = int((await get_app_settings_config(zone)).get("radius_show_online_drivers_km", 0) or 0)
        if zr > 0:
            radius_km = zr
    except Exception:
        pass
    return radius_km


async def _activate_scheduled_ride(ride):
    """A planned ride enters live dispatch as its pickup approaches: broadcast the
    request to online drivers once (it was withheld at creation, see rides.py) and
    flag it so we don't re-broadcast on every 5s cycle."""
    await manager.broadcast_to_drivers({
        "type": "new_ride_request",
        "ride_id": ride["id"],
        "booking_no": ride.get("booking_no"),
        "pickup_lat": ride.get("pickup_lat"),
        "pickup_lng": ride.get("pickup_lng"),
        "pickup_address": ride.get("pickup_address"),
        "dropoff_address": ride.get("dropoff_address"),
        "vehicle_type": ride.get("vehicle_type"),
        "estimated_fare": ride.get("estimated_fare"),
        "proposed_fare": ride.get("proposed_fare"),
        "distance_km": ride.get("distance_km"),
        "duration_mins": ride.get("duration_mins"),
        "mode": ride.get("mode"),
        "scheduled_at": ride.get("scheduled_at"),
    })
    await db.rides.update_one(
        {"id": ride["id"]},
        {"$set": {
            "dispatch_activated": True,
            "dispatch_activated_at": datetime.now(timezone.utc).isoformat(),
        }},
    )
    ride["dispatch_activated"] = True
    logger.info(f"AutoDispatch ACTIVATED scheduled ride={ride['id']} (pickup near)")


async def _release_favorite_hold(ride):
    """The favorite head-start window expired without a favorite accepting →
    broadcast the request to all nearby drivers (was withheld at creation)."""
    await manager.broadcast_to_drivers({
        "type": "new_ride_request",
        "ride_id": ride["id"],
        "booking_no": ride.get("booking_no"),
        "pickup_lat": ride.get("pickup_lat"),
        "pickup_lng": ride.get("pickup_lng"),
        "pickup_address": ride.get("pickup_address"),
        "dropoff_address": ride.get("dropoff_address"),
        "vehicle_type": ride.get("vehicle_type"),
        "estimated_fare": ride.get("estimated_fare"),
        "proposed_fare": ride.get("proposed_fare"),
        "distance_km": ride.get("distance_km"),
        "duration_mins": ride.get("duration_mins"),
        "mode": ride.get("mode"),
        "is_bidding": ride.get("is_bidding"),
        "pool_enabled": ride.get("pool_enabled"),
        "seats_required": ride.get("seats_required"),
    })
    await db.rides.update_one({"id": ride["id"]}, {"$set": {"favorite_hold_released": True}})
    ride["favorite_hold_released"] = True
    logger.info(f"AutoDispatch released favorite head-start for ride={ride['id']}")


async def _process_pending_ride(ride: dict, now, cfg, points_cfg):
    """Inspect a single pending ride and trigger escalation / cancellation if due.

    Reference time for the escalation timeline:
      • instant ride   → created_at.
      • scheduled ride → (scheduled_at − scheduled_lead_minutes). Before that
        moment the ride waits in the planned pool / driver agenda and is left
        untouched (never escalated, never auto-cancelled)."""
    # Favorite head-start: while the exclusive window is open, the request is held
    # for the favorite driver(s) only. Release the general broadcast once it expires.
    if ride.get("favorite_hold_until") and not ride.get("favorite_hold_released"):
        try:
            hu = datetime.fromisoformat(str(ride["favorite_hold_until"]).replace("Z", "+00:00"))
            if hu.tzinfo is None:
                hu = hu.replace(tzinfo=timezone.utc)
        except Exception:
            hu = now
        if now < hu:
            return  # still exclusive to favorite(s) — don't broadcast/escalate yet
        await _release_favorite_hold(ride)

    scheduled_at_iso = ride.get("scheduled_at")
    if scheduled_at_iso:
        try:
            sched_dt = datetime.fromisoformat(str(scheduled_at_iso).replace("Z", "+00:00"))
            if sched_dt.tzinfo is None:
                sched_dt = sched_dt.replace(tzinfo=timezone.utc)
        except Exception:
            return
        lead = int(cfg.get("scheduled_lead_minutes", 15) or 15)
        due_dt = sched_dt - timedelta(minutes=lead)
        if now < due_dt:
            return  # not due yet — stays in the planned pool (driver agenda)
        ref_start = due_dt
        if not ride.get("dispatch_activated"):
            await _activate_scheduled_ride(ride)
    else:
        created_at_iso = ride.get("created_at")
        if not created_at_iso:
            return
        try:
            ref_start = datetime.fromisoformat(created_at_iso.replace("Z", "+00:00"))
        except Exception:
            return

    age_seconds = (now - ref_start).total_seconds()
    current_tier = ride.get("auto_dispatch_tier", 0)
    action = _dispatch_action(age_seconds, current_tier, cfg)
    if action == "none":
        return

    radius_km = await _resolve_radius_km(ride, cfg)

    if action == "cancel":
        await _auto_cancel_ride(ride)
    elif action == "escalate_2":
        if current_tier < 1:
            await _escalate_ride(ride, 1, cfg["first_palettes"], radius_km, points_cfg)
        fresh_ride = await db.rides.find_one({"id": ride["id"]}, {"_id": 0})
        if fresh_ride:
            await _penalize_non_responders(fresh_ride, cfg)
        await _escalate_ride(ride, 2, cfg["second_palettes"], radius_km * 2, points_cfg)
    elif action == "escalate_1":
        await _escalate_ride(ride, 1, cfg["first_palettes"], radius_km, points_cfg)


async def _run_dispatch_cycle():
    """Single pass: load config, scan pending rides, process each one."""
    cfg = await get_config()
    if not cfg.get("enabled", True):
        return
    rewards_doc = await db.service_configs.find_one({"service_key": "rewards"}, {"_id": 0})
    points_cfg = (rewards_doc or {}).get("settings", {}).get("points") or {}
    now = datetime.now(timezone.utc)
    pending_rides = await db.rides.find({"status": "pending"}, {"_id": 0}).to_list(200)
    for ride in pending_rides:
        await _process_pending_ride(ride, now, cfg, points_cfg)


async def auto_dispatch_loop():
    """Background task — runs every 5s while the server is alive."""
    logger.info("AutoDispatch loop started")
    while True:
        try:
            await _run_dispatch_cycle()
        except asyncio.CancelledError:
            logger.info("AutoDispatch loop stopped (cancelled)")
            raise
        except Exception as e:
            logger.error(f"AutoDispatch loop error: {e}")
        await asyncio.sleep(5)


# ============ ADMIN API ============
@router.get("/config")
async def get_auto_dispatch_config(request: Request):
    await require_role(request, ["admin"], permission="dispatch.view")
    return {"config": await get_config()}


class AutoDispatchConfigUpdate(BaseModel):
    enabled: bool | None = None
    first_escalation_seconds: int | None = None
    second_escalation_seconds: int | None = None
    auto_cancel_after_seconds: int | None = None
    radius_km: int | None = None
    scheduled_lead_minutes: int | None = None
    first_palettes: list[str] | None = None
    second_palettes: list[str] | None = None
    scoring_enabled: bool | None = None
    accept_bonus_points: int | None = None
    no_response_penalty: int | None = None
    min_points_floor: int | None = None
    max_refusals_before_offline: int | None = None
    refusal_window_minutes: int | None = None
    cb_cancel_flag_pct: int | None = None
    cb_cancel_flag_min: int | None = None
    favorite_head_start_seconds: int | None = None


@router.put("/config")
async def update_auto_dispatch_config(body: AutoDispatchConfigUpdate, request: Request):
    await require_role(request, ["admin"], permission="dispatch.assign")
    patch = {k: v for k, v in body.dict().items() if v is not None}
    if not patch:
        raise HTTPException(status_code=400, detail="Rien à mettre à jour")
    if "favorite_head_start_seconds" in patch:
        patch["favorite_head_start_seconds"] = max(0, min(60, int(patch["favorite_head_start_seconds"])))
    await db.service_configs.update_one(
        {"service_key": CONFIG_KEY},
        {"$set": {"service_key": CONFIG_KEY, "settings": {**(await get_config()), **patch}}},
        upsert=True,
    )
    return {"config": await get_config()}


@router.get("/stats")
async def get_auto_dispatch_stats(request: Request):
    """Live stats — number of rides per escalation tier in the last 24h."""
    await require_role(request, ["admin"], permission="dispatch.view")
    pipeline = [
        {"$match": {"auto_dispatch_tier": {"$exists": True}}},
        {"$group": {"_id": "$auto_dispatch_tier", "count": {"$sum": 1}}},
    ]
    rows = await db.rides.aggregate(pipeline).to_list(50)
    stats = {row["_id"]: row["count"] for row in rows}
    return {
        "tier_0_no_escalation": stats.get(0, 0),
        "tier_1_priority": stats.get(1, 0),
        "tier_2_all": stats.get(2, 0),
        "tier_minus_1_cancelled": stats.get(-1, 0),
    }
