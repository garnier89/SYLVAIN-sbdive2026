"""
Dynamic pricing (V3Cube parity): AI Dynamic Surge + Weather Surcharge.

AI Dynamic Surge: rules per Location x Vehicle Type, with demand "ranges".
A rule with status=active auto-applies (no global switch). The surge multiplier
is chosen from the range matching the current pickup-request demand in the zone.

Weather Surcharge: per Vehicle Type, a multiplier per weather condition. The
current condition at the pickup point is fetched live from OpenWeatherMap.

Both adjustments apply to the computed fare in /rides/estimate and create_ride.
"""
from fastapi import APIRouter, Request, HTTPException
from datetime import datetime, timezone
import uuid
import os
import time
import requests

from core.config import db
from core.deps import require_role, calculate_distance

router = APIRouter(prefix="/admin/pricing", tags=["pricing"])
public_router = APIRouter(prefix="/pricing", tags=["pricing-public"])

# OpenWeatherMap "main" condition groups we support
WEATHER_CONDITIONS = ["Thunderstorm", "Drizzle", "Rain", "Snow", "Clouds", "Clear", "Mist"]

# Simple in-process cache for weather lookups (rounded coords -> (ts, condition))
_weather_cache = {}
_WEATHER_TTL = 600  # 10 min


# ───────────────────────── Weather helper ─────────────────────────
def _normalize_condition(main):
    if not main:
        return "Clear"
    if main in WEATHER_CONDITIONS:
        return main
    # Atmosphere group (Mist, Smoke, Haze, Dust, Fog, Sand, Ash, Squall, Tornado) -> Mist
    return "Mist"


def get_current_condition(lat, lng):
    """Live OpenWeatherMap current condition at coords, cached 10 min."""
    if lat is None or lng is None:
        return None
    key = (round(float(lat), 2), round(float(lng), 2))
    now = time.time()
    cached = _weather_cache.get(key)
    if cached and now - cached[0] < _WEATHER_TTL:
        return cached[1]
    api_key = os.environ.get("OPENWEATHER_KEY")
    if not api_key:
        return None
    try:
        resp = requests.get(
            "https://api.openweathermap.org/data/2.5/weather",
            params={"lat": lat, "lon": lng, "appid": api_key, "units": "metric"},
            timeout=5,
        )
        data = resp.json()
        if resp.status_code == 200 and data.get("weather"):
            cond = _normalize_condition(data["weather"][0].get("main"))
            _weather_cache[key] = (now, cond)
            return cond
    except Exception:
        pass
    return None


# ───────────────────────── Surge computation ─────────────────────────
async def _surge_multiplier(lat, lng, vehicle_type):
    """Find the best active surge rule matching the zone+vehicle and return its
    multiplier based on current pickup-request demand in the zone."""
    if lat is None or lng is None:
        return 1.0, None
    rules = await db.surge_rules.find({"status": "active"}, {"_id": 0}).to_list(200)
    best_mult = 1.0
    best_label = None
    for rule in rules:
        loc = rule.get("location") or {}
        if loc.get("lat") is None:
            continue
        radius = float(loc.get("radius_km", 5))
        if calculate_distance(lat, lng, loc["lat"], loc["lng"]) > radius:
            continue
        vt = rule.get("vehicle_type", "all")
        if vt not in ("all", None, vehicle_type):
            continue
        # Demand = pending pickup requests within the zone
        pending = await db.rides.find({"status": "pending"}, {"_id": 0, "pickup_lat": 1, "pickup_lng": 1}).to_list(500)
        demand = sum(1 for r in pending if r.get("pickup_lat") and calculate_distance(loc["lat"], loc["lng"], r["pickup_lat"], r["pickup_lng"]) <= radius)
        for rng in rule.get("ranges", []):
            lo = rng.get("min_requests", 0)
            hi = rng.get("max_requests")
            if demand >= lo and (hi is None or demand <= hi):
                mult = float(rng.get("surcharge", 1.0))
                if mult > best_mult:
                    best_mult = mult
                    best_label = loc.get("name")
                break
    return best_mult, best_label


