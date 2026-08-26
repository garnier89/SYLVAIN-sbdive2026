"""
Emploi — job classifieds (V3Cube-style: employers post offers, candidates
browse/filter and apply). Mirrors the real-estate classifieds model:
users post listings, others contact/apply, owner moderates via status.
"""
from fastapi import APIRouter, Request, HTTPException
import uuid
from datetime import datetime, timezone
from typing import Optional
from pydantic import BaseModel, Field

from core.config import db
from core.deps import get_current_user
from core.websocket import manager

router = APIRouter(prefix="/jobs", tags=["jobs"])

JOB_TYPES = {"cdi", "cdd", "interim", "saisonnier", "stage", "freelance"}
STATUSES = {"active", "closed"}


class JobCreate(BaseModel):
    title: str = Field(..., min_length=3)
    company: str = Field(..., min_length=1)
    job_type: str  # cdi | cdd | interim | saisonnier | stage | freelance
    description: Optional[str] = ""
    location: Optional[str] = None
    remote: bool = False
    salary_min: Optional[float] = None
    salary_max: Optional[float] = None
    salary_period: Optional[str] = "mois"  # heure | jour | mois | an
    contact_email: Optional[str] = None
    contact_phone: Optional[str] = None


class ApplicationCreate(BaseModel):
    message: Optional[str] = ""
    contact_phone: Optional[str] = None


def _validate(data: JobCreate):
    if data.job_type not in JOB_TYPES:
        raise HTTPException(status_code=400, detail="Type de contrat invalide")


@router.get("")
async def list_jobs(
    request: Request,
    job_type: Optional[str] = None,
    q: Optional[str] = None,
    location: Optional[str] = None,
    remote: Optional[bool] = None,
    limit: int = 50,
):
    await get_current_user(request)
    query: dict = {"status": "active"}
    if job_type in JOB_TYPES:
        query["job_type"] = job_type
    if location:
        query["location"] = {"$regex": location, "$options": "i"}
    if remote is not None:
        query["remote"] = remote
    if q:
        query["$or"] = [
            {"title": {"$regex": q, "$options": "i"}},
            {"company": {"$regex": q, "$options": "i"}},
            {"description": {"$regex": q, "$options": "i"}},
        ]
    items = await db.job_listings.find(query, {"_id": 0}).sort("created_at", -1).to_list(limit)
    return items


@router.get("/my/listings")
async def my_listings(request: Request):
    user = await get_current_user(request)
    items = await db.job_listings.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(100)
    for it in items:
        it["unread_applications"] = await db.job_applications.count_documents(
            {"job_id": it["id"], "seen": {"$ne": True}}
        )
    return items


@router.get("/my/applications")
async def my_applications(request: Request):
    user = await get_current_user(request)
    items = await db.job_applications.find({"applicant_user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return items


@router.post("")
async def create_job(data: JobCreate, request: Request):
    user = await get_current_user(request)
    _validate(data)
    job = {
        "id": f"job_{uuid.uuid4().hex[:12]}",
        "user_id": user["id"],
        **data.model_dump(),
        "contact_email": data.contact_email or user.get("email"),
        "contact_phone": data.contact_phone or user.get("phone"),
        "status": "active",
        "views": 0,
        "applications_count": 0,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.job_listings.insert_one(job)
    job.pop("_id", None)
    return job


@router.get("/{job_id}")
async def get_job(job_id: str, request: Request):
    await get_current_user(request)
    job = await db.job_listings.find_one({"id": job_id}, {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Offre introuvable")
    await db.job_listings.update_one({"id": job_id}, {"$inc": {"views": 1}})
    return job


@router.put("/{job_id}")
async def update_job(job_id: str, data: JobCreate, request: Request):
    user = await get_current_user(request)
    _validate(data)
    job = await db.job_listings.find_one({"id": job_id}, {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Offre introuvable")
    if job["user_id"] != user["id"] and user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Accès refusé")
    await db.job_listings.update_one({"id": job_id}, {"$set": data.model_dump()})
    return {**job, **data.model_dump()}


@router.post("/{job_id}/status")
async def set_status(job_id: str, request: Request):
    user = await get_current_user(request)
    body = await request.json()
    new_status = body.get("status")
    if new_status not in STATUSES:
        raise HTTPException(status_code=400, detail="Statut invalide")
    job = await db.job_listings.find_one({"id": job_id}, {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Offre introuvable")
    if job["user_id"] != user["id"] and user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Accès refusé")
    await db.job_listings.update_one({"id": job_id}, {"$set": {"status": new_status}})
    return {"id": job_id, "status": new_status}


@router.delete("/{job_id}")
async def delete_job(job_id: str, request: Request):
    user = await get_current_user(request)
    job = await db.job_listings.find_one({"id": job_id}, {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Offre introuvable")
    if job["user_id"] != user["id"] and user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Accès refusé")
    await db.job_listings.delete_one({"id": job_id})
    return {"ok": True}


@router.post("/{job_id}/apply")
async def apply_to_job(job_id: str, data: ApplicationCreate, request: Request):
    user = await get_current_user(request)
    job = await db.job_listings.find_one({"id": job_id}, {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Offre introuvable")
    if job["user_id"] == user["id"]:
        raise HTTPException(status_code=400, detail="Vous ne pouvez pas postuler à votre propre offre")
    existing = await db.job_applications.find_one({"job_id": job_id, "applicant_user_id": user["id"]})
    if existing:
        raise HTTPException(status_code=400, detail="Vous avez déjà postulé à cette offre")
    application = {
        "id": f"jobapp_{uuid.uuid4().hex[:12]}",
        "job_id": job_id,
        "job_title": job.get("title"),
        "employer_user_id": job["user_id"],
        "applicant_user_id": user["id"],
        "applicant_name": user.get("name"),
        "message": data.message,
        "contact_phone": data.contact_phone or user.get("phone"),
        "status": "new",
        "seen": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.job_applications.insert_one(application)
    application.pop("_id", None)
    await db.job_listings.update_one({"id": job_id}, {"$inc": {"applications_count": 1}})
    try:
        await manager.send_personal_message({
            "type": "new_job_application",
            "job_id": job_id,
            "job_title": job.get("title"),
            "from_name": user.get("name"),
        }, job["user_id"])
    except Exception:
        pass
    return application


@router.get("/{job_id}/applications")
async def job_applications(job_id: str, request: Request):
    user = await get_current_user(request)
    job = await db.job_listings.find_one({"id": job_id}, {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Offre introuvable")
    if job["user_id"] != user["id"] and user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Accès refusé")
    items = await db.job_applications.find({"job_id": job_id}, {"_id": 0}).sort("created_at", -1).to_list(200)
    await db.job_applications.update_many({"job_id": job_id, "seen": {"$ne": True}}, {"$set": {"seen": True}})
    return items
