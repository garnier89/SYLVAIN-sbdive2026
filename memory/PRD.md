# SB Drive VTC - PRD (Product Requirements Document)

## Problème Original
Construire une super-app MVP multi-services (clone Gojek/V3Cube) nommée "SB Drive VTC" avec une App Client et une App Chauffeur distinctes. Services: VTC, livraison de colis, livraison de repas, et services à la demande (18+ services).

## Architecture Technique
- **Frontend**: React + Tailwind CSS + Shadcn UI + Phosphor Icons
- **Backend**: FastAPI (modulaire) + MongoDB
- **Maps**: OpenStreetMap / Leaflet
- **Paiements**: Stripe (en attente de clé)
- **Temps réel**: WebSocket natif (FastAPI WebSocket)

## Structure Backend Modulaire
```
/app/backend/
  server.py (entry point + seed V3Cube + WS handler)
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
- Extraction et analyse des dumps SQL V3Cube (224 tables)
- 9 catégories de véhicules, 5 types avec tarification
- 6 catégories maîtres, 21 catégories commerces, 5 types colis
- 8 raisons d'annulation, 35+ configurations applicatives
- Logique de tarification V3Cube (Regular/Fixed/Hourly)
- 10 endpoints /api/config/*

### Phase 4 - WebSocket & Flow Course Complet (DONE - Avril 2026)
- WebSocket temps réel avec rooms par course
- Suivi position chauffeur en direct sur la carte
- Flow de course complet: pending → accepted → arriving → in_progress → completed/cancelled
- Validation des transitions d'état (impossible de sauter une étape)
- Page de suivi de course temps réel (/ride/{rideId}) avec:
  - Carte avec position chauffeur live, marqueurs pickup/dropoff
  - Barre de progression d'état
  - Infos chauffeur (nom, note, véhicule)
  - Code OTP (quand le chauffeur arrive)
  - Détails du tarif
  - Annulation avec raisons V3Cube + frais d'annulation
  - Modal d'évaluation après course
- Hook useWebSocket avec reconnexion auto et keep-alive
- Intégration WebSocket côté chauffeur (DriverHome)
- Endpoints: /rides/active/current, /rides/pending/available, /rides/{id}/cancel

## Endpoints API Complets

### Auth
- POST /api/auth/register, /login, /logout, /refresh, /me

### Config (V3Cube)
- GET /api/config/vehicle-categories, /vehicle-types, /vehicle-types/{slug}
- GET /api/config/app, /nearby-categories, /parcel-types
- GET /api/config/cancel-reasons, /master-categories, /track-categories
- GET /api/config/admin/all, PUT /api/config/admin/{key}

### Rides (enrichi)
- POST /api/rides/estimate (pricing V3Cube)
- POST /api/rides (créer avec OTP + champs V3Cube)
- GET /api/rides/{id}, GET /api/rides
- GET /api/rides/active/current
- GET /api/rides/pending/available
- POST /api/rides/{id}/accept, /status, /cancel, /rate

### WebSocket
- ws://host/ws/{client_id} — Messages: ping, join_ride, leave_ride, location_update

### Services, Orders, Marketplace, Carpool
- Voir routes/ pour détails

## Tests
- Iteration 13: Backend 19/19 PASS (100%), Frontend OK
- WebSocket interne OK, externe peut timeout (ingress)
- Iteration 12: 29/29 PASS (100%)

## P1 - À faire maintenant
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
