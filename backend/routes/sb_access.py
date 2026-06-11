"""SB Drive Access — module de transport adapté (PMR / handicap / seniors).

Couvre la Phase 1 :
- Profil de besoins d'accessibilité (mobilité / visuel / auditif / cognitif)
- Catégories de véhicules adaptés (Access Standard / PMR / Van) configurables par l'admin
  avec tarification PMR et ciblage par zone géographique
- Certification des chauffeurs "Chauffeur Access" (validation admin, priorité d'attribution)
- Réservation intelligente : filtre des catégories compatibles avec les besoins déclarés,
  équipement, animal d'assistance, accompagnateur, temps d'assistance supplémentaire
- Réglages globaux (zones de disponibilité, "Safe Ride Night" entièrement paramétrable)
- Tableau de bord admin (statistiques)

Les phases suivantes (IA d'attribution, SB Access Plus, accessibilité avancée de l'app,
trajets médicaux/récurrents auto, centre SOS) viendront s'appuyer sur ces fondations.
"""
import uuid
import os
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Request, HTTPException

from core.config import db, logger
from core.deps import require_role, get_current_user
from core.geo_scope import clean_scope, scope_matches, resolve_zone_from_text
from core.notifications import create_notification
from core.email import send_access_recurring_reminder, fire

router = APIRouter(prefix="/access", tags=["sb-access"])
admin_router = APIRouter(prefix="/access/admin", tags=["sb-access-admin"])

SETTINGS_ID = "access_settings"


def _now():
    return datetime.now(timezone.utc).isoformat()


# ── Catalogue des besoins (référentiel affiché côté client) ──────────────────
NEEDS_CATALOG = {
    "mobility": {
        "label": "Mobilité réduite",
        "options": [
            {"key": "wheelchair_manual", "label": "Fauteuil roulant manuel"},
            {"key": "wheelchair_electric", "label": "Fauteuil roulant électrique"},
            {"key": "walker", "label": "Déambulateur"},
            {"key": "cane", "label": "Cannes"},
            {"key": "stairs_difficulty", "label": "Difficulté à monter des marches"},
        ],
    },
    "visual": {
        "label": "Handicap visuel",
        "options": [
            {"key": "low_vision", "label": "Malvoyant"},
            {"key": "blind", "label": "Non-voyant"},
            {"key": "guide_animal", "label": "Chien guide / animal d'assistance"},
        ],
    },
    "auditory": {
        "label": "Handicap auditif",
        "options": [
            {"key": "hard_of_hearing", "label": "Malentendant"},
            {"key": "deaf", "label": "Sourd"},
        ],
    },
    "cognitive": {
        "label": "Handicap cognitif",
        "options": [
            {"key": "enhanced_assistance", "label": "Besoin d'assistance renforcée"},
            {"key": "specific_support", "label": "Accompagnement spécifique"},
        ],
    },
}

# Besoins qui exigent un véhicule à capacité fauteuil roulant (rampe/plateforme/ancrage)
WHEELCHAIR_NEEDS = {"wheelchair_manual", "wheelchair_electric"}


# ── Catégories de véhicules par défaut (seed, éditables par l'admin) ─────────
_SEED_CATEGORIES = [
    {
        "key": "access_standard",
        "name": "Access Standard",
        "description": "Véhicule spacieux, aide à l'installation, coffre adapté aux équipements médicaux.",
        "capabilities": {
            "ramp": False, "lift": False, "wheelchair_anchor": False,
            "extra_space": True, "medical_trunk": True, "install_help": True,
        },
        "capacity_passengers": 4,
        "capacity_wheelchairs": 0,
        "base_fare": 4.0, "price_per_km": 1.2, "price_per_min": 0.3, "min_fare": 7.0,
        "icon": "Car", "active": True, "display_order": 0, "scope": {},
    },
    {
        "key": "access_pmr",
        "name": "Access PMR",
        "description": "Rampe d'accès, plateforme élévatrice, système d'ancrage fauteuil roulant, homologation PMR.",
        "capabilities": {
            "ramp": True, "lift": True, "wheelchair_anchor": True,
            "extra_space": True, "medical_trunk": True, "install_help": True,
        },
        "capacity_passengers": 3,
        "capacity_wheelchairs": 1,
        "base_fare": 6.0, "price_per_km": 1.6, "price_per_min": 0.4, "min_fare": 10.0,
        "icon": "Wheelchair", "active": True, "display_order": 1, "scope": {},
    },
    {
        "key": "access_van",
        "name": "Access Van",
        "description": "Transport de plusieurs fauteuils roulants, familles et groupes.",
        "capabilities": {
            "ramp": True, "lift": True, "wheelchair_anchor": True,
            "extra_space": True, "medical_trunk": True, "install_help": True,
        },
        "capacity_passengers": 6,
        "capacity_wheelchairs": 2,
        "base_fare": 8.0, "price_per_km": 2.0, "price_per_min": 0.5, "min_fare": 14.0,
        "icon": "Van", "active": True, "display_order": 2, "scope": {},
    },
]

