"""SB Drive — Location de voiture en libre-service (self-drive).

L'utilisateur loue une voiture de la flotte interne et la conduit lui-même.
(La location de voiture AVEC chauffeur existe déjà via les forfaits du flux courses.)

Modèle (cohérent avec le module moto self-drive, défauts validés) :
- Flotte interne gérée par l'admin (voitures : marque/modèle, photo, prix/jour & /heure, caution).
- Paiement de la location via le portefeuille SB Pay (débité à la réservation).
- Caution réglée par Stripe Checkout (débitée à la remise), restituée sur SB Pay au retour (− dommages).
- Permis : upload (permis + pièce d'identité) validé manuellement par l'admin.
- Photos d'état des lieux OBLIGATOIRES au retrait (usager) et au retour (admin).
- Cycle : pending_license → awaiting_pickup → active → returned (ou rejected/cancelled).
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


router = APIRouter(prefix="/car-rental", tags=["car-rental"])
admin_router = APIRouter(prefix="/car-rental/admin", tags=["car-rental-admin"])

# Nombre minimum de photos d'état des lieux (retrait & retour) pour protéger la caution.
MIN_INSPECTION_PHOTOS = 2


def _clean_photos(value, limit=8):
    if not isinstance(value, list):
        return []
    out = []
    for p in value:
        if isinstance(p, str) and p.strip():
            out.append(p.strip()[:600])
        if len(out) >= limit:
            break
    return out


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
    a, b = _parse(start_at), _parse(end_at)
    if not a or not b or b <= a:
        return 0, 0, 0.0
    total_hours = (b - a).total_seconds() / 3600.0
    days = int(total_hours // 24)
    rem_hours = total_hours - days * 24
    return days, rem_hours, round(total_hours, 2)


def _price_for(car, start_at, end_at):
    days, rem_hours, total_hours = _compute_duration(start_at, end_at)
    ppd = float(car.get("price_per_day", 0) or 0)
    pph = float(car.get("price_per_hour", 0) or 0)
    rem_cost = min(rem_hours * pph, ppd) if pph else 0
    price = days * ppd + rem_cost
    return round(max(price, 0), 2), days, round(rem_hours, 1), total_hours


# ============================================================
#  FLOTTE (utilisateur)
# ============================================================
async def seed_car_fleet():
    if await db.car_fleet.count_documents({}) > 0:
        return
    demo = [
        {"name": "Renault Clio", "make": "Renault", "model": "Clio V", "year": 2023,
         "category": "economy", "transmission": "manual", "seats": 5, "fuel": "Essence",
         "price_per_day": 45, "price_per_hour": 8, "deposit_amount": 600,
         "location_name": "Agence Centre-ville", "image_url": "", "plate": "AB-100-CD"},
        {"name": "Peugeot 3008", "make": "Peugeot", "model": "3008", "year": 2024,
         "category": "suv", "transmission": "automatic", "seats": 5, "fuel": "Diesel",
         "price_per_day": 75, "price_per_hour": 12, "deposit_amount": 900,
         "location_name": "Agence Gare", "image_url": "", "plate": "AB-200-CD"},
        {"name": "Mercedes Classe C", "make": "Mercedes", "model": "Classe C", "year": 2024,
         "category": "luxury", "transmission": "automatic", "seats": 5, "fuel": "Essence",
         "price_per_day": 130, "price_per_hour": 20, "deposit_amount": 1500,
         "location_name": "Agence Aéroport", "image_url": "", "plate": "AB-300-CD"},
    ]
    for d in demo:
        await db.car_fleet.insert_one({
            "id": f"car_{uuid.uuid4().hex[:10]}", "status": "available", "active": True,
            "description": "", "created_at": _now(), **d})


@router.get("/fleet")
async def list_fleet(request: Request):
    await get_current_user(request)
    items = await db.car_fleet.find(
        {"active": True, "status": {"$ne": "maintenance"}}, {"_id": 0}).sort("price_per_day", 1).to_list(100)
    return {"cars": items}


@router.get("/fleet/{car_id}")
async def fleet_detail(car_id: str, request: Request):
    await get_current_user(request)
    car = await db.car_fleet.find_one({"id": car_id, "active": True}, {"_id": 0})
    if not car:
        raise HTTPException(status_code=404, detail="Voiture introuvable")
    return car


@router.post("/quote")
async def quote(request: Request):
    await get_current_user(request)
    body = await request.json()
    car = await db.car_fleet.find_one({"id": body.get("car_id"), "active": True}, {"_id": 0})
    if not car:
        raise HTTPException(status_code=404, detail="Voiture introuvable")
    price, days, rem_hours, total_hours = _price_for(car, body.get("start_at"), body.get("end_at"))
    return {"price": price, "days": days, "remaining_hours": rem_hours, "total_hours": total_hours,
            "deposit_amount": float(car.get("deposit_amount", 0) or 0),
            "price_per_day": car.get("price_per_day"), "price_per_hour": car.get("price_per_hour")}


# ============================================================
#  RÉSERVATION (utilisateur)
# ============================================================
@router.post("/book")
async def book(request: Request):
    user = await get_current_user(request)
    body = await request.json()
    car = await db.car_fleet.find_one({"id": body.get("car_id"), "active": True}, {"_id": 0})
    if not car:
        raise HTTPException(status_code=404, detail="Voiture introuvable")
    if car.get("status") != "available":
        raise HTTPException(status_code=409, detail="Cette voiture n'est pas disponible actuellement")
    start_at, end_at = body.get("start_at"), body.get("end_at")
    price, days, rem_hours, total_hours = _price_for(car, start_at, end_at)
    if total_hours <= 0:
        raise HTTPException(status_code=400, detail="Période invalide (le retour doit être après le retrait)")
    if not body.get("license_doc_url") or not body.get("id_doc_url"):
        raise HTTPException(status_code=400, detail="Permis de conduire et pièce d'identité requis")

    wallet = await db.wallets.find_one({"user_id": user["id"]})
    if not wallet or wallet.get("balance", 0) < price:
        raise HTTPException(status_code=400, detail="Solde SB Pay insuffisant pour cette location")
    new_balance = round(wallet["balance"] - price, 2)
    await db.wallets.update_one({"user_id": user["id"]}, {"$set": {"balance": new_balance}})
    await db.wallet_transactions.insert_one({
        "id": f"tx_{uuid.uuid4().hex[:12]}", "user_id": user["id"], "type": "Booking",
        "amount": -price, "balance_after": new_balance,
        "description": f"Location voiture {car['name']}", "status": "completed", "created_at": _now()})

    rental = {
        "id": f"crent_{uuid.uuid4().hex[:10]}", "user_id": user["id"], "user_name": user.get("name"),
        "car_id": car["id"], "car_name": car["name"], "car_model": car.get("model"),
        "car_image": car.get("image_url"), "location_name": car.get("location_name"),
        "start_at": start_at, "end_at": end_at, "days": days, "remaining_hours": rem_hours,
        "total_hours": total_hours, "base_price": price, "price_paid": price,
        "deposit_amount": float(car.get("deposit_amount", 0) or 0),
        "license_doc_url": body.get("license_doc_url"), "id_doc_url": body.get("id_doc_url"),
        "license_status": "pending",
        "status": "pending_license",
        "pickup": None, "return": None, "extra_fees": 0, "total_price": price,
        "payment_status": "paid", "created_at": _now(),
    }
    await db.car_self_rentals.insert_one(dict(rental))
    rental.pop("_id", None)
    await db.car_fleet.update_one({"id": car["id"]}, {"$set": {"status": "reserved"}})
    await notify_admins("car_rental_new", "Nouvelle location voiture à valider",
                        f"{user.get('name') or 'Un client'} a réservé {car['name']} (permis à vérifier).",
                        data={"rental_id": rental["id"]})
    await create_notification(user["id"], "car_rental", "Demande de location enregistrée 🚗",
                              "Votre permis est en cours de vérification. Vous serez notifié dès validation.",
                              data={"rental_id": rental["id"]})
    return {"ok": True, "rental": rental, "balance": new_balance}


@router.get("/my")
async def my_rentals(request: Request):
    user = await get_current_user(request)
    items = await db.car_self_rentals.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return {"rentals": items}


@router.post("/{rental_id}/cancel")
async def cancel_rental(rental_id: str, request: Request):
    user = await get_current_user(request)
    rental = await db.car_self_rentals.find_one({"id": rental_id, "user_id": user["id"]}, {"_id": 0})
    if not rental:
        raise HTTPException(status_code=404, detail="Location introuvable")
    if rental["status"] not in ("pending_license", "awaiting_pickup"):
        raise HTTPException(status_code=409, detail="Cette location ne peut plus être annulée")
    refund = float(rental.get("price_paid", 0) or 0)
    if refund > 0:
        wallet = await db.wallets.find_one({"user_id": user["id"]})
        bal = round((wallet.get("balance", 0) if wallet else 0) + refund, 2)
        await db.wallets.update_one({"user_id": user["id"]}, {"$set": {"balance": bal}}, upsert=True)
        await db.wallet_transactions.insert_one({
            "id": f"tx_{uuid.uuid4().hex[:12]}", "user_id": user["id"], "type": "Refund",
            "amount": refund, "balance_after": bal,
            "description": f"Remboursement location {rental['car_name']}", "status": "completed", "created_at": _now()})
    await db.car_self_rentals.update_one({"id": rental_id}, {"$set": {"status": "cancelled", "cancelled_at": _now()}})
    await db.car_fleet.update_one({"id": rental["car_id"]}, {"$set": {"status": "available"}})
    return {"ok": True, "refunded": refund}


@router.post("/{rental_id}/pickup-photos")
async def pickup_photos(rental_id: str, request: Request):
    """État des lieux au RETRAIT : l'usager téléverse des photos avant de partir (≥2)."""
    user = await get_current_user(request)
    body = await request.json()
    rental = await db.car_self_rentals.find_one({"id": rental_id, "user_id": user["id"]}, {"_id": 0})
    if not rental:
        raise HTTPException(status_code=404, detail="Location introuvable")
    if rental.get("status") != "awaiting_pickup":
        raise HTTPException(status_code=409, detail="Les photos de retrait se prennent après validation du permis, avant le départ")
    photos = _clean_photos(body.get("photos"))
    if len(photos) < MIN_INSPECTION_PHOTOS:
        raise HTTPException(status_code=400, detail=f"Au moins {MIN_INSPECTION_PHOTOS} photos d'état des lieux sont requises")
    await db.car_self_rentals.update_one(
        {"id": rental_id}, {"$set": {"pickup_photos": photos, "pickup_inspected_at": _now()}})
    return {"ok": True, "pickup_photos": photos}


