"""
SB Drive Student (a.k.a. SB School) — Phase 1 foundation.

Provides:
- Student status verification (university-email OTP **and** document upload + admin review)
- Student badge once verified
- Admin-configurable student pricing (ride / advance / campus discounts + daily & monthly caps)
- Admin-managed accepted university email domains (per country, enable/disable)
- A discount engine (compute + record usage, cap-aware) consumed by the ride flow
- Admin dashboard stats

Everything is additive and isolated under /api/student. The discount engine is
defensive: if the module is disabled or the user isn't a verified student it
returns a zero discount, so existing ride pricing is never affected.
"""
import os
import uuid
import hashlib
import secrets
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, HTTPException, Request, UploadFile, File, Query
from pydantic import BaseModel

from core.config import db, JWT_SECRET, APP_NAME
from core.deps import get_current_user, put_object

router = APIRouter(prefix="/student", tags=["student"])

CONFIG_ID = "student_config"
OTP_TTL_MIN = 15
OTP_COOLDOWN_SEC = 60
MAX_OTP_ATTEMPTS = 5

DEFAULT_CONFIG = {
    "id": CONFIG_ID,
    "enabled": True,
    "ride_discount_pct": 20.0,        # instant rides
    "advance_discount_pct": 15.0,     # scheduled / advance reservations
    "campus_discount_pct": 25.0,      # campus <-> home trips
    "daily_cap": 5.0,                 # max € discount per day (0 = unlimited)
    "monthly_cap": 50.0,              # max € discount per month (0 = unlimited)
    "currency": "EUR",
}

DEFAULT_DOMAINS = [
    {"domain": "univ-antilles.fr", "label": "Université des Antilles", "country": "FR", "enabled": True},
    {"domain": "etu.univ-antilles.fr", "label": "Université des Antilles (étudiants)", "country": "FR", "enabled": True},
    {"domain": "ucad.edu.sn", "label": "Université Cheikh Anta Diop (Dakar)", "country": "SN", "enabled": True},
    {"domain": "univ-cocody.ci", "label": "Université Félix Houphouët-Boigny (Abidjan)", "country": "CI", "enabled": True},
]


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _hash(value: str) -> str:
    return hashlib.sha256(f"{JWT_SECRET}:{value}".encode()).hexdigest()


async def ensure_seeded():
    cfg = await db.student_config.find_one({"id": CONFIG_ID})
    if not cfg:
        await db.student_config.insert_one({**DEFAULT_CONFIG, "updated_at": _now()})
    if await db.student_email_domains.count_documents({}) == 0:
        for d in DEFAULT_DOMAINS:
            await db.student_email_domains.insert_one({
                "id": f"dom_{uuid.uuid4().hex[:8]}", **d, "created_at": _now(),
            })


async def get_config() -> dict:
    await ensure_seeded()
    cfg = await db.student_config.find_one({"id": CONFIG_ID}, {"_id": 0}) or dict(DEFAULT_CONFIG)
    return cfg


async def get_or_create_profile(user_id: str) -> dict:
    p = await db.student_profiles.find_one({"user_id": user_id}, {"_id": 0})
    if not p:
        p = {
            "user_id": user_id, "status": "none", "email_status": "none",
            "university_email": None, "university": None, "country": None,
            "method": None, "documents": [], "verified_at": None,
            "created_at": _now(), "updated_at": _now(),
        }
        await db.student_profiles.insert_one(dict(p))
    return p


def _is_verified(profile: dict) -> bool:
    return (profile or {}).get("status") == "verified"


# ======================= DISCOUNT ENGINE =======================
async def _usage_totals(user_id: str) -> tuple[float, float]:
    """Return (used_today, used_this_month) in €."""
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    month = datetime.now(timezone.utc).strftime("%Y-%m")
    rows = await db.student_discount_usage.find(
        {"user_id": user_id, "month": month}, {"_id": 0, "amount": 1, "date": 1}
    ).to_list(2000)
    used_month = sum(float(r.get("amount", 0) or 0) for r in rows)
    used_today = sum(float(r.get("amount", 0) or 0) for r in rows if r.get("date") == today)
    return round(used_today, 2), round(used_month, 2)


