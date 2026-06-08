"""
Transports publics — réseau de transport en commun (données SIMULÉES).

MVP "brique transport public" pour SB Drive VTC : à côté des options taxi, le
client peut consulter les arrêts proches, les lignes (bus / tram / BRT / ferry)
et les prochains passages, puis basculer en VTC ("Continuer en VTC").

⚠️ DONNÉES SIMULÉES : les horaires de passage sont calculés dynamiquement à
partir de la fréquence (headway) de chaque ligne pour rester réalistes à toute
heure. La clé Navitia/GTFS sera branchée ultérieurement — l'API publique
(`/transport/nearby`, `/transport/stops/{id}/departures`) garde la même forme,
seule la source des données changera.

Collections :
  - `transport_stops`  : {id, name, lat, lng, zone, type, is_active}
  - `transport_lines`  : {id, code, name, mode, color, headway_min, first_time,
                          last_time, stop_travel_min, stop_ids[], operator, is_active}

Les "departures" (transport_departures, conceptuellement) sont DÉRIVÉES en
temps réel des lignes — pas de table d'horaires figée à maintenir.
"""
import math
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Request, HTTPException, Depends

from core.config import db
from core.permissions import require_permission

router = APIRouter(prefix="/transport", tags=["transport"])

DEFAULT_RADIUS_KM = 2.0
MAX_NEARBY_STOPS = 10

MODE_META = {
    "bus": {"label": "Bus", "color": "#2563EB"},
    "tram": {"label": "Tram", "color": "#0891B2"},
    "brt": {"label": "BRT", "color": "#DC2626"},
    "metro": {"label": "Métro", "color": "#7C3AED"},
    "ferry": {"label": "Navette maritime", "color": "#0EA5E9"},
}


# ── helpers ──────────────────────────────────────────────────────────────────
def _haversine_km(lat1, lng1, lat2, lng2):
    R = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


def _to_min(hhmm, default=None):
    try:
        h, m = str(hhmm).split(":")
        return int(h) * 60 + int(m)
    except Exception:
        return default


def _fmt_hm(mins):
    mins = int(mins) % (24 * 60)
    return f"{mins // 60:02d}:{mins % 60:02d}"


def _now_min_utc():
    n = datetime.now(timezone.utc)
    return n.hour * 60 + n.minute


def _num(v):
    try:
        return float(v) if v not in (None, "") else None
    except Exception:
        return None


def _next_departures(line, stop_index, now_min, count=3):
    """Compute the next `count` passing times at a given stop of a line.

    A vehicle leaves the first stop at `first_time`, then every `headway_min`,
    until `last_time`. It reaches stop[i] after `i * stop_travel_min` minutes.
    """
    headway = int(line.get("headway_min") or 15)
    if headway <= 0:
        headway = 15
    travel = int(line.get("stop_travel_min") or 2)
    first = _to_min(line.get("first_time"), 300)   # 05:00
    last = _to_min(line.get("last_time"), 1380)    # 23:00
    base = first + stop_index * travel
    end = last + stop_index * travel

    out = []
    # first pass at or after now
    if now_min <= base:
        t = base
    else:
        k = math.ceil((now_min - base) / headway)
        t = base + k * headway
    while len(out) < count and t <= end:
        out.append({"time": _fmt_hm(t), "eta_min": max(0, int(t - now_min))})
        t += headway
    return out


def _stop_lines(stop_id, lines_by_id_order, now_min, per_line=3):
    """Build the list of lines serving a stop with their next departures."""
    result = []
    for line in lines_by_id_order:
        if not line.get("is_active", True):
            continue
        stops = line.get("stop_ids") or []
        if stop_id not in stops:
            continue
        idx = stops.index(stop_id)
        deps = _next_departures(line, idx, now_min, count=per_line)
        # terminus = last stop name (direction)
        result.append({
            "line_id": line.get("id"),
            "code": line.get("code"),
            "name": line.get("name"),
            "mode": line.get("mode", "bus"),
            "color": line.get("color") or MODE_META.get(line.get("mode", "bus"), {}).get("color", "#2563EB"),
            "destination": line.get("_terminus_name", ""),
            "departures": deps,
        })
    # show lines with an upcoming departure first
    result.sort(key=lambda r: (r["departures"][0]["eta_min"] if r["departures"] else 9999))
    return result


