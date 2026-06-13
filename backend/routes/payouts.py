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
from fastapi.responses import Response
import csv
import io
from datetime import datetime, timezone
import uuid
import os

from core.config import db
from core.deps import get_current_user, require_role
from core.notifications import create_notification
from core.wallet_reserve import get_user_region
from core.face_match import verify_face_match
from core.mobile_money import (
    execute_payout, check_payout_status, get_payout_config, effective_mode,
    PayoutError, eur_to_xof, verify_recipient, preflight_verify,
)

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


async def _fire_withdrawal_paid_email(req: dict) -> None:
    """Send the 'payout completed' email once a withdrawal reaches the paid state."""
    try:
        owner = await db.users.find_one({"id": req["user_id"]}, {"_id": 0, "email": 1, "name": 1})
        if owner and owner.get("email"):
            from core.email import fire, send_withdrawal_update
            frontend = os.environ.get("FRONTEND_URL", "").rstrip("/")
            net = req.get("net_amount", req.get("final_amount", req.get("amount")))
            fire(send_withdrawal_update(
                owner["email"], owner.get("name", ""), status="paid", amount=net,
                ref=req.get("id", ""), wallet_url=f"{frontend}/wallet",
                method=(req.get("payout_type") or req.get("payout_provider") or "").upper(),
            ))
    except Exception:
        pass


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
    fee = round(float(req.get("fee", 0) or 0), 2)
    net_final = round(max(0.0, final - fee), 2)
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
        {"$set": {"status": "approved", "final_amount": final, "net_amount": net_final,
                  "adjusted": diff > 0, "reviewed_by": admin.get("email", "admin"), "reviewed_at": now,
                  "admin_note": (body.get("note") or "").strip()[:240]}},
    )
    await create_notification(
        req["user_id"], "withdraw_approved", "Retrait approuvé ✓",
        f"Votre retrait de {net_final:.2f} €"
        + (f" (frais express {fee:.2f} €)" if fee > 0 else "")
        + (f" — ajusté depuis {requested:.2f} €" if diff > 0 else "")
        + " a été approuvé. Versement en cours.",
        data={"url": "/wallet", "amount": net_final},
    )
    # Withdrawal receipt email (non-blocking).
    try:
        owner = await db.users.find_one({"id": req["user_id"]}, {"_id": 0, "email": 1, "name": 1})
        if owner and owner.get("email"):
            wbal = await db.wallets.find_one({"user_id": req["user_id"]}, {"_id": 0, "balance": 1})
            from core.billing import next_number
            from core.email import fire, send_wallet_receipt
            ref = await next_number("SB-W")
            frontend = os.environ.get("FRONTEND_URL", "").rstrip("/")
            fire(send_wallet_receipt(
                owner["email"], owner.get("name", ""), kind="withdraw", amount=net_final,
                balance_after=round((wbal or {}).get("balance", 0), 2), ref=ref,
                wallet_url=f"{frontend}/wallet", fee=fee, method=(req.get("method_label") or req.get("method") or ""),
            ))
    except Exception:
        pass
    return {"id": req_id, "status": "approved", "final_amount": final, "net_amount": net_final, "refunded": diff}


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
    try:
        owner = await db.users.find_one({"id": req["user_id"]}, {"_id": 0, "email": 1, "name": 1})
        if owner and owner.get("email"):
            from core.email import fire, send_withdrawal_update
            frontend = os.environ.get("FRONTEND_URL", "").rstrip("/")
            fire(send_withdrawal_update(owner["email"], owner.get("name", ""), status="rejected",
                                        amount=amount, ref=req_id, reason=reason, wallet_url=f"{frontend}/wallet"))
    except Exception:
        pass
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
    await _fire_withdrawal_paid_email(req)
    return {"id": req_id, "status": "paid"}


# ═══════════════ Mobile Money real payout (disbursement) ═══════════════

