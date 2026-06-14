"""SB Tracking — Module Employés (pointage GPS, présence, tournées, rapports).

Un utilisateur (employeur) possède une organisation auto-provisionnée. Il ajoute
des employés qui relient leur compte via un code d'invitation puis pointent
(clock-in / clock-out) avec la géolocalisation de leur téléphone. Pendant le
service, l'app pousse la position (`/employees/ping`) pour la présence en direct.
Des tournées (suite d'arrêts assignés) peuvent être suivies/cochées, et un
rapport agrège les heures travaillées + l'assiduité par employé.
Des employés « démo » suivent un trajet simulé dérivé du temps (sans appareil).
"""
import math
import time
import uuid
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Request, HTTPException

from core.config import db
from core.deps import get_current_user
from core.notifications import create_notification

router = APIRouter(prefix="/employees", tags=["employees-tracking"])

DEFAULT_CENTER = {"lat": 14.6036, "lng": -61.0667}  # Fort-de-France
EMP_COLORS = ["#0EA5E9", "#6366F1", "#10B981", "#F59E0B", "#EC4899", "#8B5CF6"]


def _now():
    return datetime.now(timezone.utc).isoformat()


def _today_str():
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def _haversine_m(a_lat, a_lng, b_lat, b_lng) -> float:
    r = 6371000.0
    p1, p2 = math.radians(a_lat), math.radians(b_lat)
    dp = math.radians(b_lat - a_lat)
    dl = math.radians(b_lng - a_lng)
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(h))


# ----------------------------------------------------------------- org context
async def _get_or_create_org(user: dict) -> dict:
    org = await db.employee_orgs.find_one({"owner_id": user["id"]}, {"_id": 0})
    if org:
        return org
    org = {
        "id": f"org_{uuid.uuid4().hex[:12]}",
        "owner_id": user["id"],
        "name": (user.get("name") or "Mon équipe") + " — Équipe",
        "center": DEFAULT_CENTER,
        "created_at": _now(),
    }
    await db.employee_orgs.insert_one(org)
    org.pop("_id", None)
    return org


async def _require_org(request: Request):
    user = await get_current_user(request)
    org = await _get_or_create_org(user)
    return user, org


async def _notify_owner(org_id: str, ntype: str, title: str, body: str, exclude_user_id: str = None):
    org = await db.employee_orgs.find_one({"id": org_id}, {"_id": 0, "owner_id": 1})
    owner = (org or {}).get("owner_id")
    if owner and owner != exclude_user_id:
        try:
            await create_notification(owner, ntype, title, body, {"url": "/employes", "org_id": org_id})
        except Exception:
            pass


# ----------------------------------------------------------------- live + hours
def _sim_pos(sim: dict) -> dict:
    c = sim.get("center") or DEFAULT_CENTER
    period = float(sim.get("period_s", 420))
    phase = ((time.time() + float(sim.get("offset", 0))) % period) / period * 2 * math.pi
    r = float(sim.get("radius", 0.01))
    return {"lat": round(c["lat"] + r * math.sin(phase), 6),
            "lng": round(c["lng"] + r * math.cos(phase) * 1.4, 6),
            "speed": int(sim.get("speed_kmh", 6)), "battery": sim.get("battery", 80)}


def _live(e: dict) -> dict:
    """Live position + presence status of an employee."""
    shift = e.get("shift") or {}
    sim = e.get("sim") or {}
    if sim.get("enabled"):
        p = _sim_pos(sim)
        return {**p, "status": "working", "ts": _now()}
    if shift.get("open"):
        last = shift.get("last") or {}
        if last.get("ts"):
            return {**last, "status": "working"}
        return {"lat": None, "lng": None, "speed": 0, "status": "working", "ts": shift.get("started_at")}
    return {"lat": None, "lng": None, "speed": 0, "status": "off", "ts": (shift.get("ended_at"))}


def _shift_started_at(e: dict):
    sim = e.get("sim") or {}
    if sim.get("enabled"):
        return (e.get("shift") or {}).get("started_at")
    sh = e.get("shift") or {}
    return sh.get("started_at") if sh.get("open") else None


