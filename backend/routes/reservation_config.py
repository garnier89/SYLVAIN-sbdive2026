"""Reservation rules — admin-configurable timings & labels for scheduled bookings.

Stored in `service_configs` (service_key='reservation_rules'), merged with defaults.
Consumed by:
  - routes/rides.py `_expire_dead_pending_rides` (expiry windows),
  - the driver app (start-button label + start delay after acceptance).
"""
from fastapi import APIRouter, Request, HTTPException
from datetime import datetime, timezone

from core.config import db
from core.deps import require_role

router = APIRouter(prefix="/admin/reservation-rules", tags=["reservation-rules"])
public_router = APIRouter(prefix="/config", tags=["reservation-rules-public"])

DEFAULTS = {
    # A scheduled reservation is auto-erased this many minutes AFTER its pickup
    # time (grace for a late driver / delayed start).
    "scheduled_grace_minutes": 60,
    # An immediate request / bid left unaccepted is erased after this many minutes.
    "immediate_expiry_minutes": 10,
    # After accepting a reservation, the driver can cancel for this many minutes;
    # past it the cancel button disappears and the start button becomes active.
    "start_delay_minutes": 20,
    # Editable label of the "start the trip" button on the driver reservation card.
    "start_button_label": "Départ voyage",
}

_INT_BOUNDS = {
    "scheduled_grace_minutes": (0, 1440),
    "immediate_expiry_minutes": (1, 240),
    "start_delay_minutes": (0, 240),
}


async def get_reservation_rules() -> dict:
    doc = await db.service_configs.find_one({"service_key": "reservation_rules"}, {"_id": 0})
    return {**DEFAULTS, **((doc or {}).get("settings") or {})}


@public_router.get("/reservation-rules")
async def public_reservation_rules():
    """Public: only the bits the driver app needs (label + start delay)."""
    r = await get_reservation_rules()
    return {
        "start_delay_minutes": int(r["start_delay_minutes"]),
        "start_button_label": r["start_button_label"],
    }


@router.get("")
async def admin_get_reservation_rules(request: Request):
    await require_role(request, ["admin"], permission="server.settings.edit")
    return await get_reservation_rules()


@router.put("")
async def admin_put_reservation_rules(request: Request):
    await require_role(request, ["admin"], permission="server.settings.edit")
    body = await request.json()
    settings = body.get("settings", body)
    clean = {}
    for key, (lo, hi) in _INT_BOUNDS.items():
        if key in settings:
            try:
                clean[key] = max(lo, min(hi, int(settings[key])))
            except (TypeError, ValueError):
                raise HTTPException(status_code=400, detail=f"Valeur invalide pour {key}")
    if "start_button_label" in settings:
        label = str(settings["start_button_label"] or "").strip()[:40]
        if not label:
            raise HTTPException(status_code=400, detail="Le libellé du bouton ne peut pas être vide")
        clean["start_button_label"] = label
    existing = await db.service_configs.find_one({"service_key": "reservation_rules"}, {"_id": 0, "settings": 1})
    merged = {**((existing or {}).get("settings") or {}), **clean}
    await db.service_configs.update_one(
        {"service_key": "reservation_rules"},
        {"$set": {"service_key": "reservation_rules", "settings": merged,
                  "updated_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True,
    )
    return await get_reservation_rules()
