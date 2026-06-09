"""
Phase 4 — Dispatch control tower (admin / dispatcher).

A real-time supervision board for operations:
  • Pending rides grouped by ZONE (escalation tier, payment method, age, fare).
  • Online drivers per zone + global.
  • "No driver in zone" alerts.
  • Driver behaviour: accept-then-cancel stats (esp. on CARD/CB rides) → flags
    drivers who cherry-pick cash and dump card rides ("au black"), with a 1-click
    suspend.

Discipline helpers (called from rides.py):
  • record_driver_refusal  → counts declines; auto-switches the driver OFFLINE
    once they cross `max_refusals_before_offline` within the rolling window.
  • record_driver_cancellation → tracks accept-then-cancel counters incl. the
    ride payment method.
"""
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Request, HTTPException

from core.config import db, logger
from core.deps import require_role
from core.websocket import manager
from routes.zones import resolve_zone
from routes.auto_dispatch import get_config as get_dispatch_config

router = APIRouter(prefix="/admin/dispatch", tags=["dispatch-admin"])

CARD_METHODS = {"card", "cb", "credit_card", "creditcard", "stripe", "carte"}


def _parse_dt(s):
    if not s:
        return None
    try:
        dt = datetime.fromisoformat(str(s).replace("Z", "+00:00"))
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except Exception:
        return None


# ============================================================
# Discipline helpers (imported lazily by rides.py)
# ============================================================
async def record_driver_refusal(driver: dict, ride_id: str) -> dict:
    """Log a ride refusal and auto-switch the driver offline once they cross the
    admin-configured threshold within the rolling window. Returns
    {count, max, went_offline}."""
    cfg = await get_dispatch_config()
    now = datetime.now(timezone.utc)
    await db.drivers.update_one(
        {"id": driver["id"]},
        {"$push": {"refusal_log": {"$each": [{"at": now.isoformat(), "ride_id": ride_id}], "$slice": -50}}},
    )
    window = int(cfg.get("refusal_window_minutes", 60) or 60)
    maxref = int(cfg.get("max_refusals_before_offline", 0) or 0)
    fresh = await db.drivers.find_one({"id": driver["id"]}, {"_id": 0, "refusal_log": 1, "user_id": 1})
    cutoff = now - timedelta(minutes=window)
    recent = [r for r in (fresh.get("refusal_log") or []) if (_parse_dt(r.get("at")) or now) >= cutoff]
    count = len(recent)
    went_offline = False
    if maxref > 0 and count >= maxref:
        await db.drivers.update_one(
            {"id": driver["id"]},
            {"$set": {"is_online": False, "auto_offline_at": now.isoformat(), "refusal_log": []}},
        )
        went_offline = True
        duid = (fresh or {}).get("user_id") or driver.get("user_id")
        try:
            from core.notifications import create_notification
            await create_notification(
                duid, "moderation", "Passage hors-ligne automatique",
                f"Vous êtes passé hors-ligne après {count} refus. Repassez en ligne quand vous êtes prêt à accepter des courses.",
                push=True, data={"kind": "auto_offline", "refusals": count},
            )
        except Exception:
            pass
        await manager.broadcast_to_admins({
            "type": "driver_auto_offline", "driver_id": driver["id"], "refusals": count,
        })
        logger.info(f"Driver {driver['id']} auto-offline after {count} refusals")
    return {"count": count, "max": maxref, "went_offline": went_offline}


async def record_driver_cancellation(driver_id: str, ride: dict):
    """Track an accept-then-cancel event with the ride payment method so the
    control tower can flag drivers who dump CARD rides."""
    pm = (ride.get("payment_method") or "").lower()
    is_cb = pm in CARD_METHODS
    inc = {"accept_release_count": 1}
    if is_cb:
        inc["accept_release_cb_count"] = 1
    await db.drivers.update_one(
        {"id": driver_id},
        {
            "$inc": inc,
            "$push": {"cancel_log": {"$each": [{
                "at": datetime.now(timezone.utc).isoformat(),
                "ride_id": ride.get("id"),
                "payment_method": pm or "unknown",
                "dropoff": ride.get("dropoff_address"),
                "fare": ride.get("estimated_fare"),
            }], "$slice": -100}},
        },
    )


# ============================================================
# Control tower — overview
# ============================================================
async def _zone_groups(zones):
    return {z.get("name"): {"zone": z.get("name"), "pending": 0, "online_drivers": 0, "rides": []}
            for z in zones if z.get("name")}