def _shape_stop(s, distance_km=None):
    out = {
        "id": s.get("id"),
        "name": s.get("name"),
        "type": s.get("type", "bus"),
        "zone": s.get("zone", ""),
        "lat": s.get("lat"),
        "lng": s.get("lng"),
        "is_active": s.get("is_active", True),
    }
    if distance_km is not None:
        out["distance_km"] = round(distance_km, 2)
        out["distance_m"] = int(distance_km * 1000)
    return out


async def _load_lines_with_terminus():
    lines = await db.transport_lines.find({}, {"_id": 0}).to_list(1000)
    # resolve terminus (last stop) names
    stop_names = {}
    ids = set()
    for l in lines:
        for sid in (l.get("stop_ids") or []):
            ids.add(sid)
    if ids:
        async for st in db.transport_stops.find({"id": {"$in": list(ids)}}, {"_id": 0, "id": 1, "name": 1}):
            stop_names[st["id"]] = st["name"]
    for l in lines:
        sids = l.get("stop_ids") or []
        l["_terminus_name"] = stop_names.get(sids[-1], "") if sids else ""
    return lines


# ── public ───────────────────────────────────────────────────────────────────
@router.get("/nearby")
async def nearby(lat: float = None, lng: float = None, mins: int = None,
                 radius_km: float = DEFAULT_RADIUS_KM):
    """Nearby public-transport stops with the next departures per line.

    If a position is given but no stop falls within `radius_km`, we fall back to
    the closest serviced zone so the experience is never empty (useful when the
    device geolocation lands far from any seeded network).
    """
    now_min = mins if mins is not None else _now_min_utc()
    stops = await db.transport_stops.find({"is_active": True}, {"_id": 0}).to_list(2000)
    lines = await _load_lines_with_terminus()

    fallback = False
    selected = []
    if lat is not None and lng is not None:
        scored = []
        for s in stops:
            slat, slng = s.get("lat"), s.get("lng")
            if slat is None or slng is None:
                continue
            d = _haversine_km(lat, lng, float(slat), float(slng))
            scored.append((d, s))
        scored.sort(key=lambda x: x[0])
        within = [(d, s) for d, s in scored if d <= float(radius_km)]
        if within:
            selected = within[:MAX_NEARBY_STOPS]
        elif scored:
            # fallback: take the nearest stop's zone
            fallback = True
            nearest_zone = scored[0][1].get("zone")
            selected = [(d, s) for d, s in scored if s.get("zone") == nearest_zone][:MAX_NEARBY_STOPS]
    else:
        # no position → return the first zone's stops (no distance)
        first_zone = stops[0].get("zone") if stops else None
        selected = [(None, s) for s in stops if s.get("zone") == first_zone][:MAX_NEARBY_STOPS]

    items = []
    for d, s in selected:
        shaped = _shape_stop(s, distance_km=d)
        shaped["lines"] = _stop_lines(s["id"], lines, now_min, per_line=3)
        items.append(shaped)

    return {"stops": items, "fallback": fallback, "now": _fmt_hm(now_min),
            "mocked": True}


@router.get("/stops/{stop_id}/departures")
async def stop_departures(stop_id: str, mins: int = None):
    """Full next-departures board for a single stop."""
    now_min = mins if mins is not None else _now_min_utc()
    s = await db.transport_stops.find_one({"id": stop_id}, {"_id": 0})
    if not s:
        raise HTTPException(404, "Arrêt introuvable")
    lines = await _load_lines_with_terminus()
    shaped = _shape_stop(s)
    shaped["lines"] = _stop_lines(stop_id, lines, now_min, per_line=5)
    shaped["now"] = _fmt_hm(now_min)
    shaped["mocked"] = True
    return shaped


# ── admin: stops CRUD ─────────────────────────────────────────────────────────
def _parse_stop(body):
    return {
        "name": (body.get("name") or "").strip(),
        "zone": (body.get("zone") or "").strip(),
        "type": (body.get("type") or "bus").strip(),
        "lat": _num(body.get("lat")),
        "lng": _num(body.get("lng")),
        "is_active": body.get("is_active", True) is not False,
    }


