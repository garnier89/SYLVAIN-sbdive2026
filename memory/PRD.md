# SB Drive VTC - Product Requirements Document

## Présentation
**SB Drive VTC** = nom de la société
- **SB Drive Client** = App passager séparée (/) — thème vert/bleu
- **SB Drive Chauffeur** = App chauffeur séparée (/chauffeur) — thème amber/dark

## Architecture
- Frontend: React 18 + Tailwind CSS + Shadcn/UI + Phosphor Icons
- Backend: FastAPI + MongoDB (Motor async)
- Auth: JWT httponly cookies (secure, samesite=none)
- Maps: Leaflet / OpenStreetMap, Payments: Stripe
- Language: 100% Français

## Écrans implémentés (alignés XJekPlus/V3Cube)

### Flow d'entrée Client
1. **Splash** — "SB Drive" bleu italic + "CLIENT APP", auto-transition 2.2s
2. **Onboarding** — 4 slides
3. **Login** — Mode téléphone (+33) → "Ou choisir d'autres options" → Modal (Google, Email, Face ID/Touch ID)

### Home Client (18+ sections)
- Header, Recherche, Carousel promo
- **Services Taxi** (8) : VTC Réservation, Pooling, Location, Chauffeur Privé, Enchères, Intercity, Programmer, Plus → /more-taxi
- **Livraison de Colis** (bannière violet) → /parcel
- **Services de Livraison** (4) : Repas, Courses, Médicaments, Plus → /all-delivery
- **Consultation Vidéo** : Tuteur, Avocat, Astrologue
- **Services à la demande** (4) : Bricolage, Massage, Mécanique, Plus → /all-services
- **Services Beauté** (4) → /beauty
- **Services Médicaux** (3 cards layout)
- **Services Animaux** (3) → /pet-care
- **Enchères Services** (6 items 2x3)
- **Entretien Auto** (4) → /car-care
- **Dépannage & Remorquage** (bannière) → /towing
- **Acheter, Vendre & Louer** (3 banners) → /marketplace/:type
- **Covoiturage** → /carpool
- **Suivi Famille & Employés** (2 cards)
- **Commerces Proches** (4) → /nearby
- Bottom nav : Accueil, Réservations, Portefeuille, Profil

### Pages de sous-services dédiées (V3Cube style)
- `/beauty` — 12 services beauté (3x4 grid + bannière rose)
- `/pet-care` — 12 services animaux (3x4 grid + bannière bleue)
- `/car-care` — 8 services auto (3x3 grid + bannière cyan)
- `/towing` — 9 services dépannage (3x3 grid + bannière bleue)
- `/more-taxi` — 10 services taxi (3x4 grid)

### Réservation VTC (3 étapes - design V3Cube)
1. **Planifier** — Header bleu, Maintenant/Pour moi, départ/destination, Lieux Favoris (Domicile/Travail), Localisation actuelle, Carte, Destination plus tard, Lieux Récents
2. **Carte + Véhicule** — Leaflet map, sélection véhicule (Basic/SUV/Luxe avec prix), paiement Visa, Réserver Maintenant
3. **Recherche** — Animation recherche chauffeur, code OTP, Annuler

### Marketplace
- `/marketplace/real-estate` — Immobilier (Appartement, Maison/Villa, Studio, Terrain) + listings Acheter/Louer
- `/marketplace/cars` — Véhicules (Citadine, Berline, SUV, Luxe) + listings
- `/marketplace/items` — Articles Divers (Mobilier, Électronique, Mode, Loisirs)

### Autres Pages
- `/carpool` — Covoiturage avec formulaire recherche
- `/nearby` — 10 services proches (3x3+1 grid)
- `/all-services` — 21 services (7x3 grid)
- `/all-delivery` — 9 livraisons (3x3 grid)
- `/parcel` — Livraison colis (Single/Multi)
- `/food` — Livraison repas (3 restaurants DB)
- `/wallet`, `/profile`, `/history`, `/support`

### SB Drive Chauffeur
- Welcome dark/amber, Login/Register, Dashboard online/offline

## Routes complètes
/ = Client Welcome, /home, /login, /register
/ride (3 étapes), /food, /parcel, /services, /wallet, /profile, /history, /support
/all-services, /all-delivery, /carpool, /nearby
/beauty, /pet-care, /car-care, /towing, /more-taxi
/marketplace/real-estate, /marketplace/cars, /marketplace/items
/chauffeur, /chauffeur/login, /chauffeur/register, /chauffeur/home
/merchant, /admin, /dispatcher

## Backlog
### P0
- Refactoring backend (1838 lignes → modules routes/models)
- Backend endpoints pour marketplace, carpool, nearby, services
- Flow chauffeur complet (OTP, navigation, WebSocket)
### P1
- Covoiturage fonctionnel, Vidéo Consult, Beauty/Pet fonctionnels
- Grocery/Pharmacy delivery, Stripe webhooks, Cart persistence
### P2
- Push notifications, Chat/Appel chauffeur, Coupons/Parrainage
- Suivi Famille GPS, Enchères services temps réel
