"""SB Urgences — appel d'urgence & demande d'ambulance géolocalisée (Phase 3d).

Vraie demande d'ambulance à la demande avec dispatch temps réel : le patient
décrit son urgence + partage sa position → la demande est diffusée aux
ambulanciers partenaires EN LIGNE (espace ambulancier, acceptation temps réel,
position live + ETA). **Repli automatique** sur une ambulance simulée si aucun
partenaire n'accepte en ~18s, pour ne JAMAIS bloquer une urgence.

Frais d'intervention par type d'urgence (SB Pay débité à la clôture OU espèces),
**commission plateforme** reversée nette à l'ambulancier (sbpay) — comme le
Dépannage.

Cycle : searching → en_route → arrived → completed (annulable avant arrivée).
Collections : ambulance_requests, ambulance_operators, ambulance_settings, ambulance_revenue.
"""
from fastapi import APIRouter, Request, HTTPException
import uuid
import hashlib
from datetime import datetime, timezone
from pymongo import ReturnDocument

from core.config import db
from core.deps import get_current_user, calculate_distance, require_role
from core.notifications import create_notification

router = APIRouter(prefix="/ambulance", tags=["ambulance"])

# ── Emergency catalog (avec frais d'intervention) ─────────────────────────────
EMERGENCY_TYPES = [
    {"id": "cardiac", "label": "Douleur thoracique / cardiaque", "icon": "Heartbeat", "severity": "critical", "base_fee": 120.0},
    {"id": "breathing", "label": "Difficulté respiratoire", "icon": "Lungs", "severity": "critical", "base_fee": 110.0},
    {"id": "unconscious", "label": "Perte de connaissance", "icon": "Pulse", "severity": "critical", "base_fee": 120.0},
    {"id": "stroke", "label": "Signes d'AVC (paralysie, élocution)", "icon": "Brain", "severity": "critical", "base_fee": 120.0},
    {"id": "accident", "label": "Accident / traumatisme", "icon": "Warning", "severity": "urgent", "base_fee": 100.0},
    {"id": "bleeding", "label": "Hémorragie / blessure grave", "icon": "Drop", "severity": "urgent", "base_fee": 95.0},
    {"id": "burn", "label": "Brûlure grave", "icon": "Fire", "severity": "urgent", "base_fee": 95.0},
    {"id": "other", "label": "Autre urgence", "icon": "FirstAid", "severity": "urgent", "base_fee": 80.0},
]
_TYPE_BY_ID = {e["id"]: e for e in EMERGENCY_TYPES}

EMERGENCY_NUMBERS = [
    {"id": "samu", "label": "SAMU", "number": "15", "desc": "Urgence médicale vitale"},
    {"id": "eu", "label": "Numéro d'urgence européen", "number": "112", "desc": "Toutes urgences"},
    {"id": "pompiers", "label": "Pompiers", "number": "18", "desc": "Incendie, secours"},
]

DEFAULT_COMMISSION_PCT = 0.15  # commission plateforme sur chaque intervention

# Simulated ambulance crews (repli si aucun partenaire en ligne n'accepte).
_CREWS = [
    {"name": "Équipe SMUR Nord", "company": "SAMU 75 — SMUR", "vehicle": "Ambulance de réanimation (UMH)", "plate": "SMUR-15-AB"},
    {"name": "Croix-Rouge IDF", "company": "Croix-Rouge française", "vehicle": "Ambulance de secours (VSAV)", "plate": "CRF-112-PR"},
    {"name": "Équipe SOS Ambulances", "company": "SOS Ambulances 24/7", "vehicle": "Ambulance médicalisée", "plate": "SOS-18-XY"},
    {"name": "Pompiers — VSAV 3", "company": "Sapeurs-pompiers", "vehicle": "Véhicule de secours (VSAV)", "plate": "SP-991-ZZ"},
]

ARRIVE_SECONDS = 75    # durée d'approche simulée (compressée pour la démo)
FALLBACK_SECONDS = 18  # si aucun vrai ambulancier n'accepte → ambulance simulée


def _now():
    return datetime.now(timezone.utc).isoformat()


