from fastapi import APIRouter, Request, HTTPException
import uuid
from datetime import datetime, timezone
from typing import Optional

from core.config import db
from core.deps import get_current_user

router = APIRouter(prefix="/services", tags=["services"])


SERVICE_CATEGORIES = {
    "beauty": {"name": "Beauté", "services": ["Soins Capillaires", "Soins Visage", "Ongles & Manucure", "Épilation", "Maquillage & Coiffure", "Massage & Spa", "Soins Hommes", "Mains & Pieds", "Sourcils & Cils", "Exfoliation", "Bronzage", "Mariage & Pré-Mariage"]},
    "pet": {"name": "Animaux", "services": ["Toilettage", "Promenade", "Dressage", "Pension", "Garde", "Soins Vétérinaires", "Spa & Bien-être", "Alimentation & Nutrition", "Accessoires & Fournitures", "Transport", "Adoption & Élevage", "Photos & Événements"]},
    "car-care": {"name": "Entretien Auto", "services": ["Lavage Auto & Spa", "Service Batterie", "Boutique", "Livraison Carburant", "Lavage Moto & Spa", "Recharge EV", "Clés Auto", "Vidange"]},
    "towing": {"name": "Dépannage", "services": ["Remorquage Urgence", "Remorquage Plateau", "Récupération Véhicule", "Pneu Crevé", "Ouverture Porte", "Démarrage", "Panne Sèche", "Changement Batterie", "Recharge EV"]},
    "medical": {"name": "Médical", "services": ["Prendre Rendez-vous", "Vidéo Consultation", "Pharmacie", "Ambulance"]},
    "handyman": {"name": "Services à la demande", "services": ["Bricolage", "Électricien", "Plombier", "Menuisier", "Peintres", "Ménage Maison"]},
}


@router.get("/categories")
async def list_service_categories():
    return SERVICE_CATEGORIES


@router.post("/bookings")
async def create_service_booking(request: Request):
    user = await get_current_user(request)
    body = await request.json()

    booking = {
        "id": f"svcbk_{uuid.uuid4().hex[:12]}",
        "user_id": user["id"],
        "category": body["category"],
        "service_name": body["service_name"],
        "address": body.get("address", ""),
        "lat": body.get("lat"),
        "lng": body.get("lng"),
        "scheduled_date": body.get("scheduled_date"),
        "scheduled_time": body.get("scheduled_time"),
        "notes": body.get("notes", ""),
        "status": "pending",
        "provider_id": None,
        "price": body.get("price"),
        "payment_method": body.get("payment_method", "cash"),
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.service_bookings.insert_one(booking)
    booking.pop("_id", None)
    return booking


@router.get("/bookings")
async def list_service_bookings(request: Request, status: Optional[str] = None, limit: int = 20):
    user = await get_current_user(request)
    query = {"user_id": user["id"]}
    if status:
        query["status"] = status
    bookings = await db.service_bookings.find(query, {"_id": 0}).sort("created_at", -1).limit(limit).to_list(limit)
    return bookings


@router.get("/bookings/{booking_id}")
async def get_service_booking(booking_id: str, request: Request):
    user = await get_current_user(request)
    booking = await db.service_bookings.find_one({"id": booking_id, "user_id": user["id"]}, {"_id": 0})
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    return booking


@router.post("/bookings/{booking_id}/cancel")
async def cancel_service_booking(booking_id: str, request: Request):
    user = await get_current_user(request)
    result = await db.service_bookings.update_one(
        {"id": booking_id, "user_id": user["id"], "status": "pending"},
        {"$set": {"status": "cancelled"}}
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Booking not found or cannot be cancelled")
    return {"message": "Booking cancelled"}


@router.get("/nearby")
async def get_nearby_businesses(lat: float = 48.8566, lng: float = 2.3522, category: Optional[str] = None, limit: int = 20):
    query = {"is_active": True}
    if category:
        query["category"] = category
    businesses = await db.nearby_businesses.find(query, {"_id": 0}).limit(limit).to_list(limit)
    return businesses