async def compute_student_discount(user_id: str, fare: float, kind: str = "ride") -> dict:
    """Cap-aware student discount for a fare. NEVER raises. kind ∈ {ride, advance, campus}.
    Returns {amount, pct, kind, eligible}. amount=0 when not eligible / disabled."""
    try:
        if fare is None or fare <= 0:
            return {"amount": 0.0, "pct": 0.0, "kind": kind, "eligible": False}
        profile = await db.student_profiles.find_one({"user_id": user_id}, {"_id": 0})
        if not _is_verified(profile):
            return {"amount": 0.0, "pct": 0.0, "kind": kind, "eligible": False}
        cfg = await get_config()
        if not cfg.get("enabled", True):
            return {"amount": 0.0, "pct": 0.0, "kind": kind, "eligible": True}
        pct_map = {
            "ride": cfg.get("ride_discount_pct", 0.0),
            "advance": cfg.get("advance_discount_pct", 0.0),
            "campus": cfg.get("campus_discount_pct", 0.0),
        }
        pct = float(pct_map.get(kind, cfg.get("ride_discount_pct", 0.0)) or 0.0)
        # Pass Campus: an active subscription grants a permanent (usually higher) discount.
        try:
            sub = await db.campus_subscriptions.find_one(
                {"user_id": user_id, "status": "active",
                 "expires_at": {"$gt": datetime.now(timezone.utc).isoformat()}},
                {"_id": 0, "discount_pct": 1})
            if sub and float(sub.get("discount_pct", 0) or 0) > pct:
                pct = float(sub["discount_pct"])
        except Exception:
            pass
        raw = round(float(fare) * pct / 100.0, 2)
        if raw <= 0:
            return {"amount": 0.0, "pct": pct, "kind": kind, "eligible": True}
        used_today, used_month = await _usage_totals(user_id)
        daily_cap = float(cfg.get("daily_cap", 0) or 0)
        monthly_cap = float(cfg.get("monthly_cap", 0) or 0)
        allowed = raw
        if daily_cap > 0:
            allowed = min(allowed, max(0.0, daily_cap - used_today))
        if monthly_cap > 0:
            allowed = min(allowed, max(0.0, monthly_cap - used_month))
        allowed = round(max(0.0, allowed), 2)
        return {"amount": allowed, "pct": pct, "kind": kind, "eligible": True}
    except Exception:
        return {"amount": 0.0, "pct": 0.0, "kind": kind, "eligible": False}


async def record_student_discount_usage(user_id: str, amount: float, kind: str, ride_id: str = None):
    """Persist a granted student discount for cap tracking. NEVER raises."""
    try:
        if not amount or amount <= 0:
            return
        now = datetime.now(timezone.utc)
        await db.student_discount_usage.insert_one({
            "id": f"sdu_{uuid.uuid4().hex[:10]}",
            "user_id": user_id, "amount": round(float(amount), 2), "kind": kind,
            "ride_id": ride_id, "date": now.strftime("%Y-%m-%d"),
            "month": now.strftime("%Y-%m"), "created_at": now.isoformat(),
        })
    except Exception:
        pass


# ======================= STUDENT ENDPOINTS =======================
@router.get("/config")
async def public_config(request: Request):
    await get_current_user(request)
    cfg = await get_config()
    return {
        "enabled": cfg.get("enabled", True),
        "ride_discount_pct": cfg.get("ride_discount_pct", 0.0),
        "advance_discount_pct": cfg.get("advance_discount_pct", 0.0),
        "campus_discount_pct": cfg.get("campus_discount_pct", 0.0),
        "daily_cap": cfg.get("daily_cap", 0.0),
        "monthly_cap": cfg.get("monthly_cap", 0.0),
        "currency": cfg.get("currency", "EUR"),
    }


@router.get("/me")
async def my_student(request: Request):
    user = await get_current_user(request)
    profile = await get_or_create_profile(user["id"])
    cfg = await get_config()
    used_today, used_month = await _usage_totals(user["id"])
    return {
        "status": profile.get("status", "none"),
        "is_student": _is_verified(profile),
        "badge": _is_verified(profile),
        "email_status": profile.get("email_status", "none"),
        "university_email": profile.get("university_email"),
        "university": profile.get("university"),
        "country": profile.get("country"),
        "documents": profile.get("documents", []),
        "verified_at": profile.get("verified_at"),
        "config": {
            "enabled": cfg.get("enabled", True),
            "ride_discount_pct": cfg.get("ride_discount_pct", 0.0),
            "advance_discount_pct": cfg.get("advance_discount_pct", 0.0),
            "campus_discount_pct": cfg.get("campus_discount_pct", 0.0),
            "daily_cap": cfg.get("daily_cap", 0.0),
            "monthly_cap": cfg.get("monthly_cap", 0.0),
            "currency": cfg.get("currency", "EUR"),
        },
        "usage": {"today": used_today, "month": used_month},
    }


