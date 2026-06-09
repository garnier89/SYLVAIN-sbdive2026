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


@router.get("/cancel-policy/state")
async def cancel_policy_state(request: Request):
    """Per-user state driving the 'Politique d'annulation' popup.
    Count is stored server-side so the N-shows limit holds across devices."""
    cfg = await get_payment_methods_config()
    count = 0
    try:
        user = await get_current_user(request)
        doc = await db.user_flags.find_one({"user_id": user["id"]}, {"_id": 0, "cancel_popup_count": 1})
        count = int((doc or {}).get("cancel_popup_count", 0) or 0)
    except Exception:
        count = 0
    return {
        "enabled": cfg["cancel_popup_enabled"],
        "max_shows": cfg["cancel_popup_max_shows"],
        "zone": cfg["cancel_popup_zone"],
        "fee": cfg["cancellation_fee_eur"],
        "free_min": cfg["free_cancel_window_minutes"],
        "count": count,
    }


@router.post("/cancel-policy/seen")
async def cancel_policy_seen(request: Request):
    """Increment the current user's popup-shown counter (server-side)."""
    user = await get_current_user(request)
    await db.user_flags.update_one(
        {"user_id": user["id"]},
        {"$inc": {"cancel_popup_count": 1}},
        upsert=True,
    )
    doc = await db.user_flags.find_one({"user_id": user["id"]}, {"_id": 0, "cancel_popup_count": 1})
    return {"count": int((doc or {}).get("cancel_popup_count", 1) or 1)}


# ── Store-review prompt ("Notez-nous sur le Store" après N courses) ──────────
DEFAULT_STORE_REVIEW = {
    "enabled": True,
    "min_rides": 2,
    "android_url": "https://play.google.com/store/apps/details?id=com.sbdrivervtc.client",
    "ios_url": "https://apps.apple.com/fr/app/sb-drive-client/id1444980912",
}


async def get_store_review_config():
    doc = await db.service_configs.find_one({"service_key": "store_review"}, {"_id": 0})
    settings = (doc or {}).get("settings") or {}
    cfg = {**DEFAULT_STORE_REVIEW, **settings}
    cfg["enabled"] = bool(cfg.get("enabled", True))
    try:
        cfg["min_rides"] = max(1, int(cfg.get("min_rides", 2)))
    except (TypeError, ValueError):
        cfg["min_rides"] = 2
    cfg["android_url"] = str(cfg.get("android_url") or "")
    cfg["ios_url"] = str(cfg.get("ios_url") or "")
    return cfg


@router.get("/store-review")
async def store_review_config():
    """Public store-review configuration (links + threshold)."""
    return await get_store_review_config()


@router.put("/admin/store-review")
async def save_store_review_config(request: Request):
    """Admin: persist the store-review prompt configuration."""
    await require_role(request, ["admin"])
    body = await request.json()
    settings = {}
    for key in DEFAULT_STORE_REVIEW:
        if key in body:
            if key == "enabled":
                settings[key] = bool(body[key])
            elif key == "min_rides":
                settings[key] = max(1, int(body[key] or 2))
            else:
                settings[key] = str(body[key] or "")
    await db.service_configs.update_one(
        {"service_key": "store_review"},
        {"$set": {"settings": settings, "service_key": "store_review"}},
        upsert=True,
    )
    return await get_store_review_config()


@router.get("/review-prompt")
async def review_prompt_state(request: Request):
    """Whether to show the store-review prompt to this user: enabled, threshold
    reached (N completed rides) and not previously dismissed."""
    user = await get_current_user(request)
    cfg = await get_store_review_config()
    completed = await db.rides.count_documents({"user_id": user["id"], "status": "completed"})
    flag = await db.user_flags.find_one({"user_id": user["id"]}, {"_id": 0, "store_review_seen": 1}) or {}
    already = bool(flag.get("store_review_seen"))
    show = bool(cfg["enabled"]) and completed >= cfg["min_rides"] and not already
    return {
        "show": show,
        "completed_rides": completed,
        "min_rides": cfg["min_rides"],
        "android_url": cfg["android_url"],
        "ios_url": cfg["ios_url"],
    }


@router.post("/review-prompt/seen")
async def review_prompt_seen(request: Request):
    """Mark the store-review prompt as shown so it is not displayed again."""
    user = await get_current_user(request)
    await db.user_flags.update_one(
        {"user_id": user["id"]},
        {"$set": {"store_review_seen": True}},
        upsert=True,
    )
    return {"ok": True}


