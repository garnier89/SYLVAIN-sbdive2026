"""Covoiturage (carpool) — système complet avec paiement SB Pay sécurisé.

Modèle de paiement : SÉQUESTRE (escrow).
- À la réservation, le montant (prix/place × sièges) est débité du portefeuille
  SB Pay du passager et conservé par la plateforme (séquestre).
- Si le passager annule AVANT le départ → remboursement intégral.
- À la complétion du trajet (par le chauffeur ou libération auto après le départ)
  → le séquestre est reversé au chauffeur, moins la commission plateforme (15 %).
- Si le chauffeur annule tout le trajet → tous les passagers sont remboursés.

Seul SB Pay (portefeuille) est accepté pour garantir la sécurité des fonds.
"""
import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, Request, HTTPException

from core.config import db
from core.deps import get_current_user, require_role
from core.notifications import create_notification

router = APIRouter(prefix="/carpool", tags=["carpool"])

CARPOOL_CONFIG_KEY = "carpool"
CARPOOL_DEFAULTS = {
    "enabled": True,
    "commission_percent": 15.0,
    "max_seats_per_booking": 4,
    "max_seats_per_ride": 8,
    "auto_release_hours": 12,
    "currency": "EUR",
}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _parse_dt(s):
    if not s:
        return None
    try:
        dt = datetime.fromisoformat(str(s).replace("Z", "+00:00"))
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except Exception:
        return None


async def get_carpool_config() -> dict:
    doc = await db.service_configs.find_one({"service_key": CARPOOL_CONFIG_KEY}, {"_id": 0}) or {}
    cfg = {**CARPOOL_DEFAULTS, **{k: v for k, v in doc.items() if k != "service_key"}}
    cfg["commission_percent"] = float(cfg.get("commission_percent") or 0)
    cfg["max_seats_per_booking"] = int(cfg.get("max_seats_per_booking") or 1)
    return cfg


def _seats_left(ride: dict) -> int:
    return max(0, int(ride.get("available_seats", 0)) - int(ride.get("seats_taken", 0)))


def _public_ride(ride: dict, *, reveal_contact: bool = False) -> dict:
    out = {k: v for k, v in ride.items() if k != "_id"}
    out["seats_left"] = _seats_left(ride)
    # Masque les contacts par défaut ; révélés une fois la réservation faite / pour le chauffeur.
    if not reveal_contact:
        out.pop("driver_phone", None)
        for p in out.get("passengers", []):
            p.pop("phone", None)
    return out


# ── Crédit / débit portefeuille (mêmes primitives que le flux course) ──────
async def _wallet_debit_atomic(user_id: str, amount: float, description: str) -> bool:
    """Débit atomique : échoue (False) si solde insuffisant."""
    amount = round(float(amount), 2)
    if amount <= 0:
        return True
    res = await db.wallets.update_one(
        {"user_id": user_id, "balance": {"$gte": amount}},
        {"$inc": {"balance": -amount}},
    )
    if not res.modified_count:
        return False
    w = await db.wallets.find_one({"user_id": user_id}, {"_id": 0, "balance": 1})
    await db.wallet_transactions.insert_one({
        "id": f"tx_{uuid.uuid4().hex[:12]}", "user_id": user_id, "type": "Booking",
        "amount": -amount, "balance_after": round((w or {}).get("balance", 0), 2),
        "description": description, "status": "completed", "created_at": _now(),
    })
    return True


async def _wallet_credit(user_id: str, amount: float, description: str, tx_type: str = "Refund") -> None:
    amount = round(float(amount), 2)
    if amount <= 0 or not user_id:
        return
    await db.wallets.update_one(
        {"user_id": user_id},
        {"$inc": {"balance": amount},
         "$setOnInsert": {"user_id": user_id, "currency": "EUR", "created_at": _now()}},
        upsert=True,
    )
    w = await db.wallets.find_one({"user_id": user_id}, {"_id": 0, "balance": 1})
    await db.wallet_transactions.insert_one({
        "id": f"tx_{uuid.uuid4().hex[:12]}", "user_id": user_id, "type": tx_type,
        "amount": amount, "balance_after": round((w or {}).get("balance", 0), 2),
        "description": description, "status": "completed", "created_at": _now(),
    })


