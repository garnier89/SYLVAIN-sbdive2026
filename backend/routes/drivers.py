from fastapi import APIRouter, Request, HTTPException, File, UploadFile, Query
import uuid
import os
from datetime import datetime, timezone, timedelta

from core.config import db, APP_NAME
from core.deps import get_current_user, put_object
from models.schemas import DriverCreate, DriverProfile
from core.websocket import manager

router = APIRouter(prefix="/drivers", tags=["drivers"])

# ── Taxi eligibility (V3Cube parity) ──────────────────────────────────────
# Taxi is a gated service: a livreur/coursier can upgrade to taxi only after
# adding an ADAPTED VEHICLE (a car) AND the required CARTE VTC document.
CAR_VEHICLE_TYPES = {
    "car", "voiture", "sedan", "berline", "suv", "van", "minivan",
    "luxe", "luxury", "comfort", "confort", "prime", "premium", "xl",
}
MOTO_VEHICLE_TYPES = {"moto", "motorcycle", "motorbike", "scooter", "moped"}


def _is_car_vehicle(vehicle_type) -> bool:
    return (vehicle_type or "").strip().lower() in CAR_VEHICLE_TYPES


def _is_moto_vehicle(vehicle_type) -> bool:
    return (vehicle_type or "").strip().lower() in MOTO_VEHICLE_TYPES


def _vehicle_matches_mode(vehicle_type, mode) -> bool:
    """taxi_mode 'car' needs a car, 'moto' (moto-taxi) needs a moto."""
    if mode == "moto":
        return _is_moto_vehicle(vehicle_type)
    return _is_car_vehicle(vehicle_type)


def _has_vtc_document(driver: dict) -> bool:
    taxi_docs = {"vtc_card", "carte_vtc", "carte_pro_taxi"}
    return any((d or {}).get("type") in taxi_docs for d in (driver.get("documents") or []))


def _taxi_block_reason(driver: dict, mode):
    """Return a French error string if the driver is NOT eligible for the chosen taxi mode, else None."""
    if mode not in {"car", "moto"}:
        return "Choisissez le mode Taxi : Voiture ou Moto."
    if not _vehicle_matches_mode(driver.get("vehicle_type"), mode):
        return ("Le Moto-taxi nécessite un véhicule moto. Mettez à jour votre véhicule."
                if mode == "moto"
                else "Le Taxi nécessite un véhicule adapté (voiture). Mettez à jour votre véhicule.")
    if not _has_vtc_document(driver):
        return "Le service Taxi nécessite votre Carte VTC. Ajoutez-la dans « Mes documents »."
    return None


# ── Driver categories (V3Cube arborescence) ───────────────────────────────
# Phase 1: defaults seeded into `driver_categories` (editable later via Admin Phase 2).
# vehicle_class: car | moto | velo  ;  taxi_sub: particulier | vtc | taxi (taxi-voiture only)
DEFAULT_DRIVER_CATEGORIES = [
    {"id": "taxi_moto", "service": "taxi", "vehicle_class": "moto", "taxi_sub": None, "label": "Moto-taxi", "order": 1,
     "documents": [{"key": "permis_moto", "label": "Permis (A/AM)"}, {"key": "carte_grise", "label": "Carte grise moto"}, {"key": "assurance", "label": "Assurance"}]},
    {"id": "taxi_car_particulier", "service": "taxi", "vehicle_class": "car", "taxi_sub": "particulier", "label": "Taxi · Particulier", "order": 2,
     "documents": [{"key": "permis_b", "label": "Permis B"}, {"key": "carte_grise", "label": "Carte grise"}, {"key": "assurance", "label": "Assurance"}]},
    {"id": "taxi_car_vtc", "service": "taxi", "vehicle_class": "car", "taxi_sub": "vtc", "label": "Taxi · VTC", "order": 3,
     "documents": [{"key": "permis_b", "label": "Permis B"}, {"key": "carte_vtc", "label": "Carte VTC"}, {"key": "macaron_vtc", "label": "Macaron VTC"}, {"key": "carte_grise", "label": "Carte grise"}, {"key": "assurance", "label": "Assurance"}]},
    {"id": "taxi_car_taxi", "service": "taxi", "vehicle_class": "car", "taxi_sub": "taxi", "label": "Taxi (licence)", "order": 4,
     "documents": [{"key": "permis_b", "label": "Permis B"}, {"key": "carte_pro_taxi", "label": "Carte professionnelle Taxi (ADS)"}, {"key": "carte_grise", "label": "Carte grise"}, {"key": "assurance", "label": "Assurance"}]},
    {"id": "courier_velo", "service": "courier", "vehicle_class": "velo", "taxi_sub": None, "label": "Coursier · Vélo", "order": 5,
     "documents": [{"key": "piece_identite", "label": "Pièce d'identité"}, {"key": "assurance_rc", "label": "Assurance RC"}]},
    {"id": "courier_moto", "service": "courier", "vehicle_class": "moto", "taxi_sub": None, "label": "Coursier · Moto", "order": 6,
     "documents": [{"key": "permis_moto", "label": "Permis (A/AM)"}, {"key": "carte_grise", "label": "Carte grise"}, {"key": "assurance", "label": "Assurance"}]},
    {"id": "courier_car", "service": "courier", "vehicle_class": "car", "taxi_sub": None, "label": "Coursier · Voiture", "order": 7,
     "documents": [{"key": "permis_b", "label": "Permis B"}, {"key": "carte_grise", "label": "Carte grise"}, {"key": "assurance", "label": "Assurance"}]},
    {"id": "delivery_velo", "service": "delivery", "vehicle_class": "velo", "taxi_sub": None, "label": "Livreur · Vélo", "order": 8,
     "documents": [{"key": "piece_identite", "label": "Pièce d'identité"}, {"key": "assurance_rc", "label": "Assurance RC"}]},
    {"id": "delivery_moto", "service": "delivery", "vehicle_class": "moto", "taxi_sub": None, "label": "Livreur · Moto", "order": 9,
     "documents": [{"key": "permis_moto", "label": "Permis (A/AM)"}, {"key": "carte_grise", "label": "Carte grise"}, {"key": "assurance", "label": "Assurance"}]},
    {"id": "delivery_car", "service": "delivery", "vehicle_class": "car", "taxi_sub": None, "label": "Livreur · Voiture", "order": 10,
     "documents": [{"key": "permis_b", "label": "Permis B"}, {"key": "carte_grise", "label": "Carte grise"}, {"key": "assurance", "label": "Assurance"}]},
]

VEHICLE_CLASS_TO_TYPE = {"car": "car", "moto": "motorcycle", "velo": "bicycle"}


async def seed_driver_categories():
    """Idempotent seed; $setOnInsert preserves any admin edits (Phase 2)."""
    for c in DEFAULT_DRIVER_CATEGORIES:
        await db.driver_categories.update_one(
            {"id": c["id"]},
            {"$setOnInsert": {**c, "active": True}},
            upsert=True,
        )


async def _fetch_categories(ids):
    cats = []
    async for c in db.driver_categories.find({"id": {"$in": list(ids)}, "active": True}, {"_id": 0}):
        cats.append(c)
    if not cats:  # fallback to defaults if collection empty
        cats = [c for c in DEFAULT_DRIVER_CATEGORIES if c["id"] in set(ids)]
    return cats


def _derive_from_categories(cats):
    service_types = sorted({c["service"] for c in cats})
    taxi_cats = [c for c in cats if c["service"] == "taxi"]
    taxi_mode = ("moto" if taxi_cats and taxi_cats[0]["vehicle_class"] == "moto" else ("car" if taxi_cats else None))
    taxi_sub = taxi_cats[0].get("taxi_sub") if taxi_cats else None
    vehicle_class = cats[0]["vehicle_class"] if cats else None
    docs, seen = [], set()
    for c in cats:
        for d in c.get("documents", []):
            if d["key"] not in seen:
                seen.add(d["key"])
                docs.append(d)
    return service_types, taxi_mode, taxi_sub, vehicle_class, docs


