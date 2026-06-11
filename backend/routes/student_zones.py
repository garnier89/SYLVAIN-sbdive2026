"""
SB Drive Student — Phase 3: University zones + Campus Share.

- Campus zones (admin CRUD): universities, residences, libraries, training centres,
  each with dedicated pickup points and safe meeting points.
- Campus-trip detection: a ride whose pickup OR dropoff falls inside an enabled
  campus zone is tagged kind='campus' → unlocks the campus discount.
- Campus Share: lightweight ride-sharing intent matching for students heading the
  same direction (same destination zone, similar time) — reuses the existing pool
  pricing on top.

Endpoints under /api/student.
"""
import math
import uuid
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, HTTPException, Request, Query
from pydantic import BaseModel

from core.config import db
from core.deps import get_current_user

router = APIRouter(prefix="/student", tags=["student-zones"])

CAMPUS_ZONE_TYPES = {"university", "residence", "library", "training_center"}
DEFAULT_RADIUS_M = 500
SHARE_TIME_WINDOW_MIN = 30
SHARE_ORIGIN_RADIUS_M = 2500


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _haversine_m(lat1, lng1, lat2, lng2) -> float:
    R = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


async def find_campus_zone(lat, lng):
    """Return the first enabled campus zone containing the point, else None."""
    if lat is None or lng is None:
        return None
    try:
        zones = await db.campus_zones.find({"enabled": True}, {"_id": 0}).to_list(1000)
    except Exception:
        return None
    for z in zones:
        zlat, zlng = z.get("lat"), z.get("lng")
        if zlat is None or zlng is None:
            continue
        r = float(z.get("radius_m", DEFAULT_RADIUS_M) or DEFAULT_RADIUS_M)
        if _haversine_m(float(lat), float(lng), float(zlat), float(zlng)) <= r:
            return z
    return None


async def is_campus_trip(plat, plng, dlat, dlng) -> bool:
    """True if either endpoint is inside an enabled campus zone. NEVER raises."""
    try:
        if await find_campus_zone(plat, plng):
            return True
        if await find_campus_zone(dlat, dlng):
            return True
    except Exception:
        pass
    return False


# ==================== STUDENT — nearby campus zones ====================
@router.get("/zones/campus")
async def nearby_campus_zones(request: Request, lat: float = Query(None), lng: float = Query(None)):
    await get_current_user(request)
    zones = await db.campus_zones.find({"enabled": True}, {"_id": 0}).to_list(1000)
    if lat is not None and lng is not None:
        for z in zones:
            if z.get("lat") is not None and z.get("lng") is not None:
                z["distance_m"] = round(_haversine_m(lat, lng, z["lat"], z["lng"]))
        zones.sort(key=lambda z: z.get("distance_m", 1e12))
    return {"zones": zones}


# ==================== ADMIN — campus zones CRUD ====================
async def _require_admin(request: Request):
    user = await get_current_user(request)
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    return user


class Point(BaseModel):
    label: str
    lat: float
    lng: float


class CampusZoneBody(BaseModel):
    name: str
    type: str = "university"
    lat: float
    lng: float
    radius_m: int = DEFAULT_RADIUS_M
    country: str = ""
    pickup_points: list[Point] = []
    safe_meeting_points: list[Point] = []
    enabled: bool = True


@router.get("/admin/campus-zones")
async def admin_list_zones(request: Request):
    await _require_admin(request)
    zones = await db.campus_zones.find({}, {"_id": 0}).sort([("country", 1), ("name", 1)]).to_list(2000)
    return {"zones": zones}


def _pts(points) -> list:
    out = []
    for p in points or []:
        d = p.dict() if hasattr(p, "dict") else dict(p)
        d.setdefault("id", f"pt_{uuid.uuid4().hex[:6]}")
        out.append(d)
    return out


@router.post("/admin/campus-zones")
async def admin_create_zone(body: CampusZoneBody, request: Request):
    await _require_admin(request)
    if body.type not in CAMPUS_ZONE_TYPES:
        raise HTTPException(status_code=400, detail="Type de zone invalide")
    doc = {
        "id": f"cz_{uuid.uuid4().hex[:8]}", "name": body.name.strip(), "type": body.type,
        "lat": body.lat, "lng": body.lng, "radius_m": max(50, int(body.radius_m)),
        "country": (body.country or "").strip().upper(),
        "pickup_points": _pts(body.pickup_points), "safe_meeting_points": _pts(body.safe_meeting_points),
        "enabled": bool(body.enabled), "created_at": _now(),
    }
    await db.campus_zones.insert_one(dict(doc))
    doc.pop("_id", None)
    return {"zone": doc}


class CampusZonePatch(BaseModel):
    name: str | None = None
    type: str | None = None
    lat: float | None = None
    lng: float | None = None
    radius_m: int | None = None
    country: str | None = None
    pickup_points: list[Point] | None = None
    safe_meeting_points: list[Point] | None = None
    enabled: bool | None = None


