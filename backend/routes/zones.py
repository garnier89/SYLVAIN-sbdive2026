"""
Zones — admin-managed geographic zones + programmed (scheduled) shortcuts.

A "zone" is an admin-defined area used to localise home content. A zone can be
matched against the user's position by, in priority order:
  1. geo distance (center lat/lng + radius_km)
  2. country / region / city hierarchy (text match against the user's label)
  3. free-text aliases (substring match against the user's address label)

For each zone the admin can PROGRAM a list of "shortcuts" (curated service tiles)
with an OPTIONAL schedule (days of week + time window + date range). The client
calls /resolve with its position (and local day/time) and receives the zone plus
the list of shortcuts that are ACTIVE right now.

Trends stay automatic (organic) — /resolve only returns a `trend_zone` key so the
existing service-trends tracker aggregates against the same admin zone.

Collections: `zones`, `zone_shortcuts` (one doc per zone_id, with `entries`).
"""
import math
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Request, HTTPException, Depends

from core.config import db
from core.permissions import require_permission

router = APIRouter(prefix="/zones", tags=["zones"])


# ── helpers ──────────────────────────────────────────────────────────────────
def _norm(s):
    return (s or "").strip().lower()


def _clean(doc):
    doc.pop("_id", None)
    return doc


def _haversine_km(lat1, lng1, lat2, lng2):
    R = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


def _to_min(hhmm):
    try:
        h, m = str(hhmm).split(":")
        return int(h) * 60 + int(m)
    except Exception:
        return None


def _zone_tokens(z):
    """Normalised text tokens that identify a zone (for label matching)."""
    toks = [_norm(z.get(k)) for k in ("name", "city", "region", "country")]
    toks += [_norm(a) for a in (z.get("aliases") or [])]
    return [t for t in toks if t]


def resolve_zone(zones, lat, lng, label):
    """Pick the best matching zone (geo first, then text). Returns a zone dict or None."""
    # 1) geo distance
    best, best_d = None, None
    if lat is not None and lng is not None:
        for z in zones:
            zlat, zlng, r = z.get("lat"), z.get("lng"), z.get("radius_km")
            if zlat is None or zlng is None or not r:
                continue
            d = _haversine_km(lat, lng, float(zlat), float(zlng))
            if d <= float(r) and (best_d is None or d < best_d):
                best, best_d = z, d
        if best:
            return best
    # 2 + 3) text / hierarchy / alias match
    nlabel = _norm(label)
    if nlabel:
        for z in sorted(zones, key=lambda x: x.get("display_order", 0)):
            for tok in _zone_tokens(z):
                if tok and tok in nlabel:
                    return z
    return None


def _entry_active(schedule, dow, mins, date_str):
    """True if a programmed shortcut is active for the given local day/time/date."""
    if not schedule or not schedule.get("enabled"):
        return True
    days = schedule.get("days") or []
    if days and dow is not None and int(dow) not in [int(d) for d in days]:
        return False
    sd, ed = schedule.get("start_date"), schedule.get("end_date")
    if date_str:
        if sd and date_str < sd:
            return False
        if ed and date_str > ed:
            return False
    st, et = _to_min(schedule.get("start_time")), _to_min(schedule.get("end_time"))
    if st is not None and et is not None and mins is not None:
        if st <= et:
            if not (st <= mins <= et):
                return False
        else:  # overnight window (e.g. 22:00 → 04:00)
            if not (mins >= st or mins <= et):
                return False
    return True


def _shape_zone(z, entry_count=None):
    out = {
        "id": z.get("id"),
        "name": z.get("name"),
        "country": z.get("country", ""),
        "region": z.get("region", ""),
        "city": z.get("city", ""),
        "lat": z.get("lat"),
        "lng": z.get("lng"),
        "radius_km": z.get("radius_km"),
        "aliases": z.get("aliases") or [],
        "is_active": z.get("is_active", True),
        "display_order": z.get("display_order", 0),
    }
    if entry_count is not None:
        out["shortcut_count"] = entry_count
    return out


