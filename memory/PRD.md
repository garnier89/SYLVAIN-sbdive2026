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

## Iter59 - Mise en avant sponsorisée (monétisation B2B) (Feb 22, 2026) - DONE
- **Feature monétisation** : les prestataires (salons, garages, dépanneurs, etc.) peuvent être mis en avant pour N jours moyennant paiement, et apparaissent en tête de liste avec un badge "★ Sponsorisé" (gradient ambre→orange).
- **Backend** :
  - `GET /api/phase2/catalogs/{collection}` : tri auto featured-first (`is_featured DESC, featured_priority DESC, created_at DESC`) + auto-expiry au passage de `featured_until`.
  - `POST /api/phase2/admin/catalogs/{col}/{id}/feature` body `{duration_days, priority}` (admin only).
  - `DELETE /api/phase2/admin/catalogs/{col}/{id}/feature` (admin only).
  - `GET /api/phase2/admin/catalogs/{col}/featured` (admin only, applique l'auto-expiry).
- **Frontend** :
  - Badge "Sponsorisé" ⭐ sur `ServiceCard`, `TowingServicesPage`, `MarketplacePage`, `CarPoolPage` (border amber-300 + ring + badge gradient).
  - Nouvelle page admin `/admin/featured-listings` avec 8 tabs collections, recherche, dialog modal (au lieu de window.prompt) pour durée + priorité avec validation min/max.
  - Item sidebar "Mise en avant sponsorisée" dans PROMOTIONS & MARKETING.
- **3 items pré-sponsorisés** au seed : L'Atelier Coiffure (beauty), Garage Mécanique Bastille (car_services), Dépann'Express 24/7 (towing).
- **Test iter59 : 100% backend (10/10 pytest) + 100% frontend** (3 user routes + admin page + roundtrip feature/unfeature).

## Iter58 - Câblage 9 catégories V3Cube + endpoint public catalogs (Feb 22, 2026) - DONE
- **Backend** : nouveau endpoint public `GET /api/phase2/catalogs/{collection}` (whitelist 8 catalogues), ALLOWED_CRUD étendu, 8 collections seed automatique au startup:
  - `beauty_salons` (5 items), `pet_providers` (5), `car_services` (6), `towing_partners` (4), `nearby_businesses` (6), `ondemand_services` (6), `carpool_trips` (5), `marketplace_listings` (7).
- **Frontend** : composant générique réutilisable `ServiceListLayout` + 9 pages réécrites pour fetch depuis le nouvel endpoint :
  - BeautyServicesPage (Coiffure/Spa/Maquillage/Soins H/Manucure)
  - PetServicesPage (Toilettage/Promenade/Pension/Véto/Boutique)
  - CarCarePage (Lavage/Mécanique/Pneus/Batterie/Carburant/Boutique)
  - TowingServicesPage (custom UI tel: link, badges 24/7, response time)
  - NearbyBusinessPage (Café/Bar/Salon/Boulangerie/Pharmacie/Restaurant)
  - ServicesPage + AllServicesPage (Bricolage/Bien-être/Auto/Ménage/Sport)
  - CarPoolPage (custom UI dégradé vert, cards trajets)
  - MarketplacePage (custom UI chips + grid 2 cols, support /marketplace/:category)
- **Test iter58 : 100% backend (14/14 pytest) + 100% frontend (9/9 routes)** end-to-end verified.

## Iter57 - Fix Enchères + Redesign /ride V3Cube (Feb 22, 2026) - DONE
- **Bug TaxiBidding 'find-driver-btn' corrigé** : `disabled={submitting || fare<=0}` → `disabled={submitting}`. handleSubmit fallback : `estimate.estimated_fare || liveStats.avg_accepted_fare || 10 EUR`.
- **Redesign /ride V3Cube complet** :
  - Step 1 : header `bg-blue-600` "Planifier votre course", route line cercle vert (pickup) + carré gris (destination)
  - Step 2 : bouton flottant 'Location Taxi' top-right (data-testid='rent-a-taxi-btn') → /ride?type=rental
  - Polyline bleue (#3b82f6), ETA bubble texte bleu, CTA "Demander maintenant" bg-blue-600
  - VEHICLE_META : sb→Standard, confort→Confort, luxe→Luxe, berline→Berline, van→Van, moto→Moto-taxi avec descriptions FR adaptées
  - Carte véhicule sélectionnée : `bg-blue-50` + `border-l-4 border-l-blue-500`, prix `text-blue-600`
- **Test iter57 : 100% backend (5/5 pytest) + 100% frontend** end-to-end verified.

## Iter56 - Redesign TaxiBidding V3Cube + nettoyage UserHome (Feb 22, 2026) - DONE
- **TaxiBiddingPage redesign complet** conforme au mockup V3Cube iDrive "Offer Your Fare" : map en arrière-plan (Google Static Maps avec markers A/B et polyline bleue) + bottom sheet blanc avec titre "Offrez votre tarif", banner "Prix moyen: X EUR", fare picker "−  [value]  +", bouton bleu "Trouver un chauffeur", lien Annuler.
- **Indicateur temps réel** sur TaxiBiddingPage : nouveau endpoint `GET /api/phase2/taxi-bidding/live-stats?lat=&lng=&radius_km=15` retourne `online_drivers_nearby`, `avg_accepted_fare` (10 dernières courses complétées), `acceptance_rate_percent`. Affiché dans un strip avec pulse vert "3 chauffeurs en ligne · 95% acceptation".
- **Panel "Mode Simulation" retiré** de UserHome (+ cleanup complet : state, API import, icons Play/Stop).
- **Widget "Top Chauffeurs" déplacé** : retiré de UserHome, ajouté en bas de FavoriteDriversPage (/favorite-drivers) sous la section "Aucun chauffeur favori".
- **Test iter56 : 100% backend (7/7 pytest) + 100% frontend** (tous les data-testid + flows vérifiés).

## Iter54bis - Corrections V3Cube App Client (Feb 22, 2026) - DONE
- **Séparation Taxi Bidding vs Bid for Services** : deux services maintenant clairement distincts
  - `/taxi-bidding` → NOUVELLE page TaxiBiddingPage (iDrive-style "Offer Your Fare" pour une course taxi)
  - `/services-bidding` (alias `/bidding`) → marketplace enchères prestataires (électricien/plombier/menuisier/peintres/bricoleur/ménage)
- **Service Runner/Coursier ajouté** : page `/runner` avec 2 modes (Envoi simple 1→1, Tournée multi-arrêts 1→N jusqu'à 5), 4 types de colis, tarif auto-calculé par haversine. Endpoint backend dédié `POST /api/phase2/runner/book` + `GET /api/phase2/runner/my`.
- **Flow hybride Taxi Booking classique** : dans RideBookingPage, l'input inline de négociation a été retiré. Ajout d'un bouton "Proposer un prix différent" (pink) qui redirige vers `/taxi-bidding?pickup=...&dropoff=...` (query params prefill). Le bouton principal "Demander maintenant" reste Uber-style (tarif fixe).
- **UserHome corrections** : carte "Enchères VTC" → `/taxi-bidding`, cartes Bid for Services → `/services-bidding?cat=bcat_*`, nouvelle carte "Coursier Express" dans deliveryServices (remplace "Livraison Médicaments").
- **GooglePlacesInput** : props correctes maintenant utilisées partout (`onSelect`, `testId`, `value`) — plus de `onPlaceSelected`/`data-testid` fantômes.
- **Test iter55 : 100% backend (5/5 pytest) + 100% frontend** (spec items verified end-to-end).

## Phase 1 - Site Web & Admin (Apr 18, 2026) - DONE

## Iter53 - Activation Dashboard Admin & Localisation FR (Feb 2026) - DONE
- **Admin pages re-câblées au CRUD réel** (fini les mocks hardcodés) : AdminBanners, AdminPayout, AdminSettlements, AdminDisputes, AdminWalletRequests, AdminDocuments → toutes utilisent `/api/admin/crud/{collection}` avec persistance MongoDB, actions (Approuver/Refuser/Verser/Investiguer/Résoudre) persistent.
- **AdminPromocodes** : modal de création complet wire à `couponAPI.adminCreate`.
- **Localisation française complète** du sidebar admin : titres de sections (ACCUEIL, MEMBRES, SERVICES, RÉSERVATIONS & RAPPORTS, PORTEFEUILLE & PAIEMENTS, RÉCOMPENSES & FIDÉLITÉ, LOCALISATION, PROMOTIONS & MARKETING, CMS, SUPPORT, PARAMÈTRES & UTILITAIRES, SYSTÈME) + tous les items et sous-items (Utilisateurs, Chauffeurs, Gérer véhicules, Vérification documents, etc.).
- **Rebranding** : "XJEKPLUS" → "SB Drive VTC" dans le sidebar.
- **AdminServiceConfig** : placeholder typé "Configuration bientôt disponible" pour les clés inconnues (plus de fallback silencieux vers formulaire Genie).
- **Endpoints backend Phase 2 alias** (dans `phase2.py`) : `/api/phase2/loyalty/me` (points + tier bronze/argent/or/platine), `/api/phase2/referral/me`, `/api/phase2/subscriptions/plans`, `/api/phase2/safety/emergency-contacts`, `/api/phase2/favorites/drivers`.
- **Admin settings endpoint** : `GET/PUT /api/admin/settings` pour sauvegarder le bundle "general" dans `service_configs`.
- **ALLOWED_CRUD étendu** dans `admin.py` : ajout de `banners`, `wallet_requests`, `news`, `newsletter_subscribers`, `promocodes`.
- **Seed démo au startup** : 3 bannières, 4 payouts, 3 settlements, 3 disputes, 3 wallet-requests, 5 contact-requests, 1 SOS, 3 documents + 3 chauffeurs approuvés (jean.dupont@demo.sb / amadou.diallo / sophie.martin — password Driver123!).
- **Test iter53 : 100% backend (30/30) + ~95% frontend** — P0/P1 blockers iter52 RÉSOLUS.

## Backlog restant (P2/P3)
- Titres H1 de certaines pages admin encore en anglais → à franciser au cas par cas
- Implémentation UI frontend des features Phase 2 (Heat View carte réelle, Taxi Pool, Waybill, Tip, Airport geofence)
- Phase 3 : VOIP/Twilio, Dynamic pricing, WhatsApp booking, Hire a Driver
- Stripe intégration complète (paiement réel)
- Push notifications (Firebase/OneSignal)
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



## Iteration 60 (Feb 12, 2026) — V3Cube Home Parity Additions + RideBookingPage Refactor (DONE)
### Services manquants ajoutés sur la page d'accueil client (`UserHome.js`)
- **Section "Livraison Genie & Runner"** (2 grandes cartes côte-à-côte) :
  - *Delivery Genie* → `/runner?mode=genie` (un Genie achète vos articles à votre place)
  - *Delivery Runner* → `/runner` (coursier express classique)
- **Services Beauté** étendus de 4 → 8 items : Soins Cheveux, Skin & Facial, Vernis Ongles, Épilation, Maquillage & Coiffure, Massage & Spa, Soins Hommes, Plus.
- **Entretien Auto** étendu de 4 → 8 items : Lavage Auto, Service Batterie, Boutique, Carburant, Lavage Vélos, Recharge EV, Serrurerie Auto, Plus.
- **Dépannage & Remorquage** : bouton unique remplacé par une grille de 6 items (Remorquage Urgence, Plateau, Récupération Véhicule, Pneu Crevé, Serrure Voiture, Plus).
- Nouveaux imports d'icônes Phosphor : `Bicycle, Plug, Key, HairDryer, MaskHappy, Bag`.

### RunnerPage — détection ?mode=genie
- `useSearchParams` lit `mode=genie` → bascule le titre vers "Delivery Genie" + icône `Bag` + sous-titre dédié.
- `service_type` envoyé au backend = `'genie'` ou `'runner'` selon le mode.

### Refactor RideBookingPage.js (835 → ~295 lignes)
- Découpé en 4 sous-composants sous `/app/frontend/src/pages/user/ride/` :
  - `RidePlanStep.jsx` (Step 1 : pickup/dropoff, favoris, lieux récents, modal "pour qui")
  - `RideMapStep.jsx` (Step 2 : Google Map + bottom sheet véhicules + paiement + CTA)
  - `RideNegotiationStep.jsx` (Step 2.5 : contre-offres chauffeurs)
  - `RideSearchingStep.jsx` (Step 3 : fallback recherche chauffeur)
- État + side-effects (geolocation, polling rideAPI, estimate) restent dans le parent.

### Backend — `/api/phase2/runner/book`
- Respecte désormais `body.service_type` ∈ {`runner`, `genie`} au lieu de hardcoder `'runner'`.

### Fix annexe
- `AdminServiceConfig.js` : déplacement des hooks `useState`/`useEffect` AVANT le early-return `!config` (violation des règles React Hooks qui bloquait la compilation).
- `RidePlanStep.jsx` : data-testid `add-stopover-btn` ajouté sur le bouton "+".

### Tests (iteration_60.json)
- Backend smoke 13/13 ✅
- Frontend 100% (nouvelles sections home + flow ride refactorisé Step1↔Step2 + modal Book For + lieux récents)
- 2 issues non-bloquantes connues : (1) clé Google Maps expirée en preview (overlay "Oops" mais UI sous-jacente OK), (2) warning "Google Maps API loaded multiple times" (dédupe possible via loader unique).

## Backlog restant (P2/P3 — mis à jour)
- Centraliser `<LoadScript>` / `useJsApiLoader` (un seul loader Maps au niveau App)
- Géocodage réel pour les Lieux Récents (actuellement coords aléatoires autour de Paris)
- Phase 2 UI : Heat View carte densité, Taxi Pool, Waybill, Tip, Airport geofence
- Phase 3 : VOIP/Video (Twilio), Photo zone pickup, Lost & Found
- Merchant self-service Stripe checkout pour Sponsored Listings
- Stripe paiements réels, push notifications, dynamic pricing, WhatsApp booking, Hire a Driver
- Localiser les H1 restants du dashboard admin en français
- Extraire les arrays de catégories de `UserHome.js` (encore ~590 lignes) vers `/src/data/homeSections.js`
