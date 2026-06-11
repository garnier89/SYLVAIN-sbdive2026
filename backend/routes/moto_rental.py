"""SB Drive — Location de moto en libre-service (self-drive).

L'utilisateur loue une moto de la flotte interne et la conduit lui-même.
MVP (défauts validés par l'utilisateur) :
- Flotte interne gérée par l'admin (motos : modèle, photo, prix/jour & /heure, caution indicative).
- Paiement de la location via le portefeuille SB Pay (débité à la réservation).
- Caution = montant **indicatif** affiché (pas de blocage technique au MVP).
- Permis : upload (permis + pièce d'identité) validé **manuellement** par l'admin.
- Cycle de vie : pending_license → awaiting_pickup → active → returned (ou rejected/cancelled).
- Remise / restitution avec photos d'état des lieux (Phase 3b) prévues mais optionnelles ici.
"""
import uuid
import os
from datetime import datetime, timezone

from fastapi import APIRouter, Request, HTTPException
from emergentintegrations.payments.stripe.checkout import (
    StripeCheckout, CheckoutSessionRequest,
)

from core.config import db, logger
from core.deps import require_role, get_current_user
from core.notifications import create_notification
from core.airport import notify_admins

STRIPE_API_KEY = os.environ.get("STRIPE_API_KEY", "")


def _get_stripe(request: Request):
    host_url = str(request.base_url).rstrip("/")
    return StripeCheckout(api_key=STRIPE_API_KEY, webhook_url=f"{host_url}/api/webhook/stripe")

router = APIRouter(prefix="/moto-rental", tags=["moto-rental"])
admin_router = APIRouter(prefix="/moto-rental/admin", tags=["moto-rental-admin"])


def _now():
    return datetime.now(timezone.utc).isoformat()


def _parse(s):
    if not s:
        return None
    try:
        return datetime.fromisoformat(str(s).replace("Z", "+00:00"))
    except (ValueError, TypeError):
        return None


