# SB Drive VTC - PRD

## Problème Original
Super-app MVP multi-services (clone Gojek/V3Cube) "SB Drive VTC" : App Client + App Chauffeur.

## Architecture
- **Frontend**: React + Tailwind + Shadcn UI + Phosphor Icons + Leaflet
- **Backend**: FastAPI modulaire + MongoDB
- **Temps réel**: WebSocket natif
- **Paiements**: Stripe (emergentintegrations) + Wallet interne
- **Couleur**: Orange #FF4500

## Implémenté

### Phase 1-8 (DONE)
UI 18+, Backend modulaire, V3Cube DB, WebSocket, Wallet/Coupons, Profile V3Cube, Branding, Phone login

### Phase 9 - Parrainage & Réservation V3Cube (DONE)
Code SB-XXXXXX, 5EUR bonus, booking_no, female_driver, handicap

### Phase 10 - Stripe Payment (DONE)
4 packages (10/20/50/100 EUR), checkout redirect, polling, webhook, anti-double crédit

### Phase 11 - Donation & Live Chat V3Cube (DONE - Avril 2026)
- **Faire un don** : Page /donation avec campagnes de dons (titre, description, lien externe)
  - Endpoint admin POST /api/donations pour créer des campagnes
  - Endpoint GET /api/donations pour lister les campagnes actives
  - Bouton "Faire un don" avec lien externe (target=_blank) comme V3Cube `donation_redirect.php`
- **Parler en direct** : Page /livechat avec chat en direct
  - POST /api/livechat/send avec réponses automatiques intelligentes (bonjour, aide, course, paiement, annulation)
  - GET /api/livechat/messages pour historique des messages
  - Polling auto toutes les 5 secondes
  - Basé sur V3Cube `livechat.php` (LiveChat Inc)
- Liens ajoutés dans Profile Menu (réglages généraux + soutien)
- Test Iteration 20 : Backend 13/13 + Frontend 8/8 = 100% PASS

## Tests
- Iteration 20: Backend 13/13 + Frontend 8/8 PASS (Donation + LiveChat)
- Iteration 19: Backend 12/12 + Frontend 8/8 PASS (Stripe)
- Iteration 18: Backend 14/14 + Frontend 7/7 PASS (Referral + Booking)
- Iterations 14-17: 100% PASS

## P1 - Prochaines tâches
- Persistance du panier entre sessions

## P2 - Futur
- Notifications push, Chat/Appel chauffeur
- Mode simulation chauffeur
