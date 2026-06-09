"""
On-Demand Services (« Services à la demande ») — seed data + idempotent seeding.

Mirrors the V3Cube flow:
  Catégories  →  Prestataires (Fournisseur de services)  →  Fiche prestataire
  (Détail du service avec prestations réservables)  →  Réservation.

Collections:
  - ondemand_categories : grille de catégories (Accueil + « Tous les autres services »)
  - service_providers    : prestataires par catégorie, avec prestations + galerie + note
"""
from core.config import db

# Phosphor icon names are resolved on the frontend (with a safe fallback).
ON_DEMAND_CATEGORIES = [
    {"slug": "bricoleur", "name": "Bricoleur", "icon": "Wrench", "color": "bg-fuchsia-50", "order": 1},
    {"slug": "menage", "name": "Ménage Maison", "icon": "Broom", "color": "bg-teal-50", "order": 2},
    {"slug": "massage", "name": "Massage", "icon": "Heart", "color": "bg-sky-50", "order": 3},
    {"slug": "babysitting", "name": "Baby-sitting", "icon": "Baby", "color": "bg-green-50", "order": 4},
    {"slug": "mecanicien", "name": "Mécanicien", "icon": "GasPump", "color": "bg-emerald-50", "order": 5},
    {"slug": "gardien", "name": "Gardien de sécurité", "icon": "ShieldCheck", "color": "bg-slate-50", "order": 6},
    {"slug": "jardinage", "name": "Jardinage", "icon": "Plant", "color": "bg-lime-50", "order": 7},
    {"slug": "deneigement", "name": "Déneigement", "icon": "Snowflake", "color": "bg-cyan-50", "order": 8},
    {"slug": "nettoyage-bureau", "name": "Nettoyage bureau", "icon": "Buildings", "color": "bg-amber-50", "order": 9},
    {"slug": "profs", "name": "Professeurs", "icon": "GraduationCap", "color": "bg-yellow-50", "order": 10},
    {"slug": "avocats", "name": "Avocats", "icon": "Gavel", "color": "bg-indigo-50", "order": 11},
    {"slug": "anti-nuisibles", "name": "Anti-nuisibles", "icon": "Bug", "color": "bg-rose-50", "order": 12},
    {"slug": "dj", "name": "DJ", "icon": "MusicNotes", "color": "bg-purple-50", "order": 13},
    {"slug": "agent-voyage", "name": "Agent de voyage", "icon": "AirplaneTilt", "color": "bg-orange-50", "order": 14},
    {"slug": "coach-fitness", "name": "Coach fitness", "icon": "Barbell", "color": "bg-red-50", "order": 15},
    {"slug": "coiffeur", "name": "Coiffeur", "icon": "Scissors", "color": "bg-pink-50", "order": 16},
    {"slug": "reparation-auto", "name": "Réparation auto", "icon": "Car", "color": "bg-blue-50", "order": 17},
    {"slug": "traducteur", "name": "Traducteur", "icon": "Translate", "color": "bg-violet-50", "order": 18},
    {"slug": "agent-immobilier", "name": "Agent immobilier", "icon": "HouseLine", "color": "bg-sky-50", "order": 19},
    {"slug": "traiteur", "name": "Traiteur", "icon": "ForkKnife", "color": "bg-amber-50", "order": 20},
    {"slug": "serrurier", "name": "Serrurier", "icon": "Key", "color": "bg-zinc-100", "order": 21},
    {"slug": "reparation-tv", "name": "Réparation TV", "icon": "Television", "color": "bg-red-50", "order": 22},
    {"slug": "reparation-ordinateur", "name": "Réparation ordinateur", "icon": "Desktop", "color": "bg-blue-50", "order": 23},
    {"slug": "decorateur", "name": "Décorateur d'intérieur", "icon": "PaintRoller", "color": "bg-orange-50", "order": 24},
]

_AV = "https://images.unsplash.com/"


def _provider(pid, slug, name, rating, reviews, lat, lng, photo, bio, services, gallery):
    return {
        "id": pid, "category_slug": slug, "name": name, "rating": rating,
        "reviews_count": reviews, "lat": lat, "lng": lng,
        "address": "Paris, Île-de-France", "phone": "+33612345678",
        "photo": photo, "bio": bio, "gallery": gallery, "is_active": True,
        "services": services,
    }


def _svc(sid, name, price, duration=30):
    return {"id": sid, "name": name, "price": price, "duration_min": duration}