async def _match_domain(email: str):
    """Return the enabled domain doc matching the email, or None."""
    email = (email or "").strip().lower()
    if "@" not in email:
        return None
    domain = email.split("@", 1)[1]
    # exact or sub-domain match (e.g. etu.univ-x.fr matches univ-x.fr)
    doms = await db.student_email_domains.find({"enabled": True}, {"_id": 0}).to_list(1000)
    for d in doms:
        dd = (d.get("domain") or "").lower()
        if dd and (domain == dd or domain.endswith("." + dd)):
            return d
    return None


@router.get("/domains/check")
async def check_domain(request: Request, email: str = Query(...)):
    await get_current_user(request)
    d = await _match_domain(email)
    return {"accepted": bool(d), "domain": d.get("domain") if d else None,
            "country": d.get("country") if d else None, "university": d.get("label") if d else None}


class EmailRequestBody(BaseModel):
    email: str


@router.post("/verify/email/request")
async def request_email_otp(body: EmailRequestBody, request: Request):
    user = await get_current_user(request)
    email = (body.email or "").strip().lower()
    d = await _match_domain(email)
    if not d:
        raise HTTPException(status_code=400, detail="Domaine email universitaire non reconnu. Contactez le support si votre établissement n'est pas listé.")
    # cooldown
    existing = await db.student_email_codes.find_one({"user_id": user["id"]})
    if existing:
        try:
            created = datetime.fromisoformat(existing["created_at"])
            if (datetime.now(timezone.utc) - created).total_seconds() < OTP_COOLDOWN_SEC:
                raise HTTPException(status_code=429, detail="Veuillez patienter avant de renvoyer un code.")
        except HTTPException:
            raise
        except Exception:
            pass
    code = f"{secrets.randbelow(900000) + 100000}"
    now = datetime.now(timezone.utc)
    await db.student_email_codes.delete_many({"user_id": user["id"]})
    await db.student_email_codes.insert_one({
        "user_id": user["id"], "university_email": email, "code_hash": _hash(code),
        "domain": d.get("domain"), "country": d.get("country"), "university": d.get("label"),
        "attempts": 0, "created_at": now.isoformat(),
        "expires_at": (now + timedelta(minutes=OTP_TTL_MIN)).isoformat(),
    })
    # Send the code by email (reuse the verified Resend verification template).
    try:
        from core.email import fire, send_verification_email
        link = f"{os.environ.get('FRONTEND_URL', '').rstrip('/')}/sb-student"
        fire(send_verification_email(email, user.get("name", ""), code, link))
    except Exception:
        pass
    masked = email[0] + "***@" + email.split("@", 1)[1] if "@" in email else email
    return {"ok": True, "masked_email": masked, "expires_in": OTP_TTL_MIN * 60}


class EmailConfirmBody(BaseModel):
    email: str
    code: str


@router.post("/verify/email/confirm")
async def confirm_email_otp(body: EmailConfirmBody, request: Request):
    user = await get_current_user(request)
    doc = await db.student_email_codes.find_one({"user_id": user["id"]})
    if not doc:
        raise HTTPException(status_code=400, detail="Aucun code en attente. Demandez un nouveau code.")
    if datetime.fromisoformat(doc["expires_at"]) < datetime.now(timezone.utc):
        await db.student_email_codes.delete_one({"_id": doc["_id"]})
        raise HTTPException(status_code=400, detail="Code expiré. Demandez un nouveau code.")
    if doc.get("attempts", 0) >= MAX_OTP_ATTEMPTS:
        await db.student_email_codes.delete_one({"_id": doc["_id"]})
        raise HTTPException(status_code=429, detail="Trop de tentatives. Demandez un nouveau code.")
    if _hash((body.code or "").strip()) != doc["code_hash"]:
        await db.student_email_codes.update_one({"_id": doc["_id"]}, {"$inc": {"attempts": 1}})
        raise HTTPException(status_code=400, detail="Code invalide.")
    await db.student_email_codes.delete_many({"user_id": user["id"]})
    await get_or_create_profile(user["id"])
    await db.student_profiles.update_one(
        {"user_id": user["id"]},
        {"$set": {
            "status": "verified", "email_status": "verified",
            "university_email": doc.get("university_email"), "university": doc.get("university"),
            "country": doc.get("country"), "method": "email",
            "verified_at": _now(), "updated_at": _now(),
        }},
    )
    return {"ok": True, "status": "verified", "badge": True}


