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
- Bouton "Parler en direct" (Live Chat)

### 3. Application Chauffeur (DONE - Apr 7, 2026)
- Login chauffeur
- Ecran d'accueil avec courses en attente
- Acceptation/refus de course
- Navigation vers pickup/dropoff
- Historique et gains
- Inscription avec upload documents
- **Bouton "Parler en direct"** : Bouton flottant vert sur Home + entree dans Profil/Actions

### 4. Mode Simulation (DONE)
- Chauffeur virtuel auto-accepte les courses
- Deplacement simule sur carte via WebSocket
- Start/Stop depuis l'admin

### 5. Page de Connexion Admin (DONE - Apr 7, 2026)
- Page dediee /admin-login avec logo SB
- Onglets: All Admin, Dispatcher Admin, Billing Admin, Server Admin
- Formulaire email/password + bouton SIGN IN
- Navigation: Main website, Client Login, Chauffeur Login, Flotte - Entreprise Login

### 6. Panel Admin XJekPlus (DONE - Apr 7, 2026)
- Layout: Theme clair avec sidebar complete
- Dashboard, Users, Drivers, Trips/Jobs, Revenue, Reviews
- God's View, Heat View, Promocodes
- General Settings avec onglets - persistant via API
- Placeholder pages pour modules en developpement

### 7. Backend APIs
- Auth: /api/auth/login, /api/auth/register, /api/auth/me
- Rides: /api/rides/request, /api/rides/history
- Admin: /api/admin/dashboard, /api/admin/users, /api/admin/drivers, /api/admin/rides, /api/admin/revenue
- Admin Settings: GET/PUT /api/admin/settings (persistant MongoDB)
- Dispatcher: /api/dispatcher/live, /api/dispatcher/assign-ride
- Simulation: /api/simulation/start, /api/simulation/stop

## Tests
- Iteration 25: 100% pass (17 backend + 20 frontend)

## Backlog (P1)
- Ajouter services Gojek manquants sur Home
- Persistance panier/commandes entre sessions

## Backlog (P2)
- Notifications push
- Chat/Appel chauffeur (backend temps reel)
- Integration Stripe complete (cle utilisateur)
