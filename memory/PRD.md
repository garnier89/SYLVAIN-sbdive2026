# SB Drive VTC - PRD

## Problème Original
Super-app MVP multi-services (clone Gojek/V3Cube) "SB Drive VTC" : App Client + App Chauffeur. Services: VTC, livraison, services à la demande (18+).

## Architecture
- **Frontend**: React + Tailwind + Shadcn UI + Phosphor Icons + Leaflet
- **Backend**: FastAPI modulaire + MongoDB
- **Temps réel**: WebSocket natif
- **Paiements**: Wallet interne (Stripe prévu)

## Structure Backend
```
/app/backend/
  server.py, core/{config,deps,websocket,seed_data}.py, models/schemas.py
  routes/{auth,rides,orders,services,config,wallet,coupons,marketplace,carpool,misc,drivers,merchants}.py
```

## Implémenté

### Phase 1 - UI (DONE)
18+ pages services, SearchOverlay, Chauffeur flow, RideBooking avec carte

### Phase 2 - Backend Modulaire (DONE)
Auth JWT, CRUD rides/orders/services/marketplace/carpool, Admin panel, Dispatcher

### Phase 3 - V3Cube DB (DONE)
224+ tables analysées, seed data, 10 endpoints /api/config/*, tarification V3Cube

### Phase 4 - WebSocket & Ride Flow (DONE)
WS rooms par course, suivi chauffeur live, flow pending→accepted→arriving→in_progress→completed/cancelled, page tracking temps réel, OTP, évaluation

### Phase 5 - Wallet, Coupons, Production DB (DONE - Avril 2026)
- **Base de données production** : 1.2GB SQL extrait (463 users, 171 drivers, 930 trips, 45 coupons)
- **Wallet complet** : Topup (max 200EUR/tx), Pay, Transfer, Refund, Historique transactions
- **Système de coupons** : Validate (% et flat), Apply (limite par user), 4 coupons de prod
- **90+ configs production** : Company, social links, payment modes, ride settings, wallet, tips, intercity, carpool
- **10 raisons d'annulation** FR enrichies de la DB production
- **10 catégories véhicules** dont Livraison
- **Page Historique** : Courses/Commandes tabs avec filtres (tous, terminées, annulées, en attente)

## Tests
- Iteration 14: Backend 19/19 + Frontend 100% PASS
- Iterations 12-13: 100% PASS

## P1 - Prochaines tâches
- Stripe integration pour paiement réel (wallet topup + course)
- Persistance du panier entre sessions

## P2 - Futur
- Notifications push, Chat/Appel chauffeur
- Suivi famille GPS, Enchères temps réel, Vidéo consultation
- Mode simulation chauffeur (démo)
