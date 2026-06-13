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
import re
from fastapi import APIRouter, Request, HTTPException

from core.config import db, logger
from core.deps import require_role
from core.websocket import manager
from routes.zones import resolve_zone
from routes.auto_dispatch import get_config as get_dispatch_config

router = APIRouter(prefix="/admin/dispatch", tags=["dispatch-admin"])

CARD_METHODS = {"card", "cb", "credit_card", "creditcard", "stripe", "carte"}
WALLET_METHODS = {"wallet", "paygo"}
NONCASH_METHODS = CARD_METHODS | WALLET_METHODS


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
    control tower can flag drivers who dump non-cash (CARD or WALLET) rides."""
    pm = (ride.get("payment_method") or "").lower()
    is_noncash = pm in NONCASH_METHODS
    inc = {"accept_release_count": 1}
    if is_noncash:
        inc["accept_release_cb_count"] = 1  # "cb" = non-cash (card or wallet)
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


# ── Risky-keyword detection in driver↔client chat ────────────────────────────
# Catch drivers pushing clients off-platform / to pay cash ("au black"): cash
# terms, cancellation intent, off-app contact, and phone numbers.
RISK_PATTERNS = {
    "espèces": [r"esp[èe]ces?", r"\bliquide\b", r"\bcash\b", r"main\s+propre", r"\bbillets?\b"],
    "annulation": [r"annul", r"je vais annuler"],
    "hors-app": [r"whats\s*app", r"hors[\s-]?app", r"en dehors", r"sans (?:passer par )?l'?app",
                 r"pay\w*\s+directement", r"directement\s+en\s+esp", r"au black",
                 r"appelle[\s-]?moi", r"mon num[ée]ro",
                 r"contacte[\s-]?moi", r"\bpaypal\b", r"\bvirement\b", r"\bzelle\b"],
}
_PHONE_RE = re.compile(r"(?:(?:\+|00)\d{1,3}[\s.\-]?)?(?:\d[\s.\-]?){8,}\d")


def scan_risky_text(text: str):
    """Return a list of risk labels found in the text (empty if clean)."""
    if not text:
        return []
    low = text.lower()
    reasons = [label for label, pats in RISK_PATTERNS.items() if any(re.search(p, low) for p in pats)]
    if _PHONE_RE.search(text):
        reasons.append("numéro de téléphone")
    return reasons


async def record_chat_flag(driver_user_id: str, ride_id: str, msg_id: str, reasons: list):
    """A DRIVER message tripped the risk filter → bump their chat-flag counter and
    alert admins in real time."""
    d = await db.drivers.find_one({"user_id": driver_user_id}, {"_id": 0, "id": 1})
    if not d:
        return
    await db.drivers.update_one(
        {"id": d["id"]},
        {
            "$inc": {"chat_flags_count": 1},
            "$push": {"chat_flag_log": {"$each": [{
                "at": datetime.now(timezone.utc).isoformat(),
                "ride_id": ride_id, "msg_id": msg_id, "reasons": reasons,
            }], "$slice": -50}},
        },
    )
    await manager.broadcast_to_admins({
        "type": "chat_risk_flag", "driver_id": d["id"], "ride_id": ride_id, "reasons": reasons,
    })
    logger.info(f"Chat risk flag driver={d['id']} ride={ride_id} reasons={reasons}")


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
            "passenger_phone": r.get("book_for_phone") or (umap.get(r.get("user_id")) or {}).get("phone"),
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

    # Anti-fraud Lot 2: count today's auto-reassignments for the "not moving" rule.
    _midnight = now.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    no_movement_today = await db.moderation_events.count_documents(
        {"type": "no_movement_release", "created_at": {"$gte": _midnight}})

    return {
        "zones": out,
        "totals": {
            "pending": sum(g["pending"] for g in out),
            "online_drivers": total_online,
            "no_driver_alerts": no_driver_alerts,
            "no_movement_today": no_movement_today,
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
# Taxi recruitment — courier-only drivers in high-demand taxi zones
# ============================================================
TAXI_RECRUITMENT_MIN_PENDING = 3  # min pending taxi rides for a zone to be "hot"
_VTC_DOC_TYPES = {"vtc_card", "carte_vtc", "carte_pro_taxi"}
_CAR_VEH = {"car", "voiture", "sedan", "berline", "suv", "van", "minivan", "luxe",
            "luxury", "comfort", "confort", "prime", "premium", "xl", "sb"}
_MOTO_VEH = {"moto", "motorcycle", "motorbike", "scooter", "moped"}


def _vtc_eligible(d: dict) -> bool:
    """Whether the driver could self-enable Taxi (has a VTC card + car/moto)."""
    has_doc = any((doc or {}).get("type") in _VTC_DOC_TYPES for doc in (d.get("documents") or []))
    vt = (d.get("vehicle_type") or "").lower()
    return has_doc and (vt in _CAR_VEH or vt in _MOTO_VEH)


@router.get("/taxi-recruitment")
async def taxi_recruitment(request: Request):
    """Zones with HIGH taxi demand and LOW taxi supply (pending taxi rides ≥ seuil
    ET courses en attente > chauffeurs taxi en ligne), plus the courier-only drivers
    located there whom the admin can activate / invite to Taxi in 1 click."""
    await require_role(request, ["admin", "dispatcher"], permission="dispatch.view")
    zones = await db.zones.find({"is_active": True}, {"_id": 0}).to_list(500)
    UNZONED = "Hors zone"

    zmap = {}

    def _z(name):
        return zmap.setdefault(name, {"zone": name, "pending": 0, "online_taxi": 0, "candidates": []})

    # Pending taxi rides per zone (rides collection = taxi).
    pending = await db.rides.find(
        {"status": "pending", "driver_id": None},
        {"_id": 0, "pickup_lat": 1, "pickup_lng": 1, "pickup_address": 1},
    ).to_list(300)
    for r in pending:
        z = resolve_zone(zones, r.get("pickup_lat"), r.get("pickup_lng"), r.get("pickup_address"))
        _z((z or {}).get("name") or UNZONED)["pending"] += 1

    # Online TAXI drivers per zone.
    async for d in db.drivers.find(
        {"status": "approved", "is_online": True, "service_types": "taxi"},
        {"_id": 0, "user_id": 1, "current_lat": 1, "current_lng": 1},
    ):
        loc = manager.get_driver_location(d["user_id"]) or {}
        lat = loc.get("lat", d.get("current_lat"))
        lng = loc.get("lng", d.get("current_lng"))
        z = resolve_zone(zones, lat, lng, None)
        _z((z or {}).get("name") or UNZONED)["online_taxi"] += 1

    # Hot zones: enough pending AND demand outstrips supply.
    hot = {n: g for n, g in zmap.items()
           if g["pending"] >= TAXI_RECRUITMENT_MIN_PENDING and g["pending"] > g["online_taxi"]}

    candidates_total = 0
    if hot:
        async for d in db.drivers.find(
            {"status": "approved", "service_types": {"$in": ["courier", "delivery"], "$nin": ["taxi"]}},
            {"_id": 0, "id": 1, "user_id": 1, "current_lat": 1, "current_lng": 1,
             "is_online": 1, "vehicle_type": 1, "documents": 1, "service_types": 1},
        ):
            loc = manager.get_driver_location(d["user_id"]) or {}
            lat = loc.get("lat", d.get("current_lat"))
            lng = loc.get("lng", d.get("current_lng"))
            z = resolve_zone(zones, lat, lng, None)
            zname = (z or {}).get("name") or UNZONED
            if zname not in hot:
                continue
            u = await db.users.find_one({"id": d["user_id"]}, {"_id": 0, "name": 1, "phone": 1}) or {}
            hot[zname]["candidates"].append({
                "driver_id": d["id"],
                "name": u.get("name") or "Chauffeur",
                "phone": u.get("phone"),
                "is_online": bool(d.get("is_online")),
                "vehicle_type": d.get("vehicle_type"),
                "services": d.get("service_types") or [],
                "vtc_eligible": _vtc_eligible(d),
            })
            candidates_total += 1

    out = []
    for n, g in hot.items():
        g["deficit"] = g["pending"] - g["online_taxi"]
        g["candidates"].sort(key=lambda c: (not c["is_online"], not c["vtc_eligible"]))
        out.append(g)
    out.sort(key=lambda g: (-g["deficit"], -g["pending"]))

    return {
        "hot_zones": out,
        "totals": {
            "hot_zones": len(out),
            "candidates": candidates_total,
            "min_pending": TAXI_RECRUITMENT_MIN_PENDING,
        },
        "server_time": datetime.now(timezone.utc).isoformat(),
    }


@router.post("/taxi-recruitment/invite")
async def taxi_recruitment_invite(request: Request):
    """Send a driver an invitation to enable the Taxi service (deep-links to their
    « Gérer mes services » screen). The driver still passes the VTC gate to confirm."""
    user = await require_role(request, ["admin", "dispatcher"], permission="dispatch.view")
    body = await request.json()
    driver_id = (body.get("driver_id") or "").strip()
    zone = (body.get("zone") or "").strip()
    d = await db.drivers.find_one({"id": driver_id}, {"_id": 0, "user_id": 1})
    if not d:
        raise HTTPException(status_code=404, detail="Driver not found")
    from core.notifications import create_notification
    await create_notification(
        d["user_id"], "promo", "Activez le service Taxi 🚕",
        f"Forte demande de courses{(' à ' + zone) if zone else ''} ! Activez le Taxi pour recevoir plus de courses et gagner davantage.",
        push=True, data={"kind": "taxi_invite", "link": "/chauffeur/profile?services=1"},
    )
    return {"message": "Invitation envoyée", "driver_id": driver_id}


@router.get("/demand-heatmap")
async def demand_heatmap(request: Request):
    """Per-commune taxi demand intensity for the dispatch control tower:
    pending now (poids fort) + volume du jour, vs offre (chauffeurs taxi en ligne)."""
    await require_role(request, ["admin", "dispatcher"], permission="dispatch.view")
    zones = await db.zones.find({"is_active": True}, {"_id": 0}).to_list(500)
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    UNZONED = "Hors zone"

    agg = {}

    def _z(name):
        return agg.setdefault(name, {"zone": name, "pending": 0, "today": 0, "online_taxi": 0})

    for r in await db.rides.find(
        {"status": "pending", "driver_id": None},
        {"_id": 0, "pickup_lat": 1, "pickup_lng": 1, "pickup_address": 1},
    ).to_list(500):
        z = resolve_zone(zones, r.get("pickup_lat"), r.get("pickup_lng"), r.get("pickup_address"))
        _z((z or {}).get("name") or UNZONED)["pending"] += 1

    for r in await db.rides.find(
        {"created_at": {"$gte": today_start}},
        {"_id": 0, "pickup_lat": 1, "pickup_lng": 1, "pickup_address": 1},
    ).to_list(5000):
        z = resolve_zone(zones, r.get("pickup_lat"), r.get("pickup_lng"), r.get("pickup_address"))
        _z((z or {}).get("name") or UNZONED)["today"] += 1

    async for d in db.drivers.find(
        {"status": "approved", "is_online": True, "service_types": "taxi"},
        {"_id": 0, "user_id": 1, "current_lat": 1, "current_lng": 1},
    ):
        loc = manager.get_driver_location(d["user_id"]) or {}
        lat = loc.get("lat", d.get("current_lat"))
        lng = loc.get("lng", d.get("current_lng"))
        z = resolve_zone(zones, lat, lng, None)
        _z((z or {}).get("name") or UNZONED)["online_taxi"] += 1

    centers = {z["name"]: (z.get("lat"), z.get("lng")) for z in zones}
    rows = [r for r in agg.values() if r["pending"] > 0 or r["today"] > 0]
    unzoned = None
    communes = []
    for r in rows:
        r["deficit"] = max(0, r["pending"] - r["online_taxi"])
        r["demand"] = r["pending"] * 3 + r["today"]
        if r["zone"] == UNZONED:
            r["lat"], r["lng"] = None, None
            unzoned = r
        else:
            c = centers.get(r["zone"]) or (None, None)
            r["lat"], r["lng"] = c[0], c[1]
            communes.append(r)
    # Intensity normalised over LOCATED communes only (Hors zone excluded so it
    # doesn't flatten the colour scale of the real communes).
    maxd = max([r["demand"] for r in communes], default=0) or 1
    for r in communes:
        r["intensity"] = round(100 * r["demand"] / maxd)
    communes.sort(key=lambda r: (-r["demand"], -r["pending"]))
    if unzoned:
        unzoned["intensity"] = 0

    # Auto-surge multiplier currently applied per commune (live demand).
    from routes.pricing import get_auto_surge_config, auto_surge_multiplier_for_demand
    asc = await get_auto_surge_config()
    for r in communes:
        r["surge_multiplier"] = auto_surge_multiplier_for_demand(r["pending"], asc) if asc.get("enabled") else 1.0

    return {
        "communes": communes,
        "unzoned": unzoned,
        "auto_surge_enabled": asc.get("enabled", False),
        "totals": {
            "pending": sum(r["pending"] for r in rows),
            "today": sum(r["today"] for r in rows),
            "communes_active": len(communes),
        },
        "server_time": now.isoformat(),
    }


@router.get("/auto-surge")
async def get_auto_surge(request: Request):
    """GLOBAL « Surge auto par commune » config."""
    await require_role(request, ["admin", "dispatcher"], permission="dispatch.view")
    from routes.pricing import get_auto_surge_config
    return await get_auto_surge_config()


@router.put("/auto-surge")
async def put_auto_surge(request: Request):
    await require_role(request, ["admin"], permission="dispatch.view")
    body = await request.json()
    tiers = []
    for t in (body.get("tiers") or []):
        try:
            tiers.append({"min_pending": int(t["min_pending"]), "multiplier": float(t["multiplier"])})
        except (KeyError, TypeError, ValueError):
            continue
    settings = {
        "enabled": bool(body.get("enabled", False)),
        "cap": float(body.get("cap") or 2.0),
        "tiers": sorted(tiers, key=lambda t: t["min_pending"]) if tiers else None,
    }
    settings = {k: v for k, v in settings.items() if v is not None}
    await db.service_configs.update_one(
        {"service_key": "auto_surge"},
        {"$set": {"service_key": "auto_surge", "settings": settings,
                  "updated_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True,
    )
    from routes.pricing import get_auto_surge_config
    return {"message": "Surge auto sauvegardé", "config": await get_auto_surge_config()}


@router.get("/nearby-offline-drivers")
async def nearby_offline_drivers(request: Request, days: int = 14):
    """Taxi drivers currently OFFLINE but who worked recently (completed a ride
    within `days`), grouped by their last-known commune — so the dispatcher can
    call them to come online when demand spikes."""
    await require_role(request, ["admin", "dispatcher"], permission="dispatch.view")
    zones = await db.zones.find({"is_active": True}, {"_id": 0}).to_list(500)
    now = datetime.now(timezone.utc)
    since = (now - timedelta(days=max(1, min(days, 90)))).isoformat()

    # driver_id -> most recent completed ride date (within window)
    last_worked = {}
    async for r in db.rides.find(
        {"status": "completed", "driver_id": {"$ne": None}, "updated_at": {"$gte": since}},
        {"_id": 0, "driver_id": 1, "updated_at": 1, "completed_at": 1, "created_at": 1},
    ):
        did = r["driver_id"]
        d = r.get("completed_at") or r.get("updated_at") or r.get("created_at")
        if d and (did not in last_worked or d > last_worked[did]):
            last_worked[did] = d

    if not last_worked:
        return {"drivers": [], "days": days, "count": 0}

    out = []
    async for d in db.drivers.find(
        {"id": {"$in": list(last_worked.keys())}, "status": "approved",
         "is_online": {"$ne": True}, "service_types": "taxi"},
        {"_id": 0, "id": 1, "user_id": 1, "current_lat": 1, "current_lng": 1, "vehicle_type": 1},
    ):
        lat, lng = d.get("current_lat"), d.get("current_lng")
        z = resolve_zone(zones, lat, lng, None)
        u = await db.users.find_one({"id": d["user_id"]}, {"_id": 0, "name": 1, "phone": 1}) or {}
        out.append({
            "driver_id": d["id"],
            "name": u.get("name") or "Chauffeur",
            "phone": u.get("phone"),
            "vehicle_type": d.get("vehicle_type"),
            "zone": (z or {}).get("name") or "Hors zone",
            "last_worked": last_worked.get(d["id"]),
            "has_location": lat is not None and lng is not None,
        })
    out.sort(key=lambda x: x["last_worked"] or "", reverse=True)
    return {"drivers": out, "days": days, "count": len(out)}



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
             "points": 1, "accept_release_count": 1, "accept_release_cb_count": 1,
             "refusal_log": 1, "chat_flags_count": 1, "scheduled_suspended_until": 1,
             "no_movement_count": 1},
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
        chat_flags = int(d.get("chat_flags_count") or 0)
        no_move = int(d.get("no_movement_count") or 0)
        sched_susp = d.get("scheduled_suspended_until")
        sched_suspended = False
        if sched_susp:
            try:
                sched_suspended = (_parse_dt(sched_susp) or now) > now
            except Exception:
                sched_suspended = False
        flagged = (total >= flag_min and cb_ratio >= flag_pct) or chat_flags > 0 or sched_suspended or no_move > 0
        if total == 0 and cb == 0 and recent_refusals == 0 and chat_flags == 0 and not sched_suspended and no_move == 0 and d.get("status") != "suspended":
            continue  # only surface drivers with some signal (or suspended ones)
        items.append({
            "id": d["id"], "name": d.get("user_name") or namemap.get(d.get("user_id")) or "Chauffeur",
            "status": d.get("status"), "is_online": d.get("is_online", False),
            "points": d.get("points"),
            "accept_release_count": total, "accept_release_cb_count": cb,
            "cb_cancel_ratio": cb_ratio, "recent_refusals": recent_refusals,
            "chat_flags": chat_flags,
            "no_movement_count": no_move,
            "scheduled_suspended": sched_suspended,
            "scheduled_suspended_until": sched_susp if sched_suspended else None,
            "flagged": flagged,
        })
    items.sort(key=lambda x: (not x["flagged"], -x["chat_flags"], -x["cb_cancel_ratio"], -x["accept_release_count"]))
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
        {"$set": {"status": "approved"}, "$unset": {"suspended_at": "", "scheduled_suspended_until": ""}},
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



# ───────────────── Anti-fraud Lot 2: "no-movement" config + live reassignments ─────────────────
@router.get("/no-movement/config")
async def get_no_movement_config(request: Request):
    """Read the 'accepted-but-not-moving' auto-reassignment settings."""
    await require_role(request, ["admin", "dispatcher"], permission="dispatch.view")
    from routes.moderation import get_moderation_config
    cfg = await get_moderation_config()
    return {
        "enabled": bool(cfg.get("no_movement_enabled", True)),
        "minutes": int(cfg.get("no_movement_minutes", 5) or 5),
        "threshold_m": int(cfg.get("no_movement_threshold_m", 150) or 150),
    }


@router.put("/no-movement/config")
async def set_no_movement_config(request: Request):
    """Update the no-movement settings (toggle / delay / GPS distance)."""
    await require_role(request, ["admin"], permission="dispatch.assign")
    body = await request.json()
    patch = {}
    if "enabled" in body:
        patch["no_movement_enabled"] = bool(body["enabled"])
    if "minutes" in body:
        patch["no_movement_minutes"] = max(1, min(60, int(body["minutes"])))
    if "threshold_m" in body:
        patch["no_movement_threshold_m"] = max(30, min(2000, int(body["threshold_m"])))
    if patch:
        from routes.moderation import _save_moderation_config
        await _save_moderation_config(patch)
    from routes.moderation import get_moderation_config
    cfg = await get_moderation_config()
    return {
        "enabled": bool(cfg.get("no_movement_enabled", True)),
        "minutes": int(cfg.get("no_movement_minutes", 5) or 5),
        "threshold_m": int(cfg.get("no_movement_threshold_m", 150) or 150),
    }


@router.get("/no-movement/reassignments")
async def list_no_movement_reassignments(request: Request, hours: int = 24):
    """List today's (last `hours`) auto-reassignments for the 'not moving' rule."""
    await require_role(request, ["admin", "dispatcher"], permission="dispatch.view")
    since = (datetime.now(timezone.utc) - timedelta(hours=max(1, min(168, hours)))).isoformat()
    events = await db.moderation_events.find(
        {"type": "no_movement_release", "created_at": {"$gte": since}},
        {"_id": 0},
    ).sort("created_at", -1).limit(200).to_list(200)
    # Enrich with driver name (best-effort).
    duids = list({e.get("user_id") for e in events if e.get("user_id")})
    namemap = {}
    if duids:
        async for u in db.users.find({"id": {"$in": duids}}, {"_id": 0, "id": 1, "name": 1}):
            namemap[u["id"]] = u.get("name")
    items = [{
        "ride_id": e.get("ride_id"),
        "driver_id": e.get("driver_id"),
        "driver_name": namemap.get(e.get("user_id")) or "Chauffeur",
        "created_at": e.get("created_at"),
    } for e in events]
    return {"count": len(items), "since": since, "items": items}
