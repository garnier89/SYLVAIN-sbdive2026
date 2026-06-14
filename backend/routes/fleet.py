"""SB Tracking — Fleet & real-time vehicle localization (Phase 1 MVP).

Supports both a company fleet (manager + drivers) and an individual user with
their own vehicle. Live positions come from two sources:
  - Real GPS trackers POSTing to the public ingestion endpoint `POST /fleet/ping`
    (authenticated by a per-vehicle `tracker_key`).
  - The phone/browser geolocation via `POST /fleet/my-ping` (JWT).
For demos, vehicles can be flagged `sim` and their live position is derived from
the current time (a looping route), so the map "moves" without any background job.

Hardware-only actions (remote engine cut-off, locate, SOS) are delivered as
simulated stubs until real hardware is connected.
"""
import math
import time
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Request, HTTPException

from core.config import db
from core.deps import get_current_user

router = APIRouter(prefix="/fleet", tags=["fleet-tracking"])

VEHICLE_TYPES = {"car", "truck", "van", "moto", "bus", "tractor", "other"}
DEFAULT_CENTER = {"lat": 14.6036, "lng": -61.0667}  # Fort-de-France


def _now():
    return datetime.now(timezone.utc).isoformat()


def _new_tracker_key() -> str:
    return f"SBT-{uuid.uuid4().hex[:8].upper()}"


def _haversine_m(a_lat, a_lng, b_lat, b_lng) -> float:
    r = 6371000.0
    p1, p2 = math.radians(a_lat), math.radians(b_lat)
    dp = math.radians(b_lat - a_lat)
    dl = math.radians(b_lng - a_lng)
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(h))


# ----------------------------------------------------------------- fleet context
async def _get_or_create_fleet(user: dict) -> dict:
    """Each user owns exactly one fleet (auto-provisioned on first use)."""
    fleet = await db.fleets.find_one({"owner_id": user["id"]}, {"_id": 0})
    if fleet:
        return fleet
    fleet = {
        "id": f"fleet_{uuid.uuid4().hex[:12]}",
        "owner_id": user["id"],
        "name": (user.get("name") or "Ma flotte") + " — Flotte",
        "kind": "individual",
        "center": DEFAULT_CENTER,
        "created_at": _now(),
    }
    await db.fleets.insert_one(fleet)
    fleet.pop("_id", None)
    return fleet


async def _require_fleet(request: Request):
    user = await get_current_user(request)
    fleet = await _get_or_create_fleet(user)
    return user, fleet


@router.get("/context")
async def fleet_context(request: Request):
    user, fleet = await _require_fleet(request)
    vehicles = await db.fleet_vehicles.count_documents({"fleet_id": fleet["id"]})
    drivers = await db.fleet_members.count_documents({"fleet_id": fleet["id"], "role": "driver"})
    geofences = await db.fleet_geofences.count_documents({"fleet_id": fleet["id"]})
    unread = await db.fleet_alerts.count_documents({"fleet_id": fleet["id"], "read": False})
    return {
        "fleet": fleet, "role": "manager",
        "counts": {"vehicles": vehicles, "drivers": drivers, "geofences": geofences, "unread_alerts": unread},
    }


@router.put("/context")
async def update_fleet(request: Request):
    user, fleet = await _require_fleet(request)
    body = await request.json()
    upd = {}
    if body.get("name"):
        upd["name"] = str(body["name"]).strip()
    if body.get("kind") in ("company", "individual"):
        upd["kind"] = body["kind"]
    if isinstance(body.get("center"), dict):
        upd["center"] = {"lat": float(body["center"]["lat"]), "lng": float(body["center"]["lng"])}
    if upd:
        await db.fleets.update_one({"id": fleet["id"]}, {"$set": upd})
    return await db.fleets.find_one({"id": fleet["id"]}, {"_id": 0})