async def _required_documents_for_driver(driver):
    """Required documents derived from the driver's chosen categories. [{key,label}]"""
    cat_ids = driver.get("categories") or []
    if not cat_ids:
        return []
    cats = await _fetch_categories(cat_ids)
    _, _, _, _, docs = _derive_from_categories(cats)
    return docs


async def build_documents_view(driver):
    """Merge required documents (from the driver's categories) with what was actually
    uploaded into db.drivers.documents. Most recent upload of each type wins.
    Returns {documents, required_count, approved_count, pending_count, all_required_approved}."""
    required = await _required_documents_for_driver(driver)
    uploaded = driver.get("documents") or []
    by_type = {}
    for doc in uploaded:
        by_type[doc.get("type")] = doc  # most recent of each type wins
    items, seen = [], set()
    for req in required:
        seen.add(req["key"])
        u = by_type.get(req["key"]) or {}
        items.append({
            "key": req["key"], "label": req["label"], "required": True,
            "status": u.get("status", "not_uploaded"),
            "uploaded_at": u.get("uploaded_at"), "filename": u.get("filename"),
            "reason": u.get("reason"), "reviewed_at": u.get("reviewed_at"),
        })
    # Known human labels for doc types that may be uploaded outside the required set.
    DOC_LABELS = {
        "permis_b": "Permis B", "permis_moto": "Permis (A/AM)", "carte_grise": "Carte grise",
        "assurance": "Assurance", "assurance_rc": "Assurance RC", "carte_vtc": "Carte VTC",
        "vtc_card": "Carte VTC", "macaron_vtc": "Macaron VTC", "carte_pro_taxi": "Carte professionnelle Taxi (ADS)",
        "carte_pro_taxi_ads": "Carte professionnelle Taxi (ADS)", "piece_identite": "Pièce d'identité",
        "carte_identite": "Carte d'identité", "rib": "RIB", "kbis": "Extrait Kbis", "photo": "Photo de profil",
    }
    for doc in uploaded:  # extra uploaded docs not in the required list
        t = doc.get("type")
        if t not in seen:
            seen.add(t)
            human = DOC_LABELS.get(t) or (t or "").replace("_", " ").strip().capitalize()
            items.append({
                "key": t, "label": human, "required": False,
                "status": doc.get("status", "pending"),
                "uploaded_at": doc.get("uploaded_at"), "filename": doc.get("filename"),
                "reason": doc.get("reason"), "reviewed_at": doc.get("reviewed_at"),
            })
    approved = sum(1 for i in items if i["status"] == "approved")
    pending = sum(1 for i in items if i["status"] in ("pending", "pending_review"))
    all_required_approved = bool(required) and all(
        (by_type.get(r["key"]) or {}).get("status") == "approved" for r in required
    )
    return {
        "documents": items, "required_count": len(required),
        "approved_count": approved, "pending_count": pending,
        "all_required_approved": all_required_approved,
    }



@router.get("/categories")
async def list_driver_categories(request: Request):
    await get_current_user(request)
    cats = []
    async for c in db.driver_categories.find({"active": True}, {"_id": 0}).sort("order", 1):
        cats.append(c)
    return cats or DEFAULT_DRIVER_CATEGORIES