_DEFAULT_SETTINGS = {
    "id": SETTINGS_ID,
    "enabled": True,
    "available_zones": [],          # [] = disponible partout ; sinon liste de scopes
    "extra_assistance_minutes": 10,  # temps d'embarquement/débarquement supplémentaire offert
    "no_late_penalty": True,         # pas de pénalité si le client a besoin de plus de temps
    "priority_certified_drivers": True,
    "safe_ride_night": {
        "enabled": True,
        "modes": ["access", "standard"],  # sur quels modes le toggle apparaît
        "start_hour": 20,                  # 20h
        "end_hour": 6,                     # 6h (fenêtre nocturne, passe minuit)
        "zones": [],                       # [] = toutes zones
    },
}

_CAT_FIELDS = (
    "name", "description", "capabilities", "capacity_passengers", "capacity_wheelchairs",
    "base_fare", "price_per_km", "price_per_min", "min_fare", "icon", "active", "display_order",
)


async def _ensure_seed():
    if await db.access_categories.count_documents({}) == 0:
        for c in _SEED_CATEGORIES:
            doc = {"id": str(uuid.uuid4()), "created_at": _now(), **c}
            await db.access_categories.insert_one(doc)
    if not await db.app_config.find_one({"id": SETTINGS_ID}):
        await db.app_config.update_one(
            {"id": SETTINGS_ID}, {"$set": {**_DEFAULT_SETTINGS, "created_at": _now()}}, upsert=True
        )


async def _get_settings() -> dict:
    await _ensure_seed()
    doc = await db.app_config.find_one({"id": SETTINGS_ID}, {"_id": 0})
    if not doc:
        return dict(_DEFAULT_SETTINGS)
    # merge defaults for forward-compat
    merged = {**_DEFAULT_SETTINGS, **doc}
    merged["safe_ride_night"] = {**_DEFAULT_SETTINGS["safe_ride_night"], **(doc.get("safe_ride_night") or {})}
    return merged


def _safe_night_active_now(srn: dict, zone) -> bool:
    if not srn.get("enabled"):
        return False
    zones = srn.get("zones") or []
    if zones and not any(scope_matches(z, zone) for z in zones):
        return False
    start = int(srn.get("start_hour", 20))
    end = int(srn.get("end_hour", 6))
    hour = datetime.now(timezone.utc).hour
    if start == end:
        return True
    if start < end:
        return start <= hour < end
    # window crosses midnight (e.g. 20h -> 6h)
    return hour >= start or hour < end


def _category_compatible(cat: dict, needs: list) -> bool:
    caps = cat.get("capabilities") or {}
    needs = set(needs or [])
    # Wheelchair users require a vehicle that can carry a wheelchair
    if needs & WHEELCHAIR_NEEDS:
        if not (caps.get("ramp") or caps.get("lift")) or cat.get("capacity_wheelchairs", 0) < 1:
            return False
    return True


# ============================================================
#  PUBLIC / USER
# ============================================================
@router.get("/needs-catalog")
async def needs_catalog():
    return {"catalog": NEEDS_CATALOG}


@router.get("/config")
async def get_config(location: str = ""):
    """Config publique : disponibilité, catégories actives (filtrées par zone),
    et état 'Safe Ride Night' calculé pour la zone + l'heure courante."""
    settings = await _get_settings()
    zone = resolve_zone_from_text(location) if location else None

    available = True
    if settings.get("available_zones"):
        available = any(scope_matches(z, zone) for z in settings["available_zones"]) if zone else True

    cats = await db.access_categories.find({"active": True}, {"_id": 0}).sort("display_order", 1).to_list(100)
    cats = [c for c in cats if not c.get("scope") or scope_matches(c["scope"], zone)]

    srn = settings.get("safe_ride_night") or {}
    return {
        "enabled": settings.get("enabled", True) and available,
        "categories": cats,
        "extra_assistance_minutes": settings.get("extra_assistance_minutes", 10),
        "no_late_penalty": settings.get("no_late_penalty", True),
        "safe_ride_night": {
            "enabled": bool(srn.get("enabled")),
            "modes": srn.get("modes") or [],
            "active_now": _safe_night_active_now(srn, zone),
            "start_hour": srn.get("start_hour", 20),
            "end_hour": srn.get("end_hour", 6),
        },
    }


