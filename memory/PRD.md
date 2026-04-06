# SB Drive VTC - Product Requirements Document

## Présentation
**SB Drive VTC** = nom de la société (pas une app)
- **SB Drive Client** = App passager séparée (/)
- **SB Drive Chauffeur** = App chauffeur séparée (/chauffeur)

## Architecture
- Frontend: React 18 + Tailwind CSS + Shadcn/UI + Phosphor Icons
- Backend: FastAPI (Python) + MongoDB (Motor async)
- Auth: JWT httponly cookies (secure, samesite=none)
- Maps: Leaflet / OpenStreetMap
- Payments: Stripe
- Language: 100% Français

## Features Implémentées

### SB Drive Client — 3 écrans XJekPlus (DONE)
1. **Splash Screen** — Logo SB Drive + "CLIENT APP", animation fade-in, auto-transition 2.2s
2. **Home XJekPlus** — Header avec avatar/localisation, barre recherche, carousel promo (2 banners), Services Taxi (8 icônes en grille 4x2), sections Livraison Colis/Repas/Services, dark bottom nav avec pill active verte
3. **Profil XJekPlus** — Header vert (#00C853) avec avatar/nom/email/phone, carte wallet avec 4 actions rapides, 8 paramètres, bouton déconnexion, dark bottom nav

### Pages fonctionnelles (DONE)
- Auth (Login/Register), Food Delivery (3 restaurants DB), Parcel (3 types), Services à la demande (8 catégories), Wallet (Stripe), History, Support
- Admin Panel, Merchant Panel, Dispatcher Panel

### SB Drive Chauffeur (DONE)
- Welcome page dark/amber, Login/Register séparés, Dashboard online/offline

### Seeded Data (MongoDB)
- 3 marchands, 20+ produits, users (admin, test, merchant)

## Routes
- / = Client Welcome (splash → login)
- /home = Home Client (protégé)
- /ride, /food, /parcel, /services, /wallet, /profile, /history
- /chauffeur = Chauffeur Welcome
- /chauffeur/login, /chauffeur/register, /chauffeur/home
- /merchant, /admin, /dispatcher

## Backlog

### P0
- Refactoring backend (1838 lignes → modules)
- Types véhicules multiples (Berline, Eco, SUV)
- Flow chauffeur complet (OTP, navigation)
- WebSocket real-time tracking

### P1
- Rendre fonctionnels : Covoiturage, Vidéo Consult, Beauty/Pet
- Grocery/Pharmacy delivery

### P2
- Achat/Vente immobilier & véhicules
- Coupons/Parrainage, Push notifs, Chat driver
