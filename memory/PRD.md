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
3. **Login** — Mode téléphone (+33 🇫🇷) → "Ou choisir d'autres options" → Modal (Google, Email, Face ID/Touch ID) → Mode email (email + mot de passe)

### Home Client
- Header (Bienvenue, nom, avatar, localisation GPS)
- Barre recherche
- Carousel promo (2 banners défilants)
- **Services Taxi** (8) : VTC Réservation, Pooling, Location, Chauffeur Privé, Enchères, Intercity, Programmer, Plus
- **Livraison de Colis** (bannière violet)
- **Services de Livraison** (4) : Repas, Courses, Médicaments, Plus
- **Consultation Vidéo** (section teal) : Tuteur, Avocat, Astrologue
- **Services à la demande** (4) : Bricolage, Massage, Mécanique, Plus
- Bottom nav dark : Accueil (pill verte), Réservations, Portefeuille, Profil

### Profil Client
- Header vert (#00C853) avec avatar, nom, email, téléphone
- Carte Solde Portefeuille + 4 actions rapides
- 8 paramètres : À propos, Réservations, Business, Panier, Notifs, Favoris, Inviter, Urgence
- Bouton Se déconnecter

### Pages fonctionnelles
- Food Delivery (3 restaurants DB), Parcel (3 types), Services (8 catégories)
- Wallet (Stripe), History, Support, Ride Booking (Leaflet map)
- Admin Panel, Merchant Panel, Dispatcher Panel

### SB Drive Chauffeur
- Welcome dark/amber, Login/Register séparés, Dashboard online/offline

## Routes
/ = Client Welcome, /home = Home, /login = Login, /register = Register
/ride, /food, /parcel, /services, /wallet, /profile, /history, /support
/chauffeur = Chauffeur Welcome, /chauffeur/login, /chauffeur/register, /chauffeur/home
/merchant, /admin, /dispatcher

## Backlog
### P0
- Refactoring backend (1838 lignes → modules)
- Types véhicules (Berline, Eco, SUV) + estimation avancée
- Flow chauffeur complet (OTP, navigation, WebSocket)
### P1
- Covoiturage, Vidéo Consult, Beauty/Pet fonctionnels
- Grocery/Pharmacy delivery
### P2
- Achat/Vente immobilier, Coupons/Parrainage, Push notifs, Chat driver