@router.get("/profile")
async def get_profile(request: Request):
    user = await get_current_user(request)
    doc = await db.accessibility_profiles.find_one({"user_id": user["id"]}, {"_id": 0})
    return doc or {
        "user_id": user["id"], "mobility": [], "visual": [], "auditory": [], "cognitive": [],
        "equipment": [], "assistance_animal": False, "default_companion_count": 0,
        "extra_assistance_time": False, "notes": "",
    }


@router.put("/profile")
async def update_profile(request: Request):
    user = await get_current_user(request)
    body = await request.json()
    allowed = {}
    for f in ("mobility", "visual", "auditory", "cognitive", "equipment"):
        if f in body and isinstance(body[f], list):
            allowed[f] = [str(x) for x in body[f]]
    if "assistance_animal" in body:
        allowed["assistance_animal"] = bool(body["assistance_animal"])
    if "default_companion_count" in body:
        try:
            allowed["default_companion_count"] = max(0, int(body["default_companion_count"]))
        except (TypeError, ValueError):
            allowed["default_companion_count"] = 0
    if "extra_assistance_time" in body:
        allowed["extra_assistance_time"] = bool(body["extra_assistance_time"])
    if "notes" in body:
        allowed["notes"] = str(body["notes"])[:1000]
    allowed["user_id"] = user["id"]
    allowed["updated_at"] = _now()
    await db.accessibility_profiles.update_one({"user_id": user["id"]}, {"$set": allowed}, upsert=True)
    doc = await db.accessibility_profiles.find_one({"user_id": user["id"]}, {"_id": 0})
    return doc


@router.post("/match")
async def match_vehicles(request: Request):
    """Renvoie les catégories de véhicules compatibles avec les besoins déclarés."""
    body = await request.json()
    needs = body.get("needs") or []
    location = body.get("location") or ""
    zone = resolve_zone_from_text(location) if location else None
    cats = await db.access_categories.find({"active": True}, {"_id": 0}).sort("display_order", 1).to_list(100)
    cats = [c for c in cats if (not c.get("scope") or scope_matches(c["scope"], zone))]
    compatible = [c for c in cats if _category_compatible(c, needs)]
    return {"categories": compatible, "needs": needs}


def _estimate_fare(cat: dict, distance_km: float, duration_min: float) -> float:
    fare = (cat.get("base_fare", 0) + cat.get("price_per_km", 0) * distance_km
            + cat.get("price_per_min", 0) * duration_min)
    return round(max(fare, cat.get("min_fare", 0)), 2)


@router.post("/bookings")
async def create_booking(request: Request):
    user = await get_current_user(request)
    body = await request.json()
    booking = await _build_and_store_booking(user["id"], body)
    return booking


async def _build_and_store_booking(user_id: str, body: dict, recurring_id: str = None,
                                    scheduled_at: str = None, auto: bool = False) -> dict:
    cat_key = body.get("category_key")
    cat = await db.access_categories.find_one({"key": cat_key, "active": True}, {"_id": 0})
    if not cat:
        raise HTTPException(status_code=400, detail="Catégorie de véhicule invalide ou indisponible")

    settings = await _get_settings()
    distance_km = float(body.get("distance_km") or 0)
    duration_min = float(body.get("duration_min") or 0)
    fare = _estimate_fare(cat, distance_km, duration_min)

    # Priorité aux chauffeurs certifiés Access (matching simple Phase 1)
    matched = None
    q = {"role": "driver", "access_certified": True}
    if settings.get("priority_certified_drivers", True):
        matched = await db.users.find_one(q, {"_id": 0, "id": 1, "name": 1})

    extra_time = bool(body.get("extra_assistance_time"))
    booking = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "category_key": cat_key,
        "category_name": cat.get("name"),
        "needs": body.get("needs") or [],
        "equipment": body.get("equipment") or [],
        "assistance_animal": bool(body.get("assistance_animal")),
        "companion_count": int(body.get("companion_count") or 0),
        "extra_assistance_time": extra_time,
        "extra_assistance_minutes": settings.get("extra_assistance_minutes", 10) if extra_time else 0,
        "pickup": body.get("pickup") or {},
        "dropoff": body.get("dropoff") or {},
        "trip_type": body.get("trip_type") or "standard",   # standard | medical | recurring
        "recurrence": body.get("recurrence"),                # daily | weekly | monthly | null
        "scheduled_at": scheduled_at or body.get("scheduled_at"),
        "fare_estimate": fare,
        "matched_driver_id": matched["id"] if matched else None,
        "matched_driver_name": matched["name"] if matched else None,
        "certified_driver": bool(matched),
        "status": "searching" if not matched else "assigned",
        "recurring_id": recurring_id,
        "auto_created": auto,
        "created_at": _now(),
    }
    await db.access_bookings.insert_one(dict(booking))
    booking.pop("_id", None)
    return booking