async def _minutes_today(org_id: str, e: dict) -> int:
    """Closed shifts today + the currently open shift (or sim shift)."""
    total = 0.0
    today = _today_str()
    cursor = db.employee_shifts.find(
        {"org_id": org_id, "employee_id": e["id"]}, {"_id": 0, "started_at": 1, "duration_min": 1})
    async for s in cursor:
        if (s.get("started_at") or "")[:10] == today:
            total += float(s.get("duration_min") or 0)
    started = _shift_started_at(e)
    if started:
        try:
            dt = datetime.fromisoformat(started)
            total += max(0.0, (datetime.now(timezone.utc) - dt).total_seconds() / 60.0)
        except Exception:
            pass
    return int(round(total))


async def _employee_out(e: dict, org_id: str) -> dict:
    live = _live(e)
    return {
        "id": e["id"], "name": e.get("name"), "role": e.get("role", "Employé"),
        "color": e.get("color", "#0EA5E9"), "invite_code": e.get("invite_code"),
        "linked": bool(e.get("user_id")), "is_self": bool(e.get("is_self")),
        "live": live, "on_shift": live["status"] == "working",
        "minutes_today": await _minutes_today(org_id, e),
        "created_at": e.get("created_at"),
    }


# ----------------------------------------------------------------- context
@router.get("/context")
async def employees_context(request: Request):
    user, org = await _require_org(request)
    emps = await db.employees.find({"org_id": org["id"]}, {"_id": 0}).to_list(500)
    present = sum(1 for e in emps if _live(e)["status"] == "working")
    today = _today_str()
    routes_today = await db.employee_routes.count_documents({"org_id": org["id"], "date": today})
    pending_stops = 0
    async for r in db.employee_routes.find({"org_id": org["id"], "date": today}, {"_id": 0, "stops": 1}):
        pending_stops += sum(1 for s in (r.get("stops") or []) if not s.get("done"))
    return {
        "org": org, "role": "manager",
        "counts": {"employees": len(emps), "present": present,
                   "routes_today": routes_today, "pending_stops": pending_stops},
    }


# ----------------------------------------------------------------- employees CRUD
@router.get("")
@router.get("/")
async def list_employees(request: Request):
    _user, org = await _require_org(request)
    emps = await db.employees.find({"org_id": org["id"]}, {"_id": 0}).sort("created_at", 1).to_list(500)
    return {"employees": [await _employee_out(e, org["id"]) for e in emps]}