# ── public ───────────────────────────────────────────────────────────────────
@router.get("/resolve")
async def resolve(lat: float = None, lng: float = None, label: str = None,
                  dow: int = None, mins: int = None, date: str = None):
    """Resolve the user's zone and return the shortcuts active right now."""
    zones = await db.zones.find({"is_active": True}, {"_id": 0}).to_list(500)
    zone = resolve_zone(zones, lat, lng, label)
    shortcuts = []
    if zone:
        doc = await db.zone_shortcuts.find_one({"zone_id": zone["id"]}, {"_id": 0})
        for e in (doc or {}).get("entries", []):
            svc = e.get("service") or {}
            if not svc.get("name") or not svc.get("path"):
                continue
            if _entry_active(e.get("schedule"), dow, mins, date):
                shortcuts.append(svc)
    # trend_zone: align organic trends to the admin zone when matched, else free-text
    if zone:
        trend_zone = _norm(zone.get("name"))
    else:
        parts = [p.strip() for p in (label or "").split(",") if p.strip()]
        trend_zone = _norm(", ".join(parts[-2:]))
    return {
        "zone": _shape_zone(zone) if zone else None,
        "trend_zone": trend_zone or "global",
        "shortcuts": shortcuts,
    }


# ── admin: zones CRUD ─────────────────────────────────────────────────────────
@router.get("/admin/list")
async def admin_list(current_user: dict = Depends(require_permission("content.manage"))):
    zones = await db.zones.find({}, {"_id": 0}).sort("display_order", 1).to_list(1000)
    out = []
    for z in zones:
        cnt = await db.zone_shortcuts.count_documents({"zone_id": z["id"]})
        doc = await db.zone_shortcuts.find_one({"zone_id": z["id"]}, {"_id": 0, "entries": 1})
        n = len((doc or {}).get("entries", [])) if doc else 0
        out.append(_shape_zone(z, entry_count=n))
    return {"zones": out}


def _parse_zone_body(body):
    def _num(v):
        try:
            return float(v) if v not in (None, "") else None
        except Exception:
            return None
    aliases = body.get("aliases")
    if isinstance(aliases, str):
        aliases = [a.strip() for a in aliases.split(",") if a.strip()]
    return {
        "name": (body.get("name") or "").strip(),
        "country": (body.get("country") or "").strip(),
        "region": (body.get("region") or "").strip(),
        "city": (body.get("city") or "").strip(),
        "lat": _num(body.get("lat")),
        "lng": _num(body.get("lng")),
        "radius_km": _num(body.get("radius_km")),
        "aliases": aliases or [],
        "is_active": body.get("is_active", True) is not False,
        "display_order": int(body.get("display_order") or 0),
    }


@router.post("/admin")
async def admin_create(request: Request, current_user: dict = Depends(require_permission("content.manage"))):
    body = await request.json()
    data = _parse_zone_body(body)
    if not data["name"]:
        raise HTTPException(400, "Nom de zone requis")
    data["id"] = f"zone_{uuid.uuid4().hex[:10]}"
    data["created_at"] = datetime.now(timezone.utc).isoformat()
    await db.zones.insert_one(dict(data))
    return _shape_zone(data)


@router.put("/admin/{zone_id}")
async def admin_update(zone_id: str, request: Request, current_user: dict = Depends(require_permission("content.manage"))):
    body = await request.json()
    data = _parse_zone_body(body)
    if not data["name"]:
        raise HTTPException(400, "Nom de zone requis")
    data["updated_at"] = datetime.now(timezone.utc).isoformat()
    r = await db.zones.update_one({"id": zone_id}, {"$set": data})
    if not r.matched_count:
        raise HTTPException(404, "Zone introuvable")
    z = await db.zones.find_one({"id": zone_id}, {"_id": 0})
    return _shape_zone(z)


@router.delete("/admin/{zone_id}")
async def admin_delete(zone_id: str, current_user: dict = Depends(require_permission("content.manage"))):
    await db.zones.delete_one({"id": zone_id})
    await db.zone_shortcuts.delete_one({"zone_id": zone_id})
    return {"ok": True}


# ── admin: programmed shortcuts per zone ──────────────────────────────────────
@router.get("/admin/{zone_id}/shortcuts")
async def admin_get_shortcuts(zone_id: str, current_user: dict = Depends(require_permission("content.manage"))):
    z = await db.zones.find_one({"id": zone_id}, {"_id": 0})
    if not z:
        raise HTTPException(404, "Zone introuvable")
    doc = await db.zone_shortcuts.find_one({"zone_id": zone_id}, {"_id": 0})
    return {"zone": _shape_zone(z), "entries": (doc or {}).get("entries", [])}


