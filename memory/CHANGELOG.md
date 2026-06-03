# CHANGELOG
# CHANGELOG

## 2026-06-03 — Carte interactive + Chauffeur Privé + tarification multi-arrêts — Iteration 90

### Added
- **« Définir l'emplacement sur la carte »** : nouveau composant `components/MapLocationPicker.js` — carte Google plein écran avec pin central fixe, reverse-geocoding en direct, bascule Départ/Destination, bouton « Confirmer ce lieu ». Accessible depuis les raccourcis du hub (`set-on-map-btn`). Réutilise le script Maps déjà chargé (pas de conflit).
- **Mode « Chauffeur Privé » (buddy_driver) intégré au hub** : nouvelle entrée dans MODES (catégorie Temps & Distance), panneau de durée 1h/2h/4h/8h, prix horaire affiché, pas de destination requise. Tuile accueil + CMS re-routés vers `/taxi?mode=buddy_driver`.

### Changed (Tarification multi-arrêts)
- `POST /api/rides/estimate` et `POST /api/rides` calculent désormais la distance/durée **en passant par chaque arrêt** (`pickup → stops[] → dropoff`) : via Google Directions `waypoints` si dispo, sinon somme des segments haversine. Le prix live reflète les arrêts (ex. 7.51 km/12.81 € → 26.59 km/34.59 € avec détour).
- `fetchEstimate` du hub transmet `stops`.

### Tests
- `tests/test_iter90_stops_buddy.py` — 3/3 ✅ (multistop > direct, persistance stops + prix waypoints, buddy_driver). Régression iters 85-88 : 16/16 ✅.
- UI vérifiée par screenshots : carte interactive (pin + adresse géocodée), panneau buddy (80€/4h), ajout d'arrêt.

## 2026-06-03 — Refonte hub : vue Grille vs vue « Planifiez votre trajet » + arrêts multiples — Iteration 89

### Changed (Hub /taxi — parité V3Cube image 1)
- **Deux vues distinctes** dans TaxiHubPage :
  - **Vue Grille** (`/taxi` sans mode, via « Plus de Services ») : titre « Choisissez un service » + grille bento des 16 services. **Aucun champ d'adresse.**
  - **Vue Réservation** (`/taxi?mode=X`, depuis une tuile de service) : titre « Planifiez votre trajet », **sans** la grille des autres services. Puce du service sélectionné + bouton « Changer ».
- **En-tête de trajet** : toggles **« Ramassage maintenant / Plus tard »** (révèle un datetime) et **« Pour moi / Pour un proche »** (révèle nom + téléphone).
- **Arrêts multiples** : bouton « + » bleu qui ajoute des arrêts intermédiaires (input + suppression) entre départ et destination. Envoyés dans `stops[]`.
- Navigation : retour intelligent (vue réservation issue de la grille → revient à la grille ; sinon → accueil).

### Backend
- `RideRequest`/`RideResponse` : champ `stops` (waypoints). Persisté dans `create_ride`.
- Les contrôles « plus tard » (→ ride_type scheduled + scheduled_at) et « pour un proche » (→ book_for_name/phone) s'appliquent à n'importe quel mode.

### Tests
- Backend vérifié (curl) : course avec `stops` + `scheduled_at` + `book_for_name` + paiement carte persistés ✅.
- UI vérifiée par screenshots : vue grille (16 services, sans adresses) et vue réservation (toggles + puce + add-stop + raccourcis, sans autres services) conformes à la maquette. Lint clean.

## 2026-06-03 — Géolocalisation départ + raccourcis Maison/Travail/récents — Iteration 88

### Added (Hub /taxi)
- **Localisation automatique du départ** : au chargement du hub, géolocalisation navigateur (`navigator.geolocation`) + reverse-geocoding Google (`Geocoder`) remplit automatiquement le champ Départ.
- **Raccourcis « Lieux favoris »** sous la destination (style V3Cube / image de référence) :
  - **Utiliser ma localisation actuelle** (re-localise le départ).
  - **Maison** et **Travail** : si enregistrés → définissent la destination au clic ; sinon « + » enregistre la destination courante. Icône crayon pour mettre à jour.
  - **Lieux récents** : 4 dernières destinations (clic → remplit la destination).
- Enregistrement automatique de la destination dans les récents à la création d'une course.

### Added (Backend `/api/places`)
- `routes/places.py` (collection `user_places`) : `GET /places/saved`, `PUT/DELETE /places/saved/{home|work}`, `POST /places/recent` (dédoublonnage + plafond 8). Auth utilisateur requise.
- `placesAPI` ajouté côté frontend.

### Tests
- `tests/test_iter88_places.py` — 3/3 ✅ (CRUD home/work, récents dédupliqués/plafonnés, auth requise). Régression CMS 5/5 ✅.
- UI vérifiée par screenshot : raccourcis rendus conformes à la maquette, garde-fous OK.

## 2026-06-03 — Paiement & Promo dans le hub + CMS Catégories d'accueil — Iteration 87

### Added (Hub /taxi — Partie 1)
- **Sélecteur de paiement horizontal** (`payment-selector`) : Espèces / Carte / SB PayGo, surbrillance navy au clic. Envoyé dans `payment_method` du POST /api/rides.
- **Code promo** (`promo-block`) : input + Appliquer → validation via `couponAPI.validate`, recalcul du prix (déduction affichée dans la carte live), badge vert + retrait. `coupon_code` transmis à la course.

