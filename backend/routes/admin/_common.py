from fastapi import APIRouter, Request, HTTPException
from datetime import datetime, timezone, timedelta
import uuid
import os

from core.config import db
from core.deps import require_role

router = APIRouter(prefix="/admin", tags=["admin"])


# ===== VEHICLE TYPE — full configuration schema (V3Cube parity) =====
VT_FIELDS = [
    # identity & display
    "name_fr", "name_en", "name_translations", "name_rental", "category",
    "icon_type", "show_as", "info", "currency", "display_order",
    # feature toggles
    "allow_whatsapp_booking", "enable_pool", "assist_available", "pet_friendly",
    "ask_otp_before_ride", "fare_model_strategy", "pool_percentage",
    # base pricing
    "price_per_km", "price_per_min", "min_fare", "base_fare", "commission_percent",
    "zone_overrides",
    # waiting & cancellation
    "user_cancel_time_limit", "user_cancel_charges", "waiting_time_limit",
    "waiting_charges", "intransit_waiting_fee_per_min", "cancellation_fare",
    # capacity & surge
    "person_capacity", "peak_slot1", "peak_slot2", "night_charges",
    # driver sub-category gating (Particulier / VTC / Taxi)
    "allowed_taxi_subs",
    # images
    "image_unselected", "image_selected",
]

VT_DEFAULTS = {
    "name_fr": "", "name_en": "", "name_translations": {}, "name_rental": "",
    "category": "ride", "icon_type": "Car", "show_as": "list", "info": "",
    "currency": "EUR", "display_order": 99,
    "allow_whatsapp_booking": False, "enable_pool": False, "assist_available": False,
    "pet_friendly": False, "ask_otp_before_ride": False, "fare_model_strategy": "incremental",
    "pool_percentage": 90.0,
    "price_per_km": 1.5, "price_per_min": 0.3, "min_fare": 10.0, "base_fare": 5.0,
    "commission_percent": 15.0, "zone_overrides": [],
    "user_cancel_time_limit": 5, "user_cancel_charges": 4.0, "waiting_time_limit": 1,
    "waiting_charges": 20.0, "intransit_waiting_fee_per_min": 0.3, "cancellation_fare": 5.0,
    "person_capacity": 4,
    "peak_slot1": {"enabled": False, "days": {}}, "peak_slot2": {"enabled": False, "days": {}},
    "night_charges": {"enabled": False, "days": {}},
    "allowed_taxi_subs": ["particulier", "vtc", "taxi"],
    "image_unselected": None, "image_selected": None,
}


# ===== DEFAULT REWARDS / POINTS CONFIG =====
DEFAULT_REWARDS_CONFIG = {
    "regard_vehicles": [
        {"id": "rv_car", "type": "Voiture", "icon": "Car", "active": True, "start_date": "", "end_date": "", "start_time": "06:00", "end_time": "23:00", "zone": "Martinique", "bonus_per_trip": 3, "min_trips": 5, "description": "Bonus course voiture"},
        {"id": "rv_moto", "type": "Moto", "icon": "Motorcycle", "active": False, "start_date": "", "end_date": "", "start_time": "08:00", "end_time": "22:00", "zone": "Paris", "bonus_per_trip": 2, "min_trips": 8, "description": "Bonus course moto"},
        {"id": "rv_velo", "type": "Velo", "icon": "Bicycle", "active": False, "start_date": "", "end_date": "", "start_time": "07:00", "end_time": "21:00", "zone": "Fort-de-France", "bonus_per_trip": 1.5, "min_trips": 10, "description": "Bonus course velo"},
    ],
    "guarantees": [
        {"id": "g_day", "name": "Garantie Journee Standard", "active": True, "start_hour": "12:00", "end_hour": "20:00", "min_revenue": 59, "acceptance_rate": 80, "max_cancellation": 10, "zone": "Martinique", "start_date": "", "end_date": "", "description": "Entre 12h et 20h, CA min 59EUR"},
    ],
    "points": {
        "initial_points": 100,
        "points_per_ride_accepted": 2,
        "points_per_ride_completed": 3,
        "points_lost_per_refuse": 5,
        "points_lost_per_cancel": 10,
        "palettes": [
            {"id": "p1", "name": "Debutant", "min_points": 0, "max_points": 30, "priority_access": False, "max_ride_amount": 20, "color": "#EF4444"},
            {"id": "p2", "name": "Standard", "min_points": 31, "max_points": 60, "priority_access": False, "max_ride_amount": 50, "color": "#F59E0B"},
            {"id": "p3", "name": "Confirme", "min_points": 61, "max_points": 80, "priority_access": True, "max_ride_amount": 100, "color": "#3B82F6"},
            {"id": "p4", "name": "Expert", "min_points": 81, "max_points": 100, "priority_access": True, "max_ride_amount": 999, "color": "#10B981"},
        ],
    },
    # Fixed per-ride bonus credited to the driver at ride completion, based on
    # their Taxi sub-category (Particulier / VTC / Taxi licence). €.
    "sub_category_bonus": {
        "enabled": False,
        "particulier": 0.0,
        "vtc": 0.0,
        "taxi": 0.0,
    },
}