@router.post("/documents")
async def upload_student_document(request: Request, file: UploadFile = File(...), doc_type: str = Query("student_card")):
    user = await get_current_user(request)
    await get_or_create_profile(user["id"])
    ext = file.filename.split(".")[-1] if file.filename and "." in file.filename else "bin"
    path = f"{APP_NAME}/students/{user['id']}/{doc_type}_{uuid.uuid4().hex[:8]}.{ext}"
    data = await file.read()
    result = put_object(path, data, file.content_type or "application/octet-stream")
    doc_record = {
        "type": doc_type, "path": result["path"], "filename": file.filename,
        "status": "pending", "uploaded_at": _now(), "reason": None, "reviewed_at": None,
    }
    await db.student_profiles.update_one(
        {"user_id": user["id"]},
        {"$push": {"documents": doc_record},
         "$set": {"status": "pending", "method": "document", "updated_at": _now()}},
    )
    return {"ok": True, "path": result["path"], "status": "pending"}


@router.get("/discount/quote")
async def discount_quote(request: Request, amount: float = Query(...), kind: str = Query("ride")):
    user = await get_current_user(request)
    return await compute_student_discount(user["id"], amount, kind)


# ======================= ADMIN ENDPOINTS =======================
async def _require_admin(request: Request):
    user = await get_current_user(request)
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    return user


@router.get("/admin/config")
async def admin_get_config(request: Request):
    await _require_admin(request)
    return await get_config()


class ConfigUpdate(BaseModel):
    enabled: bool | None = None
    ride_discount_pct: float | None = None
    advance_discount_pct: float | None = None
    campus_discount_pct: float | None = None
    daily_cap: float | None = None
    monthly_cap: float | None = None
    currency: str | None = None


@router.put("/admin/config")
async def admin_update_config(body: ConfigUpdate, request: Request):
    await _require_admin(request)
    await ensure_seeded()
    update = {k: v for k, v in body.dict().items() if v is not None}
    for pk in ("ride_discount_pct", "advance_discount_pct", "campus_discount_pct"):
        if pk in update:
            update[pk] = max(0.0, min(float(update[pk]), 90.0))
    for ck in ("daily_cap", "monthly_cap"):
        if ck in update:
            update[ck] = max(0.0, float(update[ck]))
    update["updated_at"] = _now()
    await db.student_config.update_one({"id": CONFIG_ID}, {"$set": update}, upsert=True)
    return await get_config()


@router.get("/admin/domains")
async def admin_list_domains(request: Request):
    await _require_admin(request)
    await ensure_seeded()
    doms = await db.student_email_domains.find({}, {"_id": 0}).sort([("country", 1), ("domain", 1)]).to_list(2000)
    return {"domains": doms}


class DomainUpsert(BaseModel):
    domain: str
    label: str | None = ""
    country: str | None = ""
    enabled: bool = True


@router.post("/admin/domains")
async def admin_create_domain(body: DomainUpsert, request: Request):
    await _require_admin(request)
    domain = (body.domain or "").strip().lower().lstrip("@")
    if not domain or "." not in domain:
        raise HTTPException(status_code=400, detail="Domaine invalide (ex. univ-antilles.fr)")
    if await db.student_email_domains.find_one({"domain": domain}):
        raise HTTPException(status_code=409, detail="Ce domaine existe déjà")
    doc = {
        "id": f"dom_{uuid.uuid4().hex[:8]}", "domain": domain,
        "label": (body.label or "").strip(), "country": (body.country or "").strip().upper(),
        "enabled": bool(body.enabled), "created_at": _now(),
    }
    await db.student_email_domains.insert_one(doc)
    doc.pop("_id", None)
    return {"domain": doc}


class DomainPatch(BaseModel):
    label: str | None = None
    country: str | None = None
    enabled: bool | None = None


@router.put("/admin/domains/{domain_id}")
async def admin_update_domain(domain_id: str, body: DomainPatch, request: Request):
    await _require_admin(request)
    patch = {k: v for k, v in body.dict().items() if v is not None}
    if "country" in patch:
        patch["country"] = patch["country"].strip().upper()
    if not patch:
        raise HTTPException(status_code=400, detail="Rien à mettre à jour")
    res = await db.student_email_domains.update_one({"id": domain_id}, {"$set": patch})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Domaine introuvable")
    d = await db.student_email_domains.find_one({"id": domain_id}, {"_id": 0})
    return {"domain": d}


