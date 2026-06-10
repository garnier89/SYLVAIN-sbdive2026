"""
Payout methods (KYC) + admin withdrawal validation — SB Pay (Phase C1).

Drivers & merchants must register and get an APPROVED payout method before they can
withdraw:
  - Europe / DOM-TOM : RIB (IBAN + BIC, holder = the person or their company)
  - Africa           : Mobile Money (Orange Money, MTN, Wave, SBPAYGO, Moov)
Both require a SELFIE + an ID document. On submission an AI face-match runs
automatically (assists the admin); the admin still approves/rejects manually.

Admin withdrawal flow: review request with the driver/merchant SCORE, optionally
REDUCE the amount (refunds the difference), then approve / reject / mark-paid.
"""
from fastapi import APIRouter, Request, HTTPException
from datetime import datetime, timezone
import uuid

from core.config import db
from core.deps import get_current_user, require_role
from core.notifications import create_notification
from core.wallet_reserve import get_user_region
from core.face_match import verify_face_match

router = APIRouter(prefix="/payouts", tags=["payouts"])

MOBILE_MONEY_PROVIDERS = {"orange", "mtn", "wave", "sbpaygo", "moov"}
_MAX_DATAURL = 11_000_000  # ~8 Mo encoded


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _mask_iban(iban: str) -> str:
    iban = (iban or "").replace(" ", "")
    if len(iban) <= 8:
        return iban
    return f"{iban[:4]}••••{iban[-4:]}"


def _public_method(m: dict) -> dict:
    """Strip heavy images + mask IBAN for the owner's view."""
    if not m:
        return None
    out = {k: v for k, v in m.items() if k not in ("selfie_url", "id_doc_url", "_id")}
    if out.get("iban"):
        out["iban_masked"] = _mask_iban(out["iban"])
        out.pop("iban", None)
    out["has_selfie"] = bool(m.get("selfie_url"))
    out["has_id_doc"] = bool(m.get("id_doc_url"))
    return out


async def account_score(user: dict) -> dict:
    """Driver/merchant reliability snapshot shown to the admin before validating."""
    out = {
        "role": user.get("role"),
        "name": user.get("name"),
        "rating": None,
        "total_trips": 0,
        "acceptance_rate": None,
        "cancellation_rate": None,
        "activity_score": None,
        "open_complaints": 0,
    }
    if user.get("role") == "driver":
        d = await db.drivers.find_one({"user_id": user["id"]}, {"_id": 0}) or {}
        acc = d.get("acceptance_rate", 100)
        can = d.get("cancellation_rate", 0)
        out.update(
            rating=d.get("rating", 5.0),
            total_trips=d.get("total_trips", 0),
            acceptance_rate=acc,
            cancellation_rate=can,
            activity_score=round((acc or 0) * 0.6 + (100 - (can or 0)) * 0.4),
        )
    # Open complaints / disputes (best-effort across known collections)
    complaints = 0
    for coll, q in (
        (db.support_tickets, {"user_id": user["id"], "status": {"$in": ["open", "pending"]}}),
        (db.admin_order_help_requests, {"user_id": user["id"], "status": "pending"}),
    ):
        try:
            complaints += await coll.count_documents(q)
        except Exception:
            pass
    out["open_complaints"] = complaints
    return out


# ───────────────────────────── User: payout method ─────────────────────────

@router.get("/method")
async def my_payout_method(request: Request):
    user = await get_current_user(request)
    region = get_user_region(user)
    allowed = ["rib"] if region == "europe" else ["mobile_money"]
    m = await db.payout_methods.find_one({"user_id": user["id"]})
    return {
        "region": region,
        "allowed_types": allowed,
        "providers": sorted(MOBILE_MONEY_PROVIDERS),
        "method": _public_method(m),
    }


