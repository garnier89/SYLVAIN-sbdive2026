from fastapi import APIRouter, Request, HTTPException
from typing import Optional

from core.config import db
from core.deps import get_current_user, require_role

router = APIRouter(prefix="/config", tags=["configuration"])

# ── Scheduling (programmer une course) configuration ──────────────────────
# Stored in service_configs under service_key="scheduling".
# disabled_modes: liste des modes où la planification n'est PAS autorisée
# (par défaut Pool et Enchères, conformément à la logique métier V3Cube).
DEFAULT_SCHEDULING = {
    "enabled": True,
    "min_advance_minutes": 60,
    "max_advance_days": 30,
    "disabled_modes": ["pool", "bidding"],
}


async def get_scheduling_config():
    """Merge persisted admin settings over the safe defaults."""
    doc = await db.service_configs.find_one({"service_key": "scheduling"}, {"_id": 0})
    settings = (doc or {}).get("settings") or {}
    cfg = {**DEFAULT_SCHEDULING, **settings}
    # Sanitize types
    cfg["enabled"] = bool(cfg.get("enabled", True))
    try:
        cfg["min_advance_minutes"] = max(0, int(cfg.get("min_advance_minutes", 60)))
    except (TypeError, ValueError):
        cfg["min_advance_minutes"] = 60
    try:
        cfg["max_advance_days"] = max(1, int(cfg.get("max_advance_days", 30)))
    except (TypeError, ValueError):
        cfg["max_advance_days"] = 30
    if not isinstance(cfg.get("disabled_modes"), list):
        cfg["disabled_modes"] = DEFAULT_SCHEDULING["disabled_modes"]
    return cfg


@router.get("/scheduling")
async def get_scheduling():
    """Public scheduling config — consumed by the booking hub to gate the
    'Programmer plus tard' option per mode and enforce the min advance time."""
    return await get_scheduling_config()


# ── Ride search relances (no-driver alternatives) configuration ───────────
# Stored in service_configs under service_key="ride_search".
DEFAULT_RIDE_SEARCH = {
    "enabled": True,           # show the no-driver alternatives flow
    "relance_interval_seconds": 20,
    "max_relances": 3,
    # Radar "nearby cars" — admin-configurable little cars shown on the search map.
    "cars_enabled": True,      # show the little cars on the searching radar
    "cars_icon_url": "",       # custom car icon (data-URL or http URL); empty = default
    "cars_simulated_count": 5, # cars to display (real positions first, padded with simulated)
    "cars_radius_m": 600,      # dispersion radius around the pickup (meters)
}


@router.get("/ride-search")
async def get_ride_search_config():
    """Public config driving the auto-relance cadence and the 3-relances
    'Proposer votre tarif / Planifier' alternatives on the searching screen."""
    doc = await db.service_configs.find_one({"service_key": "ride_search"}, {"_id": 0})
    settings = (doc or {}).get("settings") or {}
    cfg = {**DEFAULT_RIDE_SEARCH, **settings}
    cfg["enabled"] = bool(cfg.get("enabled", True))
    try:
        cfg["relance_interval_seconds"] = min(300, max(5, int(cfg.get("relance_interval_seconds", 20))))
    except (TypeError, ValueError):
        cfg["relance_interval_seconds"] = 20
    try:
        cfg["max_relances"] = min(10, max(1, int(cfg.get("max_relances", 3))))
    except (TypeError, ValueError):
        cfg["max_relances"] = 3
    cfg["cars_enabled"] = bool(cfg.get("cars_enabled", True))
    cfg["cars_icon_url"] = str(cfg.get("cars_icon_url") or "")
    try:
        cfg["cars_simulated_count"] = min(12, max(0, int(cfg.get("cars_simulated_count", 5))))
    except (TypeError, ValueError):
        cfg["cars_simulated_count"] = 5
    try:
        cfg["cars_radius_m"] = min(5000, max(100, int(cfg.get("cars_radius_m", 600))))
    except (TypeError, ValueError):
        cfg["cars_radius_m"] = 600
    return cfg


