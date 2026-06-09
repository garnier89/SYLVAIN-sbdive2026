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
    _provider(
        "svp_gardien_omar", "gardien", "Omar S.", 4.7, 41, 48.8520, 2.3410,
        f"{_AV}photo-1581092580497-e0d23cbdf1dc?w=400",
        "Agent de sécurité diplômé pour événements, commerces et résidences.",
        [_svc("s1", "Gardiennage (par heure)", 22.00, 60), _svc("s2", "Sécurité événement (4h)", 80.00, 240)],
        [],
    ),
    _provider(
        "svp_jardinage_eric", "jardinage", "Éric V.", 4.6, 73, 48.8700, 2.3550,
        f"{_AV}photo-1416879595882-3373a0480b5b?w=400",
        "Entretien de jardins, tonte, taille de haies et plantations.",
        [_svc("s1", "Tonte de pelouse", 35.00, 60), _svc("s2", "Taille de haie", 40.00, 75), _svc("s3", "Entretien complet (2h)", 70.00, 120)],
        [],
    ),
    _provider(
        "svp_deneigement_lukas", "deneigement", "Lukas N.", 4.5, 22, 48.8480, 2.3650,
        f"{_AV}photo-1483664852095-d6cc6870702d?w=400",
        "Déneigement d'allées, trottoirs et parkings, intervention rapide.",
        [_svc("s1", "Déneigement allée", 45.00, 60), _svc("s2", "Déneigement parking", 90.00, 120)],
        [],
    ),
    _provider(
        "svp_nettoyage_bureau_clean", "nettoyage-bureau", "ProClean Bureau", 4.8, 156, 48.8590, 2.3470,
        f"{_AV}photo-1556761175-5973dc0f32e7?w=400",
        "Nettoyage professionnel de bureaux et locaux commerciaux.",
        [_svc("s1", "Nettoyage bureau (par m²)", 1.50, 60), _svc("s2", "Forfait petit bureau", 60.00, 90)],
        [],
    ),
    _provider(
        "svp_profs_nadia", "profs", "Nadia E.", 4.9, 188, 48.8540, 2.3380,
        f"{_AV}photo-1544717305-2782549b5136?w=400",
        "Professeure certifiée — maths, physique et soutien scolaire à domicile.",
        [_svc("s1", "Cours de maths (1h)", 30.00, 60), _svc("s2", "Cours de physique (1h)", 32.00, 60), _svc("s3", "Préparation examen (2h)", 60.00, 120)],
        [],
    ),
    _provider(
        "svp_avocats_dupont", "avocats", "Maître Dupont", 4.7, 94, 48.8610, 2.3360,
        f"{_AV}photo-1589829085413-56de8ae18c73?w=400",
        "Avocat — droit du travail, droit immobilier et conseil juridique.",
        [_svc("s1", "Consultation (45 min)", 90.00, 45), _svc("s2", "Rédaction de contrat", 150.00, 90)],
        [],
    ),
    _provider(
        "svp_antinuisibles_stop", "anti-nuisibles", "StopNuisibles", 4.6, 61, 48.8430, 2.3490,
        f"{_AV}photo-1632154951079-2c1b5b2b3a4f?w=400",
        "Traitement contre cafards, punaises de lit, rongeurs et guêpes.",
        [_svc("s1", "Diagnostic + traitement", 80.00, 90), _svc("s2", "Traitement punaises de lit", 150.00, 120)],
        [],
    ),
    _provider(
        "svp_dj_max", "dj", "DJ Max", 4.8, 132, 48.8660, 2.3300,
        f"{_AV}photo-1571266028243-d220c9c3b31f?w=400",
        "DJ pour mariages, anniversaires et soirées privées. Matériel inclus.",
        [_svc("s1", "Soirée (4h)", 350.00, 240), _svc("s2", "Mariage (journée)", 700.00, 480)],
        [],
    ),
    _provider(
        "svp_voyage_evasion", "agent-voyage", "Évasion Voyages", 4.7, 78, 48.8570, 2.3420,
        f"{_AV}photo-1488646953014-85cb44e25828?w=400",
        "Agent de voyage : séjours sur mesure, billets et conciergerie.",
        [_svc("s1", "Consultation voyage", 25.00, 45), _svc("s2", "Organisation séjour", 90.00, 90)],
        [],
    ),
    _provider(
        "svp_coach_thomas", "coach-fitness", "Thomas F.", 4.9, 203, 48.8500, 2.3300,
        f"{_AV}photo-1571019613454-1cb2f99b2d8b?w=400",
        "Coach sportif diplômé — remise en forme, perte de poids, musculation.",
        [_svc("s1", "Séance individuelle (1h)", 45.00, 60), _svc("s2", "Pack 5 séances", 200.00, 60)],
        [],
    ),
    _provider(
        "svp_reparauto_garage", "reparation-auto", "Garage Express", 4.5, 117, 48.8420, 2.3600,
        f"{_AV}photo-1486006920555-c77dcf18193c?w=400",
        "Réparation auto toutes marques, devis gratuit.",
        [_svc("s1", "Diagnostic", 39.00, 45), _svc("s2", "Changement pneus (x2)", 60.00, 60), _svc("s3", "Révision complète", 149.00, 120)],
        [],
    ),
    _provider(
        "svp_traducteur_sofia", "traducteur", "Sofia M.", 4.8, 64, 48.8580, 2.3440,
        f"{_AV}photo-1543109740-4bdb38fda756?w=400",
        "Traductrice FR/EN/ES — documents officiels et interprétariat.",
        [_svc("s1", "Traduction (par page)", 25.00, 30), _svc("s2", "Interprétariat (1h)", 50.00, 60)],
        [],
    ),
    _provider(
        "svp_immobilier_pierre", "agent-immobilier", "Pierre L.", 4.6, 89, 48.8620, 2.3350,
        f"{_AV}photo-1560518883-ce09059eeffa?w=400",
        "Agent immobilier — estimation, vente et location de biens.",
        [_svc("s1", "Estimation de bien", 0.00, 60), _svc("s2", "Visite accompagnée", 40.00, 60)],
        [],
    ),
    _provider(
        "svp_traiteur_delice", "traiteur", "Délices Traiteur", 4.9, 241, 48.8550, 2.3290,
        f"{_AV}photo-1555244162-803834f70033?w=400",
        "Traiteur événementiel — cocktails, buffets et repas assis.",
        [_svc("s1", "Cocktail (par pers.)", 18.00, 60), _svc("s2", "Buffet (par pers.)", 28.00, 60)],
        [],
    ),
    _provider(
        "svp_serrurier_rapid", "serrurier", "Serrurier Rapide", 4.4, 52, 48.8460, 2.3520,
        f"{_AV}photo-1558002038-1055907df827?w=400",
        "Ouverture de porte, changement de serrure 24h/24.",
        [_svc("s1", "Ouverture de porte", 80.00, 45), _svc("s2", "Changement de serrure", 150.00, 60)],
        [],
    ),
    _provider(
        "svp_reptv_hugo", "reparation-tv", "Hugo R.", 4.5, 38, 48.8510, 2.3470,
        f"{_AV}photo-1593359677879-a4bb92f829d1?w=400",
        "Réparation TV, écrans et installation home cinéma.",
        [_svc("s1", "Diagnostic TV", 35.00, 45), _svc("s2", "Réparation écran", 90.00, 90)],
        [],
    ),
    _provider(
        "svp_repordi_techfix", "reparation-ordinateur", "TechFix", 4.7, 145, 48.8595, 2.3415,
        f"{_AV}photo-1517336714731-489689fd1ca8?w=400",
        "Dépannage informatique, virus, lenteurs et récupération de données.",
        [_svc("s1", "Diagnostic PC", 30.00, 45), _svc("s2", "Nettoyage + optimisation", 55.00, 60), _svc("s3", "Récupération de données", 120.00, 120)],
        [],
    ),
    _provider(
        "svp_decorateur_julie", "decorateur", "Julie D.", 4.8, 71, 48.8630, 2.3320,
        f"{_AV}photo-1618221195710-dd6b41faaea6?w=400",
        "Décoratrice d'intérieur — conseil déco, agencement et home staging.",
        [_svc("s1", "Consultation déco (1h)", 60.00, 60), _svc("s2", "Projet d'aménagement", 250.00, 180)],
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