async def _commission_pct() -> float:
    doc = await db.ambulance_settings.find_one({"id": "config"}, {"_id": 0})
    if doc and doc.get("commission_pct") is not None:
        return float(doc["commission_pct"])
    return DEFAULT_COMMISSION_PCT


def _assign_crew(req_id: str) -> dict:
    idx = int(hashlib.sha256(req_id.encode()).hexdigest(), 16) % len(_CREWS)
    crew = dict(_CREWS[idx])
    crew["eta_minutes"] = 6 + (idx * 2)  # 6–12 min affiché
    return crew


def _live_state(req: dict) -> dict:
    """Live status + interpolated ambulance position (no background job)."""
    status = req.get("status")
    crew = req.get("crew") or {}
    if status in ("completed", "cancelled"):
        return {"status": status, "progress": 1.0, "eta_minutes": 0, "ambulance_position": None}
    if status == "searching":
        return {"status": "searching", "progress": 0.0,
                "eta_minutes": crew.get("eta_minutes", 8) if crew else 8, "ambulance_position": None}

    # Real operator → use stored fields (updated via pings / status updates).
    if req.get("operator_kind") == "real":
        pos = req.get("ambulance_position") or req.get("crew_start")
        return {
            "status": status,
            "progress": 1.0 if status == "arrived" else 0.5,
            "eta_minutes": 0 if status == "arrived" else crew.get("eta_minutes", 8),
            "ambulance_position": pos,
        }

    # Simulated crew → interpolate from dispatched_at.
    try:
        base = datetime.fromisoformat(req.get("dispatched_at") or req["created_at"])
    except Exception:
        base = datetime.now(timezone.utc)
    elapsed = (datetime.now(timezone.utc) - base).total_seconds()
    start = req.get("crew_start") or {}
    pickup = {"lat": req.get("pickup_lat"), "lng": req.get("pickup_lng")}
    progress = min(1.0, max(0.0, elapsed / ARRIVE_SECONDS))
    eta_remaining = max(0, round(crew.get("eta_minutes", 8) * (1 - progress)))
    pos = None
    if start.get("lat") is not None and pickup.get("lat") is not None:
        pos = {
            "lat": start["lat"] + (pickup["lat"] - start["lat"]) * progress,
            "lng": start["lng"] + (pickup["lng"] - start["lng"]) * progress,
        }
    live_status = "arrived" if progress >= 1.0 else "en_route"
    return {"status": live_status, "progress": round(progress, 3),
            "eta_minutes": eta_remaining, "ambulance_position": pos}


def _public(req: dict) -> dict:
    out = dict(req)
    out.pop("_id", None)
    if req.get("status") not in ("completed", "cancelled"):
        live = _live_state(req)
        out["status"] = live["status"]
        out["live"] = live
    else:
        out["live"] = {"status": req["status"], "progress": 1.0, "eta_minutes": 0, "ambulance_position": None}
    return out


# ── Endpoints (patient) ──────────────────────────────────────────────────────
@router.get("/emergency-types")
async def list_emergency_types():
    return {"emergency_types": EMERGENCY_TYPES, "emergency_numbers": EMERGENCY_NUMBERS}