# ── Taxi booking flow + WhatsApp booking configuration ────────────────────
# Stored in service_configs under service_key="taxi_booking".
# Pilote le flux unifié « Choisissez un voyage » et l'option de réservation
# via WhatsApp (numéro + modèle de message), administrables côté admin.
DEFAULT_TAXI_BOOKING = {
    "unified_flow_enabled": True,
    "whatsapp_enabled": False,
    "whatsapp_number": "",
    "booking_header_title": "Planifiez votre trajet",
    "booking_header_eyebrow": "SB Drive · Se déplacer",
    "whatsapp_message_template": (
        "Bonjour SB Drive, je souhaite réserver une course.\n\n"
        "Service : {mode}\nDépart : {pickup}\nDestination : {dropoff}\n"
        "Véhicule : {vehicle}\nPrix estimé : {price}\nQuand : {when}\nPaiement : {payment}"
    ),
}


async def get_taxi_booking_config():
    """Merge persisted admin settings over the safe defaults."""
    doc = await db.service_configs.find_one({"service_key": "taxi_booking"}, {"_id": 0})
    settings = (doc or {}).get("settings") or {}
    cfg = {**DEFAULT_TAXI_BOOKING, **settings}
    cfg["unified_flow_enabled"] = bool(cfg.get("unified_flow_enabled", True))
    cfg["whatsapp_enabled"] = bool(cfg.get("whatsapp_enabled", False))
    cfg["whatsapp_number"] = str(cfg.get("whatsapp_number") or "").strip()
    cfg["booking_header_title"] = str(cfg.get("booking_header_title") or "").strip() or DEFAULT_TAXI_BOOKING["booking_header_title"]
    cfg["booking_header_eyebrow"] = str(cfg.get("booking_header_eyebrow") or "").strip() or DEFAULT_TAXI_BOOKING["booking_header_eyebrow"]
    cfg["whatsapp_message_template"] = (
        str(cfg.get("whatsapp_message_template") or "").strip()
        or DEFAULT_TAXI_BOOKING["whatsapp_message_template"]
    )
    return cfg


@router.get("/taxi-booking")
async def get_taxi_booking():
    """Public booking config — drives the unified 'Choisissez un voyage' flow
    and the WhatsApp booking button (number + prefilled message template)."""
    return await get_taxi_booking_config()


# ── Payment methods configuration ─────────────────────────────────────────
# Stored in service_configs under service_key="payment_methods".
# Admin can enable/disable each method and tune the CB pre-auth margin and the
# "wallet shortfall paid in cash" rule.
PAYMENT_METHODS_BASE = [
    {"id": "cash", "label": "Espèces", "icon": "Money"},
    {"id": "card", "label": "CB", "icon": "CreditCard"},
    {"id": "wallet", "label": "Portefeuille", "icon": "Wallet"},
    {"id": "sbpaygo", "label": "SB PayGo", "icon": "Lightning"},
]


async def get_payment_methods_config():
    doc = await db.service_configs.find_one({"service_key": "payment_methods"}, {"_id": 0})
    settings = (doc or {}).get("settings") or {}
    enabled = {
        "cash": settings.get("pm_cash_enabled", True),
        "card": settings.get("pm_card_enabled", True),
        "wallet": settings.get("pm_wallet_enabled", True),
        "sbpaygo": settings.get("pm_sbpaygo_enabled", True),
    }
    methods = [m for m in PAYMENT_METHODS_BASE if bool(enabled.get(m["id"], True))]
    return {
        "methods": methods,
        "cb_margin_eur": float(settings.get("cb_margin_eur", 1.0) or 0),
        "wallet_shortfall_to_cash": bool(settings.get("wallet_shortfall_to_cash", True)),
        "cancellation_fee_eur": float(settings.get("cancellation_fee_eur", 5.0) or 0),
        "free_cancel_window_minutes": float(settings.get("free_cancel_window_minutes", 5) or 0),
        # Cancellation-policy popup display rules (admin-controlled)
        "cancel_popup_enabled": bool(settings.get("cancel_popup_enabled", True)),
        "cancel_popup_max_shows": max(0, min(50, int(settings.get("cancel_popup_max_shows", 5) or 0))),
        "cancel_popup_zone": str(settings.get("cancel_popup_zone", "") or ""),
    }


