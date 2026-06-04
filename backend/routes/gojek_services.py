"""
Gojek/V3Cube extended services: VideoConsult, Bidding, Intercity, Parking, GiftCards, Tracking.
Extracted from V3Cube SQL schema (beta24.sql) and Android source structure.
"""
from fastapi import APIRouter, Request, HTTPException
import uuid
from datetime import datetime, timezone
from typing import Optional

from core.config import db
from core.deps import get_current_user, calculate_distance

router = APIRouter(tags=["gojek-services"])

# ==========================================
# VIDEO CONSULTING
# Tables: driver_services_video_consult_charges
# ==========================================
video_router = APIRouter(prefix="/video-consult")

DEMO_VIDEO_PROVIDERS = [
    {"id": "vp_doc1", "name": "Dr. Sophie Martin", "specialty": "Médecin Généraliste", "category": "doctor", "rating": 4.9, "reviews": 234, "price_per_min": 2.50, "experience_years": 12, "available": True, "image_url": "https://images.unsplash.com/photo-1559839734-2b71ea197ec2?w=200", "languages": ["Français", "Anglais"]},
    {"id": "vp_doc2", "name": "Dr. Pierre Dubois", "specialty": "Dermatologue", "category": "doctor", "rating": 4.7, "reviews": 189, "price_per_min": 3.00, "experience_years": 15, "available": True, "image_url": "https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?w=200", "languages": ["Français"]},
    {"id": "vp_law1", "name": "Me. Claire Lefevre", "specialty": "Droit des affaires", "category": "lawyer", "rating": 4.8, "reviews": 156, "price_per_min": 4.00, "experience_years": 10, "available": True, "image_url": "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=200", "languages": ["Français", "Anglais"]},
    {"id": "vp_law2", "name": "Me. Jean-Luc Moreau", "specialty": "Droit familial", "category": "lawyer", "rating": 4.6, "reviews": 98, "price_per_min": 3.50, "experience_years": 20, "available": False, "image_url": "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200", "languages": ["Français"]},
    {"id": "vp_tutor1", "name": "Marie Dupont", "specialty": "Mathématiques", "category": "tutor", "rating": 4.9, "reviews": 312, "price_per_min": 1.50, "experience_years": 8, "available": True, "image_url": "https://images.unsplash.com/photo-1580489944761-15a19d654956?w=200", "languages": ["Français", "Anglais"]},
    {"id": "vp_tutor2", "name": "Thomas Bernard", "specialty": "Physique-Chimie", "category": "tutor", "rating": 4.7, "reviews": 178, "price_per_min": 1.50, "experience_years": 6, "available": True, "image_url": "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=200", "languages": ["Français"]},
    {"id": "vp_astro1", "name": "Luna Celestine", "specialty": "Astrologie Védique", "category": "astrologer", "rating": 4.5, "reviews": 445, "price_per_min": 2.00, "experience_years": 15, "available": True, "image_url": "https://images.unsplash.com/photo-1508214751196-bcfd4ca60f91?w=200", "languages": ["Français"]},
    {"id": "vp_fitness1", "name": "Coach Alex Renaud", "specialty": "Fitness & Nutrition", "category": "fitness", "rating": 4.8, "reviews": 267, "price_per_min": 1.80, "experience_years": 7, "available": True, "image_url": "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=200", "languages": ["Français", "Anglais"]},
]

@video_router.get("/providers")
async def list_video_providers(category: Optional[str] = None):
    providers = DEMO_VIDEO_PROVIDERS
    if category:
        providers = [p for p in providers if p["category"] == category]
    return {"providers": providers, "categories": ["doctor", "lawyer", "tutor", "astrologer", "fitness"]}

@video_router.get("/providers/{provider_id}")
async def get_video_provider(provider_id: str):
    for p in DEMO_VIDEO_PROVIDERS:
        if p["id"] == provider_id:
            return p
    raise HTTPException(status_code=404, detail="Provider not found")

