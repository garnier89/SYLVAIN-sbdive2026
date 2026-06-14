"""SB Labo — réservation d'analyses & résultats en ligne (Phase 3c).

Le patient réserve une ou plusieurs analyses (prélèvement à domicile ou au labo),
paie (SB Pay débité OU espèces sur place). Un laboratoire APPROUVÉ (profil
pro_providers vertical='lab', validé KYC par l'admin via pro_services) accepte la
commande, saisit les résultats → le patient reçoit un compte rendu PDF en ligne.

Cycle : pending → confirmed → results_ready. (annulable avant results_ready)
Collection : lab_orders.
"""
from fastapi import APIRouter, Request, HTTPException, Response
import uuid
from datetime import datetime, timezone

from core.config import db
from core.deps import get_current_user
from core.notifications import create_notification
from core.lab_results_pdf import lab_results_pdf
from routes.pro_services import VERTICALS, _commission_pct

router = APIRouter(prefix="/lab", tags=["lab"])

VERTICAL = "lab"


def _now():
    return datetime.now(timezone.utc).isoformat()


def _cfg():
    return VERTICALS[VERTICAL]


def _analyses_by_ids(ids):
    by_id = {a["id"]: a for a in _cfg()["services"]}
    return [by_id[i] for i in ids if i in by_id]


async def _approved_lab(user_id: str):
    return await db.pro_providers.find_one(
        {"vertical": VERTICAL, "user_id": user_id, "verification_status": "approved"}, {"_id": 0})


def _pub(d):
    out = dict(d or {})
    out.pop("_id", None)
    return out


# ── Catalogue ────────────────────────────────────────────────────────────────
@router.get("/catalog")
async def catalog():
    cfg = _cfg()
    return {"label": cfg["label"], "accent": cfg["accent"], "home_surcharge": cfg["home_surcharge"],
            "categories": cfg["categories"], "analyses": cfg["services"], "payment_methods": ["sbpay", "cash"]}


# ── Commandes (patient) ──────────────────────────────────────────────────────
@router.post("/orders")
async def create_order(request: Request):
    cfg = _cfg()
    user = await get_current_user(request)
    body = await request.json()
    analyses = _analyses_by_ids(body.get("analysis_ids") or [])
    if not analyses:
        raise HTTPException(status_code=400, detail="Sélectionnez au moins une analyse")
    if not (body.get("scheduled_date") and body.get("scheduled_time")):
        raise HTTPException(status_code=400, detail="Choisissez une date et un créneau")
    at_home = bool(body.get("at_home"))
    if at_home and not (body.get("address") or "").strip():
        raise HTTPException(status_code=400, detail="Indiquez l'adresse pour un prélèvement à domicile")
    payment_method = body.get("payment_method", "sbpay")
    if payment_method not in ("sbpay", "cash"):
        raise HTTPException(status_code=400, detail="Mode de paiement invalide")

    surcharge = cfg["home_surcharge"] if at_home else 0.0
    total = round(sum(float(a["price"]) for a in analyses) + surcharge, 2)

    provider_id = body.get("provider_id")
    provider = None
    if provider_id:
        provider = await db.pro_providers.find_one(
            {"id": provider_id, "vertical": VERTICAL, "verification_status": "approved"}, {"_id": 0})
        if not provider:
            raise HTTPException(status_code=400, detail="Laboratoire indisponible")
    status = "confirmed" if provider else "pending"

    new_balance, payment_status = None, "on_site"
    if payment_method == "sbpay" and total > 0:
        res = await db.wallets.update_one(
            {"user_id": user["id"], "balance": {"$gte": total}}, {"$inc": {"balance": -total}})
        if res.modified_count == 0:
            raise HTTPException(status_code=400, detail="Solde SB Pay insuffisant. Rechargez votre portefeuille.")
        wallet = await db.wallets.find_one({"user_id": user["id"]}, {"_id": 0})
        new_balance = round((wallet or {}).get("balance", 0), 2)
        await db.wallet_transactions.insert_one({
            "id": f"tx_{uuid.uuid4().hex[:12]}", "user_id": user["id"], "type": "Booking",
            "amount": -total, "balance_after": new_balance,
            "description": f"SB Labo · {len(analyses)} analyse(s)", "status": "completed", "created_at": _now()})
        payment_status = "paid"

    order = {
        "id": f"lab_{uuid.uuid4().hex[:12]}", "vertical": VERTICAL,
        "user_id": user["id"], "patient_name": user.get("name", ""),
        "analyses": [{"id": a["id"], "name": a["name"], "price": a["price"], "prep": a.get("prep", "")} for a in analyses],
        "provider_id": provider_id, "provider_name": (provider or {}).get("name"),
        "provider_user_id": (provider or {}).get("user_id"),
        "at_home": at_home, "address": body.get("address", ""),
        "scheduled_date": body.get("scheduled_date"), "scheduled_time": body.get("scheduled_time"),
        "home_surcharge": surcharge, "total": total,
        "payment_method": payment_method, "payment_status": payment_status,
        "status": status, "results": [], "conclusion": "", "results_at": None, "created_at": _now(),
    }
    await db.lab_orders.insert_one(dict(order))

    try:
        if provider and provider.get("user_id"):
            await create_notification(provider["user_id"], "lab_order_new", "🧪 Nouvelle commande d'analyses",
                                      f"{len(analyses)} analyse(s) · {order['scheduled_date']}",
                                      {"order_id": order["id"], "url": "/laboratoire"})
        elif not provider:
            labs = await db.pro_providers.find(
                {"vertical": VERTICAL, "verification_status": "approved", "is_available": True,
                 "user_id": {"$ne": None}}, {"_id": 0, "user_id": 1}).to_list(100)
            for lab in labs:
                await create_notification(lab["user_id"], "lab_order_new", "🧪 Nouvelle commande d'analyses",
                                          f"{len(analyses)} analyse(s) · {order['scheduled_date']}",
                                          {"order_id": order["id"], "url": "/laboratoire"})
    except Exception:
        pass
    return {**_pub(order), "balance": new_balance}