@router.post("/push-token")
async def register_push_token(request: Request):
    """Store the driver's Expo push token for remote mission alerts."""
    user = await get_current_user(request)
    body = await request.json()
    token = body.get("token")
    if not token:
        raise HTTPException(status_code=400, detail="Token requis")
    await db.drivers.update_one(
        {"user_id": user["id"]},
        {"$set": {"push_token": token, "push_token_updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    return {"ok": True}


@router.post("/register", response_model=DriverProfile)
async def register_driver(data: DriverCreate, request: Request):
    user = await get_current_user(request)
    existing = await db.drivers.find_one({"user_id": user["id"]})
    if existing:
        raise HTTPException(status_code=400, detail="Already registered as driver")

    category_ids = data.categories or []
    taxi_sub = None
    vehicle_class = None
    if category_ids:
        # V3Cube arborescence: derive everything from the chosen category leaves
        cats = await _fetch_categories(category_ids)
        valid = {c["id"] for c in cats}
        if not cats or any(cid not in valid for cid in category_ids):
            raise HTTPException(status_code=400, detail="Catégorie(s) invalide(s)")
        classes = {c["vehicle_class"] for c in cats}
        if len(classes) > 1:
            raise HTTPException(status_code=400, detail="Un seul type de véhicule par chauffeur")
        service_types, taxi_mode, taxi_sub, vehicle_class, _docs = _derive_from_categories(cats)
        vehicle_type = VEHICLE_CLASS_TO_TYPE.get(vehicle_class, data.vehicle_type)
    else:
        # Legacy path (service_types + taxi_mode)
        allowed = {"taxi", "delivery", "courier"}
        service_types = [s for s in (data.service_types or []) if s in allowed] or ["delivery", "courier"]
        vehicle_type = data.vehicle_type
        vehicle_class = ("car" if _is_car_vehicle(vehicle_type) else ("moto" if _is_moto_vehicle(vehicle_type) else "velo"))
        taxi_mode = None
        if "taxi" in service_types:
            taxi_mode = data.taxi_mode
            if taxi_mode not in {"car", "moto"}:
                raise HTTPException(status_code=400, detail="Choisissez le mode Taxi : Voiture ou Moto.")
            if not _vehicle_matches_mode(vehicle_type, taxi_mode):
                raise HTTPException(
                    status_code=400,
                    detail=("Le Moto-taxi nécessite un véhicule moto."
                            if taxi_mode == "moto"
                            else "Le Taxi nécessite un véhicule adapté (voiture)."),
                )

    driver = {
        "id": f"driver_{uuid.uuid4().hex[:12]}",
        "user_id": user["id"],
        "vehicle_type": vehicle_type,
        "vehicle_class": vehicle_class,
        "vehicle_number": data.vehicle_number,
        "vehicle_model": data.vehicle_model,
        "license_number": data.license_number,
        "company_name": data.company_name,
        "service_types": service_types,
        "categories": category_ids,
        "taxi_mode": taxi_mode,
        "taxi_sub": taxi_sub,
        "status": "pending",
        "is_online": False,
        "current_lat": None,
        "current_lng": None,
        "rating": 5.0,
        "total_trips": 0,
        "earnings": 0.0,
        "documents": [],
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.drivers.insert_one(driver)
    await db.users.update_one({"id": user["id"]}, {"$set": {"role": "driver"}})
    driver.pop("_id", None)
    return DriverProfile(**driver)


@router.get("/profile", response_model=DriverProfile)
async def get_driver_profile(request: Request):
    user = await get_current_user(request)
    driver = await db.drivers.find_one({"user_id": user["id"]}, {"_id": 0})
    if not driver:
        raise HTTPException(status_code=404, detail="Driver profile not found")
    return DriverProfile(**driver)


@router.put("/service-types")
async def update_service_types(request: Request):
    """Driver chooses which services they handle: taxi, delivery (livreur), courier (coursier).
    Taxi (transport de personnes) needs a mode: 'car' (taxi voiture) or 'moto' (moto-taxi),
    with a matching vehicle + a Carte VTC document."""
    user = await get_current_user(request)
    body = await request.json()
    allowed = {"taxi", "delivery", "courier"}
    service_types = [s for s in (body.get("service_types") or []) if s in allowed]
    if not service_types:
        raise HTTPException(status_code=400, detail="Sélectionnez au moins un service (taxi, livreur ou coursier)")
    driver = await db.drivers.find_one(
        {"user_id": user["id"]}, {"_id": 0, "service_types": 1, "vehicle_type": 1, "documents": 1, "taxi_mode": 1}
    )
    if not driver:
        raise HTTPException(status_code=404, detail="Driver profile not found")

    taxi_mode = driver.get("taxi_mode")
    if "taxi" in service_types:
        requested_mode = body.get("taxi_mode") or driver.get("taxi_mode")
        had_taxi = "taxi" in (driver.get("service_types") or [])
        adding_taxi = not had_taxi
        mode_changed = had_taxi and body.get("taxi_mode") and body.get("taxi_mode") != driver.get("taxi_mode")
        # Gate only when adding taxi or switching its mode (keep an existing taxi as-is)
        if adding_taxi or mode_changed:
            reason = _taxi_block_reason(driver, requested_mode)
            if reason:
                raise HTTPException(status_code=400, detail=reason)
        taxi_mode = requested_mode
    else:
        taxi_mode = None  # dropped taxi -> clear the mode

    await db.drivers.update_one(
        {"user_id": user["id"]},
        {"$set": {"service_types": service_types, "taxi_mode": taxi_mode}},
    )
    return {"message": "Services mis à jour", "service_types": service_types, "taxi_mode": taxi_mode}


@router.get("/work-base")
async def get_work_base(request: Request):
    """Driver residence (work base) + currently active services."""
    user = await get_current_user(request)
    driver = await db.drivers.find_one(
        {"user_id": user["id"]}, {"_id": 0, "home_location": 1, "service_types": 1}
    )
    if not driver:
        raise HTTPException(status_code=404, detail="Driver profile not found")
    return {
        "home_location": driver.get("home_location"),
        "service_types": driver.get("service_types") or [],
    }


@router.put("/work-base")
async def set_work_base(request: Request):
    """Set the driver residence (lieu de résidence) and optionally activate every
    service they are eligible for on the platform."""
    user = await get_current_user(request)
    body = await request.json()
    driver = await db.drivers.find_one(
        {"user_id": user["id"]}, {"_id": 0, "service_types": 1, "vehicle_type": 1, "documents": 1, "taxi_mode": 1}
    )
    if not driver:
        raise HTTPException(status_code=404, detail="Driver profile not found")

    update = {}
    address = (body.get("address") or "").strip()
    if address:
        update["home_location"] = {
            "address": address,
            "lat": body.get("lat"),
            "lng": body.get("lng"),
        }

    service_types = driver.get("service_types") or []
    taxi_note = None
    if body.get("activate_all"):
        # delivery + courier are always available; taxi needs the VTC gate.
        services = {"delivery", "courier"}
        taxi_reason = _taxi_block_reason(driver, driver.get("taxi_mode") or "car")
        if taxi_reason:
            taxi_note = f"Taxi non activé : {taxi_reason}"
        else:
            services.add("taxi")
            update["taxi_mode"] = driver.get("taxi_mode") or "car"
        service_types = sorted(services)
        update["service_types"] = service_types

    if update:
        await db.drivers.update_one({"user_id": user["id"]}, {"$set": update})

    return {
        "message": "Lieu de résidence et services mis à jour",
        "home_location": update.get("home_location") or (await db.drivers.find_one({"user_id": user["id"]}, {"_id": 0, "home_location": 1})).get("home_location"),
        "service_types": service_types,
        "taxi_note": taxi_note,
    }


@router.put("/profile/info")
async def request_profile_info_change(request: Request):
    """Driver requests a change to their professional info (company name / license number).
    The change is NOT applied live — it is queued in `pending_info` for admin validation."""
    user = await get_current_user(request)
    body = await request.json()
    company_name = (body.get("company_name") or "").strip()
    license_number = (body.get("license_number") or "").strip()
    driver = await db.drivers.find_one({"user_id": user["id"]}, {"_id": 0})
    if not driver:
        raise HTTPException(status_code=404, detail="Driver profile not found")
    from routes.config import get_app_settings_config
    if not (await get_app_settings_config()).get("allow_driver_edit_profile", True):
        raise HTTPException(status_code=403, detail="La modification du profil est désactivée par l'administrateur.")
    if not company_name and not license_number:
        raise HTTPException(status_code=400, detail="Renseignez au moins un champ (société ou licence).")
    same_company = company_name == (driver.get("company_name") or "")
    same_license = license_number == (driver.get("license_number") or "")
    if same_company and same_license:
        raise HTTPException(status_code=400, detail="Aucune modification détectée.")
    pending = {
        "company_name": company_name,
        "license_number": license_number,
        "previous_company_name": driver.get("company_name") or "",
        "previous_license_number": driver.get("license_number") or "",
        "status": "pending",
        "reason": None,
        "requested_at": datetime.now(timezone.utc).isoformat(),
        "reviewed_at": None,
    }
    await db.drivers.update_one({"user_id": user["id"]}, {"$set": {"pending_info": pending}})
    return {"message": "Demande envoyée — en attente de validation de l'administrateur.", "pending_info": pending}


# ── Driver weekly availability (V3Cube "Ma disponibilité") ────────────────
_AVAIL_DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
DEFAULT_AVAILABILITY = {d: {"enabled": True, "start": "08:00", "end": "20:00"} for d in _AVAIL_DAYS}


@router.get("/availability")
async def get_availability(request: Request):
    user = await get_current_user(request)
    driver = await db.drivers.find_one({"user_id": user["id"]}, {"_id": 0, "availability": 1, "work_address": 1})
    if not driver:
        raise HTTPException(status_code=404, detail="Driver profile not found")
    return {"availability": driver.get("availability") or DEFAULT_AVAILABILITY, "work_address": driver.get("work_address")}


@router.put("/availability")
async def update_availability(request: Request):
    user = await get_current_user(request)
    body = await request.json()
    avail = body.get("availability") or {}
    clean = {}
    for d in _AVAIL_DAYS:
        item = avail.get(d) or {}
        clean[d] = {
            "enabled": bool(item.get("enabled", True)),
            "start": str(item.get("start", "08:00"))[:5],
            "end": str(item.get("end", "20:00"))[:5],
        }
    update = {"availability": clean}
    if "work_address" in body:
        update["work_address"] = (body.get("work_address") or "").strip() or None
    res = await db.drivers.update_one({"user_id": user["id"]}, {"$set": update})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Driver profile not found")
    return {"message": "Disponibilités enregistrées", "availability": clean, "work_address": update.get("work_address")}


# ── Driver reviews / passenger comments (V3Cube "Commentaires des utilisateurs") ──
@router.get("/reviews")
async def get_driver_reviews(request: Request):
    user = await get_current_user(request)
    driver = await db.drivers.find_one({"user_id": user["id"]}, {"_id": 0, "id": 1, "rating": 1})
    if not driver:
        raise HTTPException(status_code=404, detail="Driver profile not found")
    did = driver["id"]
    docs = await db.ratings.find({"driver_id": did}, {"_id": 0}).sort("created_at", -1).to_list(300)
    total = len(docs)
    avg = round(sum(int(d.get("rating", 5)) for d in docs) / total, 2) if total else round(float(driver.get("rating", 5.0) or 5.0), 2)
    distribution = {str(i): 0 for i in range(1, 6)}
    for d in docs:
        r = max(1, min(5, int(d.get("rating", 5))))
        distribution[str(r)] += 1
    user_ids = list({d.get("user_id") for d in docs if d.get("user_id")})
    names = {}
    if user_ids:
        async for u in db.users.find({"id": {"$in": user_ids}}, {"_id": 0, "id": 1, "name": 1, "avatar_url": 1}):
            names[u["id"]] = u
    reviews = []
    for d in docs[:100]:
        u = names.get(d.get("user_id"), {})
        reviews.append({
            "id": d.get("id"),
            "rating": int(d.get("rating", 5)),
            "comment": d.get("comment"),
            "created_at": d.get("created_at"),
            "user_name": u.get("name") or "Client",
            "user_avatar": u.get("avatar_url"),
        })
    return {"average": avg, "total": total, "distribution": distribution, "reviews": reviews}



@router.get("/taxi-eligibility")
async def taxi_eligibility(request: Request):
    """Tells the client which taxi modes the driver can enable, and what's missing."""
    user = await get_current_user(request)
    driver = await db.drivers.find_one(
        {"user_id": user["id"]}, {"_id": 0, "service_types": 1, "vehicle_type": 1, "documents": 1, "taxi_mode": 1}
    )
    if not driver:
        raise HTTPException(status_code=404, detail="Driver profile not found")
    has_vtc = _has_vtc_document(driver)
    has_taxi = "taxi" in (driver.get("service_types") or [])
    return {
        "has_taxi": has_taxi,
        "taxi_mode": driver.get("taxi_mode"),
        "vehicle_type": driver.get("vehicle_type"),
        "has_vtc": has_vtc,
        "can_car": _is_car_vehicle(driver.get("vehicle_type")) and has_vtc,
        "can_moto": _is_moto_vehicle(driver.get("vehicle_type")) and has_vtc,
        "is_car": _is_car_vehicle(driver.get("vehicle_type")),
        "is_moto": _is_moto_vehicle(driver.get("vehicle_type")),
    }


@router.post("/toggle-online")
async def toggle_driver_online(request: Request):
    user = await get_current_user(request)
    driver = await db.drivers.find_one({"user_id": user["id"]})
    if not driver:
        raise HTTPException(status_code=404, detail="Driver profile not found")
    if driver["status"] != "approved":
        raise HTTPException(status_code=400, detail="Driver not approved")
    new_status = not driver["is_online"]
    await db.drivers.update_one({"user_id": user["id"]}, {"$set": {"is_online": new_status}})
    from core.online_sessions import mark_online, mark_offline
    await (mark_online(user["id"]) if new_status else mark_offline(user["id"]))
    # When a driver comes online, alert clients who were waiting for availability.
    if new_status:
        import asyncio
        from core.availability import notify_waiting_clients, record_driver_back_online
        asyncio.create_task(notify_waiting_clients(user["id"]))
        asyncio.create_task(record_driver_back_online(user["id"]))
    return {"is_online": new_status}


@router.post("/location")
async def update_driver_location(request: Request):
    user = await get_current_user(request)
    body = await request.json()
    lat, lng = body.get("lat"), body.get("lng")
    await db.drivers.update_one({"user_id": user["id"]}, {"$set": {"current_lat": lat, "current_lng": lng}})
    manager.update_driver_location(user["id"], lat, lng)
    # Push live position to customers of this driver's active food deliveries
    driver = await db.drivers.find_one({"user_id": user["id"]}, {"_id": 0, "id": 1})
    if driver:
        async for o in db.orders.find(
            {"driver_id": driver["id"], "status": {"$in": ["ready", "picked_up"]}},
            {"_id": 0, "user_id": 1},
        ):
            await manager.send_personal_message({"type": "driver_location", "lat": lat, "lng": lng}, o["user_id"])
    # Proximity alert for an active ride pickup ("Votre chauffeur arrive").
    from core.proximity import maybe_notify_driver_nearby
    await maybe_notify_driver_nearby(user["id"], lat, lng)

    # Rental (mise à disposition): accumulate GPS distance while the meter runs.
    if driver and lat is not None and lng is not None:
        rental = await db.rides.find_one(
            {"driver_id": driver["id"], "ride_type": "rental", "status": "in_progress",
             "rental_started_at": {"$ne": None}, "rental_ended_at": None},
            {"_id": 0, "id": 1, "rental_gps_km": 1, "rental_last_lat": 1, "rental_last_lng": 1},
        )
        if rental:
            from core.airport import _haversine_km
            upd = {"rental_last_lat": lat, "rental_last_lng": lng}
            plat, plng = rental.get("rental_last_lat"), rental.get("rental_last_lng")
            if plat is not None and plng is not None:
                d = _haversine_km(plat, plng, lat, lng)
                if 0 < d < 5:  # ignore GPS jumps > 5km between pings
                    upd["rental_gps_km"] = round(float(rental.get("rental_gps_km") or 0) + d, 2)
            await db.rides.update_one({"id": rental["id"]}, {"$set": upd})
    return {"message": "Location updated"}


@router.post("/documents")
async def upload_driver_document(request: Request, file: UploadFile = File(...), doc_type: str = Query(...)):
    user = await get_current_user(request)
    driver = await db.drivers.find_one({"user_id": user["id"]})
    if not driver:
        raise HTTPException(status_code=404, detail="Driver profile not found")

    ext = file.filename.split(".")[-1] if "." in file.filename else "bin"
    path = f"{APP_NAME}/drivers/{user['id']}/{doc_type}_{uuid.uuid4().hex[:8]}.{ext}"
    data = await file.read()
    result = put_object(path, data, file.content_type or "application/octet-stream")

    doc_record = {
        "type": doc_type, "path": result["path"], "filename": file.filename,
        "uploaded_at": datetime.now(timezone.utc).isoformat(), "status": "pending"
    }
    await db.drivers.update_one({"user_id": user["id"]}, {"$push": {"documents": doc_record}})
    # KYC email: confirm we received the document (fire-and-forget, skip placeholder emails).
    try:
        to = (user.get("email") or "").strip()
        if to and not to.endswith("@sbdrive.local"):
            from core.email import fire, send_document_update
            label = (doc_type or "").replace("_", " ").strip().capitalize()
            docs_url = f"{os.environ.get('FRONTEND_URL', '').rstrip('/')}/chauffeur/documents"
            fire(send_document_update(to, user.get("name", ""), "received", label, docs_url=docs_url))
    except Exception:
        pass
    return {"message": "Document uploaded", "path": result["path"]}



@router.get("/earnings")
async def get_driver_earnings(request: Request):
    user = await get_current_user(request)
    driver = await db.drivers.find_one({"user_id": user["id"]}, {"_id": 0})
    if not driver:
        raise HTTPException(status_code=404, detail="Driver profile not found")

    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    week_start = (now - timedelta(days=now.weekday())).replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0).isoformat()

    # Fetch completed rides for this driver. Rides store driver_id as the DRIVER
    # DOC id (e.g. "driver_xxx"); also match the user id for any legacy records.
    all_rides = await db.rides.find(
        {"driver_id": {"$in": [driver["id"], user["id"]]}, "status": "completed"},
        {"_id": 0, "estimated_fare": 1, "created_at": 1, "pickup_address": 1, "dropoff_address": 1, "distance_km": 1}
    ).sort("created_at", -1).to_list(500)

    # Net earnings = gross fare minus the platform commission (fixed %, admin-set).
    cfg = await db.service_configs.find_one({"service_key": "general"}, {"_id": 0, "settings": 1}) or {}
    commission_pct = float((cfg.get("settings") or {}).get("commission_percent", 15.0))
    net = max(0.0, 1.0 - commission_pct / 100.0)

    today_gross = sum(r.get("estimated_fare", 0) for r in all_rides if r.get("created_at", "") >= today_start)
    week_gross = sum(r.get("estimated_fare", 0) for r in all_rides if r.get("created_at", "") >= week_start)
    month_gross = sum(r.get("estimated_fare", 0) for r in all_rides if r.get("created_at", "") >= month_start)
    total_gross = sum(r.get("estimated_fare", 0) for r in all_rides)

    today_earnings = today_gross * net
    week_earnings = week_gross * net
    month_earnings = month_gross * net
    total_earnings = total_gross * net

    today_trips = len([r for r in all_rides if r.get("created_at", "") >= today_start])
    week_trips = len([r for r in all_rides if r.get("created_at", "") >= week_start])

    recent_rides = all_rides[:20]

    return {
        "today": round(today_earnings, 2),
        "week": round(week_earnings, 2),
        "month": round(month_earnings, 2),
        "total": round(total_earnings, 2),
        "commission_percent": commission_pct,
        "is_net": True,
        "gross_total": round(total_gross, 2),
        "today_trips": today_trips,
        "week_trips": week_trips,
        "total_trips": driver.get("total_trips", 0),
        "rating": driver.get("rating", 5.0),
        "recent_rides": recent_rides,
    }


def _report_export_decision(driver: dict):
    """Who may DOWNLOAD their activity statement (PDF/CSV).
    Allowed by default for professional Taxi (licence) and VTC drivers.
    Particulier and pure Livreur/Coursier accounts are blocked unless the admin
    has granted an explicit per-driver authorization (`report_export_allowed`)."""
    if driver.get("report_export_allowed"):
        return True, None
    sub = (driver.get("taxi_sub") or "").strip().lower()
    if sub in ("vtc", "taxi"):
        return True, None
    return False, (
        "Le téléchargement du relevé est réservé aux chauffeurs Taxi et VTC. "
        "Les comptes Particulier et Livreur nécessitent l'autorisation de l'administrateur."
    )


async def _compute_driver_report(driver: dict, user: dict, start: str, end: str):
    """Aggregate the driver's activity figures for a date range (shared by the
    JSON report endpoint and the PDF/CSV export)."""
    def in_range(iso):
        if not iso:
            return False
        d = str(iso)[:10]
        if start and d < start:
            return False
        if end and d > end:
            return False
        return True

    ids = [driver["id"], user["id"]]
    rides = await db.rides.find(
        {"driver_id": {"$in": ids}, "status": "completed"}, {"_id": 0}
    ).to_list(5000)
    rides = [r for r in rides if in_range(r.get("completed_at") or r.get("created_at"))]

    gross = commission_total = cash_received = card_received = 0.0
    trips = 0
    for r in rides:
        fare = float(r.get("final_fare") or r.get("estimated_fare") or 0)
        comm_pct = float(r.get("commission_percent", 10) or 0)
        gross += fare
        commission_total += fare * comm_pct / 100.0
        cash_received += float(r.get("cash_collected") or 0)
        card_received += float(r.get("digital_captured_fare") or 0)
        trips += 1
    net = gross - commission_total

    cxl_txs = await db.wallet_transactions.find(
        {"user_id": user["id"]}, {"_id": 0, "amount": 1, "description": 1, "created_at": 1, "type": 1}
    ).to_list(5000)
    cancellation_fees = sum(
        float(t.get("amount") or 0)
        for t in cxl_txs
        if in_range(t.get("created_at")) and "annulation" in (t.get("description") or "").lower()
        and float(t.get("amount") or 0) > 0
    )

    from core.wallet_reserve import ensure_reserve_credited
    floor = await ensure_reserve_credited(user)
    w = await db.wallets.find_one({"user_id": user["id"]}, {"_id": 0}) or {}
    balance = float(w.get("balance", 0) or 0)
    pending = float(w.get("pending_withdraw", 0) or 0)
    non_wd = float(w.get("non_withdrawable", 0) or 0)
    withdrawable = round(max(0.0, balance - floor - pending - non_wd), 2)

    return {
        "from": start or None,
        "to": end or None,
        "trips": trips,
        "gross": round(gross, 2),
        "commission": round(commission_total, 2),
        "net": round(net, 2),
        "cash_received": round(cash_received, 2),
        "card_received": round(card_received, 2),
        "cancellation_fees": round(cancellation_fees, 2),
        "balance": round(balance, 2),
        "reserve": round(floor, 2),
        "pending_withdraw": round(pending, 2),
        "non_withdrawable": round(non_wd, 2),
        "withdrawable": withdrawable,
        "currency": "EUR",
    }


@router.get("/report")
async def driver_activity_report(request: Request):
    """Driver activity report over a date range (default = all-time).
    Query: ?from=YYYY-MM-DD&to=YYYY-MM-DD. Returns the global figures the driver
    sees at the end of the day: gross revenue, commission, net, cash received,
    card (digital) received, cancellation fees, current balance & withdrawable.
    Also exposes whether the driver may download the statement (export gate)."""
    user = await get_current_user(request)
    driver = await db.drivers.find_one({"user_id": user["id"]}, {"_id": 0})
    if not driver:
        raise HTTPException(status_code=404, detail="Driver profile not found")

    qp = request.query_params
    start = (qp.get("from") or "")[:10]
    end = (qp.get("to") or "")[:10]
    report = await _compute_driver_report(driver, user, start, end)
    export_allowed, export_reason = _report_export_decision(driver)
    report["export_allowed"] = export_allowed
    report["export_reason"] = export_reason
    report["taxi_sub"] = driver.get("taxi_sub")
    return report


@router.get("/report/export")
async def driver_activity_report_export(request: Request):
    """Download the activity statement as CSV or PDF (?format=csv|pdf).
    Gated: Taxi/VTC allowed; Particulier/Livreur require admin authorization."""
    from fastapi import Response
    user = await get_current_user(request)
    driver = await db.drivers.find_one({"user_id": user["id"]}, {"_id": 0})
    if not driver:
        raise HTTPException(status_code=404, detail="Driver profile not found")
    allowed, reason = _report_export_decision(driver)
    if not allowed:
        raise HTTPException(status_code=403, detail=reason)

    qp = request.query_params
    fmt = (qp.get("format") or "pdf").strip().lower()
    start = (qp.get("from") or "")[:10]
    end = (qp.get("to") or "")[:10]
    r = await _compute_driver_report(driver, user, start, end)
    _to_label = end or "aujourd'hui"
    period = f"{start or 'début'} → {_to_label}"
    rows = [
        ("Courses terminées", str(r["trips"])),
        ("Chiffre global (brut)", f"{r['gross']:.2f} €"),
        ("Commission plateforme", f"-{r['commission']:.2f} €"),
        ("Revenu net", f"{r['net']:.2f} €"),
        ("Espèces reçues (gardées en main)", f"{r['cash_received']:.2f} €"),
        ("Paiements CB / SB Pay (encaissé)", f"{r['card_received']:.2f} €"),
        ("Frais d'annulation (non retirable)", f"{r['cancellation_fees']:.2f} €"),
        ("Solde actuel", f"{r['balance']:.2f} €"),
        ("Réserve conservée", f"{r['reserve']:.2f} €"),
        ("En attente de retrait", f"{r['pending_withdraw']:.2f} €"),
        ("Non retirable", f"{r['non_withdrawable']:.2f} €"),
        ("Montant retirable", f"{r['withdrawable']:.2f} €"),
    ]
    name = user.get("name") or "Chauffeur"
    fname_base = f"releve_{(start or 'tout')}_{(end or 'tout')}"

    if fmt == "csv":
        import csv, io
        buf = io.StringIO()
        buf.write("\ufeff")  # BOM for Excel/accents
        wcsv = csv.writer(buf, delimiter=";")
        wcsv.writerow(["Relevé d'activité", name])
        wcsv.writerow(["Période", period])
        wcsv.writerow([])
        wcsv.writerow(["Libellé", "Montant"])
        for label, val in rows:
            wcsv.writerow([label, val])
        return Response(
            content=buf.getvalue(),
            media_type="text/csv; charset=utf-8",
            headers={"Content-Disposition": f'attachment; filename="{fname_base}.csv"'},
        )

    # PDF (reportlab)
    import io
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.lib import colors
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
    from reportlab.lib.styles import getSampleStyleSheet
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, topMargin=20 * mm, bottomMargin=20 * mm)
    styles = getSampleStyleSheet()
    elems = [
        Paragraph(f"<b>{APP_NAME} — Relevé d'activité chauffeur</b>", styles["Title"]),
        Paragraph(f"Chauffeur : {name}", styles["Normal"]),
        Paragraph(f"Période : {period}", styles["Normal"]),
        Paragraph(f"Catégorie : {(driver.get('taxi_sub') or '—').upper()}", styles["Normal"]),
        Spacer(1, 8 * mm),
    ]
    data = [["Libellé", "Montant"]] + [[label, val] for label, val in rows]
    table = Table(data, colWidths=[110 * mm, 50 * mm])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f59e0b")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cccccc")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f7f7f7")]),
        ("ALIGN", (1, 0), (1, -1), "RIGHT"),
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
    ]))
    elems.append(table)
    elems.append(Spacer(1, 6 * mm))
    elems.append(Paragraph(
        "<font size=8 color='#888888'>Les espèces perçues vous appartiennent (déjà en votre possession). "
        "Seuls les paiements numériques nets de commission sont retirables. Document généré automatiquement.</font>",
        styles["Normal"]))
    doc.build(elems)
    return Response(
        content=buf.getvalue(),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{fname_base}.pdf"'},
    )




