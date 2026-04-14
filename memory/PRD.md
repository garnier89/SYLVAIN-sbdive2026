# SB Drive VTC - PRD (Product Requirements Document)

## Vision
Application super-app multi-services type Gojek/V3Cube pour le marche VTC francophone.

## Architecture
- **Frontend**: React + Tailwind CSS + Leaflet Maps + Phosphor Icons
- **Backend**: FastAPI + MongoDB
- **Auth**: JWT (cookie-based) + Google OAuth via Emergent
- **Payments**: Stripe Checkout
- **Real-time**: WebSockets (ride tracking, simulation)

## Modules implementes

### 1. Authentification & Onboarding (DONE)
- Login par telephone (style V3Cube dark theme)
- Login email/password, Google OAuth via Emergent
- Inscription avec verification OTP
- Roles: user, driver, admin, merchant

### 2. Application Utilisateur - 22 Services Actifs (DONE - Apr 14, 2026)
**Taxi/VTC:** Reservation, Pooling, Location, Chauffeur Prive, Intercity, Encheres, Programmer Course, 10 services supplementaires (Aeroport, Animaux, Moto, Tuktuk, Electrique, etc.)
**Livraison:** Repas, Courses, Medicaments, Fleurs, Papeterie, Vin, Eau, Supermarche, Construction
**Services a la demande:** 8 categories (Plomberie, Electricite, Menage, Peinture, Coiffure, Bricolage, Garde d'enfants, Securite) + 21 services en grille
**Beaute:** 12 services (Coiffure, Barbe, Maquillage, Soins, etc.)
**Animaux:** 12 services (Toilettage, Promenade, Dressage, Pension, etc.)
**Entretien Auto:** 8 services (Lavage, Batterie, Carburant, Vidange, etc.)
**Depannage:** 9 services (Remorquage, Pneu, Ouverture porte, Demarrage, etc.)
**Medical:** Rendez-vous, Video Consultation, Pharmacie, Ambulance
**Consultation Video:** 8 providers (medecins, avocats, tuteurs, astrologue, fitness) avec reservation
**Encheres Services:** 8 categories de prestataires avec systeme de demandes/offres
**VTC Intercity:** 6 trajets populaires avec reservation multi-passagers
**Parking:** 4 parkings avec photos, prix, reservation avec duree
**Cartes Cadeaux:** 5 templates, 8 montants, achat/utilisation/mes cartes
**Suivi Temps Reel:** Famille et Employes, ajout/suppression de membres
**Commerces Proches:** 10 categories avec detail (Appeler/Itineraire)
**Covoiturage:** Recherche, publication, reservation de places
**Marketplace:** Immobilier, Vehicules, Articles Divers avec categories

### 3. Application Chauffeur (DONE)
- Login, ecran d'accueil, courses en attente
- Acceptation/refus, navigation, historique et gains
- Bouton "Parler en direct" flottant + profil

### 4. Panel Admin XJekPlus (DONE)
- Theme clair, sidebar complete, dashboard, users, drivers
- God's View, Heat View, Promocodes, Settings persistants

### 5. Mode Simulation (DONE)
- Chauffeur virtuel, deplacement simule via WebSocket

## Code Quality (Applied Apr 14, 2026)
- Hardcoded secrets -> env variables
- Missing React Hook deps -> useCallback
- Empty catch blocks -> console.error logging
- Array index keys -> stable keys
- Dynamic imports -> static imports

## Tests
- Iteration 25: 100% pass - Admin UI
- Iteration 26: 100% pass (35/35) - 6 Gojek Services backend+frontend
- Iteration 27: 100% pass (23/23) - All 22 service pages frontend

## Backlog (P1)
- Persistance panier/commandes entre sessions

## Backlog (P2)
- Notifications push
- Chat/Appel chauffeur backend temps reel
- Integration Stripe complete
