"""Commerces Proches — live hybrid nearby businesses.

Merges admin-curated `nearby_businesses` (shown first, as featured partners) with
REAL places fetched from Google Places (legacy web service, already enabled on the
shared GOOGLE_MAPS_KEY). The Google API key stays strictly server-side; place photos
are proxied through `/api/nearby/photo`.

Consumed by the client « Commerces Proches » page (NearbyBusinessPage).
"""
import os
import time
import asyncio
from math import radians, sin, cos, asin, sqrt

import requests
from fastapi import APIRouter, HTTPException, Query, Response, Request

from core.config import db

router = APIRouter(prefix="/nearby", tags=["nearby-places"])

GOOGLE_MAPS_KEY = os.environ.get("GOOGLE_MAPS_KEY")
_NEARBY_URL = "https://maps.googleapis.com/maps/api/place/nearbysearch/json"
_PHOTO_URL = "https://maps.googleapis.com/maps/api/place/photo"
_DETAILS_URL = "https://maps.googleapis.com/maps/api/place/details/json"

# French category label -> Google legacy place type used for Nearby Search.
# A value may be a plain type string, or a (type, keyword) tuple for finer search
# (e.g. monuments / historic sites all map to tourist_attraction + a keyword).
CATEGORY_TYPE_MAP = {
    "Café": "cafe",
    "Bar": "bar",
    "Restaurant": "restaurant",
    "Salon": "beauty_salon",
    "Spa": "spa",
    "Boulangerie": "bakery",
    "Pharmacie": "pharmacy",
    "Hôpital": "hospital",
    "Salle de sport": "gym",
    "Shopping": "store",
    "Centre commercial": "shopping_mall",
    "Hôtel": "lodging",
    "Musée": "museum",
    "Attraction": "tourist_attraction",
    # Tourisme & patrimoine
    "Lieux touristiques": "tourist_attraction",
    "Monuments": ("tourist_attraction", "monument"),
    "Sites historiques": ("tourist_attraction", "site historique patrimoine"),
    "Parcs & Nature": "park",
    "Plages": (None, "plage"),
    "Points de vue": ("tourist_attraction", "point de vue panorama belvédère"),
    "Bibliothèque": "library",
    "Vie Nocturne": "night_club",
    "Parking": "parking",
    "Garage": "car_repair",
}

# Lightweight in-process cache (rounded coords + category) to limit API calls/cost.
_CACHE: dict = {}
_CACHE_TTL = 300  # 5 minutes


def _haversine_km(lat1, lon1, lat2, lon2) -> float:
    r = 6371.0
    p1, p2 = radians(lat1), radians(lat2)
    dphi = radians(lat2 - lat1)
    dlmb = radians(lon2 - lon1)
    a = sin(dphi / 2) ** 2 + cos(p1) * cos(p2) * sin(dlmb / 2) ** 2
    return round(r * 2 * asin(min(1.0, sqrt(a))), 1)


def _fetch_google_nearby(lat: float, lng: float, gtype: str, radius_m: int, keyword: str = None) -> list:
    """Blocking call to Google Places (legacy Nearby Search). Runs in a thread."""
    params = {
        "location": f"{lat},{lng}",
        "radius": radius_m,
        "key": GOOGLE_MAPS_KEY,
    }
    if gtype:
        params["type"] = gtype
    if keyword:
        params["keyword"] = keyword
    resp = requests.get(_NEARBY_URL, params=params, timeout=6)
    resp.raise_for_status()
    data = resp.json()
    if data.get("status") not in ("OK", "ZERO_RESULTS"):
        return []
    return data.get("results", []) or []