@router.post("/admin/withdrawals/{req_id}/verify-recipient")
async def admin_verify_recipient(req_id: str, request: Request):
    """Pre-flight check of the Mobile Money beneficiary before sending real money.
    Non-mutating; uses the live provider API when mode=live (no live_enabled needed)."""
    await require_role(request, ["admin"], permission=_PM_PERM)
    req = await db.admin_withdraw_requests.find_one({"id": req_id}, {"_id": 0})
    if not req:
        raise HTTPException(status_code=404, detail="Demande introuvable")
    method = await db.payout_methods.find_one({"user_id": req["user_id"]}, {"_id": 0})
    if not method or method.get("type") != "mobile_money":
        raise HTTPException(status_code=400, detail="Vérification disponible uniquement pour le Mobile Money")
    cfg = await get_payout_config()
    mode = "live" if cfg.get("mode") == "live" else "sandbox"
    net_eur = req.get("net_amount", req.get("final_amount", req.get("amount")))
    try:
        result = await verify_recipient(
            method.get("provider"), (method.get("mobile_number") or "").strip(),
            method.get("holder_name"), eur_to_xof(net_eur), mode)
    except PayoutError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"id": req_id, "provider": method.get("provider"), "mode": mode, **result}


@router.post("/admin/withdrawals/{req_id}/send")
async def admin_send_payout(req_id: str, request: Request):
    """Trigger the real (or sandbox-simulated) Mobile Money payout for an approved
    withdrawal. RIB / bank transfers keep using the manual mark-paid flow."""
    admin = await require_role(request, ["admin"], permission=_PM_PERM)
    req = await db.admin_withdraw_requests.find_one({"id": req_id}, {"_id": 0})
    if not req:
        raise HTTPException(status_code=404, detail="Demande introuvable")
    if req.get("status") == "paid":
        raise HTTPException(status_code=400, detail="Déjà versé")
    if req.get("status") not in ("approved", "processing"):
        raise HTTPException(status_code=400, detail="La demande doit d'abord être approuvée")
    method = await db.payout_methods.find_one({"user_id": req["user_id"]}, {"_id": 0})
    if not method:
        raise HTTPException(status_code=400, detail="Aucun moyen de retrait enregistré")
    if method.get("type") != "mobile_money":
        raise HTTPException(status_code=400, detail="Versement automatique réservé au Mobile Money (utilisez « Marquer payé » pour un RIB).")

    body = await request.json()
    force = bool(body.get("force"))
    net_eur = req.get("net_amount", req.get("final_amount", req.get("amount")))

    # ── Active safety: auto-verify the beneficiary before sending REAL money ──
    cfg_now = await get_payout_config()
    mode_now = cfg_now.get("mode")
    blocked = await preflight_verify(method, net_eur, mode_now, force)
    if blocked:
        return {"id": req_id, "status": "blocked", "blocked": True, "verification": blocked,
                "message": blocked.get("message")}

    # When the admin forces a live send, capture the verdict being overridden (audit).
    override_verification = None
    if force and mode_now == "live":
        try:
            override_verification = await verify_recipient(
                method.get("provider"), (method.get("mobile_number") or "").strip(),
                method.get("holder_name"), eur_to_xof(net_eur), "live")
        except PayoutError as e:
            override_verification = {"verdict": "warning", "message": f"Vérification impossible : {e}", "details": {}}

    now = _now()
    await db.admin_withdraw_requests.update_one({"id": req_id}, {"$set": {"status": "processing"}})
    try:
        result = await execute_payout(req, method)
    except PayoutError as e:
        await db.admin_withdraw_requests.update_one(
            {"id": req_id}, {"$set": {"status": "approved", "payout_error": str(e), "payout_attempt_at": now}})
        raise HTTPException(status_code=400, detail=str(e))

    new_status = "paid" if result["status"] == "paid" else "processing"
    await db.admin_withdraw_requests.update_one({"id": req_id}, {"$set": {
        "status": new_status, "provider_ref": result["provider_ref"], "payout_provider": result["provider"],
        "payout_mode": result["mode"], "payout_amount_xof": result["amount_xof"],
        "payout_simulated": result.get("simulated", False), "payout_error": None,
        "payout_attempt_at": now, **({"paid_at": now, "paid_by": admin.get("email", "admin")} if new_status == "paid" else {}),
    }})

    # Audit trail for FORCED sends (compliance: who forced, when, despite which verdict).
    if force:
        await db.payout_audit_log.insert_one({
            "id": f"audit_{uuid.uuid4().hex[:12]}",
            "withdrawal_id": req_id,
            "user_id": req["user_id"],
            "beneficiary_name": method.get("holder_name"),
            "admin_id": admin.get("id"),
            "admin_email": admin.get("email", "admin"),
            "provider": result["provider"],
            "mobile_number": method.get("mobile_number"),
            "amount_eur": round(float(net_eur), 2),
            "amount_xof": result["amount_xof"],
            "mode": result["mode"],
            "forced": True,
            "overridden_verdict": (override_verification or {}).get("verdict"),
            "verification_message": (override_verification or {}).get("message"),
            "result_status": new_status,
            "provider_ref": result["provider_ref"],
            "created_at": now,
        })

    if new_status == "paid":
        await create_notification(req["user_id"], "withdraw_paid", "Virement effectué 💸",
                                  f"Votre retrait de {req.get('net_amount', req.get('amount')):.2f} € a été versé ({result['provider'].upper()}).",
                                  data={"url": "/wallet"})
        await _fire_withdrawal_paid_email(req)
    else:
        await create_notification(req["user_id"], "withdraw_processing", "Versement en cours ⏳",
                                  f"Votre retrait de {req.get('net_amount', req.get('amount')):.2f} € est en cours de versement ({result['provider'].upper()}).",
                                  data={"url": "/wallet"})
    return {"id": req_id, "status": new_status, **result}


