"""
Image uploads via Emergent-managed object storage.

- POST /api/uploads/image  (auth) → uploads an image, returns {id, url}.
- GET  /api/uploads/{id}    (public) → serves the image bytes for <img src>.

The returned `url` is a same-origin relative path (`/api/uploads/{id}`) so it
works directly in <img src> on both preview and production (frontend and /api
share the domain). File references live in MongoDB (source of truth).
"""
import os
import uuid
import asyncio
from datetime import datetime, timezone
import requests
from fastapi import APIRouter, Request, HTTPException, UploadFile, File, Response

from core.config import db
from core.deps import get_current_user

router = APIRouter(prefix="/uploads", tags=["uploads"])

STORAGE_URL = "https://integrations.emergentagent.com/objstore/api/v1/storage"
APP_NAME = "sb-drive"
MAX_BYTES = 6 * 1024 * 1024  # 6 MB
ALLOWED = {"image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"}
EXT = {"image/png": "png", "image/jpeg": "jpg", "image/jpg": "jpg", "image/webp": "webp", "image/gif": "gif"}

_storage_key = None


def _init_storage():
    global _storage_key
    if _storage_key:
        return _storage_key
    key = os.environ.get("EMERGENT_LLM_KEY")
    if not key:
        raise RuntimeError("EMERGENT_LLM_KEY manquant")
    resp = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": key}, timeout=30)
    resp.raise_for_status()
    _storage_key = resp.json()["storage_key"]
    return _storage_key


def _put_object(path: str, data: bytes, content_type: str) -> dict:
    global _storage_key
    key = _init_storage()
    resp = requests.put(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key, "Content-Type": content_type},
        data=data, timeout=120,
    )
    if resp.status_code == 403:  # expired key → refresh once
        _storage_key = None
        key = _init_storage()
        resp = requests.put(
            f"{STORAGE_URL}/objects/{path}",
            headers={"X-Storage-Key": key, "Content-Type": content_type},
            data=data, timeout=120,
        )
    resp.raise_for_status()
    return resp.json()


def _get_object(path: str):
    global _storage_key
    key = _init_storage()
    resp = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, timeout=60)
    if resp.status_code == 403:
        _storage_key = None
        key = _init_storage()
        resp = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, timeout=60)
    resp.raise_for_status()
    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")


@router.post("/image")
async def upload_image(request: Request, file: UploadFile = File(...)):
    user = await get_current_user(request)
    ctype = (file.content_type or "").lower()
    if ctype not in ALLOWED:
        raise HTTPException(status_code=400, detail="Format non supporté (png, jpg, webp, gif)")
    data = await file.read()
    if len(data) > MAX_BYTES:
        raise HTTPException(status_code=400, detail="Image trop lourde (max 6 Mo)")
    ext = EXT.get(ctype, "bin")
    path = f"{APP_NAME}/uploads/{user['id']}/{uuid.uuid4().hex}.{ext}"
    try:
        result = await asyncio.to_thread(_put_object, path, data, ctype)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Échec de l'upload: {e}")
    file_id = uuid.uuid4().hex
    await db.uploads.insert_one({
        "id": file_id,
        "storage_path": result["path"],
        "content_type": ctype,
        "size": result.get("size", len(data)),
        "owner_id": user["id"],
        "is_deleted": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return {"id": file_id, "url": f"/api/uploads/{file_id}"}


@router.get("/{file_id}")
async def serve_image(file_id: str):
    """Public image serving for storefront/provider photos."""
    rec = await db.uploads.find_one({"id": file_id, "is_deleted": False}, {"_id": 0})
    if not rec:
        raise HTTPException(status_code=404, detail="Fichier introuvable")
    try:
        data, ctype = await asyncio.to_thread(_get_object, rec["storage_path"])
    except Exception:
        raise HTTPException(status_code=404, detail="Fichier indisponible")
    return Response(
        content=data,
        media_type=rec.get("content_type", ctype),
        headers={"Cache-Control": "public, max-age=86400"},
    )
