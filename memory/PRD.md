# SB Drive VTC - PRD

## Problème Original
Super-app MVP multi-services (clone Gojek/V3Cube) "SB Drive VTC" : App Client + App Chauffeur.

## Architecture
- **Frontend**: React + Tailwind + Shadcn UI + Phosphor Icons + Leaflet
- **Backend**: FastAPI modulaire + MongoDB
- **Temps réel**: WebSocket natif
- **Paiements**: Stripe (emergentintegrations) + Wallet interne
- **Couleur**: Orange #FF4500, Accents bleus #4a9eff

## Implémenté

### Phase 1-8 (DONE)
UI 18+, Backend modulaire, V3Cube DB, WebSocket, Wallet/Coupons, Profile V3Cube, Branding, Phone login

### Phase 9 - Parrainage & Réservation V3Cube (DONE)
Code SB-XXXXXX, 5EUR bonus, booking_no, female_driver, handicap

### Phase 10 - Stripe Payment (DONE)
4 packages (10/20/50/100 EUR), checkout redirect, polling, webhook, anti-double crédit

### Phase 11 - Donation & Live Chat V3Cube (DONE - Avril 2026)
- **Faire un don** : Page /donation avec campagnes de dons
- **Parler en direct** : Page /livechat avec chat (réponses MOCKÉES)

### Phase 12 - Réalignement Auth V3Cube (DONE - Avril 2026)
- **LoginPage** réécriture complète :
  - Thème sombre (#1a1a2e) identique à l'app native V3Cube
  - Sélecteur de pays avec drapeau (FR +33, US +1, etc.)
  - Modal "Choisir un compte" (Apple, Google, Facebook, Face ID/Touch ID)
  - Google Login fonctionnel via Emergent Auth
  - Lien "Conditions Générales"
  - Bouton FAB circulaire bleu (#4a9eff)
  - 3 étapes : Téléphone → Mot de passe → Profil
- **ClientWelcome** mis à jour :
  - 5 slides d'onboarding avec icônes (ShieldCheck, Car, Package, Wrench, Wallet)
  - Header "SB DRIVE CLIENT" + sélecteurs FR/EUR bleus
  - Pagination dots + bouton flèche
  - Splash screen avec dots de chargement
- Test Iteration 21 : Backend 12/12 + Frontend 36/36 = 100% PASS

## Tests
- Iteration 21: Backend 12/12 + Frontend 36/36 PASS (V3Cube Auth Realignment)
- Iteration 20: Backend 13/13 + Frontend 8/8 PASS (Donation + LiveChat)
- Iteration 19: Backend 12/12 + Frontend 8/8 PASS (Stripe)
- Iteration 18: Backend 14/14 + Frontend 7/7 PASS (Referral + Booking)
- Iterations 14-17: 100% PASS

## P1 - Prochaines tâches
- Persistance du panier entre sessions
- Ajouter services Gojek manquants

## P2 - Futur
- Notifications push
- Chat/Appel chauffeur
- Mode simulation chauffeur

## Note
- LiveChat : réponses automatiques MOCKÉES
- Apple/Facebook/Face ID login : visuels uniquement (non fonctionnels)
- Google login : fonctionnel via Emergent Auth