@router.get("/bookings")
async def list_my_bookings(request: Request):
    user = await get_current_user(request)
    items = await db.access_bookings.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return {"items": items}


# ── Trajets récurrents automatiques (dialyse, rééducation…) ──────────────────
DEFAULT_TZ = "Europe/Paris"
DAY_LABELS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"]

_REC_TRIP_FIELDS = (
    "category_key", "needs", "equipment", "assistance_animal", "companion_count",
    "extra_assistance_time", "pickup", "dropoff", "trip_type", "distance_km", "duration_min",
)


def _recurring_summary(rec: dict) -> str:
    t = rec.get("time_hhmm", "09:00")
    if rec.get("frequency") == "daily":
        return f"Tous les jours à {t}"
    days = rec.get("days_of_week") or []
    if not days:
        return f"Chaque semaine à {t}"
    labels = ", ".join(DAY_LABELS[d] for d in sorted(days) if 0 <= d <= 6)
    return f"{labels} à {t}"


def _parse_hm(rec: dict):
    try:
        h, m = str(rec.get("time_hhmm", "09:00")).split(":")
        return int(h), int(m)
    except (ValueError, AttributeError):
        return 9, 0


def _next_occurrence(rec: dict, now_local):
    """Prochaine date/heure d'exécution (datetime local), en sautant skip_dates."""
    h, m = _parse_hm(rec)
    freq = rec.get("frequency")
    days = rec.get("days_of_week") or []
    skips = set(rec.get("skip_dates") or [])
    for offset in range(0, 8):
        d = now_local + timedelta(days=offset)
        if freq == "weekly" and d.weekday() not in days:
            continue
        cand = d.replace(hour=h, minute=m, second=0, microsecond=0)
        if offset == 0 and cand < now_local:
            continue
        if cand.strftime("%Y-%m-%d") in skips:
            continue
        return cand
    return None


def _occurrence_label(dt) -> str:
    """Ex. 'demain à 09:00' / 'lundi 15 à 09:00'."""
    if not dt:
        return ""
    return f"{DAY_LABELS[dt.weekday()].lower()} {dt.day} à {dt.strftime('%H:%M')}"


def _tznow(rec: dict):
    try:
        from zoneinfo import ZoneInfo
        return datetime.now(ZoneInfo(rec.get("timezone", DEFAULT_TZ)))
    except Exception:
        return datetime.now(timezone.utc)


@router.get("/recurring")
async def list_recurring(request: Request):
    user = await get_current_user(request)
    items = await db.access_recurring.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(100)
    for r in items:
        r["summary"] = _recurring_summary(r)
        nxt = _next_occurrence(r, _tznow(r))
        r["next_occurrence"] = nxt.isoformat() if nxt else None
        r["next_occurrence_label"] = _occurrence_label(nxt)
    return {"items": items}