@router.get("/ride-history")
async def get_driver_ride_history(request: Request):
    user = await get_current_user(request)
    driver = await db.drivers.find_one({"user_id": user["id"]})
    if not driver:
        raise HTTPException(status_code=404, detail="Driver profile not found")

    rides = await db.rides.find(
        {"driver_id": driver["id"]},
        {"_id": 0, "otp": 0, "start_otp": 0},
    ).sort("created_at", -1).limit(50).to_list(50)

    return {"rides": rides}



# ===== DRIVER ACTIVITY / POINTS =====

async def _get_rewards_points_config(zone=None):
    """Read points config from service_configs (or defaults), zone-aware."""
    from routes.admin import get_rewards_config
    cfg = await get_rewards_config(zone)
    return cfg["points"]


def _resolve_palette(points: int, palettes: list):
    for p in palettes:
        if p["min_points"] <= points <= p["max_points"]:
            return p
    # Overflow: points exceed all ranges → return the highest palette
    if palettes:
        highest = max(palettes, key=lambda p: p["max_points"])
        if points > highest["max_points"]:
            return highest
    return palettes[0] if palettes else None


async def _ensure_driver_stats(driver: dict, points_cfg: dict):
    """Ensure driver has initial points/activity fields."""
    updates = {}
    if "points" not in driver:
        updates["points"] = points_cfg["initial_points"]
    if "offered_count" not in driver:
        updates["offered_count"] = 0
    if "accepted_count" not in driver:
        updates["accepted_count"] = 0
    if "refused_count" not in driver:
        updates["refused_count"] = 0
    if "cancelled_count" not in driver:
        updates["cancelled_count"] = 0
    if "acceptance_rate" not in driver:
        updates["acceptance_rate"] = 100
    if "cancellation_rate" not in driver:
        updates["cancellation_rate"] = 0
    if updates:
        await db.drivers.update_one({"id": driver["id"]}, {"$set": updates})
        driver.update(updates)
    return driver


