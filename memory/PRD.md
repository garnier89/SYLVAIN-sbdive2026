# SB Drive VTC - PRD (Product Requirements Document)

## Problème Original
Construire une super-app MVP multi-services (clone Gojek/V3Cube) nommée "SB Drive VTC" avec une App Client et une App Chauffeur distinctes. Services: VTC, livraison de colis, livraison de repas, et services à la demande (18+ services).

## Architecture Technique
- **Frontend**: React + Tailwind CSS + Shadcn UI + Phosphor Icons
- **Backend**: FastAPI (modulaire) + MongoDB
- **Maps**: OpenStreetMap / Leaflet
- **Paiements**: Stripe (en attente de clé)

## Structure Backend Modulaire
```
/app/backend/
  server.py (entry point + seed V3Cube data)
  core/config.py, deps.py, websocket.py, seed_data.py
  models/schemas.py
  routes/auth.py, rides.py, orders.py, services.py, config.py, marketplace.py, carpool.py, misc.py, drivers.py, merchants.py
```

## Ce qui est implémenté

### Phase 1 - UI Complète (DONE)
- 18+ pages de services (Beauty, Pet, CarPool, Marketplace, NearbyBusiness, etc.)
- Page d'accueil avec toutes les catégories V3Cube
- Recherche globale (SearchOverlay)
- Flow Chauffeur (/chauffeur) avec OTP en français
- Page de réservation de course avec carte Leaflet

### Phase 2 - Backend Modulaire (DONE)  
- Refactoring du monolith server.py en routes/ et models/
- Auth JWT (login, register, logout, refresh)
- APIs CRUD pour rides, orders, services, marketplace, carpool
- Admin panel (dashboard, users, drivers)
- Dispatcher live panel

### Phase 3 - Intégration V3Cube (DONE - Avril 2026)
- Extraction et analyse des dumps SQL V3Cube (sbdriv5_db2024.sql + beta)
- Mapping du schéma legacy MySQL -> MongoDB
- Seed data V3Cube avec 224 tables analysées:
  - 9 catégories de véhicules (VTC-Taxi, Moto, Location, Pool, Planifier, Corporate, Réserver pour autre, Enchères, Inter-villes)
  - 5 types de véhicules avec tarification (SB, Confort, Luxe, Moto, Pool)
  - 6 catégories maîtres de services (Taxi, Livraison, Services à la demande, Vidéo Consultation, Enchères, Médical)
  - 21 catégories de commerces proches
  - 5 types de colis livraison
  - 8 raisons d'annulation (User/Driver/Both)
  - 2 catégories de suivi (Famille, Employés)
  - 35+ configurations applicatives
- Logique de tarification V3Cube (Regular/Fixed/Hourly)
- 10 nouveaux endpoints API /api/config/*
- Frontend dynamique: types de véhicules chargés depuis l'API

## Endpoints API

### Auth
- POST /api/auth/register, /login, /logout, /refresh, /me

### Config (V3Cube)
- GET /api/config/vehicle-categories (9 catégories)
- GET /api/config/vehicle-types (5 types avec pricing)
- GET /api/config/vehicle-types/{slug}
- GET /api/config/app (configurations clé-valeur)
- GET /api/config/nearby-categories (21 catégories)
- GET /api/config/parcel-types (5 types)
- GET /api/config/cancel-reasons (8 raisons, filtrable par user_type)
- GET /api/config/master-categories (6 catégories)
- GET /api/config/track-categories (2 catégories)
- GET /api/config/admin/all (admin only)
- PUT /api/config/admin/{key} (admin only)

### Rides
- POST /api/rides/estimate (enrichi avec pricing V3Cube)
- POST /api/rides (créer course)
- GET /api/rides/{id}, GET /api/rides
- POST /api/rides/{id}/accept, /status, /rate

### Services, Orders, Marketplace, Carpool
- Voir routes/ pour détails complets

## Tests
- Iteration 12: 29/29 tests PASS (100%)
- Backend: Tous endpoints config, auth, rides fonctionnels
- Frontend: Login flow, Home, Ride booking avec types dynamiques

## P0 - À faire maintenant
- WebSocket temps réel pour suivi chauffeur
- Enrichir la logique de course (accepting/arriving/in_progress)

## P1 - À venir
- Stripe webhook pour wallet et checkout
- Persistance du panier entre sessions
- Historique complet des réservations

## P2 - Futur/Backlog
- Notifications push
- Chat/Appel chauffeur
- Système de coupons et parrainage
- Suivi famille GPS temps réel
- Enchères services temps réel
- Vidéo consultation fonctionnelle
