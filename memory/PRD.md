# SB Drive VTC - PRD

## Vision
Application super-app multi-services type Gojek/V3Cube pour le marche VTC francophone.

## Architecture
- **Frontend**: React + Tailwind CSS + Leaflet Maps + Phosphor Icons
- **Backend**: FastAPI + MongoDB
- **Auth**: JWT (cookie-based) + Google OAuth via Emergent
- **Payments**: Stripe Checkout
- **Real-time**: WebSockets (ride tracking, simulation)


## NEW - Feb 2026 - Rewards & Driver Points System (DONE)
### 1. Admin Rewards Config (`/admin/rewards`)
- **Regard Vehicules** (Tab 1) : Voiture / Moto / Velo avec activation, dates de debut/fin, horaires, zone (Martinique, Guadeloupe, Paris, etc.), bonus par course (EUR), courses minimum.
- **Garantie de Chiffre d'Affaires** (Tab 2) : L'app complete la difference si le chauffeur n'atteint pas le CA minimum (ex: 59 EUR entre 12h-20h). Conditions : taux d'acceptation >=80%, annulation <=10%.
- **Points Chauffeurs** (Tab 3) : Regles (points initiaux, +par course acceptee, +par course terminee, -par refus, -par annulation) + 4 palettes de priorite (Debutant / Standard / Confirme / Expert) avec seuils et acces prioritaire.
- Backend : `GET/PUT /api/admin/rewards/config` (persistance dans `service_configs` collection).

### 2. Chauffeurs Prioritaires (`/admin/priority-drivers`)
- Liste de tous les chauffeurs avec points, palette, taux d'acceptation, note, statut online.
- Recherche (nom/email/tel) + filtres (Tous / Avec priorite / Sans priorite).
- Toggle manuel "Ajouter/Retirer priorite" avec note libre (VIP, partenaire...).
- Priorite auto selon palette points, priorite manuelle overrides.
- Backend : `GET /api/admin/priority-drivers`, `PUT/DELETE /api/admin/priority-drivers/{id}`.

### 3. Mon Activite (chauffeur - `/chauffeur/profile`)
- Card "Mon Activite" avec : palette (nom+couleur), progression points, badge PRIORITE VIP si manual_priority.
- Stats : taux d'acceptation (%), taux d'annulation (%), score d'activite (composite 50/30/20), courses aujourd'hui, total courses, refus.
- Footer regles : gains/pertes par action.
- Backend : `GET /api/drivers/my-activity`, `POST /api/drivers/refuse-ride/{id}`.

### 4. Ride-Hook Points Integration
- `POST /api/rides/{id}/accept` : +2 pts, +1 offered, +1 accepted, recompute rates.
- `POST /api/rides/{id}/status` (completed) : +3 pts, +1 total_trips, driver earnings += fare*(1-commission).
- `POST /api/rides/{id}/status` (cancelled by driver) : -10 pts, +1 cancelled_count, recompute rates.
- `POST /api/drivers/refuse-ride/{id}` : -5 pts, +1 offered, +1 refused, recompute rates.
- Points capped 0-100, defaults configurable by admin.

## Modules implementes

### 1. Authentification & Onboarding (DONE)
- Login par telephone (style V3Cube dark theme)
- Login email/password, Google OAuth via Emergent
- Roles: user, driver, admin, merchant

### 2. Systeme Multi-Langue & Multi-Devise (DONE - Apr 18, 2026)
- **25 langues**: Francais, English, Arabe, Espanol, Portugues, Deutsch, Italiano, Nederlands, Turkce, Russkiy, Zhongwen, Nihongo, Hangugeo, Hindi, Kiswahili, Hausa, Wolof, Kreyol, Malagasy, Lingala, Thai, Vietnamese, Bahasa Melayu, Bahasa Indonesia, Filipino
- **30 devises**: EUR, USD, GBP, XOF (CFA), XAF (FCFA), MAD, CAD, CHF, TND, DZD, GNF, HTG, MGA, CDF, NGN, KES, ZAR, AED, SAR, INR, BRL, MXN, JPY, CNY, RUB, TRY, THB, PHP, IDR, MYR
- Selecteur en haut a droite de la page d'accueil (FR | EUR)
- Modal avec onglets Langues/Devises, recherche, drapeaux
- Persistance dans localStorage

### 3. Systeme Taxi V3Cube Complet (DONE - Apr 18, 2026)
- **10 types de vehicules**: SB, Confort, Luxe, Moto, Pool, SUV, Electrique, Van, Accessible, Aeroport
- Banniere promo "-20% sur votre premiere course" (Code SB20)
- Detail tarifaire complet (base, distance/km, temps/min, prise en charge, total)
- Mode "Maintenant" / "Programmer" avec date/time picker
- Selection de paiement
- Lieux Favoris (Domicile, Travail)
- Lieux Recents
- "Ou allez-vous ?" style V3Cube

### 4. 22 Services Actifs (DONE)
Taxi, Livraison, Services, Beaute, Animaux, Auto, Depannage, Medical, Video Consult, Encheres, Intercity, Parking, Cartes Cadeaux, Suivi, Commerces Proches, Covoiturage, Marketplace