def _rewards_zone_candidates(zone) -> list:
    """Ordered, most-specific-first zone_keys to try (city > state > country).

    Returns [] when no country is supplied (→ caller uses the global config)."""
    c = (zone or {}).get("country") if zone else None
    c = (c or "").strip().upper()
    if not c:
        return []
    s = (zone.get("state") or "").strip()
    city = (zone.get("city") or "").strip()
    candidates = []
    if s and city:
        candidates.append("|".join([c, s, city]))
    if s:
        candidates.append("|".join([c, s]))
    candidates.append(c)
    return candidates


def _merge_rewards_settings(settings) -> dict:
    """Merge stored settings over the defaults; falsy fields fall back to defaults.

    `settings` falsy (None/empty) → the full DEFAULT_REWARDS_CONFIG is returned."""
    if not settings:
        return DEFAULT_REWARDS_CONFIG
    return {
        "regard_vehicles": settings.get("regard_vehicles") or DEFAULT_REWARDS_CONFIG["regard_vehicles"],
        "guarantees": settings.get("guarantees") or DEFAULT_REWARDS_CONFIG["guarantees"],
        "points": settings.get("points") or DEFAULT_REWARDS_CONFIG["points"],
        "sub_category_bonus": settings.get("sub_category_bonus") or DEFAULT_REWARDS_CONFIG["sub_category_bonus"],
    }


async def get_rewards_config(zone=None):
    """Return the rewards config merged with defaults.

    When `zone` ({country,state,city}) is supplied, the MOST SPECIFIC stored zone
    override (city > state > country) is returned, falling back to the GLOBAL config.
    `zone=None` (default) → global config (backward compatible)."""
    settings = None
    for zk in _rewards_zone_candidates(zone):
        doc = await db.service_configs.find_one({"service_key": "rewards", "zone_key": zk}, {"_id": 0})
        if doc and doc.get("settings"):
            settings = doc["settings"]
            break
    if settings is None:
        doc = (await db.service_configs.find_one({"service_key": "rewards", "zone_key": {"$exists": False}}, {"_id": 0})
               or await db.service_configs.find_one({"service_key": "rewards", "zone_key": ""}, {"_id": 0}))
        settings = (doc or {}).get("settings")
    return _merge_rewards_settings(settings)


def _rewards_zone_key(scope) -> str:
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


# ===== DRIVER CATEGORIES (registration tree — documents & vehicle class) =====
# Phase 2: admin CRUD over the `driver_categories` collection seeded in drivers.py.
DC_SERVICES = {"taxi", "courier", "delivery"}
DC_VEHICLE_CLASSES = {"car", "moto", "velo"}
DC_TAXI_SUBS = {"particulier", "vtc", "taxi"}


def _dc_validate_service_class(body, base):
    """Validate + normalise the service and vehicle_class. Raises 400 on bad input."""
    service = (body.get("service") or base.get("service") or "").strip().lower()
    vehicle_class = (body.get("vehicle_class") or base.get("vehicle_class") or "").strip().lower()
    if service not in DC_SERVICES:
        raise HTTPException(status_code=400, detail="Service invalide (taxi, courier ou delivery)")
    if vehicle_class not in DC_VEHICLE_CLASSES:
        raise HTTPException(status_code=400, detail="Type de véhicule invalide (car, moto ou velo)")
    return service, vehicle_class


def _dc_resolve_taxi_sub(body, base, service, vehicle_class):
    """taxi_sub is only meaningful for a taxi service on a car; else forced None."""
    taxi_sub = body.get("taxi_sub", base.get("taxi_sub"))
    if taxi_sub in ("", "none", "null"):
        taxi_sub = None
    if taxi_sub is not None and taxi_sub not in DC_TAXI_SUBS:
        raise HTTPException(status_code=400, detail="Sous-catégorie taxi invalide")
    if not (service == "taxi" and vehicle_class == "car"):
        taxi_sub = None
    return taxi_sub


