"""
KYC — Identity verification before selling on the Marketplace (Phase B).

A client (or driver) must upload a national ID (CNI) + proof of residence,
which the admin validates from the dashboard. Once approved the user can post
articles / offer services on the Marketplace.

Selling rules:
  - Client: may sell only when their KYC is approved.
  - Driver: may sell only when KYC approved AND the driver account is active now
    OR was active before (a previously-validated driver whose account is later
    blocked keeps the right to sell).

Documents are stored as base64 data-URLs (same pattern as driver_gallery) — no
object storage needed. One submission per user (upsert).
"""
from fastapi import APIRouter, Request, HTTPException
from datetime import datetime, timezone
import uuid

from core.config import db
from core.deps import get_current_user, require_role

router = APIRouter(prefix="/kyc", tags=["kyc"])

_MAX_DATAURL = 11_000_000  # ~8 Mo encoded


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


async def can_user_sell(user: dict) -> dict:
    """Return {can_sell, reason, kyc_status, role} for the given user."""
    kyc = await db.kyc_documents.find_one({"user_id": user["id"]}, {"_id": 0})
    status = (kyc or {}).get("status", "none")
    role = user.get("role", "user")
    if status != "approved":
        reason = {
            "none": "Vérifiez votre identité (CNI + justificatif de domicile) pour vendre.",
            "pending": "Vos documents sont en cours de vérification par l'administrateur.",
            "rejected": "Vos documents ont été refusés. Veuillez les soumettre à nouveau.",
        }.get(status, "Vérification d'identité requise.")
        return {"can_sell": False, "reason": reason, "kyc_status": status, "role": role}

    if role == "driver":
        driver = await db.drivers.find_one({"user_id": user["id"]}, {"_id": 0, "status": 1, "was_approved": 1})
        active_now = (driver or {}).get("status") == "approved"
        ever = active_now or bool((driver or {}).get("was_approved"))
        # A driver who is active now is, from now on, "ever active".
        if active_now and not (driver or {}).get("was_approved"):
            await db.drivers.update_one({"user_id": user["id"]}, {"$set": {"was_approved": True}})
        if not ever:
            return {"can_sell": False,
                    "reason": "Votre compte chauffeur doit être actif au moins une fois pour vendre.",
                    "kyc_status": status, "role": role}
    return {"can_sell": True, "reason": None, "kyc_status": status, "role": role}


@router.get("/me")
async def my_kyc(request: Request):
    user = await get_current_user(request)
    kyc = await db.kyc_documents.find_one({"user_id": user["id"]}, {"_id": 0})
    gate = await can_user_sell(user)
    return {
        "status": (kyc or {}).get("status", "none"),
        "reject_reason": (kyc or {}).get("reject_reason"),
        "submitted_at": (kyc or {}).get("submitted_at"),
        "reviewed_at": (kyc or {}).get("reviewed_at"),
        "has_cni": bool((kyc or {}).get("cni_url")),
        "has_proof": bool((kyc or {}).get("proof_url")),
        **gate,
    }


@router.post("/submit")
async def submit_kyc(request: Request):
    user = await get_current_user(request)
    body = await request.json()
    cni = body.get("cni_url")
    proof = body.get("proof_url")
    if not cni or not proof:
        raise HTTPException(status_code=400, detail="CNI et justificatif de domicile requis")
    for f in (cni, proof):
        if isinstance(f, str) and len(f) > _MAX_DATAURL:
            raise HTTPException(status_code=413, detail="Fichier trop volumineux (max 8 Mo)")
    existing = await db.kyc_documents.find_one({"user_id": user["id"]}, {"_id": 0, "id": 1})
    doc = {
        "user_id": user["id"],
        "user_name": user.get("name", ""),
        "user_email": user.get("email", ""),
        "role": user.get("role", "user"),
        "cni_url": cni,
        "proof_url": proof,
        "full_name": (body.get("full_name") or user.get("name") or "").strip()[:120],
        "address": (body.get("address") or "").strip()[:240],
        "status": "pending",
        "reject_reason": None,
        "submitted_at": _now(),
        "reviewed_at": None,
        "reviewed_by": None,
    }
    if existing:
        await db.kyc_documents.update_one({"user_id": user["id"]}, {"$set": doc})
        kid = existing["id"]
    else:
        doc["id"] = f"kyc_{uuid.uuid4().hex[:12]}"
        await db.kyc_documents.insert_one(doc)
        kid = doc["id"]
    return {"id": kid, "status": "pending", "message": "Documents soumis pour vérification"}


# ===== Admin =====

_KYC_PERM = "users.documents.verify"


@router.get("/admin/list")
async def admin_list_kyc(request: Request, status: str = ""):
    await require_role(request, ["admin"], permission=_KYC_PERM)
    query = {"status": status} if status else {}
    items = await db.kyc_documents.find(query, {"_id": 0}).sort("submitted_at", -1).to_list(500)
    counts = {
        "pending": await db.kyc_documents.count_documents({"status": "pending"}),
        "approved": await db.kyc_documents.count_documents({"status": "approved"}),
        "rejected": await db.kyc_documents.count_documents({"status": "rejected"}),
    }
    return {"items": items, "counts": counts}


@router.post("/admin/{kyc_id}/approve")
async def admin_approve_kyc(kyc_id: str, request: Request):
    admin = await require_role(request, ["admin"], permission=_KYC_PERM)
    res = await db.kyc_documents.update_one(
        {"id": kyc_id},
        {"$set": {"status": "approved", "reject_reason": None,
                  "reviewed_at": _now(), "reviewed_by": admin.get("email", "admin")}},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Dossier introuvable")
    return {"id": kyc_id, "status": "approved"}


@router.post("/admin/{kyc_id}/reject")
async def admin_reject_kyc(kyc_id: str, request: Request):
    admin = await require_role(request, ["admin"], permission=_KYC_PERM)
    body = await request.json()
    reason = (body.get("reason") or "Documents non conformes").strip()[:240]
    res = await db.kyc_documents.update_one(
        {"id": kyc_id},
        {"$set": {"status": "rejected", "reject_reason": reason,
                  "reviewed_at": _now(), "reviewed_by": admin.get("email", "admin")}},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Dossier introuvable")
    return {"id": kyc_id, "status": "rejected", "reason": reason}