async def _recompute_rates(driver_id: str):
    d = await db.drivers.find_one({"id": driver_id}, {"_id": 0})
    if not d:
        return
    offered = d.get("offered_count", 0) or (d.get("accepted_count", 0) + d.get("refused_count", 0))
    accepted = d.get("accepted_count", 0)
    cancelled = d.get("cancelled_count", 0)
    acceptance = round((accepted / offered) * 100) if offered > 0 else 100
    cancellation = round((cancelled / max(accepted, 1)) * 100) if accepted > 0 else 0
    await db.drivers.update_one(
        {"id": driver_id},
        {"$set": {"acceptance_rate": acceptance, "cancellation_rate": cancellation}},
    )


@router.get("/my-activity")
async def get_my_activity(request: Request, location: str = ""):
    """Return the driver's activity dashboard: points, palette, acceptance rate, score.
    `location` (browser-resolved) selects a zone-specific points/palette config."""
    from core.geo_scope import resolve_zone_from_text
    user = await get_current_user(request)
    driver = await db.drivers.find_one({"user_id": user["id"]}, {"_id": 0})
    if not driver:
        raise HTTPException(status_code=404, detail="Driver profile not found")

    zone = resolve_zone_from_text(location) if location else None
    points_cfg = await _get_rewards_points_config(zone)
    driver = await _ensure_driver_stats(driver, points_cfg)
    palette = _resolve_palette(driver.get("points", 0), points_cfg["palettes"])

    # Activity score: weighted composite (points 50% + acceptance 30% + (100-cancellation) 20%)
    points_pct = min(driver.get("points", 0), 100)
    acceptance = driver.get("acceptance_rate", 100)
    cancellation = driver.get("cancellation_rate", 0)
    activity_score = round(points_pct * 0.5 + acceptance * 0.3 + (100 - cancellation) * 0.2)

    # Count today's completed rides
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    today_completed = await db.rides.count_documents({
        "driver_id": driver["id"],
        "status": "completed",
        "completed_at": {"$gte": today_start},
    })

    return {
        "points": driver.get("points", 0),
        "initial_points": points_cfg["initial_points"],
        "palette": {
            "name": palette["name"] if palette else "",
            "color": palette["color"] if palette else "#9CA3AF",
            "priority_access": palette["priority_access"] if palette else False,
            "max_ride_amount": palette["max_ride_amount"] if palette else 0,
            "min_points": palette["min_points"] if palette else 0,
            "max_points": palette["max_points"] if palette else 100,
        },
        "acceptance_rate": acceptance,
        "cancellation_rate": cancellation,
        "activity_score": activity_score,
        "offered_count": driver.get("offered_count", 0),
        "accepted_count": driver.get("accepted_count", 0),
        "refused_count": driver.get("refused_count", 0),
        "cancelled_count": driver.get("cancelled_count", 0),
        "total_trips": driver.get("total_trips", 0),
        "today_completed": today_completed,
        "rating": driver.get("rating", 5.0),
        "manual_priority": driver.get("manual_priority", False),
        "has_priority": driver.get("manual_priority", False) or (palette["priority_access"] if palette else False),
        "rules": {
            "points_per_ride_accepted": points_cfg.get("points_per_ride_accepted", 2),
            "points_per_ride_completed": points_cfg.get("points_per_ride_completed", 3),
            "points_lost_per_refuse": points_cfg.get("points_lost_per_refuse", 5),
            "points_lost_per_cancel": points_cfg.get("points_lost_per_cancel", 10),
        },
    }