@router.post("/recurring")
async def create_recurring(request: Request):
    """Transforme un trajet en abonnement récurrent automatique."""
    user = await get_current_user(request)
    body = await request.json()
    cat_key = body.get("category_key")
    if not await db.access_categories.find_one({"key": cat_key, "active": True}):
        raise HTTPException(status_code=400, detail="Catégorie de véhicule invalide ou indisponible")

    frequency = body.get("frequency") if body.get("frequency") in ("daily", "weekly") else "weekly"
    days = body.get("days_of_week") or []
    try:
        days = sorted({int(d) for d in days if 0 <= int(d) <= 6})
    except (TypeError, ValueError):
        days = []
    if frequency == "weekly" and not days:
        raise HTTPException(status_code=400, detail="Sélectionnez au moins un jour de la semaine")

    time_hhmm = str(body.get("time_hhmm") or "09:00")
    try:
        h, m = time_hhmm.split(":")
        time_hhmm = f"{max(0, min(23, int(h))):02d}:{max(0, min(59, int(m))):02d}"
    except (ValueError, AttributeError):
        time_hhmm = "09:00"

    rec = {"id": str(uuid.uuid4()), "user_id": user["id"], "frequency": frequency,
           "days_of_week": days, "time_hhmm": time_hhmm, "timezone": DEFAULT_TZ,
           "active": True, "last_run_date": None, "last_reminded_date": None,
           "skip_dates": [], "created_at": _now()}
    for f in _REC_TRIP_FIELDS:
        if f in body:
            rec[f] = body[f]
    rec.setdefault("trip_type", "recurring")
    await db.access_recurring.insert_one(dict(rec))
    rec.pop("_id", None)
    rec["summary"] = _recurring_summary(rec)
    nxt = _next_occurrence(rec, _tznow(rec))
    rec["next_occurrence"] = nxt.isoformat() if nxt else None
    rec["next_occurrence_label"] = _occurrence_label(nxt)
    return rec


@router.put("/recurring/{rec_id}")
async def update_recurring(rec_id: str, request: Request):
    user = await get_current_user(request)
    body = await request.json()
    update = {}
    if "active" in body:
        update["active"] = bool(body["active"])
    if body.get("frequency") in ("daily", "weekly"):
        update["frequency"] = body["frequency"]
    if "days_of_week" in body:
        try:
            update["days_of_week"] = sorted({int(d) for d in (body["days_of_week"] or []) if 0 <= int(d) <= 6})
        except (TypeError, ValueError):
            pass
    if "time_hhmm" in body:
        try:
            h, m = str(body["time_hhmm"]).split(":")
            update["time_hhmm"] = f"{max(0, min(23, int(h))):02d}:{max(0, min(59, int(m))):02d}"
        except (ValueError, AttributeError):
            pass
    if not update:
        raise HTTPException(status_code=400, detail="Aucun champ à mettre à jour")
    res = await db.access_recurring.update_one({"id": rec_id, "user_id": user["id"]}, {"$set": update})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Trajet récurrent introuvable")
    doc = await db.access_recurring.find_one({"id": rec_id}, {"_id": 0})
    doc["summary"] = _recurring_summary(doc)
    return doc


@router.delete("/recurring/{rec_id}")
async def delete_recurring(rec_id: str, request: Request):
    user = await get_current_user(request)
    await db.access_recurring.delete_one({"id": rec_id, "user_id": user["id"]})
    return {"message": "deleted"}


@router.post("/recurring/{rec_id}/skip")
async def skip_recurring_occurrence(rec_id: str, request: Request):
    """Annule en 1 tap UNE occurrence (par défaut la prochaine) sans supprimer l'abonnement."""
    user = await get_current_user(request)
    rec = await db.access_recurring.find_one({"id": rec_id, "user_id": user["id"]}, {"_id": 0})
    if not rec:
        raise HTTPException(status_code=404, detail="Trajet récurrent introuvable")
    body = {}
    try:
        body = await request.json()
    except Exception:
        body = {}
    date_str = body.get("date")
    if not date_str:
        nxt = _next_occurrence(rec, _tznow(rec))
        if not nxt:
            raise HTTPException(status_code=400, detail="Aucune occurrence à venir")
        date_str = nxt.strftime("%Y-%m-%d")
    skips = set(rec.get("skip_dates") or [])
    skips.add(date_str)
    await db.access_recurring.update_one({"id": rec_id}, {"$set": {"skip_dates": sorted(skips)}})
    doc = await db.access_recurring.find_one({"id": rec_id}, {"_id": 0})
    doc["summary"] = _recurring_summary(doc)
    nxt = _next_occurrence(doc, _tznow(doc))
    doc["next_occurrence"] = nxt.isoformat() if nxt else None
    doc["next_occurrence_label"] = _occurrence_label(nxt)
    return doc