async def _weather_multiplier(lat, lng, vehicle_type):
    """Live weather condition -> configured multiplier for the vehicle type."""
    rules = await db.weather_surcharges.find({"status": "active"}, {"_id": 0}).to_list(100)
    if not rules:
        return 1.0, None
    condition = get_current_condition(lat, lng)
    if not condition:
        return 1.0, None
    mult = 1.0
    matched = None
    for rule in rules:
        vt = rule.get("vehicle_type", "all")
        if vt not in ("all", None, vehicle_type):
            continue
        conds = rule.get("conditions") or {}
        m = float(conds.get(condition, 1.0) or 1.0)
        if m > mult:
            mult = m
            matched = condition
    return mult, matched


# ── Auto commune surge (global toggle, branché sur la heatmap de demande) ──────
DEFAULT_AUTO_SURGE = {
    "enabled": False,
    "tiers": [
        {"min_pending": 3, "multiplier": 1.2},
        {"min_pending": 6, "multiplier": 1.5},
        {"min_pending": 10, "multiplier": 1.8},
    ],
    "cap": 2.0,
}


async def get_auto_surge_config():
    """Global « Surge auto par commune » config (service_configs 'auto_surge')."""
    doc = await db.service_configs.find_one({"service_key": "auto_surge"}, {"_id": 0})
    s = (doc or {}).get("settings") or {}
    cfg = {
        "enabled": bool(s.get("enabled", DEFAULT_AUTO_SURGE["enabled"])),
        "cap": float(s.get("cap", DEFAULT_AUTO_SURGE["cap"]) or DEFAULT_AUTO_SURGE["cap"]),
        "tiers": DEFAULT_AUTO_SURGE["tiers"],
    }
    tiers = s.get("tiers")
    if isinstance(tiers, list) and tiers:
        clean = []
        for t in tiers:
            try:
                clean.append({"min_pending": int(t["min_pending"]), "multiplier": float(t["multiplier"])})
            except (KeyError, TypeError, ValueError):
                continue
        if clean:
            cfg["tiers"] = sorted(clean, key=lambda t: t["min_pending"])
    return cfg


def auto_surge_multiplier_for_demand(demand: int, cfg: dict) -> float:
    """Highest tier multiplier whose min_pending ≤ demand, capped."""
    mult = 1.0
    for t in cfg.get("tiers", []):
        if demand >= t["min_pending"]:
            mult = max(mult, t["multiplier"])
    return min(mult, float(cfg.get("cap") or 2.0))


async def _auto_commune_surge(lat, lng, cfg=None):
    """Auto-surge based on the LIVE pending demand of the pickup commune."""
    if lat is None or lng is None:
        return 1.0, None
    cfg = cfg or await get_auto_surge_config()
    if not cfg.get("enabled"):
        return 1.0, None
    from routes.zones import resolve_zone
    zones = await db.zones.find({"is_active": True}, {"_id": 0}).to_list(500)
    z = resolve_zone(zones, lat, lng, None)
    zlat, zlng, r = (z or {}).get("lat"), (z or {}).get("lng"), (z or {}).get("radius_km")
    if not z or zlat is None or not r:
        return 1.0, None
    pending = await db.rides.find(
        {"status": "pending", "driver_id": None},
        {"_id": 0, "pickup_lat": 1, "pickup_lng": 1},
    ).to_list(800)
    demand = sum(1 for p in pending if p.get("pickup_lat") is not None
                 and calculate_distance(zlat, zlng, p["pickup_lat"], p["pickup_lng"]) <= float(r))
    mult = auto_surge_multiplier_for_demand(demand, cfg)
    return (mult, z.get("name")) if mult > 1.0 else (1.0, None)


async def compute_pricing_adjustment(base_fare, lat, lng, vehicle_type="all"):
    """Apply AI Dynamic Surge + Weather Surcharge. Returns {fare, surge_multiplier,
    weather_multiplier, weather_condition, reasons[]}."""
    fare = float(base_fare or 0)
    reasons = []

    surge_mult, zone = await _surge_multiplier(lat, lng, vehicle_type)
    auto_mult, auto_zone = await _auto_commune_surge(lat, lng)
    if auto_mult > surge_mult:
        surge_mult, zone = auto_mult, auto_zone
    if surge_mult > 1.0:
        fare = round(fare * surge_mult, 2)
        z = f" ({zone})" if zone else ""
        reasons.append(f"Tarif majoré x{surge_mult:g} — forte demande{z}")

    weather_mult, condition = await _weather_multiplier(lat, lng, vehicle_type)
    if weather_mult > 1.0:
        fare = round(fare * weather_mult, 2)
        labels = {"Thunderstorm": "Orage", "Rain": "Pluie", "Drizzle": "Bruine", "Snow": "Neige", "Mist": "Brouillard", "Clouds": "Nuageux", "Clear": "Dégagé"}
        reasons.append(f"Supplément météo x{weather_mult:g} ({labels.get(condition, condition)})")

    return {
        "fare": fare,
        "surge_multiplier": surge_mult,
        "weather_multiplier": weather_mult,
        "weather_condition": condition,
        "reasons": reasons,
    }