@router.get("/overview")
async def dispatch_overview(request: Request):
    await require_role(request, ["admin", "dispatcher"], permission="dispatch.view")
    cfg = await get_dispatch_config()
    now = datetime.now(timezone.utc)
    zones = await db.zones.find({"is_active": True}, {"_id": 0}).to_list(500)

    groups = await _zone_groups(zones)
    UNZONED = "Hors zone"
    groups[UNZONED] = {"zone": UNZONED, "pending": 0, "online_drivers": 0, "rides": []}

    # ---- Pending rides ----
    pending = await db.rides.find({"status": "pending"}, {"_id": 0}).sort("created_at", -1).to_list(200)
    user_ids = list({r["user_id"] for r in pending if r.get("user_id")})
    umap = {}
    if user_ids:
        async for u in db.users.find({"id": {"$in": user_ids}}, {"_id": 0, "id": 1, "name": 1, "phone": 1}):
            umap[u["id"]] = u
    lead = int(cfg.get("scheduled_lead_minutes", 15) or 15)
    no_driver_alerts = 0
    for r in pending:
        z = resolve_zone(zones, r.get("pickup_lat"), r.get("pickup_lng"), r.get("pickup_address"))
        zname = (z or {}).get("name") or UNZONED
        ref = _parse_dt(r.get("created_at")) or now
        scheduled_at = r.get("scheduled_at")
        is_scheduled = bool(scheduled_at)
        due = True
        if is_scheduled:
            sd = _parse_dt(scheduled_at)
            due = bool(sd and now >= sd - timedelta(minutes=lead))
        age = int((now - ref).total_seconds())
        item = {
            "id": r["id"], "booking_no": r.get("booking_no"),
            "pickup_address": r.get("pickup_address"), "dropoff_address": r.get("dropoff_address"),
            "vehicle_type": r.get("vehicle_type"), "payment_method": r.get("payment_method"),
            "estimated_fare": r.get("estimated_fare"), "tier": r.get("auto_dispatch_tier", 0),
            "age_seconds": age, "scheduled": is_scheduled, "scheduled_at": scheduled_at, "due": due,
            "passenger_name": (umap.get(r.get("user_id")) or {}).get("name"),
        }
        g = groups.setdefault(zname, {"zone": zname, "pending": 0, "online_drivers": 0, "rides": []})
        g["pending"] += 1
        g["rides"].append(item)

    # ---- Online drivers per zone ----
    total_online = 0
    async for d in db.drivers.find(
        {"status": "approved", "is_online": True},
        {"_id": 0, "user_id": 1, "current_lat": 1, "current_lng": 1},
    ):
        loc = manager.get_driver_location(d["user_id"]) or {}
        lat = loc.get("lat", d.get("current_lat"))
        lng = loc.get("lng", d.get("current_lng"))
        total_online += 1
        z = resolve_zone(zones, lat, lng, None)
        zname = (z or {}).get("name") or UNZONED
        g = groups.setdefault(zname, {"zone": zname, "pending": 0, "online_drivers": 0, "rides": []})
        g["online_drivers"] += 1

    # ---- Alerts: a DUE pending ride in a zone with no online driver ----
    out = []
    for g in groups.values():
        due_pending = [r for r in g["rides"] if r.get("due")]
        g["alert"] = bool(due_pending and g["online_drivers"] == 0)
        if g["alert"]:
            no_driver_alerts += 1
        if g["pending"] or g["online_drivers"]:
            out.append(g)
    # zones with alerts first, then by pending count
    out.sort(key=lambda g: (not g["alert"], -g["pending"], -g["online_drivers"]))

    return {
        "zones": out,
        "totals": {
            "pending": sum(g["pending"] for g in out),
            "online_drivers": total_online,
            "no_driver_alerts": no_driver_alerts,
        },
        "config": {
            "first_escalation_seconds": cfg.get("first_escalation_seconds"),
            "second_escalation_seconds": cfg.get("second_escalation_seconds"),
            "auto_cancel_after_seconds": cfg.get("auto_cancel_after_seconds"),
            "scheduled_lead_minutes": lead,
            "max_refusals_before_offline": cfg.get("max_refusals_before_offline"),
            "refusal_window_minutes": cfg.get("refusal_window_minutes"),
            "cb_cancel_flag_pct": cfg.get("cb_cancel_flag_pct"),
            "cb_cancel_flag_min": cfg.get("cb_cancel_flag_min"),
        },
        "server_time": now.isoformat(),
    }