@router.post("/requests")
async def create_request(request: Request):
    user = await get_current_user(request)
    body = await request.json()
    emergency_type = body.get("emergency_type")
    e = _TYPE_BY_ID.get(emergency_type)
    if not e:
        raise HTTPException(status_code=400, detail="Type d'urgence invalide")

    pickup_lat, pickup_lng = body.get("pickup_lat"), body.get("pickup_lng")
    if pickup_lat is None or pickup_lng is None:
        raise HTTPException(status_code=400, detail="Partagez votre position pour envoyer une ambulance")

    payment_method = body.get("payment_method", "sbpay")
    if payment_method not in ("sbpay", "cash"):
        raise HTTPException(status_code=400, detail="Mode de paiement invalide")
    total = round(float(e["base_fee"]), 2)
    req_id = f"amb_{uuid.uuid4().hex[:12]}"

    req = {
        "id": req_id,
        "user_id": user["id"],
        "user_name": user.get("name", ""),
        "emergency_type": emergency_type,
        "emergency_label": e["label"],
        "severity": e["severity"],
        "pickup_address": body.get("pickup_address", ""),
        "pickup_lat": pickup_lat, "pickup_lng": pickup_lng,
        "patient_name": (body.get("patient_name") or user.get("name", "")).strip(),
        "patient_phone": (body.get("patient_phone") or "").strip(),
        "symptoms": (body.get("symptoms") or "").strip(),
        "payment_method": payment_method,
        "total_price": total,
        "operator_id": None,
        "crew": None,
        "operator_kind": None,
        "crew_start": None,
        "ambulance_position": None,
        "status": "searching",
        "payment_status": "pending",
        "created_at": _now(),
    }
    await db.ambulance_requests.insert_one(dict(req))
    # Diffuser aux ambulanciers EN LIGNE (temps réel, best-effort).
    try:
        operators = await db.ambulance_operators.find({"is_online": True}, {"_id": 0, "user_id": 1}).to_list(100)
        for op in operators:
            if op.get("user_id") == user["id"]:
                continue
            await create_notification(
                op["user_id"], "ambulance_request_new", "🚑 Nouvelle demande d'ambulance",
                f"{e['label']} · {req['pickup_address'] or 'à proximité'}",
                {"request_id": req_id, "url": "/espace-ambulancier"},
            )
    except Exception:
        pass
    # Alerter les proches / contacts d'urgence (module Famille) avec lien de suivi + SMS Twilio.
    family_notified = 0
    family_sms = 0
    if body.get("notify_contacts", True):
        try:
            from routes.family import notify_user_circles
            res = await notify_user_circles(
                user, "ambulance_alert", "🚑 Ambulance demandée",
                f"{req['patient_name'] or 'Un proche'} a demandé une ambulance ({e['label']}). Suivez sa position.",
                lat=pickup_lat, lng=pickup_lng, alert_type="sos", sms=True,
                sms_body=f"SB Urgences : {req['patient_name'] or 'un proche'} a demande une ambulance ({e['label']}).")
            family_notified = res.get("notified", 0)
            family_sms = res.get("sms_sent", 0)
        except Exception:
            family_notified = 0
    out = _public(req)
    out["family_notified"] = family_notified
    out["family_sms"] = family_sms
    return out


@router.get("/requests")
async def list_requests(request: Request):
    user = await get_current_user(request)
    docs = await db.ambulance_requests.find({"user_id": user["id"]}).sort("created_at", -1).to_list(50)
    return [_public(d) for d in docs]


@router.get("/requests/{req_id}")
async def get_request(req_id: str, request: Request):
    user = await get_current_user(request)
    req = await db.ambulance_requests.find_one({"id": req_id, "user_id": user["id"]})
    if not req:
        raise HTTPException(status_code=404, detail="Demande introuvable")
    # Repli : si aucun vrai ambulancier n'accepte sous FALLBACK_SECONDS → ambulance simulée.
    if req.get("status") == "searching" and not req.get("operator_id"):
        try:
            created = datetime.fromisoformat(req["created_at"])
        except Exception:
            created = datetime.now(timezone.utc)
        if (datetime.now(timezone.utc) - created).total_seconds() >= FALLBACK_SECONDS:
            crew = _assign_crew(req_id)
            crew_start = {"lat": req["pickup_lat"] + 0.010, "lng": req["pickup_lng"] + 0.013}
            req = await db.ambulance_requests.find_one_and_update(
                {"id": req_id, "status": "searching", "operator_id": None},
                {"$set": {"crew": crew, "operator_kind": "simulated",
                          "crew_start": crew_start, "ambulance_position": crew_start,
                          "status": "en_route", "dispatched_at": _now()}},
                return_document=ReturnDocument.AFTER,
            ) or req
    return _public(req)


