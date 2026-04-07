# SB Drive VTC - PRD (Product Requirements Document)

## Vision
Application super-app multi-services type Gojek/V3Cube pour le marche VTC francophone.

## Architecture
- **Frontend**: React + Tailwind CSS + Leaflet Maps
- **Backend**: FastAPI + MongoDB  
- **Auth**: JWT (cookie-based) + Google OAuth via Emergent
- **Payments**: Stripe Checkout
- **Real-time**: WebSockets (ride tracking, simulation)

## Modules implementes

### 1. Authentification & Onboarding (DONE)
- Login par telephone (style V3Cube dark theme)
- Login email/password
- Google OAuth via Emergent
- Inscription avec verification OTP
- Roles: user, driver, admin, merchant

### 2. Application Utilisateur (DONE)
- Home screen avec services (Taxi, Livraison, Covoiturage, etc.)
- Reservation de course (pickup/dropoff, types vehicules)
- Suivi en temps reel sur carte
- Historique des courses
- Portefeuille (wallet) avec recharge Stripe

### 3. Application Chauffeur (DONE)
- Login chauffeur
- Ecran d'accueil avec courses en attente
- Acceptation/refus de course
- Navigation vers pickup/dropoff
- Historique et gains
- Inscription avec upload documents

### 4. Mode Simulation (DONE)
- Chauffeur virtuel auto-accepte les courses
- Deplacement simule sur carte via WebSocket
- Start/Stop depuis l'admin

### 5. Page de Connexion Admin (DONE - Apr 7, 2026)
- Page dediee /admin-login avec logo SB
- Titre "Welcome to Admin Panel" style serif bold
- Onglets: All Admin, Dispatcher Admin, Billing Admin, Server Admin
- Formulaire: Admin E-mail, Password
- Lien "mot de passe oublie?"
- Bouton SIGN IN bleu pill-shaped
- Navigation en bas: Main website, Client Login, Chauffeur Login, Flotte - Entreprise Login
- Redirection vers /admin apres connexion reussie

### 6. Panel Admin XJekPlus (DONE - Apr 7, 2026)
- **Layout**: Theme clair avec sidebar complete (HOME, MEMBERS, SERVICES, BOOKINGS & REPORTS, LOCATION, PROMOTIONS, CMS, SYSTEM)
- **Dashboard**: God's View avec carte, KPI cards (Users, Service Providers, Stores), On Demand Services, Revenue Today
- **Users**: Table avec filtres Search/Status, tri colonnes, actions Suspend/Unsuspend
- **Drivers**: Table avec Approve/Reject, filtres Status
- **Trips/Jobs**: Date presets (Today/Yesterday/Week...), filtres multiples, table avec View Details
- **Revenue/Reports**: Rapport financier avec periodes, cards recapitulatives
- **Reviews**: Tabs Service Providers/Users, table avec actions
- **God's View (standalone)**: Carte avec chauffeurs en temps reel, status cards, recherche
- **Heat View**: Carte heatmap avec controles
- **Promocodes**: Table avec gestion codes promo
- **General Settings**: Interface a onglets (General, Email, Appearance, SMS, etc.) - PERSISTANT via API
- **Placeholder pages**: Pour modules en developpement

### 7. Backend APIs
- Auth: /api/auth/login, /api/auth/register, /api/auth/me
- Rides: /api/rides/request, /api/rides/history
- Admin: /api/admin/dashboard, /api/admin/users, /api/admin/drivers, /api/admin/rides, /api/admin/revenue
- Admin Settings: GET/PUT /api/admin/settings (persistant MongoDB)
- Dispatcher: /api/dispatcher/live, /api/dispatcher/assign-ride
- Simulation: /api/simulation/start, /api/simulation/stop
- Support: /api/support/tickets
- Coupons: /api/coupons/admin/all

## Tests
- Iteration 25: 100% pass (17 backend + 20 frontend)
- Iterations 21-24: 100% pass (auth, rides, driver, simulation)

## Backlog (P1)
- Ajouter services Gojek manquants sur Home
- Persistance panier/commandes entre sessions

## Backlog (P2)
- Notifications push
- Chat/Appel chauffeur
- Integration Stripe complete (cle utilisateur)