@router.delete("/admin/domains/{domain_id}")
async def admin_delete_domain(domain_id: str, request: Request):
    await _require_admin(request)
    res = await db.student_email_domains.delete_one({"id": domain_id})
    return {"deleted": res.deleted_count}


@router.get("/admin/list")
async def admin_list_students(request: Request, status: str = ""):
    await _require_admin(request)
    q = {}
    if status:
        q["status"] = status
    profiles = await db.student_profiles.find(q, {"_id": 0}).sort("updated_at", -1).limit(500).to_list(500)
    # Enrich with user identity
    ids = [p["user_id"] for p in profiles]
    users = {u["id"]: u for u in await db.users.find({"id": {"$in": ids}}, {"_id": 0, "id": 1, "name": 1, "email": 1, "phone": 1}).to_list(500)}
    for p in profiles:
        u = users.get(p["user_id"], {})
        p["user_name"] = u.get("name")
        p["user_email"] = u.get("email")
        p["user_phone"] = u.get("phone")
    return {"students": profiles}


class ReviewBody(BaseModel):
    reason: str | None = ""


@router.post("/admin/{user_id}/approve")
async def admin_approve_student(user_id: str, request: Request):
    await _require_admin(request)
    p = await db.student_profiles.find_one({"user_id": user_id})
    if not p:
        raise HTTPException(status_code=404, detail="Profil étudiant introuvable")
    docs = p.get("documents") or []
    for dcm in docs:
        if dcm.get("status") == "pending":
            dcm["status"] = "approved"
            dcm["reviewed_at"] = _now()
    await db.student_profiles.update_one(
        {"user_id": user_id},
        {"$set": {"status": "verified", "documents": docs, "verified_at": _now(), "updated_at": _now()}},
    )
    try:
        from core.notifications import create_notification
        await create_notification(user_id, "student", "Statut étudiant validé 🎓",
                                  "Votre statut étudiant est confirmé. Profitez des offres SB Student !",
                                  data={"status": "verified"})
    except Exception:
        pass
    return {"ok": True, "status": "verified"}


@router.post("/admin/{user_id}/reject")
async def admin_reject_student(user_id: str, body: ReviewBody, request: Request):
    await _require_admin(request)
    p = await db.student_profiles.find_one({"user_id": user_id})
    if not p:
        raise HTTPException(status_code=404, detail="Profil étudiant introuvable")
    reason = (body.reason or "").strip()
    docs = p.get("documents") or []
    for dcm in docs:
        if dcm.get("status") == "pending":
            dcm["status"] = "rejected"
            dcm["reason"] = reason
            dcm["reviewed_at"] = _now()
    await db.student_profiles.update_one(
        {"user_id": user_id},
        {"$set": {"status": "rejected", "documents": docs, "updated_at": _now()}},
    )
    try:
        from core.notifications import create_notification
        await create_notification(user_id, "student", "Statut étudiant refusé",
                                  f"Votre demande de statut étudiant a été refusée." + (f" Motif : {reason}" if reason else ""),
                                  data={"status": "rejected"})
    except Exception:
        pass
    return {"ok": True, "status": "rejected"}


@router.get("/admin/stats")
async def admin_stats(request: Request):
    await _require_admin(request)
    await ensure_seeded()
    verified = await db.student_profiles.count_documents({"status": "verified"})
    pending = await db.student_profiles.count_documents({"status": "pending"})
    rejected = await db.student_profiles.count_documents({"status": "rejected"})
    enrolled = await db.student_profiles.count_documents({})
    month = datetime.now(timezone.utc).strftime("%Y-%m")
    usage_rows = await db.student_discount_usage.find({"month": month}, {"_id": 0, "amount": 1}).to_list(20000)
    discount_month = round(sum(float(r.get("amount", 0) or 0) for r in usage_rows), 2)
    discount_total_rows = await db.student_discount_usage.find({}, {"_id": 0, "amount": 1}).to_list(50000)
    discount_total = round(sum(float(r.get("amount", 0) or 0) for r in discount_total_rows), 2)
    # campus/student rides = rides that carried a student discount
    student_rides = await db.rides.count_documents({"student_discount_amount": {"$gt": 0}})
    retention = round((verified / enrolled * 100.0), 1) if enrolled else 0.0
    return {
        "enrolled": enrolled, "verified": verified, "pending": pending, "rejected": rejected,
        "student_rides": student_rides, "discount_used_month": discount_month,
        "discount_used_total": discount_total, "verification_rate": retention,
        "active_domains": await db.student_email_domains.count_documents({"enabled": True}),
    }