@router.post("/requests/{req_id}/complete")
async def complete_request(req_id: str, request: Request):
    """Clôture l'intervention ; débite le portefeuille (sbpay) à ce moment + split commission."""
    user = await get_current_user(request)
    req = await db.ambulance_requests.find_one({"id": req_id, "user_id": user["id"]})
    if not req:
        raise HTTPException(status_code=404, detail="Demande introuvable")
    if req.get("status") == "cancelled":
        raise HTTPException(status_code=400, detail="Demande annulée")
    if req.get("status") == "completed":
        raise HTTPException(status_code=400, detail="Demande déjà clôturée")

    total = round(float(req.get("total_price", 0) or 0), 2)
    new_balance = None
    if req.get("payment_method") == "sbpay" and total > 0 and req.get("payment_status") != "paid":
        res = await db.wallets.update_one(
            {"user_id": user["id"], "balance": {"$gte": total}}, {"$inc": {"balance": -total}})
        if res.modified_count == 0:
            raise HTTPException(status_code=400, detail="Solde SB Pay insuffisant. Rechargez votre portefeuille.")
        wallet = await db.wallets.find_one({"user_id": user["id"]}, {"_id": 0})
        new_balance = round((wallet or {}).get("balance", 0), 2)
        await db.wallet_transactions.insert_one({
            "id": f"tx_{uuid.uuid4().hex[:12]}", "user_id": user["id"], "type": "Booking",
            "amount": -total, "balance_after": new_balance,
            "description": f"SB Urgences · {req.get('emergency_label', '')}",
            "status": "completed", "created_at": _now()})

    # Commission split (calculée une fois).
    pct = await _commission_pct()
    commission = round(total * pct, 2)
    operator_earning = round(total - commission, 2)
    op_id = req.get("operator_id")

    await db.ambulance_requests.update_one(
        {"id": req_id},
        {"$set": {"status": "completed", "payment_status": "paid", "completed_at": _now(),
                  "commission_pct": pct, "commission": commission, "operator_earning": operator_earning}})

    # Reverser le net à l'ambulancier réel (sbpay) + enregistrer le revenu plateforme.
    if op_id and req.get("operator_kind") == "real" and operator_earning > 0 \
            and req.get("payment_method") == "sbpay":
        await db.wallets.update_one({"user_id": op_id}, {"$inc": {"balance": operator_earning}}, upsert=True)
        op_wallet = await db.wallets.find_one({"user_id": op_id}, {"_id": 0})
        await db.wallet_transactions.insert_one({
            "id": f"tx_{uuid.uuid4().hex[:12]}", "user_id": op_id, "type": "Earning",
            "amount": operator_earning, "balance_after": round((op_wallet or {}).get("balance", 0), 2),
            "description": f"Ambulance · {req.get('emergency_label', '')} (net après commission)",
            "status": "completed", "created_at": _now()})
        await db.ambulance_revenue.insert_one({
            "id": f"arev_{uuid.uuid4().hex[:12]}", "request_id": req_id, "operator_id": op_id,
            "total": total, "commission": commission, "operator_earning": operator_earning,
            "commission_pct": pct, "created_at": _now()})

    return {"ok": True, "total": total, "balance": new_balance,
            "commission": commission, "operator_earning": operator_earning}


@router.post("/requests/{req_id}/cancel")
async def cancel_request(req_id: str, request: Request):
    user = await get_current_user(request)
    res = await db.ambulance_requests.update_one(
        {"id": req_id, "user_id": user["id"], "status": {"$nin": ["completed", "cancelled"]}},
        {"$set": {"status": "cancelled", "cancelled_at": _now()}})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Demande introuvable ou déjà terminée")
    return {"ok": True}


# ── Espace ambulancier (partenaires réels) ───────────────────────────────────
def _operator_public(op: dict) -> dict:
    out = dict(op or {})
    out.pop("_id", None)
    return out