# ── Config (public + admin) ────────────────────────────────────────────────
@router.get("/config")
async def carpool_config():
    cfg = await get_carpool_config()
    return {"commission_percent": cfg["commission_percent"], "currency": cfg["currency"],
            "max_seats_per_booking": cfg["max_seats_per_booking"], "enabled": cfg["enabled"]}


@router.get("/admin/config")
async def carpool_admin_get(request: Request):
    await require_role(request, ["admin"])
    return await get_carpool_config()


@router.put("/admin/config")
async def carpool_admin_set(request: Request):
    await require_role(request, ["admin"])
    body = await request.json()
    update = {"service_key": CARPOOL_CONFIG_KEY}
    for k in ("enabled", "commission_percent", "max_seats_per_booking", "max_seats_per_ride", "auto_release_hours", "currency"):
        if k in body:
            update[k] = body[k]
    await db.service_configs.update_one({"service_key": CARPOOL_CONFIG_KEY}, {"$set": update}, upsert=True)
    return await get_carpool_config()


# ── Publier un trajet ───────────────────────────────────────────────────────
@router.post("/rides")
async def create_carpool_ride(request: Request):
    user = await get_current_user(request)
    cfg = await get_carpool_config()
    if not cfg["enabled"]:
        raise HTTPException(status_code=503, detail="Covoiturage temporairement indisponible")
    body = await request.json()

    pickup = str(body.get("pickup_address") or "").strip()
    dropoff = str(body.get("dropoff_address") or "").strip()
    departure = str(body.get("departure_date") or "").strip()
    if not pickup or not dropoff:
        raise HTTPException(status_code=400, detail="Départ et destination requis")
    dep_dt = _parse_dt(departure)
    if not dep_dt:
        raise HTTPException(status_code=400, detail="Date de départ invalide")
    if dep_dt < datetime.now(timezone.utc) - timedelta(minutes=5):
        raise HTTPException(status_code=400, detail="La date de départ doit être dans le futur")
    try:
        seats = int(body.get("available_seats", 3))
        price = round(float(body.get("price_per_seat", 10.0)), 2)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="Sièges ou prix invalides")
    if not (1 <= seats <= int(cfg["max_seats_per_ride"])):
        raise HTTPException(status_code=400, detail=f"Sièges entre 1 et {cfg['max_seats_per_ride']}")
    if price < 0 or price > 1000:
        raise HTTPException(status_code=400, detail="Prix par place invalide")

    ride = {
        "id": f"carpool_{uuid.uuid4().hex[:12]}",
        "driver_id": user["id"], "driver_name": user.get("name"), "driver_phone": user.get("phone"),
        "pickup_address": pickup, "dropoff_address": dropoff, "departure_date": departure,
        "available_seats": seats, "seats_taken": 0, "price_per_seat": price, "currency": cfg["currency"],
        "status": "open", "passengers": [], "escrow_total": 0.0, "total_commission": 0.0,
        "created_at": _now(),
    }
    await db.carpool_rides.insert_one(dict(ride))
    return _public_ride(ride, reveal_contact=True)


# ── Rechercher des trajets ──────────────────────────────────────────────────
@router.get("/rides")
async def search_carpool_rides(pickup: Optional[str] = None, dropoff: Optional[str] = None,
                               date: Optional[str] = None, limit: int = 20):
    query = {"status": {"$in": ["open", "full"]}}
    if pickup:
        query["pickup_address"] = {"$regex": pickup, "$options": "i"}
    if dropoff:
        query["dropoff_address"] = {"$regex": dropoff, "$options": "i"}
    if date:
        query["departure_date"] = {"$regex": f"^{date}"}
    rides = await db.carpool_rides.find(query).sort("departure_date", 1).limit(limit).to_list(limit)
    return [_public_ride(r) for r in rides]