@router.get("/orders")
async def list_orders(request: Request):
    user = await get_current_user(request)
    docs = await db.lab_orders.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(100)
    upcoming = [d for d in docs if d["status"] in ("pending", "confirmed")]
    past = [d for d in docs if d["status"] in ("results_ready", "cancelled")]
    return {"upcoming": upcoming, "past": past}


@router.get("/orders/{order_id}")
async def get_order(order_id: str, request: Request):
    user = await get_current_user(request)
    o = await db.lab_orders.find_one({"id": order_id}, {"_id": 0})
    if not o or user["id"] not in (o.get("user_id"), o.get("provider_user_id")):
        raise HTTPException(status_code=404, detail="Commande introuvable")
    return o


@router.post("/orders/{order_id}/cancel")
async def cancel_order(order_id: str, request: Request):
    user = await get_current_user(request)
    o = await db.lab_orders.find_one({"id": order_id, "user_id": user["id"]}, {"_id": 0})
    if not o:
        raise HTTPException(status_code=404, detail="Commande introuvable")
    if o["status"] in ("results_ready", "cancelled"):
        raise HTTPException(status_code=400, detail="Commande déjà clôturée ou annulée")
    if o.get("payment_method") == "sbpay" and o.get("payment_status") == "paid":
        total = round(float(o.get("total", 0) or 0), 2)
        await db.wallets.update_one({"user_id": user["id"]}, {"$inc": {"balance": total}}, upsert=True)
        wallet = await db.wallets.find_one({"user_id": user["id"]}, {"_id": 0})
        await db.wallet_transactions.insert_one({
            "id": f"tx_{uuid.uuid4().hex[:12]}", "user_id": user["id"], "type": "Refund",
            "amount": total, "balance_after": round((wallet or {}).get("balance", 0), 2),
            "description": "Remboursement · SB Labo", "status": "completed", "created_at": _now()})
    await db.lab_orders.update_one({"id": order_id}, {"$set": {"status": "cancelled", "cancelled_at": _now()}})
    return {"ok": True}