def _dc_clean_documents(raw_docs):
    """Whitelist required documents: strip, dedup by key, drop incomplete rows."""
    docs, seen = [], set()
    for d in (raw_docs or []):
        key = (d.get("key") or "").strip()
        dlabel = (d.get("label") or "").strip()
        if key and dlabel and key not in seen:
            seen.add(key)
            docs.append({"key": key, "label": dlabel})
    if not docs:
        raise HTTPException(status_code=400, detail="Ajoutez au moins un document requis")
    return docs


def _dc_parse_order(body, base):
    try:
        return int(body.get("order", base.get("order", 99)))
    except (TypeError, ValueError):
        return 99


def _clean_driver_category(body, existing=None):
    """Whitelist + validate a driver-category payload. Returns a doc dict (no _id)."""
    base = dict(existing) if existing else {}
    service, vehicle_class = _dc_validate_service_class(body, base)
    taxi_sub = _dc_resolve_taxi_sub(body, base, service, vehicle_class)
    label = (body.get("label") or base.get("label") or "").strip()
    if not label:
        raise HTTPException(status_code=400, detail="Le libellé est requis")
    docs = _dc_clean_documents(body.get("documents", base.get("documents") or []))
    order = _dc_parse_order(body, base)
    active = body.get("active", base.get("active", True))
    return {
        "service": service, "vehicle_class": vehicle_class, "taxi_sub": taxi_sub,
        "label": label, "documents": docs, "order": order, "active": bool(active),
    }


# ===== ADMIN MANUAL DRIVER CREATION / DELETION (CRM) =====

DRIVER_TAXI_SUBS = {"particulier", "vtc", "taxi"}
DRIVER_SERVICES = {"taxi", "delivery", "courier"}


def _derive_vehicle_class(vehicle_type, taxi_mode):
    """Best-effort vehicle class from the chosen type / taxi mode."""
    vt = (vehicle_type or "").lower()
    if taxi_mode == "moto" or any(k in vt for k in ("moto", "scooter", "bike")):
        return "moto"
    if any(k in vt for k in ("velo", "vélo", "bicy", "cycle")):
        return "velo"
    return "car"


def _generate_password(n: int = 10) -> str:
    """Readable random password for bulk-imported accounts."""
    import secrets
    import string
    alphabet = string.ascii_letters + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(n))