@router.get("/my-score-history")
async def get_my_score_history(request: Request):
    """Return the driver's recent score_log entries + next-palette distance."""
    user = await get_current_user(request)
    driver = await db.drivers.find_one({"user_id": user["id"]}, {"_id": 0, "points": 1, "score_log": 1})
    if not driver:
        raise HTTPException(status_code=404, detail="Driver profile not found")

    points_cfg = await _get_rewards_points_config()
    palettes = sorted(points_cfg.get("palettes", []), key=lambda p: p["min_points"])
    current_points = driver.get("points") or 0
    current_palette = _resolve_palette(current_points, palettes)
    next_palette = None
    points_to_next = None
    for p in palettes:
        if p["min_points"] > current_points:
            next_palette = p
            points_to_next = p["min_points"] - current_points
            break

    log = list(reversed(driver.get("score_log") or []))[:50]  # most recent first
    total_gained = sum(e["delta"] for e in log if e.get("delta", 0) > 0)
    total_lost = sum(-e["delta"] for e in log if e.get("delta", 0) < 0)

    return {
        "current_points": current_points,
        "current_palette": {
            "name": current_palette["name"] if current_palette else "",
            "color": current_palette["color"] if current_palette else "#9CA3AF",
            "min_points": current_palette["min_points"] if current_palette else 0,
            "max_points": current_palette["max_points"] if current_palette else 100,
        } if current_palette else None,
        "next_palette": {
            "name": next_palette["name"],
            "color": next_palette["color"],
            "min_points": next_palette["min_points"],
            "points_to_reach": points_to_next,
        } if next_palette else None,
        "history": log,
        "totals": {"gained": total_gained, "lost": total_lost, "entries": len(driver.get("score_log") or [])},
    }