DEMO_SERVICE_PROVIDERS = [
    _provider(
        "svp_coiffeur_sylvain", "coiffeur", "Sylvain G", 4.6, 128, 48.8566, 2.3522,
        f"{_AV}photo-1599351431202-1e0f0137899a?w=400",
        "Coiffeur barbier expérimenté — coupes homme, dégradés et soins de la barbe.",
        [
            _svc("s1", "Coupe Homme Classique", 17.19, 30),
            _svc("s2", "Coupe Homme Moderne", 21.49, 40),
            _svc("s3", "Dégradé", 24.07, 45),
            _svc("s4", "Coupe Courte", 15.47, 25),
            _svc("s5", "Coupe Rasée", 12.89, 20),
            _svc("s6", "Coupe Dégradée Longue", 19.99, 40),
        ],
        [f"{_AV}photo-1503951914875-452162b0f3f1?w=400", f"{_AV}photo-1622286342621-4bd786c2447c?w=400"],
    ),
    _provider(
        "svp_coiffeur_amir", "coiffeur", "Amir B.", 4.8, 211, 48.8606, 2.3376,
        f"{_AV}photo-1582893561942-d61adcb4e9d1?w=400",
        "Salon de barbier moderne, spécialiste du contour et de la taille de barbe.",
        [
            _svc("s1", "Coupe + Barbe", 28.00, 45),
            _svc("s2", "Taille de Barbe", 12.00, 20),
            _svc("s3", "Coupe Enfant", 14.00, 25),
        ],
        [f"{_AV}photo-1605497788044-5a32c7078486?w=400"],
    ),
    _provider(
        "svp_bricoleur_marc", "bricoleur", "Marc L.", 4.5, 87, 48.8530, 2.3499,
        f"{_AV}photo-1621905251189-08b45d6a269e?w=400",
        "Bricoleur polyvalent : montage de meubles, fixations, petites réparations.",
        [
            _svc("s1", "Montage de meuble", 35.00, 60),
            _svc("s2", "Fixation murale", 25.00, 30),
            _svc("s3", "Petites réparations", 30.00, 45),
        ],
        [],
    ),
    _provider(
        "svp_bricoleur_jules", "bricoleur", "Jules P.", 4.3, 54, 48.8700, 2.3400,
        f"{_AV}photo-1530124566582-a618bc2615dc?w=400",
        "Artisan multi-services pour vos travaux du quotidien.",
        [
            _svc("s1", "Pose d'étagères", 28.00, 40),
            _svc("s2", "Installation luminaire", 32.00, 45),
        ],
        [],
    ),
    _provider(
        "svp_menage_sophie", "menage", "Sophie M.", 4.9, 302, 48.8584, 2.2945,
        f"{_AV}photo-1581578731548-c64695cc6952?w=400",
        "Ménage à domicile soigné, produits écologiques sur demande.",
        [
            _svc("s1", "Ménage Standard (2h)", 45.00, 120),
            _svc("s2", "Grand Ménage (4h)", 85.00, 240),
            _svc("s3", "Repassage (1h)", 22.00, 60),
        ],
        [],
    ),
    _provider(
        "svp_menage_carla", "menage", "Carla D.", 4.7, 176, 48.8470, 2.3580,
        f"{_AV}photo-1527515637462-cff94eecc1ac?w=400",
        "Femme de ménage de confiance, disponible en semaine et week-end.",
        [
            _svc("s1", "Ménage Standard (2h)", 42.00, 120),
            _svc("s2", "Nettoyage vitres", 30.00, 60),
        ],
        [],
    ),
    _provider(
        "svp_massage_lea", "massage", "Léa T.", 4.8, 143, 48.8649, 2.3490,
        f"{_AV}photo-1544161515-4ab6ce6db874?w=400",
        "Masseuse certifiée — massage relaxant, suédois et sportif à domicile.",
        [
            _svc("s1", "Massage Relaxant (60 min)", 65.00, 60),
            _svc("s2", "Massage Suédois (60 min)", 70.00, 60),
            _svc("s3", "Massage Sportif (45 min)", 55.00, 45),
        ],
        [],
    ),
    _provider(
        "svp_mecanicien_paul", "mecanicien", "Paul R.", 4.4, 98, 48.8410, 2.3470,
        f"{_AV}photo-1486006920555-c77dcf18193c?w=400",
        "Mécanicien mobile : diagnostic, vidange et petites réparations à domicile.",
        [
            _svc("s1", "Diagnostic", 39.00, 45),
            _svc("s2", "Vidange", 79.00, 60),
            _svc("s3", "Changement plaquettes", 120.00, 90),
        ],
        [],
    ),
    _provider(
        "svp_babysitting_ines", "babysitting", "Inès K.", 4.9, 67, 48.8600, 2.3270,
        f"{_AV}photo-1607746882042-944635dfe10e?w=400",
        "Baby-sitter expérimentée et diplômée, références vérifiées.",
        [
            _svc("s1", "Garde en soirée (par heure)", 12.00, 60),
            _svc("s2", "Garde journée (par heure)", 11.00, 60),
        ],
        [],
    ),
]


async def seed_ondemand():
    """Idempotent: insert categories/providers once; keep names/icons in sync."""
    for cat in ON_DEMAND_CATEGORIES:
        await db.ondemand_categories.update_one(
            {"slug": cat["slug"]},
            {"$set": {"name": cat["name"], "icon": cat["icon"], "color": cat["color"],
                      "order": cat["order"]},
             "$setOnInsert": {"slug": cat["slug"], "is_active": True}},
            upsert=True,
        )
    for prov in DEMO_SERVICE_PROVIDERS:
        existing = await db.service_providers.find_one({"id": prov["id"]}, {"_id": 0, "id": 1})
        if not existing:
            await db.service_providers.insert_one(dict(prov))
