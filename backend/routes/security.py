"""SB Tracking — Sécurité avancée (centre de sécurité unifié).

Agrège les signaux de sécurité de l'utilisateur à travers ses modules
(flotte + famille) : SOS, chocs, démarrages non autorisés, excès de vitesse,
sorties de zone, batterie faible. Calcule un score de conduite par véhicule et
un score de sécurité global. Lecture seule (s'appuie sur les alertes existantes).
"""
from datetime import datetime, timezone

from fastapi import APIRouter, Request

from core.config import db
from core.deps import get_current_user

router = APIRouter(prefix="/security", tags=["security"])

# Severity mapping for every alert type produced across the tracking modules.
SEVERITY = {
    "crash": "critical", "sos": "critical", "family_sos": "critical",
    "unauthorized_start": "critical",
    "speeding": "warning", "geofence_exit": "warning",
    "low_battery": "info", "geofence_enter": "info", "command": "info", "place": "info",
}
LABELS = {
    "crash": "Choc détecté", "sos": "SOS", "family_sos": "SOS Famille",
    "unauthorized_start": "Démarrage non autorisé", "speeding": "Excès de vitesse",
    "geofence_exit": "Sortie de zone", "geofence_enter": "Entrée en zone",
    "low_battery": "Batterie faible", "command": "Commande", "place": "Mouvement zone",
}


def _sev(atype):
    return SEVERITY.get(atype, "info")


@router.get("/overview")
async def security_overview(request: Request):
    user = await get_current_user(request)
    from routes.tracking_pro import require_pro
    await require_pro(user["id"])

    # --- gather alerts across fleet + family (owned circles) ---
    events = []
    fleet = await db.fleets.find_one({"owner_id": user["id"]}, {"_id": 0, "id": 1, "name": 1})
    fleet_id = fleet["id"] if fleet else None
    if fleet_id:
        async for a in db.fleet_alerts.find({"fleet_id": fleet_id}, {"_id": 0}).sort("ts", -1).limit(100):
            events.append({
                "id": a["id"], "type": a["type"], "label": LABELS.get(a["type"], a["type"]),
                "severity": _sev(a["type"]), "message": a.get("message"),
                "subject": a.get("vehicle_name"), "source": "fleet",
                "read": a.get("read", False), "ts": a.get("ts"),
            })

    circle_ids = []
    async for c in db.family_circles.find({"owner_id": user["id"]}, {"_id": 0, "id": 1}):
        circle_ids.append(c["id"])
    if circle_ids:
        async for a in db.family_alerts.find({"circle_id": {"$in": circle_ids}}, {"_id": 0}).sort("ts", -1).limit(100):
            atype = "family_sos" if a.get("type") == "sos" else a.get("type")
            events.append({
                "id": a["id"], "type": atype, "label": LABELS.get(atype, atype),
                "severity": _sev(atype), "message": a.get("message"),
                "subject": a.get("member_name"), "source": "family",
                "read": a.get("read", False), "ts": a.get("ts"),
            })

    events.sort(key=lambda e: e.get("ts") or "", reverse=True)

    counts = {"critical": 0, "warning": 0, "info": 0, "unread": 0}
    for e in events:
        counts[e["severity"]] = counts.get(e["severity"], 0) + 1
        if not e["read"]:
            counts["unread"] += 1

    # --- per-vehicle driving score (100 = parfait) ---
    scores = []
    if fleet_id:
        # tally penalising alerts per vehicle
        penal = {}
        async for a in db.fleet_alerts.find(
                {"fleet_id": fleet_id, "type": {"$in": ["speeding", "crash", "unauthorized_start", "geofence_exit"]}},
                {"_id": 0, "vehicle_id": 1, "type": 1}):
            d = penal.setdefault(a.get("vehicle_id"), {"speeding": 0, "crash": 0, "unauthorized_start": 0, "geofence_exit": 0})
            if a["type"] in d:
                d[a["type"]] += 1
        async for v in db.fleet_vehicles.find({"fleet_id": fleet_id}, {"_id": 0, "id": 1, "name": 1}):
            p = penal.get(v["id"], {})
            score = 100 - p.get("speeding", 0) * 8 - p.get("crash", 0) * 30 - p.get("unauthorized_start", 0) * 15 - p.get("geofence_exit", 0) * 3
            score = max(20, min(100, score))
            grade = "A" if score >= 90 else "B" if score >= 75 else "C" if score >= 60 else "D"
            scores.append({"vehicle_id": v["id"], "name": v.get("name"), "score": score, "grade": grade,
                           "events": sum(p.values())})
    scores.sort(key=lambda s: s["score"])
    fleet_score = round(sum(s["score"] for s in scores) / len(scores)) if scores else None

    return {
        "fleet_name": (fleet or {}).get("name"),
        "security_score": fleet_score,
        "counts": counts,
        "events": events[:40],
        "driving_scores": scores,
    }