@video_router.post("/sessions")
async def create_video_session(request: Request):
    user = await get_current_user(request)
    body = await request.json()
    session = {
        "id": f"vsess_{uuid.uuid4().hex[:12]}",
        "user_id": user["id"],
        "provider_id": body["provider_id"],
        "provider_name": body.get("provider_name", ""),
        "category": body.get("category", ""),
        "scheduled_at": body.get("scheduled_at"),
        "duration_min": body.get("duration_min", 30),
        "status": "scheduled",
        "total_price": body.get("total_price", 0),
        "payment_method": body.get("payment_method", "wallet"),
        "notes": body.get("notes", ""),
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.video_sessions.insert_one(session)
    session.pop("_id", None)
    return session

@video_router.get("/sessions")
async def list_video_sessions(request: Request):
    user = await get_current_user(request)
    sessions = await db.video_sessions.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(50)
    return sessions

# ==========================================
# BIDDING SERVICE
# Tables: bidding_post, bidding_offer, bidding_service, bidding_service_ratings
# ==========================================
bidding_router = APIRouter(prefix="/bidding")

BIDDING_CATEGORIES = [
    {"id": "bcat_electric", "name_fr": "Électricien", "name_en": "Electrician", "icon": "Lightning"},
    {"id": "bcat_plumber", "name_fr": "Plombier", "name_en": "Plumber", "icon": "Drop"},
    {"id": "bcat_carpenter", "name_fr": "Menuisier", "name_en": "Carpenter", "icon": "Hammer"},
    {"id": "bcat_painter", "name_fr": "Peintre", "name_en": "Painter", "icon": "PaintBrush"},
    {"id": "bcat_handyman", "name_fr": "Bricoleur", "name_en": "Handyman", "icon": "Wrench"},
    {"id": "bcat_cleaning", "name_fr": "Ménage Maison", "name_en": "Home Cleaning", "icon": "Broom"},
    {"id": "bcat_moving", "name_fr": "Déménagement", "name_en": "Moving", "icon": "Truck"},
    {"id": "bcat_gardening", "name_fr": "Jardinage", "name_en": "Gardening", "icon": "Plant"},
]

@bidding_router.get("/categories")
async def list_bidding_categories():
    return {"categories": BIDDING_CATEGORIES}

@bidding_router.post("/posts")
async def create_bidding_post(request: Request):
    user = await get_current_user(request)
    body = await request.json()
    post = {
        "id": f"bid_{uuid.uuid4().hex[:12]}",
        "user_id": user["id"],
        "user_name": user.get("name", "Utilisateur"),
        "category_id": body["category_id"],
        "title": body["title"],
        "description": body["description"],
        "address": body.get("address", ""),
        "lat": body.get("lat"),
        "lng": body.get("lng"),
        "budget_min": body.get("budget_min", 0),
        "budget_max": body.get("budget_max", 0),
        "scheduled_date": body.get("scheduled_date"),
        "images": body.get("images", []),
        "status": "open",
        "offers_count": 0,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.bidding_posts.insert_one(post)
    post.pop("_id", None)
    return post

@bidding_router.get("/posts")
async def list_bidding_posts(request: Request, status: Optional[str] = None):
    user = await get_current_user(request)
    query = {"user_id": user["id"]}
    if status:
        query["status"] = status
    posts = await db.bidding_posts.find(query, {"_id": 0}).sort("created_at", -1).to_list(50)
    return posts

@bidding_router.get("/posts/{post_id}")
async def get_bidding_post(post_id: str, request: Request):
    user = await get_current_user(request)
    post = await db.bidding_posts.find_one({"id": post_id}, {"_id": 0})
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    offers = await db.bidding_offers.find({"post_id": post_id}, {"_id": 0}).sort("created_at", -1).to_list(50)
    post["offers"] = offers
    return post

@bidding_router.post("/posts/{post_id}/offers")
async def create_bidding_offer(post_id: str, request: Request):
    user = await get_current_user(request)
    body = await request.json()
    offer = {
        "id": f"boffer_{uuid.uuid4().hex[:12]}",
        "post_id": post_id,
        "provider_id": user["id"],
        "provider_name": user.get("name", "Provider"),
        "price": body["price"],
        "message": body.get("message", ""),
        "estimated_duration": body.get("estimated_duration", ""),
        "status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.bidding_offers.insert_one(offer)
    await db.bidding_posts.update_one({"id": post_id}, {"$inc": {"offers_count": 1}})
    offer.pop("_id", None)
    return offer

@bidding_router.post("/posts/{post_id}/accept/{offer_id}")
async def accept_bidding_offer(post_id: str, offer_id: str, request: Request):
    user = await get_current_user(request)
    post = await db.bidding_posts.find_one({"id": post_id, "user_id": user["id"]})
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    await db.bidding_offers.update_one({"id": offer_id}, {"$set": {"status": "accepted"}})
    await db.bidding_posts.update_one({"id": post_id}, {"$set": {"status": "in_progress"}})
    return {"message": "Offer accepted"}

# ==========================================
# INTERCITY RIDES
# Tables: published_rides, published_rides_waypoints
# ==========================================
intercity_router = APIRouter(prefix="/intercity")

DEMO_INTERCITY_ROUTES = [
    {"id": "ic_1", "from_city": "Paris", "to_city": "Lyon", "distance_km": 465, "estimated_duration": "4h30", "base_price": 35.00, "available_drivers": 12},
    {"id": "ic_2", "from_city": "Paris", "to_city": "Marseille", "distance_km": 775, "estimated_duration": "7h30", "base_price": 55.00, "available_drivers": 8},
    {"id": "ic_3", "from_city": "Paris", "to_city": "Bordeaux", "distance_km": 585, "estimated_duration": "5h30", "base_price": 40.00, "available_drivers": 6},
    {"id": "ic_4", "from_city": "Paris", "to_city": "Lille", "distance_km": 225, "estimated_duration": "2h30", "base_price": 20.00, "available_drivers": 15},
    {"id": "ic_5", "from_city": "Paris", "to_city": "Strasbourg", "distance_km": 490, "estimated_duration": "4h45", "base_price": 38.00, "available_drivers": 5},
    {"id": "ic_6", "from_city": "Lyon", "to_city": "Marseille", "distance_km": 315, "estimated_duration": "3h00", "base_price": 25.00, "available_drivers": 10},
]

@intercity_router.get("/routes")
async def list_intercity_routes(from_city: Optional[str] = None):
    routes = DEMO_INTERCITY_ROUTES
    if from_city:
        routes = [r for r in routes if r["from_city"].lower() == from_city.lower()]
    return {"routes": routes}

@intercity_router.post("/bookings")
async def create_intercity_booking(request: Request):
    user = await get_current_user(request)
    body = await request.json()
    booking = {
        "id": f"icbk_{uuid.uuid4().hex[:12]}",
        "user_id": user["id"],
        "from_city": body["from_city"],
        "to_city": body["to_city"],
        "departure_date": body["departure_date"],
        "departure_time": body.get("departure_time", "08:00"),
        "passengers": body.get("passengers", 1),
        "luggage": body.get("luggage", 0),
        "price": body.get("price", 0),
        "status": "pending",
        "driver_id": None,
        "payment_method": body.get("payment_method", "cash"),
        "notes": body.get("notes", ""),
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.intercity_bookings.insert_one(booking)
    booking.pop("_id", None)
    return booking

@intercity_router.get("/bookings")
async def list_intercity_bookings(request: Request):
    user = await get_current_user(request)
    bookings = await db.intercity_bookings.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(50)
    return bookings

# ==========================================
# PARKING SERVICE
# Tables: parking_space, parking_reserved_bookings, parking_durations, parking_vehicle_size
# ==========================================
parking_router = APIRouter(prefix="/parking")

DEMO_PARKING_SPOTS = [
    {"id": "park_1", "name": "Parking Gare du Nord", "address": "18 Rue de Dunkerque, 75010 Paris", "lat": 48.8809, "lng": 2.3553, "price_per_hour": 4.50, "total_spots": 200, "available_spots": 45, "rating": 4.2, "features": ["Couvert", "Surveillance 24/7", "Bornes électriques"], "image_url": "https://images.unsplash.com/photo-1506521781263-d8422e82f27a?w=400"},
    {"id": "park_2", "name": "Parking Champs-Élysées", "address": "Rond-Point des Champs-Élysées, 75008 Paris", "lat": 48.8698, "lng": 2.3075, "price_per_hour": 6.00, "total_spots": 350, "available_spots": 78, "rating": 4.5, "features": ["Couvert", "Voiturier", "Lavage auto"], "image_url": "https://images.unsplash.com/photo-1590674899484-d5640e854abe?w=400"},
    {"id": "park_3", "name": "Parking Bastille", "address": "Place de la Bastille, 75011 Paris", "lat": 48.8533, "lng": 2.3692, "price_per_hour": 3.50, "total_spots": 150, "available_spots": 23, "rating": 4.0, "features": ["Souterrain", "Accès 24/7"], "image_url": "https://images.unsplash.com/photo-1573348722427-f1d6819fdf98?w=400"},
    {"id": "park_4", "name": "Parking Montparnasse", "address": "17 Rue de l'Arrivée, 75015 Paris", "lat": 48.8421, "lng": 2.3219, "price_per_hour": 4.00, "total_spots": 280, "available_spots": 92, "rating": 4.3, "features": ["Couvert", "Bornes électriques", "Accès handicapé"], "image_url": "https://images.unsplash.com/photo-1558618666-fcd25c85f82e?w=400"},
]

@parking_router.get("/spots")
async def list_parking_spots(lat: Optional[float] = None, lng: Optional[float] = None):
    return {"spots": DEMO_PARKING_SPOTS}

@parking_router.get("/spots/{spot_id}")
async def get_parking_spot(spot_id: str):
    for s in DEMO_PARKING_SPOTS:
        if s["id"] == spot_id:
            return s
    raise HTTPException(status_code=404, detail="Parking spot not found")

@parking_router.post("/reservations")
async def create_parking_reservation(request: Request):
    user = await get_current_user(request)
    body = await request.json()
    reservation = {
        "id": f"pres_{uuid.uuid4().hex[:12]}",
        "user_id": user["id"],
        "spot_id": body["spot_id"],
        "spot_name": body.get("spot_name", ""),
        "vehicle_plate": body.get("vehicle_plate", ""),
        "start_time": body["start_time"],
        "end_time": body["end_time"],
        "duration_hours": body.get("duration_hours", 1),
        "total_price": body.get("total_price", 0),
        "status": "active",
        "payment_method": body.get("payment_method", "wallet"),
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.parking_reservations.insert_one(reservation)
    reservation.pop("_id", None)
    return reservation

@parking_router.get("/reservations")
async def list_parking_reservations(request: Request):
    user = await get_current_user(request)
    reservations = await db.parking_reservations.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(50)
    return reservations

# ==========================================
# GIFT CARDS
# Tables: gift_cards, gift_card_images
# ==========================================
giftcard_router = APIRouter(prefix="/giftcards")

DEMO_GIFTCARD_TEMPLATES = [
    {"id": "gc_tmpl_1", "name": "Joyeux Anniversaire", "category": "birthday", "image_url": "https://images.unsplash.com/photo-1513151233558-d860c5398176?w=400", "color": "#FF6B6B"},
    {"id": "gc_tmpl_2", "name": "Merci", "category": "thanks", "image_url": "https://images.unsplash.com/photo-1518199266791-5375a83190b7?w=400", "color": "#4ECDC4"},
    {"id": "gc_tmpl_3", "name": "Bonne Fête", "category": "celebration", "image_url": "https://images.unsplash.com/photo-1530103862676-de8c9debad1d?w=400", "color": "#FFE66D"},
    {"id": "gc_tmpl_4", "name": "SB Drive VTC", "category": "brand", "image_url": "https://images.unsplash.com/photo-1557200134-90327ee9fafa?w=400", "color": "#FF4500"},
    {"id": "gc_tmpl_5", "name": "Joyeuses Fêtes", "category": "holiday", "image_url": "https://images.unsplash.com/photo-1512389098783-66b81f86e199?w=400", "color": "#C44569"},
]

GIFTCARD_AMOUNTS = [10, 20, 30, 50, 75, 100, 150, 200]

@giftcard_router.get("/templates")
async def list_giftcard_templates():
    return {"templates": DEMO_GIFTCARD_TEMPLATES, "amounts": GIFTCARD_AMOUNTS}

@giftcard_router.post("/purchase")
async def purchase_giftcard(request: Request):
    user = await get_current_user(request)
    body = await request.json()
    card = {
        "id": f"gc_{uuid.uuid4().hex[:12]}",
        "purchaser_id": user["id"],
        "template_id": body["template_id"],
        "amount": body["amount"],
        "recipient_name": body.get("recipient_name", ""),
        "recipient_email": body.get("recipient_email", ""),
        "message": body.get("message", ""),
        "code": f"SB-{uuid.uuid4().hex[:8].upper()}",
        "status": "active",
        "redeemed": False,
        "payment_method": body.get("payment_method", "wallet"),
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.gift_cards.insert_one(card)
    card.pop("_id", None)
    return card

@giftcard_router.get("/my-cards")
async def list_my_giftcards(request: Request):
    user = await get_current_user(request)
    cards = await db.gift_cards.find({"purchaser_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(50)
    return cards

@giftcard_router.post("/redeem")
async def redeem_giftcard(request: Request):
    user = await get_current_user(request)
    body = await request.json()
    code = body.get("code", "")
    card = await db.gift_cards.find_one({"code": code, "status": "active", "redeemed": False})
    if not card:
        raise HTTPException(status_code=404, detail="Invalid or already redeemed gift card")
    await db.gift_cards.update_one({"code": code}, {"$set": {"redeemed": True, "redeemed_by": user["id"], "status": "redeemed"}})
    await db.wallets.update_one({"user_id": user["id"]}, {"$inc": {"balance": card["amount"]}})
    return {"message": f"Carte cadeau de {card['amount']}€ créditée sur votre portefeuille", "amount": card["amount"]}

# ==========================================
# TRACKING SERVICE
# Tables: track_service_category, track_service_company, track_service_users, track_service_trips
# ==========================================
tracking_router = APIRouter(prefix="/tracking")

@tracking_router.get("/members")
async def list_tracked_members(request: Request):
    user = await get_current_user(request)
    members = await db.tracked_members.find({"owner_id": user["id"]}, {"_id": 0}).to_list(50)
    return members

@tracking_router.post("/members")
async def add_tracked_member(request: Request):
    user = await get_current_user(request)
    body = await request.json()
    member = {
        "id": f"trk_{uuid.uuid4().hex[:12]}",
        "owner_id": user["id"],
        "name": body["name"],
        "phone": body.get("phone", ""),
        "relationship": body.get("relationship", "family"),
        "pairing_code": f"SB{uuid.uuid4().hex[:6].upper()}",
        "status": "pending",
        "last_lat": None,
        "last_lng": None,
        "last_updated": None,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.tracked_members.insert_one(member)
    member.pop("_id", None)
    return member

@tracking_router.post("/members/{member_id}/update-location")
async def update_member_location(member_id: str, request: Request):
    body = await request.json()
    result = await db.tracked_members.update_one(
        {"id": member_id},
        {"$set": {"last_lat": body["lat"], "last_lng": body["lng"], "last_updated": datetime.now(timezone.utc).isoformat(), "status": "active"}}
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Member not found")
    return {"message": "Location updated"}

@tracking_router.delete("/members/{member_id}")
async def remove_tracked_member(member_id: str, request: Request):
    user = await get_current_user(request)
    result = await db.tracked_members.delete_one({"id": member_id, "owner_id": user["id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Member not found")
    return {"message": "Member removed"}


# ==========================================
# MEDICAL SERVICES (V3Cube) — Prise de RDV + Transport médical / Ambulance
# Tables: medical_appointments, medical_transport
# ==========================================
medical_router = APIRouter(prefix="/medical")

DEMO_DOCTORS = [
    {"id": "doc_gp1", "name": "Dr. Sophie Martin", "specialty": "Médecine générale", "rating": 4.9, "reviews": 234, "fee": 40, "experience_years": 12, "modes": ["clinic", "home"], "clinic": "Clinique Saint-Louis, Paris", "image_url": "https://images.unsplash.com/photo-1559839734-2b71ea197ec2?w=200", "languages": ["Français", "Anglais"], "next_slot": "Aujourd'hui 14:30"},
    {"id": "doc_ped1", "name": "Dr. Amélie Rousseau", "specialty": "Pédiatrie", "rating": 4.8, "reviews": 187, "fee": 50, "experience_years": 9, "modes": ["clinic", "home"], "clinic": "Cabinet des Lilas, Paris", "image_url": "https://images.unsplash.com/photo-1594824476967-48c8b964273f?w=200", "languages": ["Français"], "next_slot": "Demain 09:00"},
    {"id": "doc_derm1", "name": "Dr. Pierre Dubois", "specialty": "Dermatologie", "rating": 4.7, "reviews": 189, "fee": 60, "experience_years": 15, "modes": ["clinic"], "clinic": "Centre Dermato, Paris", "image_url": "https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?w=200", "languages": ["Français"], "next_slot": "Demain 11:30"},
    {"id": "doc_cardio1", "name": "Dr. Karim Benali", "specialty": "Cardiologie", "rating": 4.9, "reviews": 142, "fee": 80, "experience_years": 18, "modes": ["clinic", "home"], "clinic": "Hôpital du Cœur, Paris", "image_url": "https://images.unsplash.com/photo-1622253692010-333f2da6031d?w=200", "languages": ["Français", "Arabe"], "next_slot": "Jeu. 15:00"},
    {"id": "doc_dent1", "name": "Dr. Lucie Garnier", "specialty": "Dentiste", "rating": 4.6, "reviews": 211, "fee": 55, "experience_years": 11, "modes": ["clinic"], "clinic": "Dental Smile, Paris", "image_url": "https://images.unsplash.com/photo-1588776814546-1ffcf47267a5?w=200", "languages": ["Français", "Anglais"], "next_slot": "Aujourd'hui 17:00"},
    {"id": "doc_gyn1", "name": "Dr. Nadia Cherif", "specialty": "Gynécologie", "rating": 4.8, "reviews": 165, "fee": 65, "experience_years": 14, "modes": ["clinic", "home"], "clinic": "Centre Femme & Santé, Paris", "image_url": "https://images.unsplash.com/photo-1591604021695-0c69b7c05981?w=200", "languages": ["Français"], "next_slot": "Demain 10:00"},
]

AMBULANCE_TYPES = [
    {"id": "amb_basic", "name": "Ambulance Standard", "desc": "Transport assis/allongé, premiers secours", "base_fee": 50, "per_km": 2.5, "icon": "basic"},
    {"id": "amb_icu", "name": "Ambulance Médicalisée (USI)", "desc": "Équipement de réanimation, personnel médical", "base_fee": 120, "per_km": 4.0, "icon": "icu"},
    {"id": "amb_wheelchair", "name": "Transport PMR", "desc": "Véhicule adapté fauteuil roulant", "base_fee": 35, "per_km": 1.8, "icon": "wheelchair"},
]


@medical_router.get("/doctors")
async def list_doctors(specialty: Optional[str] = None):
    docs = DEMO_DOCTORS
    if specialty and specialty != "all":
        docs = [d for d in docs if d["specialty"] == specialty]
    specialties = sorted({d["specialty"] for d in DEMO_DOCTORS})
    return {"doctors": docs, "specialties": specialties}


@medical_router.post("/appointments")
async def create_appointment(request: Request):
    user = await get_current_user(request)
    body = await request.json()
    appt = {
        "id": f"appt_{uuid.uuid4().hex[:12]}",
        "user_id": user["id"],
        "doctor_id": body.get("doctor_id"),
        "doctor_name": body.get("doctor_name", ""),
        "specialty": body.get("specialty", ""),
        "mode": body.get("mode", "clinic"),  # clinic | home
        "scheduled_date": body.get("scheduled_date"),
        "scheduled_time": body.get("scheduled_time"),
        "patient_name": body.get("patient_name", ""),
        "patient_phone": body.get("patient_phone", ""),
        "patient_age": body.get("patient_age"),
        "symptoms": body.get("symptoms", ""),
        "address": body.get("address"),
        "fee": body.get("fee", 0),
        "payment_method": body.get("payment_method", "cash"),
        "status": "scheduled",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    if not appt["doctor_id"] or not appt["scheduled_date"] or not appt["scheduled_time"]:
        raise HTTPException(status_code=400, detail="Médecin, date et heure requis")
    await db.medical_appointments.insert_one(appt)
    appt.pop("_id", None)
    return appt


@medical_router.get("/appointments")
async def list_appointments(request: Request):
    user = await get_current_user(request)
    items = await db.medical_appointments.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(50)
    return items


@medical_router.get("/ambulance-types")
async def list_ambulance_types():
    return {"types": AMBULANCE_TYPES}


@medical_router.post("/transport/estimate")
async def estimate_medical_transport(request: Request):
    await get_current_user(request)
    body = await request.json()
    amb = next((a for a in AMBULANCE_TYPES if a["id"] == body.get("ambulance_type")), AMBULANCE_TYPES[0])
    km = body.get("distance_km")
    if km is None and all(body.get(k) is not None for k in ("pickup_lat", "pickup_lng", "dest_lat", "dest_lng")):
        km = calculate_distance(body["pickup_lat"], body["pickup_lng"], body["dest_lat"], body["dest_lng"])
    km = round(km or 0, 2)
    fare = round(amb["base_fee"] + amb["per_km"] * km, 2)
    return {"ambulance_type": amb["id"], "ambulance_name": amb["name"], "distance_km": km, "base_fee": amb["base_fee"], "estimated_fare": fare}


@medical_router.post("/transport")
async def create_medical_transport(request: Request):
    user = await get_current_user(request)
    body = await request.json()
    amb = next((a for a in AMBULANCE_TYPES if a["id"] == body.get("ambulance_type")), AMBULANCE_TYPES[0])
    km = body.get("distance_km")
    if km is None and all(body.get(k) is not None for k in ("pickup_lat", "pickup_lng", "dest_lat", "dest_lng")):
        km = calculate_distance(body["pickup_lat"], body["pickup_lng"], body["dest_lat"], body["dest_lng"])
    km = round(km or 0, 2)
    fare = round(amb["base_fee"] + amb["per_km"] * km, 2)
    transport = {
        "id": f"medtr_{uuid.uuid4().hex[:12]}",
        "user_id": user["id"],
        "driver_id": None,
        "ambulance_type": amb["id"],
        "ambulance_name": amb["name"],
        "pickup_lat": body.get("pickup_lat"),
        "pickup_lng": body.get("pickup_lng"),
        "pickup_address": body.get("pickup_address"),
        "destination_name": body.get("destination_name"),
        "dest_lat": body.get("dest_lat"),
        "dest_lng": body.get("dest_lng"),
        "patient_name": body.get("patient_name", ""),
        "patient_phone": body.get("patient_phone", ""),
        "patient_condition": body.get("patient_condition", ""),
        "urgency": body.get("urgency", "normal"),  # normal | urgent | critical
        "distance_km": km,
        "fare": fare,
        "payment_method": body.get("payment_method", "cash"),
        "status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    if transport["pickup_lat"] is None or transport["dest_lat"] is None:
        raise HTTPException(status_code=400, detail="Lieu de départ et destination requis")
    await db.medical_transport.insert_one(transport)
    transport.pop("_id", None)
    return transport


@medical_router.get("/transport")
async def list_medical_transport(request: Request):
    user = await get_current_user(request)
    items = await db.medical_transport.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(50)
    return items


# ==========================================
# REGISTER ALL SUB-ROUTERS
# ==========================================
router.include_router(video_router)
router.include_router(bidding_router)
router.include_router(intercity_router)
router.include_router(parking_router)
router.include_router(giftcard_router)
router.include_router(tracking_router)
router.include_router(medical_router)