@router.get("/operator/me")
async def operator_me(request: Request):
    user = await get_current_user(request)
    op = await db.ambulance_operators.find_one({"user_id": user["id"]}, {"_id": 0})
    if not op:
        return {"registered": False}
    jobs = await db.ambulance_requests.find(
        {"operator_id": user["id"]}, {"_id": 0, "status": 1, "total_price": 1, "operator_earning": 1}).to_list(500)
    completed = [j for j in jobs if j.get("status") == "completed"]
    pct = await _commission_pct()
    earnings = round(sum(
        float(j.get("operator_earning", round(float(j.get("total_price", 0) or 0) * (1 - pct), 2)) or 0)
        for j in completed), 2)
    gross = round(sum(float(j.get("total_price", 0) or 0) for j in completed), 2)
    return {"registered": True, "operator": op, "commission_pct": pct, "stats": {
        "completed": len(completed), "active": len([j for j in jobs if j.get("status") in ("en_route", "arrived")]),
        "earnings": earnings, "gross": gross,
    }}


@router.post("/operator/register")
async def operator_register(request: Request):
    user = await get_current_user(request)
    body = await request.json()
    existing = await db.ambulance_operators.find_one({"user_id": user["id"]}, {"_id": 0})
    doc = {
        "user_id": user["id"],
        "name": body.get("name") or user.get("name", ""),
        "company": body.get("company", ""),
        "phone": body.get("phone", ""),
        "plate": body.get("plate", ""),
        "vehicle_type": body.get("vehicle_type", ""),
        "city": body.get("city", ""),
        "rating": (existing or {}).get("rating", 5.0),
        "is_online": (existing or {}).get("is_online", False),
        "last_lat": (existing or {}).get("last_lat"),
        "last_lng": (existing or {}).get("last_lng"),
        "verification_status": (existing or {}).get("verification_status", "pending"),
        "documents": (existing or {}).get("documents", {}),
        "rejection_reason": (existing or {}).get("rejection_reason"),
        "created_at": (existing or {}).get("created_at") or _now(),
        "updated_at": _now(),
    }
    await db.ambulance_operators.update_one({"user_id": user["id"]}, {"$set": doc}, upsert=True)
    return _operator_public(doc)


@router.post("/operator/documents")
async def operator_documents(request: Request):
    user = await get_current_user(request)
    op = await db.ambulance_operators.find_one({"user_id": user["id"]}, {"_id": 0})
    if not op:
        raise HTTPException(status_code=400, detail="Inscrivez-vous comme ambulancier d'abord")
    body = await request.json()
    documents = dict(op.get("documents") or {})
    for k in ("insurance", "license", "id_card"):
        if body.get(k):
            documents[k] = body[k]
    await db.ambulance_operators.update_one(
        {"user_id": user["id"]},
        {"$set": {"documents": documents, "verification_status": "pending",
                  "rejection_reason": None, "updated_at": _now()}})
    return {"ok": True, "documents": documents, "verification_status": "pending"}


@router.post("/operator/online")
async def operator_online(request: Request):
    user = await get_current_user(request)
    body = await request.json()
    op = await db.ambulance_operators.find_one({"user_id": user["id"]}, {"_id": 0})
    if not op:
        raise HTTPException(status_code=400, detail="Inscrivez-vous comme ambulancier d'abord")
    if bool(body.get("online", True)) and op.get("verification_status") != "approved":
        raise HTTPException(status_code=403, detail="Votre compte doit être validé par l'équipe avant de passer en ligne")
    upd = {"is_online": bool(body.get("online", True)), "updated_at": _now()}
    if body.get("lat") is not None and body.get("lng") is not None:
        upd["last_lat"], upd["last_lng"] = body["lat"], body["lng"]
    await db.ambulance_operators.update_one({"user_id": user["id"]}, {"$set": upd})
    return {"ok": True, "is_online": upd["is_online"]}


@router.get("/operator/feed")
async def operator_feed(request: Request):
    user = await get_current_user(request)
    op = await db.ambulance_operators.find_one({"user_id": user["id"]}, {"_id": 0})
    if not op:
        raise HTTPException(status_code=400, detail="Inscrivez-vous comme ambulancier d'abord")
    docs = await db.ambulance_requests.find(
        {"status": "searching", "operator_id": None}).sort("created_at", -1).to_list(50)
    out = []
    for d in docs:
        d.pop("_id", None)
        if op.get("last_lat") is not None and d.get("pickup_lat") is not None:
            d["distance_km"] = round(calculate_distance(op["last_lat"], op["last_lng"], d["pickup_lat"], d["pickup_lng"]), 1)
        out.append(d)
    return out


