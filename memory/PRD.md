# SB Drive VTC - PRD

## Probleme Original
Super-app MVP multi-services (clone Gojek/V3Cube) "SB Drive VTC" : App Client + App Chauffeur + Admin Panel.

## Architecture
- **Frontend**: React + Tailwind + Shadcn UI + Phosphor Icons + Leaflet
- **Backend**: FastAPI modulaire + MongoDB
- **Temps reel**: WebSocket natif
- **Paiements**: Stripe (emergentintegrations) + Wallet interne
- **Couleur Client**: Orange #FF4500, Accents bleus #4a9eff
- **Couleur Chauffeur**: Amber-500, fond gray-950
- **Couleur Admin**: #FF4500 sur fond #0f1117/#161923

## Implemente

### Phase 1-11 (DONE)
UI 18+, Backend, V3Cube DB, WebSocket, Wallet/Coupons, Profile, Branding, Phone login, Parrainage, Stripe, Donation, LiveChat

### Phase 12 - Realignement Auth V3Cube (DONE)
LoginPage dark theme, modal social login, ClientWelcome onboarding

### Phase 13 - Application Chauffeur (DONE)
ChauffeurWelcome, ChauffeurLogin, DriverRegisterPage, DriverHome, DriverEarningsPage, DriverHistoryPage, DriverProfilePage

### Phase 14 - Mode Simulation (DONE)
Chauffeur virtuel auto-accepte, mouvement GPS simule, cycle complet ~40s

### Phase 15 - Dashboard Admin Gojek (DONE - Avril 2026)
7 pages admin completes :
1. **Dashboard** : 6 KPIs (utilisateurs, chauffeurs, courses/jour, revenus/jour, chauffeurs en attente, tickets), actions rapides, stats
2. **Utilisateurs** : Liste 53+ users, recherche, filtres role (Tous/Clients/Chauffeurs/Admins), Suspendre/Reactiver
3. **Chauffeurs** : Liste avec statuts (approuve/en attente/rejete), boutons Approuver/Rejeter
4. **Courses** : 38+ courses, badges statut colores, filtres (Toutes/En attente/En cours/Terminees/Annulees), details depart/arrivee
5. **Revenus & Commissions** : Card total orange gradient, tabs periode (Aujourd'hui/Semaine/Mois/Total), commission 10%, transactions recentes
6. **Support** : Liste tickets, vue detail avec reponses, systeme de reply
7. **Configuration** : Nom plateforme, devise (EUR/USD/XAF), langue (FR/EN), commission %, tarif min, toggles auto-assignation/notifications
- Backend : `/api/admin/revenue` endpoint ajoute
- AdminLayout : Sidebar sombre avec navigation nested (React Router Outlet)
- Test Iteration 24 : Backend 17/17 + Frontend 12/12 = 100% PASS

## Tests
- Iteration 24: Backend 17/17 + Frontend 12/12 PASS (Admin Dashboard)
- Iteration 23: Backend 15/15 + Frontend 8/8 PASS (Simulation)
- Iteration 22: Backend 15/15 + Frontend 18/18 PASS (App Chauffeur)
- Iteration 21: Backend 12/12 + Frontend 36/36 PASS (V3Cube Auth)
- Iterations 14-20: 100% PASS

## P1 - Prochaines taches
- Persistance du panier entre sessions
- Ajouter services Gojek manquants sur Home

## P2 - Futur
- Notifications push
- Chat/Appel chauffeur
- Persistance settings admin (backend)

## Note
- LiveChat : reponses MOCKEES
- Settings admin : sauvegarde frontend uniquement (pas de persistance backend)
- Apple/Facebook/Face ID login : visuels uniquement
- Google login : fonctionnel via Emergent Auth
