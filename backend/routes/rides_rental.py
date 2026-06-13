"""Ride rental / mise-à-disposition endpoints (extracted from routes/rides.py — Phase 4).

Hourly/km rental meter lifecycle (start, add-stop, live meter, end) plus the
airport-multiplier and rental-package config readers. Leaf endpoints depending
only on the shared db and the rental-meter calculator.
"""
from datetime import datetime, timezone

from fastapi import APIRouter, Request, HTTPException

from core.config import db
from core.deps import get_current_user
from core.rental_meter import _compute_rental_meter

router = APIRouter(prefix="/rides", tags=["rides"])


async def _get_rental_ride(ride_id: str):
    ride = await db.rides.find_one({"id": ride_id}, {"_id": 0})
    if not ride:
        raise HTTPException(status_code=404, detail="Course introuvable")
    if ride.get("ride_type") != "rental":
        raise HTTPException(status_code=400, detail="Ce n'est pas une mise à disposition")
    return ride


@router.post("/{ride_id}/rental/start")
async def rental_start(ride_id: str, request: Request):
    """Driver starts the rental meter (→ in_progress)."""
    await get_current_user(request)
    ride = await _get_rental_ride(ride_id)
    if ride.get("rental_started_at"):
        return {"message": "Déjà démarré", "rental_started_at": ride["rental_started_at"]}
    now = datetime.now(timezone.utc).isoformat()
    await db.rides.update_one({"id": ride_id}, {"$set": {
        "rental_started_at": now, "status": "in_progress", "started_at": now,
        "rental_gps_km": 0.0, "rental_last_lat": None, "rental_last_lng": None}})
    from core.notifications import create_notification
    await create_notification(ride.get("user_id"), "rental",
                              "⏱️ Mise à disposition démarrée",
                              "Votre chauffeur a démarré le compteur.",
                              data={"url": f"/ride/{ride_id}", "ride_id": ride_id})
    return {"message": "Démarré", "rental_started_at": now}


@router.post("/{ride_id}/rental/add-stop")
async def rental_add_stop(ride_id: str, request: Request):
    """Add a stop to the rental (at booking or live during the ride)."""
    await get_current_user(request)
    ride = await _get_rental_ride(ride_id)
    body = await request.json()
    stop = {
        "address": body.get("address", ""),
        "lat": body.get("lat"),
        "lng": body.get("lng"),
        "added_at": datetime.now(timezone.utc).isoformat(),
    }
    if not stop["address"]:
        raise HTTPException(status_code=400, detail="Adresse requise")
    stops = ride.get("stops") or []
    stops.append(stop)
    await db.rides.update_one({"id": ride_id}, {"$set": {"stops": stops}})
    return {"message": "Arrêt ajouté", "stops": stops}


@router.get("/{ride_id}/rental/meter")
async def rental_meter(ride_id: str, request: Request):
    """Live billing meter (client read-only + driver)."""
    await get_current_user(request)
    ride = await _get_rental_ride(ride_id)
    return _compute_rental_meter(ride)


@router.post("/{ride_id}/rental/end")
async def rental_end(ride_id: str, request: Request):
    """Driver ends the rental: record km + end time, return the final bill preview.

    The driver app then calls the standard completion (POST /{id}/status completed),
    whose rental-aware branch finalises the invoice (package + overage) and earnings.
    """
    await get_current_user(request)
    ride = await _get_rental_ride(ride_id)
    if not ride.get("rental_started_at"):
        raise HTTPException(status_code=400, detail="Le compteur n'a pas démarré")
    if ride.get("status") == "completed":
        raise HTTPException(status_code=400, detail="Course déjà terminée")
    body = await request.json()
    # Default to the GPS-tracked distance (driver can still adjust at the end).
    gps_km = float(ride.get("rental_gps_km") or 0)
    default_km = gps_km if gps_km > 0 else float(ride.get("rental_km_included") or 0)
    actual_km = float(body.get("actual_km", default_km) or 0)
    now = datetime.now(timezone.utc).isoformat()
    await db.rides.update_one({"id": ride_id}, {"$set": {
        "rental_ended_at": now, "rental_actual_km": actual_km}})
    ride["rental_ended_at"] = now
    ride["rental_actual_km"] = actual_km
    return {"message": "Compteur arrêté", "meter": _compute_rental_meter(ride, actual_km=actual_km)}


@router.post("/airport-multipliers")
async def airport_multipliers(request: Request):
    """Return airport fare multiplier config (V3Cube parity)."""
    cfg = await db.app_configurations.find_one(
        {"key": "airport_pricing"}, {"_id": 0, "value": 1}
    ) or {}
    return cfg.get("value") or {
        "multiplier": 1.25,
        "min_fare": 25.0,
        "waiting_fee_per_min": 0.5,
        "currency": "EUR",
    }


@router.post("/rental-packages")
async def rental_packages(request: Request):
    """Return available rental packages (hourly / km bundles)."""
    cfg = await db.app_configurations.find_one(
        {"key": "rental_packages"}, {"_id": 0, "value": 1}
    ) or {}
    return cfg.get("value") or {
        "packages": [
            {"slug": "2h_20km", "label": "2h / 20 km", "hours": 2, "km": 20, "price": 40},
            {"slug": "4h_40km", "label": "4h / 40 km", "hours": 4, "km": 40, "price": 75},
            {"slug": "8h_80km", "label": "8h / 80 km", "hours": 8, "km": 80, "price": 140},
        ],
        "currency": "EUR",
    }
