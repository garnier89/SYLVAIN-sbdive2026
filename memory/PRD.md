# SB Drive VTC - PRD

## Problème Original
Super-app MVP multi-services (clone Gojek/V3Cube) "SB Drive VTC" : App Client + App Chauffeur. Services: VTC, livraison, services à la demande (18+).

## Architecture
- **Frontend**: React + Tailwind + Shadcn UI + Phosphor Icons + Leaflet
- **Backend**: FastAPI modulaire + MongoDB
- **Temps réel**: WebSocket natif
- **Paiements**: Wallet interne (Stripe prévu)
- **Couleur principale**: Orange #FF4500

## Implémenté

### Phase 1-4 (DONE)
UI 18+ services, Backend modulaire, V3Cube DB 224+ tables, WebSocket ride tracking

### Phase 5 - Wallet, Coupons, Production DB (DONE)
1.2GB SQL prod, Wallet complet, Coupons, 90+ configs, Historique

### Phase 6 - Profile Menu V3Cube Clone (DONE)
10 sections, 35+ menu items, Test 15: 30/30 PASS

### Phase 7 - Branding Orange (DONE)
Thème orange #FF4500, Logo SB, Badge Emergent masqué, Test 16: 31/31 PASS

### Phase 8 - Welcome Screen & Phone-First Login (DONE)
Splash SB logo, Welcome V3Cube, Login unifié par téléphone (3 étapes), Test 17: 34/35 PASS

### Phase 9 - Système de Réservation V3Cube + Parrainage (DONE - Avril 2026)
- **Réservation enrichie** : booking_no (8 chiffres), auto_assign, female_driver_request, handicap_accessibility, notes
- **Parrainage multi-niveaux** (V3Cube `multi_level_referral_master`) :
  - Code unique SB-XXXXXX généré à l'inscription
  - Validation de code (/api/referral/validate)
  - Crédit wallet automatique : 5EUR parrain + 5EUR filleul
  - Suivi des parrainages (/api/referral/stats, /api/referral/my-code)
  - Protection anti-doublon et anti-auto-parrainage
  - Page frontend /referral avec code, partage, statistiques, et liste de parrainages
  - Lié au profil (Inviter des amis → /referral)
- **Test Iteration 18** : Backend 14/14 + Frontend 7/7 = 100% PASS

## Tests
- Iteration 18: Backend 14/14 + Frontend 7/7 PASS (Referral + Booking)
- Iteration 17: Backend 12/12 + Frontend 22/23 PASS (Phone login)
- Iteration 16: Frontend 31/31 PASS (Branding)
- Iteration 15: Frontend 30/30 PASS (Profile)
- Iteration 14: Backend 19/19 + Frontend 100% PASS

## P1 - Prochaines tâches
- Intégration Stripe pour paiement réel (wallet topup + course)
- Persistance du panier entre sessions

## P2 - Futur
- Notifications push, Chat/Appel chauffeur
- Suivi famille GPS, Enchères, Vidéo consultation
- Mode simulation chauffeur
