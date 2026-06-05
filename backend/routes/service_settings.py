"""
Unified, reusable Service Settings framework.

A single admin panel (/admin/services-settings) drives the common configuration of
EVERY service: activation toggle, client banner/note, and pricing fields. Each service
declares its editable fields in SERVICE_REGISTRY so the admin UI renders forms
dynamically (no hard-coded values). Stored in the `service_settings` collection,
keyed by service_key. Client apps read the public endpoint to apply the config.

Services with a richer dedicated editor (e.g. Pharmacy: categories, delivery zones)
expose an `advanced_link` to their full page instead of generic fee fields.
"""
from fastapi import APIRouter, Request, HTTPException
import uuid
from datetime import datetime, timezone
from typing import Optional, Dict, Any
from pydantic import BaseModel

from core.config import db
from core.deps import get_current_user, calculate_distance

router = APIRouter(prefix="/services", tags=["service-settings"])
admin_router = APIRouter(prefix="/admin/services", tags=["service-settings-admin"])


def _num(key, label, default, suffix="€", group="Tarification"):
    return {"key": key, "label": label, "type": "number", "default": default, "suffix": suffix, "group": group}


# Registry: declares every configurable service + its editable fields.
SERVICE_REGISTRY: Dict[str, Dict[str, Any]] = {
    "taxi": {"label": "Taxi", "icon": "Car", "fields": [
        _num("base_fare", "Prise en charge", 2.5),
        _num("per_km", "Prix / km", 1.2),
        _num("per_min", "Prix / min", 0.3),
        _num("min_fare", "Course minimum", 5.0),
        _num("booking_fee", "Frais de réservation", 0.0),
        _num("cancellation_fee", "Frais d'annulation", 0.0),
    ]},
    "moto": {"label": "Moto-taxi", "icon": "Bicycle", "fields": [
        _num("base_fare", "Prise en charge", 1.5),
        _num("per_km", "Prix / km", 0.8),
        _num("per_min", "Prix / min", 0.2),
        _num("min_fare", "Course minimum", 3.0),
    ]},
    "parcels": {"label": "Colis", "icon": "Package", "fields": [
        _num("base_fee", "Frais de base", 3.0),
        _num("per_km", "Prix / km", 0.6),
        _num("per_kg", "Prix / kg", 0.5),
        _num("min_fee", "Frais minimum", 4.0),
    ]},
    "food": {"label": "Food", "icon": "ForkKnife", "fields": [
        _num("delivery_base", "Livraison de base", 2.0),
        _num("delivery_per_km", "Livraison / km", 0.5),
        _num("service_fee_pct", "Frais de service", 5.0, suffix="%"),
        _num("free_delivery_threshold", "Livraison gratuite dès", 25.0),
    ]},
    "delivery": {"label": "Livraison express", "icon": "Bag", "fields": [
        _num("base_fee", "Frais de base", 2.5),
        _num("per_km", "Prix / km", 0.7),
        _num("min_fee", "Frais minimum", 3.0),
    ]},
    "medical_transport": {"label": "Transport médical", "icon": "FirstAid", "fields": [
        _num("base_fare", "Prise en charge", 5.0),
        _num("per_km", "Prix / km", 1.5),
        _num("urgent_surcharge", "Supplément urgence", 10.0),
        _num("min_fare", "Course minimum", 12.0),
    ]},
    # Richer dedicated editor → no generic fee fields here, link to advanced page.
    "pharmacy": {"label": "Pharmacie", "icon": "Pill", "fields": [], "advanced_link": "/admin/pharmacy"},
}

# Defaults applied to every service
COMMON_DEFAULTS = {"active": True, "info_note": ""}


def _defaults_for(key: str) -> dict:
    reg = SERVICE_REGISTRY[key]
    return {
        "service_key": key,
        **COMMON_DEFAULTS,
        "fields": {f["key"]: f["default"] for f in reg["fields"]},
        "zones": [],
    }


async def get_service_settings(key: str) -> dict:
    """Merge stored values over registry defaults (does not persist on read)."""
    if key not in SERVICE_REGISTRY:
        raise HTTPException(status_code=404, detail="Service inconnu")
    base = _defaults_for(key)
    stored = await db.service_settings.find_one({"service_key": key}, {"_id": 0})
    if stored:
        base["active"] = stored.get("active", base["active"])
        base["info_note"] = stored.get("info_note", base["info_note"])
        base["fields"] = {**base["fields"], **(stored.get("fields") or {})}
        base["zones"] = stored.get("zones") or []
    return base