### Added (CMS Catégories d'accueil — Partie 2)
- **Backend** `routes/home_categories.py` (collection `home_categories`) :
  - Public `GET /api/home-categories[?section=]` (config active ordonnée + sections).
  - Admin (permission `content.manage`) : `GET/POST/PUT/DELETE /home-categories/admin`, `POST /admin/reorder`, `GET /icons` (bibliothèque). Garde-fou image 8 Mo.
  - Seed idempotent de 41 catégories (8 sections) dont 17 modes taxi (7 visibles).
- **Admin** `pages/admin/AdminHomeCategories.js` (`/admin/home-categories`, menu CMS › Écran accueil app) : liste groupée par section, **réordonnancement** (flèches), **visibilité accueil** (œil), **icône** via bibliothèque (`icon-picker`) OU **upload image** (data-URL), nom FR/EN, sous-titre, couleurs, route cible, aperçu live, CRUD complet.
- **Composant** `components/DynamicIcon.js` : rend une icône Phosphor par nom OU une image personnalisée.
- **`UserHome.js`** désormais **piloté par la config** : `displayFor(section)` lit le CMS (fallback sur les tableaux codés en dur si vide). Catégories `visible_home` affichées ; le reste regroupé sous une tuile **« Plus de Services »** menant à la liste de la section. Clic catégorie taxi → directement la page d'adresses `/taxi?mode=...`.

### Tests
- `tests/test_iter87_home_cms.py` — 5/5 ✅ (public seed, CRUD+reorder, permission 403, garde-fou image 413, paiement carte).
- Testing agent frontend : **7/7 scénarios PASS** (paiement horizontal, promo, prix live 20.68 €, accueil config-driven + overflow, CMS admin CRUD/reorder/toggle/icon-picker/upload). Aucun bug critique/mineur.

## 2026-06-03 — Toutes les options Taxi : Hub moderne 16 modes — Iteration 86

### Added (Frontend)
- **`pages/user/TaxiHubPage.js`** (`/taxi`) — Nouveau hub de réservation unifié, design "Swiss & High-Contrast / Tactical Bento Grid" (cf. `design_guidelines.json`). 16 modes regroupés en 3 catégories :
  - **Au quotidien** (grille bento) : Taxi VTC, Pool (-30%), Green (électrique/Eco), Moto (Fast)
  - **Temps & Distance** (scroll horizontal) : Mise à Dispo (forfait), Intercité, Plus Tard (programmer), Loc Moto
  - **Spécialisé & Inclusif** (pills) : Enchères, Aéroport (suivi vol), Animaux, Pour un proche, TukTuk, Assistance, Corporate, PMR
- **Prix live** : carte navy haute-contraste `live-price-card` affichée dès que départ + destination saisis (appel `/api/rides/estimate`), avec distance/durée + remise entreprise.
- **Panneaux spécifiques par mode** (animés framer-motion) : datetime, n° de vol, forfait location, compteur animaux + taille, type d'assistance, sélecteur compte entreprise, contact passager, prix proposé (enchères).
- **CTA adaptatif** jaune sticky (libellé change selon le mode). Mode Enchères délègue à `/taxi-bidding` avec query params.
- Tuiles taxi de `UserHome` re-pointées vers `/taxi?mode=...`.

### Added (Backend)
- 3 nouveaux types de véhicules dans `core/seed_data.py` : **pets** (animaux), **tuktuk**, **assist** (assistance) avec tarification dédiée.
- `RideRequest`/`RideResponse` enrichis : `pets_count`, `pets_size`, `assist_needs`, `pool_enabled`. Persistés dans `create_ride`.

### Fixed (CRITICAL)
- **GooglePlacesInput mal câblé** dans TaxiHubPage ET AdvancedTaxiBookingPage : `value`/`onChange` (string) au lieu de `value={x?.address}` + `onSelect` (objet {lat,lng,address}). Conséquence : prix jamais affiché + soumission cassée. Corrigé → prix live vérifié (13.65 € sur Tour Eiffel→Gare du Nord).

### Tests
- `tests/test_iter86_taxi_modes.py` — 4 tests (estimate 6 véhicules, persistance pets/assist/access/pool/book_for) : **4/4 ✅**
- Testing agent frontend : 16 modes rendus + switch panneaux + CTA adaptatif + corporate select OK. Bug critique prix corrigé post-rapport et validé par screenshot.

## 2026-06-03 — V3Cube Pack C (Comptes Entreprise B2B) — Iteration 85

### Added (Backend `/api/corporate/`)
- **Module `routes/corporate.py`** : comptes entreprise multi-membres avec code d'adhésion, remise %, plafond mensuel, suivi crédit utilisé.
- **Admin** (require_permission merchants.view/activate) : `GET/POST /admin`, `GET/PUT/DELETE /admin/{id}`, gestion membres `POST/DELETE /admin/{id}/members`, facture mensuelle `GET /admin/{id}/invoice?month=YYYY-MM`.
- **User** : `GET /my` (mes entreprises), `POST /join` (code), `POST /leave/{id}`.
- **Hook rides.py** : à la création d'une course `ride_type=corporate`, validation de l'adhésion active (403 sinon) + application de la remise entreprise sur le tarif. À la complétion, enregistrement d'une charge dans `corporate_charges` + incrément `credit_used`/`total_rides`/`total_revenue`.
- Schéma `RideResponse` enrichi : `corporate_name`, `corporate_discount_pct`.
- Seed démo : ACME Corporation (code ACME-2026, 10%), test2@example.com membre manager.