@router.get("/operator/jobs")
async def operator_jobs(request: Request):
    user = await get_current_user(request)
    docs = await db.ambulance_requests.find({"operator_id": user["id"]}).sort("created_at", -1).to_list(50)
    for d in docs:
        d.pop("_id", None)
    return docs


@router.post("/requests/{req_id}/accept")
async def operator_accept(req_id: str, request: Request):
    """Un ambulancier prend une demande en attente (atomique). Assignation réelle."""
    user = await get_current_user(request)
    op = await db.ambulance_operators.find_one({"user_id": user["id"]}, {"_id": 0})
    if not op:
        raise HTTPException(status_code=400, detail="Inscrivez-vous comme ambulancier d'abord")
    if op.get("verification_status") != "approved":
        raise HTTPException(status_code=403, detail="Votre compte doit être validé pour accepter des demandes")
    crew = {
        "name": op.get("name", ""), "company": op.get("company", ""),
        "rating": op.get("rating", 5.0), "plate": op.get("plate", ""),
        "vehicle": op.get("vehicle_type", ""), "phone": op.get("phone", ""),
        "eta_minutes": 8, "user_id": user["id"],
    }
    start = None
    if op.get("last_lat") is not None:
        start = {"lat": op["last_lat"], "lng": op["last_lng"]}
    req = await db.ambulance_requests.find_one_and_update(
        {"id": req_id, "status": "searching", "operator_id": None},
        {"$set": {"operator_id": user["id"], "crew": crew, "operator_kind": "real",
                  "crew_start": start, "ambulance_position": start,
                  "status": "en_route", "dispatched_at": _now()}},
        return_document=ReturnDocument.AFTER)
    if not req:
        raise HTTPException(status_code=409, detail="Demande déjà prise ou indisponible")
    try:
        await create_notification(
            req["user_id"], "ambulance_accepted", "🚑 Une ambulance arrive !",
            f"{crew['name']} ({crew['company']}) a pris en charge votre urgence.",
            {"request_id": req_id, "url": "/urgences"})
    except Exception:
        pass
    req.pop("_id", None)
    return req


@router.post("/requests/{req_id}/operator-status")
async def operator_update_status(req_id: str, request: Request):
    user = await get_current_user(request)
    body = await request.json()
    new_status = body.get("status")
    if new_status not in ("en_route", "arrived"):
        raise HTTPException(status_code=400, detail="Statut invalide")
    res = await db.ambulance_requests.find_one_and_update(
        {"id": req_id, "operator_id": user["id"], "status": {"$nin": ["completed", "cancelled"]}},
        {"$set": {"status": new_status, "updated_at": _now()}},
        return_document=ReturnDocument.AFTER)
    if not res:
        raise HTTPException(status_code=404, detail="Intervention introuvable")
    label = "📍 L'ambulance est sur place" if new_status == "arrived" else "🚑 Ambulance en route"
    try:
        await create_notification(res["user_id"], "ambulance_status", label, res.get("emergency_label", ""),
                                  {"request_id": req_id, "url": "/urgences"})
    except Exception:
        pass
    res.pop("_id", None)
    return res


@router.post("/requests/{req_id}/operator-ping")
async def operator_ping(req_id: str, request: Request):
    """L'ambulancier partage sa position live ; ETA recalculée depuis la distance (~40 km/h)."""
    user = await get_current_user(request)
    body = await request.json()
    lat, lng = body.get("lat"), body.get("lng")
    if lat is None or lng is None:
        raise HTTPException(status_code=400, detail="Position requise")
    req = await db.ambulance_requests.find_one({"id": req_id, "operator_id": user["id"]}, {"_id": 0})
    if not req:
        raise HTTPException(status_code=404, detail="Intervention introuvable")
    eta = 0
    if req.get("pickup_lat") is not None:
        dist = calculate_distance(lat, lng, req["pickup_lat"], req["pickup_lng"])
        eta = max(1, round(dist / 40 * 60))
    crew = dict(req.get("crew") or {})
    crew["eta_minutes"] = eta
    await db.ambulance_requests.update_one(
        {"id": req_id}, {"$set": {"ambulance_position": {"lat": lat, "lng": lng}, "crew": crew}})
    await db.ambulance_operators.update_one({"user_id": user["id"]}, {"$set": {"last_lat": lat, "last_lng": lng}})
    return {"ok": True, "eta_minutes": eta}


