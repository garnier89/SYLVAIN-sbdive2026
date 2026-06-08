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
import asyncio
import time as _time
from datetime import datetime, timezone, timedelta

import requests
from fastapi import APIRouter, Request, HTTPException, Depends

from core.config import db
from core.permissions import require_permission
from core.deps import get_current_user

router = APIRouter(prefix="/transport", tags=["transport"])

DEFAULT_RADIUS_KM = 2.0
MAX_NEARBY_STOPS = 10

MODE_META = {
    "bus": {"label": "Bus", "color": "#2563EB", "fare": 1.50},
    "tram": {"label": "Tram", "color": "#0891B2", "fare": 1.40},
    "brt": {"label": "BRT", "color": "#DC2626", "fare": 1.00},
    "metro": {"label": "Métro", "color": "#7C3AED", "fare": 1.60},
    "ferry": {"label": "Navette maritime", "color": "#0EA5E9", "fare": 2.50},
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
        last_idx = len(stops) - 1
        travel = int(line.get("stop_travel_min") or 2)
        ride_min = max(0, (last_idx - idx) * travel)  # this stop → terminus
        mode = line.get("mode", "bus")
        fare = line.get("fare")
        if fare is None:
            fare = MODE_META.get(mode, {}).get("fare", 1.50)
        # terminus = last stop name + coords (direction), for VTC comparison
        result.append({
            "line_id": line.get("id"),
            "code": line.get("code"),
            "name": line.get("name"),
            "mode": mode,
            "color": line.get("color") or MODE_META.get(mode, {}).get("color", "#2563EB"),
            "destination": line.get("_terminus_name", ""),
            "dest_lat": line.get("_terminus_lat"),
            "dest_lng": line.get("_terminus_lng"),
            "fare": round(float(fare), 2),
            "ride_min": ride_min,
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
    # resolve terminus (last stop) names + coords
    stop_meta = {}
    ids = set()
    for l in lines:
        for sid in (l.get("stop_ids") or []):
            ids.add(sid)
    if ids:
        async for st in db.transport_stops.find({"id": {"$in": list(ids)}}, {"_id": 0, "id": 1, "name": 1, "lat": 1, "lng": 1}):
            stop_meta[st["id"]] = st
    for l in lines:
        sids = l.get("stop_ids") or []
        term = stop_meta.get(sids[-1]) if sids else None
        l["_terminus_name"] = (term or {}).get("name", "")
        l["_terminus_lat"] = (term or {}).get("lat")
        l["_terminus_lng"] = (term or {}).get("lng")
    return lines


# ── GTFS (real data — Martinique, théorique) ──────────────────────────────────
GTFS_MODE_BY_TYPE = {0: "tram", 1: "metro", 2: "rail", 3: "bus", 4: "ferry",
                     5: "tram", 6: "gondola", 7: "funicular", 11: "bus", 12: "metro"}
GTFS_MODE_COLOR = {"bus": "#2563EB", "tcsp": "#DC2626", "ferry": "#0EA5E9",
                   "tram": "#0891B2", "metro": "#7C3AED", "rail": "#475569"}


def _martinique_now():
    """Current local time in Martinique (America/Martinique = UTC-4, no DST)."""
    n = datetime.now(timezone.utc) - timedelta(hours=4)
    now_sec = n.hour * 3600 + n.minute * 60 + n.second
    return now_sec, n.strftime("%Y%m%d"), n.weekday(), n.strftime("%H:%M")


async def _active_services(feed, yyyymmdd, weekday_idx):
    """GTFS service_ids running on a given date (calendar + calendar_dates)."""
    days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
    active = set()
    async for c in db.transport_calendar.find({"feed": feed}, {"_id": 0}):
        if c.get("start_date", "") <= yyyymmdd <= c.get("end_date", "") and c.get(days[weekday_idx]):
            active.add(c["service_id"])
    async for e in db.transport_calendar_dates.find({"feed": feed, "date": yyyymmdd}, {"_id": 0}):
        if e.get("exception_type") == 1:
            active.add(e["service_id"])
        elif e.get("exception_type") == 2:
            active.discard(e["service_id"])
    return active


def _gtfs_mode(feed, route):
    # TCSP (Mozaïk) = lignes A / B de la zone Centre, ou nom contenant "TCSP"
    sn = (route.get("short_name") or "").strip().upper()
    ln = (route.get("long_name") or "").upper()
    if "TCSP" in ln or (feed == "mq-centre" and sn in ("A", "B")):
        return "tcsp"
    return GTFS_MODE_BY_TYPE.get(route.get("route_type", 3), "bus")


def _gtfs_color(mode, route):
    c = (route.get("color") or "").strip()
    if c and not c.startswith("#"):
        c = "#" + c
    return c or GTFS_MODE_COLOR.get(mode, "#2563EB")


# ── GTFS-Realtime (TripUpdates) — temps réel, prêt à activer ───────────────────
# Aucun flux GTFS-RT Martinique n'est publié à ce jour : la couche reste dormante
# tant qu'aucune URL n'est configurée (admin) → on retombe sur l'horaire théorique.
_RT_CACHE = {}   # feed -> {"ts": epoch, "data": {...}}
RT_TTL_SEC = 30


def parse_gtfs_rt(content):
    """Parse a GTFS-RT FeedMessage (protobuf) into trip/stop updates + alerts.

    Returns {
      "updates": {(trip_id, stop_id): {delay,time,skipped}},
      "canceled": set(trip_id),
      "alerts": [ {cause_id, effect_id, type, header, description, routes:[...], stops:[...]} ],
    }
    GTFS-RT Alert.Cause: STRIKE=4, DEMONSTRATION=5 ; Effect: NO_SERVICE=1,
    REDUCED_SERVICE=2, SIGNIFICANT_DELAYS=3, DETOUR=4.
    """
    from google.transit import gtfs_realtime_pb2
    msg = gtfs_realtime_pb2.FeedMessage()
    msg.ParseFromString(content)
    updates, canceled, alerts = {}, set(), []

    def _txt(ts):
        try:
            return ts.translation[0].text if ts.translation else ""
        except Exception:
            return ""

    for ent in msg.entity:
        if ent.HasField("trip_update"):
            tu = ent.trip_update
            tid = tu.trip.trip_id
            if tu.trip.schedule_relationship == 3:  # CANCELED
                canceled.add(tid)
                continue
            for stu in tu.stop_time_update:
                if stu.schedule_relationship == 1:  # SKIPPED
                    updates[(tid, stu.stop_id)] = {"skipped": True}
                    continue
                ev = stu.departure if stu.HasField("departure") else (stu.arrival if stu.HasField("arrival") else None)
                delay = ev.delay if (ev is not None and ev.delay) else None
                t = ev.time if (ev is not None and ev.time) else None
                updates[(tid, stu.stop_id)] = {"delay": delay, "time": t}
        elif ent.HasField("alert"):
            al = ent.alert
            cause = int(al.cause) if al.cause else 0
            effect = int(al.effect) if al.effect else 0
            routes = sorted({ie.route_id for ie in al.informed_entity if ie.route_id})
            stops = sorted({ie.stop_id for ie in al.informed_entity if ie.stop_id})
            atype = "strike" if cause in (4, 5) else (
                "cancellation" if effect == 1 else (
                    "reduced" if effect == 2 else (
                        "delay" if effect == 3 else "info")))
            alerts.append({
                "alert_id": ent.id, "cause_id": cause, "effect_id": effect, "type": atype,
                "header": _txt(al.header_text), "description": _txt(al.description_text),
                "routes": routes, "stops": stops,
            })
    return {"updates": updates, "canceled": canceled, "alerts": alerts}


async def _realtime_for_feed(feed):
    """Fetch & cache the GTFS-RT TripUpdates for a feed, if an URL is configured."""
    meta = await db.transport_meta.find_one({"id": "gtfs_martinique"}, {"_id": 0, "realtime_urls": 1}) or {}
    url = (meta.get("realtime_urls") or {}).get(feed)
    if not url:
        return None
    c = _RT_CACHE.get(feed)
    if c and _time.time() - c["ts"] < RT_TTL_SEC:
        return c["data"]
    try:
        content = await asyncio.to_thread(lambda: requests.get(url, timeout=8).content)
        data = parse_gtfs_rt(content)
        _RT_CACHE[feed] = {"ts": _time.time(), "data": data}
        return data
    except Exception:
        return c["data"] if c else None


def _apply_rt(dep_sec, trip_id, stop_id, rt):
    """Overlay realtime on a scheduled departure.
    Returns (adjusted_dep_sec, is_realtime) or (None, _) if cancelled/skipped.
    """
    if not rt:
        return dep_sec, False
    if trip_id in rt["canceled"]:
        return None, True
    u = rt["updates"].get((trip_id, stop_id))
    if not u:
        return dep_sec, False
    if u.get("skipped"):
        return None, True
    if u.get("time"):
        loc = datetime.fromtimestamp(int(u["time"]), timezone.utc) - timedelta(hours=4)
        return loc.hour * 3600 + loc.minute * 60 + loc.second, True
    if u.get("delay") is not None:
        return dep_sec + int(u["delay"]), True
    return dep_sec, False


async def _gtfs_lines(feed, stop_id, now_sec, active, per_line=4, limit_lines=8, rt=None):
    """Next departures at a GTFS stop, grouped by line. Theoretical by default,
    overlaid with realtime (delays / cancellations) when a GTFS-RT feed exists."""
    sts = await db.transport_stop_times.find(
        {"feed": feed, "stop_id": stop_id, "dep_sec": {"$gte": now_sec}},
        {"_id": 0, "trip_id": 1, "dep_sec": 1},
    ).sort("dep_sec", 1).limit(200).to_list(200)
    if not sts:
        return []
    trip_ids = list({s["trip_id"] for s in sts})
    trips = {}
    async for t in db.transport_trips.find(
            {"feed": feed, "trip_id": {"$in": trip_ids}},
            {"_id": 0, "trip_id": 1, "route_id": 1, "service_id": 1, "headsign": 1}):
        trips[t["trip_id"]] = t
    route_ids = list({t["route_id"] for t in trips.values()})
    routes = {}
    async for r in db.transport_routes.find({"feed": feed, "route_id": {"$in": route_ids}}, {"_id": 0}):
        routes[r["route_id"]] = r

    grouped, order = {}, []
    for s in sts:
        t = trips.get(s["trip_id"])
        if not t or t["service_id"] not in active:
            continue
        r = routes.get(t["route_id"])
        if not r:
            continue
        adj_sec, is_rt = _apply_rt(s["dep_sec"], s["trip_id"], stop_id, rt)
        if adj_sec is None:
            continue  # cancelled / skipped
        dest = (t.get("headsign") or r.get("long_name") or "").strip()
        key = (t["route_id"], dest)
        if key not in grouped:
            mode = _gtfs_mode(feed, r)
            grouped[key] = {
                "line_id": f"{feed}:{t['route_id']}:{len(order)}",
                "code": (r.get("short_name") or r.get("route_id") or "").strip(),
                "name": (r.get("long_name") or r.get("short_name") or "").strip(),
                "mode": mode, "color": _gtfs_color(mode, r), "destination": dest,
                "departures": [], "realtime": False,
                "fare": None, "ride_min": 0, "dest_lat": None, "dest_lng": None,
            }
            order.append(key)
        if len(grouped[key]["departures"]) < per_line:
            grouped[key]["departures"].append({
                "time": _fmt_hm(adj_sec // 60),
                "eta_min": max(0, (adj_sec - now_sec) // 60),
                "realtime": is_rt,
            })
            if is_rt:
                grouped[key]["realtime"] = True
    lines = [grouped[k] for k in order]
    lines.sort(key=lambda L: L["departures"][0]["eta_min"] if L["departures"] else 9999)
    return lines[:limit_lines]


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
    g_now_sec, g_date, g_wd, g_hhmm = _martinique_now()
    if mins is not None:
        g_now_sec = mins * 60  # allow client override for testing
    stops = await db.transport_stops.find({"is_active": True}, {"_id": 0}).to_list(5000)
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
    active_cache = {}
    rt_cache = {}
    for d, s in selected:
        shaped = _shape_stop(s, distance_km=d)
        shaped["realtime"] = False  # par défaut : horaire théorique (temps réel indispo)
        if s.get("source") == "gtfs":
            feed = s["feed"]
            if feed not in active_cache:
                active_cache[feed] = await _active_services(feed, g_date, g_wd)
            if feed not in rt_cache:
                rt_cache[feed] = await _realtime_for_feed(feed)
            shaped["source"] = "gtfs"
            shaped["lines"] = await _gtfs_lines(feed, s["stop_id"], g_now_sec, active_cache[feed], rt=rt_cache[feed])
            shaped["realtime"] = any(L.get("realtime") for L in shaped["lines"])
        else:
            shaped["source"] = "mock"
            shaped["lines"] = _stop_lines(s["id"], lines, now_min, per_line=3)
        items.append(shaped)

    has_gtfs = any(it["source"] == "gtfs" for it in items)
    any_realtime = any(it.get("realtime") for it in items)
    return {"stops": items, "fallback": fallback,
            "now": g_hhmm if has_gtfs else _fmt_hm(now_min),
            "realtime": any_realtime, "theoretical": True, "mocked": True}


@router.get("/stops/{stop_id}/departures")
async def stop_departures(stop_id: str, mins: int = None):
    """Full next-departures board for a single stop (theoretical + realtime overlay)."""
    s = await db.transport_stops.find_one({"id": stop_id}, {"_id": 0})
    if not s:
        raise HTTPException(404, "Arrêt introuvable")
    shaped = _shape_stop(s)
    shaped["realtime"] = False
    if s.get("source") == "gtfs":
        g_now_sec, g_date, g_wd, g_hhmm = _martinique_now()
        if mins is not None:
            g_now_sec = mins * 60
        active = await _active_services(s["feed"], g_date, g_wd)
        rt = await _realtime_for_feed(s["feed"])
        shaped["source"] = "gtfs"
        shaped["lines"] = await _gtfs_lines(s["feed"], s["stop_id"], g_now_sec, active, per_line=6, rt=rt)
        shaped["realtime"] = any(L.get("realtime") for L in shaped["lines"])
        shaped["now"] = g_hhmm
    else:
        now_min = mins if mins is not None else _now_min_utc()
        lines = await _load_lines_with_terminus()
        shaped["source"] = "mock"
        shaped["lines"] = _stop_lines(stop_id, lines, now_min, per_line=5)
        shaped["now"] = _fmt_hm(now_min)
    shaped["mocked"] = True
    return shaped


# ── disruptions & strikes (perturbations / grèves) ────────────────────────────
DISRUPTION_TYPES = {"strike", "cancellation", "delay", "reduced", "detour", "info"}


def _disruption_active(d, now_iso):
    if not d.get("active", True):
        return False
    s, e = d.get("starts_at"), d.get("ends_at")
    if s and now_iso < s:
        return False
    if e and now_iso > e:
        return False
    return True


async def _live_alerts():
    """GTFS-RT service alerts from active feeds (incl. strikes), persisted to history.
    Returns [] when no realtime feed is configured (dormant)."""
    meta = await db.transport_meta.find_one({"id": "gtfs_martinique"}, {"_id": 0, "realtime_urls": 1}) or {}
    out = []
    now_iso = datetime.now(timezone.utc).isoformat()
    for feed, url in (meta.get("realtime_urls") or {}).items():
        if not url:
            continue
        rt = await _realtime_for_feed(feed)
        if not rt:
            continue
        for a in rt.get("alerts", []):
            did = f"rt:{feed}:{a.get('alert_id')}"
            doc = {"id": did, "source": "gtfs-rt", "feed": feed, "type": a["type"],
                   "title": a.get("header") or a["type"].title(),
                   "message": a.get("description") or "", "routes": a.get("routes", []),
                   "severity": "high" if a["type"] in ("strike", "cancellation") else "medium",
                   "active": True, "starts_at": None, "ends_at": None, "updated_at": now_iso}
            await db.transport_disruptions.update_one(
                {"id": did}, {"$set": doc, "$setOnInsert": {"created_at": now_iso}}, upsert=True)
            out.append(doc)
    return out


async def _active_disruptions():
    now_iso = datetime.now(timezone.utc).isoformat()
    manual = await db.transport_disruptions.find({"source": "manual"}, {"_id": 0}).to_list(200)
    active = [d for d in manual if _disruption_active(d, now_iso)]
    active = (await _live_alerts()) + active
    active.sort(key=lambda d: 0 if d.get("type") == "strike" else 1)
    return active


@router.get("/disruptions")
async def disruptions():
    """Active disruptions (manual + live GTFS-RT alerts), strikes first."""
    active = await _active_disruptions()
    return {"disruptions": active, "count": len(active),
            "has_strike": any(d.get("type") == "strike" for d in active),
            "mocked": True}


@router.get("/disruptions/history")
async def disruptions_history():
    """Recent disruptions (resolved + active), most recent first."""
    items = await db.transport_disruptions.find({}, {"_id": 0}).sort("created_at", -1).to_list(50)
    return {"items": items}


# ── journey planner (origin → destination, with transfers) ────────────────────
WALK_KMH = 4.8
WALK_RADIUS_KM = 1.2


def _walk_min(km):
    return int(round(km / WALK_KMH * 60))


def plan_journey(stops, lines, flat, flng, tlat, tlng):
    """Plan the fastest bus itinerary (with transfers) between two points.

    Time-optimal Dijkstra over stop "platforms". Each line contributes direct
    ride edges stop_i → stop_j (j>i) costing an expected wait (headway/2) plus
    travel time; transferring is simply alighting at a platform and boarding
    another line there. Walking connects the origin/destination to the access
    stops. Falls back to the single nearest stop when none is within walk range
    so a plan is always produced (useful for the demo / mocked data).
    """
    import heapq

    stop_by_id = {s["id"]: s for s in stops
                  if s.get("lat") is not None and s.get("lng") is not None
                  and s.get("is_active", True) and s.get("source") != "gtfs"}
    if not stop_by_id:
        return {"found": False}

    def near(plat, plng):
        scored = sorted(
            ((_haversine_km(plat, plng, s["lat"], s["lng"]), s) for s in stop_by_id.values()),
            key=lambda x: x[0],
        )
        within = [(d, s) for d, s in scored if d <= WALK_RADIUS_KM]
        return within if within else scored[:1]

    origin_access = near(flat, flng)
    dest_egress = {s["id"]: d for d, s in near(tlat, tlng)}

    # ride edges: stop_id -> [(to_stop_id, cost_min, fare, leg)]
    adj = {sid: [] for sid in stop_by_id}
    for L in lines:
        if not L.get("is_active", True):
            continue
        order = [x for x in (L.get("stop_ids") or []) if x in stop_by_id]
        travel = int(L.get("stop_travel_min") or 5)
        headway = int(L.get("headway_min") or 15)
        wait = max(1, math.ceil(headway / 2))
        fare = L.get("fare")
        if fare is None:
            fare = MODE_META.get(L.get("mode", "bus"), {}).get("fare", 1.50)
        fare = round(float(fare), 2)
        for i in range(len(order)):
            for j in range(i + 1, len(order)):
                si, sj = order[i], order[j]
                cost = wait + (j - i) * travel
                fwd_via = [{"name": stop_by_id[k]["name"], "lat": stop_by_id[k]["lat"], "lng": stop_by_id[k]["lng"]}
                           for k in order[i:j + 1]]
                # lines run in BOTH directions → add forward and reverse edges
                fwd = {
                    "type": "ride", "line_id": L.get("id"), "code": L.get("code"),
                    "name": L.get("name"), "mode": L.get("mode", "bus"), "color": L.get("color"),
                    "from": stop_by_id[si]["name"], "to": stop_by_id[sj]["name"],
                    "from_lat": stop_by_id[si]["lat"], "from_lng": stop_by_id[si]["lng"],
                    "to_lat": stop_by_id[sj]["lat"], "to_lng": stop_by_id[sj]["lng"],
                    "via": fwd_via,
                    "stops": j - i, "minutes": (j - i) * travel, "wait_min": wait, "fare": fare,
                }
                rev = {**fwd, "from": stop_by_id[sj]["name"], "to": stop_by_id[si]["name"],
                       "from_lat": stop_by_id[sj]["lat"], "from_lng": stop_by_id[sj]["lng"],
                       "to_lat": stop_by_id[si]["lat"], "to_lng": stop_by_id[si]["lng"],
                       "via": list(reversed(fwd_via))}
                adj[si].append((sj, cost, fare, fwd))
                adj[sj].append((si, cost, fare, rev))

    heap = []
    cnt = 0
    for d, s in origin_access:
        wm = _walk_min(d)
        legs = [{"type": "walk", "to": s["name"], "minutes": wm, "km": round(d, 2),
                 "from_lat": flat, "from_lng": flng, "to_lat": s["lat"], "to_lng": s["lng"]}] if wm > 0 else []
        heapq.heappush(heap, (wm, cnt, s["id"], 0.0, legs)); cnt += 1

    best = None
    visited = {}
    while heap:
        time, _, sid, fare, legs = heapq.heappop(heap)
        if sid in visited and visited[sid] <= time:
            continue
        visited[sid] = time
        if sid in dest_egress:
            wm = _walk_min(dest_egress[sid])
            total = time + wm
            es = stop_by_id[sid]
            final_legs = legs + ([{"type": "walk", "to": "Destination", "minutes": wm, "km": round(dest_egress[sid], 2),
                                   "from_lat": es["lat"], "from_lng": es["lng"], "to_lat": tlat, "to_lng": tlng}] if wm > 0 else [])
            rides = [l for l in final_legs if l["type"] == "ride"]
            if rides and (best is None or total < best["total_min"]):
                best = {"found": True, "total_min": int(total), "total_fare": round(fare, 2),
                        "transfers": max(0, len(rides) - 1), "legs": final_legs,
                        "origin": {"lat": flat, "lng": flng}, "dest": {"lat": tlat, "lng": tlng}}
        for (to, cost, lf, leg) in adj.get(sid, []):
            nt = time + cost
            if to in visited and visited[to] <= nt:
                continue
            heapq.heappush(heap, (nt, cnt, to, fare + lf, legs + [leg])); cnt += 1

    return best or {"found": False}


@router.get("/journey")
async def journey(from_lat: float, from_lng: float, to_lat: float, to_lng: float, mins: int = None):
    """Fastest public-transport itinerary (with transfers) for a real trip."""
    stops = await db.transport_stops.find({"is_active": True, "source": {"$ne": "gtfs"}}, {"_id": 0}).to_list(2000)
    lines = await _load_lines_with_terminus()
    plan = plan_journey(stops, lines, from_lat, from_lng, to_lat, to_lng)
    plan["mocked"] = True
    return plan


# ── journey history (per user) ────────────────────────────────────────────────
def _r4(v):
    try:
        return round(float(v), 4)
    except Exception:
        return None


def _place(body, key):
    p = body.get(key) or {}
    return {"address": (p.get("address") or "").strip() or "—",
            "lat": _num(p.get("lat")), "lng": _num(p.get("lng"))}


@router.get("/journeys")
async def list_journeys(request: Request):
    """Recent public-transport journeys for the current user."""
    user = await get_current_user(request)
    doc = await db.transport_journeys.find_one({"user_id": user["id"]}, {"_id": 0}) or {}
    return {"items": (doc.get("items") or [])[:10]}


@router.post("/journeys")
async def save_journey(request: Request):
    """Save a journey to history (dedup by endpoints, most recent first, cap 10)."""
    user = await get_current_user(request)
    body = await request.json()
    frm, to = _place(body, "from"), _place(body, "to")
    if frm["lat"] is None or to["lat"] is None:
        raise HTTPException(400, "Coordonnées requises")
    summary = body.get("summary") or {}
    item = {
        "id": f"tj_{uuid.uuid4().hex[:10]}",
        "from": frm, "to": to,
        "total_min": summary.get("total_min"),
        "total_fare": summary.get("total_fare"),
        "transfers": summary.get("transfers"),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    doc = await db.transport_journeys.find_one({"user_id": user["id"]}, {"_id": 0}) or {"items": []}
    key = (_r4(frm["lat"]), _r4(frm["lng"]), _r4(to["lat"]), _r4(to["lng"]))
    items = [it for it in (doc.get("items") or [])
             if (_r4(it["from"]["lat"]), _r4(it["from"]["lng"]), _r4(it["to"]["lat"]), _r4(it["to"]["lng"])) != key]
    items.insert(0, item)
    items = items[:10]
    await db.transport_journeys.update_one(
        {"user_id": user["id"]},
        {"$set": {"user_id": user["id"], "items": items}},
        upsert=True,
    )
    return {"items": items}


@router.delete("/journeys/{jid}")
async def delete_journey(jid: str, request: Request):
    user = await get_current_user(request)
    await db.transport_journeys.update_one(
        {"user_id": user["id"]}, {"$pull": {"items": {"id": jid}}}
    )
    doc = await db.transport_journeys.find_one({"user_id": user["id"]}, {"_id": 0}) or {}
    return {"items": (doc.get("items") or [])[:10]}


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
    stops = await db.transport_stops.find({"source": {"$ne": "gtfs"}}, {"_id": 0}).sort("name", 1).to_list(2000)
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
        "fare": (lambda v: round(float(v), 2) if v not in (None, "") else MODE_META.get((body.get("mode") or "bus"), {}).get("fare", 1.50))(body.get("fare")),
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


# ── admin: GTFS status & manual refresh ───────────────────────────────────────
@router.get("/admin/gtfs/status")
async def gtfs_status(current_user: dict = Depends(require_permission("content.manage"))):
    """GTFS import metadata: last import/check, per-feed published version, counts."""
    meta = await db.transport_meta.find_one({"id": "gtfs_martinique"}, {"_id": 0}) or {"feeds": {}}
    # live stop counts per feed
    counts = {}
    for fk in ("centre", "maritime", "nord"):
        feed = f"mq-{fk}"
        counts[feed] = await db.transport_stops.count_documents({"feed": feed})
    meta["live_stop_counts"] = counts
    meta["refresh_interval_days"] = 7
    rt_urls = meta.get("realtime_urls") or {}
    meta["realtime_urls"] = rt_urls
    meta["realtime_active"] = any(bool(v) for v in rt_urls.values())
    dets = meta.get("rt_detections") or []
    meta["rt_detections"] = dets
    meta["rt_unack_count"] = sum(1 for d in dets if not d.get("acknowledged"))
    return meta


@router.post("/admin/gtfs/realtime/scan")
async def gtfs_scan_realtime(current_user: dict = Depends(require_permission("content.manage"))):
    """Manually run the GTFS-RT watch now (auto-activates any newly found feed)."""
    def _run():
        from scripts.import_gtfs_martinique import _db, detect_realtime
        return detect_realtime(_db())

    newly = await asyncio.to_thread(_run)
    _RT_CACHE.clear()
    meta = await db.transport_meta.find_one({"id": "gtfs_martinique"}, {"_id": 0, "realtime_urls": 1}) or {}
    return {"ok": True, "detected": newly,
            "realtime_active": any(bool(v) for v in (meta.get("realtime_urls") or {}).values())}


@router.post("/admin/gtfs/alerts/ack")
async def gtfs_ack_alerts(current_user: dict = Depends(require_permission("content.manage"))):
    """Acknowledge GTFS-RT detection alerts (clears the dashboard bell)."""
    meta = await db.transport_meta.find_one({"id": "gtfs_martinique"}, {"_id": 0, "rt_detections": 1}) or {}
    dets = meta.get("rt_detections") or []
    for d in dets:
        d["acknowledged"] = True
    await db.transport_meta.update_one({"id": "gtfs_martinique"}, {"$set": {"rt_detections": dets}}, upsert=True)
    return {"ok": True, "rt_detections": dets}


@router.put("/admin/gtfs/realtime")
async def gtfs_set_realtime(request: Request,
                            current_user: dict = Depends(require_permission("content.manage"))):
    """Configure GTFS-RT TripUpdates feed URLs per network (dormant until set).

    Body: {"realtime_urls": {"mq-centre": "https://...", "mq-maritime": "", ...}}
    Empty string disables realtime for that network (falls back to theoretical).
    """
    body = await request.json()
    urls = body.get("realtime_urls") or {}
    clean = {}
    for k in ("mq-centre", "mq-maritime", "mq-nord"):
        v = (urls.get(k) or "").strip()
        if v:
            clean[k] = v
    await db.transport_meta.update_one(
        {"id": "gtfs_martinique"}, {"$set": {"realtime_urls": clean}}, upsert=True
    )
    _RT_CACHE.clear()  # force refetch with the new config
    return {"ok": True, "realtime_urls": clean, "realtime_active": bool(clean)}


@router.post("/admin/gtfs/refresh")
async def gtfs_refresh(force: bool = False,
                       current_user: dict = Depends(require_permission("content.manage"))):
    """Trigger a GTFS refresh now. By default only re-imports feeds whose version
    changed; pass force=true to re-import everything."""
    import asyncio

    def _run():
        from scripts.import_gtfs_martinique import _db, refresh
        return refresh(_db(), force=force)

    result = await asyncio.to_thread(_run)
    return {"ok": True, **result}


async def ensure_gtfs_imported():
    """Background scheduler: initial import if missing, then periodic refresh that
    re-imports a feed ONLY when transport.data.gouv.fr publishes a new version.

    Runs the synchronous importer in a worker thread (pymongo + requests).
    Checks ~daily; refresh(force=False) skips feeds whose version is unchanged,
    so schedules stay up to date (weekly-or-on-new-version) without heavy reloads.
    """
    import asyncio

    def _run(force):
        from scripts.import_gtfs_martinique import _db, refresh, detect_realtime
        d = _db()
        refresh(d, force=force)
        detect_realtime(d)      # veille GTFS-RT → auto-activation + alerte admin
        _RT_CACHE.clear()       # refetch with any newly activated realtime feed

    # initial run (full import only when there is no GTFS data yet)
    try:
        empty = (await db.transport_stops.count_documents({"source": "gtfs"})) == 0
        await asyncio.to_thread(_run, empty)
    except Exception:
        pass

    # periodic refresh + GTFS-RT watch — auto-detects new published versions/feeds
    while True:
        try:
            await asyncio.sleep(24 * 3600)
            await asyncio.to_thread(_run, False)
        except asyncio.CancelledError:
            break
        except Exception:
            pass



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
                ("Karu'lis 1", "L1", "bus", 20, "05:00", "21:00", 1.50,
                 ["pap_bergevin", "pap_victoire", "pap_chu", "pap_aeroport"]),
                ("Karu'lis 2", "L2", "bus", 30, "05:30", "20:30", 1.50,
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
                ("TCSP Ligne A", "A", "brt", 12, "05:00", "22:00", 1.40,
                 ["fdf_pointe_simon", "fdf_savane", "fdf_dillon", "fdf_carrere"]),
                ("Mozaïk 2", "M2", "bus", 25, "05:30", "20:00", 1.30,
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
                ("BRT Dakar", "BRT", "brt", 8, "05:30", "23:00", 0.76,
                 ["dkr_petersen", "dkr_grand_yoff", "dkr_guediawaye"]),
                ("Dakar Dem Dikk 7", "DDD7", "bus", 18, "05:30", "22:30", 0.40,
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
        for name, code, mode, headway, first, last, fare, stop_ids in net["lines"]:
            await db.transport_lines.insert_one({
                "id": f"tline_{uuid.uuid4().hex[:10]}",
                "code": code, "name": name, "mode": mode,
                "color": MODE_META.get(mode, {}).get("color", "#2563EB"),
                "operator": net["operator"], "headway_min": headway,
                "first_time": first, "last_time": last, "stop_travel_min": 5,
                "fare": fare, "stop_ids": stop_ids, "is_active": True, "created_at": now_iso,
            })
