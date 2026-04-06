# SB Drive VTC - Product Requirements Document

## Présentation
**SB Drive VTC** est le nom de la société. Elle opère 2 applications distinctes :
- **SB Drive Client** — App passager (réservation VTC, commandes, services)
- **SB Drive Chauffeur** — App chauffeur (courses, livraisons, gains)

Ce sont 2 applications séparées avec leur propre login, design et navigation.

## Architecture
- **Frontend**: React 18 + Tailwind CSS + Shadcn/UI + Phosphor Icons
- **Backend**: FastAPI (Python) + MongoDB (Motor async)
- **Auth**: JWT httponly cookies (secure, samesite=none)
- **Maps**: Leaflet / OpenStreetMap
- **Payments**: Stripe
- **Language**: Interface 100% en français

## URL Structure
- `/` — SB Drive Client (welcome ou home si connecté)
- `/login`, `/register` — Auth Client
- `/ride`, `/food`, `/parcel`, `/services` — Services Client
- `/chauffeur` — SB Drive Chauffeur (welcome)
- `/chauffeur/login`, `/chauffeur/register` — Auth Chauffeur
- `/chauffeur/home` — Dashboard Chauffeur
- `/merchant` — Panel Marchand
- `/admin` — Panel Admin

## Features Implementées

### SB Drive Client
1. **Welcome Page** — Branding vert, boutons Se connecter / Créer un compte
2. **Auth** — Login, Register, Google OAuth, JWT refresh token
3. **Home** — 18 services V3Cube en 3 catégories :
   - Base (4) : VTC, Moto, Repas, Colis
   - À la demande (4) : Services, Courses, Beauté, Coursier
   - Additionnels (10) : Médical, Animaux, Vidéo Consult, Covoiturage, Auto Soins, Remorquage, Enchères, Immobilier, À proximité, Achat/Vente
4. **Ride Booking** — Map Leaflet, estimation tarif, types véhicules
5. **Food Delivery** — 3 restaurants DB, produits, panier, checkout
6. **Parcel Delivery** — 3 types colis, carte, estimation, envoi
7. **On-Demand Services** — 8 catégories (plomberie, électricité, ménage...)
8. **Wallet** — Solde, recharge Stripe
9. **Profile, History, Support**

### SB Drive Chauffeur
1. **Welcome Page** — Branding amber/dark, "Devenir chauffeur"
2. **Auth** — Login/Register séparés du client
3. **Dashboard** — Online/offline, accept/reject courses
4. **Navigation** — Statuts de course en temps réel

### Admin & Merchant
1. **Admin Panel** — Dashboard stats, gestion users/drivers
2. **Merchant Panel** — Dashboard, produits, commandes

### Seeded Data (MongoDB)
- 3 marchands : Burger Palace, Pizza Heaven, Sushi Master
- 20+ produits
- Users : admin, test user, merchant user

## API Endpoints
- POST /api/auth/login, /register, /refresh, /logout
- GET /api/auth/me
- GET /api/merchants, /api/merchants/{id}/products
- POST /api/orders, /api/rides/estimate, /api/rides
- GET/POST /api/wallet, /api/wallet/topup
- GET /api/admin/dashboard, /api/admin/users, /api/admin/drivers
- POST /api/support/tickets

## Backlog

### P0 — Prochain
- Refactoring backend (server.py 1838 lignes → modules)
- Types de véhicules multiples (Berline, Eco, SUV)
- Flow chauffeur complet (OTP, navigation)
- WebSocket real-time tracking

### P1 — Enhancement
- Grocery/Pharmacy delivery
- Covoiturage fonctionnel
- Vidéo consultation fonctionnelle
- Beauty/Pet care booking

### P2 — Futur
- Achat/Vente/Location immobilier & véhicules
- Assistance routière & remorquage
- Système de coupons/parrainage
- Push notifications, Chat/Call driver