# ── Admin : validation KYC + commission + revenus ────────────────────────────
admin_router = APIRouter(prefix="/admin/ambulance", tags=["admin-ambulance"])


@admin_router.get("/operators")
async def admin_list_operators(request: Request):
    await require_role(request, ["admin"])
    ops = await db.ambulance_operators.find({}).sort("created_at", -1).to_list(500)
    out = []
    for op in ops:
        op.pop("_id", None)
        jobs = await db.ambulance_requests.count_documents({"operator_id": op["user_id"], "status": "completed"})
        op["completed_jobs"] = jobs
        out.append(op)
    counts = {
        "pending": sum(1 for o in out if o.get("verification_status") == "pending"),
        "approved": sum(1 for o in out if o.get("verification_status") == "approved"),
        "rejected": sum(1 for o in out if o.get("verification_status") == "rejected"),
        "total": len(out),
    }
    return {"operators": out, "counts": counts}


@admin_router.post("/operators/{user_id}/verify")
async def admin_verify_operator(user_id: str, request: Request):
    admin = await require_role(request, ["admin"])
    body = await request.json()
    action = body.get("action")
    if action not in ("approve", "reject"):
        raise HTTPException(status_code=400, detail="Action invalide (approve/reject)")
    op = await db.ambulance_operators.find_one({"user_id": user_id}, {"_id": 0})
    if not op:
        raise HTTPException(status_code=404, detail="Ambulancier introuvable")
    status = "approved" if action == "approve" else "rejected"
    upd = {"verification_status": status, "verified_at": _now(),
           "verified_by": admin.get("id"), "updated_at": _now()}
    if action == "reject":
        upd["rejection_reason"] = body.get("reason", "")
        upd["is_online"] = False
    else:
        upd["rejection_reason"] = None
    await db.ambulance_operators.update_one({"user_id": user_id}, {"$set": upd})
    title = "✅ Compte ambulancier validé" if action == "approve" else "❌ Compte ambulancier refusé"
    msg = "Vous pouvez maintenant passer en ligne et recevoir des demandes." if action == "approve" \
        else f"Motif : {body.get('reason', 'documents non conformes')}"
    try:
        await create_notification(user_id, "ambulance_verification", title, msg, {"url": "/espace-ambulancier"})
    except Exception:
        pass
    return {"ok": True, "verification_status": status}


@admin_router.get("/settings")
async def admin_get_settings(request: Request):
    await require_role(request, ["admin"])
    return {"commission_pct": await _commission_pct()}


@admin_router.put("/settings")
async def admin_set_settings(request: Request):
    await require_role(request, ["admin"])
    body = await request.json()
    try:
        pct = float(body.get("commission_pct"))
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="Commission invalide")
    if not (0 <= pct <= 0.9):
        raise HTTPException(status_code=400, detail="La commission doit être entre 0 et 90%")
    await db.ambulance_settings.update_one({"id": "config"}, {"$set": {"id": "config", "commission_pct": pct}}, upsert=True)
    return {"ok": True, "commission_pct": pct}


@admin_router.get("/revenue")
async def admin_revenue(request: Request):
    await require_role(request, ["admin"])
    rows = await db.ambulance_revenue.find({}, {"_id": 0}).to_list(5000)
    total_gmv = round(sum(float(r.get("total", 0) or 0) for r in rows), 2)
    total_commission = round(sum(float(r.get("commission", 0) or 0) for r in rows), 2)
    total_payout = round(sum(float(r.get("operator_earning", 0) or 0) for r in rows), 2)
    return {"count": len(rows), "gmv": total_gmv, "commission": total_commission,
            "operator_payout": total_payout, "commission_pct": await _commission_pct()}