def _compute_duration(start_at, end_at):
    """Renvoie (jours, heures_restantes, heures_totales) à partir de 2 dates ISO."""
    a, b = _parse(start_at), _parse(end_at)
    if not a or not b or b <= a:
        return 0, 0, 0.0
    total_hours = (b - a).total_seconds() / 3600.0
    days = int(total_hours // 24)
    rem_hours = total_hours - days * 24
    return days, rem_hours, round(total_hours, 2)


def _price_for(moto, start_at, end_at):
    days, rem_hours, total_hours = _compute_duration(start_at, end_at)
    ppd = float(moto.get("price_per_day", 0) or 0)
    pph = float(moto.get("price_per_hour", 0) or 0)
    # Facturation : jours pleins au tarif/jour, heures restantes au tarif/heure,
    # plafonné au tarif/jour (une journée entamée ≈ 1 jour).
    rem_cost = min(rem_hours * pph, ppd) if pph else 0
    price = days * ppd + rem_cost
    return round(max(price, 0), 2), days, round(rem_hours, 1), total_hours


# ============================================================
#  FLOTTE (utilisateur)
# ============================================================
async def seed_moto_fleet():
    if await db.moto_fleet.count_documents({}) > 0:
        return
    demo = [
        {"name": "Yamaha NMAX 125", "model": "Scooter 125cc", "license_class": "A1/B",
         "price_per_day": 35, "price_per_hour": 6, "deposit_amount": 400,
         "location_name": "Agence Centre-ville", "image_url": "", "plate": "AA-001-MM"},
        {"name": "Honda PCX 125", "model": "Scooter 125cc", "license_class": "A1/B",
         "price_per_day": 38, "price_per_hour": 6, "deposit_amount": 400,
         "location_name": "Agence Centre-ville", "image_url": "", "plate": "AA-002-MM"},
        {"name": "Yamaha MT-07", "model": "Roadster 689cc", "license_class": "A2",
         "price_per_day": 75, "price_per_hour": 12, "deposit_amount": 1200,
         "location_name": "Agence Gare", "image_url": "", "plate": "AA-003-MM"},
    ]
    for d in demo:
        await db.moto_fleet.insert_one({
            "id": f"moto_{uuid.uuid4().hex[:10]}", "status": "available", "active": True,
            "description": "", "created_at": _now(), **d})


@router.get("/fleet")
async def list_fleet(request: Request):
    await get_current_user(request)
    items = await db.moto_fleet.find(
        {"active": True, "status": {"$ne": "maintenance"}}, {"_id": 0}).sort("price_per_day", 1).to_list(100)
    return {"motos": items}


@router.get("/fleet/{moto_id}")
async def fleet_detail(moto_id: str, request: Request):
    await get_current_user(request)
    moto = await db.moto_fleet.find_one({"id": moto_id, "active": True}, {"_id": 0})
    if not moto:
        raise HTTPException(status_code=404, detail="Moto introuvable")
    return moto


@router.post("/quote")
async def quote(request: Request):
    """Devis (prix + caution) pour une moto et une période, sans réserver."""
    await get_current_user(request)
    body = await request.json()
    moto = await db.moto_fleet.find_one({"id": body.get("moto_id"), "active": True}, {"_id": 0})
    if not moto:
        raise HTTPException(status_code=404, detail="Moto introuvable")
    price, days, rem_hours, total_hours = _price_for(moto, body.get("start_at"), body.get("end_at"))
    return {"price": price, "days": days, "remaining_hours": rem_hours, "total_hours": total_hours,
            "deposit_amount": float(moto.get("deposit_amount", 0) or 0),
            "price_per_day": moto.get("price_per_day"), "price_per_hour": moto.get("price_per_hour")}


# ============================================================
#  RÉSERVATION (utilisateur)
# ============================================================
@router.post("/book")
async def book(request: Request):
    user = await get_current_user(request)
    body = await request.json()
    moto = await db.moto_fleet.find_one({"id": body.get("moto_id"), "active": True}, {"_id": 0})
    if not moto:
        raise HTTPException(status_code=404, detail="Moto introuvable")
    if moto.get("status") != "available":
        raise HTTPException(status_code=409, detail="Cette moto n'est pas disponible actuellement")
    start_at, end_at = body.get("start_at"), body.get("end_at")
    price, days, rem_hours, total_hours = _price_for(moto, start_at, end_at)
    if total_hours <= 0:
        raise HTTPException(status_code=400, detail="Période invalide (le retour doit être après le retrait)")
    if not body.get("license_doc_url") or not body.get("id_doc_url"):
        raise HTTPException(status_code=400, detail="Permis de conduire et pièce d'identité requis")

    # Paiement via SB Pay (débit de la location ; caution indicative non débitée).
    wallet = await db.wallets.find_one({"user_id": user["id"]})
    if not wallet or wallet.get("balance", 0) < price:
        raise HTTPException(status_code=400, detail="Solde SB Pay insuffisant pour cette location")
    new_balance = round(wallet["balance"] - price, 2)
    await db.wallets.update_one({"user_id": user["id"]}, {"$set": {"balance": new_balance}})
    await db.wallet_transactions.insert_one({
        "id": f"tx_{uuid.uuid4().hex[:12]}", "user_id": user["id"], "type": "Booking",
        "amount": -price, "balance_after": new_balance,
        "description": f"Location moto {moto['name']}", "status": "completed", "created_at": _now()})

    rental = {
        "id": f"mrent_{uuid.uuid4().hex[:10]}", "user_id": user["id"], "user_name": user.get("name"),
        "moto_id": moto["id"], "moto_name": moto["name"], "moto_model": moto.get("model"),
        "moto_image": moto.get("image_url"), "location_name": moto.get("location_name"),
        "start_at": start_at, "end_at": end_at, "days": days, "remaining_hours": rem_hours,
        "total_hours": total_hours, "base_price": price, "price_paid": price,
        "deposit_amount": float(moto.get("deposit_amount", 0) or 0),
        "license_doc_url": body.get("license_doc_url"), "id_doc_url": body.get("id_doc_url"),
        "license_status": "pending",  # pending | approved | rejected
        "status": "pending_license",  # pending_license | awaiting_pickup | active | returned | rejected | cancelled
        "pickup": None, "return": None, "extra_fees": 0, "total_price": price,
        "payment_status": "paid", "created_at": _now(),
    }
    await db.moto_self_rentals.insert_one(dict(rental))
    rental.pop("_id", None)
    # Réserve la moto le temps de la validation.
    await db.moto_fleet.update_one({"id": moto["id"]}, {"$set": {"status": "reserved"}})
    await notify_admins("moto_rental_new", "Nouvelle location moto à valider",
                        f"{user.get('name') or 'Un client'} a réservé {moto['name']} (permis à vérifier).",
                        data={"rental_id": rental["id"]})
    await create_notification(user["id"], "moto_rental", "Demande de location enregistrée 🏍️",
                              "Votre permis est en cours de vérification. Vous serez notifié dès validation.",
                              data={"rental_id": rental["id"]})
    return {"ok": True, "rental": rental, "balance": new_balance}


@router.get("/my")
async def my_rentals(request: Request):
    user = await get_current_user(request)
    items = await db.moto_self_rentals.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return {"rentals": items}


@router.post("/{rental_id}/cancel")
async def cancel_rental(rental_id: str, request: Request):
    user = await get_current_user(request)
    rental = await db.moto_self_rentals.find_one({"id": rental_id, "user_id": user["id"]}, {"_id": 0})
    if not rental:
        raise HTTPException(status_code=404, detail="Location introuvable")
    if rental["status"] not in ("pending_license", "awaiting_pickup"):
        raise HTTPException(status_code=409, detail="Cette location ne peut plus être annulée")
    # Remboursement de la location.
    refund = float(rental.get("price_paid", 0) or 0)
    if refund > 0:
        wallet = await db.wallets.find_one({"user_id": user["id"]})
        bal = round((wallet.get("balance", 0) if wallet else 0) + refund, 2)
        await db.wallets.update_one({"user_id": user["id"]}, {"$set": {"balance": bal}}, upsert=True)
        await db.wallet_transactions.insert_one({
            "id": f"tx_{uuid.uuid4().hex[:12]}", "user_id": user["id"], "type": "Refund",
            "amount": refund, "balance_after": bal,
            "description": f"Remboursement location {rental['moto_name']}", "status": "completed", "created_at": _now()})
    await db.moto_self_rentals.update_one({"id": rental_id}, {"$set": {"status": "cancelled", "cancelled_at": _now()}})
    await db.moto_fleet.update_one({"id": rental["moto_id"]}, {"$set": {"status": "available"}})
    return {"ok": True, "refunded": refund}


# ============================================================
#  CAUTION (Stripe Checkout — débitée à la remise, recréditée au retour sur SB Pay)
# ============================================================
@router.post("/{rental_id}/deposit-checkout")
async def deposit_checkout(rental_id: str, request: Request):
    """Crée une session Stripe Checkout pour la caution (montant fixé côté serveur)."""
    user = await get_current_user(request)
    body = await request.json()
    origin_url = body.get("origin_url")
    if not origin_url:
        raise HTTPException(status_code=400, detail="Origin URL requis")
    rental = await db.moto_self_rentals.find_one({"id": rental_id, "user_id": user["id"]}, {"_id": 0})
    if not rental:
        raise HTTPException(status_code=404, detail="Location introuvable")
    if rental.get("status") != "awaiting_pickup":
        raise HTTPException(status_code=409, detail="La caution se règle après validation du permis, avant le retrait")
    if rental.get("deposit_status") == "held":
        raise HTTPException(status_code=409, detail="Caution déjà réglée")
    amount = round(float(rental.get("deposit_amount", 0) or 0), 2)
    if amount <= 0:
        # Pas de caution requise → on passe directement la moto en "active".
        await db.moto_self_rentals.update_one({"id": rental_id}, {"$set": {"deposit_status": "none", "status": "active"}})
        return {"ok": True, "no_deposit": True}

    return_path = "/moto-location"
    success_url = f"{origin_url}{return_path}?deposit_session={{CHECKOUT_SESSION_ID}}"
    cancel_url = f"{origin_url}{return_path}"
    stripe = _get_stripe(request)
    session = await stripe.create_checkout_session(CheckoutSessionRequest(
        amount=float(amount), currency="eur", success_url=success_url, cancel_url=cancel_url,
        metadata={"user_id": user["id"], "type": "moto_deposit", "rental_id": rental_id, "amount": str(amount)},
    ))
    now = _now()
    await db.payment_transactions.insert_one({
        "id": f"pay_{uuid.uuid4().hex[:12]}", "session_id": session.session_id, "user_id": user["id"],
        "amount": amount, "currency": "EUR", "type": "moto_deposit",
        "payment_status": "pending", "status": "initiated",
        "metadata": {"rental_id": rental_id}, "created_at": now, "updated_at": now,
    })
    return {"url": session.url, "session_id": session.session_id}


@router.get("/deposit-status/{session_id}")
async def deposit_status(session_id: str, request: Request):
    """Polling du paiement de la caution ; marque la caution comme bloquée et active la location."""
    user = await get_current_user(request)
    tx = await db.payment_transactions.find_one(
        {"session_id": session_id, "user_id": user["id"], "type": "moto_deposit"}, {"_id": 0})
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction introuvable")
    if tx.get("payment_status") == "paid":
        return {"payment_status": "paid", "amount": tx["amount"]}

    stripe = _get_stripe(request)
    try:
        status = await stripe.get_checkout_status(session_id)
    except Exception:
        return {"payment_status": tx["payment_status"], "amount": tx["amount"]}

    now = _now()
    if status and status.payment_status == "paid":
        res = await db.payment_transactions.update_one(
            {"session_id": session_id, "payment_status": {"$ne": "paid"}},
            {"$set": {"payment_status": "paid", "status": "complete", "updated_at": now}})
        if res.modified_count > 0:
            rid = (tx.get("metadata") or {}).get("rental_id")
            await db.moto_self_rentals.update_one(
                {"id": rid}, {"$set": {"deposit_status": "held", "deposit_session_id": session_id,
                                       "deposit_held_amount": tx["amount"], "status": "active",
                                       "picked_up_at": now}})
        return {"payment_status": "paid", "amount": tx["amount"]}
    if status and status.status == "expired":
        await db.payment_transactions.update_one(
            {"session_id": session_id}, {"$set": {"payment_status": "expired", "status": "expired", "updated_at": now}})
        return {"payment_status": "expired", "amount": tx["amount"]}
    return {"payment_status": status.payment_status if status else "pending", "amount": tx["amount"]}


# ============================================================
#  ADMIN — flotte + locations + validation permis
# ============================================================
_FLEET_FIELDS = ("name", "model", "license_class", "price_per_day", "price_per_hour",
                 "deposit_amount", "location_name", "image_url", "plate", "description",
                 "status", "active")


@admin_router.get("/fleet")
async def admin_fleet(request: Request):
    await require_role(request, ["admin"])
    items = await db.moto_fleet.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return {"motos": items}


@admin_router.post("/fleet")
async def admin_create_moto(request: Request):
    await require_role(request, ["admin"], permission="server.settings.edit")
    body = await request.json()
    moto = {"id": f"moto_{uuid.uuid4().hex[:10]}", "created_at": _now(),
            "name": str(body.get("name") or "Moto")[:80],
            "model": str(body.get("model") or "")[:80],
            "license_class": str(body.get("license_class") or "A1/B")[:20],
            "price_per_day": max(0.0, float(body.get("price_per_day") or 0)),
            "price_per_hour": max(0.0, float(body.get("price_per_hour") or 0)),
            "deposit_amount": max(0.0, float(body.get("deposit_amount") or 0)),
            "location_name": str(body.get("location_name") or "Agence")[:80],
            "image_url": str(body.get("image_url") or "")[:600],
            "plate": str(body.get("plate") or "")[:20],
            "description": str(body.get("description") or "")[:400],
            "status": "available", "active": True}
    await db.moto_fleet.insert_one(dict(moto))
    return {"ok": True, "moto": moto}


@admin_router.put("/fleet/{moto_id}")
async def admin_update_moto(moto_id: str, request: Request):
    await require_role(request, ["admin"], permission="server.settings.edit")
    body = await request.json()
    update = {}
    for f in _FLEET_FIELDS:
        if f not in body:
            continue
        if f in ("price_per_day", "price_per_hour", "deposit_amount"):
            update[f] = max(0.0, float(body[f] or 0))
        elif f == "active":
            update[f] = bool(body[f])
        else:
            update[f] = str(body[f])[:600]
    if update:
        await db.moto_fleet.update_one({"id": moto_id}, {"$set": update})
    moto = await db.moto_fleet.find_one({"id": moto_id}, {"_id": 0})
    return {"ok": True, "moto": moto}


@admin_router.delete("/fleet/{moto_id}")
async def admin_delete_moto(moto_id: str, request: Request):
    await require_role(request, ["admin"], permission="server.settings.edit")
    await db.moto_fleet.update_one({"id": moto_id}, {"$set": {"active": False}})
    return {"ok": True}


@admin_router.get("/rentals")
async def admin_rentals(request: Request):
    await require_role(request, ["admin"])
    items = await db.moto_self_rentals.find({}, {"_id": 0}).sort("created_at", -1).to_list(300)
    pending = [r for r in items if r.get("license_status") == "pending"]
    return {"rentals": items, "pending_license_count": len(pending)}


@admin_router.post("/rentals/{rental_id}/license")
async def admin_review_license(rental_id: str, request: Request):
    """Valide ou refuse le permis. approve=True → awaiting_pickup ; sinon rejected + remboursement."""
    await require_role(request, ["admin"], permission="server.settings.edit")
    body = await request.json()
    approve = bool(body.get("approve"))
    rental = await db.moto_self_rentals.find_one({"id": rental_id}, {"_id": 0})
    if not rental:
        raise HTTPException(status_code=404, detail="Location introuvable")
    if rental.get("license_status") != "pending":
        raise HTTPException(status_code=409, detail="Permis déjà traité")

    if approve:
        loc = rental.get("location_name") or "l'agence"
        await db.moto_self_rentals.update_one(
            {"id": rental_id}, {"$set": {"license_status": "approved", "status": "awaiting_pickup",
                                         "license_reviewed_at": _now()}})
        await create_notification(rental["user_id"], "moto_rental_approved",
                                  "Permis validé ✅ — moto réservée",
                                  f"Votre location {rental['moto_name']} est confirmée. Présentez-vous à {loc} pour le retrait.",
                                  data={"rental_id": rental_id})
        return {"ok": True, "status": "awaiting_pickup"}

    # Refus → remboursement + libération de la moto.
    refund = float(rental.get("price_paid", 0) or 0)
    if refund > 0:
        wallet = await db.wallets.find_one({"user_id": rental["user_id"]})
        bal = round((wallet.get("balance", 0) if wallet else 0) + refund, 2)
        await db.wallets.update_one({"user_id": rental["user_id"]}, {"$set": {"balance": bal}}, upsert=True)
        await db.wallet_transactions.insert_one({
            "id": f"tx_{uuid.uuid4().hex[:12]}", "user_id": rental["user_id"], "type": "Refund",
            "amount": refund, "balance_after": bal,
            "description": f"Remboursement location {rental['moto_name']} (permis refusé)",
            "status": "completed", "created_at": _now()})
    await db.moto_self_rentals.update_one(
        {"id": rental_id}, {"$set": {"license_status": "rejected", "status": "rejected",
                                     "reject_reason": str(body.get("reason") or "")[:200],
                                     "license_reviewed_at": _now()}})
    await db.moto_fleet.update_one({"id": rental["moto_id"]}, {"$set": {"status": "available"}})
    await create_notification(rental["user_id"], "moto_rental_rejected",
                              "Location refusée — remboursée",
                              "Votre permis n'a pas pu être validé. La location a été remboursée sur votre SB Pay.",
                              data={"rental_id": rental_id})
    return {"ok": True, "status": "rejected", "refunded": refund}


@admin_router.post("/rentals/{rental_id}/return")
async def admin_return(rental_id: str, request: Request):
    """Clôture la location : restitue la caution (− frais dommages) sur le portefeuille SB Pay
    et libère la moto. `damage_fees` (optionnel) est conservé par l'agence."""
    await require_role(request, ["admin"], permission="server.settings.edit")
    body = {}
    try:
        body = await request.json()
    except Exception:
        body = {}
    rental = await db.moto_self_rentals.find_one({"id": rental_id}, {"_id": 0})
    if not rental:
        raise HTTPException(status_code=404, detail="Location introuvable")
    if rental.get("status") not in ("active", "awaiting_pickup"):
        raise HTTPException(status_code=409, detail="Cette location ne peut pas être clôturée")

    held = float(rental.get("deposit_held_amount", 0) or 0)
    try:
        damage = max(0.0, float(body.get("damage_fees") or 0))
    except (TypeError, ValueError):
        damage = 0.0
    damage = min(damage, held)  # on ne retient jamais plus que la caution bloquée
    refund = round(held - damage, 2)

    if held > 0 and refund > 0:
        wallet = await db.wallets.find_one({"user_id": rental["user_id"]})
        bal = round((wallet.get("balance", 0) if wallet else 0) + refund, 2)
        await db.wallets.update_one({"user_id": rental["user_id"]}, {"$set": {"balance": bal}}, upsert=True)
        await db.wallet_transactions.insert_one({
            "id": f"tx_{uuid.uuid4().hex[:12]}", "user_id": rental["user_id"], "type": "Refund",
            "amount": refund, "balance_after": bal,
            "description": f"Restitution caution moto {rental['moto_name']}"
                           + (f" (− {damage}€ dommages)" if damage else ""),
            "status": "completed", "created_at": _now()})

    await db.moto_self_rentals.update_one(
        {"id": rental_id}, {"$set": {"status": "returned", "returned_at": _now(),
                                     "damage_fees": damage, "deposit_refunded": refund,
                                     "deposit_status": "released" if held else rental.get("deposit_status"),
                                     "return_notes": str(body.get("notes") or "")[:300]}})
    await db.moto_fleet.update_one({"id": rental["moto_id"]}, {"$set": {"status": "available"}})
    await create_notification(
        rental["user_id"], "moto_rental_returned", "Location terminée 🏍️",
        (f"Caution restituée : {refund}€ sur votre SB Pay" + (f" ({damage}€ retenus pour dommages)." if damage else "."))
        if held else "Merci d'avoir loué avec SB Drive.",
        data={"rental_id": rental_id})
    return {"ok": True, "status": "returned", "deposit_refunded": refund, "damage_fees": damage}
