"""
Geographic referentials seeded from V3Cube (countries, states, cities).

Iteration 77 — Provides public endpoints for cascading selectors (Country -> State -> City)
in registration / address forms.
"""
import json
import os
import ipaddress
import httpx
from fastapi import APIRouter, Request
from typing import Optional

from core.config import db

router = APIRouter(prefix="/geo", tags=["geo"])

SEED_PATH = "/app/backend/seed_data/v3cube_countries.json"

# Service area: France métropole + French Caribbean/overseas. Pickups resolved
# from an IP outside this set fall back to the default service centre.
DEFAULT_CENTER = {"lat": 14.6036, "lng": -61.0667}  # Fort-de-France
SERVICE_COUNTRIES = {"FR", "MQ", "GP", "GF", "RE", "YT", "BL", "MF", "PM"}


async def seed_countries():
    """Idempotent seed of countries from V3Cube SQL dump (250 countries)."""
    if not os.path.exists(SEED_PATH):
        return
    # Skip if already seeded
    count = await db.countries.count_documents({})
    if count >= 250:
        return
    with open(SEED_PATH, "r", encoding="utf-8") as f:
        countries = json.load(f)
    # Bulk upsert by code
    for c in countries:
        await db.countries.update_one(
            {"code": c["code"]},
            {"$set": {
                "code": c["code"],
                "iso3": c.get("iso3"),
                "name": c.get("name"),
                "native": c.get("native"),
                "phone_code": c.get("phone_code"),
                "currency": c.get("currency"),
                "lat": float(c.get("lat") or 0),
                "lng": float(c.get("lng") or 0),
                "capital": c.get("capital"),
                "timezone": c.get("timezone"),
                "emergency_code": c.get("emergency_code"),
                "unit": c.get("unit", "KMs"),
                "tax1": c.get("tax1", 0.0),
                "tax2": c.get("tax2", 0.0),
                "enable_toll": c.get("enable_toll", False),
                "is_active": True,
            }},
            upsert=True,
        )


@router.get("/countries")
async def list_countries(active_only: bool = True, q: Optional[str] = None):
    """List all countries. Optional search filter by name/code."""
    query = {"is_active": True} if active_only else {}
    if q:
        query["$or"] = [
            {"name": {"$regex": q, "$options": "i"}},
            {"code": {"$regex": q, "$options": "i"}},
            {"iso3": {"$regex": q, "$options": "i"}},
        ]
    items = await db.countries.find(query, {"_id": 0}).sort("name", 1).to_list(300)
    return {"items": items, "total": len(items)}


@router.get("/countries/{code}")
async def get_country(code: str):
    code = code.upper()
    item = await db.countries.find_one({"$or": [{"code": code}, {"iso3": code}]}, {"_id": 0})
    if not item:
        return {"item": None}
    return {"item": item}


@router.get("/phone-codes")
async def list_phone_codes():
    """Compact list for dropdown: country code + phone code + flag."""
    items = await db.countries.find({"is_active": True}, {"_id": 0, "code": 1, "name": 1, "phone_code": 1}).sort("name", 1).to_list(300)
    return {"items": items}


@router.get("/states")
async def list_states_endpoint(country: str):
    """Curated regions/states for a country (cascading admin zone selectors)."""
    from core.geo_scope import list_states
    return {"items": list_states(country)}


@router.get("/cities")
async def list_cities_endpoint(country: str, state: Optional[str] = None):
    """Curated cities for a country (optionally narrowed to a state)."""
    from core.geo_scope import list_cities
    return {"items": list_cities(country, state)}



def _first_public_ip(request: Request) -> Optional[str]:
    """Extract the real client IP from the proxy chain (X-Forwarded-For)."""
    candidates = []
    xff = request.headers.get("x-forwarded-for", "")
    if xff:
        candidates.extend([p.strip() for p in xff.split(",") if p.strip()])
    real = request.headers.get("x-real-ip")
    if real:
        candidates.append(real.strip())
    if request.client and request.client.host:
        candidates.append(request.client.host)
    for ip in candidates:
        try:
            addr = ipaddress.ip_address(ip)
            if not (addr.is_private or addr.is_loopback or addr.is_reserved or addr.is_link_local):
                return ip
        except ValueError:
            continue
    return None


@router.get("/ip-locate")
async def ip_locate(request: Request):
    """Approximate the caller's location from their IP — used as a fallback for
    the ride 'departure' field when browser GPS is blocked (preview iframe) or
    permission is denied. Uses ip-api.com (keyless, server-side HTTP call).

    Guard rail: the app operates in France + French Caribbean (FR/MQ/GP/GF/RE/YT).
    When the IP resolves OUTSIDE this service area (e.g. the preview datacenter in
    the US, or a user on a foreign VPN) we return the default service centre
    (Fort-de-France) instead, so pickups never land on another continent and ride
    estimates stay sane. `fallback: true` signals this happened."""
    default = {"ok": True, "lat": DEFAULT_CENTER["lat"], "lng": DEFAULT_CENTER["lng"],
               "city": "Fort-de-France", "address": "Fort-de-France, Martinique", "fallback": True}
    ip = _first_public_ip(request)
    url = f"http://ip-api.com/json/{ip}" if ip else "http://ip-api.com/json/"
    url += "?fields=status,country,countryCode,regionName,city,lat,lon"
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(url)
        data = resp.json()
    except Exception:
        return default
    if data.get("status") != "success" or data.get("lat") is None:
        return default
    if data.get("countryCode") not in SERVICE_COUNTRIES:
        return default
    address = ", ".join([p for p in [data.get("city"), data.get("regionName"), data.get("country")] if p])
    return {
        "ok": True,
        "lat": data["lat"],
        "lng": data["lon"],
        "city": data.get("city"),
        "address": address or f"{data['lat']:.5f}, {data['lon']:.5f}",
    }