@router.post("/method")
async def submit_payout_method(request: Request):
    user = await get_current_user(request)
    if user.get("role") not in ("driver", "merchant"):
        raise HTTPException(status_code=403, detail="Réservé aux chauffeurs et marchands.")
    body = await request.json()
    region = get_user_region(user)
    ptype = body.get("type")

    if region == "europe" and ptype != "rib":
        raise HTTPException(status_code=400, detail="En Europe / DOM-TOM, un RIB est requis.")
    if region == "africa" and ptype != "mobile_money":
        raise HTTPException(status_code=400, detail="En Afrique, un compte Mobile Money est requis.")

    selfie = body.get("selfie_url")
    id_doc = body.get("id_doc_url")
    if not selfie or not id_doc:
        raise HTTPException(status_code=400, detail="Selfie et pièce d'identité requis.")
    for f in (selfie, id_doc):
        if isinstance(f, str) and len(f) > _MAX_DATAURL:
            raise HTTPException(status_code=413, detail="Fichier trop volumineux (max 8 Mo).")

    holder_name = (body.get("holder_name") or user.get("name") or "").strip()[:120]
    if not holder_name:
        raise HTTPException(status_code=400, detail="Nom du titulaire requis.")

    doc = {
        "user_id": user["id"],
        "user_name": user.get("name"),
        "user_email": user.get("email"),
        "role": user.get("role"),
        "region": region,
        "type": ptype,
        "holder_name": holder_name,
        "selfie_url": selfie,
        "id_doc_url": id_doc,
        "status": "pending",
        "reject_reason": None,
        "submitted_at": _now(),
        "reviewed_at": None,
        "reviewed_by": None,
    }

    if ptype == "rib":
        iban = (body.get("iban") or "").replace(" ", "").upper()
        bic = (body.get("bic") or "").strip().upper()
        if len(iban) < 15:
            raise HTTPException(status_code=400, detail="IBAN invalide.")
        if not bic:
            raise HTTPException(status_code=400, detail="BIC / SWIFT requis.")
        holder_type = body.get("holder_type", "person")
        if holder_type not in ("person", "company"):
            holder_type = "person"
        doc.update(iban=iban, bic=bic, holder_type=holder_type,
                   company_name=(body.get("company_name") or "").strip()[:160])
    else:
        provider = (body.get("provider") or "").strip().lower()
        if provider not in MOBILE_MONEY_PROVIDERS:
            raise HTTPException(status_code=400, detail="Opérateur Mobile Money invalide.")
        number = (body.get("mobile_number") or "").strip()
        if len(number) < 6:
            raise HTTPException(status_code=400, detail="Numéro Mobile Money invalide.")
        doc.update(provider=provider, mobile_number=number)

    # Automatic AI face-match (selfie vs ID) — assists the admin, never blocks.
    doc["ai_face_match"] = await verify_face_match(selfie, id_doc)

    existing = await db.payout_methods.find_one({"user_id": user["id"]}, {"_id": 0, "id": 1})
    if existing:
        doc["id"] = existing["id"]
        await db.payout_methods.update_one({"user_id": user["id"]}, {"$set": doc})
    else:
        doc["id"] = f"pm_{uuid.uuid4().hex[:12]}"
        await db.payout_methods.insert_one(doc)

    # Notify admins to review the new payout method
    await _notify_admins(
        "Nouveau moyen de retrait à vérifier 🪪",
        f"{holder_name} ({user.get('role')}) a soumis un {('RIB' if ptype == 'rib' else 'compte Mobile Money')}. "
        f"Face-match IA : {doc['ai_face_match']['verdict']} ({doc['ai_face_match']['confidence']}%).",
        {"url": "/admin/payouts", "type": "payout_method"},
    )
    return {"id": doc["id"], "status": "pending", "ai_face_match": doc["ai_face_match"]}


# ───────────────────────────── Admin helpers ───────────────────────────────

async def _notify_admins(title: str, body: str, data: dict):
    admins = await db.users.find({"role": "admin"}, {"_id": 0, "id": 1}).to_list(50)
    for a in admins:
        try:
            await create_notification(a["id"], data.get("type", "admin_alert"), title, body, data=data)
        except Exception:
            pass


# ───────────────────────── Admin: payout method review ─────────────────────

_PM_PERM = "billing.withdrawals.approve"


@router.get("/admin/methods")
async def admin_list_methods(request: Request, status: str = ""):
    await require_role(request, ["admin"], permission=_PM_PERM)
    query = {"status": status} if status else {}
    items = await db.payout_methods.find(query, {"_id": 0}).sort("submitted_at", -1).to_list(300)
    for it in items:
        if it.get("iban"):
            it["iban_masked"] = _mask_iban(it["iban"])
    counts = {s: await db.payout_methods.count_documents({"status": s}) for s in ("pending", "approved", "rejected")}
    return {"items": items, "counts": counts}