def _recurring_due(rec: dict, now_local) -> bool:
    """Le trajet doit-il être créé maintenant (fenêtre du jour atteinte, pas déjà fait) ?"""
    if not rec.get("active"):
        return False
    today = now_local.strftime("%Y-%m-%d")
    if rec.get("last_run_date") == today:
        return False
    if rec.get("frequency") == "weekly":
        days = rec.get("days_of_week") or []
        if now_local.weekday() not in days:
            return False
    try:
        h, m = str(rec.get("time_hhmm", "09:00")).split(":")
        h, m = int(h), int(m)
    except (ValueError, AttributeError):
        h, m = 9, 0
    return (now_local.hour, now_local.minute) >= (h, m)


async def _send_recurring_reminder(rec: dict, occ):
    """Notif in-app + email J-1 pour une occurrence à venir, avec lien d'annulation
    et le chauffeur certifié Access pressenti (rassure les usagers PMR récurrents)."""
    user = await db.users.find_one({"id": rec["user_id"]}, {"_id": 0, "name": 1, "email": 1})
    when = _occurrence_label(occ)
    pickup = (rec.get("pickup") or {}).get("address") or "—"
    dropoff = (rec.get("dropoff") or {}).get("address") or "—"
    cat = await db.access_categories.find_one({"key": rec.get("category_key")}, {"_id": 0, "name": 1})
    vehicle = (cat or {}).get("name", "")
    # Chauffeur certifié pressenti
    settings = await _get_settings()
    driver_name = ""
    if settings.get("priority_certified_drivers", True):
        drv = await db.users.find_one({"role": "driver", "access_certified": True}, {"_id": 0, "name": 1})
        driver_name = (drv or {}).get("name", "")
    driver_line = f" Votre chauffeur certifié {driver_name} vous prendra en charge." if driver_name else ""
    await create_notification(
        rec["user_id"], "access_recurring_reminder",
        "Trajet adapté de demain confirmé",
        f"Votre trajet adapté est prévu {when} ({pickup} → {dropoff}).{driver_line} Annulez en 1 tap si besoin.",
        data={"recurring_id": rec["id"], "occurrence": occ.strftime("%Y-%m-%d"), "action": "manage_recurring",
              "driver_name": driver_name},
    )
    email = (user or {}).get("email", "")
    if email and not email.endswith("@sbdrive.local"):
        manage_url = f"{os.environ.get('FRONTEND_URL', '').rstrip('/')}/access"
        veh_label = f"{vehicle} · Chauffeur certifié {driver_name}" if driver_name else vehicle
        fire(send_access_recurring_reminder(
            email, (user or {}).get("name", ""), when, pickup, dropoff, veh_label, manage_url))


async def access_recurring_loop():
    """Toutes les ~5 min : rappels J-1 + création automatique des courses dues (skip respecté)."""
    import asyncio
    try:
        from zoneinfo import ZoneInfo
    except ImportError:
        ZoneInfo = None
    await asyncio.sleep(60)
    while True:
        try:
            recs = await db.access_recurring.find({"active": True}, {"_id": 0}).to_list(1000)
            for rec in recs:
                tz = rec.get("timezone", DEFAULT_TZ)
                try:
                    now_local = datetime.now(ZoneInfo(tz)) if ZoneInfo else datetime.now(timezone.utc)
                except Exception:
                    now_local = datetime.now(timezone.utc)

                # (1) Rappel la veille (J-1)
                try:
                    nxt = _next_occurrence(rec, now_local)
                    if nxt and (nxt.date() - now_local.date()).days == 1:
                        occ_date = nxt.strftime("%Y-%m-%d")
                        if rec.get("last_reminded_date") != occ_date:
                            await _send_recurring_reminder(rec, nxt)
                            await db.access_recurring.update_one(
                                {"id": rec["id"]}, {"$set": {"last_reminded_date": occ_date}})
                except Exception as e:
                    logger.error("access_recurring reminder error: %s", e)

                # (2) Création automatique de la course du jour
                if not _recurring_due(rec, now_local):
                    continue
                today = now_local.strftime("%Y-%m-%d")
                # Occurrence annulée (skip 1-tap) → marque comme traitée sans créer de course
                if today in (rec.get("skip_dates") or []):
                    await db.access_recurring.update_one(
                        {"id": rec["id"]},
                        {"$set": {"last_run_date": today}, "$pull": {"skip_dates": today}})
                    continue
                try:
                    h, m = str(rec.get("time_hhmm", "09:00")).split(":")
                    scheduled = now_local.replace(hour=int(h), minute=int(m), second=0, microsecond=0).isoformat()
                except (ValueError, AttributeError):
                    scheduled = now_local.isoformat()
                body = {f: rec.get(f) for f in _REC_TRIP_FIELDS if f in rec}
                try:
                    booking = await _build_and_store_booking(
                        rec["user_id"], body, recurring_id=rec["id"], scheduled_at=scheduled, auto=True)
                    await db.access_recurring.update_one({"id": rec["id"]}, {"$set": {"last_run_date": today}})
                    await create_notification(
                        rec["user_id"], "access_recurring",
                        "Trajet adapté programmé automatiquement",
                        f"Votre trajet récurrent ({booking.get('category_name')}) a été réservé pour aujourd'hui à {rec.get('time_hhmm')}.",
                        data={"booking_id": booking["id"], "recurring_id": rec["id"]},
                    )
                    logger.info("SB Access recurring: created booking %s for user %s", booking["id"], rec["user_id"])
                except Exception as e:
                    logger.error("access_recurring create error: %s", e)
        except Exception as e:
            logger.error("access_recurring_loop error: %s", e)
        await asyncio.sleep(300)


