"""Admin — Journal des appels (WebRTC vs Relais Twilio).

Donne aux admins/dispatchers une vue d'audit des appels masqués passés via la
plateforme : canal utilisé (in-app WebRTC ou relais téléphonique Twilio), statut
(abouti / sans réponse / relayé), durée et participants. Sert au monitoring de la
qualité et à la prévention des abus. Aucun numéro de téléphone réel n'est exposé.
"""
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, Request

from core.config import db
from core.deps import require_role

router = APIRouter(prefix="/admin/calls", tags=["admin-calls"])


def _default_range(date_from, date_to):
    end = (date_to + "T23:59:59") if date_to else datetime.now(timezone.utc).isoformat()
    start = (date_from + "T00:00:00") if date_from \
        else (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
    return start, end


@router.get("")
async def list_calls(request: Request, date_from: Optional[str] = None,
                     date_to: Optional[str] = None, channel: Optional[str] = None,
                     status: Optional[str] = None, q: Optional[str] = None):
    await require_role(request, ["admin", "dispatcher"])
    start, end = _default_range(date_from, date_to)
    query = {"created_at": {"$gte": start, "$lte": end}}
    if channel in ("webrtc", "relay"):
        query["channel"] = channel
    if status:
        query["status"] = status
    if q:
        query["$or"] = [
            {"caller_name": {"$regex": q, "$options": "i"}},
            {"counterpart_name": {"$regex": q, "$options": "i"}},
            {"ride_id": {"$regex": q, "$options": "i"}},
        ]

    docs = await db.masked_call_logs.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)

    total = len(docs)
    webrtc = sum(1 for d in docs if d.get("channel") == "webrtc")
    relay = sum(1 for d in docs if d.get("channel") == "relay")
    connected = sum(1 for d in docs if d.get("status") in ("connected", "ended"))
    missed = sum(1 for d in docs if d.get("status") in ("no_answer", "declined"))
    answered_with_dur = [d.get("duration_seconds", 0) for d in docs
                         if d.get("status") == "ended" and d.get("duration_seconds")]
    avg_duration = round(sum(answered_with_dur) / len(answered_with_dur)) if answered_with_dur else 0
    answer_rate = round(connected / total * 100) if total else 0

    return {
        "kpis": {
            "total": total, "webrtc": webrtc, "relay": relay,
            "connected": connected, "missed": missed,
            "avg_duration": avg_duration, "answer_rate": answer_rate,
        },
        "calls": docs,
    }