@router.post("")
@router.post("/")
async def add_employee(request: Request):
    user, org = await _require_org(request)
    body = await request.json()
    name = (body.get("name") or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Nom requis")
    count = await db.employees.count_documents({"org_id": org["id"]})
    is_self = bool(body.get("is_self"))
    e = {
        "id": f"emp_{uuid.uuid4().hex[:10]}",
        "org_id": org["id"],
        "name": name,
        "role": (body.get("role") or "Employé").strip(),
        "phone": (body.get("phone") or "").strip(),
        "color": EMP_COLORS[count % len(EMP_COLORS)],
        "invite_code": f"EMP{uuid.uuid4().hex[:5].upper()}",
        "user_id": user["id"] if is_self else None,
        "is_self": is_self,
        "sim": {"enabled": False},
        "shift": {}, "geo_state": {},
        "created_at": _now(),
    }
    await db.employees.insert_one(e)
    e.pop("_id", None)
    return await _employee_out(e, org["id"])


@router.delete("/{eid}")
async def delete_employee(eid: str, request: Request):
    _user, org = await _require_org(request)
    res = await db.employees.delete_one({"id": eid, "org_id": org["id"]})
    if not res.deleted_count:
        raise HTTPException(status_code=404, detail="Employé introuvable")
    await db.employee_shifts.delete_many({"employee_id": eid})
    await db.employee_routes.delete_many({"org_id": org["id"], "employee_id": eid})
    return {"message": "Employé retiré"}


# ----------------------------------------------------------------- join (employee side)
@router.post("/join")
async def join_employee(request: Request):
    user = await get_current_user(request)
    body = await request.json()
    code = (body.get("code") or "").strip().upper()
    if not code:
        raise HTTPException(status_code=400, detail="Code requis")
    e = await db.employees.find_one({"invite_code": code}, {"_id": 0})
    if not e:
        raise HTTPException(status_code=404, detail="Code invalide")
    await db.employees.update_one({"id": e["id"]}, {"$set": {"user_id": user["id"]}})
    org = await db.employee_orgs.find_one({"id": e["org_id"]}, {"_id": 0})
    return {"message": "Compte relié", "org_name": (org or {}).get("name"), "employee_name": e.get("name")}


# ----------------------------------------------------------------- pointage (clock in/out + ping)
def _self_slots_query(user_id: str) -> dict:
    return {"user_id": user_id}


@router.post("/clock-in")
async def clock_in(request: Request):
    user = await get_current_user(request)
    body = await request.json()
    loc = None
    try:
        loc = {"lat": float(body["lat"]), "lng": float(body["lng"])}
    except Exception:
        loc = None
    emps = await db.employees.find(_self_slots_query(user["id"]), {"_id": 0}).to_list(50)
    if not emps:
        raise HTTPException(status_code=400, detail="Aucun poste employé relié à votre compte")
    started = _now()
    last = {**(loc or {}), "ts": started} if loc else {"ts": started}
    for e in emps:
        if (e.get("shift") or {}).get("open"):
            continue
        await db.employees.update_one(
            {"id": e["id"]},
            {"$set": {"shift": {"open": True, "started_at": started, "start_loc": loc, "last": last}}})
        await _notify_owner(e["org_id"], "emp_clock_in", "🟢 Pointage",
                            f"{e.get('name')} a pris son service", exclude_user_id=user["id"])
    return {"message": "Service démarré", "started_at": started}


@router.post("/clock-out")
async def clock_out(request: Request):
    user = await get_current_user(request)
    body = await request.json()
    try:
        loc = {"lat": float(body["lat"]), "lng": float(body["lng"])}
    except Exception:
        loc = None
    emps = await db.employees.find(_self_slots_query(user["id"]), {"_id": 0}).to_list(50)
    ended = _now()
    closed = 0
    for e in emps:
        sh = e.get("shift") or {}
        if not sh.get("open"):
            continue
        try:
            dur = (datetime.fromisoformat(ended) - datetime.fromisoformat(sh["started_at"])).total_seconds() / 60.0
        except Exception:
            dur = 0.0
        await db.employee_shifts.insert_one({
            "id": f"shift_{uuid.uuid4().hex[:12]}", "org_id": e["org_id"], "employee_id": e["id"],
            "employee_name": e.get("name"), "started_at": sh.get("started_at"), "ended_at": ended,
            "duration_min": int(round(dur)), "start_loc": sh.get("start_loc"), "end_loc": loc,
        })
        await db.employees.update_one({"id": e["id"]}, {"$set": {"shift": {"open": False, "ended_at": ended}}})
        await _notify_owner(e["org_id"], "emp_clock_out", "🔴 Fin de service",
                            f"{e.get('name')} a terminé son service ({int(round(dur))} min)", exclude_user_id=user["id"])
        closed += 1
    return {"message": "Service terminé", "closed": closed}


@router.post("/ping")
async def emp_ping(request: Request):
    user = await get_current_user(request)
    body = await request.json()
    try:
        lat = float(body["lat"]); lng = float(body["lng"])
    except Exception:
        raise HTTPException(status_code=400, detail="lat/lng requis")
    speed = float(body.get("speed", 0) or 0)
    battery = body.get("battery")
    last = {"lat": lat, "lng": lng, "speed": speed, "ts": _now()}
    if battery is not None:
        last["battery"] = battery
    emps = await db.employees.find(_self_slots_query(user["id"]), {"_id": 0}).to_list(50)
    updated = 0
    for e in emps:
        if not (e.get("shift") or {}).get("open"):
            continue
        await db.employees.update_one({"id": e["id"]}, {"$set": {"shift.last": last}})
        updated += 1
    return {"message": "ok", "updated": updated}


@router.get("/{eid}/timesheet")
async def timesheet(eid: str, request: Request):
    _user, org = await _require_org(request)
    e = await db.employees.find_one({"id": eid, "org_id": org["id"]}, {"_id": 0})
    if not e:
        raise HTTPException(status_code=404, detail="Employé introuvable")
    shifts = await db.employee_shifts.find(
        {"org_id": org["id"], "employee_id": eid}, {"_id": 0}).sort("started_at", -1).to_list(200)
    return {"shifts": shifts, "minutes_today": await _minutes_today(org["id"], e)}


# ----------------------------------------------------------------- routes (tournées)
@router.get("/routes")
async def list_routes(request: Request):
    _user, org = await _require_org(request)
    rs = await db.employee_routes.find({"org_id": org["id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)
    emap = {e["id"]: e.get("name") for e in await db.employees.find(
        {"org_id": org["id"]}, {"_id": 0, "id": 1, "name": 1}).to_list(500)}
    for r in rs:
        r["employee_name"] = emap.get(r.get("employee_id"))
        stops = r.get("stops") or []
        r["done_count"] = sum(1 for s in stops if s.get("done"))
        r["total_count"] = len(stops)
    return {"routes": rs}


@router.post("/routes")
async def create_route(request: Request):
    _user, org = await _require_org(request)
    body = await request.json()
    name = (body.get("name") or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Nom de tournée requis")
    stops = []
    for s in (body.get("stops") or []):
        sname = (s.get("name") or "").strip()
        if not sname:
            continue
        stops.append({
            "id": f"stop_{uuid.uuid4().hex[:8]}", "name": sname,
            "address": (s.get("address") or "").strip(),
            "lat": float(s["lat"]) if s.get("lat") not in (None, "") else None,
            "lng": float(s["lng"]) if s.get("lng") not in (None, "") else None,
            "done": False, "done_at": None,
        })
    r = {
        "id": f"route_{uuid.uuid4().hex[:10]}", "org_id": org["id"], "name": name,
        "employee_id": body.get("employee_id") or None,
        "date": (body.get("date") or _today_str()),
        "stops": stops, "created_at": _now(),
    }
    await db.employee_routes.insert_one(r)
    r.pop("_id", None)
    return r


@router.post("/routes/{rid}/stops/{sid}/toggle")
async def toggle_stop(rid: str, sid: str, request: Request):
    _user, org = await _require_org(request)
    r = await db.employee_routes.find_one({"id": rid, "org_id": org["id"]}, {"_id": 0})
    if not r:
        raise HTTPException(status_code=404, detail="Tournée introuvable")
    stops = r.get("stops") or []
    found = False
    for s in stops:
        if s["id"] == sid:
            s["done"] = not s.get("done")
            s["done_at"] = _now() if s["done"] else None
            found = True
            break
    if not found:
        raise HTTPException(status_code=404, detail="Arrêt introuvable")
    await db.employee_routes.update_one({"id": rid}, {"$set": {"stops": stops}})
    if all(s.get("done") for s in stops) and stops:
        await _notify_owner(org["id"], "emp_route_done", "✅ Tournée terminée",
                            f"La tournée « {r.get('name')} » est terminée")
    return {"stops": stops}


@router.delete("/routes/{rid}")
async def delete_route(rid: str, request: Request):
    _user, org = await _require_org(request)
    res = await db.employee_routes.delete_one({"id": rid, "org_id": org["id"]})
    if not res.deleted_count:
        raise HTTPException(status_code=404, detail="Tournée introuvable")
    return {"message": "Tournée supprimée"}


# ----------------------------------------------------------------- reports
@router.get("/reports")
async def reports(request: Request):
    _user, org = await _require_org(request)
    days = 7
    today = datetime.now(timezone.utc).date()
    day_keys = [(today - timedelta(days=i)).strftime("%Y-%m-%d") for i in range(days - 1, -1, -1)]
    emps = await db.employees.find({"org_id": org["id"]}, {"_id": 0}).sort("created_at", 1).to_list(500)
    rows = []
    for e in emps:
        per_day = {d: 0.0 for d in day_keys}
        shifts_count = 0
        async for s in db.employee_shifts.find(
                {"org_id": org["id"], "employee_id": e["id"]}, {"_id": 0, "started_at": 1, "duration_min": 1}):
            d = (s.get("started_at") or "")[:10]
            if d in per_day:
                per_day[d] += float(s.get("duration_min") or 0)
                shifts_count += 1
        # currently open / sim shift counts toward today
        started = _shift_started_at(e)
        if started and started[:10] in per_day:
            try:
                per_day[started[:10]] += max(0.0, (datetime.now(timezone.utc) - datetime.fromisoformat(started)).total_seconds() / 60.0)
            except Exception:
                pass
        total = sum(per_day.values())
        rows.append({
            "employee_id": e["id"], "name": e.get("name"), "role": e.get("role"),
            "color": e.get("color"), "days": [int(round(per_day[d])) for d in day_keys],
            "total_min": int(round(total)), "shifts_count": shifts_count,
        })
    return {"day_keys": day_keys, "rows": rows}


# ----------------------------------------------------------------- demo seed
@router.post("/seed-demo")
async def seed_demo(request: Request):
    _user, org = await _require_org(request)
    center = org.get("center") or DEFAULT_CENTER
    existing = await db.employees.count_documents({"org_id": org["id"]})
    if existing >= 3:
        return {"message": "Démo déjà active", "employees": 0}
    start_today = (datetime.now(timezone.utc) - timedelta(hours=3, minutes=20)).isoformat()
    demo = [("Karim B.", "Livreur"), ("Sophie M.", "Technicienne"), ("Jean P.", "Commercial")]
    created = []
    for i, (name, role) in enumerate(demo):
        e = {
            "id": f"emp_{uuid.uuid4().hex[:10]}", "org_id": org["id"], "name": name, "role": role,
            "phone": "", "color": EMP_COLORS[(existing + i) % len(EMP_COLORS)],
            "invite_code": f"EMP{uuid.uuid4().hex[:5].upper()}", "user_id": None, "is_self": False,
            "sim": {"enabled": True, "center": {"lat": center["lat"] + i * 0.006, "lng": center["lng"] + i * 0.006},
                    "radius": 0.008 + i * 0.003, "period_s": 360 + i * 120, "offset": i * 80,
                    "speed_kmh": 5 + i * 12, "battery": 88 - i * 14},
            "shift": {"open": True, "started_at": start_today}, "geo_state": {}, "created_at": _now(),
        }
        await db.employees.insert_one(e)
        e.pop("_id", None)
        created.append(e)
    # yesterday closed shifts for the report
    y_start = (datetime.now(timezone.utc) - timedelta(days=1)).replace(hour=8, minute=0, second=0, microsecond=0)
    for i, e in enumerate(created):
        await db.employee_shifts.insert_one({
            "id": f"shift_{uuid.uuid4().hex[:12]}", "org_id": org["id"], "employee_id": e["id"],
            "employee_name": e["name"], "started_at": y_start.isoformat(),
            "ended_at": (y_start + timedelta(hours=7, minutes=30 + i * 10)).isoformat(),
            "duration_min": 450 + i * 10, "start_loc": center, "end_loc": center,
        })
    # a demo route for the first employee
    if created:
        await db.employee_routes.insert_one({
            "id": f"route_{uuid.uuid4().hex[:10]}", "org_id": org["id"], "name": "Tournée Nord — Matin",
            "employee_id": created[0]["id"], "date": _today_str(), "created_at": _now(),
            "stops": [
                {"id": f"stop_{uuid.uuid4().hex[:8]}", "name": "Client Alpha", "address": "Rue Schoelcher",
                 "lat": center["lat"] + 0.004, "lng": center["lng"] + 0.003, "done": True, "done_at": _now()},
                {"id": f"stop_{uuid.uuid4().hex[:8]}", "name": "Client Beta", "address": "Av. des Caraïbes",
                 "lat": center["lat"] + 0.008, "lng": center["lng"] + 0.006, "done": False, "done_at": None},
                {"id": f"stop_{uuid.uuid4().hex[:8]}", "name": "Dépôt", "address": "Zone Industrielle",
                 "lat": center["lat"] - 0.003, "lng": center["lng"] + 0.009, "done": False, "done_at": None},
            ],
        })
    return {"message": "Démo créée", "employees": len(created)}