@router.get("/live")
async def nearby_live(
    lat: float = Query(...),
    lng: float = Query(...),
    category: str = Query(...),
    radius_m: int = Query(2500, ge=200, le=50000),
    limit: int = Query(20, ge=1, le=40),
):
    """Hybrid list for one category: admin-curated partners first, then real Google places."""
    # 1) Admin-curated partners for this category (always on top, flagged featured).
    curated = []
    async for doc in db.nearby_businesses.find(
        {"is_active": True, "category": category}, {"_id": 0}
    ).limit(limit):
        d = dict(doc)
        d["source"] = "admin"
        d["is_featured"] = True
        curated.append(d)

    # 2) Real places from Google (cached). Gracefully degrade if API unavailable.
    google_cards = []
    mapping = CATEGORY_TYPE_MAP.get(category)
    gtype, keyword = (mapping if isinstance(mapping, tuple) else (mapping, None))
    if GOOGLE_MAPS_KEY and (gtype or keyword):
        cache_key = f"{round(lat, 3)}:{round(lng, 3)}:{category}:{radius_m}"
        cached = _CACHE.get(cache_key)
        if cached and (time.time() - cached[0] < _CACHE_TTL):
            results = cached[1]
        else:
            try:
                results = await asyncio.to_thread(_fetch_google_nearby, lat, lng, gtype, radius_m, keyword)
                _CACHE[cache_key] = (time.time(), results)
            except Exception:
                results = []
        for r in results:
            loc = (r.get("geometry") or {}).get("location") or {}
            plat, plng = loc.get("lat"), loc.get("lng")
            photo_ref = None
            photos = r.get("photos") or []
            if photos:
                photo_ref = photos[0].get("photo_reference")
            google_cards.append({
                "id": r.get("place_id"),
                "place_id": r.get("place_id"),
                "name": r.get("name"),
                "category": category,
                "address": r.get("vicinity") or r.get("formatted_address"),
                "rating": r.get("rating"),
                "distance_km": _haversine_km(lat, lng, plat, plng) if plat is not None else None,
                "open_now": (r.get("opening_hours") or {}).get("open_now"),
                "lat": plat,
                "lng": plng,
                "image": f"/api/nearby/photo?ref={photo_ref}" if photo_ref else None,
                "source": "google",
                "is_featured": False,
            })

    # Sort google results by distance when available.
    google_cards.sort(key=lambda c: (c["distance_km"] is None, c["distance_km"] or 0))
    return {"category": category, "items": curated + google_cards[:limit]}


@router.get("/photo")
async def nearby_photo(ref: str = Query(...), maxwidth: int = Query(400, ge=80, le=1600)):
    """Proxy a Google Place photo so the API key never reaches the browser."""
    if not GOOGLE_MAPS_KEY:
        raise HTTPException(status_code=503, detail="Maps key not configured")
    params = {"photoreference": ref, "maxwidth": maxwidth, "key": GOOGLE_MAPS_KEY}

    def _get():
        return requests.get(_PHOTO_URL, params=params, timeout=8)

    try:
        resp = await asyncio.to_thread(_get)
    except Exception:
        raise HTTPException(status_code=502, detail="Photo fetch failed")
    if resp.status_code != 200:
        raise HTTPException(status_code=404, detail="Photo not found")
    return Response(
        content=resp.content,
        media_type=resp.headers.get("Content-Type", "image/jpeg"),
        headers={"Cache-Control": "public, max-age=86400"},
    )


@router.get("/place-details")
async def nearby_place_details(place_id: str = Query(...)):
    """Extra detail for a Google place (phone + opening hours) used by the detail sheet."""
    if not GOOGLE_MAPS_KEY:
        raise HTTPException(status_code=503, detail="Maps key not configured")
    params = {
        "place_id": place_id,
        "fields": "formatted_phone_number,international_phone_number,opening_hours,website,formatted_address,geometry",
        "key": GOOGLE_MAPS_KEY,
        "language": "fr",
    }

    def _get():
        return requests.get(_DETAILS_URL, params=params, timeout=6)

    try:
        resp = await asyncio.to_thread(_get)
        resp.raise_for_status()
        data = resp.json()
    except Exception:
        raise HTTPException(status_code=502, detail="Details fetch failed")
    result = data.get("result") or {}
    loc = (result.get("geometry") or {}).get("location") or {}
    return {
        "phone": result.get("formatted_phone_number") or result.get("international_phone_number"),
        "website": result.get("website"),
        "address": result.get("formatted_address"),
        "open_now": (result.get("opening_hours") or {}).get("open_now"),
        "weekday_text": (result.get("opening_hours") or {}).get("weekday_text") or [],
        "lat": loc.get("lat"),
        "lng": loc.get("lng"),
    }