async def _create_driver_internal(body, *, password: str):
    """Shared driver-account creation (validation + insert). `password` is the final
    plaintext (resolved/generated by the caller). Raises HTTPException on bad input.
    Returns {driver, user, password}."""
    from core.deps import hash_password
    first_name = (body.get("first_name") or "").strip()
    last_name = (body.get("last_name") or "").strip()
    email = (body.get("email") or "").strip().lower()
    if not first_name or not email:
        raise HTTPException(400, "Prénom et email sont requis")
    if not password or len(password) < 6:
        raise HTTPException(400, "Le mot de passe doit contenir au moins 6 caractères")
    await _assert_email_available(email)
    phone_code = (body.get("phone_code") or "").strip()
    full_phone = _compose_full_phone(body.get("phone"), phone_code)
    await _assert_phone_available(full_phone)

    service_types = [s for s in (body.get("service_types") or []) if s in DRIVER_SERVICES] or ["taxi"]
    taxi_sub = (body.get("taxi_sub") or "").strip().lower() or None
    if taxi_sub and taxi_sub not in DRIVER_TAXI_SUBS:
        raise HTTPException(400, "Sous-catégorie invalide (particulier, vtc ou taxi)")
    taxi_mode = None
    if "taxi" in service_types:
        taxi_mode = (body.get("taxi_mode") or "car").strip().lower()
        if taxi_mode not in {"car", "moto"}:
            raise HTTPException(400, "Mode taxi invalide (car ou moto)")
    company_name = (body.get("company_name") or "").strip()
    if taxi_sub in {"vtc", "taxi"} and not company_name:
        raise HTTPException(400, "Le nom de la société/flotte est requis pour un chauffeur Taxi/VTC")

    vehicle_type = (body.get("vehicle_type") or "").strip()
    vehicle_class = _derive_vehicle_class(vehicle_type, taxi_mode)
    status = (body.get("status") or "approved").strip().lower()
    if status not in {"approved", "pending"}:
        status = "approved"

    now = datetime.now(timezone.utc).isoformat()
    user_id = f"user_{uuid.uuid4().hex[:12]}"
    user_doc = {
        "id": user_id, "email": email, "password_hash": hash_password(password),
        "first_name": first_name, "last_name": last_name,
        "name": f"{first_name} {last_name}".strip() or email,
        "phone": full_phone or None, "phone_code": phone_code or None,
        "role": "driver", "is_verified": True, "is_suspended": False,
        "avatar_url": body.get("avatar_url"), "created_at": now,
    }
    await db.users.insert_one(user_doc)
    await db.wallets.insert_one({"user_id": user_id, "balance": 0.0, "currency": "EUR", "created_at": now})

    driver = {
        "id": f"driver_{uuid.uuid4().hex[:12]}", "user_id": user_id,
        "vehicle_type": vehicle_type, "vehicle_class": vehicle_class,
        "vehicle_number": (body.get("vehicle_number") or "").strip(),
        "vehicle_model": (body.get("vehicle_model") or "").strip(),
        "license_number": (body.get("license_number") or "").strip(),
        "company_name": company_name, "service_types": service_types,
        "taxi_mode": taxi_mode, "taxi_sub": taxi_sub,
        "status": status, "is_online": False,
        "current_lat": None, "current_lng": None,
        "rating": 5.0, "total_trips": 0, "earnings": 0.0,
        "documents": [], "created_by": "admin", "created_at": now,
    }
    await db.drivers.insert_one(driver)
    driver.pop("_id", None)
    # Invitation email (best-effort, never blocks/aborts creation or import).
    try:
        from core.email import fire, send_account_invite
        frontend = os.environ.get("FRONTEND_URL", "").rstrip("/")
        if email and not email.endswith("@sbdrive.local"):
            fire(send_account_invite(email, user_doc["name"], role_label="Chauffeur",
                                     login_email=email, temp_password=password,
                                     login_url=f"{frontend}/login"))
    except Exception:
        pass
    return {"driver": driver,
            "user": {k: user_doc[k] for k in ("id", "email", "name", "phone", "role")},
            "password": password}


# ===== ADMIN MANUAL MERCHANT CREATION / DELETION (CRM) =====

async def _create_merchant_internal(body, *, password: str):
    """Shared merchant-account creation (validation + insert). Returns {merchant, user, password}."""
    from core.deps import hash_password
    name = (body.get("name") or "").strip()
    email = (body.get("email") or "").strip().lower()
    store_name = (body.get("store_name") or "").strip()
    if not name or not email or not store_name:
        raise HTTPException(400, "Nom, email et nom de boutique sont requis")
    if not password or len(password) < 6:
        raise HTTPException(400, "Le mot de passe doit contenir au moins 6 caractères")
    await _assert_email_available(email)
    full_phone = _compose_full_phone(body.get("phone"), body.get("phone_code"))
    await _assert_phone_available(full_phone)
    now = datetime.now(timezone.utc).isoformat()
    user_id = f"user_{uuid.uuid4().hex[:12]}"
    await db.users.insert_one({
        "id": user_id, "email": email, "password_hash": hash_password(password),
        "name": name, "phone": full_phone or None, "role": "merchant",
        "is_verified": True, "avatar_url": None, "created_at": now,
    })
    await db.wallets.insert_one({"user_id": user_id, "balance": 0.0, "currency": "EUR", "created_at": now})
    merchant = {
        "id": f"merchant_{uuid.uuid4().hex[:12]}", "user_id": user_id,
        "store_name": store_name, "store_type": (body.get("store_type") or "restaurant").strip(),
        "address": (body.get("address") or "").strip(),
        "lat": body.get("lat"), "lng": body.get("lng"),
        "description": (body.get("description") or "").strip(),
        "rating": 5.0, "review_count": 0, "total_orders": 0,
        "approval_status": "approved", "is_active": True, "accepting_orders": True,
        "opening_hours": "09:00-22:00", "image_url": None,
        "created_by": "admin", "created_at": now,
    }
    await db.merchants.insert_one(merchant)
    merchant.pop("_id", None)
    # Invitation email (best-effort).
    try:
        from core.email import fire, send_account_invite
        frontend = os.environ.get("FRONTEND_URL", "").rstrip("/")
        if email and not email.endswith("@sbdrive.local"):
            fire(send_account_invite(email, name, role_label="Marchand",
                                     login_email=email, temp_password=password,
                                     login_url=f"{frontend}/login"))
    except Exception:
        pass
    return {"merchant": merchant, "user": {"id": user_id, "email": email, "name": name}, "password": password}


