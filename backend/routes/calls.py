"""Appels masqués (anti-fraude, façon Bolt).

Flux : l'appelant (client ou chauffeur) lance un appel in-app **WebRTC** (audio
navigateur↔navigateur, numéros jamais dévoilés). La signalisation passe par le
WebSocket existant. Après 3 tentatives infructueuses, on bascule sur un **relais
Twilio** : Twilio rappelle l'appelant puis compose le correspondant, les deux ne
voyant que le numéro Twilio (toujours masqué).

Aucun numéro réel n'est renvoyé au frontend : seuls des identifiants de connexion
(user ids) servent à router la signalisation WebRTC.
"""
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Request, HTTPException
from pymongo import ReturnDocument

from core.config import db
from core.deps import get_current_user
from core.websocket import manager

router = APIRouter(prefix="/calls", tags=["calls"])

RELAY_AFTER_ATTEMPTS = 3


async def _resolve_parties(ride: dict):
    """Renvoie (rider, driver_user) avec id/name/phone, ou (rider, None) si pas de chauffeur."""
    rider = await db.users.find_one(
        {"id": ride.get("user_id")}, {"_id": 0, "id": 1, "name": 1, "phone": 1})
    driver_user = None
    if ride.get("driver_id"):
        drv = await db.drivers.find_one({"id": ride["driver_id"]}, {"_id": 0, "user_id": 1})
        if drv:
            driver_user = await db.users.find_one(
                {"id": drv["user_id"]}, {"_id": 0, "id": 1, "name": 1, "phone": 1})
    return rider, driver_user


async def _caller_counterpart(ride_id: str, user: dict):
    """Valide l'appartenance et renvoie (ride, caller, counterpart, caller_role)."""
    ride = await db.rides.find_one({"id": ride_id}, {"_id": 0})
    if not ride:
        raise HTTPException(status_code=404, detail="Course introuvable")
    rider, driver_user = await _resolve_parties(ride)
    if not driver_user:
        raise HTTPException(status_code=400, detail="Aucun chauffeur assigné pour le moment")
    if rider and user["id"] == rider["id"]:
        return ride, rider, driver_user, "rider"
    if user["id"] == driver_user["id"]:
        return ride, driver_user, rider, "driver"
    raise HTTPException(status_code=403, detail="Vous ne participez pas à cette course")


def _first_name(u: dict) -> str:
    return ((u or {}).get("name") or "").split(" ")[0] or "Contact"


@router.post("/ride/{ride_id}/initiate")
async def initiate_call(ride_id: str, request: Request):
    """Démarre un appel : envoie une invitation WebRTC au correspondant et indique
    le mode (webrtc tant que < 3 échecs, sinon relais Twilio)."""
    user = await get_current_user(request)
    ride, caller, counterpart, caller_role = await _caller_counterpart(ride_id, user)
    call_id = uuid.uuid4().hex[:16]
    now = datetime.now(timezone.utc).isoformat()
    sess = await db.call_sessions.find_one({"ride_id": ride_id, "caller_id": user["id"]})
    attempts = (sess or {}).get("attempts", 0)
    online = f"call_{counterpart['id']}" in manager.active_connections

    await manager.send_personal_message({
        "type": "call_incoming",
        "ride_id": ride_id,
        "call_id": call_id,
        "from": f"call_{user['id']}",
        "from_role": caller_role,
        "from_name": _first_name(caller),
    }, f"call_{counterpart['id']}")

    from core.voice import voice_enabled
    use_relay = attempts >= RELAY_AFTER_ATTEMPTS
    return {
        "call_id": call_id,
        "counterpart_id": counterpart["id"],
        "peer_channel": f"call_{counterpart['id']}",
        "counterpart_name": _first_name(counterpart),
        "counterpart_online": online,
        "attempts": attempts,
        "mode": "relay" if use_relay else "webrtc",
        "relay_available": voice_enabled(),
        "created_at": now,
    }


@router.post("/ride/{ride_id}/failed")
async def call_failed(ride_id: str, request: Request):
    """Signale un échec/non-réponse d'appel in-app → incrémente le compteur de tentatives."""
    user = await get_current_user(request)
    await _caller_counterpart(ride_id, user)
    res = await db.call_sessions.find_one_and_update(
        {"ride_id": ride_id, "caller_id": user["id"]},
        {"$inc": {"attempts": 1}, "$set": {"updated_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True, return_document=ReturnDocument.AFTER,
    )
    attempts = res.get("attempts", 1)
    return {"attempts": attempts, "use_relay": attempts >= RELAY_AFTER_ATTEMPTS}


@router.post("/ride/{ride_id}/connected")
async def call_connected(ride_id: str, request: Request):
    """L'appel a abouti → remet le compteur de tentatives à zéro."""
    user = await get_current_user(request)
    await _caller_counterpart(ride_id, user)
    await db.call_sessions.update_one(
        {"ride_id": ride_id, "caller_id": user["id"]},
        {"$set": {"attempts": 0, "updated_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True,
    )
    return {"ok": True}


@router.post("/ride/{ride_id}/relay")
async def call_relay(ride_id: str, request: Request):
    """Repli : établit un appel téléphonique masqué via Twilio entre les deux parties."""
    user = await get_current_user(request)
    ride, caller, counterpart, _ = await _caller_counterpart(ride_id, user)
    from core.voice import voice_enabled, place_masked_call
    if not voice_enabled():
        raise HTTPException(status_code=503, detail="Relais téléphonique non configuré")
    if not caller.get("phone") or not counterpart.get("phone"):
        raise HTTPException(status_code=400, detail="Numéro manquant pour la mise en relation")
    result = await place_masked_call(caller["phone"], counterpart["phone"])
    if not result.get("ok"):
        raise HTTPException(status_code=502, detail="Échec de la mise en relation téléphonique")
    await db.call_sessions.update_one(
        {"ride_id": ride_id, "caller_id": user["id"]},
        {"$set": {"attempts": 0, "relayed_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True,
    )
    return {"status": "ringing", "masked_number": result.get("masked_number")}


@router.get("/ride/{ride_id}/status")
async def call_status(ride_id: str, request: Request):
    user = await get_current_user(request)
    ride, caller, counterpart, _ = await _caller_counterpart(ride_id, user)
    sess = await db.call_sessions.find_one({"ride_id": ride_id, "caller_id": user["id"]})
    attempts = (sess or {}).get("attempts", 0)
    from core.voice import voice_enabled
    return {
        "attempts": attempts,
        "mode": "relay" if attempts >= RELAY_AFTER_ATTEMPTS else "webrtc",
        "counterpart_online": f"call_{counterpart['id']}" in manager.active_connections,
        "relay_available": voice_enabled(),
    }