# ----------------------------------------------------------------- live position
def _live(v: dict) -> dict:
    """Compute the current live position + status for a vehicle."""
    sim = v.get("sim") or {}
    now = time.time()
    if sim.get("enabled"):
        c = sim.get("center") or DEFAULT_CENTER
        if sim.get("mode") == "parked":
            return {"lat": c["lat"], "lng": c["lng"], "speed": 0, "heading": 0,
                    "status": "parked", "battery": sim.get("battery", 95),
                    "ignition": False, "ts": _now(), "source": "sim"}
        period = float(sim.get("period_s", 300))
        phase = ((now + float(sim.get("offset", 0))) % period) / period * 2 * math.pi
        r = float(sim.get("radius", 0.012))
        lat = c["lat"] + r * math.sin(phase)
        lng = c["lng"] + r * math.cos(phase) * 1.5
        return {"lat": round(lat, 6), "lng": round(lng, 6),
                "speed": int(sim.get("speed_kmh", 45)),
                "heading": round((math.degrees(phase) + 90) % 360, 1),
                "status": "moving", "battery": sim.get("battery", 88),
                "ignition": True, "ts": _now(), "source": "sim"}
    last = v.get("last") or {}
    if not last.get("ts"):
        return {"lat": None, "lng": None, "speed": 0, "heading": 0,
                "status": "offline", "battery": last.get("battery"), "ts": None, "source": "device"}
    try:
        age = (datetime.now(timezone.utc) - datetime.fromisoformat(last["ts"])).total_seconds()
    except Exception:
        age = 0
    speed = float(last.get("speed", 0) or 0)
    if age > 600:
        status = "offline"
    elif last.get("ignition") is False:
        status = "parked"
    elif speed > 5:
        status = "moving"
    else:
        status = "stopped"
    return {**last, "status": status, "source": "device"}


def _vehicle_out(v: dict, driver_name=None) -> dict:
    return {
        "id": v["id"], "name": v.get("name"), "plate": v.get("plate"),
        "vtype": v.get("vtype", "car"), "driver_id": v.get("driver_id"),
        "driver_name": driver_name, "tracker_key": v.get("tracker_key"),
        "speed_limit": v.get("speed_limit", 90), "sim_enabled": bool((v.get("sim") or {}).get("enabled")),
        "live": _live(v), "created_at": v.get("created_at"),
    }


async def _driver_map(fleet_id: str) -> dict:
    drivers = await db.fleet_members.find({"fleet_id": fleet_id, "role": "driver"}, {"_id": 0}).to_list(500)
    return {d["id"]: d.get("name") for d in drivers}


# ----------------------------------------------------------------- vehicles CRUD
@router.get("/vehicles")
async def list_vehicles(request: Request):
    _user, fleet = await _require_fleet(request)
    vs = await db.fleet_vehicles.find({"fleet_id": fleet["id"]}, {"_id": 0}).sort("created_at", -1).to_list(500)
    dmap = await _driver_map(fleet["id"])
    return {"vehicles": [_vehicle_out(v, dmap.get(v.get("driver_id"))) for v in vs]}


def _make_sim(center: dict, idx: int) -> dict:
    modes = ["loop", "loop", "parked"]
    return {
        "enabled": True, "mode": modes[idx % len(modes)],
        "center": {"lat": center["lat"] + (idx * 0.004), "lng": center["lng"] + (idx * 0.004)},
        "radius": 0.010 + (idx % 3) * 0.004, "period_s": 240 + (idx % 4) * 60,
        "offset": idx * 47, "speed_kmh": 35 + (idx % 3) * 20, "battery": 90 - (idx * 7) % 40,
    }