# ===== ADMIN BULK CSV IMPORT (drivers & merchants) =====

def _split_multi(value: str):
    """Split a CSV cell on | ; or , into a clean lowercased list."""
    import re as _re
    return [s.strip().lower() for s in _re.split(r"[|;,]", value or "") if s.strip()]


def _read_csv_rows(csv_text: str):
    """Parse raw CSV text → list of {header: value} dicts (header & values stripped)."""
    import csv as _csv
    import io as _io
    if not (csv_text or "").strip():
        raise HTTPException(400, "Fichier CSV vide")
    reader = _csv.DictReader(_io.StringIO(csv_text))
    rows = []
    for raw in reader:
        rows.append({(k or "").strip(): (v or "").strip() for k, v in raw.items() if k is not None})
    if not rows:
        raise HTTPException(400, "Aucune ligne de données dans le CSV")
    return rows


def _compose_full_phone(phone, phone_code):
    """Normalize phone + country code into a single E.164-ish string."""
    phone = (phone or "").strip().replace(" ", "")
    code = (phone_code or "").strip()
    if code and not phone.startswith("+"):
        return f"{code}{phone}"
    return phone


async def _assert_email_available(email, exclude_id=None):
    q = {"email": email}
    if exclude_id:
        q["id"] = {"$ne": exclude_id}
    if await db.users.find_one(q):
        raise HTTPException(400, "Email déjà utilisé")


async def _assert_phone_available(full_phone, exclude_id=None):
    if not full_phone:
        return
    q = {"phone": full_phone}
    if exclude_id:
        q["id"] = {"$ne": exclude_id}
    if await db.users.find_one(q):
        raise HTTPException(400, "Numéro déjà utilisé")


def _collect_user_updates(body, user):
    """Build the $set dict for a user update from the request body (sync part)."""
    from core.deps import hash_password
    updates = {}
    for field in ("first_name", "last_name", "gender", "country", "language", "currency", "avatar_url", "phone_code"):
        if body.get(field) is not None:
            updates[field] = body[field]
    if body.get("first_name") is not None or body.get("last_name") is not None:
        fn = body.get("first_name", user.get("first_name", ""))
        ln = body.get("last_name", user.get("last_name", ""))
        updates["name"] = f"{fn} {ln}".strip() or user.get("name") or user.get("email")
    if body.get("password"):
        updates["password_hash"] = hash_password(body["password"])
    if body.get("is_active") is not None:
        updates["is_suspended"] = not bool(body["is_active"])
    return updates


async def _ride_status_map():
    res = await db.rides.aggregate([{"$group": {"_id": "$status", "count": {"$sum": 1}}}]).to_list(20)
    return {r["_id"]: r["count"] for r in res}


async def _earnings_summary():
    """Total completed-ride revenue and count."""
    res = await db.rides.aggregate([
        {"$match": {"status": "completed"}},
        {"$group": {"_id": None, "total": {"$sum": "$final_fare"}, "count": {"$sum": 1}}},
    ]).to_list(1)
    total = res[0]["total"] if res else 0
    count = res[0]["count"] if res else 0
    return total, count


def _extract_city(address: str):
    """Extract a city name from a free-form address string.
    e.g. 'Pl. Louis Armand, 75012 Paris, France' -> 'Paris'
         'Fort-de-France, Martinique' -> 'Fort-de-France'"""
    if not address or not isinstance(address, str):
        return None
    parts = [p.strip() for p in address.split(",") if p.strip()]
    if not parts:
        return None
    # Drop a trailing country token if present
    countries = {"france", "martinique", "guadeloupe", "guyane", "réunion", "reunion"}
    if len(parts) >= 2 and parts[-1].lower() in countries:
        candidate = parts[-2]
    else:
        candidate = parts[-1]
    # Strip a leading postal code (4-5 digits)
    import re as _re
    candidate = _re.sub(r"^\d{4,5}\s*", "", candidate).strip()
    return candidate or None


