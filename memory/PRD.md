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

### Phase 8 - Welcome Screen & Phone-First Login (DONE - Avril 2026)
- **Écran de démarrage** : Logo SB centré + "SB DRIVE CLIENT"
- **Welcome V3Cube** : Header "SB DRIVE CLIENT" + FR/EUR badges, image voiture, "Bienvenue dans l'application client", dots + flèche orange
- **Onboarding supprimé** : Passage direct splash → welcome
- **Login unifié par téléphone** (3 étapes) :
  - Étape 1 : Numéro de mobile (+33 préfixe)
  - Étape 2 : Mot de passe (existant→connexion, nouveau→créer mot de passe)
  - Étape 3 : Profil (nouveau uniquement: Nom*, Prénom, Email facultatif, Code parrainage facultatif)
- **3 nouveaux endpoints** : /api/auth/check-phone, /api/auth/phone-login, /api/auth/phone-register
- **/register redirige vers /login**
- Test Iteration 17 : Backend 12/12 PASS, Frontend 22/23 PASS (1 minor)

## Tests
- Iteration 17: Backend 12/12 + Frontend 22/23 PASS (Phone login)
- Iteration 16: Frontend 31/31 PASS (Branding)
- Iteration 15: Frontend 30/30 PASS (Profile)
- Iteration 14: Backend 19/19 + Frontend 100% PASS

## P1 - Prochaines tâches
- Stripe integration pour paiement réel (wallet topup + course)
- Système de parrainage (REFERRAL_AMOUNT=5)
- Persistance du panier entre sessions

## P2 - Futur
- Notifications push, Chat/Appel chauffeur
- Suivi famille GPS, Enchères, Vidéo consultation
- Mode simulation chauffeur