### 5. Application Chauffeur (DONE)
Login, courses en attente, acceptation, navigation, historique, gains, "Parler en direct"

### 6. Panel Admin XJekPlus (DONE)
Theme clair, sidebar, dashboard, users, drivers, God's View, Heat View, Promocodes, Settings

### 7. Mode Simulation (DONE)
Chauffeur virtuel via WebSocket

## Tests
- Iteration 25: 100% pass - Admin UI
- Iteration 26: 100% pass (35/35) - 6 Gojek Services
- Iteration 27: 100% pass (23/23) - 22 Service pages
- Iteration 28: 100% pass (23/23) - Locale + Taxi V3Cube
- Iteration 29: 100% pass (38/38) - Post-fix validation (syntax error + DB optimizations)

## Optimisations DB (Apr 18, 2026)
- Rating: aggregation pipeline MongoDB ($match + $group) au lieu de .to_list(1000)
- Ride history chauffeur: limite a 20 resultats au lieu de 100

## Code Quality Pass (Apr 18, 2026)
- Iteration 30: 100% pass (30/30) - Code quality fixes validated
- Securite: secrets module pour generation de codes referral (auth.py, referral.py)
- Securite: suppression localStorage token, httpOnly cookies uniquement
- Securite: variable status initialisee dans payments.py
- Qualite: catch blocks avec console.error (8 fichiers)
- Qualite: cles React stables au lieu d'index de tableau (6 fichiers)
- Qualite: hook dependencies corrigees (useCallback + useEffect deps)
- Nettoyage: suppression 17 anciens fichiers de test, creation conftest.py

## Backlog (P1)
- DONE: Persistance panier/commandes entre sessions (Apr 18, 2026)
  - API /api/cart (GET, PUT, DELETE) avec MongoDB collection 'carts'
  - Dual-write: localStorage + backend pour acces rapide et persistance
  - Iteration 31: 100% pass (20/20)

## Phase 2 - Enrichissement Apps (Apr 18, 2026) - DONE
### SB Kiosk (Marchand)
- MerchantPromotions: creation/gestion promos, activation/desactivation
- MerchantAnalytics: KPI cards, graphique ventes, dernieres commandes
- MerchantSettings: parametres boutique, contact, livraison, preferences
- MerchantChat: chat support marchand avec auto-reply

### SB Drive Chauffeur
- DriverWalletPage: solde, retrait, historique transactions
- DriverDocumentsPage: 6 types de documents, upload, statuts (approuve/en attente/refuse)
- DriverNotificationsPage: notifications courses, gains, systeme, promos
- DriverHome redesign V3Cube: header vert En ligne/Hors ligne, 4 stat cards (voyages, evaluation, emplois a venir, en attente), carte, bouton Recompenses
- DriverProfilePage redesign V3Cube: header vert avec avatar/email/phone, wallet card, sections reglages generaux (12 items), parametre du compte (6 items), paiement (5 items), carte cadeau (2 items)
- Bottom nav V3Cube: Accueil, Les reservations, Portefeuille, Profil

### Admin Dashboard (placeholders remplaces)
- AdminGeoFence: zones de service, aeroport, restreinte, surge
- AdminGiftCards: templates cartes cadeaux depuis API
- AdminReferralSettings: configuration MLM parrainage avec stats
- AdminTemplates: templates email (5) et SMS (4) avec onglets
- AdminNewsletter: envoi newsletter, liste abonnes, stats
- Iteration 33: 100% pass (24/24)

## Google Maps + Admin Complet (Apr 18, 2026) - DONE
- Google Maps API integre (cle dans frontend/.env)
- DriverHome migre de Leaflet vers Google Maps
- TOUS les 26 admin placeholders remplaces par des pages fonctionnelles:
  - AdminMonitoring: KPI temps reel + courses en direct (auto-refresh 15s)
  - AdminManageAdmins: gestion sous-admins depuis API
  - AdminCrudPages: groups, vehicles, company, hotels, organization, requests
  - AdminServiceConfig: 18 services (genie, runner, ondemand, video, bids, marketplace, medical, rideshare, nearby, tracking, location-fare, country, state, cancel-reasons, pages, app-home, intro, labels)
- Iteration 34: 100% pass (27/27)

## Google Places Autocomplete + Admin Backend (Apr 18, 2026) - DONE
- GooglePlacesInput composant reutilisable (restrictions: France, Martinique, Guadeloupe, Guyane, Reunion)
- Integre dans LandingPage (formulaire de reservation) et RideBookingPage (depart/arrivee)
- Backend /api/admin/service-config/{key} GET/PUT: configs services persistees en MongoDB (collection service_configs)
- Backend /api/admin/crud/{collection} CRUD: groups, vehicles, companies, hotels, organizations, pending_requests
- AdminServiceConfig charge/sauvegarde depuis le backend
- Iteration 35: 100% pass