@router.put("/admin/campus-zones/{zone_id}")
async def admin_update_zone(zone_id: str, body: CampusZonePatch, request: Request):
    await _require_admin(request)
    patch = {}
    for k, v in body.dict().items():
        if v is None:
            continue
        if k == "type" and v not in CAMPUS_ZONE_TYPES:
            raise HTTPException(status_code=400, detail="Type de zone invalide")
        if k in ("pickup_points", "safe_meeting_points"):
            patch[k] = _pts(v)
        elif k == "country":
            patch[k] = v.strip().upper()
        else:
            patch[k] = v
    if not patch:
        raise HTTPException(status_code=400, detail="Rien à mettre à jour")
    res = await db.campus_zones.update_one({"id": zone_id}, {"$set": patch})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Zone introuvable")
    return {"zone": await db.campus_zones.find_one({"id": zone_id}, {"_id": 0})}


@router.delete("/admin/campus-zones/{zone_id}")
async def admin_delete_zone(zone_id: str, request: Request):
    await _require_admin(request)
    res = await db.campus_zones.delete_one({"id": zone_id})
    return {"deleted": res.deleted_count}


# ==================== CAMPUS SHARE ====================
class ShareRequestBody(BaseModel):
    origin_lat: float
    origin_lng: float
    origin_label: str = ""
    dest_lat: float
    dest_lng: float
    dest_label: str = ""
    depart_at: str | None = None      # ISO; defaults to now


async def _share_matches(req: dict) -> list:
    """Open share requests (other users) heading to the same dest zone within the time window."""
    try:
        depart = datetime.fromisoformat(req["depart_at"])
    except Exception:
        depart = datetime.now(timezone.utc)
    lo = (depart - timedelta(minutes=SHARE_TIME_WINDOW_MIN)).isoformat()
    hi = (depart + timedelta(minutes=SHARE_TIME_WINDOW_MIN)).isoformat()
    others = await db.campus_share_requests.find(
        {"status": "open", "user_id": {"$ne": req["user_id"]},
         "depart_at": {"$gte": lo, "$lte": hi}}, {"_id": 0}).to_list(200)
    out = []
    for o in others:
        # same destination zone (if both resolved) OR destination within 1km
        same_dest = (req.get("dest_zone_id") and o.get("dest_zone_id") and req["dest_zone_id"] == o["dest_zone_id"])
        if not same_dest:
            try:
                same_dest = _haversine_m(req["dest_lat"], req["dest_lng"], o["dest_lat"], o["dest_lng"]) <= 1000
            except Exception:
                same_dest = False
        if same_dest:
            out.append({
                "id": o["id"], "user_name": (o.get("user_name") or "Étudiant"),
                "origin_label": o.get("origin_label"), "depart_at": o.get("depart_at"),
            })
    return out


@router.post("/campus-share/request")
async def create_share_request(body: ShareRequestBody, request: Request):
    user = await get_current_user(request)
    # Only verified students can use Campus Share.
    profile = await db.student_profiles.find_one({"user_id": user["id"]}, {"_id": 0, "status": 1})
    if not profile or profile.get("status") != "verified":
        raise HTTPException(status_code=403, detail="Réservé aux étudiants vérifiés")
    depart = body.depart_at or _now()
    origin_zone = await find_campus_zone(body.origin_lat, body.origin_lng)
    dest_zone = await find_campus_zone(body.dest_lat, body.dest_lng)
    doc = {
        "id": f"csr_{uuid.uuid4().hex[:10]}", "user_id": user["id"], "user_name": user.get("name", "Étudiant"),
        "origin_lat": body.origin_lat, "origin_lng": body.origin_lng, "origin_label": body.origin_label,
        "dest_lat": body.dest_lat, "dest_lng": body.dest_lng, "dest_label": body.dest_label,
        "origin_zone_id": origin_zone["id"] if origin_zone else None,
        "dest_zone_id": dest_zone["id"] if dest_zone else None,
        "depart_at": depart, "status": "open", "created_at": _now(),
    }
    # Replace any previous open request from this user.
    await db.campus_share_requests.update_many({"user_id": user["id"], "status": "open"}, {"$set": {"status": "cancelled"}})
    await db.campus_share_requests.insert_one(dict(doc))
    doc.pop("_id", None)
    matches = await _share_matches(doc)
    return {"request": doc, "matches": matches, "match_count": len(matches)}


@router.get("/campus-share/matches")
async def my_share_matches(request: Request):
    user = await get_current_user(request)
    req = await db.campus_share_requests.find_one({"user_id": user["id"], "status": "open"}, {"_id": 0})
    if not req:
        return {"request": None, "matches": [], "match_count": 0}
    matches = await _share_matches(req)
    return {"request": req, "matches": matches, "match_count": len(matches)}


@router.delete("/campus-share/request")
async def cancel_share_request(request: Request):
    user = await get_current_user(request)
    res = await db.campus_share_requests.update_many(
        {"user_id": user["id"], "status": "open"}, {"$set": {"status": "cancelled"}})
    return {"cancelled": res.modified_count}
