# SB Drive VTC - Product Requirements Document

## Présentation
**SB Drive VTC** = nom de la société
- **SB Drive Client** = App passager séparée (/) — thème vert/bleu
- **SB Drive Chauffeur** = App chauffeur séparée (/chauffeur) — thème amber/dark

## Architecture
- Frontend: React 18 + Tailwind CSS + Shadcn/UI + Phosphor Icons
- Backend: FastAPI + MongoDB (Motor async)
- Auth: JWT httponly cookies (secure, samesite=none)
- Maps: Leaflet / OpenStreetMap, Payments: Stripe
- Language: 100% Français

## Écrans implémentés (alignés XJekPlus)

### Flow d'entrée Client
1. **Splash** — "SB Drive" bleu italic + "CLIENT APP", auto-transition 2.2s
2. **Onboarding** — 4 slides (Connexion sécurisée, Réservez en 1 clic, Suivi temps réel, Notifications), bouton "Passer"
3. **Login** — Mode téléphone (+33) → "Ou choisir d'autres options" → Modal (Google, Email, Face ID/Touch ID) → Mode email (email + mot de passe)

### Home Client (15+ sections)
- Header (Bienvenue, nom, avatar, localisation GPS)
- Barre recherche
- Carousel promo (2 banners défilants)
- **Services Taxi** (8) : VTC Réservation, Pooling, Location, Chauffeur Privé, Enchères, Intercity, Programmer, Plus
- **Livraison de Colis** (bannière violet)
- **Services de Livraison** (4) : Repas, Courses, Médicaments, Plus
- **Consultation Vidéo** (section teal) : Tuteur, Avocat, Astrologue
- **Services à la demande** (4) : Bricolage, Massage, Mécanique, Plus
- **Services Beauté** (4) : Maquillage & Coiffure, Massage & Spa, Soins Hommes, Plus
- **Services Médicaux** (3 cards) : Prendre Rendez-vous (large), Vidéo Consultation, Autres Services
- **Services Animaux** (3) : Toilettage, Promenade, Plus
- **Enchères Services** (6 items 2x3) : Électricien, Plombier, Menuisier, Peintres, Bricoleur, Ménage Maison
- **Entretien Auto** (4) : Lavage Auto & Spa, Service Batterie, Boutique, Livraison Carburant
- **Acheter, Vendre & Louer** (3 banners) : Immobilier, Véhicules, Articles Divers
- **Covoiturage** (banner vert)
- **Suivi Famille & Employés** (2 cards) : Famille, Employés
- **Commerces Proches** (4) : Cafés, Salons, Bars, Plus
- Bottom nav dark : Accueil (pill verte), Réservations, Portefeuille, Profil

### Pages Marketplace
- `/marketplace/real-estate` — Immobilier (Appartement, Maison/Villa, Studio, Terrain) + listings Acheter/Louer
- `/marketplace/cars` — Véhicules (Citadine, Berline, SUV, Luxe) + listings Acheter/Louer
- `/marketplace/items` — Articles Divers (Mobilier, Électronique, Mode, Loisirs) + listings Acheter/Louer

### Page Covoiturage
- `/carpool` — Header illustration, formulaire (départ, destination, date, passagers), bouton Rechercher, Trajets Récents

### Page Commerces Proches
- `/nearby` — Grille 3x3+1 : Cafés, Salons, Bars, Spa, Shopping, Hôpitaux, Salles de Sport, Centres Commerciaux, Bibliothèques, Vie Nocturne

### Profil Client
- Header vert (#00C853) avec avatar, nom, email, téléphone
- Carte Solde Portefeuille + 4 actions rapides
- 8 paramètres : À propos, Réservations, Business, Panier, Notifs, Favoris, Inviter, Urgence
- Bouton Se déconnecter

### Pages fonctionnelles existantes
- Food Delivery (3 restaurants DB), Parcel (Single/Multi), Services (8 catégories)
- All Services (21 services 7x3), All Delivery (9 services 3x3)
- Wallet (Stripe), History, Support, Ride Booking (Leaflet map)
- Admin Panel, Merchant Panel, Dispatcher Panel

### SB Drive Chauffeur
- Welcome dark/amber, Login/Register séparés, Dashboard online/offline

## Routes
/ = Client Welcome, /home = Home, /login = Login, /register = Register
/ride, /food, /parcel, /services, /wallet, /profile, /history, /support
/all-services, /all-delivery, /carpool, /nearby
/marketplace/real-estate, /marketplace/cars, /marketplace/items
/chauffeur = Chauffeur Welcome, /chauffeur/login, /chauffeur/register, /chauffeur/home
/merchant, /admin, /dispatcher

## Backlog
### P0
- Refactoring backend (1838 lignes → modules)
- Types véhicules (Berline, Eco, SUV) + estimation avancée
- Flow chauffeur complet (OTP, navigation, WebSocket)
- Backend endpoints pour marketplace, carpool, nearby
### P1
- Covoiturage fonctionnel, Vidéo Consult, Beauty/Pet fonctionnels
- Grocery/Pharmacy delivery
- Stripe webhooks, Cart persistence
### P2
- Achat/Vente immobilier, Coupons/Parrainage, Push notifs, Chat driver
- Suivi Famille GPS, Nearby businesses réel
