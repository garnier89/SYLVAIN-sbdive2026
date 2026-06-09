"""
Phase 3 — Annulations, pénalités & modération.

Règles (configurables côté admin):
- Client : au seuil d'avertissement (def. 10 annulations) → avertissement.
           au seuil de bannissement (def. 15) → bannissement temporaire
           (def. 2 h) puis remise à zéro du compteur.
- Chauffeur : pénalité monétaire pour annulation abusive (def. 2 €) et pour
              "accepter puis relâcher" (def. 1 €).
- Journalisation des appels (qui/quand) et archivage des conversations pour la
  modération admin (pas d'audio Twilio).

Helpers exportés (importés par rides.py) :
  get_moderation_config, check_passenger_ban, register_passenger_cancel,
  apply_driver_penalty, log_call.
"""
from fastapi import APIRouter, Request, HTTPException
import uuid
from datetime import datetime, timezone, timedelta

from core.config import db
from core.deps import get_current_user, require_role

router = APIRouter(prefix="/moderation", tags=["moderation"])

DEFAULT_CONFIG = {
    "enabled": True,
    "client_warn_threshold": 10,
    "client_ban_threshold": 15,
    "client_ban_hours": 2,
    "driver_abusive_penalty_eur": 2.0,
    "driver_release_penalty_eur": 1.0,
}


def _now():
    return datetime.now(timezone.utc).isoformat()


async def get_moderation_config() -> dict:
    doc = await db.service_configs.find_one({"service_key": "moderation"}, {"_id": 0})
    s = (doc or {}).get("settings") or {}
    return {**DEFAULT_CONFIG, **s}


async def _save_moderation_config(patch: dict):
    await db.service_configs.update_one(
        {"service_key": "moderation"},
        {"$set": {f"settings.{k}": v for k, v in patch.items()},
         "$setOnInsert": {"service_key": "moderation"}},
        upsert=True,
    )


async def _log_event(event_type: str, **fields):
    """Record a moderation event for the admin audit trail."""
    await db.moderation_events.insert_one({
        "id": f"mev_{uuid.uuid4().hex[:12]}",
        "type": event_type,
        "created_at": _now(),
        **fields,
    })


# ── Passenger cancellation tracking ──────────────────────────────────────
async def check_passenger_ban(user_id: str):
    """Raise 403 if the passenger is currently banned from booking."""
    cfg = await get_moderation_config()
    if not cfg.get("enabled", True):
        return
    state = await db.moderation_state.find_one({"user_id": user_id}, {"_id": 0, "ban_until": 1})
    ban_until = (state or {}).get("ban_until")
    if not ban_until:
        return
    try:
        until = datetime.fromisoformat(str(ban_until).replace("Z", "+00:00"))
    except (ValueError, TypeError):
        return
    if datetime.now(timezone.utc) < until:
        mins = max(1, round((until - datetime.now(timezone.utc)).total_seconds() / 60))
        raise HTTPException(
            status_code=403,
            detail=f"Réservations suspendues suite à des annulations répétées. Réessayez dans {mins} min.",
        )


async def register_passenger_cancel(user_id: str, ride_id: str = None) -> dict:
    """Increment the passenger's cancel counter and apply warning / ban rules.

    Returns {count, warned, banned, ban_until}.
    """
    cfg = await get_moderation_config()
    if not cfg.get("enabled", True):
        return {"count": 0, "warned": False, "banned": False, "ban_until": None}

    warn_at = int(cfg.get("client_warn_threshold", 10))
    ban_at = int(cfg.get("client_ban_threshold", 15))
    ban_hours = float(cfg.get("client_ban_hours", 2))

    state = await db.moderation_state.find_one({"user_id": user_id}, {"_id": 0})
    count = int((state or {}).get("cancel_count", 0)) + 1

    warned = False
    banned = False
    ban_until = None

    if count >= ban_at:
        until = datetime.now(timezone.utc) + timedelta(hours=ban_hours)
        ban_until = until.isoformat()
        banned = True
        # Bannissement temporaire puis remise à zéro du compteur.
        await db.moderation_state.update_one(
            {"user_id": user_id},
            {"$set": {"cancel_count": 0, "ban_until": ban_until, "updated_at": _now()}},
            upsert=True,
        )
        await _log_event("client_ban", user_id=user_id, ride_id=ride_id,
                         ban_until=ban_until, threshold=ban_at)
        try:
            from core.notifications import create_notification
            await create_notification(
                user_id, "moderation", "Réservations suspendues ⛔",
                f"Trop d'annulations. Vous pourrez réserver à nouveau dans {ban_hours:g} h.",
                push=True, data={"kind": "ban", "ban_until": ban_until},
            )
        except Exception:
            pass
    else:
        update = {"cancel_count": count, "updated_at": _now()}
        if count >= warn_at:
            warned = True
            update["last_warned_at"] = _now()
        await db.moderation_state.update_one(
            {"user_id": user_id}, {"$set": update}, upsert=True,
        )
        if warned:
            await _log_event("client_warning", user_id=user_id, ride_id=ride_id,
                             count=count, threshold=warn_at)
            try:
                from core.notifications import create_notification
                await create_notification(
                    user_id, "moderation", "Avertissement annulations ⚠️",
                    f"Vous avez annulé {count} courses. {ban_at - count} avant une suspension temporaire.",
                    push=True, data={"kind": "warning", "count": count},
                )
            except Exception:
                pass

    return {"count": count, "warned": warned, "banned": banned, "ban_until": ban_until}


