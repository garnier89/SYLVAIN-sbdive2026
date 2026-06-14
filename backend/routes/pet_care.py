"""SB Animaux — pet care: reusable pet profiles + service bookings + appointments.

Payment is taken at booking time (sbpay wallet debit, refunded on cancel; cash/card
collected on site). Providers are read from the existing `pet_providers` catalog.
"""
from fastapi import APIRouter, Request, HTTPException
import uuid
from datetime import datetime, timezone, timedelta

from core.config import db
from core.deps import get_current_user

router = APIRouter(prefix="/pet-care", tags=["pet-care"])

HOME_SURCHARGE = 10.0  # supplément intervention à domicile

SERVICES = [
    {"id": "toilettage", "label": "Toilettage", "icon": "Scissors", "base_price": 40.0, "home_ok": True, "category": "Toilettage"},
    {"id": "promenade", "label": "Promenade", "icon": "PawPrint", "base_price": 15.0, "home_ok": True, "category": "Promenade"},
    {"id": "pension", "label": "Pension / Garde", "icon": "House", "base_price": 30.0, "home_ok": True, "category": "Pension"},
    {"id": "veterinaire", "label": "Vétérinaire", "icon": "Stethoscope", "base_price": 50.0, "home_ok": True, "category": "Vétérinaire"},
]
_SVC_BY_ID = {s["id"]: s for s in SERVICES}
SPECIES = ["Chien", "Chat", "Oiseau", "Rongeur", "Reptile", "Autre"]


def _now():
    return datetime.now(timezone.utc).isoformat()


# ── Catalog ─────────────────────────────────────────────────────────────────
@router.get("/services")
async def list_services():
    return {"services": SERVICES, "home_surcharge": HOME_SURCHARGE, "species": SPECIES}


@router.get("/providers")
async def list_providers(category: str = None):
    q = {}
    if category:
        q["category"] = category
    providers = await db.pet_providers.find(q, {"_id": 0}).to_list(200)
    return providers


# ── Pet profiles (Mes animaux) ──────────────────────────────────────────────
@router.get("/pets")
async def list_pets(request: Request):
    user = await get_current_user(request)
    pets = await db.user_pets.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(50)
    return pets