### Added (Frontend)
- `pages/admin/AdminCorporate.js` — liste + création comptes, modal détail (membres + facture mensuelle KPI brut/remise/net), copie du code, gestion membres par email.
- `pages/user/CorporateAccountPage.js` (`/corporate`) — rejoindre par code, liste de mes entreprises, quitter.
- `AdvancedTaxiBookingPage.js` mode corporate : dropdown des entreprises du user (au lieu du champ libre), lien "Rejoindre une entreprise".
- `services/api.js` : `corporateAPI`.

### Navigation
- `App.js` : route user `/corporate` + route admin `corporate`.
- `AdminLayout.js` : entrée "Comptes Entreprise" (icône Briefcase) sous MEMBRES.

### Tests
- `/app/backend/tests/test_iter85_corporate.py` — 4 tests pytest (CRUD admin + membres, join/leave, remise course + facture, guard non-admin 403) : **4/4 ✅**
- Smoke UI admin `/admin/corporate` : page + ligne ACME rendues, sidebar OK.



## 2026-06-03 — V3Cube Pack B (Driver Pro) — Iteration 84

### Added (Backend `/api/driver-pro/`)
- **Vehicles CRUD multi-véhicules** : `GET/POST/PUT/DELETE /vehicles`, `POST /vehicles/{id}/set-primary` (sync `drivers` doc avec véhicule principal)
- **Bank details sécurisé** : `GET/PUT /bank` avec masquage IBAN (jamais retourné en clair, seul `iban_masked` + `iban_last4` exposés), validation longueur 14–34
- **Driver Gallery** : `GET/POST/DELETE /gallery` jusqu'à 20 photos, base64 ≤ 8 Mo, catégories vehicle/id/other
- **Earnings stats** : `GET /earnings/stats?period=day|week|month` avec bucket auto (hour/day) et série triée pour bar chart
- **Cancellation reasons** : liste publique `GET /cancellation-reasons?user_type=Driver|User` + CRUD admin `GET/POST/PUT/DELETE /admin/cancellation-reasons` avec onglets séparés User/Driver, FR/EN, ordre d'affichage

### Added (Frontend)
- `pages/driver/ManageVehiclesPage.js` — gestion multi-véhicules avec formulaire intégré, badge primaire, types eco/confort/premium/moto/van
- `pages/driver/BankDetailsPage.js` — IBAN masqué après save, statut "en attente de vérification 24-48h"
- `pages/driver/DriverEarningsStatsPage.js` — sélecteur période + cartes total/courses + bar chart CSS
- `pages/driver/DriverGalleryPage.js` — upload photos avec catégories (Véhicule/Identité/Autres) et caption optionnelle
- `pages/admin/AdminCancellationReasonsPage.js` — tableau avec onglets Chauffeurs/Clients, toggle actif, ordre

### Navigation
- `App.js` : 4 routes driver (`/chauffeur/vehicles|bank|earnings/stats|gallery`) + remplacement `/admin/cancel-reasons` par `AdminCancellationReasonsPage`
- `components/SideMenuDrawer.js` : entrées "Mes véhicules", "Ma galerie", "Coordonnées bancaires", "Statistiques gains" dans le drawer chauffeur

### Tests
- `/app/backend/tests/test_iter84_pack_b_driver_pro.py` — 24 tests pytest (vehicles, bank, gallery, earnings, admin reasons + non-admin 401/403) : **24/24 ✅**
- UI : Playwright login API → navigation aux 5 pages avec vérification data-testid, toutes présentes



## 2026-06-02 — Mobile App Foundation (Expo / React Native)