## Estimation Temps Reel Google Maps + Admin CRUD Backend (Apr 18, 2026) - DONE
- /api/rides/estimate utilise Google Maps Directions API (distance route reelle, duree, polyline)
- Fallback automatique vers haversine si Google Maps echoue
- Paris-CDG: 32.64km route (vs 18km vol d'oiseau), 37min, 38.54EUR
- AdminCrudPages connectes au backend /api/admin/crud/{collection} (MongoDB)
- CRUD complet: groups, vehicles, companies, hotels, organizations, pending_requests
- Iteration 36: 100% pass (13+/13+ tests)

## Trace Itineraire Google Maps sur Carte (Apr 18, 2026) - DONE
- RideBookingPage migre de Leaflet vers Google Maps (@react-google-maps/api)
- Polyline du trajet reel affichee en orange (#FF4500) sur la carte
- Marqueur vert (depart) + rouge (arrivee) + polyline route
- decodePolyline() decode la polyline encodee Google
- Indicateur "Itineraire reel Google Maps" affiche sous la distance
- Iteration 37: 100% pass (8/8 backend + frontend OK)

## Dashboard V3Cube + Recompenses (Apr 18, 2026) - DONE
- Sidebar restructuree: HOME, MEMBERS, SERVICES, BOOKINGS & REPORTS, WALLET & PAYMENTS, REWARDS & LOYALTY, LOCATION, PROMOTIONS, CMS, SYSTEM
- AdminRewards: programme de fidelite complet (points/course, points/EUR, points/parrainage, points/avis, 4 niveaux Bronze/Argent/Or/Platine, bonus chauffeurs)
- AdminDocuments: verification documents chauffeurs (approuver/refuser)
- AdminDisputes: gestion litiges (open/investigating/resolved)
- AdminWalletRequests: demandes retrait/remboursement wallet
- AdminSettlements: versements chauffeurs (brut/commission/net)
- Iteration 38: 100% pass (5/5 backend + 21/21 frontend)

## Dashboard Analytics Temps Reel (Apr 18, 2026) - DONE
- Dashboard reconstruit avec recharts (AreaChart, BarChart, PieChart, LineChart)
- 5 KPI cards avec donnees reelles depuis /api/admin/stats
- Graphique Revenus & Courses (area chart interactif)
- Repartition services (donut chart: VTC 65%, Livraison 20%, Colis 8%, Services 7%)
- Courses par heure (bar chart 24h)
- Revenus mensuels (bar chart)
- Top 5 Chauffeurs (ranking avec note, courses, gains)
- God's View Google Maps avec marqueurs chauffeurs en ligne
- Selecteur de periode (Aujourd'hui/Semaine/Mois)
- Iteration 39: 100% pass (6/6 backend + 21/21 frontend)

## Dashboard V3Cube avec Donnees Reelles MongoDB (Apr 18, 2026) - DONE
- /api/admin/analytics: aggregation MongoDB reelle (ride_status, earnings, drivers actifs, recent rides)
- Dashboard reconstruit exactement comme V3Cube: God's View + Driver Status Pills + Donut rides + Recent Rides + Admin Earnings chart + Scheduled Bookings + Server Statistics + Notification Alerts + Contact Us Form
- Donnees reelles: 19 rides totales (1 in_progress, 6 completed, 12 cancelled), 123.18 EUR earnings, 3/13 chauffeurs actifs
- Iteration 40: 100% pass (12/12 backend + frontend complet)

## Rewards V3Cube + Horloge Dashboard (Apr 18, 2026) - DONE
- AdminRewards reconstruit exactement V3Cube: Reports tab (table Level/Trip/Acceptance Rate/Cancellation Rate/Ratings/Date) + Settings tab (accordeons Silver/Gold/Platinum avec tous les champs V3Cube: Level, Status, Min Trips, Ratings, Cancellation Rate %, Acceptance Rate %, Image, Reward Amount EUR)
- Dashboard: horloge en direct (hh:mm:ss), date complete en francais, fuseau horaire + UTC offset
- Sidebar: Manage Rewards > Reports + Settings sous MEMBERS
- Iteration 41: 100% pass (7/7 backend + frontend complet)

## Phase 1 - Site Web & Admin (Apr 18, 2026) - DONE
- Landing page sbdrivevtc.com (reproduction fidele du vrai site: hero avec booking form, comment ca marche, pool & location, entreprises, 4 services VTC, securite OTP/SOS, telephone, inscription 5 types, Play Store/App Store, logo officiel SB Drive)
- Admin Vehicle Types CRUD (/admin/vehicle-types) avec API backend
- Admin Orders/Parcels (/admin/parcels, /admin/store-delivery) avec filtre et detail
- Admin Stores (/admin/stores) avec recherche et activation
- Admin Manual Booking (/admin/manual-booking, /admin/later-bookings, /admin/create-order)
- Admin Banners (/admin/banners) gestion des publicites
- Admin Payout (/admin/payout) rapport des versements
- Backend /api/admin/* (CRUD vehicle-types, merchant status, stats)
- Route /app pour l'onboarding client
- Iteration 32: 100% pass (27/27)