@router.get("/admin/stops")
async def admin_list_stops(current_user: dict = Depends(require_permission("content.manage"))):
    stops = await db.transport_stops.find({}, {"_id": 0}).sort("name", 1).to_list(2000)
    return {"stops": stops}


@router.post("/admin/stops")
async def admin_create_stop(request: Request, current_user: dict = Depends(require_permission("content.manage"))):
    data = _parse_stop(await request.json())
    if not data["name"]:
        raise HTTPException(400, "Nom de l'arrêt requis")
    data["id"] = f"tstop_{uuid.uuid4().hex[:10]}"
    data["created_at"] = datetime.now(timezone.utc).isoformat()
    await db.transport_stops.insert_one(dict(data))
    data.pop("_id", None)
    return data


@router.put("/admin/stops/{stop_id}")
async def admin_update_stop(stop_id: str, request: Request, current_user: dict = Depends(require_permission("content.manage"))):
    data = _parse_stop(await request.json())
    if not data["name"]:
        raise HTTPException(400, "Nom de l'arrêt requis")
    r = await db.transport_stops.update_one({"id": stop_id}, {"$set": data})
    if not r.matched_count:
        raise HTTPException(404, "Arrêt introuvable")
    s = await db.transport_stops.find_one({"id": stop_id}, {"_id": 0})
    return s


@router.delete("/admin/stops/{stop_id}")
async def admin_delete_stop(stop_id: str, current_user: dict = Depends(require_permission("content.manage"))):
    await db.transport_stops.delete_one({"id": stop_id})
    # detach from any line
    await db.transport_lines.update_many({}, {"$pull": {"stop_ids": stop_id}})
    return {"ok": True}


# ── admin: lines CRUD ─────────────────────────────────────────────────────────
def _parse_line(body):
    stop_ids = body.get("stop_ids") or []
    if isinstance(stop_ids, str):
        stop_ids = [s.strip() for s in stop_ids.split(",") if s.strip()]
    return {
        "code": (body.get("code") or "").strip(),
        "name": (body.get("name") or "").strip(),
        "mode": (body.get("mode") or "bus").strip(),
        "color": (body.get("color") or "").strip() or MODE_META.get((body.get("mode") or "bus"), {}).get("color", "#2563EB"),
        "operator": (body.get("operator") or "").strip(),
        "headway_min": int(body.get("headway_min") or 15),
        "first_time": (body.get("first_time") or "05:00").strip(),
        "last_time": (body.get("last_time") or "23:00").strip(),
        "stop_travel_min": int(body.get("stop_travel_min") or 2),
        "stop_ids": stop_ids,
        "is_active": body.get("is_active", True) is not False,
    }


@router.get("/admin/lines")
async def admin_list_lines(current_user: dict = Depends(require_permission("content.manage"))):
    lines = await db.transport_lines.find({}, {"_id": 0}).sort("code", 1).to_list(1000)
    return {"lines": lines}


@router.post("/admin/lines")
async def admin_create_line(request: Request, current_user: dict = Depends(require_permission("content.manage"))):
    data = _parse_line(await request.json())
    if not data["code"]:
        raise HTTPException(400, "Code de ligne requis")
    data["id"] = f"tline_{uuid.uuid4().hex[:10]}"
    data["created_at"] = datetime.now(timezone.utc).isoformat()
    await db.transport_lines.insert_one(dict(data))
    data.pop("_id", None)
    return data


@router.put("/admin/lines/{line_id}")
async def admin_update_line(line_id: str, request: Request, current_user: dict = Depends(require_permission("content.manage"))):
    data = _parse_line(await request.json())
    if not data["code"]:
        raise HTTPException(400, "Code de ligne requis")
    r = await db.transport_lines.update_one({"id": line_id}, {"$set": data})
    if not r.matched_count:
        raise HTTPException(404, "Ligne introuvable")
    l = await db.transport_lines.find_one({"id": line_id}, {"_id": 0})
    return l


@router.delete("/admin/lines/{line_id}")
async def admin_delete_line(line_id: str, current_user: dict = Depends(require_permission("content.manage"))):
    await db.transport_lines.delete_one({"id": line_id})
    return {"ok": True}