async def point_in_service_area(key: str, lat: float, lng: float) -> bool:
    """True if (lat,lng) is within any radius zone. No radius zones → unrestricted."""
    s = await get_service_settings(key)
    radius_zones = [z for z in (s.get("zones") or [])
                    if z.get("type") == "radius" and z.get("lat") is not None and z.get("radius_km")]
    if not radius_zones:
        return True
    for z in radius_zones:
        if calculate_distance(z["lat"], z["lng"], lat, lng) <= float(z["radius_km"]):
            return True
    return False


async def _require_admin(request: Request):
    user = await get_current_user(request)
    if user["role"] not in ("admin", "dispatcher"):
        raise HTTPException(status_code=403, detail="Accès refusé")
    return user


# ─────────────────────────── Public (client apps) ───────────────────────────
@router.get("/{key}/settings")
async def public_service_settings(key: str, request: Request):
    await get_current_user(request)
    s = await get_service_settings(key)
    return {"service_key": key, "active": s["active"], "info_note": s["info_note"], "fields": s["fields"], "zones": s["zones"]}


# ─────────────────────────── Admin ───────────────────────────
@admin_router.get("/settings")
async def admin_list_settings(request: Request):
    await _require_admin(request)
    out = []
    for key, reg in SERVICE_REGISTRY.items():
        s = await get_service_settings(key)
        out.append({
            "service_key": key,
            "label": reg["label"],
            "icon": reg.get("icon"),
            "advanced_link": reg.get("advanced_link"),
            "fields_schema": reg["fields"],
            "active": s["active"],
            "info_note": s["info_note"],
            "fields": s["fields"],
            "zones": s["zones"],
        })
    return out


class ZoneModel(BaseModel):
    id: Optional[str] = None
    type: str = "radius"   # 'radius' | 'city'
    name: str
    lat: Optional[float] = None
    lng: Optional[float] = None
    radius_km: Optional[float] = None


class ServiceSettingsUpdate(BaseModel):
    active: bool = True
    info_note: str = ""
    fields: Dict[str, Any] = {}
    zones: list[ZoneModel] = []


@admin_router.get("/settings/{key}")
async def admin_get_settings(key: str, request: Request):
    await _require_admin(request)
    reg = SERVICE_REGISTRY.get(key)
    if not reg:
        raise HTTPException(status_code=404, detail="Service inconnu")
    s = await get_service_settings(key)
    return {"service_key": key, "label": reg["label"], "fields_schema": reg["fields"], **s}


@admin_router.put("/settings/{key}")
async def admin_update_settings(key: str, data: ServiceSettingsUpdate, request: Request):
    await _require_admin(request)
    reg = SERVICE_REGISTRY.get(key)
    if not reg:
        raise HTTPException(status_code=404, detail="Service inconnu")
    # keep only known fields, coerce numbers
    allowed = {f["key"]: f for f in reg["fields"]}
    clean_fields = {}
    for k, v in (data.fields or {}).items():
        if k in allowed:
            try:
                clean_fields[k] = round(float(v), 2)
            except (TypeError, ValueError):
                clean_fields[k] = allowed[k]["default"]
    payload = {
        "service_key": key, "active": data.active, "info_note": data.info_note,
        "fields": clean_fields, "zones": _clean_zones(data.zones),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.service_settings.update_one({"service_key": key}, {"$set": payload}, upsert=True)
    return payload


def _clean_zones(zones) -> list:
    out = []
    for z in (zones or []):
        zd = z.model_dump() if hasattr(z, "model_dump") else dict(z)
        if not zd.get("name"):
            continue
        zd["id"] = zd.get("id") or f"zone_{uuid.uuid4().hex[:8]}"
        zd["type"] = zd["type"] if zd.get("type") in ("radius", "city") else "radius"
        if zd["type"] == "radius":
            try:
                zd["lat"] = float(zd["lat"])
                zd["lng"] = float(zd["lng"])
                zd["radius_km"] = float(zd["radius_km"])
            except (TypeError, ValueError):
                # incomplete radius zone → keep as informational city marker
                zd["type"] = "city"
                zd["lat"] = None
                zd["lng"] = None
                zd["radius_km"] = None
        else:
            zd["lat"] = None
            zd["lng"] = None
            zd["radius_km"] = None
        out.append(zd)
    return out