# ============================================================
#  CAUTION (Stripe Checkout — débitée à la remise, recréditée au retour sur SB Pay)
# ============================================================
@router.post("/{rental_id}/deposit-checkout")
async def deposit_checkout(rental_id: str, request: Request):
    user = await get_current_user(request)
    body = await request.json()
    origin_url = body.get("origin_url")
    if not origin_url:
        raise HTTPException(status_code=400, detail="Origin URL requis")
    rental = await db.car_self_rentals.find_one({"id": rental_id, "user_id": user["id"]}, {"_id": 0})
    if not rental:
        raise HTTPException(status_code=404, detail="Location introuvable")
    if rental.get("status") != "awaiting_pickup":
        raise HTTPException(status_code=409, detail="La caution se règle après validation du permis, avant le retrait")
    if rental.get("deposit_status") == "held":
        raise HTTPException(status_code=409, detail="Caution déjà réglée")
    if len(rental.get("pickup_photos") or []) < MIN_INSPECTION_PHOTOS:
        raise HTTPException(status_code=400, detail="Photos d'état des lieux (retrait) requises avant de payer la caution")
    amount = round(float(rental.get("deposit_amount", 0) or 0), 2)
    if amount <= 0:
        await db.car_self_rentals.update_one({"id": rental_id}, {"$set": {"deposit_status": "none", "status": "active"}})
        return {"ok": True, "no_deposit": True}

    return_path = "/location-voiture"
    success_url = f"{origin_url}{return_path}?deposit_session={{CHECKOUT_SESSION_ID}}"
    cancel_url = f"{origin_url}{return_path}"
    stripe = _get_stripe(request)
    session = await stripe.create_checkout_session(CheckoutSessionRequest(
        amount=float(amount), currency="eur", success_url=success_url, cancel_url=cancel_url,
        metadata={"user_id": user["id"], "type": "car_deposit", "rental_id": rental_id, "amount": str(amount)},
    ))
    now = _now()
    await db.payment_transactions.insert_one({
        "id": f"pay_{uuid.uuid4().hex[:12]}", "session_id": session.session_id, "user_id": user["id"],
        "amount": amount, "currency": "EUR", "type": "car_deposit",
        "payment_status": "pending", "status": "initiated",
        "metadata": {"rental_id": rental_id}, "created_at": now, "updated_at": now,
    })
    return {"url": session.url, "session_id": session.session_id}