# ── Driver penalties ──────────────────────────────────────────────────────
async def apply_driver_penalty(driver_id: str, kind: str, ride_id: str = None) -> dict:
    """Debit the driver's wallet for an abusive cancel ('abusive_cancel') or for
    accepting then releasing a booking ('accept_release'). Returns {amount}."""
    cfg = await get_moderation_config()
    if not cfg.get("enabled", True) or not driver_id:
        return {"amount": 0.0}
    if kind == "abusive_cancel":
        amount = round(float(cfg.get("driver_abusive_penalty_eur", 2.0) or 0), 2)
        label = "Pénalité — annulation abusive"
    else:
        amount = round(float(cfg.get("driver_release_penalty_eur", 1.0) or 0), 2)
        label = "Pénalité — réservation relâchée"
    if amount <= 0:
        return {"amount": 0.0}
    drv = await db.drivers.find_one({"id": driver_id}, {"_id": 0, "user_id": 1})
    duid = (drv or {}).get("user_id")
    if not duid:
        return {"amount": 0.0}
    from routes.debts import _debit_wallet
    await _debit_wallet(duid, amount, label, ride_id)
    await _log_event("driver_penalty", driver_id=driver_id, user_id=duid,
                     ride_id=ride_id, kind=kind, amount=amount)
    try:
        from core.notifications import create_notification
        await create_notification(
            duid, "moderation", "Pénalité appliquée",
            f"-{amount:.2f} € — {label.split('— ')[-1]}.",
            push=True, data={"kind": "penalty", "amount": amount, "ride_id": ride_id},
        )
    except Exception:
        pass
    return {"amount": amount}


# ── Call logging (no audio, just who/when) ───────────────────────────────
async def log_call(ride_id: str, from_user_id: str, from_role: str,
                   to_user_id: str = None, to_role: str = None):
    await db.call_logs.insert_one({
        "id": f"call_{uuid.uuid4().hex[:12]}",
        "ride_id": ride_id,
        "from_user_id": from_user_id,
        "from_role": from_role,
        "to_user_id": to_user_id,
        "to_role": to_role,
        "created_at": _now(),
    })


# ── Endpoints ─────────────────────────────────────────────────────────────
@router.post("/call-log")
async def create_call_log(request: Request):
    """Logged when a passenger or driver taps the call button (traceability)."""
    user = await get_current_user(request)
    body = await request.json()
    ride_id = (body.get("ride_id") or "").strip()
    if not ride_id:
        raise HTTPException(status_code=400, detail="ride_id requis")
    ride = await db.rides.find_one({"id": ride_id}, {"_id": 0, "user_id": 1, "driver_id": 1})
    if not ride:
        raise HTTPException(status_code=404, detail="Course introuvable")
    driver = await db.drivers.find_one({"user_id": user["id"]}, {"_id": 0, "id": 1})
    from_role = "driver" if (driver and driver["id"] == ride.get("driver_id")) else "client"
    to_role = "client" if from_role == "driver" else "driver"
    to_user_id = ride.get("user_id") if to_role == "client" else None
    if to_role == "driver" and ride.get("driver_id"):
        drv = await db.drivers.find_one({"id": ride["driver_id"]}, {"_id": 0, "user_id": 1})
        to_user_id = (drv or {}).get("user_id")
    await log_call(ride_id, user["id"], from_role, to_user_id, to_role)
    return {"logged": True}