@router.post("/admin/withdrawals/{req_id}/refresh-status")
async def admin_refresh_payout_status(req_id: str, request: Request):
    """Poll the provider for a processing Mobile Money payout and finalize it."""
    admin = await require_role(request, ["admin"], permission=_PM_PERM)
    req = await db.admin_withdraw_requests.find_one({"id": req_id}, {"_id": 0})
    if not req:
        raise HTTPException(status_code=404, detail="Demande introuvable")
    if req.get("status") != "processing" or not req.get("payout_provider"):
        return {"id": req_id, "status": req.get("status")}
    try:
        status = await check_payout_status(req["payout_provider"], req.get("provider_ref"), req.get("payout_mode", "sandbox"))
    except PayoutError as e:
        raise HTTPException(status_code=400, detail=str(e))
    now = _now()
    if status == "paid":
        await db.admin_withdraw_requests.update_one({"id": req_id}, {"$set": {
            "status": "paid", "paid_at": now, "paid_by": admin.get("email", "admin")}})
        await create_notification(req["user_id"], "withdraw_paid", "Virement effectué 💸",
                                  f"Votre retrait de {req.get('net_amount', req.get('amount')):.2f} € a été versé.",
                                  data={"url": "/wallet"})
        await _fire_withdrawal_paid_email(req)
    elif status == "failed":
        await db.admin_withdraw_requests.update_one({"id": req_id}, {"$set": {
            "status": "approved", "payout_error": "Échec du versement chez l'opérateur"}})
    return {"id": req_id, "status": status}


@router.get("/admin/payout-audit")
async def admin_payout_audit(request: Request):
    """Compliance audit trail of FORCED Mobile Money payouts (who overrode, when,
    despite which verification verdict)."""
    await require_role(request, ["admin"], permission=_PM_PERM)
    items = await db.payout_audit_log.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return {"items": items, "count": len(items)}