def _is_valid_city(city: str):
    if not city or len(city) < 3:
        return False
    low = city.lower()
    if low.startswith("test") or "test " in low or " test" in low or "position" in low or "actuelle" in low:
        return False
    if low in {"a", "n/a", "null", "undefined", "adresse", "full flow test pickup"}:
        return False
    return True


# ===== CRUD ITEMS (groups, vehicles, company, etc.) =====

ALLOWED_CRUD = [
    "groups", "vehicles", "companies", "hotels", "organizations", "pending_requests",
    "vehicle_makes", "vehicle_models", "cancel_reasons", "email_templates", "sms_templates",
    "master_services", "sos_requests", "contact_requests", "withdraw_requests",
    "order_help_requests", "trip_help_requests", "push_notifications",
    "payouts", "settlements", "disputes", "documents",
    "banners", "wallet_requests", "news", "newsletter_subscribers", "promocodes",
    "beauty_salons", "pet_providers", "car_services", "towing_partners",
    "nearby_businesses", "ondemand_services", "carpool_trips", "marketplace_listings",
    "weather_surcharge", "personal_driver", "auto_promotions", "vouchers",
    "faqs", "help_articles", "donations",
]


def _crud_col(collection: str):
    if collection not in ALLOWED_CRUD:
        raise HTTPException(status_code=400, detail="Invalid collection")
    return db[f"admin_{collection}"]


def _time_slot(hour: int) -> str:
    slots = [(0, 6, "Nuit (00-06)"), (6, 9, "Matin (06-09)"), (9, 12, "Matinée (09-12)"),
             (12, 15, "Midi (12-15)"), (15, 18, "Après-midi (15-18)"), (18, 21, "Soir (18-21)"),
             (21, 24, "Nuit (21-24)")]
    for start, end, label in slots:
        if start <= hour < end:
            return label
    return "Nuit (21-24)"




_ZONE_TOKENS = [
    ("martinique", "Martinique"), ("fort-de-france", "Martinique"),
    ("guadeloupe", "Guadeloupe"), ("pointe-a-pitre", "Guadeloupe"),
    ("guyane", "Guyane"), ("reunion", "Reunion"),
    ("paris", "Paris"), ("lyon", "Lyon"), ("marseille", "Marseille"),
]


def _infer_zone(addr: str) -> str:
    if not addr:
        return "Inconnue"
    low = addr.lower()
    for token, label in _ZONE_TOKENS:
        if token in low:
            return label
    parts = [p.strip() for p in addr.split(",") if p.strip()]
    return parts[-1][:30] if parts else "Inconnue"


def _extract_ride_metrics(r: dict):
    """Return (proposed, accepted, gap_abs, gap_pct, was_negotiated) or None if invalid."""
    proposed = float(r.get("proposed_fare") or 0)
    accepted = float(r.get("final_fare") or r.get("estimated_fare") or 0)
    if proposed <= 0 or accepted <= 0:
        return None
    gap_abs = accepted - proposed
    gap_pct = (gap_abs / proposed) * 100 if proposed > 0 else 0
    was_negotiated = any((o or {}).get("status") == "accepted" for o in (r.get("counter_offers") or []))
    return proposed, accepted, gap_abs, gap_pct, was_negotiated