@router.put("/admin/{zone_id}/shortcuts")
async def admin_set_shortcuts(zone_id: str, request: Request, current_user: dict = Depends(require_permission("content.manage"))):
    z = await db.zones.find_one({"id": zone_id}, {"_id": 0})
    if not z:
        raise HTTPException(404, "Zone introuvable")
    body = await request.json()
    entries = []
    for e in (body.get("entries") or []):
        svc = e.get("service") or {}
        if not svc.get("name") or not svc.get("path"):
            continue
        entries.append({
            "service": {
                "id": svc.get("id") or svc.get("path"),
                "name": svc.get("name"),
                "path": svc.get("path"),
                "iconName": svc.get("iconName") or "GridFour",
                "imageUrl": svc.get("imageUrl") or "",
                "bg": svc.get("bg") or "bg-slate-100",
                "iconColor": svc.get("iconColor") or "text-gray-600",
            },
            "schedule": e.get("schedule") or {"enabled": False},
        })
    await db.zone_shortcuts.update_one(
        {"zone_id": zone_id},
        {"$set": {"zone_id": zone_id, "entries": entries,
                  "updated_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True,
    )
    return {"ok": True, "count": len(entries)}


# ── seed (idempotent) ─────────────────────────────────────────────────────────
async def seed_zones():
    """Seed a few demo zones + programmed shortcuts (idempotent by id)."""
    demo = [
        {"id": "zone_pap", "name": "Pointe-à-Pitre", "country": "Guadeloupe",
         "region": "Guadeloupe", "city": "Pointe-à-Pitre",
         "lat": 16.2412, "lng": -61.5340, "radius_km": 20,
         "aliases": ["pointe-à-pitre", "abymes", "guadeloupe"],
         "is_active": True, "display_order": 0,
         "entries": [
             {"service": {"id": "z-taxi", "name": "Taxi VTC", "path": "/course?mode=standard",
                          "iconName": "Taxi", "bg": "bg-slate-100", "iconColor": "text-gray-600"},
              "schedule": {"enabled": False}},
             {"service": {"id": "z-food", "name": "Livraison Repas", "path": "/food",
                          "iconName": "ForkKnife", "bg": "bg-slate-100", "iconColor": "text-gray-600"},
              "schedule": {"enabled": False}},
             {"service": {"id": "z-bars", "name": "Bars", "path": "/nearby?category=Bar",
                          "iconName": "Wine", "bg": "bg-slate-100", "iconColor": "text-gray-600"},
              "schedule": {"enabled": True, "days": [4, 5, 6], "start_time": "18:00", "end_time": "23:59"}},
         ]},
        {"id": "zone_fdf", "name": "Fort-de-France", "country": "Martinique",
         "region": "Martinique", "city": "Fort-de-France",
         "lat": 14.6161, "lng": -61.0588, "radius_km": 20,
         "aliases": ["fort-de-france", "martinique"],
         "is_active": True, "display_order": 1,
         "entries": [
             {"service": {"id": "z-taxi", "name": "Taxi VTC", "path": "/course?mode=standard",
                          "iconName": "Taxi", "bg": "bg-slate-100", "iconColor": "text-gray-600"},
              "schedule": {"enabled": False}},
             {"service": {"id": "z-beauty", "name": "Beauté", "path": "/beauty",
                          "iconName": "Scissors", "bg": "bg-slate-100", "iconColor": "text-gray-600"},
              "schedule": {"enabled": False}},
         ]},
        {"id": "zone_dkr", "name": "Dakar", "country": "Sénégal",
         "region": "Dakar", "city": "Dakar",
         "lat": 14.7167, "lng": -17.4677, "radius_km": 30,
         "aliases": ["dakar", "sénégal", "senegal"],
         "is_active": True, "display_order": 2,
         "entries": [
             {"service": {"id": "z-taxi", "name": "Taxi VTC", "path": "/course?mode=standard",
                          "iconName": "Taxi", "bg": "bg-slate-100", "iconColor": "text-gray-600"},
              "schedule": {"enabled": False}},
             {"service": {"id": "z-parcel", "name": "Livraison Colis", "path": "/parcel",
                          "iconName": "Package", "bg": "bg-slate-100", "iconColor": "text-gray-600"},
              "schedule": {"enabled": False}},
         ]},
    ]
    for z in demo:
        if await db.zones.find_one({"id": z["id"]}):
            continue
        entries = z.pop("entries", [])
        z["created_at"] = datetime.now(timezone.utc).isoformat()
        await db.zones.insert_one(dict(z))
        await db.zone_shortcuts.update_one(
            {"zone_id": z["id"]},
            {"$set": {"zone_id": z["id"], "entries": entries}},
            upsert=True,
        )



# ── Martinique communes (real geo zones for zone-level dispatch & recruitment) ──
# (lat, lng) = town-centre, radius_km tuned to roughly cover each commune.
_MARTINIQUE_COMMUNES = [
    ("Fort-de-France", 14.6037, -61.0594, 6),
    ("Le Lamentin", 14.6097, -60.9989, 7),
    ("Schœlcher", 14.6133, -61.0900, 5),
    ("Saint-Joseph", 14.6670, -61.0330, 6),
    ("Case-Pilote", 14.6420, -61.1330, 4),
    ("Bellefontaine", 14.6890, -61.1620, 4),
    ("Le Carbet", 14.7080, -61.1170, 5),
    ("Saint-Pierre", 14.7430, -61.1750, 5),
    ("Le Prêcheur", 14.8000, -61.2280, 5),
    ("Le Morne-Rouge", 14.7720, -61.1380, 5),
    ("L'Ajoupa-Bouillon", 14.8170, -61.1330, 5),
    ("Fonds-Saint-Denis", 14.7330, -61.1370, 5),
    ("Le Morne-Vert", 14.7180, -61.1480, 4),
    ("Basse-Pointe", 14.8700, -61.1170, 6),
    ("Macouba", 14.8700, -61.1500, 5),
    ("Grand'Rivière", 14.8800, -61.1830, 5),
    ("Le Lorrain", 14.8330, -61.0500, 6),
    ("Le Marigot", 14.8270, -61.0220, 5),
    ("Sainte-Marie", 14.7833, -60.9950, 7),
    ("La Trinité", 14.7370, -60.9650, 7),
    ("Gros-Morne", 14.7050, -60.9810, 7),
    ("Le Robert", 14.6770, -60.9430, 7),
    ("Le François", 14.6160, -60.9030, 7),
    ("Le Vauclin", 14.5470, -60.8390, 6),
    ("Saint-Esprit", 14.5560, -60.9220, 5),
    ("Ducos", 14.5760, -60.9560, 5),
    ("Rivière-Salée", 14.5310, -60.9740, 6),
    ("Les Trois-Îlets", 14.5380, -61.0350, 5),
    ("Les Anses-d'Arlet", 14.4880, -61.0840, 5),
    ("Le Diamant", 14.4790, -61.0270, 5),
    ("Sainte-Luce", 14.4670, -60.9270, 5),
    ("Rivière-Pilote", 14.4810, -60.8970, 6),
    ("Le Marin", 14.4700, -60.8680, 5),
    ("Sainte-Anne", 14.4350, -60.8780, 6),
]


def _commune_slug(name):
    return _norm(name).replace(" ", "-").replace("'", "").replace("œ", "oe")


async def seed_martinique_communes():
    """Seed the 34 communes of Martinique as active geo zones (idempotent by id).
    Enables zone-level dispatch, demand heatmaps and the taxi-recruitment alert.
    Never overwrites a zone an admin may have edited (insert-only)."""
    order = 100
    for name, lat, lng, radius in _MARTINIQUE_COMMUNES:
        zid = f"zone_mq_{_commune_slug(name)}"
        if await db.zones.find_one({"id": zid}):
            continue
        await db.zones.insert_one({
            "id": zid,
            "name": name,
            "country": "Martinique",
            "region": "Martinique",
            "city": name,
            "lat": lat,
            "lng": lng,
            "radius_km": radius,
            "aliases": [_norm(name), _norm(name).replace("-", " ")],
            "is_active": True,
            "display_order": order,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        order += 1