### Added (NEW `/app/mobile/`)
- Monorepo Expo SDK 52 + RN 0.76 + TypeScript (web `/app/frontend` reste intact)
- **Auth Bearer tokens** via `expo-secure-store` (Keychain iOS / Keystore Android) + axios interceptor auto-refresh
- **Navigation** : React Navigation v7 (RootStack + role-based : User/Driver/Merchant Tabs)
- **i18n** : i18next + expo-localization (FR + EN, auto-detect)
- **Theme** : tokens V3Cube (jaune #FFC107, navy #0B1426)
- **App User** : Home (12 services tiles), Booking taxi, Orders, Wallet, Profile, Catalog générique branché sur les 9 collections V3Cube via `/api/phase2/catalogs/{collection}`
- **App Driver** : Home (toggle online + activity stats), Rides disponibles, Earnings, Profile
- **App Merchant** : Dashboard + Profile
- **Voice Assistant FAB global** : appel `/api/voice/parse-booking` (Claude Sonnet) — STT mobile à brancher (placeholder MVP)
- Validation : `tsc --noEmit` ✅, bundle Android 9.7 MB ✅, bundle iOS 9.7 MB ✅ (1286 modules, 0 erreur)
- Démarrage : `cd /app/mobile && yarn start:tunnel` puis scan QR avec **Expo Go**

## 2026-06-02 — Google Maps Admin Integration (Option C, partie 1/2)

### Clé API renouvelée
- `/app/frontend/.env` REACT_APP_GOOGLE_MAPS_KEY mise à jour
- `/app/backend/.env` GOOGLE_MAPS_KEY mise à jour
- ⚠️ Recommandation : restreindre la clé aux référents HTTP `*.emergent.host`, `*.emergentagent.com` dans Google Cloud Console + limiter aux APIs : Maps JavaScript, Places, Directions, Geocoding, Visualization

### Composant réutilisable
- `/app/frontend/src/components/admin/AdminGoogleMap.jsx` — wrapper `@react-google-maps/api` avec props : center, zoom, pickup/dropoff/driver markers, routePath polyline, mapType (roadmap/satellite/hybrid/terrain), showTraffic, heatmapData, markers[], onMapClick

### Pages admin migrées Leaflet → Google Maps
- **AdminLiveRides** : carte centrale 560px avec markers pickup/dropoff/driver + polyline route + couche TrafficLayer
- **AdminGodsView** : 600px markers chauffeurs (vert online / orange en course) avec onClick → driver detail
- **AdminHeatView** : refait complet avec **HeatmapLayer Google Maps Visualization API**, sélecteur mapType (Plan/Satellite/Hybride/Terrain), data depuis nouveaux endpoints backend, refresh 30s

### Backend nouveaux endpoints (admin)
- `GET /api/admin/heatmap/drivers` — positions chauffeurs en ligne (auth admin)
- `GET /api/admin/heatmap/rides` — pickups des dernières 24h (auth admin)

### Validation
- ✅ Lint Python + JS PASS sur les 5 fichiers modifiés
- ✅ `yarn build` PASS (29s)
- ✅ Backend `/api/admin/heatmap/drivers` retourne 401 sans auth, 200 avec admin auth (testé via curl admin login)

### Restant pour la session suivante (Option C, partie 2/2)
- AdminDashboard sparkline migration (faible priorité, juste mini-map)
- Option B : GooglePlacesInput sur pages admin config (Fare Config, Geofence Airport, Stations interdites)
- AdminFareConfig avec dessin de zones tarifaires sur Google Maps (Drawing Manager)

## 2026-06-02 — V3Cube Pack A — Taxi Avancé (7 modes) DONE

### Backend
- **`models/schemas.py`** : `RideRequest` + `RideResponse` enrichis avec `ride_type` (instant/scheduled/intercity/airport/rental/buddy_driver/corporate), `flight_number`, `rental_hours`, `rental_package`, `corporate_account_id`, `buddy_hours`
- **`routes/rides.py`** : 4 nouveaux endpoints
  - `GET /api/rides/scheduled/list` — liste courses planifiées à venir (filtre `scheduled_at >= now`, status pending/accepted)
  - `PUT /api/rides/{id}/reschedule` — modifier `scheduled_at`
  - `POST /api/rides/rental-packages` — 3 forfaits par défaut (2h/20km, 4h/40km, 8h/80km)
  - `POST /api/rides/airport-multipliers` — multiplicateur 1.25 + min fare 25 EUR + waiting fee 0.5/min
- Création de ride persiste maintenant tous les champs Pack A

### Frontend
- **`AdvancedTaxiBookingPage.js`** (`/taxi-advanced`) : page unifiée 7-mode tabs (scheduled/intercity/airport/rental/buddy_driver/corporate/moto), chaque mode révèle ses champs spécifiques (datetime, vol AF1234, forfait, durée chauffeur perso, code entreprise, sous-type moto), deep-link `?mode=xxx`
- **`ScheduledRidesPage.js`** (`/scheduled-rides`) : liste courses planifiées avec actions Modifier (datetime-local inline) + Annuler
- **`UserHome.js`** : 5 tiles taxi re-routés vers `/taxi-advanced?mode=...` (Location, Chauffeur privé, Intercity, Programmer, Plus de services → Aéroport)
- **`App.js`** : 2 nouvelles routes protégées (`/taxi-advanced`, `/scheduled-rides`)

### Validation (iter 83)
- ✅ Backend 12/12 pytest PASS (persistence + endpoints) — `/app/backend/tests/test_iter83_pack_a_taxi.py`
- ✅ Frontend 100% sur flux testés (7 mode tabs, scheduled list, deep-link)
- ✅ Lint Python + JS PASS · yarn build PASS (32s)
- ⚠️ Bloqueur externe : `REACT_APP_GOOGLE_MAPS_KEY` expirée (renouveler dans Google Cloud Console)

## 2026-06-02 — Code Quality : Split RideTrackingPage + useEffect deps (iter 81-82)

### Refactor RideTrackingPage.js (518L → 431L + 3 sous-composants 232L réutilisables)
- **`/app/frontend/src/pages/user/ride-tracking/RideTrackingMap.jsx`** (69L) : MapContainer Leaflet, pickup/dropoff/driver markers, polyline route, back btn, indicateur de connexion WS
- **`/app/frontend/src/pages/user/ride-tracking/DriverInfoCard.jsx`** (51L) : Card chauffeur (avatar, nom, rating, vehicle, boutons call/chat)
- **`/app/frontend/src/pages/user/ride-tracking/RideActions.jsx`** (112L) : `CancelRideModal` + `RatingModal` (avec tip + waybill)
- useEffect deps : Toutes correctes, callbacks `useCallback` avec deps explicites
- empty catches : remplacés par `console.warn` contextuels (pool toggle, favorite driver, start OTP, rating, cancel reasons)

### TaxiBiddingPage.js — Fix bug TDZ critique
- `const fetchEstimate = useCallback(...)` déplacé AVANT le useEffect qui le consomme (était en dessous → ReferenceError sur initial render, page complètement cassée)
- Empty catch `.catch(() => {})` remplacé par `console.warn` contextuel
- ✅ Testing : POST /api/rides/estimate appelé 2x (debounced), pas de loop infini

### CancelRideModal — Fix duplicate React keys
- Backend `/api/config/cancel-reasons` retourne 2x "Autre raison" (slug `other`) → React warning éliminé via clé composée `${slug || id}-${index}`
- Note : la testid `cancel-reason-other` colle encore sur 2 nodes DOM (côté backend à corriger plus tard)

### Validation (iter 81 → 82)
- ✅ ESLint PASS sur tous fichiers modifiés
- ✅ `yarn build` PASS (26s)
- ✅ testing_agent_v3_fork iter 82 : 4/4 fixes confirmés (TDZ + estimate loop + ride tracking + duplicate keys), 100% backend success rate, 100% frontend success rate

### Blocker externe observé (non lié au refactor)
- ⚠️ `REACT_APP_GOOGLE_MAPS_KEY` expirée (ExpiredKeyMapError) → GooglePlacesInput désactivé. Workaround testing : `/taxi-bidding?pickup=...&plat=...&dropoff=...&dlat=...&dlng=...` (URL params shortcut fonctionnel)

## 2026-06-02 — Code Quality Report : corrections critiques sécurité + nettoyage

### Backend
- **Hardcoded secrets retirés** des 4 fichiers de tests restants (`test_iter75_refactor_smoke.py`, `test_iter76_admin_users.py`, `test_iter77_wallet_credit.py`, `test_iter78_user_documents.py`) : migration vers `from _creds import ADMIN_EMAIL, ADMIN_PASSWORD` (centralisé via env vars)
- **`random` → `secrets`** dans `routes/simulation.py` : ✅ déjà fait (utilise `_sim_random = secrets.SystemRandom()` aux 7 endroits flaggés)
- **Semicolon E702 fixé** dans `test_iter75_refactor_smoke.py:153`

### Frontend
- **Empty catch blocks** : 4 blocs `} catch { /* ignore */ }` remplacés par du logging contextuel (`console.warn(...)`) dans `DriverHome.js` (heatmap, rewards, dest mode toggle, OTP refresh) et `KioskApp.js` (ride status poll)
- **Array index as React key** : 5 instances corrigées avec des clés stables :
  - `UserHome.js:230` → `key={\`promo-dot-${i}\`}`
  - `DriverHome.js:295` → `key={stat.label}`
  - `AdminDashboard.js:499` → `key={s.label}`
  - `RidePlanStep.jsx:98` → `key={s.id || \`${lat}-${lng}-${i}\`}` (stopovers reorderables = vrai bug fixé)
  - `KioskApp.js:352` → `key={s.place_id || s.osm_id || ...}` (suggestions search)

### Décisions documentées (non fixés intentionnellement)
- **localStorage non sensible** dans `InstallPWA.jsx` (timestamp de dismissal) et `ProfileTabView.jsx` (préférences UI langue/devise) → faux positifs du rapport, données non sensibles
- **localStorage kiosk token** (`KioskApp.js` x6) → décision design : le kiosk est un device public persistant, le token est un device credential pas un user credential. Migration vers cookies httpOnly nécessiterait refactor backend kiosk routes + 6 touchpoints frontend → reporté à session dédiée
- **159 useEffect deps** et **refactor composants oversized** (UserHome 599L, DriverHome 574L, LoginPage 543L, etc.) → reportés à sessions dédiées (risque régression élevé, besoin testing_agent_v3_fork après chaque split)
- **High complexity functions** (admin.py, drivers.py, payments.py) → reportés (déjà partiellement faits dans iter75)

### Validation
- ✅ Lint Python : `ruff` PASS (4/4 fichiers tests)
- ✅ Lint JS : ESLint PASS (DriverHome.js, KioskApp.js)
- ✅ Frontend build : `yarn build` PASS (29s)
- ✅ Backend tests imports : `python -m py_compile` OK (4/4)
- ✅ `_creds.py` import smoke test : ADMIN_EMAIL résout correctement

## 2026-06-02 — Admin Dispatcher : ETA temps réel sur la map live

### Added
- **AdminLiveRides.js** : nouveau state `etas` (map `{[ride_id]: { eta_min, distance_m, updated_at }}`) alimenté par les messages WS `eta_update` (déjà émis par l'app mobile chauffeur)
- **Card course sélectionnée** : bandeau émeraude "ETA temps réel — Chauffeur dans X min · Y.Y km" avec pulse animé
- **Liste des courses actives** : pill compact `Timer + Xmin` (testID `ride-eta-{id}`) à côté du tarif sur chaque card
- **Auto-purge** : les ETAs sans update depuis >60s sont nettoyés automatiquement (toutes les 15s)
- **Backend** (`server.py`) : le handler `eta_update` broadcaste désormais aussi via `manager.broadcast_to_admins(payload)` en plus du passager + ride room
- Validation : ESLint PASS · backend healthy `/api/health` · smoke WS test (admin + driver connect, `eta_update` handler exécuté sans erreur)

## 2026-06-02 — Mobile App : ETA dynamique côté client (sans coût API)

### Added
- **utils/eta.ts** : `estimateEtaMinutes()` calcule l'ETA basé sur distance crow-flies × 1.3 (correction urbaine) ÷ vitesse moyenne par type de véhicule (eco 30 km/h, comfort 32, premium 34, moto 38). `formatEta()` pour affichage "12 min" / "1 h 5".
- **DriverActiveRideScreen** : ETA affiché dans la card passager (ex : "12,50 EUR · 2.3 km · ETA 8 min"), recalculé à chaque update GPS et **pushé via WebSocket** (`eta_update`) vers le passager
- **RideTrackingScreen (passenger)** : ETA reçu via WS affiché dans la status pill ("Chauffeur en route — Chauffeur dans 8 min" / "Course en cours — Arrivée dans 12 min"), fallback de calcul local si le driver ne pushe pas encore
- **Backend** : nouveau handler WS `eta_update` dans `server.py` qui relaie aux room members + au passager (via `send_personal_message`)
- Validation : `tsc --noEmit` PASS · bundle Android 9.88 MB (1314 modules) · backend healthy

## 2026-06-02 — Mobile App : Mode Course Chauffeur (Turn-by-Turn)


### Added
- **DriverActiveRideScreen** (`/mobile/src/screens/driver/`) : écran plein écran avec MapView (provider Google sur Android), marker dynamique pickup/dropoff selon la phase, polyline vers la cible courante
- **Phases automatiques** déduites du `ride.status` backend : `to_pickup` → `arrived_at_pickup` → `to_dropoff` → `completed`. Header navy/jaune affichant le titre + hint contextualisé.
- **Bouton flottant "Naviguer"** (Ionicons navigate, fond bleu info) → deep-link via `utils/navApps.ts` :
  - **iOS** : `ActionSheetIOS` propose Plans (Apple) / Google Maps / Waze
  - **Android** : Google Maps en priorité, fallback `geo:` URI (laisse l'utilisateur choisir Waze/Google/etc.)
- **Tracking position chauffeur** : `Location.watchPositionAsync` (15m / 5s), push HTTP `driverAPI.updateLocation` + WS `location_update` pour mettre à jour la map passager temps réel
- **Actions phase-dépendantes** :
  - `to_pickup` → "Je suis arrivé" (`status=arrived`)
  - `arrived_at_pickup` → "Démarrer la course" (`status=in_progress`)
  - `to_dropoff` → "Terminer la course" (`status=completed`)
- **Card Passager** : avatar, nom, tarif, distance restante (m/km), bouton appel `tel:` direct
- **DriverRidesScreen** : accept → `nav.navigate('ActiveRide', { rideId })` (au lieu de simple reload)
- **DriverHomeScreen** : banner jaune "Course en cours" auto-affiché si `rides/active/current` retourne une course active (resume après quit/relaunch)
- Validation : `tsc --noEmit` PASS · bundle Android 9.88 MB (1313 modules) · bundle iOS 9.87 MB (1309 modules)


### Added
- **BookingScreen** : MapView Google Maps (provider=GOOGLE sur Android), géolocalisation auto, **markers visuels** pickup (vert) + dropoff (rouge), **Polyline** jaune entre les deux points, bottom sheet avec adresses + chips véhicules + estimate/book, mode "tap-to-pick" sur la carte pour choisir un point géolocalisé inverse-géocodé (`expo-location`)
- **RideTrackingScreen** (nouveau) : MapView + marker chauffeur dynamique (icône car-sport jaune sur fond navy), pill de statut coloré (pending/accepted/in_progress/completed/cancelled), card chauffeur (avatar, nom, rating, plate, bouton appel `tel:`), polling fallback toutes les 8s, **WebSocket live** `/api/ws/{user_id}` (auto-join ride room, écoute `driver_location` + `ride_status_update`), bouton "Annuler la course"
- **Hook `useRideSocket`** : gestion connexion WS auto avec `auth/me` pour récupérer user_id réel
- Helper `regionFromCoords` (utils/geo) pour fit map automatique sur les points
- Navigation : `Booking` → `RideTracking` (replace) après création course
- Validation : bundle Android 9.85 MB / iOS 9.83 MB (1311 modules, 0 erreur)




## 2026-06-02 — Iter79-80: Réservation de Taxi par la Voix

### Added
- **Bouton flottant 🎤** (FAB noir) sur `/home` (UserHome) au-dessus de la TabBar
- **Bottom sheet "Comment puis-je vous aider ?"** : zone transcript live, gros bouton micro central (pulse rouge quand actif), 3 exemples cliquables (« Réserve-moi un taxi de X à Y »), bouton vert "Réserver maintenant" qui apparait quand un transcript est saisi
- **Web Speech API** (gratuit) : reconnaissance vocale native fr-FR, fallback gracieux si non supporté
- **Endpoint backend** `POST /api/voice/parse-booking` : utilise **Claude Sonnet 4.6 via Emergent LLM key** pour extraire `{intent, pickup, dropoff, vehicle_type, when, passengers, confidence}` du transcript. Fallback heuristique si LLM indispo. Stocke chaque requête dans `voice_bookings` pour analytics.
- **Pré-remplissage automatique** sur `/ride` : `useEffect` lit `location.state.prefill`, attend que Google Maps soit prêt (retry 150ms × 5s), géocode pickup/dropoff via `google.maps.Geocoder`, sélectionne le bon véhicule, toast "Réservation pré-remplie par la voix"

### Bugs corrigés (iter79 → iter80)
- `/ride/book` → `/ride` (l'ancienne URL matchait `/ride/:rideId` et affichait "Course introuvable")
- `_normalize`: `confidence or 0.6` → `if confidence is None: 0.6` (préserve les 0.0 légitimes)
- Regex fallback acceptant apostrophe droite et courbe (`jusqu'à` / `jusqu'à`)
- Race condition Google Maps via `waitForMaps()`

### Tests
- 16/16 nouveaux tests `test_iter79_voice.py` PASS
- **116/116 régressions** iter70-79 toujours PASS
- E2E validé : FAB → sheet → exemple → submit → /ride (page Planifier votre course) → pas de "Course introuvable"

## 2026-06-01 — Iter78: Bouton Documents activé (eye icon)

### Added
- **Bouton œil cliquable** dans la colonne Documents de `/admin/users` ouvre la modal **"Documents de [Nom]"**
- **Modal** avec : titre + bouton vert "+ Ajouter" + bouton cyan "Fermer", grille 3 colonnes des documents (thumbnail image ou icône PDF cliquable), état vide "Aucun document trouvé" avec icône FileText, suppression via trash icon (masquée pour le doc profile synthétique)
- **3 endpoints backend** :
  - `GET /api/admin/users/{id}/documents` → liste + injection synthétique de l'avatar comme "profile"
  - `POST /api/admin/users/{id}/documents` → upload data URL (cap 8 Mo, status `pending_review`)
  - `DELETE /api/admin/users/{id}/documents/{doc_id}` → suppression

### Tests
- 9 nouveaux tests `test_iter78_user_documents.py` PASS
- **100/100 régressions iter70-78** (0 bugs critiques)

## 2026-06-01 — Iter77: Bouton "Créditer l'utilisateur" (Add Balance)

### Added
- **Bouton `+` vert** dans la colonne Wallet de `/admin/users` à côté du montant
- **Modal "Ajouter solde"** identique à XJekPlus : titre noir, X blanc rond, affichage du solde actuel, champ Montant (négatif accepté pour débit), champ Note optionnel, boutons Fermer/Enregistrer noirs
- **Endpoint backend** `POST /api/admin/users/{id}/wallet/credit` : crédit/débit avec validation, insertion `wallet_transactions`, type `admin_credit`/`admin_debit`, retour `new_balance`
- **Fix régression** : `GET /api/admin/users` (liste) enrichi avec `wallet_balance` via batch lookup pour que l'affichage se rafraîchisse après crédit

### Tests
- 9 nouveaux tests `test_iter77_wallet_credit.py` PASS
- 77 régressions iter70-76 toujours PASS (total **86/86**)
- E2E validé : crédit +25.50 → balance 170.50, débit -5 → 165.50, montant 0 rejeté (400)

## 2026-06-01 — Iter76: Page Utilisateurs (Liste + Édition)

### Added
- **`/admin/users` (refonte)** — Filtres (Tous/Nom/Email/Tél + Recherche + Statut), boutons d'action (Recherche, Reset, Refresh, Actions groupées Activer/Suspendre/Supprimer, Exporter CSV, Ajouter), table triable avec colonnes Nom (souligné cliquable), Email, Inscription (format FR), Téléphone, Wallet (€), Documents, Statut, Actions (Edit/Toggle/Delete). Sélection multi-lignes pour actions en masse.
- **`/admin/users/new` + `/admin/users/:id` (nouvelle page)** — Formulaire complet : Prénom, Nom, Email, Mot de passe (optionnel en édition), Genre (Homme/Femme/Autre), Photo de profil (drag & drop), Pays (13 pays avec dial code auto), Téléphone avec code, Langue (4), Devise (6), Statut toggle. Boutons Créer/Mettre à jour + Réinitialiser + Retour à la liste.
- **4 endpoints backend** sous `/api/admin/users` : GET (avec wallet_balance), POST (création + wallet), PUT (update partiel avec dédup email/phone), DELETE (avec garde anti-admin). Bcrypt pour mots de passe.

### Tests
- 12/12 nouveaux tests `test_iter76_admin_users.py` PASS
- 70/70 régressions iter70-75 toujours PASS (total **82/82**)
- E2E validé : login → liste (166 lignes) → Ajouter → créer → éditer → mettre à jour → retour → supprimer

## 2026-06-01 — Iter75: Code Quality Report Fixes (Critical + Important)

### Security (CRITICAL)
- Removed hardcoded secrets from `test_iter73_fixes.py` (4 constants → `_creds.py` import) and `test_iter74_acl_admins.py` (1 password → `os.environ.get`).
- Consolidated `simulation.py` to a single `secrets.SystemRandom()` import (removed duplicate `random as _sim_random` alias).
- Removed `localStorage.setItem('access_token')` from `EmailLoginPage.js` — relies on httpOnly cookies set by backend (XSS-safe).
- Removed `authHeaders()` localStorage reads from `AdminManageAdmins.js` and `AdminGroupsPage.js` — all requests now use `credentials:'include'` only.

### Refactoring (IMPORTANT)
- `kiosk_book()` (94 lines) split into `_ensure_kiosk_user`, `_build_kiosk_ride`, `_broadcast_kiosk_ride` helpers + main now 13 lines.
- `update_admin()` (complexity 15) split into `_apply_name_updates`, `_apply_email_update`, `_apply_password_update`, `_apply_role_update`.
- Replaced 5 silent `} catch { /* ignore */ }` with `console.warn` logging in RideTrackingPage, RideBookingPage, RestaurantDetail, EmergencyContactsPage, CheckoutPage.
- Replaced array-index React keys with stable IDs in: TowingServicesPage (string `s`), RunnerPage (added `_key`), DriverSupportPage chat (`msg_id`), AdminDashboard (donut `entry.color`, notifications, contactRequests).

### Tests
- 70/70 tests PASS (65 regression iter70-74 + 5 new smoke tests).
- Frontend Playwright: login no longer writes any token to localStorage; `/api/auth/me` works via httpOnly cookie; admin CRUD pages load and operate via cookie auth.

## 2026-06-01 — Iter74: V3Cube/XJekPlus Admin Groups + Administrator Pages

### Added
- **`/admin/groups` (AdminGroupsPage)** — reproduit exactement le design XJekPlus : filtres (Tous/Recherche/Statut), 7 groupes système (billing, crm_drivers, crm_merchants, crm_users, dispatcher, super_admin, sysadmin) avec bouton noir "Voir (N)" qui ouvre un modal listant les permissions par catégorie, badge "Système" pour les groupes verrouillés, statut Actif vert.
- **`/admin/admins` (AdminManageAdmins refondue)** — design XJekPlus : filtres (Tous/Recherche/Statut/Rôle), boutons Refresh + Clear + Exporter CSV + Ajouter, table avec colonnes Nom (souligné cliquable), Email, Rôles, Statut, Action (Edit / Toggle status / Delete). Modal Add/Edit avec champs Groupe (dropdown), Prénom, Nom, Email, Mot de passe.
- **4 nouveaux endpoints backend** `/api/acl/admins` :
  - `POST /api/acl/admins` — créer admin (bcrypt, dedup email)
  - `PUT /api/acl/admins/{id}` — update partiel (champs optionnels)
  - `DELETE /api/acl/admins/{id}` — supprimer (guard contre auto-suppression)
  - `POST /api/acl/admins/{id}/toggle-status` — basculer is_active

### Tests
- 16/16 nouveaux tests `test_iter74_acl_admins.py` PASS
- 33/33 régressions iter71+72+73 toujours PASS (total 49/49)

## 2026-06-01 — Iter71-73: Code Quality Refactor + Phase 2 Feature Activation

### Added (Phase 2 UI activation)
- **Driver Destination Mode** UI on `/chauffeur/home`: floating button `[data-testid=destination-mode-toggle]` + modal with address/lat/lng inputs (`dest-address-input`, `dest-lat-input`, `dest-lng-input`). Wired to `GET/PUT /api/phase2/driver/destination-mode`.
- **User Taxi Pool toggle** on `/ride/:id` when status==='pending': `[data-testid=toggle-taxi-pool-btn]` calls `PUT /api/phase2/pool/enable/{id}` with -30% fare. Pool fix preserves `original_fare` across toggle cycles.
- **Email Login Page** `/login/email` (data-testids: `email-login-page`, `email-input`, `password-input`, `email-login-submit-btn`). Role-based redirect (admin/driver/merchant/user).
- **"Email & mot de passe"** entry at top of "Choisir un compte" modal on `/login` (`[data-testid=login-email-btn]`).
- Added `bidding_posts` to `PUBLIC_CATALOGS` in `phase2.py` so `GET /api/phase2/catalogs/bidding_posts` returns 200 (was 404).

### Refactored (Code Quality Report)
- Centralized test credentials in `/app/backend/tests/_creds.py` and patched 35 test files to use `os.environ.get(...)` instead of hardcoded passwords.
- Refactored 3 high-complexity functions: `negotiation_gap_report` (admin.py, 5 helpers), `phone_register` (auth.py, 5 helpers), `auto_dispatch_loop` (auto_dispatch.py, 2 helpers).
- Replaced `random` with `secrets.randbelow` in `/api/phase1/otp` generation. Used `secrets.SystemRandom()` in `simulation.py`.
- Fixed phone normalization in `phone_register` (.replace(" ", "")) so `check-phone` returns correct exists status.

### Tests
- 28/28 backend tests PASS (iter71+72 + 5 new iter73 fixes)
- E2E validated: admin email-login → /admin (full sidebar), pool toggle cycle, destination-mode enable/disable.

## 2026-04-18 — Phase A: Top Chauffeurs & Dashboard Completion

### Added
- **Public Top Chauffeurs page** (`/top-chauffeurs`) avec podium Gold/Silver/Bronze, classement complet, CTA "Devenir chauffeur".
- **TopDriversWidget** sur UserHome (passager) : top 3 carrousel + lien "Voir tout".
- **Admin Top Chauffeurs Settings** (`/admin/top-drivers`) : modes composite/points/manuel + réorganisation + live preview.
- **Admin DB Backup** (`/admin/db-backup`) : état des 50+ collections MongoDB + export JSON.
- **12 nouvelles pages Admin CRUD** : Vehicle Make/Model, Master Services, Cancel Reasons, Email/SMS Templates, SOS/Contact/Withdraw/Order Help/Trip Help Requests, Push Notifications.
- **Sidebar Admin** : 2 nouvelles sections SUPPORT + SETTINGS & UTILITIES complètes (parité V3Cube XJek25).

### Backend endpoints added
- Public: `GET /api/drivers/top`
- Admin: `GET/PUT /api/admin/top-drivers-config`, `GET /api/admin/db-backup`
- Admin CRUD: `/api/admin/crud/{collection}` (POST/GET/PUT/DELETE) for 12 new collections

### Tests
- 18/18 backend tests PASS
- 5 frontend pages + sidebar visually verified

## 2026-02-XX — Rewards & Driver Points System
Voir PRD.md section "NEW - Feb 2026"
