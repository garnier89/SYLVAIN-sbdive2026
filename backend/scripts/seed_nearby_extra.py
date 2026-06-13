"""Seed the missing « Commerces Proches » categories (Spa, Shopping, Hôpital,
Salle de sport, Centre commercial) so they appear on the Home grid AND each one
is functional (deep-links to a pre-filtered list backed by real demo businesses).

Idempotent: re-running it never duplicates home tiles or businesses.

Run:  python -m scripts.seed_nearby_extra   (from /app/backend)
"""
import asyncio
import uuid
from datetime import datetime, timezone
from urllib.parse import quote

from core.config import db


def _now():
    return datetime.now(timezone.utc).isoformat()


# (label_fr, key, category, icon_name, bg_class, icon_color_class)
NEW_TILES = [
    ("Spa", "spa", "Spa", "Sparkle", "bg-pink-50", "text-pink-500"),
    ("Shopping", "shopping", "Shopping", "ShoppingBag", "bg-violet-50", "text-violet-500"),
    ("Hôpitaux", "hopital", "Hôpital", "FirstAid", "bg-red-50", "text-red-500"),
    ("Salles\nde sport", "gym", "Salle de sport", "Barbell", "bg-orange-50", "text-orange-500"),
    ("Centres\ncommerciaux", "mall", "Centre commercial", "Storefront", "bg-sky-50", "text-sky-600"),
]

# A few realistic Paris demo businesses per new category.
DEMO_BUSINESSES = {
    "Spa": [
        ("Spa Nuxe Montorgueil", "32 Rue du Mail, Paris 75002", 4.7, 0.9,
         "https://images.unsplash.com/photo-1540555700478-4be289fbecef?w=400"),
        ("L'Échappée Bien-être", "12 Rue de Rivoli, Paris 75004", 4.5, 1.4,
         "https://images.unsplash.com/photo-1600334129128-685c5582fd35?w=400"),
        ("Cinq Mondes Spa", "6 Square de l'Opéra, Paris 75009", 4.8, 2.1,
         "https://images.unsplash.com/photo-1544161515-4ab6ce6db874?w=400"),
    ],
    "Shopping": [
        ("Galeries Lafayette", "40 Bd Haussmann, Paris 75009", 4.6, 1.8,
         "https://images.unsplash.com/photo-1481437156560-3205f6a55735?w=400"),
        ("Le BHV Marais", "52 Rue de Rivoli, Paris 75004", 4.4, 0.7,
         "https://images.unsplash.com/photo-1567401893414-76b7b1e5a7a5?w=400"),
        ("Boutique Mode Sentier", "18 Rue d'Aboukir, Paris 75002", 4.3, 1.1,
         "https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=400"),
    ],
    "Hôpital": [
        ("Hôpital Saint-Louis", "1 Av. Claude Vellefaux, Paris 75010", 4.2, 2.4,
         "https://images.unsplash.com/photo-1538108149393-fbbd81895907?w=400"),
        ("Clinique des Champs-Élysées", "11 Rue de Tilsitt, Paris 75017", 4.5, 3.0,
         "https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?w=400"),
        ("Centre Médical Bastille", "9 Bd Beaumarchais, Paris 75004", 4.3, 1.0,
         "https://images.unsplash.com/photo-1576091160550-2173dba999ef?w=400"),
    ],
    "Salle de sport": [
        ("Basic-Fit République", "10 Pl. de la République, Paris 75011", 4.1, 0.8,
         "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=400"),
        ("Neoness Châtelet", "20 Rue de la Ferronnerie, Paris 75001", 4.0, 0.6,
         "https://images.unsplash.com/photo-1571902943202-507ec2618e8f?w=400"),
        ("CMG Sports Club", "147 Rue Saint-Honoré, Paris 75001", 4.6, 1.3,
         "https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=400"),
    ],
    "Centre commercial": [
        ("Forum des Halles", "101 Porte Berger, Paris 75001", 4.3, 0.9,
         "https://images.unsplash.com/photo-1519567241046-7f570eee3ce6?w=400"),
        ("Beaugrenelle", "12 Rue Linois, Paris 75015", 4.4, 3.5,
         "https://images.unsplash.com/photo-1555529669-e69e7aa0ba9a?w=400"),
        ("Carrousel du Louvre", "99 Rue de Rivoli, Paris 75001", 4.5, 1.6,
         "https://images.unsplash.com/photo-1513885535751-8b9238bd345a?w=400"),
    ],
}


async def seed_home_tiles():
    # Highest current display_order in the nearby section → append after it.
    last = await db.home_categories.find({"section": "nearby"}).sort("display_order", -1).limit(1).to_list(1)
    order = (last[0]["display_order"] + 1) if last else 0
    created = 0
    for label_fr, key, category, icon_name, bg, color in NEW_TILES:
        exists = await db.home_categories.find_one({"section": "nearby", "key": key})
        if exists:
            continue
        await db.home_categories.insert_one({
            "id": f"hcat_{uuid.uuid4().hex[:10]}",
            "section": "nearby",
            "key": key,
            "label_fr": label_fr,
            "label_en": label_fr,
            "subtitle_fr": "",
            "icon_name": icon_name,
            "image_url": None,
            "bg_class": bg,
            "icon_color_class": color,
            "target_route": f"/nearby?category={quote(category)}",
            "display_order": order,
            "visible_home": True,
            "status": "active",
            "badge": "Nouveau",
            "created_at": _now(),
        })
        order += 1
        created += 1
    return created


async def seed_businesses():
    created = 0
    for category, rows in DEMO_BUSINESSES.items():
        for name, address, rating, dist, image in rows:
            exists = await db.nearby_businesses.find_one({"name": name})
            if exists:
                continue
            await db.nearby_businesses.insert_one({
                "id": f"nb_{uuid.uuid4().hex[:10]}",
                "name": name,
                "category": category,
                "address": address,
                "rating": rating,
                "distance_km": dist,
                "image": image,
                "open_now": True,
                "is_active": True,
                "phone": "+33100000000",
                "created_at": _now(),
            })
            created += 1
    return created


async def main():
    tiles = await seed_home_tiles()
    biz = await seed_businesses()
    print(f"Home tiles created: {tiles}")
    print(f"Demo businesses created: {biz}")


if __name__ == "__main__":
    asyncio.run(main())