@router.get("/orders/{order_id}/results/pdf")
async def results_pdf(order_id: str, request: Request):
    user = await get_current_user(request)
    o = await db.lab_orders.find_one({"id": order_id}, {"_id": 0})
    if not o or user["id"] not in (o.get("user_id"), o.get("provider_user_id")):
        raise HTTPException(status_code=404, detail="Commande introuvable")
    if o["status"] != "results_ready":
        raise HTTPException(status_code=400, detail="Résultats non disponibles")
    pdf = lab_results_pdf(o)
    return Response(content=pdf, media_type="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="resultats-{order_id[-8:]}.pdf"'})


# ── Côté laboratoire ─────────────────────────────────────────────────────────
@router.get("/provider/status")
async def lab_status(request: Request):
    user = await get_current_user(request)
    p = await db.pro_providers.find_one({"vertical": VERTICAL, "user_id": user["id"]}, {"_id": 0})
    return {"registered": bool(p), "approved": bool(p and p.get("verification_status") == "approved"),
            "verification_status": (p or {}).get("verification_status"),
            "name": (p or {}).get("name"), "categories": (p or {}).get("categories", [])}


@router.get("/provider/orders")
async def lab_orders_feed(request: Request):
    user = await get_current_user(request)
    p = await _approved_lab(user["id"])
    if not p:
        raise HTTPException(status_code=403, detail="Laboratoire non validé")
    feed = await db.lab_orders.find({"vertical": VERTICAL, "status": "pending", "provider_id": None}).sort("created_at", -1).to_list(50)
    mine = await db.lab_orders.find({"vertical": VERTICAL, "provider_user_id": user["id"]}).sort("created_at", -1).to_list(100)
    return {"feed": [_pub(d) for d in feed], "jobs": [_pub(d) for d in mine]}


@router.post("/orders/{order_id}/accept")
async def lab_accept(order_id: str, request: Request):
    from pymongo import ReturnDocument
    user = await get_current_user(request)
    p = await _approved_lab(user["id"])
    if not p:
        raise HTTPException(status_code=403, detail="Laboratoire non validé")
    o = await db.lab_orders.find_one_and_update(
        {"id": order_id, "vertical": VERTICAL, "status": "pending", "provider_id": None},
        {"$set": {"provider_id": p["id"], "provider_name": p.get("name"), "provider_user_id": user["id"],
                  "status": "confirmed", "accepted_at": _now()}},
        return_document=ReturnDocument.AFTER)
    if not o:
        raise HTTPException(status_code=409, detail="Commande déjà prise ou indisponible")
    try:
        await create_notification(o["user_id"], "lab_order_accepted", "🧪 Laboratoire confirmé",
                                  f"{p.get('name')} prend en charge vos analyses.",
                                  {"order_id": order_id, "url": "/analyses"})
    except Exception:
        pass
    return _pub(o)


@router.post("/orders/{order_id}/results")
async def upload_results(order_id: str, request: Request):
    user = await get_current_user(request)
    p = await _approved_lab(user["id"])
    if not p:
        raise HTTPException(status_code=403, detail="Laboratoire non validé")
    o = await db.lab_orders.find_one({"id": order_id, "vertical": VERTICAL, "provider_user_id": user["id"]}, {"_id": 0})
    if not o:
        raise HTTPException(status_code=404, detail="Commande introuvable")
    if o["status"] in ("results_ready", "cancelled"):
        raise HTTPException(status_code=400, detail="Commande déjà clôturée")
    body = await request.json()
    results = []
    for r in (body.get("results") or []):
        if (r.get("name") or "").strip() or (r.get("value") or "").strip():
            results.append({"name": (r.get("name") or "").strip(), "value": (r.get("value") or "").strip(),
                            "unit": (r.get("unit") or "").strip(), "ref_range": (r.get("ref_range") or "").strip(),
                            "flag": (r.get("flag") or "normal")})
    if not results:
        raise HTTPException(status_code=400, detail="Saisissez au moins un résultat")

    # Commission split (sbpay only → crédit labo net).
    total = round(float(o.get("total", 0) or 0), 2)
    pct = await _commission_pct(VERTICAL)
    commission = round(total * pct, 2)
    provider_earning = round(total - commission, 2)
    await db.lab_orders.update_one(
        {"id": order_id},
        {"$set": {"results": results, "conclusion": (body.get("conclusion") or "").strip(),
                  "status": "results_ready", "results_at": _now(),
                  "commission_pct": pct, "commission": commission, "provider_earning": provider_earning}})
    if o.get("payment_method") == "sbpay" and provider_earning > 0:
        await db.wallets.update_one({"user_id": user["id"]}, {"$inc": {"balance": provider_earning}}, upsert=True)
        w = await db.wallets.find_one({"user_id": user["id"]}, {"_id": 0})
        await db.wallet_transactions.insert_one({
            "id": f"tx_{uuid.uuid4().hex[:12]}", "user_id": user["id"], "type": "Earning",
            "amount": provider_earning, "balance_after": round((w or {}).get("balance", 0), 2),
            "description": "SB Labo · résultats (net)", "status": "completed", "created_at": _now()})
    await db.pro_revenue.insert_one({
        "id": f"prev_{uuid.uuid4().hex[:12]}", "vertical": VERTICAL, "booking_id": order_id,
        "provider_user_id": user["id"], "total": total, "commission": commission,
        "provider_earning": provider_earning, "commission_pct": pct,
        "collected": o.get("payment_method") == "sbpay", "created_at": _now()})
    try:
        await create_notification(o["user_id"], "lab_results_ready", "📄 Vos résultats sont disponibles",
                                  "Téléchargez votre compte rendu d'analyses.",
                                  {"order_id": order_id, "url": "/analyses"})
    except Exception:
        pass
    return {"ok": True, "status": "results_ready"}
