# SB Drive VTC - PRD

## Problème Original
Super-app MVP multi-services (clone Gojek/V3Cube) "SB Drive VTC" : App Client + App Chauffeur.

## Architecture
- **Frontend**: React + Tailwind + Shadcn UI + Phosphor Icons + Leaflet
- **Backend**: FastAPI modulaire + MongoDB
- **Temps réel**: WebSocket natif
- **Paiements**: Stripe (via emergentintegrations) + Wallet interne
- **Couleur principale**: Orange #FF4500

## Implémenté

### Phase 1-7 (DONE)
UI 18+ services, Backend modulaire, V3Cube DB, WebSocket, Wallet/Coupons, Profile V3Cube, Branding orange

### Phase 8 - Welcome Screen & Phone-First Login (DONE)
Splash SB logo, Welcome V3Cube, Login unifié téléphone (3 étapes)

### Phase 9 - Parrainage & Réservation V3Cube (DONE)
Code SB-XXXXXX, 5EUR bonus bidirectionnel, booking_no, female_driver_request, handicap_accessibility

### Phase 10 - Stripe Payment Integration (DONE - Avril 2026)
- **Checkout Stripe** : 4 packages fixes (10, 20, 50, 100 EUR) - montants côté serveur uniquement
- **payment_transactions** : Collection MongoDB pour suivi des paiements
- **Flow sécurisé** : Checkout → Stripe redirect → Polling status → Crédit wallet
- **Webhook** : POST /api/webhook/stripe pour confirmation paiement
- **Protection anti-double crédit** : Mise à jour atomique MongoDB
- **Frontend** : Boutons topup dans wallet + polling automatique au retour de Stripe
- Test Iteration 19 : Backend 12/12 + Frontend 8/8 = 100% PASS

## Tests
- Iteration 19: Backend 12/12 + Frontend 8/8 PASS (Stripe)
- Iteration 18: Backend 14/14 + Frontend 7/7 PASS (Referral + Booking)
- Iteration 17: Backend 12/12 + Frontend 22/23 PASS (Phone login)
- Iterations 14-16: 100% PASS

## P1 - Prochaines tâches
- Persistance du panier entre sessions

## P2 - Futur
- Notifications push, Chat/Appel chauffeur
- Suivi famille GPS, Mode simulation chauffeur