# ============================================================
#  ADMIN
# ============================================================
@admin_router.get("/categories")
async def admin_list_categories(request: Request):
    await require_role(request, ["admin"])
    await _ensure_seed()
    items = await db.access_categories.find({}, {"_id": 0}).sort("display_order", 1).to_list(100)
    return {"items": items}


@admin_router.post("/categories")
async def admin_create_category(request: Request):
    await require_role(request, ["admin"], permission="server.settings.edit")
    body = await request.json()
    key = (body.get("key") or "").strip() or f"cat_{uuid.uuid4().hex[:8]}"
    if await db.access_categories.find_one({"key": key}):
        raise HTTPException(status_code=400, detail="Cette clé existe déjà")
    doc = {
        "id": str(uuid.uuid4()), "key": key, "created_at": _now(),
        "name": body.get("name") or "Nouvelle catégorie",
        "description": body.get("description") or "",
        "capabilities": body.get("capabilities") or {},
        "capacity_passengers": int(body.get("capacity_passengers") or 4),
        "capacity_wheelchairs": int(body.get("capacity_wheelchairs") or 0),
        "base_fare": float(body.get("base_fare") or 0),
        "price_per_km": float(body.get("price_per_km") or 0),
        "price_per_min": float(body.get("price_per_min") or 0),
        "min_fare": float(body.get("min_fare") or 0),
        "icon": body.get("icon") or "Wheelchair",
        "active": bool(body.get("active", True)),
        "display_order": int(body.get("display_order") or 99),
        "scope": clean_scope(body.get("scope") or {}),
    }
    await db.access_categories.insert_one(dict(doc))
    doc.pop("_id", None)
    return doc


@admin_router.put("/categories/{cat_id}")
async def admin_update_category(cat_id: str, request: Request):
    await require_role(request, ["admin"], permission="server.settings.edit")
    body = await request.json()
    update = {}
    for f in _CAT_FIELDS:
        if f in body:
            update[f] = body[f]
    for nf in ("capacity_passengers", "capacity_wheelchairs", "display_order"):
        if nf in update:
            try:
                update[nf] = int(update[nf])
            except (TypeError, ValueError):
                update.pop(nf)
    for ff in ("base_fare", "price_per_km", "price_per_min", "min_fare"):
        if ff in update:
            try:
                update[ff] = float(update[ff])
            except (TypeError, ValueError):
                update.pop(ff)
    if "active" in update:
        update["active"] = bool(update["active"])
    if "scope" in body:
        update["scope"] = clean_scope(body["scope"])
    if not update:
        raise HTTPException(status_code=400, detail="Aucun champ à mettre à jour")
    update["updated_at"] = _now()
    res = await db.access_categories.update_one({"id": cat_id}, {"$set": update})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Catégorie introuvable")
    doc = await db.access_categories.find_one({"id": cat_id}, {"_id": 0})
    return doc


@admin_router.delete("/categories/{cat_id}")
async def admin_delete_category(cat_id: str, request: Request):
    await require_role(request, ["admin"], permission="server.settings.edit")
    await db.access_categories.delete_one({"id": cat_id})
    return {"message": "deleted"}


@admin_router.get("/settings")
async def admin_get_settings(request: Request):
    await require_role(request, ["admin"])
    return await _get_settings()