def _rule_summary(rule):
    ranges = rule.get("ranges", [])
    max_s = max([float(r.get("surcharge", 1)) for r in ranges], default=1.0)
    preview = ", ".join(
        f"{r.get('min_requests', 0)}-{r.get('max_requests', '∞')}→x{r.get('surcharge', 1)}" for r in ranges[:3]
    )
    return {**rule, "total_ranges": len(ranges), "max_surcharge": max_s, "ranges_preview": preview}


# ═══════════════════════ Surge: locations ═══════════════════════
@router.get("/surge/locations")
async def list_surge_locations(request: Request):
    await require_role(request, ["admin"], permission="server.settings.edit")
    return await db.surge_locations.find({}, {"_id": 0}).sort("name", 1).to_list(200)


@router.post("/surge/locations")
async def create_surge_location(request: Request):
    await require_role(request, ["admin"], permission="server.settings.edit")
    body = await request.json()
    if not body.get("name") or body.get("lat") is None or body.get("lng") is None:
        raise HTTPException(status_code=400, detail="name, lat, lng requis")
    doc = {
        "id": f"loc_{uuid.uuid4().hex[:10]}",
        "name": body["name"],
        "lat": float(body["lat"]),
        "lng": float(body["lng"]),
        "radius_km": float(body.get("radius_km", 5)),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.surge_locations.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.delete("/surge/locations/{loc_id}")
async def delete_surge_location(loc_id: str, request: Request):
    await require_role(request, ["admin"], permission="server.settings.edit")
    await db.surge_locations.delete_one({"id": loc_id})
    return {"deleted": True}


# ═══════════════════════ Surge: rules CRUD ═══════════════════════
@router.get("/surge")
async def list_surge_rules(request: Request):
    await require_role(request, ["admin"], permission="server.settings.edit")
    rules = await db.surge_rules.find({}, {"_id": 0}).sort("created_at", -1).to_list(300)
    return [_rule_summary(r) for r in rules]


@router.post("/surge")
async def create_surge_rule(request: Request):
    await require_role(request, ["admin"], permission="server.settings.edit")
    body = await request.json()
    loc = body.get("location") or {}
    if loc.get("lat") is None or loc.get("lng") is None:
        raise HTTPException(status_code=400, detail="Lieu (location) requis avec coordonnées")
    doc = {
        "id": f"surge_{uuid.uuid4().hex[:10]}",
        "location": {
            "name": loc.get("name", "Zone"),
            "lat": float(loc["lat"]),
            "lng": float(loc["lng"]),
            "radius_km": float(loc.get("radius_km", 5)),
        },
        "vehicle_type": body.get("vehicle_type", "all"),
        "ranges": body.get("ranges", []),
        "status": body.get("status", "active"),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.surge_rules.insert_one(doc)
    doc.pop("_id", None)
    return _rule_summary(doc)


@router.put("/surge/{rule_id}")
async def update_surge_rule(rule_id: str, request: Request):
    await require_role(request, ["admin"], permission="server.settings.edit")
    body = await request.json()
    allowed = {}
    for f in ("location", "vehicle_type", "ranges", "status"):
        if f in body:
            allowed[f] = body[f]
    if not allowed:
        raise HTTPException(status_code=400, detail="Rien à mettre à jour")
    allowed["updated_at"] = datetime.now(timezone.utc).isoformat()
    res = await db.surge_rules.update_one({"id": rule_id}, {"$set": allowed})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Règle introuvable")
    rule = await db.surge_rules.find_one({"id": rule_id}, {"_id": 0})
    return _rule_summary(rule)


@router.delete("/surge/{rule_id}")
async def delete_surge_rule(rule_id: str, request: Request):
    await require_role(request, ["admin"], permission="server.settings.edit")
    await db.surge_rules.delete_one({"id": rule_id})
    return {"deleted": True}


@router.post("/surge/{rule_id}/toggle")
async def toggle_surge_rule(rule_id: str, request: Request):
    await require_role(request, ["admin"], permission="server.settings.edit")
    rule = await db.surge_rules.find_one({"id": rule_id}, {"_id": 0})
    if not rule:
        raise HTTPException(status_code=404, detail="Règle introuvable")
    new_status = "inactive" if rule.get("status") == "active" else "active"
    await db.surge_rules.update_one({"id": rule_id}, {"$set": {"status": new_status}})
    return {"id": rule_id, "status": new_status}


# ═══════════════════════ Demand heatmap ═══════════════════════
async def _demand_points():
    pending = await db.rides.find({"status": "pending"}, {"_id": 0, "pickup_lat": 1, "pickup_lng": 1}).to_list(1000)
    return [{"lat": r["pickup_lat"], "lng": r["pickup_lng"], "weight": 1} for r in pending if r.get("pickup_lat")]


@router.get("/surge/heatmap")
async def admin_demand_heatmap(request: Request):
    await require_role(request, ["admin"], permission="server.settings.edit")
    points = await _demand_points()
    zones = await db.surge_rules.find({"status": "active"}, {"_id": 0, "location": 1}).to_list(200)
    return {"points": points, "zones": [z.get("location") for z in zones if z.get("location")]}


@public_router.get("/demand-heatmap")
async def public_demand_heatmap(request: Request):
    points = await _demand_points()
    zones = await db.surge_rules.find({"status": "active"}, {"_id": 0, "location": 1}).to_list(200)
    return {"points": points, "zones": [z.get("location") for z in zones if z.get("location")]}


# ═══════════════════════ Weather surcharge CRUD ═══════════════════════
@router.get("/weather/conditions")
async def weather_conditions(request: Request):
    await require_role(request, ["admin"], permission="server.settings.edit")
    return {"conditions": WEATHER_CONDITIONS}


@router.get("/weather/current")
async def weather_current(request: Request, lat: float, lng: float):
    await require_role(request, ["admin"], permission="server.settings.edit")
    return {"condition": get_current_condition(lat, lng)}


@router.get("/weather")
async def list_weather_surcharges(request: Request):
    await require_role(request, ["admin"], permission="server.settings.edit")
    return await db.weather_surcharges.find({}, {"_id": 0}).sort("created_at", -1).to_list(100)


@router.post("/weather")
async def create_weather_surcharge(request: Request):
    await require_role(request, ["admin"], permission="server.settings.edit")
    body = await request.json()
    doc = {
        "id": f"weather_{uuid.uuid4().hex[:10]}",
        "vehicle_type": body.get("vehicle_type", "all"),
        "conditions": body.get("conditions", {}),
        "status": body.get("status", "active"),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.weather_surcharges.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.put("/weather/{rule_id}")
async def update_weather_surcharge(rule_id: str, request: Request):
    await require_role(request, ["admin"], permission="server.settings.edit")
    body = await request.json()
    allowed = {}
    for f in ("vehicle_type", "conditions", "status"):
        if f in body:
            allowed[f] = body[f]
    if not allowed:
        raise HTTPException(status_code=400, detail="Rien à mettre à jour")
    allowed["updated_at"] = datetime.now(timezone.utc).isoformat()
    res = await db.weather_surcharges.update_one({"id": rule_id}, {"$set": allowed})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Règle introuvable")
    return await db.weather_surcharges.find_one({"id": rule_id}, {"_id": 0})


@router.delete("/weather/{rule_id}")
async def delete_weather_surcharge(rule_id: str, request: Request):
    await require_role(request, ["admin"], permission="server.settings.edit")
    await db.weather_surcharges.delete_one({"id": rule_id})
    return {"deleted": True}


@router.post("/weather/{rule_id}/toggle")
async def toggle_weather_surcharge(rule_id: str, request: Request):
    await require_role(request, ["admin"], permission="server.settings.edit")
    rule = await db.weather_surcharges.find_one({"id": rule_id}, {"_id": 0})
    if not rule:
        raise HTTPException(status_code=404, detail="Règle introuvable")
    new_status = "inactive" if rule.get("status") == "active" else "active"
    await db.weather_surcharges.update_one({"id": rule_id}, {"$set": {"status": new_status}})
    return {"id": rule_id, "status": new_status}