_DIRECTIONS_URL = "https://maps.googleapis.com/maps/api/directions/json"

# Suggested visit duration (minutes) per category — used to build a day circuit.
VISIT_MINUTES = {
    "Musée": 90, "Monuments": 45, "Sites historiques": 45, "Lieux touristiques": 60,
    "Attraction": 75, "Parcs & Nature": 60, "Plages": 120, "Points de vue": 30,
    "Bibliothèque": 30, "Café": 30, "Bar": 60, "Restaurant": 75, "Salon": 60,
    "Spa": 90, "Shopping": 60, "Centre commercial": 90, "Hôtel": 0, "Boulangerie": 15,
    "Pharmacie": 15, "Hôpital": 0, "Salle de sport": 60, "Vie Nocturne": 90,
    "Parking": 0, "Garage": 0,
}
_DEFAULT_VISIT = 45


@router.post("/optimize-route")
async def optimize_route(request: Request):
    """Optimise l'ordre de visite (trajet le plus court) via Google Directions
    (waypoints optimize:true) et estime la durée totale de la journée
    (route + temps de visite par lieu)."""
    if not GOOGLE_MAPS_KEY:
        raise HTTPException(status_code=503, detail="Maps key not configured")
    body = await request.json()
    origin = body.get("origin") or {}
    places = [p for p in (body.get("places") or []) if p.get("lat") is not None and p.get("lng") is not None]
    if not origin.get("lat") or len(places) < 2:
        raise HTTPException(status_code=400, detail="origin + au moins 2 lieux requis")

    o = f"{origin['lat']},{origin['lng']}"
    # Round-trip optimization: origin == destination, all places as waypoints.
    params = {
        "origin": o, "destination": o,
        "waypoints": "optimize:true|" + "|".join(f"{p['lat']},{p['lng']}" for p in places),
        "key": GOOGLE_MAPS_KEY, "language": "fr", "units": "metric",
    }

    def _get():
        return requests.get(_DIRECTIONS_URL, params=params, timeout=8)

    try:
        resp = await asyncio.to_thread(_get)
        data = resp.json()
    except Exception:
        raise HTTPException(status_code=502, detail="Directions fetch failed")
    if data.get("status") != "OK" or not data.get("routes"):
        # Graceful fallback: keep the submitted order, no drive estimate.
        order = list(range(len(places)))
        visit = [VISIT_MINUTES.get(p.get("category"), _DEFAULT_VISIT) for p in places]
        return {"order": order, "total_drive_min": None, "total_distance_km": None,
                "visit_minutes": visit, "total_visit_min": sum(visit), "total_day_min": None}

    route = data["routes"][0]
    order = route.get("waypoint_order", list(range(len(places))))
    legs = route.get("legs", [])
    # One-way circuit: exclude the final return leg (back to origin).
    drive_legs = legs[:-1] if len(legs) > 1 else legs
    total_drive_min = int(sum(l["duration"]["value"] for l in drive_legs) / 60)
    total_distance_km = round(sum(l["distance"]["value"] for l in drive_legs) / 1000, 1)

    ordered_places = [places[i] for i in order]
    visit = [VISIT_MINUTES.get(p.get("category"), _DEFAULT_VISIT) for p in ordered_places]
    total_visit = sum(visit)
    return {
        "order": order,
        "total_drive_min": total_drive_min,
        "total_distance_km": total_distance_km,
        "visit_minutes": visit,
        "total_visit_min": total_visit,
        "total_day_min": total_drive_min + total_visit,
    }