@router.post("/review-prompt/feedback")
async def review_prompt_feedback(request: Request):
    """Store low-rating internal feedback (1-3 stars) instead of sending to the store."""
    import uuid as _uuid
    from datetime import datetime as _dt, timezone as _tz
    user = await get_current_user(request)
    body = await request.json()
    await db.app_feedback.insert_one({
        "id": f"fb_{_uuid.uuid4().hex[:10]}",
        "user_id": user["id"],
        "user_name": user.get("name"),
        "rating": int(body.get("rating") or 0),
        "comment": (body.get("comment") or "").strip()[:1000],
        "source": "store_review_prompt",
        "created_at": _dt.now(_tz.utc).isoformat(),
    })
    await db.user_flags.update_one(
        {"user_id": user["id"]}, {"$set": {"store_review_seen": True}}, upsert=True)
    return {"ok": True}



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


# ── App Settings (parité V3Cube "General Settings → App Settings") ─────────
# Stored in service_configs under service_key="app_settings".
# Tableau de bord admin unique persistant l'ensemble des réglages applicatifs.
# Les valeurs par défaut reflètent la configuration V3Cube de référence.
DEFAULT_APP_SETTINGS = {
    # — Réservation / Course —
    "min_hours_later_booking_intercity": 2,
    "radius_intercity_ride": 100,
    "ride_later_hide_cancel_before_min": 45,
    "ride_later_show_start_before_min": 40,
    "min_minutes_later_booking": 60,
    "max_minutes_later_booking": 20160,
    "destination_changeable_anytime": True,
    "enable_ride_fare_model_strategy": True,
    "want_surge_on_flat_fare": True,
    "taxi_hail_option": True,
    "book_for_someone": True,
    "enable_pool": True,
    "max_pickup_days_intercity": 90,
    "max_round_trip_days_intercity": 5,
    "show_service_estimation": True,
    "send_pickup_location_photo": True,
    "restrict_passenger_limit": True,
    # — Destinations / Stops / Pool —
    "enable_driver_destinations": True,
    "max_drive_destinations": 4,
    "enable_stop_over": True,
    "max_stop_over_points": 4,
    "reset_time_driver_destinations": "13:16",
    "radius_show_online_drivers_km": 35,
    "radius_pool_km": 5,
    "radius_destination_driver_km": 5,
    "destination_location_update_interval_min": 1,
    # — Dispatch —
    "driver_request_algorithm": "distance",
    "driver_timeout": 35,
    "rider_timeout_bid_taxi": 60,
    "show_route_on_driver_request": True,
    "restrict_drivers_confirm_before_arrival": True,
    "driver_arrival_distance_limit_m": 8000,
    "approx_time_driver_reach_per_km_min": 5,
    "enable_send_request_before_trip_end": True,
    "send_request_before_trip_end_min": 10,
    "send_request_before_trip_end_distance_km": 2,
    "reassign_after_accept": True,
    "delivery_verification_method": "code",
    "expire_scheduled_booking_after_min": 30,
    "provider_availability_location_customize": True,
    "currency_update_ratio_app_id": "",
    # — Chauffeur —
    "allow_driver_edit_profile": True,
    "allow_driver_edit_vehicle": True,
    "driver_subscription_feature": False,
    "driver_subscription_expiry_reminder_days": 5,
    "enable_idle_insurance_report": True,
    "enable_trip_accept_insurance_report": True,
    "enable_trip_insurance_report": True,
    "ad_banner_driver": True,
    "enable_driver_reward_program": True,
    "enable_driver_wallet_withdrawal": False,
    "driver_wallet_withdrawal_restriction_min": 50,
    # — Taxi Hall (zone de compétition) —
    "taxi_hall_require_competition": False,
    "taxi_hall_min_acceptance_rate": 80,
    "taxi_hall_max_cancellation_rate": 30,
    "taxi_hall_min_activity_score": 0,
    "taxi_hall_min_wallet_balance": 0,
    "taxi_hall_cash_only": True,
    # — Accessibilité / options de course —
    "enable_handicap": True,
    "enable_child_seat": False,
    "enable_gender_based_female": False,
    # — Tarifs & frais —
    "enable_extra_charges_scheduled_rides": True,
    "extra_charges_amount_pct": 5,
    "enable_surge_on_rental": True,
    "enable_waiting_charge_rental": True,
    "enable_waiting_charge_flat_fare": True,
    "enable_manual_toll": False,
    "enable_other_charges": False,
    "airport_surcharge": True,
    "manage_rounding": True,
    # — Pourboire —
    "enable_tip": True,
    "ride_tip_amount_1": 10,
    "ride_tip_amount_2": 20,
    "ride_tip_amount_3": 30,
    "tip_duration_on_receipt": 7,
    # — Récompenses / Parrainage —
    "enable_rider_reward_program": False,
    "max_trips_rider_rewards": 40,
    "trip_specific_max_reward_amount": 1,
    "coin_to_rider_amount": 1,
    "coins_per_km_rider_reward": 1,
    "enable_gift_card": True,
    "gift_card_max_amount": 1000,
    "enable_favorite_driver": False,
    "enable_referral_system": True,
    "enable_multi_level_referral": False,
    "referral_amount_credit": 5,
    "referral_level": 15,
    "referral_earn_strategy": "fixed",
    "bid_price_avg_deduction_pct": 1,
    # — Fonctionnalités —
    "enable_live_chat": True,
    "live_chat_licence_number": "",
    "enable_news": True,
    "enable_donation": True,
    "enable_corporate_profile": True,
    "in_transit_shopping": True,
    "newsletter_subscription": True,
    "waybill_configuration": True,
    "enable_app_home_layout_2024": True,
    "enable_location_wise_promo": True,
    "enable_smart_login": True,
    "enable_skip_rating": True,
    "rating_duration_on_receipt": 10,
    "ask_otp_before_start": True,
    "country_wise_notification": True,
    "location_wise_banner": True,
    "ad_banner_rider": False,
    "ad_frequency_min": 5,
    # — Sécurité / Vérification —
    "enable_face_mask_verification": False,
    "enable_safety_rating": True,
    "enable_safety_checklist_covid": False,
    "enable_cookie_consent": True,
    "verification_code_resend_time_sec": 50,
    "verification_code_resend_count": 10,
    "verification_code_resend_restriction_min": 10,
    "verification_resend_restriction_min_emergency": 7,
    "verification_resend_count_emergency": 7,
    "verification_resend_time_sec_emergency": 60,
    "kiosk_booking_confirm_display_sec": 60,
    "mobile_verification_method": "firebase",
    "sign_in_option": "password",
    "calling_method": "voip",
    "flag_riders_hours": 24,
    "show_contacts_selected_count": 5,
    "disable_language_option": False,
}