@admin_router.put("/settings")
async def admin_update_settings(request: Request):
    await require_role(request, ["admin"], permission="server.settings.edit")
    body = await request.json()
    update = {}
    if "enabled" in body:
        update["enabled"] = bool(body["enabled"])
    if "available_zones" in body and isinstance(body["available_zones"], list):
        update["available_zones"] = [clean_scope(z) for z in body["available_zones"]]
    if "extra_assistance_minutes" in body:
        try:
            update["extra_assistance_minutes"] = max(0, int(body["extra_assistance_minutes"]))
        except (TypeError, ValueError):
            pass
    if "no_late_penalty" in body:
        update["no_late_penalty"] = bool(body["no_late_penalty"])
    if "priority_certified_drivers" in body:
        update["priority_certified_drivers"] = bool(body["priority_certified_drivers"])
    if "safe_ride_night" in body and isinstance(body["safe_ride_night"], dict):
        srn = body["safe_ride_night"]
        cur = (await _get_settings())["safe_ride_night"]
        new_srn = dict(cur)
        if "enabled" in srn:
            new_srn["enabled"] = bool(srn["enabled"])
        if "modes" in srn and isinstance(srn["modes"], list):
            new_srn["modes"] = [str(m) for m in srn["modes"]]
        for hf in ("start_hour", "end_hour"):
            if hf in srn:
                try:
                    new_srn[hf] = max(0, min(23, int(srn[hf])))
                except (TypeError, ValueError):
                    pass
        if "zones" in srn and isinstance(srn["zones"], list):
            new_srn["zones"] = [clean_scope(z) for z in srn["zones"]]
        update["safe_ride_night"] = new_srn
    if not update:
        raise HTTPException(status_code=400, detail="Aucun champ à mettre à jour")
    update["updated_at"] = _now()
    await db.app_config.update_one({"id": SETTINGS_ID}, {"$set": update}, upsert=True)
    return await _get_settings()


@admin_router.get("/drivers")
async def admin_list_drivers(request: Request):
    """Liste des chauffeurs avec leur statut de certification Access."""
    await require_role(request, ["admin"])
    drivers = await db.users.find(
        {"role": "driver"},
        {"_id": 0, "id": 1, "name": 1, "phone": 1, "vehicle_type": 1,
         "access_certified": 1, "access_certified_at": 1},
    ).sort("name", 1).to_list(500)
    return {"items": drivers}


@admin_router.post("/drivers/{driver_id}/certify")
async def admin_certify_driver(driver_id: str, request: Request):
    await require_role(request, ["admin"], permission="server.settings.edit")
    body = await request.json()
    approved = bool(body.get("approved", True))
    trainings = body.get("trainings") or []
    actor = await get_current_user(request)
    res = await db.users.update_one(
        {"id": driver_id, "role": "driver"},
        {"$set": {
            "access_certified": approved,
            "access_certified_at": _now() if approved else None,
        }},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Chauffeur introuvable")
    await db.access_certifications.insert_one({
        "id": str(uuid.uuid4()), "driver_id": driver_id,
        "status": "approved" if approved else "revoked",
        "trainings": trainings, "validated_by": actor["id"], "created_at": _now(),
    })
    return {"driver_id": driver_id, "access_certified": approved}


@admin_router.get("/bookings")
async def admin_list_bookings(request: Request):
    await require_role(request, ["admin"])
    items = await db.access_bookings.find({}, {"_id": 0}).sort("created_at", -1).to_list(300)
    return {"items": items}


@admin_router.get("/stats")
async def admin_stats(request: Request):
    await require_role(request, ["admin"])
    total = await db.access_bookings.count_documents({})
    certified_rides = await db.access_bookings.count_documents({"certified_driver": True})
    certified_drivers = await db.users.count_documents({"role": "driver", "access_certified": True})
    pmr_categories = await db.access_categories.count_documents({"active": True, "capacity_wheelchairs": {"$gte": 1}})
    by_type = {}
    for t in ("standard", "medical", "recurring"):
        by_type[t] = await db.access_bookings.count_documents({"trip_type": t})
    return {
        "total_bookings": total,
        "certified_ride_rate": round((certified_rides / total * 100), 1) if total else 0,
        "certified_drivers": certified_drivers,
        "pmr_categories_available": pmr_categories,
        "bookings_by_type": by_type,
    }
