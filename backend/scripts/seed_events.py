"""Seed demo events for SB Événement (Phase 1). Idempotent (upsert by title)."""
import asyncio
import uuid
from datetime import datetime, timezone, timedelta

from core.config import db


def _iso(days, hour=20):
    d = datetime.now(timezone.utc) + timedelta(days=days)
    return d.replace(hour=hour, minute=0, second=0, microsecond=0).isoformat()


def tier(name, price, total):
    return {"id": f"tier_{uuid.uuid4().hex[:6]}", "name": name, "price": price,
            "currency": "EUR", "quantity_total": total, "quantity_sold": 0}


EVENTS = [
    {
        "title": "Carnaval de Fort-de-France 2026", "category": "carnaval",
        "description": "Le grand défilé du Mardi Gras : groupes à pied, chars, bwadjak et vidé géant dans les rues de Fort-de-France.",
        "image": "https://images.unsplash.com/photo-1551972873-b7e8754e8e26?w=800",
        "venue_name": "Centre-ville", "address": "La Savane, Fort-de-France", "city": "Fort-de-France",
        "lat": 14.6010, "lng": -61.0742, "starts_at": _iso(12, 14), "ends_at": _iso(12, 23),
        "organizer_name": "Ville de Fort-de-France", "is_featured": True,
        "tiers": [tier("Accès Tribune", 25, 400), tier("Carré VIP", 75, 80)],
    },
    {
        "title": "Festival Zouk & Kompa", "category": "festival",
        "description": "Deux scènes, 12 artistes, food-court créole. La plus grande nuit zouk de l'année.",
        "image": "https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=800",
        "venue_name": "Stade Pierre-Aliker", "address": "Dillon, Fort-de-France", "city": "Fort-de-France",
        "lat": 14.6253, "lng": -61.0500, "starts_at": _iso(20, 19), "ends_at": _iso(21, 3),
        "organizer_name": "SB Live", "is_featured": True,
        "tiers": [tier("Pass 1 jour", 45, 1500), tier("Pass 2 jours", 80, 800), tier("Golden Circle", 150, 200)],
    },
    {
        "title": "Concert Live — Kassav' Tribute", "category": "concert",
        "description": "Hommage au groupe légendaire avec un orchestre de 10 musiciens.",
        "image": "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=800",
        "venue_name": "Atrium", "address": "Rue Jacques Cazotte, Fort-de-France", "city": "Fort-de-France",
        "lat": 14.6080, "lng": -61.0650, "starts_at": _iso(8, 20), "ends_at": _iso(8, 23),
        "organizer_name": "Atrium Martinique", "is_featured": False,
        "tiers": [tier("Catégorie 2", 35, 300), tier("Catégorie 1", 55, 200)],
    },
    {
        "title": "Match — Club Franciscain vs Golden Lion", "category": "sport",
        "description": "Derby de Martinique. Ambiance garantie en tribunes.",
        "image": "https://images.unsplash.com/photo-1508098682722-e99c43a406b2?w=800",
        "venue_name": "Stade Louis Achille", "address": "Fort-de-France", "city": "Fort-de-France",
        "lat": 14.6090, "lng": -61.0700, "starts_at": _iso(5, 17), "ends_at": _iso(5, 19),
        "organizer_name": "Ligue de Football", "is_featured": False,
        "tiers": [tier("Tribune populaire", 10, 2000), tier("Tribune couverte", 20, 600)],
    },
    {
        "title": "Soirée Beach Club Sunset", "category": "soiree",
        "description": "DJ set au coucher du soleil, cocktails & ambiance lounge les pieds dans le sable.",
        "image": "https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=800",
        "venue_name": "Beach Club Pointe Marin", "address": "Sainte-Anne", "city": "Sainte-Anne",
        "lat": 14.4380, "lng": -60.8870, "starts_at": _iso(3, 18), "ends_at": _iso(4, 1),
        "organizer_name": "Sunset Events", "is_featured": False,
        "tiers": [tier("Entrée", 20, 300), tier("Table + bouteille", 180, 40)],
    },
    {
        "title": "Exposition — Art Caribéen Contemporain", "category": "exposition",
        "description": "30 artistes de la Caraïbe, peintures, sculptures et installations.",
        "image": "https://images.unsplash.com/photo-1545989253-02cc26577f88?w=800",
        "venue_name": "Fondation Clément", "address": "Le François", "city": "Le François",
        "lat": 14.6160, "lng": -60.9000, "starts_at": _iso(2, 10), "ends_at": _iso(40, 18),
        "organizer_name": "Fondation Clément", "is_featured": False,
        "tiers": [tier("Billet adulte", 12, 5000), tier("Billet réduit", 8, 2000)],
    },
    {
        "title": "Paris — Concert Électro Arena", "category": "concert",
        "description": "Tournée internationale, show laser & scène 360°.",
        "image": "https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=800",
        "venue_name": "Accor Arena", "address": "8 Bd de Bercy, Paris 75012", "city": "Paris",
        "lat": 48.8388, "lng": 2.3786, "starts_at": _iso(15, 20), "ends_at": _iso(15, 23),
        "organizer_name": "Live Nation", "is_featured": True,
        "tiers": [tier("Gradins", 49, 8000), tier("Fosse", 69, 4000), tier("VIP Premium", 199, 300)],
    },
]


async def main():
    created = 0
    for e in EVENTS:
        if await db.events.find_one({"title": e["title"]}):
            continue
        e["id"] = f"event_{uuid.uuid4().hex[:12]}"
        e["status"] = "active"
        e["created_at"] = datetime.now(timezone.utc).isoformat()
        await db.events.insert_one(e)
        created += 1
    print(f"Events created: {created}")


if __name__ == "__main__":
    asyncio.run(main())