# Type map used to coerce stored values on read (keeps the API contract stable).
_APP_SETTINGS_BOOL = {k for k, v in DEFAULT_APP_SETTINGS.items() if isinstance(v, bool)}
_APP_SETTINGS_INT = {k for k, v in DEFAULT_APP_SETTINGS.items()
                     if isinstance(v, int) and not isinstance(v, bool)}


async def get_app_settings_config(zone=None):
    """Merge persisted admin App Settings over the V3Cube-parity defaults.

    `zone` is a resolved {country,state,city} dict (e.g. from the ride pickup) or
    None for the global config. When a zone is supplied, the MOST SPECIFIC stored
    zone override (city > state > country) is returned as a FULL settings set
    (still merged over defaults so every key is present). Falls back to global."""
    settings = {}
    if zone and (zone.get("country") or "").strip():
        c = (zone["country"] or "").strip().upper()
        s = (zone.get("state") or "").strip()
        city = (zone.get("city") or "").strip()
        candidates = []
        if s and city:
            candidates.append("|".join([c, s, city]))
        if s:
            candidates.append("|".join([c, s]))
        candidates.append(c)
        for zk in candidates:
            doc = await db.service_configs.find_one({"service_key": "app_settings", "zone_key": zk}, {"_id": 0})
            if doc and doc.get("settings"):
                settings = doc["settings"]
                break
    if not settings:
        doc = (await db.service_configs.find_one({"service_key": "app_settings", "zone_key": {"$exists": False}}, {"_id": 0})
               or await db.service_configs.find_one({"service_key": "app_settings", "zone_key": ""}, {"_id": 0}))
        settings = (doc or {}).get("settings") or {}
    cfg = {**DEFAULT_APP_SETTINGS, **{k: v for k, v in settings.items() if k in DEFAULT_APP_SETTINGS}}
    for k in _APP_SETTINGS_BOOL:
        cfg[k] = bool(cfg.get(k))
    for k in _APP_SETTINGS_INT:
        try:
            cfg[k] = int(cfg.get(k))
        except (TypeError, ValueError):
            cfg[k] = DEFAULT_APP_SETTINGS[k]
    return cfg


def _app_zone_key(scope) -> str:
    """Build a stable storage key for a zone scope. '' = global."""
    scope = scope or {}
    c = (scope.get("country") or "").strip().upper()
    if not c:
        return ""
    parts = [c]
    s = (scope.get("state") or "").strip()
    city = (scope.get("city") or "").strip()
    if s:
        parts.append(s)
    if city:
        parts.append(city)
    return "|".join(parts)


@router.get("/app-settings")
async def get_app_settings(country: str = "", state: str = "", city: str = ""):
    """Public app settings — feature flags & limits consumed by rider/driver apps.
    Optional country/state/city resolve a zone-specific override (full set)."""
    zone = {"country": country, "state": state, "city": city} if country else None
    return await get_app_settings_config(zone)