@router.get("/payment-methods")
async def get_payment_methods():
    """Public list of enabled payment methods + CB margin + wallet rule."""
    return await get_payment_methods_config()


@router.get("/app")
async def get_app_config():
    """Public app configuration (currency, company info, feature flags)."""
    configs = await db.app_configurations.find({}, {"_id": 0}).to_list(200)
    result = {}
    for c in configs:
        result[c["key"]] = c["value"]
    return result


@router.get("/vehicle-categories")
async def get_vehicle_categories():
    """Get all active vehicle categories (Ride types)."""
    categories = await db.vehicle_categories.find(
        {"status": "active"}, {"_id": 0}
    ).sort("display_order", 1).to_list(50)
    return categories


@router.get("/vehicle-types")
async def get_vehicle_types(category_slug: Optional[str] = None):
    """Get vehicle types with pricing. Optionally filter by category."""
    query = {"status": "active"}
    if category_slug:
        query["category_slug"] = category_slug
    types = await db.vehicle_types.find(query, {"_id": 0}).sort("display_order", 1).to_list(50)
    return types


@router.get("/vehicle-types/{slug}")
async def get_vehicle_type_detail(slug: str):
    """Get a specific vehicle type by slug."""
    vtype = await db.vehicle_types.find_one({"slug": slug, "status": "active"}, {"_id": 0})
    if not vtype:
        raise HTTPException(status_code=404, detail="Vehicle type not found")
    return vtype


@router.get("/nearby-categories")
async def get_nearby_categories():
    """Get nearby business categories."""
    categories = await db.nearby_categories.find({}, {"_id": 0}).sort("display_order", 1).to_list(50)
    return categories


@router.get("/parcel-types")
async def get_parcel_types():
    """Get parcel/delivery package types."""
    types = await db.parcel_package_types.find({}, {"_id": 0}).sort("display_order", 1).to_list(20)
    return types


@router.get("/cancel-reasons")
async def get_cancel_reasons(user_type: Optional[str] = None):
    """Get ride/order cancel reasons. Filter by user_type (User/Driver/Both)."""
    query = {}
    if user_type:
        query["for"] = {"$in": [user_type, "Both"]}
    reasons = await db.cancel_reasons.find(query, {"_id": 0}).sort("display_order", 1).to_list(20)
    return reasons


@router.get("/master-categories")
async def get_master_service_categories():
    """Get master service categories (Taxi, Delivery, UberX, etc.)."""
    categories = await db.master_service_categories.find(
        {"status": "active"}, {"_id": 0}
    ).sort("display_order", 1).to_list(20)
    return categories


@router.get("/track-categories")
async def get_track_categories():
    """Get family/employee tracking categories."""
    categories = await db.track_categories.find({}, {"_id": 0}).to_list(10)
    return categories


# Admin-only config management
@router.get("/admin/all")
async def admin_get_all_configs(request: Request):
    """Get all configurations (admin only)."""
    await require_role(request, ["admin"], permission="server.settings.edit")
    configs = await db.app_configurations.find({}, {"_id": 0}).to_list(500)
    return configs


@router.put("/admin/{key}")
async def admin_update_config(key: str, request: Request):
    """Update a configuration value (admin only)."""
    await require_role(request, ["admin"], permission="server.settings.edit")
    body = await request.json()
    new_value = body.get("value")
    if new_value is None:
        raise HTTPException(status_code=400, detail="Missing 'value' field")
    result = await db.app_configurations.update_one(
        {"key": key}, {"$set": {"value": str(new_value)}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Configuration key not found")
    return {"message": f"Configuration '{key}' updated"}
