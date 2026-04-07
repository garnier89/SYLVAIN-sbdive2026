# SB Drive VTC - PRD

## Probleme Original
Super-app MVP multi-services (clone Gojek/V3Cube) "SB Drive VTC" : App Client + App Chauffeur.

## Architecture
- **Frontend**: React + Tailwind + Shadcn UI + Phosphor Icons + Leaflet
- **Backend**: FastAPI modulaire + MongoDB
- **Temps reel**: WebSocket natif
- **Paiements**: Stripe (emergentintegrations) + Wallet interne
- **Couleur Client**: Orange #FF4500, Accents bleus #4a9eff
- **Couleur Chauffeur**: Amber-500, fond gray-950

## Implemente

### Phase 1-8 (DONE)
UI 18+, Backend modulaire, V3Cube DB, WebSocket, Wallet/Coupons, Profile V3Cube, Branding, Phone login

### Phase 9 - Parrainage & Reservation V3Cube (DONE)
Code SB-XXXXXX, 5EUR bonus, booking_no, female_driver, handicap

### Phase 10 - Stripe Payment (DONE)
4 packages (10/20/50/100 EUR), checkout redirect, polling, webhook

### Phase 11 - Donation & Live Chat V3Cube (DONE)
Faire un don + Parler en direct (reponses MOCKEES)

### Phase 12 - Realignement Auth V3Cube (DONE - Avril 2026)
LoginPage dark theme, modal Apple/Google/Facebook/Face ID, ClientWelcome onboarding

### Phase 13 - Application Chauffeur (DONE - Avril 2026)
ChauffeurWelcome, ChauffeurLogin, DriverRegisterPage, DriverHome, DriverEarningsPage, DriverHistoryPage, DriverProfilePage, DriverBottomNav

### Phase 14 - Mode Simulation (DONE - Avril 2026)
- **Backend** `/api/simulation/start|stop|status` :
  - Cree un chauffeur virtuel approuve (nom francais aleatoire + vehicule)
  - Background task asyncio qui poll les courses pending du client
  - Auto-acceptation apres ~3s
  - Mouvement simule: point aleatoire → pickup → dropoff (coords GPS interpolees)
  - Envoie WebSocket: `driver_location`, `ride_status_update`
  - Cycle complet: pending → accepted → arriving → in_progress → completed (~40s)
  - Nettoyage du chauffeur virtuel a l'arret
- **Frontend** Toggle sur UserHome :
  - Panneau vert "Simulation active" avec nom du chauffeur et vehicule
  - Indicateur pulsant
  - Test Iteration 23 : Backend 15/15 + Frontend 8/8 = 100% PASS

## Tests
- Iteration 23: Backend 15/15 + Frontend 8/8 PASS (Simulation Mode)
- Iteration 22: Backend 15/15 + Frontend 18/18 PASS (App Chauffeur)
- Iteration 21: Backend 12/12 + Frontend 36/36 PASS (V3Cube Auth)
- Iterations 14-20: 100% PASS

## P1 - Prochaines taches
- Persistance du panier entre sessions
- Ajouter services Gojek manquants sur Home

## P2 - Futur
- Notifications push
- Chat/Appel chauffeur
- Dashboard admin

## Note
- LiveChat : reponses MOCKEES
- Apple/Facebook/Face ID login : visuels uniquement
- Google login : fonctionnel via Emergent Auth
- Simulation : chauffeur virtuel temporaire
