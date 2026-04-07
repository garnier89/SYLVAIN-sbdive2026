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
- **ChauffeurWelcome** : Splash screen + 4 slides onboarding (dark theme, amber accents)
- **ChauffeurLogin** : Connexion par telephone (dark theme, V3Cube style)
  - 3 etapes : Telephone → Mot de passe → Profil
  - Enregistrement avec role=driver
  - Lien "SB Drive Client" pour basculer
- **DriverRegisterPage** : Formulaire 2 etapes (dark theme)
  - Etape 1 : Type vehicule (Voiture/Moto/Velo), immatriculation, modele, permis
  - Etape 2 : Upload documents (permis, carte grise, assurance)
  - Ecran de succes
- **DriverHome** : Carte plein ecran (Leaflet) + toggle En ligne/Hors ligne
  - Statut chauffeur (approuve/en attente/rejete)
  - Mini-stats (courses, gains, note)
  - Modal course entrante (accepter/refuser)
  - Gestion course active (en route/demarrer/terminer/annuler)
- **DriverEarningsPage** : Gains totaux + tabs (Aujourd'hui/Semaine/Mois)
  - Courses recentes avec montants
- **DriverHistoryPage** : Liste courses + filtres (Toutes/Terminees/Annulees/En cours)
- **DriverProfilePage** : Infos chauffeur, vehicule, stats, actions, deconnexion
- **DriverBottomNav** : Navigation partagee (Accueil/Courses/Gains/Profil)
- **Backend** : /api/drivers/earnings, /api/drivers/ride-history, role=driver dans phone-register
- Test Iteration 22 : Backend 15/15 + Frontend 18/18 = 100% PASS

## Tests
- Iteration 22: Backend 15/15 + Frontend 18/18 PASS (App Chauffeur)
- Iteration 21: Backend 12/12 + Frontend 36/36 PASS (V3Cube Auth)
- Iteration 20: 100% PASS (Donation + LiveChat)
- Iteration 19: 100% PASS (Stripe)
- Iteration 18: 100% PASS (Referral + Booking)

## P1 - Prochaines taches
- Persistance du panier entre sessions
- Ajouter services Gojek manquants sur Home

## P2 - Futur
- Notifications push
- Chat/Appel chauffeur
- Mode simulation chauffeur

## Note
- LiveChat : reponses automatiques MOCKEES
- Apple/Facebook/Face ID login : visuels uniquement (non fonctionnels)
- Google login : fonctionnel via Emergent Auth
