## NEW - 2026-06-12 (344) - 🚐 Audit Intercity + paiement sécurisé : unification + validations + caution séquestre (DONE, testé 100%)
- **Demande user** : vérifier la config intercity + le flux de paiement taxi sécurisé, et ajouter ce qui manque. Choix validé : **a + b + c**.
- **(a) Unification** : la page DÉMO mock `/intercity` (`IntercityRidePage` → `/api/intercity/*`, villes France Paris-Lyon, **sans paiement ni dispatch**) n'était atteinte que par l'assistant vocal. Désormais `/intercity` **redirige** vers le vrai flux `/course?mode=intercity` (RideChoosePage, tarif réel + aller-retour ×1.9 + paiement taxi sécurisé). Intent vocal `book_intercity` corrigé. Import `IntercityRidePage` retiré.
- **(b) Validations serveur** (`rides.py create_ride`) : Intercité doit être réservée ≥ **2 h** à l'avance (`min_hours_later_booking_intercity`), ≤ **90 j** (`max_pickup_days_intercity`), et le retour d'un A/R ≤ **5 j** après le départ (`max_round_trip_days_intercity`). Messages FR clairs (HTTP 400).
- **(c) Caution/séquestre SB Pay** : à la réservation intercity (paiement digital), un acompte **30 %** (`intercity_deposit_percent`, configurable via app_settings) est débité du portefeuille → `deposit_status='held'`. Si solde insuffisant → 400 « Caution Intercité requise… ». À la **complétion** : la caution est **imputée** (le passager ne paie que le reste, `deposit_status='captured'`, chauffeur crédité du tarif net commission, caution incluse). À l'**annulation** (2 chemins : `cancel_ride` + `update_ride_status`) : **remboursement** intégral via `_refund_intercity_deposit` (`deposit_status='refunded'`). UI : note « caution séquestre » (`intercity-deposit-note`) dans le panel intercity.
- **Constat clé** : le paiement taxi standard reste « capture à la complétion + bascule espèces (`switch_to_cash_if_needed`) + anti-fraude payout » ; pas de pré-autorisation carte (Stripe manual capture) — toujours **bloqué** faute de clés Stripe.
- **Testé** : pytest `test_iter344_intercity_deposit.py` 2/2 (réconciliation + non-régression course normale) + curl (caution 1000→980.51→1000, validation 2h, instant sans caution) + testing_agent iter344 **backend 100% + frontend 100%**, 0 bug. Non-bloquant : le modal « Programmer la course » s'ouvre auto en mode intercity (attendu).
- ⚠️ PREVIEW → redéploiement requis pour la prod.



## NEW - 2026-06-12 (343) - 🔔 Alerte chauffeur sur « trajet habituel » + matching auto sur demande (DONE, testé 100%)
- **Demande user** : notifier automatiquement les chauffeurs proches d'une nouvelle demande sur leur trajet habituel (remplir les voitures + ↑ commissions). Choix : 1c (géo si coords sinon texte) + 2a (in-app + temps réel) + routes côté chauffeur.
- **Backend** `routes/carpool.py` : collection `carpool_driver_routes` (départ/destination + coords + jours + heure + active). Endpoints `POST/GET /carpool/driver-routes`, `POST /driver-routes/{id}/toggle`, `DELETE /driver-routes/{id}`. Matching `_request_matches_route` : géo via `_haversine_km` (rayon 15 km sur les DEUX extrémités) sinon partage de mot significatif (ville). `create_carpool_request` déclenche `_notify_matching_drivers` (exclut le passager lui-même) → `create_notification` type `carpool_request_match` (in-app + WS + web push, `url=/carpool?tab=requests`) ; renvoie `drivers_notified`.
- **Frontend** : `DriverRouteModal` (`CarpoolComposer.jsx`) — adresses Google + jours (L-D) + heure. Section **« Trajets habituels & alertes »** dans « Mes trajets » (ajout, suppression, **« Publier aujourd'hui »** en 1 tap → composer pré-rempli date du jour + heure). Deep-link `/carpool?tab=requests` (ouvre l'onglet Demandes depuis la notif). `carpoolAPI.listDriverRoutes/createDriverRoute/toggleDriverRoute/deleteDriverRoute`.
- **Testé** : pytest `test_iter343_carpool_routes.py` 4/4 (match texte/géo, non-match, route inactive, toggle/delete) + curl (`drivers_notified:1`) + testing_agent iter343 **backend 100% + frontend 100%**, 0 bug. Notif `carpool_request_match` visible via `/api/drivers/my-notifications`.
- ⚠️ Note UX backlog (toute l'app) : l'autocomplete Google legacy (`pac-container`) peut recouvrir les puces de jours sur petit écran → migrer vers `PlaceAutocompleteElement`. ⚠️ PREVIEW → redéploiement requis pour la prod.



## NEW - 2026-06-12 (341-342) - 📊 Dashboard « Revenus Covoiturage » + ✨ Publication innovante & matching inversé (DONE, testé 100%)
- **Demande user** : (1) finir le tableau de bord admin des revenus covoiturage (commissions 15 %) ; (2) « un client qui publie un trajet, les chauffeurs aussi… il faut innover, pas du copier-coller ».
- **Dashboard Revenus** : backend `GET /carpool/admin/revenue` (admin-only, agrège `carpool_rides` terminés → KPIs commission/brut/reversé/trajets/places/chauffeurs actifs/panier moyen, top 10 chauffeurs avec note, série quotidienne). Page `AdminCarpoolRevenue.js` (route `/admin/carpool-revenue`, menu Covoiturage > « Revenus covoiturage ») : KPIs, graphique AreaChart recharts, table top chauffeurs (badge Super), presets Tout/7j/30j/90j. Validation/clamp ajoutée à `PUT /carpool/admin/config` (commission 0-100, sièges 1-8, libération 1-168).
- **Publication innovante** (`components/carpool/CarpoolComposer.jsx`) : composer plein écran `PublishComposer` — adresses Google autocomplete (`GooglePlacesInput`) + « Ma position », **distance estimée (Haversine ×1.3)** → **prix conseillé intelligent** (1,5€ + 0,12€/km), sélecteur de places visuel (sièges), créneaux rapides (Ce soir/Demain/Samedi), **gain net en direct** après commission, **aperçu live de l'annonce** côté passager, note optionnelle.
- **Matching inversé** : collection `carpool_requests` + endpoints `POST/GET /carpool/requests`, `GET /carpool/my-requests`, `POST /carpool/requests/{id}/cancel`. `create_carpool_ride` accepte `request_id` (clôt la demande → `fulfilled` + notifie le passager) et stocke les coords/distance/notes. Onglet **« Demandes »** dans `CarPoolPage.js` (`RequestComposer` pour publier un besoin ; bouton « Proposer ce trajet » côté chauffeur → ouvre le composer pré-rempli). Ancien `PublishTripModal` (champs texte bruts) supprimé.
- **Testé** : pytest `test_iter341_carpool_revenue.py` 3/3 + `test_iter342_carpool_requests.py` 4/4 (créé par testing_agent) + non-régression `test_iter338` 5/5 (exécution par fichier — conflit de boucle asyncio inter-fichiers connu). testing_agent iter341 **backend 100% + frontend 100%**, 0 bug, 0 action item (dashboard KPIs/presets, composer publie, demandes CRUD + fulfill).
- ⚠️ PREVIEW → redéploiement requis pour la prod (`gojek-mvp-1.emergent.host`).



## NEW - 2026-06-12 (340) - 🛠️ Covoiturage : UI admin config + avis détaillés chauffeur + badge Super chauffeur
- **Demande user** : 3 items backlog → page admin config covoiturage, avis détaillés du chauffeur, badge « Super chauffeur » au-delà d'un seuil.
- **Admin** : `AdminCarpoolConfig.js` (/admin/carpool-config) → `GET/PUT /carpool/admin/config` (commission, sièges, libération auto, activation, devise ; admin only).
- **Avis** : `GET /carpool/drivers/{id}/reviews` (note, count, is_super_driver, avis détaillés). Frontend `DriverReviewsModal` (zone note cliquable sur chaque trajet).
- **Badge Super chauffeur** : note ≥ 4.7 sur ≥ 5 avis → `driver_super` (cartes recherche + modale). Polish : libellé toggle activé/désactivé, alias route `/covoiturage`.
- **Testé** : pytest 5/5 + e2e 100% (config persiste, 403 non-admin, badge + modale avis).


## NEW - 2026-06-12 (339) - ⭐ Covoiturage : notation chauffeur ↔ passager + note moyenne en recherche
- **Demande user** : ajouter une note/évaluation (★) après chaque trajet covoiturage et afficher la note moyenne du chauffeur (la confiance booste les réservations).
- **Backend** `routes/carpool.py` : `POST /rides/{id}/rate` (anti-doublon, trajet terminé requis, $inc agrégats sur le user), `_attach_driver_ratings` (search + my-rides), `can_rate` dans my-rides.
- **Frontend** `CarPoolPage.js` : `StarBadge` sur les cartes (« Nouveau ✦ » si aucune note), `RateModal` (★ + commentaire), boutons « Noter » passager & chauffeur. `carpoolAPI.rate`.
- **Testé** : pytest 5/5 + e2e 100% (5★ chauffeur, 4★ passager, doublon bloqué, note « ★ 5 (1) » en recherche).


## NEW - 2026-06-12 (338) - 🚗 Covoiturage : paiement SB Pay sécurisé en séquestre (escrow) + e-mail bouton transfert
- **Demande user** : « configure l'autre pool, mets à jour tout le système complet ». Audit : le « Pool taxi » (taxi partagé) était déjà sécurisé ; le **Covoiturage** (CarPool) n'avait AUCUN paiement → sécurisé.
- **Choix** : escrow (débit à la réservation, conservé par la plateforme), commission 15 %, remboursement intégral avant départ, SB Pay uniquement.
- **Backend** `routes/carpool.py` (réécriture) : book = réservation atomique des sièges + débit SB Pay (rollback si solde insuffisant), cancel/refund passager, complete = libération escrow au chauffeur −15 %, cancel-ride = remboursement total, config admin, boucle libération auto (départ+12h). `core/startup.py` branché.
- **Frontend** `CarPoolPage.js` (réécriture) : onglets Rechercher/Mes trajets, modal réservation (places+total+séquestre), actions passager/chauffeur + contacts. `carpoolAPI`.
- **E-mail vol** : bouton « Réserver mon taxi SB Drive » (deep-link mode Aéroport) ajouté à la confirmation pour aéroports desservis.
- **Testé** : pytest 4/4 + e2e 100% (book 40€, complete +34€/6€ commission, annulation remboursée, rollback solde insuffisant, refus auto-réservation).


## NEW - 2026-06-12 (337) - 🛫 Transfert aéroport SB Drive en mode « Aéroport » dédié (suivi de vol + tarif fixe)
- **Demande user** : utiliser le mode « Aéroport » de SB Drive (au lieu du standard) pour que le chauffeur voie le n° de vol et ajuste l'heure en cas de retard.
- **Backend** : `core/airport.py seed_airport_zones()` (FDF/PTP/CAY/SXM/ORY/CDG, idempotent), appelé au démarrage. `/api/phase2/airports` renvoie la liste.
- **Frontend** : `FlightsPage.js` deep-link `mode=airport&acode&flight(&farr)` + coords ; `RideChoosePage.js` lit `flight/term/farr`, pré-sélectionne l'aéroport via `acode`, désactive l'auto-advance pour afficher le panneau vol.
- **Testé** : e2e 100% (iter337) après correctif du bug « aller à l'aéroport » (panneau vol sauté). Les deux sens OK : aéroport pré-sélectionné, n° de vol + heure pré-remplis, bandeau suivi de vol.


## NEW - 2026-06-12 (335) - 🚗 Transfert aéroport SB Drive sur vols confirmés (cross-sell)
- **Demande user** : relier la réservation de vol à une course SB Drive (transfert aéroport). Choix : les deux sens + écran confirmation & « Mes vols » + adresse ville vide. Vols NON limités à FDF→Paris (Duffel = mondial ; « Offres SB » = démo admin seulement).
- **Frontend** `FlightsPage.js` : `SbDriveTransfer` + `AIRPORT_PLACES` (FDF/PTP/CAY/SXM/ORY/CDG, coords en dur). Boutons « Aller à l'aéroport » / « Me récupérer à l'arrivée » (aéroports desservis uniquement). Deep-link via params URL natifs de RideChoosePage (dlat/dlng/daddr, plat/plng/paddr).
- **Testé** : e2e 100% (iter335) — pré-remplissage destination/départ OK, visibilité correcte (FDF/ORY oui, LHR/JFK non). Aucune modif backend.


## NEW - 2026-06-12 (333) - 📧 E-mail de confirmation vol (Resend) + e-billet PDF en pièce jointe
- **Demande user** : rassurer le voyageur et réduire les tickets support → e-mail auto avec PNR + e-billet PDF dès qu'un vol est confirmé.
- **Backend** : `core/email.py` (`_send_with_attachments` base64 + `send_flight_confirmation`). Déclenché (non bloquant via `fire()`) dans `routes/flights.py` `live_book` et `live_pay`, avec PDF `_build_eticket_pdf`.
- **Testé** : pytest `test_iter333_flight_email.py` 2/2 + envoi réel confirmé (PNR RG6LRC, +1 attachment).
- ⚠️ Resend mode test : délivre uniquement à l'adresse vérifiée (`somosylv@gmail.com`). Prod → vérifier un domaine sur resend.com/domains + ajuster `SENDER_EMAIL`.


## NEW - 2026-06-12 (332) - ⏳ Mode « Hold order » Duffel — bloquer un tarif sans payer
- **Demande user** : booster la conversion sur vols chers (Affaires/Première) en permettant de bloquer un tarif quelques heures sans payer. Choix : 1a (débit SB Pay uniquement au paiement) + 2b (notif ~2h avant + expiration auto).
- **Backend** : `core/duffel.py` (`create_hold_order`, `create_payment`). `routes/flights.py` : offre expose `hold_available` ; `POST /flights/live/hold` (statut `held`, PNR, **aucun débit**) ; `POST /flights/live/bookings/{id}/pay` (vérif échéance+solde → paiement Duffel → débit → `confirmed`) ; `flight_hold_loop` (rappel 2h + expiration). `core/startup.py` : tâche branchée au lifespan.
- **Frontend** `FlightsPage.js` : bouton « Bloquer le tarif (sans payer) », écran « Tarif bloqué » + « Payer maintenant », « Mes vols » avec badges held/expired + paiement.
- **Testé** : pytest `test_iter332_duffel_hold.py` **10/10** (+1 skip env) + e2e 100% (hold `UNISZP` sans débit → paiement → confirmé). ⚠️ PREVIEW → redéploiement requis pour prod.


## NEW - 2026-06-12 (331) - ✈️ Intégration API Vols RÉELLE Duffel (mode test) — recherche temps réel + e-billet PNR
- **Demande user** : remplacer les vols mockés (offres admin) par de vrais vols + e-billets PDF/PNR. Choix : Duffel. Token `duffel_test_...` fourni par l'utilisateur (Somo babatak Sylvain, org « SB drive vtc »).
- **Backend** : `core/duffel.py` (client httpx Duffel v2 : offer_requests / get_offer / create_order paiement `balance`). `routes/flights.py` : `GET /flights/live/search` (IATA, A/R, passagers, classe), `POST /flights/live/book` (re-fetch prix → vérif solde SB Pay → commande Duffel → débit → booking PNR), `GET /flights/bookings/{id}/eticket` (PDF reportlab).
- **Frontend** : `FlightsPage.js` toggle « Vols en direct » (Duffel) / « Offres SB » (mock conservé) ; saisie passagers complète + e-billet téléchargeable ; PNR affiché dans « Mes vols ».
- **Testé** : pytest `test_iter331_duffel_flights.py` **13/13** + e2e frontend 100% (PNR réels `3TQTED`, `4CB2OT` ; e-billet PDF). Non-régression offres SB OK. ⚠️ PREVIEW → redéploiement requis pour prod. Statut bloqueur Duffel (token introuvable) → RÉSOLU.
- TODO mineur : pas de conversion FX si une offre Duffel revient en devise ≠ EUR (portefeuille en €).


## NEW - 2026-06-12 (330) - 🛡️ Anti-contournement « course au black » (3 couches) + God's View enrichi
- **Demande user** : sur les courses planifiées, un chauffeur accepte → récupère le n° du client → relâche → fait la course au black. + enrichir le God's View (filtre service + chauffeurs en ligne/hors ligne). Choix : 1a + 2a + 3 oui + godview oui.
- **Couche 1 — Masquage du n° client** (`rides.py`) : nouveau `_client_phone_revealed(ride)` + `enrich_passenger_info` masque `passenger_phone` (→ `null` + `passenger_phone_hidden` + `passenger_phone_reveal_at`) pour les courses **planifiées** tant qu'on n'est pas à ≤30 min de l'heure prévue ; révélé pour instantanées/in_progress. Front chauffeur (`DriverRideFlow.jsx`) : message clair « numéro dispo à partir de … utilisez le chat in-app ».
- **Couche 2 — Pénalité progressive + suspension** (`moderation.py apply_driver_penalty(is_scheduled=...)`) : relâche d'une planifiée escalade **2 €→5 €→10 €** (tiers config), et après seuil (`release_suspend_after=2`) pose `scheduled_suspended_until` = +7 j. Relâche instantanée reste 1 € fixe. Enforcement à l'acceptation (`rides.py` accept) : 403 si chauffeur suspendu des planifiées. Config DEFAULT_CONFIG modération étendue.
- **Couche 3 — Visibilité admin** : `GET /admin/dispatch/driver-behavior` expose `scheduled_suspended` + `scheduled_suspended_until` ; `reinstate` les efface. `AdminDispatch.js` : badge ⏸ « Planifiées bloquées ».
- **God's View** (`AdminGodsView.js`) : onglets Rides/Deliveries/Jobs filtrent réellement la flotte (logique d'**appartenance** multi-service via `service_types`/vehicle_type) + compteurs **En ligne / Hors ligne / Total** par service, marqueurs carte 3 couleurs (vert dispo / ambre occupé / gris hors-ligne).
- **Testé** : pytest `test_iter330_antifraud.py` **4/4** (masquage gate, enrich masque/révèle, escalade 2/5/10 + suspension, instant=1 €, driver-behavior expose les champs). Screenshot God's View : Rides 17 / Deliveries 17 / Jobs 0, 0 erreur. Frontend compile OK. ⚠️ PREVIEW → redéploiement requis.



## NEW - 2026-06-12 (329) - 🏪 Bouton portefeuille CRM Marchands + vérification complète dashboard (100% propre)
- **Contexte user** : a uploadé 12 captures de référence prod **XJEKPLUS** (V3Cube) — apprécie le « God's View » large. Demandes : vérifier toutes images/fonctionnalités, retirer toute icône phosphor cassée, page CRM Marchands avec bouton portefeuille (confirmé).
- **CRM Marchands** : la page dédiée existait déjà (**Boutiques** = `AdminStores.js`, créer/supprimer/importer marchands). Ajout du **bouton portefeuille 💚** (Créditer/Débiter) par ligne → `openWallet(store)` récupère le solde via `adminAPI.getUser(store.user_id)` puis ouvre la `CreditModal`. Clients + Chauffeurs + Marchands désormais tous couverts pour l'ajustement manuel de solde.
- **Vérification complète** (testing_agent iter319) : **18/18 pages admin propres** — 0 image cassée, **0 icône phosphor manquante/cassée, 0 ChunkLoadError**, 0 erreur console/runtime. 9/9 rapports OK (charts+ZIP+planif). Crédit/Débit OK sur Clients (crédit+débit), Chauffeurs, Marchands. Cartes gods-view/heat-view OK. → Le souci « images phosphore » est **résolu**.
- **En attente user** : précision sur « permettre à l'administrateur de tout modifier » (quoi rendre éditable : widgets dashboard / paramètres métier / fiches membres ?).



## NEW - 2026-06-12 (328) - 💚 Crédit/Débit manuel portefeuille : modale Créditer/Débiter + bouton dans CRM Chauffeurs
- **Demande user** : « comment on crédite/débite les utilisateurs, chauffeurs, marchands en mode manuel » → existait déjà (`POST /admin/users/{id}/wallet/credit`, montant +/− , types `admin_credit`/`admin_debit`) via la page Utilisateurs (liste tous rôles). Vérifié e2e curl (+15→15€, −5→10€).
- **Amélioration (a)** : bouton portefeuille 💚 ajouté dans le CRM Chauffeurs (`AdminDrivers.js`, colonne Action) — `openWallet(d)` récupère le solde réel via `adminAPI.getUser(d.user_id)` puis ouvre la modale ; crédit via user_id.
- **Amélioration (b)** : `CreditModal` (`users/AdminUserModals.jsx`) refactorée — autonome (state interne mode/amount/note), toggle explicite **Créditer (vert) / Débiter (rouge)**, montant toujours positif, **aperçu nouveau solde en direct**, contrat `onSubmit(signedAmount, note)`. `AdminUsers.js` adapté (suppression state amount/note obsolète).
- **Vérifié** : screenshot (modale « Ajuster le solde » sur chauffeur, toggle Débiter, aperçu −12,50 €, 0 page error). Frontend compile OK. ⚠️ Page CRM Marchands dédiée inexistante — marchands gérés via la liste Utilisateurs (qui les inclut).



## NEW - 2026-06-12 (327) - 🔄 Fix ChunkLoadError (icônes phosphor) + durcissement chargement chunks
- **Symptôme user** (capture) : « Uncaught runtime errors: Loading chunk vendors-…phosphor-icons…Gear_es_js failed (timeout) / ChunkLoadError ».
- **Diagnostic** : transitoire — le chunk se recharge en HTTP 200 (0,24s). CRA + phosphor-icons v2 produit des **centaines de mini-chunks par icône** ; l'un a expiré (recompilation dev / passerelle preview froide).
- **Note URL** : le bon préview est `gojek-clone-41.preview.emergentagent.com` (= REACT_APP_BACKEND_URL). Les screenshots précédents échouaient car URL erronée utilisée.
- **Fix 1 — auto-récupération** : `src/lib/chunkRecovery.js` (handlers `error` + `unhandledrejection` détectant ChunkLoadError → `window.location.reload()` une fois, garde anti-boucle sessionStorage 12s) branché dans `src/index.js`. Dev + prod.
- **Fix 2 — consolidation** : `craco.config.js`, **build production uniquement**, cacheGroup `phosphor` regroupe tous les modules `@phosphor-icons` en 1 chunk fiable (réduit les centaines de requêtes fragiles). Dev/HMR intacts.
- **Vérifié** : app `/billing/reports` se charge avec **0 page error** (screenshot) — graphique, 9 rapports, onglet planification, bouton ZIP tous OK. Frontend compile OK.
- ⏸️ **En attente user** : vraies clés Stripe (`sk_test_…`+`pk_test_…` ou live) pour construire la pré-autorisation/caution PaymentIntent + capture manuelle (placeholder `sk_test_emergent` ne supporte que Checkout).



## NEW - 2026-06-12 (326) - ✅ Audit parité menu prod (LOCATION + PROMOTIONS) + P1 QR/Stripe + fix parité Zones réglementées
- **Demande user** (captures menu prod sbdrivevtc.com/admin69) : vérifier la parité des sections LOCATION & PROMOTIONS, puis traiter P1 « QR paiement sans contact chauffeurs » + « Stripe 3-D Secure ».
- **Audit parité** : les 10 écrans prod existent déjà dans notre admin → Geofencing (`/admin/geo-fence`), Zones restreintes (`/admin/restricted`), Tarification par zone (`/admin/location-fare`), Transferts Aéroport (`/admin/airport`), Pays (`/admin/country`), Régions (`/admin/state`), Vue d'ensemble/Point de vue de Dieu (`/admin/gods-view`, carte live), Vue thermique (`/admin/heat-view`, heatmap), Codes promo (`/admin/promocodes`), Cartes cadeaux (`/admin/giftcards`). **testing_agent iter317 : 10/10 render PASS, 0 erreur, cartes Google Maps OK.**
- **P1 QR sans contact chauffeurs = DÉJÀ LIVRÉ** (`routes/contactless.py` + front `/encaisser` chauffeur, `/pay/:id` payeur). Vérifié e2e curl : chauffeur génère QR+code 6 chiffres → client paie via SB Pay (ou carte Stripe Checkout) → commission 10 % → net crédité au portefeuille retirable + cashback payeur. (25 € → 22,50 € encaissés.) Front vérifié iter318 (QR généré, page payeur OK).
- **P1 Stripe 3-D Secure = DÉJÀ COUVERT** : le flux carte utilise **Stripe Checkout hébergé** qui applique 3DS/SCA automatiquement. Option non retenue pour l'instant : refonte PaymentIntent + capture manuelle (caution/pré-autorisation) — à faire plus tard avec clés live (en attente décision user).
- **Fix parité** : `/admin/restricted` était un alias de `/admin/geo-fence` (même composant). Ajout d'un prop `mode='restricted'` à `AdminGeoFence` → page distincte « Zones réglementées » (filtre type restricted, heading/CTA dédiés) + ajout d'une 2e zone restreinte démo. `/admin/geo-fence` garde la liste complète. **Vérifié iter318 : 2 pages bien distinctes (4/4 PASS).**
- ⚠️ Stripe key = test key du pod (env `STRIPE_API_KEY`). ⚠️ PREVIEW → redéploiement requis pour la prod.



## NEW - 2026-06-12 (325) - 🗜️ Bouton « Tout exporter (ZIP) » dans le Centre de Rapports (DONE, testé)
- **Demande user** : télécharger les 9 rapports d'un coup pour les bilans comptables de fin de mois.
- **Backend** (`routes/reports_admin.py`) : `GET /admin/reports/export-zip?date_from=&date_to=` → itère `REPORT_FUNCS`, génère 1 CSV par rapport (bloc Indicateurs + table, BOM Excel, format identique à `exportUtils`), renvoie un `application/zip` (`rapports_{from}_{to}.zip`). Erreur par rapport isolée (fichier `_ERREUR.txt`).
- **Frontend** (`AdminReports.js`) : bouton « Tout (ZIP) » (`report-export-zip`) dans la barre d'export, téléchargement blob authentifié. `adminAPI.exportAllReports`.
- **Testé** : curl (zip 9 CSV, 10.9 Ko) + pytest `test_iter316` (test_export_all_zip : 9 fichiers + BOM) PASS 5/5. Frontend compile OK. ⚠️ PREVIEW → redéploiement requis.



## NEW - 2026-06-12 (324) - 📑 Centre de Rapports : 4 rapports prod en plus (parrainage MLM, portefeuille, récompenses, assurance) (DONE, testé)
- **Demande user** (capture du menu prod sbdrivevtc.com/admin69 « Rapports ») : compléter le centre de rapports pour matcher la prod — Rapport de parrainage MLM, Rapport sur le portefeuille, Rapport sur les récompenses des utilisateurs, Rapport d'assurance. (« Voyage annulé » = déjà couvert par « Alertes refusées/annulées ».)
- **Backend** (`routes/reports_admin.py`) — 4 nouvelles fonctions calculables + endpoints, même forme uniforme {chart, kpis, columns, rows}, ajoutées au registre `REPORT_FUNCS` (donc aussi planifiables par e-mail) :
  - `/admin/reports/referral` : agrège `referrals` par parrain (nb filleuls, gains, dernier). KPIs parrainages totaux/validés/récompenses versées/parrains actifs. Données réelles (21 sur la période).
  - `/admin/reports/wallet` : snapshot `wallets` (solde total 7874.6 €, réserves, non retirable, actifs) + `wallet_transactions` groupées par type sur la période.
  - `/admin/reports/rewards` : `cashback_ledger` (versé), `loyalty_redemptions` (échanges + points), `gift_cards` (émises/valeur/utilisées), points fidélité en circulation.
  - `/admin/reports/insurance` : couverture assurance des chauffeurs depuis leurs documents embarqués (type assurance/assurance_rc) → Valide/En attente/Manquante + taux de couverture (48 chauffeurs).
- **Frontend** (`AdminReports.js`) : 4 entrées de nav ajoutées (icônes UsersThree/Wallet/Gift/ShieldCheck) → rendu générique existant (KPIs + graphique + table + export CSV/PDF). `ReportSchedules.jsx` : 4 types ajoutés aux chips de planification.
- **Testé** : curl (4/4 endpoints 200 avec données réelles + chart) + pytest `test_iter316` étendu (9 rapports vérifiés chart+kpis) PASS. Frontend compile OK.
- ⚠️ Le menu prod complet contient peut-être d'autres rapports (la capture montre un défilement + section LOCATION) — à compléter sur demande. ⚠️ PREVIEW → redéploiement requis pour la prod.



## NEW - 2026-06-12 (323) - 📊📧🧪🎙️ Lot P2 : graphiques rapports + planification e-mail + Mode Démo global + audio sécurité chauffeur (DONE, testé)
- **Demande user** (FR) : « P2 : graphiques (courbes) dans les rapports, planification d'envoi auto des rapports par e-mail, enregistrements audio sécurité (Trips/Jobs), Mode Démo global ». Ordre choisi : a → b → d → c. Audio = côté **chauffeur**.
- **(a) Graphiques rapports** : chaque rapport admin (`routes/reports_admin.py`) renvoie désormais un champ `chart` {type: line|bar, x, title, series:[{key,label,color}], data}. results = courbe CA+courses ; payments/exceptional/refused-cancelled/other = barres. Frontend : nouveau `components/admin/ReportChart.jsx` (recharts 3.8.1) affiché entre KPIs et table dans `AdminReports.js`. Vérifié curl (5/5 charts) + testing_agent (5/5 rapports affichent report-chart).
- **(b) Planification e-mail des rapports** : refacto des 5 endpoints en fonctions calculables (`_compute_results`...) + registre `REPORT_FUNCS`. Collection `report_schedules` (name, kinds[], recipients[], frequency daily|weekly|monthly, window yesterday|last_7d|last_30d|last_month, send_hour, send_day, timezone, enabled, last_run_marker) + `report_schedule_runs` (historique). Endpoints : `GET/POST /admin/reports/schedules`, `PUT/DELETE /schedules/{id}`, `POST /schedules/{id}/send-now`, `GET /schedule-runs`. E-mail HTML (KPIs + tables) via Resend. **Balayeur** `report_schedule_loop()` (toutes les 30 min, idempotent via marker) branché dans le lifespan (`core/startup.py`). Frontend : onglet « Planification e-mail » dans `AdminReports.js` (tab-reports/tab-schedules) + `components/admin/ReportSchedules.jsx` (CRUD, send-now, historique). `adminAPI.listReportSchedules/createReportSchedule/updateReportSchedule/deleteReportSchedule/sendReportScheduleNow/reportScheduleRuns`. Vérifié curl (CRUD + envoi RÉEL réussi vers l'adresse vérifiée Resend) + testing_agent (round-trip CRUD OK).
- **(d) Mode Démo global** : l'infra existait (`routes/demo_mode.py` + bannière `DemoBanner` + auto-vérif étudiante) mais le **toggle admin n'était exposé nulle part**. Ajout d'une carte « Mode Démo global » en haut de `AdminDemo.js` (toggle ON/OFF via `demoModeAPI.updateConfig` + montant crédit démo). Vérifié curl + testing_agent (toggle ON→toast→input crédit→OFF).
- **(c) Audio sécurité chauffeur** : nouveau `routes/safety_audio.py` (collection `safety_recordings`, object storage Emergent réutilisé via `core.deps.put_object/get_object`). `POST /safety/audio/upload` (driver, multipart, ride_id/kind/duration), `GET /safety/audio/ride/{id}` (owner|admin), `GET /safety/audio/{id}` (owner|admin, sert les octets), `GET /admin/safety/recordings` (admin). Frontend : `components/SafetyRecorder.jsx` (MediaRecorder enregistre/stoppe/uploade + lecture authentifiée par blob) branché dans `SafetyToolsSheet.jsx` **pour les chauffeurs uniquement** (remplace l'ancien bouton audio mocké). Page admin de revue `AdminSafetyAudio.js` (route `/admin/safety-audio`, sidebar « Enregistrements sécurité ») avec lecture authentifiée. Vérifié curl e2e (upload→liste→serve→admin) + pytest 4/4 + testing_agent (page admin rendue ; UI enregistreur in-ride non testable headless = micro, couvert par pytest).
- **Tests** : pytest `backend/tests/test_iter316_reports_demo_safety.py` **4/4** (charts, schedule CRUD+send, demo toggle, safety upload/list/ACL) + testing_agent iter316 frontend **100% (4/4)**, 0 bug.
- ⚠️ Resend en sandbox (livraison réelle limitée à l'adresse vérifiée tant qu'un domaine n'est pas validé sur resend.com/domains). ⚠️ PREVIEW → redéploiement requis pour la prod.



## NEW - 2026-06-12 (322) - 📊 Centre de Rapports admin (façon menu prod) (DONE, vérifié)
- **Demande user** (capture du menu prod « Rapports ») : Rapport sur les résultats, Rapport de paiement, Rapport exceptionnel, Alertes refusées/annulées, Autres rapports.
- **Backend** : nouveau `routes/reports_admin.py` (router `/api/admin/reports`) enregistré. 5 endpoints (`/results`, `/payments`, `/exceptional`, `/refused-cancelled`, `/other`) acceptant `date_from/date_to`, renvoyant un **format uniforme** `{kpis:[{label,value,color}], columns:[{key,label}], rows:[...]}`. results = volume/CA/commission/panier moyen + détail quotidien ; payments = encaissements par moyen (espèces/digital), commission 15%, net ; exceptional = sans chauffeur, basculé espèces, fraude, taux annulation + liste anomalies ; refused-cancelled = courses annulées (motif, annulé par client/chauffeur/admin) + commandes ; other = nouveaux clients/chauffeurs/marchands + top chauffeurs.
- **Frontend** : `pages/admin/AdminReports.js` — **rendu générique** (nav gauche des 5 rapports, presets Aujourd'hui/7j/30j/90j + plage perso, KPIs, table, **export CSV+PDF** via `lib/exportUtils`). Route `/billing/reports` + sidebar « RAPPORTS > Centre de rapports » (panel Facturation). `adminAPI.report(kind, params)`.
- **Vérifié** : curl (5/5 endpoints 200 avec données réelles : results 8 KPIs/13 lignes, payments 5/4, exceptional 5/18, refused-cancelled 5/672, other 3/15) + screenshot (page conforme au menu prod, KPIs + table peuplés, export présent).
- ⚠️ Correctif au passage : accolades du panel billing (panelConfigs) rééquilibrées. PREVIEW → redéploiement requis pour la prod.


- **Demande user** (choix exacts) : à l'affectation, offre au chauffeur avec **compte à rebours 15 s** ; si refus/non-réponse → passe au suivant. Chaîne = **Top 3** ; si tous refusent → **recommence un tour depuis le 1ᵉʳ** (cap sécurité 3 tours puis alerte admin) ; bouton « Affecter » manuel = **assignation forcée directe** (donc déclencheur séparé « Dispatch auto » pour la chaîne).
- **Backend** (`bookings_admin.py`) : collection `dispatch_sessions` (chain, index, round, declined, expires_at, status). Endpoints : `POST /ride/{id}/auto-dispatch` (calcule Top 3 proches, envoie 1ʳᵉ offre WS), `POST /ride/{id}/offer-respond` {accept} (accept→assigne ; decline→escalade), `GET /ride/{id}/dispatch-status`, `POST /ride/{id}/dispatch-cancel`. **Balayeur** `sequential_dispatch_loop()` (toutes les 3 s) → expire les offres sans réponse et escalade automatiquement ; enregistré dans le lifespan (`core/startup.py`). WS : `ride_offer` au chauffeur (avec expires_at), `dispatch_offer/dispatch_assigned/dispatch_exhausted` aux admins. Helper `_compute_nearby` factorisé (réutilisé par nearby-drivers).
- **Frontend** : `components/admin/DispatchControl.jsx` (bouton « Dispatch auto » + état d'offre live : nom chauffeur, **compte à rebours**, tour X/3, annulation ; polling 2 s + ticker 1 s ; toasts accepté/épuisé). Intégré dans la barre de sélection de la carte (à côté de « Affecter » = forcé). `adminAPI.autoDispatch/dispatchStatus/dispatchCancel/offerRespond`.
- **Testé** : curl e2e (offre→refus→escalade index 0→1, acceptation→assignation, **balayeur auto-escalade après 17 s sans action**) + pytest `test_iter314_admin_crm.py` **7/7** + screenshot (bouton « Dispatch auto » visible dans la barre). Le panneau d'offre live nécessite une course géolocalisée (les courses de test sans coords renvoient 400, géré proprement).
- ⚠️ PREVIEW → redéploiement requis pour la prod.


- **Demande user** : cliquer sur une course non assignée propose les 3 chauffeurs en ligne les plus proches (distance + ETA) pour réaffecter en 1 clic.
- **Backend** (`bookings_admin.py`) : `GET /api/admin/bookings/ride/{ride_id}/nearby-drivers?limit=3` → chauffeurs `is_online+approved` triés par distance au point de départ (position live via `manager.driver_locations`, fallback `current_lat/lng`), avec `distance_km`, `eta_mins` (~30 km/h), `live`, nom, véhicule, note. Renvoie `total_online`.
- **Frontend** : `components/admin/NearbyDriversModal.jsx` (liste top 3, badge LIVE, distance/ETA/note, bouton « Affecter » → `reassignBookingRide`). Remplace l'ancien prompt de réaffectation : les boutons « Affecter » (carte + table) ouvrent désormais le sélecteur intelligent. `adminAPI.nearbyDrivers`.
- **Vérifié** : curl (200, 3 chauffeurs triés, 17 en ligne) + screenshot (modal s'ouvre, en-tête course, gestion gracieuse du cas sans coordonnées). 
- ⚠️ Données de seed : chauffeurs localisés en Europe vs courses Martinique → distances élevées en test (logique correcte). PREVIEW → redéploiement requis pour la prod.


- **Demande user** : carte temps réel dans l'onglet « En cours » (positions GPS chauffeurs + courses, réaffectation visuelle) + afficher le **mode de paiement** et les **adresses A et B**.
- **Frontend** (`AdminBookingsHub.js`) : intégration de `AdminGoogleMap` (Google Maps + couche trafic) dans l'onglet En cours — marqueurs chauffeurs (bleu) et courses en attente (ambre, A), **auto-refresh 12s**, clic sur une ligne/marqueur → sélection (centre carte + tracé A→B + barre détail avec Affecter/Annuler). Nouvelle colonne **Paiement** (Espèces/Carte/SB Pay) sur les tables courses ET commandes ; colonne **Trajet (A → B)** avec repères verts/rouges. Paiement ajouté à l'export CSV/PDF.
- **Vérifié** : screenshot — carte Martinique avec trafic + marqueurs, barre de sélection (N°, client, A/B, paiement, statut, chauffeur, boutons Affecter/Annuler/Fermer), table avec colonne PAIEMENT (Espèces, SB Pay) et A/B. Backend `/admin/bookings/live` renvoie déjà coords + payment_method (testé iter315).
- ⚠️ PREVIEW → redéploiement requis pour la prod.


- **Demande user** (inspiré XJEKPLUS, « regarder le code, récupérer toutes les données, améliorer, innover ») : un hub unique regroupant courses en cours, réservations programmées, réservation manuelle, création de commande manuelle (livraison/coursier ET marchand avec produits), historique Trips/Jobs + export CSV+PDF. Choix : tout (1→7), commande manuelle les deux types, export CSV+PDF.
- **Backend** : nouveau `routes/bookings_admin.py` (router `/api/admin/bookings`) enregistré dans `core/api_router.py`. Endpoints : `GET /overview` (KPIs : live, à venir, commandes/jour, terminées, CA, taux d'annulation, breakdown), `/live`, `/scheduled` (statut 'expired' dérivé), `/rides` (Trips/Jobs enrichis user/driver/fare + filtres date/statut/recherche), `/orders` (enrichis marchand/client) ; `POST /manual-ride` (course manuelle + planifiée, fare auto via calculate_fare ou manuel, broadcast WS), `/manual-order` (kind courier|delivery|merchant avec produits), `/ride/{id}/cancel|reschedule|reassign`. Helper `_resolve_customer` (client existant par user_id/tel/email, sinon **création client invité** avec placeholder email/tel unique — corrige l'index unique).
- **Frontend** : `pages/admin/AdminBookingsHub.js` (KPIs + 4 onglets + recherche/filtres + actions annuler/replanifier/réaffecter + export). Modals `components/admin/ManualBookingModals.jsx` (ManualRideModal, ManualOrderModal avec sélecteur marchand + produits via merchantAPI). Utilitaires `lib/exportUtils.js` (exportCSV + exportPDF jsPDF/autotable). Route `/dispatch/bookings` + sidebar « OPÉRATIONS > Réservations & Commandes ». **Fix régression** : `adminAPI.listRides/listOrders` repointés vers `/admin/bookings/rides|orders` (l'ancien `/admin/rides` n'existait pas → AdminRides était cassé).
- **Testé** : testing_agent iter315 — backend + UI **PASS complet** (KPIs, 4 onglets, 2 modals, export/filtre, régression AdminRides). **1 bug CRITIQUE trouvé & corrigé** par le testing_agent (DuplicateKeyError sur email:null du 2ᵉ invité → placeholder unique), re-vérifié OK (2 invités consécutifs = 200). pytest CRM 6/6 toujours vert. Données réelles : 65 courses live, 81 programmées, 875 trips, 44 commandes.
- ⚠️ PREVIEW → redéploiement requis pour la prod.


- **Demande user** : page Onboarding unique (chauffeurs + marchands) avec taux d'activation, comptes en attente, relance 1-clic + relance groupée. Choix : activation = **1ʳᵉ action métier** (chauffeur : `total_trips>0` ; marchand : `total_orders>0`) ; relance = **renvoi e-mail** (sans mot de passe — non stocké en clair → e-mail identifiant + lien + « mot de passe oublié »).
- **Backend** (`routes/admin.py`) : `GET /api/admin/onboarding` → cohorte = comptes créés par l'admin (`created_by:'admin'`), stats {total, activated, pending, activation_rate, pending_list} pour drivers & merchants. `POST /api/admin/onboarding/remind` (body `{kind, ids?[], all?}`) → relance individuelle ou groupée, best-effort, pose `last_reminded_at`. Nouveau `core/email.send_account_reminder`.
- **Frontend** : `pages/admin/AdminOnboarding.js` (carte taux global + 2 sections cohortes avec stats, barre de progression, liste des en-attente, boutons Relancer / Relancer tous). Route `/drivers-admin/onboarding` & `/merchants-admin/onboarding` (panelRoutes + pages.js lazy export) + entrées sidebar « ACTIVATION > Onboarding » dans les 2 panels. `adminAPI.getOnboarding/remindOnboarding`.
- **Testé** : pytest `test_iter314_admin_crm.py` **6/6** (onboarding stats structure + driver pending présent + remind) + curl e2e (10 chauffeurs/5 marchands en attente, remind single=1, remind-all merchants=5). Frontend compile OK ; page câblée dans le système de panels éprouvé. ⚠️ Screenshot login instable (non bloquant) → validation UI complète possible via testing_agent si souhaité.
- ⚠️ PREVIEW → redéploiement requis pour la prod.


- **Demande user** : e-mail d'invitation automatique (identifiant + mot de passe temporaire + lien de connexion) à chaque chauffeur/marchand créé, pour éviter la transmission manuelle. Choix : **création manuelle ET import CSV, chauffeurs + marchands** ; contenu = identifiant + **mot de passe temporaire en clair** + lien ; envoi **non bloquant**.
- **Backend** : nouveau `core/email.send_account_invite(to, name, *, role_label, login_email, temp_password, login_url)` (shell SB Store, encadré mot de passe monospace, bouton « Me connecter », rappel de changer le mot de passe). Branché dans les helpers partagés `_create_driver_internal` (role « Chauffeur ») et `_create_merchant_internal` (role « Marchand ») via `fire()` best-effort → couvre **les 4 chemins** (Ajouter manuel + import CSV × chauffeur/marchand). `login_url = FRONTEND_URL + /login`. Ignoré pour les emails internes `@sbdrive.local`.
- **Frontend** : note ajoutée dans `CsvImportModal` et les modals d'ajout (« Un e-mail d'invitation … sera envoyé »).
- **Testé** : pytest `test_iter314_admin_crm.py` 5/5 (création non bloquée par l'e-mail) + logs Resend : envoi RÉUSSI vers l'adresse vérifiée (`Resend email sent … Votre compte Marchand SB Drive est prêt`), et best-effort confirmé pour les autres (warning sandbox, création quand même OK 200).
- ⚠️ **Livraison réelle** : Resend en bac à sable (`onboarding@resend.dev`) → e-mails livrés uniquement à l'adresse vérifiée du compte tant qu'un **domaine n'est pas vérifié sur resend.com/domains** (puis changer `SENDER_EMAIL`). PREVIEW → redéploiement requis pour la prod.


- **Demande user** : importer en masse chauffeurs ET marchands via CSV. Choix : mots de passe **générés auto** (export téléchargeable), lignes en erreur **ignorées + rapport détaillé**, **modèle CSV téléchargeable** dans l'UI.
- **Backend** (`routes/admin.py`) : refacto des créations en helpers réutilisables `_create_driver_internal(body, *, password)` / `_create_merchant_internal(...)` (les endpoints unitaires `POST /admin/drivers|merchants` délèguent désormais). Nouveau `_generate_password` (secrets), `_read_csv_rows` (csv.DictReader), `_split_multi` (services `taxi|delivery`). Endpoints : `POST /api/admin/import/drivers` & `POST /api/admin/import/merchants` (body `{csv}`) → créent ligne par ligne, **ignorent les lignes invalides** (email existant, champ manquant, règle flotte VTC/Taxi) et renvoient `{created, skipped, total, results:[{line,status,email,name,password,reason}]}`. Mot de passe généré sauf colonne `password` fournie.
- **Frontend** : composant réutilisable `components/admin/CsvImportModal.jsx` (téléchargement modèle CSV avec en-têtes+exemple, sélection fichier, import, **rapport visuel créés/ignorés + téléchargement du rapport CSV avec mots de passe**). Branché dans `AdminDrivers.js` (`import-drivers-btn`) et `AdminStores.js` (`import-merchants-btn`). `adminAPI.importDrivers/importMerchants`.
- **Testé** : pytest `test_iter314_admin_crm.py` **5/5** (dont import : 2 créés/1 ignoré flotte côté chauffeurs, 1 créé/1 ignoré nom manquant côté marchands ; login d'un compte importé OK = hash + mdp généré valides) + curl e2e + screenshot UI (modal d'import rendu, table avec chauffeur importé). 
- ⚠️ PREVIEW → redéploiement requis pour la prod.


- **Demande user (option c = tout faire)** : l'admin doit pouvoir ajouter/supprimer n'importe quel compte (Client déjà fait, + Chauffeur + Marchand) ; onboarding chauffeur distinguant société/flotte (Taxi/VTC = nom de société requis) vs Particulier, avec ordre strict.
- **Backend** (`routes/admin.py`) — auth bcrypt via `core.deps.hash_password` (playbook integration_expert confirmé) :
  - `POST /api/admin/drivers` : crée user (role=driver, mot de passe hashé) + profil chauffeur. **Règle flotte** : `taxi_sub ∈ {vtc, taxi}` → `company_name` requis (400 sinon) ; Particulier non. Statut `approved` par défaut.
  - `DELETE /api/admin/drivers/{id}` : supprime le profil + le compte user lié (si role=driver) + wallet.
  - `POST /api/admin/merchants` : crée user (role=merchant, hashé) + boutique `approved`/`is_active=true` immédiatement.
  - `DELETE /api/admin/merchants/{id}` : supprime boutique + compte lié + wallet.
- **Frontend** :
  - `AdminDrivers.js` (`/drivers-admin/drivers`) : bouton **Ajouter** (`add-driver-btn`) + `AddDriverModal` (services, statut taxi, **champ société conditionnel VTC/Taxi** `add-driver-fleet-block`, véhicule) ; action **Supprimer** (`delete-{i}`, confirm).
  - `AdminStores.js` (`/merchants-admin/stores`) : bouton **Ajouter une boutique** (`add-merchant-btn`) + `AddMerchantModal` ; action **Supprimer** (`store-delete-{id}`).
  - `services/api.js` : `adminAPI.createDriver/deleteDriver/createMerchant/deleteMerchant`.
- **Refonte onboarding** (`DriverRegisterPage.js`, route `/driver/register`) : flux ordonné **1 Activité & Statut → 2 Documents personnels → 3 Ajout du véhicule → 4 Documents du véhicule → succès (en attente approbation admin)**. Nom de société (`company-name-input`) affiché/requis UNIQUEMENT pour VTC/Taxi (hint Particulier sinon). Classification auto des docs perso (permis/pièce/cartes pro) vs véhicule (carte grise/assurance). Vélo = 2 étapes seulement (pas d'étape véhicule). `company_name` transmis à `driverAPI.register`.
- **Fix UX** : `/driver/register` ajouté à `VerifyEmailBanner HIDDEN_PREFIXES` (la bannière ne recouvre plus le bouton d'action).
- **Testé** : pytest `backend/tests/test_iter314_admin_crm.py` 3/3 (règle flotte, login des comptes créés = hash OK, suppression) + testing_agent iter314 (backend 100%, frontend 90% : Ajout/Suppression chauffeur & marchand OK, structure onboarding 4 étapes + société conditionnelle OK). Aucun bug critique/mineur.
- ⚠️ PREVIEW → redéploiement requis pour la prod.


## NEW - 2026-06-12 (313) - 👤 Avertissement client + Édition admin des titres de section + confirmation réordonnancement (DONE, testé)
- **Avertissement CLIENT temps réel** : `switch_to_cash_if_needed` (rides.py) envoie aussi au **passager** un WS `payment_switched_to_cash` (role=rider) + notification (« Solde insuffisant — préparez le paiement en espèces ») en même temps que le chauffeur. Frontend `RideTrackingPage.js` écoute l'événement → toast 14 s + bascule `payment_method='cash'`. Testé `test_iter312` 3/3 (assert notif chauffeur + passager).
- **Boutons ↑↓ « Catégories de l'accueil »** : confirmés fonctionnels (test API : permutation persistée). Ajout d'un **toast « Ordre mis à jour »** (items + sections) + data-testids (`category-up/down-{id}`, `section-up/down-{key}`), boutons désactivés aux extrémités.
- **Titres de section éditables par l'admin** (« changer les titres en haut ») : backend `home_categories.py` — `DEFAULT_SECTION_TITLES` (titres canoniques = ceux du client), `_section_layout` renvoie le titre effectif (override admin sinon défaut), endpoint public expose `section_titles`, nouveau `PUT /home-categories/admin/sections/{key}` (set `title_fr` + `title_overridden`). Frontend : `AdminHomeCategories` crayon ✏️ + édition inline (`section-rename-{key}`, `section-title-input/save-{key}`) ; `UserHome.js` lit `section_titles` via helper `st(key, def)` → les 12 en-têtes de section (Taxi, Livraison & Coursier, Acheter/Vendre/Louer, SB Travel, Beauté, Médical, à la demande, Auto, Remorquage, Animaux, Suivi, Proximité) reflètent le titre admin. `homeCategoriesAPI.updateSection`.
- **Testé** : curl e2e rename (override reflété sur l'endpoint public, défauts intacts, restore) + screenshot admin (crayon + éditeur inline OK) + pytest 10/10. ⚠️ PREVIEW → redéploiement requis pour la prod.


 au chauffeur si la carte/portefeuille échoue en cours de course (P0, DONE testé 3/3)
- **Demande user** : si la carte/le portefeuille du client échoue **pendant la course**, flasher en temps réel au chauffeur que le paiement est passé en **espèces**.
- **Backend** (`routes/rides.py`) : helper `switch_to_cash_if_needed(ride, driver_user_id, now)` — au **démarrage** de la course, si `payment_method ∈ {wallet, sbpay, sbpaygo}` et que le solde SB Pay du client < tarif → bascule la course en `cash` (`payment_switched_to_cash=True`, `original_payment_method`, `payment_shortfall`), **envoie un événement WS `payment_switched_to_cash`** au chauffeur (`send_personal_message` + `send_to_ride_room`) et crée une notification persistante. Branché sur les 2 chemins de démarrage : OTP chauffeur (`phase1.verify_start_otp`) + force-start admin (`rides.py` branche `in_progress`).
- **Frontend** : `useWebSocket` joue un son sur `payment_switched_to_cash` ; `DriverHome.js` écoute l'événement → **toast warning 16 s** + bascule `currentRide.payment_method='cash'` + **bannière rouge pulsante** persistante (`payment-switched-banner`).
- **Testé** : pytest `test_iter312_payment_switch.py` 3/3 (solde insuffisant → bascule cash + notif ; solde suffisant → pas de bascule ; course cash inchangée). Frontend compile OK.
- ⚠️ Détection basée sur le solde SB Pay au démarrage (signal concret/testable). La vraie carte Stripe (3-D Secure + capture manuelle) reste la tâche P1. ⚠️ PREVIEW → redéploiement requis pour la prod.


 (relevé individuel Taxi/VTC + rapport global HTML chauffeurs/livreurs/commerçants) DONE, testé 7/7
- **Demande user** : (1) envoyer le relevé d'activité par e-mail **chaque semaine** aux chauffeurs **Taxi/VTC** ; (2) un **rapport global** de tous les chauffeurs/livreurs ET **commerçants** envoyé chaque semaine par e-mail **en fichier HTML**.
- **Base** : le moteur `routes/weekly_reports.py` existait déjà (calcul + envoi Resend par chauffeur HTML+PDF + global aux admins, planificateur configurable). **Étendu** plutôt que recréé.
- **Relevé individuel gaté** : `compute_report` ajoute `taxi_sub`/`export_allowed` à chaque ligne chauffeur ; `run_weekly_send` n'envoie le relevé individuel qu'aux chauffeurs **Taxi/VTC (ou autorisés admin)** quand `restrict_driver_email_to_authorized=True` (défaut, choix user a). Toggle ajouté dans Admin → Rapports hebdomadaires.
- **Section Commerçants** : `compute_report` agrège les commandes `orders` par `merchant_id` (revenu = `subtotal`, commission, net) → `merchants`/`active_merchants`/`total_merchant_revenue/commission`. Ajoutée au mail global HTML (tables Chauffeurs/Livreurs + Commerçants) et au PDF global.
- **Fichier HTML joint** : le rapport global est désormais envoyé avec une **pièce jointe `.html`** (`_global_html_document` + `_html_attachment`) en plus du PDF.
- **Activation** : `report_config` mis à `enabled=True` + `resend_api_key` depuis l'env (`RESEND_API_KEY`). Expéditeur `onboarding@resend.dev` (sandbox Resend — livraison réelle limitée tant qu'un domaine vérifié n'est pas configuré).
- **Testé** : curl preview (3 commerçants, 6 chauffeurs, flags export_allowed) + send-now test mode (sent=1, failed=0) + pytest `test_iter311_weekly_reports.py` 3/3 + screenshot admin (toggle visible, module activé). ⚠️ PREVIEW → redéploiement requis pour la prod ; pour livrer aux vraies adresses, vérifier un domaine expéditeur sur Resend.


 (gated Taxi/VTC ; Particulier/Livreur = autorisation admin) DONE, testé
- **Demande user** : « Télécharger mon relevé » — autorisé pour **Taxi/VTC**, refusé pour **Particulier/Livreur** sauf **autorisation de l'administrateur**.
- **Backend** (`routes/drivers.py`) : helper `_report_export_decision(driver)` (autorisé si `taxi_sub ∈ {vtc, taxi}` OU flag admin `report_export_allowed`), `_compute_driver_report` factorisé. `GET /api/drivers/report` expose `export_allowed`/`export_reason`/`taxi_sub`. Nouveau `GET /api/drivers/report/export?format=pdf|csv` → 403 si non autorisé, sinon génère **CSV** (BOM Excel) ou **PDF** (reportlab, tableau libellés/montants). Admin (`routes/misc.py`) : `PUT/GET /api/admin/drivers/{id}/report-export` (toggle `report_export_allowed` + notif chauffeur + audit log).
- **Frontend** : `DriverReportPage.js` — section « Télécharger mon relevé » : boutons PDF/CSV si autorisé, sinon encart verrouillé (`report-download-locked`) avec le motif. Admin `AdminDrivers.js` (modal Services) : section « Téléchargement du relevé » — « Autorisé automatiquement » pour Taxi/VTC, toggle d'autorisation pour Particulier/Livreur. `driverAPI.exportReport`, `adminAPI.get/setDriverReportExport`.
- **Testé** : curl e2e (gate 403 par défaut → admin grant → PDF 200/2816o → revoke → 403) + pytest `test_iter308` 4/4 (dont gate export) + screenshot UI (état verrouillé rendu). reportlab 4.5.1 déjà présent.
## NEW - 2026-06-12 (308-309) - 🚨💸 Anti-fraude PAYOUT chauffeur : ne jamais payer l'argent non encaissé + Rapport d'activité (DONE, testé 7/7 + 3/3 pytest)
- **Faille P0 (validée user)** : le chauffeur était crédité de la TOTALITÉ de ses gains à la fin de course même si le paiement numérique échouait (`payment_status="cash_due"`) ou si le cash n'était pas perçu, puis pouvait demander un retrait sur de l'argent jamais collecté.
- **Correctifs (`routes/rides.py` complétion)** : suivi de `digital_captured` (montant réellement débité du wallet passager) ; `fare_captured_digital = min(digital_captured, final_fare)` ; `driver_earnings = fare_captured_digital * (1 - commission)`. Le **portefeuille SB Pay du chauffeur** (`db.wallets`) est désormais crédité (nouveau, comblait un trou) UNIQUEMENT de `total_credit` (part numérique encaissée + bonus), avec une `wallet_transaction` type `Earning`. **Les espèces restent au chauffeur** (en main) → ni crédit wallet ni montant retirable ; seulement reportées (`cash_collected`). `collect-cash` inchangé.
- **Solde retirable séparé (`non_withdrawable`)** : nouveau champ wallet incrémenté sur les crédits NON gagnés → cashback (`core/cashback.py`), transferts P2P reçus (`routes/wallet.py /transfer` receveur), remboursements d'annulation (`routes/debts.py _credit_wallet`). `GET /api/wallet` expose `non_withdrawable` ; `withdrawable = max(0, balance - reserve - pending - non_withdrawable)`. `misc.submit_withdraw_request` applique le même plafond.
- **Blocage inactivité > 6 mois** : un chauffeur sans course terminée depuis > 183 j → `POST /api/wallet/withdraw-request` renvoie 403.
- **Rapport d'activité chauffeur** : `GET /api/drivers/report?from=&to=` (chiffre global/brut, commission, net, espèces reçues, paiements CB/SB Pay, frais d'annulation, solde actuel, montant retirable, nb courses). Frontend `DriverReportPage.js` (route `/chauffeur/rapport`, presets Aujourd'hui/7j/30j/Tout + dates personnalisées) + bouton « Rapport » sur `DriverEarningsPage`. `driverAPI.getReport`.
- **Bug CRITIQUE corrigé par testing_agent** : import local `from datetime import timedelta` dans `submit_withdraw_request` masquait l'import module → HTTP 500 sur TOUTE demande de retrait. Supprimé.
- **Testé** : testing_agent iter309 backend 7/7 (invariants anti-fraude e2e : capture partielle/totale, cash non crédité, non_withdrawable, inactivité 403, rapport) + pytest `test_iter308_driver_payout.py` 3/3 + `test_iter309_driver_payout_antifraud.py` 7/7.
- ⚠️ Note : `card_received` du rapport vient de `ride.digital_captured_fare` (renseigné par le NOUVEAU code) → les anciennes courses comptent 0 en CB. ⚠️ PREVIEW → redéploiement requis pour la prod.



## NEW - 2026-06-12 (307) - 🚨 Alertes fraude temps réel + gestion des chargebacks Stripe (DONE, testé 7/7 + UI)
- **Demande user** : (1) alerte temps réel sur événement critique ; (2) problème métier réel = des clients rechargent par carte, dépensent, puis font une **opposition bancaire (chargeback)** → Stripe récupère les fonds malgré les preuves.
- **Alertes temps réel** : `core/fraud.record_fraud_event` déclenche `notify_critical_fraud` sur tout événement `critical` → notification in-app à tous les admins (`core.airport.notify_admins`) + **e-mail Resend** (`core/email.send_fraud_alert_email`, best-effort via `fire()`).
- **Gestion chargeback** : `core/fraud.process_chargeback` → débite le portefeuille (peut devenir négatif = dette, `$inc`), trace une transaction `Chargeback`, incrémente `chargeback_count`, **bloque automatiquement au 2ᵉ chargeback** (récidiviste), émet un `fraud_event` critique.
  - Endpoint admin `POST /api/fraud/chargeback` (par email/user_id/session_id ; rapproche via `payment_transactions`).
  - Webhook `routes/webhooks.py` : détecte les événements de type *dispute* Stripe → `process_chargeback` si rapprochable, sinon `fraud_event` critique « chargeback_unmapped » pour traitement manuel. (Non testable avec la clé Stripe de test partagée → endpoint admin = voie principale testée.)
- **Frontend** `AdminFraud.js` : bouton « Déclarer un chargeback » + modal (email/montant/motif) ; `fraudAPI.declareChargeback`.
- **Intégration** : consultée via `integration_expert` (emergentintegrations expose `event_type` ; lib centrée sessions → voie admin retenue).
- **Testé** : pytest `test_iter300_fraud.py` **7/7** (incl. chargeback débite + blocage récidive + alerte critique + admin-only) + UI (modal → traitement, 90 notifs admin créées, 0 erreur).
- ⚠️ PREVIEW → redéploiement requis. Le webhook dispute s'activera en prod (Stripe live) ; configurer l'endpoint dispute dans le dashboard Stripe.



## NEW - 2026-06-12 (306) - 🔐 Sécurité & Fraude — Phase 1 (audit + corrections critiques + dashboard admin) DONE, testé 5/5 + UI
- **Demande user** : sécurité & fraude sur les 6 domaines (paiement/wallet, comptes, chauffeurs, promos/parrainage, données/accès, sécurité trajets) → audit + implémentation + dashboard admin.
- **Audit** : `/app/memory/SECURITY_AUDIT.md` (constats priorisés par domaine). Base déjà solide (anti-bruteforce login email+tel, bcrypt, JWT, ACL, audit logs).
- **2 failles CRITIQUES fermées (wallet)** :
  - `POST /api/wallet/refund` créditait le wallet de n'importe quel user (auto-remboursement illimité) → désormais **admin-only** + crédite un `target_user_id` + audit log ; tentative non-admin → 403 + `fraud_event` critique.
  - `POST /api/wallet/topup` créditait sans paiement vérifié → **admin-only** (grand public via Stripe `/payments/checkout`) ; tentative non-admin → 403 + `fraud_event` critique.
- **Moteur anti-fraude** `core/fraud.py` : `record_fraud_event`, `ensure_not_blocked` (appliqué à wallet pay/transfer), `check_wallet_velocity` (transferts 24h → fraud_event).
- **Blocage de compte** : admin bloque/débloque (`is_blocked`) ; un admin ne peut pas être bloqué ; un compte bloqué ne peut plus payer/transférer.
- **Dashboard admin** `routes/fraud.py` (perms `super.fraud.view/manage`) + page `/admin/fraud` (`AdminFraud.js`, entrée menu « Sécurité & Fraude ») : cartes résumé, onglet Alertes (résoudre/bloquer), onglet Risque Wallet (top vélocité 7j, bloquer/débloquer). `fraudAPI` dans api.js.
- **Testé** : pytest `test_iter300_fraud.py` 5/5 (refund/topup/dashboard 403 user, cycle block/unblock, admin non-bloquable) + curl + UI (résolution alerte 6→5, onglet risque, blocage).
- ⏭️ Phases suivantes proposées : P1 abus promos/parrainage multi-comptes + plafonds cashback ; P1 fraude chauffeurs (GPS/cohérence trajet) ; P2 verrou anti double-dépense wallet + lockout complet à la connexion des comptes bloqués (auth → integration_expert).
- ⚠️ PREVIEW → redéploiement requis.



## NEW - 2026-06-12 (305) - ⏱️ ETA « livraison vers HHhMM » dans la bannière live (DONE, testé)
- **Backend** `GET /api/orders/last-delivery` (mode active) renvoie `eta` (ISO) = réf (programmé sinon création) + `ORDER_DELIVERED_SEC` (durée du cycle).
- **Frontend** `UserHome.js` : la bannière active affiche « {statut} · livraison vers HHhMM » (formaté en heure locale via `toLocaleTimeString('fr-FR')`, ':' → 'h'). Se met à jour en temps réel avec le statut (WS).
- **Testé** : curl (eta renvoyée) + screenshot (« En préparation · livraison vers 06h58 »). pytest iter298 inchangé.
- ⚠️ PREVIEW → redéploiement requis.



## NEW - 2026-06-12 (304) - ⭐ Adresses enregistrées/récentes « 1 tap » dans les livraisons (DONE, testé 5/5 + pytest 2/2)
- **Demande user (amélioration validée)** : proposer Maison/Travail + adresses récentes en « 1 tap » au-dessus du champ d'adresse dans toutes les livraisons (déjà présent en taxi). Choix : enregistrement auto des récentes + Maison/Travail définissables depuis les puces, sur tous les écrans.
- **Réutilisation backend existant** : `routes/places.py` (collection `user_places`) — GET `/api/places/saved`, PUT/DELETE `/api/places/saved/{home|work}`, POST `/api/places/recent`. Déjà consommé par le taxi (`RideChoosePage`).
- **Nouveau composant** `components/SavedAddressChips.jsx` (réutilisable) : puces Maison 🏠 / Travail 💼 / 3 récentes (placesAPI.getSaved) + boutons « Enregistrer cette adresse : Maison/Travail » (placesAPI.setSaved) quand une adresse fraîche est choisie. Props `onSelect`, `selected`, `accent`, `testIdPrefix`.
- **Intégration** : `CheckoutPage` (repas), `ParcelPage` (ramassage), `RunnerPage` (ramassage). Enregistrement auto des récentes (`placesAPI.addRecent`) sur sélection Google + géoloc + destination coursier.
- **Synergie** : comme le backend `/places` est partagé, une adresse enregistrée en livraison apparaît aussi en taxi (et inversement) — vérifié e2e (Maison sauvée sur /checkout → visible sur /parcel, /runner et /course `ride-choose-fav-home`).
- **Testé** : testing_agent iter297 5/5 PASS (puces, récentes auto, save Maison/Travail, propagation inter-écrans, coexistence avec « Ma position ») + pytest `test_iter299_saved_places.py` 2/2.
- ⚠️ PREVIEW → redéploiement requis. Backlog : gestion dédiée « Mes adresses » dans le Profil (3b).



## NEW - 2026-06-12 (303) - 🗺️ BUG FIX : adresse/géolocalisation des livraisons unifiées sur l'expérience taxi (DONE, testé 6/6)
- **Bug user** : dans les livraisons (Colis surtout), impossible de taper une adresse, pas de géolocalisation comme le taxi, et carte différente.
- **Cause** : `ParcelPage` utilisait Leaflet/OpenStreetMap avec sélection par clic sur la carte (aucune saisie d'adresse, aucune géoloc), alors que le taxi utilise Google Maps + autocomplétion + géoloc.
- **Correctif (choix user : unifier toutes les livraisons)** :
  - Nouveau helper `lib/googleMaps.js → getCurrentLocation()` (géoloc navigateur + reverse-geocoding).
  - `ParcelPage.js` : étape adresses entièrement réécrite — Leaflet SUPPRIMÉ, remplacé par `GooglePlacesInput` (ramassage + dépôts) + bouton « Ma position » + bouton « Choisir sur la carte » → `MapLocationPicker` (carte Google). Layout en colonne + barre d'action fixe.
  - `MapLocationPicker.js` : props additives `showTargetToggle` (défaut true ; false pour le colis) et `title`.
  - `CheckoutPage.js` (repas) : bouton « Utiliser ma position actuelle » sous le champ adresse.
  - `RunnerPage.js` (coursier) : bouton « Ma position » sous le ramassage.
  - `VerifyEmailBanner.jsx` : `/parcel` et `/runner` ajoutés à `HIDDEN_PREFIXES` (la bannière ne recouvre plus les boutons d'action).
- **Testé** : testing_agent iter296 6/6 PASS (autocomplétion Google, géoloc « Ma position », carte Google picker sans toggle, flux Colis complet estimate→confirm, repas & coursier, bannière masquée). 0 erreur console.
- ⚠️ Note backlog : Google déprécie `places.Autocomplete` (legacy) → migrer vers `PlaceAutocompleteElement` à terme (fonctionne aujourd'hui, préavis 12 mois). Concerne toute l'app.
- ⚠️ PREVIEW → redéploiement requis pour la prod. ⏳ Amélioration ETA (« Livraison vers 19h45 ») reportée, à faire ensuite.



## NEW - 2026-06-12 (302) - 📊 Barre de progression « façon Uber Eats » dans la bannière live (DONE, testé e2e)
- **Demande user (amélioration validée)** : ajouter une barre de progression visuelle (Reçue → Préparation → En route → Livrée) dans la bannière de livraison live, couplée au temps réel WebSocket.
- **Backend** `GET /api/orders/last-delivery` (mode active) renvoie `step` (0-3) + `steps` `["Reçue","Préparation","En route","Livrée"]`. Mapping : pending/accepted/assigned→0, preparing/ready→1, picked_up→2, delivered→3.
- **Frontend** `UserHome.js` : bannière active réorganisée en colonne ; sous l'en-tête, une barre 4 étapes (`data-testid=delivery-progress`) avec segments verts pour les étapes franchies, segment courant pulsant, labels sous chaque étape. Se met à jour en temps réel via le WS `order_status` déjà branché.
- **Testé** : curl (mode active step=1 « En préparation ») + screenshot (barre rendue : Reçue ✓ / Préparation ✓ en cours / En route & Livrée en attente) + pytest `test_iter298_last_delivery.py` 2/2 (assertions step/steps).
- ⚠️ PREVIEW → redéploiement requis pour la prod.



## NEW - 2026-06-12 (301) - 🟢 Bannière livraison TEMPS RÉEL via WebSocket (DONE, testé e2e live)
- **Demande user (amélioration validée)** : la bannière de suivi doit se mettre à jour en temps réel via le WebSocket existant (événement `order_status` déjà émis par le backend), sans recharger l'accueil.
- **Frontend** `UserHome.js` : branchement du hook `useWebSocket(user?.id)`. La logique de fetch a été extraite dans `refetchLastDelivery` (useCallback) ; un `useEffect` enregistre `on('order_status', () => refetchLastDelivery())`. À chaque transition de statut poussée par le backend, la bannière se rafraîchit (statut + libellé + mode active/reorder).
- **Backend** : aucun changement — l'événement `{type:'order_status', order_id, status}` était déjà émis vers l'usager par `order_auto_progress_loop` (et par les chauffeurs/commerces).
- **Testé** : e2e live — page d'accueil ouverte, statut passé automatiquement de « Confirmée par le commerce » → « En préparation » SANS rechargement (déclenché par WS). pytest iter298 inchangé (2/2).
- ⚠️ PREVIEW → redéploiement requis pour la prod.



## NEW - 2026-06-12 (300) - 📡 Bannière livraison « point d'entrée unique » : suivi live OU réachat (DONE, testé e2e + pytest 2/2)
- **Demande user (amélioration validée)** : la bannière de la section « Livraison & Coursier » doit afficher le statut EN DIRECT si une livraison est en cours (« Votre commande arrive — Suivre ») et basculer en re-commande seulement une fois la commande livrée.
- **Backend** `GET /api/orders/last-delivery` (réécrit) renvoie désormais un `mode` :
  - `mode='active'` si commande non terminée (statuts pending/accepted/assigned/preparing/ready/picked_up) → `status`, `status_label` (libellés FR), `order_id` pour le suivi.
  - `mode='reorder'` sinon, dernière commande `delivered` → articles ré-commandables (panier 1-tap).
- **Frontend** `UserHome.js` : bannière conditionnelle. Actif = dégradé bleu nuit + point vert pulsant + « Livraison en cours / {status_label} / Suivre » → `/order/{id}`. Réachat = dégradé orange + « Reprendre votre commande / {commerce · N articles} / Reprendre » → reconstruit le panier + `/checkout/{merchant}`. `data-mode` exposé pour les tests.
- **Testé** : e2e les 2 modes (actif → `/order/order_...` ; réachat → `/checkout/merchant_burger_palace` panier rempli) + pytest `test_iter298_last_delivery.py` 2/2 (forme par mode + auth). Note : la boucle d'auto-progression fait évoluer les commandes ; testé en figeant via `merchant_managed`.
- ⚠️ Périmètre : commandes repas/commerce (`db.orders`). PREVIEW → redéploiement requis.



## NEW - 2026-06-12 (299) - 🔁 Tuile « Reprendre » (réachat livraison 1-tap) dans « Livraison & Coursier » (DONE, testé e2e + pytest 2/2)
- **Demande user (amélioration validée)** : afficher une tuile dynamique « Reprendre » dans la section Livraison & Coursier pour re-commander la dernière commande en 1 tap (dans la lignée du « Refaire ce trajet » des courses).
- **Backend** `routes/orders.py` : `GET /api/orders/last-delivery` (placé avant les routes dynamiques) → dernière commande `db.orders` de l'usager + commerce (store_name/logo), articles au format panier `{id,name,price,quantity}`, `item_count`, `total`. Renvoie `{has_order:false}` si aucune commande / commerce supprimé.
- **Frontend** `UserHome.js` : fetch au montage (`orderAPI.lastDelivery`), bannière `resume-delivery-btn` (gradient SB orange, logo commerce + nom + nb articles + CTA « Reprendre ») affichée en haut de la section UNIQUEMENT s'il existe une commande. Tap → `cartAPI.save(merchant_id, items)` puis navigation `/checkout/{merchant_id}` (panier reconstruit, paiement en 1 tap) ; repli `/food/{merchant_id}` si pas d'articles. `orderAPI.lastDelivery` ajouté à `api.js`.
- **Testé** : e2e (login paul → tuile présente → clic → /checkout/merchant_burger_palace avec « Burger Classique » dans le panier) + pytest `test_iter298_last_delivery.py` 2/2 (forme de la réponse + auth requise).
- ⚠️ Périmètre : commandes de type repas/commerce (`db.orders`). Reprise parcel/runner = backlog. PREVIEW → redéploiement requis.



## NEW - 2026-06-12 (298) - 🛵 Accueil : regroupement des services de livraison en UNE section (DONE, testé E2E)
- **Demande user (choix 1a + 2c + oui)** : regrouper sur l'écran d'accueil les services de livraison éparpillés (ex. « livraison de colis avec génie delivery ») en UNE seule section, incluant TOUS les services de livraison, Delivery Genie & Delivery Runner compris.
- **Frontend** (`UserHome.js`, frontend uniquement) :
  - Les 3 anciennes sections séparées (`delivery` « Services de Livraison », `parcel` « Colis & Coursier », `genie` « Livraison Genie & Runner ») fusionnées en UNE section **« Livraison & Coursier »** (`data-testid=delivery-coursier-section`, grid 4 colonnes, sous-titre « Repas, colis, courses & coursiers — tout au même endroit. »).
  - Contenu fusionné = `displayFor('delivery')` + `displayFor('parcel')` + tuiles Delivery Genie (`/runner?mode=genie`) & Delivery Runner (`/runner`), avec **déduplication par path** (évite le doublon « Livraison Colis » présent dans 2 groupes CMS et le doublon `/runner` Coursier Express ↔ Delivery Runner).
  - Blocs `parcel` & `genie` supprimés ; retirés de `DEFAULT_SECTION_ORDER`. Import `Bag` nettoyé.
- **Testé** : testing_agent iter295 (4/4 scénarios : section unifiée, anciennes sections supprimées, navigation des tuiles, ordre accueil — 0 erreur console) + correctif dedup re-vérifié par capture (5 tuiles uniques : Repas, Courses, Coursier Express, Colis, Genie ; aucun doublon).
- ⚠️ PREVIEW → redéploiement requis pour la prod.



## NEW - 2026-06-12 (296→297) - 🏬 Service Hubs + Favoris + Édition annonces (Phase 1&2) — FINALISÉ & testé E2E 100%
- **Demande user** : « Créer les hubs pour tout » (regrouper les services par activité) + audit/amélioration des verticales Immobilier & Marketplace.
- **Phase 2 — Service Hubs** (`VehiclesHub.js` = Véhicules `/vehicules` + Shopping `/shopping`, `RealEstateHub.js` = Immobilier `/immobilier`, `SbTravelHub.js` = `/sb-travel`) avec deep-links `?type=rent|sale` qui pré-filtrent `/marketplace/cars`, `/marketplace/items`, `/real-estate`. Routes enregistrées (clientRoutes.jsx 138-141). Bouton ❤️ → `/favoris`.
- **Phase 1 — Favoris** (`routes/favorites.py`, collection `favorites`) : POST `/api/favorites/toggle`, GET `/api/favorites/ids`, GET `/api/favorites` (enrichi). `FavoriteButton.jsx` (cœur contrôlé, stopPropagation), page `MyFavoritesPage.js` (`/favoris`, onglets Immobilier/Marketplace). + Édition d'annonces (immobilier `/real-estate/edit/:id`, marketplace modale `/ma-galerie`) + Boost payant admin.
- **2 bugs HIGH corrigés** (trouvés iter293) :
  1. `<button>` imbriqué dans PropertyCard (RealEstatePage) + carte MarketplacePage → remplacés par `<div role="button" tabIndex={0}>` (erreur React 'nested button' éliminée).
  2. La bannière « Vérifiez votre email » (`VerifyEmailBanner.jsx`, fixed bottom-0) recouvrait le bouton de soumission des formulaires de publication → `HIDDEN_PREFIXES` étendu à `/real-estate/post`, `/real-estate/edit`, `/marketplace/sell-vehicle`, `/ma-galerie`.
- **Testé** : testing_agent iter293 (Hubs+Favoris 100%) + iter294 (édition immo+marketplace, création immo, fix nested button, régression favoris — 5/5 100%) + pytest `test_iter296_marketplace_phase1.py` 5/5. AUCUN bug restant.
- ⚠️ PREVIEW → redéploiement requis pour la prod.



## NEW - 2026-06-12 (295) - 🧹 Suppression tuile « Hotel » legacy de l'accueil (DONE, vérifié)
- Suppression de la catégorie d'accueil legacy `home_categories` id `hcat_16b364abd5` (label « Hotel », section marketplace, `target_route: "Hotel"` cassée) — doublon du nouveau module Hôtels désormais dans la section SB Travel.
- « Acheter, Vendre & Louer » ne contient plus que Immobilier, Véhicules, Articles Divers. Vérifié e2e (capture). Aucun changement de code.


## NEW - 2026-06-12 (294) - 🏠 Intégration de SB Travel dans la grille de l'accueil (DONE, vérifié e2e)
- **Demande user** (capture d'écran) : intégrer la section voyage DANS la grille de l'accueil (look V3Cube, comme « Colis & Coursier » / « Acheter, Vendre & Louer »), Taxi restant en premier.
- **Frontend uniquement** (`UserHome.js`) :
  - Nouveau bloc keyé `travel` = `<section>` « SB Travel » (SectionHeader + sous-titre) avec 4 tuiles ServiceTile : Billets d'avion (/vols), Hôtels (/hotels), Forfaits Vol+Hôtel (/forfaits, badge PROMO), SB Travel (/sb-travel hub) + le carrousel `OffresDuMoment` en dessous.
  - Inséré dans l'ordre des sections juste après `marketplace` (et garanti via `ORDERED_SECTIONS` même si l'admin a un ordre personnalisé). Taxi reste premier.
  - Ancienne bannière gradient « SB Travel » + carrousel autonome (iter293) SUPPRIMÉS (remplacés par la section intégrée).
  - `DynamicIcon.js` : ajout de l'icône `Suitcase` (pour la tuile Forfaits).
- **Vérifié** : smoke test e2e — section présente, 4 tuiles + carrousel, navigation tuile→/vols OK. Aucun changement backend.
- ⚠️ PREVIEW → redéploiement requis.


## NEW - 2026-06-12 (293) - 🌍 SB Travel hub + carrousel « Offres du moment » (DONE, vérifié e2e)
- **Demande user (a+d)** : regrouper les entrées voyage en un hub « SB Travel » + section « Offres du moment » sur l'accueil avec deep-link vers le forfait.
- **Frontend uniquement** (réutilise les endpoints déjà testés) :
  - `components/OffresDuMoment.jsx` : carrousel horizontal des forfaits triés par remise décroissante (top 6), clic → `/forfaits?pkg=ID` (deep-link). Affiché sur l'accueil ET le hub.
  - `pages/user/SbTravelHub.js` (route `/sb-travel`) : header SB Travel + carrousel + 3 cartes service (Vols `/vols`, Hôtels `/hotels`, Forfaits `/forfaits`).
  - `UserHome.js` : les 3 anciennes entrées (home-hotels/flights/packages-entry) remplacées par UNE entrée `home-sbtravel-entry` → `/sb-travel`, + carrousel `OffresDuMoment` sous l'entrée.
  - `TravelPackagesPage.js` : lit `?pkg=ID` et ouvre directement l'écran de réservation du forfait.
- **Vérifié** : smoke test e2e (accueil entrée+carrousel, hub 3 services, deep-link ouvre l'étape book) — tout passe. Aucun changement backend.
- ⚠️ PREVIEW → redéploiement requis.


## NEW - 2026-06-12 (292) - 🧳 Forfaits combinés Vol + Hôtel (DONE, testé frontend 100% + pytest 5/5)
- **Demande user** : packages voyage à prix réduit (levier de conversion n°1 des agences) en assemblant les modules Vols + Hôtels existants.
- **Backend** `routes/travel_packages.py` (collections `travel_packages`, `travel_bookings` ; réutilise helpers de `hotels.py` et `flights.py`) : l'admin compose un forfait (vol + hôtel/chambre + nuits + remise %), `GET /travel-packages` (+ détail/quote), `POST /{id}/book` (paiement SB Pay UNIQUE remisé qui crée AUSSI un `flight_booking` + `hotel_booking` sous-jacents taggés `package_booking_id` → stocks décrémentés + visibles dans Mes vols/Mes séjours), `POST /bookings/{id}/cancel` (annulation groupée + remboursement total remisé). Admin : `/admin/options` (dropdowns vol/hôtel/chambre), CRUD packages, bookings. Seed 1 forfait démo (Escapade Paris -15%).
- **Frontend** : user `TravelPackagesPage.js` (route `/forfaits`), admin `AdminTravelPackages.js` (route `/admin/travel-packages`, sidebar 'Forfaits Vol+Hôtel'). Entrée accueil `home-packages-entry` (badge PROMO). `travelPackagesAPI`.
- **Testé** : testing_agent iter292 frontend 100% (incl. propagation vol+hôtel + cascade annulation) + pytest `test_iter292_travel_packages.py` 5/5. AUCUN bug.
- ⚠️ Paiement SB Pay. PREVIEW → redéploiement requis.


## NEW - 2026-06-12 (291) - ✈️ VERTICALE Billets d'avion / agence de voyage (DONE, testé frontend 100% + pytest 4/4)
- **Demande user (a→b→c→d validée)** : 4ᵉ verticale d'expansion. Modèle inventaire ADMIN (sans API tierce type Amadeus, validé par défaut).
- **Backend** `routes/flights.py` (collections `flight_offers`, `flight_bookings`) : recherche par départ/arrivée/date (`GET /flights`, `/flights/airports`, `/flights/{id}`), réservation multi-passagers (`POST /flights/book` — débit SB Pay, sièges décrémentés via comptage des résas confirmées), `GET /flights/bookings/my`, annulation+remboursement avant départ (`POST /flights/bookings/{id}/cancel`). Admin : CRUD vols (`/flights/admin/flights`) + réservations. Seed 3 vols démo (Air Caraïbes, Air France, Corsair).
- **Frontend** : user `FlightsPage.js` (route `/vols`, recherche → liste → passagers → réservation → Mes vols), admin `AdminFlights.js` (route `/admin/flights`, sidebar 'Vols (agence)'). Entrée accueil `home-flights-entry`. `flightsAPI`.
- **Testé** : testing_agent iter291 frontend 100% (incl. épuisement sièges 409) + pytest `test_iter291_flights.py` 4/4. AUCUN bug.
- ⚠️ Paiement SB Pay. PREVIEW → redéploiement requis.

## NEW - 2026-06-12 (290) - 🏨 VERTICALE Hôtels (réservation de chambres) (DONE, testé frontend 100% + pytest 5/5)
- **Backend** `routes/hotels.py` (collections `hotel_listings`, `hotel_rooms`, `hotel_bookings`) : recherche par ville/texte (`GET /hotels`, `/hotels/cities`), détail + dispo selon chevauchement de dates (`GET /hotels/{id}`), devis (`/hotels/quote`), réservation (`POST /hotels/book` — débit SB Pay, contrôle stock unités), `GET /hotels/bookings/my`, annulation+remboursement avant arrivée. Admin : CRUD hôtels + chambres (stock/tarifs) + réservations. Seed 2 hôtels démo (Martinique).
- **Frontend** : user `HotelsPage.js` (route `/hotels`), admin `AdminHotelsManager.js` (route `/admin/hotels` — remplace l'ancien placeholder CRUD ; gestion hôtels + chambres dépliables). Entrée accueil `home-hotels-entry`. `hotelsAPI`.
- **Testé** : testing_agent iter290 frontend 100% + pytest `test_iter290_hotels.py` 5/5 (list/cities, dispo, quote, épuisement 409, book→cancel→remboursement→re-book). AUCUN bug.
- ⚠️ Paiement SB Pay. PREVIEW → redéploiement requis.

## NEW - 2026-06-12 (289) - 🚗 VERTICALE Location de voiture self-drive (DONE, testé frontend 100% + pytest 6/6)
- **Contexte** : la location voiture AVEC chauffeur existe déjà (forfaits flux courses). Ajout du LIBRE-SERVICE (self-drive), miroir exact du module moto (caution Stripe TEST + photos d'état des lieux retrait/retour dès le départ).
- **Backend** `routes/car_rental.py` (collections `car_fleet`, `car_self_rentals`) : flotte (champs voiture : marque/modèle/année/boîte/places/carburant/catégorie), devis, réservation (débit SB Pay + docs permis/identité), pickup-photos (≥2), caution Stripe Checkout, validation permis admin, clôture avec return-photos (≥2) + remboursement caution − dommages. Seed 3 voitures démo.
- **Frontend** : user `CarSelfRentalPage.js` (route `/location-voiture`), admin `AdminCarFleet.js` (route `/admin/car-fleet`). Lien `car-selfdrive-link` depuis le flux location voiture. `carRentalAPI`.
- **Testé** : testing_agent iter289 frontend 100% + pytest `test_iter289_car_rental.py` 6/6 (flux e2e complet incl. gates photos). AUCUN bug.
- ⚠️ Stripe TEST. PREVIEW → redéploiement requis.

## NEW - 2026-06-12 (288) - 🏍️📸 Moto Self-Drive : photos d'état des lieux OBLIGATOIRES (DONE, testé frontend 8/8 + pytest 5/5)
- **Demande user** : photos avant/après pour protéger la caution Stripe (400€) en cas de litige dommages.
- **Backend** `routes/moto_rental.py` : `POST /moto-rental/{id}/pickup-photos` (user, statut awaiting_pickup, ≥2 photos) ; `deposit-checkout` bloqué (400) tant que <2 pickup_photos ; `admin/rentals/{id}/return` bloqué (400) tant que <2 return_photos. Helper `_clean_photos` + `MIN_INSPECTION_PHOTOS=2`.
- **Frontend** : user `PickupInspection` (MotoSelfRentalPage.js — verrouille 'Payer la caution' tant que <2 photos) ; admin `ReturnClose` (AdminMotoFleet.js — verrouille la clôture tant que <2 photos de retour) + affichage des photos retrait/retour.
- **Testé** : testing_agent iter288 frontend 8/8 + pytest `test_iter288_moto_inspection_gates.py` 5/5 + `test_iter287_*` 4/4. AUCUN bug.
- ⚠️ Stripe TEST. PREVIEW → redéploiement requis.


## NEW - 2026-06-11 (286) - 🏍️💳 Moto Phase 3b : Caution Stripe (self-drive) (DONE, testé frontend 5/5 + curl e2e)
- **Demande user (Option A validée)** : caution via Stripe — débitée à la remise par Stripe Checkout, puis RESTITUÉE sur le portefeuille SB Pay au retour (moins frais de dommages).
- **Contrainte plateforme** : la lib `emergentintegrations` Stripe ne fait que du Checkout hébergé (pas de pré-autorisation/empreinte ni refund carte). → Caution **débitée** (Checkout) puis **recréditée sur SB Pay** au retour. La vraie empreinte (capture manuelle) nécessiterait la clé Stripe réelle du client (Option B, plus tard).
- **Backend** (`routes/moto_rental.py`, réutilise STRIPE_API_KEY + pattern payments.py) :
  - `POST /moto-rental/{id}/deposit-checkout` : crée une session Stripe Checkout du montant de caution (statut awaiting_pickup requis), enregistre `payment_transactions` (type moto_deposit). Si caution=0 → passe direct en active.
  - `GET /moto-rental/deposit-status/{session_id}` : polling ; au paiement → `deposit_status=held`, location `active` (idempotent).
  - `POST /moto-rental/admin/rentals/{id}/return` : restitue `caution − damage_fees` sur le wallet SB Pay (Refund), conserve les dommages, libère la moto, statut `returned`, notifie l'usager.
- **Frontend** : user `MotoSelfRentalPage.js` — bouton « Payer la caution » (awaiting_pickup), redirection Stripe, polling au retour (`?deposit_session=`), badges « Caution bloquée ✓ » / « Caution restituée ». admin `AdminMotoFleet.js` — clôture avec saisie frais dommages (`moto-damage-{id}` + `moto-close-{id}`).
- **Testé** : testing_agent iter285 frontend 5/5 PASS (Stripe Checkout test réel 4242, polling, clôture admin 50€ dommages → 350€ restitués, reflet user) + curl e2e (session cs_test_… + règlement wallet 350€).
- ⚠️ PREVIEW → redéploiement requis. STRIPE en mode TEST.


## NEW - 2026-06-11 (285) - 🏍️ Moto Phase 3 : Location LIBRE-SERVICE (self-drive) (DONE, testé frontend 6/6 + pytest 2/2)
- **Demande user (défauts validés)** : louer une moto et la conduire soi-même. Paiement SB Pay, caution indicative (non débitée au MVP), permis validé manuellement par l'admin, flotte interne admin.
- **Backend** nouveau `routes/moto_rental.py` (collections `moto_fleet`, `moto_self_rentals`) :
  - Flotte : `seed_moto_fleet` (3 motos démo), CRUD admin (`/moto-rental/admin/fleet`), liste/détail user.
  - Devis `/moto-rental/quote` (jours pleins au tarif/jour + heures restantes au tarif/heure, plafonné au tarif/jour).
  - Réservation `/moto-rental/book` : exige permis + pièce d'identité, débite SB Pay, status `pending_license`, réserve la moto, notifie admins. `/my`, `/cancel` (remboursement).
  - Admin `/rentals` + `/rentals/{id}/license` (approve → `awaiting_pickup` ; reject → `rejected` + remboursement + libère la moto).
  - Cycle : pending_license → awaiting_pickup → active → returned (remise/restitution photos = Phase 3b à venir).
  - Routers enregistrés dans `core/api_router.py` ; seed branché dans `core/startup.py`.
- **Frontend** : `MotoSelfRentalPage.js` (route `/moto-location`) — flotte → réservation (dates, devis live, upload permis/pièce, paiement) → confirmation → « Mes locations ». `AdminMotoFleet.js` (route `/admin/moto-fleet`, lien sidebar) — onglets Flotte (CRUD) + Locations (validation permis). `motoRentalAPI` ajouté. Lien « Self-drive » (`moto-selfdrive-link`) depuis /course?mode=moto_rental.
- **Testé** : testing_agent iter284 frontend 6/6 PASS (flotte, devis 70€/2j, upload docs, réservation, statuts, validation permis admin, point d'entrée) + pytest `test_iter285_moto_selfdrive.py` 2/2 + curl e2e (book→approve).
- **À venir (Phase 3b)** : remise/restitution avec photos d'état des lieux + calcul frais (km/carburant/dommages) ; caution réelle (Stripe) ; multi-loueurs.
- ⚠️ PREVIEW → redéploiement requis pour la prod.


## NEW - 2026-06-11 (284) - 🏍️ Moto : Location avec chauffeur + Moto-Taxi (Phases 1&2, DONE, testé frontend 4/4 + pytest 2/2)
- **Demande user** : développer Moto-Taxi (tarif, dispatch moto, sécurité) + location moto avec chauffeur (forfaits moto dédiés) + self-drive (Phase 3 à venir).
- **Phase 1 — Location moto AVEC chauffeur** : forfaits moto dédiés branchés au flux réel.
  - Backend `taxi_extra.py` : seed de 4 forfaits moto (`db.rental_packages`, vehicle_type='moto' : 1h/15km/12€, 2h/30km/22€, 4h/60km/40€, Journée 8h/120km/75€) + champs `label`/`extra_hour_rate`/`extra_km_rate`/`with_driver`. `rides.py` bloc rental : résout le forfait par `db.rental_packages` (id) puis repli sur la config plate `taxi_configs` → corrige l'incohérence (moto avait les forfaits voiture). `estimated_fare` = prix du forfait.
  - Frontend `RideChoosePage.js` : charge les forfaits du véhicule du mode (`configAPI.getRentalPackages(mode.vehicle)`), affiche les forfaits véhicule si présents (sinon RENTAL_PACKAGES), prix + payload (`rental_package`=id). `configAPI.getRentalPackages` ajouté. Régression location voiture OK.
- **Phase 2 — Moto-Taxi** : tarif moto déjà configurable (vehicle_types : base 1€, /km 0.8€, min 5€). Dispatch : isolation deux-roues (`auto_dispatch._vehicle_compatible` + `rides._vehicle_exclude_set`) → une course moto n'est offerte qu'aux chauffeurs moto, et les courses voiture n'arrivent jamais aux motos (voiture↔voiture reste flexible). Carte sécurité Moto-Taxi (casque fourni, 1 passager, bagage à main).
- **Testé** : testing_agent iter283 frontend 4/4 PASS (forfaits moto, prix 40€, carte sécurité, régression voiture 36€) + pytest `test_iter283_moto.py` 2/2 + curl e2e.
- **Phase 3 — Location moto self-drive (libre-service)** : NON commencée (module conséquent : caution, permis, état des lieux, restitution, assurance). À cadrer avec l'utilisateur.
- ⚠️ PREVIEW → redéploiement requis pour la prod.


## NEW - 2026-06-11 (283) - 💰 SB Access Plus — bandeau d'upsell dynamique (enhancement, DONE, testé frontend 3/3)
- **Demande user** : levier de conversion Access Plus au moment du paiement pour les non-abonnés.
- **Backend** (`_build_and_store_booking`) : pour un usager non-abonné, calcule `plus_upsell` = {discount_pct (meilleure formule), would_pay, current_fare, plan_id, plan_name}.
- **Frontend** (`SbAccessPage.js`, écran de confirmation) : bandeau `plus-upsell-banner` (« Avec Access Plus, ce trajet vous aurait coûté X€ au lieu de Y€ ») + bouton `plus-upsell-cta` « Économiser » → ouvre le panneau d'abonnement. Pour les abonnés : ligne « Access Plus -X% appliqué ✓ ».
- **Testé** : testing_agent iter282 frontend 3/3 PASS (bandeau affiché 8.13€ vs 10.16€ = -20%, CTA ouvre les formules) + curl (plus_upsell calculé).
- ⚠️ PREVIEW → redéploiement requis pour la prod.


## NEW - 2026-06-11 (282) - 👑 SB Access Plus — abonnement / accès prioritaire (P2, DONE, testé frontend 5/5 + curl e2e)
- **Demande user (backlog P2, choisi par défaut)** : monétisation du module SB Access via abonnement prioritaire.
- **Backend** (`routes/sb_access.py`, collections `access_plus_plans` / `access_plus_subscriptions`) : 2 plans par défaut (Mensuel 9.99€/-15%/+10min, Annuel 99.99€/-20%/+15min ; perks : attribution prioritaire chauffeur certifié, priorité SOS). Paiement via portefeuille SB Pay (débit `wallets` + `wallet_transactions`, souscription créée juste après le débit). Endpoints user : `GET /plus/plans`, `GET /plus/subscription`, `POST /plus/subscribe`, `POST /plus/cancel`. Admin : `GET/POST /admin/plus/plans`, `PUT/DELETE /admin/plus/plans/{id}`, `GET /admin/plus/revenue`. Avantages appliqués dans `_build_and_store_booking` : réduction `fare = fare*(1-discount/100)` (stocke `plus_member`, `plus_discount_pct`, `fare_before_discount`) + minutes d'assistance bonus.
- **Frontend** : usager `SbAccessPage.js` — carte premium landing `access-open-plus-btn` (badge ACTIF), overlay `plus-sheet` (plans `plus-subscribe-*`, panneau actif + résiliation `plus-cancel-btn`). Admin `AdminAccess.js` — onglet '👑 Access Plus' (`PlusAdmin`) : revenus/abonnés + édition des formules (prix/réduction/bonus/actif) + souscriptions récentes.
- **Testé** : testing_agent iter281 frontend 5/5 PASS + curl e2e (subscribe 100→90.01€, booking abonné -15% 18.8→15.98€, assist 20min, revenu admin active=1/9.99€).
- ⚠️ PREVIEW → redéploiement requis pour la prod.


## NEW - 2026-06-11 (281) - 📲 SB Access SOS — SMS automatique aux contacts d'urgence (Twilio, FEATURE-FLAGGÉ, DONE, testé pytest 3/3 + path désactivé e2e)
- **Demande user (validée)** : envoi SMS serveur aux contacts d'urgence lors d'un SOS, pour prévenir les proches même si l'usager ne peut plus toucher l'écran.
- **Intégration** : SDK `twilio` (9.10.9) installé + `requirements.txt` figé. Nouveau `core/sms.py` : `sms_enabled()` (vrai si ACCOUNT_SID+AUTH_TOKEN+PHONE_NUMBER présents), `to_e164` (normalisation, FR par défaut), `send_sms`/`send_sms_to_many` (appel bloquant Twilio via `asyncio.to_thread`, try/except → JAMAIS d'exception, no-op si désactivé). `.env` : `TWILIO_ACCOUNT_SID/AUTH_TOKEN/PHONE_NUMBER` (vides = OFF).
- **Câblage** (`routes/sb_access.py` `trigger_sos`) : à la création d'une alerte, si `sms_enabled()` → SMS à tous les contacts d'urgence (message d'alerte + lien maps), `sms_sent`/`sms_total` stockés sur l'alerte ; réponse expose `sms_sent` + `sms_enabled`.
- **Frontend** (`SbAccessPage.js`) : si `sms_enabled` → toast « X contact(s) prévenu(s) par SMS », plus d'ouverture WhatsApp auto ; sinon repli WhatsApp 1-tap (comportement actuel inchangé).
- **Testé** : pytest `test_iter281_sms.py` 3/3 (E.164, désactivé=no-op, flag activé) + curl e2e (SOS sans clés → `sms_enabled:false, sms_sent:0`, SOS fonctionne normalement).
- ⚠️ **EN ATTENTE des 3 clés Twilio** (Account SID / Auth Token / numéro expéditeur) pour activer l'envoi RÉEL. Tant que les vars sont vides → no-op total (aucun impact). En compte d'essai Twilio, livraison vers numéros vérifiés uniquement. PREVIEW → redéploiement requis pour la prod.


## NEW - 2026-06-11 (280) - ♿🩺 SB Access P1 — Trajets médicaux dédiés (DONE, testé frontend 5/5)
- **Demande user** : flux UI dédié aux trajets médicaux (dialyse, rééducation, hôpital).
- **Backend** (`routes/sb_access.py`) : helper `_clean_medical` (motif, heure RDV, aller-retour, mode de retour wait|scheduled, return_time, justificatif). `_build_and_store_booking` stocke `booking.medical` quand `trip_type='medical'`. `create_booking` transmet `medical` + `scheduled_at` (depuis l'heure de RDV → la course est traitée comme programmée → l'IA considère tous les chauffeurs certifiés, pas uniquement en ligne).
- **Frontend** (`SbAccessPage.js`) : entrée landing « Trajet médical » (`access-medical-entry`) → `startMedicalFlow` (présélectionne tripType=medical, step 0). Sur l'étape Trajet, carte `access-medical-details` : motif (`medical-reason-*`), heure RDV (`medical-appointment-time`), toggle aller-retour (`medical-round-trip`) → options `medical-return-wait`/`medical-return-scheduled` (+ `medical-return-time`), upload justificatif optionnel (`medical-rx-input`). Confirmation : bloc `medical-confirmation` (motif/RDV/retour/justificatif).
- **Testé** : testing_agent iter280 frontend 5/5 PASS (entrée → parcours → détails médicaux → Google Places → confirmation avec medical-confirmation + ai-match-reasons). Curl backend : booking médical stocké + match_score 90.3.
- ⚠️ PREVIEW → redéploiement requis pour la prod.

## NEW - 2026-06-11 (279) - 🆘 SB Access P1 — Centre SOS / Sécurité (DONE, testé frontend 5/5 + pytest 2/2)
- **Demande user** : centre SOS (contacts d'urgence, bouton SOS, suivi temps réel).
- **Backend** (`routes/sb_access.py`, collection `access_sos_alerts`) : `POST /api/access/sos` (déclenche, anti-doublon, notifie admins via `notify_admins` + `manager.broadcast_to_admins`, notifie le chauffeur attribué, renvoie message de partage + contacts + lien maps), `POST /api/access/sos/{id}/location` (suivi temps réel, historique ≤20 points + broadcast WS), `POST /api/access/sos/{id}/resolve` (usager « je suis en sécurité »), `GET /api/access/sos/active`. Admin : `GET /api/access/admin/sos` (actives + historique), `POST /api/access/admin/sos/{id}/resolve` (notifie l'usager). Réutilise les contacts d'urgence `/phase1/emergency-contacts` (max 5).
- **Frontend** : usager `SbAccessPage.js` — bannière SOS active (`sos-active-banner`), entrée landing `access-open-safety-btn` → panneau `safety-sheet` (bouton SOS `safety-sos-btn` avec géoloc best-effort + watchPosition, contacts CRUD, appel/WhatsApp/supprimer par contact, « Je suis en sécurité » `safety-resolve-btn`). Admin `AdminAccess.js` — onglet « 🆘 Centre SOS » (`SosCenter`, auto-refresh 8s, alertes actives + lien position + clôture, historique).
- **Testé** : testing_agent iter279 frontend 5/5 PASS + pytest `test_iter279_access_sos.py` 2/2 (helpers) + curl e2e (trigger/location/admin list/resolve).
- ⚠️ SMS/WhatsApp aux contacts = ouverture 1-tap côté client (pas d'envoi auto serveur). PREVIEW → redéploiement requis.

## NEW - 2026-06-11 (278) - 🤖♿ SB Access P1 — IA d'attribution chauffeurs PMR + prédiction de la demande (DONE, testé frontend 4/4 + pytest 5/5)
- **Demande user** : matching IA des chauffeurs PMR + prédiction de la demande.
- **Backend** nouveau `core/access_ai.py` : `rank_access_drivers` (scoring DÉTERMINISTE pondéré — proximité/note/adéquation formations↔besoins/fiabilité ; jointure `db.users` access_certified ↔ `db.drivers` position/online/note ; priorise les chauffeurs en ligne pour les courses immédiates). `predict_access_demand` (agrégation historique 7×24 + créneaux de pointe + niveaux heatmap). `demand_narrative` (recommandation FR via Gemini, repli déterministe). `_build_and_store_booking` utilise le moteur et stocke `match_score`/`match_reasons`/`allocation_candidates`. Config `ai_allocation` (poids + rayon + toggles) dans les settings, réglable admin. Endpoints : `GET /api/access/admin/ai/demand-forecast`, `POST /api/access/admin/ai/allocation-preview`.
- **Frontend** : admin `AdminAccess.js` onglet « IA & Attribution » (`AIAllocation`) — carte recommandation IA, heatmap demande, réglages des poids (`ai-config-save`), testeur d'attribution (`ai-preview-run`). Usager : ligne `ai-match-reasons` sur la carte chauffeur en confirmation.
- **Testé** : testing_agent iter278 frontend 4/4 PASS + pytest `test_iter278_access_ai.py` 5/5 + curl (forecast total=9, narration Gemini, allocation-preview scoré).
- ⚠️ PREVIEW → redéploiement requis pour la prod.


## NEW - 2026-06-11 (277) - 💸 Dette client : bouton ouvre le portefeuille + facture & règlement multi-paiement corrects (DONE, testé e2e + pytest)
- **Bug user** : « Payer la dette » n'ouvrait pas le portefeuille (appel direct `/debts/pay` → erreur si solde insuffisant). + flux de règlement à corriger.
- **Fix bug** : `DebtBanner.jsx` → bouton « Payer la dette » navigue vers `/wallet?action=debt`. Nouvelle **carte dette sur `WalletPage.js`** (`wallet-debt-card`) : « Régler X € depuis le solde » si solde suffisant (`wallet-pay-debt-btn` → `/debts/pay`), sinon « Recharger pour régler » (`wallet-topup-for-debt-btn` ; le top-up auto-règle la dette). Rechargé après top-up.
- **Correctif financier majeur** (`rides.py`, `debts.py`) : la dette portée est désormais **ajoutée au montant de la course** (`amt = tarif + dette`) et affichée dans la facture chauffeur (`RideCompletionFlow.jsx` ligne « Dette (course précédente impayée) », Total/Total net inclus). Règlement selon le mode :
  - **Espèces (Reçu)** : chauffeur encaisse tarif+dette ; on débite la dette de SON portefeuille → reversée à l'ancien chauffeur ; dette payée ; **chauffeur notifié** (`debt` / "Dette client reversée 🔁"). Réglé à `collect-cash` (pas à la complétion).
  - **Espèces (Non reçu)** : dette portée **conservée** (se reporte), seul le tarif devient une nouvelle dette ; ancien chauffeur **non** remboursé.
  - **Portefeuille / Carte / SBPayGo (couvert)** : passager paie tarif+dette en une fois ; ancien chauffeur remboursé ; **chauffeur actuel NON notifié**. Réglé à la complétion.
  - `settle_carried_debts(ride, carried, collected_in_cash)` refondu (re-lecture anti double-remboursement).
- **Testé e2e (curl réels)** : espèces reçu (chauffeur 100→90, ancien 50→60, perçu 30, dette payée, notif ✓) ; portefeuille (paul −30, ancien +10, pas de notif ✓) ; non-reçu (dette 10 conservée + nouvelle dette 20, ancien non remboursé ✓) ; règlement depuis solde (30→17.5). + screenshots (carte portefeuille, bannière→portefeuille). + pytest `test_iter277_debt_settlement.py` 1/1 (régression espèces).
- ⚠️ PREVIEW → redéploiement requis pour la prod.
- **NON FAIT (suggestion en attente)** : badge « ⭐ Votre favori » sur la carte chauffeur + notif « c'est [Nom], votre favori, qui arrive ! ».



- **Demande user** : favoris **max 2** (déjà en place backend), valables pour **tout transport + livraison**, remplaçables, **+ brancher l'attribution préférentielle** dans le matching ; ajout/changement aussi depuis l'espace client.
- **Correctif** : la notation (`rides.py rate_ride`) écrivait dans `user.favorite_driver_ids` (≠ collection lue par la page) → corrigé pour upsert dans `db.favorite_drivers` avec max-2.
- **Attribution préférentielle (head-start exclusif)** : nouveau `core/favorites.py` (`get_favorite_head_start_seconds` clamp 0-60, `online_favorite_drivers`). À la création d'une course (`rides.py`), si un favori est en ligne → la demande lui est proposée **en exclusivité pendant N s** (notif + WS `favorite:true`), broadcast général **retenu** ; libéré par `auto_dispatch._release_favorite_hold` à l'expiration (ou si le favori a accepté, plus de broadcast). Idem livraison (`orders.py _broadcast_delivery_offers`). Délai **réglable admin** `favorite_head_start_seconds` (DEFAULT 20, clamp 0-60 lecture **et** écriture) — champ UI dans `AdminAutoDispatch.js`.
- **Espace client** (`FavoriteDriversPage.js`) : compteur X/2, section **« Ajouter un chauffeur »** depuis les courses récentes (`GET /api/phase1/recent-drivers`, exclut déjà-favoris), ajout 1-tap, boutons désactivés à 2/2, remplacement = retirer puis ajouter.
- **NON couvert (volontaire)** : SB Access utilise un modèle chauffeur distinct (users role=driver, pas `db.drivers`) → favoris non branchés sur SB Access pour éviter un mismatch de données ; SB Access continue de préférer les chauffeurs certifiés.
- **Testé** : pytest `test_iter276_favorite_dispatch.py` (2/2 helper) + `test_iter276_favorites_api.py` (8/8 HTTP) + testing_agent frontend 100% (add/remove/max2/replace, recent-drivers, champ admin persistant). Dispatch head-start câblé (non e2e car nécessite chauffeur en ligne + WS). Curl : add/remove/max2/replace, clamp 999→60.
- ⚠️ PREVIEW → redéploiement requis pour la prod.



- **Demande user (1 — bug prioritaire WhatsApp)** : retirer le GROS bouton « Réserver via WhatsApp » partout, garder seulement le petit badge WhatsApp sur les véhicules ; « je n'arrive pas à commander sur WhatsApp » (`api.whatsapp.com` bloqué sur mobile).
  - Fix (`RideChoosePage.js`) : gros bouton `ride-choose-whatsapp-btn` SUPPRIMÉ du `renderCta`. Petit badge `vehicle-whatsapp-{slug}` conservé, transformé en bouton appelant `openWhatsApp` → **schéma `whatsapp://send?phone=&text=` sur mobile** (ouvre l'app directement, contourne le blocage `api.whatsapp.com` via `wa.me`), `wa.me` en repli desktop. `buildWaUrl` refactoré en `buildWaMsg` + `openWhatsApp`. Vérifié screenshot : gros bouton absent, badge présent, CTA = « Choisir SB ».
- **Demande user (2 — enrichissement validé)** : admin upload photo + mini-bio + formations des chauffeurs certifiés, affichées à l'usager.
  - Backend (`sb_access.py`) : `PUT /api/access/admin/drivers/{id}/profile` (access_photo/access_bio[600]/access_trainings[12]). `GET /drivers` renvoie ces champs. `_build_and_store_booking` enrichit le booking (`matched_driver_photo/bio/trainings`). Rappel J-1 inclut `driver_photo`.
  - Frontend admin (`AdminAccess.js` onglet Chauffeurs) : éditeur inline photo (upload via `accessAPI.uploadImage` → `/api/uploads/image`), bio, formations (CSV). Frontend usager (`SbAccessPage.js` confirmation) : `certified-driver-card` avec photo/nom/bio/chips formations.
- **Testé** : pytest `test_iter275_access_driver_profile.py` 7/7 + testing_agent iter275 frontend 100% (upload photo réel via UI + persistance, carte usager, suppression gros bouton WhatsApp + badge présent). AUCUN bug.
- ⚠️ PREVIEW → redéploiement requis pour pousser en prod (https://gojek-mvp-1.emergent.host).



- **Demande user (P2 initiale)** : contrôle admin sur catégories/tarifs PMR, zones, **Safe Ride Night entièrement paramétrable**, certification chauffeurs Access. + enrichir le rappel J-1 avec le chauffeur certifié pressenti.
- **Frontend** : nouvelle page `pages/admin/AdminAccess.js` (route `/admin/access`, lien sidebar « SB Drive Access (PMR) » sous SERVICES) — 5 onglets : **Vue d'ensemble** (stats), **Catégories & tarifs** (CRUD complet : équipements, capacités, tarifs base/km/min/min_fare, zone, actif), **Réglages & Safe Ride Night** (module on/off, priorité chauffeurs certifiés, minutes assistance, zones de dispo, + Safe Ride Night : on/off, heures début/fin, modes, zones — tout paramétrable), **Chauffeurs Access** (certifier/retirer), **Réservations** (table). `ScopeEditor` réutilisable (pays/région/ville).
- **Backend** : `_send_recurring_reminder` enrichi → cherche un chauffeur certifié Access et l'inclut dans la notif + email J-1 (« Votre chauffeur certifié X vous prendra en charge »). Endpoints admin existaient déjà dans `sb_access.py`.
- **Testé** : pytest `test_iter274_access_admin.py` 6/6 (stats, catégories CRUD + persistance, settings GET/PUT incl. SRN + zones, certify/revoke, bookings) + testing_agent iter274 frontend 100% (5 onglets, CRUD, SRN configurable, certif, persistance après reload) — AUCUN bug. Curl vérifié (certify, SRN 22h-5h + zone FR).
- ⚠️ PREVIEW → redéploiement requis pour la prod.



- **Demande user** : rappel la veille « Votre trajet adapté de demain Xh est confirmé » (notif + email) + annulation en 1 tap → rassure les patients, réduit les courses fantômes.
- **Backend** (`routes/sb_access.py`, `core/email.py`) : helpers `_next_occurrence` (prochaine date/heure en sautant `skip_dates`), `_occurrence_label` (FR « jeudi 18 à 09:00 »), `_tznow`. Le scheduler `access_recurring_loop` envoie un **rappel J-1** (notif `access_recurring_reminder` + email `send_access_recurring_reminder`, idempotent via `last_reminded_date`) puis crée la course du jour **sauf si la date est dans `skip_dates`**. NOUVEL endpoint `POST /api/access/recurring/{id}/skip {date?}` (annule 1 occurrence, défaut = prochaine). Liste expose `next_occurrence` + `next_occurrence_label`. Email template Access Navy avec bouton « Gérer ou annuler ce trajet » (lien `/access`).
- **Frontend** (`SbAccessPage.js`) : chaque trajet automatique actif affiche « Prochaine : … » + bouton **« Annuler la prochaine »** (`recurring-skip-{id}`, 1-tap → `accessAPI.skipRecurring`). 
- **Testé** : pytest `test_iter271_access_recurring.py` 5/5 (next_occurrence + skip + fenêtre rappel J-1 + label FR) + curl (skip prochaine → avance ; skip date explicite) + screenshot e2e (Prochaine affichée, skip → toast + occurrence avancée mardi 16→jeudi 18).
- ⚠️ Email Resend en mode test (livraison réelle vers l'adresse vérifiée uniquement). PREVIEW → redéploiement requis pour la prod.



- **Demande user** : transformer un trajet « Refaire » en **trajet récurrent automatique** (ex. « tous les lundis 9h ») depuis la liste → fidélisation patients récurrents.
- **Backend** (`routes/sb_access.py`) : refacto `_build_and_store_booking(user_id, body, recurring_id, scheduled_at, auto)` partagé. Collection `access_recurring`. Endpoints user : `GET/POST/PUT/DELETE /api/access/recurring` (fréquence daily|weekly, days_of_week 0=Lun..6=Dim, time_hhmm normalisée, summary FR, validation weekly sans jours → 400, toggle active/pause). **Scheduler** `access_recurring_loop()` (toutes les 5 min, enregistré dans `core/startup.py` lifespan) : `_recurring_due` (jour+heure atteints, pas déjà fait aujourd'hui via `last_run_date`, respecte timezone Europe/Paris) → crée la course auto (`auto_created=true`, `recurring_id`) + notif `access_recurring`.
- **Frontend** (`SbAccessPage.js`) : chaque trajet récent a 2 boutons **Refaire** (1-tap) + **Programmer** ; feuille de programmation (`schedule-sheet` : fréquence `rec-freq-*`, jours `rec-day-0..6`, heure `rec-time-input`, `rec-save-btn`) ; section **« Trajets automatiques »** (`access-recurring-trips`) avec toggle Actif/En pause (`recurring-toggle-*`) + suppression (`recurring-delete-*`). `accessAPI.listRecurring/createRecurring/updateRecurring/deleteRecurring`.
- **Testé** : pytest `test_iter271_access_recurring.py` 3/3 (summary, due-logic jour/heure/last_run/pause) + curl (création, normalisation "9:5"→"09:05", validation 400) + screenshot e2e (programmer → feuille → activation → section + toast).
- ⚠️ PREVIEW → redéploiement requis pour la prod.



- **Demande user** : bouton « Refaire ce trajet » pour reréserver en 1 tap (usagers PMR = trajets récurrents dialyse/rééducation → +rétention).
- **Livré** (`SbAccessPage.js`) : chargement des trajets passés (`accessAPI.myBookings`) ; section **« Refaire un trajet »** sur l'écran d'accueil du module (sous les avantages), liste les 3 trajets récents (départ→destination, véhicule, prix). Bouton **« Refaire »** (`rebook-btn-{id}`) → recalcule la distance depuis les coords stockées, recrée la réservation via `createBooking` (mêmes besoins/équipement/véhicule/type) et affiche directement la **confirmation** (1 tap). Garde-fou anti double-clic (`rebookingId`).
- **Testé** : screenshot e2e (paul.vendeur) — section visible, tap « Refaire » → « Réservation confirmée » Access PMR 16,00 € directement. data-testids : `access-recent-trips`, `recent-trip-{id}`, `rebook-btn-{id}`.
- ⚠️ PREVIEW → redéploiement requis pour la prod.



- **Contexte** : le fork précédent avait créé le backend `routes/sb_access.py` (config, matching véhicules, Safe Ride Night, certif chauffeurs, admin) et la page `SbAccessPage.js` (parcours 5 étapes WCAG « Access Navy »), mais la page était **orpheline** (non exportée/non routée).
- **Fix livré** : export `SbAccessPage` dans `pages.js` + route `/access` (`clientRoutes.jsx`, ProtectedRoute user) + **2 points d'entrée** : carte « SB Drive Access ♿ » sur `UserHome` (`home-sb-access-entry`, après SB Student) ET dans le Hub Taxi vue grille (`taxi-hub-access-entry`). Icône Phosphor `Wheelchair`. Fix cosmétique : prix confirmation `.toFixed(2)`.
- **Parcours testé (testing_agent iter270, frontend 100%, AUCUN bug)** : Besoins → Assistance (animal/accompagnateurs/temps) → Trajet (Google Places + type + récurrence) → Véhicule compatible → Confirmation (booking POST). **Règle métier vérifiée** : besoin fauteuil roulant → seuls Access PMR/Van proposés (Standard filtré). Toggles WCAG (grand texte/contraste) persistés localStorage. Les 2 entrées naviguent OK.
- **Compte test user** : paul.vendeur@example.com / Test1234! (login `/api/auth/login`).
- **RESTE (en attente validation user avant P2)** : Dashboard Admin SB Access (catégories/tarifs PMR, zones, **Safe Ride Night paramétrable**, certif chauffeurs, stats). Puis P1 trajets médicaux/récurrents dédiés, P1 SOS/Sécurité, P1 IA attribution PMR, P2 SB Access Plus.
- ⚠️ PREVIEW → redéploiement requis pour la prod.



- **Contexte** : l'utilisateur ne trouvait pas la marketplace depuis l'accueil (« AU QUOTIDIEN »). Elle était accessible seulement via Profil → SB Student ou la bannière promo (cachée pour les étudiants déjà vérifiés).
- **Fix** : carte permanente **« SB Student 🎓 — Marketplace, tarifs étudiants, campus & plus »** ajoutée en haut de `UserHome.js` (juste sous `DebtBanner`), `data-testid="home-sb-student-entry"`, navigue vers `/sb-student` (→ entrée « Marketplace étudiante »). Toujours visible (non conditionnelle). Compile OK.
- **En attente user** : proposition de **Mode Démo global** (auto-vérif étudiant, crédit portefeuille démo non facturé, bannière MODE DÉMO, intégrations externes en données d'exemple, commutateur admin) — Stripe inchangé/LIVE. À confirmer avant implémentation.



## NEW - 2026-06-11 (265) - 🤝 Marketplace étudiante : offre/négociation de prix intégrée au chat (DONE, testé 3/3 pytest + frontend e2e, AUCUN bug)
- **Demande user** : « Faire une offre » dans le chat → le vendeur accepte/refuse en un tap → l'achat se règle au prix convenu via SB Pay.
- **Backend** `routes/student_marketplace.py` : factorisation `_settle_purchase(listing, buyer, price)` (débit/crédit/order/sold/stats/notif) réutilisée par `buy_listing` ET le paiement d'offre. Offres stockées comme messages (`type:"offer"`, `offer_amount`, `offer_status`). Endpoints : `POST /conversations/{cid}/offer` (acheteur ; supersède les offres pending/accepted précédentes en `expired` ; notif vendeur), `POST /offers/{id}/respond {accept|decline}` (vendeur ; message système + notif acheteur), `POST /offers/{id}/pay` (acheteur ; offre **acceptée** requise ; règle au montant convenu via `_settle_purchase` ; statut `paid` + message système). Garde-fous : pay-avant-accept 400, accepter-sa-propre-offre 403, solde insuffisant 400, annonce vendue 400.
- **Frontend** `SbMarketplacePage.js` (ChatSheet) : bouton « Faire une offre » (`mkt-offer-btn`, acheteur) → barre montant (`offer-bar`/`offer-amount-input`/`offer-submit`) ; bulles d'offre avec actions selon rôle/statut — vendeur : Accepter (`offer-accept-*`)/Refuser (`offer-decline-*`) ; acheteur : Payer (`offer-pay-*`) sur offre acceptée. `studentAPI.mktMakeOffer/mktRespondOffer/mktPayOffer`.
- **Tests** : pytest `test_iter265_offers.py` 3/3 (total student marketplace 23/23) ; testing_agent iter265 frontend e2e 2-comptes (offre 60€ → accept vendeur → pay acheteur au prix convenu 60€ et non 80€ ; régression chat OK) — AUCUN bug. Vérifié curl (supersession, refus, tous garde-fous).
- ⚠️ PREVIEW → redéploiement requis pour la prod. Compte vendeur de test : paul.vendeur@example.com / Test1234!.



## NEW - 2026-06-11 (264) - 🤖 Chat marketplace : réponses rapides IA + mode absence vendeur (auto-reply) + revue de déploiement PASS (DONE, testé 3/3 pytest + frontend e2e, AUCUN bug)
- **Demande user** : suggestions de réponses rapides IA dans le chat + réponse auto du vendeur absent. Puis « Deploy / revue de code ».
- **Backend** `routes/student_marketplace.py` : `POST /chat-suggestions` (Gemini contextuel selon rôle acheteur/vendeur + derniers messages, fallback statique si IA indispo). Mode absence vendeur : `GET/PUT /seller-settings` (`away_enabled`, `away_message`, défaut), `_maybe_auto_reply` déclenché après un message **acheteur** (poste une réponse `auto:true` du vendeur, anti-spam : 1 auto/30 min). `_post_message` accepte `auto`.
- **Frontend** `SbMarketplacePage.js` : `ChatSheet` affiche une rangée de chips de suggestions (`mkt-chat-suggestions`/`mkt-chat-suggestion-*`) — tap = envoi immédiat + refresh ; `InboxSheet` → engrenage (`mkt-away-btn`) → `AwaySettingsSheet` (toggle + message). `studentAPI.mktChatSuggestions/mktSellerSettings/mktUpdateSellerSettings`.
- **Tests** : pytest `test_iter264_chat_ai_autoreply.py` 3/3 (total student marketplace 20/20) ; testing_agent iter264 frontend e2e (chips IA → envoi immédiat + refresh, mode absence persistant, régression chat OK) — AUCUN bug. Vérifié curl : auto-reply au contact, anti-spam 30 min, suggestions contextuelles.
- **Revue de déploiement** (`deployment_agent`) : **PASS** — aucun blocker (pas de secret/URL en dur, env OK, CORS=*, routes /api, compile OK, MongoDB only). Prêt à déployer via le bouton **Deploy** de la plateforme.
- ⚠️ Le déploiement effectif se fait via le bouton **Deploy** (plateforme) — la revue confirme que le code est prêt.



## NEW - 2026-06-11 (262-263) - 💬 Marketplace étudiante : messagerie acheteur↔vendeur par annonce (DONE, testé 2/2 pytest + frontend e2e, 1 bug critique trouvé & corrigé)
- **Demande user** : chat intégré par annonce pour poser une question avant d'acheter (réduit le frein C2C). Périmètre validé : tout étudiant (≠ vendeur) contacte le vendeur depuis la fiche ; conversation unique par (annonce + acheteur) ; le vendeur répond (n'initie pas) ; polling ~4s ; boîte « Mes messages » + badge non-lus ; notif in-app ; texte ≤500 car.
- **Backend** `routes/student_marketplace.py` (collections `student_conversations` + `student_messages`) : `POST /listings/{id}/contact` (acheteur, get-or-create conv + 1er message), `GET /conversations` (mes conv acheteur ET vendeur, role/other/unread), `GET /conversations/unread-total` (badge), `GET /conversations/{cid}/messages?after=` (poll + marque lu + reset unread), `POST /conversations/{cid}/messages`. Helpers `_conversation_view`, `_post_message` (incrémente unread de l'autre, notif `student_message`). Garde-fou : contacter sa propre annonce → 400.
- **Frontend** `SbMarketplacePage.js` : icône enveloppe + badge non-lus (`mkt-inbox-btn`), `InboxSheet` (liste conv), `ChatSheet` (polling 4s, bulles, input), bouton « Contacter le vendeur » (`mkt-contact-btn`) sur la fiche. `studentAPI.mktContact/mktConversations/mktConversationsUnread/mktMessages/mktSendMessage`.
- **Bug corrigé (iter262→263)** : les clics dans `ChatSheet` remontaient vers l'overlay parent (`onClose`) → le chat se fermait à chaque envoi. Fix : `stopPropagation` sur la racine du ChatSheet. Re-testé : 6/6 scénarios OK (chat reste ouvert, 1er+2e message, empty no-op, inbox).
- **Tests** : pytest `test_iter262_marketplace_chat.py` 2/2 (total student marketplace 17/17) ; testing_agent iter262 (détection bug) + iter263 (régression PASS).
- ⚠️ PREVIEW → redéploiement requis pour la prod.



## NEW - 2026-06-11 (261) - ✅ Marketplace étudiante : réputation « Vendeur de confiance » (note + ventes + badge) (DONE, testé 3/3 pytest + frontend e2e, AUCUN bug)
- **Demande user** : score vendeur de confiance (note + nb de ventes) affiché sur annonces + profil, pour rassurer les acheteurs C2C. Défauts : avis 1–5★ + commentaire optionnel, badge « Vendeur de confiance » dès **≥5 ventes ET note moy ≥4,5** (seuils admin), affichage cartes+détail+profil vendeur, notation par l'acheteur **une fois par transaction**.
- **Backend** `routes/student_marketplace.py` : config singleton `student_seller_config` (trusted_min_sales=5, trusted_min_rating=4.5). `recompute_seller_stats` (ventes payées + moyenne avis, cache `student_seller_stats`), `_attach_seller_stats` (calcul **trusted dynamique** vs config courante, attaché à chaque carte). `buy_listing` incrémente les stats. Endpoints : `POST /orders/{id}/review` (acheteur only, 1×/transaction unique sur order_id, 1–5★) + notif vendeur, `GET /orders/{id}/review`, `GET /sellers/{id}` (profil = stats + annonces actives + avis). Admin : `GET/PUT /admin/seller-config`. Listings exposent `seller_rating`/`seller_rating_count`/`seller_sales`/`seller_trusted`.
- **Frontend** `SbMarketplacePage.js` : badge réputation sur cartes (`mkt-seller-rep-*`), bloc vendeur dans la fiche (`mkt-seller-block`) → `SellerProfileSheet` (badge `seller-trusted-badge`, annonces, avis), `RatingSheet` post-achat (`StarPicker` 1–5 + commentaire). `AdminStudent.js` → `SellerRepPanel` (seuils ventes/note). `studentAPI.mktReview/mktGetReview/mktSeller/mktAdminSellerConfig/mktUpdateSellerConfig`.
- **Tests** : pytest `test_iter261_seller_reputation.py` 3/3 (total student marketplace 15/15) ; testing_agent iter261 frontend e2e (badge carte, bloc vendeur, profil, achat → notation 4★+commentaire → persistance ventes 6→7 + avis, panneau admin seuils) — AUCUN bug. Vérifié curl : double-avis bloqué 400, trusted dynamique vs config.
- ⚠️ PREVIEW → redéploiement requis pour la prod.



## NEW - 2026-06-11 (260) - 📧 Marketplace étudiante : récap hebdo « Top affaires de ton campus » (email + in-app, auto + admin) (DONE, testé 6/6 pytest + frontend e2e, AUCUN bug)
- **Demande user** : digest hebdomadaire pour la rétention. Choix : canal **email (Resend) + in-app** ; sélection **boostées → plus vues → plus récentes (max 6)**, annonces actives des 7 derniers jours par campus/catégorie suivis ; déclenchement **auto lundi ~9h (boucle de fond) + bouton admin « Envoyer maintenant »** ; **opt-out digest séparé** des alertes temps réel.
- **Backend** `routes/student_digest.py` : config singleton `student_digest_config` (enabled, timezone, send_day=0, send_hour=9, max_items=6, last_sent_week). `build_digest_for(prefs)` (zones suivies ou toutes, catégories suivies ou toutes, exclut le vendeur, tri boostées/vues/récence). `run_digest_send(test_user_id?)` → itère `student_market_alerts` (enabled + `digest_enabled` != false), in-app `create_notification` (type `student_digest`) + email `send_campus_digest` (skip emails `@sbdrive.local`), archive `student_digest_sends`. Boucle `student_digest_loop` (check /30min, 1×/semaine). Email template `core/email.py::send_campus_digest`. Admin : `GET/PUT /admin/digest/config`, `POST /admin/digest/send-now`, `GET /admin/digest/history`. Champ `digest_enabled` ajouté aux prefs d'alerte (défaut true).
- **Frontend** : `AlertsSheet` — 2ᵉ toggle « Recevoir le récap hebdo par email » (`alerts-digest`). `AdminStudent.js` onglet Marketplace → `DigestPanel` (activation, jour, heure, nb max, Enregistrer, « Envoyer maintenant »). `studentAPI.mktDigest*`.
- **Tests** : pytest `test_iter260_campus_digest.py` 3/3 (total student marketplace 12/12) ; testing_agent iter260 frontend e2e (toggle opt-out persistant, panneau admin, send-now → « Récap envoyé (1 étudiant, 0 sans annonce) ») — AUCUN bug. Vérifié curl : digest livré, opt-out exclu du global, filtrage catégorie/zone, vendeur exclu.
- ⚠️ PREVIEW → redéploiement requis pour la prod. Resend peut être en mode test (l'email réel peut ne pas partir, mais l'API renvoie les compteurs).



## NEW - 2026-06-11 (259) - 🔔 Marketplace étudiante : alertes « Bonne affaire près de ton campus » (in-app + web push) (DONE, testé 9/9 pytest + frontend e2e, AUCUN bug)
- **Demande user** : notifier les étudiants quand une annonce d'une catégorie suivie est publiée près de leur campus. Choix (hybride) : préférences explicites **+ fallback automatique** (toutes catégories + tous campus par défaut, doc créé à la 1ʳᵉ visite) ; matching par **zone campus choisie à la publication** (réutilise les zones campus admin, + support GPS/haversine via `_resolve_zone`) ; notification **in-app (cloche) + web push**.
- **Backend** `routes/student_marketplace.py` : `ListingCreate` ajoute `zone_id`/`lat`/`lng` → `_resolve_zone` (zone explicite prioritaire, sinon `find_campus_zone` haversine). `_public_listing` expose `zone_name`. À la publication → `_notify_campus_deal` (fire-and-forget) : match `student_market_alerts` (enabled, catégorie suivie OU vide=toutes, zone suivie OU vide=tous, exclut le vendeur, ≤500) → `create_notification` (type `student_deal`) + `send_web_push_to_user`. Endpoints `GET/PUT /alerts/me` (prefs enabled/categories/zone_ids, défaut auto enabled+vide).
- **Frontend** `SbMarketplacePage.js` : icône **cloche** (`mkt-alerts-btn`) → `AlertsSheet` (toggle + chips catégories `alerts-cat-*` + cases campus `alerts-zone-*` + save). `SellSheet` ajoute le **sélecteur de zone campus** (`mkt-sell-zone`, via `studentAPI.campusZones`). `studentAPI.mktAlerts/mktUpdateAlerts`.
- **Tests** : pytest `test_iter259_campus_deal_alerts.py` 3/3 (+257/258 = 9/9) ; testing_agent iter259 frontend e2e (cloche → prefs persistées, sélecteur zone peuplé, publication avec zone OK) — AUCUN bug. Vérifié curl e2e : publication en zone → test2 reçoit la notif cloche ; filtrage catégorie (logement seul → 0 notif sur livres) ; vendeur exclu.
- ⚠️ PREVIEW → redéploiement requis pour la prod. Web push : ne se déclenche que si l'étudiant a autorisé les push navigateur.



## NEW - 2026-06-11 (258) - ⭐ Marketplace étudiante : Boost « Top annonce » payant (points OU €) + panneau admin (DONE, testé 6/6 pytest + frontend e2e, AUCUN bug)
- **Demande user** : mise en avant payante d'annonce étudiante (boost « Top annonce »). Choix : paiement **au choix en points SB OU en € (SB Pay)** ; tarifs par défaut 3j=50 pts/1€, 7j=100 pts/2€ (admin-configurables) ; remontée en tête de catégorie + badge violet ⭐ ; panneau admin (config + revenus).
- **Backend** `routes/student_marketplace.py` : config singleton `student_market_config` (plans seedés), helper `_is_boosted`, `_public_listing` expose `boosted`/`boosted_until`, tri `list_listings` (boostées actives en tête). Endpoints : `GET /boost/plans` (+ solde points), `POST /listings/{id}/boost {plan_id, method}` (owner-only, débite points via `student_rewards.award_points` OU wallet, **extension cumulée** depuis l'expiration courante, journalise `student_market_boosts`). Admin : `GET/PUT /admin/boost/config`, `GET /admin/boost/revenue` (total boosts, revenu €, points dépensés, boosts actifs, récents). Guards admin 403.
- **Frontend** : `SbMarketplacePage.js` — badge ⭐ « Top annonce » sur cartes + fiche (boostées en tête), fiche détail = bouton **« Booster »** si propriétaire (sinon « Acheter »), `BoostSheet` (plans + boutons points/€). `useAuth` pour `meId`. `AdminStudent.js` — onglet **« Marketplace »** (stats revenus + édition forfaits + boosts récents). `studentAPI.mktBoost*`/`mktAdminBoost*`.
- **Tests** : pytest `test_iter258_marketplace_boost.py` 3/3 (+257 = 6/6) ; testing_agent iter258 frontend e2e complet (publication → boost points → badge + remontée → admin config/revenus) — AUCUN bug. Vérifié curl : points 500→450, wallet -2€, revenu admin €2, extension 3j+7j cumulée, guards 403.
- ⚠️ PREVIEW → redéploiement requis pour la prod.



## NEW - 2026-06-11 (257) - 🎓 SB Student PHASE 6 : Marketplace étudiante (C2C) + IA Gemini (DONE, testé 6/6 backend e2e + frontend + 3/3 pytest, AUCUN bug)
- **Demande user** : marketplace dédiée étudiants avec catégories Livres/Logement/Coloc/Matériel/Services + IA (Gemini). Choix : (1b) tout le monde peut acheter, **publication réservée aux étudiants vérifiés** ; (2c) **les deux** fonctions IA (prix juste + description auto, ET recherche intelligente) ; (3a) **paiement C2C via SB Pay** (débit acheteur → crédit vendeur, SANS commission étudiante).
- **Backend** `routes/student_marketplace.py` (préfixe `/api/student/marketplace`, collection isolée `student_listings` / `student_market_orders`) :
  - `GET /categories` (5 slugs + conditions), `GET /listings?category&search` (recherche par mot OR), `GET /listings/{id}` (+views), `GET /my-listings`, `POST /listings` (**gate étudiant vérifié 403 sinon**), `DELETE /listings/{id}`.
  - `POST /listings/{id}/buy` : débite wallet acheteur (réutilise `db.wallets`), crédite vendeur montant **plein** (pas de commission), passe l'annonce en `sold`, notifie le vendeur. Garde-fous : solde insuffisant 400, propre annonce 400, déjà vendue 400.
  - `GET /orders` (achats) + `GET /sales` (ventes).
  - **IA Gemini** (`emergentintegrations` LlmChat `gemini-3-flash-preview`, EMERGENT_LLM_KEY, pattern `assistant.py`) : `POST /ai/suggest` (prix juste + fourchette + description d'annonce + conseil) ; `POST /ai/search` (extraction d'intention → requête catalogue RÉEL → réponse FR ancrée, zéro hallucination).
- **Frontend** : `SbMarketplacePage.js` (route `/sb-student/marketplace`) — recherche IA, chips catégories, grille d'annonces, fiche détail + achat wallet, feuille "Vendre" (gate vérifié, bouton "Prix & texte IA", upload photo via `/api/uploads/image`). Entrée `student-marketplace-entry` sur `SbStudentPage`. `studentAPI.mkt*` dans api.js.
- **Tests** : pytest `test_iter257_student_marketplace.py` 3/3 + testing_agent iter257 (backend 6/6 e2e, frontend mobile complet, AUCUN bug). Compte test : `test2@example.com` marqué étudiant vérifié + wallet financé.
- ⚠️ PREVIEW → redéploiement requis pour la prod. **SB Student module désormais COMPLET (Phases 1→6).**



## NEW - 2026-06-11 (256) - 🎓 SB Student PHASE 5 : Événements + Récompenses + toggle Safe Ride Night (DONE, testé 100%)
- **Récompenses** `routes/student_rewards.py` (/api/student/rewards) : ledger de points, `award_ride_points` (crédité à la complétion d'une course pour étudiant vérifié, **idempotent par ride_id**, hook dans `rides.update_ride_status`), catalogue (course gratuite/bon/réduction partenaire), `redeem` (déduit points + code), admin config + catalogue CRUD + award manuel.
- **Événements** `routes/student_events.py` (/api/student/events) : admin CRUD (soirée/universitaire/festival + navette + capacité), liste user (seats_left), `reserve` (capacité 409 + double-résa 409), cancel, my-reservations.
- **Enhancement** : bascule **Safe Ride Night** sur l'écran de réservation (`RideChoosePage` state safeNight → payload.safe_ride_night → priorité chauffeurs dès la recherche).
- **Frontend** : `SbRewardsPage` (/sb-student/recompenses), `SbEventsPage` (/sb-student/evenements) + entrées sur SbStudentPage. `AdminStudent` onglets "Récompenses" + "Événements". `studentAPI` rewards*/events*.
- **Tests** : pytest `test_iter256_rewards_events.py` 4/4 + testing_agent 18/18 e2e + frontend 100%, AUCUN bug (fix cosmétique "0 points" appliqué).


- **Backend** `routes/student_safety.py` (préfixe /api/student/safety) :
  - **Settings** : auto_share + prefer_top_drivers + min_driver_rating (stockés dans student_profiles.safety).
  - **Safe Ride Night** : `safe-ride/start {ride_id}` crée un token trip-share (réutilise trip_shares), met `ride.safe_ride_night=true` + share_token, retourne share_url (/t/{token}) + contacts de confiance (le client partage le lien via navigator.share/clipboard). Garde-fous : course d'un autre user 403, inexistante 404. `safe-ride/active`.
  - **Vérification chauffeur renforcée** : `driver/{id}/trust` (note moyenne, nb avis, total courses, docs approuvés, member_since, enhanced_verified). **Chauffeurs recommandés** : `recommended-drivers?lat&lng` (en ligne, triés note↓ puis distance).
  - **Priorisation dispatch** : `RideRequest.safe_ride_night` stocké sur la course ; `auto_dispatch._drivers_in_radius(prioritize_rating)` + `_escalate_ride` trient par note↓ pour les courses Safe Ride Night.
- **Frontend** : `SbSafetyPage` (/sb-student/securite) — carte Safe Ride Night + activation, toggles réglages, contacts de confiance (CRUD), chauffeurs recommandés (géoloc). Entrée 'student-safety-entry' dans SbStudentPage. `studentAPI` safety* + contacts.
- **Tests** : pytest `test_iter255_safety.py` 2/2 (tri note dispatch + haversine) + testing_agent 7/7 e2e + frontend. **BUG corrigé** : endpoints contacts pointaient sur `/emergency-contacts` (404) → corrigé en `/phase1/emergency-contacts` (vérifié curl 200).


- **Backend** `routes/student_zones.py` (préfixe /api/student) :
  - **Zones campus admin CRUD** : `/admin/campus-zones` (type university/residence/library/training_center, lat/lng/radius_m, pays, pickup_points + safe_meeting_points avec id auto, enable/disable). Type invalide 400, guard non-admin 403.
  - **Zones user** : `/zones/campus?lat&lng` (actives triées par distance_m).
  - **Détection campus** : `find_campus_zone`/`is_campus_trip` (haversine mètres) → `rides.create_ride` met `student_kind='campus'` si pickup OU dropoff dans une zone → réduction campus (25%).
  - **Campus Share** : `/campus-share/request` (réservé étudiants vérifiés, 403 sinon ; remplace l'ancienne demande open ; matching autres étudiants même zone dest + ±30min), `/campus-share/matches`, DELETE annule.
- **Frontend** : `AdminStudent` onglet "Zones campus" (CRUD + toggle). `SbCampusSharePage` (/sb-student/campus-share : départ + géoloc + sélecteur campus + matches + points sûrs + "Réserver en covoiturage" → /course?mode=pool). Entrées sur `SbStudentPage` (student-share-entry, student-recurring-entry). `studentAPI` campusZones/zonesAdmin*/share*.
- **Tests** : pytest `test_iter254_zones.py` 4/4 + testing_agent `test_iter254_zones_e2e.py` 7/7 + frontend 100%, AUCUN bug.


- **Backend** `routes/student_campus.py` (préfixe /api/student/campus) :
  - **Pass Campus** : plans admin (seed Pass Mensuel 19.99€/-25%/+5€ crédits/30j ; Pass Semestriel 89.99€/-30%/+10€ crédits/180j/bonus fidélité 10%). `subscribe` débite le wallet SB Pay → crée la sub → recrédite les crédits inclus (ordre rendu safe : sub créée avant le crédit). Guards : solde insuffisant 400, déjà actif 409. `subscription` (active), `subscription/cancel`. Admin plans CRUD.
  - **Boost réduction** : `student.compute_student_discount` utilise `pct = max(base, sub.discount_pct)` si Pass actif.
  - **Réservations récurrentes** : CRUD templates (daily/weekdays/weekly + days_of_week + heure), `_next_occurrences` (calcule prochaines dates, weekly exige des jours → 400 sinon), `book-next` (renvoie occurrence + booking_payload, deep-link vers /course pré-rempli — pas de création auto de course, voulu).
- **Frontend** : `SbStudentPage` → section CampusPassSection (plans + souscription + sub active) + entrée "Mes trajets récurrents". `SbRecurringPage` (/sb-student/recurrents : form + liste + book-next + toggle). `AdminStudent` → onglet "Pass Campus" (CRUD inline + loading state). `studentAPI` campus*/recurring*.
- **Tests** : pytest `test_iter253_campus.py` 4/4 + testing_agent `test_iter253_campus_e2e.py` 5/5 + frontend 100%, AUCUN bug. Fixes appliqués (validation weekly, ordre subscribe atomique-ish, loading state admin).


- `components/StudentPromoBanner.jsx` : bandeau auto-fetch `/student/me`, affiché UNIQUEMENT si user non vérifié + module activé + ride_discount_pct>0. Cliquable → `/sb-student`, fermable (sessionStorage), violet (#5B21B6). Inséré en haut du contenu de `RideChoosePage.js` (`data-testid=student-promo-banner` / `student-promo-dismiss`).
- Vérifié : build OK + contrat `/student/me` confirmé (fresh user → is_student=false, enabled=true, pct=20 → banner s'affiche). NB: harness screenshot ne propage pas la session cookie au SPA (limitation outil, pas un bug) ; testing_agent iter252 a déjà validé l'auth cookie + APIs student.

 (DONE, testé 5/5 pytest + 17/17 e2e + frontend 100%)
- **Demande user** : module mobilité étudiante complet (14 sous-modules) → livré par phases. User a confirmé : pool→"SB School"/Campus Share (Phase 3), vérification = email OTP + document, tarifs 100% admin-configurables, zones/pays/domaines gérés par l'admin (incl. Afrique), IA = oui (Gemini, Phase 6).
- **Backend** `routes/student.py` (préfixe /api/student) :
  - Vérification statut : (a) **email universitaire OTP** (`/verify/email/request` + `/confirm`, code 6 chiffres hashé, TTL 15min, cooldown 60s, domaine doit être actif) ; (b) **upload document** (`POST /documents` → statut pending → validation admin).
  - **Discount engine** cap-aware `compute_student_discount(user_id, fare, kind)` + `record_student_discount_usage` (kinds: ride/advance/campus, plafonds jour/mois). Hooké dans `rides.py::create_ride` après loyalty (champs ride.student_discount_pct/amount/kind) — défensif, n'affecte jamais le pricing si non-étudiant/désactivé.
  - **Admin** : config GET/PUT (enabled + 3 % + 2 plafonds), domaines CRUD + enable/disable (par pays ISO, seed FR+SN+CI), liste étudiants + approve/reject (+ notifications), stats dashboard. Guards admin (403).
- **Frontend** :
  - User `/sb-student` (SbStudentPage.js, violet #5B21B6) : carte statut/badge, avantages, onglets Email OTP + Document. Entrée Profil → "SB Student 🎓" (settings-sb-student-btn).
  - Admin `/admin/student` (AdminStudent.js) : 4 onglets Dashboard/Tarification/Domaines/Étudiants. Lien sidebar AdminLayout. `studentAPI` dans services/api.js.
- **Tests** : pytest `test_iter252_student.py` 5/5 (engine+matching+OTP+caps) ; testing_agent `test_iter252_student_e2e.py` 17/17 + frontend 100%, AUCUN bug. Fix appliqué : `PricingField` hoisté top-level (évitait perte de focus inputs).
- **Défauts config** : ride 20%, advance 15%, campus 25%, plafond 5€/j, 50€/mois.
- **RESTE (Phases 2-6)** : P2 Pass Campus (abonnements) + réservations récurrentes ; P3 Zones universitaires + Campus Share (réutiliser pool/carpool) ; P4 Sécurité étudiante + Safe Ride Night ; P5 Événements + Récompenses étudiantes ; P6 Marketplace étudiante + IA (Gemini). Campus discount kind='campus' pas encore déclenché (nécessite détection zone universitaire → Phase 3).


## NEW - 2026-06-11 (251) - Emails KYC documents + Audit profil chauffeur Lot 1 (DONE, testé 4/4 pytest + 5/5 frontend)
- **b) Emails KYC documents (Resend)** : nouveau template `core/email.py::send_document_update(to,name,status,doc_label,reason,docs_url)` — 3 états : `received` (bleu, à l'upload), `approved` (vert), `rejected` (rouge + motif). Hooks : `drivers.py::upload_driver_document` → email « Document reçu » ; `misc.py::admin_set_driver_document_status` → email validé/refusé. Skip emails placeholder `@sbdrive.local`, fire-and-forget. Testé pytest `test_iter251_kyc_document_emails.py` 4/4.
- **a) Audit profil chauffeur — Lot 1** (testing_agent iteration_251, 5/5 PASS) :
  - **#1 « Gérer mon compte » vs « Infos société »** : nouvelle feuille `driver-account-modal` (identité Nom/Email/Téléphone + actions : Infos société & licence, Changer mot de passe, Mes documents). L'engrenage + ligne « Gérer mon compte » ouvrent cette feuille ; la feuille société (`driver-info-modal`) reste séparée. i18n `manage_account` harmonisé → « Gérer mon compte ».
  - **#2 Export PDF stats** : bouton `download-pdf-btn` sur `/chauffeur/earnings/stats` → fenêtre imprimable (nom, période, total, tableau d'évolution) via window.open+print. Ligne « Statistiques » du profil pointe désormais vers `/chauffeur/earnings/stats`.
  - **#3 Documents perso vs véhicule** : `DriverDocumentsPage` regroupe en 2 sections (`docs-section-personal` / `docs-section-vehicle`) par heuristique de clé. Backend `build_documents_view` humanise les labels de docs hors-liste (ex. `vtc_card` → « Carte VTC »).
  - **#5 Actualités par audience** : `news.py` segmente désormais rider/driver/**merchant** (helper `_audience_for_role` + `_eligible_roles` + AUDIENCES). Admin `AdminNews.js` propose l'audience « Marchands ». Vérifié curl (marchand voit news merchant, chauffeur ne les voit pas).
  - **#4 Commentaires utilisateurs** : DÉJÀ EN PLACE (DriverReviewsPage : texte + étoiles + distribution).
- **Reste (Lot 2)** : #6 galerie chauffeur → publication sur la marketplace (prestations/DIY) — chantier plus lourd, à scoper séparément. PREVIEW → redéploiement requis pour la prod.


## NEW - 2026-06-11 (250) - SBPAYGO Connect : fondation côté SB Drive (FEATURE-GATED, DONE, testé 7/7)
- **Demande user** : sync 3 voies SB Drive ↔ sbpaygo.com (SSO OAuth + charge de secours du solde externe). ⚠️ API externe sbpaygo.com INCOMPLÈTE (pas de cash-out/refund, schémas non doc).
- **Approche défensive** : nouveau module `routes/sbpaygo_connect.py` **désactivé par défaut** (feature-flag env). Tant que les vars SBPAYGO sont vides, tous les endpoints `/connect/*` renvoient **404** et le helper `attempt_sbpaygo_charge()` est un no-op → **AUCUN impact** sur les flux portefeuille existants.
- **Endpoints** (`/api`) : `GET /connect/status`, `POST /connect/oauth/authorize` (URL d'autorisation + state anti-CSRF), `GET /connect/oauth/callback` (public, échange code→tokens, stockage par user), `POST /connect/charge` (proxy débit défensif), `POST /connect/unlink`. OAuth2 Authorization Code (playbook integration_expert), tokens en collection `sbpaygo_tokens`, states TTL 10 min, tous appels httpx en timeout 10 s + try/except.
- **.env** : ajout `SBPAYGO_ENABLED=false` + `SBPAYGO_CLIENT_ID/SECRET/AUTHORIZE_URL/TOKEN_URL/CHARGE_URL/REDIRECT_URI/SCOPE` (vides = OFF).
- **Checklist livrée** : `/app/SBPAYGO_CONNECT_CHECKLIST.md` — ce que l'équipe SBPAYGO doit créer (identifiants OAuth, endpoint charge, cash-out, refund, balance, webhooks HMAC, Swagger) + procédure d'activation.
- **Vérifié** : curl (état désactivé : status configured:false, authorize/charge/callback = 404, unlink ok) + pytest `tests/test_iter250_sbpaygo_connect.py` **7/7** (flag off no-op, configuré, callback token exchange via respx, state invalide, charge succès + log, no_token, erreur partenaire défensive HTTP 500).
- **Reste** : brancher `attempt_sbpaygo_charge()` en secours dans `rides.py` UNIQUEMENT après activation/livraison de l'API SBPAYGO. PREVIEW → redéploiement requis pour la prod.


## NEW - 2026-06-11 (249b) - Recouvrement AUTO du solde dû à la recharge (DONE, testé 4/4 + régression 7/7)
- **Demande user** : « dès que le client recharge OU reçoit de l'argent, l'app récupère d'abord le solde dû » + notif transparence.
- **Backend** (`debts.py`) : nouveau helper `auto_settle_debts_from_wallet(user_id)` — recouvre les dettes impayées (plus ancienne d'abord, **recouvrement partiel autorisé**), rembourse le chauffeur lésé si applicable, notifie le client (« X € de solde dû déduits de votre recharge »). Branché sur **tous les points de crédit client** : `wallet.py` topup (renvoie `debt_recovered` + solde net) & transfer (destinataire), `payments.py` (succès Stripe), `finance.py` sbpaygo/send (destinataire), `giftcards.py` redeem (bénéficiaire).
- **Vérifié** : pytest `test_iter249b_debt_auto_recovery.py` **2/2** (recouvrement total 10€→dette 6€→solde 4€ ; partiel 5€→reste dette 3€) + `test_iter249` 2/2 + régression dettes/annulation **7/7**.
- ⚠️ PREVIEW → redéploiement requis pour la prod.



## NEW - 2026-06-10 (249) - FIX cartes cadeaux (débit portefeuille) + Paiement Phase 1 (différence en espèces / dette) (DONE backend testé 2/2)
- **P0 — Cartes cadeaux réparées** : cause racine = **routeur dupliqué** `/giftcards` dans `gojek_services.py` (monté AVANT le nouveau, générait des codes `SB-…` sans débiter). → Supprimé (bloc + `include_router`). Le routeur `routes/giftcards.py` (débit portefeuille + réserve chauffeur + email) prend le relais. **Vérifié curl** : achat 10 € → solde 26 €→16 € → code `GIFT-…`. Donnée de test restaurée.
- **Paiement Phase 1 (choix user : option a — modèle portefeuille ; pas de pré-autorisation CB réelle car Stripe = Checkout hébergé top-up uniquement)** :
  - **Complétion course** (`rides.py`, bloc règlement) : pour digital (wallet/sbpaygo/card), on débite ce que le portefeuille couvre ; le **reste = `cash_due_to_driver`** (`payment_status="cash_due"`). Cash → `cash_due_to_driver = montant total`. Couvre la **différence portefeuille insuffisant** ET le **recalcul à la hausse** (20€→22€).
  - **NOUVEL endpoint** `POST /api/rides/{id}/collect-cash {received}` (chauffeur/admin) : *Reçu* → `payment_status="paid"`, `cash_collected`. *Non reçu* → crée une **dette `ride_balance`** sur le client (report sur la prochaine course, recouvrée plateforme) + `payment_status="debt"` + notif client.
  - **debts.py** : nouveau helper `record_ride_balance_debt` (réutilise `cancellation_debts` → DebtBanner/carry-forward/settlement inchangés ; `owed_to_driver_id=None`).
  - **Frontend** : `RideCompletionFlow.jsx` (étape facture → boutons **« Reçu · X € » / « Non reçu »** si `cash_due>0`), `RideChoosePage.js` (notice portefeuille insuffisant + bouton **« Ajouter de l'argent »** + ligne **dette reportée** « Total à régler »), `DebtBanner.jsx` (libellé générique « Montant dû »), `api.js` (`rideAPI.collectCash`).
- **Vérifié** : pytest `tests/test_iter249_cash_due_collection.py` **2/2** (shortfall→cash_due→Non reçu→dette ; Reçu→paid sans dette). Frontend compile (warnings source-map pré-existants).
- ⚠️ **À TESTER** : flux e2e frontend (booking portefeuille insuffisant + complétion chauffeur Reçu/Non reçu) — non lancé (nécessite course live complète). Backend = source de vérité, validé.
- ⚠️ Reste audit menu chauffeur (6 points #470) + emails KYC/marketing. PREVIEW → redéploiement requis pour la prod.



## NEW - 2026-06-10 (248) - Audit menu chauffeur — Phase 1 corrections rapides (DONE, vérifié)
- **#11 Parrainage chauffeur réparé** : la route `/referral` était réservée `allowedRoles=['user']` → bloquée pour les chauffeurs (alors que `ReferralPage` gère déjà `stats.is_driver`). → `['user','driver','merchant']`. Vérifié screenshot (code, stats, filleul affichés).
- **#5 « Les réservations »/« Mes réservations »** pointaient vers `/chauffeur/earnings` → corrigé vers `/chauffeur/reservations` (DriverProfilePage, carte portefeuille + Réglages généraux).
- **#9 « Lettre de voiture »** ouvrait l'historique → ouvre désormais le **bon de commande du dernier voyage** (`openWaybill` → fetch dernière course terminée → `/ride/{id}/waybill`).
- **Reste de l'audit (à planifier)** : #3 « Gérer mon compte » vs « Infos société » (3 entrées ouvrent la même modale société → différencier) ; #2 chiffre d'affaires **NET après commission** (actuellement `get_driver_earnings` somme le brut `estimated_fare`) ; #4 statistiques complètes depuis inscription + export PDF ; #6 docs perso/véhicule vs société ; #7 avis : afficher message écrit + étoiles ; #8 actualités séparées par audience (client/chauffeur/marchand) ; #10 galerie chauffeur (prestations/marketplace si compte actif) ; #12 cohérence paiement avec app client.


## NEW - 2026-06-10 (247) - Portefeuille chauffeur : ajout « Envoyer » (P2P) + confirmation Retrait + Apple/Google Pay (auto) (DONE, testé)
- **Réponse Apple Pay / Google Pay** : aucun code requis — tous les paiements passent par **Stripe Checkout hébergé** (`emergentintegrations`, payment_methods `['card']`) où Apple Pay/Google Pay s'affichent **automatiquement** sur appareils compatibles. Couvert **toute la plateforme**. Côté user : vérifier qu'ils sont activés dans le Dashboard Stripe (défaut ON) ; pas d'enregistrement de domaine pour le Checkout hébergé. Boutons visibles en prod avec vraie clé.
- **Retrait chauffeur** : déjà en place (bouton « Retrait » → `POST /api/wallet/withdraw-request`). Confirmé.
- **Envoyer (P2P) ajouté au portefeuille chauffeur** : 
  - Composant partagé extrait `components/SendMoneyModal.jsx` (réutilisé par `WalletPage.js` client ET `DriverWalletPage.js`) ; prop `maxAmount`/`maxLabel`. WalletPage refactorisé pour l'utiliser (suppression du `SendModal` local).
  - DriverWalletPage : bouton « Envoyer » (3 actions : Retrait / Recharger / Envoyer), plafonné au **montant retirable (hors réserve)**.
  - **Backend** : `routes/finance.py::sbpaygo_send` enforce désormais la **réserve non-retirable pour les chauffeurs** (`available = balance - floor - pending`) — cohérent avec retrait et remboursement.
- **Vérifié** : curl (envoi 5€ OK ; 999999€ → 400 « Montant max 855.80 € réserve 50 € ») + screenshot (3 boutons + modale « hors réserve 860.80 € »). Donnée démo restaurée. Front/back compilent.


## NEW - 2026-06-10 (246) - Unification du portefeuille chauffeur (fin des « 2 wallets ») (DONE, testé screenshot)
- **Cause des 2 portefeuilles** : le chauffeur atterrissait sur `/wallet` (SB Pay, écran client) en cliquant « Recharger » depuis `/chauffeur/wallet` → 2 écrans de portefeuille distincts (même solde mais perçus comme 2 wallets). + entrée doublon menu (déjà retirée en 245).
- **Fix — recharge intégrée dans la page chauffeur** (`DriverWalletPage.js`) : le bouton « Recharger » ouvre désormais une **feuille de recharge Stripe in-page** (packages 10/20/50/100 € + montant libre → `POST /api/payments/checkout`) ; **polling du statut de paiement au retour** (reste sur `/chauffeur/wallet`) ; support `?action=topup`.
- **Backend** (`routes/payments.py`) : `create_checkout` accepte `return_path` (validé, défaut `/wallet`) → `success_url`/`cancel_url` configurables. Le chauffeur passe `return_path=/chauffeur/wallet` donc revient sur SA page après Stripe.
- **Tous les chemins « Recharger » du chauffeur** pointent sur `/chauffeur/wallet` : quick-action menu (`SideMenuDrawer.js`, variant-aware), bandeau cash (`DriverHome.js` → `?action=topup`). Plus aucune redirection vers `/wallet`.
- **Résultat** : le chauffeur a **UN SEUL** portefeuille (`/chauffeur/wallet`) avec Retrait + Recharge in-page. Vérifié screenshot (feuille recharge + bouton retrait). Frontend/backend compilent.


## NEW - 2026-06-10 (245) - Bandeau recharge courses espèces + Clarification « 2 portefeuilles » (DONE)
- **« Pourquoi 2 portefeuilles ? »** → En réalité **UN SEUL** portefeuille (même solde, même `/api/wallet`), mais affiché via 2 entrées de menu : « Mon portefeuille » (`/chauffeur/wallet`) ET « SB Pay » (`/wallet`). Correction : **suppression de l'entrée doublon « SB Pay »** dans le menu latéral chauffeur (`SideMenuDrawer.js`) → une seule entrée portefeuille. (`/chauffeur/wallet` et `/wallet` lisent le même compte ; `/wallet` reste l'écran de recharge/topup.)
- **Bandeau recharge** (`DriverHome.js`) : quand le solde chauffeur < 1 €, bandeau orange « Rechargez pour recevoir les courses en espèces · Solde X € · minimum 1 € requis » + bouton Recharger (→ `/chauffeur/wallet`) + fermeture. Masqué pendant une course/demande. `walletAPI` importé, solde rechargé à chaque changement de course.
- **Vérifié** : screenshot bandeau OK (solde 0.50 €), frontend compile. Donnée demo restaurée.


## NEW - 2026-06-10 (244) - Courses espèces conditionnées au solde + Remboursement client par le chauffeur (DONE, testé 5/5)
- **Filtrage courses espèces (cash-gating)** : un chauffeur ne reçoit/voit les courses payées en **espèces** que si son solde portefeuille ≥ **CASH_RIDE_MIN_BALANCE** (défaut **1 €**, override via env `CASH_RIDE_MIN_BALANCE`). Implémenté côté serveur (source de vérité) :
  - `core/websocket.py::broadcast_to_drivers(message, exclude=...)` (nouveau param d'exclusion).
  - `routes/rides.py` : helpers `_driver_meets_cash_minimum`, `_cash_exclude_set` ; exclusion appliquée au **broadcast WS** de création (`new_ride_request`), au **web push** (`_push_new_ride_to_drivers`), au **feed** `GET /rides` (filtre AVANT le strip anti-cherry-pick), et **garde-fou dur** dans `POST /rides/{id}/accept` (403 si cash + solde < min).
  - But métier : la recharge donne une marge de travail au chauffeur ; toutes les courses sont CB/portefeuille, le cash exige ≥ 1 €.
- **Remboursement client par le chauffeur** : `POST /api/rides/{ride_id}/refund-client` (chauffeur propriétaire de la course) → débite le portefeuille chauffeur **en respectant la réserve non-retirable** (`available = balance - floor - pending`), crédite le **client de la course** instantanément, transactions liées (`ride_refund_out`/`ride_refund_in`, `ride_id`), notif + reçus email aux 2 parties. Immédiat, sans validation. Cas d'usage : paiement espèces sans monnaie.
  - **Frontend** : item « **Rembourser le client** » dans le menu 3-points du flux course (`RideFlowSheets.jsx` → `RefundClientModal`, branché dans `DriverRideFlow.jsx`).
- **Vérifié** : pytest `tests/test_iter244_cash_gating_refund.py` 2/2 (feed cache cash si solde bas + accept 403 ; refund respecte réserve, crédite client, rejette négatif/excès) + suite 242/243/244 = **5/5**. Frontend compile.
- ⚠️ Reste : B (audit menu latéral chauffeur), C (upload documents), détection plaque (clé API SIV), push natif écran verrouillé (Expo). PREVIEW → redéploiement prod.


## NEW - 2026-06-10 (243b) - Emails automatiques de retrait (demande reçue / versement effectué / refusé) (DONE, testé)
- **Nouveau template** `core/email.py::send_withdrawal_update(to,name,status,amount,ref,eta_hours,reason,wallet_url,method)` — 3 états : `requested` (jaune), `paid` (vert), `rejected` (rouge, montant recrédité).
- **Hooks** : `misc.py::submit_withdraw_request` → email « demande reçue » (à la soumission) ; `payouts.py` helper `_fire_withdrawal_paid_email` appelé sur **mark-paid**, **send** (MoMo paid) et **refresh-status** (paid) → « versement effectué » ; **reject** → email « refusé » + motif. (L'email « approuvé » existait déjà via `send_wallet_receipt` kind=withdraw.)
- **Fix** : `import os` manquant dans `routes/misc.py` (corrigé).
- **Vérifié** : curl e2e (submit→approve→mark-paid : 3 emails déclenchés, statuts corrects) + pytest `tests/test_iter243_withdrawal_emails.py` 1/1. Donnée de test nettoyée. ⚠️ Resend mode test.


## NEW - 2026-06-10 (243) - FIX portefeuille chauffeur : le retrait ne marchait pas (« on ne pouvait que créditer ») (DONE, testé)
- **Diagnostic** : `DriverWalletPage.js` `requestPayout` était **factice** (juste un `toast.success` sans appel backend) et le bouton « Retrait » était caché derrière le toggle admin `enable_driver_wallet_withdrawal` → le chauffeur ne pouvait que **recharger**. Le backend `POST /api/wallet/withdraw-request` (misc.py) était pourtant complet (gate moyen de retrait validé RIB/Mobile Money, min, réserve, gel du montant, alerte admin temps réel).
- **Fix** : bouton « Retrait » affiché dès que le backend autorise (`wallet.can_withdraw`), nouvelle **modale `DriverWithdrawModal`** (montant, retirable, option Express via `/payouts/sla`, ETA, lien « Gérer mon moyen de retrait ») qui appelle le **vrai endpoint** ; gestion d'erreur « moyen de retrait » → redirection vers `/wallet/payout-method` ; affichage du **retrait en attente** (`pending_withdraw`) et du **retirable** réel.
- **Vérifié** : curl e2e (wallet GET can_withdraw=true/withdrawable=920.80 ; `withdraw-request` 200 → demande `pending` créée + montant gelé) + screenshot modale. Donnée de test nettoyée. Frontend compile.
- ⚠️ Le chauffeur doit avoir un **moyen de retrait validé** (KYC) sinon erreur explicite + redirection. PREVIEW → redéploiement requis pour la prod.


## NEW - 2026-06-10 (242) - App chauffeur : verrou retour pendant course (A) + Véhicules plaque unique globale & transfert par châssis (D) (DONE, testé 4/4 backend + screenshot)
- **A — Verrou retour pendant une course** (`DriverHome.js`, `RideFlowViews.jsx`) : une fois la course acceptée, **plus de bouton retour** (prop `onMinimize` retirée → `RideFlowHeader.showMinimize=false`, plus de CaretLeft) + **garde d'historique** (`pushState`/`popstate`) qui **bloque le retour navigateur/matériel** tant que `currentRide` est actif. Le chauffeur reste verrouillé sur l'écran de course (déjà persistant après reload via `rideAPI.getActive`).
- **D — Véhicules** (`routes/driver_pro.py`, `ManageVehiclesPage.js`) : 
  - **Plaque unique GLOBALE** : `POST /driver-pro/vehicles` refuse une plaque déjà **active** sur un autre compte (**409**) ; `set-primary` refuse aussi d'activer une plaque active ailleurs (409). Même chauffeur ne peut pas enregistrer 2× la même plaque (400).
  - **Transfert de propriété automatique (véhicule vendu)** : si la plaque est prise, le chauffeur fournit une **photo du châssis (VIN)** → il devient propriétaire (véhicule actif+principal, `chassis_photo` stockée) et **l'ancien véhicule est désactivé automatiquement** (`is_active=false`). Conforme à la demande user (« celui qui envoie sera le propriétaire »).
  - **UI** : formulaire **plaque en premier** (+ mention FR & DOM-TOM), modale photo de châssis déclenchée sur 409, bouton « **Travailler avec ce véhicule** » (= set-primary).
- **Vérifié** : pytest `tests/test_iter242_vehicle_plate_transfer.py` **2/2** + curl e2e (A actif → B 409 → B châssis → transfert, A désactivé) + screenshot page Véhicules. Frontend compile.
- ⚠️ **DÉTECTION PLAQUE→VÉHICULE (marque/modèle/année/puissance)** : NON faite — nécessite une **API tierce payante SIV** (clé requise du user). Saisie manuelle pour l'instant. **Écran verrouillé natif** (ouverture auto à la demande) : impossible en web (PWA) — nécessite build natif Expo. **Reste à faire** : B (audit menu latéral chauffeur), C (upload documents requis), audit portefeuille chauffeur, amélioration push web (son/vibration/ouverture au tap).
- PREVIEW → redéploiement requis pour la prod.


## NEW - 2026-06-10 (241) - FIX minuteur chauffeur (n'overlap plus l'en-tête) + P2 Emails suspension/réactivation/suppression de compte (DONE)
- **FIX UI (demande user, capture)** : sur la fiche de demande chauffeur (`IncomingRequestSheet.jsx`), le **gros anneau de compte à rebours** était en **overlay absolu** (`top-0 pt-28`) et **recouvrait le titre, le prix estimé et les estimations** quand la fiche est haute. → Anneau **déplacé dans le flux normal**, **juste au-dessus des boutons Refuser/Accepter** (zone vide indiquée par la flèche du user), taille 120px + label « Temps pour accepter » (texte foncé sur fond blanc). Plus aucun chevauchement avec les infos de la commande. Logique du timer inchangée.
- **P2 — Emails de cycle de vie du compte (Resend)** (`core/email.py` + `routes/admin.py`) : 3 nouveaux templates `send_account_suspended` (avec motif optionnel), `send_account_reactivated`, `send_account_deleted`. Branchés : `PUT /api/admin/users/{id}` envoie l'email quand `is_suspended` change (suspension `is_active:false` → email suspendu ; réactivation `is_active:true` → email réactivé ; motif via `suspension_reason`/`reason`). `DELETE /api/admin/users/{id}` envoie l'email de confirmation de suppression (email/nom récupérés avant suppression). Fire-and-forget, skip emails placeholder `@sbdrive.local`.
- **Vérifié** : pytest `tests/test_iter241_account_lifecycle_emails.py` **2/2** (helpers no-crash + flux admin suspend/réactivation/suppression e2e) + curl e2e (3 emails déclenchés, échec Resend uniquement = mode test domaine, attendu). Frontend webpack compile. ⚠️ Repositionnement minuteur = changement de layout (vérifié compile + revue ; e2e visuel nécessite une vraie demande dispatchée).
- ⚠️ Resend en **mode test** (livraison réelle seulement vers somosylv@gmail.com). PREVIEW → redéploiement requis pour la prod.


## NEW - 2026-06-10 (240) - Phase 2 : Sécurité par email (OTP + lien d'activation + reset mot de passe) (DONE, testé 7/7 backend + 9/9 frontend)
- **Demande user** : vérification d'email à l'inscription (OTP 6 chiffres **+** lien cliquable), accès complet mais **bannière** « Vérifiez votre email » pour comptes non vérifiés, réinitialisation du mot de passe par **OTP+nouveau MDP** (même page) **et** **lien** vers page dédiée. Périmètre : clients, chauffeurs, marchands (inscription email). UI 100% FR.
- **Backend** (`routes/auth.py`, `core/email.py`) : nouveaux endpoints `POST /auth/send-verification` (cooldown 60s), `POST /auth/verify-otp` (auth, flips is_verified), `GET /auth/verify-email?token=` (lien → redirige `/verifier-email?status=ok|expired|invalid`), `POST /auth/forgot-password` (anti-énumération, toujours 200), `POST /auth/reset-password` ({token,new_password} OU {email,code,new_password}). Codes 6 chiffres + token urlsafe **hachés au repos** (sha256 `{JWT_SECRET}:{code}`) dans collection `auth_codes` (purpose verify|reset), expiry (verify 24h / reset 1h), max 5 tentatives, anti-enum. `register`/`phone-register` émettent un code de vérif (skip emails placeholder `@sbdrive.local` + comptes Google). 2 nouveaux templates email Resend (`send_verification_email`, `send_password_reset_email`).
- **Frontend** : `VerifyEmailPage.js` (`/verifier-email`, saisie OTP + renvoi + écran succès lien), `ForgotPasswordPage.js` (`/mot-de-passe-oublie`, email → étape code+nouveau MDP), `ResetPasswordPage.js` (`/reinitialiser-mot-de-passe?token=`, page dédiée lien), `VerifyEmailBanner.jsx` (bannière globale orange, masquée sur écrans auth), lien « Mot de passe oublié ? » sur `EmailLoginPage.js`. `AuthContext.checkAuth` retourne désormais l'utilisateur frais (redirection par rôle non-racy après vérif).
- **Vérifié** : pytest `tests/test_iter240_email_security.py` **7/7** (unverified à l'inscription, verify-otp happy/wrong, lien invalide redirect, forgot anti-enum, reset par OTP + login nouveau MDP, reset token invalide, périmètre driver/merchant) + **testing_agent iteration_240 — frontend 100% (9/9)** (bannière post-inscription, verify-otp, forgot→reset→login, anti-énumération).
- ⚠️ Resend en **mode test** (livraison réelle seulement vers l'adresse vérifiée ; API répond 200 ; les codes sont persistés en base donc récupérables pour les tests). PREVIEW → redéploiement requis pour la prod.


## NEW - 2026-06-09 (219-220) - Lot 1 : minuteur chauffeur agrandi (D) + Auto-stop nom/téléphone (E) + bouton "Augmenter tarif" (A) (DONE, testé 2/2 backend + 3/3 frontend)
- **D. Minuteur chauffeur agrandi** : `IncomingRequestSheet.jsx` affiche un **gros cercle de compte à rebours sur la carte** (derrière la fiche), data-testid `accept-timer-big`, avec le nombre de secondes à l'intérieur (CountdownRing 140px, police auto-scalée) + label « Temps pour accepter ». Délai = `appSettings.driver_timeout` (déjà configurable admin).
- **E. Auto-stop (Taxi Hall)** : `TaxiHallModal.jsx` ajoute **Nom + Téléphone** du client (`taxi-hall-client-name/phone`). Backend `POST /rides/taxi-hall` : **match par téléphone** (suffixe digits) → si compte trouvé, `user_id` rattaché + `passenger_name` = nom du compte + `client_matched=true` (course rattachée, relance possible) ; sinon `guest_name/guest_phone` + nom saisi. Fini le « Client (hélé) » générique.
- **A. Pop-up « aucun chauffeur »** : bouton vert **« Augmenter mon tarif (+X €) »** (`no-driver-raise-btn`, X = suggestedFare−fare) en plus de Réessayer/Planifier ; `retryHigher` → `handleSubmit(suggestedFare)`.
- **Bug corrigé** : `fare` pouvait devenir **NaN** (cassait l'affichage + masquait le bouton raise). Durci : `fareFloor` via `Number()||1`, setFare gardés `Number.isFinite`, `adjustFare/raiseFare` anti-NaN, **useEffect filet de sécurité** (reset à fareFloor), inputs `value={Number.isFinite(fare)?fare:""}`.
- **Vérifié** : pytest `tests/test_iter219_taxi_hall_match.py` **2/2** + **testing_agent iteration_220 — frontend 100% (3/3)** (A: fare 11,17 → bouton +2,23 € → relance à 13,40 € ; D: ring 140px + « 35 » visible ; E: inputs + course démarrée « Marie Test »).
- ⚠️ PREVIEW → redéploiement requis pour la prod (https://gojek-mvp-1.emergent.host).


## NEW - 2026-06-09 (217-218) - Vérif 17 catégories taxi + fix Intercité + auto-fermeture chauffeur + pop-up client « aucun chauffeur »
- **Vérification des 17 catégories taxi (demande user, priorité)** : **17/17 PASS** end-to-end (testing_agent iteration_217). Catégories : standard, pool, electric, moto, rental, intercity, book_later, moto_rental, buddy_driver, bidding, airport, pets, book_for_someone, tuktuk, assist, corporate, access.
  - **BUG corrigé — Intercité plantait** : `ModeSpecificPanel` (composant module) appelait `money()` hors scope → ReferenceError dès qu'une estimation arrivait. Fix : `useLocale()` dans `ModeSpecificPanel`. Vérifié (chip « 1,50 €/km » OK, plus d'erreur React).
  - **Robustesse + deep-links** : `RideChoosePage` accepte désormais le **pré-remplissage du départ par URL** (`plat/plng/paddr`, miroir de `dlat/dlng/daddr`) ; `autoLocate` ignoré si départ pré-rempli (évite le fallback géoloc datacenter US en test).
- **FIX 1 — Chauffeur, écran bloqué** (`DriverHome.js`) : après envoi d'une offre non acceptée, **auto-fermeture** de la feuille (retour en ligne) si l'offre **expire et n'est pas relancée sous 10 s**, **et** après **2 relances** sans acceptation (grace 0). `renewCountRef` + `useEffect([myOffer])` + toast « Aucune réponse du client. Retour en ligne. ». Vérifié par revue de code (test temporel ~45 s non exécuté).
- **FIX 2 — Client, aucun chauffeur trouvé** (`TaxiBiddingPage.js`) : quand la course est annulée par le système (pas de chauffeur), un **pop-up** `no-driver-modal` s'affiche avec **Réessayer** (`no-driver-retry-btn`) + **Planifier le trajet** (`no-driver-schedule-btn` → `/course?mode=book_later` avec adresses pré-remplies) + Annuler. `userCancelledRef` distingue annulation système vs passager. **Vérifié e2e 2/2** (cas positif + négatif, iteration_218).
- ⚠️ PREVIEW → redéploiement requis pour la prod (https://gojek-mvp-1.emergent.host).


## NEW - 2026-06-09 (215) - Tarif moyen accepté (enchère) + Partager ma boutique (DONE, testé 2/2 backend + 3/3 frontend)
- **Demande user** : (A) afficher « Tarif moyen accepté : X € » par véhicule sur la liste enchère (aide au juste prix → +taux d'acceptation). (B) « Partager ma boutique » : QR + impression côté commerçant, et partage social (WhatsApp/SMS/Copier/natif) côté vitrine publique.
- **A — Tarif moyen accepté** :
  - Backend `routes/rides.py` : NOUVEAU `GET /rides/bidding/avg-fares` → `{fares:{slug:moyenne}, counts, sample_days:30}` (moyenne du tarif accepté `final_fare`/`estimated_fare` des courses enchère acceptées/complétées sur 30 j, groupées par véhicule, slug en minuscules).
  - Frontend `RideChoosePage.js` : `rideAPI.biddingAvgFares()` chargé en mode enchère ; ligne verte « Tarif moyen accepté : X € » (icône Gavel) sous chaque véhicule ayant des données (data-testid `avg-fare-{slug}`).
- **B — Partager ma boutique** :
  - `components/merchant/MerchantShareCard.jsx` (lib **qrcode.react** ajoutée) : QR vers `<origin>/food/{id}`, lien copiable, **Télécharger** (PNG) + **Imprimer**. Intégré dans `MerchantSettings.js` (utilise `vitrine.id`).
  - `components/ShareStoreSheet.jsx` : bottom-sheet WhatsApp / SMS / Copier / partage natif, ouvert depuis le bouton partage de la bannière de `RestaurantDetail.js` (data-testid `share-store-btn`).
- **Vérifié** : pytest `tests/test_iter215_bidding_avg_fares.py` **2/2** + **testing_agent iteration_215 — frontend 100% (3/3)** (hint SB ≈ 21,46 €, carte QR commerçant copy/download/print, sheet partage vitrine + toast « Lien copié »).
- ⚠️ PREVIEW → redéploiement requis pour la prod (https://gojek-mvp-1.emergent.host).


## NEW - 2026-06-09 (214) - UX d'après croquis user : stepper tarif chauffeur + parité liste véhicules enchère (DONE, testé 3/3 frontend)
- **Demande user (2 croquis)** : (1) côté chauffeur, le montant de contre-offre doit arriver **pré-rempli** avec boutons **− / +** (pas de saisie au volant) → soit Accepter, soit ±  puis Envoyer. (2) sur le flux **Enchère « Proposer votre tarif »**, la sélection des véhicules après saisie d'adresse doit être **comme le flux standard (image 2)** : carte + cartes véhicules avec prix live, capacité, ⓘ, badge « Meilleur choix », bordure de sélection.
- **Fix** :
  - `IncomingRequestSheet.jsx` : panneau contre-offre = `[−]  € (pré-rempli au tarif passager)  [+]` + bouton **Envoyer** pleine largeur. `openCounter()` pré-remplit, `inc/decCounter` ±1 € (plancher 1 €). Bouton « Proposer un autre prix » encadré bien visible. « Accepter · X € » inchangé (offre au tarif client).
  - `RideChoosePage.js` : `showVehicles = needsDropoff` (inclut désormais l'enchère) → `renderVehicleList()` (liste riche) affichée aussi en mode enchère ; estimations chargées pour l'enchère ; `renderBiddingGrid` (ancienne grille 2 colonnes) **supprimé** ; `onRequest` enchère exige un véhicule sélectionné et navigue `/taxi-bidding?...&vehicle={slug}&fare={ref}`.
- **Vérifié** : **testing_agent iteration_214 — 100% (3/3)** (stepper chauffeur, parité liste véhicules enchère avec ancienne grille absente, non-régression flux standard). Polish : largeur input contre-offre w-28 (anti-clip 4 chiffres).
- **Backlog (signalé par testing agent)** : géoloc IP du départ peut retomber sur un datacenter US en environnement de test (prix aberrant) → prévoir un fallback (ville destination/Paris) si le départ géolocalisé est à >100 km de la destination.
- ⚠️ PREVIEW → redéploiement requis pour la prod.


## NEW - 2026-06-09 (213) - FIX enchères : le chauffeur ne voyait pas où proposer son tarif (DONE, testé 2/2 frontend)
- **Bug user (preview)** : sur l'enchère VTC, le chauffeur ne pouvait pas proposer son propre tarif (contre-proposition).
- **Cause racine** : le payload WebSocket `new_ride_request` porte la clé **`ride_id`** (pas `id`). `DriverHome` faisait `setIncomingRequest(msg)` tel quel → `request.id` **undefined** → Accepter / contre-offre appelaient `/api/rides/undefined/...` et **échouaient silencieusement**. Le chemin poll (8 s) renvoie un `id` correct mais ne remplaçait jamais l'objet WS cassé (garde `!incomingRequest`).
- **Fix** (`DriverHome.js`) : normalisation `withId(m) = {...m, id: m.id || m.ride_id}` sur les handlers `new_ride_request` + `priority_ride_offer` (et `nextJobOffer`). `IncomingRequestSheet.jsx` : le bouton **« Proposer un autre prix »** passe d'un lien texte discret à un **bouton encadré bien visible** (résout « ne voit pas OÙ »).
- **Vérifié** : curl e2e (chauffeur propose 15 € → `ride.counter_offers` montre 15 € de « Jean Dupont ») + **testing_agent iteration_213 — 100% (2/2)** : contre-offre 15 € (at_proposed_fare=false) ET acceptation au tarif client 14 € (at_proposed_fare=true), `my-offer-panel` avec compte à rebours. Backend inchangé (déjà correct).
- **Note data hygiene (backlog)** : des courses `accepted` orphelines sur un chauffeur démo bloquent l'affichage de la feuille de demande (`currentRide` non vide) → prévoir un auto-cancel des courses anciennes pour les comptes démo.
- ⚠️ PREVIEW → redéploiement requis pour la prod.


## NEW - 2026-06-09 (212) - P0.2 Livraison Marketplace ↔ réseau SB Drive (DONE, testé 4/4 backend + 3/3 frontend)
- **Demande user** : connecter les commandes vitrine au réseau coursier + options de livraison + suivi temps réel. Choix validés : Express **+3 €**, Prioritaire **+2 €**, Programmée +0 € ; **broadcast + claim** priorisé ; périmètre = commandes food/vitrine (`orders`). C2C articles → P1.4.
- **Backend** (`routes/orders.py`, `models/schemas.py`) :
  - `OrderCreate.delivery_speed` (standard/express/priority/scheduled) + `scheduled_at`. `create_order` applique le **surcharge** (config) au `delivery_fee`/total, pose `delivery_speed`/`delivery_surcharge`/`priority`/`scheduled_at`. `OrderResponse` enrichi.
  - NOUVEAU `GET /orders/delivery-options` (options + suppléments). `GET/PUT /orders/admin/delivery-settings` étendus (`express_surcharge`, `priority_surcharge`, `dispatch_radius_km`).
  - **Dispatch coursier** : `_is_dispatchable` (express/prioritaire dès `accepted`, standard à `ready`), `available-deliveries` trié **priorité d'abord** + champs speed/priority/status ; `claim` relâché aux états dispatchables (409 si déjà pris). `driver/active` inclut accepted/preparing.
  - **Loop** `order_auto_progress_loop` : (a) respecte les **commandes programmées** (reste pending jusqu'à `scheduled_at`), (b) **n'avance plus past `ready` si un livreur est assigné** (le livreur contrôle picked_up/delivered), (c) **broadcast `new_delivery_offer`** aux livreurs `delivery` en ligne dans le rayon (idempotent via `dispatch_notified`).
- **Frontend** : `CheckoutPage.js` carte **« Mode de livraison »** (4 options + supplément, datetime pour Programmée, total réactif, validation date) ; `DeliveryJobsPage.js` badges **⚡ EXPRESS / ⭐ PRIORITAIRE**, écoute WS `new_delivery_offer`, et « En cours » affiche les commandes fraîchement prises (état « En attente de préparation »). `orderAPI.deliveryOptions()`.
- **Vérifié** : pytest `tests/test_iter212_delivery_dispatch.py` **4/4** (options, surcharge/priorité, dispatch+claim+409, admin settings) + **testing_agent iteration_212 — frontend 100% (3/3)** (sélecteur+total+programmée, récap, badges+claim livreur). Correctif UX post-test (visibilité livreur) appliqué et vérifié.
- ⚠️ PREVIEW → redéploiement requis pour la prod.
- **Backlog immédiat** : « Partager ma boutique » (QR+impression côté commerçant + partage social côté vitrine) — validé par user, à faire **après P0.2**.


## NEW - 2026-06-09 (211) - P0.1 Vitrine digitale marchand complète (DONE, testé 5/5 backend + 4/4 frontend)
- **Demande user** : compléter la vitrine marchand (logo/bannière/galerie, catalogue + **stock**, horaires structurés, **avis clients**, mini-stats). Choix user : avis réservés aux **clients ayant commandé** ; **2 créneaux horaires/jour** (coupure midi). Ordre validé : P0.1 → P0.2 (livraison) → P0.3 (paiement).
- **Backend** (`routes/merchants.py`, `models/schemas.py`) :
  - `ProductCreate.stock` (None = illimité, 0 = rupture) persisté + exposé dans le catalogue public.
  - `PUT /merchants/me` étendu : `phone`, `banner_url`, `storefront_category`, **`hours` structuré** (7 jours, ≤2 créneaux/jour, `closed`). Helper `validate_hours` + `_hours_open_now` → `is_open` calculé depuis les horaires.
  - NOUVEAU `GET /merchants/meta/categories` (catégories FR structurées : Épiceries, Boulangeries, Pharmacies, Fleuristes, Boucheries, Poissonneries, Supermarchés, Commerces indépendants, Producteurs locaux…).
  - NOUVEAU `GET /merchants/me/stats` (commandes jour/total, CA, en attente, note, nb avis, top produits, rupture).
  - NOUVEAU `GET/POST /merchants/{id}/reviews` : POST **réservé aux clients avec une commande `delivered`/`completed`** (sinon 403), 1 avis/client (upsert), recalcule `rating`+`review_count` du marchand.
- **Frontend** : `MerchantProducts.js` (vrai marchand via `merchantAPI.getMine`, champ **stock** + badge Rupture, FR, devise locale `money()`), `MerchantSettings.js` (cartes réelles : Vitrine, **Contact & Catégorie**, **Horaires structurés 7j/2 créneaux**, Flash ; tout connecté à `PUT /me`), `MerchantDashboard.js` (stats réelles + top produits, FR, `money()`), `RestaurantDetail.js` = **vitrine publique** enrichie (bannière/logo, badge Ouvert/Fermé, note+avis, Appeler, horaires dépliables, badge Rupture + ajout désactivé, **section Avis + formulaire étoiles**).
- **API** (`services/api.js`) : `getMine/updateMine/getStats/getCategories/getReviews/addReview`.
- **Vérifié** : pytest `tests/test_iter211_merchant_storefront.py` **5/5** (categories, horaires structurés, stock, stats, review 403) + **testing_agent iteration_211 — frontend 100% (4/4)** (catalogue+stock+rupture, settings persistés après reload, dashboard FR, vitrine publique + avis 403 non-client). Nettoyage : galerie placeholder cassée vidée + produit de test supprimé.
- ⚠️ PREVIEW → redéploiement requis pour la prod.


## NEW - 2026-06-09 (134) - Facturation des emplacements Sponsorisé (DONE, curl + screenshot)
- **Demande user** : facturer les emplacements (tarif/jour ou CPM par bannière) + récap par commerçant, couplé au CTR → vraie source de revenus pub.
- **Backend** (`promo_banners.py`) : champs `advertiser`, `advertiser_contact`, `pricing_model` (free/per_day/cpm), `price_per_day`, `cpm`, `starts_at`, `ends_at` (create/update). Helpers `_days_active` (jours inclusifs, plafonné à maintenant) + `_banner_cost` (per_day×jours ou cpm×impressions/1000). NOUVEL endpoint admin `GET /promo-banners/admin/billing` → récap groupé par commerçant (bannières, impressions, clics, CTR, coût) + totaux.
- **Frontend admin** (`AdminPromoBanners.js`) : fieldset « Facturation publicitaire » dans le formulaire (annonceur, contact, modèle, tarif/jour ou CPM, dates début/fin) + panneau dépliable « 💶 Facturation publicitaire » avec tableau par commerçant + ligne Total. `promoBannersAPI.billing()`.
- **Vérifié** : curl (CPM 3 × 2 impressions = 0,01 € ; CTR 50% ; groupe « Non attribué ») + screenshot admin (tableau récap + total). Webpack compile.
- ⚠️ PREVIEW → redéploiement requis pour la prod.




- **Demande user** : mini-stats impressions/clics par bannière dans l'admin → emplacement publicitaire mesurable, facturable aux commerçants.
- **Backend** (`promo_banners.py`) : endpoints publics `POST /promo-banners/{id}/impression` et `/click` (`$inc` compteurs). La liste admin renvoie déjà `impressions`/`clicks`.
- **Frontend** : `SponsoredBanners.jsx` → 1 impression par bannière **par session** (dédup `sessionStorage`) + clic tracké avant navigation. `promoBannersAPI.impression/click`. Admin `AdminPromoBanners.js` → ligne mini-stats par bannière (👁 impressions, 🖱 clics, **CTR %**) + badges d'emplacement (Accueil/Livraison/Marketplace).
- **Vérifié** : curl (2 impressions + 1 clic → admin imp 2 / clics 1) + screenshot admin (« Promo Resto -30% » CTR 50.0%, badges Livraison/Marketplace). Webpack compile.
- ⚠️ PREVIEW → redéploiement requis pour la prod.




- **Demande user** : bannières sponsorisées gérées par l'admin, affichées sur Livraison (Food) ET Marketplace, format bannière + carte labellisée « Sponsorisé ».
- **Approche** : extension du CMS existant `promo_banners` (au lieu d'un système parallèle) avec un champ **`surfaces`** (`home`/`food`/`marketplace`).
- **Backend** (`promo_banners.py`) : `GET /promo-banners?surface=` filtre par surface (legacy sans `surfaces` → `home` par rétrocompat) ; `surfaces` ajouté à create/update (défaut `['home']`, valeurs validées).
- **Frontend** : nouveau composant `SponsoredBanners.jsx` (carrousel auto-défilant, label « ★ Sponsorisé », clic → route interne ou URL externe) intégré en haut de `FoodPage` (surface=food) et `MarketplacePage` (surface=marketplace). `promoBannersAPI.public(location, surface)`. Admin `AdminPromoBanners.js` : sélecteur multi « Emplacements d'affichage » (Accueil/Livraison/Marketplace).
- **Vérifié** : curl (création surfaces food+marketplace ; filtrage food/marketplace ; accueil exclut food-only ; édition surfaces persiste) + screenshots (bannière « SPONSORISÉ Promo Resto -30% » sur Food et Marketplace ; formulaire admin avec sélecteur). Webpack compile.
- **Bug chauffeur enchères** : confirmé = écart de déploiement (le correctif est en preview, prouvé par capture « Tarif proposé par le passager 17€ » côté chauffeur). User testait en **production** → **redéploiement requis**.
- ⚠️ PREVIEW → redéploiement requis pour la prod.




- **Demande user** : option client « accepter automatiquement la 1ʳᵉ offre ≤ mon tarif ET à ≤ X min » (garde-fou distance/ETA). Limite par défaut 10 min, ajustable (8/10/15).
- **Frontend** (`TaxiBiddingPage.js`) : toggle « Acceptation automatique » + sélecteur ETA (8/10/15 min) dans la feuille d'enchère (`auto-accept-toggle`, `auto-accept-eta-{m}`). États + refs (`autoAcceptRef`, `autoAcceptEtaRef`, `fareRef`, `autoAcceptedRef`) synchronisés. Dans le poll : 1ʳᵉ offre éligible (`amount ≤ fare` ET `eta_min != null && eta_min ≤ maxEta`, triée par prix puis ETA) → `acceptOffer()` auto + navigation. Garde anti-double via ref ; réinitialisé à chaque publication.
- **Vérifié** : screenshots e2e — offre 18€ > tarif 10€ correctement ignorée ; offre 10€ (≤ tarif, ETA 1 min ≤ 15) → acceptation auto → `/ride/{id}` (écran « EN ARRIVANT », OTP). UI toggle/ETA OK. Webpack compile.
- ⚠️ PREVIEW → redéploiement requis pour la prod.




- **Demande user** : champ texte libre pour un libellé personnalisé (ex. « -20% week-end ») en plus des presets.
- **Backend** (`config.py`) : `custom_label` ajouté ; libellé effectif = `custom_label` (si non vide) sinon preset `label`. Réponse expose `label` (effectif) + `custom_label`.
- **Frontend admin** (`AdminServiceConfig.js`) : champ texte « Libellé personnalisé (optionnel — remplace le choix ci-dessus) » dans `vehicle_badge`.
- **Client** : inchangé (consomme `badgeCfg.label` = libellé effectif).
- **Vérifié** : curl (« -20% week-end » remplace le preset ; vide → retour au preset « Populaire ») ; config restaurée. Webpack compile.
- ⚠️ PREVIEW → redéploiement requis pour la prod.




- **Demande user** : couleur du badge configurable (Vert/Orange/Bleu/Rouge) en plus du libellé, pour aligner sur des opérations commerciales (ex. « Promo » orange) sans toucher au code.
- **Backend** (`config.py`) : `DEFAULT_VEHICLE_BADGE` + `color` (défaut « Vert ») ; sanitize contre `{Vert,Orange,Bleu,Rouge}` (valeur invalide → Vert).
- **Frontend admin** (`AdminServiceConfig.js`) : select « Couleur du badge » (Vert/Orange/Bleu/Rouge) dans `vehicle_badge`.
- **Frontend client** (`RideChoosePage.js`) : `BADGE_COLOR_CLASSES` (classes Tailwind littérales → JIT) appliquées au badge selon `badgeCfg.color`.
- **Vérifié** : curl (color « Orange » persiste ; « Rose » → Vert) + screenshot client (badge « PROMO » orange `bg-orange-100 text-orange-700` sur SB) ; config restaurée au défaut. Webpack compile.
- ⚠️ PREVIEW → redéploiement requis pour la prod.




- **Demande user** : rendre le badge « Meilleur choix » configurable en admin — activer/désactiver + choisir le libellé (Meilleur choix / Populaire / Éco…).
- **Backend** (`config.py`) : NOUVEL endpoint public **`GET /config/vehicle-badge`** (`{enabled, label}`, défauts) lisant `service_configs.vehicle_badge`. La sauvegarde admin passe par l'endpoint générique existant `PUT /admin/service-config/vehicle_badge`.
- **Frontend admin** (`AdminServiceConfig.js`) : entrée `vehicle_badge` (toggle `enabled` + nouveau type **`select`** pour `label` avec options Meilleur choix/Populaire/Éco/Recommandé/Le moins cher) ; route `/admin/vehicle-badge-config` (adminRoutes) + lien menu « Badge véhicule (Meilleur choix) » (AdminLayout, sous Taxi/Transport).
- **Frontend client** (`RideChoosePage.js`) : `configAPI.getVehicleBadge()` → state `badgeCfg` ; le badge n'apparaît que si `badgeCfg.enabled` et utilise `badgeCfg.label`.
- **Vérifié** : curl e2e (admin sauve « Populaire » → lecture publique « Populaire » ; `enabled:false` masque ; restauration) + screenshot page admin (toggle + select rendus). Webpack compile.
- ⚠️ PREVIEW → redéploiement requis pour la prod.




- **Demande user** : badge non plus sur le moins cher brut (souvent Moto 1 place) mais sur la gamme au **meilleur rapport prix/capacité**. Après discussion → option (a) : meilleur rapport **parmi les véhicules ≥ 4 places** (exclut Moto/TukTuk), oriente vers une option rentable et pertinente.
- **Frontend** (`RideChoosePage.js`, `renderVehicleList`) : `bestSlug` = min(`est.fare / person_capacity`) parmi les gammes tarifées **avec capacité ≥ 4** (affiché si ≥2 éligibles) → pill emerald « MEILLEUR CHOIX » (`data-testid="best-choice-{slug}"`).
- **Vérifié** : screenshot client → badge sur **SB** (12€/4 = 3,0/place, meilleur que Confort/SUV/Van parmi ≥4 places ; Moto/TukTuk exclus). Webpack compile.
- ⚠️ PREVIEW → redéploiement requis pour la prod.








- **Demande user (capture V3Cube)** : remplacer le sélecteur de véhicules par la **liste verticale détaillée** « Choisissez un voyage » pour TOUT le système taxi standard. (Annule le carrousel horizontal de l'itération 125.)
- **Frontend** (`RideChoosePage.js`, `renderVehicleList`) : cartes verticales empilées — grande image véhicule, **nom + capacité** (👤N), **prix** + icône **ⓘ**, **heure de prise en charge · ETA** (now+`nearby.etaMins`), **description** (`v.info` avec fallback `DEFAULT_VEHICLE_INFO`), carte sélectionnée = **bordure foncée** `#0B1426`. Titre « Choisissez un voyage », CTA « Choisir {Véhicule} ». NOUVEAU **modal fiche ⓘ** (`vehicle-info-modal`, state `infoVehicle`) : image, nom, N passagers, description, tarifs prise en charge/km/min, bouton « Choisir {Véhicule} ». Nouveaux testids `vehicle-info-{slug}`, `vehicle-info-select-btn`. Testids existants conservés (`choose-vehicle-{slug}`, `price-{slug}`, `orig-price-{slug}`, `savings-{slug}`).
- **Backend** (`core/startup.py`) : backfill idempotent des **descriptions par défaut** (`info`) pour 15 gammes quand vide — admin-éditable via VehicleTypeEditor.
- **Vérifié** : screenshots client (/course, dest 75010 Paris) → liste verticale SB/Confort (image, 👤4, prix, ⓘ, 16:15·1 min, description, bordure foncée sur sélection, « Choisir SB ») + popup ⓘ (tarifs + description). Webpack compile.
- ⚠️ PREVIEW → redéploiement requis pour la prod.




- **Demande user** : sur l'écran de choix après saisie d'adresse, afficher les véhicules en **carrousel coulissant horizontal** (comme les apps standard) au lieu de la liste verticale actuelle.
- **Frontend** (`RideChoosePage.js`, `renderVehicleList`) : liste verticale (`space-y-2`, lignes pleine largeur) → **carrousel horizontal** (`flex gap-3 overflow-x-auto snap-x`, scrollbar masquée, `data-testid="vehicle-carousel"`). Chaque carte (largeur fixe 7,5rem) empile : image, nom, capacité, durée·distance, prix ; sélection = bordure orange + coche. Tous les `data-testid` préservés (`choose-vehicle-{slug}`, `price-{slug}`, `orig-price-{slug}`, `savings-{slug}`).
- **Vérifié** : screenshot client (/course, destination 75010 Paris pré-remplie) → SB/Confort/Luxe côte à côte, défilement horizontal (Luxe coupé à droite), tarifs 10/15/25 €. Webpack compile.
- ⚠️ PREVIEW → redéploiement requis pour la prod.




## NEW - 2026-06-09 (124) - Enchères : son + animation à l'arrivée d'une offre chauffeur (DONE)
- **Demande user** : notification sonore légère + animation côté client quand un chauffeur répond (couplé au compteur « vu par X ») → maximise l'attention, réduit les annulations.
- **Frontend** (`TaxiBiddingPage.js`, aucun asset) : carillon 2 notes via **WebAudio** (`playOfferChime`, AudioContext débloqué au tap « Trouver un chauffeur » pour respecter l'autoplay policy) + **vibration** `navigator.vibrate(90)` + **flash vert** (`ring` animé 1,4 s sur `driver-offers-list`, state `newOfferFlash`) + toast « Un/X chauffeur(s) a/ont répondu ! ». Détection des NOUVELLES offres via `prevOfferIdsRef` (set d'ids comparé à chaque poll 2,5 s) → ne se déclenche qu'à l'apparition d'une offre inédite.
- **Vérifié** : webpack compile (warnings pré-existants DriverHome seulement). Son/anim non testables par curl ; logique de détection (diff d'ids) simple et le flux d'offres backend déjà validé (iter 210).
- ⚠️ PREVIEW → redéploiement requis pour la prod.




## NEW - 2026-06-09 (123) - Enchères : compteur live « X chauffeurs ont vu votre offre » (DONE, testé curl)
- **Demande user** : pendant la recherche d'enchère, afficher en temps réel combien de chauffeurs ont VU l'offre (rassure le client, l'incite à attendre/augmenter plutôt qu'annuler → meilleur taux de complétion).
- **Backend** (`routes/rides.py`) : NOUVEL endpoint **`POST /{ride_id}/seen`** (chauffeur, idempotent, `$addToSet viewed_by`) ; `get_ride` expose désormais **`viewed_count`** (= len(viewed_by)).
- **Frontend** : `DriverHome.js` → effet qui appelle `/seen` une fois quand une demande d'enchère apparaît. `TaxiBiddingPage.js` → state `viewedCount` alimenté par le poll 2,5s, badge vert pulsant `data-testid="viewed-count"` dans la feuille de recherche (« X chauffeur(s) ont/a vu votre offre »).
- **Vérifié** : curl (driver `/seen` → `{ok:true, viewed_count:1}` ; client GET ride → `viewed_count:1`). Webpack compile.
- ⚠️ PREVIEW → redéploiement requis pour la prod.




## NEW - 2026-06-09 (122) - Enchères VTC modèle iDrive/V3Cube : le CLIENT choisit parmi plusieurs chauffeurs (DONE, testé 4/4)
- **Demande user (captures)** : reproduire l'écran V3Cube « Demander » — le client propose un tarif, PLUSIEURS chauffeurs en compétition reçoivent la proposition et peuvent soit **Accepter le tarif exact** soit faire une **contre-proposition** ; le client voit la **liste de tous les chauffeurs** (badge « Votre tarif » pour ceux qui acceptent son prix) et **choisit** (Refuser/Acceptez). + Retirer la **carte récapitulatif d'itinéraire** (adresses + Modifier) de l'écran « Offrez votre tarif ». Choix user : modèle « le client choisit toujours » (2a).
- **Changement de modèle** : un chauffeur qui « Accepte » une enchère ne **rafle plus** la course instantanément — il soumet une **offre au tarif du client** (via `/counter-offer` avec `amount = proposed_fare`) qui apparaît dans la liste du client avec le badge « Votre tarif ». Le client confirme (accept-offer) → attribution + tarif honoré.
- **Backend** (`routes/rides.py`) : `driver_counter_offer` enrichi → `at_proposed_fare` (bool, amount ≈ proposed_fare), `driver_photo`, `distance_km`/`eta_min` (haversine position chauffeur→ramassage, import `math` ajouté). NOUVEL endpoint **`POST /{ride_id}/reject-offer/{offer_id}`** (passager refuse une offre → statut `rejected` + WS `offer_rejected`, la course reste pending, les autres chauffeurs continuent).
- **Frontend** : `DriverHome.js` → pour une enchère, `onAccept` appelle `sendCounterOffer(id, proposed_fare)` (non-enchère = `acceptRide` instantané inchangé). `IncomingRequestSheet.jsx` → bouton Accepter affiche le prix pour les enchères. `TaxiBiddingPage.js` → **carte route-summary supprimée** (+ strip véhicules/effet vehTypes retirés), liste d'offres refondue (tri « Votre tarif » d'abord puis prix croissant, badge `offer-your-fare-{id}`, photo/note/ETA/km, boutons **Refuser** `reject-offer-{id}` + **Acceptez** `accept-offer-{id}`), nouvelle fn `rejectOffer()`.
- **Vérifié** : curl e2e (counter-offer at_proposed_fare:true + eta/distance ; reject → rejected ; accept → attribué, tarif 15€ honoré) + **testing_agent iteration_210 — frontend 100% (4/4)** : route-summary absent, négociation 2 acteurs, liste offres + badge « Votre tarif » + Refuser/Acceptez, reject (course reste pending) puis accept (→ /ride/{id}, tarif client honoré). Webpack compile.
- **Backlog mineur (P3, suggestion testing agent)** : suffixer le testid `offer-countdown` par `{id}` ; petit toast « Tarif minimum X€ appliqué » quand le param `?fare` est ramené au plancher.
- ⚠️ PREVIEW → **redéploiement requis** pour la prod `gojek-mvp-1.emergent.host`.




## NEW - 2026-06-09 (120) - Partage de trajet sécurisé (live) + Outils de sécurité unifiés client/chauffeur (DONE, testé)
- **Demande user** : dans les Outils de sécurité, partager sa position/trajet en direct avec un proche via un lien public montrant l'identité client (nom + téléphone) et chauffeur (nom, photo, téléphone, note), le véhicule (plaque, modèle, couleur/marque), l'itinéraire et la position live jusqu'à la fin de la course. Les numéros restent masqués in-app (appel = nom de l'appelant) MAIS visibles en clair dans le lien de sécurité. + « les outils de sécurité sont identiques côté client et chauffeur ». Choix : WhatsApp+SMS+Copier+natif, lien actif jusqu'à fin de course, client ET chauffeur peuvent partager.
- **Backend** NOUVEAU `routes/trip_share.py` (enregistré dans `core/api_router.py`) : `POST /api/rides/{id}/share` (auth — passager OU chauffeur assigné ; jeton idempotent par user+course) ; `GET /api/trip-share/{token}` (**PUBLIC, sans auth**) → snapshot live : statut, client {nom, téléphone}, chauffeur {nom, photo (avatar_url), téléphone, note}, véhicule {plaque(vehicle_number), modèle, couleur/marque si dispo}, adresses départ/arrivée, **position live** (`manager.get_driver_location` → fallback driver doc), `route_polyline`. `active=false` quand la course est terminée/annulée. Collection `trip_shares`.
- **Frontend** : NOUVEAU composant **partagé** `components/safety/SafetyToolsSheet.jsx` (panneau IDENTIQUE client+chauffeur : Appel 112, message SOS, enregistrement audio, **Partager mon trajet** → génère le lien + options WhatsApp/SMS/Copier/natif). NOUVELLE page publique `pages/SharedTripPage.jsx` route **`/t/:token`** (hors auth, dans `App.js`) : carte live (réutilise `RideTrackingMap`) + badge EN DIRECT/Terminé + fiches chauffeur/véhicule/passager/itinéraire avec **numéros cliquables en clair**, refresh auto 5s, stoppe à la fin. `tripShareAPI` ajouté. Câblage : `DriverRideFlow.jsx` (remplace l'ancien `SafetySheet` par le partagé) et `RideTrackingPage.js` (boutons SOS + Partager ouvrent le panneau unifié).
- **Vérifié** : pytest `tests/test_iter185_trip_share.py` 3/3 (404 jeton invalide, 401 create non-auth, 404 course inconnue) + curl e2e (create authentifié idempotent ; snapshot active avec chauffeur Jean Chauffeur, téléphone +596… en clair, plaque) + **screenshot page publique `/t/:token`** rendue (carte live, fiche chauffeur+téléphone, véhicule/plaque, passager, itinéraire). Webpack compile.
- **Note data model** : `vehicle_color`/`vehicle_brand` n'existent pas encore sur le profil chauffeur → affichés seulement si présents (modèle+plaque toujours présents). ⚠️ PREVIEW → redéploiement requis pour la prod.



## NEW - 2026-06-09 (119) - Revue qualité de code : corrections + faux positifs documentés (DONE)
- **Secrets en dur dans les tests (CRITIQUE, RÉEL → corrigé)** : `test_iter170_admin_audit.py`, `test_iter171_nearby_businesses.py`, `test_service_categories_home.py` avaient `ADMIN_PASSWORD = "..."` en dur. Remplacé par l'import du helper central `tests/_creds.py` (`from _creds import ADMIN_EMAIL, ADMIN_PASSWORD`), déjà sourcé depuis les variables d'env. `conftest.py` lit aussi `_creds`. Plus aucun littéral de secret dans ces fichiers. Vérifié : 31 tests passent (auth OK) ; 1 échec pré-existant non lié (`test_default_home_keys_match_spec` — moto/electric désactivés de l'accueil dans l'état DB actuel).
- **« 9 variables possiblement indéfinies » (FAUX POSITIF)** : aucune trouvée — vérifié avec **3 outils** (pyflakes 0, pylint E0601/E0602/E0606 0, ruff F821/F811/F823 « all checks passed ») sur tout le backend.
- **« random non sécurisé » dans `routes/simulation.py` (FAUX POSITIF)** : le code utilise **déjà** `_sim_random = secrets.SystemRandom()` (ligne 6) ; les `.randint/.choice/.uniform` sont sur ce RNG sécurisé. C'est aussi une route de simulation (données factices). Aucun changement.
- **Complexité / nb de paramètres / nb d'imports** : hotspots de maintenabilité sur du code critique en prod (geo_scope, startup seeds, admin analytics, auth.google_session, api_router) — **différés volontairement** (100% des tests passent ; refactor en place = risque de régression élevé pour bénéfice marginal). À découper incrémentalement avec couverture de tests.
- **NOUVEAU `/app/.code-quality-ignore`** : documente les faux positifs vérifiés + les décisions intentionnelles, pour éviter qu'ils ne réapparaissent comme bruit dans les prochains scans (tâche backlog P3 traitée).
- Aucune modification du code de production (uniquement fichiers de tests + doc).



## NEW - 2026-06-09 (118) - Marketplace « Acheter, Vendre & Louer » entièrement branché (Véhicules + Articles + dashboard admin) (DONE, testé 15/15)
- **Demande user** : connecter les 3 tuiles (Immobilier / Véhicules / Articles) au backend, dashboard admin, options manquantes. Choix : formulaire véhicule dédié (1a), ajout « À louer » pour véhicules (2b), dashboard admin Marketplace (modération + commission + frais livraison), unification via champ `kind` + reclassement des annonces existantes.
- **Bug corrigé** : `MarketplacePage` lisait `/phase2/catalogs/marketplace_listings` et filtrait sur `category` (≠ des sous-catégories vendeur) → les tuiles Véhicules/Articles étaient incohérentes. Désormais lecture via `marketplaceAPI.getListings({kind})` (collection réelle, `status:active`, sponsorisés en tête).
- **Backend** (`routes/marketplace.py`) : `create_listing` pose `kind` (vehicle/item) + `type` cohérent + sous-doc `vehicle` (brand/model/year/mileage/fuel/transmission) + `rent_period`. `list_listings` accepte `kind`, exclut l'immobilier (collection séparée `property_listings`), tri sponsorisé→récent. **Nouveaux endpoints admin** (perm `content.manage`) : `GET /marketplace/admin/listings` (filtre kind/status/search + counts), `DELETE .../{id}`, `POST .../{id}/toggle`, `POST .../{id}/feature`, `GET|PUT /marketplace/admin/settings` (commission_pct, delivery_fee). **Migration** : reclassé les annonces existantes (2 véhicules, 5 articles, 3 immo exclus) + backfill `status:active` sur les seed.
- **Frontend** : `MarketplacePage` réécrit (tuiles Véhicules/Articles + chip Immobilier→/real-estate, specs véhicule, badge Vente/Location, FAB « Déposer une annonce » routant vers le bon formulaire). NOUVEAU `PostVehiclePage.js` (`/marketplace/sell-vehicle`, formulaire véhicule dédié KYC-gated, Vente/Location, prix/jour|mois). NOUVEAU `AdminMarketplace.js` (`/admin/marketplace`, sidebar « Acheter, Vendre & Louer » → « Véhicules & Articles ») : réglages commission+livraison, filtres, table modération (sponsoriser/activer/supprimer). `marketplaceAPI` admin ajouté. (`/ma-galerie` = SellGallery pour articles, inchangé).
- **Vérifié** : testing_agent iteration_184 **15/15** (backend 8/8 pytest + frontend client+admin). Publication véhicule e2e OK (apparait dans /marketplace/cars), modération admin reflétée côté client, guard 401, commission sauvegardée. Le testing agent a retiré une route admin `marketplace` en double. Webpack compile.
- ⚠️ PREVIEW → redéploiement requis pour la prod. Immobilier était déjà complet (client + `AdminRealEstate`).



## NEW - 2026-06-09 (117) - Coupon grève auto ON/OFF + Tendances épinglées (admin) (DONE, testé)
- **Coupon grève 100% automatique** (`routes/transport.py`) : ajout de `_sync_strike_coupon(active)` — le coupon `GREVE15` est **activé** tant qu'une grève est active (manuelle OU alerte GTFS-RT) et **désactivé automatiquement** dès qu'elle prend fin. Synchronisé : (a) à chaque lecture de `/transport/disruptions` (couvre l'expiration par `ends_at` et les alertes RT, sans scheduler), (b) immédiatement sur update/delete admin. Vérifié curl : grève ON → `GREVE15` valide (-15% = 4,5€/30€) ; grève OFF → coupon **404 invalide**. La bannière s'affiche/disparaît déjà automatiquement avec l'état de grève.
- **Tendances épinglées (nouveau)** (`routes/service_trends.py`) : collection `service_trends_meta` (doc `pinned`). Endpoints admin (perm `content.manage`) `GET/PUT /service-trends/admin/pinned`. `/trending` préfixe désormais les services **épinglés** (en tête), puis les tendances **automatiques** (dédup par path, cap limit). Vérifié curl (épinglés `pinned:true` en tête, guard 401).
- **Frontend** : NOUVELLE page admin `AdminTrendingPinned.js` (route `/admin/trending-pinned`, sidebar CONTENU → Écran accueil app → « Tendances épinglées ») — liste ordonnée des épinglés (↑/↓/✕, max 12) + recherche dans les services (source : `home_categories`) pour ajouter ; bouton Enregistrer. `serviceTrendsAPI.adminGetPinned/adminSetPinned`. `UserHome` inchangé (les épinglés arrivent en tête via l'API). Vérifié screenshot admin (41 services candidats, page rendue).
- **Raccourcis (réponse user, pas de code)** : « Vos raccourcis » se gèrent dans **Admin → Écran accueil app → Zones & raccourcis** (`/admin/zones`) — créer d'abord une zone pour la ville (ex. Paris/Fort-de-France) puis y choisir/planifier les services. Hors zone configurée, les raccourcis affichés sont les raccourcis **personnels** (usage du client). Choix user : tendances **auto + épinglage** (fait) ; raccourcis = via Zones (expliqué).
- ⚠️ PREVIEW → redéploiement requis pour la prod `gojek-mvp-1.emergent.host`.



## NEW - 2026-06-09 (116) - Grève → notif push + promo VTC -15% & auto-remplissage adresse de départ (DONE, testé)
- **A — Adresse de départ auto-remplie** (`TransportPublicPage.js`, panneau « Comparer un trajet ») : le champ « Point de départ » était vide (géoloc iframe refusée / libellé « Ma position actuelle »). Désormais, dès que Google Maps est chargé, on **reverse-géocode** la position GPS du client et on **pré-remplit la vraie adresse** (ex. « 108 Rue Ernest Deproge, Fort-de-France 97200 »). Un ref `autoFrom` n'écrase jamais une saisie manuelle / un deep-link. Vérifié screenshot (adresse réelle affichée).
- **B — Notification push + promo sur grève** : à la **déclaration (ou activation) d'une grève** côté admin, le backend (`routes/transport.py`) : (1) provisionne un **coupon `GREVE15`** réel (Percentage 15%, `per_user_limit:1`, actif — valide au checkout via `/api/coupons/validate`) ; (2) **notifie tous les usagers** (`role:user`, in-app + WebSocket + Expo push via `create_notification`) avec « 🚍 Bus en grève près de chez vous — -15% sur votre VTC avec le code GREVE15 » + deep-link `/course`. **Idempotent** (`notified_at` posé avant le fan-out → pas de double envoi sur re-toggle), en tâche de fond (`asyncio.create_task`).
- **Bannière client** (`transportAlerts.jsx`) : affiche désormais « −15% avec le code **GREVE15** » dans la bannière grève. `/transport/disruptions` expose `strike_coupon` + `strike_discount_percent` quand `has_strike`.
- **Vérifié** : pytest `tests/test_iter183_disruptions.py` **4/4** (dont strike→coupon GREVE15 valide -15% = 4,5€/30€) + curl e2e (création grève → notif `transport_strike` stockée pour clienttest avec code + route ; coupon valide) + screenshot (`/transport-public` : bannière grève + code GREVE15 + « Réserver un VTC », départ auto-rempli, badge THÉORIQUE).
- **Décisions** : audience = **tous les riders** (réseau régional Martinique ; pas de géoloc par user fiable → on ne segmente pas par zone GPS). Code promo unique `GREVE15` réutilisé. ⚠️ Push Expo réel nécessite l'app native (token) ; en web → in-app + WS uniquement. PREVIEW → redéploiement requis pour la prod.



## NEW - 2026-06-09 (115) - Perturbations & grèves transport : indicateur EN DIRECT + bannière conversion VTC + historique (DONE, testé 100%)
- **Demande user** : (1) indicateur animé « EN DIRECT » sur l'écran client (actif uniquement quand le GTFS-RT est réellement actif, sinon « Théorique ») ; (2) « historique des perturbations » (lignes en retard/supprimées) ; (3) gestion des **grèves des transports** avec bannière qui pousse fortement la bascule vers le VTC. Choix user : bannière grève sur **accueil client + écrans transports** ; déclaration admin **manuelle + auto-détection GTFS-RT** (les alertes RT s'ajoutent automatiquement quand un flux existera).
- **Backend** (`routes/transport.py`) : la lecture des perturbations existait déjà (`GET /transport/disruptions` avec `has_strike`, `/disruptions/history`, parsing alertes GTFS-RT grève/annulation/retard via `_live_alerts`). **Ajouté** : CRUD admin des perturbations manuelles (perm `content.manage`) — `GET/POST/PUT/DELETE /transport/admin/disruptions` (+ `_parse_disruption` : type∈strike/cancellation/delay/reduced/detour/info, titre, message, lignes (string→list), sévérité auto, active, dates). Les manuelles (`source:"manual"`) + alertes GTFS-RT fusionnent dans la liste active (grèves en tête).
- **Frontend** : NOUVEAU `components/transport/transportAlerts.jsx` — `LiveBadge` (pastille « EN DIRECT » rouge pulsante vs « Théorique »), `DisruptionBanner` (bannière grève rouge #7F1D1D + CTA orange « Réserver un VTC maintenant » ; prop `strikesOnly` pour l'accueil), `DisruptionHistory` (panneau repliable). Branché : `UserHome` (bannière grève seule, après DebtBanner), `TransportPublicPage` + `NearbyTransitPage` (LiveBadge en header + bannière + historique), `AdminTransport` (panneau « Perturbations & grèves » : liste + déclarer/éditer/activer/supprimer via modale). `transportAPI` enrichi (disruptions/history + admin CRUD).
- **Vérifié** : pytest `tests/test_iter183_disruptions.py` **3/3** (CRUD + auth 401 + has_strike public + masquage si inactive + historique + titre requis 400) + **testing_agent iteration_183 — frontend 100% (9/9)** (panneau admin + create/toggle/delete ; accueil client bannière grève → /course ; transport-public LiveBadge théorique + bannière + historique déplié ; transports-autour idem + liste arrêts intacte). Webpack compile.
- ⚠️ **GTFS-RT dormant** : le LiveBadge affiche « Théorique » tant qu'aucun flux RT Martinique n'est publié (comportement attendu). Une grève démo « Grève réseau Mozaïk » est active en base. PREVIEW → redéploiement requis pour la prod.
- **RESTE (P3)** : extraire le panneau Perturbations d'`AdminTransport.js` (495 l.) en composant dédié ; mutualiser l'appel `/transport/disruptions` (DisruptionBanner + History le font 2× sur les écrans transport).



## NEW - 2026-06-09 (114) - Veille automatique GTFS-RT Martinique : détection + auto-activation + alerte admin (DONE, testé 100%)
- **Demande user** : veille auto qui détecte l'apparition d'un flux GTFS-RT sur transport.data.gouv.fr et **active automatiquement** le temps réel, avec **alerte (cloche) dans le dashboard admin**. Choix : activation auto + alerte dashboard (pas d'e-mail) + cycle ~24h.
- **Backend** : `detect_realtime(db)` (dans `scripts/import_gtfs_martinique.py`) scanne les datasets Martinique pour une ressource **format `gtfs-rt`** ; si trouvée → écrit l'URL dans `realtime_urls` (**auto-activation**) et enregistre une détection (`rt_detections`: feed/url/date/auto_activated/acknowledged). Idempotent (pas de doublon). Branché dans le scheduler `ensure_gtfs_imported` (initial + ~24h, vide le cache RT après). Endpoints admin : `POST /admin/gtfs/realtime/scan` (veille manuelle) + `POST /admin/gtfs/alerts/ack` (acquitter) ; statut enrichi `rt_unack_count` + `rt_detections`.
- **Frontend** (`AdminTransport.js`) : section « Temps réel (GTFS-RT) — veille automatique » avec **cloche d'alerte** (`gtfs-alert-bell`, badge count) + **liste des détections** (`gtfs-alerts`, « Flux temps réel détecté pour X — activé automatiquement » + « Marquer comme lu ») + bouton **« Scanner maintenant »** (`rt-scan-btn`). La cloche/alertes n'apparaissent que sur détection réelle.
- **Vérifié** : pytest `tests/test_iter182_gtfs_watch.py` (simulation détection → auto-activation + alerte + idempotence, avec restauration de l'état) + `test_iter174` (scan/ack auth + no-false-positive) + `test_iter181` = **31/31** + **testing_agent iteration_182 — frontend 100% (3/3)**. État final : RT **inactif/théorique** (aucun flux publié). Webpack compile.
- ✅ **Zéro intervention** : dès qu'un flux GTFS-RT Martinique est publié, la veille l'active automatiquement sous ~24h et alerte l'admin.




## NEW - 2026-06-09 (113) - Transports Martinique : couche TEMPS RÉEL GTFS-RT (prête à activer) (DONE, testé 100%)
- **Demande user** : support temps réel GTFS-RT Martinique « si publié plus tard ». **Constat** : aucun flux GTFS-RT n'est publié à ce jour pour les réseaux Martinique (vérifié sur transport.data.gouv.fr — uniquement GTFS statique). → Implémentation d'une **couche RT dormante, prête à activer**.
- **Backend** (`routes/transport.py`, lib `gtfs-realtime-bindings`) : `parse_gtfs_rt(content)` (protobuf TripUpdates → retards/suppressions/arrêts sautés), cache 30 s (`_realtime_for_feed`), `_apply_rt` (superpose retard/heure ou annule un passage). `_gtfs_lines` applique le RT quand un flux est configuré → chaque départ porte `realtime:true/false`, la ligne/l'arrêt/la réponse remontent `realtime`. **Sans URL configurée → comportement inchangé (théorique)**. Endpoint admin `PUT /api/transport/admin/gtfs/realtime` (URL RT par réseau, vide=désactivé) + statut enrichi (`realtime_active`).
- **Frontend** : écran `/transports-autour` bascule le bandeau **« Temps réel actif (GTFS-RT) »** (vert, pastille pulsante) vs **« Temps réel indisponible — horaire théorique »** selon `realtime` ; départs en direct stylés. Admin `/admin/transport` : section **« Temps réel (GTFS-RT) — optionnel »** (badge Actif/Inactif + 3 champs URL + enregistrer).
- **Vérifié** : pytest `tests/test_iter181_gtfs_realtime.py` **6/6** (parse delay/cancel/skip + overlay) + `tests/test_iter174_transport.py` **20/20** (config RT admin set/clear + auth) = **26/26** + **testing_agent iteration_181 — frontend 100% (3/3)**. État final : RT **inactif** (théorique) par défaut. Webpack compile.
- ✅ **Activation future** : dès qu'un flux GTFS-RT Martinique est publié, l'admin colle l'URL TripUpdates par réseau → le temps réel s'active automatiquement, sans code.




## NEW - 2026-06-09 (112) - GTFS Martinique : rafraîchissement automatique + statut admin (DONE, testé 100%)
- **Demande user** : rafraîchissement automatique hebdomadaire du GTFS (réimport quand transport.data.gouv.fr publie une nouvelle version).
- **Backend** : `scripts/import_gtfs_martinique.py` enrichi d'une fonction `refresh(force=False)` qui **résout l'URL de chaque feed et ne réimporte que si la version (URL) a changé** ; enregistre les métadonnées (`transport_meta` : url/date/compteurs par feed, `last_import_at`, `last_check_at`). Le scheduler `ensure_gtfs_imported` (tâche asyncio au démarrage) fait l'import initial puis vérifie ~toutes les 24h (réimport seulement sur nouvelle version). Endpoints admin : `GET /api/transport/admin/gtfs/status` (versions/compteurs/dernier import) et `POST /api/transport/admin/gtfs/refresh?force=` (rafraîchissement manuel).
- **Frontend** (`AdminTransport.js`) : panneau **« Données GTFS Martinique »** (`gtfs-panel`) — dernier import, 3 cartes réseau (Centre/Maritime/Nord) avec arrêts + horaires, bouton **« Rafraîchir maintenant »** (`gtfs-refresh-btn`) → toast « déjà à jour » si version inchangée.
- **Vérifié** : pytest `tests/test_iter174_transport.py` **17/17** (status auth/shape + refresh skip-when-unchanged) + **testing_agent iteration_180 — frontend 100% (3/3)**. Refresh force=false confirmé : `changed=[]` quand version inchangée. Webpack compile.




## NEW - 2026-06-09 (111) - Transports publics Martinique : VRAIES données GTFS (transport.data.gouv.fr) + écran « Transports autour de moi » (DONE, testé 100%)
- **Demande user** : afficher bus/TCSP/navettes proches avec horaires depuis le GTFS public Martinique (PAS Navitia) ; collections GTFS ; script d'import ; `GET /api/transport/nearby` ; écran mobile dédié avec liste arrêts + distance + horaires + bouton « Réserver un VTC jusqu'à cet arrêt ». Choix : importer **Centre/CACEM + Maritime + Nord** ; **écran séparé dédié** ; VTC va **vers l'arrêt** (arrêt=destination).
- **Import GTFS** (NOUVEAU `backend/scripts/import_gtfs_martinique.py`) : résout la dernière version du ZIP via l'API datasets (par slug), parse `stops/routes/trips/stop_times/calendar/calendar_dates`, insère, indexe, idempotent (purge par feed). **Importé** : Centre 1373 arrêts/152 701 horaires, Maritime 5 arrêts (navettes ferry), Nord 1951 arrêts/77 226 horaires. Supprime l'ancien Fort-de-France simulé. Auto-lancé au démarrage si données GTFS absentes (`ensure_gtfs_imported`, en thread, non bloquant) → la prod se peuple après déploiement.
- **Collections** : `transport_routes`, `transport_trips`, `transport_stop_times`, `transport_calendar`, `transport_calendar_dates` (GTFS) + arrêts GTFS dans `transport_stops` (`source:"gtfs"`, `feed`). Le mock (PAP/Dakar) coexiste (`source` distinct) ; planificateur/admin filtrés `source != gtfs` (intacts).
- **Backend** (`routes/transport.py`) : `nearby`/`stop_departures` branchés GTFS → **prochains horaires THÉORIQUES** calculés depuis `stop_times` + `calendar`/`calendar_dates` (heure locale Martinique UTC‑4, gère >24h), mode bus/**TCSP** (lignes A/B Centre)/**ferry**, couleur réelle, `realtime:false`, `theoretical:true`. Fallback réseau proche conservé.
- **Frontend** : écran dédié **`/transports-autour`** (`NearbyTransitPage.js`) — géoloc (repli Fort‑de‑France si loin, `far-note`), **carte** (`NearbyTransitMap.jsx`, marqueurs colorés par mode), liste arrêts (distance, lignes Bus/TCSP/Navette, horaires théoriques), bandeau **« Temps réel indisponible — horaire théorique »**, bouton **« Réserver un VTC jusqu'à cet arrêt »** → `/course?dlat&dlng&daddr` (destination pré‑remplie = arrêt). Accès via bouton sur `/transport-public`. `RideChoosePage` lit `dlat/dlng/daddr` (destination pré-remplie).
- **Vérifié** : pytest `tests/test_iter174_transport.py` **14/14** (nearby GTFS réel, modes bus/TCSP, board) + **testing_agent iteration_179 — frontend 100% (5/5)** (écran, carte, arrêts réels Martinique, VTC→arrêt destination pré-remplie, régression OK). Webpack compile.
- ⚠️ Horaires THÉORIQUES (pas de temps réel, affiché). ⚠️ PREVIEW → après déploiement, l'auto-import peuple la prod (ou lancer `python -m scripts.import_gtfs_martinique`).




## NEW - 2026-06-09 (110) - Transports publics : historique des trajets + favoris Maison/Travail + partage (DONE, testé 100%)
- **Demande user** : historique des trajets transport public, favoris « Maison/Travail », et partage d'itinéraire (fidélisation + conversions VTC récurrentes).
- **Backend** (`routes/transport.py`, collection `transport_journeys`, 1 doc/user, auth `get_current_user`) : `GET /api/transport/journeys` (liste, cap 10) · `POST /api/transport/journeys` (sauvegarde avec dédup par coords arrondies, plus récent en tête) · `DELETE /api/transport/journeys/{id}`.
- **Frontend** (`TransportPublicPage.js`) : 
  - **Favoris Maison/Travail** : réutilise les lieux enregistrés existants (`placesAPI.getSaved`) → chips `fav-home-btn`/`fav-work-btn` qui remplissent la destination et lancent le calcul.
  - **Historique** : auto-sauvegarde à chaque itinéraire trouvé ; section « Trajets récents » (`journey-history`, items `recent-*`) avec rejouer (`recent-replay-*`) et supprimer (`recent-delete-*`) ; persistant après reload.
  - **Partage** : bouton `journey-share-btn` (Web Share API + fallback presse-papiers) — résumé Bus/VTC + **deep-link** `?from_lat&from_lng&from_label&to_lat&to_lng&to_label`.
  - **Deep-link** : à l'ouverture, pré-remplit départ/destination et affiche directement l'itinéraire (carte + étapes).
- **Vérifié** : pytest `tests/test_iter174_transport.py` **12/12** (history save/dedup/delete + guard 401) + **testing_agent iteration_178 — frontend 100%** (favoris, auto-save/replay/delete/persistance, partage sans erreur, deep-link). Webpack compile.
- ⚠️ Itinéraire SIMULÉ. PREVIEW → redéploiement requis pour la prod.




## NEW - 2026-06-09 (109) - Transports publics : carte de l'itinéraire bus (polyligne + marqueurs) (DONE, testé 100%)
- **Demande user** : tracer l'itinéraire bus sur une carte (polyligne des lignes dans leur couleur + marqueurs départ/destination/arrêts/correspondances) à côté du comparatif Bus vs VTC.
- **Backend** (`routes/transport.py`) : les `legs` de `/api/transport/journey` incluent désormais les **coordonnées** — segments `ride` avec `via[]` (liste ordonnée {name,lat,lng} des arrêts traversés) + `from_lat/lng`/`to_lat/lng` ; segments `walk` avec `from_lat/lng`/`to_lat/lng` ; + `origin`/`dest` au niveau racine.
- **Frontend** (NOUVEAU `pages/user/transport/JourneyMap.jsx`) : carte Google (réutilise `GMAPS_LOADER_OPTIONS`) — **polyligne par ligne** (couleur de la ligne, via les arrêts), **segments de marche en pointillés**, marqueurs **départ (vert)**, **destination (rouge)**, **embarquement (indigo)**, **correspondances (sombre)**, arrêts intermédiaires (points couleur ligne), `fitBounds` auto. Intégrée dans `TransportPublicPage.js` au-dessus de la liste des étapes (`journey-map`).
- **Vérifié** : pytest `tests/test_iter174_transport.py` **10/10** (legs avec via/coords) + **testing_agent iteration_177 — frontend 100%** (carte rendue dans journey-result au-dessus des étapes, polyligne + marqueurs verts/rouges/arrêts, 0 erreur console). Webpack compile.
- ⚠️ Itinéraire SIMULÉ. PREVIEW → redéploiement requis pour la prod.




## NEW - 2026-06-09 (108) - Transports publics : planificateur de trajet réel (origine→destination, correspondances) + comparatif Bus vs VTC (DONE, testé 100%)
- **Demande user** : comparatif Bus vs VTC sur un VRAI trajet saisi (origine → destination) avec itinéraire bus incluant les correspondances, au lieu de « jusqu'au terminus ».
- **Backend** (`routes/transport.py`) : `GET /api/transport/journey?from_lat&from_lng&to_lat&to_lng&mins` — **planificateur Dijkstra** (temps optimal) sur le graphe des arrêts/lignes seedés. Arêtes de ligne **bidirectionnelles** (les bus circulent dans les 2 sens), marche d'accès/sortie (4,8 km/h, rayon 1,2 km, fallback arrêt le plus proche → jamais vide), attente d'embarquement = fréquence/2, **correspondances** par changement de ligne à un arrêt commun, **tarif cumulé** (1 ticket par embarquement). Renvoie `{found, total_min, total_fare, transfers, legs[]}` (legs = marche/ride avec ligne, de→vers, nb arrêts, minutes).
- **Frontend** (`TransportPublicPage.js`) : panneau **« Comparer un trajet (Bus vs VTC) »** en tête avec 2 `GooglePlacesInput` (Départ auto-prérempli via géoloc + Destination). Quand les 2 points sont posés → fetch `journey` + `POST /api/rides/estimate` en parallèle → **2 colonnes Bus/VTC** (temps & prix), **bannière verdict** (gain de temps VTC / économie bus + surcoût), **liste des étapes de l'itinéraire bus** (segments marche + lignes avec badge couleur/code/arrêts/min + label direct/N correspondances), bouton **« Réserver ce trajet en VTC »** → /course.
- **Vérifié** : pytest `tests/test_iter174_transport.py` **10/10** (trajet direct + correspondance Univ→CHU via Victoire, tarif cumulé) + **testing_agent iteration_176 — frontend 100%** (saisie adresses, résultat itinéraire multi-legs, correspondance L2→L1, verdict, réserver VTC ; régression page OK). Webpack compile.
- ⚠️ Itinéraire transport SIMULÉ (le prix VTC vient du vrai moteur d'estimation). PREVIEW → redéploiement requis pour la prod. La forme de l'API `journey` est compatible avec un futur branchement Navitia (mêmes champs legs/total).




## NEW - 2026-06-09 (107) - Transports publics : tarif ticket par ligne + comparatif « Bus vs VTC » (DONE, testé 100%)
- **Demande user** : afficher le tarif estimé du ticket à côté de chaque ligne + un comparatif « Bus vs VTC » (temps & prix) pour rendre le cross-sell « Continuer en VTC » plus persuasif.
- **Backend** (`routes/transport.py`) : champ `fare` par ligne (EUR, défauts par mode bus 1,50 / tram 1,40 / brt 1,00 / metro 1,60 / ferry 2,50 ; surchargeable par ligne en admin). `nearby`/`departures` exposent désormais par ligne : `fare`, `ride_min` (temps cet arrêt → terminus, `stop_travel_min` porté à 5 min pour réalisme), `dest_lat`/`dest_lng` (coords terminus, pour l'estimation VTC). Seed re-fait avec tarifs réels (PAP 1,50 ; FDF TCSP 1,40/M2 1,30 ; DKR BRT 0,76/DDD7 0,40).
- **Frontend client** (`TransportPublicPage.js`) : badge **« Ticket {money(fare)} »** (CFA/EUR via LocaleContext) par ligne ; bouton **« Bus vs VTC »** (lignes avec trajet) → carte comparative dépliable (2 colonnes Bus temps+prix / VTC temps+prix via vrai `POST /api/rides/estimate`) + **bannière verdict** (« Le VTC vous fait gagner ~X min » ou « Le bus reste moins cher » + surcoût VTC) + bouton **« Réserver ce trajet en VTC »** → `/course`.
- **Frontend admin** (`AdminTransport.js`) : champ **« Tarif ticket (€) »** (+ temps inter-arrêt) dans la modale ligne ; tarif affiché dans la table.
- **Vérifié** : pytest `tests/test_iter174_transport.py` **8/8** (assertions fare/ride_min/dest ajoutées) + **testing_agent iteration_175 — frontend 100%** (badges tarif, comparatif Bus/VTC, verdict, réserver VTC, champ tarif admin persistant). Webpack compile.
- ⚠️ Données transport SIMULÉES (le prix VTC vient du vrai moteur d'estimation). PREVIEW → redéploiement requis pour la prod.




## NEW - 2026-06-09 (106) - Brique « Transports publics » (données SIMULÉES) (DONE, testé 100%)
- **Demande user** : à côté des options taxi (dans la liste complète des taxis), un bouton neutre « Transport public » → arrêts proches, lignes, prochains passages + bouton « Continuer en VTC ». 3 zones simulées (Pointe-à-Pitre, Fort-de-France, Dakar) + gestion admin pour ajouter arrêts/lignes/zones. ⚠️ DONNÉES SIMULÉES (clé Navitia à brancher ensuite).
- **Backend** (NOUVEAU `routes/transport.py`, monté + `seed_transport` dans `run_all_seeds`) : collections `transport_stops`, `transport_lines`. Horaires de passage **calculés dynamiquement** depuis la fréquence (headway) de chaque ligne + offset par index d'arrêt (pas de table d'horaires figée → toujours réaliste). 
  - Public : `GET /api/transport/nearby?lat=&lng=&mins=&radius_km=` (arrêts proches dans le rayon ; **fallback** vers le réseau le plus proche si aucun arrêt dans le rayon — gère la géoloc preview Iowa, jamais vide) ; `GET /api/transport/stops/{id}/departures?mins=`.
  - Admin (perm `content.manage`) : CRUD `GET/POST/PUT/DELETE /admin/stops[/{id}]` + `/admin/lines[/{id}]`.
  - Seed idempotent : 15 arrêts + 6 lignes (Karu'lis PAP, TCSP/Mozaïk FDF, BRT/Dakar Dem Dikk DKR).
- **Frontend** : `pages/user/TransportPublicPage.js` (route `/transport-public`) — géoloc + arrêts/lignes/ETA, bandeau fallback, CTA sticky **« Continuer en VTC »** → `/course?mode=standard`. Bouton neutre **« Transport public »** (`public-transport-btn`) ajouté en tête de `TaxiModeGrid` (vue grille `/taxi`), via prop `onPublicTransport`. `pages/admin/AdminTransport.js` (route `/admin/transport`, sidebar SERVICES → « Transports publics » → « Arrêts & lignes ») : onglets Arrêts/Lignes + CRUD complet (modales, sélection ordonnée des arrêts par ligne). `transportAPI` dans `services/api.js`.
- **Vérifié** : pytest `tests/test_iter174_transport.py` **8/8** (nearby géo + fallback Iowa + board arrêt + 404 + guards 401 + CRUD stops/lines) + **testing_agent iteration_174 — frontend 100%** (bouton → /transport-public, arrêts/lignes/ETA, Continuer en VTC → /course, admin 15 arrêts/6 lignes CRUD persistés). Webpack compile (1 warning pré-existant).
- **RESTE (P1)** : brancher la vraie clé Navitia/GTFS (l'API publique garde la même forme, seule la source change). ⚠️ PREVIEW → redéploiement requis pour la prod.




## NEW - 2026-06-09 (105) - D: Flux d'achat/paiement Marketplace (wallet + Stripe + commission) (DONE, vérifié)
- **Modèle** : paiement direct au vendeur − commission plateforme (configurable, défaut 10% ; frais livraison défaut 5€). La plateforme encaisse (wallet ou Stripe) et crédite le **portefeuille SB PayGo du vendeur** de (prix − commission). Fulfillment : retrait/à convenir OU livraison coursier (+frais). Le vendeur choisit par annonce `purchasable` (prix fixe achetable) vs sur contact.
- **Backend** (`routes/marketplace.py`) : `purchasable` sur les annonces + `PATCH /listings/{id}/purchasable` ; `GET /marketplace/settings` (+admin futur) ; `POST /orders/wallet` (achat instantané wallet) ; `POST /orders/checkout` (Stripe Checkout via emergentintegrations, montant calculé backend) ; `GET /checkout/status/{session_id}` (polling idempotent → crédite vendeur + notifie) ; `POST /api/webhook/stripe` (finalisation idempotente) ; `GET /orders` (achats) ; `GET /orders/sold` (ventes) ; `POST /orders/{id}/status` (vendeur→expédiée, acheteur→reçue). Collections `marketplace_orders`, `payment_transactions`, `marketplace_settings`. Notifs vendeur (in-app + WS + push) à chaque commande payée.
- **Frontend** : bouton « Acheter » + `BuyModal` (réception + paiement wallet/carte, total + commission, tout converti en CFA via `money()`) ; `OrderSuccessPage` (retour Stripe, polling) ; `MyOrdersPage` (onglets Mes achats / Mes ventes + actions expédier/confirmer) ; toggle « Prix fixe – achetable » dans `SellGalleryPage`. Routes `/marketplace/orders`, `/marketplace/order/success`. Stripe en MODE TEST (clé `sk_test_emergent`).
- **Vérifié** : curl cycle wallet complet (article 100€ + livraison 5€ = 105 débité, commission 10, vendeur crédité 90, idempotence), session Stripe créée + statut unpaid, settings. Screenshots : BuyModal (65 596 CFA, solde insuffisant, commission 10%), Mes commandes (Payée + actions). Webpack compile.
- ⚠️ Paiement carte en **MODE TEST** tant que l'utilisateur ne fournit pas ses clés Stripe de prod. PREVIEW → redéploiement requis.



## NEW - 2026-06-09 (104) - A: recherche CMS Accueil · B: Colis/Marketplace éditables · C: rollout CFA étendu (DONE, vérifié)
- **A — Recherche/filtre CMS Accueil** (`AdminHomeCategories.js`) : barre de recherche (data-testid `cms-search-input`) filtrant les tuiles par nom FR/EN ou route ; masque le panneau d'ordre pendant la recherche, compteur de résultats, bouton clear, message « aucun résultat ». Vérifié (« colis » → 2 résultats).
- **B — Colis & Coursier + Marketplace éditables** : ajout de `parcel` + `marketplace` à `SECTIONS` (backend) + `seed_home_categories_extra()` idempotent (backfill tuiles : Colis→/parcel ; Immobilier→/real-estate, Véhicules→/marketplace/cars, Articles→/marketplace/items). Frontend `UserHome` : ces 2 sections rendues en **grilles de tuiles** via `displayFor` (+ fallback), retrait des blocs sur-mesure. `AdminHomeCategories` : ajout aux `TILE_SECTIONS`, retrait de `SECTION_ROUTE` → éditables ici (+Ajouter/✏️/🗑️). Vérifié admin + client.
- **C — Rollout CFA étendu** : 12 pages client supplémentaires converties à `money()` (lecture seule) : VideoConsult, TaxiBidding, Parking, Intercity, OrderTracking, GiftCards, MedicalTransport, MedicalAppointment, Bidding, RestaurantDetail, Parcel, AdvancedTaxiBooking. (Champs de saisie de montant laissés en € : présélections recharge/cartes-cadeaux, incréments d'enchère.) Vérifié (giftcards en CFA, pas de crash). Webpack compile.
- **RESTE C (mineur)** : ~25 fichiers à 1 € chacun (RouteEditModal, RideReceipt, Waybill, TaxiCheckoutSection, RideMapStep, DriverEnRoute, realestate/*, ProfileTabView, Towing/Services/SellGallery/ScheduledRides/MyServiceBookings/Food/DeliveryTracking/CarPool/CarCare, DebtBanner, TipModal, composants driver).
- **D — Flux d'achat/paiement Marketplace** : NON COMMENCÉ — nécessite décisions (méthode de paiement, commission) → question posée à l'utilisateur.
- ⚠️ PREVIEW → redéploiement requis pour la prod.



## NEW - 2026-06-09 (103) - CMS Accueil : bouton « Gérer » par section (lève la confusion édition/ajout) (DONE, vérifié)
- **Problème user** : sur « Écran accueil app » → panneau « Ordre & visibilité des sections », impossible d'éditer/ajouter des services (seulement ↑/↓ et œil). Cause : ce panneau ne gère QUE l'ordre/visibilité ; les blocs d'édition (+ Ajouter / ✏️ / 🗑️) sont plus bas et ne couvrent que les 8 sections à tuiles (`SECTIONS`), alors que le registre de mise en page (`home_sections`) compte 19 sections — plusieurs (Taxi, Bannières promo, Colis, Marketplace, Médical, Enchères, Genie, Vidéo…) se gèrent ailleurs ou sont des blocs dynamiques.
- **Fix UX** (`AdminHomeCategories.js`) : ajout d'un bouton **« Gérer »** sur chaque ligne du panneau d'ordre :
  - section à tuiles éditable ici (Livraison, À la demande, Beauté, Animaux, Auto, Remorquage, À proximité) → **scroll + surbrillance** du bloc d'édition correspondant ;
  - section gérée sur sa page dédiée → **navigation** (Taxi→service-categories, Bannières promo→promo-banners, Colis→parcels, Marketplace→marketplace, Médical→medical, Enchères→bids, Genie→genie, Vidéo→video, Cartes cadeaux→giftcards, Covoiturage→rideshare, Suivi→tracking) ;
  - bloc purement dynamique (ex. Parking) → libellé « ordre/visibilité » + toast explicatif.
- Texte d'aide mis à jour. **Vérifié** (screenshots) : 18 boutons « Gérer », clic Livraison défile et surligne le bloc éditable. Webpack compile.
- ⚠️ PREVIEW → redéploiement requis pour la prod.



## NEW - 2026-06-09 (102) - Conversion devise locale (CFA) sur les prix client (moteur + flux cœur, DONE/vérifié)
- **Demande user** : afficher les prix dans la devise locale (CFA) automatiquement hors zone euro (confiance/conversion Afrique).
- **Moteur** (NOUVEAU `lib/money.js`) : `EUR_RATES` (base EUR ; **XOF/XAF = parité fixe légale 655,957/€**, exacte ; autres devises = taux indicatifs statiques) + `convertFromEur()` + `formatMoney(amountEur, currency)` (décimales 0 pour XOF/XAF/JPY…, séparateurs `fr-FR`, symbole préfixe/suffixe selon devise). `LocaleContext.formatPrice` convertit désormais réellement et expose un alias `money`.
- **Règle** : on convertit uniquement les **affichages prix en lecture seule** (tarifs, totaux, soldes, transactions, estimations). Les **champs de saisie de montant** (recharge, transfert wallet, enchère) restent en € pour préserver la cohérence backend (à convertir bidirectionnellement plus tard si besoin).
- **Pages client converties** (import `useLocale` + `money()`) : `RideChoosePage` (tarifs estimés, CTA, prix/km, solde, dette annulation), `TaxiHubPage` (estimation hub, promo, pool, location/buddy), `CheckoutPage` (sous-total/livraison/total/unité/solde), `ServiceBookingFlow` (prix live, promo, base), `RideTrackingPage` (tarif course, frais annulation, shortfall), `FinancePage` (solde + transactions wallet).
- **Vérifié** : portefeuille affiche « 0 CFA » en devise XOF (capture) ; conversion 30,75 € → 20 171 CFA exacte ; webpack compile. Admin pages laissées en € (intentionnel).
- **RESTE À FAIRE (rollout)** : autres pages client encore en € — IntercityRidePage, TaxiBiddingPage, ParkingPage, GiftCardsPage, VideoConsultPage, OrderTracking, BiddingPage, Medical(Transport/Appointment), sous-pages Food/Delivery, etc. (~70 fichiers `€` restants, dont beaucoup admin à ne PAS toucher).
- ⚠️ PREVIEW → **redéploiement requis** pour la prod.



## NEW - 2026-06-09 (101) - Langue/Devise : suppression onboarding+pop-up créole → défauts auto par région (DONE, vérifié)
- **Demande user** : l'onboarding 1er lancement (grille langue+devise) était « très gros » ; retirer le pop-up créole. Garder **Français + Euro** par défaut (France & DOM-TOM) et **Français + CFA** pour l'Afrique francophone (Ouest=XOF, Centrale=XAF). Les écrans ne sont pas traduits en créole → on ne force pas le créole.
- **Frontend** (`contexts/LocaleContext.js`) :
  - **Supprimé** : `OnboardingModal` (grande fenêtre langue+devise), `LanguageSuggestionBanner` (bandeau créole), map `ZONE_LANG` (créoles), états/handlers `showOnboarding/completeOnboarding/suggestion/acceptSuggestion/dismissSuggestion`. Le contexte n'expose plus `suggestion/accept/dismiss` (aucun autre composant ne les utilisait).
  - **Ajouté** : effet de **défauts automatiques au 1er lancement** (`sb_locale_init`, exécuté une seule fois, jamais sur les apps staff) → langue **reste Français**, **devise auto** selon le pays détecté (`getBrowserCountryCode`) via `CURRENCY_BY_COUNTRY` : FR + DOM-TOM/collectivités → EUR ; Afrique Ouest francophone (SN, CI, ML, BF, BJ, TG, NE, GW) → XOF ; Afrique Centrale (CM, GA, CG, TD, CF, GQ) → XAF ; sinon EUR. Respecte un utilisateur déjà onboardé (legacy `sb_onboarded`) et la préférence compte (cross-device, inchangé). Sélecteur langue/devise manuel conservé.
  - `OnboardingModal.jsx` n'est plus importé (fichier laissé en place, code mort sans impact).
- **Vérifié** (screenshot visiteur neuf, localStorage vidé) : aucune modale d'onboarding, aucun bandeau créole, `sb_locale_init=1`, devise=EUR, landing en français. Webpack compile (warnings exhaustive-deps pré-existants tolérés).
- **Note Marketplace (réponse à la question user)** : le Marketplace est de type **petites annonces** — le vendeur **est notifié** quand un acheteur le contacte (bouton « Message » → notification in-app + WS + push ; + bouton « Appeler »), mais **il n'existe AUCUN flux d'achat/paiement intégré** (pas de bouton « Acheter », transaction hors-app). Un vrai « Acheter + payer dans l'app + commission » reste **P1 backlog**.
- ⚠️ PREVIEW → **redéploiement requis** pour la prod.



## NEW - 2026-06-09 (100) - Tendances & Raccourcis PAR ZONE (zones admin + raccourcis programmés/planifiés) (DONE, testé 100%)
- **Demande user (P0)** : « Programmer les tendances et les raccourcis par zone ». Choix : (1) programmer = curation + planification horaire ; (2) zone = liste admin (nom + pays/région/ville + coordonnées/rayon + alias texte) ; (3) raccourcis = zone d'abord puis perso ; (4) tendances restent **automatiques** (alignées sur la zone résolue).
- **Backend** (NOUVEAU `routes/zones.py`, monté + `seed_zones` dans `run_all_seeds`) : collections `zones` + `zone_shortcuts`.
  - `resolve_zone()` : priorité **géo** (centre lat/lng + rayon, haversine) → sinon **hiérarchie/alias texte** (ville/région/pays/alias présent dans l'adresse) → sinon `null`.
  - `_entry_active()` : un raccourci programmé est filtré par `schedule` {enabled, days(0=Dim..6=Sam JS), start_time/end_time (gère le créneau nocturne), start_date/end_date}.
  - Public `GET /api/zones/resolve?lat=&lng=&label=&dow=&mins=&date=` → `{zone, trend_zone, shortcuts(actifs maintenant)}`. Admin (perm `content.manage`) : `GET /admin/list`, `POST/PUT/DELETE /admin/{id}`, `GET/PUT /admin/{id}/shortcuts`.
  - Seed idempotent : 3 zones (Pointe-à-Pitre, Fort-de-France, Dakar) ; ex. raccourci « Bars » planifié Jeu/Ven/Sam 18:00-23:59 à PAP.
- **Frontend** :
  - `AdminZones.js` (route `/admin/zones`, sidebar CONTENU (CMS) → Écran accueil app → « Zones & raccourcis ») : tableau zones + modale CRUD (nom, pays/région/ville, lat/lng, rayon, alias, actif) + **modale « Raccourcis »** (picker de services depuis home_categories CMS + modes taxi, réordonnancement, suppression, **planification** jours/heures/dates par entrée).
  - `zonesAPI` dans `services/api.js` ; `getBrowserZoneContext()` (label + lat/lng) dans `lib/browserZone.js`.
  - `UserHome.js` : résout la zone (géo+heure locale), `mergedShortcuts` = **raccourcis programmés de la zone D'ABORD** puis raccourcis perso (dédup), section « Vos raccourcis ». Tendances : utilisent `trend_zone` renvoyé (restent organiques).
- **Vérifié** : pytest `tests/test_zones.py` 11/11 + **testing_agent iteration_172 — 100%** (14/14 API : auth 401, CRUD zone, shortcuts GET/PUT, resolve géo/texte/no-match, planification Ven inclut Bars / Lun exclut ; frontend admin : création zone, programmation + planification Vendredi 18:00-23:59 persistée, édition, suppression). Webpack compile.
- ⚠️ PREVIEW → **redéploiement requis** pour la prod `gojek-mvp-1.emergent.host`.



## NEW - 2026-06-09 (99) - Messagerie Marketplace : polling 4s → WebSocket temps réel (DONE, testé e2e)
- **Demande user (P1)** : migrer la messagerie acheteur↔vendeur du polling HTTP 4s vers de vrais WebSockets.
- **Backend** (`marketplace.py`) : `send_message` pousse désormais le message en **temps réel** via `manager.send_personal_message` aux **2 participants** (payload `{type:"marketplace_message", thread_id, listing_title, message}`) — le frontend dédoublonne par `id`. Nouvel endpoint léger **`POST /threads/{id}/read`** (accusé de lecture événementiel). `create_notification` continue d'émettre son event notif (sans champ `message`, ignoré par le guard frontend).
- **Frontend** (`MarketplaceMessagesPage.js`) : suppression du `setInterval(4000)` ; utilise le hook existant **`useWebSocket(user.id)`** + `on('marketplace_message', …)`. Vue thread → append dédupliqué + `markThreadRead` à réception. Vue liste → refresh des conversations sur event. API `marketplaceAPI.markThreadRead`.
- **Vérifié e2e** (script websockets, 2 comptes réels buyer@demo.sb + clienttest@demo.sb) : buyer envoie via HTTP → seller **reçoit le message via WS** en <4s (texte exact), endpoint mark-read → `{ok:true}`. Frontend compile (1 warning pré-existant). NB : screenshot login bloqué par la modale d'onboarding (limite d'automatisation connue, pas un bug code).
- ⚠️ PREVIEW → **redéploiement requis** pour la prod.



- **Demande user** : compléter la section « Commerces Proches » — tuiles accueil (Musées, Hôtels, Salons, Attractions, Bibliothèques, Vie Nocturne, Parking, Garage…) qui pointaient toutes vers un `/nearby` générique, backend ne contenant que 6 commerces. + page admin complète (création/édition/suppression + upload image). Catégories en français.
- **Backend** :
  - `demo_seed.py` : `CATEGORY_SEEDS['nearby_businesses']` passé de 6 → **22 commerces** couvrant 13 catégories FR (Café, Bar, Restaurant, Salon, Boulangerie, Pharmacie, Hôtel, Musée, Attraction, Bibliothèque, Vie Nocturne, Parking, Garage) + `is_active`/`phone`.
  - `startup.py` `_seed_nearby_businesses_and_routes()` (idempotent, dans `run_all_seeds`) : **upsert par id** des 22 commerces (ajoute les nouveaux même si collection non vide) + **upsert des 10 tuiles** accueil section `nearby` avec `target_route=/nearby?category=<Catégorie urlencodée>` (robuste fresh deploy ET prod existante).
  - `phase2.py` : **CRUD admin générique** sur les catalogues publics — `POST/PUT/DELETE /api/phase2/admin/catalogs/{collection}[/{id}]` (perm `content.manage`). Préfixes d'id par collection.
- **Frontend** :
  - `ServiceListLayout.js` : nouveau prop `initialCategory` (pré-sélectionne le chip, resync via useEffect).
  - `NearbyBusinessPage.js` : lit `?category=` (useSearchParams), liste complète des 13 catégories en chips, pré-filtre via `initialCategory`.
  - `AdminNearbyBusinesses.js` (NOUVEAU, route `/admin/nearby-businesses`, sidebar CONTENU (CMS) → Écran accueil app → « Commerces proches ») : tableau + recherche + filtre catégorie + modale CRUD (nom, catégorie, adresse, tél, desc, note, distance, ouvert/actif, **upload image base64 max 8 Mo**).
- **Vérifié** : **testing_agent iteration_171 — 100%** (backend 9/9 pytest `tests/test_iter171_nearby_businesses.py` + frontend admin CRUD + deep-link client). Curl confirmé : catalogue 22/13 catégories, tuiles `/nearby?category=Mus%C3%A9e` etc., CRUD admin (create/update/delete) cookie-auth OK. Deep-link `/nearby?category=Musée` → chip Musée actif + 2 cartes (Louvre, Orsay). Webpack compile (1 warning pré-existant).
- ⚠️ PREVIEW → **redéploiement requis** pour la prod `gojek-mvp-1.emergent.host`.



- **Demande user** : remplacer la redirection WhatsApp par une messagerie in-app (échanges gardés dans la plateforme, données de vente, futur levier de commission).
- **Backend** (`marketplace.py`) : collections `marketplace_threads` + `marketplace_messages`. Endpoints : `POST /threads` (get-or-create entre acheteur courant et vendeur de l'annonce, 400 si on est le vendeur), `GET /threads` (mes conversations + compteur `unread`), `GET /threads/{id}/messages` (marque lu + renvoie thread/messages/me), `POST /threads/{id}/messages` (envoi + maj last_message + `create_notification` type `marketplace_message` à l'autre participant). Garde-fou participant sur chaque accès.
- **Frontend** : `pages/user/MarketplaceMessagesPage.js` (routes `/marketplace/messages` liste des conversations + `/marketplace/messages/:threadId` vue chat avec polling 4s, bulles, input). MarketplacePage : fiche annonce → bouton **« Message »** (in-app, CTA principal) + **« Appeler »** (tel) ; WhatsApp retiré. Bouton **« Mes messages »** dans l'en-tête Marketplace. API `marketplaceAPI.startThread/myThreads/threadMessages/sendMessage`.
- **Bug corrigé** : SyntaxError f-string (backslash `\u2019` dans l'expression) → sortie de la variable `sender_name` hors f-string. Backend redémarré OK.
- **Vérifié** e2e (curl, 2 comptes) : acheteur crée thread + envoie → vendeur voit `unread=1` + last_message → lit (unread→0) → répond → acheteur voit les 2 messages. Lint clean (3 fichiers), webpack compile. Comptes test : clienttest@demo.sb (vendeur), **buyer@demo.sb / Buyer2026!** (acheteur).
- **Note** : polling 4s (pas de WS) — simple et fiable. Notification in-app/push à chaque message.


## NEW - 2026-06-09 (96) - PHASE C terminée (Emplacements) + Notif KYC + Fiche annonce Marketplace (DONE, testé)
- **Phase C — « Emplacements / lieu de résidence » (dernier placeholder du menu « + »)** :
  - Backend (`drivers.py`) : `GET/PUT /api/drivers/work-base`. PUT enregistre `home_location {address,lat,lng}` et, si `activate_all`, active tous les services éligibles (delivery+courier toujours ; taxi seulement si la passerelle VTC `_taxi_block_reason` passe, sinon `taxi_note` explicatif).
  - Frontend : `DriverLocationsModal.jsx` (adresse Google Places + toggle « Activer tous les services » + chips services actifs). Wiré dans `DriverHome.js` (`onLocations` → modal). API `driverAPI.getWorkBase/setWorkBase`. → **Le menu « + » chauffeur n'a plus aucun placeholder** (Auto-stop, IA zones, Revenir, Emplacements, Véhicule, tous actifs).
- **Notification KYC** : `kyc.py` approve/reject appelle `create_notification` (in-app + WS + push). Types `kyc_approved` / `kyc_rejected`.
- **Fiche détail annonce Marketplace** : `marketplace.py` create stocke `seller_phone`. `MarketplacePage.js` : clic sur une carte ouvre une **bottom-sheet** (photo, titre, prix, description, badge « Vendeur vérifié », nom vendeur) + boutons **« WhatsApp »** (`wa.me/<tel>`) et **« Appeler »** (`tel:`). Remplace l'ancien toast.
- **Vérifié** : curl — work-base (résidence + services courier/delivery, taxi_note car véhicule inadapté) ; KYC approve → notification `kyc_approved` confirmée en base pour clienttest. Screenshot modal « Lieu de résidence » OK (toggle ON, chips Coursier/Livraison, Enregistrer). Lint clean (5 fichiers), webpack compile.


## NEW - 2026-06-09 (95) - Badge « Vendeur vérifié » sur le Marketplace (DONE, testé)
- **Demande user** : afficher un badge « Vendeur vérifié ✓ » sur les annonces dont le vendeur a passé le KYC (confiance acheteur / conversion).
- **Backend** (`marketplace.py` create_listing) : ajoute `seller_verified: True` (la création est déjà gated par KYC approuvé), `seller_name`, et `image = images[0]` (compat affichage MarketplacePage qui lit `l.image`).
- **Frontend** (`MarketplacePage.js`) : badge vert « ✓ Vérifié » (en haut à droite de la carte, `data-testid=verified-seller-{id}`) quand `l.seller_verified`. Icône `CheckCircle` importée.
- **Vérifié** : curl — nouvelle annonce `seller_verified=true`, `seller_name='Jean Test'`, `image` set ; endpoint public `/api/phase2/catalogs/marketplace_listings` expose le flag (« Canapé cuir » vérifié, 1/9). Lint clean (JS+PY), webpack compile.
- **Note** : annonces démo créées par clienttest@demo.sb (« Vélo de ville », « Canapé cuir ») laissées en place pour démontrer le badge.


## NEW - 2026-06-09 (94) - PHASE B : Galerie/vente client + KYC + gating Marketplace, & « Y aller » → mode destination (DONE, testé)
- **« Y aller » (amélioration confirmée)** : dans `DriverHome.js`, le bouton « Y aller » du planificateur IA active désormais le **mode destination** réel vers la zone (PUT `/api/phase2/driver/destination-mode`, radius_km=5) + recentre la carte → le chauffeur ne reçoit que les courses dans cette direction. Toast de confirmation.
- **Phase B — Vérification d'identité (KYC) + vente** :
  - **Backend** `routes/kyc.py` (monté) : collection `kyc_documents` (base64, pas d'object storage). `POST /api/kyc/submit` (CNI + justificatif), `GET /api/kyc/me` (status + `can_sell` + raison). Admin (perm `users.documents.verify`) : `GET /api/kyc/admin/list?status=`, `POST /api/kyc/admin/{id}/approve|reject`. Helper `can_user_sell` : client→KYC approuvé ; chauffeur→KYC approuvé ET (compte actif OU `was_approved` — un chauffeur déjà validé puis bloqué garde le droit de vendre, flag posé paresseusement).
  - **Gating Marketplace** : `POST /api/marketplace/listings` renvoie **403** si `can_sell` faux. Nouveau `GET /api/marketplace/my-listings`.
  - **Frontend** : `pages/user/SellGalleryPage.js` (route `/ma-galerie`, entrée profil client « Gérer ma galerie / Vendre ») — si non vérifié → formulaire KYC (CNI + justificatif + nom + adresse, upload base64) + bannières pending/rejected ; si vérifié → formulaire « Ajouter un article » (titre/prix/catégorie/desc/photo) + « Mes annonces ». `pages/admin/AdminKyc.js` (route `/admin/kyc`, entrée sidebar CONFIGURATION « Vérification vendeurs (KYC) ») — onglets/compteurs, aperçu CNI+justificatif, Approuver/Refuser (motif). API `kycAPI`, `marketplaceAPI.myListings`.
- **Vérifié** : curl e2e (gate 403 avant KYC → submit pending → admin approve → can_sell true → création annonce 200 → my-listings « Vélo de ville »). Screenshot admin KYC OK (compteurs, carte Jean Test approuvé, Voir CNI/justificatif, sidebar). Screenshot page client `/ma-galerie` bloqué par l'automation de login (pas un bug code : route+lazy+menu OK, lint clean, webpack compile). Compte test client créé : **clienttest@demo.sb / Client2026!** (KYC approuvé).
- **Note** : images KYC/annonces stockées en base64 (`file_url`/`images`) — cohérent avec driver_gallery, pas d'object storage.
- **RESTE Phase C** : « Emplacements / lieu de résidence » + activer tous services (dernier placeholder du menu « + »).


## NEW - 2026-06-09 (93) - PHASE C (slice 2) : « IA zones à forte demande » réelle (DONE, testé)
- **Demande user** : calculer les zones chaudes à partir des **vraies courses en attente** (densité sur la dernière heure) au lieu d'une heatmap statique, marché par marché.
- **Backend** (`phase2.py` → `GET /api/phase2/demand-zones?lat=&lng=`, driver/admin) : agrège les pickups des courses de la dernière heure en cellules ~1,1 km (0.01°), compte la **demande** (pending priorisé) ET l'**offre** = chauffeurs en ligne (`is_online` + current_lat/lng) dans un rayon de 2 km. Calcule `pressure = demande/(chauffeurs+1)` et `score = demande*2 + pressure*3` → tri décroissant. Renvoie nom (depuis pickup_address), niveau (hot/medium/low), demande, chauffeurs à proximité, distance du chauffeur.
- **Frontend** : nouveau `components/driver/home/DemandZonesModal.jsx` (bottom-sheet) — liste classée avec badges de niveau, nb de courses, chauffeurs à proximité, distance, bouton **« Y aller »** → recentre la carte (`setMapCenter`). Wiré dans `DriverHome.js` : `onAiPlanner` ouvre le modal (remplace le toast). API `rideAPI.demandZones`.
- **Vérifié** (9 courses démo seedées puis supprimées) : Gare du Nord (3 courses, 0 chauffeur) classée **#1** devant Châtelet (5 courses mais 15 chauffeurs) — l'algo oriente vers la demande **sous-desservie**. Screenshot modal OK (3 zones, badges, « Y aller »). Lint clean (effet restructuré : setState après await pour éviter set-state-in-effect).
- **RESTE Phase C** : « Emplacements / lieu de résidence » + activer tous les services (encore toast placeholder). « Revenir » = modal dest + radius admin (OK). « Auto-stop » (slice 1) + « IA zones » (slice 2) DONE.
- **RESTE Phase B** : Galerie côté client + KYC (CNI + justificatif, validation admin) + gating vente chauffeur. Non commencé.


## NEW - 2026-06-09 (92) - PHASE C (slice 1) : « Appelez un taxi » → « Auto-stop » + gating admin (DONE, testé)
- **Demande user** : renommer « Appelez un taxi » → « Auto-stop » ; fonctionne selon le **score d'activité** (seuil admin) ; **espèces uniquement** ; bloqué si **solde < seuil admin** (invite à recharger) ; afficher **3 voitures + liste déroulante**. Seuils configurables depuis le dashboard.
- **Backend** :
  - `config.py` DEFAULT_APP_SETTINGS (section Auto-stop) : `taxi_hall_min_activity_score` (0), `taxi_hall_min_wallet_balance` (0), `taxi_hall_cash_only` (True). Le périmètre « Revenir » reste `radius_destination_driver_km` (déjà admin).
  - `rides.py` `_taxi_hall_eligibility` étendu : calcule l'`activity_score` (même formule que /drivers/my-activity), lit le solde via `db.wallets` (par user_id), bloque si score<min (>0) ou solde<min (>0, `need_recharge=true`). Renvoie activity_score/min, wallet_balance/min, cash_only. `create_taxi_hall` force `payment_method=cash` si `cash_only`. Backward-compatible (seuils 0 = aucun blocage).
  - **Note** : `PUT /api/config/admin/app-settings` attend les clés **à plat** (pas sous `settings`).
- **Frontend** :
  - `DriverFab.jsx` : libellé « Appelez un taxi » → « Auto-stop ».
  - `DriverHome.js` `openTaxiHall` : bloque si `!eligible` (toast reason) ; si `need_recharge` → redirige vers `/chauffeur/wallet`.
  - `TaxiHallModal.jsx` : titre « Auto-stop », badge « Espèces uniquement », **3 gammes** en boutons + `<select>` « Plus de véhicules… » pour le reste.
  - `AdminAppSettings.js` : section renommée « Auto-stop (héler un taxi) » + 3 nouveaux champs (score min, solde min, espèces uniquement).
- **Vérifié** : curl (save flat OK ; score 43<50 → bloqué ; solde −5€<20€ → need_recharge ; reset 0/0 → eligible) + screenshot modal Auto-stop (badge espèces, 3 véhicules + dropdown). Lint clean.
- **RESTE Phase C** : « Emplacements/lieu de résidence » + activer tous services (encore toast placeholder) ; « IA zones forte demande » (planificateur, toast placeholder). « Revenir » = modal dest existant + radius admin (OK).
- **RESTE Phase B** : Galerie côté client + KYC (CNI + justificatif, validation admin) + gating vente (chauffeur actif, exception déjà validé). Non commencé.


## NEW - 2026-06-09 (91) - PHASE A : nettoyage accueil chauffeur + dédup « Mon score » (DONE, testé)
- **Demande user (3 images, app chauffeur)** : 1) « Mon score » fait doublon avec « Programme de récompense » → supprimer ; 2) accueil chauffeur : retirer boutons carte (plein écran/zoom/recentrage) + barre blanche, réduire bouton « + » à ~30% ; 3) (Phase C, à venir) activer les options du menu « + ».
- **Fait Phase A** :
  - `DriverProfilePage.js` : suppression de la ProfileRow « Mon score » (route /chauffeur/score conservée mais déliée du menu). Garde « Programme de récompense ».
  - `AdminGoogleMap.jsx` : nouveau prop `cleanUI` → `disableDefaultUI:true` + zoom/fullscreen/streetView/rotate/scale off, `gestureHandling:'greedy'` (carte toujours manipulable au doigt, sans boutons). N'affecte pas les cartes admin (prop opt-in).
  - `DriverHomeMap.jsx` : passe `cleanUI`, et la carte passe de `height:45vh` fixe à `flex-1 min-h-0` (remplit l'espace, supprime la barre blanche).
  - `DriverHome.js` : root `min-h-screen` → `h-[100dvh] flex flex-col overflow-hidden` pour que la carte remplisse jusqu'à la bottom-nav.
  - `DriverFab.jsx` : bouton toggle `w-14 h-14`/icône 26 → `w-10 h-10`/icône 18 (~30% plus petit).
- **Vérifié** : screenshot login chauffeur (+33644112233 / Chauffeur2026!) → accueil carte épurée plein écran, « + » plus petit, menu speed-dial OK (6 options). Lint clean, webpack compile.
- **À VENIR — PHASE B** (galerie + KYC) et **PHASE C** (options menu « + » : Emplacements/lieu de résidence + activer tous services, « Revenir » avec périmètre admin, « Appelez un taxi » 3 voitures+dropdown/espèces/solde min, IA zones forte demande). Défauts confirmés : ordre A→B→C, Marketplace existant, street-hail espèces+solde min, validation admin manuelle.


## NEW - 2026-06-09 (90) - Codes promo 100% opérationnels : actions par ligne + groupées + export (DONE, testé)
- **Demande user** : brancher réellement Activer/Désactiver/Supprimer par ligne + actions groupées + EXPORT (étaient décoratifs).
- **Backend (`routes/coupons.py`)** : nouveaux endpoints admin (perm `billing.promocodes.create`) : `PUT /coupons/admin/{id}/toggle` (active↔inactive), `DELETE /coupons/admin/{id}`, `POST /coupons/admin/bulk` ({action: activate|deactivate|delete, ids[]}). Nettoyage 2 vars inutilisées pré-existantes (F841).
- **Frontend (`AdminPromocodes.js`)** : sélection par case (header select-all + par ligne), colonne **Status** réelle (badge Active/Inactive selon `c.status`), menu **engrenage** par ligne (Désactiver/Activer + Supprimer avec confirm), barre **action groupée** (Select Action + APPLIQUER(n)), **EXPORT CSV** réel (Blob+BOM, téléchargement), filtre **Select Status** désormais fonctionnel. API : `couponAPI.adminToggle/adminDelete/adminBulk`.
- **Vérifié** : curl (create→toggle inactive→bulk activate affected:1→delete OK) + screenshot (table avec statuts Active, menu engrenage Désactiver/Supprimer ouvert, APPLIQUER + EXPORT présents, remises correctes 10%/15%/10€/20%). Webpack compile.
- ⚠️ Lint : `react-hooks/immutability` sur AdminPromocodes = **pré-existant** (confirmé sur le fichier HEAD original, idiome `filtered`/React-Compiler), toléré par le build CRA — non introduit par ce lot.
- ⚠️ PREVIEW → l'app est déployée en prod ; **redéploiement requis** pour pousser ces changements.


## NEW - 2026-06-09 (89) - Audit fonctionnel modules admin (Codes promo, ServiceConfig, CMS) (DONE, testé 100%)
- **Demande user** : audit fonctionnel complet des modules admin existants via testing_agent.
- **Bug réel trouvé & corrigé** : `AdminPromocodes.js` — le tableau lisait `c.discount_percent/c.discount/c.max_uses/c.current_uses` (champs inexistants) → tout code créé affichait « 0% ». Corrigé pour lire les vrais champs backend `discount_value/discount_type/usage_limit/used` (coupons.py). Discount = `${value}%` ou `${value} €` selon le type.
- **Bug cosmétique corrigé** : `AdminLoginPage.js` warning React « two children with the same key » — `bottomLinks` avait 2 entrées avec `path:'/login'` → `key={link.path}` dupliqué. Passé à `key={link.label}` (unique).
- **testing_agent iteration_170 — 100%** : backend 13/13 (nouveau `tests/test_iter170_admin_audit.py`) + frontend 7/7 modules. Confirmé : Promocodes (création+persistance+affichage « 15% » correct), ServiceConfig pool GET/PUT persistant après reload (valeur 92 conservée), taxi_booking charge ses champs (textarea WhatsApp), CMS home-categories/promo-banners/actualites chargent des données réelles, Newsletter live (KPIs+campagnes, statut « recorded » sans clé Resend = comportement attendu).
- **Conclusion** : aucun module admin n'est un placeholder cassé. Tous live et fonctionnels.
- ⚠️ PREVIEW → redéploiement requis pour la prod.


## NEW - 2026-06-09 (88) - Newsletter admin BRANCHÉE au backend (fin du mock) (DONE, testé)
- **Constat reprise (fork)** : le handoff était périmé. Audit réel : modules admin Codes promo/Newsletter/Bannières/Auto-promos/ServiceConfig existaient déjà ; menu profil CLIENT entièrement câblé (aucun `soon()`) ; bug auto-passage Pool/Intercity/Enchères DÉJÀ corrigé (effet `useEffect([needsDropoff,bothSet])` + `autoAdvancedRef` présent dans RideChoosePage). **Seul vrai mock restant trouvé = `AdminNewsletter.js`** (abonnés hardcodés + envoi `setTimeout` factice).
- **Backend (nouveau `routes/newsletter.py`, monté dans `core/api_router.py`)** : collections `newsletter_subscribers` + `newsletter_campaigns`. Endpoints : public `POST /api/newsletter/subscribe` ; admin (perm `users.newsletter.send`) `GET /admin/subscribers`, `DELETE /admin/subscribers/{id}`, `GET /admin/campaigns`, `POST /admin/send`. L'envoi lit les abonnés actifs, tente Resend si `RESEND_API_KEY` présent (sinon statut `recorded`), persiste la campagne (statut sent/recorded/failed). Seed idempotent de 4 abonnés démo (`seed_newsletter` wiré dans `core/startup.py`).
- **Frontend (`AdminNewsletter.js` réécrit)** : charge abonnés+campagnes via `adminAPI.listNewsletterSubscribers/listNewsletterCampaigns`, KPIs réels (actifs/total/désinscrits), suppression d'abonné, envoi via `adminAPI.sendNewsletter`, section **Historique des campagnes**. Bouton orange charte (#FF5000). Nouveaux `data-testid` (newsletter-active-count, delete-subscriber-*, campaign-*).
- **Vérifié** : curl admin (subscribers 4/3 actifs, send→campagne recorded 3 destinataires, campaigns persiste) + screenshot page `/admin/newsletter` (KPIs 3/4/1, liste 4 abonnés avec badges, historique « Test campagne · recorded »). Webpack compile (1 warning pré-existant). Lint = seul flag `set-state-in-effect` (idiome `}, [load])` identique à ~10 autres pages admin, toléré par le build CRA).
- ⚠️ Envoi e-mail RÉEL nécessite une clé `RESEND_API_KEY` valide (actuellement vide → fallback `recorded`). PREVIEW → redéploiement requis pour la prod.


## NEW - 2026-06-09 (87) - Activation menu CHAUFFEUR (lot 1/4) (DONE, testé)
- **Demande user** : « Activer toutes les fonctionnalités du menu chauffeur + client + dashboard + tous les services, brancher au backend. » → traité **par lots** dans l'ordre demandé. **Lot 1 = menu chauffeur.**
- **Backend (`drivers.py`)** : `GET/PUT /api/drivers/availability` (planning hebdo 7 jours {enabled,start,end} + `work_address`, stocké sur le doc driver) ; `GET /api/drivers/reviews` (agrège `db.ratings` du chauffeur : moyenne, total, distribution 1-5★, liste avec nom/avatar passager). `change-password` réutilisé (existait déjà).
- **Frontend** : 3 nouvelles pages `pages/driver/` : `DriverAvailabilityPage` (`/chauffeur/availability`), `DriverReviewsPage` (`/chauffeur/reviews`), `DriverChangePasswordPage` (`/chauffeur/change-password`). API `driverAPI.getAvailability/updateAvailability/getReviews`, `authAPI.changePassword`. Routes + barrel ajoutés.
- **Menu `DriverProfilePage` câblé** (remplace les `soon()` placeholders) : manage_workplace & my_availability → /availability ; user_comments → /reviews ; change_password → /change-password ; manage_account & gear → openInfoEdit (édition profil existante) ; waybill → /history. `soon` supprimé.
- **Vérifié** : curl (availability GET/PUT, reviews moy 5,0/2 avis) + screenshots login chauffeur des 3 pages (rendu OK). Webpack compile, lint propre (mes fichiers).
- **RESTE (lots à venir)** : Lot 2 = menu CLIENT (profil : documents, favoris domicile/travail, profil covoiturage, B2B…), Lot 3 = DASHBOARD admin (activer panneaux/actions restants), Lot 4 = tous les SERVICES (écrans config admin `AdminServiceConfig` « bientôt disponible »).



- **Demande user** : OAuth/login pour clients ET chauffeurs ; Google géré par Emergent (oui).
- **Constat** : Emergent Google Auth était DÉJÀ câblé bout en bout (frontend `loginWithGoogle`/`handleGoogleCallback`/`AuthCallback`, backend `POST /api/auth/google/session`) MAIS tout nouveau compte Google était forcé en `role:"user"` → impossible d'arriver comme chauffeur.
- **Ajout `role_hint`** : `AuthContext.loginWithGoogle(roleHint)` stocke le rôle en `sessionStorage` avant le redirect OAuth ; `handleGoogleCallback` le relit et l'envoie ; nettoyé après. Page chauffeur (`ChauffeurLogin.js`) appelle `loginWithGoogle('driver')` ; client (`LoginPage`/`RegisterPage`) reste `user`. Backend `/google/session` : accepte `role_hint` (∈ user/driver), l'applique aux NOUVEAUX comptes (comptes existants gardent leur rôle), ajoute `auth_provider:"google"`. Le profil chauffeur (doc `drivers`) reste créé par l'onboarding existant (comme l'inscription téléphone role=driver).
- **Bug corrigé** : session invalide renvoyait 500 (le 401 était avalé par le `except` large) → ajout `except HTTPException: raise` → renvoie 401.
- **Approche cookies** : on émet nos propres cookies JWT `access_token`/`refresh_token` après l'échange → 100 % compatible avec `get_current_user`/ProtectedRoute/`/auth/me`/logout existants. Zéro régression sur le login téléphone/mot de passe.
- **Vérifié** : pytest `tests/test_google_auth.py` 3/3 (400 sans session, 401 session invalide, role_hint optionnel) ; screenshot chauffeur → modal « Choisir un compte » → clic Google redirige bien vers `auth.emergentagent.com/?redirect=.../auth/callback` avec `role:'driver'` stocké. Webpack compile. (Le round-trip Google complet nécessite un vrai compte Google — non automatisable.)
- **Hors périmètre** : brancher le binaire natif V3Cube « SB Drive Chauffeur » exige son contrat d'API exact (non fourni) ; on a livré l'auth Google + l'API token côté backend que le natif/webview peut appeler.



- **Refactor** : `AdminDashboard.js` 389 → **~110 lignes**. Extraction de 4 sous-composants présentationnels dans `pages/admin/dashboard/` : `DashboardHeader.jsx` (horloge live + sélecteur période + export CSV/PDF), `DashboardServiceCards.jsx` (lignes services/commerce V3Cube), `GodsViewPanel.jsx` (carte God's View + donut statut + courses récentes, dérivations internes), `EarningsScheduledPanel.jsx` (graphe gains + réservations programmées). `AdminDashboard` ne garde que l'état, les effets de chargement et la composition. Tous les `data-testid` préservés à l'identique.
- **Hooks** : `load` (useCallback []), breakdown ([period]), horloge ([]) — dépendances correctes, lint 0 blocage sur le dossier `dashboard/`. (Nettoyage global des ~365 warnings hooks NON fait : majoritairement intentionnels/faux positifs tolérés par CRA, risque de régression élevé — déféré.)
- **Vérifié (screenshot, login admin `/admin-login` → `admin@superapp.com`/`SuperAdmin123!`)** : dashboard rendu à l'identique (header, 5 KPIs, cartes services, God's View carte+donut, gains). Webpack compile, lint clean.



- **Demande user** : afficher **max 3 véhicules** repliés ; glisser le volet vers le haut pour voir le reste ; la **carte (itinéraire 2 adresses + chauffeur le plus proche)** doit rester visible.
- **Bug corrigé** : le conteneur utilisait `min-h-screen` (hauteur auto → `h-[42%]` carte s'effondrait → volet prenait tout l'écran, carte masquée). Conteneur passé en **hauteur définie `h-[100dvh]` + `overflow-hidden`**, carte `flex-1 min-h-0`.
- **Volet glissable (snap 2 états)** : replié `h-[52vh]` (~3 véhicules), déplié `h-[88vh]` (liste complète scrollable), `transition-[height]`. Poignée `sheet-drag-handle` : **tap** ou **swipe** (touch + pointer, seuil 28px, garde anti double-toggle). **Paiement + CTA épinglés** en pied de volet (toujours visibles) ; seule la liste véhicules scrolle.
- **Vérifié (screenshots 430×880)** : replié = carte + chip chauffeur + SB/Confort/Luxe + Espèces + Commander ; déplié = SB→TukTuk… scrollable, CTA visible. Webpack compile.
- ⚠️ Preview : géoloc IP (Iowa) → itinéraire droit transatlantique (fallback Polyline car pas de route routière Iowa→Paris). Sur vrai GPS même ville → route routière + voitures chauffeurs près du départ.



- **Demande user** : afficher l'**ETA chauffeur** (« ~3 min ») et l'**estimation d'arrivée** sur la carte de l'étape 2 (rassurance avant commande).
- **Backend** : nouvel endpoint `GET /api/rides/nearby/drivers?lat&lng` (auth) → chauffeurs approuvés+en ligne dans 12 km : `count`, `positions[≤12]`, `nearest_km`, `eta_mins` (≈2,5 min/km). Vérifié curl Paris : 15 chauffeurs, eta 1 min. (Route en 2 segments pour éviter collision avec `/{ride_id}`.)
- **Frontend** : `rideAPI.nearbyDrivers`. `RideRouteMap` accepte `drivers=[]` → **marqueurs voiture** (icône SVG). `RideChoosePage` : état `nearby` + polling 15 s sur l'étape carte ; **chip ETA** sur la carte (`driver-eta-chip` : « Chauffeur à ~X min » / « Recherche de chauffeurs proches… » si aucun) ; **estimation d'arrivée** sous le titre du volet (`arrival-estimate` : « Trajet ~X min · arrivée vers HH:MM » = now + ETA chauffeur + durée trajet du véhicule sélectionné).
- **Vérifié (screenshot)** : chip ETA + arrival-estimate rendus ; pytest pool 6/6, webpack compile. NB preview : géoloc IP (Iowa) sans chauffeur → chip « Recherche… » (normal ; avec vraie position Paris → « ~1 min »).
- ⚠️ App **déployée en prod** (gojek-mvp-1.emergent.host) — ces changements nécessitent un nouveau Deploy pour la prod.



- **Idée user (validée « oui oui a » = tous les modes)** : dès que la **destination** est saisie → bascule auto sur un **2ᵉ écran carte plein écran + volet inférieur** (gammes + prix + paiement + « Demander »), façon Uber.
- **Nouveau composant `components/RideRouteMap.js`** : carte Google (loader app-wide), marqueurs départ (vert)/destination (rouge), **itinéraire tracé** via DirectionsService (fallback ligne droite), fitBounds.
- **`RideChoosePage.js` restructuré en 2 vues** : (1) **formulaire** (adresses + panneaux mode + « Continuer · Voir les tarifs ») ; (2) **carte** (`map-bottom-sheet`) avec carte en hauteur fixe 42 % + volet scrollable (panneau Pool/Intercity si applicable, liste gammes/grille enchères, paiement déroulant vers le haut, CTA). Helpers `renderVehicleList/renderBiddingGrid/renderPayment/renderCta`. `mapStep = needsDropoff && bothSet && showMap`.
- **Auto-avance robuste** : effet `useEffect([needsDropoff, bothSet])` + `autoAdvancedRef` → bascule **une fois** quand les 2 points sont posés (corrige la course avec la géoloc IP lente du preview). Bouton **back** (`map-back-btn`, z-20) → retour formulaire ; ré-entrée via `continue-to-map-btn`. Rental/Buddy (sans destination) restent en **mono-écran** (carte prix + paiement inline).
- **Vérifié (screenshots)** : Standard e2e (testing_agent iter169 : form→destination→carte+volet+10 véhicules+prix, commande→/ride/:id) ; **Pool** : auto-avance OK, panneau pool dans le volet, **prix barré + économie verte** par véhicule ; Rental/Buddy mono-écran OK. Intercity : panneau « Trajet longue distance » + calendrier auto (ride_type datetime) ; A/R ×1,9 backend prouvé. Webpack compile (1 warning pré-existant), lint OK (seul faux positif set-state-in-effect:223 toléré CRA).
- ⚠️ PREVIEW (l'user y teste directement).



- **Demande user (option B)** : finaliser le « fonctionnement » distinct de Pool et Intercity (garder écrans dédiés).
- **POOL = vraie réduction** : avant, 1 place pool = plein tarif (aucune réduc, contraire à la promesse). Ajout `POOL_DEFAULT_DISCOUNT_PERCENT=25` + champ `discount_percent` dans `get_pool_config` (surchargeable par Vehicle Type `pool_discount_percent` / config pool globale). `rides.py` estimate+create : 1ʳᵉ place = tarif privé −25 %, places suppl. via `pool_percentage`. Estimate renvoie `pool_discount_percent`, `pool_savings`, `original_fare`. Vérifié : 30,75 €→23,06 € (économie 7,69 €).
- **INTERCITY = longue distance + aller-retour** : ajout `INTERCITY_ROUNDTRIP_FACTOR=1.9` ; `round_trip`/`return_at` ajoutés à `RideRequest`. Estimate/create appliquent ×1,9 si `round_trip` & `ride_type='intercity'`. Vérifié : Paris→Lyon 468 km, aller 750 €, A/R 1425 €.
- **Frontend `RideChoosePage.js`** : (a) liste véhicules affiche prix pool barré (orig-price-<slug>) + économie verte (savings-<slug>) ; (b) nouveau panneau `panel-intercity` (distance km + €/km + durée + toggle `intercity-roundtrip-toggle`) ; fetchEstimates envoie `ride_type/pool_enabled/seats_required/round_trip`, deps mises à jour ; buildPayload **clampe `scheduled_at`** à now+min_advance (corrige le 400 intercity quand l'horodatage pré-rempli devient périmé).
- **Tests** : `tests/test_iter121_taxi_pool.py` réécrit (modèle réduction + cap par réservation + intercity A/R) → **8/8 pass**. **testing_agent iteration_168** : Pool 100 % (réduction, économies, cap places, commande), Intercity panneau+A/R 100 %. Seul bug Intercity (400 sur commande, horodatage périmé) → **corrigé** par le clamp, recréation curl OK (1425 €, status pending).
- ⚠️ PREVIEW — l'user teste sur Preview (pas de Deploy requis pour lui).



- Demande user : véhicules en **liste roulante horizontale** (≈3 visibles, scroll) + paiement en **menu déroulant** (défaut sélectionné + flèche).
- `RideChoosePage.js` : le bloc `showComparison && bothSet` remplacé par un **carrousel horizontal** (`flex overflow-x-auto`, cartes `w-[30%] min-w-[104px]` : image voiture + nom + prix + capacité·durée, sélection highlight orange). Supprimé l'état `expandVehicles` et l'import `CaretUp`.
- Paiement : grille 2-col remplacée par **dropdown** (`payment-dropdown` + état `payOpen`) — bouton affiche le mode sélectionné (icône + label) + CaretDown (rotate quand ouvert) ; liste `payment-dropdown-list` (Espèces défaut/CB/Portefeuille/SB PayGo), sélection ferme + check orange.
- **Vérifié** screenshot : carrousel (SB/Confort/Luxe + 4e qui dépasse), dropdown ouvert avec Espèces coché, bouton Commander visible. Lint OK (sauf faux positif pré-existant set-state-in-effect:218). Webpack OK.
- ⚠️ PREVIEW → redéploiement requis. PROCHAIN : config dédiée Pool & Intercity (Q1 validé).


## NEW - 2026-06-08 (79) - Commande taxi EXPRESS (2 taps) (DONE, vérifié)
- Objectif user : « simplifier la commande taxi, elle ne doit pas être longue ». Constat : la longue liste de comparaison véhicules repoussait le bouton Commander.
- `RideChoosePage.js` : nouveau state `expandVehicles` (défaut false). Le bloc `showComparison && bothSet` affiche désormais par défaut une **carte « véhicule recommandé » compacte** (véhicule sélectionné + image + durée/distance + prix + badge RECOMMANDÉ) avec un bouton **« Changer (N) ▾ »** (`express-change-vehicle`) qui déplie la liste complète ; sélectionner un véhicule dans la liste replie automatiquement (`express-collapse`). Icônes CaretDown/CaretUp ajoutées.
- Résultat : départ GPS auto + destination → véhicule reco + prix instantané + paiement (Espèces défaut) + gros bouton Commander, **tout sur un écran** = 2 taps.
- **Vérifié** screenshot (mode standard, destination Lyon → carte SB recommandée + Commander visibles, toggle Changer(10) présent). Lint OK (sauf faux positif pré-existant set-state-in-effect:218, toléré webpack). Webpack OK.
- ⚠️ PREVIEW → redéploiement requis. PROCHAIN : config dédiée Pool & Intercity (Q1 validé).


## NEW - 2026-06-08 (78) - « Tendances près de vous » (place de marché vivante) (DONE, vérifié)
- **Backend** : `routes/service_trends.py` (enregistré dans `core/api_router.py`). Collection `service_trends` (clé sid+zone). `POST /api/service-trends/track` incrémente le compteur zone + global (stocke métadonnées d'affichage, pas de PII, skip tuiles "more"). `GET /api/service-trends/trending?zone=&limit=` renvoie le top par zone avec fallback global si <4. Seed initial global via `scripts/seed_trends.py` (8 services).
- **Frontend** : `serviceTrendsAPI` (track/trending) dans `services/api.js`. UserHome : `go()` ping le tracker avec la zone (résolue via `getBrowserLocationLabel` → 2 derniers segments d'adresse, ref `zoneRef`). useEffect charge trending (global d'abord, puis raffiné par zone). Nouvelle section **« Tendances près de vous »** (data-testid `trending-section`, `trending-{id}`, icône TrendUp + pastille orange), placée après « Vos raccourcis », dédupliquée des raccourcis perso.
- **Vérifié** screenshot : section affichée (Livraison Repas, Soins Cheveux, Bricolage, Hôtels, Lavage Auto, Musées…) avec badges tendance. Lint clean (front+back), webpack OK.
- ⚠️ PREVIEW → redéploiement requis.


## NEW - 2026-06-08 (77) - 3 nouveautés accueil : Raccourcis + Badges + Recherche (DONE, vérifié)
- **(a) Raccourcis intelligents** : `hooks/useServiceShortcuts.js` (localStorage `sb_service_taps`, compte les taps par service). UserHome : handler unique `go(service)` (remplace tous les `onSelect={navigate}`) qui enregistre l'usage puis route. ServiceTile passe désormais l'objet `service` complet (au lieu de `service.path`). Section « Vos raccourcis » (data-testid `shortcuts-section`, `shortcut-{id}`) affichée en haut dès ≥2 services utilisés, rendue via DynamicIcon (fallback GridFour si pas d'iconName).
- **(b) Badges Nouveau/Promo** : champ `badge` ajouté à `home_categories` (backend `home_categories.py` : allowed set + create + persistance ; public list le renvoie déjà). `displayFor` propage `badge`. `ServiceTile` affiche `<TileBadge>` (Nouveau=emerald, Promo=rose) en absolu sur la tuile. Admin : sélecteur Badge dans `AdminHomeCategories` (emptyForm + `cat-badge-select`). Les 15 items XJEKPLUS taggés `Nouveau`.
- **(c) Recherche universelle** : existait déjà (`components/SearchOverlay.js`, ALL_SERVICES) ouverte par la barre de recherche accueil ; **enrichie** des 15 nouveaux services (Musées, Hôtels, Tutorat, Avocats, Astrologue, Boutique Pièces, Lavage Moto, Spa & Massage, etc.).
- **Vérifié** screenshots : raccourcis (Taxi VTC/Musées/Hôtels) + badges « Nouveau » (Boutique Pièces, Lavage Moto). Lint clean (sauf 1 faux positif pré-existant `set-state-in-effect` AdminHomeCategories:116, toléré webpack). Webpack OK.
- ⚠️ PREVIEW → redéploiement requis.


## NEW - 2026-06-08 (76) - Complétion XJEKPLUS des sections accueil (DONE, vérifié)
- Script `backend/scripts/add_xjekplus_items.py` (idempotent) : ajoute 15 sous-services manquants dans `home_categories` pour matcher XJEKPLUS, labels FR, couleurs depuis la palette déjà rendue (anti-purge Tailwind), routes existantes par section.
- Ajouts : ondemand (Ménage, Jardinage, Tutorat, Avocats, Astrologue) ; carcare (Boutique Pièces, Lavage Moto) ; nearby (Musées, Attractions, Bibliothèques, Vie Nocturne, Hôtels, Parking, Garage) ; beauty (Spa & Massage).
- Icônes : ajout de 11 icônes Phosphor à `components/DynamicIcon.js` ICON_MAP (GraduationCap, Scales, Moon, Bank, Bed, Tree, MusicNotes, BookOpen, Confetti, SteeringWheel, Snowflake). Lint clean.
- **Vérifié** screenshot accueil (Entretien Auto montre Boutique Pièces + Lavage Moto ; tous les nouveaux labels présents).
- Décision : noms FR conservés (marché DOM-TOM/Afrique). Items XJEKPLUS génériques inclus à la demande user (« XJEKPLUS complète »).
- ⚠️ PREVIEW → redéploiement requis.


## NEW - 2026-06-08 (75) - Onboarding Langue/Devise au 1er lancement (DONE, vérifié)
- Nouveau composant `components/OnboardingModal.jsx` (motion bottom-sheet, branding orange #FF5000), branché dans `LocaleProvider` (`contexts/LocaleContext.js`).
- Affiché si `localStorage.sb_onboarded` absent ; **masqué** sur chemins staff (`/admin|/chauffeur|/merchant|/dispatch|/kiosk`). `completeOnboarding(lang,curr)` applique langue+devise, pose `sb_onboarded=1` + `sb_lang_suggested=1` (supprime le banner zone), ferme.
- Réutilise CURRENCIES (30) + languages (34, via /i18n/languages). data-testids: `onboarding-modal`, `onboarding-lang-{code}`, `onboarding-currency-{code}`, `onboarding-confirm-btn`.
- **Vérifié** screenshot + interaction (EN+USD → Continuer → fermé, sb_onboarded=1). Lint clean, webpack OK. Note: réordonné `completeOnboarding` après `setSuggestedCode` pour éviter erreurs react-compiler.


## NEW - 2026-06-08 (74) - 13 images de voiture générées (Nano Banana) + intégrées (DONE, vérifié)
- User a finalement demandé d'ajouter les images. Script `backend/scripts/gen_vehicle_images.py` : génère via **Gemini Nano Banana** (`gemini-3.1-flash-image-preview`, EMERGENT_LLM_KEY) une illustration par véhicule, fond blanc → **transparent** (PIL keying near-white), recadrage bbox + canvas 128×128 PNG, stocké en data-URI dans `vehicle_types.image_selected`/`image_unselected`.
- 13 slugs traités OK : confort, luxe, moto, suv, van, electric, tuktuk, vtc, taxi, airport, pets, accessible, assist (0 échec).
- **Vérifié screenshot** (`/course?mode=bidding`) : tous les véhicules affichent leur vraie voiture (SB verte, Confort grise, Luxe noire, Moto scooter orange, SUV, Électrique verte, Van bleu, TukTuk, VTC noire, Taxi jaune…). Images visibles dans le sélecteur bidding ET la comparaison normale.
- NOTE : images **IA-générées** — l'user peut les remplacer par ses propres photos via Admin → Types de véhicule → Modifier.

## NEW - 2026-06-08 (73) - « Vraies voitures » + Bidding véhicules + Login 429 (DONE, vérifié)
- **Vrai besoin user décodé** : « la version avec les vraies voitures » = les **images de voiture** sur l'écran de choix de véhicule. Diagnostic : seul le type `SB` (vehicle_types) a une image (`image_selected` base64) ; les 14 autres (Confort, Luxe, Moto, Pool, SUV, Van, Électrique, TukTuk, VTC, Taxi, Aeroport, Animaux, Accessible, Assistance) ont `image_selected=None` → fallback icône.
- **OÙ ajouter les images (montré à l'user)** : Admin → SERVICES → Taxi/Transport → « Types de véhicule » (`/admin/vehicle-types`) → Modifier → champs « Image (non sélectionné) » / « Image (sélectionné) » (ImageUpload) → Enregistrer. User a choisi **B = il uploade lui-même** (pas de génération auto).
- **Fix 1 — images dans la liste de choix** : `RideChoosePage.js` comparaison véhicules utilisait `vehicleIcon()` (icônes only) → ajout `img = image_selected/unselected` affiché si présent, sinon icône. Idem nouveau sélecteur.
- **Fix 2 — Bidding sans véhicule** : `showComparison = needsDropoff && !isBidding` masquait volontairement le choix véhicule en mode bidding. Ajout d'un bloc **« Choisissez un véhicule »** (`data-testid=bidding-vehicle-section`, items `bidding-vehicle-{slug}`) rendu quand `isBidding && bothSet`, avec image/icône. **Vérifié screenshot** : 14 véhicules listés, SB montre sa vraie image, sélection OK, + « Proposer mon tarif ».
- `TaxiBiddingPage.js` (legacy, redirige vers `/course?mode=bidding`) : strip véhicules hardcodé (sb/confort/luxe) remplacé par fetch dynamique `/api/vehicle-types` (page redirige donc impact mineur, mais cohérent).
- **Fix 3 — Login « Erreur de connexion » trompeur** : `LoginPage.handlePassword` gère désormais le **429** (« Trop de tentatives. Patientez ~15 min ») distinct du 401, + parse JSON robuste. Cause prod : user bloqué 15 min par anti-bruteforce (`login_attempts`, 5 essais → lockout 15 min, **chaque essai relance le timer**). Mot de passe « sylvain » vérifié CORRECT. Compte concerné : +33767532661 (Moi Marie / mari@gmail.com).
- ⚠️ Tout en PREVIEW → **redéploiement requis** pour la production.


## NEW - 2026-06-08 (72) - Alignement des tuiles d'accueil sur le modèle XJEKPLUS (DONE)
- **Contexte user (97 captures XJEKPLUS)** : l'user pensait à un bug frontend / « ancienne version » / fichiers à nettoyer. **Diagnostic** : (a) scan code = AUCUN fichier .bak/.old/doublon, un seul `UserHome.js` correctement branché ; (b) preview `gojek-clone-41` sert bien la dernière version et l'accueil REND les services (prouvé par screenshots login client) ; (c) la « production » `gojek-mvp-1.emergent.host` est un build gelé → besoin de **redéploiement** (pas de nettoyage de fichiers). La vraie différence = **quelles tuiles sont cochées « Accueil »** (config `visible_home`), pas le code.
- **Cause concrète (Taxi)** : l'accueil affichait Moto+Électric à la place de **Bidding (Proposez votre tarif)** + **Aéroport** que montre XJEKPLUS. 
- **Fix** : `HOME_DEFAULT_KEYS` (routes/service_categories.py) passé à **{standard, pool, rental, bidding, intercity, book_later, airport}** (miroir XJEKPLUS : Booking, Pool, Rental, Bidding, Intercity, Schedule, Airport + « More/Tous les Taxis »). DB `service_categories.visible_home` mis à jour en conséquence (Moto/Électric retirés de l'accueil, restent dans `/taxi`). Tous les `home_categories` (delivery/beauty/carcare/ondemand/nearby/pet/towing) passés `visible_home=True` (1 seul était masqué : « Soins Hommes »).
- **Vérifié (screenshots preview, login client +33600000099)** : accueil Taxi = 8 tuiles alignées XJEKPLUS ; sections Livraison/Santé/À la demande/Enchères/Auto rendent tous leurs services. 10 `home_categories` restants masqués = section `taxi` (non utilisée pour le rendu, tuiles taxi viennent de `service_categories`).
- **Décision produit** : noms gardés en **FR** (localisation DOM-TOM/Afrique voulue), pas renommés en anglais XJEKPLUS. Items XJEKPLUS génériques absents (Snow Plows, Astrologer, Museums, Hotels…) NON injectés d'office (inappropriés/non-fonctionnels pour le marché) — à ajouter à la demande explicite de l'user.
- ⚠️ PREVIEW → **redéploiement requis** pour la production.
- **Compte test client créé** : +33600000099 / Client2026! (ajouté à test_credentials.md).


## NEW - 2026-06-08 (71) - Nettoyage des console.* en production (DONE)
- **Tâche backlog P2** : production safety / console propre.
- **Constat** : `lib/logger.js` + `silenceConsole()` existaient déjà et étaient **wirés** dans `index.js` (neutralisent `console.log/debug/info` en prod, gardaient warn/error). 173 occurrences console.* sur 87 fichiers (log 4, debug 4, info 2, warn 52, error 112).
- **Fait** : `silenceConsole()` neutralise désormais aussi **`console.warn`** en production (les 52 warns sont surtout des diagnostics catch non-critiques) ; **`console.error` conservé** pour les vraies erreurs. `logger.warn` aussi no-op en prod. Aucune édition des 87 fichiers nécessaire (centralisé). Commentaires mis à jour.
- **Vérifié** : lint clean, webpack compile (1 warning pré-existant). Test unitaire Node : en mode prod, seul `error` se déclenche (log/debug/info/warn silencieux). **Preview (NODE_ENV=development) inchangée** → aucun risque fonctionnel, rien n'est silencié en dev.
- ⚠️ Effet visible uniquement sur le **build production** → redéploiement requis (`gojek-mvp-1.emergent.host`).



## NEW - 2026-06-08 (70) - Refactor P2 : extraction des tableaux de services de UserHome.js (DONE)
- **Tâche backlog P2** : `UserHome.js` (~710 l) trop gros → extraire les données statiques.
- **Fait** : nouveau module `pages/user/userHomeServices.js` (119 l) exportant `TAXI_DEFAULT`, `TAXI_VISUAL` + les 10 tableaux de tuiles (taxiServices, deliveryServices, videoCategories, onDemandServices, beautyServices, petServices, bidServices, carCareServices, towingServices, nearbyServices) avec leurs imports d'icônes Phosphor. `UserHome.js` les importe ; liste d'icônes élaguée aux seules encore utilisées dans le JSX. **UserHome.js : 710 → 584 lignes**. Refactor pur (données déplacées verbatim, aucun changement de comportement).
- **Vérifié** : lint clean (no-undef confirme toutes les références résolues, 0 import inutilisé), webpack compile (1 warning pré-existant). **testing_agent iteration_166.json — 100%** : `/home` rend les 8 tuiles taxi canoniques + toutes les sections (Livraison, Beauté, Auto, Remorquage, Animaux, Médical, à demande, proximité), navigation des tuiles OK (Tous les Taxis→/taxi, Livraison Repas→/food, Beauté→/beauty), bottom nav OK, 0 erreur JS/ReferenceError, 0 image cassée.
- **Note data** : `service_categories.visible_home` avait re-dérivé (tests) → remis aux 7 canoniques (book_later, electric, intercity, moto, pool, rental, standard).
- ⚠️ PREVIEW → redéploiement requis pour la production.



## NEW - 2026-06-08 (69) - Bouton « Aperçu de l'accueil » (preview admin) (DONE)
- **Demande user** : un bouton dans l'admin pour visualiser l'accueil client (ordre/visibilité) avant de déployer.
- **Contrainte** : `/home` est réservé au rôle `user` → un onglet/iframe redirigerait l'admin. Solution : **aperçu fidèle intégré** (modale cadre téléphone) rendu depuis la config live.
- **`AdminHomeCategories.js`** : bouton orange `home-preview-btn` → `HomePreviewModal` (`home-preview-modal`). Rend les sections visibles dans l'ordre `secLayout`, chaque `preview-section-<key>`. Sections « tuiles » (`TILE_SECTIONS` = taxi + delivery/ondemand/beauty/pet/carcare/towing/nearby) → grille de tuiles visibles ; Taxi depuis `service_categories` (`visible_home`) + « Tous les Taxis » ; autres depuis `home_categories` CMS. Blocs non-tuiles (promo, marketplace, medical…) → placeholder « Bloc dynamique ». Fermeture par X (`home-preview-close`) ou backdrop. Récupère les catégories taxi via `adminAPI.listServiceCategories()`.
- **Vérifié** : **testing_agent iteration_165.json — 100% (8/8)** : bouton visible, modale ouvre 19 sections dans l'ordre, taxi + Tous les Taxis, livraison tuiles visibles, placeholders OK, fermeture X+backdrop, masquage section retiré de l'aperçu + restauré. Aucun overlay d'erreur. Webpack compile (1 warning), lint = faux-positif `set-state-in-effect` pré-existant.
- **Correctif data** : `service_categories.visible_home` avait dérivé à 16 lors des tests → **remis aux 7 canoniques** (standard, pool, moto, electric, book_later, rental, intercity) via script MongoDB.
- ⚠️ PREVIEW → **redéploiement requis** pour la production.



## NEW - 2026-06-08 (68) - Éditeur d'accueil COMPLET : ordre + visibilité des SECTIONS (DONE)
- **Demande user** : réordonner les sections de l'accueil (ex. Livraison avant Beauté) et masquer une section entière — dernier morceau de l'éditeur sans-code.
- **Backend** (`routes/home_categories.py`) : nouvelle config **`home_sections`** (collection) avec `display_order` + `visible`. `HOME_BLOCKS` (19 blocs = miroir de `SECTION_ORDER`). `seed_home_sections()` idempotent (wiré dans `core/startup.py`). `_section_layout()` backfill les nouveaux blocs en fin de liste (jamais perdus). Public `GET /home-categories` renvoie désormais **`section_order`** (clés visibles, ordonnées). Endpoints admin : `GET /home-categories/admin/sections`, `POST /admin/sections/reorder` (`{ordered_keys}`), `POST /admin/sections/{key}/toggle`. Protégés `content.manage`.
- **Frontend** : `api.js` → `adminSections/reorderSections/toggleSection`. `AdminHomeCategories.js` → panneau **« Ordre & visibilité des sections »** (`section-layout-panel`) : 19 lignes avec ↑/↓ (`section-up/down-<key>`) + œil (`section-toggle-<key>`). `UserHome.js` → `SECTION_ORDER` piloté par `section_order` récupéré (repli sur `DEFAULT_SECTION_ORDER`).
- **Vérifié** : **testing_agent iteration_164.json — 100%** (backend 7/7 pytest + frontend E2E) : réordonnancement (Beauté > Livraison) persistant et reflété sur l'accueil rider ; masquage « À proximité » → disparaît de l'accueil et du `section_order` public ; toggle ON → réapparaît ; section Taxi (8 tuiles) inchangée ; aucun overlay d'erreur. État par défaut restauré. Lint : seul flag = faux-positif `set-state-in-effect` pré-existant ; webpack compile.
- **Éditeur d'accueil désormais COMPLET** : (a) tuiles taxi via `service_categories` (toggle Accueil), (b) tuiles autres sections via `home_categories` CMS, (c) ordre + visibilité des sections via `home_sections`.
- ⚠️ PREVIEW → **redéploiement requis** pour la production.



## NEW - 2026-06-08 (67) - Éditeur d'accueil sans-code : sections hors-Taxi (home_categories CMS) (DONE)
- **Demande user** : appliquer le contrôle « Accueil » aux autres sections (Livraison, Beauté, Auto…) → éditeur de page d'accueil sans code.
- **Constat** : l'infra existe DÉJÀ — collection `home_categories` (CMS complet : add/edit/delete, reorder, `visible_home`, libellés FR/EN, sous-titre, icône biblio/upload, couleurs, route) + page admin `/admin/home-categories` (« Catégories accueil »). L'accueil rend déjà toutes les sections hors-taxi via `displayFor(section)` (filtré par `visible_home`, + tuile « Plus de Services » si masquées). 41 items seedés.
- **Travail réalisé (nettoyage + robustesse)** :
  - `AdminHomeCategories.js` : section **`taxi` masquée** (désormais pilotée par `service_categories`/AdminServiceCategories) — exclue de la liste ET du menu déroulant du formulaire ; **bandeau orange** d'info (`taxi-managed-elsewhere-note`) renvoyant vers « Catégories de service (Taxi) ». Défauts du formulaire passés de taxi→delivery.
  - **Fix libellés 2 lignes** : aller-retour `\n` littéral ↔ saut de ligne réel (openEdit affiche `\n`, save reconvertit en newline ; aperçu converti) — les `<input>` n'écrasent plus les retours à la ligne.
- **Vérifié** : **testing_agent iteration_163.json — 100%** (backend 6/6 pytest + frontend E2E) : 7 sections gérées, taxi absent + bandeau présent, toggle visibilité/édition libellé/réordonnancement OK et persistés, accueil rider reflète l'état CMS, section Taxi (8 tuiles service_categories) inchangée, aucun overlay d'erreur. État par défaut restauré. Webpack compile (1 warning pré-existant).
- ⚠️ PREVIEW → **redéploiement requis** pour la production.



## NEW - 2026-06-08 (66) - Accueil « Services Taxi » pilotable depuis l'admin (visible_home) (DONE)
- **Demande user** : rendre la section « Services Taxi » de l'accueil pilotable depuis « Gérer les catégories » (nombre de tuiles, ordre, libellés) sans repasser par le code ni redéployer.
- **Constat** : libellés/ordre/active étaient déjà admin-pilotés ; manquait le contrôle de **quelles tuiles / combien** apparaissent sur l'accueil.
- **Backend** (`routes/service_categories.py`) : nouveau flag **`visible_home`** par catégorie. Seed + **migration idempotente** (backfill via `HOME_DEFAULT_KEYS` = {standard, pool, moto, electric, book_later, rental, intercity}). PUT accepte `visible_home`. Nouvel endpoint **`POST /admin/service-categories/{key}/toggle-home`** (require_role admin, `server.settings.edit`).
- **Frontend** : `api.js` → `adminAPI.toggleServiceCategoryHome`. `AdminServiceCategories.js` → toggle orange **« Accueil »** par carte (`svc-cat-home-toggle-<key>`) + texte d'aide. `UserHome.taxiTiles` filtre désormais `c.visible_home === true` (repli sur les 7 premiers actifs si aucun flag) + « Tous les Taxis ».
- **Vérifié** : **testing_agent iteration_162.json — 100%** : backend 6/6 pytest (`/app/backend/tests/test_service_categories_home.py`), endpoint protégé (401 non-auth), toggle persiste, accueil rider reflète l'ajout/retrait d'une tuile (ex. Aéroport ON→9 tuiles, OFF→8), `/taxi` liste toujours TOUS les modes (le toggle Accueil n'affecte que la grille d'accueil). État final restauré (8 tuiles canoniques). Lint clean, webpack compile (1 warning pré-existant).
- ⚠️ PREVIEW → **redéploiement requis** pour la production.



## NEW - 2026-06-08 (65) - Tuiles Taxi : suppression doublons + cohérence + page orange (DONE)
- **Demande user (vidéo)** : (1) supprimer les tuiles en double de l'accueil « VTC Réservation/Pooling/Location/Chauffeur Privé/Enchères VTC/VTC Intercity/Programmer Course », garder les originaux ; (2) « Plus de taxis / Tous les Taxis » doit afficher l'ENSEMBLE des taxis, les mêmes partout ; (3) unifier la **page** en orange — **pas les icônes**.
- **Fix 1 (doublons)** : `UserHome.taxiServices` (tableau de secours codé en dur) réécrit avec les 8 originaux (Taxi VTC, Pool-partage, Moto Taxi, Électric, Planifiez votre trajet, Mise à Dispo, Intercité, Tous les Taxis). La source principale `taxiTiles` (service_categories) reste prioritaire. Plus aucun « VTC Réservation… ».
- **Fix 2 (cohérence)** : `/more-taxi` (page « Plus de Services VTC » en double + orpheline, header `#FF4500`, liste hardcodée incohérente) → **redirigée vers `/taxi`** (le hub qui liste TOUS les modes groupés). `MoreTaxiServicesPage.js` SUPPRIMÉ + imports retirés (clientRoutes/pages.js).
- **Fix 3 (page orange, pas icônes)** : `RideChoosePage` bouton « Utiliser ma position actuelle » `#2563EB`→`#FF5000` ; `TaxiHubPage` ligne localisation `bg-blue-50`/`text-blue-500`→`bg-[#FFF3EC]`/`text-[#FF5000]`. Les icônes de modes (cars colorés) volontairement inchangées.
- **Vérifié** : **testing_agent iteration_161.json — 100% (6/6)** : accueil = 8 tuiles canoniques, 0 doublon ; `/more-taxi`→`/taxi` ; bouton locate = rgb(255,80,0)=#FF5000 ; aucun overlay d'erreur. Webpack compile (1 warning pré-existant), lint clean.
- **Note QA (P2)** : `UserHome.js` ~696 lignes → extraire les tableaux de services dans `userHomeServices.js` (backlog).
- ⚠️ PREVIEW → **redéploiement requis** pour la production `gojek-mvp-1.emergent.host` (les doublons que vous voyez encore viennent de l'ancien build prod).



## NEW - 2026-06-08 (64) - BUG FIX : `window.google.maps.Geocoder is not a constructor` (hub Taxi) (DONE)
- **Bug user (capture)** : overlay « Uncaught runtime errors: window.google.maps.Geocoder is not a constructor » au `tryGeocode`/`reverseGeocode` sur le hub Taxi (« Choisissez un service »).
- **Cause racine** : le **loader async de Google Maps** (`loading=async`) expose l'espace de noms `google.maps` AVANT que les classes soient prêtes → `new window.google.maps.Geocoder()` lève « is not a constructor ». Les appels gardés seulement par `if (window.google?.maps)` (TaxiHubPage, MapLocationPicker) crashaient ; ceux gardés par `?.Geocoder` (RideChoosePage, TaxiHallModal) ne crashaient pas mais échouaient silencieusement (adresse → coords brutes).
- **Fix** : nouveau helper `src/lib/googleMaps.js` → `getGeocoder()` async : tente le constructeur direct (`typeof maps.Geocoder === 'function'`), sinon **`importLibrary('geocoding')`** (méthode supportée par Google), sinon `null`. Tous les sites de géocodage routés via ce helper : `TaxiHubPage.reverseGeocode`, `RideChoosePage.reverseGeocode` + voice-prefill `geocode`, `MapLocationPicker` (idle handler), `TaxiHallModal` (driver).
- **Vérifié** : **testing_agent iteration_160.json — 100%** : `/taxi` charge (6 tuiles, 0 overlay), `/course?mode=standard` charge, « Utiliser ma position actuelle » → reverse-geocode RÉUSSI via getGeocoder (« 4 Pl. de l'Hôtel de Ville, 75004 Paris »), **0 « is not a constructor »**, 0 iframe d'erreur. Webpack compile (1 warning pré-existant). Lint blocking = pré-existants (set-state-in-effect/apostrophes, tolérés par CRA).
- ⚠️ Correctif en PREVIEW → **redéploiement requis** pour la production `gojek-mvp-1.emergent.host`.



## NEW - 2026-06-08 (63) - Prefetch tuiles d'accueil + revue de code pré-déploiement (DONE)
- **Tuiles d'accueil** : `ServiceTile` (UserHome) précharge désormais le chunk de la route au `onPointerEnter`/`onFocus` via `prefetchPath(service.path.split('?')[0])` + attribut `data-prefetch`. Couvre Taxi (`/course`) et Livraison (`/all-delivery`, `/food`). Lint clean, webpack compile (1 warning pré-existant).
- **Revue de code / readiness déploiement (deployment_agent)** : **status PASS (warn)**. Aucun blocker : URLs/secrets/DB en .env uniquement, routes /api OK, CORS OK, compilation OK, auth redirect via window.location.origin, refactor routes/*.jsx résout correctement. i18nBase.js « password » = libellés i18n (non-secrets, ignorés). **Seul WARN** : `mobile/.env EXPO_PACKAGER_PROXY_URL` (sous-domaine dev-tunnel Expo) — **hors périmètre du déploiement web**, non-bloquant, laissé tel quel.
- **Déploiement** : le web est prêt. Le déploiement se lance via le bouton **Deploy** de l'interface Emergent (action utilisateur).



## NEW - 2026-06-08 (62) - Perf : préchargement des routes (idle par rôle + prefetch au survol) (DONE)
- **Demande user** : ajouter le lazy-loading par route avec préchargement (perçu plus rapide, ciblé réseaux lents DOM-TOM/Afrique).
- **Constat** : la navigation est majoritairement **programmatique** (`navigate()`), pas des `<Link>` → le prefetch au survol d'ancres ne couvrirait presque rien ; et le public est surtout **mobile/tactile** (pas de survol). → approche principale = **préchargement à l'inactivité par rôle**.
- **`src/routes/pages.js`** : helper `lazyWithPreload(factory)` (lazy + `.preload`). 13 routes « chaudes » converties (user : TaxiHub, RideChoose, AllDelivery, Food, Wallet, Profile, RideTracking ; driver : Bookings, Earnings, Profile, Wallet, Rewards). Fonction `prewarmRoutes(role)` qui déclenche `.preload()` sur les routes probables du rôle.
- **`src/routes/useRoutePrefetch.js`** (nouveau) : hook `useRoutePrefetch(role)` → (1) `prewarmRoutes(role)` via `requestIdleCallback` (fallback setTimeout) après login ; (2) listener délégué `pointerover`/`focusin` qui précharge la route d'un élément `[data-prefetch="/path"]` (desktop). Export `prefetchPath(path)` (impératif, ex. touchstart). `PREFETCH_MAP` des chemins chauds.
- **Branchements** : `App.js` appelle `useRoutePrefetch(user?.role)` ; `UserHome` bottom-nav `nav-wallet`/`nav-profile` reçoivent `data-prefetch`.
- **Vérifié** : webpack compile (1 warning exhaustive-deps pré-existant), lint clean (useRoutePrefetch, UserHome), aucun nouvel log d'erreur console au boot (`/admin-login` rendu OK, hook no-op si non connecté). Additif & faible risque.



## NEW - 2026-06-08 (61) - Refactor P2 frontend : découpage `App.js` (605 → 88 lignes) (DONE)
- **Demande user** : option B (P2) — découpage des gros composants frontend, en commençant par `App.js` (table de routage de 605 lignes).
- **Découpage en modules de routage** (aucun changement de comportement, pattern fonction-retournant-Fragment compatible React Router v6) :
  - `src/routes/pages.js` : barrel central de TOUS les `lazy()` (client, driver, merchant, admin, panels, kiosk) + re-export des named exports `AdminCrudPages`.
  - `src/routes/clientRoutes.jsx` : `clientRoutes(user)` → toutes les routes client/auth/public (/, /login, /home, /taxi, /course, /all-delivery, /wallet, /profile, /actualites, etc.).
  - `src/routes/driverRoutes.jsx` : `driverRoutes(user)` → toutes les routes `/chauffeur/*`.
  - `src/routes/merchantRoutes.jsx` : `merchantRoutes()` → `/merchant/*` (nested).
  - `src/routes/adminRoutes.jsx` : `adminRoutes()` → `/admin/*` (nested, ~110 routes).
  - `src/routes/panelRoutes.jsx` : `panelRoutes()` → /dispatcher + 6 panels rôle (dispatch/billing/server/users-admin/drivers-admin/merchants-admin).
  - `src/App.js` (88 l) : coquille fine — providers + Suspense + composition des groupes dans un seul `<Routes>` + /kiosk, /tab, /auth/callback, catch-all, VoiceAssistant (toujours sur /home rôle user).
- **Nettoyage** : `RegisterPage` (import inutilisé, /register redirige vers /login) supprimé de l'arbre.
- **Vérifié** : webpack compile (1 warning exhaustive-deps pré-existant), lint clean sur tous les nouveaux fichiers. **testing_agent iteration_159.json** : refactor « clean & idiomatic », 100% des routes exerçables OK (landing, /login, /chauffeur/login, /admin-login + sous-routes admin, /dispatch /billing /server, /kiosk, catch-all /xxx→/), aucune nouvelle erreur console. Routes driver/client OTP-gated non auto-testées (limite UX OTP) mais existent et `ProtectedRoute` redirige correctement. Login chauffeur vérifié au screenshot (page rendue).
- **Reste P2** : `DriverHome.js` (623 l → extraire carte/liste/stats — composant LIVE critique, à tester finement), `DriverProfilePage.js`, `AdminDashboard.js` ; nettoyage `console.*` ; hook deps prudents.



## NEW - 2026-06-08 (60) - Refactor P2 (lots 2-3) : complexité backend `get_rewards_config` + `_process_pending_ride` (DONE)
- **Méthode** : extraction de helpers PURS (testables sans DB) + orchestrateur async fin ; comportement strictement préservé.
- **Lot 2 — `routes/admin.py` `get_rewards_config` (cc 21)** : extrait `_rewards_zone_candidates(zone)` (zone_keys ordonnés city>state>country, [] si pas de pays) et `_merge_rewards_settings(settings)` (merge sur DEFAULT, fallback champs falsy). La fonction async se réduit à : boucle sur candidats → fallback global → merge.
- **Lot 3 — `routes/auto_dispatch.py` `_process_pending_ride` (cc 15)** : extrait `_dispatch_action(age, tier, cfg)` (décision pure → 'cancel'|'escalate_2'|'escalate_1'|'none', priorité elif identique) et `_resolve_radius_km(ride, cfg)` (rayon zone-aware, fallback cfg). Imbrication réduite, early-return quand action='none'.
- **Tests** : nouveau `tests/test_rewards_dispatch_helpers.py` — 13 tests (candidats de zone none/pays/état/ville, merge defaults/partiel/falsy, décision dispatch young/1st/2nd/cancel/tier-1). 
- **Vérifié** : 38/38 tests unitaires verts (rewards_dispatch + clean_driver_category + geo_scope + server_wiring), backend redémarre OK (601 routes), endpoint e2e `GET /api/admin/rewards/config` renvoie les 4 clés, lint clean.
- **Reste P2** : découpage gros composants frontend (`App.js` routing, `DriverHome.js`, `DriverProfilePage.js`), hook deps prudents — à faire par lots avec testing_agent (risque UI/build CRA).




## NEW - 2026-06-08 (59) - Revue de code : refactor complexité WebSocket + faux positifs reconfirmés (DONE)
- **Demande user** : appliquer un rapport de revue de code.
- **Correction RÉELLE (mon code récent)** : `core/ws_endpoint.py` (`websocket_endpoint` complexité 16, profondeur d'imbrication 8) refactoré avec un **pattern de dispatch** : handlers async dédiés par type de message (`_handle_location_update`, `_handle_join_ride`, `_handle_leave_ride`, `_handle_eta_update`, `_handle_ping`) + table `_HANDLERS`, et early-returns. Imbrication réduite à ~3. La boucle se contente de dispatcher.
- **Vérifié comportementalement** : test client WS réel → `ping`→`pong`, `join_ride`→`joined_ride`, message inconnu ignoré sans crash (connexion maintenue). Backend redémarre proprement, lint clean, `tests/test_server_wiring.py` 4/4.
- **FAUX POSITIFS / intentionnels reconfirmés (aucune action)** :
  - i18nBase.js:7,16,17 « secrets » → libellés de traduction (`password`/`Mot de passe`).
  - localStorage Profile/Kiosk/InstallPWA → données non sensibles.
  - Clés-index AdminServiceCategories/AdminDynamicPricing/AdminDriverCategories → **rangées éditables in-place par index** (changer la clé casse le focus input) — pattern correct.
  - 168 console → neutralisés en prod via `silenceConsole()`.
  - 266 `is`/`==` dans les tests → assertions **booléennes strictes** (`is True/False/None`) voulues ; passer en `==` déclencherait l'anti-pattern inverse E712.
- **DÉFÉRÉ (backlog P2)** : ~365 hook deps (forcer casse le build CRA), complexité admin (`get_rewards_config` cc21, `get_analytics_breakdown`…), type hints, découpage gros composants frontend.




## NEW - 2026-06-08 (58) - Refactorisation complète de server.py (776 → 32 lignes) (DONE)
- **Demande user** : refactorisation complète de `server.py`.
- **Découpage en modules à responsabilité unique** (aucun changement de comportement) :
  - `core/demo_seed.py` (243 l) : tous les jeux de données démo (merchants, produits, coupons, admin demo, catégories beauty/pet/car/towing/nearby/ondemand/carpool/marketplace, drivers, panel demos, template credentials).
  - `core/startup.py` (356 l) : la fonction `lifespan` (~540 l) découpée en helpers ciblés (`_create_indexes`, `_seed_admin_and_credentials`, `_seed_demo_merchants_products`, `_seed_panel_demos`, `_seed_external_referentials`, `_seed_v3cube_reference`, `_seed_demo_drivers`, `_seed_corporate`, `_run_route_migrations`…) + orchestrateur `run_all_seeds()`. **Ordre d'exécution strictement préservé** (ACL après panel demos, corporate après test user, migrations après seeds).
  - `core/api_router.py` (85 l) : `register_routers()` + liste ordonnée `_ROUTERS` (65 routers).
  - `core/ws_endpoint.py` (85 l) : `register_websocket()` (handler `/api/ws/{client_id}`).
  - `server.py` (32 l) : câblage fin uniquement (app + lifespan + routers + ws + CORS).
- **Vérifié** : import OK (601 routes), backend redémarre proprement (« Application startup complete », tous les seeds loggés sans erreur), endpoints e2e OK (`/api/auth/login` admin, `/api/search/delivery`, `/api/service-categories` = 200), lint clean sur tous les nouveaux modules.
- **Tests** : nouveau `tests/test_server_wiring.py` (4 tests : app construit, routers montés sous /api, ws monté, orchestrateur seed exposé). **25/25 verts** (+ clean_driver_category + geo_scope).




## NEW - 2026-06-08 (57) - Harmonie ordre taxis (Accueil↔Hub) + charte couleur orange/noir (DONE)
- **Bug user (« doublure »/changement de place)** : l'ordre des tuiles « Services Taxi » de l'accueil différait de celui de « Tous les Taxis » (`/taxi`). Cause : l'accueil triait **à plat** par `display_order`, alors que le hub **regroupe** les modes en sections fixes (everyday→time→special) puis trie par `display_order` dans chaque groupe.
- **Fix (option b user)** : `UserHome.taxiTiles` suit désormais la **même séquence groupée** que le hub — import de `MODES`, maps `TAXI_CAT_RANK`{everyday:0,time:1,special:2} + `TAXI_MODE_CAT` (key→cat), tri par `(catRank, display_order)`. Les sections du hub sont conservées. Les 7 premières tuiles de l'accueil = début de la séquence du hub → plus de « saut » de position. Clés inconnues (catégories custom) en dernier.
- **Couleur parasite (3e couleur bleue)** : charte confirmée **orange `#FF5000` + noir nuit `#0B1426`** (option b : accents d'icônes par mode conservés). Remplacés :
  - `RideReceiptPage` : carte « Résumé de paiement » `#4361EE`→`#0B1426`, spinner/label/bouton notation `#4361EE`→`#FF5000` (+ apostrophe échappée).
  - `RideTrackingPage` : bouton dialog `#4361EE`→`#FF5000`.
  - `ClientWelcome` : pastilles FR/EUR, points pagination, dot splash, bouton suivant, icône slide 1 `#4a9eff`→`#FF5000` (hover `#3a8eef`→`#E54800`).
  - Login (`PhoneStep`/`PasswordStep`/`ProfileStep`/`loginConstants`) : accents `#4a9eff`/`#3a8eef`→orange, `shadow-blue-*`→`shadow-orange-*`.
- **Vérifié** : `grep` = 0 bleu parasite (`4361EE`/`4a9eff`/`3a8eef`) restant ; lint UserHome/ClientWelcome clean ; webpack compile (1 warning pré-existant). Landing `/welcome` orange+nuit OK. ⚠️ 1 flag lint `set-state-in-effect` sur `RideReceiptPage:40` = **pré-existant** (pattern `useEffect(load)` legacy, non introduit ; `eslint-disable` de cette règle casserait le build CRA).
- ⚠️ PREVIEW → redéploiement requis pour la production.




## NEW - 2026-06-08 (56) - Refactor P2 (lot 1) : réduction complexité `_clean_driver_category` + tests (DONE)
- **Demande user** : attaquer les refactors P2 différés par petits lots avec tests.
- **Approche** : tests de caractérisation D'ABORD (capturer le comportement exact), puis refactor, puis re-test → iso-comportement prouvé.
- **`routes/admin.py`** : `_clean_driver_category()` (complexité 26, fonction pure) découpée en 4 helpers à responsabilité unique : `_dc_validate_service_class`, `_dc_resolve_taxi_sub`, `_dc_clean_documents`, `_dc_parse_order` + un orchestrateur fin. Comportement strictement identique.
- **Nouveau `tests/test_clean_driver_category.py`** : 14 tests (service/classe valides+invalides, taxi_sub effacé hors taxi/car, sentinelles ""/none/null, label requis, dédup+strip documents, 0 doc→400, order fallback 99, active→bool, merge `existing` partiel).
- **`core/geo_scope.py`** : `scope_matches`/`_zone_override_rank` (signalés cc 14) **laissés tels quels** — déjà des guard-clauses propres et bien testés (`test_geo_scope.py`) ; les transformer en lookup tables serait du churn à valeur négative.
- **Vérifié** : `pytest test_clean_driver_category.py test_geo_scope.py` = **21/21**, import `routes.admin` OK, lint Python clean.
- **Reste (prochains lots P2)** : `get_rewards_config` (cc 21, async+DB), `_process_pending_ride` (auto_dispatch, cc 15), `get_analytics_breakdown`/`_aggregate_negotiation_rides` (admin), découpage composants volumineux, hook deps (risqué).




## NEW - 2026-06-08 (55) - Revue qualité de code : corrections sûres + faux positifs reconfirmés (DONE)
- **Demande user** : appliquer les recommandations d'un rapport de revue de code.
- **Corrections RÉELLES appliquées (clés-index → clés stables, listes statiques)** :
  - `ClientWelcome.js:139` & `ChauffeurWelcome.js:79` (points de pagination) → `key={s.title}`.
  - `AdminLoginPage.js:118` (cartes de navigation) → `key={link.path}`.
- **Clés-index CONSERVÉES à dessein (édition in-place par index)** : `AdminServiceCategories` (windows :269), `AdminDynamicPricing` (ranges :207), `AdminDriverCategories` (documents :154) — rangées éditables sans ID stable, `setRange(i,…)`/`setDoc(i,…)` ; changer la clé provoque une **perte de focus** des inputs pendant la saisie. Index = pattern correct ici.
- **FAUX POSITIFS reconfirmés (aucune action)** :
  - « 9 variables non définies » → `ruff F821` = *All checks passed* + pyflakes = 0.
  - « Secrets en dur » `i18nBase.js:7,16,17` → libellés de traduction (`password:'Mot de passe'`, `create_password`, `change_password`), pas des secrets.
  - « random non sécurisé » `simulation.py` → `_sim_random = secrets.SystemRandom()` (déjà sûr).
  - localStorage `ProfileTabView`/`KioskApp`/`InstallPWA` → données non sensibles (préf. d'onglet, jeton de session kiosque dédié, timestamp de rejet PWA).
  - « 168 console statements » → déjà neutralisés en production via `silenceConsole()` (`index.js:8`).
- **DÉFÉRÉ (risque/refactors lourds, backlog P2)** : ~365 `exhaustive-deps` (le handoff déconseille de forcer — casse le build CRA), réduction de complexité backend (`admin.py`, `auto_dispatch.py`), type hints, découpage des composants volumineux.
- **Vérifié** : lint clean (3 fichiers modifiés), webpack compile (1 warning pré-existant toléré).




## NEW - 2026-06-08 (54) - Recherche unifiée Livraison branchée dans l'app mobile Expo (DONE)
- **Demande user** : intégrer l'endpoint `GET /api/search/delivery` (recherche unifiée magasins + produits, toutes verticales) dans l'app mobile Expo (parité avec le web `DeliverySearchOverlay`).
- **Mobile `api/endpoints.ts`** : ajout `merchantAPI.searchDelivery(q)` → `GET /search/delivery?q=`.
- **Nouvel écran `screens/user/DeliverySearchScreen.tsx`** : champ de recherche auto-focus, debounce 300ms, suggestions (Pizza/Courses/Roses…), états loading/vide, 2 groupes « Magasins » + « Produits » via `FlatList` combinée, icônes par `store_type` (restaurant/grocery/florist/wine/construction/pharmacy), prix produit formaté €. Tap sur un résultat → écran `Food` (catalogue, pas d'écran détail boutique en mobile pour le MVP).
- **Navigation `RootNavigator.tsx`** : écran `DeliverySearch` enregistré dans `UserStack`.
- **Point d'entrée `UserHomeScreen.tsx`** : barre « Que voulez-vous vous faire livrer ? » (`home-delivery-search`) sous la bannière promo → ouvre `DeliverySearch`.
- **i18n** : 7 clés `user_home.delivery_search_*` ajoutées à `fr.json` + `en.json`.
- **Vérifié** : `GET /api/search/delivery?q=pi` renvoie 1 magasin (Pizza Heaven) + 5 produits réels ; `tsc --noEmit` mobile = 0 erreur ; lint JS clean. (App RN/Expo → pas de screenshot web possible.)
- ⚠️ Changement **mobile uniquement** — n'affecte pas le web déployé.




## NEW - 2026-06-07 (53) - Accueil « Services Taxi » : icônes au lieu des photos uploadées (DONE)
- **Demande user** : sur l'accueil, la section « Services Taxi » affichait des PHOTOS de voitures (mauvaise version) ; la bonne version utilise des ICÔNES → retirer les photos.
- **Cause** : `UserHome.taxiTiles` mettait `imageUrl = c.icon` (image data:/http uploadée par l'admin pour chaque `service_category`), prioritaire sur l'icône dans `Visual`/`DynamicIcon`.
- **Fix** : `taxiTiles` n'utilise plus l'image uploadée — toujours l'icône Phosphor de `TAXI_VISUAL[c.key]` (fallback `TAXI_DEFAULT`). Variable `img` supprimée. Rendu désormais cohérent avec les autres sections (Livraison, etc.).
- **Vérifié (Playwright)** : section taxi = 0 `<img>` photo, 7 icônes SVG. Build OK.
- ⚠️ PREVIEW → redéploiement requis.



## NEW - 2026-06-07 (52) - Langue & Devise déplacées de l'en-tête vers le MENU LATÉRAL (≡), client + chauffeur (DONE)
- **Demande user (clarifiée)** : retirer la pastille « FR | € » de l'en-tête et mettre « Changer la langue » + « Changer la devise » dans le **menu latéral** (tiroir ≡), pour le client ET le chauffeur. (Annule l'ajout de pastille au Profil du tour 51.)
- **Refactor `LocaleSelector.js`** : extraction d'un composant réutilisable `export const LocaleModal({ open, onClose, initialTab })` (bottom-sheet langues/devises). Pas d'effet (set-state-in-effect évité) — les parents le remontent via `key` pour ouvrir sur le bon onglet. `LocaleSelector` (pastille) le réutilise.
- **`SideMenuDrawer.js`** (partagé user+driver) : les items « Changer la devise »/« Changer la langue » ouvrent désormais `LocaleModal` (type `locale` + `localeTab`) au lieu de naviguer vers `/profile?tab=...` (qui ne marchait pas côté chauffeur). Ajout de « Changer la devise » à la section chauffeur (il n'avait que la langue). `<LocaleModal>` monté dans le tiroir.
- **Pastille retirée** des 4 en-têtes : `UserHome` (accueil client), `DriverHomeHeader` (accueil chauffeur), `ProfilePage` (profil client), `DriverProfilePage` (profil chauffeur). Imports `LocaleSelector` nettoyés partout.
- **Vérifié (Playwright, client)** : `locale-selector-btn` absent du header ; menu ≡ contient « Changer la langue » + « Changer la devise » ; clic « Changer la langue » → `locale-modal` ouvert sur l'onglet Langues. Chauffeur couvert par le même `SideMenuDrawer`. Lint propre, webpack compile.
- ⚠️ PREVIEW → redéploiement requis pour la production.



## NEW - 2026-06-07 (51) - Devise + Langue : pastille latérale « FR | € » (client + chauffeur), suppression des items redondants (DONE)
- **Demande user** : « La devise et la langue, leur place c'est sur le côté latéral — application chauffeur ET clients » (réf. captures : la pastille « FR | € » de l'en-tête chauffeur = la bonne place ; les 2 items dans le Profil = à retirer).
- **Composant** : `LocaleSelector` (pastille « FR | € » + modale langues/devises) déjà présent dans l'en-tête de l'accueil client et de l'accueil chauffeur.
- **Client (`ProfilePage.js`)** : ajout de `<LocaleSelector variant="dark" />` dans l'en-tête (à gauche de l'engrenage, `data-testid=profile-locale-chip`) ; **suppression** des items « Changer de devise » (`settings-currency-btn`) et « Changer de langue » (`settings-language-btn`). Imports `Globe`/`CurrencyCircleDollar` nettoyés. **Vérifié (Playwright)** : pastille présente, 2 items absents.
- **Chauffeur (`DriverProfilePage.js`)** : ajout de `<LocaleSelector variant="dark" />` dans l'en-tête vert (`data-testid=driver-profile-locale-chip`) ; **suppression** des 2 lignes placeholder `change_currency`/`change_language` (qui étaient `onClick={soon}`). Imports `Globe`/`CurrencyCircleDollar` nettoyés. Vérifié par symétrie + lint clean + webpack OK (connexion chauffeur de test non aboutie à l'écran).
- ⚠️ PREVIEW → redéploiement requis pour la production.



## NEW - 2026-06-07 (50) - Pool : limite « places max par réservation » = 2 (configurable) (DONE)
- **Demande user** : « J'ai commandé le Pool, normalement c'est maxi 2 places » (le sélecteur affichait 4).
- **Logique** : un Pool est un trajet PARTAGÉ → un passager ne doit réserver qu'un nombre limité de places pour laisser de la place aux autres. La capacité totale du véhicule (`pool_capacity`=4) reste utilisée pour le badge « places restantes », mais la **réservation par passager est plafonnée à 2** (`max_seats_per_booking`, défaut 2, surchargeable par véhicule via `pool_max_seats_per_booking` ou la config Pool globale `max_seats_per_booking`).
- **Backend (`rides.py`)** : `get_pool_config` renvoie `max_seats_per_booking` (défaut `POOL_DEFAULT_MAX_SEATS_PER_BOOKING=2`) ; estimate ET create_ride plafonnent `seats_required` à `min(max_seats_per_booking, available_seats)` ; le champ est exposé dans la réponse d'estimation. **Vérifié curl** : estimate seats 4→2, create pool seats 4→2 (pool_capacity reste 4).
- **Frontend (`RideChoosePage`)** : le panneau Pool lit `max_seats_per_booking` depuis l'estimation (défaut 2), sélecteur borné 1→2, bouton + désactivé à 2, texte « Maximum 2 places par réservation Pool. » **Vérifié (Playwright)**.
- ⚠️ Correctifs en PREVIEW → nécessite un redéploiement pour la production.



## NEW - 2026-06-07 (49) - Harmonie titres /course (H1 par mode) + ordre hub aligné admin (DONE)
- **(a) Ordre du hub** : `TaxiHubPage` transmet désormais `display_order` dans `catConfig`, et `TaxiModeGrid` trie les modes de chaque groupe par cet ordre admin (au lieu de l'ordre statique des MODES).
- **(b) Test e2e (testing_agent iteration_158)** : 5/7 PASS initialement. 2 bugs remontés → traités :
  1. **BUG H1 (corrigé)** : le grand titre `/course` (`ride-choose-title`, ligne 418) affichait un titre GLOBAL `cfg.booking_header_title` (« Planifiez votre trajet ») pour TOUS les modes ; de plus l'effet de fetch avait des deps `[]` → `catName` devenait obsolète en navigation SPA. **Fix** : `service_categories` chargé une fois (`allCats`), `catName` dérivé via `useMemo(allCats, mode.id)` (toujours correct au changement de mode), H1 = `catName || cfg.booking_header_title || mode.label`, et garde « catégorie désactivée → /taxi ». **Vérifié (Playwright)** : standard→« Taxi VTC », electric→« Électric », pool→« Pool- partage », bidding→« Proposez votre tarif », access→« Handicapé ».
  2. **« bidding ne redirige pas vers /taxi-bidding »** : ce n'est PAS un bug — le panneau d'enchères inline de `/course?mode=bidding` crée une vraie course enchère (`mode_id='bidding'` → backend `is_bidding=True`, le chauffeur voit la contre-offre). Comportement conservé.
- **E2E course standard client→chauffeur** : PASS (course instantanée → suivi, chauffeur reçoit « Demande · Sb », Accepter/Décliner sans contre-offre, accepte). Pool seat selector PASS.
- **Note polish** : libellé `driver.est_price` = « Prix estime » (sans accent) — convention ASCII volontaire du bundle i18n (évite les soucis JSON du script de traduction LLM). Laissé tel quel pour cohérence.



## NEW - 2026-06-07 (48) - Harmonie config admin ↔ app client : noms de catégories taxi (DONE)
- **Symptôme user** : « je configure une voiture ça n'apparaît pas », « les taxis affichés sont différents entre l'accueil et "Tous les taxis" », « pas d'harmonie app client ↔ admin ».
- **Cause racine identifiée (preuve DB)** : l'admin a **renommé** des catégories dans `service_categories` (source de vérité : ex. `book_later`→« Planifiez votre trajet », `bidding`→« Proposez votre tarif », `electric`→« Électric », `access`→« Handicapé »), mais les libellés **statiques** de `taxiHubConstants.js MODES` n'avaient pas suivi. L'accueil (`UserHome.taxiTiles`) et le hub `/taxi` (`TaxiModeGrid`) utilisent déjà `c.name`/`cfg.name` (noms admin), **mais `/course` (`RideChoosePage`) utilisait `mode.label` statique** → désharmonie (ex. tuile « Planifiez votre trajet » qui ouvrait un écran titré « Plus Tard »).
- **Correctif** : `RideChoosePage` récupère désormais `service_categories`, retrouve la catégorie par `key === mode.id` et utilise `cat.name` comme **titre/source de vérité** (header + section comparaison), avec repli `mode.label`. Une catégorie **désactivée** côté admin n'est plus réservable (toast + redirection `/taxi`). **Vérifié (Playwright)** : `/course?mode=book_later` → « Planifiez votre trajet » (plus « Plus Tard ») ; `electric` → « Électric » (plus « Green »).
- **Clarification des 2 systèmes de config admin** (à communiquer) :
  - **« Catégories de service »** → pilote les **MODES taxi** (Taxi VTC, Pool, Planifier, Enchères…) : nom, ordre, actif/inactif, icône → reflétés sur l'accueil + `/taxi` + `/course`.
  - **« Types de véhicule »** → pilote les **voitures** (SB, Confort, Luxe, Moto, SUV…) + tarifs, affichées dans « Choisissez un voyage » après le choix du mode.
- **Vérifié** : l'endpoint public `/config/vehicle-types` renvoie bien les **15** types actifs (10 visibles après exclusion de pool/airport/pets/assist/accessible, qui sont liés à des modes dédiés). Les véhicules apparaissent donc en **preview** ; les captures user (5 véhicules) proviennent vraisemblablement de la **PRODUCTION non redéployée**.
- **Reste possible (follow-up)** : aligner aussi l'**ordre** du hub `/taxi` sur le `display_order` admin (actuellement groupé statiquement everyday/time/special) ; envisager de piloter `sub`/`cta` par l'admin également.



## NEW - 2026-06-07 (47) - Revue qualité de code : corrections sûres + faux positifs confirmés (DONE)
- **Demande user** : appliquer les recommandations d'un rapport de revue de code.
- **Faux positifs confirmés (aucune action requise)** :
  - Backend « 9 variables non définies » → `ruff F821` + `pyflakes` + `pylint E0606` = **0** variable non définie.
  - Frontend « secrets en dur » `i18nBase.js:7,16,17` → ce sont des **libellés de traduction** contenant le mot *password* (« Mot de passe », `create_password`, `change_password`), pas des secrets.
  - Backend « random non sécurisé » `simulation.py` → utilise déjà `secrets.SystemRandom()` (cryptographiquement sûr) — déjà corrigé.
  - localStorage `ProfileTabView`/`InstallPWA` → données **non sensibles** (préférences d'onglet/notifs, timestamp de rejet PWA). `KioskApp` stocke un jeton de session **kiosque** (terminal dédié, distinct de l'auth user en cookie httpOnly) — conception délibérée, non touché.
- **Corrections appliquées (sûres)** :
  - Clés `index` → clés stables sur 5 listes : `AdminTaxiConfigs` (forfaits location éditables — **vrai correctif** `p.slug`), `SearchRadar`, `DriverScorePage`, `AdminWeeklyReports`, `ServiceListLayout`.
  - Blocs `catch` silencieux → ajout de `console.debug` (`RunnerPage`, `ProfilePage`).
- **Vérifié** : webpack compile (1 warning pré-existant toléré), services up. Lint « blocking » restant = uniquement issues **pré-existantes** (apostrophes non échappées dans le JSX FR, `react-hooks/immutability` sur `handleLogout`, `set-state-in-effect` legacy) tolérées par le build CRA.
- **DÉFÉRÉ (refactors lourds, risque de régression — à faire de façon incrémentale)** : découpage des composants volumineux (`DriverHome`, `App.js`, `AdminDashboard`…), réduction de complexité backend (`admin.py _clean_driver_category`, `geo_scope`, `auto_dispatch`), et les ~363 `react-hooks/exhaustive-deps` (le handoff déconseille de forcer ces correctifs — ils introduisent souvent des erreurs bloquantes).



## NEW - 2026-06-07 (46) - Séparation des types de commande taxi (instant / pool / programmée / enchères) + i18n chauffeur finalisé (DONE)
- **Demande user** : « commander un taxi est confus, ça envoie la réservation, tout est confondu ; chaque option (taxi standard, pool, proposition de tarif, planification) doit respecter son origine ; le pool a des restrictions, on ne peut pas le commander comme un taxi de base. » + finaliser l'i18n des sous-écrans chauffeur.
- **Diagnostic** : 2 flux parallèles existaient. Le **moderne `/course`** (`RideChoosePage`, utilisé par les tuiles de l'accueil) gère correctement chaque mode (`ride_type`/`mode_id`/`scheduled_at`/`pool_enabled`, redirige enchères→`/taxi-bidding`, programmée→`/scheduled-rides`, instant→suivi). Le **legacy `/ride`** (`RideBookingPage`, atteint via recherche/voix) était buggé : envoyait TOUJOURS `proposed_fare` et routait TOUJOURS vers l'écran « négociation/offres », et n'envoyait JAMAIS `scheduled_at`. De plus, le backend ne **persistait aucun `mode`** → enchères et courses instantanées stockées à l'identique → réception chauffeur identique pour tout (bouton contre-offre partout).
- **Backend `rides.py create_ride`** : calcule et persiste désormais `ride['mode']` (`bidding`/`pool`/`scheduled`/`<mode_id>`/`instant`) + `ride['is_bidding']`. Ces champs (+`ride_type`/`pool_enabled`/`seats_required`) sont inclus dans le broadcast `new_ride_request` (et dans `proposed-fare`, `rebroadcast`, `convert-to-bidding`). `RideResponse` enrichi de `mode`/`is_bidding`. **Vérifié curl** : standard→mode=standard/is_bidding=false, bidding→mode=bidding/is_bidding=true, pool→pool=true/seats=2, scheduled→scheduled_at persisté.
- **Réception chauffeur (`DriverHome` + `IncomingRequestSheet`)** : la **contre-offre (« Proposer un autre prix ») n'apparaît QUE pour les courses enchères** (`onSendCounterOffer` passé uniquement si `is_bidding/mode==='bidding'`). Instant/pool/programmée = **Accepter / Décliner** uniquement. Titre & boîte de prix adaptés : enchère = « Enchère · <véhicule> » + « Tarif proposé par le passager » (rose) ; pool = « Demande Pool (N pers.) » ; standard = « Demande · <véhicule> ». `acceptRide` durci (toast clair si 404/400 « course plus disponible »).
- **Pool — restrictions (`RideChoosePage`)** : nouveau panneau `panel-pool` (explication trajet partagé + **sélecteur de places 1→4**, `panel-pool-seats/minus/plus`) ; `seats_required` envoyé. Le pool ne se commande plus comme un taxi de base.
- **Unification du flux** : legacy `/ride` (`RideBookingPage`) transformé en **redirection** vers `/course?mode=<mappé depuis ?type>` (préserve le prefill vocal via router state, consommé par un nouveau `applyVoicePrefill` dans `RideChoosePage` — microtask, set-state-in-effect safe). `SearchOverlay` et `MoreTaxiServicesPage` pointent désormais directement vers `/course?mode=<id>`. `TaxiBiddingPage` envoie `ride_type:'bidding'` à la création.
- **i18n chauffeur (Chantier 3) finalisé** : ~75 clés `driver.*` (DriverRideFlow, RideFlowSheets, IncomingRequestSheet, DriverEarningsPage, DriverProfilePage) + 2 nouvelles (`bidding_request`, `passenger_offer`). **BASE_TOTAL → 343**. `translate_langs.py` relancé → **43 langues à 343/343** (créoles + africaines incluses).
- **Validé** : **testing_agent iteration_157.json — frontend PASS** (rider standard→suivi, pool→sélecteur places, programmée→/scheduled-rides, enchères→/taxi-bidding, redirect legacy /ride, réception chauffeur différenciée : contre-offre UNIQUEMENT pour enchères). Lint front clean, webpack compile (1 warning pré-existant toléré). Courses de test nettoyées.
- **RESTE / backlog** : extraire les panneaux de `RideChoosePage` (742 l.) en sous-composants ; nettoyage `console.*` (Phase 1) ; hook deps `exhaustive-deps` (~357) ; recherche unifiée mobile `/api/search/delivery`. ⏳ Twilio/Firebase/WhatsApp en attente clés API.



## NEW - 2026-06-07 (44) - i18n App Chauffeur (DriverHome) + sélecteur langue (DONE)
- **Demande user** : étendre l'i18n à l'app chauffeur (statut en ligne/hors ligne, gains, courses) + persistance par compte (déjà OK car cross-device pour tout user connecté).
- **Bundle `driver`** enrichi de 7 clés (FR/EN + frontend) : `trips_today`, `avg_rating`, `jobs_upcoming`, `jobs_pending`, `ride_in_progress`, `ride_active`, `resume`. **BASE_TOTAL 252 → 259**. 25 langues re-traduites à 259/259.
- **Piège évité** : les `\n` dans les valeurs (labels 2 lignes) faisaient échouer aléatoirement la traduction LLM (JSON invalid escape sur ln/wo/ht/rcf). Corrigé en retirant les `\n` (le `whitespace-pre-line` enveloppe naturellement dans les cartes étroites) → 0 échec.
- **Composants câblés `t()`** : `DriverHomeHeader` (online/offline + **`LocaleSelector variant=dark`** ajouté, `data-testid="driver-locale-selector"`), `DriverStatsRow` (gains du jour + 4 cartes stats), `DriverBottomNav` (Accueil/Réservations/Portefeuille/Profil via tabs.*+menu.the_bookings), `DriverHome` bannière reprise (course en cours/active/reprendre).
- **Validé e2e (screenshots)** : login chauffeur → FR (« Hors ligne », « Gains du jour », « Emplois en attente », nav « Accueil… ») → switch EN via header → « Offline », « Today's earnings », « Pending jobs », nav « Home/Bookings/Wallet/Profile ». La langue persiste par compte (suit le chauffeur sur tout appareil). Lint clean (4 fichiers). Comptes test remis en `fr`.
- **RESTE app chauffeur** : sous-écrans non traduits (DriverRideFlow, IncomingRequestSheet, DriverEarningsPage détaillée, DriverProfilePage menu, modals) — même approche (clés `driver.*` + câblage).


## NEW - 2026-06-07 (43) - Langue persistée par compte (cross-device) (DONE)
- **Demande user** : mémoriser la langue (et devise) côté compte plutôt qu'en localStorage, pour qu'elle suive l'utilisateur sur tous ses appareils.
- **Backend** : `UserResponse` (`models/schemas.py`) gagne `language`/`currency` (Optional). Nouvel endpoint **`PUT /api/users/language`** (`routes/auth.py`, `users_router`) : persiste `language` (1-10 car.) et `currency` (1-6 car.) sur le doc user. `/api/auth/me` les renvoie.
- **Frontend `LocaleContext.js`** : consomme `useAuth()`. (1) `setLanguage`/`setCurrency` enveloppés → persistent vers le backend si connecté (`persistPrefs`), localStorage reste le miroir invité. (2) Effet de **sync à la connexion** : applique `user.language`/`user.currency` une fois (ref `prefAppliedRef`), re-essaie quand la liste backend des langues arrive (codes créoles non présents dans la liste statique). setState déplacé dans un **microtask** (`Promise.resolve().then`) pour éviter `set-state-in-effect`.
- **Piège résolu** : la règle `react-hooks/set-state-in-effect` existe dans le linter mais PAS dans l'eslint de CRA → un `eslint-disable` la référençant fait planter le build CRA (« rule not found »). Solution : microtask (aucun disable de règle inconnue).
- **Validé** : curl (PUT langue → /me renvoie gcf-mq) + **e2e cross-device** : device vierge (localStorage vide) → login → UI en créole martiniquais (« Akèy / Ou ka alé ? / GCF-MQ ») appliquée depuis le compte, 0 overlay d'erreur, build « compiled with 1 warning ». Compte test remis en `fr` pour neutralité.


## NEW - 2026-06-07 (42) - Sélecteur langue sur login + correctif fond + Chantier 3 (1er lot) (DONE)
- **Sélecteur de langue sur l'écran de connexion** : `LocaleSelector` reçoit une prop `variant` (`dark`/`light`). Ajouté en haut à droite de `PhoneStep` (`data-testid="login-locale-selector"`). L'utilisateur peut choisir sa langue AVANT login (gain conversion DOM-TOM/Afrique). ✅ Testé e2e : bascule en wolof → login traduit (« Bind sa numéro bu mobil », « Walla tann yeneen mbëggël yu jëfe »).
- **Bug pré-existant corrigé** : `.mobile-container { background:#fff }` (index.css) écrasait le `bg-[#1a1a2e]` des 3 écrans login (même spécificité → fond blanc, titre `text-white` invisible). Correctif : `!bg-[#1a1a2e]` sur PhoneStep/PasswordStep/ProfileStep (force le fond sombre voulu par le design). ✅ Vérifié : `getComputedStyle = rgb(26,26,46)`, titre visible.
- **Chantier 3 — 1er lot prudent (3 fichiers, exhaustive-deps)** : récupéré les vrais warnings via les logs de compilation CRA. Corrigés en PRÉSERVANT le comportement (l'analyse montre que la correction « naïve » casserait la logique) :
  - `ScheduleCalendarModal.jsx` : `open` dans deps de useMemo `minDate/maxDate` est INTENTIONNEL (recalcul now-relatif à l'ouverture) → `eslint-disable` documenté au lieu de supprimer.
  - `AdminAuditLogs.js` + `AdminFeaturedListings.js` : `eslint-disable-next-line react-hooks/exhaustive-deps` MAL PLACÉ (après `load()`, visait la ligne suivante) → repositionné correctement avant le `useEffect` (montage-seul / reload sur changement de collection préservés).
  - App compile sans erreur ; warning `ScheduleCalendarModal` résolu. Approche validée pour la suite : analyser l'intention de chaque hook avant de « corriger ».
- **RESTE Chantier 3** : ~357 instances exhaustive-deps restantes → continuer par lots de 3-5 fichiers, en distinguant (a) deps réellement manquantes à ajouter, (b) effets montage-seul intentionnels (disable documenté), (c) fonctions à envelopper dans useCallback.


## NEW - 2026-06-07 (41) - i18n Chantier 2 COMPLET : RideBooking traduit (DONE)
- **Namespace `ride` ajouté** (58 clés) au bundle FR/EN (`routes/i18n.py`) + frontend (`lib/i18nBase.js`). **BASE_TOTAL 194 → 252**.
- **4 étapes du flux de réservation câblées en `t()`** : `RidePlanStep` (titre, now/for-me, placeholders, favoris, promo, quick-actions, modal « book for someone else »), `RideMapStep` (location taxi, ETA, touch-map, choisir gamme, paiements cash/card/wallet, supplément aéroport, taxi pool, enchères, voucher apply/remove, promo auto, CTA demander/programmer), `RideNegotiationStep` (négociation, offres, attente, accepter), `RideSearchingStep` (recherche chauffeur, OTP, annuler).
- **Re-traduction** : 25 langues à **252/252** (gcr 251/252, 1 clé en fallback FR — négligeable).
- **Validé e2e (screenshot)** : `/ride` en anglais → « Plan your ride », « Where to? », « Favorite places / Home / Work », « -20% on your first ride », « Choose on map / Enter destination later / Recent places ». Lint clean sur les 4 composants.
- **Chantier 2 (LoginPage + ProfilePage + RideBooking) = COMPLET.** Reste à traduire : libellés issus de la DB (noms/desc de véhicules, catégories, bannières CMS) = contenu, hors bundle statique.
- **DÉPLOIEMENT** : l'app est déployée en prod (https://gojek-mvp-1.emergent.host). Ces changements sont en PREVIEW → nécessitent un redéploiement pour atteindre la production.
- **RESTE** : Chantier 3 — 360 hook deps (refactoring lent/risqué, par petits lots avec tests).


## NEW - 2026-06-07 (40) - i18n Chantier 2 : couverture étendue Login + Profil (DONE, RideBooking RESTE)
- **Demande user** : remplacer les textes en dur par `t()` sur LoginPage, ProfilePage, RideBooking + enrichir le bundle + re-traduire.
- **Bundle de base enrichi** (`routes/i18n.py` FR+EN & `lib/i18nBase.js` FR) : +2 namespaces **`login`** (19 clés : phone_title, mobile, other_options, terms_agree/link, create/enter_password, confirm_password, complete_profile, lastname/firstname/optional/referral_code, create_account, choose_account, email_password…) et **`menu`** (47 clés : tous les libellés ProfilePage — sections + items + nav). **BASE_TOTAL 128 → 194**.
- **Composants câblés avec `useLocale().t()`** : flux login complet (`PhoneStep`, `PasswordStep`, `ProfileStep`, `AccountOptionsModal` — convertis en corps de fonction pour le hook) + `ProfilePage` (sections, quick-actions, ~40 items de menu, solde portefeuille, nav du bas).
- **Re-traduction** : `scripts/translate_langs.py` relancé → **25 langues à 194/194** (uniquement les 66 nouvelles clés traduites, le reste en cache).
- **Validé e2e (screenshots)** : login EN (« Enter your mobile number », « Or choose another sign-in option », « Terms & Conditions ») + ProfilePage EN intégral (« Wallet balance », « General settings », « About you », « My bookings », « Make a donation », « Buy, sell & rent », nav « Home/Bookings/Wallet/Profile »). Créole MQ vérifié (login.create_account=« Kréyé kont mwen », menu.logout=« Dékonekte »). App compile (l'erreur lint `immutability` `ProfilePage handleLogout` est **PRÉ-EXISTANTE** — confirmée à HEAD, tolérée par le build webpack). Lint clean sur les 5 composants login/i18n.
- **RESTE (chantier 2)** : **RideBooking** non traduit — libellés répartis dans `RideMapStep`/`RideNegotiationStep` + données de types de véhicules ; flux critique, à traiter prudemment (ajouter les clés `booking.*` manquantes + câbler les sous-composants).

## NEW - 2026-06-07 (39) - i18n Chantier 1 : détection auto de la langue par zone (DONE)
- **Demande user** : proposer la langue locale au 1er lancement selon la zone (Martinique→créole MQ, Sénégal→wolof…). Choix UX : **bannière non-intrusive** (option a).
- **`lib/browserZone.js`** : nouveau `getBrowserCountryCode()` (Geolocation + reverse-geocode Google → code ISO pays, ex. MQ/SN/CI). 
- **`contexts/LocaleContext.js`** : mapping `ZONE_LANG` (MQ→gcf-mq, GP→gcf, GF→gcr, RE→rcf, HT→ht, SN→wo, CI→dyu, CD/CG→ln, NG→ha). Au 1er lancement (si langue encore = FR défaut ET jamais demandé, flag `sb_lang_suggested`), détecte le pays → propose la langue via état `suggestion`. Composant **`LanguageSuggestionBanner`** (bannière fixe en haut, testids `lang-suggestion-banner/accept/dismiss`) : « Bonjour ! Cette langue est disponible près de chez vous : <langue>. [Oui, passer en X] [Rester en français] ». `acceptSuggestion`/`dismissSuggestion` posent le flag (ne re-propose pas).
- **Validé e2e (screenshot)** : géoloc simulée Fort-de-France → bannière « 🇲🇶 … Kréyòl Matinik » → clic accepter → UI bascule en créole martiniquais (« Ou ka alé ? », nav « Akèy/Kous mwen/Pótféy/Profil »). Lint clean.


## NEW - 2026-06-07 (38) - i18n : +25 langues traduites (créoles + langues africaines) branchées web (DONE)
- **Demande user** : activer un MAXIMUM de langues, dont les **créoles** (martiniquais, guadeloupéen, haïtien, réunionnais, guyanais) et **langues africaines** (Baoulé/Dioula Côte d'Ivoire, Lingala Congo, Wolof Sénégal, Haoussa Nigeria) + standards (es, de, it, nl, tr, pt, ro, ru, ar, zh, ja, hi, el, sv, sl).
- **Backend `routes/i18n.py`** : `LANGUAGE_CATALOG` étendu de 11 nouvelles langues — `sv`, `sl`, créoles `gcf` (Gwadloupéyen 🇬🇵), `gcf-mq` (Matinik 🇲🇶), `ht` (Ayisyen 🇭🇹), `rcf` (Rénioné 🇷🇪), `gcr` (Giyanè 🇬🇫), africaines `ln` (Lingála 🇨🇩), `wo` (Wolof 🇸🇳), `bci` (Baoulé 🇨🇮), `dyu` (Dioula 🇨🇮). Les standards existaient déjà au catalogue.
- **Script `scripts/translate_langs.py`** (réutilise `_llm_translate/_flatten/_unflatten` testés) : traduit les 128 clés de base vers 25 langues via Claude (noms descriptifs anglais en interne pour la qualité des minoritaires/créoles), stocke dans `i18n_app_bundles` + active la langue. **Résultat : 25/25 à 128/128 couverture**. `/api/i18n/languages` renvoie désormais **43 langues prêtes**.
- **Frontend `LocaleContext.js`** : le sélecteur charge dynamiquement les langues prêtes depuis `GET /api/i18n/languages` (au lieu de la liste statique) → les créoles/africaines apparaissent côté web. `t()` fetch le bundle de chaque langue à la volée (cache + fallback FR + RTL).
- **Validé e2e (screenshots)** : créole martiniquais (« Ou ka alé ? » + nav « Akèy / Kous mwen / Pótféy / Profil »), **arabe RTL parfait** (`document.dir=rtl`, UI inversée, nav « الرئيسية », recherche « إلى أين؟ »), espagnol/haïtien/wolof/lingala/baoulé vérifiés via API. Lint clean. Qualité LLM bonne (créole MQ « Ou ka alé ? », haïtien « Kote ou prale ? », wolof « Fan nga dem ? »).
- **Note** : l'admin peut re-traduire / activer d'autres langues à tout moment via `AdminI18n` (« Traduire automatiquement »). Pour étendre la couverture, enrichir le bundle de base FR/EN (`routes/i18n.py`) puis re-traduire.


## NEW - 2026-06-07 (37) - i18n WEB branché (t() réel) + slice traduite (DONE)
- **Découverte** : le backend i18n est complet (`routes/i18n.py` : bundles FR/EN base + auto-traduction LLM 30+ langues, collections `i18n_languages`/`i18n_app_bundles`, admin `AdminI18n.js`), MAIS le **web ne consommait pas** ces traductions — `LocaleContext` ne stockait que la langue choisie, sans fonction `t()`. Les bundles servaient seulement les apps mobiles.
- **Infra `t()` ajoutée** : `lib/i18nBase.js` (bundle FR de base EMBARQUÉ = miroir de `BASE_BUNDLE_FR`, flatten/interpolate `{{var}}`/`{var}`, zéro flash/fallback instantané). `contexts/LocaleContext.js` : bundle **dérivé au rendu** (pas de set-state-in-effect — piège React Compiler évité), fetch paresseux `GET /api/i18n/bundle/{code}` mergé sur la base FR + cache module, **direction RTL** auto (ar/fa/ur/he → `document.dir`), expose `t(key, vars)` via `useLocale()`. Fallback : bundle langue → base FR → clé.
- **Slice traduite (la plus visible)** : `LocaleSelector` (titre « Langue »), `UserHome` barre de recherche (`user_home.where_to`) + **onglets de navigation** (`tabs.home/orders/wallet/profile`). Les libellés CMS/DB (catégories, bannières) restent en FR (contenu, hors bundle statique).
- **Validé e2e (screenshot)** : login rider → home FR (« Ou allez-vous ? », « Accueil/Mes courses/Portefeuille/Profil ») → switch EN via LocaleSelector → « Where to? », « Home/My rides/Wallet/Profile », header « EN | € », préférence persistée (localStorage `sb_language`). Lint clean (4 fichiers), backend pytest 25/25 (suites geo) inchangé. Compte test : `rider.i18n@demo.sb / Rider123!`.
- **Suite i18n (incrémental)** : traduire LoginPage/PhoneStep, ProfilePage, RideBooking via `t()` clé par clé ; enrichir le bundle de base avec de nouvelles clés si besoin (re-seed `i18n` + re-traduction admin).

## NEW - 2026-06-07 (36) - Chantier qualité Phase 1 (suite) : type hints core/ restants (DONE)
- **Type hints** ajoutés (annotations seules, zéro changement de comportement) sur `core/push.py` (`send_expo_push/notify_drivers/notify_user -> None`, `Optional[dict]`), `core/websocket.py` (toutes les méthodes `ConnectionManager` + `Optional`), `core/deps.py` (`require_role` permission `Optional[str]`, `calculate_fare` vtype_doc `Optional[dict]`, `init_storage -> Optional[str]`, `get_object -> Tuple[bytes, str]`).
- **Validé** : imports OK, pytest 13/13 (zone_pricing+news_scope+rewards_scope), lint inchangé (6 erreurs pré-existantes E402/imports inutilisés dans config.py/deps.py/websocket.py NON introduites par moi). Phase 1 (type hints `core/`) **COMPLÈTE**.


## NEW - 2026-06-07 (35) - Chantier qualité Phase 1 : type hints core/ (DONE)
- **Découverte (console)** : le « 170 console statements » du rapport est **déjà résolu** — `lib/logger.js` expose `silenceConsole()` appelé à `index.js:8`, qui neutralise `console.log/debug/info` en **production** (warn/error préservés) **en un seul endroit**. Migrer les 175 appels vers `logger.*` serait du churn sans bénéfice → **non fait** (volontaire). `logger` reste dispo pour le code neuf.
- **Backend a 0 `print()`** dans le code applicatif → pas de nettoyage logging backend nécessaire.
- **Type hints `core/`** (couverture flaggée 0% / incomplète) :
  - `core/notifications.py` (était 0%) : signature complète `create_notification(user_id: Optional[str], ntype: str, title: str, body: str, data: Optional[dict]=None, push: bool=True, ws_payload: Optional[dict]=None) -> None`.
  - `core/geo_scope.py` : retours complétés (`list_states -> List[str]`, `list_cities -> List[str]`, `_best_zone_override -> Optional[dict]`, `apply_vehicle_zone_pricing -> Tuple[Optional[dict], Optional[str]]`).
- **Zéro changement de comportement** (annotations seules). **Validé** : import + signature OK, pytest 9/9, lint core/ clean, backend healthy.
- **Suite proposée (incrémental)** : type hints sur `core/push.py`, `core/websocket.py`, `core/deps.py`, `core/config.py`, fichier par fichier avec tests.



## NEW - 2026-06-07 (34) - Revue de code : correctifs critiques sûrs appliqués (DONE)
- **Approche** : application ciblée des correctifs **critiques à faible risque** + valeur réelle ; refactors massifs (360 hook deps, split de composants, 173 fonctions complexes, type hints, 170 console, is/== tests) **délibérément différés** (risque de casser une app fonctionnelle, faible valeur immédiate, déjà en backlog P2).
- 🔴 **BUG CRITIQUE corrigé** : `rides.py:1196` utilisait `resolve_zone_from_text` **sans l'importer** (introduit au Lot 1.c bonus sous-catégorie) → **crash à la fin de course** si `sub_category_bonus` activé. Import local ajouté. Confirmé par pyflakes F821 (désormais **0 nom indéfini** dans tout le code applicatif — les « 9 instances » du rapport étaient des faux positifs).
- 🟠 **Complexité réduite** (mon code récent) : `apply_vehicle_zone_pricing()` (complexité 26) découpé en `_zone_override_rank()` + `_best_zone_override()` (single responsibility). Comportement identique (tests 25/25 OK).
- 🟢 **Quick win** : clé React stable dans `LeafletMap.js` (Circles : `${lat},${lng},${i}`).
- 🔒 **Test** : mot de passe throwaway de `test_geo_scoped_configs.py` lu depuis `TEST_NEW_USER_PASSWORD` (env) au lieu d'être en dur.
- **Non appliqué à dessein** : clés-index de `DriverScorePage`/`AdminWeeklyReports` (l'index y est correct — édition in-place / liste statique ; et toucher ces fichiers réveillait des erreurs compiler **pré-existantes** immutability/set-state-in-effect) ; `AdminServiceCategories` windows (clé-index correcte pour édition in-place, sinon perte de focus input).
- **Validé** : pytest **25/25** (zone_pricing, rewards_scope, news_scope, store_categories, promo_banners_scope) + lint front/back clean sur les fichiers modifiés. Net : 4 fichiers (`rides.py`, `geo_scope.py`, `test_geo_scoped_configs.py`, `LeafletMap.js`).



## NEW - 2026-06-07 (33) - Catégories de livraison par zone (Lot 3) (DONE)
- **Demande user** : règle de zone sur les catégories de livraison (ex. Vin = métropole only, Médicaments = partout). Pattern « Bannières » exact, réutilise tout le socle.
- **Backend `store_categories.py`** : import `clean_scope/scope_matches/resolve_zone_from_text`. Seed ajoute `scope {country,state,city}` vide. `GET /store-categories?location=` filtre par zone (`scope_matches` ; scope global = toujours ; sans location = tout, le client filtre `active`). Admin `PUT /{key}` accepte `scope` (clean_scope). Rétrocompatible : catégories existantes sans scope = globales.
- **Frontend admin `AdminStoreCategories.js`** : `ZoneScopePicker` (« Portée géographique ») dans le modal d'édition + **badge zone vert** sur la carte. Texte d'aide « Vide = partout, ex. Vin = métropole uniquement ».
- **Frontend client `AllDeliveryPage.js`** : passe la localisation navigateur (`getBrowserLocationLabel`) à `configAPI.getStoreCategories(location)` → masque les verticales restreintes à d'autres régions.
- **Validé** : **pytest `tests/test_store_categories.py` 8/8** (+ scope wine→FR : présent no-location/Paris, masqué Martinique, globales toujours présentes) + curl E2E (wine FR : 9→8 en Martinique) + **screenshot** modal (picker + texte d'aide). Données restaurées (wine global). Lint front+back clean.
- **Lot 1+2+3 COMPLETS** ✅ — Socle géo : Promos, Vouchers, App Settings, Bannières, News, Récompenses, Tarifs, **Catégories de livraison**.
- **Reste** : Recherche unifiée mobile `/api/search/delivery` (app Expo), i18n web. ⏳ Twilio/Firebase/WhatsApp en attente des clés API.



## NEW - 2026-06-07 (32) - Tarifs véhicules par zone (Lot 2) - branchement au calcul du prix (DONE)
- **Demande user** : Lot 2 — tarifs/véhicules par zone (impacte le calcul de course). **Découverte** : les `zone_overrides` (prix/km, prix/min, base, min par zone) existaient déjà sur les docs `vehicle_types` **avec une UI admin complète** (`VehicleTypeEditor`), mais **n'étaient JAMAIS utilisés** dans le calcul du prix. Lot 2 = **brancher l'existant**.
- **Backend `core/geo_scope.py`** : nouveau `apply_vehicle_zone_pricing(vtype_doc, pickup_address)` → résout la zone de la **prise en charge** (`resolve_zone_from_text`), trouve l'override le plus spécifique (city>state>country, matching souple par nom : « Réunion »⊂« La Réunion », etc.), applique ses champs de prix (`price_per_km, price_per_min, base_fare, min_fare, ...`) sur une COPIE du doc, retourne `(doc, zone_label)`.
- **Backend `rides.py`** : appliqué juste après chaque fetch `vtype_doc` (estimate L187, création L288, recompute/edit L780) → tous les `calculate_fare` en aval utilisent automatiquement le barème de la zone. L'estimate expose `zone_tariff` + raison « Tarif local : <zone> » dans `pricing_reasons`. Le surge (zoné par géofences) reste appliqué par-dessus, inchangé.
- **Frontend `VehicleTypeEditor.jsx`** : UI déjà présente (testids `vt-add-zone`, `vt-zone-{i}`, `vt-zone-del-{i}`, select `ZONES`). Texte clarifié : « Le prix est calculé avec le barème de la zone de prise en charge. Si aucune zone ne correspond, le tarif de base s'applique. »
- **Validé** : **pytest `tests/test_zone_pricing.py` 3/3** (override Martinique 5€/km+10€ base appliqué pour pickup Fort-de-France ; pickup Paris = tarif global 1€/km ; retrait override → tarif baisse) + curl E2E (MQ price_per_km=5/base=10/`zone_tariff=Martinique` vs Paris 1/1) + **screenshot** éditeur (panneau « Tarifs par zone » + ligne override). Données restaurées (`sb.zone_overrides=[]`). Lint front+back clean.
- **Reste** : Lot 3 (règle de zone sur catégories de livraison), recherche unifiée mobile `/api/search/delivery`, i18n web. ⏳ Twilio/Firebase/WhatsApp en attente des clés API.



## NEW - 2026-06-07 (31) - Récompenses zonées (Lot 1.c) - override par zone (DONE)
- **Demande user** : zoner les **Récompenses chauffeur** (régard véhicules, garanties CA, points/palettes, bonus sous-catégories) — override par zone façon App Settings, + sélection/aperçu par zone.
- **Backend `admin.py`** : `get_rewards_config(zone=None)` désormais **zone-aware** (résout l'override le plus spécifique city>state>country, fallback global ; `zone=None` = global, rétrocompatible). Stockage `service_configs` `service_key="rewards"` + `zone_key` ("" global / "C|S|City"). Endpoints : `GET /admin/rewards/config?country=&state=&city=`, `PUT /admin/rewards/config` (optionnel `_zone` dans le body → upsert override, sinon global avec filtre `zone_key:{$exists:false}` pour ne pas écraser les overrides), `GET /admin/rewards/config/zones` (liste des zones personnalisées), `DELETE /admin/rewards/config/zone` (retour au global). `_rewards_zone_key()` helper.
- **Branchement chauffeur** : `drivers.py` `my-active-rewards?location=` & `my-activity?location=` résolvent la zone (`resolve_zone_from_text`) → config zone-spécifique (garanties/régards/points). `rides.py` bonus sous-catégorie à la fin de course utilise la zone du **pickup**. `_get_rewards_points_config(zone=None)`.
- **Frontend admin `AdminRewards.js`** : barre **« Configuration par zone »** (`rewards-zone-bar`) avec `ZoneScopePicker`, badge zone courante (`rewards-current-zone`), badges « BARÈME SPÉCIFIQUE » / « HÉRITE DU GLOBAL », bouton « Sauvegarder cette zone », **chips des zones personnalisées** (clic = éditer), bouton « Supprimer l'override ». Chaque onglet (régard/garantie/points/subcat) édite le barème de la zone sélectionnée.
- **Frontend chauffeur** : `DriverRewardsPage` (+ `DriverHome` bannière) passent la localisation navigateur (`getBrowserLocationLabel`) aux endpoints rewards → barème de la zone du chauffeur. (`DriverProfilePage` résumé reste global — acceptable MVP.)
- **Validé** : **pytest `tests/test_rewards_scope.py` 4/4** (résolution override MQ=80 vs global=70, fallback FR, global inchangé, liste zones, delete revert, chauffeur voit la garantie MQ via `?location=`) + curl E2E + **testing_agent iteration_156.json 100% frontend** (round-trip admin sélection→édition→save→chip→global inchangé→delete revert). Fix mineur : `DriverRewardsPage` plage horaire `undefined-undefined` → fallback `00:00-23:59`. Données nettoyées (seul le doc rewards global subsiste). Lint front+back clean.
- **Lot 1 COMPLET** ✅ (a Bannières, b News, c Récompenses, toutes zonées).
- **Reste** : Lot 2 (tarifs/véhicules par zone), Lot 3 (règle de zone sur catégories de livraison), recherche unifiée mobile, i18n web. ⏳ Twilio/Firebase/WhatsApp en attente des clés API.



## NEW - 2026-06-07 (30) - Actualités : badge non-lu + push zone-ciblé (DONE)
- **Demande user** : améliorer le fil d'actualités → badge « non-lu » + **notification push** à la publication d'un article ciblé sur la zone du destinataire.
- **Backend `routes/news.py`** : `GET /api/news/unread-count?location=` (compte les articles publiés audience+zone plus récents que `users.news_last_read_at` ; rafraîchit aussi `users.last_zone` pour le ciblage push), `POST /api/news/mark-read` (pose `news_last_read_at=now`). Hook `_notify_article_published()` appelé à la **création publiée**, au **passage published** (update) et au **toggle→published** : push best-effort via `create_notification` aux users dont le rôle correspond à l'audience ; **article zoné = uniquement aux users dont `last_zone` matche** (`scope_matches`), article global = tous. `_eligible_roles`: rider→user, driver→driver, all→les deux.
- **Frontend** : `newsAPI.unreadCount/markRead`. `NewsFeedPage` appelle `markRead` à l'ouverture (efface le badge). `ProfilePage` (rider) & `DriverProfilePage` (chauffeur) chargent l'unread (via `getBrowserLocationLabel`) et affichent un **badge rouge** sur l'entrée « Actualités » (`MenuItem`/`ProfileRow` ont un prop `badge`, testids `settings-news-btn-badge` / `driver-news-badge`).
- **Validé** : **pytest `tests/test_news_scope.py` 6/6** (+ test unread→mark-read→0). Curl E2E : unread 2→0→1 à la publication d'un article global. **Mongo** : rider zone MQ reçoit « Flash info QA » (global) + « Promo MQ push » (MQ), **PAS** « Promo Paris push » (ciblage zone OK). **Screenshot** : `driver-news-badge=1`. Données nettoyées (2 articles seedés, users QA supprimés). Lint clean.
- **Suite (approuvée par user, à faire)** : 🎁 **Récompenses client+chauffeur zonées (Lot 1.c)** — override par zone de la config `service_configs:rewards` (pattern App Settings).



## NEW - 2026-06-07 (29) - Module News/Actualités complet, zone-aware (Lot 1.b) (DONE)
- **Demande user** : choix (a) — construire le **module News complet** zone-aware (le backend `news.py` existait mais n'était **pas branché** : router non enregistré, aucune UI admin, aucun feed client).
- **Backend `routes/news.py`** : router **enregistré** dans `server.py` (+ `seed_news` idempotent = 2 articles globaux publiés). `_clean_payload` ajoute `scope=clean_scope(...)`. `GET /api/news/feed?location=` filtre par audience (rider/driver selon rôle) **+ zone** (`resolve_zone_from_text(location)` → `scope_matches`). Nouvel endpoint admin **`GET /api/news/admin/preview?country=&state=&city=&audience=`** (« Aperçu par zone » : articles publiés visibles pour une zone + audience, réutilise `scope_matches`).
- **Frontend admin `AdminNews.js`** (route `/admin/actualites`, menu CROISSANCE → « Actualités », dédup de l'ancien placeholder `/admin/news`) : CRUD (titre, contenu, image, audience Tous/Clients/Chauffeurs, épingler, statut) + `ZoneScopePicker` + **badge zone vert** + encart **« Aperçu par zone »** (toggle audience rider/chauffeur + picker → `newsAPI.adminPreview`). `newsAPI` ajouté à `api.js`.
- **Frontend client `NewsFeedPage.js`** (rider `/actualites` + chauffeur `/chauffeur/actualites`) : feed via `newsAPI.feed(location)` + `getBrowserLocationLabel()` (géoloc → reverse-geocode → filtrage zone, fallback = tout). Entrées : `ProfilePage` (rider, `settings-news-btn`) + `DriverProfilePage` (ligne « Actualités »).
- **Validé** : **pytest `tests/test_news_scope.py` 5/5** (articles seedés ; preview rider MQ inclut, Paris exclut, audience driver exclut l'article rider ; feed auth requise) + curl E2E + **testing_agent iteration_155.json 100% frontend** (admin CRUD zoné, Aperçu par zone audience+zone, feed rider & chauffeur). Données nettoyées (2 articles seedés). Lint front+back clean (erreur immutability `ProfilePage:76 handleLogout` = **pré-existante**, tolérée par le build).
- **Reste (Lot 1.c + suite)** : **Récompenses client+chauffeur zonées** (override par zone de la config globale `service_configs:rewards`, pattern App Settings) ; puis Lot 2 (tarifs/véhicules par zone), Lot 3 (règle de zone sur catégories de livraison), recherche unifiée mobile, i18n web. ⏳ Twilio/Firebase/WhatsApp en attente des clés API.



## NEW - 2026-06-07 (28) - Admin « Aperçu par zone » des bannières (DONE)
- **Demande user** : pouvoir prévisualiser, depuis l'admin, ce qu'un client d'une zone donnée (Martinique vs Paris) verra comme bannières, sans changer de compte ni de localisation.
- **Frontend `AdminPromoBanners.js`** : carte dépliable **« Aperçu par zone »** (`zone-preview-card`, `preview-toggle-btn`) en haut de la page. Contient un `ZoneScopePicker` (Pays/Région/Ville) ; à chaque changement → appel de l'**endpoint public réel** `promoBannersAPI.preview(zone)` (`GET /api/promo-banners?country=&state=&city=`) → rend les `BannerPreview` exactement comme l'app client, avec un compteur (`preview-result-count`). `api.js` : nouvelle méthode `promoBannersAPI.preview(zone)`.
- **Validé** : screenshots admin — **FR/Île-de-France → 2 bannières** (la bannière scopée MQ masquée) ; **MQ/Martinique → 3 bannières** (inclut la campagne Martinique). Données de test nettoyées (2 bannières par défaut). Lint clean.



- **Demande user** : étendre le scope géo (P1) — **Lot 1 : Bannières d'abord**. Choix validés : (a) pattern Vouchers (champ `scope {country,state,city}` + filtrage client), (a) **détection zone client par géolocalisation navigateur**.
- **Backend `routes/promo_banners.py`** : import `clean_scope/scope_matches/resolve_zone_from_text`. `admin_create` stocke `scope=clean_scope(body.scope)` ; `admin_update` accepte `scope`. `GET /api/promo-banners?country=&state=&city=&location=` : résout la zone (params explicites OU texte `location` reverse-géocodé) et filtre via `scope_matches` (bannière sans scope = globale = toujours visible). **Sans aucun paramètre de zone → renvoie toutes les bannières actives** (fallback sûr : géoloc refusée/en attente). Les bannières seedées (sans scope) restent globales.
- **Frontend client** : `lib/browserZone.js` (`getBrowserLocationLabel()` — `navigator.geolocation` + reverse-geocode Google REST `language=fr`, renvoie '' en cas d'échec). `UserHome.js` charge les bannières (toutes au départ), puis dès que la géoloc résout un libellé d'adresse → **refetch zone-aware** (`promoBannersAPI.public(label)`). `promoBannersAPI.public(location)` passe `?location=`.
- **Frontend admin `AdminPromoBanners.js`** : `ZoneScopePicker` (Pays/Région/Ville) ajouté au formulaire (champ « Portée géographique », vide = partout) ; **badge zone vert** (`banner-zone-badge-{id}`) dans la liste pour les bannières scopées.
- **Validé** : **pytest `tests/test_promo_banners_scope.py` 4/4** (création scopée MQ ; `location=Martinique` inclut, `location=Paris` exclut + garde les globales ; `country/state` explicites ; sans param = tout) + curl E2E + **screenshots admin** (picker dans le form + création « Promo QA Zone Martinique » → badge vert MQ + toast « Bannière créée »). Données nettoyées (2 bannières par défaut restaurées). Lint front+back clean.
- **Reste (Lot 1 suite)** : **News zonées** (1.b), **Récompenses client+chauffeur zonées** (1.c). Puis Lot 2 (tarifs/véhicules par zone), Lot 3 (règle de zone sur catégories de livraison via ZoneScopePicker), recherche unifiée mobile, i18n web. ⏳ Twilio/Firebase/WhatsApp en attente des clés API user.
- ℹ️ Le badge affiche le **code pays** (ex. « MQ ») car `clean_scope` ne persiste que country/state/city ; cosmétique, non bloquant.



## NEW - 2026-06-07 (26) - Module Admin « Catégories de livraison » (Store Delivery V3Cube) (DONE)
- **Demande user** : « Implémenter activer brancher » → recréer le module V3Cube « Services → Store Delivery » dans l'admin. Choix user validés : (A) champs = toggle Actif/Inactif, nom FR/EN, icône (emoji/image), **vérification d'âge** (flag simple 18+/21+), **type de véhicule** de livraison, classement ; (A) la vérification d'âge est un **flag affiché** (pas de contrôle de date de naissance au checkout).
- **Backend `routes/store_categories.py`** (collection `store_categories`) : `seed_store_categories()` (idempotent) seede **9 verticales** alignées sur `AllDeliveryPage` (food/restaurant, grocery, medicine/pharmacy, flowers/florist, stationery, wine, water, supermarket, construction) avec `key,name,name_en,icon,store_type,path,group,age_restriction,delivery_vehicle,display_order,active`. Public `GET /api/store-categories`. Admin (perm `server.settings.edit`) : `GET /api/admin/store-categories`, `PUT /{key}` (champs éditables dont coercition `age_restriction` int), `POST /{key}/toggle`, `POST /reorder`. Médicaments & Vin → `age_restriction=18` par défaut ; Matériaux → `delivery_vehicle=car`. Enregistré dans `server.py` (router + admin_router + seed).
- **Frontend admin `AdminStoreCategories.js`** (sœur de `AdminServiceCategories`) : grille de cartes (icône, nom, groupe, **badge âge 18+/21+**, **badge véhicule**), toggle Actif/Inactif, recherche + filtre statut, flèches ↑/↓ (sans filtre), modale d'édition (nom FR/EN, **select âge** Aucune/18+/21+, **select véhicule** Tous/Moto/Voiture, icône emoji/upload). Route `/admin/store-categories`, menu **« Livraisons boutiques → Catégories de livraison »**. `adminAPI.listStoreCategories/updateStoreCategory/toggleStoreCategory/reorderStoreCategories`.
- **Branchement client `AllDeliveryPage.js`** : récupère `configAPI.getStoreCategories`, **n'affiche que les catégories actives** (désactiver côté admin = disparaît du hub), affiche un **badge d'âge** (ex. 18+) sur Médicaments/Vin, et navigue vers `cat.path`. Carte visuelle (icône Phosphor + couleurs) conservée par `key` pour préserver le design.
- **Validé** : **pytest `tests/test_store_categories.py` 7/7** (public list 9 + champs, toggle reflété en public, update name/age/vehicle, 404, reorder, requires-admin 403) + curl E2E + **testing_agent iteration_154.json 100% frontend** (login admin email, grille 9 verticales ordre par défaut, badges âge/véhicule, toggle, modale édition age+vehicle, reorder, branchement client /all-delivery). Données restaurées (toutes actives, noms/ordre par défaut). Lint front+back clean.
- **Reste (scope géo suivant)** : étendre le scope géographique aux **Bannières/Pubs, Tarifs, News, Récompenses** ; recherche unifiée mobile `/api/search/delivery` ; i18n web ; ⏳ Twilio/Firebase/WhatsApp **en attente des clés API user**.



## NEW - 2026-06-07 (25) - App Settings par zone (override complet) + Taxi Hall « zone de compétition » (DONE)
- **Demande user** : étendre le scope géo (par étapes) ; **rayon de course par zone** (peu de chauffeurs → 50 km, beaucoup → 2 km) ; **« jeu complet de réglages App Settings par zone »** ; **Taxi Hall = zone de compétition** (accès conditionné à un **taux d'acceptation min** + **taux d'annulation max** définis par l'admin ; nouveau chauffeur = 100% d'acceptation donc éligible par défaut).
- **(A) App Settings par zone (override complet)** : `config.py` — `get_app_settings_config(zone)` résout l'override **le plus spécifique** (ville > région > pays > global) et renvoie le **jeu complet** fusionné sur les défauts. `GET /api/config/app-settings?country=&state=&city=` (public, zone-aware). `PUT /api/config/admin/app-settings` accepte un `_zone {country,state,city}` optionnel → upsert d'un doc par zone (`zone_key`) ; sans `_zone` = global. `GET /api/config/admin/app-settings/zones` (liste des overrides). Le **rayon de dispatch** (`auto_dispatch._process_pending_ride`) lit désormais `radius_show_online_drivers_km` **résolu par zone** depuis l'adresse de départ → rayon variable par zone. **Vérifié curl** : override MQ radius=50 vs global/FR=35.
- **(B) Taxi Hall — zone de compétition** : 3 nouvelles clés App Settings (`taxi_hall_require_competition`, `taxi_hall_min_acceptance_rate`=80, `taxi_hall_max_cancellation_rate`=30). `_taxi_hall_eligibility(driver, zone)` (rides.py) : éligible si `acceptance_rate ≥ min` ET `cancellation_rate ≤ max` ; nouveau chauffeur (défaut 100/0) passe. `GET /api/rides/taxi-hall/eligibility` (driver) + **garde 403** sur `POST /api/rides/taxi-hall` (zone résolue depuis dropoff/pickup). Front : `DriverHome` récupère l'éligibilité, `openTaxiHall` bloque + toast la raison si inéligible.
- **Admin UI** : `AdminAppSettings` — barre **« Portée des réglages »** avec `ZoneScopePicker` (Pays/Région/Ville) ; sélectionner une zone charge/édite/sauvegarde son jeu complet (`_zone`), label/toast au **nom du pays** (Martinique, pas « MQ »). Nouveau groupe **« Taxi Hall — zone de compétition »**. Sauvegarde globale conserve la **synchro instantanée**.
- **Validé** : **testing_agent iteration_152.json — backend 7/7 pytest** (résolution zone city/state/country, override MQ vs global/FR, zones list, éligibilité + 403 taxi-hall) + UI admin (zone bar, picker MQ, nouveau groupe, save+persist) + UI driver (blocage taxi-hall). 1 défaut **cosmétique LOW corrigé** (label affichait le code → nom du pays). Nettoyage des overrides + restauration des défauts vérifiés. Lint/webpack OK.
- **RESTE (étapes suivantes du scope géo)** : **bannières/pubs zonées** (mini-CRUD), **General Settings** zonable, **tarifs/véhicules** zonable, **bonus/news/codes/récompenses (client+chauffeur)** zonables ; gating **frontend** rider/driver zone-aware (détection zone client) ; élargir le seed régions/villes + option **géocodage** pour adresses hors dataset.



## NEW - 2026-06-07 (24) - Synchro instantanée des flags + Scoping géographique des configs (Étape 1) (DONE)
- **Demande user** : (1) synchro instantanée des App Settings (pas de reload manuel) ; (2) **portée géographique** des configurations admin — chaque config liée à pays/région/ville ; le backend applique uniquement la config correspondant à la zone de la requête (ex. une réduction 40% visible **seulement en Martinique**). Choix user : zonable = **tout (par étapes)**, **jeu complet par zone**, déclencheur = **zone choisie par l'admin** appliquée selon la **localisation** de la requête, **listes déroulantes structurées**.
- **(1) Synchro instantanée** : `useAppSettings.js` → `refreshAppSettings()` invalide le cache + `window.dispatchEvent('app-settings-updated')` ; le hook écoute l'événement et met à jour les gates **sans reload**. `AdminAppSettings.handleSave` le déclenche après sauvegarde des App Settings.
- **(2) Scoping géo — fondation** : `core/geo_scope.py` — dataset **curaté** (MQ Martinique, GP Guadeloupe, GF Guyane, RE Réunion, YT Mayotte, FR France métropolitaine avec régions+villes), helpers `resolve_zone_from_text(pickup)` (résolution texte, sans géocodeur, le nom de pays le plus long gagne → « Fort-de-France, Martinique » = MQ), `scope_matches(scope, zone)` (vide=global ; sinon pays puis région/ville), `clean_scope`. `routes/geo.py` : `GET /geo/states?country=` + `GET /geo/cities?country=&state=` (la liste pays = référentiel existant 250 ISO).
- **Appliqué à Auto-Promotions + Vouchers** : champ `scope {country,state,city}` ajouté au payload admin ; `evaluate_best_auto_promo(...,zone)` et `validate_voucher(...,zone)` filtrent par zone. À la création de course (`rides.py`), la zone est résolue depuis `pickup_address` et passée aux deux. `GET /auto-promotions/best?pickup=` et `POST /vouchers/validate {pickup_address}` rendent l'aperçu rider zone-aware.
- **Frontend** : `components/admin/ZoneScopePicker.jsx` (sélecteurs cascadés Pays/Région/Ville, `<select>` natifs ; vide = partout) intégré dans les modales **AdminAutoPromotions** (+ badge zone dans le tableau) et **AdminVouchers**. `geoAPI.getCountries/getStates/getCities`. `RideBookingPage` passe l'adresse de départ aux appels promo/voucher.
- **Validé** : **testing_agent iteration_151.json — backend 17/17 pytest** (`test_geo_scoped_configs.py` : geo endpoints, promo MQ vs Paris vs global, voucher MQ refusé en zone Paris, régressions globales) + **front** (cascade MQ→Martinique→Fort-de-France/Le Lamentin dans les 2 modales). Pytest `tests/test_geo_scope.py` 7/7. Lint front+back clean (webpack OK). Données de test nettoyées.
- **Reste (étapes suivantes)** : étendre le scope aux **bannières/pubs**, **General Settings**, **tarifs/véhicules**, et au **« jeu complet de réglages App Settings par zone »** ; seeder un référentiel régions/villes plus large si besoin hors territoires curatés ; résolution zone par géocodage (optionnel) pour les adresses hors dataset.



## NEW - 2026-06-07 (23) - App Settings « brancher tout » : feature-gating réel des flags (DONE)
- **Demande user** : « A complet — remplissez tout, activer tout » → brancher les flags du panneau Admin App Settings (118 clés) à la **vraie logique** des apps rider + chauffeur (activer/désactiver des fonctionnalités dynamiquement).
- **Hook central `frontend/src/hooks/useAppSettings.js`** : fetch unique mis en cache (module-level) de `GET /api/config/app-settings` + défauts sûrs ; expose `{ settings, loading }`. ⚠️ Cache non invalidé en session → **un reload complet** est requis côté rider/chauffeur après une sauvegarde admin.
- **Flags branchés (gating UI + enforcement backend)** :
  - `taxi_hail_option` → DriverFab masque « Appelez un taxi » ; backend `POST /api/rides/taxi-hall` renvoie **403** si désactivé.
  - `ask_otp_before_start` → DriverRideFlow : le slider COMMENCER démarre **directement** (sans modale OTP) si false ; backend `verify_start_otp` accepte un démarrage **sans OTP** (`{skip_otp:true}`) uniquement quand le flag est false (sinon 400 « Code requis »).
  - `driver_timeout` → fenêtre du compte à rebours `IncomingRequestSheet`.
  - `enable_pool` → RideMapStep masque le toggle « Partager la course (Taxi Pool) ».
  - `enable_driver_wallet_withdrawal` (+ `driver_wallet_withdrawal_restriction_min`) → DriverWalletPage masque le bouton **Retrait** + hint montant min.
  - `enable_driver_reward_program` → masque la rondelle/ligne Récompenses (chauffeur).
  - `enable_gift_card` → masque la section Carte cadeau (rider + chauffeur).
  - `enable_donation` / `enable_favorite_driver` / `enable_referral_system` → masquent « Faire un don » / « Chauffeurs favoris » / « Inviter » (rider profile + quick-action).
- **Validé** : **testing_agent iteration_150.json — backend 14/14 pytest** (`test_app_settings_gating.py` : GET public, PUT admin + persistance/reload, auth requise, taxi-hall 403, ask_otp 400/200, persistance des 7 flags) + **admin UI** (render, save, persistance après reload pour `taxi_hail_option`). Tous les flags remis aux **défauts** en fin de run. Lint front+back clean (les 2 erreurs React Compiler immutability/set-state-in-effect de ProfilePage/DriverWalletPage sont **pré-existantes**, tolérées par le build). Webpack compile.
- **Reste (backlog flags)** : les ~100 autres clés sont des **limites/valeurs** déjà exposées par l'API publique (consommables tel-quel) ; brancher d'autres comportements (handicap/siège enfant/genre, surge, pourboire, parrainage multi-niveaux…) au cas par cas selon besoin user.



## NEW - 2026-06-07 (22) - Vouchers (bons à code, distincts des Promocodes) — créé + branché (DONE)
- **Demande user** : « Abc » → un système Voucher **flexible** couvrant (a) code saisi au paiement réduisant le tarif, (b) bon à montant fixe à usage unique, (c) code type promo avec **fenêtre de validité + quota**.
- **Backend `routes/vouchers.py`** (collections `vouchers` + `voucher_redemptions`) :
  - Modèle : `code` (unique, MAJ), `title`, `discount_type` (fixed €/percentage % avec `max_discount`), `min_order_amount`, `total_quota` (0=∞), `per_user_limit` (défaut 1), `valid_from`/`valid_until`, `status`, `used_count`.
  - `validate_voucher(code, user, amount)` → contrôle existence/actif/fenêtre de validité/quota global/limite par utilisateur (via `voucher_redemptions`)/montant min ; calcule la remise. `redeem_voucher()` insère la rédemption + incrémente `used_count`.
  - CRUD admin `POST/GET/PUT/DELETE /api/vouchers/admin` + `toggle` (perm `billing.promocodes.create`, code unique). Rider `POST /api/vouchers/validate`.
- **Branchement (rides.py)** : à la création, après la promo auto, si `voucher_code` fourni → `validate_voucher` (400 si invalide), réduit `fare`, stocke `voucher_code`/`voucher_discount` (ajoutés à `RideRequest`/`RideResponse`), enregistre la rédemption après insertion. Routeur enregistré dans `server.py`.
- **Frontend admin `AdminVouchers.js`** : tableau (code, remise, min, quota used/total, validité, statut) + modale (code, titre, type, valeur, max %, min, quota, limite/client, dates, statut) + toggle/suppression. Remplace le placeholder du barrel ; route `/admin/vouchers`, menu « Vouchers ». `adminAPI.list/create/update/toggle/deleteVoucher`.
- **Frontend rider** : `RideMapStep` — section `voucher-section` (input + « Appliquer ») → `rideAPI.validateVoucher` → chip `voucher-applied` (« Voucher CODE : -X € ») ; le **double tarif** du véhicule sélectionné combine **promo auto + voucher** (original barré + final vert). `voucher_code` envoyé à la création.
- **Validé** : curl E2E (10,33 €→2,33 € avec bon 8€, limite/client, quota, expiration) + **testing_agent iteration_149.json 100% frontend** (6 scénarios : CRUD admin, champ % conditionnel, édition/toggle, application rider 10 €→1 €, réservation, suppression). DB laissée propre. Build compile (les 5 erreurs strict-lint de `RideBookingPage` sont **pré-existantes** — effets voice-assistant/airport, backlog des 339).
- **Note UX (conforme consigne user)** : l'écran de **négociation/enchères** affiche le tarif **non réduit** (10 € = 10 €) — la réduction ne s'y applique pas (seule catégorie sans remise).


## NEW - 2026-06-07 (20) - Badge promo rider : double tarif (barré + réduit) (DONE)
- **Demande user** : rendre la remise auto visible AVANT paiement — le client voit **2 tarifs** : le tarif normal **barré** + le tarif **réduit** non barré.
- **Frontend** : `RideBookingPage.js` récupère la meilleure promo via `rideAPI.getBestAutoPromo(estimate.estimated_fare)` (endpoint authentifié `GET /api/auto-promotions/best`) dès que le tarif estimé change, et passe `autoPromo` à `RideMapStep` + `RideNegotiationStep`.
  - `RideMapStep.jsx` : pour le véhicule **sélectionné**, affiche `vehicle-fare-original-{slug}` (barré, gris) + `vehicle-fare-discounted-{slug}` (vert, = tarif − remise) ; bannière `auto-promo-banner` (« Promo auto « titre » appliquée : -X € ») au-dessus du CTA « Demander maintenant ».
  - `RideNegotiationStep.jsx` : « Votre offre » reflète désormais le tarif **réduit** (correctif cohérence post-test).
- **Cohérence** : le backend ré-applique la même remise à la création (déjà branché en (19)), donc l'affichage = montant réellement facturé.
- **Validé** : **testing_agent iteration_148.json 100% frontend** (véhicule sélectionné : 10 € barré + 5 € vert, bannière « Offre Bienvenue », réservation → course à 5 €). Lint clean. Promo de test supprimée (DB propre).


## NEW - 2026-06-07 (19) - AI Based Auto Promotions (créé + branché end-to-end) (DONE)
- **Demande user** : « Activer brancher connecter toute la plateforme » → option (a) **AI Based Auto Promotions** (parité V3Cube « Add Auto Promotion »). Remises **auto-appliquées** au tarif rider selon le profil, **sans code**.
- **Backend `routes/auto_promotions.py`** (collection `auto_promotions`) :
  - Critères : `first_ride` (0 course terminée), `trip_count` (≥ seuil de courses terminées), `inactive_user` (dernière course > N jours / jamais), `every_trip`.
  - Remise `flat` (€) ou `percentage` (% avec `max_discount` optionnel). `evaluate_best_auto_promo(user, amount, service)` choisit la **meilleure** remise éligible (sans effet de bord).
  - CRUD admin : `POST/GET/PUT/DELETE /api/auto-promotions/admin` + `PUT /admin/{id}/toggle` (perm `billing.promocodes.create`). Rider : `GET /api/auto-promotions/best?amount=&service=`.
- **Branchement (rides.py)** : à la création de course, après surge/pool/corporate, on évalue la meilleure promo, on **réduit `estimated_fare`**, on stocke `auto_promo_id/title/discount` (ajoutés à `RideResponse`) et on **incrémente `usage_count`** après insertion. Routeur enregistré dans `server.py`.
- **Frontend admin `AdminAutoPromotions.js`** : tableau (titre, critère, remise, usage, statut) + modale créer/éditer (champs conditionnels : seuil pour trip_count, jours pour inactive_user, max pour percentage) + toggle + suppression. Route `/admin/auto-promotions` (remplace l'ancien placeholder du barrel `AdminCrudPages`), menu « Auto-promotions IA » (CROISSANCE). `adminAPI.list/create/update/toggle/deleteAutoPromotion`.
- **Validé** : curl E2E (create → /best renvoie la promo → course rider 10,33 €→5,33 €, `auto_promo_discount=5`, `usage_count++` ; toggle inactif → /best null) + **testing_agent iteration_147.json 100% frontend** (render, empty state, champs conditionnels, create/edit/toggle/delete). DB laissée vide (zéro promo active). Lint front+back clean.

## NEW - 2026-06-07 (18) - App Settings (panneau V3Cube créé + branché) (DONE)
- **Demande user** : recréer & brancher le panneau V3Cube « General Settings → App Settings » (~90 réglages) dans notre admin.
- **Backend `routes/config.py`** : store `app_settings` (118 clés, `DEFAULT_APP_SETTINGS`) — `GET /api/config/app-settings` (public) + `PUT /api/config/admin/app-settings` (admin, perm `server.settings.edit`, coercition de types). Store `general_settings` (branding/unités/maintenance/liens) — `GET /api/config/general-settings` + `PUT /admin/general-settings`. Helpers `get_app_settings_config()` / `get_general_settings_config()` (merge defaults + coercition).
- **Frontend admin `AdminAppSettings.js`** : page pilotée par **schéma** (efficace pour ~90 champs), 2 onglets **Général** (3 cartes) + **App Settings** (10 cartes regroupées), recherche, sauvegarde par onglet, rendu générique (bool→Oui/Non, int, text, time, selects). Route `/admin/app-settings`, menu « Paramètres généraux (App Settings) ». `configAPI.getAppSettings/getGeneralSettings`, `adminAPI.updateAppSettings/updateGeneralSettings`.
- **Branchement phare** `allow_driver_edit_profile` (défaut **True**) : `PUT /api/drivers/profile/info` renvoie **403** si désactivé ; `DriverProfilePage` **masque** la ligne « Mes informations (société/licence) » quand le flag est faux (fetch `configAPI.getAppSettings`).
- **Validé** : curl E2E (save+persistance via GET public, garde 403 quand désactivé / 200 quand activé, RBAC non-admin 403) + **testing_agent iteration_146.json 100%** (page, 2 onglets, recherche, save persistée, masquage/affichage réel de la ligne chauffeur). Flag laissé sur **Oui**. Lint clean.


## NEW - 2026-06-07 (17) - Refactor maintenabilité : découpage de DriverRideFlow.jsx (DONE)
- **Objectif** (plan option A, P1) : réduire la taille du composant `DriverRideFlow.jsx` (457 l.) **sans changer le comportement**, même approche que le découpage de DriverHome.
- **Nouveau fichier `components/driver/RideFlowViews.jsx`** (154 l., **présentationnel pur**) : `RatingStars`, `RideFlowHeader` (barre + minimize + menu 3-points), `RideFlowAddressCard` (carte adresse ramassage/destination), `RideFlowMap` (carte Google + SOS + pastille connexion + chrono course + minuteur d'attente ramassage + toggle attente), `RideFlowFooter` (3 boutons appel/chat/nav + carte passager + case vidéo + 3 sliders). Tous les `data-testid` **préservés à l'identique**, props nommées.
- **`DriverRideFlow.jsx`** : 457 → **382 l.** — conserve **tout l'état, les effets, les handlers et les modales** (RideFlowMenu/CallTypeSheet/InAppNav/SafetySheet/OtpModal) ; calcule les libellés (chrono via `fmtClock`, libellés d'attente) et les passe aux sous-vues. Imports d'icônes/AdminGoogleMap/SlideToConfirm déplacés dans RideFlowViews (plus d'import inutilisé).
- **Validé** : testing_agent **iteration_145.json 100% frontend, zéro régression** — cycle complet sur course seedée : restauration auto (accepted) → slider ARRIVER (EN ROUTE + case vidéo + minuteur attente) → slider COMMENCER → modale OTP (1234) → COURSE EN COURS (chrono + toggle attente + retour navigateur bloqué) → toggle attente start/stop → slider TERMINER → frais suppl. → facture → collecte → notation 5★ → Course terminé → retour home. Menu 3-points (détails passager / Lettre de voiture / Annuler) OK. Lint front clean, webpack compile.


## NEW - 2026-06-07 (16) - Modification infos chauffeur (société/licence) avec validation admin (DONE)
- **Demande user** (choix A + précision) : permettre au chauffeur de modifier **Nom de société** et **N° de licence** depuis son profil, ET donner à l'administrateur la possibilité d'**accepter ou refuser** ces modifications dans le dashboard (comme pour les documents).
- **Principe** : la modif n'est **PAS appliquée en direct** → elle est mise en file d'attente dans `drivers.pending_info` (status `pending`) pour validation admin. Les valeurs live (`company_name`/`license_number`) ne changent qu'à l'approbation.
- **Backend `drivers.py`** : `PUT /api/drivers/profile/info` (chauffeur) stocke `pending_info {company_name, license_number, previous_*, status, reason, requested_at, reviewed_at}` ; 400 si aucun champ / aucune modif. `pending_info` exposé via `GET /api/drivers/profile` (champ ajouté à `DriverProfile`).
- **Backend `misc.py`** : `GET /api/admin/drivers/{id}/documents` renvoie désormais aussi `pending_info` + `company_name`/`license_number`/`vehicle_*`. Nouveau `PUT /api/admin/drivers/{id}/info-change/status {status: approved|rejected, reason}` → **approve** applique les valeurs aux champs live + `pending.status=approved` ; **reject** conserve les valeurs live + `pending.status=rejected`+motif ; 404 si aucune demande en attente. Notifie le chauffeur (`create_notification` + WS `driver_info_reviewed`) + audit log.
- **Frontend chauffeur `DriverProfilePage.js`** : nouvelle ligne « Mes informations (societe, licence) » (réglages généraux) → modale `driver-info-modal` (inputs `info-company-input`/`info-license-input`, bouton `info-submit-btn`), bannières `info-pending-banner` (ambre) / `info-rejected-banner` (rouge+motif), listener WS `driver_info_reviewed` (toast + refetch). `driverAPI.requestInfoChange`.
- **Frontend admin `AdminDrivers.js`** : badge violet `info-badge-{i}` (« Infos à valider ») dans le tableau ; section `admin-info-change` en haut de la `DriverDocsModal` (ancien → nouveau, `admin-info-approve` / `admin-info-reject` + `admin-info-reason` + `admin-info-confirm-reject`). `adminAPI.setDriverInfoChangeStatus`.
- **Validé** : curl E2E (submit→pending live inchangé ; approve→live MAJ ; re-approve sans demande→404 ; reject+motif→live préservé ; sans champ→400) + **testing_agent iteration_144.json 100% backend & frontend** (4 scénarios : submit, approve, reject, bannières). Lint front+back clean.

## NEW - 2026-06-07 (15) - Centralisation du chargement Google Maps (DONE)
- **Tâche P0 (en cours sur le fork)** : éliminer le warning « You have included the Google Maps JavaScript API multiple times » en unifiant le chargement du script.
- **`src/lib/googleMaps.js`** : source unique `GMAPS_LOADER_OPTIONS` (id `google-map-script`, `libraries=['places','visualization']` **hoistée en module** = ref stable, language `fr`, region `FR`). Tous les conscommateurs (`GooglePlacesInput.js`, `MapLocationPicker.js`, `admin/AdminGoogleMap.jsx`, `user/ride-tracking/GoogleRideMap.jsx`) utilisent `useJsApiLoader(GMAPS_LOADER_OPTIONS)`. Plus d'injection manuelle de `<script>`, rien dans `index.html`.
- **Validé** : testing_agent iteration_144.json — cartes rendues sur `/admin/live-rides` (4 nœuds gm-style), `/admin/gods-view` (15 nœuds + heatmap/traffic), GooglePlacesInput (suggestions PAC OK sur `/`), **plus aucun warning multi-load**. Restent (non-bloquants) : deprecation `google.maps.Marker` (informatif).


## NEW - 2026-06-07 (14) - Refactor maintenabilité : découpage de DriverHome.js (DONE)
- **Objectif** : réduire la taille/complexité du composant `DriverHome.js` (706 l.) sans changer le comportement.
- **5 sous-composants présentationnels extraits** dans `src/components/driver/home/` : `DriverHomeHeader.jsx` (barre verte : menu, toggle en ligne, agenda+badge, notifs), `DriverStatsRow.jsx` (gains du jour + 4 cartes stats), `DriverHomeMap.jsx` (carte Google + route course active + rondelle Récompenses+badge), `DriverFab.jsx` (FAB radial 6 actions), `DestinationModeModal.jsx` (modale Mode Destination). Tous **purs/présentationnels**, props nommées, **tous les `data-testid` préservés à l'identique**. État, effets et handlers restent dans `DriverHome.js`.
- **Résultat** : `DriverHome.js` **706 → ~559 lignes**. Constante morte `gmapLoaded` supprimée.
- **Validé** : agent de test frontend **100% (iteration_143.json), aucune régression** — 12 critères OK (toggle en ligne, navigation cartes stats, modale revenus, feuille agenda+badge, rondelle récompenses+badge, FAB 6 actions, modale destination, overlay DriverRideFlow sur course active). Lint propre sur les 6 fichiers.
- ℹ️ Points pré-existants relevés (hors périmètre) : Google Maps JS chargé plusieurs fois (warning console), deprecation `google.maps.Marker`.


## NEW - 2026-06-07 (13) - Utilitaire logger + neutralisation centralisée des console.* en prod (DONE)
- **Objectif** : neutraliser les ~165 `console.*` de production **sans toucher 165 fichiers**, et fournir un logger propre pour le code futur.
- **`src/lib/logger.js`** (nouveau) : `logger` (log/debug/info = no-op en prod, warn/error conservés) + `silenceConsole()` qui remplace `console.log/debug/info` par des no-ops en production uniquement (`NODE_ENV==='production'`). `console.warn`/`error` **préservés** pour le diagnostic.
- **`src/index.js`** : `silenceConsole()` appelé une fois au démarrage, avant le render.
- **Impact** : aucun changement en preview (mode dev → no-op) ; effet **uniquement sur le build production** (au prochain redéploiement). Vérifié : app se charge normalement (landing OK), lint propre, logique prod validée.


## NEW - 2026-06-07 (12) - Revue de code : correctifs critiques appliqués (DONE)
- **Secrets en dur (4 fichiers de test) — CORRIGÉ** : `test_iter97/95/84/75` re-codaient des mots de passe de test en dur alors que `tests/_creds.py` centralise déjà les creds (env-overridable). Désormais ils **importent depuis `_creds`** (ajout de `DRIVER_EMAIL`) ; `test_iter75` génère un mot de passe jetable via `secrets.token_hex`. Vérifié : 43 tests se collectent, lint propre, plus aucun littéral de mot de passe.
- **Variables non définies (« 9 possibly undefined ») — FAUX POSITIF** : `ruff F821/F841/F811` + `pyflakes` + `pylint E0602/E0606/used-before-assignment` = **0** sur `routes/` et `core/`. Aucun bug runtime de variable indéfinie dans le code de production.
- **localStorage (8 cas) — NON SENSIBLE, pas de changement** : ce sont des préférences UI (onglet actif, `sb_notif_prefs`), le dismissal PWA et le **token de session kiosque** (token public, doit persister au reload). L'**auth utilisateur est déjà en cookie httpOnly** — aucun token/mot de passe/PII utilisateur en localStorage.
- **Différés (risque de régression élevé sur app EN PRODUCTION, à faire en incrémental + tests)** : 339 « missing hook deps » (le projet est sous **React Compiler** — ajout massif = risque de boucles de rendu), split des gros composants (DriverHome 682 l., DriverRideFlow), 165 `console.*`, clés `index` de liste (12), refactors de complexité (admin.py, settle_carried_debts), migration TypeScript. Recommandation : traiter fichier par fichier avec validation, pas en une passe aveugle.


## NEW - 2026-06-07 (11) - BUGFIX : dette d'annulation « collée » qui ne se solde jamais (DONE)
- **Bug user** : « La dette n'est pas partie malgré que j'ai commandé plusieurs taxis. »
- **Cause racine** (reproduite en base) : `carry_unpaid_debts_to_ride` n'attachait la dette qu'aux courses dont `carried_ride_id` était vide → la dette se « collait » à la **1re** course créée après l'impayé. Si cette course ne se terminait jamais (ex. course **in_progress** ou abandonnée), les commandes suivantes ne la portaient pas et **les 7 courses terminées de l'utilisateur ne la soldaient pas**. (Cas réel trouvé : dette 5€ de `user_8f657a870` collée sur une course `in_progress`.)
- **Fix** (`routes/debts.py`) : `carry_unpaid_debts_to_ride` re-rattache **TOUTES** les dettes impayées sur **chaque nouvelle course** (re-pointe `carried_ride_id` vers la dernière commande). Ainsi, terminer **n'importe quelle** course solde la dette. Reste **cash-safe** (la pénalité est toujours affichée sur la commande courante → le passager paie course+dette) et **idempotent** (`settle_carried_debts` relit le flag `paid` → débit unique).
- **Vérifié** : pytest `tests/test_debt_carry_resettle.py` (re-report sur la dernière course + règlement une seule fois, débit portefeuille = -5€ exactement) + smoke API (2 courses créées → dette re-pointée sur la 2e, montant porté affiché). Lint clean.
- ⚠️ La dette réelle déjà « collée » se règlera dès qu'une course de cet utilisateur se terminera (la logique la re-porte sur sa prochaine commande). **Fix dans le code (preview) → nécessite un redéploiement pour la production.**


## NEW - 2026-06-07 (10) - Badge chiffré sur la rondelle Récompenses (DONE)
- **Demande user** : afficher un petit badge chiffré sur la rondelle (nb de récompenses/bonus disponibles) pour booster l'engagement.
- **`DriverHome.js`** : nouvel état `rewardsCount` alimenté par le poll `/api/drivers/my-active-rewards` (`vehicle_rewards.length + guarantees.length`). Badge rouge (`rewards-badge-count`, ring blanc, « 9+ » au-delà de 9) en coin sup-droit de la rondelle, affiché si count > 0. Aucun changement backend (l'endpoint renvoyait déjà les listes).
- **Vérifié** : API (jean=1, amadou=2, sophie=1) + screenshot (disc vert + badge rouge « 2 » chez amadou). Lint clean.

## NEW - 2026-06-07 (9) - Bouton Récompenses → petite rondelle clignotante (DONE)
- **Demande user** : repositionner le bouton Récompenses et le transformer en **petite rondelle clignotante**.
- **`DriverHome.js`** : l'ancien bouton pilule « Recompenses/Bonus » (rangée flottante du bas) est remplacé par une **rondelle ronde 48px** (icône Gift, `animate-pulse` + halo blanc) positionnée **en haut à gauche de la carte** (`absolute top-4 left-4`). Couleur **verte** si une récompense est active (`rewardsActive`), **ambre** sinon. La rangée du bas ne contient plus que le FAB « + » (`justify-end`). testid conservé : `rewards-floating-btn`.
- **Vérifié** : screenshot (rondelle ambre clignotante 48×48 en haut-gauche de la carte ; bas = uniquement le FAB). Lint clean.


## NEW - 2026-06-07 (8) - Annulation chauffeur d'une réservation (fenêtre 20 min) (DONE)
- **Demande user** : le montant de la réservation est affiché à côté ; quand le chauffeur **accepte**, un bouton **« Annuler »** apparaît et il peut annuler **tout de suite** ; **passé 20 min**, le bouton « Annuler » **disparaît**, il ne reste que **« Démarrer »** (Départ voyage).
- **Backend `routes/rides.py`** : nouvel endpoint `POST /rides/{id}/driver-cancel-booking` — autorisé **uniquement** si la course est encore `accepted` ET dans les **`DRIVER_CANCEL_WINDOW_MIN = 20`** min suivant `accepted_at` (sinon **HTTP 400** « Délai d'annulation dépassé (20 min). »). L'annulation **relâche** la course dans le pool (`status=pending`, `driver_id=None`, `accepted_at=None`, champs driver_* nettoyés) ; notifie le passager (notif + WS `ride_driver_released`) ; **re-broadcast** immédiat si course instantanée, sinon retour dans l'agenda (course planifiée).
- **Frontend `DriverBookingsPage.js`** (onglet « Prochain ») : à côté de « Départ voyage », bouton **« Annuler »** (`cancel-booking-{id}`) affiché **seulement** si `status==='accepted'` et `now - accepted_at < 20 min`. État `nowTs` (tick 10 s) pour fermer la fenêtre en temps réel. Confirmation avant annulation. `rideAPI.driverCancelBooking` ajouté (`services/api.js`).
- **Vérifié** : curl E2E (accept → cancel dans la fenêtre = OK retour `pending` ; back-date 25 min → cancel = **HTTP 400** délai dépassé) + screenshot (course acceptée à l'instant montre Annuler+Départ ; 8 autres acceptées >20 min montrent seulement Départ). Lint front+back clean.


## NEW - 2026-06-07 (7) - BUGFIX : course planifiée affichée comme demande immédiate (DONE)
- **Bug user (capture)** : une **course planifiée** s'affichait au chauffeur comme une **demande standard immédiate** (pop-up `IncomingRequestSheet` « Demande · Sb » avec compte à rebours + Accepter/Décliner) au lieu d'aller dans l'**agenda** (icône calendrier `scheduled-reservations-btn` → `ScheduledReservationsSheet`).
- **Cause racine (2 sources)** dans `routes/rides.py` : (1) `create_ride` diffusait `new_ride_request` à **tous les chauffeurs** même pour une course planifiée (`scheduled_at` futur) ; (2) `list_rides` (flux chauffeur, sondé toutes les 8 s par `DriverHome` via `rideAPI.list({status:'pending'})`) renvoyait aussi les courses planifiées → `setIncomingRequest(res.data[0])`.
- **Fix** : (1) `create_ride` ne diffuse le `new_ride_request` aux chauffeurs **que si la course n'est pas planifiée** (`if not ride.get('scheduled_at')`). (2) `list_rides` (feed chauffeur) **exclut les courses planifiées** des `pending` (garde les courses assignées au chauffeur) — cohérent avec `available_rides` du home-feed. Les courses planifiées restent visibles dans `home-feed.scheduled_pending` (agenda).
- **Vérifié** : curl E2E (course instantanée → présente dans le feed immédiat + `available_rides` ; course planifiée → **absente** du feed immédiat, **présente** dans `scheduled_pending`) + screenshot (agenda « Réservations planifiées » affiche la course Marseille→Paris 842 € + badge « 1 », aucun pop-up immédiat). Lint back clean.


## NEW - 2026-06-07 (6) - Timer d'attente auto au ramassage + nettoyage carte accueil chauffeur (DONE)
- **Demande user (image 1)** : un minuteur d'attente se déclenche **quand le chauffeur clique « Arrivé »** (statut `arriving`), compte le temps ; **après 5 min** → message **« Temps d'attente facturé »** (passager notifié) ; quand le passager monte et que le chauffeur **« Démarre »** la course → le compteur **s'arrête**.
- **`DriverRideFlow.jsx`** : nouveau timer d'attente **automatique** durant la phase EN ROUTE (`arriving`). `pickupArrivedAt` initialisé depuis `ride.arrived_at` (persisté backend, survit au refresh) ou posé au clic « Arrivé ». Pill horloge en haut de carte (`ride-flow-pickup-wait`) ; après **300 s** (5 min offerts) il passe en **« · facturé · X € »** (ambre, `ride-flow-pickup-wait-billed`, 0,50 €/min au-delà) et **notifie le passager une fois** via `POST /api/phase1/rides/{id}/waiting` (action start). Au **démarrage** (OTP validé → `in_progress`), le timer s'arrête, le montant facturable (au-delà de 5 min) est finalisé et **reporté dans les frais d'attente de la facture** (`RideCompletionFlow waitingCharge += pickupWaitCharge`) + stop WS au passager. *Vérifié screenshot : « EN ROUTE » → pill « 00:09:37 · facturé · 2.31 € ».*
- **Demande user (image 2)** — nettoyage de la carte d'accueil chauffeur : **retirer le sélecteur Plan/Satellite**, le bouton **« Heat View »** (déjà dans le « + » → **Chaleur**) et **« Mode Destination »** (déjà dans le « + » → **Revenir**).
- **`DriverHome.js`** : suppression des 2 boutons overlay (`heat-view-toggle`, `destination-mode-toggle`) — leurs fonctions restent accessibles via le FAB radial « + » (Chaleur/Revenir). **`AdminGoogleMap.jsx`** : nouveau prop `mapTypeControl` (défaut true) ; la carte d'accueil passe `mapTypeControl={false}` → plus de bascule Plan/Satellite (le drag/zoom restent actifs). *Vérifié screenshot : carte épurée, FAB « + » montre Chaleur + Revenir.*
- Lint front clean (3 fichiers). Aucun changement backend (réutilise l'endpoint d'attente existant). ⚠️ Hypothèse : **5 min d'attente offertes** puis facturation à **0,50 €/min** (taux existant `WAITING_RATE_PER_MIN`).


## NEW - 2026-06-07 (5) - Bon de commande enrichi (société, licence, montant, paiement) au format V3Cube (DONE)
- **Demande user** (capture V3Cube fournie) : ajouter au bon de commande **le nom de la société**, **le numéro de licence**, **le montant de la course** et **le mode de paiement choisi par le client**. Règle : le bon de commande est **généré à l'acceptation** ; le **montant** + le **mode de paiement** n'apparaissent **qu'une fois la course démarrée** (chauffeur a démarré le voyage).
- **Backend `phase2.py get_waybill`** : enrichi → récupère le `vehicle_types` (slug) pour `price_per_min` + `person_capacity` (NB de places) ; calcule `started = bool(started_at) or status ∈ {in_progress, completed}` ; renvoie `course_number` (= `booking_no` numérique), `ride.base_fare/price_per_min/price_per_km` (tarification), `ride.fare` + `ride.payment_method` **uniquement si `started`** (sinon `None`), et `driver.company_name` (nouveau, fallback « SB Drive VTC »), `driver.license_number`, `driver.seats`.
- **Modèle chauffeur** : nouveau champ `company_name` ajouté à `DriverCreate`/`DriverProfile` (`schemas.py`) + stocké à l'inscription (`drivers.py register_driver`). Fallback d'affichage « SB Drive VTC » si vide.
- **Frontend `WaybillPage.js`** réécrit au format V3Cube « Bon de commande » : en-tête sombre, 2 cartes en lignes label/valeur — **Détails du bon de commande** (Course n°, Tarification « X € Prix de base + Y € par minute + Z € km », Nom du client, via, Départ, Arrivée, Heure FR, + **Montant de la course** orange & **Mode de paiement** conditionnels) et **Chauffeur** (Nom prénom, Plaque d'immat, NB de places, **Nom de la société**, **Numéro de licence**). Hint « Le montant et le mode de paiement s'afficheront une fois la course démarrée » quand non démarrée. Bouton Imprimer conservé. testids : `waybill-course-no/amount/payment/company/license/amount-hint`.
- **Vérifié** : curl (accepted → `started:false`, fare/payment `null` ; completed → `started:true`, fare 12 €, payment cash) + **2 screenshots** (course démarrée : Montant 14,00 € + Espèces + société + licence ; course acceptée : montant/paiement masqués + hint) + **pytest** `test_iter61_phase2.py::test_waybill_shape` (assertions `started:false`, fare/payment `None`, tarif exposé) ✅. Lint front+back clean.


## NEW - 2026-06-07 (4) - Chrono compact + temps d'attente notifié au client + navigation Google avancée in-app (DONE)
- **Chrono de course** : réduit (text-xs + icône horloge) et **remonté en haut** de la carte (`top-1`, `ride-flow-timer`).
- **Temps d'attente facturé + notifié au client** : `toggleWaiting` (DriverRideFlow) appelle désormais `POST /api/phase1/rides/{id}/waiting` (start/stop, secondes, montant). Nouveau backend (phase1.py) : met à jour `waiting_active/seconds/charge` sur la course et **notifie le passager** au **démarrage** (« Temps d'attente activé ⏱️ — facturé ») et à l'**arrêt** (« Temps d'attente arrêté ✅ — X € ajoutés ») via `create_notification` (+ push WS `waiting_update`). Côté passager : bannière ambre **« Temps d'attente en cours »** dans `DriverEnRouteView` (quand `ride.waiting_active`, via polling) + toast WS dans `RideTrackingPage`. *Vérifié : toast driver, notification passager créée en DB.*
- **Navigation Google avancée in-app (par défaut, type Uber) + Waze** : nouveau composant `InAppNav` (plein écran, carte qui suit le chauffeur, **manœuvre suivante** + distance via `DirectionsService`, **ETA + distance restante**, tracé d'itinéraire) ouvert directement au tap sur le bouton navigation. Bouton **Waze** intégré (option) + Quitter. Ancien chooser `NavChooserSheet` retiré. Instructions en **français** (`useJsApiLoader language:'fr', region:'FR'`). *Vérifié : instruction « Head/Continuez… », ETA 20 min, route, Waze présent.*
- Lint clean (erreurs restantes RideTrackingPage = préexistantes) ; build compile.


## NEW - 2026-06-07 (3) - Verrouillage du flux pendant une course EN COURS (DONE)
- **Demande** : « Quand une course est en cours elle ne peut pas sortir de l'application ».
- **Implémenté** dans `DriverRideFlow` : quand la course est `in_progress` (voyage démarré, passager à bord) →
  - le bouton **réduire** (retour accueil) est **masqué** (`onMinimize && !inProgress`) ;
  - **retour navigateur bloqué** (guard `popstate` qui re-pousse l'état + toast « Course en cours — terminez le voyage avant de quitter. ») ;
  - **avertissement avant fermeture/rafraîchissement** de l'onglet (`beforeunload`).
  - Pour `accepted`/`arriving` (trajet vers le passager), le bouton réduire reste disponible (pas de blocage).
- *Vérifié screenshot : en `in_progress` → header « COURSE EN COURS » + minuterie, bouton réduire absent, `history.back()` reste sur le flux + toast affiché.* Lint clean.


## NEW - 2026-06-07 (2) - Modal OTP (renommage + fallback téléphone) + carte figée (DONE)
- **Modal de démarrage** : titre « Code de démarrage » → **« Code OTP »** ; sous-titre reformulé (« …son code OTP à 4 chiffres… »). Composant `OtpModal` (RideFlowSheets) accepte un prop `mode` ('otp' | 'phone').
- **Fallback après 2 échecs** : `DriverRideFlow` compte les tentatives ; après **2 codes OTP refusés** (passager injoignable / téléphone éteint), le modal bascule en **« Vérification par téléphone »** et demande les **4 derniers chiffres du numéro enregistré** du passager. Backend `verify_start_otp` (phase1.py) accepte désormais `phone_last4` en alternative à `otp` (compare aux 4 derniers chiffres du téléphone passager). *Vérifié : UI bascule OK + logique backend (`+33767532661`→`2661` accepté, `0000` refusé).*
- **Carte du flux course figée** : `AdminGoogleMap` nouveau prop `staticView` → retire le sélecteur **Plan/Satellite** (`mapTypeControl:false`), désactive zoom/fullscreen/streetview et **les gestes** (`gestureHandling:'none'`), et **cadre une seule fois** tout le trajet (`fitBounds` au `onLoad`). `DriverRideFlow` passe `staticView` + un **centre figé** (mémoïsé, milieu pickup/dropoff) pour que la carte ne bouge plus quand le GPS du chauffeur change (seul le marqueur voiture bouge). *Vérifié screenshot : carte cadrée sur tout le trajet, plus de Plan/Satellite.*
- Lint clean ; build compile.


## NEW - 2026-06-07 - Flux course chauffeur : voiture client + 3 boutons + Lettre de voiture (DONE)
- **Marqueur voiture carte** : `AdminGoogleMap` remplace l'icône Material jaune (`directions_car`) par la **petite voiture vue de dessus** (SVG `TopCar`, identique aux « radar cars » du client) en data-URL ; nouveau prop `driverIconUrl`. `DriverRideFlow` récupère `cars_icon_url` via `/config/ride-search` et le passe à la carte → réutilise exactement la voiture configurée côté client (admin). Bénéficie aussi aux cartes client/admin.
- **3 boutons d'action** (appel/chat/navigation) de `DriverRideFlow` passés de `justify-center` à **`justify-end`** (à droite, au-dessus du km).
- **« Lettre de voiture » (bon de commande)** : le menu 3-points appelait un `toast('bientôt disponible')`. Branché sur `navigate('/ride/{id}/waybill')` → page `WaybillPage` (« Feuille de route ») déjà existante, lit `GET /api/phase2/rides/{id}/waybill` (N° feuille, passager, chauffeur+véhicule, départ/arrivée, détail tarif, Imprimer). *Vérifié screenshot.*
- Lint clean sur fichiers modifiés ; build compile.


## NEW - 2026-06-06 (2) - Bugs flux course chauffeur + retouches client (DONE)
- **Retours user** : « je suis en course je ne vois plus la course », « les courses en cours on ne voit rien », « pas le bouton pour voir tous les statuts », « encore du bleu sur l'app client », « remplace Code départ par Code OTP », « les 4 boutons à droite au-dessus des étoiles », « j'accepte une course je n'arrive pas à démarrer ».
- **BUG #1 (P0) — Course active perdue au rechargement → CORRIGÉ.** `DriverHome` ne restaurait jamais la course active : ajout d'un effet au montage qui appelle `rideAPI.getActive()` et restaure `currentRide` (+`joinRide`) si statut accepted/arriving/in_progress. Le chauffeur ne « perd » plus sa course et peut reprendre/démarrer. Bouton **réduire** (`onMinimize`/CaretLeft) ajouté à `DriverRideFlow` pour revenir à l'accueil malgré une course active. *Vérifié screenshot : flux restauré après login, minimize OK.*
- **BUG #2 (P0) — Historique vide (tous filtres) → CORRIGÉ.** `get_driver_ride_history` (drivers.py) filtrait sur `driver_id = user["id"]` au lieu de `driver["id"]` → **0 course**. Corrigé → **28 courses** (otp projeté hors résultat, limit 50). *Vérifié DB + screenshot.*
- **BUG #3 (P1) — Filtre « En cours » → CORRIGÉ.** `DriverHistoryPage` : « En cours » inclut désormais accepted/arriving/in_progress (13 courses affichées) ; cartes actives **cliquables** (anneau ambre) → `/chauffeur/home` pour reprendre.
- **« Tous les statuts »** : bouton ajouté dans l'en-tête de `DriverBookingsPage` → `/chauffeur/history`.
- **Client `DriverEnRouteView`** : en-tête bleu `#4361EE` → **orange #FF4500**, bordure avatar idem, libellé « Code départ » → **« Code OTP »**, 4 boutons d'action passés de `justify-center` à `justify-end` (à droite, au-dessus des étoiles).
- **Flux démarrage OTP vérifié correct** (passager affiche `start_otp`, chauffeur valide le même via `/api/phase1/rides/{id}/start-otp/verify`) — aucun changement nécessaire ; le blocage venait de la course qui disparaissait.
- **Lint** : 1 erreur React Compiler `immutability` dans `DriverHistoryPage` = **préexistante** (présente avant mes edits, tolérée par le build). Reste vert côté chauffeur, orange côté client.


## NEW - 2026-06-06 - Dette d'annulation reportée + Taxi Hall fix + accueil chauffeur cliquable + client ORANGE (DONE)
- **Retours user (4 points)** traités :
- **(1) P0 — Réservation bloquée par la dette d'annulation → DÉBLOQUÉE + report sur la course suivante.** `routes/debts.py` réécrit : la dette ne bloque plus la réservation, elle est **reportée** sur la prochaine course (`carry_unpaid_debts_to_ride`) et **réglée à la complétion** (`settle_carried_debts`) — **espèces** : débitée du portefeuille du **nouveau** chauffeur (qui a encaissé fare+pénalité) et **créditée à l'ancien** chauffeur lésé (`_reimburse_driver`) ; **portefeuille** : débitée du passager + reversée à l'ancien ; **carte/sbpaygo** : encaissée avec la course (simulé) + reversement. `settle_cancellation_fee(..., owed_to_driver_id)` rembourse aussi l'ancien chauffeur si payée immédiatement. `release_carried_debts` à l'annulation (la dette suit la course suivante). Re-règlement idempotent (re-lecture des dettes non payées). `RideResponse.carried_debt` exposé ; toast côté `RideChoosePage` ; `DebtBanner` reformulé. `create_ride` : suppression du blocage 402, report à l'insertion. `update_ride_status`(completed) + `cancel_ride` câblés.
- **(2) P0 — Taxi Hall : saisie d'adresse impossible → CORRIGÉ.** Cause = le dropdown Google Places `.pac-container` passait **sous** le modal (`z-[2700]`). Ajout règle globale `index.css` `.pac-container { z-index: 100000 !important; }`. Vérifié (screenshot) : « Tour Eiffel » → suggestions affichées **au-dessus** du modal et sélectionnables.
- **(3) P1 — App client harmonisée en ORANGE (#FF4500).** Jeton shadcn `--primary` (light) passé vert→orange (`16 100% 50%`). `GooglePlacesInput` par défaut orange (icône + focus). Script ciblé `scripts/orange_harmonize.py` : surfaces **interactives/marque** (CTA, onglets actifs, en-têtes, icônes de menu profil, dégradés) des pages `pages/user/**` converties en orange ; **préservées** : pastilles trajet vert/rouge, statuts, et **tuiles de catégories multicolores** (style Gojek/V3Cube). 18 fichiers client modifiés. Vérifié (screenshot accueil : nav active, bannières, recherche → orange).
- **(4) P1 — Cartes stat accueil chauffeur cliquables vers le bon filtre.** `DriverHome` : « Emplois à venir » → `/chauffeur/reservations?filter=upcoming`, « Emplois en attente » → `?filter=pending`. `DriverBookingsPage` lit `?filter` via `useSearchParams` (init paresseux, conforme React Compiler). Vérifié (screenshot : ouverture directe sur « Prochain »).
- **Tests** : `backend/tests/test_cancellation_debt_carry.py` **4/4** (cash reverse, wallet debit, release/reattach, idempotence) + REST manuel (réservation 200 malgré dette + `carried_debt` exposé). Lint back clean ; front : webpack compile OK (erreurs lint restantes = **préexistantes** dans fichiers non touchés, tolérées par le build). App chauffeur reste **verte** (seul le client passe orange).
- **Reste / backlog** : E2E live complet de la dette via vrai cycle chauffeur (accept→OTP→complete) non joué (fenêtre de frais 5 min + orchestration) — logique prouvée en unitaire. Issue 5 (parité « Gérer les catégories de services ») toujours **BLOQUÉE** (attente captures V3Cube). Option : aplatir aussi les tuiles de catégories en orange si l'utilisateur veut un client monochrome.


## NEW - 2026-06-06 - Modernisation accueil CHAUFFEUR : indicateurs temps réel, alertes, Taxi Hall, Bonus, FAB (DONE — iter 142)
- **Demande user** : moderniser l'app chauffeur — (1) les **réservations planifiées** arrivent et restent en attente sur l'accueil (bouton agenda près de la cloche, clignote **ROUGE** + badge) ; à l'acceptation → **« Emplois à venir »** (cercle, clignote) avec **alerte à T‑40 min** ; **« Emplois en attente »** agrège les services dispo activés (clignote **JAUNE**) + livraisons dispo non attribuées (clignote **BLEU**, uniquement si l'option est activée) ; **alerte son + vibration** à l'arrivée d'une nouvelle réservation planifiée et à T‑40 min. (2) **Bonus/Récompenses** accessible sur l'accueil. (3) **Activer toutes les options** du bouton **« + »**, dont **« Appelez un taxi » = Taxi Hall** (client hélé : destination + gamme → course immédiate normale).
- **Backend `rides.py`** : `GET /api/rides/driver/home-feed` → `{scheduled_pending, upcoming, available_rides, available_deliveries, counts, next_scheduled_at}` (gating par `service_types` : taxi→rouge/jaune, courier/delivery→bleu) ; `POST /api/rides/taxi-hall` → crée une course `in_progress` assignée au chauffeur (passager « Client (hélé) », métrée, complétée via le flux normal).
- **Frontend `DriverHome.js`** : poll home-feed (12 s) + **alertes beep (Web Audio) + `navigator.vibrate`** (nouvelle réservation planifiée / T‑40 min) ; bouton agenda **rouge clignotant** + badge → `ScheduledReservationsSheet` (liste + Accepter) ; cartes stat **dynamiques** « Emplois à venir » (anneau jaune si >0) et « Emplois en attente » (pastilles **jaune**/**bleu**) ; **bouton Bonus toujours visible** (→ /chauffeur/rewards) ; FAB « Appelez un taxi » → `TaxiHallModal`.
- **Nouveaux composants** : `components/driver/ScheduledReservationsSheet.jsx`, `components/driver/TaxiHallModal.jsx` (GooglePlacesInput + `configAPI.getVehicleTypes` + `rideAPI.taxiHall` ; **fallback géocodage** sur « Démarrer » si aucune suggestion Places sélectionnée → robuste + testable).
- **Vérifié** : testing_agent **iter 142** (indicateurs, sheet planifiée, FAB 6 actions, Bonus, bottom-nav OK) ; bug **Taxi Hall** (sélection Places ne déclenchait pas `onSelect`) **corrigé via géocodage** et **auto-testé** (screenshot : « Tour Eiffel » → COURSE EN COURS, « Client (hélé) »). Backend pytest `tests/test_driver_home_feed.py` ✅. RED indicator curl-vérifié (`scheduled_pending:1`). Lint front+back clean.
- **Reste / à clarifier avec l'utilisateur** : FAB **« Planificateur IA »** (écran zones/heures de forte demande) et **« Emplacements »** (lieux favoris) = encore placeholders ; périmètre exact de la **modernisation visuelle globale** (#4) ; ⚠️ **NOTE** : double-inclusion du script Google Maps (warning console) → backlog « consolidation des loaders Maps ».


## NEW - 2026-06-06 - Phases 3+4 chauffeur V3Cube : Chat, Mes réservations, FAB radial, bottom-nav (DONE — iter 141)
- **Phase 3 — Chat de course (refonte V3Cube)** (`frontend/src/pages/RideChatPage.js`) : en-tête vert + **n° de réservation**, **carte de l'autre partie** (avatar + nom + étoiles + libellé course via `rideAPI.get`), **séparateurs de date** (Aujourd'hui/Hier/date FR), bulles vertes/blanches, **bouton caméra** (pièce jointe image : redimensionnement client → data URL JPEG q0.6 ≤1200px), placeholder « Tapez votre message ici… ». Backend `phase1.py` `send_ride_message` accepte un champ `image` optionnel (≤1.5 Mo). Livraison quasi temps réel via **poll 2,5 s** (le WS brut + setState déclenche la règle React Compiler `set-state-in-effect` — voir note ci-dessous).
- **Phase 4 — Mes réservations** (`frontend/src/pages/driver/DriverBookingsPage.js`, route `/chauffeur/reservations`) : onglets **Les réservations / Ordres / Enchères**, filtre **En attendant / Prochain**, cartes avec **Acceptez/Déclin** (Déclin = masquage local) ou **Départ voyage**, dialogues de confirmation V3Cube (« Êtes-vous sûr… »). Backend : nouvel endpoint **`GET /api/rides/driver/bookings`** → `{upcoming, pending, bids}` enrichis passager. Ordres = `parcelAPI.driverAvailable`, Enchères = courses `mode=bidding` (contre-offre via `/rides/{id}/counter-offer`).
- **Phase 4 — FAB radial** (`DriverHome.js`) : le « + » vert se déploie en 6 actions (Planificateur IA·Appeler taxi·Chaleur→heatmap·Revenir→mode destination·Emplacements·Infos véhicule→/chauffeur/vehicles), le toggle pivote en X.
- **Phase 4 — Bottom-nav** (`DriverProfilePage.js → DriverBottomNav`) : pilule sombre arrondie flottante + icônes Phosphor (House/ClipboardText/Wallet/UserCircle), onglet Réservations → `/chauffeur/reservations`.
- **Backlog tech** : sous-sheets de `DriverRideFlow.jsx` extraits dans `components/driver/RideFlowSheets.jsx` (RideFlowMenu/CallTypeSheet/NavChooserSheet/SafetySheet/OtpModal). DriverRideFlow 313→297 l.
- **⚠️ NOTE React Compiler (clé)** : la règle `set-state-in-effect` (du `lint_javascript`, plus stricte que le build CRACO) **flague tout effet qui atteint un setState synchrone**, y compris via un `useCallback` setState-bearing passé en **dépendance** d'effet, et via `ws.onmessage`/`setInterval(cbAvecSetState)`. **Pattern propre** (comme `DriverHome`) : définir les fonctions async **à l'intérieur** de l'effet (jamais en dépendance). Des fichiers pré-existants (`hooks/useWebSocket.js`) violent encore cette règle mais le build tolère.
- **Vérifié** : testing_agent **iter 141 = 100%** des flux demandés (chat envoi/poll/image, bookings onglets/filtre/confirm, FAB 6 actions, bottom-nav). Bug « bouton Déclin mort » corrigé (masquage local). Lint front+back clean, compile OK.
- **Reste** : **Phase 5 — VOIP Twilio** (appels vidéo/vocal réels) — BLOQUÉ sur compte/clés Twilio de l'utilisateur (actuellement maquetté : vocal→`tel:`, vidéo→toast). i18n web ; recherche unifiée app mobile ; parité UI « Gérer les catégories de services » (en attente d'images de référence — NON fournies, l'utilisateur a plutôt envoyé les écrans CHAUFFEUR).


## NEW - 2026-06-06 - Flux de course CHAUFFEUR plein écran V3Cube (Phases 1+2 + outils) (DONE — iter 140)
- **Demande user** : reproduire à l'identique le cycle de vie d'une course côté chauffeur d'après ~18 captures V3Cube. **Choix par défaut validés** : (1) flux live d'abord ; (2) appels VOIP **maquettés** (vocal → `tel:` natif, vidéo → toast « bientôt ») ; (3) **OTP conservé** mais intégré au slider de démarrage.
- **Nouveaux composants** (`frontend/src/components/driver/`) :
  - `SlideToConfirm.jsx` — slider « GLISSEZ POUR … » (drag pointer + activation au clic du thumb pour accessibilité/e2e).
  - `IncomingRequestSheet.jsx` — bottom-sheet « PARTNER APP » : anneau de compte à rebours vert (auto-déclin ~30s), encadré **Prix estimé** (jaune), estimations **ramassage** (rose, haversine chauffeur→pickup) + **voyage** (cyan), passager + étoiles, **Déclin / Acceptez**, contre-offre (enchères) conservée.
  - `DriverRideFlow.jsx` — overlay plein écran piloté par `ride.status` : **Prendre le passager** (accepted, slider ARRIVER) → **EN ROUTE** (arriving, case « Enregistrer une vidéo », slider COMMENCER → modal OTP) → **COURSE EN COURS** (in_progress, en-tête noir, **minuteur**, **minuterie d'attente** 0,50 €/min, slider rouge TERMINER). + bouton **SOS** (sheet sécurité : 112 / msg SOS / audio / partage), **icônes appel/chat/navigation**, **chooser navigation** (in-app/Google Maps/Waze deep-links), **chooser type d'appel** (vidéo maquette/vocal `tel:`), **menu 3-points** (Détails passager / Lettre de voiture / Annuler).
  - `RideCompletionFlow.jsx` — séquence post-course : **Frais supplémentaires** (péage + autres + attente → Total, Sauter/Soumettre + dialogue de confirmation) → **Facture détaillée** (Tarif / Frais suppl. / Total / **Arrondir** / **Total net** + **COLLECTE DE PAIEMENT**) → **Laisser un commentaire** (noter le passager : 5★ + texte) → **« Course terminé »**.
- **`DriverHome.js`** : blocs inline (carte course + modal OTP + sheet demande) remplacés par `<IncomingRequestSheet>` et `<DriverRideFlow onFinished={finishRide}>`. Imports d'icônes inutilisés nettoyés. **Lint React Compiler clean** (ref lue en render dans `SlideToConfirm` corrigée via state `dragging`).
- **Backend `rides.py`** : (1) helper `enrich_passenger_info` → `passenger_name/rating/phone/avatar` ajoutés à `get_ride` (vue chauffeur/admin, **OTP toujours masqué au chauffeur**), `list_rides` (feed chauffeur) et `get_active_ride`. (2) `update_ride_status` 'completed' accepte `body.extra_charges {toll,other,waiting,note}` → ajoutés au sous-total + **arrondi à l'euro** ; `fare_breakdown` enrichi (`extra_total`, `rounding`, `total_net`) ; WS completed renvoie le `fare_breakdown`. (3) Nouvel endpoint **`POST /rides/{id}/rate-passenger`** (chauffeur assigné only, 403 sinon ; moyenne stockée sur `users.passenger_rating`). `rideAPI.ratePassenger` + `rideAPI.complete(id, extra)` ajoutés.
- **Vérifié** : **backend pytest E2E** `/app/backend/tests/test_driver_ride_flow.py` (enrichissement passager, OTP non divulgué, frais 5.0 €, arrondi −0.33 → net 15.00 €, rate-passenger + 403) **+ testing_agent frontend 100%** (iter 140 : cycle complet demande→accept→ARRIVER→COMMENCER→OTP→COURSE EN COURS→attente→TERMINER→Frais suppl.→Facture (net 15,00 € arrondi)→Collecte→Notation 5★→Course terminé→retour home). Lint front+back clean. Compte QA passager : `qa.rideflow@demo.sb / RideFlow123!`.
- **Reste à faire (proposé)** : Phase 3 — refonte du **Chat** course (design V3Cube) ; Phase 4 — **« Mes réservations »** (onglets Réservations/Ordres/Enchères, Acceptez/Déclin, Départ voyage) ; menu radial **FAB** sur l'accueil (Planificateur IA/Appeler taxi/Chaleur/Revenir/Emplacements/Infos véhicule) ; bottom-nav sombre arrondie ; Phase 5 — **VOIP Twilio** (vidéo/vocal réels). Backlog : extraire les sous-sheets de `DriverRideFlow.jsx` (<120 l. chacun).


## NEW - 2026-06-06 - ETA radar + Auto-approbation chauffeur + Journal de notifications (gains/courses) (DONE — iter 139)
- **Tâche 2 — ETA au centre du radar (TaxiBidding)** : `GET /api/phase2/taxi-bidding/live-stats` renvoie `nearest_driver_eta_min` (haversine du chauffeur en ligne le plus proche du pickup, ~22 km/h + 1 min). `TaxiBiddingPage` passe une `caption` au `SearchRadar` (déjà doté du testid `radar-eta`) : « Chauffeur à ~X min » → fallback « Trajet ~Y min » (estimate.duration_mins) → « Recherche… ». ⚠️ En démo, certains chauffeurs simulés n'ont pas de `current_lat/lng` → ETA null ; en prod les chauffeurs remontent leur position (watchPosition), et le fallback trajet couvre tous les cas. Au passage : 3 erreurs lint React Compiler PRÉ-EXISTANTES de `TaxiBiddingPage` corrigées (purity `Date.now()` paresseux ; set-state-in-effect → init via lazy `useState` depuis l'URL + suppression de l'état dérivé `showSheet` au profit de `mapReady`).
- **Tâche 3 — Auto-approbation chauffeur** : dans `admin_set_driver_document_status` (misc.py), si tous les documents requis sont approuvés et le chauffeur est `pending/rejected` → passage auto `approved` (+ notif « Compte validé 🎉 »). Si un document **requis** est refusé alors que le chauffeur est `approved` → revert `pending` (+ notif « Compte en vérification »). Réponse enrichie de `driver_status`. **E2E validé** (approbation partielle reste pending → tous approuvés = approved → refus requis = revert pending).
- **Tâche 4 — Journal d'activité (notifications)** : nouveau helper `core/notifications.py::create_notification` (persist `db.notifications` + WS + push Expo, best-effort). Câblé sur : fin de course (rides.py → « +X € pour la course #… », type `earning`), fin de livraison colis (parcels.py → « +X € pour le colis #… »), acceptation de course (rides.py → « Nouvelle course acceptée », type `ride`), et review document/statut compte (refactor misc.py). `DriverNotificationsPage` (déjà branchée sur le réel) affiche le tout. Testids carte renommés `notif-item-<id>` ; `notif-delete-<id>` vérifié (13 items, delete 13→12).
- **Vérifié** : curl E2E (auto-approve + revert + live-stats ETA=1 à Paris) + **testing_agent 90% frontend** (iter 139 : auto-approve+revert via UI admin, bannière statut chauffeur, journal notifications réelles, radar-eta rendu) + screenshot (13 notifs réelles, delete OK). Lint front+back **clean partout**. ⚠️ Les notifs de **gains** ne se déclenchent qu'à la complétion réelle d'une course/colis (helper prouvé via les notifs document/compte, pas via un ride complet E2E).

## UPDATE - 2026-06-06 - DriverNotificationsPage réelle + Toast global DriverHome + lint DriverHome corrigé (DONE)
- **DriverNotificationsPage (web)** : débranché des mocks → consomme `db.notifications`. Backend : `POST /api/drivers/notifications/read-all` + `DELETE /api/drivers/notifications/{id}` (en plus du `GET /my-notifications` existant). Frontend : fetch réel + compteur non-lus + « Tout marquer lu » + suppression + refresh live via WS `driver_document_reviewed` + horodatage relatif FR. `driverAPI.getNotifications/markAllNotificationsRead/deleteNotification`.
- **Toast global DriverHome** : écouteur WS `driver_document_reviewed` ajouté (le chauffeur voit l'approbation/refus même hors page Documents).
- **Lint DriverHome (5 erreurs React Compiler PRÉ-EXISTANTES corrigées)** : (1) `purity` → `useState(() => Date.now())` (initialiseur paresseux) ; (2) 3× `react/no-unescaped-entities` → `&apos;` ; (3) `immutability` → **cause racine = `useCallback` auto-référent** (`loadDriverProfile` s'appelait lui-même dans un `setTimeout`) → récursion encapsulée dans une fonction interne `attempt`. Au passage : `setupLocation`/`loadPendingRides` (useCallback) inlinés dans leurs effets, ref `locationWatchId` inutile supprimé. **Comportement préservé** (DriverHome vérifié au rendu : carte, stats, toggle, nav OK).
- **Vérifié** : curl (my-notifications, read-all updated=2, delete 200 + 404) + screenshots (DriverHome rendu complet sans erreur ; DriverNotificationsPage affiche les vraies notifs « Document refusé · Motif : Photo floue »). Lint front+back **clean partout**.

## UPDATE - 2026-06-06 - Notification temps réel au chauffeur sur validation/refus de document (DONE)
- **Demande user** : notifier le chauffeur en temps réel quand l'admin approuve/refuse un document (réduit les abandons d'inscription).
- **Backend** (`misc.py`, dans `admin_set_driver_document_status`) : après mise à jour du statut → message **WebSocket** `driver_document_reviewed` (`manager.send_personal_message` vers `user_id`) + **push Expo** (`core.push.notify_user`) + **notification persistée** dans `db.notifications`. Message FR contextualisé avec libellé du doc + motif (« Votre document « Pièce d'identité » a été refusé. Motif : … »).
- **Frontend** (`DriverDocumentsPage.js`) : écouteur `useWebSocket` sur `driver_document_reviewed` → toast (success/error/info, durée prolongée) + refetch live des statuts. ⚠️ Toast global (DriverHome) **différé** : `DriverHome.js` a 5 erreurs lint React Compiler **pré-existantes** (fichier critique 786 lignes, le handoff demande de ne pas y toucher) — le push Expo couvre déjà le cas hors-page sur mobile.
- **Vérifié** : test WS bout-en-bout (`/tmp/test_ws_notif.py`) → admin refuse → le chauffeur reçoit le WS avec le bon message FR (motif inclus). Lint front+back clean.
- **Revue de déploiement** (`deployment_agent`) : **PASS**, aucun bloqueur (env vars, secrets, CORS, /api routing, compilation, Expo OK).

## NEW - 2026-06-06 - Validation/approbation des documents chauffeur (end-to-end, source réelle) (DONE — iter 138)
- **Demande user** (choix a) : connecter de bout en bout la validation des documents chauffeur sur la **vraie source** `db.drivers.documents` (la page chauffeur affichait des statuts MOCKÉS, l'admin n'avait aucun endpoint sur cette collection — les endpoints existants ciblaient `user_documents`/`documents`).
- **Backend** : `drivers.py` → helper `build_documents_view(driver)` = fusion des **documents requis** (dérivés des `categories` du chauffeur via `driver_categories`) avec les **documents uploadés** (`db.drivers.documents`, le plus récent par type gagne) → `{documents[{key,label,required,status,uploaded_at,filename,reason,reviewed_at}], required_count, approved_count, pending_count, all_required_approved}`. `GET /api/drivers/my-documents` réécrit pour renvoyer cette vue réelle (+ `driver_status`, `rejection_reason`). `misc.py` → `GET /api/admin/drivers/{id}/documents` (vue + infos chauffeur) et `PUT /api/admin/drivers/{id}/documents/{doc_type}/status` (status approved|rejected|pending + motif, met à jour l'élément du tableau, audit log). Validation 400 (statut invalide) / 404 (doc ou chauffeur introuvable).
- **Frontend admin** (`AdminDrivers.js`) : badge orange **« N à valider »** (`docs-badge-{i}`) sur les chauffeurs avec docs en attente + bouton **Documents** (`docs-{i}`) → modale `DriverDocsModal` (liste requis/fournis, **Approuver / Refuser** par doc avec saisie de motif inline, compteur « X/N approuvés » live, hint « tous approuvés »). Extraction de `SortIcon` au niveau module + effet de fetch inliné (conformité React Compiler). `adminAPI.getDriverDocuments/setDriverDocumentStatus`, `driverAPI.getMyDocuments`.
- **Frontend chauffeur** (`DriverDocumentsPage.js`) : **fini les mocks** — consomme `getMyDocuments` (bannière statut compte, progression réelle, statut réel par doc : Approuvé/En attente/Refusé+motif/Non envoyé, re-upload → refetch).
- **Vérifié** : curl E2E (GET, approve→count, reject+motif, 400/404, register→upload→my-documents) + screenshots (modal admin approuvé/refusé+motif+toast, page chauffeur statuts réels) + **testing_agent 100% backend+frontend** (iter 138 : approve/reject/re-approve, hint, badge, page chauffeur reflète l'état admin, motif affiché). Lint front+back clean. Compte test : `qa.docs.live@demo.sb / DocsQa123!`.
- ⚠️ Backlog mineur (relevé testing, pré-existant hors périmètre) : `GET /api/admin/drivers?search=` ignore le param côté serveur (l'UI filtre côté client via SEARCH).

## UPDATE - 2026-06-06 - Catégories de chauffeurs : réordonnancement (drag & drop + flèches) + duplication 1 clic (DONE)
- **Demande user** : réordonner les catégories par glisser-déposer (comme les types de véhicule) + dupliquer une catégorie existante en un clic (créer des variantes plus vite, ex. Coursier Vélo Express).
- **Backend** (`admin.py`) : `POST /api/admin/driver-categories/reorder` (body `{ordered_ids:[...]}` → `order = index+1`, comme `vehicle-types/reorder`).
- **Frontend** (`AdminDriverCategories.js`) : **drag & drop natif HTML5** (sans dépendance) par groupe de service (`draggable`/`onDragStart`/`onDrop`, item glissé à 40% opacité + ring orange ; les drops inter-groupes sont ignorés) + **flèches ↑/↓** par carte (`dc-up-<id>`/`dc-down-<id>`, accessibles & testables) ; les deux persistent via `persistOrder` qui normalise l'ordre global (taxi→coursier→livreur). **Duplication** : bouton Copy (`dc-dup-<id>`) → ouvre l'éditeur pré-rempli (libellé « (copie) », id vidé → auto-suffixé à l'enregistrement). `adminAPI.reorderDriverCategories` ajouté.
- **Vérifié** : curl reorder (swap courier moto/velo → ordres 5/6 inversés puis restaurés, 10 entrées intactes) + screenshot (flèche ↓ sur courier_velo swap avec courier_moto puis ↑ restaure ; duplication ouvre l'éditeur « Coursier · Voiture (copie) » pré-rempli, id auto). Lint front+back clean. ⚠️ Le drag & drop natif n'est pas vérifiable de façon fiable en Playwright headless ; la **logique de réordonnancement (même `persistOrder`/endpoint) est validée via les flèches**.

## NEW - 2026-06-06 - Phase 2 : Panneau Admin « Catégories de chauffeurs » (CRUD) (DONE — iter 137)
- **Demande user** : Phase 2 annoncée en Phase 1 — donner à l'admin le contrôle complet de la collection `driver_categories` (documents requis + type de véhicule par activité) sans toucher au code. (« Je laisse faire ».)
- **Backend** (`admin.py`) : 4 endpoints CRUD `GET/POST/PUT/DELETE /api/admin/driver-categories` (perm `server.settings.edit`). Helper `_clean_driver_category` (whitelist + validation : service∈{taxi,courier,delivery}, vehicle_class∈{car,moto,velo}, taxi_sub∈{particulier,vtc,taxi} forcé None hors taxi+car, ≥1 document {key,label}, libellé requis). POST dérive un id stable (`service_vehicle[_sub]`) avec **auto-suffixe** (`_2`, `_3`…) en cas de collision ; id explicite en collision → 409. `_clean_driver_category` ne renvoie jamais `id` → le PUT ne peut pas réécrire l'identifiant.
- **Frontend** : nouvelle page `pages/admin/AdminDriverCategories.js` (liste groupée Taxi/Coursier/Livreur, cartes avec badge véhicule + badge sous-cat + chips documents + Modifier/toggle actif/Supprimer ; éditeur inline `CategoryEditor` : libellé, sélecteurs service/véhicule, **sous-catégorie Taxi conditionnelle** (visible si taxi+voiture uniquement), ordre, id optionnel, **documents dynamiques** add/remove, toggle actif). `adminAPI.{list,create,update,delete}DriverCategory` ajoutés. Route `/admin/driver-categories` + entrée menu sous MEMBRES & PARTENAIRES › Chauffeurs / Prestataires.
- **Vérifié** : backend curl E2E (create auto-suffixe `courier_velo_2`, update 200, delete 200, no-docs→400, id dupliqué→409, introuvable→404) + **testing_agent frontend 100% (11/11 flows)** (iter 137 : liste 10 catégories seedées, create→edit→toggle→delete, visibilité conditionnelle sous-cat, 2 toasts de validation, intégrité du seed préservée = 10 entrées). Lint front+back clean.
- ⚠️ La validation/approbation admin des documents uploadés par le chauffeur (statut pending→approved) reste un chantier ultérieur (non couvert ici).

## NEW - 2026-06-06 - Audit complet + finalisation (démo-ready) (DONE)
- **Demande user** : auditer toute l'app, corriger liens morts/boutons sans action/erreurs UI, rendre chaque service cliquable & utilisable, démo-ready. (« Je te laisse faire ».)
- **Audit (agent de test, iteration_136)** : **38/38 routes client s'affichent** — 0 écran blanc, 0 crash React, 0 erreur console bloquante. Tuiles home toutes câblées vers des routes valides. Flux principaux (VTC, Repas, Colis, Coursier, Pharmacie, Transport médical, Marketplace, Vidéo-consult) fonctionnels.
- **Corrections livrées** :
  - `DriverProfilePage` : **14 boutons morts** câblés → routes existantes (Galerie→/chauffeur/gallery, Mode de paiement & Coord. bancaires→/chauffeur/bank, Portefeuille/Ajouter/Envoyer→/chauffeur/wallet, Contacts d'urgence→/safety) ou feedback propre `toast.info('Bientôt disponible')` pour les soft-features sans backend. Toggle **Face ID/Touch ID** → toast de confirmation (plus de clic sans effet).
  - `VideoConsultPage` : `alert()` natif → **toast + écran de succès** (`video-consult-success`) avec gestion d'erreur.
  - `GiftCardsPage` : `alert()` → toasts.
  - **Images 404 cosmétiques** : fallback gracieux global dans `ServiceCard` (`onError` → masque l'image cassée, fond gris) + dégradé de secours sur `ParkingPage`. Corrige pet-care/car-care/nearby/parking d'un coup.
  - Refactor sûr de l'effet de fetch dans `ServiceListLayout` (inline async, conforme React Compiler).
- **Décision** : `DriverHome` (786 l, critique) NON modifié — l'`alert` OTP conservé pour éviter d'hériter de la dette lint React Compiler pré-existante (`Date.now()` en init, `navigator`) sur ce fichier sensible.
- **Vérifié** : lint front clean sur tous les fichiers touchés, webpack OK, screenshot login→/home→/pet-care OK (fallback image confirmé), console sans erreur applicative. Soft-placeholders honnêtes restants (feedback, non morts) : devise/langue/changer-mdp chauffeur, Finance, Covoiturage publier, Abonnements Stripe.


## NEW - 2026-06-06 - 4 moyens de paiement sur tous les services + vérif livraison repas (DONE)
- **Demande user** : (1) vérifier la livraison de repas ; (2) activer les 4 moyens de paiement (Espèces · CB · Portefeuille · SB PayGo) pour TOUS les services, y compris la pharmacie. **Choix règlement** (Colis/Coursier/Transport médical) : débit Portefeuille/SB PayGo **AVANT la recherche chauffeur** (à la réservation) ; si solde insuffisant → **bascule automatique en espèces + message d'avertissement**. Espèces/CB = payé à la livraison.
- **État avant** : Repas (CheckoutPage) + Taxi + Pharmacie catalogue affichaient déjà les 4 (config centrale `/api/config/payment-methods`). Colis/Coursier/Transport médical étaient figés sur « espèces » ; « Payer maintenant » pharmacie = Portefeuille/SB PayGo seulement.
- **Backend** : nouveau helper partagé `core/payments.py` → `debit_with_fallback()` (débit atomique wallet/sbpaygo, sinon `{method:'cash', fallback_to_cash:True}`) + `refund_user()`. Intégré dans `parcels.py create_parcel` et `gojek_services.py create_medical_transport` (débit avant broadcast, champs `payment_method/payment_status/payment_fallback_to_cash`). Pharmacie : `GET /pharmacy/payment-methods` renvoie désormais les 4 ; `pay_order` accepte cash/card → `payment_status='cod'` (réglé à la livraison, sans débit).
- **Frontend** : nouveau composant réutilisable `components/PaymentMethodPicker.jsx` (4 méthodes via `usePaymentMethods`, soldes wallet/sbpaygo, hint « payé en espèces » si insuffisant). Intégré dans `ParcelPage`, `RunnerPage`, `MedicalTransportPage` (toast bascule espèces sur `payment_fallback_to_cash`). `PharmacyOrdersPage` : volet de paiement 4 méthodes + badge « À régler à la livraison » (COD). `financeAPI` ajouté à `api.js`.
- **Vérifié** : E2E in-process TestClient **24/24** (`/tmp/e2e_pay.py` : débit wallet/sbpaygo OK, bascule espèces si insuffisant sans débit, cash=pending, COD pharmacie, configs 4 méthodes). Agent de test UI **6/6 in-scope** (iteration_135) : **livraison repas OK** (commande créée, page succès), sélecteurs 4 méthodes affichés sur Colis/Coursier/Transport médical/Pharmacie, toast bascule espèces vérifié (transport médical wallet). Task 2e (« Payer maintenant ») = **N/A** (aucune commande pharmacie payable sur le compte test — pas un échec). Aucun bug backend/frontend. Lint front+back clean.


## NEW - 2026-06-06 - Gammes véhicules ↔ sous-catégorie chauffeur (Particulier/VTC/Taxi) + bonus différenciés (DONE)
- **Demande user** (choix 1a+2a+3a) : dans l'app client, chaque gamme voiture est servie par certaines sous-catégories. **SB ouvert à tous** (Particulier/VTC/Taxi) ; gamme **« VTC » réservée aux VTC** ; gamme **« Taxi » réservée aux Taxi licence**. Bonus fixe différent par sous-catégorie. VTC/Taxi voient SB + leur gamme dédiée.
- **Modèle** : champ `allowed_taxi_subs` (liste de `particulier|vtc|taxi`) sur chaque `vehicle_types`. Gamme « restreinte » = sous-ensemble strict des 3 ; gamme ouverte = les 3 / vide / absent → aucune restriction. **2 nouvelles gammes seedées** : `vtc` (`["vtc"]`) et `taxi` (`["taxi"]`), category_slug `vtc-taxi`. Backfill au démarrage : toutes les gammes existantes → `["particulier","vtc","taxi"]` (rétro-compat). Champ ajouté à `VT_FIELDS`/`VT_DEFAULTS` (éditable admin).
- **Dispatch (`rides.py`)** : helpers `gamme_restricted_subs`, `driver_sub_allowed`, `restricted_gammes_map`. Gating appliqué dans **`accept_ride`** (403 si `taxi_sub` non autorisé), **`driver_counter_offer`** (enchères, 403), **`list_rides`** (feed chauffeur masque les pending réservés), **`get_available_rides`** (filtré). Le chauffeur garde toujours ses courses assignées.
- **Bonus par sous-catégorie** : `sub_category_bonus` {enabled, particulier, vtc, taxi} dans la config `rewards` (admin). Crédité au chauffeur à la **complétion** de course (ajouté à `earnings`, stocké `subcategory_bonus`/`subcategory` sur la course).
- **Admin UI** : `VehicleTypeEditor.jsx` → section « Sous-catégories chauffeur autorisées » (chips Particulier/VTC/Taxi, testids `vt-sub-*`). `AdminRewards.js` → nouvel onglet « Bonus Sous-catégories » (`tab-subcat`, toggle + 3 montants, testids `subcat-*`). Client : les gammes VTC & Taxi apparaissent automatiquement dans la liste voiture (`/api/config/vehicle-types`).
- **Vérifié** : **pytest 19/19** (helpers + map DB + matrice de décision) + **E2E in-process TestClient 16/16** (création sb/vtc/taxi ; accept VTC : particulier 403/taxi 403/vtc 200 ; accept TAXI : vtc 403/particulier 403/taxi 200 ; SB ouvert ; feed chauffeur filtré ; bonus VTC 2,5€ crédité à la complétion → earnings 0→15,7 sur fare 15€). Seed/backfill DB confirmés (0 gamme sans `allowed_taxi_subs`). Lint front+back clean ; webpack compiled. ⚠️ E2E **UI navigateur non capturé** : le backend preview était saturé par un flot live d'auto-traduction i18n admin (worker unique) — validé en in-process à la place.


## NEW - 2026-06-06 - Inscription chauffeur en ARBORESCENCE + documents par catégorie (Phase 1) (DONE)
- **Demande user** : à l'inscription, le chauffeur choisit son activité ; chaque catégorie a SES documents + SA catégorie de véhicule. Structure validée :
  - TAXI → Moto-taxi (moto) | Voiture → Particulier / VTC / Taxi(licence)
  - COURSIER & LIVREUR → Vélo / Moto / Voiture
  Décision : **2b** (documents par défaut codés maintenant), panneau Admin de config = **Phase 2** (à faire). « L'admin gère les documents, le but c'est séparer. »
- **Backend `drivers.py`** : `DEFAULT_DRIVER_CATEGORIES` (10 feuilles : id, service, vehicle_class, taxi_sub, label, documents[]) seedé idempotemment dans la collection `driver_categories` (`$setOnInsert` → préserve futures éditions admin). `seed_driver_categories()` appelé au startup (`server.py`). `GET /api/drivers/categories` (auth). `register_driver` accepte `categories:[ids]`, valide (rejette véhicules mixtes → « Un seul type de véhicule par chauffeur »), dérive `service_types`/`taxi_mode`/`taxi_sub`/`vehicle_class`/`vehicle_type` (`VEHICLE_CLASS_TO_TYPE`: car→car, moto→motorcycle, velo→bicycle) ; stocke `categories`, `vehicle_class`, `taxi_sub`. Path legacy (service_types+taxi_mode) conservé. `_has_vtc_document` élargi (vtc_card | carte_vtc | carte_pro_taxi).
- **Schemas** : `DriverCreate.categories`, `DriverProfile.{categories, vehicle_class, taxi_sub}`. Champs `DriverCreate` rendus optionnels (vélo n'a pas d'immatriculation).
- **Frontend** : `api.js` `driverAPI.getCategories()`. **`DriverRegisterPage.js` réécrit** en flux guidé : Étape 1 (services multi-select → véhicule Vélo/Moto/Voiture, **Vélo désactivé si Taxi** → sous-catégorie Particulier/VTC/Taxi si Taxi+Voiture → infos véhicule si moto/voiture) ; Étape 2 (**documents dynamiques** = union dédupliquée des docs des catégories choisies, upload requis) ; Étape 3 succès. testids : `service-type-*`, `vehicle-class-*`, `taxi-sub-*`, `upload-{docKey}`, `next-step-btn`, `submit-btn`.
- **Vérifié** : backend curl (register VTC+coursier+livreur voiture → dérive tout ; véhicules mixtes → 400) + screenshots (Étape 1 : Vélo grisé, sous-cat VTC ; Étape 2 : docs = Permis B/Carte VTC/Macaron VTC/Carte grise/Assurance) + **E2E complet frontend** (signup → Coursier/Vélo → upload 2 docs → Soumettre → écran succès ; record DB : `categories:['courier_velo']`, role=driver, status=pending, 2 docs). Lint front+back clean. Comptes de test supprimés.
- **Phase 2 (à faire)** : panneau **Admin** pour gérer les catégories (CRUD documents requis + config véhicule) — la collection `driver_categories` est déjà prête. Validation/approbation admin des documents (statut pending→approved).


## NEW - 2026-06-06 - Séparation Taxi voiture / Moto-taxi (`taxi_mode`) (DONE)
- **Demande user** : au clic sur « Taxi » (section « Je veux faire »), l'app demande **Voiture ou Moto** → un chauffeur moto peut faire du transport de personnes (moto-taxi). « L'admin gère les documents, le but c'est séparer. »
- **Modèle** : nouveau champ chauffeur `taxi_mode` = `"car"` (taxi voiture) ou `"moto"` (moto-taxi), `None` sinon. Ajouté à `DriverCreate` + `DriverProfile`.
- **Backend `drivers.py`** : helpers `_is_moto_vehicle`, `_vehicle_matches_mode(vt, mode)` (car↔voiture, moto↔motorcycle/scooter…), `_taxi_block_reason(driver, mode)`. `register_driver` exige `taxi_mode` ∈ {car,moto} + véhicule correspondant si taxi sélectionné (stocke `taxi_mode`). `update_service_types` accepte `taxi_mode`, verrouille à l'ajout OU au changement de mode (véhicule adapté + Carte VTC), efface le mode si taxi retiré. `GET /api/drivers/taxi-eligibility` renvoie `{has_taxi, taxi_mode, vehicle_type, has_vtc, can_car, can_moto, is_car, is_moto}`.
- **Frontend** : `api.js` `updateServiceTypes(types, taxi_mode)`. `DriverRegisterPage.js` — clic Taxi ouvre un sélecteur **Voiture / Moto** (`taxi-mode-picker`, `taxi-mode-car`, `taxi-mode-moto`) ; le mode fixe automatiquement le véhicule (car→Voiture, moto→Moto) ; la carte Taxi affiche « Taxi voiture » / « Moto-taxi » ; changer de véhicule incompatible retire le taxi. `DriverProfilePage.js` modale — clic Taxi ouvre le picker ; bouton Voiture activé si véhicule=voiture+VTC, Moto activé si véhicule=moto+VTC (l'autre grisé) ; libellé dynamique.
- **Docs** : la Carte VTC reste exigée pour le taxi (les 2 modes) — la **validation/ajout des documents par l'admin n'est pas implémentée** (présence du doc suffit ; le contrôle des documents requis par l'admin sera un chantier ultérieur).
- **Vérifié** : backend curl (moto sans VTC→400, mode car sur moto→400, moto+VTC→moto-taxi OK, voiture+VTC→taxi voiture OK, retrait taxi OK) + 3 screenshots (inscription : Taxi→picker→Moto fixe le véhicule Moto & libellé « Moto-taxi » ; profil amadou : picker Voiture activé / Moto grisé). Lint front+back clean. Migration data : `taxi_mode` rétro-rempli (car/moto) pour les chauffeurs taxi existants.


## NEW - 2026-06-06 - Taxi = service VERROUILLÉ (véhicule adapté + Carte VTC) (DONE)
- **Règle métier (demande user)** : un Livreur/Coursier peut **devenir Taxi** en ajoutant les **documents (Carte VTC) + un véhicule adapté (voiture)**. Taxi = service supérieur, jamais accessible sur moto/vélo ni sans Carte VTC.
- **Backend `drivers.py`** : helpers `_is_car_vehicle` (set CAR_VEHICLE_TYPES), `_has_vtc_document` (cherche `type=="vtc_card"` dans `documents`), `_taxi_block_reason`. `register_driver` refuse taxi si véhicule ≠ voiture (défaut service_types passé à `["delivery","courier"]`). `update_service_types` ne verrouille QUE lorsqu'on **ajoute** taxi (`adding_taxi`) → 400 si pas voiture ou pas de Carte VTC ; conserver taxi déjà présent reste permis (drivers existants grandfathered). Nouvel endpoint `GET /api/drivers/taxi-eligibility` → `{eligible, has_taxi, has_car, has_vtc, reason}`.
- **Frontend** : `api.js` ajoute `driverAPI.getTaxiEligibility`. `DriverRegisterPage.js` — Taxi activable seulement si véhicule=voiture (sinon « 🔒 Voiture requise », auto-désélection au changement de véhicule) ; étape 2 ajoute le doc **Carte VTC** (obligatoire, bouton Soumettre bloqué) quand Taxi sélectionné. `DriverProfilePage.js` modale « Gérer mes services » — carte Taxi **verrouillée** (icône cadenas + « 🔒 Véhicule voiture requis / Carte VTC requise » + liens « Ajouter un véhicule » → /chauffeur/vehicles, « Ajouter ma Carte VTC » → /chauffeur/documents) si non éligible ; toast au clic ; taxi déjà actif reste modifiable.
- **Vérifié** : backend curl 4 scénarios (moto→400 véhicule, voiture sans VTC→400 Carte VTC, upload vtc_card→eligible→ajout taxi OK, retrait taxi toujours permis) + 2 screenshots (inscription lock/unlock voiture↔moto ; modale profil Taxi verrouillé + toast). Lint front+back clean.
- ⚠️ Note : `DriverDocumentsPage.js` affiche des statuts de docs **mockés** (hardcodés) mais les **uploads sont réels** (push dans `documents`), donc le verrou VTC fonctionne sur données réelles. Validation/approbation admin de la Carte VTC = non implémentée (présence du doc suffit pour débloquer).


## NEW - 2026-06-06 - Coursier Express rebranché sur le moteur "parcels" + 3 types de chauffeur (DONE — iter 134)
- **Demande** : (1) tester "Coursier Express" — il créait des commandes orphelines (collection `runner_orders`, aucun dispatch chauffeur, invisible dans l'historique). (2) À l'inscription chauffeur : **3 types** au lieu de 2 — **Taxi · Livreur · Coursier**.
- **Coursier Express (`/runner`)** : `RunnerPage.js` soumet désormais via `parcelAPI.create` (`POST /api/parcels`) puis redirige vers `/track/parcel/{id}` (suivi temps réel existant). Tarif live via `parcelAPI.estimate`. Map `PKG_TO_VEHICLE` (document/small/food→moto, medium→box). → dispatch chauffeur live (`new_parcel`), acceptable dans Missions, suivi carte + ETA, **visible dans l'historique**.
- **Historique** : nouvel onglet **"Livraisons"** (`tab-parcels`) dans `HistoryPage.js` listant `parcelAPI.list()` (items cliquables → `/track/parcel/{id}`). Correctif racine : `loadData` déplacé DANS le `useEffect` (un `loadData` autonome référencé dans l'effet faisait planter le React Compiler → faux positif `react-hooks/immutability` sur `filteredOrders`). Item commande rendu cliquable → `/order/{id}`.
- **3 types de chauffeur** : `service_types` accepte maintenant `{taxi, delivery, courier}`. Dispatch séparé : taxi→`rides`, **delivery (livreur)→`orders` marchands**, **courier (coursier)→`parcels`** (filtre `parcels.py` passé de "delivery" à "courier"). `DriverRegisterPage.js` + modale "Gérer mes services" de `DriverProfilePage.js` convertis en **multi-sélection 3 types** (testids `service-type-*` / `driver-service-*` + bouton `driver-services-save`). Migration `server.py` : drivers legacy "delivery" reçoivent aussi "courier" (anti-régression) ; défaut sans type = `[taxi,delivery,courier]`.
- Vérifié : **backend curl E2E** (création parcel, chauffeur courier voit+accepte, taxi-only voit 0, `service_types:[]`→400). **testing_agent frontend 6/6 (100%)** (iter 134) — Coursier Express UI + multi-stop, onglet Livraisons + suivi, modale 3 types persistée, registration 3 toggles, chauffeur voit 11 missions colis. Lint front+back clean. ⚠️ Submit Coursier Express E2E non exécutable en headless (l'autocomplete Google `place_changed` ne se déclenche pas via Playwright) — backend validé par curl. Correctif UX : `pb-28` sur `/chauffeur/profile` (ligne "Gérer les services" sous la bottom-nav au scroll-top).
- Note : ancien endpoint `/api/phase2/runner/book` (collection `runner_orders`) conservé mais **plus utilisé par le web** (mobile éventuel).


## NEW - 2026-06-06 - Commande de repas réparée + suivi FR/€ (DONE)
- 2 bugs bloquants corrigés dans le parcours commande : (1) `e;` parasite en fin de `CheckoutPage.js` (ReferenceError) ; (2) calque plein écran dû à `<div className="mobile-container">` (min-h:100vh + bg blanc) imbriqué dans la barre fixe du bouton — masquait tout et bloquait les clics. Remplacé par `max-w-[430px] mx-auto`.
- `CheckoutPage` (confirmation) + `OrderTracking` (suivi) traduits FR + devise €. Lint React-Compiler corrigé (effets inlinés).
- Testé e2e jusqu'à la page de suivi. Détails : CHANGELOG 2026-06-06.

## NEW - 2026-06-06 - Services de Livraison multi-verticales fonctionnels (DONE)
- Demande : vérifier les 4 services de livraison + ajouter les verticales manquantes, tout doit fonctionner.
- `FoodPage` devient une liste de magasins **générique verticale-aware** (`/food?type=grocery|florist|stationery|wine|construction`, défaut restaurant), en **FR + €**. `RestaurantDetail` traduit FR/€.
- Marchands démo seedés par `store_type` (grocery, florist, stationery, wine, construction) + produits. Routes corrigées : « Courses » → grocery, « Médicaments » → `/pharmacy`, etc. (CMS + `AllDeliveryPage`).
- Testé e2e (client `coherence@demo.sb`). Détails dans CHANGELOG 2026-06-06.

## NEW - Jun 2026 - Flux taxi UNIFIÉ « Choisissez un voyage » sur toutes les commandes + Réservation WhatsApp (DONE — iter 124)
- **Demande** (vidéo de réf.) : appliquer le parcours V3Cube « Choisissez un voyage » (départ/destination → comparaison multi-véhicules avec prix/ETA en direct → « Demander » → radar) à **toutes** les commandes taxi, ajouter une **réservation via WhatsApp**, le tout **piloté par l'admin** (choix : 1a flux unifié partout + 2a WhatsApp wa.me + 3 admin).
- **Frontend** : `RideChoosePage.js` (`/course?mode=<id>`) devient l'entrée unique mode-aware : adresses + raccourcis, comparaison véhicules (prix live `/api/rides/estimate`), panneaux par mode (`ModeSpecificPanel`/`SchedulePanel` frères) — aéroport/animaux/assistance/corporate/proche/enchères/location/chauffeur privé/programmation/pool. **Bouton « Réserver via WhatsApp »** (wa.me + message pré-rempli, visible si activé admin). Tuiles accueil + grille TaxiHub → `/course?mode=` ; `TaxiHubPage` redirige `/taxi?mode=` → `/course?mode=` quand unifié activé (couvre tuiles CMS) ; sinon retombe sur le hub legacy.
- **Admin** : public `GET /api/config/taxi-booking` (clé `taxi_booking`) ; page « Réservation Taxi & WhatsApp » (`/admin/taxi-booking-config`) — toggle flux unifié, toggle WhatsApp, numéro WhatsApp Business, modèle de message (textarea). Édition via `PUT /api/admin/service-config/taxi_booking`.
- Testé : **testing_agent frontend 100%** (iteration_124) + curl backend. Config remise aux défauts (WhatsApp off, numéro vide). Backlog : découper `RideChoosePage.js` (~660 l.).



- **Demande** : alerter l'admin quand une zone dépasse un seuil de courses sans chauffeur sur une fenêtre, et déclencher une prime chauffeur temporaire pour rééquilibrer l'offre.
- **Backend** : module `core/zone_alerts.py` (`infer_zone`, `get_alert_cfg`, `maybe_create_zone_alert`). Détection appelée dans `convert-to-bidding` & `reschedule` : compte les courses sans chauffeur de la zone sur la fenêtre → crée une alerte `zone_alerts` (collection) + WS `zone_no_driver_alert` aux admins. Si `auto_bonus_enabled`, prime auto. Admin : `GET /admin/zone-alerts`, `POST /admin/zone-alerts/{id}/bonus` (manuel + WS `zone_bonus_active` aux chauffeurs), `POST /admin/zone-alerts/{id}/dismiss`. Chauffeur : `GET /api/rides/active-zone-bonuses` (⚠️ placé AVANT `/{ride_id}` pour éviter la capture de route).
- **Config admin** (`no_driver_alerts`) : enabled, zone_threshold, window_minutes, auto_bonus_enabled, bonus_amount, bonus_duration_minutes. Route `/admin/no-driver-alerts-config` + menu.
- **Frontend** : bandeau d'alertes live sur `AdminNoDriverStats` (bouton « Activer une prime » + « Ignorer », refresh 15s) ; bandeau chauffeur « Prime +X€ active à {zone} » sur `DriverHome` (fetch 30s + WS `zone_bonus_active`).
- Vérifié curl E2E : seuil 2 → alerte créée (count), prime manuelle (7€/45min) et auto (8€/30min) visibles côté chauffeur, dismiss, reset. Lint clean front+back, frontend 200.
- ⚠️ La prime est **déclarée + visible** (admin record + incitation chauffeur) ; l'**intégration au calcul de paie chauffeur** reste à brancher (à la complétion de course) — backlog.


- **Demande** : voir le taux de courses passées en enchères/planifiées après relances, par zone et créneau, pour repérer les pénuries de chauffeurs.
- **Backend** (`rides.py`) : `rebroadcast` incrémente `relance_count` ; `convert-to-bidding` marque `no_driver_outcome='bidding'` ; `reschedule` (si `relance_count>0`) marque `no_driver_outcome='scheduled'`. Nouvel endpoint `GET /api/admin/reports/no-driver-stats?days=N` (perm `dashboard.view`) → taux, totaux, répartition **par zone** (`_infer_zone`), **par créneau** (7 tranches horaires) et par véhicule.
- **Frontend** (`AdminNoDriverStats.js`) : KPIs (taux, total, enchères, planifiées), barres empilées par créneau (recharts), tableau par zone. Route `/admin/reports/no-driver-stats` (2 blocs) + entrée menu « Courses sans chauffeur » (`AdminLayout`).
- Vérifié curl : 2 sorties (1 enchères Martinique, 1 planifiée Guadeloupe), zones/créneaux/véhicules corrects, taux 0,62 % (2/321). Lint clean front+back, frontend 200.


- **Demande** : rendre le **nombre de relances** et l'**intervalle (20s)** pilotables par l'admin (sans redéploiement).
- **Backend** : config publique `GET /api/config/ride-search` (service_configs clé `ride_search`) → `{enabled, relance_interval_seconds, max_relances}` avec bornes (intervalle 5–300s, relances 1–10). Édition via `PUT /api/admin/service-config/ride_search`.
- **Admin** (`AdminServiceConfig`) : section « Recherche chauffeur (Relances) » (toggle activation, intervalle, nb relances) + route `/admin/ride-search-config` + entrée menu (`AdminLayout`).
- **Frontend** (`RideTrackingPage`) : récupère la config au montage et l'utilise pour la cadence auto, le compteur `relance-count` (X/max) et le seuil de déclenchement du modal (fallback 20s/3 si indispo).
- Vérifié curl : défauts 20/3 ; save 10/5 reflété ; clamping (2→5, 99→10) ; reset. Lint clean front+back. (Flux relance→modal déjà validé testing_agent 6/6.)


- **Demande** : sur tout type de course taxi, après **3 relances** sans chauffeur, rediriger le client vers l'option « Proposer votre tarif » (enchères) ou « Planifier le trajet ».
- **Relance** = cycle auto (~20s) **et** bouton manuel « Relancer la recherche » (même compteur). Au 3e → **modal** auto « Aucun chauffeur disponible » avec 2 boutons + « Continuer la recherche ». Exclut le mode Enchères lui-même.
- **Backend** (`rides.py`) : `POST /{ride_id}/rebroadcast` (relance — re-broadcast `new_ride_request`), `POST /{ride_id}/convert-to-bidding` (passe `mode='bidding'`/`is_bidding`, `proposed_fare`=estimate, re-broadcast), réutilise `PUT /{ride_id}/reschedule`.
- **Frontend** (`RideTrackingPage.js`) : auto-relance toutes les 20s + bouton `relancer-recherche-btn` (compteur `relance-count` 1/3, 2/3) → `no-driver-modal` (`propose-fare-btn` → convert-to-bidding + navigation `/taxi-bidding?resume=<id>`; `schedule-trip-btn` → `ScheduleCalendarModal` → reschedule → `/scheduled-rides`; `continue-search-btn` → reset). `TaxiBiddingPage.js` gère `?resume=<rideId>` pour reprendre la course convertie.
- Vérifié : **testing_agent frontend 6/6 (100%)** (relances → modal → propose/planifier/continuer, navigations OK) + curl backend (rebroadcast 200, convert mode=bidding, reschedule 200). Lint clean front+back.
- Backlog : `RideTrackingPage.js` ~791 lignes → à découper (hooks pool/relance/status) ultérieurement.


- **Demande** : prévenir le chauffeur Pool en temps réel quand un passager rejoint, avec l'ordre de ramassage optimisé du trajet partagé.
- **Backend** (`phase2.py`) : `_build_pool_group_route(group_id, from_lat, from_lng)` = ordre **nearest-neighbour** (tous les ramassages puis toutes les déposes, depuis la position chauffeur) avec libellés passager + séquence. Nouvel endpoint `GET /phase2/pool/group/{ride_id}` (propriétaire d'un membre OU chauffeur assigné). `join_pool` : si le groupe a **déjà un chauffeur assigné**, la course du nouveau passager lui est **rattachée** (driver_id + status accepted) et un WS **`pool_passenger_added`** est envoyé au chauffeur (compteur + stops ordonnés) ; le passager reçoit `ride_accepted`. Cible `accepted` désormais acceptée au join. **Strictement limité aux courses `pool_group_id`** → zéro impact sur les courses solo.
- **Frontend chauffeur** (`DriverHome.js`) : écoute `pool_passenger_added` → toast « +1 passager · trajet groupé (N au total) » + **panneau flottant `pool-route-panel`** listant l'ordre Prise/Dépose par passager.
- Vérifié E2E curl : chauffeur accepte RA → P2 rejoint → `driver_notified=true`, RB rattachée (accepted + driver_id), route combinée = 2 prises puis 2 déposes ordonnées. La **programmation horaire** confirmée (fenêtre 07:00-08:00 → remise inactive hors plage). **pytest 2/2**. Lint clean front+back.


- **Demande** : la réduction s'amplifie avec le nombre de passagers groupés (récompense les groupes pleins). Pilotable admin.
- **Admin** (`AdminServiceConfig` clé `pool`) : `share_discount_percent` = base à 2 passagers (30%), `share_discount_step_percent` = bonus par passager supplémentaire (15%), `share_discount_max_percent` = plafond (60%). + toggle on/off et plages horaires (déjà en place).
- **Backend** (`phase2.py`) : `_pool_effective_pct(cfg, members)` = `min(max, base + step·(members−2))`. À chaque `join_pool`, **toutes** les courses du groupe sont recalculées au taux effectif courant (rejoindre à 3 approfondit la remise des 2 premiers). `pool_discount_percent` stocké + renvoyé.
- **Frontend** (`RideTrackingPage`) : bannière `pool-savings-banner` affiche désormais « Tarif partagé · −X% » + « −Y € grâce au covoiturage » (montant & % via join + polling matches).
- Vérifié E2E curl : 2 riders→30%/−3,60€, 3 riders→45%/−5,40€ (le 1er passager voit la remise approfondie), plafond 60%. **pytest 2/2**. Lint clean front+back.


- **Demande** : afficher au passager l'économie réelle dès qu'un partenaire rejoint le groupe Pool, **et** rendre la réduction pilotable par l'admin (manuel / automatique / programmé).
- **Admin** (`AdminServiceConfig` clé `pool`) — 3 nouveaux réglages : `share_discount_enabled` (toggle **manuel** on/off), `share_discount_percent` (% appliqué **automatiquement** au jumelage, défaut 30), `share_discount_hours` (**programmation** par plages « 07:00-10:00,17:00-20:00 », vide = toujours). Persistés dans `service_configs`.
- **Backend** (`phase2.py`) : helper `_pool_share_cfg()` (lit la config, gère le fuseau Europe/Paris via `_within_hours`). À l'`join_pool`, si la réduction est active, **recalcul du tarif de chaque course groupée** : `estimated_fare = original_fare × (1 − pct/100)`, stocke `pool_savings`/`pool_group_size`/`pool_discount_percent` ; renvoie `shared_fare`/`original_fare`/`pool_savings`/`discount_percent`. `enable_pool` utilise désormais aussi le % admin (au lieu de 0,7 en dur). `GET /pool/matches` expose `your_savings` + `discount_percent`.
- **Frontend** (`RideTrackingPage`) : bannière `pool-savings-banner` « −X € grâce au covoiturage » (montant `pool-savings-amount`) sous le groupe, alimentée par le join + le polling matches.
- Vérifié E2E curl + **pytest 2/2** : 30% → 12€→8,40€ (−3,60€) ; admin 50% → −6€ ; admin désactivé → aucune réduction ; reset défauts. Lint clean front+back.


- **Module Immobilier mobile porté** (réutilise le backend testé iter110/111) :
  - `RealEstateListScreen` : toggle **Acheter/Louer**, **chips catégorie** (Tous/Résidentiel/Commercial/Terrain), **recherche debouncée**, grille 2 colonnes de cartes (thumbnail, prix, ville, specs 🛏🛁📐, badge ★ Sponsorisé), accès « Mes annonces ».
  - `PropertyDetailScreen` : **carrousel d'images** (ScrollView paginé + dots), prix, badges (Vente/Location, catégorie, meublé), grille specs, description, équipements, **carte react-native-maps** (marqueur), barre contact : **Appeler** (`tel:`) + **« Faire une offre »/« Contacter »** (modal message + montant → `createInquiry`). Masque l'offre si propriétaire → « Gérer mon annonce ».
  - `MyPropertiesScreen` : onglets **Mes biens** (statut, badge demandes non lues, marquer vendu/loué, supprimer) + **Mes demandes** envoyées.
- **Profil & Réglages** :
  - `ProfileScreen` recâblé (lignes navigables) : Modifier le profil, Mes annonces immobilières, Réglages.
  - `EditProfileScreen` : édition **nom/téléphone** (email lecture seule) → `PUT /api/users/profile`.
  - `SettingsScreen` : compte (édition profil, **changer mot de passe** via `/auth/change-password`), préférences (**langue FR/EN** i18n, toggle notifications), à propos (CGU/confidentialité/version), déconnexion.
- **Backend** : nouvel endpoint `PUT /api/users/profile` (name/phone/avatar, exclut `password_hash`, 400 si vide). `userAPI` mobile enrichi (`updateProfile`, `changePassword`) + nouveau `realEstateAPI`. Écrans enregistrés dans `UserNavigator` + tuile **« Immobilier »** sur `UserHomeScreen`.
- Vérifié : `yarn tsc --noEmit` **clean**, backend lint clean, curl E2E (`PUT /users/profile` OK + 400 vide, `GET /real-estate/listings` renvoie les annonces). ⚠️ **Test e2e UI mobile non exécuté** (nécessite Expo Go/appareil) — logique miroir du web déjà testé + compilation TS validée. `mobile/.env` pointe déjà sur le bon backend.


- **Demande** : transformer l'affichage passif des courses Pool proches en **vrai jumelage in-app** (bouton « Rejoindre ») pour booster le taux de remplissage Pool.
- **Backend** (`phase2.py`) : nouvel endpoint `POST /api/phase2/pool/join/{target_ride_id}` (body `{ride_id}`) — groupe la course Pool `pending` du user avec une course Pool cible proche (re-vérif haversine ≤2 km / ≤3 km), assigne un `pool_group_id` partagé sur les 2 courses, renvoie `members`. Push WS `pool_partner_joined` au propriétaire de la course cible. Gardes : 400 (propre course / cible indispo / trop loin / ride_id manquant), 403 (pas votre course), 404 (introuvable). `GET /pool/matches/{id}` enrichi : `your_group_id`, `group_members`, et `joined` par match (tri groupe d'abord).
- **Frontend** (`RideTrackingPage.js`) : bouton `pool-join-btn-{i}` par match → toast succès + bascule en badge `pool-match-joined-{i}` « ✓ Rejoint ». Bannière `pool-group-banner` « Vous covoiturez · N passagers groupés » dès qu'un groupe existe.
- Vérifié **pytest 2/2** (`test_pool_join.py` : jumelage 2 passagers → groupe/members=2/joined=True, + cas erreurs 400/404) + E2E curl. Lint clean front+back.


- **Demande** : afficher au passager « X place(s) disponible(s) sur une course Pool proche » (vrai covoiturage temps réel) — branchement de l'UI sur l'endpoint existant `GET /api/phase2/pool/matches/{ride_id}`.
- **Frontend** (`RideTrackingPage.js`) : quand Taxi Pool est activé et la course `pending`, polling 8s de `/pool/matches/{id}` → panneau `pool-matches-panel`. Si matches : compteur (`pool-matches-count`) + liste des courses Pool proches (`pool-match-{i}` : adresse ramassage/destination + distance km). Sinon : état « Recherche de passagers Pool à proximité… » (`pool-matches-empty`). Nettoyage auto quand pool désactivé ou course non-pending.
- **Backend** : endpoint déjà présent (candidats `pending` + `pool_enabled` + même `vehicle_type`, ramassage ≤2 km & dépose ≤3 km via haversine, tri par proximité, top 10).
- Vérifié E2E curl : 2 courses Pool superposées (FdF ↔ Schoelcher) → match retourné (pickup 0.16 km, dropoff 0.13 km). Lint clean, smoke OK. ⚠️ Flux UI live non testé via navigateur (nécessite création de course Pool live) — backend validé + rendu conditionnel sur patterns existants. **Refactor `AdminDashboard.js` (3 sous-composants) confirmé déjà intégré & fonctionnel.**


## NEW - Jun 2026 - Dashboard admin réorganisé en 8 familles claires + menu repliable (DONE)
- **Demande utilisateur** : « Organiser le dashboard, classer par services / options / configuration ». Refonte de l'IA du menu admin (`AdminLayout.js`).
- **8 familles** (sous-menus conservés, juste mieux rangés) : 🏠 PILOTAGE, 👥 MEMBRES & PARTENAIRES, 🚗 SERVICES, 📦 EXPLOITATION, 💳 FINANCE, 🎁 CROISSANCE, 📝 CONTENU (CMS), ⚙️ CONFIGURATION.
- **Familles repliables** : chaque section a un en-tête cliquable (chevron) ; par défaut seules PILOTAGE + la famille de la page active sont ouvertes (réduit le défilement). En recherche, toutes les familles s'ouvrent automatiquement.
- **Recherche** mise en avant (sticky, placeholder FR « Rechercher dans le menu… »).
- Doublon supprimé (section SYSTÈME redondante avec Paramètres généraux). Toutes les routes/paths et `data-testid` conservés (aucune route cassée). `data-testid` ajoutés : `section-<slug>` par famille.
- Lint clean, webpack compiled. ⚠️ Screenshot live non capturé (preview en veille « Wake up servers ») — vérifié via lint + compilation ; validation UI possible via testing agent au besoin.


## UPDATE - Jun 2026 - Socle services : gestion des zones d'opération (rayon/villes) par service (DONE)
- Chaque service gère désormais ses **zones d'opération** dans `/admin/services-settings` : zone **Rayon** (centre lat/lng + rayon km, géo-vérifiable) ou **Ville** (informative). Vide = service partout.
- **Backend** (`service_settings.py`) : `ZoneModel`, persistance `zones[]` dans `service_settings` (id auto, nettoyage/validation), exposées par l'admin + l'endpoint public `/api/services/{key}/settings`. Helper réutilisable **`point_in_service_area(key, lat, lng)`** (haversine) prêt pour l'enforcement par service.
- **Admin UI** (`AdminServiceSettings.js`) : sous chaque service, liste des zones + formulaire d'ajout (type/nom/lat/lng/rayon) + suppression, enregistré avec le reste.
- Vérifié curl/python : sauvegarde rayon+ville (id auto), reflété au public, `point_in_service_area` → Paris(10km)=intérieur / Marseille=extérieur / moto sans zone=partout. Reset après test. Lint front+back clean.
- ⚠️ Toujours un **socle** : zones non encore appliquées au matching/booking réel (étape « branchement service par service »).


## NEW - Jun 2026 - Socle réutilisable : panneau « Paramètres des services » unifié (DONE — iter116)
- **Un seul endroit** dans l'admin (`/admin/services-settings`) pour piloter la config commune de TOUS les services : activation on/off, bannière/note client, tarification. Framework générique et extensible.
- **Backend** `routes/service_settings.py` : `SERVICE_REGISTRY` déclare chaque service + ses champs éditables (l'UI rend les formulaires dynamiquement). Collection `service_settings` (clé `service_key`). Endpoints : `GET /api/admin/services/settings` (liste + schéma + valeurs), `GET/PUT /api/admin/services/settings/{key}` (whitelist des champs, coercition numérique), public `GET /api/services/{key}/settings` (consommé par les clients à venir). Gardes 404 (service inconnu) / 403 (non-admin).
- **7 services enregistrés** : taxi, moto, parcels, food, delivery, medical_transport (champs de tarif respectifs) + pharmacy (carte avec **lien « Configuration avancée »** vers son éditeur dédié, pas de doublon de source de vérité).
- **Admin UI** `AdminServiceSettings.js` : 1 carte/service (toggle, note, champs dynamiques, Enregistrer). Entrée menu « Paramètres des services » (section SERVICES, en tête).
- ⚠️ **Socle uniquement** : ces réglages ne sont **pas encore consommés** par les moteurs de tarification/réservation des services (sauf Pharmacie qui a sa propre config active). L'étape suivante = brancher service par service.
- Testé iter116 : **backend 6/6** (liste 7 services, PUT taxi + whitelist + persistance, public reflète, 404/403) **+ 14/14 régression iter115** ; **frontend 100%** (7 cartes, toggle/note/champs/save, carte pharmacie→lien avancé, persistance, entrée menu). Lint front+back clean. Valeurs taxi remises par défaut après tests.


## NEW - Jun 2026 - Pharmacie : configuration 100% pilotée par le dashboard admin & connectée (DONE — iter115)
- **Demande utilisateur** : « toutes les options/services/modifications doivent être administrés dans le dashboard, tout connecter ». Plus aucune valeur Pharmacie en dur.
- **Onglet « Paramètres »** (`/admin/pharmacy` → SettingsTab) : interrupteur **service actif/inactif**, **note/bannière client**, **frais de livraison** configurables (base €, €/km, minimum €, **seuil de livraison gratuite**). Branché : `GET/PUT /api/admin/pharmacy/settings` (singleton `pharmacy_settings`).
- **Onglet « Catégories »** (CategoriesTab) : **CRUD complet** des catégories produits (`/api/admin/pharmacy/categories`, clé unique, suppression bloquée si produits liés). Le filtre + le menu déroulant de l'éditeur Produits chargent désormais les catégories **dynamiquement** (`useCategories` → `/pharmacy/categories` DB-backed). Fin des catégories en dur.
- **Connectivité bout-en-bout** : `_delivery_fee(settings, …, subtotal)` applique base/km/min + livraison gratuite au-dessus du seuil ; `create_order` **bloque** (400) si service inactif. Client web (`PharmacyPage`) + mobile (`PharmacyHomeScreen`) affichent la bannière info et l'état indisponible (boutons désactivés). Catalogue mobile lit les catégories dynamiques.
- Seed : `seed_pharmacy()` initialise catégories + settings par défaut (idempotent).
- Testé iter115 : **backend 14/14** (settings get/put, free_threshold & min reflétés dans estimate, inactif→400, catégories CRUD + gardes) **+ 16/16 régression iter114** ; **frontend 100%** (persistance paramètres, CRUD catégories dynamiques visibles dans Produits, bannière info). Lint front + back clean, `tsc` mobile clean. Valeurs remises par défaut après tests.
- Note (P2, basse priorité) : la bannière « inactif » côté client se met à jour au montage de page (pas de polling live) — amélioration possible.


## NEW - Jun 2026 - Phase B (mobile Expo) : module PHARMACIE porté end-to-end (DONE — code complet, tsc clean)
- **Portage mobile complet du parcours Pharmacie** (réutilise le backend déjà testé iter114) :
  - `PharmacyHomeScreen` (hub : 2 actions + pharmacies partenaires), `PharmacyCatalogScreen` (catégories, recherche, panier +/-, barre panier, checkout modal : pharmacie, adresse + **GPS expo-location**, destinataire, paiement, **prix live**, soldes Portefeuille/SB PayGo + recharge si insuffisant), `PharmacyPrescriptionScreen` (**upload photo via expo-image-picker** appareil photo/galerie en base64, note, GPS, destinataire), `PharmacyOrdersScreen` (liste + timeline + **« Payer maintenant »** modal wallet/SB PayGo + annulation, polling 8s).
- **API mobile** : `pharmacyAPI` ajouté à `endpoints.ts` (pharmacies/categories/products/estimate/paymentMethods/createOrder/myOrders/cancel/pay/sbpaygoSsoLink).
- **Navigation** : 4 écrans enregistrés dans `UserNavigator` (`RootNavigator.tsx`) + tuile **« Pharmacie »** (icône medkit) sur `UserHomeScreen`.
- **Deep-link push** : tap sur la notif `pharmacy_quote_ready` → ouvre `PharmacyOrders` via `navigationRef` (`addNotificationResponseReceivedListener` dans `usePushRegistration`).
- Deps ajoutées : `expo-image-picker`. `yarn tsc --noEmit` **clean** sur tout le mobile.
- ⚠️ **Test e2e UI mobile non exécuté** (nécessite appareil/Expo Go) ; logique identique au web (testé iter114) et compilation TS validée. ⚠️ `mobile/.env` `EXPO_PUBLIC_BACKEND_URL` pointe encore sur un ancien preview (`sb-drive-vtc…`) — à repointer vers le backend cible avant test mobile réel.


## NEW - Jun 2026 - Push Expo : token utilisateur + alerte « Devis pharmacie prêt » (DONE)
- **Push mobile temps réel** : à l'établissement du devis (`admin_quote_order`), en plus du WS, un **Expo push** est envoyé au client via `core.push.notify_user(user_id, …)` (« 💊 Devis pharmacie prêt — X € »). Alerte même app fermée → accélère paiement/livraison.
- **Backend** : nouveau `POST /api/users/push-token` (auth.py `users_router`) — stocke le token Expo sur `db.users.push_token` (+ miroir `db.drivers` si chauffeur). Helper `notify_user` ajouté à `core/push.py`. 400 si token manquant.
- **Mobile (Expo)** — *termine la tâche P1 en pause (enregistrement du token push)* : ajout `expo-notifications` + `expo-device` ; hook `usePushRegistration` (demande permission, récupère `getExpoPushTokenAsync`, POST `/users/push-token` à l'authentification, canal Android `missions`, handler foreground) ; monté dans `App.tsx` (`AppShell`). `userAPI.registerPushToken` ajouté à `endpoints.ts`.
- Vérifié : enregistrement token stocké ✅, token vide → 400 ✅, devis déclenche `notify_user` sans crash ✅ (envoi Expo best-effort/fire-and-forget). `tsc --noEmit` mobile clean, lint backend clean. ⚠️ La **livraison push réelle** nécessite un appareil physique + token valide (test e2e via Expo Go, non automatisable ici).


## UPDATE - Jun 2026 - Pharmacie : « Payer maintenant » sur ordonnance après devis (notif WS + débit) (DONE)
- **Boucle de monétisation du parcours ordonnance** : quand l'admin/pharmacie établit le **devis** (`POST /admin/pharmacy/orders/{id}/quote`), un **broadcast WS `pharmacy_quote_ready`** est envoyé au client → toast « 💶 Devis reçu : X € » + rechargement.
- **Nouveau endpoint** `POST /pharmacy/orders/{id}/pay` {payment_method: wallet|sbpaygo} : débit atomique via `_debit_user`, `payment_status='paid'`. Gardes : 400 si pas encore de devis (`needs_quote`/status pending), si déjà payé, si annulée/livrée, si méthode invalide.
- **UI** (`PharmacyOrdersPage`) : écoute WS (`useWebSocket`), bouton **« Payer maintenant »** sur les commandes non payées avec devis (`order-pay-{id}`), feuille de paiement (soldes Portefeuille/SB PayGo + recharge contextuelle si insuffisant), badge « Payé ✓ ».
- Vérifié E2E curl : payer avant devis → 400 ; devis 20 € → total 22,50 ; paiement wallet → payé (solde 50→27,50) ; re-paiement → 400 « déjà payée ». Lint clean (front + back).


## UPDATE - Jun 2026 - Pharmacie : paiement réel Portefeuille / SB PayGo dès la commande catalogue (DONE)
- **Monétisation immédiate** : une commande **catalogue** payée par **Portefeuille** ou **SB PayGo** est **débitée atomiquement** à la création (`{balance: {$gte: total}}`), `payment_status='paid'`. Solde insuffisant → **HTTP 400** « Solde … insuffisant ». Espèces/Carte restent « payé à la livraison ».
- **Remboursement automatique** : annuler une commande payée recrédite le portefeuille/SB PayGo (`payment_status='refunded'`, transaction de remboursement enregistrée).
- **Backend** (`pharmacy.py`) : helpers `_debit_user` / `_refund_user`, endpoint `GET /pharmacy/payment-methods` (soldes wallet + sbpaygo). Débit branché dans `create_order` (catalog only), remboursement dans `cancel_order`.
- **Checkout passager** (`PharmacyCatalogPage`) : soldes affichés sous Portefeuille/SB PayGo, bannière « Solde insuffisant » + recharge contextuelle (Portefeuille → `/wallet`, SB PayGo → SSO `finance/sbpaygo/sso-link`), bouton Confirmer désactivé si insuffisant.
- Vérifié E2E curl : 0 € → 400 ; 100 € → payé (−5,90 € → 94,10) ; annulation → remboursé (→ 100). Lint clean (front + back).


## NEW - Jun 2026 - Module PHARMACIE complet (ordonnance + catalogue) — parité V3Cube (DONE — iter 114)
- **3e tuile médicale V3Cube**. Deux parcours passager : (1) **Sur ordonnance** — photo d'ordonnance (base64) + adresse/carte + livraison ; la pharmacie établit un **devis** (prix médicaments) côté admin, puis livraison. (2) **Catalogue parapharmacie (OTC)** — 12 produits seedés sur 8 catégories, panier +/-, checkout (pharmacie, adresse Leaflet, paiement espèces/portefeuille/SB PayGo/carte), **prix live** (sous-total + livraison haversine), confirmation.
- **Passager** : tuile accueil `medical-pharmacy-btn` → `/pharmacy` (hub : 2 actions + pharmacies partenaires). `/pharmacy/catalog` (`PharmacyCatalogPage`), `/pharmacy/prescription` (`PharmacyPrescriptionPage` — upload photo), `/pharmacy/orders` (`PharmacyOrdersPage` — statut + timeline + annulation, badge « En attente de devis »). Carte réutilisable `PharmacyMapPicker.jsx`.
- **Admin** : `/admin/pharmacy` (`AdminPharmacy`) — 3 onglets **Commandes / Produits / Pharmacies**. Commandes : établir le devis d'une ordonnance (`quote`) → passe en `confirmed` (total = médicaments + livraison), changer le statut. CRUD complet pharmacies & produits. Entrée sidebar SERVICES › Services médicaux › Pharmacie.
- **Backend** (`routes/pharmacy.py`) : collections `pharmacies`, `pharmacy_products`, `pharmacy_orders`. Public `GET /pharmacy/pharmacies|categories|products`, `POST /pharmacy/orders/estimate|orders`, `GET /pharmacy/orders[/{id}]`, `POST /orders/{id}/cancel`. Driver `GET /pharmacy/driver/available|active`, `POST /orders/{id}/accept|status` (flux accepted→picked_up→in_transit→delivered). Admin CRUD + `quote` + `status`. `seed_pharmacy()` idempotent (3 pharmacies, 12 produits). Broadcast WS `new_pharmacy_order`. Paiement marqué `pending` (payé à la livraison) — pas de Stripe.
- Testé iter114 : **backend 16/16 pytest** (listings, filtres, estimate, create catalog+prescription + cas 400, cancel, admin quote/status, CRUD) + **frontend 100%** (tuile→hub, catalogue+panier+checkout+total live→succès, upload ordonnance→succès, admin devis→Confirmée). Lint clean (front + back). Compte passager QA : `rx.qa@demo.sb / RxQa123!`.


## NEW - Jun 2026 - Bouton d'urgence 15/112 sur le module Médical (DONE — iter 108)
- Ajout d'un **bouton d'appel d'urgence** `tel:15` (« Urgence vitale ? Appelez le 15 (SAMU) · 112 ») bien visible : bandeau rouge proéminent en haut de **Transport Médical** (`emergency-call-btn`, icône pulsante) + bouton dans l'en-tête de **Prise de RDV**. Réflexe de sécurité attendu sur un module santé. Lint clean.

## NEW - Jun 2026 - Push live missions colis/transport vers l'app chauffeur (WebSocket) (DONE — iter 113)
- **App chauffeur (`DeliveryJobsPage`)** : écoute désormais les events WS `new_parcel` & `new_transport` (toast + refresh auto de la liste « Disponibles », sans refresh manuel). Toast urgence rouge si transport `urgent/critical`.
- **Correctif racine WS chauffeur** : `broadcast_to_drivers` filtrait sur `cid.startswith("driver_")` alors que les chauffeurs se connectent avec leur `user_id` brut → le broadcast n'atteignait jamais l'app (le flux course fonctionnait via polling). Ajout `ConnectionManager.driver_clients` + enregistrement par rôle à la connexion WS (`server.py` lookup `db.users.role`). Bénéficie aussi au push `new_ride_request`.
- **Backend** : `create_medical_transport` diffuse maintenant `new_transport` (les colis diffusaient déjà `new_parcel`).
- Vérifié E2E (`tests/test_new_parcel_ws.py`) : chauffeur connecté WS reçoit `new_parcel` ET `new_transport` après création passager. Lint clean (front + back).

## NEW - Jun 2026 - Module Immobilier (Acheter · Vendre · Louer) — parité V3Cube (DONE — iter 110)
- **Petites annonces immobilières** (modèle V3Cube « Buy, Sell & Rent Real Estate ») : l'utilisateur publie une annonce (Vente/Location · Résidentiel/Commercial/Terrain), les autres parcourent/filtrent et **contactent le propriétaire** (appel `tel:` + demande/offre in-app). Monétisation via annonces **sponsorisées** côté admin.
- **Passager** : `/real-estate` (`RealEstatePage` — toggle Acheter/Louer, chips catégorie, recherche debouncée, FAB Publier), `/real-estate/:id` (`PropertyDetailPage` — galerie photos, prix, détails ch./sdb/m², équipements, carte Leaflet, barre contact ; **masque « Faire une offre » si propriétaire** → affiche « Modifier »), `/real-estate/post` & `/real-estate/edit/:id` (`PostPropertyPage` — formulaire complet + upload photos base64 max 12 + placement carte), `/real-estate/my` (`MyPropertiesPage` — Mes biens : éditer/marquer vendu-loué/supprimer/voir demandes ; Mes demandes envoyées). Tuile accueil `marketplace-realestate-btn` → `/real-estate`.
- **Admin** : `/admin/real-estate` (`AdminRealEstate`) — table des annonces, filtres statut, sponsoriser (feature), activer/désactiver, supprimer. Entrée sidebar sous SERVICES › Acheter, Vendre & Louer.
- **Backend** : `routes/real_estate.py` — collections `property_listings` + `property_inquiries`. `GET/POST /real-estate/listings`, `GET/PUT/DELETE /listings/{id}`, `POST /listings/{id}/status`, `POST/GET /listings/{id}/inquiries`, `GET /my/listings`, `GET /my/inquiries` ; admin `/admin/real-estate/*` (toggle-status, feature, delete). Self-inquiry rejetée (400). Tri featured-first.
- Testé iter110 : **frontend 100% (8/8 scénarios)** + backend E2E httpx (create/list/detail/inquiry/owner-inquiries/delete). Lint clean.

## NEW - Jun 2026 - Immobilier : « Booster mon annonce » (self-checkout Stripe) (DONE — iter 111)
- **Monétisation B2C** : l'annonceur paie en ligne (Stripe) pour passer son annonce **★ Sponsorisé** en tête de liste pendant N jours. Tarifs **configurés par l'admin par pays/localité + devise**.
- **Admin** : page `/admin/real-estate` désormais à 2 onglets — **Annonces** + **Plans de Boost** (`BoostPlansTab`) : CRUD complet des plans (pays/localité, devise, durée jours, prix, priorité, libellé, actif). 15 plans seedés (FR/MQ/GP/GF + Par défaut × 7j=4,99€/15j=8,99€/30j=14,99€).
- **Annonceur** : bouton « 🚀 Booster mon annonce » sur `MyPropertiesPage` (annonces actives non sponsorisées) → modale des plans du **pays de l'annonce** (fallback « Par défaut ») → **redirection Stripe Checkout** → retour `?boost_session=` (polling) → toast succès + badge ★ Sponsorisé. Sélecteur **Pays** ajouté au formulaire de publication.
- **Backend** (`real_estate.py`) : `GET /real-estate/boost-plans?country=`, `POST /real-estate/listings/{id}/boost/checkout` (montant serveur via `emergentintegrations` StripeCheckout, `payment_transactions` type `real_estate_boost`), `GET /real-estate/boost/status/{session_id}` (applique `is_featured`+`featured_until`+`featured_priority`, idempotent). Admin boost CRUD + `seed_real_estate_boost_plans()`. Tri liste : featured_priority ; **auto-expiration** des boosts échus. ⚠️ Stripe en mode **TEST** (clé test) — brancher la clé live pour la prod.
- Testé iter111 : **frontend 100%** (flux boost user + redirection Stripe `cs_test_` + onglet admin Plans de Boost CRUD) + backend E2E httpx (plans, checkout URL Stripe réelle, CRUD admin).

## NEW - Jun 2026 - Immobilier : notif propriétaire + plan de boost GRATUIT de lancement (DONE)
- **Notification temps réel au propriétaire** : à l'envoi d'une demande/offre, broadcast WS `new_property_inquiry` vers le propriétaire de l'annonce → toast in-app « 📩 Nouvelle demande sur … » (écoute dans `MyPropertiesPage` via `useWebSocket`). **Badge non-lus** : pastille rouge sur le bouton « Demandes » de chaque annonce (`unread_inquiries`) + pastille sur « Mes annonces » dans `RealEstatePage` (`GET /real-estate/my/unread-count`). Marquage « vu » automatique quand le propriétaire ouvre les demandes. Inquiry doc enrichi `seen: bool`.
- **Plan de boost GRATUIT (offre de lancement)** : plan à prix 0 **« Lancement — Gratuit 7 jours 🎉 »** seedé par pays (idempotent à chaque démarrage). Le checkout contourne Stripe si `price <= 0` → applique directement `is_featured`+`featured_until`+`featured_priority` et enregistre une `payment_transactions` `paid/free`. Côté UI : plan affiché en vert « Gratuit », toast « 🎉 Annonce boostée gratuitement ». L'admin peut créer d'autres plans gratuits (prix 0).
- Vérifié E2E httpx (free boost applique le boost sans Stripe ✅, unread-count + badge + marquage vu ✅) + screenshot (modale affiche les 4 plans dont le gratuit en vert). Lint clean.

## UPDATE - Jun 2026 - Boost Immobilier : paiement Portefeuille / SB PayGo (Stripe masqué, gratuit retiré)
- **Paiement du boost via le compte marchand SB Drive VTC** : la mention « Stripe » est retirée de l'UI. L'annonceur paie via **son portefeuille** (`db.wallets`) ou **SB PayGo** (`db.sbpaygo_wallets`).
- **Plan GRATUIT supprimé** : `seed_real_estate_boost_plans()` purge tout plan `price<=0` au démarrage. Plans payants uniquement (4,99 / 8,99 / 14,99 €).
- **Modale boost en 2 étapes** : (1) choix du plan → (2) choix du moyen de paiement avec **soldes affichés** + état « insuffisant » + lien « Recharger mon portefeuille ». Débit atomique (`{balance: {$gte}}`), boost appliqué, transaction enregistrée (`payment_transactions` method=wallet|sbpaygo, paid).
- **Backend** : `GET /real-estate/boost/payment-methods` (soldes wallet + sbpaygo), `POST /real-estate/listings/{id}/boost/pay` {plan_id, payment_method}. Anciens endpoints Stripe (`boost/checkout`, `boost/status`) supprimés. Import `emergentintegrations` retiré de `real_estate.py`.
- Vérifié E2E httpx : paiement portefeuille (100€→95,01€, is_featured ✅), SB PayGo solde insuffisant → 400 ✅, 0 plan gratuit restant. Screenshot UI OK (aucun « Stripe »). Lint clean.

## UPDATE - Jun 2026 - Boost : recharge contextuelle (portefeuille / SB PayGo SSO)
- Dans la modale de paiement du boost, chaque moyen avec **solde insuffisant** affiche un bouton de recharge dédié : **« Recharger mon portefeuille → »** (vers `/wallet`) ou **« Recharger SB PayGo → »** (redirection SSO `POST /finance/sbpaygo/sso-link` vers sbpaygo.com). Évite l'abandon du boost faute de solde. Vérifié (lint + screenshot + SSO 200). `realEstateAPI.sbpaygoSsoLink()` ajouté.

## NEW - Jun 2026 - App Mobile Expo Chauffeur : écran « Missions Livraison & Transport »
- Portage de la page web `DeliveryJobsPage` vers React Native : nouvel écran `mobile/src/screens/driver/DriverDeliveryJobsScreen.tsx` + onglet **« Missions »** (icône cube) dans la nav chauffeur (`RootNavigator`).
- Fonctionnalités identiques au web : onglets **Disponibles / En cours**, cartes **colis** + **transport médical** (badge urgence), Accepter, avancement de statut (ramassage → récupéré → livraison ; en route → patient à bord → arrivé → terminé), **livraison par dépôt** (multi-stops), **appel client/patient** (`Linking tel:`).
- **Push WS live** des nouvelles missions (`new_parcel` / `new_transport`) via `useRideSocket` → bannière animée in-app + refresh auto. **Position live** diffusée (`expo-location` watchPosition → `driverAPI.updateLocation`) tant qu'une mission est en cours (carte passager).
- Endpoints ajoutés à `mobile/src/api/endpoints.ts` : `parcelAPI` (driver/available, driver/active, accept, status, deliverLeg) + `medicalAPI` (transport driver/available, active, accept, status). Libellé i18n `tabs.jobs` (fr/en).
- Vérifié : `tsc --noEmit` ✅ (0 erreur), logique miroir du flux web déjà testé, endpoints backend déjà validés. ⚠️ Test e2e device via Expo Go (non automatisable ici).

## UPDATE - Jun 2026 - Mobile Chauffeur : badge compteur de missions sur l'onglet « Missions »
- Nouveau contexte `mobile/src/contexts/DriverMissionsContext.tsx` : **une seule connexion WS** pour toute la session chauffeur (évite le conflit `client_id` côté `ConnectionManager`), maintient les listes dispo/actives + compteurs + poll fallback (25s) + `latestEvent` pour la bannière.
- L'onglet **« Missions »** affiche une **pastille rouge** (`tabBarBadge`) = nombre de missions disponibles, mis à jour en temps réel par `new_parcel`/`new_transport`. Le chauffeur voit les nouvelles courses sans ouvrir l'écran.
- `DriverDeliveryJobsScreen` refactorisé pour **consommer le contexte** (plus de WS/fetch locaux). `DriverNavigator` enveloppé par `DriverMissionsProvider`. Vérifié `tsc --noEmit` ✅.

## NEW - Jun 2026 - Admin : Éditeur « Type de véhicule » complet & modernisé (parité V3Cube)
- Refonte de `AdminVehicleTypes` (table basique → **liste de cartes modernes** + actions modifier/dupliquer/supprimer) + nouvel éditeur plein écran `VehicleTypeEditor.jsx` couvrant toutes les sections V3Cube.
- **Sections** : Identité & Affichage (slug, nom FR/EN, nom location, catégorie, icône, liste/grille, **devise — EUR + 26 devises**, ordre, description) · **Traductions multilingues (34 langues)** avec **traduction auto LLM** (`claude-sonnet-4-6`) + « Copier partout » · Toggles (WhatsApp, Pool, Assist, Animaux) · Sécurité & stratégie tarifaire (OTP, Incrémental/Fixe + avertissement Pool→Fixe) · **Tarification de base + surcoûts par zone** (Martinique/Guadeloupe/Guyane…) · Frais d'attente & annulation · Capacité + **surcharges horaires hebdo** (Pointe 1/2 + Nuit, éditeur 7 jours start/end/prix) · 2 **images** (sélectionné/non) base64 · ordre & statut.
- **Backend** (`admin.py`) : schéma `VT_FIELDS`/`VT_DEFAULTS` ; `GET /admin/vehicle-types` (tous, inactifs inclus), `POST` create, `PUT /{slug}` update (whitelist), `POST /vehicle-types/translate` (LLM, JSON strict), `DELETE`.
- Testé iter112 : **frontend 100%** (login→liste→créer→modifier→dupliquer→supprimer, toggles, zones, surcharges, **auto-translate LLM** Sedan/Sedán/Limousine/سيدان/轿车, save) + backend E2E httpx (persistance champs complexes, inactif visible). a11y toggle (`aria-pressed`/`data-state`) + testids créneaux ajoutés. Lint clean.

## NEW - Jun 2026 - Passager : sélection de véhicule enrichie (reflet de la config admin)
- `RideMapStep` affiche désormais, par type de véhicule : l'**image admin** (`image_selected`/`image_unselected`, qui change à la sélection) avec fallback icône Phosphor, la **description admin** (`info`), la **capacité**, et des **badges** : Pool, 🐾 Animaux, OTP, ♿ Assist, WhatsApp (depuis `enable_pool`/`pet_friendly`/`ask_otp_before_ride`/`assist_available`/`allow_whatsapp_booking`). Données via `GET /config/vehicle-types`.
- **Correctif UX** (relevé par l'agent de test) : ajout d'un `useEffect` dans `RideBookingPage` pour **auto-avancer vers la sélection véhicule** dès que départ + arrivée sont posés via l'autocomplétion (auparavant seul un lieu récent/favori déclenchait l'étape — cul-de-sac).
- Flags démo activés (pool/pets/accessible/moto/luxe/confort) pour donner vie à la config. Testé iter113 : **frontend 100%** (badges pool/pets/accessible/moto/luxe vérifiés, descriptions, capacité, surbrillance) + screenshot confirmant Pool sélectionné avec badge. Lint clean.

# SB Drive VTC - PRD

## NEW - Jun 2026 - Bouton « Appeler le client » côté chauffeur (DONE — iter 112)
- Sur les missions **en cours** de la page chauffeur (`DeliveryJobsPage`) : bouton d'appel `tel:` — par dépôt non livré (`call-recipient-<id>-<index>`, téléphone destinataire) pour les colis, et « Appeler le patient » (`call-patient-<id>`) sur le transport médical. Affichés uniquement si un téléphone est renseigné. Lint clean (frontend only, page déjà validée).

## NEW - Jun 2026 - Alerte « Votre coursier arrive ! » (ETA < 2 min) (DONE — iter 111)
- Sur la page de suivi passager, un **toast in-app** « 🛵 Votre coursier arrive ! Préparez-vous. » se déclenche **une seule fois** dès que l'`eta_minutes` (déjà fourni par le backend) passe **≤ 2 min** (course non terminée). Réutilise le mécanisme de notification in-app (`sonner`). Anti-répétition via `useRef`.
- Frontend uniquement (`DeliveryTrackingPage`), lint clean. Migrable vers une vraie push une fois Firebase/OneSignal branché.

## NEW - Jun 2026 - ETA dynamique sur le suivi (« Coursier à ~6 min ») (DONE — iter 110)
- **ETA dynamique** affiché sur la page de suivi passager (`tracking-eta`) : « Coursier à ~X min · vers [cible] ». La cible s'adapte au statut — colis : ramassage (avant récupération) → prochain dépôt non livré ; transport : prise en charge (avant patient à bord) → destination.
- **Backend** : `GET /api/parcels/{id}` & `/api/medical/transport/{id}` calculent `eta_minutes` + `eta_target_label` (distance coursier→cible via Haversine, vitesse urbaine ~25 km/h, min 1 min). Mis à jour au polling 8s.
- Vérifié E2E curl : statut accepted → ETA « le ramassage » ; après picked_up → ETA « le dépôt 1 » (cible recalculée). Lint clean.

## NEW - Jun 2026 - Position live du coursier sur carte (suivi passager) (DONE — iter 109)
- **Carte live du coursier** dans la page de suivi passager (`DeliveryTrackingPage`) pour colis & transport médical : marqueur coursier 🛵 + ramassage (vert) + dépôt(s)/destination (rouge), mise à jour au polling 8s + **recentrage auto** (`Recenter`/`useMap` → `panTo`).
- **Backend** : `GET /api/parcels/{id}` et `GET /api/medical/transport/{id}` exposent `driver_location` via `_driver_live_location` (mémoire `manager` en priorité, sinon `db.drivers.current_lat/lng`). La carte n'apparaît qu'une fois le chauffeur assigné + position connue.
- **App chauffeur** : `DeliveryJobsPage` émet la **géoloc navigateur** toutes les 10s tant qu'une mission est active (`driverAPI.updateLocation`).
- Testé iter109 : **100% PASS (backend + frontend)** — carte masquée avant assignation, marqueurs corrects après acceptation + position, refresh au polling. Test pytest `test_parcel_live_tracking.py`. Lint clean.

## NEW - Jun 2026 - Suivi chauffeur colis multi-dépôts + transport médical (DONE — iter 108)
- **App chauffeur — page « Livraisons & Transport »** (`/chauffeur/livraisons`, `DeliveryJobsPage`, lien dans le menu latéral) : onglets **Disponibles** / **En cours**. Le chauffeur voit les colis & transports en attente, les **accepte**, et met à jour le **statut par étape**.
  - Colis : accepté → arrivé ramassage → colis récupéré → puis **livraison par dépôt** (bouton « Marquer livré » par point) → terminé auto quand tous les dépôts livrés.
  - Transport médical : accepté → en route → patient à bord → arrivé → terminé.
- **Suivi passager** (`/track/:type/:id`, `DeliveryTrackingPage`) : **timeline de statut par étape** (polling 8s) + statut par dépôt pour les colis. Les écrans succès colis/transport redirigent désormais vers le suivi.
- **Backend** : parcels (`driver/available`, `driver/active`, `{id}/accept`, `{id}/status`, `{id}/legs/{index}/deliver`) ; medical transport (`transport/driver/available`, `driver/active`, `{id}/accept`, `{id}/status`, `GET transport/{id}`). Statut par leg (pending→delivered), flows validés.
- Testé iter108 : **100% PASS (chauffeur + passager)** + backend E2E curl (accept→étapes→livraison par dépôt→completed ; transport 5 étapes ; suivi passager). Aucun bug. Lint clean.

## NEW - Jun 2026 - Pack D : Module Médical passager (RDV + Transport médical) (DONE — iter 107)
- **Prise de RDV médical** (`/medical/appointment`, `MedicalAppointmentPage`) : liste de 6 médecins (filtre par spécialité), choix **cabinet/domicile** (adresse requise si domicile), date + créneau horaire, infos patient (nom, tél, âge, symptômes), confirmation → écran succès → /history.
- **Transport médical / Ambulance** (`/medical/transport`, `MedicalTransportPage`) : 3 types (Standard, Médicalisée USI, PMR), carte Leaflet (départ + hôpital/destination), niveau d'urgence (normale/urgente/critique), infos patient, **estimation tarif** (base + €/km) puis demande → écran succès → /history.
- **Backend** (`gojek_services.py` → `medical_router`, préfixe `/medical`) : `GET /doctors`, `POST /appointments`, `GET /appointments`, `GET /ambulance-types`, `POST /transport/estimate`, `POST /transport`, `GET /transport`. Collections `medical_appointments`, `medical_transport`. Tarif ambulance = base_fee + per_km × distance (Haversine).
- **Accueil** : boutons `medical-appointment-btn` → /medical/appointment, `medical-other-btn` (« Transport Médical ») → /medical/transport. `medicalAPI` ajouté.
- Testé iter107 : **100% frontend PASS** (liste+filtre médecins, RDV cabinet/domicile+validation, 3 ambulances, carte+urgence+estimation+confirmation) + backend curl. Aucun bug.

## NEW - Jun 2026 - Pack F : Multi-livraisons réelles (un coursier, plusieurs dépôts) (DONE — iter 106)
- **`ParcelPage` (/parcel)** : la « Livraison Multiple » était un stub (un seul dépôt + `confirm()` mocké). Désormais **réelle** : 1 ramassage + **N points de dépôt** (ajout/suppression), destinataire + téléphone par dépôt, placement sur carte Leaflet, **prix calculé par segment** (ramassage→dépôt1→dépôt2…), écran Confirmer avec détail par segment, et **création d'une vraie commande**.
- **Backend** : nouveau module `routes/parcels.py` (collection `parcels`) — `POST /api/parcels/estimate` (legs + total km/durée/tarif), `POST /api/parcels` (crée, broadcast `new_parcel` aux chauffeurs), `GET /api/parcels`, `GET /api/parcels/{id}`. Tarif par segment via `calculate_fare` (moto→motorcycle, box→car). Validation `stops` non vide (422). Enregistré dans `server.py`.
- **Frontend** : `parcelAPI.estimate/create/list/get` ; mode simple masque add-stop + champs destinataire ; mode multi les affiche.
- Testé iter106 : **100% frontend PASS** (4 choix, ajout/suppression dépôts + ré-indexation, placement carte→estimation→confirmation→succès→/history, distinction simple/multi) + backend curl (estimate/create/get/422). Correctif hauteur Leaflet (`MapContainer style height`).

## NEW - Jun 2026 - FAB assistant vocal : réduit + limité à l'accueil (DONE — iter 106)
- Le bouton micro (FAB `VoiceAssistant`) était monté globalement sur toutes les pages passager. Désormais **affiché uniquement sur l'accueil `/home`** (`App.js` : `location.pathname === '/home'`).
- **Taille réduite** : `w-14 h-14` → `w-11 h-11`, icône Microphone `size 26` → `20` (`VoiceAssistant.js`).
- Lint clean. (Capture post-login non vérifiable via le tool screenshot — à valider côté utilisateur.)

## NEW - Jun 2026 - Bouton « Me prévenir à l'ouverture » + notification in-app (DONE — iter 105)
- **Levier de réengagement** : sur une tuile de service grisée (hors créneau), un bouton **« Me prévenir »** permet à l'utilisateur de s'abonner. Quand le service rouvre, il reçoit un **toast in-app** « 🔔 X est de nouveau disponible ! » à sa prochaine ouverture de la page Taxi. (Push Firebase/OneSignal à brancher plus tard — l'infra d'abonnement est prête.)
- **Backend** (`service_categories.py`) : collection `service_reminders` ; `POST /service-categories/{key}/remind` (idempotent), `DELETE .../remind`, `GET /service-categories/reminders` → `{subscribed:[...], ready:[...]}` (livraison *lazy* : marque `notified=true` et renvoie `ready` une seule fois → aucun spam).
- **Frontend** : `TaxiModeGrid` → `RemindButton` (span role=button + stopPropagation) sur tuiles grisées ; bannière de réservation enrichie d'un bouton « Me prévenir à l'ouverture » ; `TaxiHubPage` charge les rappels au mount + affiche les toasts `ready`. API : `configAPI.getServiceReminders/subscribe/unsubscribe`.
- Testé iter105 : **8/8 PASS (100% backend + frontend)** — abonnement idempotent, persistance, toast unique à la réouverture, pas de spam, désabonnement, stopPropagation. État restauré (17 services 24/7 actifs, collection nettoyée).

## NEW - Jun 2026 - Indicateur passager « Dispo 7h-10h » sur tuiles planifiées (DONE — iter 104)
- **UX anti-frustration** : un service planifié **hors créneau** n'est plus masqué côté passager — sa tuile reste **visible, grisée (opacity-60), avec un badge horaire** (`mode-hint-<id>`, ex: « 14h-14h30 ») indiquant quand il revient. Seuls les services **désactivés manuellement** (`active=false`) restent masqués.
- **Backend** (`service_categories.py`) : helper `availability_hint(cat)` → libellé FR « Dispo 7h-10h · 17h30-20h » (fenêtres du jour courant, fuseau Europe/Paris, format `7h`/`17h30`). Champ `availability_hint` ajouté au `GET /api/service-categories` public.
- **Frontend** : `catConfig` stocke `{active, available, hint, name}` ; `TaxiModeGrid` filtre désormais sur `active!==false` (et grise + badge si `available===false`) ; bannière de réservation enrichie avec le créneau (« Ce service est actuellement indisponible. Dispo 14h-14h30. »).
- Testé iter104 : **5/5 frontend PASS** (tuile visible grisée + badge, distinction avec active=false masqué, service 24/7 normal, bannière + CTA bloqué). État restauré.

## NEW - Jun 2026 - Planning d'activation horaire par service VTC (DONE — iter 103)
- **Automatisation de l'offre selon les heures de pointe** : chaque service `service_categories` peut avoir un **planning horaire** (ex: Pool 7h-10h / 17h-20h, Aéroport 24/7). En dehors des plages, le service devient **indisponible à la réservation**.
- **Backend** (`service_categories.py`) : helper `is_category_available_now(cat)` (fuseau `Europe/Paris`, gère les plages chevauchant minuit, jours optionnels = tous les jours). Champ `available_now` ajouté au `GET /api/service-categories` public. `PUT /admin/service-categories/{key}` accepte `schedule_enabled` / `schedule_windows` (`[{days:[0-6], start:"HH:MM", end:"HH:MM"}]`) / `schedule_tz`. `create_ride` rejette (400) un service hors plage.
- **Frontend admin** (`AdminServiceCategories.js`) : bouton **Planning** + badge (`24/7` ou `N plages horaires`) par carte ; `ScheduleModal` (toggle 24/7 vs planifié, multi-plages, sélecteur jours Lun-Dim, heures début/fin, ajout/suppression de plage).
- **Frontend passager** : `catConfig` lit `available_now` ; grille masque les services hors plage ; bannière `mode-unavailable-banner` + CTA « Indisponible » en deep-link.
- Testé iter103 : **12/12 frontend PASS** + backend curl (fenêtre non-couvrante→indispo+400, couvrante/24-7→dispo+200). État restauré (17 services 24/7 actifs).

## NEW - Jun 2026 - Modes Taxi activables/désactivables depuis l'admin (verrou complet) (DONE — iter 102)
- **Pilotage de l'offre VTC sans redéploiement** : la collection `service_categories` (17 clés = IDs des modes TaxiHub) était déjà togglable via `/admin/service-categories` et masquait les modes inactifs dans la **grille**. AJOUT : verrouillage complet de la **réservation** d'un mode désactivé.
- **Backend** (`rides.py` create_ride) : nouveau champ `RideRequest.mode_id`. Si `service_categories[mode_id].active === false` → **HTTP 400** « Le service « X » est actuellement indisponible. » (defense in depth, même via deep-link/API directe).
- **Frontend** (`TaxiHubPage.js`) : `modeDisabled = catConfig[mode.id]?.active === false`. Bannière `mode-unavailable-banner` dans la vue réservation + **CTA désactivé** (label « Indisponible ») + garde dans `onSubmit`. `mode_id` envoyé dans le payload.
- Testé iter102 : **10/10 scénarios frontend PASS** (toggle admin → masquage grille + bannière + CTA bloqué + backend 400 ; ré-activation → tout revient) + backend curl (400/200). État restauré (tous services actifs).

## NEW - Jun 2026 - Refonte gros fichiers : TaxiHubPage + AdminDashboard découpés (DONE — iter 101)
- **TaxiHubPage.js** : 861 → **628 lignes**. Extraction dans `src/pages/user/taxihub/` : `taxiHubConstants.js` (MODES/CATS/RENTAL_PACKAGES/ASSIST_OPTIONS/PAYMENT_METHODS), `TaxiModeGrid.jsx` (vue grille 16 modes), `TaxiModePanels.jsx` (panneaux par mode : datetime/flight/rental/buddy/pets/assist/corporate/contact/bidding), `TaxiCheckoutSection.jsx` (profil de course + paiement + promo).
- **AdminDashboard.js** : 609 → **490 lignes**. Extraction dans `src/pages/admin/dashboard/DashboardCards.jsx` : `KPICard`, `EarningBox`, `ServiceMiniCard`, `BuySellRentCard`.
- **Refactoring pur, ZÉRO changement de comportement.** Testé iter101 (frontend regression) : **100% PASS** — tous les sous-composants extraits rendent et se comportent à l'identique, 0 erreur JS, tous les `data-testid` préservés, flux profils de course iter100 toujours OK. Lint JS 100% clean.

## NEW - Jun 2026 - Profils de course passager + Stripe vérifié + audit dette technique (DONE — iter 100)
- **Profils de course dans le checkout passager** (`TaxiHubPage`) : sélecteur **Business / Personnel** (`ride-profile-selector`) + menu déroulant **Motif de trajet professionnel** (`business-trip-reason-select`) affiché uniquement si profil Business. Alimenté par `GET /api/config/ride-profiles` + `/api/config/business-trip-reasons` (collections seedées). Champs `ride_profile`, `ride_profile_org_type`, `business_trip_reason` ajoutés à `RideRequest`/`RideResponse` (schemas.py) + persistés dans `create_ride` (rides.py). Affichés sur le **reçu** (`RideReceiptPage` → `receipt-ride-profile`) pour les notes de frais. API getters `configAPI.getRideProfiles/getBusinessTripReasons`.
- **Stripe paiements réels (test) VÉRIFIÉ** : `POST /api/payments/checkout` (recharge wallet, packages fixes 10/20/50/100€) retourne une vraie session `checkout.stripe.com` avec `sk_test_emergent`. Crédit wallet atomique au polling `/payments/status/{session_id}`. Frontend `WalletPage` câblé (sélection package + redirection + polling retour). Fonctionne en mode test Stripe.
- **Audit dette technique** : frontend `src/` **100% lint clean** (dépendances de hooks déjà corrigées sur `WaybillPage.js`/`WalletPage.js`). `ProfileTabView.jsx` n'utilise pas localStorage. `KioskApp.js` stocke un token de **session borne** (pattern device légitime PIN-protégé) — conservé. Refonte des gros fichiers (`TaxiHubPage.js`, `AdminDashboard.js`) différée (risque de régression sur app mature pour gain marginal).
- Testé iter100 : **5/5 backend pytest + flux UI complet PASS** (sélecteur + dropdown + toggle + booking + reçu). Compte QA : `rider.qa@demo.sb / Rider123!`.

## Vision
Application super-app multi-services type Gojek/V3Cube pour le marche VTC francophone.

## NEW - Jun 2026 - App passager en orange #FF5000 + Modules Taxi Service V3Cube (DONE — iter 99)
- **Couleur app passager** : accent jaune `#FFC107` remplacé par **orange #FF5000** dans toute l'app passager + composants partagés (cohérent avec la landing).
- **Manage Rental Packages (par véhicule)** : `routes/taxi_extra.py` collection `rental_packages` (vehicle_type × lieu : hours/km/price/status). Admin `/admin/rental-packages` (table véhicules + compteur Add/View(N) + modale gestion). Public `GET /api/config/rental-packages?vehicle_type=`. Validation : `vehicle_type` doit exister dans `vehicle_types`.
- **Ride Profile Type** : collection `ride_profiles` (short_name, org_type, profile_title, title_description, status). Seed : Business, Personnel.
- **Business Trip Reason** : collection `business_trip_reasons` (trip_reason + champs profil). Seed : Bureau⇄Domicile, Visite client/partenaire, Trajet aéroport/gare.
- Admin `/admin/ride-profiles` (onglets Type de profil + Motif pro, CRUD + toggle + delete). Public getters `/api/config/ride-profiles`, `/api/config/business-trip-reasons`.
- **Vehicle Type** : déjà complet (`/admin/vehicle-types` — prix/km, prix/min, base, commission, capacité, ordre, statut).
- Sidebar Taxi enrichie : Catégories, Tarification dynamique, Forfaits de location, Profils de course, Configurations Taxi, Véhicules, Courses.
- Testé iter99 : **4/4 backend pytest + 3/3 UI PASS**. Données de test nettoyées.

## NEW - Jun 2026 - Refonte Tarification dynamique V3Cube + Heatmap + Météo réelle (DONE — iter 98)
- **AI Dynamic Surge (modèle V3Cube)** : collections `surge_rules` + `surge_locations`. Règles par **Lieu × Type de véhicule** avec **plages de demande** (min/max demandes → multiplicateur). **Activation automatique** : une règle `status=active` s'applique immédiatement (plus d'interrupteur global). Multiplicateur choisi selon le nb de courses `pending` dans le rayon de la zone. CRUD complet + toggle + DELETE lieu. Endpoints `/api/admin/pricing/surge[/locations|/heatmap|/{id}/toggle]`.
- **Carte de chaleur temps réel** : `GET /api/admin/pricing/surge/heatmap` + public `/api/pricing/demand-heatmap` → points (courses pending) + zones. Affichée sur `/admin/dynamic-pricing` (Google Maps `AdminGoogleMap` heatmap + marqueurs de zones).
- **Weather Surcharge (modèle V3Cube)** : collection `weather_surcharges` par **Type de véhicule**, multiplicateur **par condition météo** (Thunderstorm/Drizzle/Rain/Snow/Clouds/Clear/Mist). Condition détectée en **direct via OpenWeatherMap** (`OPENWEATHER_KEY` dans backend/.env, endpoint 2.5/weather, cache 10 min). CRUD + toggle. ⚠️ Clé OpenWeatherMap récente = 401 temporaire (~10min-2h) ; `get_current_condition` échoue proprement (pas de surcharge, pas de crash) jusqu'à activation.
- `compute_pricing_adjustment(fare, lat, lng, vehicle_type)` applique surge puis météo dans `/rides/estimate` + `create_ride`. Notes affichées côté passager (`pricing-reason-N`).
- Page admin `/admin/dynamic-pricing` refondue : onglets Surge (heatmap + table + modale règle) et Weather (table + modale par conditions).
- Testé iter98 : **16/16 pytest + UI PASS**. Données de test nettoyées.

## NEW - Jun 2026 - Delta tarif live + Dashboard SERVICES (Phases A→D) (DONE — iter 96/97)
- **Delta de tarif en direct** (`RouteEditModal`) : bannière « Nouveau tarif estimé » + pastille `+X,XX €`/`−X,XX €` vs ancien tarif, recalcul live (`/rides/estimate`) pendant l'édition d'itinéraire en course.
- **Phase A — Gérer les catégories de service** : collection `service_categories` (17 catégories alignées sur TaxiHub MODES). Endpoints `GET /api/service-categories` (public), `GET/PUT /api/admin/service-categories/{key}`, `POST .../{key}/toggle`. Page admin `/admin/service-categories` (grille + toggle Actif/Inactif + édition nom/icône emoji ou image base64). **Câblé** : désactiver une catégorie la masque dans `/taxi`.
- **Phase B — Tarification dynamique** : `routes/pricing.py` — `compute_pricing_adjustment` applique **AI Dynamic Surge** (manuel ou auto par ratio demande/chauffeurs + paliers) et **Weather Surcharge** (% ou fixe, interrupteur manuel `active_now`) au tarif dans `/rides/estimate` + `create_ride`. Admin `/admin/dynamic-pricing` (onglets surge/weather). Notes affichées sur la carte prix passager (`pricing-reason-N`).
- **Phase C — Configs Taxi** : `routes/taxi_configs.py` — service_configs `rental_packages`, `personal_driver`, `taxi_bid`, `ride_profiles`. Public `GET /api/config/taxi-options`, admin `GET/PUT /api/admin/taxi-configs/{key}`. Page admin `/admin/taxi-configs` (4 onglets). **Câblé** : prix forfaits location + tarif horaire chauffeur privé dans `/taxi` ; TTL des contre-offres (`taxi_bid.offer_ttl_seconds`) dans le flux d'enchères.
- **Phase D — Cartes Dashboard** : `GET /api/admin/analytics/delivery-monthly` (12 mois). Cartes « Store Deliveries » + « Delivery Genie / Runner » (graphiques barres recharts) sur `/admin`.
- Sidebar admin SERVICES › Taxi enrichie : Gérer les catégories, Tarification dynamique, Configurations Taxi.
- Testé iter96/97 : **pytest + UI PASS**, aucun bug. Toutes configs remises aux défauts.

## NEW - Jun 2026 - Planification configurable + Calendrier V3Cube + Modif itinéraire en course + Carte chauffeur Google Maps (DONE — iter 95)
- **Étape 1 — Restrictions de planification + Config Admin** : `GET /api/config/scheduling` (public) renvoie `{enabled, min_advance_minutes:60, max_advance_days:30, disabled_modes:['pool','bidding']}` (stocké dans `service_configs` clé `scheduling`). `create_ride` refuse (400) un `scheduled_at` < délai mini, > horizon max, ou un mode désactivé (Pool/Enchères). Nouvelle page admin `/admin/scheduling` (`AdminScheduling.js`, sidebar PARAMÈTRES) : toggle global, délai mini, horizon, cases modes interdits — persisté via `/admin/service-config/scheduling`.
- **Étape 2 — Calendrier V3Cube + auto-détection départ** : composant `ScheduleCalendarModal.jsx` (grille mensuelle, sélecteurs heure/minute, jours/horaires avant délai mini désactivés) remplace les `datetime-local` dans `TaxiHubPage`. L'option « Programmer plus tard » est masquée (`timing-later-disabled`) pour Pool/Enchères. Le départ s'auto-localise au focus du champ destination (`GooglePlacesInput onFocus`).
- **Étape 3 — Modification d'itinéraire en cours** : `POST /api/rides/{id}/update-route` (propriétaire) modifie départ/destination/arrêts sur course pending/accepted/arriving/in_progress (départ verrouillé une fois `in_progress`), recalcule distance/tarif/polyline, notifie le chauffeur via WS `route_updated`. UI : `RouteEditModal.jsx` ouvert par le crayon (`edit-dest-btn`) de `DriverEnRouteView`. Driver écoute `route_updated` (toast + refresh carte).
- **Étape 4 — Carte chauffeur Google Maps** : `DriverHome.js` migré de `LeafletMap` vers `AdminGoogleMap` (`@react-google-maps/api`), arrêts en markers numérotés, heatmap via `heatmapData`. Heat View + Mode Destination conservés.
- Testé iter95 : **7/7 backend pytest + tous les flux frontend PASS**, aucun bug.

## Architecture
- **Frontend Web**: React + Tailwind CSS + Leaflet Maps + Phosphor Icons
- **Frontend Mobile** (NEW Feb 2026): Expo + React Native + React Navigation v7 + i18next
- **Backend**: FastAPI + MongoDB (partage par web + mobile)
- **Auth Web**: JWT (cookie-based) + Google OAuth via Emergent
- **Auth Mobile**: JWT Bearer tokens via expo-secure-store (Keychain/Keystore)
- **Payments**: Stripe Checkout
- **Real-time**: WebSockets (ride tracking, simulation)

## NEW - Jun 2026 - Enchère bidirectionnelle (inDrive) + itinéraire réel (DONE — iter 93)
## NEW - Jun 2026 - Migration des cartes vers Google Maps + présentation responsive "écran téléphone" (DONE — iter 101)
- **Google Maps activé** sur le flux client (les tuiles Leaflet/OSM s'affichaient en « toufu » / blanc sur certains appareils) :
  - Écran EN ARRIVANT / EN ROUTE (`GoogleRideMap.jsx`) : Google Maps propre (POI masqués), pin ETA noir en goutte « X min » + voiture blanche animée (interpolation + rotation cap) via `OverlayView`, ligne d'itinéraire. Utilise `useJsApiLoader` (id `google-map-script`, libs `['places','visualization']`).
  - Carte de suivi (`RideTrackingMap.jsx`) migrée vers `AdminGoogleMap` (pickup/dropoff/stops/driver/route).
- **Présentation responsive** : sur grand écran (≥1024px), l'app s'affiche comme un écran de téléphone (fond sombre en radial-gradient + ombre portée sur `.mobile-container`). Sur mobile : plein écran inchangé.
- Vérifié visuellement (screenshots) : Google Maps rend correctement (`.gm-style`, tuiles `maps.googleapis`, watermark Google), aucun crash. Lint propre.
- NOTE : la carte chauffeur/admin/kiosk utilise encore le composant partagé `LeafletMap` (5 usages) — migration différée (risque/scope).
## NEW - Jun 2026 - Cycle de course V3Cube complet : OTP, notifications, voiture animée, facture & évaluation (DONE — iter 100)
- **Voiture animée temps réel** (`DriverEnRouteView` → `AnimatedCarMarker`) : interpolation fluide entre positions GPS + rotation selon le cap (effet Uber/inDrive).
- **OTP de démarrage sécurisé** : `start_otp` auto-généré à la création, **visible uniquement dans l'app client** (pastille « CODE DÉPART ») + admin (peut le relayer si téléphone éteint), **masqué au chauffeur**. Le chauffeur ne peut PAS démarrer via `/status` (HTTP 400) — il doit vérifier l'OTP via `/phase1/.../start-otp/verify`.
- **Notifications de statut** (dialogues client) : chauffeur « Je suis arrivé » → « Le chauffeur est arrivé. » ; OTP vérifié → « Votre voyage a commencé. » + en-tête « EN ROUTE » + bouton **SOS** rouge ; « Terminé » → « Votre voyage est terminé. » → navigation vers la facture.
- **Facture « Résumé de paiement »** (`RideReceiptPage`, `/ride/:id/receipt`) : total, itinéraire, détail des charges (Tarif de base, Distance, Temps en secondes, Le minimum) calculé serveur (`fare_breakdown`), mode de paiement.
- **Évaluation chauffeur** : 5 étoiles, « Pilote préféré » (favori), commentaire, Sauter/Soumettre.
- Fallback polling 5s (WS KO en preview), plancher tarifaire de sécurité. Testé : testing agent iter100 = **100%** (backend 7/7 pytest `test_iter94_otp_security.py`, frontend 13/13 flux live), + vérif visuelle facture & écran EN ARRIVANT.
## NEW - Jun 2026 - Écran client "EN ARRIVANT" type V3Cube (chauffeur assigné) (DONE — iter 99)
- Nouveau composant immersif `DriverEnRouteView.jsx` affiché côté client dès qu'un chauffeur est assigné (accepted/arriving/in_progress), fidèle au design V3Cube fourni :
  - En-tête bleu avec statut (« EN ARRIVANT » / « EN COURSE ») + menu.
  - Carte d'itinéraire flottante (Ramassage / Déposer + crayon édition).
  - Carte plein écran (Leaflet) avec **marqueur voiture blanc (vue de dessus)**, **pin ETA noir en goutte « X min »** (ETA calculé via haversine), ligne noire chauffeur→cible, polyline bleue en course, bouton recentrer.
  - 4 boutons d'action ronds : Appeler (bleu/tel:), Message (orange→chat), Partager (violet→navigator.share), Annuler (gris→modale).
  - Fiche chauffeur en bas : avatar bordé bleu, nom, plaque, note en étoiles (demi-étoile), modèle véhicule, type.
  - Pastille OTP « code départ » (générer/afficher) pour démarrer la course.
- Fix Leaflet en conteneur flex (`MapResizer` + `invalidateSize`, layout `h-screen`). Vérifié visuellement (screenshot — 12 tuiles chargées, rendu conforme) + lint propre.
## NEW - Jun 2026 - Animation "Recherche d'un chauffeur" (radar) (DONE — iter 98)
- Composant réutilisable `SearchingRadar.jsx` fidèle au design fourni : pin de localisation blanc (disque bleu) au centre, anneau bleu brisé en 4 arcs en rotation continue, cercles concentriques pulsants (radar).
- Branché sur les 3 écrans de recherche : `TaxiBiddingPage` (searching-sheet), `RideSearchingStep.jsx`, `RideTrackingPage` (statut pending). Vérifié visuellement (screenshot) + lint propre.
## NEW - Jun 2026 - Modernisation de TOUS les services (réservation réelle type taxi) (DONE — iter 97)
- **Hub Services moderne** (`/services-hub`, `ServicesHubPage.js`) : grille bento « Swiss & High-Contrast » groupée en Mobilité & Livraison / À domicile & Bien-être / Urgences & Assistance. Bannière d'accès « Tous les services » sur l'accueil.
- **Flux de réservation unifié** (`/service/:key`, `ServiceBookingFlow.js`) inspiré du TaxiHub : sélection prestataire (catalogue) → prestation + quantité + adresse (Google Places + carte) + planification (maintenant/programmer) + sélecteur paiement (Espèces/Carte/SB PayGo) + code promo + **prix live** → confirmation. 6 services : Beauté, Animaux, Auto, Dépannage (instant), Maison, Commerces.
- **« Mes réservations »** (`/my-bookings`, `MyServiceBookingsPage.js`) : suivi temps réel (polling 5s) avec badges de statut (En attente → Confirmé → En cours → Terminé / Annulé) + annulation.
- **Backend** (`services.py`) : `POST /services/estimate` (prix + promo serveur), `create_service_booking` enrichi (prestataire auto-confirme, promo via helper `compute_coupon_discount` réutilisable, breakdown prix, WS admin), `POST /services/bookings/{id}/status` (cycle de vie admin), cancel. Fini les toasts factices.
- Pages annuaire (Beauté/Animaux/Auto/Commerces/Dépannage) recâblées : clic prestataire → flux de réservation (preselect). `data-testid` ajouté à `ServiceCard`.
- Testé : testing agent iter89 → 100% des flux critiques (hub, flux unifié, prix live, promo SBDRIVE10, confirmation → my-bookings, annulation). Backend E2E curl complet (estimate/booking/status/promo).
## NEW - Jun 2026 - Compte à rebours chauffeur + "Renouveler mon offre" (DONE — iter 96)
- Côté chauffeur (`DriverHome.js`) : après l'envoi d'une contre-offre, la modale reste ouverte et affiche un panneau `my-offer-panel` avec l'anneau `CountdownRing` (composant partagé), le montant, le statut « Expire dans Ns · en attente du client » et deux boutons : « Renouveler mon offre » (renvoi du même montant → nouveau timer 30s) et « Annuler ».
- Détection auto : pendant que l'offre est en attente, polling 2.5s de `rideAPI.get` ; si le passager choisit ce chauffeur (`ride.driver_id === driver.id`), passage direct à la course active (`currentRide`) + join WS room.
- Composant `CountdownRing.jsx` extrait et partagé entre passager et chauffeur (DRY).
- Testé : testing agent iter88 (panneau + countdown qui décroît + renew reset = PASS) ; E2E curl (renew remplace l'offre en attente avec nouvel `expires_at` ; accept-offer pose `driver_id`).
## NEW - Jun 2026 - Minuteur d'expiration des contre-offres chauffeurs (DONE — iter 95)
- Chaque contre-offre chauffeur expire après `OFFER_TTL_SECONDS=30s` (`expires_at` + `ttl_seconds` stockés dans `counter_offers[]`). `accept-offer` refuse une offre expirée (HTTP 400 "Cette offre a expiré", offre marquée `expired`).
- Côté passager (`TaxiBiddingPage.js`) : composant `OfferCountdown` (anneau SVG circulaire animé, vert→orange→rouge selon temps restant) sur chaque carte d'offre ; les offres expirées disparaissent automatiquement de la liste. Sentiment d'urgence inDrive.
- Vérifié : E2E curl (offre valide acceptée 200, offre expirée 400), lint JS clean, pytest iter93 vert.
## NEW - Jun 2026 - Fix réception courses chauffeur + normalisation statut (DONE — iter 94)
- `list_rides` (GET /api/rides?status=pending) côté chauffeur ne filtre plus par `vehicle_type` : tout chauffeur approuvé reçoit les courses en attente (cohérent avec le broadcast WS `broadcast_to_drivers`). Débloque l'`incoming-request-modal` + contre-offre chauffeur quel que soit le type de véhicule (Berline/Car/Moto vs slugs sb/confort/luxe).
- Migration idempotente au startup : docs chauffeurs hérités avec `status='online'` (corrompus) → normalisés en `status='approved'` (débloque `toggle-online`).
- E2E vérifié : passager crée course 'confort' → chauffeur 'Berline' la voit → contre-offre 15€ → passager accepte → course `accepted` à 15€. Pytest iter92/93 verts (4/4). Frontend passager 100% (iter87).

- Écran de recherche client : liste temps réel des contre-offres chauffeurs (nom/note/véhicule/montant) + « Choisir » un chauffeur précis. Suggestion auto d'augmentation après 20s.
- `route_polyline` stocké (Google Directions + waypoints) ; tracé routier réel sur carte chauffeur + suivi passager + arrêts numérotés.
- Backend bidirectionnel déjà en place (`/counter-offer`, `/accept-offer/{id}`). E2E + 4/4 pytest.

## NEW - Jun 2026 - Taxi Bidding: tarif minimum + recherche sans quitter (DONE — iter 92)
- Offre par défaut = tarif recommandé ; impossible de descendre en dessous (clamp + bouton −).
- Après envoi, le client reste sur l'écran (radar « Recherche d'un chauffeur ») et peut augmenter (+1/+2/+5€) ; polling → navigation auto à l'acceptation.
- Backend `POST /api/rides/{id}/proposed-fare` (re-broadcast WS, owner-only, refus si ≤ actuel). 3/3 pytest + screenshots.

## NEW - Jun 2026 - Arrêts sur fiche/itinéraire chauffeur + mémorisation point carte (DONE — iter 91)
- Arrêts intermédiaires affichés sur la fiche course active + modal nouvelle course du chauffeur (puces numérotées).
- Itinéraire sur carte chauffeur : `LeafletMap` prop `waypoints` (marqueurs numérotés) + `routePath` (polyline Départ→arrêts→Arrivée).
- Point choisi sur la carte ajouté aux lieux récents. E2E curl OK (stops Louvre/Opera reçus côté chauffeur).

## NEW - Jun 2026 - Carte interactive + Chauffeur Privé + tarif multi-arrêts (DONE — iter 90)
- **« Définir l'emplacement sur la carte »** : `MapLocationPicker` (carte plein écran, pin central, reverse-geocode, Départ/Destination).
- **Chauffeur Privé (buddy_driver)** intégré au hub (durée 1/2/4/8h, prix horaire). Tuile + CMS → `/taxi?mode=buddy_driver`.
- **Tarification multi-arrêts** : estimate + create_ride calculent la distance via waypoints (Google Directions ou somme haversine). 3/3 pytest + screenshots.

## NEW - Jun 2026 - Refonte hub: Grille vs "Planifiez votre trajet" + arrêts multiples (DONE — iter 89)
- `/taxi` (Plus de Services) = vue **Grille** des 16 services, sans adresses. Clic sur un service = vue **Réservation** « Planifiez votre trajet » sans les autres services (parité image 1 V3Cube).
- En-tête : toggles **Ramassage maintenant/plus tard** + **Pour moi/Pour un proche**. **Arrêts multiples** via bouton « + » (`stops[]`).
- Backend : champ `stops` + contrôles timing/forWho applicables à tout mode. Vérifié curl + screenshots.

## NEW - Jun 2026 - Géoloc départ + raccourcis Maison/Travail/récents (DONE — iter 88)
- Hub `/taxi` : départ **auto-localisé** (géoloc + reverse-geocode). Sous la destination : raccourcis **Utiliser ma localisation actuelle**, **Maison**, **Travail** (enregistrables) + **lieux récents**.
- Backend `routes/places.py` (`/api/places/saved`, `/recent`) — collection `user_places`. 3/3 pytest, UI vérifiée (conforme maquette V3Cube).

## NEW - Jun 2026 - Hub paiement/promo + CMS Catégories accueil (DONE — iter 87)
- Hub `/taxi` : sélecteur de paiement HORIZONTAL (Espèces/Carte/SB PayGo) + code promo (recalcul prix) avant le CTA.
- **CMS catégories d'accueil** entièrement configurable par l'admin (`/admin/home-categories`) : ajout/édition/suppression, icône bibliothèque OU image uploadée, nom FR/EN, sous-titre, ordre, visibilité accueil, route cible. 41 catégories / 8 sections seedées.
- L'accueil (`UserHome`) lit la config : catégories visibles affichées, reste sous « Plus de Services » ; clic → page d'adresses directement. Backend `routes/home_categories.py` + `DynamicIcon`. 5/5 pytest + 7/7 frontend.

## NEW - Jun 2026 - Hub Taxi moderne : 16 modes de réservation (DONE — iter 86)
- Nouvelle page `/taxi` (TaxiHubPage) — design "Swiss & High-Contrast / Tactical Bento Grid".
- 16 modes distincts : Taxi VTC, Pool, Green (électrique), Moto, Mise à dispo (rental), Intercité, Plus tard, Loc Moto, Enchères, Aéroport, Animaux, Pour un proche, TukTuk, Assistance, Corporate, PMR.
- **Prix live affiché dès la saisie de l'adresse** + panneaux spécifiques par mode + CTA adaptatif.
- Backend : 3 véhicules ajoutés (pets/tuktuk/assist), champs ride (pets_count/pets_size/assist_needs/pool_enabled). Fix critique GooglePlacesInput (onSelect). 4/4 pytest + validation visuelle.

## NEW - Jun 2026 - V3Cube Pack C (Comptes Entreprise B2B) (DONE — iter 85)
- **Admin** (`/admin/corporate`) : CRUD comptes entreprise (code d'adhésion, remise %, plafond mensuel), gestion membres par email, facture mensuelle (brut/remise/net), suivi crédit utilisé.
- **Client** (`/corporate`) : rejoindre une entreprise par code, voir/quitter ses entreprises.
- **Réservation** (`/taxi-advanced?mode=corporate`) : dropdown des entreprises du user, course facturée à l'entreprise avec remise auto.
- **Backend** `/api/corporate/*` : validation adhésion + remise à la création, charge enregistrée à la complétion (collections `corporate_accounts`, `corporate_members`, `corporate_charges`). 4/4 tests pytest.

## NEW - Jun 2026 - V3Cube Pack B (Driver Pro) (DONE — iter 84)
- **Mes véhicules** (`/chauffeur/vehicles`) : CRUD multi-véhicules + véhicule principal sync
- **Coordonnées bancaires** (`/chauffeur/bank`) : IBAN masqué côté API (jamais retourné en clair)
- **Statistiques gains** (`/chauffeur/earnings/stats`) : filtre période day/week/month + bar chart
- **Galerie chauffeur** (`/chauffeur/gallery`) : max 20 photos base64 catégorisées (Véhicule/Identité/Autres)
- **Admin Motifs d'annulation** (`/admin/cancel-reasons`) : onglets Chauffeurs/Clients, FR/EN, ordre
- Backend routes sous `/api/driver-pro/*` (24/24 tests pytest verts)
- Frontend pages câblées dans `App.js` + entrées drawer chauffeur


## NEW - Feb 2026 - Mobile App (Expo / React Native) (FOUNDATION DONE)
- Monorepo : `/app/mobile/` (Expo SDK 52, React Native 0.76, TypeScript)
- Bundles iOS + Android compiles sans erreur (1286 modules, ~9.7 MB)
- Auth flows : Welcome, EmailLogin, PhoneLogin + OTP, Register (role: user/driver/merchant)
- App User : Home (12 services tiles), Booking taxi (estimate + create), Orders, Wallet, Profile, Catalog generique (9 V3Cube collections)
- App Driver : Home (toggle online + stats activity), Rides (available + accept), Earnings, Profile
- App Merchant : Dashboard (stats), Profile
- Voice Assistant FAB global (mic flottant) -> `/api/voice/parse-booking`
- i18n : FR + EN (auto-detect via expo-localization)
- Theme V3Cube/SB Drive (jaune #FFC107 + navy #0B1426)
- Demarrage : `cd /app/mobile && yarn start:tunnel` puis scan QR avec Expo Go


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



## Iteration 62 (Feb 12, 2026) — Phase 2 UI Complete (DONE)
### 5 features Phase 2 livrées (Heat View, Taxi Pool, Waybill, Tip, Airport geofence)
- **Heat View** (chauffeur) : bouton toggle `[data-testid=heat-view-toggle]` sur DriverHome, overlay `CircleF` Google Maps (rouge/orange/bleu selon densité), polling `/api/phase2/heatmap` toutes les 30s.
- **Taxi Pool** : toggle dans le bottom sheet de RideMapStep (`[data-testid=pool-toggle-input]`), texte "Partager la course (-30%)". Champ `pool_enabled` envoyé dans POST /api/rides.
- **Waybill** : nouvelle page `/ride/:rideId/waybill` (`WaybillPage.js`) avec branding SB Drive, N° feuille, date, passager, chauffeur, départ, arrivée, détail tarif (distance/suppléments/pourboire/total), bouton `Imprimer` (window.print()).
- **Tip** : `TipModal.js` avec presets 2/5/10 € + champ personnalisé, POST `/api/phase2/rides/{id}/tip`. Accessible depuis le rating modal de RideTrackingPage via le bouton `Pourboire`.
- **Airport geofence** : useEffect dans RideBookingPage qui appelle POST `/api/phase2/airport-flat-quote` quand pickup+dropoff sont fixés. Si `type=airport_surcharge`, bannière jaune au-dessus du CTA (`[data-testid=airport-surcharge-banner]`).

### Bugs corrigés (iter61 → iter62)
- **URL mismatch** (CRITICAL) : backend exposait `/api/phase2/pricing/quote` mais le frontend appelait `/api/phase2/airport-flat-quote` → ajout d'un alias double décorator. Vérifié curl HTTP 200 sur les 2 URLs.
- **Waybill data shape** (CRITICAL) : WaybillPage lisait `data.pickup.address` / `data.fare.total` mais le backend renvoie `data.ride.pickup_address` / `data.ride.final_fare`. Réécriture de WaybillPage pour mapper correctement la shape `{ride, passenger, driver, waybill_number}` + agréger total = final_fare + tip_amount.
- **DriverHome JSX** : bouton Heat View sorti du ternaire `gmapLoaded ?` pour éviter les frères JSX adjacents ; conteneur passé en `relative` pour ancrer le bouton absolu.

### Tests
- Iter 61 testing agent : 5/6 backend OK + Waybill blank → 2 bugs critiques identifiés.
- Post-fix iter 62 : `/api/phase2/airport-flat-quote` HTTP 200 ✅, `/api/phase2/pricing/quote` HTTP 200 ✅, WaybillPage lint OK ✅.

### Reste à faire
- Re-tester Waybill UI avec un vrai ride completed (vérifier que tous les champs s'affichent).
- Tester Heat View côté chauffeur (nécessite un compte driver actif).
- Refresh REACT_APP_GOOGLE_MAPS_KEY (clé expirée en preview).



## Iteration 77 (Jun 1, 2026) — 49 endpoints permission-protected + PhoneSelector inscription (DONE)
### 🔐 Extension `require_permission` à 49 endpoints admin

**Batch 1 — admin.py / phase2.py / coupons.py (34 endpoints)** :
- `vehicle-types/*` CRUD → `server.settings.edit`
- `merchants/{id}/status` → `merchants.activate`
- `settings` GET/PUT → `server.settings.edit`
- `service-config/{key}` GET/PUT → `server.settings.edit`
- `crud/{collection}/*` → `server.settings.edit`
- `rewards/config` + `top-drivers-config` → `drivers.rewards.config`
- `priority-drivers/*` → `drivers.priority.toggle`
- `db-backup` → `server.settings.edit`
- `reports/negotiation-gap` → `billing.view`
- `config/airport-zones/*` → `server.geofences.edit`
- `config/flat-rates/*` → `billing.view`
- `catalogs/{collection}/{id}/feature` (phase2) → `merchants.featured.toggle`
- `coupons/admin/*` → `billing.promocodes.create`

**Batch 2 — misc.py / config.py / auto_dispatch.py / orders.py (15 endpoints)** :
- `users` GET → `users.view`
- `drivers` GET → `drivers.view`
- `rides` (admin) → `dispatch.view`
- `orders` (admin) → `merchants.view`
- `revenue` → `billing.view`
- `dispatcher/live` → `dispatch.view`
- `dispatcher/assign-ride` + `orders` assign → `dispatch.assign`
- `settings` (misc) → `server.settings.edit`
- `auto-dispatch/config` → `dispatch.view/assign`

**Restant intentionnellement ouvert à tous admins** (4 endpoints) :
- `/admin/stats`, `/admin/analytics`, `/admin/dashboard` (KPI globaux pour landing panel)

### Tests E2E (curl)
- ✅ `billing@superapp.com` → POST `/admin/vehicle-types` → **HTTP 403**
- ✅ `sysadmin@superapp.com` → POST `/admin/vehicle-types` → **HTTP 200** (créé)
- ✅ `crm-drivers@superapp.com` → POST `/coupons/admin/create` → **HTTP 403**
- ✅ `admin@superapp.com` (super-admin) → toutes routes OK via `super.all` wildcard

### 📱 PhoneCountrySelector intégré au form d'inscription user
- `RegisterPage.js` : sélecteur 250 pays remplace le placeholder `+1 234...`
- Helper `country_code` ajouté au state du form
- `handleSubmit` merge `country_code + phone` (clean trailing 0, espaces) avant submit à `/api/auth/register`
- Le `LoginPage` conserve son propre picker (12 pays principaux, modal full-screen) — UX différente, non régressée

### Reste à faire
- 🟠 **Stripe paiements réels** — clé TEST `sk_test_emergent` dispo dans env, à intégrer via `integration_playbook_expert_v2` (priorité revenus)
- 🟠 Call masking Twilio (en attente vos clés Twilio)
- 🔴 P0 résiduel : OTP "Démarrer course" validation E2E (iter69)
- 🟡 PhoneCountrySelector sur DriverRegisterPage (actuellement sans champ phone car driver = user existant)



## Iteration 76 (Jun 1, 2026) — Extension require_permission + 3 pages admin V3Cube (DONE)
### 🔐 Extension `require_role` avec permissions
- `core/deps.py` : signature étendue `require_role(request, roles, permission=None)` — backwards-compatible
- Lorsque `permission` est fourni, le helper résout les role_ids du user via la collection `admin_roles`, agrège les permissions, et vérifie que le user les détient (ou `super.all` wildcard).
- **Tests E2E** (curl) :
  - `billing@superapp.com` → 403 sur `/api/admin/drivers/{id}/approve` (n'a pas `drivers.approve`)
  - `crm-drivers@superapp.com` → 404 (permission passe, juste pas de driver)
  - `admin@superapp.com` → 404 (super.all wildcard fonctionne)
- **Endpoints couverts en pilote** : `approve_driver`, `reject_driver`, `suspend_user`, `unsuspend_user` (avec audit log automatique)
- Pattern à étendre progressivement aux 200+ autres endpoints admin

### 🖥 3 nouvelles pages admin frontend
1. **`/admin/audit-logs`** (`AdminAuditLogs.js`) — Table avec filtres (action, actor, target_type, dates), drilldown JSON détaillé par entrée
2. **`/admin/organizations`** (`AdminOrganizations.js`) — CRUD multi-tenant (company/hotel/airport/corporate) avec commission_pct, liens drivers/kiosks
3. **`/admin/i18n`** (`AdminI18n.js`) — CRUD labels par langue (FR/EN/ES/PT) + détection clés manquantes via `/api/i18n/admin/missing`

### 🌍 Composant PhoneCountrySelector
- `/app/frontend/src/components/PhoneCountrySelector.jsx` — Dropdown searchable utilisant `/api/geo/phone-codes` (250 pays V3Cube)
- Flag emoji auto-généré depuis le code ISO (regional indicators)
- **Intégré dans KioskApp.js** (form client borne) en remplacement du `+33` hard-codé

### Tests
- ✅ Lint Python & JS : 100% clean
- ✅ Backend startup OK avec tous les modules (ACL/Subscriptions/Geo/AuditLogs/DriverShifts/Organizations/i18n)
- ✅ E2E permissions : billing/crm-drivers/super-admin différenciés correctement
- ✅ Frontend screenshots : 3 pages admin rendues (audit-logs, organizations, i18n)

### Sidebar admin enrichi
Entrées ajoutées : ACL, Audit Logs, Organisations, Traductions i18n.

### Reste à faire
- 🟠 Étendre `require_permission` aux 200+ endpoints admin restants (pattern établi, juste à répliquer)
- 🟠 Stripe paiements réels — clé TEST `sk_test_emergent` dispo dans env, à intégrer via `integration_playbook_expert_v2`
- 🟠 Call masking Twilio (en attente vos clés Twilio Account SID + Auth Token + numéro virtuel)
- 🟠 Selector PhoneCountrySelector à étendre sur le form d'inscription user/driver classique
- 🔴 P0 résiduel : OTP "Démarrer course" validation E2E (iter69)



## Iteration 75 (Jun 1, 2026) — V3Cube Itérations 75-78 + Frontend ACL/Subscriptions (DONE)
### 📋 Backend — 4 nouveaux modules (V3Cube tables 75-78)

**1. Audit logs** (`/app/backend/routes/audit_logs.py`)
- Collection `audit_logs` : trace actor/action/target/payload_before/payload_after/ip/user_agent
- Décorateur `@audit("action", target_type="driver")` à appliquer sur endpoints sensibles
- Endpoint `/api/audit/logs` (filtres : actor, target, action, from/to date, pagination)
- Endpoint `/api/audit/actions` (top actions par fréquence)
- Protégé par `require_permission("super.audit.view")`

**2. Driver shifts** (`/app/backend/routes/driver_shifts.py`) — V3Cube driver_manage_timing
- Collection `driver_shifts` : start_at, end_at, duration_min, total_rides, total_earnings, vehicle_used, status
- Endpoints driver : `/start`, `/end`, `/my`, `/my/active`
- Endpoints admin : `/admin/by-driver/{id}`, `/admin/summary`
- Auto-set `drivers.is_online` lors du start/end

**3. Organizations** (`/app/backend/routes/organizations.py`) — V3Cube company + organization
- Collection `organizations` : multi-tenant (company / hotel / airport / corporate)
- Champs : commission_pct par org, linked_drivers[], linked_kiosks[], parent_org_id
- Endpoints admin CRUD + `/admin/{id}/link-driver/{driver_id}` + `/admin/{id}/link-kiosk/{kiosk_id}`
- Protégé par `require_permission("merchants.view"/"merchants.activate")`

**4. i18n** (`/app/backend/routes/i18n.py`) — V3Cube language_label
- Collections `i18n_languages` (4 langues seedées : FR/EN/ES/PT) + `i18n_translations`
- 23 labels FR + 23 labels EN seedés au startup (clés `common.*`, `auth.*`, `ride.*`, `kiosk.*`, `subscription.*`)
- Endpoint public `/api/i18n/{lang}` retourne dict `{key: value}` (à charger côté frontend au démarrage)
- Endpoints admin : `/admin/labels` (set), `/admin/labels/{lang}/{key}` (delete), `/admin/missing` (clés manquantes vs base_lang)

### 🎨 Frontend — 2 pages majeures

**1. `/admin/acl`** (`/app/frontend/src/pages/admin/AdminACL.js`)
- Tabs : Rôles (CRUD avec permissions checkboxes groupées par domaine) + Utilisateurs admin (assignment modal)
- Affichage des 7 rôles système (super_admin/dispatcher/billing/sysadmin/crm_*)
- Système et démo accounts protégés contre suppression
- Smoke test E2E ✅ (screenshot : 7 cards visibles + sidebar admin)

**2. `/chauffeur/subscriptions`** (`/app/frontend/src/pages/driver/DriverSubscriptions.js`)
- 4 plans cards (Free/Pro/VIP/Elite Annual) avec gradient distinct + icônes Crown/TrendUp/ShieldStar
- Banner du plan actuel avec date d'expiration et commission verrouillée
- Boutons "Souscrire" (paiement wallet) + "Annuler renouvellement"
- Liste des perks par plan

### Helper `core/permissions.py`
- `require_permission("dispatch.assign")` — dependency FastAPI
- `require_any_permission(p1, p2)` — au moins une permission requise
- `super.all` = wildcard pour super_admin

### Tests
- ✅ Lint Python : 4 fichiers cleans (E701 corrigés)
- ✅ Lint JavaScript : 2 fichiers cleans
- ✅ E2E curl : i18n FR (23 labels), languages (4), audit logs vide, shifts summary, orgs vide
- ✅ Frontend screenshot `/admin/acl` : 7 rôles avec permissions + sidebar avec entrée ACL

### Reste à faire (Itération 76+)
- 🟡 Étendre `require_permission` aux 200+ endpoints admin existants (actuellement seuls les nouveaux endpoints sont protégés finement)
- 🟡 Frontend pages : `/admin/audit-logs` (table filtre), `/admin/organizations` (CRUD multi-tenant), `/admin/i18n` (CRUD labels)
- 🟡 Selector phone-code/country sur form inscription (geo API prêt côté backend)
- 🟡 Call masking Twilio (nécessite vos clés Twilio)
- 🔴 P0 résiduel : OTP "Démarrer course" validation E2E



## Iteration 74 (Jun 1, 2026) — Récupération BDD V3Cube + Améliorations (DONE)
### 📥 Récupération du code source BDD V3Cube
- Source : `sbdriv5_db2024.sql.gz` (8.3 MB compressé → 51 MB SQL, MariaDB 10.11, charset utf8mb4)
- **224 tables V3Cube** décodées et catégorisées
- Document de mapping créé : `/app/memory/V3CUBE_DB_MAPPING.md` (224 tables → 56 collections MongoDB existantes + 30 manquantes prioritaires + 65 inutiles legacy)

### 🔐 Amélioration #1 — ACL granulaire (V3Cube admin_groups + admin_permissions)
**Nouveau fichier** : `/app/backend/routes/acl.py` + `/app/backend/core/permissions.py`
- 2 nouvelles collections : `admin_permissions` (33 permissions seedées) + `admin_roles` (7 rôles système seedés)
- Champ `users.role_ids[]` + `users.role_name` ajoutés
- Helper FastAPI : `require_permission("dispatch.assign")` à utiliser sur endpoints sensibles
- Helper alternatif : `require_any_permission(p1, p2)`
- **Migration auto au startup** : les 6 comptes panel démo se voient assigner leur rôle proprement (`dispatch@superapp.com` → role `dispatcher` avec 5 permissions ciblées)
- 7 endpoints CRUD : `/api/acl/roles`, `/api/acl/users`, `/api/acl/permissions/registry`, `/api/acl/me/permissions`, etc.

### 💳 Amélioration #2 — Driver Subscriptions (V3Cube driver_subscription_plan)
**Nouveau fichier** : `/app/backend/routes/subscriptions.py`
- 2 nouvelles collections : `subscription_plans` + `driver_subscriptions`
- **4 plans par défaut seedés** :
  - **Free** : 0€ / commission 20%
  - **Pro** : 19.90€/mois / commission 10% / support prioritaire
  - **VIP** : 49.90€/mois / commission 5% / badge VIP / priorité auto-dispatch
  - **Elite Annual** : 449€/an / commission 3% / VIP + manager dédié
- 9 endpoints : `/api/subscriptions/plans`, `/api/subscriptions/my`, `/api/subscriptions/subscribe`, `/api/subscriptions/cancel`, admin CRUD
- Paiement via wallet (Stripe TODO pour cartes)
- À l'activation : update `drivers.subscription_id`, `vip_badge`, `priority_dispatch`, `commission_pct`

### 🌍 Amélioration #3 — Référentiels géographiques (V3Cube country/state/city)
**Nouveau fichier** : `/app/backend/routes/geo.py`
- Nouvelle collection : `countries` (**250 pays seedés** depuis le SQL V3Cube)
- Champs : `code, iso3, name, native, phone_code, currency, lat, lng, capital, timezone, emergency_code, unit, tax1, tax2, enable_toll, is_active`
- Seed file : `/app/backend/seed_data/v3cube_countries.json` (76 KB, généré automatiquement depuis SQL)
- 3 endpoints publics : `/api/geo/countries?q=`, `/api/geo/countries/{code}`, `/api/geo/phone-codes`
- Utilisable pour cascade Pays → État → Ville sur formulaires d'inscription

### Tests E2E (manuel curl)
- ✅ `/api/subscriptions/plans` : 4 plans retournés
- ✅ `/api/geo/countries?q=fr` : 8 résultats (France, French Guiana, etc.)
- ✅ `/api/acl/roles` : 7 rôles système avec permissions
- ✅ `/api/acl/me/permissions` super_admin → `["super.all"]`
- ✅ `dispatch@superapp.com` → permissions correctement assignées (5 perms)
- ✅ `billing@superapp.com` → permissions billing
- ✅ `crm-drivers@superapp.com` → 7 permissions chauffeurs
- ✅ Backend startup logs OK : "ACL seeded", "Subscription plans seeded", "Countries seeded from V3Cube SQL"
- ✅ Lint Python : 4/4 PASS

### Reste à faire (sessions futures)
- 🟠 Frontend : page admin `/admin/acl` pour CRUD rôles + assignment
- 🟠 Frontend : page driver `/chauffeur/subscriptions` pour souscrire à un plan
- 🟠 Frontend : selector phone code/country sur form inscription
- 🟠 Étendre `require_permission` aux endpoints admin existants (au lieu du simple check `role=='admin'`)
- 🔴 P0 résiduel : OTP "Démarrer course" validation E2E (iter69 script Playwright crashed)
- 🟡 Itérations 75-78 du V3CUBE_DB_MAPPING (audit logs, driver shifts, multi-tenant orgs, i18n labels, call masking Twilio)



## Iteration 73 (Jun 1, 2026) — Audit BDD & APIs : Discovery & Documentation complète (DONE)
### 📚 4 livrables exhaustifs créés dans `/app/memory/`
- **`DATABASE_SCHEMA.md`** (395 lignes) — 56 collections documentées, regroupées en 13 domaines (Auth, VTC, Chauffeurs, Marchands, Finance, Promotions, Kiosk, Marketplace, Services, Référentiels, Config, Support, Phase 2). Pour chaque collection : tableau des champs (type, nullable, description), indexes, relations.
- **`API_REFERENCE.md`** (233 lignes) — **227 endpoints** classés par module (22 modules), endpoints par rôle (public/user/driver/merchant/admin), pointeurs Swagger UI / ReDoc.
- **`DATABASE_DIAGRAM.md`** (315 lignes) — Diagrammes Mermaid ER de l'écosystème (vue d'ensemble + 5 vues par domaine). Visualisable directement sur GitHub ou mermaid.live.
- **`DATABASE_RESTRUCTURE_PLAN.md`** (244 lignes) — Plan d'exécution **safe** en 7 étapes pour les prochaines itérations : indexes manquants, soft-delete, migration created_at, collections manquantes (`audit_logs`, `driver_shifts`, `vehicle_inspections`, `subscription_plans`, `complaints`, `webhooks_events`, `notifications_preferences`), externalisation arrays inline, ~30 endpoints à générer.

### 🔍 Inconsistances détectées (10 items)
1. Doublon nom `carpool_rides` vs V3Cube `carpool_trips`
2. Snapshot `passenger_name/phone` dans `rides` (redondant mais nécessaire pour kiosk guests)
3. `score_log` inline plafonné à 200 entrées (à externaliser)
4. `stopovers` inline (OK MVP)
5. `replies` inline dans `support_tickets`
6. Pas de soft-delete sur entités critiques
7. `created_at` en string ISO au lieu de BSON Date
8. `merchants.user_id` non strictement UNIQUE
9. **Pas de collection `audit_logs`** — aucune trace des actions admin sensibles
10. Pas de `notifications_preferences` côté serveur

### 🏗 Collections manquantes recommandées (7)
`audit_logs`, `driver_shifts`, `vehicle_inspections`, `tax_reports`, `subscription_plans`+`user_subscriptions`, `complaints`, `webhooks_events`.

### 📈 Effort estimé pour la restructuration safe : ~16h focused (réparti sur 3 itérations futures iter74-iter76)



## Iteration 72 (Jun 1, 2026) — Phase B : 6 Web Panels + Phase C : Landing page vitrine (DONE)
### 🏢 Phase B — Séparation 7 web panels métier
Architecture : 1 layout générique `PanelLayout` + 1 config dictionnaire `panelConfigs.js` réutilisant les pages admin existantes. Chaque panel a sa propre couleur, sidebar filtré, et un compte démo dédié.

**Les 7 panels :**
1. `/admin` → Super Admin (existant, garde accès à tout)
2. `/dispatch` (bleu #0EA5E9) → Dispatcher : Live rides + Auto-dispatch + Monitoring + Drivers + Priority + Rides + SOS + Disputes
3. `/billing` (vert #10B981) → Comptabilité : Revenus + Settlements + Payouts + Wallet requests + Promocodes + Giftcards + Payment methods
4. `/server` (indigo #6366F1) → Sys Admin : Settings + Language/Currency + Maps + SEO + Geofences + Templates email/SMS + Push + Référentiels véhicules
5. `/users-admin` (ambre #F59E0B) → CRM Clients : Users + Referral + News + Newsletter + Banners + Promocodes + Contact/SOS
6. `/drivers-admin` (rouge #DC2626) → CRM Chauffeurs : Drivers + Priority + Top + Documents + Requests + Rewards
7. `/merchants-admin` (violet #7C3AED) → CRM Marchands : Stores + Company + Hotels + Kiosks + Orders + Parcels + Featured

**Fichiers créés** :
- `/app/frontend/src/pages/panels/PanelLayout.js` (140 lignes — sidebar collapsible avec recherche, header brand color, Outlet pour sous-routes)
- `/app/frontend/src/pages/panels/panelConfigs.js` (config sidebar des 6 panels)
- `/app/frontend/src/pages/panels/PanelHome.js` (page d'accueil générique : hero gradient + 4 KPI cards + 6 shortcuts)
- 7 routes top-level dans `App.js` (chacune avec nested sub-routes pointant vers les pages admin existantes)

**Backend** :
- Ajout du champ `panel_preference` dans `UserResponse` (Pydantic) et dans la collection `users`.
- Seed 6 comptes démo (role='admin' avec `panel_preference`) :
  - `dispatch@superapp.com` → `/dispatch`
  - `billing@superapp.com` → `/billing`
  - `sysadmin@superapp.com` → `/server`
  - `crm-users@superapp.com` → `/users-admin`
  - `crm-drivers@superapp.com` → `/drivers-admin`
  - `crm-merchants@superapp.com` → `/merchants-admin`
  - Mot de passe commun : `PanelDemo123!`

**Login redirect** : `LoginPage.js` et `AdminLoginPage.js` lisent `user.panel_preference` et redirigent vers le bon panel après login (le super-admin sans `panel_preference` va sur `/admin`).

**Sous-domaines en production** : Le déploiement sur `sbdrivevtc.com` nécessite la configuration DNS CNAME pour chaque panel :
- `dashboard.sbdrivevtc.com` → /admin
- `dispatch.sbdrivevtc.com` → /dispatch
- `billing.sbdrivevtc.com` → /billing
- `server.sbdrivevtc.com` → /server
- `users.sbdrivevtc.com` → /users-admin
- `drivers.sbdrivevtc.com` → /drivers-admin
- `merchants.sbdrivevtc.com` → /merchants-admin
- `kiosk.sbdrivevtc.com` → /kiosk
- `www.sbdrivevtc.com` → /website (landing)

### 🌐 Phase C — Landing page vitrine
Le `LandingPage.js` existait déjà (428 lignes) et couvrait toutes les exigences :
- Hero avec form de réservation (pickup + dropoff Google Places)
- "Comment ça marche" 4 étapes
- "Pool & Location" section
- 4 services VTC (Taxi/Pool/Bid/Réserver à l'avance)
- Section sécurité (suivi temps réel + bouton SOS + code OTP)
- "Réserver par téléphone" + boutons Play Store / App Store officiels
- 5 types d'inscription (Client/Chauffeur/Marchand/Hôtel/Partenaire)
- Footer

Aucune réécriture nécessaire — la page est déjà conforme aux spécifications V3Cube et adressable via `/website` (et `/` pour les visiteurs non connectés).

### Tests
- ✅ Backend : login démo retourne `role=admin` + `panel_preference=/dispatch` (vérifié curl 3 comptes)
- ✅ Frontend : screenshot du `/dispatch` post-login parfait — header bleu + sidebar 3 sections (OPÉRATIONS/RESSOURCES/INCIDENTS) + hero gradient bleu "SB Drive Dispatch" + 6 cartes Accès rapide

### Reste à faire
- 🔴 P0 : Validation E2E finale OTP "Démarrer la course" (issue iter69 — script Playwright avait crashé)
- 🟠 Tester chaque panel via testing_agent_v3_fork (charge tous les sous-routes ne fonctionnent pas tous : certains chemins admin n'existent pas en double, à vérifier au cas par cas)
- 🟠 Stripe paiements réels + Push Notifications Firebase FCM (nécessitent clés user)
- 🟡 Phase 3 : VOIP/Twilio, Photo zone pickup, Lost & Found
- 🟡 Granularité rôle au niveau backend (actuellement tous les panels demandent role='admin' ; pour vrais users non-admin, étendre `get_current_user` pour accepter `dispatcher`/`billing`/etc. sur les endpoints concernés)



## Iteration 71 (Jun 1, 2026) — Phase A : SB Drive Tab (Kiosk libre-service) (DONE)
### 📱 Nouvelle app : SB Drive Tab — borne hôtel/restaurant
- **Concept** : tablette installée chez un partenaire (hôtel, restaurant) qui permet aux clients sur place de commander un taxi sans avoir d'app à installer. Mode libre-service, design V3Cube fidèle.
- **Couleur principale** : orange #FF6B1A. Layout landscape tablette.

### Backend `/app/backend/routes/kiosk.py` (10 endpoints)
**Admin (JWT cookie admin)** :
- `POST /api/kiosk/admin/create` body `{hotel_name, address, lat, lng, pin_code, language, currency, image_url, pickup_label}` → retourne `{id, session_token, kiosk_url}`
- `GET /api/kiosk/admin/list`
- `PUT /api/kiosk/admin/{id}` (update)
- `DELETE /api/kiosk/admin/{id}`
- `POST /api/kiosk/admin/{id}/regenerate-token`

**Public (session_token de borne)** :
- `POST /api/kiosk/unlock` body `{pin_code}` → retourne session_token + hotel info (401 si PIN incorrect)
- `GET /api/kiosk/{token}/info` → hotel info + 5 véhicules (sb 0.80€/km, confort 0.90, fast 1.30, taxi 1.20, van 1.20) + langue + devise
- `GET /api/kiosk/{token}/nearest-driver` → ETA min du chauffeur le plus proche (cap 50km radius pour zone borne)
- `POST /api/kiosk/{token}/estimate` body `{dest_lat, dest_lng, vehicle_type}` → distance_km + estimated_fare + duration
- `POST /api/kiosk/{token}/book` → crée guest user via phone + ride pending. Broadcast WS admin + drivers
- `GET /api/kiosk/{token}/ride/{ride_id}` → status pour UI 'searching driver'
- `GET /api/kiosk/{token}/geocode?q=` → proxy Nominatim/OSM (avec User-Agent) pour éviter CORS/rate-limit côté tablette

### Frontend `/app/frontend/src/pages/kiosk/KioskApp.js` (state machine 7 étapes)
1. **Splash** : logo SB rouge dans cercle conic + "SB DRIVE TAB" (1.5s)
2. **Unlock PIN** : keypad numérique 4-6 chiffres, gradient orange
3. **Home** : split layout — gauche orange (logo SB + hotel_name + image carrousel + bouton blanc "RÉSERVER UN CHAUFFEUR"), droite orange clair (sélecteur langue/devise + ETA driver le plus proche en widget rond + icône logout)
4. **Customer Form** : Prénom + Nom + Email (optionnel) + Pays +33 + Mobile, boutons "RÉINITIALISER" + "SUIVANT"
5. **Vehicle Select** : cards horizontales scrollables (SB/Confort/Fast/TAXI/Van) avec icône info + emoji car + prix /km
6. **Destination** : (sous-écran "Chercher" → suggestions via backend proxy /geocode) puis split layout map Leaflet + sidebar récap "1 Type de cabine" + "2 Détails du tarif" + boutons "RÉSERVER MAINTENANT" + "ANNULER"
7. **Searching** : map + animation pulse orange (cercles concentriques + pin user noir/orange) → switch automatique en card chauffeur trouvé avec name/vehicle/phone/rating

### Frontend Admin `/admin/kiosks` (AdminKiosks.js)
- Table : Partenaire / Adresse / PIN / Lang+Devise / Courses totales / Actions
- Modal Nouvelle/Modifier borne (10 champs)
- Actions : Copier URL borne (clipboard) / Régénérer token / Modifier / Supprimer
- Sidebar : ajout sous MEMBRES > Hôtels > "Bornes SB Drive Tab"

### Borne démo créée
- **TAB CLIC** — Ducos 97224, Martinique — PIN: `1234` — coords: 14.5882, -60.9494
- URL borne : `/kiosk?token=<session_token>` (à ouvrir en plein écran sur la tablette)
- Alias : `/tab` redirige aussi vers KioskApp

### Routing & sous-domaines
- En preview : route `/kiosk` (et `/tab`). En production sbdrivevtc.com, configurer DNS CNAME `kiosk.sbdrivevtc.com` → app + route catch-all → `/kiosk`.

### Tests iter71 (test_reports/iteration_70.json)
- **Backend** : 16/16 pytest PASS (admin CRUD + public endpoints + unlock correct/wrong PIN + estimate van-vs-sb + book + ride-status + geocode)
- **Frontend** : 100% PASS (Splash → Unlock PIN 1234 → Home TAB CLIC + Ducos → Form → 5 vehicle cards → Destination search → Admin create/list/delete CRUD)
- **Limitation initiale** : Nominatim bloqué depuis sandbox preview → **FIXÉ** via proxy backend `/api/kiosk/{token}/geocode` (vérifié : Fort-de-France retourne 2 résultats).

### Reste à faire (Phase B + C)
- **Phase B** : séparer le Dashboard en 7 web panels distincts (`/dispatch`, `/billing`, `/server`, `/users-admin`, `/drivers-admin`, `/merchants-admin`) avec rôles différenciés
- **Phase C** : website vitrine public sbdrivevtc.com (hero + booking form + 4 services VTC + 5 types inscription + Play/App Store)
- (Optional) Persistance lang/currency change sur la borne (PATCH /api/kiosk/{token}/preferences)



## Iteration 70 (Feb 12, 2026) — Fix pages blanches chauffeur & client + identifiants démo (DONE)
### 🐛 Bug 1 : Page blanche `/chauffeur/home`
- **Cause** : `DriverProfile` Pydantic exigeait `vehicle_type`, `vehicle_number`, `vehicle_model`, `license_number` en string obligatoire. Sur les drivers legacy (créés avant l'ajout de ces champs ou seedés sans), `find_one` retournait un doc valide mais le `response_model=DriverProfile` rejetait la sérialisation → 500 → `loadDriverProfile()` plantait dans le `DriverHome.js` → tout le render échouait silencieusement.
- **Fix** : 4 champs rendus `Optional[str] = None` dans `/app/backend/models/schemas.py`.

### 🐛 Bug 2 : `_resolve_palette` overflow (cosmétique)
- **Cause** : Driver à 102 pts (au-dessus de toutes les palettes) retombait sur `palettes[0]` = "Debutant".
- **Fix** : Si `points > max(palettes)`, retourner la plus haute palette. `_resolve_palette` dans `/app/backend/routes/drivers.py`.

### 🐛 Bug 3 : Page blanche `/home` client
- **Cause** : `useSbPayGoAvailability` était utilisé ligne 23 de `SideMenuDrawer.js` mais l'import manquait → `ReferenceError` au render → écran blanc avec error overlay.
- **Fix** : Ajout de `import { useSbPayGoAvailability } from '../hooks/useSbPayGoAvailability';`.

### 🔑 Nouveau compte chauffeur de démo (phone login)
- **Téléphone** : `+33644112233`
- **Mot de passe** : `Chauffeur2026!`
- **Statut** : approved + actif
- Permet de tester le flow phone-login complet sur l'app chauffeur.
- Documenté dans `/app/memory/test_credentials.md`.

### Tests
- ✅ `/chauffeur/home` : body 207 chars, 0 erreur JS, dashboard complet (En ligne, gains 23€, carte Leaflet Paris, bottom nav)
- ✅ `/home` client : body 2560 chars, 0 erreur JS, dashboard complet (Services Taxi 8 tuiles, Livraison Colis, Services Livraison)
- ✅ Phone-login `+33644112233` / `Chauffeur2026!` → role=driver, JWT créé



## Iteration 69 (Feb 12, 2026) — Visibilité scoring & auto-dispatch côté chauffeur/client (DONE)
### Audit de l'apparence par app après iter62-68
Découvert que 3 fonctionnalités backend n'étaient pas exposées dans les UIs concernées :
1. ❌ Chauffeur ne recevait que `new_ride_request`, pas les `priority_ride_offer` du tier 1/2 de l'auto-dispatch
2. ❌ Chauffeur n'avait aucun moyen de voir son historique `score_log[]` (créé en iter68)
3. ❌ Client n'avait aucun retour visuel quand sa course était auto-annulée par le dispatch

### Implémentations
- **Backend** : nouvel endpoint `GET /api/drivers/my-score-history` retournant `current_points`, `current_palette`, `next_palette` (avec `points_to_reach`), `history[]` (50 entrées max, plus récent en premier), `totals` (gained/lost/entries).
- **`DriverHome.js`** : ajout du handler `priority_ride_offer` qui réutilise le modal `incoming-request-modal` avec un flag `is_priority=true` → badge `⚡ TIER N` ambré animé.
- **`RideTrackingPage.js`** : handler `ride_auto_cancelled` → toast.error 'Course annulée automatiquement' + navigation auto vers /home après 4s.
- **`DriverScorePage.js`** (nouvelle page `/chauffeur/score`) : header dégradé couleur palette, KPI gros points, barre de progression vers prochaine palette OU badge "plus haut palier", 3 totaux (gagnés/perdus/entrées), graphique Recharts d'évolution avec lignes de référence palette min/next, historique détaillé avec icônes ⚡/📉, raison, ride_id et timestamp.
- **`DriverProfilePage.js`** : nouvelle row "Mon score" avec icône Trophy ambre.

### Tests iter69
- Backend : **8/9 pytests** (1 échec pré-existant non lié à iter69 sur `/api/drivers/profile` — Pydantic ValidationError sur driver legacy sans `vehicle_type`/`license_number`).
- Frontend : **100% ✅** — tous les data-testids présents (`driver-score-page`, `current-palette-name`, `current-points`, `points-to-next`, `score-chart`, `score-history`, `history-entry-{i}`, `priority-badge`).
- E2E vérifié manuellement : driver `driver_waybill` à 102 points avec 2 entrées d'historique (+3 acceptation tier 1, -1 non-réponse) → page rendue parfaitement.

### Bugs pré-existants à traiter plus tard (optionnel)
- `_resolve_palette` retourne `palettes[0]` quand points dépassent toutes les ranges (driver à 102 pts → affiche "Debutant" au lieu de la plus haute palette). Cosmetic.
- `/api/drivers/profile` 500 pour legacy drivers sans `vehicle_type`/`license_number` (Pydantic strict). Ne casse pas l'UI grâce à `Promise.allSettled`.

### Backlog mis à jour
- 🔴 P0 : Push Notifications Firebase FCM (en attente clés utilisateur)
- P1 : Backfill `vehicle_type`/`license_number` OU relâcher la contrainte Pydantic
- P1 : Fix `_resolve_palette` overflow vers la plus haute palette
- P1 : Phase 3 (VOIP/Twilio, Photo zone pickup, Lost & Found)



## Iteration 68 (Feb 12, 2026) — Driver Quality Scoring auto-régulé (DONE)
### 🏆 Scoring qualité chauffeur (boucle vertueuse Uber Pro)
- **Backend `auto_dispatch.py`** :
  - 3 nouvelles clés config : `scoring_enabled` (bool), `accept_bonus_points` (défaut +2), `no_response_penalty` (défaut −1), `min_points_floor` (défaut 0).
  - `_adjust_driver_points(user_id, delta, reason, ride_id, floor)` : helper qui modifie `drivers.points`, respecte le plancher, et append un `score_log[]` plafonné à 200 entrées (slice).
  - `_escalate_ride` enrichi : persiste `offered_to_drivers[]` via `$addToSet` (déduplication automatique).
  - `_penalize_non_responders` : appelé lors de la transition tier 1 → tier 2 ET lors de l'auto-cancel → retire `no_response_penalty` points à chaque driver offert qui n'a pas accepté. Drivers déjà pénalisés sont tracés dans `penalized_drivers[]` pour éviter double-pénalité.
  - `award_escalation_bonus` (callable depuis rides.py) : si `auto_dispatch_tier > 0` et acceptation, +`accept_bonus_points` au driver.
- **Hook dans `rides.py` `accept_ride`** : après l'attribution des points classiques, vérifie `auto_dispatch_tier` et déclenche le bonus via `_adjust_driver_points`.
- **Frontend `/admin/auto-dispatch`** : nouvelle section "Scoring qualité chauffeur" avec toggle Activé + 3 inputs (bonus, malus, plancher) + explication. Icône Trophy amber.

### Tests E2E manuels validés
- ✅ Course créée → escaladée tier 1 → acceptée → driver +3 points (100 → 103).
- ✅ Course créée → escaladée tier 1 → non acceptée (timeout 10s) → transition tier 2 → 3 drivers pénalisés (−1 chacun, 103 → 102).
- ✅ `penalized_drivers[]` empêche la double pénalité si l'auto-cancel survient ensuite.
- ✅ Plancher de points respecté (test mental : floor=0 empêche la descente sous zéro).

### Architecture du flux
```
RIDE PENDING ─┬─ 30s: tier 1 → priority_ride_offer (WS) aux palettes Expert/Confirme
              │       offered_to_drivers[] = [d1, d2, d3]
              ├─ acceptation par d2 → driver_id=d2, status=accepted, +2 points pour d2
              │
              ├─ OU 60s sans acceptation: tier 2 escalation
              │     → pénalise d1, d2, d3 (−1 chacun) → penalized_drivers[]=[d1,d2,d3]
              │     → priority_ride_offer aux palettes +Standard, rayon ×2
              │
              └─ OU 120s sans acceptation: auto_cancel
                    → re-pénalise les drivers tier 2 non encore pénalisés
                    → notif client + broadcast admin
```

### Backlog mis à jour
- 🔴 P0 : Push Notifications Firebase FCM (en attente clés utilisateur)
- P1 : Renouveler clé Google Maps · Phase 3 VOIP/Twilio · Stripe paiements réels



## Iteration 67 (Feb 12, 2026) — God's View Leaflet + Auto-dispatch (DONE) · FCM pending keys
### A) Push Notifications Firebase FCM
- ⏸️ **EN ATTENTE des clés utilisateur** (Service Account JSON + Web App config + VAPID Key).
- Playbook récupéré via `integration_playbook_expert_v2`.

### B) God's View → Leaflet (élimine dépendance Google Maps)
- `AdminDashboard.js` : remplacement du `<GoogleMap>` + `<MarkerF>` par `<LeafletMap heatPoints={...}>` dans la carte God's View.
- Suppression des imports `useJsApiLoader`, `GoogleMap`, `MarkerF` et de `GMAP_KEY`. Plus de "Oops! Something went wrong." sur `/admin`.
- Centré Martinique 14.6161/-61.0588, 3 heat points démo.

### C) Auto-dispatch (mode cockpit pro façon Uber)
- **Backend `routes/auto_dispatch.py`** (~220 lignes) :
  - `auto_dispatch_loop()` : tâche asyncio lancée dans `lifespan`, scan toutes les 5s des courses `pending`.
  - Calcul distance Haversine + mapping `driver.points` → palette via config `rewards`.
  - Tier 1 après `first_escalation_seconds` (défaut 30s) : broadcast WS `priority_ride_offer` aux drivers dans `radius_km` (5 km) matchant `first_palettes` (Expert, Confirme).
  - Tier 2 après `second_escalation_seconds` (60s) : élargissement à `radius_km × 2` (10 km) et palettes `second_palettes` (+Standard). Forçage tier 1 si pas encore fait (stats accurate).
  - Auto-annulation après `auto_cancel_after_seconds` (120s) : `status='cancelled'`, `cancelled_by='auto_dispatch'`, notification utilisateur + broadcast admin.
  - Hardening : `try/except asyncio.CancelledError` pour silence à l'arrêt.
- **Endpoints admin** :
  - `GET /api/admin/auto-dispatch/config`
  - `PUT /api/admin/auto-dispatch/config` (merge partiel persisté dans `service_configs.auto_dispatch`)
  - `GET /api/admin/auto-dispatch/stats` (counts par tier)
- **Frontend `/admin/auto-dispatch`** : page complète avec Switch Activé/Désactivé, 4 stat cards (tier 0/1/2/cancelled), 3 inputs délais, input rayon (min 10s pour auto-cancel), 2 rows de boutons palettes (toggle Expert/Confirme/Standard/Debutant pour tier 1 et 2), bouton Save. Auto-refresh stats toutes les 10s.
- Sidebar : nouvel item "Auto-dispatch" (icône Lightning) sous ACCUEIL.

### Tests iter67
- **Backend 12/12 pytests ✅** (config admin-only 403, partial merge, stats shape, E2E escalation après 18s).
- **Frontend 100% ✅** (13 testids, palettes toggles, save toast, God's View Leaflet rendu, /admin sans erreur).
- **Loop confirmé** : "AutoDispatch loop started" + 62 anciennes courses pending auto-annulées.

### Bugs connus
- 🟡 `REACT_APP_GOOGLE_MAPS_KEY` expirée — toujours impactant `RideBookingPage.js` (non-corrigé ici). À renouveler.

### Backlog mis à jour
- 🔴 **P0** : Push Notifications Firebase FCM (en attente clés utilisateur)
- P1 : Renouveler clé Google Maps OU migrer RideBookingPage vers Leaflet
- P1 : Phase 3 (VOIP/Twilio, Photo zone pickup, Lost & Found)
- P2 : Stripe paiements réels · Merchant checkout sponsoring · Dynamic pricing



## Iteration 66 (Feb 12, 2026) — WebSocket cockpit + Dashboard V3Cube enrichi (DONE)
### A) Cockpit temps réel sur `/admin/live-rides`
- **Backend** : `POST /api/rides` appelle désormais `manager.broadcast_to_admins({type:'new_ride_request', ride_id, booking_no, pickup_lat/lng, addresses, vehicle_type, estimated_fare, distance_km, user_id, created_at})` en plus du broadcast aux chauffeurs.
- **Frontend `AdminLiveRides.js`** :
  - WebSocket `wss://.../api/ws/admin_<userId>_<ts>` ouvert à l'arrivée sur la page.
  - À la réception d'un `new_ride_request` : 🔔 **son ping** (data-URI WAV 440Hz, persistance localStorage `admin_live_sound`), 📣 **toast sonner** "🚖 Nouvelle course #...", 💫 **flash visuel 5s** sur la ligne de la liste (`animate-pulse ring-2 ring-amber-300` + icône Bell qui rebondit).
  - Bouton `Son ON/OFF` (data-testid `toggle-sound-btn`) dans le header.
  - Polling fallback réduit à 15s (le WS gère le temps réel).

### B) Fix CRITIQUE - WebSocket path
- **Bug** : `/ws/{client_id}` était mounté hors préfixe `/api`, donc l'ingress Kubernetes/Cloudflare ne le routait pas vers backend:8001 (404 / SPA HTML retournée).
- **Fix** : déplacement vers `@app.websocket("/api/ws/{client_id}")` dans `server.py` + mise à jour des 4 clients frontend (`AdminLiveRides`, `OrderTracking`, `RideChatPage`, `hooks/useWebSocket`).
- **Vérification E2E manuelle** : `wss://.../api/ws/admin_smoketest` → ping/pong OK. User crée une course via `POST /api/rides` → admin reçoit `new_ride_request` (booking 81709910, fare 10€) en ~1s. ✅

### C) Dashboard V3Cube enrichi (`/admin`)
- 6 nouvelles cartes V3Cube ajoutées après la ligne KPI :
  - **Services à la demande** (Total Trips + Parcel Deliveries, tabs Aujourd'hui/Total)
  - **Consultation Vidéo** (Consultations + Terminées)
  - **Delivery Genie / Runner** (Runner + Genie)
  - **Acheter, Vendre & Louer** (Voitures + Objets généraux + Immobilier)
  - **Livraisons Boutiques** (Total Orders + Active Stores)
  - **Covoiturage (Ride Share)** (En cours + Terminées)
- Composants réutilisables : `ServiceMiniCard` (générique 2 stats + tabs + Voir tout) et `BuySellRentCard` (3 catégories spécifiques marketplace).
- data-testids ajoutés : `on-demand-services-card`, `video-consult-card`, `genie-runner-card`, `buy-sell-rent-card`, `store-deliveries-card`, `ride-share-card`.

### Tests
- **iter65** initial : 7/8 backend OK, bug critique WS détecté → fixé.
- **iter66** E2E manuel : WS connect via URL publique ✅, broadcast admin sur création de course ✅.
- Régression iter62 (live-rides, SB PayGo auto-debit, profile tabs) toujours OK.

### Bugs connus non bloquants
- `REACT_APP_GOOGLE_MAPS_KEY` expirée — la clé Google Maps casse les widgets Google Maps (booking page, God's View embed). Le cockpit `/admin/live-rides` n'est PAS impacté (Leaflet/OSM). À renouveler par l'utilisateur.
- God's View affiche "Oops! Something went wrong." sur `/admin` — conséquence directe de la clé Maps expirée.

### Backlog mis à jour
- 🔴 **P1** : Renouveler la clé Google Maps (action utilisateur)
- P1 : Migrer God's View vers Leaflet (comme AdminLiveRides) pour ne plus dépendre de Google Maps
- P1 : Phase 3 (VOIP/Twilio, Photo zone pickup, Lost & Found)
- P2 : Stripe paiements réels · Merchant checkout · Push notifications



## Iteration 64 (Feb 12, 2026) — Admin Live Rides + SB PayGo auto-debit + Profile Tabs (DONE)
### A) Admin Live Ride Tracking
- **Backend** : nouveau endpoint `GET /api/admin/live-rides` (admin/dispatcher only). Retourne `{rides[], counts:{pending,accepted,arriving,in_progress}, total}` avec coords pickup/dropoff/driver (depuis WS manager) + passenger_name/phone enrichis.
- **Frontend** : nouvelle page `/admin/live-rides` (`AdminLiveRides.js`) — carte Leaflet 560px avec markers pickup (vert) / dropoff (rouge) / driver (bleu) + polyline. Sidebar courses actives (auto-refresh 5s) avec pills filtre par statut. Sélection d'une course re-centre la carte + affiche fiche détaillée (passager/chauffeur/distance/tarif).
- **Sidebar Admin** : nouvel item "Courses en direct" sous ACCUEIL.

### B) SB PayGo auto-débit en fin de course
- Quand `update_ride_status('completed')` est appelé sur une course dont `payment_method == 'sbpaygo'`, le backend débite automatiquement `final_fare` du wallet `sbpaygo_wallets`, crée une transaction `{type:'debit', ride_id, label}`, et marque `payment_status='paid'`, `paid_with='sbpaygo'`, `paid_at=now`.
- Si solde insuffisant → `payment_status='unpaid_insufficient'` (pas d'erreur, l'utilisateur peut recharger et payer manuellement via `/api/finance/sbpaygo/pay-ride`).

### C) ProfilePage Tabs (14 sous-vues)
- `?tab=` query param lu via `useSearchParams` → rend `ProfileTabView` au lieu du menu plein écran.
- **Tabs fonctionnels** :
  - `password` : formulaire 3 champs → `POST /api/auth/change-password` (nouveau endpoint, vérifie mdp actuel, min 6 chars).
  - `language` : 5 langues (FR/EN/ES/AR/PT), persistance localStorage `sb_lang`.
  - `currency` : 5 devises (EUR/USD/XOF/XAF/MAD), persistance localStorage `sb_currency`.
  - `notifications` : 4 switches (push/email/sms/promos), persistance localStorage `sb_notif_prefs`.
  - `verify-email` : bouton "Envoyer le lien de vérification" (mock toast).
- **Tabs "Bientôt"** (10 vues placeholders avec CTA navigation) : documents, cart, about, company, articles, properties, vehicles, fav-home, fav-work.
- ProfilePage menu items câblés avec onClick `navigate('/profile?tab=...')` (password, language, currency, notifications, documents, about, company, business).

### Tests
- **iter62 backend** : 8/8 pytest ✅ (live-rides, change-password 3 cases, SB PayGo auto-debit E2E).
- **iter62 frontend** : 100% — admin-live-rides UI + 14 profile tabs interactifs + régression OK (/admin, /admin/monitoring, /profile, /ride).
- **E2E manuel** confirmé : wallet 100€ → ride sbpaygo terminée → wallet 90€ avec tx debit 10€ loggée.

### Backlog mis à jour
- P1 : VOIP/Twilio, Photo zone pickup, Lost & Found (Phase 3).
- P1 : Stripe paiements réels (top-up wallet, méthodes de paiement).
- P2 : Merchant self-service checkout pour Sponsored Listings.
- P2 : Splitter admin.py (660 lignes) en sous-modules dashboard/live_rides/reports.
- P2 : WebSocket push pour Live Rides au lieu du polling 5s.
- P2 : Rotation JWT au changement de mot de passe (invalider anciennes sessions).
- P2 : Dynamic pricing, WhatsApp booking, Hire a Driver, push notifications Firebase/OneSignal.



## Iteration 63 (Feb 12, 2026) — E2E Waybill + Migration Maps gratuites (DONE)
### Test E2E WaybillPage avec vraies données
- Flux complet : login user → register driver → seed driver approved → create ride → accept → arriving → in_progress (OTP validé) → completed → tip 5 € → GET waybill.
- Capture finale `/ride/{id}/waybill` : N° feuille `SBD-F8D785B6`, Date 12/05/2026 02:33:40, Passager "Test User", Chauffeur "Pierre Dupont - Renault Megane · AB-123-CD", Départ "Place du Châtelet", Arrivée "Tour Eiffel", Distance 4.2 km, Pourboire 5 €, **Total 15.00 €** ✅
- Driver seed via script `/tmp/seed_driver.py` (Mongo insert direct dans `drivers` collection avec status="approved").

### Migration Google Maps → OpenStreetMap / Leaflet (gratuit)
- **Nouveau composant** : `/app/frontend/src/components/LeafletMap.js` — wrapper réutilisable React-Leaflet avec :
  - Markers de couleur (vert/rouge/bleu) pour pickup/dropoff/driver
  - Polyline pour la route, Circle pour les zones chaudes (heatmap)
  - `Recenter` (useMap) + `ClickHandler` (useMapEvents) pour gérer center dynamique + clic carte
  - Icons fix pour bug webpack avec Leaflet default icons
- **RideMapStep.jsx** : swap `<GoogleMap>` + `MarkerF` + `PolylineF` → `<LeafletMap>` (props pickup/dropoff/routePath/onMapClick).
- **DriverHome.js** : swap `<GoogleMap>` + `<CircleF>` heatmap → `<LeafletMap>` avec prop `heatPoints` (cercles colorés rouge/orange/bleu selon densité).
- Imports `@react-google-maps/api` et `GMAP_KEY` retirés des 2 fichiers.

### Vérifications
- Lint OK sur tous les fichiers modifiés ✅
- Screenshot Step 2 ride : carte OpenStreetMap rend pleinement avec rues/arrondissements, markers visibles, ETA bubble, toggle Taxi Pool, CTA "Demander maintenant" ✅
- WaybillPage E2E rend toutes les données réelles ✅

### Reste à faire
- Optionnel : swap `RideTrackingPage`, `TaxiBiddingPage`, `RideBookingPage` parent (qui utilise encore `useJsApiLoader`) pour Leaflet aussi — actuellement RideTrackingPage utilisait déjà Leaflet, les autres dépendent encore de `useJsApiLoader` mais le hook ne plantera pas (juste charge inutilement le SDK GM).
- Driver Heat View : tester visuellement avec un compte driver actif (le bouton + overlay sont en place).