def _csv_response(rows: list, columns: list, filename: str) -> Response:
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=columns, extrasaction="ignore")
    writer.writeheader()
    for r in rows:
        writer.writerow({c: r.get(c, "") for c in columns})
    return Response(
        content=buf.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/admin/payout-audit/export")
async def admin_payout_audit_export(request: Request):
    """CSV export of the forced-payout audit trail (accounting / compliance)."""
    await require_role(request, ["admin"], permission=_PM_PERM)
    rows = await db.payout_audit_log.find({}, {"_id": 0}).sort("created_at", -1).to_list(5000)
    cols = ["created_at", "admin_email", "beneficiary_name", "user_id", "provider",
            "mobile_number", "amount_eur", "amount_xof", "mode", "overridden_verdict",
            "verification_message", "result_status", "provider_ref", "withdrawal_id"]
    return _csv_response(rows, cols, "audit_versements_forces.csv")


@router.get("/admin/withdrawals/export")
async def admin_withdrawals_export(request: Request, status: str = None):
    """CSV export of withdrawal requests (optionally filtered by status)."""
    await require_role(request, ["admin"], permission=_PM_PERM)
    query = {} if not status or status == "all" else {"status": status}
    reqs = await db.admin_withdraw_requests.find(query, {"_id": 0}).sort("created_at", -1).to_list(5000)
    # Enrich with beneficiary name + payout method for the export.
    rows = []
    for r in reqs:
        user = await db.users.find_one({"id": r.get("user_id")}, {"_id": 0, "name": 1, "email": 1})
        method = await db.payout_methods.find_one({"user_id": r.get("user_id")}, {"_id": 0, "type": 1, "provider": 1})
        rows.append({
            "created_at": r.get("created_at"),
            "withdrawal_id": r.get("id"),
            "beneficiary": (user or {}).get("name") or (user or {}).get("email"),
            "user_id": r.get("user_id"),
            "amount_eur": r.get("net_amount", r.get("final_amount", r.get("amount"))),
            "status": r.get("status"),
            "method_type": (method or {}).get("type"),
            "provider": r.get("payout_provider") or (method or {}).get("provider"),
            "payout_mode": r.get("payout_mode"),
            "amount_xof": r.get("payout_amount_xof"),
            "provider_ref": r.get("provider_ref"),
            "paid_at": r.get("paid_at"),
            "paid_by": r.get("paid_by"),
        })
    cols = ["created_at", "withdrawal_id", "beneficiary", "user_id", "amount_eur", "status",
            "method_type", "provider", "payout_mode", "amount_xof", "provider_ref", "paid_at", "paid_by"]
    return _csv_response(rows, cols, f"versements_{status or 'tous'}.csv")


@router.get("/admin/payout-config")
async def admin_get_payout_config(request: Request):
    await require_role(request, ["admin"], permission=_PM_PERM)
    cfg = await get_payout_config()
    return {**cfg, "xof_per_eur": 655.957,
            "providers_ready": {
                "wave": bool(os.environ.get("WAVE_API_KEY")),
                "mtn": bool(os.environ.get("MTN_DISBURSEMENT_SUBSCRIPTION_KEY_LIVE")
                            and os.environ.get("MTN_API_USER_LIVE")),
                "orange": bool(os.environ.get("ORANGE_B2C_BASE_LIVE")),
            }}


@router.put("/admin/payout-config")
async def admin_update_payout_config(request: Request):
    await require_role(request, ["admin"], permission=_PM_PERM)
    body = await request.json()
    fields = {}
    if body.get("mode") in ("sandbox", "live"):
        fields["mode"] = body["mode"]
    if "live_enabled" in body:
        fields["live_enabled"] = bool(body["live_enabled"])
    fields["updated_at"] = _now()
    from core.mobile_money import CFG_ID
    await db.payout_provider_config.update_one({"id": CFG_ID}, {"$set": fields}, upsert=True)
    return await get_payout_config()


# ═══════════════════════ Phase C2 — SLA / délais de versement ═══════════════

SLA_CFG_ID = "default"
DEFAULT_SLA = {
    "id": SLA_CFG_ID,
    "europe": {"driver_hours": 24, "merchant_hours": 48},
    "africa": {"driver_hours": 12, "merchant_hours": 24},
    "express": {"enabled": True, "hours": 12, "fee": 1.0},  # express = Europe/DOM-TOM only
}


async def get_sla_config() -> dict:
    cfg = await db.withdrawal_sla_config.find_one({"id": SLA_CFG_ID}, {"_id": 0})
    if not cfg:
        cfg = {**DEFAULT_SLA, "updated_at": _now()}
        await db.withdrawal_sla_config.insert_one(dict(cfg))
    merged = {**DEFAULT_SLA, **cfg}
    for k in ("europe", "africa", "express"):
        merged[k] = {**DEFAULT_SLA[k], **(cfg.get(k) or {})}
    return merged


def standard_hours(cfg: dict, region: str, role: str) -> int:
    zone = cfg.get(region if region in ("europe", "africa") else "europe", {})
    return int(zone.get("merchant_hours" if role == "merchant" else "driver_hours", 24))


async def withdrawal_quote(user: dict, express: bool = False) -> dict:
    """Resolve ETA hours + express fee for a user's withdrawal."""
    cfg = await get_sla_config()
    region = get_user_region(user)
    role = user.get("role")
    ex = cfg.get("express", {})
    express_available = bool(ex.get("enabled")) and region == "europe"
    if express and express_available:
        return {"hours": int(ex.get("hours", 12)), "fee": float(ex.get("fee", 1) or 0),
                "express": True, "express_available": True}
    return {"hours": standard_hours(cfg, region, role), "fee": 0.0, "express": False,
            "express_available": express_available,
            "express_hours": int(ex.get("hours", 12)), "express_fee": float(ex.get("fee", 1) or 0)}


@router.get("/sla")
async def my_sla(request: Request):
    user = await get_current_user(request)
    cfg = await get_sla_config()
    region = get_user_region(user)
    role = user.get("role")
    ex = cfg.get("express", {})
    return {
        "region": region,
        "role": role,
        "standard_hours": standard_hours(cfg, region, role),
        "express_available": bool(ex.get("enabled")) and region == "europe",
        "express_hours": int(ex.get("hours", 12)),
        "express_fee": float(ex.get("fee", 1) or 0),
    }


@router.get("/admin/sla-config")
async def admin_get_sla(request: Request):
    await require_role(request, ["admin"], permission=_PM_PERM)
    return await get_sla_config()


@router.put("/admin/sla-config")
async def admin_update_sla(request: Request):
    await require_role(request, ["admin"], permission=_PM_PERM)
    body = await request.json()
    cfg = await get_sla_config()
    update = {}
    for zone in ("europe", "africa"):
        if isinstance(body.get(zone), dict):
            z = dict(cfg[zone])
            for k in ("driver_hours", "merchant_hours"):
                if body[zone].get(k) is not None:
                    try:
                        z[k] = max(1, int(float(body[zone][k])))
                    except (TypeError, ValueError):
                        pass
            update[zone] = z
    if isinstance(body.get("express"), dict):
        e = dict(cfg["express"])
        if body["express"].get("enabled") is not None:
            e["enabled"] = bool(body["express"]["enabled"])
        for k, cast, lo in (("hours", int, 1), ("fee", float, 0)):
            if body["express"].get(k) is not None:
                try:
                    e[k] = max(lo, cast(float(body["express"][k])))
                except (TypeError, ValueError):
                    pass
        update["express"] = e
    update["updated_at"] = _now()
    await db.withdrawal_sla_config.update_one({"id": SLA_CFG_ID}, {"$set": update}, upsert=True)
    return await get_sla_config()


# ═══════════════════════ Phase C2 — Jumelage de comptes ═════════════════════

def _link_view(link: dict, me: str) -> dict:
    other_is_target = link["requester_id"] == me
    return {
        "id": link["id"],
        "status": link["status"],
        "direction": "outgoing" if link["requester_id"] == me else "incoming",
        "other_name": link["target_name"] if other_is_target else link["requester_name"],
        "other_phone": link["target_phone"] if other_is_target else link["requester_phone"],
        "other_role": link.get("target_role") if other_is_target else link.get("requester_role"),
        "created_at": link.get("created_at"),
    }


@router.get("/links")
async def my_links(request: Request):
    user = await get_current_user(request)
    items = await db.account_links.find(
        {"$or": [{"requester_id": user["id"]}, {"target_id": user["id"]}]}, {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    return {"links": [_link_view(x, user["id"]) for x in items]}


@router.post("/link/request")
async def request_link(request: Request):
    user = await get_current_user(request)
    body = await request.json()
    ident = (body.get("identifier") or "").strip()
    if not ident:
        raise HTTPException(status_code=400, detail="E-mail ou téléphone requis")
    target = await db.users.find_one({"$or": [{"email": ident.lower()}, {"phone": ident}]})
    if not target:
        raise HTTPException(status_code=404, detail="Aucun compte trouvé avec cet identifiant")
    if target["id"] == user["id"]:
        raise HTTPException(status_code=400, detail="Vous ne pouvez pas vous lier à vous-même")
    existing = await db.account_links.find_one({"$or": [
        {"requester_id": user["id"], "target_id": target["id"]},
        {"requester_id": target["id"], "target_id": user["id"]},
    ]})
    if existing:
        raise HTTPException(status_code=400, detail="Une liaison existe déjà ou est en attente")
    doc = {
        "id": f"lnk_{uuid.uuid4().hex[:12]}",
        "requester_id": user["id"], "requester_name": user.get("name"), "requester_phone": user.get("phone"),
        "requester_role": user.get("role"),
        "target_id": target["id"], "target_name": target.get("name"), "target_phone": target.get("phone"),
        "target_role": target.get("role"),
        "status": "pending", "created_at": _now(),
    }
    await db.account_links.insert_one(doc)
    await create_notification(target["id"], "account_link", "Demande de jumelage de compte 🔗",
                              f"{user.get('name', 'Un utilisateur')} souhaite lier votre compte pour faciliter les transferts.",
                              data={"url": "/wallet/linked-accounts"})
    return {"id": doc["id"], "status": "pending"}


@router.post("/link/{link_id}/accept")
async def accept_link(link_id: str, request: Request):
    user = await get_current_user(request)
    link = await db.account_links.find_one({"id": link_id}, {"_id": 0})
    if not link:
        raise HTTPException(status_code=404, detail="Liaison introuvable")
    if link["target_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Seul le destinataire peut confirmer")
    await db.account_links.update_one({"id": link_id}, {"$set": {"status": "accepted", "accepted_at": _now()}})
    await create_notification(link["requester_id"], "account_link", "Jumelage confirmé ✓",
                              f"{user.get('name', 'Le compte')} a confirmé la liaison. Vous pouvez désormais transférer facilement.",
                              data={"url": "/wallet/linked-accounts"})
    return {"id": link_id, "status": "accepted"}


@router.post("/link/{link_id}/remove")
async def remove_link(link_id: str, request: Request):
    user = await get_current_user(request)
    link = await db.account_links.find_one({"id": link_id}, {"_id": 0})
    if not link:
        raise HTTPException(status_code=404, detail="Liaison introuvable")
    if user["id"] not in (link["requester_id"], link["target_id"]):
        raise HTTPException(status_code=403, detail="Accès refusé")
    await db.account_links.delete_one({"id": link_id})
    return {"id": link_id, "status": "removed"}
