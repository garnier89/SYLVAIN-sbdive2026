"""
Safety audio recordings — DRIVER-side. A driver can record audio during an
active ride/job for safety; recordings are stored in Emergent object storage
and reviewable by the driver (owner) and admins.

- POST /api/safety/audio/upload   (driver) → multipart audio + ride_id/kind
- GET  /api/safety/audio/{id}      (owner or admin) → serves audio bytes
- GET  /api/safety/audio/ride/{ride_id} (owner or admin) → list for a ride
- GET  /api/admin/safety/recordings (admin) → list all (filters)
"""
import uuid
import asyncio
from datetime import datetime, timezone

from fastapi import APIRouter, Request, HTTPException, UploadFile, File, Form, Response

from core.config import db
from core.deps import get_current_user, require_role, put_object, get_object

router = APIRouter(prefix="/safety/audio", tags=["safety-audio"])
admin_router = APIRouter(prefix="/admin/safety", tags=["safety-admin"])

APP_NAME = "sb-drive"
MAX_BYTES = 25 * 1024 * 1024  # 25 MB per clip
ALLOWED = {"audio/webm", "audio/ogg", "audio/mpeg", "audio/mp3", "audio/wav",
           "audio/x-wav", "audio/mp4", "audio/aac", "audio/m4a", "audio/x-m4a"}
EXT = {"audio/webm": "webm", "audio/ogg": "ogg", "audio/mpeg": "mp3", "audio/mp3": "mp3",
       "audio/wav": "wav", "audio/x-wav": "wav", "audio/mp4": "m4a", "audio/aac": "aac",
       "audio/m4a": "m4a", "audio/x-m4a": "m4a"}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


async def _driver_profile(user: dict):
    return await db.drivers.find_one({"user_id": user["id"]}, {"_id": 0, "id": 1})


@router.post("/upload")
async def upload_recording(
    request: Request,
    file: UploadFile = File(...),
    ride_id: str = Form(None),
    kind: str = Form("ride"),
    duration_sec: float = Form(0),
):
    user = await require_role(request, ["driver"])
    ctype = (file.content_type or "").split(";")[0].strip().lower()
    if ctype not in ALLOWED:
        raise HTTPException(status_code=400, detail="Format audio non supporté")
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Fichier audio vide")
    if len(data) > MAX_BYTES:
        raise HTTPException(status_code=400, detail="Enregistrement trop lourd (max 25 Mo)")

    drv = await _driver_profile(user)
    ext = EXT.get(ctype, "webm")
    path = f"{APP_NAME}/safety-audio/{user['id']}/{uuid.uuid4().hex}.{ext}"
    try:
        result = await asyncio.to_thread(put_object, path, data, ctype)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Échec de l'upload: {e}")

    rec_id = uuid.uuid4().hex
    doc = {
        "id": rec_id,
        "storage_path": result.get("path", path),
        "content_type": ctype,
        "size": result.get("size", len(data)),
        "driver_user_id": user["id"],
        "driver_id": (drv or {}).get("id"),
        "driver_name": user.get("name"),
        "ride_id": ride_id,
        "kind": kind if kind in ("ride", "job") else "ride",
        "duration_sec": round(float(duration_sec or 0), 1),
        "created_at": _now(),
    }
    await db.safety_recordings.insert_one({**doc})
    return {"id": rec_id, "url": f"/api/safety/audio/{rec_id}", "duration_sec": doc["duration_sec"], "created_at": doc["created_at"]}


@router.get("/ride/{ride_id}")
async def list_for_ride(ride_id: str, request: Request):
    user = await get_current_user(request)
    docs = await db.safety_recordings.find({"ride_id": ride_id}, {"_id": 0, "storage_path": 0}).sort("created_at", -1).to_list(200)
    # Driver may only see their own; admin sees all.
    if user.get("role") != "admin":
        docs = [d for d in docs if d.get("driver_user_id") == user["id"]]
    return docs


@router.get("/{rec_id}")
async def serve_recording(rec_id: str, request: Request):
    user = await get_current_user(request)
    rec = await db.safety_recordings.find_one({"id": rec_id}, {"_id": 0})
    if not rec:
        raise HTTPException(status_code=404, detail="Enregistrement introuvable")
    if user.get("role") != "admin" and rec.get("driver_user_id") != user["id"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    try:
        data, ctype = await asyncio.to_thread(get_object, rec["storage_path"])
    except Exception:
        raise HTTPException(status_code=404, detail="Fichier indisponible")
    return Response(content=data, media_type=rec.get("content_type", ctype),
                    headers={"Cache-Control": "private, max-age=3600", "Accept-Ranges": "bytes"})


@admin_router.get("/recordings")
async def admin_list_recordings(request: Request, ride_id: str = None, driver_id: str = None, limit: int = 100):
    await require_role(request, ["admin", "dispatcher"])
    flt = {}
    if ride_id:
        flt["ride_id"] = ride_id
    if driver_id:
        flt["driver_id"] = driver_id
    docs = await db.safety_recordings.find(flt, {"_id": 0, "storage_path": 0}).sort("created_at", -1).limit(int(limit)).to_list(int(limit))
    for d in docs:
        d["url"] = f"/api/safety/audio/{d['id']}"
    return docs