@router.post("/admin/methods/{method_id}/approve")
async def admin_approve_method(method_id: str, request: Request):
    admin = await require_role(request, ["admin"], permission=_PM_PERM)
    res = await db.payout_methods.update_one(
        {"id": method_id},
        {"$set": {"status": "approved", "reject_reason": None, "reviewed_at": _now(),
                  "reviewed_by": admin.get("email", "admin")}},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Moyen de retrait introuvable")
    m = await db.payout_methods.find_one({"id": method_id}, {"_id": 0, "user_id": 1})
    if m:
        await create_notification(m["user_id"], "payout_method_approved", "Moyen de retrait validé ✓",
                                  "Votre moyen de retrait a été vérifié. Vous pouvez désormais demander un retrait.",
                                  data={"url": "/wallet"})
    return {"id": method_id, "status": "approved"}


@router.post("/admin/methods/{method_id}/reject")
async def admin_reject_method(method_id: str, request: Request):
    admin = await require_role(request, ["admin"], permission=_PM_PERM)
    body = await request.json()
    reason = (body.get("reason") or "Documents non conformes").strip()[:240]
    res = await db.payout_methods.update_one(
        {"id": method_id},
        {"$set": {"status": "rejected", "reject_reason": reason, "reviewed_at": _now(),
                  "reviewed_by": admin.get("email", "admin")}},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Moyen de retrait introuvable")
    m = await db.payout_methods.find_one({"id": method_id}, {"_id": 0, "user_id": 1})
    if m:
        await create_notification(m["user_id"], "payout_method_rejected", "Moyen de retrait refusé",
                                  f"Votre moyen de retrait a été refusé : {reason}. Veuillez le soumettre à nouveau.",
                                  data={"url": "/wallet", "reason": reason})
    return {"id": method_id, "status": "rejected", "reason": reason}


# ───────────────────────── Admin: withdrawal validation ────────────────────

@router.get("/admin/withdrawals")
async def admin_list_withdrawals(request: Request, status: str = "pending"):
    await require_role(request, ["admin"], permission=_PM_PERM)
    query = {"status": status} if status else {}
    items = await db.admin_withdraw_requests.find(query, {"_id": 0}).sort("created_at", -1).to_list(300)
    for it in items:
        u = await db.users.find_one({"id": it["user_id"]}, {"_id": 0}) or {}
        it["score"] = await account_score(u)
        pm = await db.payout_methods.find_one({"user_id": it["user_id"]}, {"_id": 0})
        if pm and pm.get("iban"):
            pm["iban_masked"] = _mask_iban(pm["iban"])
            pm.pop("iban", None)
        it["payout_method"] = _public_method(pm) if pm else None
        it["ai_face_match"] = (pm or {}).get("ai_face_match")
    counts = {s: await db.admin_withdraw_requests.count_documents({"status": s})
              for s in ("pending", "approved", "rejected", "paid")}
    return {"items": items, "counts": counts}


@router.post("/admin/withdrawals/{req_id}/approve")
async def admin_approve_withdrawal(req_id: str, request: Request):
    admin = await require_role(request, ["admin"], permission=_PM_PERM)
    body = await request.json()
    req = await db.admin_withdraw_requests.find_one({"id": req_id}, {"_id": 0})
    if not req:
        raise HTTPException(status_code=404, detail="Demande introuvable")
    if req.get("status") != "pending":
        raise HTTPException(status_code=400, detail="Demande déjà traitée")
    requested = round(float(req.get("amount", 0)), 2)
    final = requested
    if body.get("final_amount") is not None:
        try:
            final = round(float(body["final_amount"]), 2)
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail="Montant invalide")
    if final <= 0 or final > requested:
        raise HTTPException(status_code=400, detail=f"Le montant validé doit être entre 0 et {requested:.2f} €")

    diff = round(requested - final, 2)  # refunded to balance
    now = _now()
    # Resolve the held amount: clear the full requested from pending_withdraw,
    # refund the (requested - final) difference back to the spendable balance.
    await db.wallets.update_one(
        {"user_id": req["user_id"]},
        {"$inc": {"pending_withdraw": -requested, "balance": diff}},
    )
    if diff > 0:
        w = await db.wallets.find_one({"user_id": req["user_id"]}, {"_id": 0})
        await db.wallet_transactions.insert_one({
            "id": f"tx_{uuid.uuid4().hex[:12]}", "user_id": req["user_id"], "type": "Refund",
            "amount": diff, "balance_after": round((w or {}).get("balance", 0), 2),
            "description": f"Ajustement retrait (différence remboursée) — demande {req_id}",
            "status": "completed", "created_at": now,
        })
    await db.admin_withdraw_requests.update_one(
        {"id": req_id},
        {"$set": {"status": "approved", "final_amount": final, "adjusted": diff > 0,
                  "reviewed_by": admin.get("email", "admin"), "reviewed_at": now,
                  "admin_note": (body.get("note") or "").strip()[:240]}},
    )
    await create_notification(
        req["user_id"], "withdraw_approved", "Retrait approuvé ✓",
        f"Votre retrait de {final:.2f} € a été approuvé"
        + (f" (ajusté depuis {requested:.2f} €)" if diff > 0 else "")
        + ". Le virement est en cours de traitement.",
        data={"url": "/wallet", "amount": final},
    )
    return {"id": req_id, "status": "approved", "final_amount": final, "refunded": diff}


@router.post("/admin/withdrawals/{req_id}/reject")
async def admin_reject_withdrawal(req_id: str, request: Request):
    admin = await require_role(request, ["admin"], permission=_PM_PERM)
    body = await request.json()
    reason = (body.get("reason") or "Demande refusée").strip()[:240]
    req = await db.admin_withdraw_requests.find_one({"id": req_id}, {"_id": 0})
    if not req:
        raise HTTPException(status_code=404, detail="Demande introuvable")
    if req.get("status") != "pending":
        raise HTTPException(status_code=400, detail="Demande déjà traitée")
    amount = round(float(req.get("amount", 0)), 2)
    now = _now()
    # Refund the full frozen amount back to the spendable balance.
    await db.wallets.update_one(
        {"user_id": req["user_id"]},
        {"$inc": {"pending_withdraw": -amount, "balance": amount}},
    )
    w = await db.wallets.find_one({"user_id": req["user_id"]}, {"_id": 0})
    await db.wallet_transactions.insert_one({
        "id": f"tx_{uuid.uuid4().hex[:12]}", "user_id": req["user_id"], "type": "Refund",
        "amount": amount, "balance_after": round((w or {}).get("balance", 0), 2),
        "description": f"Retrait refusé — remboursement (demande {req_id})",
        "status": "completed", "created_at": now,
    })
    await db.admin_withdraw_requests.update_one(
        {"id": req_id},
        {"$set": {"status": "rejected", "reject_reason": reason,
                  "reviewed_by": admin.get("email", "admin"), "reviewed_at": now}},
    )
    await create_notification(req["user_id"], "withdraw_rejected", "Retrait refusé",
                              f"Votre retrait a été refusé : {reason}. Le montant a été recrédité sur votre solde.",
                              data={"url": "/wallet", "reason": reason})
    return {"id": req_id, "status": "rejected", "refunded": amount}


@router.post("/admin/withdrawals/{req_id}/mark-paid")
async def admin_mark_paid(req_id: str, request: Request):
    admin = await require_role(request, ["admin"], permission=_PM_PERM)
    req = await db.admin_withdraw_requests.find_one({"id": req_id}, {"_id": 0})
    if not req:
        raise HTTPException(status_code=404, detail="Demande introuvable")
    if req.get("status") not in ("approved", "processing"):
        raise HTTPException(status_code=400, detail="La demande doit d'abord être approuvée")
    await db.admin_withdraw_requests.update_one(
        {"id": req_id},
        {"$set": {"status": "paid", "paid_at": _now(), "paid_by": admin.get("email", "admin")}},
    )
    await create_notification(req["user_id"], "withdraw_paid", "Virement effectué 💸",
                              f"Votre retrait de {req.get('final_amount', req.get('amount')):.2f} € a été versé.",
                              data={"url": "/wallet"})
    return {"id": req_id, "status": "paid"}
