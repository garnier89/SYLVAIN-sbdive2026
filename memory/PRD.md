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

### 7. Services Gojek V3Cube (DONE - Apr 14, 2026)
6 nouveaux services extraits du code source V3Cube et implementes:

#### 7.1 Consultation Video (/video-consult)
- 8 providers demo (medecins, avocats, tuteurs, astrologue, fitness)
- Filtrage par categorie (doctor, lawyer, tutor, astrologer, fitness)
- Reservation de consultation avec choix duree (15/30/45/60 min)
- Calcul du prix automatique
- API: GET /api/video-consult/providers, POST /api/video-consult/sessions

#### 7.2 Encheres Services (/bidding)
- 8 categories (electricien, plombier, menuisier, peintre, bricoleur, menage, demenagement, jardinage)
- Creation de demandes avec budget et date
- Systeme d'offres des prestataires
- Acceptation d'offres
- API: GET /api/bidding/categories, POST/GET /api/bidding/posts, POST offers, POST accept

#### 7.3 VTC Intercity (/intercity)
- 6 trajets populaires (Paris-Lyon, Paris-Marseille, etc.)
- Recherche de villes
- Reservation avec passagers et bagages
- Calcul du prix par passager
- API: GET /api/intercity/routes, POST /api/intercity/bookings

#### 7.4 Parking (/parking)
- 4 parkings demo a Paris avec photos
- Details: prix/h, places dispo, equipements
- Reservation avec plaque et duree
- API: GET /api/parking/spots, POST /api/parking/reservations

#### 7.5 Cartes Cadeaux (/giftcards)
- 5 templates design (anniversaire, merci, fetes, etc.)
- 8 montants (10-200 EUR)
- Achat avec destinataire et message
- Code unique SB-XXXXXXXX
- Utilisation du code = credit portefeuille
- API: GET /api/giftcards/templates, POST purchase, POST redeem, GET my-cards

#### 7.6 Suivi Famille & Employes (/tracking)
- Onglets Famille / Employes
- Ajout de membres avec telephone et code d'appairage
- Carte placeholder pour suivi temps reel
- Suppression de membres
- API: GET/POST/DELETE /api/tracking/members

### 8. Backend APIs
- Auth: /api/auth/login, /api/auth/register, /api/auth/me
- Rides: /api/rides/request, /api/rides/history
- Admin: /api/admin/dashboard, /api/admin/users, /api/admin/drivers, /api/admin/rides, /api/admin/revenue
- Admin Settings: GET/PUT /api/admin/settings (persistant MongoDB)
- Dispatcher: /api/dispatcher/live, /api/dispatcher/assign-ride
- Simulation: /api/simulation/start, /api/simulation/stop
- Video Consult: /api/video-consult/providers, /api/video-consult/sessions
- Bidding: /api/bidding/categories, /api/bidding/posts, /api/bidding/posts/{id}/offers
- Intercity: /api/intercity/routes, /api/intercity/bookings
- Parking: /api/parking/spots, /api/parking/reservations
- Gift Cards: /api/giftcards/templates, /api/giftcards/purchase, /api/giftcards/redeem
- Tracking: /api/tracking/members

## Tests
- Iteration 25: 100% pass (17 backend + 20 frontend) - Admin UI
- Iteration 26: 100% pass (28 backend + 7 frontend) - 6 Gojek Services

## Backlog (P1)
- Persistance panier/commandes entre sessions

## Backlog (P2)
- Notifications push
- Chat/Appel chauffeur (backend temps reel)
- Integration Stripe complete (cle utilisateur)