# ── Réserver des places (avec séquestre SB Pay) ─────────────────────────────
@router.post("/rides/{ride_id}/book")
async def book_carpool_seat(ride_id: str, request: Request):
    user = await get_current_user(request)
    body = await request.json() if request.headers.get("content-length") else {}
    cfg = await get_carpool_config()
    try:
        seats = int(body.get("seats", 1))
    except (TypeError, ValueError):
        seats = 1
    if seats < 1:
        raise HTTPException(status_code=400, detail="Nombre de places invalide")
    if seats > int(cfg["max_seats_per_booking"]):
        raise HTTPException(status_code=400, detail=f"Maximum {cfg['max_seats_per_booking']} places par réservation")

    ride = await db.carpool_rides.find_one({"id": ride_id})
    if not ride or ride.get("status") not in ("open", "full"):
        raise HTTPException(status_code=404, detail="Trajet introuvable ou complet")
    if ride["driver_id"] == user["id"]:
        raise HTTPException(status_code=400, detail="Vous ne pouvez pas réserver votre propre trajet")
    if any(p["user_id"] == user["id"] and p.get("status") == "booked" for p in ride.get("passengers", [])):
        raise HTTPException(status_code=400, detail="Vous avez déjà réservé ce trajet")

    amount = round(float(ride["price_per_seat"]) * seats, 2)

    # 1) Réservation ATOMIQUE des sièges (évite la sur-réservation concurrente).
    reserved = await db.carpool_rides.find_one_and_update(
        {"id": ride_id, "status": {"$in": ["open", "full"]},
         "$expr": {"$lte": [{"$add": [{"$ifNull": ["$seats_taken", 0]}, seats]}, "$available_seats"]}},
        {"$inc": {"seats_taken": seats}},
    )
    if not reserved:
        raise HTTPException(status_code=400, detail="Plus assez de places disponibles")

    # 2) Débit SB Pay (séquestre). Rollback des sièges si solde insuffisant.
    ok = await _wallet_debit_atomic(
        user["id"], amount,
        f"Réservation covoiturage {ride['pickup_address']} → {ride['dropoff_address']} ({seats} place(s), séquestre)")
    if not ok:
        await db.carpool_rides.update_one({"id": ride_id}, {"$inc": {"seats_taken": -seats}})
        w = await db.wallets.find_one({"user_id": user["id"]}, {"_id": 0, "balance": 1})
        bal = round(float((w or {}).get("balance", 0) or 0), 2)
        raise HTTPException(status_code=400, detail=f"Solde SB Pay insuffisant ({amount} {ride['currency']}, dispo {bal})")

    # 3) Ajoute le passager + met à jour le séquestre / statut.
    passenger = {"user_id": user["id"], "name": user.get("name"), "phone": user.get("phone"),
                 "seats": seats, "amount_paid": amount, "status": "booked", "booked_at": _now()}
    await db.carpool_rides.update_one(
        {"id": ride_id},
        {"$push": {"passengers": passenger}, "$inc": {"escrow_total": amount}})
    updated = await db.carpool_rides.find_one({"id": ride_id})
    if _seats_left(updated) <= 0:
        await db.carpool_rides.update_one({"id": ride_id}, {"$set": {"status": "full"}})
        updated["status"] = "full"

    await create_notification(
        ride["driver_id"], "carpool_booking", "Nouvelle réservation covoiturage 🚗",
        f"{user.get('name') or 'Un passager'} a réservé {seats} place(s) · {ride['pickup_address']} → {ride['dropoff_address']}",
        data={"ride_id": ride_id})
    await create_notification(
        user["id"], "carpool_booked", "Place réservée ✅",
        f"{ride['pickup_address']} → {ride['dropoff_address']} · {amount} {ride['currency']} (séquestre). Contact chauffeur disponible.",
        data={"ride_id": ride_id})

    return {"ok": True, "message": "Place réservée", "amount_paid": amount, "seats": seats,
            "driver_phone": ride.get("driver_phone"), "ride": _public_ride(updated, reveal_contact=True)}


