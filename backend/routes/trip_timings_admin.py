"""Admin — Rapport de timing des trajets (détail accept → fin).

Surfaces per-ride timing from existing timestamps (accepted_at, arrived_at,
started_at, completed_at) to expose drivers who accept then don't move or stall
at pickup to grab a cancellation fee. Admin/dispatcher only.
"""
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, Request

from core.config import db
from core.deps import require_role

router = APIRouter(prefix="/admin/trip-timings", tags=["admin-trip-timings"])

# Flag thresholds (minutes)
WAIT_FLAG_MIN = 4      # arrived but stalls before starting → fee-grab risk
NOMOVE_FLAG_MIN = 6    # accepted but never marked arrived for this long


def _parse(s):
    try:
        d = datetime.fromisoformat(str(s).replace("Z", "+00:00"))
        return d if d.tzinfo else d.replace(tzinfo=timezone.utc)
    except (ValueError, TypeError):
        return None


def _mins(a, b):
    da, db_ = _parse(a), _parse(b)
    if not da or not db_:
        return None
    return round((db_ - da).total_seconds() / 60, 1)


@router.get("")
async def trip_timings(request: Request, date_from: Optional[str] = None,
                       date_to: Optional[str] = None, only_flagged: bool = False):
    await require_role(request, ["admin", "dispatcher"])
    end = (date_to + "T23:59:59") if date_to else datetime.now(timezone.utc).isoformat()
    start = (date_from + "T00:00:00") if date_from \
        else (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
    now = datetime.now(timezone.utc)

    rides = await db.rides.find(
        {"accepted_at": {"$ne": None, "$gte": start, "$lte": end}},
        {"_id": 0, "id": 1, "driver_id": 1, "driver_name": 1, "status": 1,
         "accepted_at": 1, "arrived_at": 1, "started_at": 1, "completed_at": 1,
         "cancelled_by": 1, "pickup_address": 1, "dropoff_address": 1}
    ).sort("accepted_at", -1).limit(500).to_list(500)

    rows = []
    for r in rides:
        go = _mins(r.get("accepted_at"), r.get("arrived_at"))           # accept → at pickup
        wait = _mins(r.get("arrived_at"), r.get("started_at"))          # at pickup → trip start
        trip = _mins(r.get("started_at"), r.get("completed_at"))        # trip duration
        total = _mins(r.get("accepted_at"), r.get("completed_at"))
        flags = []
        # Accepted, never arrived, and not started — driver didn't move.
        if not r.get("arrived_at") and not r.get("started_at"):
            age = _mins(r.get("accepted_at"), now.isoformat())
            if r.get("status") == "cancelled" and (r.get("cancelled_by") == "driver"):
                flags.append("annulé_sans_déplacement")
            elif age and age >= NOMOVE_FLAG_MIN:
                flags.append("accepté_pas_de_déplacement")
        # Arrived but stalls before starting → possible fee-grab.
        if wait is not None and wait >= WAIT_FLAG_MIN:
            flags.append("attente_longue_avant_départ")
        # Cancelled by driver after accepting.
        if r.get("status") == "cancelled" and r.get("cancelled_by") == "driver" and "annulé_sans_déplacement" not in flags:
            flags.append("annulé_par_chauffeur")

        if only_flagged and not flags:
            continue
        rows.append({
            "ride_id": r["id"],
            "driver_name": r.get("driver_name") or "—",
            "status": r.get("status"),
            "pickup": (r.get("pickup_address") or "")[:40],
            "dropoff": (r.get("dropoff_address") or "")[:40],
            "accepted_at": r.get("accepted_at"),
            "go_minutes": go,
            "wait_minutes": wait,
            "trip_minutes": trip,
            "total_minutes": total,
            "flags": flags,
        })

    flagged = [r for r in rows if r["flags"]]
    waits = [r["wait_minutes"] for r in rows if r["wait_minutes"] is not None]
    gos = [r["go_minutes"] for r in rows if r["go_minutes"] is not None]
    return {
        "range": {"from": start, "to": end},
        "thresholds": {"wait_flag_min": WAIT_FLAG_MIN, "nomove_flag_min": NOMOVE_FLAG_MIN},
        "summary": {
            "rides": len(rows),
            "flagged": len(flagged),
            "avg_go_minutes": round(sum(gos) / len(gos), 1) if gos else None,
            "avg_wait_minutes": round(sum(waits) / len(waits), 1) if waits else None,
        },
        "rides": rows,
    }
