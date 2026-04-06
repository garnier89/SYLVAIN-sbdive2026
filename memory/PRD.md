# SB Drive VTC - Product Requirements Document

## Présentation
**SB Drive VTC** — Super app multi-services (clone Gojek/V3Cube)
- **SB Drive Client** = App passager (/) — thème vert/bleu
- **SB Drive Chauffeur** = App chauffeur (/chauffeur) — thème amber/dark

## Architecture
- Frontend: React 18 + Tailwind CSS + Shadcn/UI + Phosphor Icons
- Backend: FastAPI **modulaire** (6 route files + core config/deps)
- Database: MongoDB (Motor async)
- Auth: JWT httponly cookies (secure, samesite=none)
- Maps: Leaflet / OpenStreetMap
- Payments: Stripe
- Language: 100% Français

## Structure Backend (refactorisé)
```
/app/backend/
├── server.py (~140 lignes, imports + lifespan + seed + CORS)
├── core/config.py (DB, JWT, Stripe config)
├── core/deps.py (Auth helpers, password, storage)
├── core/websocket.py (ConnectionManager)
├── models/schemas.py (Pydantic models)
├── routes/auth.py (Register, Login, Logout, Refresh, Google, Addresses)
├── routes/drivers.py (Register, Profile, Toggle, Location, Documents)
├── routes/merchants.py (Register, CRUD products, List merchants)
├── routes/rides.py (Estimate, Create, Accept, Status, List, Rate)
├── routes/orders.py (Create, Status, List, Assign, Rate)
├── routes/marketplace.py (CRUD listings: immobilier, véhicules, articles)
├── routes/carpool.py (Create, Search, Book, My Rides)
├── routes/services.py (Categories, Bookings CRUD, Nearby)
└── routes/misc.py (Wallet, Stripe, Support, Admin, Dispatcher, Health)
```

## Fonctionnalités implémentées

### Recherche intelligente
- Overlay plein écran avec 60+ services indexés
- Recherche accent-insensitive en temps réel
- Résultats groupés par catégorie (Taxi, Livraison, Beauté, Animaux, etc.)
- Suggestions populaires (VTC, Repas, Colis, Massage, Plombier, etc.)

### Réservation de services (connecté au backend)
- **Beauté** (/beauty) — 12 services avec booking → POST /api/services/bookings
- **Animaux** (/pet-care) — 12 services avec booking
- **Entretien Auto** (/car-care) — 8 services avec booking
- **Dépannage** (/towing) — 9 services avec booking
- Composant ServiceBookingSheet réutilisable (adresse, date, heure, notes)

### Covoiturage (connecté au backend)
- Rechercher des trajets (GET /api/carpool/rides)
- Publier un trajet (POST /api/carpool/rides)
- Réserver une place (POST /api/carpool/rides/{id}/book)
- Mes trajets (GET /api/carpool/my-rides)

### Marketplace (connecté au backend)
- 3 types : Immobilier, Véhicules, Articles Divers
- Créer une annonce (POST /api/marketplace/listings)
- Rechercher/Filtrer par type, catégorie, listing_type
- Onglets Acheter/Louer

### Réservation VTC (3 étapes V3Cube)
1. Planifier — Lieux Favoris, Récents, Carte
2. Carte + Véhicule (Basic/SUV/Luxe) — Leaflet map
3. Recherche chauffeur + OTP

### Home Client (18+ sections)
Services Taxi (8), Colis, Livraison (4), Vidéo Consultation, Services à la demande (4), Beauté (4), Médical (3 cards), Animaux (3), Enchères (6 items 2x3), Entretien Auto (4), Dépannage, Marketplace (3 banners), Covoiturage, Suivi Famille (2 cards), Commerces Proches (4), Bottom nav

### Chauffeur
- Dashboard online/offline, Accept/Reject, OTP, Navigation, Labels français, EUR

## Routes
/ = Welcome, /home, /login, /register, /ride, /food, /parcel, /services
/wallet, /profile, /history, /support, /all-services, /all-delivery
/carpool, /nearby, /beauty, /pet-care, /car-care, /towing, /more-taxi
/marketplace/real-estate, /marketplace/cars, /marketplace/items
/chauffeur, /chauffeur/login, /chauffeur/register, /chauffeur/home
/merchant, /admin, /dispatcher

## Backlog
### P0
- WebSocket real-time tracking (driver location updates)
- Historique des réservations (rides + services + orders)
### P1
- Vidéo Consultation fonctionnelle
- Grocery/Pharmacy delivery distinct flows
- Stripe webhooks production
- Cart persistence across sessions
### P2
- Push notifications
- Chat/Appel chauffeur
- Coupons/Parrainage
- Suivi Famille GPS temps réel
- Enchères services temps réel