# ── Annuler sa réservation (remboursement avant départ) ─────────────────────
@router.post("/rides/{ride_id}/cancel")
async def cancel_carpool_booking(ride_id: str, request: Request):
    user = await get_current_user(request)
    ride = await db.carpool_rides.find_one({"id": ride_id})
    if not ride:
        raise HTTPException(status_code=404, detail="Trajet introuvable")
    pax = next((p for p in ride.get("passengers", []) if p["user_id"] == user["id"] and p.get("status") == "booked"), None)
    if not pax:
        raise HTTPException(status_code=404, detail="Réservation active introuvable")
    if ride.get("status") in ("completed", "cancelled"):
        raise HTTPException(status_code=400, detail="Trajet déjà terminé ou annulé")

    dep = _parse_dt(ride.get("departure_date"))
    refundable = dep is None or dep > datetime.now(timezone.utc)
    amount = round(float(pax.get("amount_paid", 0)), 2)
    seats = int(pax.get("seats", 1))

    await db.carpool_rides.update_one(
        {"id": ride_id, "passengers.user_id": user["id"]},
        {"$set": {"passengers.$.status": "cancelled", "passengers.$.cancelled_at": _now(),
                  "status": "open"},
         "$inc": {"seats_taken": -seats, "escrow_total": -amount}})

    if refundable and amount > 0:
        await _wallet_credit(user["id"], amount,
                             f"Remboursement covoiturage {ride['pickup_address']} → {ride['dropoff_address']}", "Refund")
    await create_notification(
        ride["driver_id"], "carpool_cancel", "Annulation covoiturage",
        f"{user.get('name') or 'Un passager'} a annulé {seats} place(s).", data={"ride_id": ride_id})
    return {"ok": True, "refunded": amount if refundable else 0.0}


# ── Terminer le trajet : libère le séquestre au chauffeur (moins commission) ─
async def _release_escrow(ride: dict, *, reason: str = "completed") -> dict:
    cfg = await get_carpool_config()
    pct = float(cfg["commission_percent"]) / 100.0
    total_driver, total_comm = 0.0, 0.0
    for p in ride.get("passengers", []):
        if p.get("status") != "booked":
            continue
        amount = round(float(p.get("amount_paid", 0)), 2)
        commission = round(amount * pct, 2)
        driver_part = round(amount - commission, 2)
        total_driver += driver_part
        total_comm += commission
        await db.carpool_rides.update_one(
            {"id": ride["id"], "passengers.user_id": p["user_id"]},
            {"$set": {"passengers.$.status": "completed"}})
    total_driver = round(total_driver, 2)
    total_comm = round(total_comm, 2)
    if total_driver > 0:
        await _wallet_credit(ride["driver_id"], total_driver,
                             f"Gain covoiturage {ride['pickup_address']} → {ride['dropoff_address']}", "Earning")
    if total_comm > 0:
        await db.carpool_commissions.insert_one({
            "id": f"cc_{uuid.uuid4().hex[:10]}", "ride_id": ride["id"], "amount": total_comm,
            "created_at": _now()})
    await db.carpool_rides.update_one(
        {"id": ride["id"]},
        {"$set": {"status": "completed", "escrow_released": True, "released_reason": reason,
                  "completed_at": _now()}, "$inc": {"total_commission": total_comm}})
    return {"driver_credited": total_driver, "commission": total_comm}


@router.post("/rides/{ride_id}/complete")
async def complete_carpool_ride(ride_id: str, request: Request):
    user = await get_current_user(request)
    ride = await db.carpool_rides.find_one({"id": ride_id})
    if not ride:
        raise HTTPException(status_code=404, detail="Trajet introuvable")
    if ride["driver_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Seul le chauffeur peut terminer le trajet")
    if ride.get("status") in ("completed", "cancelled"):
        raise HTTPException(status_code=400, detail="Trajet déjà terminé ou annulé")
    res = await _release_escrow(ride, reason="driver")
    for p in ride.get("passengers", []):
        if p.get("status") == "booked":
            await create_notification(p["user_id"], "carpool_completed", "Trajet covoiturage terminé 🏁",
                                      f"{ride['pickup_address']} → {ride['dropoff_address']}. Merci d'avoir voyagé avec SB !",
                                      data={"ride_id": ride_id})
    await create_notification(ride["driver_id"], "carpool_payout", "Paiement covoiturage reçu 💶",
                              f"{res['driver_credited']} {ride['currency']} crédités sur votre portefeuille SB Pay.",
                              data={"ride_id": ride_id})
    return {"ok": True, **res}