@router.post("/vehicles")
async def create_vehicle(request: Request):
    _user, fleet = await _require_fleet(request)
    body = await request.json()
    name = (body.get("name") or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Nom du véhicule requis")
    vtype = body.get("vtype") if body.get("vtype") in VEHICLE_TYPES else "car"
    count = await db.fleet_vehicles.count_documents({"fleet_id": fleet["id"]})
    v = {
        "id": f"veh_{uuid.uuid4().hex[:12]}",
        "fleet_id": fleet["id"],
        "name": name,
        "plate": (body.get("plate") or "").strip().upper(),
        "vtype": vtype,
        "driver_id": body.get("driver_id") or None,
        "tracker_key": _new_tracker_key(),
        "speed_limit": int(body.get("speed_limit", 90) or 90),
        "sim": _make_sim(fleet.get("center") or DEFAULT_CENTER, count) if body.get("sim_enabled") else {"enabled": False},
        "last": {},
        "geo_state": {},
        "created_at": _now(),
    }
    await db.fleet_vehicles.insert_one(v)
    v.pop("_id", None)
    dmap = await _driver_map(fleet["id"])
    return _vehicle_out(v, dmap.get(v.get("driver_id")))


@router.get("/vehicles/{vid}")
async def get_vehicle(vid: str, request: Request):
    _user, fleet = await _require_fleet(request)
    v = await db.fleet_vehicles.find_one({"id": vid, "fleet_id": fleet["id"]}, {"_id": 0})
    if not v:
        raise HTTPException(status_code=404, detail="Véhicule introuvable")
    dmap = await _driver_map(fleet["id"])
    return _vehicle_out(v, dmap.get(v.get("driver_id")))


@router.put("/vehicles/{vid}")
async def update_vehicle(vid: str, request: Request):
    _user, fleet = await _require_fleet(request)
    v = await db.fleet_vehicles.find_one({"id": vid, "fleet_id": fleet["id"]}, {"_id": 0})
    if not v:
        raise HTTPException(status_code=404, detail="Véhicule introuvable")
    body = await request.json()
    upd = {}
    if body.get("name"):
        upd["name"] = str(body["name"]).strip()
    if "plate" in body:
        upd["plate"] = str(body.get("plate") or "").strip().upper()
    if body.get("vtype") in VEHICLE_TYPES:
        upd["vtype"] = body["vtype"]
    if "driver_id" in body:
        upd["driver_id"] = body.get("driver_id") or None
    if "speed_limit" in body:
        upd["speed_limit"] = int(body.get("speed_limit", 90) or 90)
    if "sim_enabled" in body:
        if body["sim_enabled"] and not (v.get("sim") or {}).get("enabled"):
            count = await db.fleet_vehicles.count_documents({"fleet_id": fleet["id"]})
            upd["sim"] = _make_sim(fleet.get("center") or DEFAULT_CENTER, count)
        elif not body["sim_enabled"]:
            upd["sim"] = {"enabled": False}
    if upd:
        await db.fleet_vehicles.update_one({"id": vid}, {"$set": upd})
    v = await db.fleet_vehicles.find_one({"id": vid}, {"_id": 0})
    dmap = await _driver_map(fleet["id"])
    return _vehicle_out(v, dmap.get(v.get("driver_id")))


@router.delete("/vehicles/{vid}")
async def delete_vehicle(vid: str, request: Request):
    _user, fleet = await _require_fleet(request)
    res = await db.fleet_vehicles.delete_one({"id": vid, "fleet_id": fleet["id"]})
    if not res.deleted_count:
        raise HTTPException(status_code=404, detail="Véhicule introuvable")
    await db.fleet_positions.delete_many({"vehicle_id": vid})
    return {"message": "Véhicule supprimé"}


@router.get("/vehicles/{vid}/history")
async def vehicle_history(vid: str, request: Request):
    _user, fleet = await _require_fleet(request)
    v = await db.fleet_vehicles.find_one({"id": vid, "fleet_id": fleet["id"]}, {"_id": 0})
    if not v:
        raise HTTPException(status_code=404, detail="Véhicule introuvable")
    sim = v.get("sim") or {}
    if sim.get("enabled") and sim.get("mode") != "parked":
        # Synthesize the last ~40 points of the looping route ending "now".
        c = sim.get("center") or DEFAULT_CENTER
        period = float(sim.get("period_s", 300))
        r = float(sim.get("radius", 0.012))
        now = time.time()
        pts = []
        for i in range(40, -1, -1):
            t = now - i * (period / 40)
            phase = ((t + float(sim.get("offset", 0))) % period) / period * 2 * math.pi
            pts.append({"lat": round(c["lat"] + r * math.sin(phase), 6),
                        "lng": round(c["lng"] + r * math.cos(phase) * 1.5, 6),
                        "speed": int(sim.get("speed_kmh", 45)),
                        "ts": datetime.fromtimestamp(t, timezone.utc).isoformat()})
        return {"points": pts, "stops": []}
    pts = await db.fleet_positions.find({"vehicle_id": vid}, {"_id": 0}).sort("ts", 1).to_list(2000)
    stops = [p for p in pts if float(p.get("speed", 0) or 0) <= 3]
    return {"points": pts, "stops": stops[-20:]}


@router.post("/vehicles/{vid}/command")
async def vehicle_command(vid: str, request: Request):
    """Hardware command stub (engine_cut / restore / locate / sos). Logs an alert."""
    _user, fleet = await _require_fleet(request)
    v = await db.fleet_vehicles.find_one({"id": vid, "fleet_id": fleet["id"]}, {"_id": 0})
    if not v:
        raise HTTPException(status_code=404, detail="Véhicule introuvable")
    body = await request.json()
    cmd = body.get("command")
    labels = {
        "engine_cut": "Coupure moteur à distance",
        "engine_restore": "Réactivation moteur",
        "locate": "Localisation demandée",
        "sos": "Mode SOS activé",
    }
    if cmd not in labels:
        raise HTTPException(status_code=400, detail="Commande inconnue")
    await _add_alert(fleet["id"], v, "command", f"{labels[cmd]} — {v.get('name')}")
    return {"message": labels[cmd], "command": cmd, "simulated": True, "live": _live(v)}


# ----------------------------------------------------------------- drivers
@router.get("/drivers")
async def list_drivers(request: Request):
    _user, fleet = await _require_fleet(request)
    drivers = await db.fleet_members.find({"fleet_id": fleet["id"], "role": "driver"}, {"_id": 0}).sort("created_at", -1).to_list(500)
    # attach assigned vehicle name
    vs = await db.fleet_vehicles.find({"fleet_id": fleet["id"]}, {"_id": 0, "id": 1, "name": 1, "driver_id": 1}).to_list(500)
    vmap = {v["driver_id"]: v["name"] for v in vs if v.get("driver_id")}
    for d in drivers:
        d["vehicle_name"] = vmap.get(d["id"])
    return {"drivers": drivers}


@router.post("/drivers")
async def add_driver(request: Request):
    _user, fleet = await _require_fleet(request)
    body = await request.json()
    name = (body.get("name") or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Nom du conducteur requis")
    d = {
        "id": f"drv_{uuid.uuid4().hex[:10]}",
        "fleet_id": fleet["id"],
        "role": "driver",
        "name": name,
        "phone": (body.get("phone") or "").strip(),
        "license_no": (body.get("license_no") or "").strip(),
        "rating": 5.0,
        "created_at": _now(),
    }
    await db.fleet_members.insert_one(d)
    d.pop("_id", None)
    return d


@router.delete("/drivers/{did}")
async def delete_driver(did: str, request: Request):
    _user, fleet = await _require_fleet(request)
    res = await db.fleet_members.delete_one({"id": did, "fleet_id": fleet["id"], "role": "driver"})
    if not res.deleted_count:
        raise HTTPException(status_code=404, detail="Conducteur introuvable")
    await db.fleet_vehicles.update_many({"fleet_id": fleet["id"], "driver_id": did}, {"$set": {"driver_id": None}})
    return {"message": "Conducteur supprimé"}


# ----------------------------------------------------------------- geofences
@router.get("/geofences")
async def list_geofences(request: Request):
    _user, fleet = await _require_fleet(request)
    gs = await db.fleet_geofences.find({"fleet_id": fleet["id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return {"geofences": gs}


@router.post("/geofences")
async def create_geofence(request: Request):
    _user, fleet = await _require_fleet(request)
    body = await request.json()
    name = (body.get("name") or "").strip()
    if not name or body.get("lat") is None or body.get("lng") is None:
        raise HTTPException(status_code=400, detail="Nom et position requis")
    alert_on = body.get("alert_on") if body.get("alert_on") in ("enter", "exit", "both") else "both"
    g = {
        "id": f"geo_{uuid.uuid4().hex[:10]}",
        "fleet_id": fleet["id"],
        "name": name,
        "lat": float(body["lat"]), "lng": float(body["lng"]),
        "radius_m": int(body.get("radius_m", 300) or 300),
        "alert_on": alert_on,
        "created_at": _now(),
    }
    await db.fleet_geofences.insert_one(g)
    g.pop("_id", None)
    return g


@router.delete("/geofences/{gid}")
async def delete_geofence(gid: str, request: Request):
    _user, fleet = await _require_fleet(request)
    res = await db.fleet_geofences.delete_one({"id": gid, "fleet_id": fleet["id"]})
    if not res.deleted_count:
        raise HTTPException(status_code=404, detail="Zone introuvable")
    return {"message": "Zone supprimée"}


# ----------------------------------------------------------------- alerts
async def _add_alert(fleet_id: str, vehicle: dict, atype: str, message: str):
    a = {
        "id": f"alert_{uuid.uuid4().hex[:12]}",
        "fleet_id": fleet_id,
        "vehicle_id": vehicle.get("id"),
        "vehicle_name": vehicle.get("name"),
        "type": atype, "message": message,
        "read": False, "ts": _now(),
    }
    await db.fleet_alerts.insert_one(a)
    return a


@router.get("/alerts")
async def list_alerts(request: Request):
    _user, fleet = await _require_fleet(request)
    alerts = await db.fleet_alerts.find({"fleet_id": fleet["id"]}, {"_id": 0}).sort("ts", -1).to_list(200)
    return {"alerts": alerts, "unread": sum(1 for a in alerts if not a.get("read"))}


@router.post("/alerts/{aid}/read")
async def read_alert(aid: str, request: Request):
    _user, fleet = await _require_fleet(request)
    await db.fleet_alerts.update_one({"id": aid, "fleet_id": fleet["id"]}, {"$set": {"read": True}})
    return {"message": "ok"}


@router.post("/alerts/read-all")
async def read_all_alerts(request: Request):
    _user, fleet = await _require_fleet(request)
    await db.fleet_alerts.update_many({"fleet_id": fleet["id"]}, {"$set": {"read": True}})
    return {"message": "ok"}


# ----------------------------------------------------------------- ingestion
async def _ingest(vehicle: dict, lat: float, lng: float, speed: float, heading: float,
                  battery=None, ignition=None):
    """Store a position ping and evaluate intelligent alerts."""
    fleet_id = vehicle["fleet_id"]
    ts = _now()
    last = {"lat": lat, "lng": lng, "speed": speed, "heading": heading, "ts": ts}
    if battery is not None:
        last["battery"] = battery
    if ignition is not None:
        last["ignition"] = ignition
    await db.fleet_positions.insert_one({
        "id": f"pos_{uuid.uuid4().hex[:12]}", "vehicle_id": vehicle["id"], "fleet_id": fleet_id,
        "lat": lat, "lng": lng, "speed": speed, "heading": heading, "ts": ts,
    })

    # Speeding
    limit = float(vehicle.get("speed_limit", 90) or 90)
    if speed > limit:
        await _add_alert(fleet_id, vehicle, "speeding", f"Excès de vitesse : {int(speed)} km/h (limite {int(limit)})")
    # Low battery
    if battery is not None and float(battery) < 20:
        await _add_alert(fleet_id, vehicle, "low_battery", f"Batterie traceur faible : {int(battery)}%")
    # Unauthorized start (ignition on with no assigned driver)
    prev_ign = (vehicle.get("last") or {}).get("ignition")
    if ignition is True and prev_ign is not True and not vehicle.get("driver_id"):
        await _add_alert(fleet_id, vehicle, "unauthorized_start", "Démarrage non autorisé (aucun conducteur attribué)")

    # Geofencing (enter/exit transitions)
    geo_state = dict(vehicle.get("geo_state") or {})
    geofences = await db.fleet_geofences.find({"fleet_id": fleet_id}, {"_id": 0}).to_list(200)
    for g in geofences:
        inside = _haversine_m(lat, lng, g["lat"], g["lng"]) <= g["radius_m"]
        was = geo_state.get(g["id"])
        if was is not None and inside != was:
            if inside and g["alert_on"] in ("enter", "both"):
                await _add_alert(fleet_id, vehicle, "geofence_enter", f"Entrée dans la zone « {g['name']} »")
            if not inside and g["alert_on"] in ("exit", "both"):
                await _add_alert(fleet_id, vehicle, "geofence_exit", f"Sortie de la zone « {g['name']} »")
        geo_state[g["id"]] = inside

    await db.fleet_vehicles.update_one({"id": vehicle["id"]}, {"$set": {"last": last, "geo_state": geo_state}})
    return last


@router.post("/ping")
async def ingest_ping(request: Request):
    """PUBLIC ingestion for real GPS trackers (authenticated by tracker_key)."""
    body = await request.json()
    key = (body.get("tracker_key") or "").strip()
    if not key:
        raise HTTPException(status_code=400, detail="tracker_key requis")
    v = await db.fleet_vehicles.find_one({"tracker_key": key}, {"_id": 0})
    if not v:
        raise HTTPException(status_code=404, detail="Traceur inconnu")
    try:
        lat = float(body["lat"]); lng = float(body["lng"])
    except Exception:
        raise HTTPException(status_code=400, detail="lat/lng requis")
    last = await _ingest(
        v, lat, lng,
        float(body.get("speed", 0) or 0), float(body.get("heading", 0) or 0),
        battery=body.get("battery"), ignition=body.get("ignition"),
    )
    return {"message": "ok", "last": last}


@router.post("/my-ping")
async def ingest_my_ping(request: Request):
    """Phone/browser geolocation ingestion (JWT). The user pushes their device
    position to one of their fleet vehicles."""
    _user, fleet = await _require_fleet(request)
    body = await request.json()
    vid = body.get("vehicle_id")
    v = await db.fleet_vehicles.find_one({"id": vid, "fleet_id": fleet["id"]}, {"_id": 0})
    if not v:
        raise HTTPException(status_code=404, detail="Véhicule introuvable")
    try:
        lat = float(body["lat"]); lng = float(body["lng"])
    except Exception:
        raise HTTPException(status_code=400, detail="lat/lng requis")
    last = await _ingest(v, lat, lng, float(body.get("speed", 0) or 0), float(body.get("heading", 0) or 0))
    return {"message": "ok", "last": last}


# ----------------------------------------------------------------- demo seed
@router.post("/seed-demo")
async def seed_demo(request: Request):
    """One-click demo: a few simulated moving vehicles + a geofence + sample alerts."""
    _user, fleet = await _require_fleet(request)
    center = fleet.get("center") or DEFAULT_CENTER
    existing = await db.fleet_vehicles.count_documents({"fleet_id": fleet["id"]})
    demo = [
        ("Camion Livraison 01", "TM-204-AB", "truck", 80),
        ("Utilitaire Express", "TM-118-CD", "van", 90),
        ("Berline Direction", "TM-552-EF", "car", 110),
    ]
    created = []
    for i, (name, plate, vtype, limit) in enumerate(demo):
        v = {
            "id": f"veh_{uuid.uuid4().hex[:12]}", "fleet_id": fleet["id"], "name": name,
            "plate": plate, "vtype": vtype, "driver_id": None, "tracker_key": _new_tracker_key(),
            "speed_limit": limit, "sim": _make_sim(center, existing + i), "last": {}, "geo_state": {},
            "created_at": _now(),
        }
        await db.fleet_vehicles.insert_one(v)
        v.pop("_id", None)
        created.append(v)
    # one geofence
    await db.fleet_geofences.insert_one({
        "id": f"geo_{uuid.uuid4().hex[:10]}", "fleet_id": fleet["id"], "name": "Dépôt central",
        "lat": center["lat"], "lng": center["lng"], "radius_m": 600, "alert_on": "both", "created_at": _now(),
    })
    # sample alerts
    if created:
        await _add_alert(fleet["id"], created[0], "speeding", "Excès de vitesse : 96 km/h (limite 80)")
        await _add_alert(fleet["id"], created[1], "geofence_exit", "Sortie de la zone « Dépôt central »")
    return {"message": "Démo créée", "vehicles": len(created)}
