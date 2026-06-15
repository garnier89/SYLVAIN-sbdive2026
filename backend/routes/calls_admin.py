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


DEFAULT_RELAY_PER_DAY = 10


async def _abuse_threshold() -> int:
    doc = await db.service_configs.find_one({"service_key": "call_abuse"}, {"_id": 0, "relay_per_day": 1}) or {}
    try:
        return max(1, int(doc.get("relay_per_day", DEFAULT_RELAY_PER_DAY)))
    except (TypeError, ValueError):
        return DEFAULT_RELAY_PER_DAY


async def _abuse_alerts(start: str, end: str, threshold: int):
    """Callers whose RELAY (Twilio) calls in a single day reach the threshold.
    Relay calls bill real telecom minutes → abuse here drives Twilio costs."""
    rows = await db.masked_call_logs.aggregate([
        {"$match": {"created_at": {"$gte": start, "$lte": end}, "channel": "relay"}},
        {"$group": {
            "_id": {"caller_id": "$caller_id", "day": {"$substr": ["$created_at", 0, 10]}},
            "count": {"$sum": 1},
            "caller_name": {"$first": "$caller_name"},
            "caller_role": {"$first": "$caller_role"},
        }},
        {"$match": {"count": {"$gte": threshold}}},
        {"$sort": {"count": -1}},
        {"$limit": 100},
    ]).to_list(100)
    return [{
        "caller_id": r["_id"].get("caller_id"),
        "day": r["_id"].get("day"),
        "caller_name": r.get("caller_name") or "Contact",
        "caller_role": r.get("caller_role"),
        "relay_count": r["count"],
    } for r in rows]


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

    threshold = await _abuse_threshold()
    alerts = await _abuse_alerts(start, end, threshold)

    return {
        "kpis": {
            "total": total, "webrtc": webrtc, "relay": relay,
            "connected": connected, "missed": missed,
            "avg_duration": avg_duration, "answer_rate": answer_rate,
        },
        "abuse_threshold": threshold,
        "alerts": alerts,
        "calls": docs,
    }


@router.put("/abuse-threshold")
async def set_abuse_threshold(request: Request):
    """Admin sets the daily relay-call threshold that triggers an abuse alert."""
    await require_role(request, ["admin"])
    body = await request.json()
    try:
        val = max(1, min(1000, int(body.get("relay_per_day"))))
    except (TypeError, ValueError):
        return {"error": "relay_per_day invalide"}
    await db.service_configs.update_one(
        {"service_key": "call_abuse"},
        {"$set": {"service_key": "call_abuse", "relay_per_day": val}},
        upsert=True,
    )
    return {"relay_per_day": val}