@router.get("/deposit-status/{session_id}")
async def deposit_status(session_id: str, request: Request):
    user = await get_current_user(request)
    tx = await db.payment_transactions.find_one(
        {"session_id": session_id, "user_id": user["id"], "type": "car_deposit"}, {"_id": 0})
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
            await db.car_self_rentals.update_one(
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
_FLEET_FIELDS = ("name", "make", "model", "year", "category", "transmission", "seats", "fuel",
                 "price_per_day", "price_per_hour", "deposit_amount", "location_name",
                 "image_url", "plate", "description", "status", "active")


@admin_router.get("/fleet")
async def admin_fleet(request: Request):
    await require_role(request, ["admin"])
    items = await db.car_fleet.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return {"cars": items}


@admin_router.post("/fleet")
async def admin_create_car(request: Request):
    await require_role(request, ["admin"], permission="server.settings.edit")
    body = await request.json()
    car = {"id": f"car_{uuid.uuid4().hex[:10]}", "created_at": _now(),
           "name": str(body.get("name") or "Voiture")[:80],
           "make": str(body.get("make") or "")[:40],
           "model": str(body.get("model") or "")[:80],
           "year": int(body.get("year") or 0) or None,
           "category": str(body.get("category") or "economy")[:20],
           "transmission": str(body.get("transmission") or "manual")[:20],
           "seats": int(body.get("seats") or 5),
           "fuel": str(body.get("fuel") or "Essence")[:20],
           "price_per_day": max(0.0, float(body.get("price_per_day") or 0)),
           "price_per_hour": max(0.0, float(body.get("price_per_hour") or 0)),
           "deposit_amount": max(0.0, float(body.get("deposit_amount") or 0)),
           "location_name": str(body.get("location_name") or "Agence")[:80],
           "image_url": str(body.get("image_url") or "")[:600],
           "plate": str(body.get("plate") or "")[:20],
           "description": str(body.get("description") or "")[:400],
           "status": "available", "active": True}
    await db.car_fleet.insert_one(dict(car))
    return {"ok": True, "car": car}


@admin_router.put("/fleet/{car_id}")
async def admin_update_car(car_id: str, request: Request):
    await require_role(request, ["admin"], permission="server.settings.edit")
    body = await request.json()
    update = {}
    for f in _FLEET_FIELDS:
        if f not in body:
            continue
        if f in ("price_per_day", "price_per_hour", "deposit_amount"):
            update[f] = max(0.0, float(body[f] or 0))
        elif f in ("year", "seats"):
            update[f] = int(body[f] or 0)
        elif f == "active":
            update[f] = bool(body[f])
        else:
            update[f] = str(body[f])[:600]
    if update:
        await db.car_fleet.update_one({"id": car_id}, {"$set": update})
    car = await db.car_fleet.find_one({"id": car_id}, {"_id": 0})
    return {"ok": True, "car": car}


@admin_router.delete("/fleet/{car_id}")
async def admin_delete_car(car_id: str, request: Request):
    await require_role(request, ["admin"], permission="server.settings.edit")
    await db.car_fleet.update_one({"id": car_id}, {"$set": {"active": False}})
    return {"ok": True}


@admin_router.get("/rentals")
async def admin_rentals(request: Request):
    await require_role(request, ["admin"])
    items = await db.car_self_rentals.find({}, {"_id": 0}).sort("created_at", -1).to_list(300)
    pending = [r for r in items if r.get("license_status") == "pending"]
    return {"rentals": items, "pending_license_count": len(pending)}


@admin_router.post("/rentals/{rental_id}/license")
async def admin_review_license(rental_id: str, request: Request):
    await require_role(request, ["admin"], permission="server.settings.edit")
    body = await request.json()
    approve = bool(body.get("approve"))
    rental = await db.car_self_rentals.find_one({"id": rental_id}, {"_id": 0})
    if not rental:
        raise HTTPException(status_code=404, detail="Location introuvable")
    if rental.get("license_status") != "pending":
        raise HTTPException(status_code=409, detail="Permis déjà traité")

    if approve:
        loc = rental.get("location_name") or "l'agence"
        await db.car_self_rentals.update_one(
            {"id": rental_id}, {"$set": {"license_status": "approved", "status": "awaiting_pickup",
                                         "license_reviewed_at": _now()}})
        await create_notification(rental["user_id"], "car_rental_approved",
                                  "Permis validé ✅ — voiture réservée",
                                  f"Votre location {rental['car_name']} est confirmée. Présentez-vous à {loc} pour le retrait.",
                                  data={"rental_id": rental_id})
        return {"ok": True, "status": "awaiting_pickup"}

    refund = float(rental.get("price_paid", 0) or 0)
    if refund > 0:
        wallet = await db.wallets.find_one({"user_id": rental["user_id"]})
        bal = round((wallet.get("balance", 0) if wallet else 0) + refund, 2)
        await db.wallets.update_one({"user_id": rental["user_id"]}, {"$set": {"balance": bal}}, upsert=True)
        await db.wallet_transactions.insert_one({
            "id": f"tx_{uuid.uuid4().hex[:12]}", "user_id": rental["user_id"], "type": "Refund",
            "amount": refund, "balance_after": bal,
            "description": f"Remboursement location {rental['car_name']} (permis refusé)",
            "status": "completed", "created_at": _now()})
    await db.car_self_rentals.update_one(
        {"id": rental_id}, {"$set": {"license_status": "rejected", "status": "rejected",
                                     "reject_reason": str(body.get("reason") or "")[:200],
                                     "license_reviewed_at": _now()}})
    await db.car_fleet.update_one({"id": rental["car_id"]}, {"$set": {"status": "available"}})
    await create_notification(rental["user_id"], "car_rental_rejected",
                              "Location refusée — remboursée",
                              "Votre permis n'a pas pu être validé. La location a été remboursée sur votre SB Pay.",
                              data={"rental_id": rental_id})
    return {"ok": True, "status": "rejected", "refunded": refund}


@admin_router.post("/rentals/{rental_id}/return")
async def admin_return(rental_id: str, request: Request):
    await require_role(request, ["admin"], permission="server.settings.edit")
    body = {}
    try:
        body = await request.json()
    except Exception:
        body = {}
    rental = await db.car_self_rentals.find_one({"id": rental_id}, {"_id": 0})
    if not rental:
        raise HTTPException(status_code=404, detail="Location introuvable")
    if rental.get("status") not in ("active", "awaiting_pickup"):
        raise HTTPException(status_code=409, detail="Cette location ne peut pas être clôturée")

    return_pics = _clean_photos(body.get("return_photos"))
    if len(return_pics) < MIN_INSPECTION_PHOTOS:
        raise HTTPException(status_code=400, detail=f"Au moins {MIN_INSPECTION_PHOTOS} photos d'état des lieux (retour) sont requises pour clôturer")

    held = float(rental.get("deposit_held_amount", 0) or 0)
    try:
        damage = max(0.0, float(body.get("damage_fees") or 0))
    except (TypeError, ValueError):
        damage = 0.0
    damage = min(damage, held)
    refund = round(held - damage, 2)

    if held > 0 and refund > 0:
        wallet = await db.wallets.find_one({"user_id": rental["user_id"]})
        bal = round((wallet.get("balance", 0) if wallet else 0) + refund, 2)
        await db.wallets.update_one({"user_id": rental["user_id"]}, {"$set": {"balance": bal}}, upsert=True)
        await db.wallet_transactions.insert_one({
            "id": f"tx_{uuid.uuid4().hex[:12]}", "user_id": rental["user_id"], "type": "Refund",
            "amount": refund, "balance_after": bal,
            "description": f"Restitution caution voiture {rental['car_name']}"
                           + (f" (− {damage}€ dommages)" if damage else ""),
            "status": "completed", "created_at": _now()})

    await db.car_self_rentals.update_one(
        {"id": rental_id}, {"$set": {"status": "returned", "returned_at": _now(),
                                     "damage_fees": damage, "deposit_refunded": refund,
                                     "return_photos": return_pics,
                                     "deposit_status": "released" if held else rental.get("deposit_status"),
                                     "return_notes": str(body.get("notes") or "")[:300]}})
    await db.car_fleet.update_one({"id": rental["car_id"]}, {"$set": {"status": "available"}})
    await create_notification(
        rental["user_id"], "car_rental_returned", "Location terminée 🚗",
        (f"Caution restituée : {refund}€ sur votre SB Pay" + (f" ({damage}€ retenus pour dommages)." if damage else "."))
        if held else "Merci d'avoir loué avec SB Drive.",
        data={"rental_id": rental_id})
    return {"ok": True, "status": "returned", "deposit_refunded": refund, "damage_fees": damage}