# ── seed (idempotent, MOCK data) ──────────────────────────────────────────────
async def seed_transport():
    """Seed demo public-transport networks for the 3 existing zones."""
    if await db.transport_stops.count_documents({}) > 0:
        return

    now_iso = datetime.now(timezone.utc).isoformat()

    # zone -> stops (id, name, type, lat, lng)
    networks = {
        "Pointe-à-Pitre": {
            "stops": [
                ("pap_bergevin", "Gare Routière Bergevin", "bus", 16.2380, -61.5410),
                ("pap_victoire", "Place de la Victoire", "bus", 16.2412, -61.5340),
                ("pap_chu", "CHU des Abymes", "bus", 16.2614, -61.5180),
                ("pap_univ", "Université des Antilles", "bus", 16.2230, -61.5100),
                ("pap_aeroport", "Aéroport Pôle Caraïbes", "bus", 16.2653, -61.5267),
            ],
            "lines": [
                ("Karu'lis 1", "L1", "bus", 20, "05:00", "21:00",
                 ["pap_bergevin", "pap_victoire", "pap_chu", "pap_aeroport"]),
                ("Karu'lis 2", "L2", "bus", 30, "05:30", "20:30",
                 ["pap_bergevin", "pap_victoire", "pap_univ"]),
            ],
            "operator": "Karu'lis",
        },
        "Fort-de-France": {
            "stops": [
                ("fdf_pointe_simon", "Pointe Simon", "tram", 14.6010, -61.0660),
                ("fdf_savane", "La Savane — Centre-ville", "tram", 14.6035, -61.0730),
                ("fdf_chu", "CHU P. Zobda-Quitman", "bus", 14.6090, -61.0530),
                ("fdf_dillon", "Dillon Stade", "bus", 14.6230, -61.0480),
                ("fdf_carrere", "Carrère (TCSP)", "brt", 14.6360, -61.0290),
            ],
            "lines": [
                ("TCSP Ligne A", "A", "brt", 12, "05:00", "22:00",
                 ["fdf_pointe_simon", "fdf_savane", "fdf_dillon", "fdf_carrere"]),
                ("Mozaïk 2", "M2", "bus", 25, "05:30", "20:00",
                 ["fdf_savane", "fdf_chu", "fdf_dillon"]),
            ],
            "operator": "Mozaïk / CACEM",
        },
        "Dakar": {
            "stops": [
                ("dkr_independance", "Place de l'Indépendance", "brt", 14.6680, -17.4380),
                ("dkr_petersen", "Petersen", "brt", 14.6790, -17.4430),
                ("dkr_ucad", "Université Cheikh Anta Diop", "bus", 14.6920, -17.4630),
                ("dkr_grand_yoff", "Grand Yoff", "brt", 14.7390, -17.4560),
                ("dkr_guediawaye", "Guédiawaye", "brt", 14.7720, -17.4060),
            ],
            "lines": [
                ("BRT Dakar", "BRT", "brt", 8, "05:30", "23:00",
                 ["dkr_petersen", "dkr_grand_yoff", "dkr_guediawaye"]),
                ("Dakar Dem Dikk 7", "DDD7", "bus", 18, "05:30", "22:30",
                 ["dkr_independance", "dkr_petersen", "dkr_ucad"]),
            ],
            "operator": "Dakar Dem Dikk / CETUD",
        },
    }

    for zone, net in networks.items():
        for sid, name, typ, lat, lng in net["stops"]:
            await db.transport_stops.insert_one({
                "id": sid, "name": name, "type": typ, "zone": zone,
                "lat": lat, "lng": lng, "is_active": True, "created_at": now_iso,
            })
        for name, code, mode, headway, first, last, stop_ids in net["lines"]:
            await db.transport_lines.insert_one({
                "id": f"tline_{uuid.uuid4().hex[:10]}",
                "code": code, "name": name, "mode": mode,
                "color": MODE_META.get(mode, {}).get("color", "#2563EB"),
                "operator": net["operator"], "headway_min": headway,
                "first_time": first, "last_time": last, "stop_travel_min": 2,
                "stop_ids": stop_ids, "is_active": True, "created_at": now_iso,
            })