@router.put("/admin/app-settings")
async def admin_update_app_settings(request: Request):
    """Persist the full App Settings panel (admin only). An optional `_zone`
    {country,state,city} in the body stores a per-zone override (full set);
    without it (or empty country) the GLOBAL config is updated."""
    from core.geo_scope import clean_scope
    await require_role(request, ["admin"], permission="server.settings.edit")
    body = await request.json()
    incoming = dict(body) if isinstance(body, dict) else {}
    zone_raw = incoming.pop("_zone", None)
    scope = clean_scope(zone_raw) if zone_raw else {"country": "", "state": "", "city": ""}
    zk = _app_zone_key(scope)
    clean = {}
    for k, default in DEFAULT_APP_SETTINGS.items():
        if k not in incoming:
            continue
        v = incoming[k]
        if isinstance(default, bool):
            clean[k] = bool(v)
        elif isinstance(default, int):
            try:
                clean[k] = int(v)
            except (TypeError, ValueError):
                clean[k] = default
        else:
            clean[k] = str(v) if v is not None else ""
    if zk:
        await db.service_configs.update_one(
            {"service_key": "app_settings", "zone_key": zk},
            {"$set": {"service_key": "app_settings", "zone_key": zk, "scope": scope, "settings": clean}},
            upsert=True,
        )
        return await get_app_settings_config(scope)
    await db.service_configs.update_one(
        {"service_key": "app_settings", "zone_key": {"$exists": False}},
        {"$set": {"service_key": "app_settings", "settings": clean}},
        upsert=True,
    )
    return await get_app_settings_config()


@router.get("/admin/app-settings/zones")
async def list_app_settings_zones(request: Request):
    """List zones that have a per-zone App Settings override (admin selector)."""
    await require_role(request, ["admin"], permission="server.settings.edit")
    docs = await db.service_configs.find(
        {"service_key": "app_settings", "zone_key": {"$exists": True, "$nin": ["", None]}},
        {"_id": 0, "zone_key": 1, "scope": 1},
    ).to_list(300)
    return {"zones": [{"zone_key": d["zone_key"], "scope": d.get("scope", {})} for d in docs]}


# ── General Settings (parité V3Cube "General Settings → General") ──────────
# Branding, unités, mode maintenance, liens d'app. Stored under "general_settings".
DEFAULT_GENERAL_SETTINGS = {
    "project_name": "SB Drive VTC",
    "support_email": "",
    "support_phone": "",
    "support_whatsapp": "",
    "company_address": "",
    "copyright_admin": "© SB Drive VTC",
    "copyright_website": "© SB Drive VTC",
    "email_from_name": "SB Drive VTC",
    "country_code": "FR",
    "default_distance_unit": "km",
    "records_per_page": 50,
    "enable_24hr_format": True,
    "maintenance_mode_website": False,
    "maintenance_mode_apps": False,
    "enable_high_demand_areas": True,
    "high_demand_radius_km": 25,
    "google_analytics_id": "",
    "android_app_link": "",
    "ios_app_link": "",
}
_GENERAL_BOOL = {k for k, v in DEFAULT_GENERAL_SETTINGS.items() if isinstance(v, bool)}
_GENERAL_INT = {k for k, v in DEFAULT_GENERAL_SETTINGS.items()
                if isinstance(v, int) and not isinstance(v, bool)}


async def get_general_settings_config():
    doc = await db.service_configs.find_one({"service_key": "general_settings"}, {"_id": 0})
    settings = (doc or {}).get("settings") or {}
    cfg = {**DEFAULT_GENERAL_SETTINGS, **{k: v for k, v in settings.items() if k in DEFAULT_GENERAL_SETTINGS}}
    for k in _GENERAL_BOOL:
        cfg[k] = bool(cfg.get(k))
    for k in _GENERAL_INT:
        try:
            cfg[k] = int(cfg.get(k))
        except (TypeError, ValueError):
            cfg[k] = DEFAULT_GENERAL_SETTINGS[k]
    return cfg


@router.get("/general-settings")
async def get_general_settings():
    """Public general/branding settings consumed across web + apps."""
    return await get_general_settings_config()


@router.put("/admin/general-settings")
async def admin_update_general_settings(request: Request):
    """Persist the General Settings panel (admin only)."""
    await require_role(request, ["admin"], permission="server.settings.edit")
    body = await request.json()
    incoming = body if isinstance(body, dict) else {}
    clean = {}
    for k, default in DEFAULT_GENERAL_SETTINGS.items():
        if k not in incoming:
            continue
        v = incoming[k]
        if isinstance(default, bool):
            clean[k] = bool(v)
        elif isinstance(default, int):
            try:
                clean[k] = int(v)
            except (TypeError, ValueError):
                clean[k] = default
        else:
            clean[k] = str(v) if v is not None else ""
    await db.service_configs.update_one(
        {"service_key": "general_settings"},
        {"$set": {"service_key": "general_settings", "settings": clean}},
        upsert=True,
    )
    return await get_general_settings_config()


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
