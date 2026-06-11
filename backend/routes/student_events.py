"""
SB Drive Student — Phase 5b: Student events + shuttle reservations.

Admin publishes student events (parties, university events, festivals) with an
optional collective shuttle. Students browse upcoming events and reserve shuttle
seats (capacity-aware).

Endpoints under /api/student/events.
"""
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from core.config import db
from core.deps import get_current_user

router = APIRouter(prefix="/student/events", tags=["student-events"])

EVENT_TYPES = {"party", "university", "festival"}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


async def _seats_taken(event_id: str) -> int:
    rows = await db.student_event_reservations.find(
        {"event_id": event_id, "status": "confirmed"}, {"_id": 0, "seats": 1}).to_list(5000)
    return int(sum(int(r.get("seats", 1) or 1) for r in rows))


# ==================== STUDENT ====================
@router.get("")
async def list_events(request: Request):
    await get_current_user(request)
    now = _now()
    events = await db.student_events.find(
        {"enabled": True, "$or": [{"date": {"$gte": now}}, {"date": None}]}, {"_id": 0}
    ).sort("date", 1).to_list(200)
    for e in events:
        if e.get("shuttle_enabled"):
            taken = await _seats_taken(e["id"])
            cap = int(e.get("capacity", 0) or 0)
            e["seats_taken"] = taken
            e["seats_left"] = max(0, cap - taken) if cap else None
    return {"events": events}


@router.get("/my-reservations")
async def my_reservations(request: Request):
    user = await get_current_user(request)
    res = await db.student_event_reservations.find(
        {"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return {"reservations": res}


class ReserveBody(BaseModel):
    event_id: str
    seats: int = 1
    pickup: str = ""


@router.post("/reserve")
async def reserve_shuttle(body: ReserveBody, request: Request):
    user = await get_current_user(request)
    event = await db.student_events.find_one({"id": body.event_id, "enabled": True}, {"_id": 0})
    if not event:
        raise HTTPException(status_code=404, detail="Événement introuvable")
    if not event.get("shuttle_enabled"):
        raise HTTPException(status_code=400, detail="Aucune navette pour cet événement")
    seats = max(1, int(body.seats))
    cap = int(event.get("capacity", 0) or 0)
    if cap:
        taken = await _seats_taken(body.event_id)
        if taken + seats > cap:
            raise HTTPException(status_code=409, detail=f"Plus assez de places ({max(0, cap - taken)} restantes)")
    # one active reservation per user per event
    existing = await db.student_event_reservations.find_one(
        {"event_id": body.event_id, "user_id": user["id"], "status": "confirmed"})
    if existing:
        raise HTTPException(status_code=409, detail="Vous avez déjà réservé pour cet événement")
    doc = {
        "id": f"er_{uuid.uuid4().hex[:10]}", "event_id": body.event_id, "event_title": event.get("title"),
        "user_id": user["id"], "user_name": user.get("name"), "seats": seats, "pickup": body.pickup,
        "price": event.get("shuttle_price", 0.0), "status": "confirmed", "created_at": _now(),
    }
    await db.student_event_reservations.insert_one(dict(doc))
    doc.pop("_id", None)
    return {"ok": True, "reservation": doc}


@router.delete("/reserve/{reservation_id}")
async def cancel_reservation(reservation_id: str, request: Request):
    user = await get_current_user(request)
    res = await db.student_event_reservations.update_one(
        {"id": reservation_id, "user_id": user["id"]}, {"$set": {"status": "cancelled"}})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Réservation introuvable")
    return {"ok": True}


# ==================== ADMIN ====================
async def _require_admin(request: Request):
    user = await get_current_user(request)
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    return user


class EventBody(BaseModel):
    title: str
    description: str = ""
    type: str = "party"
    date: str | None = None          # ISO
    location: str = ""
    image: str = ""
    shuttle_enabled: bool = False
    shuttle_price: float = 0.0
    capacity: int = 0                # 0 = unlimited
    enabled: bool = True


@router.get("/admin/list")
async def admin_list(request: Request):
    await _require_admin(request)
    events = await db.student_events.find({}, {"_id": 0}).sort("date", -1).to_list(500)
    for e in events:
        e["seats_taken"] = await _seats_taken(e["id"])
    return {"events": events}


@router.post("/admin")
async def admin_create(body: EventBody, request: Request):
    await _require_admin(request)
    if body.type not in EVENT_TYPES:
        raise HTTPException(status_code=400, detail="Type d'événement invalide")
    doc = {"id": f"ev_{uuid.uuid4().hex[:8]}", **body.dict(), "created_at": _now()}
    await db.student_events.insert_one(dict(doc))
    doc.pop("_id", None)
    return {"event": doc}


class EventPatch(BaseModel):
    title: str | None = None
    description: str | None = None
    type: str | None = None
    date: str | None = None
    location: str | None = None
    image: str | None = None
    shuttle_enabled: bool | None = None
    shuttle_price: float | None = None
    capacity: int | None = None
    enabled: bool | None = None


@router.put("/admin/{event_id}")
async def admin_update(event_id: str, body: EventPatch, request: Request):
    await _require_admin(request)
    patch = {k: v for k, v in body.dict().items() if v is not None}
    if "type" in patch and patch["type"] not in EVENT_TYPES:
        raise HTTPException(status_code=400, detail="Type d'événement invalide")
    if not patch:
        raise HTTPException(status_code=400, detail="Rien à mettre à jour")
    res = await db.student_events.update_one({"id": event_id}, {"$set": patch})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Événement introuvable")
    return {"event": await db.student_events.find_one({"id": event_id}, {"_id": 0})}


@router.delete("/admin/{event_id}")
async def admin_delete(event_id: str, request: Request):
    await _require_admin(request)
    res = await db.student_events.delete_one({"id": event_id})
    return {"deleted": res.deleted_count}


@router.get("/admin/{event_id}/reservations")
async def admin_reservations(event_id: str, request: Request):
    await _require_admin(request)
    res = await db.student_event_reservations.find({"event_id": event_id}, {"_id": 0}).to_list(2000)
    return {"reservations": res}
