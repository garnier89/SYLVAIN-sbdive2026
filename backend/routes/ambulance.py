"""SB Urgences — appel d'urgence & demande d'ambulance géolocalisée (Phase 3d).

One-tap emergency: le patient décrit son urgence + partage sa position → une
ambulance est dispatchée IMMÉDIATEMENT (dispatch simulé réaliste, sans job de
fond, position interpolée depuis le temps écoulé — comme SB Dépannage). Suivi
temps réel (carte + ETA décroissante) → sur place → clôturé.

L'urgence ne débite jamais le portefeuille (prise en charge). Des numéros
d'urgence (SAMU 15 / 112 / Pompiers 18) sont mis en avant à chaque étape.

Cycle : dispatched → en_route → arrived → completed (annulable avant arrivée).
Collection : ambulance_requests.
"""
from fastapi import APIRouter, Request, HTTPException
import uuid
import hashlib
from datetime import datetime, timezone

from core.config import db
from core.deps import get_current_user, calculate_distance
from core.notifications import create_notification

router = APIRouter(prefix="/ambulance", tags=["ambulance"])

# ── Emergency catalog ────────────────────────────────────────────────────────
EMERGENCY_TYPES = [
    {"id": "cardiac", "label": "Douleur thoracique / cardiaque", "icon": "Heartbeat", "severity": "critical"},
    {"id": "breathing", "label": "Difficulté respiratoire", "icon": "Lungs", "severity": "critical"},
    {"id": "unconscious", "label": "Perte de connaissance", "icon": "Pulse", "severity": "critical"},
    {"id": "stroke", "label": "Signes d'AVC (paralysie, élocution)", "icon": "Brain", "severity": "critical"},
    {"id": "accident", "label": "Accident / traumatisme", "icon": "Warning", "severity": "urgent"},
    {"id": "bleeding", "label": "Hémorragie / blessure grave", "icon": "Drop", "severity": "urgent"},
    {"id": "burn", "label": "Brûlure grave", "icon": "Fire", "severity": "urgent"},
    {"id": "other", "label": "Autre urgence", "icon": "FirstAid", "severity": "urgent"},
]
_TYPE_BY_ID = {e["id"]: e for e in EMERGENCY_TYPES}

EMERGENCY_NUMBERS = [
    {"id": "samu", "label": "SAMU", "number": "15", "desc": "Urgence médicale vitale"},
    {"id": "eu", "label": "Numéro d'urgence européen", "number": "112", "desc": "Toutes urgences"},
    {"id": "pompiers", "label": "Pompiers", "number": "18", "desc": "Incendie, secours"},
]

# Simulated ambulance crews (stand-in for real partners / SAMU dispatch).
_CREWS = [
    {"name": "Équipe SMUR Nord", "company": "SAMU 75 — SMUR", "vehicle": "Ambulance de réanimation (UMH)", "plate": "SMUR-15-AB"},
    {"name": "Croix-Rouge IDF", "company": "Croix-Rouge française", "vehicle": "Ambulance de secours (VSAV)", "plate": "CRF-112-PR"},
    {"name": "Équipe SOS Ambulances", "company": "SOS Ambulances 24/7", "vehicle": "Ambulance médicalisée", "plate": "SOS-18-XY"},
    {"name": "Pompiers — VSAV 3", "company": "Sapeurs-pompiers", "vehicle": "Véhicule de secours (VSAV)", "plate": "SP-991-ZZ"},
]

ARRIVE_SECONDS = 75   # durée d'approche simulée (compressée pour la démo)


def _now():
    return datetime.now(timezone.utc).isoformat()


def _assign_crew(req_id: str) -> dict:
    idx = int(hashlib.md5(req_id.encode()).hexdigest(), 16) % len(_CREWS)
    crew = dict(_CREWS[idx])
    crew["eta_minutes"] = 6 + (idx * 2)  # 6–12 min affiché
    return crew


def _live_state(req: dict) -> dict:
    """Live status + interpolated ambulance position (no background job)."""
    status = req.get("status")
    crew = req.get("crew") or {}
    if status in ("completed", "cancelled"):
        return {"status": status, "progress": 1.0, "eta_minutes": 0, "ambulance_position": None}
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


# ── Endpoints ────────────────────────────────────────────────────────────────
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

    req_id = f"amb_{uuid.uuid4().hex[:12]}"
    # Emergency → dispatch IMMEDIATELY (no search delay).
    crew = _assign_crew(req_id)
    crew_start = {"lat": pickup_lat + 0.010, "lng": pickup_lng + 0.013}

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
        "crew": crew,
        "crew_start": crew_start,
        "status": "en_route",
        "created_at": _now(),
        "dispatched_at": _now(),
    }
    await db.ambulance_requests.insert_one(dict(req))
    try:
        await create_notification(
            user["id"], "ambulance_dispatched", "🚑 Ambulance en route",
            f"{crew['name']} arrive dans ~{crew['eta_minutes']} min.",
            {"request_id": req_id, "url": "/urgences"},
        )
    except Exception:
        pass
    return _public(req)


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
    return _public(req)


@router.post("/requests/{req_id}/complete")
async def complete_request(req_id: str, request: Request):
    user = await get_current_user(request)
    res = await db.ambulance_requests.update_one(
        {"id": req_id, "user_id": user["id"], "status": {"$nin": ["completed", "cancelled"]}},
        {"$set": {"status": "completed", "completed_at": _now()}},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Demande introuvable ou déjà clôturée")
    return {"ok": True}


@router.post("/requests/{req_id}/cancel")
async def cancel_request(req_id: str, request: Request):
    user = await get_current_user(request)
    res = await db.ambulance_requests.update_one(
        {"id": req_id, "user_id": user["id"], "status": {"$nin": ["completed", "cancelled"]}},
        {"$set": {"status": "cancelled", "cancelled_at": _now()}},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Demande introuvable ou déjà terminée")
    return {"ok": True}