@router.get("/my-earnings-breakdown")
async def get_my_earnings_breakdown(request: Request):
    """Return the driver's earnings split into today, this week (Mon-Sun) and this month."""
    user = await get_current_user(request)
    driver = await db.drivers.find_one({"user_id": user["id"]}, {"_id": 0, "id": 1})
    if not driver:
        raise HTTPException(status_code=404, detail="Driver profile not found")

    now = datetime.now(timezone.utc)
    start_of_day = now.replace(hour=0, minute=0, second=0, microsecond=0)
    start_of_week = (start_of_day - timedelta(days=start_of_day.weekday()))
    start_of_month = start_of_day.replace(day=1)

    # Net earnings = gross final_fare minus the platform commission (admin-set %).
    cfg = await db.service_configs.find_one({"service_key": "general"}, {"_id": 0, "settings": 1}) or {}
    commission_pct = float((cfg.get("settings") or {}).get("commission_percent", 15.0))
    net = max(0.0, 1.0 - commission_pct / 100.0)

    async def sum_fares(since_iso: str) -> dict:
        pipeline = [
            {"$match": {
                "driver_id": driver["id"],
                "status": "completed",
                "completed_at": {"$gte": since_iso},
            }},
            {"$group": {"_id": None, "total": {"$sum": "$final_fare"}, "count": {"$sum": 1}}},
        ]
        rows = await db.rides.aggregate(pipeline).to_list(1)
        if rows:
            return {"earnings": round((rows[0]["total"] or 0) * net, 2), "trips": rows[0]["count"]}
        return {"earnings": 0.0, "trips": 0}

    today = await sum_fares(start_of_day.isoformat())
    week = await sum_fares(start_of_week.isoformat())
    month = await sum_fares(start_of_month.isoformat())

    # Last 7 days (incl. today) — net daily earnings for the mini bar chart.
    seven_start = start_of_day - timedelta(days=6)
    daily_rows = await db.rides.aggregate([
        {"$match": {
            "driver_id": driver["id"],
            "status": "completed",
            "completed_at": {"$gte": seven_start.isoformat()},
        }},
        {"$group": {"_id": {"$substr": ["$completed_at", 0, 10]},
                    "total": {"$sum": "$final_fare"}, "count": {"$sum": 1}}},
    ]).to_list(50)
    by_day = {r["_id"]: r for r in daily_rows}
    daily_7d = []
    for i in range(6, -1, -1):
        d = (start_of_day - timedelta(days=i)).date().isoformat()
        r = by_day.get(d)
        daily_7d.append({
            "date": d,
            "earnings": round((r["total"] if r else 0) * net, 2),
            "trips": r["count"] if r else 0,
        })

    return {
        "today": today,
        "week": week,
        "month": month,
        "daily_7d": daily_7d,
        "commission_percent": commission_pct,
        "is_net": True,
        "currency": "EUR",
        "as_of": now.isoformat(),
    }


@router.post("/refuse-ride/{ride_id}")
async def refuse_ride(ride_id: str, request: Request):
    """Driver refuses an offered ride → lose points + increment offered/refused counters."""
    user = await get_current_user(request)
    driver = await db.drivers.find_one({"user_id": user["id"]}, {"_id": 0})
    if not driver:
        raise HTTPException(status_code=404, detail="Driver profile not found")

    ride = await db.rides.find_one({"id": ride_id}, {"_id": 0})
    if not ride:
        raise HTTPException(status_code=404, detail="Ride not found")
    if ride.get("status") != "pending":
        raise HTTPException(status_code=400, detail="Ride is no longer pending")

    points_cfg = await _get_rewards_points_config()
    loss = int(points_cfg.get("points_lost_per_refuse", 5))
    current_points = driver.get("points", points_cfg["initial_points"])
    new_points = max(0, current_points - loss)

    await db.drivers.update_one(
        {"id": driver["id"]},
        {
            "$set": {"points": new_points},
            "$inc": {"offered_count": 1, "refused_count": 1},
            "$push": {"refused_ride_ids": ride_id},
        },
    )
    await _recompute_rates(driver["id"])

    return {
        "message": "Ride refused",
        "points": new_points,
        "points_lost": loss,
    }



# ===== TOP CHAUFFEURS PUBLIC RANKING =====

@router.get("/top")
async def get_top_drivers():
    """Public endpoint: returns top drivers based on composite score (points, trips, rating) or admin manual list."""
    cfg_doc = await db.service_configs.find_one({"service_key": "top_drivers"}, {"_id": 0}) or {}
    settings = cfg_doc.get("settings", {})
    mode = settings.get("mode", "composite")
    max_shown = int(settings.get("max_shown", 10))
    manual_ids = settings.get("manual_driver_ids", [])

    # Pull approved drivers
    drivers = await db.drivers.find({"status": "approved"}, {"_id": 0}).to_list(500)

    # Enrich with user name
    enriched = []
    for d in drivers:
        u = await db.users.find_one({"id": d["user_id"]}, {"_id": 0, "name": 1, "avatar_url": 1}) or {}
        pts = d.get("points", 0)
        trips = d.get("total_trips", 0)
        rating = d.get("rating", 5.0)
        # composite score: 40% points (0-100), 40% trips capped at 500, 20% rating (0-5)
        composite = round(pts * 0.4 + min(trips, 500) / 5.0 * 0.4 + rating / 5.0 * 100 * 0.2, 1)
        enriched.append({
            "driver_id": d["id"],
            "name": u.get("name", "Chauffeur"),
            "avatar_url": u.get("avatar_url"),
            "vehicle_type": d.get("vehicle_type"),
            "vehicle_model": d.get("vehicle_model"),
            "points": pts,
            "total_trips": trips,
            "rating": round(rating, 1),
            "composite_score": composite,
            "manual_priority": d.get("manual_priority", False),
        })

    if mode == "manual" and manual_ids:
        ranked = [e for e in enriched if e["driver_id"] in manual_ids]
        ranked.sort(key=lambda x: manual_ids.index(x["driver_id"]))
    elif mode == "points":
        ranked = sorted(enriched, key=lambda x: -x["points"])
    else:  # composite
        ranked = sorted(enriched, key=lambda x: -x["composite_score"])

    return {"mode": mode, "drivers": ranked[:max_shown]}


# ===== ACTIVE REWARDS for the current driver =====

def _vehicle_matches(regard_type: str, driver_vehicle_type: str) -> bool:
    if not regard_type or not driver_vehicle_type:
        return True
    rt = regard_type.lower()
    vt = driver_vehicle_type.lower()
    mapping = {
        "voiture": ("car", "taxi", "sb", "sedan", "suv", "premium"),
        "moto": ("moto", "motorcycle", "bike", "scooter"),
        "velo": ("velo", "bike", "bicycle"),
    }
    for label, aliases in mapping.items():
        if label in rt:
            return vt in aliases or any(a in vt for a in aliases)
    return rt in vt or vt in rt