@router.get("/passenger-status")
async def passenger_status(request: Request):
    """Self-serve view of the passenger's cancel counter / ban state."""
    user = await get_current_user(request)
    cfg = await get_moderation_config()
    state = await db.moderation_state.find_one({"user_id": user["id"]}, {"_id": 0}) or {}
    ban_until = state.get("ban_until")
    banned = False
    if ban_until:
        try:
            banned = datetime.now(timezone.utc) < datetime.fromisoformat(
                str(ban_until).replace("Z", "+00:00"))
        except (ValueError, TypeError):
            banned = False
    return {
        "cancel_count": int(state.get("cancel_count", 0)),
        "warn_threshold": int(cfg.get("client_warn_threshold", 10)),
        "ban_threshold": int(cfg.get("client_ban_threshold", 15)),
        "banned": banned,
        "ban_until": ban_until if banned else None,
    }


# ── Admin ─────────────────────────────────────────────────────────────────
@router.get("/admin/config")
async def admin_get_config(request: Request):
    await require_role(request, ["admin"])
    return await get_moderation_config()


@router.put("/admin/config")
async def admin_save_config(request: Request):
    await require_role(request, ["admin"])
    body = await request.json()
    patch = {}
    if "enabled" in body:
        patch["enabled"] = bool(body["enabled"])
    for key, lo, hi in [
        ("client_warn_threshold", 1, 1000),
        ("client_ban_threshold", 1, 1000),
    ]:
        if key in body:
            try:
                patch[key] = min(hi, max(lo, int(body[key])))
            except (TypeError, ValueError):
                pass
    if "client_ban_hours" in body:
        try:
            patch["client_ban_hours"] = min(168, max(0.5, float(body["client_ban_hours"])))
        except (TypeError, ValueError):
            pass
    for key in ("driver_abusive_penalty_eur", "driver_release_penalty_eur"):
        if key in body:
            try:
                patch[key] = max(0.0, round(float(body[key]), 2))
            except (TypeError, ValueError):
                pass
    if patch:
        await _save_moderation_config(patch)
    return await get_moderation_config()


@router.get("/admin/events")
async def admin_list_events(request: Request, type: str = None, limit: int = 100):
    await require_role(request, ["admin"])
    query = {}
    if type:
        query["type"] = type
    items = await db.moderation_events.find(query, {"_id": 0}).sort("created_at", -1).to_list(min(limit, 500))
    # enrich with names
    for ev in items:
        if ev.get("user_id"):
            u = await db.users.find_one({"id": ev["user_id"]}, {"_id": 0, "name": 1, "phone": 1})
            ev["user_name"] = (u or {}).get("name")
            ev["user_phone"] = (u or {}).get("phone")
    return items


@router.get("/admin/call-logs")
async def admin_call_logs(request: Request, ride_id: str = None, limit: int = 100):
    await require_role(request, ["admin"])
    query = {}
    if ride_id:
        query["ride_id"] = ride_id
    items = await db.call_logs.find(query, {"_id": 0}).sort("created_at", -1).to_list(min(limit, 500))
    for c in items:
        if c.get("from_user_id"):
            u = await db.users.find_one({"id": c["from_user_id"]}, {"_id": 0, "name": 1})
            c["from_name"] = (u or {}).get("name")
        if c.get("to_user_id"):
            u = await db.users.find_one({"id": c["to_user_id"]}, {"_id": 0, "name": 1})
            c["to_name"] = (u or {}).get("name")
    return items


@router.get("/admin/conversations")
async def admin_conversations(request: Request, limit: int = 50):
    """Archived chat threads (parcel / transport / ride) grouped by reference."""
    await require_role(request, ["admin"])
    pipeline = [
        {"$sort": {"created_at": -1}},
        {"$group": {
            "_id": {"ref_type": "$ref_type", "ref_id": "$ref_id"},
            "last_text": {"$first": "$text"},
            "last_at": {"$first": "$created_at"},
            "count": {"$sum": 1},
        }},
        {"$sort": {"last_at": -1}},
        {"$limit": min(limit, 200)},
    ]
    rows = await db.chat_messages.aggregate(pipeline).to_list(min(limit, 200))
    return [
        {
            "ref_type": r["_id"]["ref_type"],
            "ref_id": r["_id"]["ref_id"],
            "last_text": r.get("last_text"),
            "last_at": r.get("last_at"),
            "message_count": r.get("count"),
        }
        for r in rows
    ]


@router.get("/admin/conversations/{ref_type}/{ref_id}")
async def admin_conversation_thread(ref_type: str, ref_id: str, request: Request):
    await require_role(request, ["admin"])
    msgs = await db.chat_messages.find(
        {"ref_type": ref_type, "ref_id": ref_id}, {"_id": 0}
    ).sort("created_at", 1).to_list(500)
    return msgs