@router.post("/pets")
async def create_pet(request: Request):
    user = await get_current_user(request)
    body = await request.json()
    name = (body.get("name") or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Le nom de l'animal est requis")
    pet = {
        "id": f"pet_{uuid.uuid4().hex[:12]}",
        "user_id": user["id"],
        "name": name,
        "species": body.get("species", "Chien"),
        "breed": body.get("breed", ""),
        "age": body.get("age", ""),
        "weight": body.get("weight", ""),
        "photo": body.get("photo", ""),
        "notes": body.get("notes", ""),
        "created_at": _now(),
    }
    await db.user_pets.insert_one(dict(pet))
    return pet


@router.put("/pets/{pet_id}")
async def update_pet(pet_id: str, request: Request):
    user = await get_current_user(request)
    body = await request.json()
    fields = {k: body[k] for k in ("name", "species", "breed", "age", "weight", "photo", "notes") if k in body}
    res = await db.user_pets.update_one({"id": pet_id, "user_id": user["id"]}, {"$set": fields})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Animal introuvable")
    pet = await db.user_pets.find_one({"id": pet_id}, {"_id": 0})
    return pet


@router.delete("/pets/{pet_id}")
async def delete_pet(pet_id: str, request: Request):
    user = await get_current_user(request)
    res = await db.user_pets.delete_one({"id": pet_id, "user_id": user["id"]})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Animal introuvable")
    return {"ok": True}


# ── Health record (Carnet de santé) ─────────────────────────────────────────
HEALTH_KINDS = {"vaccine", "treatment", "document", "weight"}


def _today():
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


@router.get("/pets/{pet_id}/health")
async def get_health(pet_id: str, request: Request):
    user = await get_current_user(request)
    pet = await db.user_pets.find_one({"id": pet_id, "user_id": user["id"]}, {"_id": 0})
    if not pet:
        raise HTTPException(status_code=404, detail="Animal introuvable")
    recs = await db.pet_health_records.find({"pet_id": pet_id, "user_id": user["id"]}, {"_id": 0}).to_list(500)
    grouped = {"vaccines": [], "treatments": [], "documents": [], "weights": []}
    key = {"vaccine": "vaccines", "treatment": "treatments", "document": "documents", "weight": "weights"}
    for r in recs:
        grouped[key.get(r["kind"], "documents")].append(r)
    grouped["vaccines"].sort(key=lambda x: x.get("next_due") or x.get("date") or "", reverse=True)
    grouped["treatments"].sort(key=lambda x: x.get("next_due") or x.get("date") or "", reverse=True)
    grouped["weights"].sort(key=lambda x: x.get("date") or "")
    # Upcoming reminders for this pet (next_due within 30 days).
    horizon = (datetime.now(timezone.utc) + timedelta(days=30)).strftime("%Y-%m-%d")
    today = _today()
    reminders = sorted(
        [r for r in recs if r.get("next_due") and today <= r["next_due"] <= horizon],
        key=lambda x: x["next_due"])
    return {"pet": pet, **grouped, "reminders": reminders}


@router.post("/pets/{pet_id}/health")
async def add_health(pet_id: str, request: Request):
    user = await get_current_user(request)
    pet = await db.user_pets.find_one({"id": pet_id, "user_id": user["id"]}, {"_id": 0})
    if not pet:
        raise HTTPException(status_code=404, detail="Animal introuvable")
    body = await request.json()
    kind = body.get("kind")
    if kind not in HEALTH_KINDS:
        raise HTTPException(status_code=400, detail="Type d'entrée invalide")
    if kind in ("vaccine", "treatment", "document") and not (body.get("name") or "").strip():
        raise HTTPException(status_code=400, detail="Le nom est requis")
    if kind == "weight" and not body.get("weight"):
        raise HTTPException(status_code=400, detail="Le poids est requis")
    if kind == "document" and not body.get("url"):
        raise HTTPException(status_code=400, detail="Téléversez le document")
    rec = {
        "id": f"ph_{uuid.uuid4().hex[:12]}",
        "user_id": user["id"], "pet_id": pet_id, "pet_name": pet["name"],
        "kind": kind,
        "name": (body.get("name") or "").strip(),
        "date": body.get("date") or _today(),
        "next_due": body.get("next_due") or None,
        "url": body.get("url", ""),
        "weight": body.get("weight", ""),
        "notes": body.get("notes", ""),
        "last_reminded_at": None,
        "created_at": _now(),
    }
    await db.pet_health_records.insert_one(dict(rec))
    return rec


@router.delete("/health/{record_id}")
async def delete_health(record_id: str, request: Request):
    user = await get_current_user(request)
    res = await db.pet_health_records.delete_one({"id": record_id, "user_id": user["id"]})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Entrée introuvable")
    return {"ok": True}


@router.get("/health/reminders")
async def list_reminders(request: Request):
    """All upcoming health reminders across the user's pets (next 30 days)."""
    user = await get_current_user(request)
    horizon = (datetime.now(timezone.utc) + timedelta(days=30)).strftime("%Y-%m-%d")
    today = _today()
    recs = await db.pet_health_records.find(
        {"user_id": user["id"], "kind": {"$in": ["vaccine", "treatment"]},
         "next_due": {"$gte": today, "$lte": horizon}}, {"_id": 0}).to_list(200)
    recs.sort(key=lambda x: x["next_due"])
    return recs


async def pet_health_reminder_loop():
    """Daily: notify owners when a vaccine/treatment is due within 3 days,
    at most once per 24h (stamped on the record)."""
    import asyncio
    from core.notifications import create_notification
    while True:
        try:
            now = datetime.now(timezone.utc)
            due_by = (now + timedelta(days=3)).strftime("%Y-%m-%d")
            today = now.strftime("%Y-%m-%d")
            remind_after = (now - timedelta(hours=24)).isoformat()
            cursor = db.pet_health_records.find({
                "kind": {"$in": ["vaccine", "treatment"]},
                "next_due": {"$gte": today, "$lte": due_by},
                "$or": [{"last_reminded_at": None}, {"last_reminded_at": {"$exists": False}},
                        {"last_reminded_at": {"$lte": remind_after}}],
            })
            for r in await cursor.to_list(500):
                try:
                    await create_notification(
                        r["user_id"], "pet_health_reminder", "🐾 Rappel santé animal",
                        f"{r.get('name', 'Soin')} pour {r.get('pet_name', 'votre animal')} prévu le {r['next_due']}.",
                        {"pet_id": r.get("pet_id"), "url": "/pet-care"})
                    await db.pet_health_records.update_one(
                        {"id": r["id"]}, {"$set": {"last_reminded_at": now.isoformat()}})
                except Exception:
                    pass
        except Exception:
            pass
        await asyncio.sleep(6 * 3600)  # toutes les 6h



# ── Bookings (Mes rendez-vous) ──────────────────────────────────────────────
def _price(service_id: str, location_type: str) -> dict:
    s = _SVC_BY_ID.get(service_id)
    if not s:
        raise HTTPException(status_code=400, detail="Service invalide")
    base = float(s["base_price"])
    home_fee = HOME_SURCHARGE if (location_type == "home" and s["home_ok"]) else 0.0
    return {"base_price": base, "home_fee": home_fee, "total": round(base + home_fee, 2)}


@router.post("/estimate")
async def estimate(request: Request):
    body = await request.json()
    return _price(body.get("service"), body.get("location_type", "onsite"))


@router.post("/bookings")
async def create_booking(request: Request):
    user = await get_current_user(request)
    body = await request.json()
    service = body.get("service")
    s = _SVC_BY_ID.get(service)
    if not s:
        raise HTTPException(status_code=400, detail="Service invalide")
    pet = await db.user_pets.find_one({"id": body.get("pet_id"), "user_id": user["id"]}, {"_id": 0})
    if not pet:
        raise HTTPException(status_code=400, detail="Sélectionnez un animal")
    if not body.get("date") or not body.get("time_slot"):
        raise HTTPException(status_code=400, detail="Choisissez une date et un créneau")

    location_type = body.get("location_type", "onsite")
    breakdown = _price(service, location_type)
    total = breakdown["total"]
    payment_method = body.get("payment_method", "sbpay")

    new_balance = None
    payment_status = "on_site"
    if payment_method == "sbpay" and total > 0:
        res = await db.wallets.update_one(
            {"user_id": user["id"], "balance": {"$gte": total}},
            {"$inc": {"balance": -total}},
        )
        if res.modified_count == 0:
            raise HTTPException(status_code=400, detail="Solde SB Pay insuffisant. Rechargez votre portefeuille.")
        wallet = await db.wallets.find_one({"user_id": user["id"]}, {"_id": 0})
        new_balance = round((wallet or {}).get("balance", 0), 2)
        await db.wallet_transactions.insert_one({
            "id": f"tx_{uuid.uuid4().hex[:12]}", "user_id": user["id"], "type": "Booking",
            "amount": -total, "balance_after": new_balance,
            "description": f"SB Animaux · {s['label']} · {pet['name']}",
            "status": "completed", "created_at": _now(),
        })
        payment_status = "paid"
        try:
            from core.cashback import award_cashback
            await award_cashback(user["id"], total, "sbpay", "pet_care", ref_id=None)
        except Exception:
            pass

    booking = {
        "id": f"petbk_{uuid.uuid4().hex[:12]}",
        "user_id": user["id"],
        "service": service,
        "service_label": s["label"],
        "pet_id": pet["id"],
        "pet_name": pet["name"],
        "pet_species": pet.get("species", ""),
        "provider_id": body.get("provider_id", ""),
        "provider_name": body.get("provider_name", ""),
        "date": body.get("date"),
        "time_slot": body.get("time_slot"),
        "location_type": location_type,
        "address": body.get("address", ""),
        "notes": body.get("notes", ""),
        "payment_method": payment_method,
        "payment_status": payment_status,
        "breakdown": breakdown,
        "total_price": total,
        "status": "confirmed",
        "created_at": _now(),
    }
    await db.pet_bookings.insert_one(dict(booking))
    return {**booking, "balance": new_balance}


@router.get("/bookings")
async def list_bookings(request: Request):
    user = await get_current_user(request)
    bookings = await db.pet_bookings.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(100)
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    upcoming = [b for b in bookings if b.get("status") == "confirmed" and (b.get("date") or "") >= today]
    past = [b for b in bookings if b not in upcoming]
    return {"upcoming": upcoming, "past": past}


@router.post("/bookings/{booking_id}/cancel")
async def cancel_booking(booking_id: str, request: Request):
    user = await get_current_user(request)
    bk = await db.pet_bookings.find_one({"id": booking_id, "user_id": user["id"]}, {"_id": 0})
    if not bk:
        raise HTTPException(status_code=404, detail="Réservation introuvable")
    if bk.get("status") != "confirmed":
        raise HTTPException(status_code=400, detail="Réservation déjà annulée ou terminée")

    refunded = 0.0
    if bk.get("payment_method") == "sbpay" and bk.get("payment_status") == "paid":
        total = round(float(bk.get("total_price", 0) or 0), 2)
        await db.wallets.update_one({"user_id": user["id"]}, {"$inc": {"balance": total}}, upsert=True)
        wallet = await db.wallets.find_one({"user_id": user["id"]}, {"_id": 0})
        await db.wallet_transactions.insert_one({
            "id": f"tx_{uuid.uuid4().hex[:12]}", "user_id": user["id"], "type": "Refund",
            "amount": total, "balance_after": round((wallet or {}).get("balance", 0), 2),
            "description": f"Remboursement · {bk.get('service_label', '')} · {bk.get('pet_name', '')}",
            "status": "completed", "created_at": _now(),
        })
        refunded = total

    await db.pet_bookings.update_one(
        {"id": booking_id}, {"$set": {"status": "cancelled", "cancelled_at": _now()}})
    return {"ok": True, "refunded": refunded}