def _in_date_window(start_date: str, end_date: str, now_iso: str) -> bool:
    today = now_iso[:10]
    if start_date and today < start_date:
        return False
    if end_date and today > end_date:
        return False
    return True


def _in_time_window(start_time: str, end_time: str, now_hm: str) -> bool:
    s = start_time or "00:00"
    e = end_time or "23:59"
    if s <= e:
        return s <= now_hm <= e
    # window over midnight
    return now_hm >= s or now_hm <= e


@router.get("/my-active-rewards")
async def get_my_active_rewards(request: Request, location: str = ""):
    """Returns only the rewards currently active for the caller driver.
    `location` (browser-resolved) selects a zone-specific rewards config."""
    from routes.admin import get_rewards_config
    from core.geo_scope import resolve_zone_from_text
    user = await get_current_user(request)
    driver = await db.drivers.find_one({"user_id": user["id"]}, {"_id": 0})
    if not driver:
        raise HTTPException(status_code=404, detail="Driver profile not found")

    zone = resolve_zone_from_text(location) if location else None
    cfg = await get_rewards_config(zone)
    now = datetime.now(timezone.utc)
    now_iso = now.isoformat()
    now_hm = now.strftime("%H:%M")

    active_vehicle_rewards = []
    for r in (cfg.get("regard_vehicles") or []):
        if not r.get("active"):
            continue
        if not _vehicle_matches(r.get("type") or "", driver.get("vehicle_type") or ""):
            continue
        if not _in_date_window(r.get("start_date", ""), r.get("end_date", ""), now_iso):
            continue
        if not _in_time_window(r.get("start_time", ""), r.get("end_time", ""), now_hm):
            continue
        active_vehicle_rewards.append(r)

    active_guarantees = []
    acceptance = driver.get("acceptance_rate", 100)
    cancellation = driver.get("cancellation_rate", 0)
    for g in (cfg.get("guarantees") or []):
        if not g.get("active"):
            continue
        if not _in_date_window(g.get("start_date", ""), g.get("end_date", ""), now_iso):
            continue
        if not _in_time_window(g.get("start_hour", ""), g.get("end_hour", ""), now_hm):
            continue
        eligible = acceptance >= (g.get("acceptance_rate") or 0) and cancellation <= (g.get("max_cancellation") or 100)
        active_guarantees.append({**g, "eligible": eligible})

    return {
        "vehicle_rewards": active_vehicle_rewards,
        "guarantees": active_guarantees,
        "any_active": bool(active_vehicle_rewards) or bool(active_guarantees),
        "checked_at": now_iso,
        "driver_vehicle_type": driver.get("vehicle_type"),
        "driver_acceptance_rate": acceptance,
        "driver_cancellation_rate": cancellation,
    }



# ═══════════ ALIASES for UI-expected driver endpoints ═══════════

@router.get("/my-stats")
async def my_stats(request: Request):
    """Alias combining profile + activity."""
    user = await get_current_user(request)
    d = await db.drivers.find_one({"user_id": user["id"]}, {"_id": 0})
    if not d:
        raise HTTPException(status_code=404, detail="Driver profile not found")
    return {
        "total_trips": d.get("total_trips", 0),
        "earnings": d.get("earnings", 0),
        "rating": d.get("rating", 5.0),
        "points": d.get("points", 0),
        "acceptance_rate": d.get("acceptance_rate", 100),
        "cancellation_rate": d.get("cancellation_rate", 0),
        "is_online": d.get("is_online", False),
        "status": d.get("status"),
        "vehicle_type": d.get("vehicle_type"),
        "vehicle_model": d.get("vehicle_model"),
        "vehicle_number": d.get("vehicle_number"),
    }


@router.get("/my-earnings")
async def my_earnings_alias(request: Request):
    """Stats per period."""
    user = await get_current_user(request)
    d = await db.drivers.find_one({"user_id": user["id"]}, {"_id": 0})
    if not d:
        raise HTTPException(status_code=404, detail="Driver profile not found")
    from datetime import timedelta
    now = datetime.now(timezone.utc)
    today = now.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    week = (now - timedelta(days=7)).isoformat()
    month = (now - timedelta(days=30)).isoformat()

    rides_today = await db.rides.find({"driver_id": d["id"], "status": "completed", "completed_at": {"$gte": today}}, {"_id": 0}).to_list(100)
    rides_week = await db.rides.find({"driver_id": d["id"], "status": "completed", "completed_at": {"$gte": week}}, {"_id": 0}).to_list(500)
    rides_month = await db.rides.find({"driver_id": d["id"], "status": "completed", "completed_at": {"$gte": month}}, {"_id": 0}).to_list(2000)

    def total(rides):
        return sum((r.get("final_fare") or r.get("estimated_fare") or 0) * 0.9 for r in rides)

    return {
        "today": {"earnings": round(total(rides_today), 2), "rides": len(rides_today)},
        "week": {"earnings": round(total(rides_week), 2), "rides": len(rides_week)},
        "month": {"earnings": round(total(rides_month), 2), "rides": len(rides_month)},
        "total_lifetime": d.get("earnings", 0),
    }


@router.get("/my-documents")
async def my_documents(request: Request):
    user = await get_current_user(request)
    d = await db.drivers.find_one({"user_id": user["id"]}, {"_id": 0})
    if not d:
        raise HTTPException(status_code=404, detail="Driver profile not found")
    view = await build_documents_view(d)
    return {**view, "driver_status": d.get("status"), "rejection_reason": d.get("rejection_reason")}


@router.get("/my-notifications")
async def my_notifications(request: Request):
    user = await get_current_user(request)
    items = await db.notifications.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(50)
    return items


@router.post("/notifications/read-all")
async def mark_all_notifications_read(request: Request):
    user = await get_current_user(request)
    res = await db.notifications.update_many(
        {"user_id": user["id"], "read": {"$ne": True}}, {"$set": {"read": True}})
    return {"updated": res.modified_count}


@router.delete("/notifications/{notif_id}")
async def delete_notification(notif_id: str, request: Request):
    user = await get_current_user(request)
    res = await db.notifications.delete_one({"id": notif_id, "user_id": user["id"]})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Notification introuvable")
    return {"message": "Notification supprimée"}


@router.get("/incoming-requests")
async def incoming_requests(request: Request):
    """Alias of /api/rides/pending/available for drivers."""
    user = await get_current_user(request)
    if user.get("role") != "driver":
        raise HTTPException(status_code=403, detail="Driver only")
    d = await db.drivers.find_one({"user_id": user["id"]}, {"_id": 0})
    if not d or not d.get("is_online"):
        return []
    # Only "taxi" drivers receive taxi ride requests
    svc = d.get("service_types") or ["taxi", "delivery"]
    if "taxi" not in svc:
        return []
    # Optional destination-mode filtering
    target = d.get("destination_mode_target") if d.get("destination_mode_active") else None
    rides = await db.rides.find({"status": "pending", "vehicle_type": d.get("vehicle_type")}, {"_id": 0}).sort("created_at", -1).to_list(30)
    if target and target.get("lat"):
        from math import radians, cos, sin, asin, sqrt
        def km(lat1, lon1, lat2, lon2):
            R = 6371
            dlat = radians(lat2 - lat1)
            dlon = radians(lon2 - lon1)
            a = sin(dlat/2)**2 + cos(radians(lat1))*cos(radians(lat2))*sin(dlon/2)**2
            return 2*R*asin(sqrt(a))
        rides = [r for r in rides if km(r.get("dropoff_lat", 0), r.get("dropoff_lng", 0), target["lat"], target["lng"]) <= target.get("radius_km", 5)]
    return rides

