# SB Drive VTC - Product Requirements Document

## Application Overview
**SB Drive VTC** est une super-app multi-services de type Gojek/V3Cube, avec deux applications distinctes :
- **SB Drive Client** : Application passager (VTC, commandes, colis, services)
- **SB Drive Chauffeur** : Application chauffeur (courses, livraisons, gains)

## Architecture
- **Frontend**: React 18 + Tailwind CSS + Shadcn/UI
- **Backend**: FastAPI (Python) + MongoDB
- **Auth**: JWT httponly cookies (secure, samesite=none)
- **Maps**: Leaflet / OpenStreetMap
- **Payments**: Stripe
- **Language**: Interface 100% en français

## Core Features Implemented

### Phase 1 - Base (DONE)
1. **App Selector** (/welcome) - Choix Client / Chauffeur / Marchand / Admin
2. **Auth** - Login, Register, JWT cookies, refresh token, Google OAuth
3. **User Home** - 6 services: VTC, Moto, Repas, Colis, Services, Courses
4. **Ride Booking** - Map Leaflet, estimation tarif, types de véhicules
5. **Food Delivery** - 3 restaurants (DB), produits, panier, checkout
6. **Parcel Delivery** - 3 types de colis, carte, estimation, envoi
7. **On-Demand Services** - 8 catégories (plomberie, électricité, ménage, etc.)
8. **Wallet** - Solde, recharge Stripe, historique
9. **Driver App** - Online/offline, accept/reject courses, statuts
10. **Admin Panel** - Dashboard stats, gestion users/drivers
11. **Merchant Panel** - Dashboard, produits, commandes
12. **Dispatcher** - Carte en temps réel

### Seeded Data (MongoDB)
- 3 marchands: Burger Palace, Pizza Heaven, Sushi Master
- 20+ produits par marchand
- Utilisateurs: admin, test user, merchant user

## Tech Stack
- React 18, Tailwind CSS, Shadcn/UI, Phosphor Icons
- FastAPI, Motor (async MongoDB), JWT, bcrypt
- Stripe (payments), Leaflet (maps)
- French language UI throughout

## API Endpoints
- POST /api/auth/login, /register, /refresh, /logout
- GET /api/auth/me
- GET /api/merchants, /api/merchants/{id}/products
- POST /api/orders
- GET/POST /api/wallet, /api/wallet/topup
- POST /api/rides/estimate, /api/rides
- GET /api/admin/dashboard, /api/admin/users, /api/admin/drivers
- POST /api/support/tickets

## What's Next (Backlog)

### P0 - Upcoming
- Backend refactoring (server.py monolith → modules)
- Vehicle types multiples (Berline, Eco, SUV, Moto)
- Driver flow complet (OTP, navigation)
- WebSocket real-time tracking

### P1 - Enhancement
- Grocery/Pharmacy delivery
- Covoiturage / Car Pool
- Commerces à proximité
- Consultation vidéo
- Beauty / Pet care services

### P2 - Future
- Achat/Vente/Location immobilier & véhicules
- Assistance routière & remorquage
- Suivi famille & employés
- Enchères services en temps réel
- Push notifications
- Chat/Call driver
