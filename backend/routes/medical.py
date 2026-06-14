"""SB Santé — ordonnances électroniques (Phase 3b).

Un praticien APPROUVÉ (profil pro_providers vertical='medical', validé KYC par
l'admin via le moteur générique pro_services) peut émettre une ordonnance pour un
patient (par email). Le patient retrouve ses ordonnances dans son dossier, peut
les télécharger en PDF et lancer une commande en pharmacie (note pré-remplie).

Collections :
  - prescriptions : { id, patient_id, patient_name, practitioner_user_id,
      practitioner_name, specialty, diagnosis, medications[], notes,
      valid_until, video_session_id?, status, created_at }
"""
from fastapi import APIRouter, Request, HTTPException, Response
import uuid
from datetime import datetime, timezone

from core.config import db
from core.deps import get_current_user
from core.notifications import create_notification
from core.prescription_pdf import prescription_pdf

router = APIRouter(prefix="/medical", tags=["medical"])


def _now():
    return datetime.now(timezone.utc).isoformat()


async def _practitioner(user_id: str):
    """Return the approved medical practitioner profile for user_id, or None."""
    return await db.pro_providers.find_one(
        {"vertical": "medical", "user_id": user_id, "verification_status": "approved"}, {"_id": 0})


def _spec_label(cat_id: str) -> str:
    from routes.pro_services import MEDICAL
    for c in MEDICAL["categories"]:
        if c["id"] == cat_id:
            return c["label"]
    return cat_id or "Praticien"


def _pub(d: dict) -> dict:
    out = dict(d or {})
    out.pop("_id", None)
    return out


@router.get("/practitioner/status")
async def practitioner_status(request: Request):
    user = await get_current_user(request)
    p = await db.pro_providers.find_one({"vertical": "medical", "user_id": user["id"]}, {"_id": 0})
    return {"registered": bool(p), "approved": bool(p and p.get("verification_status") == "approved"),
            "verification_status": (p or {}).get("verification_status"),
            "name": (p or {}).get("name"), "categories": (p or {}).get("categories", [])}


@router.post("/prescriptions")
async def issue_prescription(request: Request):
    user = await get_current_user(request)
    prac = await _practitioner(user["id"])
    if not prac:
        raise HTTPException(status_code=403, detail="Compte praticien non validé. Inscrivez-vous et faites valider votre profil.")
    body = await request.json()

    email = (body.get("patient_email") or "").strip().lower()
    if not email:
        raise HTTPException(status_code=400, detail="Email du patient requis")
    patient = await db.users.find_one({"email": email}, {"_id": 0, "id": 1, "name": 1})
    if not patient:
        raise HTTPException(status_code=404, detail="Aucun patient trouvé avec cet email")

    meds = [m for m in (body.get("medications") or []) if (m.get("name") or "").strip()]
    if not meds:
        raise HTTPException(status_code=400, detail="Ajoutez au moins un médicament")
    medications = [{"name": (m.get("name") or "").strip(), "dosage": (m.get("dosage") or "").strip(),
                    "duration": (m.get("duration") or "").strip()} for m in meds]

    cats = prac.get("categories", [])
    specialty = _spec_label(cats[0]) if cats else "Praticien"
    rx = {
        "id": f"rx_{uuid.uuid4().hex[:12]}",
        "patient_id": patient["id"], "patient_name": patient.get("name", ""),
        "practitioner_user_id": user["id"], "practitioner_name": prac.get("name") or user.get("name", ""),
        "specialty": specialty, "diagnosis": (body.get("diagnosis") or "").strip(),
        "medications": medications, "notes": (body.get("notes") or "").strip(),
        "valid_until": body.get("valid_until"), "video_session_id": body.get("video_session_id"),
        "status": "active", "created_at": _now(),
    }
    await db.prescriptions.insert_one(dict(rx))
    try:
        await create_notification(patient["id"], "prescription_new", "📋 Nouvelle ordonnance",
                                  f"{rx['practitioner_name']} vous a délivré une ordonnance.",
                                  {"prescription_id": rx["id"], "url": "/mes-ordonnances"})
    except Exception:
        pass
    return _pub(rx)


@router.get("/prescriptions")
async def my_prescriptions(request: Request):
    """Prescriptions issued TO the current user (patient)."""
    user = await get_current_user(request)
    docs = await db.prescriptions.find({"patient_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return docs


@router.get("/prescriptions/issued")
async def issued_prescriptions(request: Request):
    """Prescriptions issued BY the current user (practitioner)."""
    user = await get_current_user(request)
    docs = await db.prescriptions.find({"practitioner_user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return docs


@router.get("/prescriptions/{rx_id}")
async def get_prescription(rx_id: str, request: Request):
    user = await get_current_user(request)
    rx = await db.prescriptions.find_one({"id": rx_id}, {"_id": 0})
    if not rx or user["id"] not in (rx.get("patient_id"), rx.get("practitioner_user_id")):
        raise HTTPException(status_code=404, detail="Ordonnance introuvable")
    return rx


@router.get("/prescriptions/{rx_id}/pdf")
async def prescription_download(rx_id: str, request: Request):
    user = await get_current_user(request)
    rx = await db.prescriptions.find_one({"id": rx_id}, {"_id": 0})
    if not rx or user["id"] not in (rx.get("patient_id"), rx.get("practitioner_user_id")):
        raise HTTPException(status_code=404, detail="Ordonnance introuvable")
    pdf = prescription_pdf(rx)
    return Response(content=pdf, media_type="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="ordonnance-{rx_id[-8:]}.pdf"'})