# ============================================================
# Driver behaviour + 1-click suspend
# ============================================================
@router.get("/driver-behavior")
async def driver_behavior(request: Request):
    await require_role(request, ["admin", "dispatcher"], permission="dispatch.view")
    cfg = await get_dispatch_config()
    flag_pct = int(cfg.get("cb_cancel_flag_pct", 30) or 30)
    flag_min = int(cfg.get("cb_cancel_flag_min", 3) or 3)
    window = int(cfg.get("refusal_window_minutes", 60) or 60)
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(minutes=window)

    items = []
    drv_docs = await db.drivers.find(
        {}, {"_id": 0, "id": 1, "user_id": 1, "user_name": 1, "status": 1, "is_online": 1,
             "points": 1, "accept_release_count": 1, "accept_release_cb_count": 1, "refusal_log": 1},
    ).to_list(2000)
    missing = list({d["user_id"] for d in drv_docs if not d.get("user_name") and d.get("user_id")})
    namemap = {}
    if missing:
        async for u in db.users.find({"id": {"$in": missing}}, {"_id": 0, "id": 1, "name": 1}):
            namemap[u["id"]] = u.get("name")
    for d in drv_docs:
        total = int(d.get("accept_release_count") or 0)
        cb = int(d.get("accept_release_cb_count") or 0)
        cb_ratio = round(cb / total * 100, 1) if total else 0.0
        recent_refusals = len([r for r in (d.get("refusal_log") or []) if (_parse_dt(r.get("at")) or now) >= cutoff])
        flagged = total >= flag_min and cb_ratio >= flag_pct
        if total == 0 and cb == 0 and recent_refusals == 0 and d.get("status") != "suspended":
            continue  # only surface drivers with some signal (or suspended ones)
        items.append({
            "id": d["id"], "name": d.get("user_name") or namemap.get(d.get("user_id")) or "Chauffeur",
            "status": d.get("status"), "is_online": d.get("is_online", False),
            "points": d.get("points"),
            "accept_release_count": total, "accept_release_cb_count": cb,
            "cb_cancel_ratio": cb_ratio, "recent_refusals": recent_refusals,
            "flagged": flagged,
        })
    items.sort(key=lambda x: (not x["flagged"], -x["cb_cancel_ratio"], -x["accept_release_count"]))
    return {"drivers": items, "flag_pct": flag_pct, "flag_min": flag_min, "refusal_window_minutes": window}


@router.post("/drivers/{driver_id}/suspend")
async def suspend_driver(driver_id: str, request: Request):
    await require_role(request, ["admin", "dispatcher"], permission="dispatch.assign")
    d = await db.drivers.find_one({"id": driver_id}, {"_id": 0, "user_id": 1})
    if not d:
        raise HTTPException(status_code=404, detail="Chauffeur introuvable")
    await db.drivers.update_one(
        {"id": driver_id},
        {"$set": {"status": "suspended", "is_online": False, "suspended_at": datetime.now(timezone.utc).isoformat()}},
    )
    try:
        from core.notifications import create_notification
        await create_notification(
            d["user_id"], "moderation", "Compte suspendu",
            "Votre compte chauffeur a été suspendu par l'administration. Contactez le support.",
            push=True, data={"kind": "driver_suspended"},
        )
    except Exception:
        pass
    return {"ok": True, "status": "suspended"}


@router.post("/drivers/{driver_id}/reinstate")
async def reinstate_driver(driver_id: str, request: Request):
    await require_role(request, ["admin", "dispatcher"], permission="dispatch.assign")
    d = await db.drivers.find_one({"id": driver_id}, {"_id": 0, "user_id": 1})
    if not d:
        raise HTTPException(status_code=404, detail="Chauffeur introuvable")
    await db.drivers.update_one(
        {"id": driver_id},
        {"$set": {"status": "approved"}, "$unset": {"suspended_at": ""}},
    )
    try:
        from core.notifications import create_notification
        await create_notification(
            d["user_id"], "moderation", "Compte réactivé",
            "Votre compte chauffeur a été réactivé. Vous pouvez repasser en ligne.",
            push=True, data={"kind": "driver_reinstated"},
        )
    except Exception:
        pass
    return {"ok": True, "status": "approved"}