# ── Le chauffeur annule tout le trajet : rembourse tous les passagers ───────
@router.post("/rides/{ride_id}/cancel-ride")
async def cancel_carpool_ride(ride_id: str, request: Request):
    user = await get_current_user(request)
    ride = await db.carpool_rides.find_one({"id": ride_id})
    if not ride:
        raise HTTPException(status_code=404, detail="Trajet introuvable")
    if ride["driver_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Seul le chauffeur peut annuler le trajet")
    if ride.get("status") in ("completed", "cancelled"):
        raise HTTPException(status_code=400, detail="Trajet déjà terminé ou annulé")
    refunded = 0.0
    for p in ride.get("passengers", []):
        if p.get("status") != "booked":
            continue
        amount = round(float(p.get("amount_paid", 0)), 2)
        refunded += amount
        await _wallet_credit(p["user_id"], amount,
                             f"Remboursement covoiturage annulé {ride['pickup_address']} → {ride['dropoff_address']}", "Refund")
        await create_notification(p["user_id"], "carpool_cancel_ride", "Trajet covoiturage annulé",
                                  f"Le chauffeur a annulé. Vous êtes remboursé de {amount} {ride['currency']}.",
                                  data={"ride_id": ride_id})
        await db.carpool_rides.update_one(
            {"id": ride_id, "passengers.user_id": p["user_id"]},
            {"$set": {"passengers.$.status": "refunded"}})
    await db.carpool_rides.update_one(
        {"id": ride_id}, {"$set": {"status": "cancelled", "escrow_total": 0.0, "cancelled_at": _now()}})
    return {"ok": True, "refunded": round(refunded, 2)}


# ── Mes trajets ─────────────────────────────────────────────────────────────
@router.get("/my-rides")
async def my_carpool_rides(request: Request):
    user = await get_current_user(request)
    as_driver = await db.carpool_rides.find({"driver_id": user["id"]}).sort("departure_date", -1).to_list(50)
    as_passenger = await db.carpool_rides.find(
        {"passengers.user_id": user["id"]}).sort("departure_date", -1).to_list(50)
    return {
        "as_driver": [_public_ride(r, reveal_contact=True) for r in as_driver],
        "as_passenger": [_public_ride(r, reveal_contact=True) for r in as_passenger],
    }


# ── Libération automatique du séquestre après le départ (filet de sécurité) ─
async def carpool_autorelease_loop():
    """Toutes les 30 min : libère le séquestre au chauffeur pour les trajets dont
    le départ est passé depuis > auto_release_hours et que le chauffeur n'a pas
    clôturés (évite que les fonds restent bloqués indéfiniment)."""
    import asyncio
    while True:
        try:
            cfg = await get_carpool_config()
            grace = timedelta(hours=float(cfg.get("auto_release_hours", 12)))
            now = datetime.now(timezone.utc)
            cursor = db.carpool_rides.find({"status": {"$in": ["open", "full"]}, "escrow_total": {"$gt": 0}})
            async for ride in cursor:
                dep = _parse_dt(ride.get("departure_date"))
                if dep and (now - dep) >= grace:
                    res = await _release_escrow(ride, reason="auto")
                    for p in ride.get("passengers", []):
                        if p.get("status") == "booked":
                            await create_notification(
                                p["user_id"], "carpool_completed", "Trajet covoiturage clôturé 🏁",
                                f"{ride['pickup_address']} → {ride['dropoff_address']}.", data={"ride_id": ride["id"]})
                    if res["driver_credited"] > 0:
                        await create_notification(
                            ride["driver_id"], "carpool_payout", "Paiement covoiturage reçu 💶",
                            f"{res['driver_credited']} {ride['currency']} crédités (clôture automatique).",
                            data={"ride_id": ride["id"]})
        except Exception as e:  # noqa: BLE001
            try:
                from core.config import logger
                logger.error(f"carpool_autorelease_loop error: {e}")
            except Exception:
                pass
        await asyncio.sleep(1800)