def _aggregate_negotiation_rides(rides):
    by_day, by_zone, by_vehicle = {}, {}, {}
    total_gap_abs = total_gap_pct = total_proposed = total_accepted = 0.0
    n = negotiated_count = accepted_at_offer_count = 0
    samples = []

    for r in rides:
        metrics = _extract_ride_metrics(r)
        if metrics is None:
            continue
        proposed, accepted, gap_abs, gap_pct, was_negotiated = metrics
        n += 1
        total_gap_abs += gap_abs
        total_gap_pct += gap_pct
        total_proposed += proposed
        total_accepted += accepted
        if was_negotiated:
            negotiated_count += 1
        else:
            accepted_at_offer_count += 1

        day = (r.get("created_at") or "")[:10]
        d = by_day.setdefault(day, {"day": day, "count": 0, "avg_gap": 0, "sum_gap": 0, "sum_proposed": 0, "sum_accepted": 0})
        d["count"] += 1
        d["sum_gap"] += gap_abs
        d["sum_proposed"] += proposed
        d["sum_accepted"] += accepted

        zone = _infer_zone(r.get("pickup_address") or "")
        z = by_zone.setdefault(zone, {"zone": zone, "count": 0, "sum_gap": 0, "sum_pct": 0, "sum_proposed": 0, "sum_accepted": 0})
        z["count"] += 1
        z["sum_gap"] += gap_abs
        z["sum_pct"] += gap_pct
        z["sum_proposed"] += proposed
        z["sum_accepted"] += accepted

        vt = r.get("vehicle_type") or "unknown"
        v = by_vehicle.setdefault(vt, {"vehicle": vt, "count": 0, "sum_gap": 0, "sum_pct": 0})
        v["count"] += 1
        v["sum_gap"] += gap_abs
        v["sum_pct"] += gap_pct

        if len(samples) < 20:
            samples.append({
                "ride_id": r["id"], "created_at": r.get("created_at"),
                "proposed": round(proposed, 2), "accepted": round(accepted, 2),
                "gap_abs": round(gap_abs, 2), "gap_pct": round(gap_pct, 1),
                "pickup": r.get("pickup_address"), "zone": zone,
                "vehicle_type": vt, "negotiated": was_negotiated,
            })

    totals = {
        "total_rides": n,
        "negotiated_count": negotiated_count,
        "accepted_at_offer_count": accepted_at_offer_count,
        "avg_gap_abs": round(total_gap_abs / n, 2) if n else 0,
        "avg_gap_pct": round(total_gap_pct / n, 1) if n else 0,
        "total_proposed": round(total_proposed, 2),
        "total_accepted": round(total_accepted, 2),
        "total_revenue_gap": round(total_accepted - total_proposed, 2),
    }
    return {"totals": totals, "by_day": by_day, "by_zone": by_zone, "by_vehicle": by_vehicle, "samples": samples}


def _finalize_daily(by_day):
    out = []
    for day in sorted(by_day.keys()):
        d = by_day[day]
        c = d["count"] or 1
        d["avg_gap"] = round(d["sum_gap"] / c, 2)
        d["avg_proposed"] = round(d["sum_proposed"] / c, 2)
        d["avg_accepted"] = round(d["sum_accepted"] / c, 2)
        out.append(d)
    return out


def _finalize_zones(by_zone):
    rows = []
    for z in by_zone.values():
        c = z["count"] or 1
        z["avg_gap"] = round(z["sum_gap"] / c, 2)
        z["avg_gap_pct"] = round(z["sum_pct"] / c, 1)
        z["avg_proposed"] = round(z["sum_proposed"] / c, 2)
        z["avg_accepted"] = round(z["sum_accepted"] / c, 2)
        rows.append(z)
    rows.sort(key=lambda x: -x["count"])
    return rows


def _finalize_vehicles(by_vehicle):
    rows = []
    for v in by_vehicle.values():
        c = v["count"] or 1
        v["avg_gap"] = round(v["sum_gap"] / c, 2)
        v["avg_gap_pct"] = round(v["sum_pct"] / c, 1)
        rows.append(v)
    rows.sort(key=lambda x: -x["count"])
    return rows


__all__ = [
    "APIRouter",
    "Request",
    "HTTPException",
    "datetime",
    "timezone",
    "timedelta",
    "uuid",
    "os",
    "db",
    "require_role",
    "router",
    "VT_FIELDS",
    "VT_DEFAULTS",
    "DEFAULT_REWARDS_CONFIG",
    "_rewards_zone_candidates",
    "_merge_rewards_settings",
    "get_rewards_config",
    "_rewards_zone_key",
    "DC_SERVICES",
    "DC_VEHICLE_CLASSES",
    "DC_TAXI_SUBS",
    "_dc_validate_service_class",
    "_dc_resolve_taxi_sub",
    "_dc_clean_documents",
    "_dc_parse_order",
    "_clean_driver_category",
    "DRIVER_TAXI_SUBS",
    "DRIVER_SERVICES",
    "_derive_vehicle_class",
    "_generate_password",
    "_create_driver_internal",
    "_create_merchant_internal",
    "_split_multi",
    "_read_csv_rows",
    "_compose_full_phone",
    "_assert_email_available",
    "_assert_phone_available",
    "_collect_user_updates",
    "_ride_status_map",
    "_earnings_summary",
    "_extract_city",
    "_is_valid_city",
    "ALLOWED_CRUD",
    "_crud_col",
    "_time_slot",
    "_ZONE_TOKENS",
    "_infer_zone",
    "_extract_ride_metrics",
    "_aggregate_negotiation_rides",
    "_finalize_daily",
    "_finalize_zones",
    "_finalize_vehicles",
]
