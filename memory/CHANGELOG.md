# CHANGELOG

## 2026-06-12 — Covoiturage : UI admin config + avis détaillés + badge « Super chauffeur » [DONE, testé 100%]
Trois ajouts (depuis le backlog) finalisés et testés e2e.
- **UI admin config** : `AdminCarpoolConfig.js` (route `/admin/carpool-config`, menu Admin > Covoiturage > « Config paiement (escrow) »). Édite commission %, places max/réservation, places max/trajet, libération auto (h), activation, devise. Persiste via `GET/PUT /carpool/admin/config` (admin only, 403 sinon). Aperçu du partage chauffeur/plateforme en direct.
- **Avis détaillés chauffeur** : `GET /carpool/drivers/{id}/reviews` (note moyenne, nombre, `is_super_driver`, 30 derniers avis avec auteur/étoiles/commentaire). Frontend : zone note cliquable sur chaque trajet → `DriverReviewsModal` (note moyenne + liste des avis).
- **Badge « Super chauffeur »** : seuil note ≥ 4.7 ET ≥ 5 avis. `_attach_driver_ratings` ajoute `driver_super` ; badge affiché sur les cartes de recherche et dans la modale d'avis.
- Polish : libellé toggle « activé/désactivé », alias de route `/covoiturage` (en plus de `/carpool`).
- **Testé** : pytest 5/5 + e2e 100% (admin config persiste 15→18→15, 403 non-admin ; badge Super « ★ 4.8 (5) » + modale avec 5 avis).



## 2026-06-12 — Covoiturage : notation (★) chauffeur ↔ passager + note moyenne en recherche [DONE, testé 100%]
Après un trajet covoiturage TERMINÉ, le passager note le chauffeur et le chauffeur note le passager (1-5 ★ + commentaire). La note moyenne du chauffeur s'affiche sur chaque trajet en recherche → renforce la confiance et les réservations.
- **`routes/carpool.py`** : `POST /rides/{id}/rate` (valide participation + trajet terminé + anti-doublon ; `$inc` `cp_driver_rating_*` / `cp_pax_rating_*` sur l'utilisateur noté ; notification). `_attach_driver_ratings()` enrichit search + my-rides avec `driver_rating` + `driver_ratings_count`. `my-rides` renvoie `can_rate` (personnes encore à noter).
- **`CarPoolPage.js`** : `StarBadge` (note sur les cartes de recherche, « Nouveau ✦ » si aucune), `RateModal` (sélecteur ★ + commentaire), boutons « Noter » côté passager et côté chauffeur (disparaissent une fois noté).
- **`services/api.js`** : `carpoolAPI.rate`.
- **Testé** : pytest `test_iter338_carpool.py` 5/5 (dont `test_rating_flow_and_average`) + e2e 100% (passager note 5★, chauffeur note 4★, doublon bloqué, notation avant complétion bloquée, note affichée en recherche « ★ 5 (1) »).



## 2026-06-12 — Covoiturage : paiement SB Pay sécurisé en séquestre (escrow) [DONE, testé 100%]
Le covoiturage (page CarPool) n'avait AUCUN paiement (le prix était décoratif). Refonte complète avec paiement sécurisé. Choix : escrow + commission 15 % + remboursement intégral avant départ + SB Pay uniquement.
- **`routes/carpool.py`** (réécriture) : `GET /carpool/config`, `GET/PUT /carpool/admin/config` (commission, max sièges), `POST /rides` (validation stricte, date future, bornes), `GET /rides` (seats_left), `POST /rides/{id}/book` (**réservation atomique des sièges via $expr puis débit SB Pay ; rollback des sièges si solde insuffisant** → 400 clair), `POST /rides/{id}/cancel` (remboursement passager avant départ), `POST /rides/{id}/complete` (libère le séquestre au chauffeur − 15 % commission), `POST /rides/{id}/cancel-ride` (rembourse tous les passagers), `GET /my-rides`. Boucle `carpool_autorelease_loop` (libération auto après départ + 12 h). Notifications à chaque étape, contacts révélés après réservation.
- **`core/startup.py`** : `carpool_task` branché au lifespan.
- **`CarPoolPage.js`** (réécriture) : onglets Rechercher / Mes trajets ; `BookSeatModal` (sélecteur de places + total + mention séquestre) ; section passager (statut, appel chauffeur, annuler/rembourser) ; section chauffeur (passagers + contacts, « Terminer/encaisser », « Annuler le trajet »). `carpoolAPI` ajouté.
- **Testé** : pytest `test_iter338_carpool.py` 4/4 + e2e 100% (book 40€ débité, complete +34€ chauffeur / 6€ commission, annulation remboursée, rollback solde insuffisant, refus auto-réservation). Doublon `carpoolAPI` (reliquat) retiré par l'agent de test.
- ℹ️ Le « Pool taxi » (taxi partagé instantané) était déjà sécurisé via le flux course (SB Pay, commission, dispatch) — audité, aucun changement requis.

## 2026-06-12 — E-mail confirmation vol : bouton « Réserver mon taxi SB Drive » [DONE]
Ajout dans l'e-mail de confirmation de vol d'un/deux bouton(s) deep-link vers le transfert aéroport (mode Aéroport) pour les aéroports desservis. `core/email.py _sbdrive_transfer_html()` (utilise `FRONTEND_URL` + coords aéroports), inséré dans `send_flight_confirmation`. Vérifié : FDF/ORY → 2 boutons avec n° de vol + heure ; aéroports non desservis → aucun bouton.



## 2026-06-12 — Transfert aéroport SB Drive en mode « Aéroport » dédié (suivi de vol + tarif fixe) [DONE, testé 100%]
Évolution du cross-sell : les boutons transfert ouvrent désormais le **mode « Aéroport »** de SB Drive (au lieu du mode standard) avec aéroport + n° de vol + heure pré-remplis → le chauffeur voit le vol, profite du suivi de retard et des minutes d'attente offertes.
- **`core/airport.py`** : `seed_airport_zones()` idempotent (FDF, PTP, CAY, SXM, ORY, CDG) ; **`core/startup.py`** l'appelle au démarrage (PTP/CAY/SXM créés, FDF/ORY/CDG conservés).
- **`FlightsPage.js`** `SbDriveTransfer` : URLs `mode=airport&acode=<code>&flight=<n°>` + `dlat/dlng/daddr` (aller) ou `&farr=<HH:MM>&plat/plng/paddr` (arrivée).
- **`RideChoosePage.js`** : init `flightNumber/airportTerminal/flightArrivalTime` depuis les params `flight/term/farr` ; sélection auto de l'aéroport par `acode` (matché à `/api/phase2/airports`) ; auto-advance désactivé quand deep-link aéroport présent (sinon le panneau vol était sauté).
- **Bug corrigé** (iter336→337) : en « aller à l'aéroport », l'auto-localisation du départ + destination déjà remplie sautait le panneau vol → garde `airportDeepLink`. Validé 3/3 : panneau vol monté, aéroport sélectionné, n° de vol + heure pré-remplis, bandeau « 45 min offertes · suivi de vol automatique ».



## 2026-06-12 — Transfert aéroport SB Drive sur vols confirmés (cross-sell) [DONE, testé 100%]
Sur un vol confirmé, le client peut commander une course SB Drive avec l'aéroport déjà pré-rempli (choix user : les deux sens + écran confirmation & « Mes vols » + adresse ville laissée vide).
- **`FlightsPage.js`** : composant `SbDriveTransfer` + map `AIRPORT_PLACES` (FDF, PTP, CAY, SXM, ORY, CDG avec coordonnées en dur). Deux boutons : « Aller à l'aéroport (CODE) » et « Me récupérer à l'arrivée (CODE) », affichés uniquement pour les aéroports desservis. Rendu sur l'écran succès (confirmé) et dans « Mes vols ».
- Deep-link via **paramètres d'URL natifs** de RideChoosePage (`dlat/dlng/daddr` pour destination, `plat/plng/paddr` pour départ) → pré-remplissage déterministe, sans géocodage texte ni écrasement par la géoloc.
- Itération 1 (iter334) : géocodage texte renvoyait « France » + pickup écrasé → corrigé en iter335 par les params d'URL + coords en dur. Validé 3/3 (destination = « Aéroport Aimé Césaire », départ = « Orly », visibilité correcte FDF/ORY vs LHR/JFK).



## 2026-06-12 — E-mail de confirmation vol (Resend) + e-billet PDF en pièce jointe [DONE, testé]
Dès qu'un vol est confirmé (réservation instantanée OU paiement d'un « hold »), un e-mail brandé est envoyé au contact avec le PNR, l'itinéraire, les passagers, le total, et **l'e-billet PDF en pièce jointe**.
- **`core/email.py`** : nouveau `_send_with_attachments` (attachements Resend en base64) + `send_flight_confirmation(to, name, booking, pdf_bytes)`.
- **`routes/flights.py`** : `fire(send_flight_confirmation(...))` (non bloquant) déclenché dans `live_book` et `live_pay` à la confirmation, avec le PDF généré par `_build_eticket_pdf`.
- **Testé** : pytest `test_iter333_flight_email.py` 2/2 + envoi réel vérifié (`Resend email (+1 attachment) sent to somosylv@gmail.com`, PNR RG6LRC).
- ⚠️ Limitation Resend : en mode test (domaine non vérifié), seuls les e-mails vers l'adresse vérifiée du compte (`somosylv@gmail.com`) sont délivrés. Pour livrer à tous les clients en prod → vérifier un domaine sur resend.com/domains et adapter `SENDER_EMAIL`.



## 2026-06-12 — Mode « Hold order » Duffel : bloquer un tarif sans payer [DONE, testé 10/10 + e2e]
Pour booster la conversion sur les vols chers (Affaires/Première), le client peut bloquer un tarif quelques heures sans payer. Choix user : 1a (débit SB Pay uniquement au paiement) + 2b (notif ~2h avant échéance + expiration auto).
- **`core/duffel.py`** : `create_hold_order` (type `hold`, sans paiement), `create_payment` (POST /air/payments, balance).
- **`routes/flights.py`** : `_norm_offer` expose `hold_available` / `payment_required_by` / `price_guarantee_expires_at`. `POST /flights/live/hold` (commande hold, statut `held`, PNR immédiat, **aucun débit**). `POST /flights/live/bookings/{id}/pay` (vérif échéance + solde → paiement Duffel → débit SB Pay → statut `confirmed`). `flight_hold_loop` (boucle 10 min) : notif rappel ~2h avant + passage `expired` à l'échéance.
- **`core/startup.py`** : `flight_hold_task` ajouté au lifespan.
- **`FlightsPage.js`** : bouton secondaire « Bloquer le tarif (sans payer) » sur les offres éligibles ; écran succès « Tarif bloqué » avec échéance + « Payer maintenant » ; « Mes vols » affiche badge « En attente de paiement »/« Expiré », échéance et bouton « Payer maintenant ».
- Validé : hold Affaires `UNISZP`/`CT52N6` sans débit, puis paiement → confirmé + e-billet ; 409 si échéance dépassée ; 400 si solde insuffisant. ⚠️ PREVIEW → redéploiement requis pour prod.



## 2026-06-12 — Intégration API Vols RÉELLE (Duffel, mode test) [DONE, testé 13/13 backend + e2e]
Remplacement des vols mockés par une vraie recherche temps réel + e-billet PNR via l'API Duffel (token `duffel_test_...` dans `backend/.env` → `DUFFEL_API_KEY`).
- **`backend/core/duffel.py`** (nouveau) : client httpx Duffel v2 — `create_offer_request`, `get_offer`, `create_order` (paiement `balance` en mode test), gestion d'erreurs lisibles (`DuffelError`).
- **`backend/routes/flights.py`** : nouveaux endpoints `GET /api/flights/live/search` (codes IATA, normalisation offre/slice/segment, stockage `flight_offer_requests` avec passenger_ids), `POST /api/flights/live/book` (re-fetch prix live → vérif solde SB Pay → commande Duffel → débit portefeuille → booking avec PNR), `GET /api/flights/bookings/{id}/eticket` (PDF reportlab : en-tête navy, PNR orange, cartes itinéraire, passagers).
- **`frontend/FlightsPage.js`** : toggle « Vols en direct » / « Offres SB ». Mode live = formulaire IATA + dates A/R + passagers + classe ; liste d'offres réelles (logo compagnie) ; saisie passagers (civilité, nom/prénom, date naissance, genre) + contact ; écran succès avec PNR + bouton « Télécharger l'e-billet » ; « Mes vols » affiche le PNR et le bouton e-billet.
- **`frontend/services/api.js`** : `flightsAPI.liveSearch`, `liveBook`, `eticket` (blob PDF).
- Validé : recherche FDF→ORY = offres réelles ; réservation → PNR réels `3TQTED` / `4CB2OT` (Duffel Airways ZZ en test) ; e-billet PDF généré ; non-régression des offres SB mockées OK.
- Note : le portefeuille est en € ; Duffel renvoie EUR pour les paires testées. Pas de conversion FX si une offre revient dans une autre devise (TODO futur).



## 2026-06-11 — Bannière « Vérifiez votre email » non bloquante (fix systémique) [DONE, testé]
La bannière (`fixed bottom-0`) chevauchait les barres d'action basses sur les flux transactionnels (panier, checkout, course). Corrigé une bonne fois :
- **`VerifyEmailBanner.jsx`** : masquée sur les routes à barre d'action basse (`/course`, `/taxi`, `/checkout`, `/food/` détail, `/bidding`, `/service-providers`, `/rental`) en plus des écrans d'auth. Elle reste visible sur les écrans de navigation (accueil, profil, wallet, listes) où elle ne bloque rien.
- Fermeture désormais **persistée** par utilisateur (`localStorage`) → ne réapparaît plus après navigation/rechargement une fois fermée.
- Vérifié : `/home` → bannière visible ; `/course` → bannière absente + bouton « Réserver via WhatsApp » pleinement visible/cliquable.


## 2026-06-11 — Réservation de taxi via WhatsApp (branchement complet) [DONE, testé]
La config WhatsApp (taxi_booking) était présente côté admin (`whatsapp_enabled`, `whatsapp_number`, `whatsapp_message_template`, flag `allow_whatsapp_booking` par véhicule) mais JAMAIS consommée côté client → l'option ne fonctionnait pas (badge décoratif, aucun bouton).
- **`RideChoosePage.js`** : helper `buildWaUrl(vehSlug)` qui construit un lien `https://wa.me/{numéro}?text=...` en remplaçant les variables du modèle (`{mode}` `{pickup}` `{dropoff}` `{vehicle}` `{price}` `{when}` `{payment}`) avec les détails réels de la course.
  - **Bouton « Réserver via WhatsApp »** (vert) ajouté dans `renderCta`, visible quand `whatsapp_enabled` + numéro configurés.
  - **Badge WhatsApp cliquable par véhicule** : sur chaque carte véhicule ayant `allow_whatsapp_booking`, ouvre WhatsApp pré-rempli pour CE véhicule (stopPropagation pour ne pas sélectionner).
  - Import `WhatsappLogo`. Barres CTA étape 1 passées `z-20 → z-40` (au-dessus de la bannière email z-30).
- Vérifié e2e (préview, config déjà active : n° 33767532661, véhicules SB+Moto) : bouton principal présent avec lien correct `wa.me/33767532661?text=Bonjour SB Drive…`, 2 badges véhicule cliquables. `RideMapStep.jsx` (composant orphelin non rendu) laissé tel quel.
- **Où activer** : Admin → config taxi (whatsapp_enabled + numéro + modèle de message) ; flag par véhicule dans AdminVehicleTypes (`allow_whatsapp_booking`).


## 2026-06-11 — Audit fonctionnel + correction 2 bugs racines P0 [DONE, testé]

Audit complet (testing_agent iter266) suite au signalement utilisateur « beaucoup de modifs du dashboard pas visibles côté apps + boutons/actions morts + livraison repas ne marche pas ». Résultat : backend largement fonctionnel (14/16) ; **2 causes racines** identifiées et corrigées :

- **🖼️ Images uploadées dans le dashboard jamais persistées (bug racine)** : `AdminHomeCategories.js` et l'icône de `AdminServiceCategories.js` stockaient l'image en **base64 (data URL)** dans le payload du save → corps de requête trop volumineux → échec silencieux, `image_url` restait null en base (59/60 home_categories vides). **Fix** : passage par `POST /api/uploads/image` (composant `ImageUpload` + `merchantAPI.uploadImage`) qui renvoie une URL relative légère `/api/uploads/{id}`. `DynamicIcon` expose désormais `resolveImageUrl()` pour résoudre les URLs `/api/` ; `isImg`/`isImage`/`ServiceCategoryIcon` reconnaissent `/api/`. Vérifié e2e : upload admin → DB `image_url:/api/uploads/...` → tuile affichée sur l'accueil client. Test régression `tests/test_iter267_image_persistence.py` (passe).
- **🍔 « Livraison repas ne fonctionne pas »** : la bannière `VerifyEmailBanner` (`fixed bottom-0 z-[60]`) **recouvrait la barre panier** (`z-50`) sur `RestaurantDetail` → bouton « Voir le panier »/checkout inaccessible. **Fix** : z-index bannière abaissé à `z-30` (les barres d'action fonctionnelles passent au-dessus). Vérifié : bouton « Voir le panier · N articles · X € » visible et cliquable.
- Compte client de test ajouté : `capture.user@example.com` / `Capture123!`.

### Upload d'image pour les icônes des catégories « à la demande » (demande utilisateur)
- `AdminServiceProviders.js` (route `/admin/service-providers`, onglet « Catégories ») : chaque catégorie a désormais un aperçu d'icône cliquable ouvrant un éditeur avec **upload d'image** (`ImageUpload` → `/api/uploads/image`) + champ emoji/nom (Entrée pour valider), sauvegarde via `PUT /api/services/admin/ondemand-categories/{slug}` (champ `icon` déjà accepté). Aperçu robuste : image → `<img>`, nom Phosphor connu → composant, sinon emoji, sinon repli.
- `lib/phosphorIcon.js` : ajout `hasNamedIcon()` pour distinguer nom Phosphor vs emoji.
- `AllServicesPage.js` (client) : rendu robuste image/nom/emoji.
- Vérifié e2e : upload image sur « Bricoleur » → persiste → affichée sur `/all-services` côté client (icône de test restaurée ensuite). Désormais TOUS les types de catégories (taxi, livraison, à la demande, accueil) acceptent une image uploadée dans le dashboard et l'affichent côté client.

- **Livraison** (`/all-delivery`) : la page ignorait `store_categories.icon` et affichait des icônes Phosphor codées en dur. Désormais `AllDeliveryPage` rend l'icône du dashboard (image/emoji via `CategoryGlyph`, repli sur le visuel par défaut) + cache `cachedStoreCategories`. Admin `AdminStoreCategories` : `onFile` corrigé (upload `/api/uploads/image` au lieu de base64), `isImage`/`StoreCategoryIcon` gèrent `/api/`. Vérifié : emojis 🍴🛒💊💐✏️🍷💧🏬🦺 affichés, badges 18+ conservés ; upload image persiste et s'affiche côté client (test `test_iter268`).
- **Services à la demande** (`/all-services`) : `AllServicesPage` supporte désormais une icône image (`isImgIcon` → `<img>`) en plus des noms Phosphor, + cache `cachedOnDemandCategories`. Backend `PUT /api/services/admin/ondemand-categories/{slug}` accepte déjà `icon`. Limite connue/acceptée : pas encore d'UI admin d'upload d'image pour ces catégories (noms Phosphor uniquement).
- Cache partagé `serviceCategoriesCache.js` étendu (service/store/ondemand) → zéro flash d'icône à la navigation sur toutes les surfaces.
- Validé par testing_agent (iter269) : backend 8/8, frontend 100% sur le périmètre, aucune régression (repas/fleurs/checkout/adresse OK). Tests pytest : iter267, iter268, iter269.

- L'utilisateur a constaté que `/taxi` (grille « Choisissez un service ») montrait encore les icônes Phosphor codées en dur (incohérent avec l'accueil qui montrait les images dashboard) → effet « images qui changent » en passant d'une page à l'autre.
- **Fix global** :
  - Nouveau cache de session partagé `lib/serviceCategoriesCache.js` (`cachedServiceCategories()` / `loadServiceCategories()`, dé-duplication des fetchs) utilisé par `UserHome`, `TaxiHubPage` et `RideChoosePage` → rendu instantané des bonnes icônes à chaque navigation, revalidation en fond. Supprime le flash sur les 3 surfaces.
  - `TaxiHubPage` : `catConfig` inclut désormais `icon`. `TaxiModeGrid.jsx` rend l'icône dashboard via `CategoryGlyph` (image/emoji) avec repli sur l'icône Phosphor colorée si aucune définie.
- Vérifié e2e : `/home`, `/taxi` et `/course` affichent les mêmes icônes (images uploadées + emojis), sans flash. Surfaces NON encore unifiées (hors scope, à étendre si besoin) : sections Livraison/marketplace de l'accueil et `/all-delivery`.

- À chaque navigation vers l'accueil, `taxiCats`/`cmsItems` repartaient vides → les vignettes s'affichaient d'abord avec l'icône Phosphor de repli, puis l'API chargeait et les images/emojis du dashboard les remplaçaient (flash visible ~1s).
- **Fix** : cache mémoire de session `_homeCache` dans `UserHome.js` (pattern `useAppSettings`) — les états sont initialisés depuis le cache et mis à jour à chaque fetch (stale-while-revalidate). Résultat : rendu instantané des bonnes icônes lors des navigations SPA, revalidation en arrière-plan. Vérifié e2e (capture à 250ms après retour Accueil : images du dashboard déjà affichées, aucun flash).

- Les icônes des vignettes Taxi (Taxi VTC, Pool, Moto, Électric, Aéroport…) étaient **codées en dur** (`TAXI_VISUAL`/`MODES`) — un commentaire forçait l'icône Phosphor et ignorait l'icône admin. Or les catégories avaient déjà des icônes définies dans `/admin/service-categories` (`service_categories.icon` : images base64/url ou emojis) qui ne s'affichaient QUE dans l'admin.
- **Fix** : nouveau composant partagé `CategoryGlyph` (+ `isImgIcon`) dans `DynamicIcon.js` qui rend image (base64/url/`/api/`) OU emoji, avec fallback sur l'icône Phosphor codée en dur si aucune icône. Câblé sur 2 surfaces : accueil « Services Taxi » (`UserHome.js` — `Visual` + tuiles `customIcon: c.icon`) et page `/course` (`RideChoosePage.js` — puce de mode priorise `activeCat.icon`). Vérifié e2e : tuiles accueil affichent les voitures uploadées + emoji ✈️ ; `/course` affiche l'icône de la catégorie.
- **Où remplacer** : Menu admin → Taxi / Transport → **Gérer les catégories** (`/admin/service-categories`) → éditer une catégorie → champ icône (emoji ou image téléversée) → Enregistrer.

- **`CheckoutPage.js`** : le champ adresse était un `<Input>` texte basique **sans autocomplétion ni géocodage** (lat/lng restaient figées sur Paris). Remplacé par **`GooglePlacesInput`** (autocomplétion Google + géocodage → `delivery_lat/lng` réels), cohérent avec le flux course. Le bouton « Commander » (`fixed bottom-0`) recevait aucun z-index → ajout `z-50` pour passer au-dessus de la bannière email (`z-30`). Vérifié e2e sur la verticale Fleurs : adresse "10 Rue de Rivoli, 75004 Paris" → **commande passée et confirmée** (#f77e02, livraison 25-35 min). Verticales courses/vin/papeterie/matériaux partagent le même code.


## 2026-06-10 — Km GPS auto (rental) + bouton admin Seed/Reset démo [DONE, testé]

- **🛰️ Km GPS automatique (mise à disposition)** : `POST /drivers/location` cumule la distance (haversine, filtre les sauts >5km) sur la course rental active → `rental_gps_km`. Le meter renvoie `gps_km` ; à la clôture, le km est **pré-rempli par GPS mais modifiable** (choix 1a). `RentalDriverFlow` poll le meter (15s), affiche km live + supplément km projeté. Vérifié : 4 pings Paris → 3,59 km.
- **🧪 Seed / Reset démo (admin)** : page `/admin/demo` + endpoints `GET/POST /phase2/admin/demo/{status,seed,reset}`. Seed = crée CDG+Orly (si absents) + 3 chauffeurs démo en ligne (Paris) ; Reset = chauffeurs hors-ligne, **aéroports conservés** (choix 2b). Option **« nettoyer les courses de test »** (`clean_rides`) : supprime uniquement les courses gérées par les chauffeurs démo (périmètre sûr, compteur `demo_rides_count` affiché). Vérifié : 101 courses démo supprimées.
- Appliqué aussi **directement en prod** (CDG+Orly + 3 chauffeurs en ligne) lors de la validation déploiement.
- Tests : `tests/test_rental_disposal.py` (3/3 incl. demo) + airport (4/4) = 7/7. eslint clean.
- ⚠️ Ces features sont en PREVIEW → **redéployer** pour les pousser en production.


## 2026-06-10 — Module « Mise à disposition » (rental, P2) [DONE, testé iter223]

- **Backend** : booking rental = prix forfait fixe + config facturation (`rental_hours_included/km_included/extra_hour_rate/extra_km_rate/package_price`) + `stops`. Endpoints compteur : `POST /rides/{id}/rental/start|add-stop|end`, `GET /rides/{id}/rental/meter` (+ `_compute_rental_meter`). Override de facture à la complétion (rental → forfait + dépassement temps/km). Forfait **« Journée » 10h/100km** + tarifs dépassement (18€/h, 0,80€/km) dans les configs.
- **Frontend** : panneau rental enrichi (4 forfaits dont Journée, infos dépassement, arrêts multiples au booking via GooglePlacesInput). Nouveau **`RentalDriverFlow`** (chauffeur) : démarrer → chrono live → ajouter arrêt → terminer (saisie km) → facture. Bannière compteur **lecture seule côté client** (`RentalMeterBanner`) sur la page de suivi.
- Règles user : 1c (arrêts booking+live), 2c (compteur visible des 2 côtés), 3a (heure+km sup admin), 4a (chauffeur démarre/termine), 5a (pas d'écran admin).
- Tests : `tests/test_rental_disposal.py` (2/2) + iter223 (backend 100%, driver flow E2E, booking panel). Fix bannière client sur le chemin `isAssigned` vérifié in-browser (chrono 00:00, Projeté 72€).


## 2026-06-10 — Report + nouveau n° de vol re-tracké en une étape [DONE, vérifié e2e]

- **Backend** (`PUT /api/rides/{id}/reschedule`) : accepte un `flight_number` optionnel. Pour une course aéroport, met à jour le n° de vol, **relance le Flight Watch** dessus (seed simulé instantané + refresh réel AviationStack en tâche de fond) et réapplique l'ajustement d'heure (retard/avance) sur le nouveau créneau.
- **Frontend** (`ScheduledRidesPage`) : l'éditeur de re-planification affiche, pour les courses aéroport, un champ **« Nouveau n° de vol (suivi auto) »** (pré-rempli). Toast confirme le re-suivi.
- Vérifié e2e : ride AF1006 (annulé) → report avec AF1002 → flight_number=AF1002, statut re-tracké `delayed`, pickup auto-ajusté +45 min. 7/7 pytest, eslint clean.


## 2026-06-10 — « Reporter ma course » sur vol annulé [DONE, vérifié e2e]

- **Frontend** (`ScheduledRidesPage`) : si le vol d'une course aéroport planifiée passe `cancelled`, une bannière rouge propose **« Reporter ma course »** → ouvre l'éditeur de re-planification existant pré-rempli (+24h), `PUT /api/rides/{id}/reschedule`. La bannière disparaît une fois `rescheduled_at` posé (le client a agi).
- **Backend** (`core/airport`) : la notif client de vol annulé pointe désormais vers `/scheduled-rides` (action directe) et le message invite à reporter plutôt qu'annuler.
- Vérifié e2e : ride AF1006 → flight cancelled → reschedule OK (scheduled_at MAJ + rescheduled_at posé). 7/7 pytest, eslint clean.


## 2026-06-10 — Alerte admin son + push sur vol retardé/annulé [DONE, vérifié]

- **Backend** : `refresh_flight_for_ride` appelle `notify_admins("flight_watch_admin", …)` (in-app + WebSocket + **web push**) quand un vol suivi **passe** à `delayed` ou `cancelled` (uniquement sur changement réel). Vérifié : transition on_time→delayed (AF1002) → +1 notif admin « ⚠️ ✈️ Vol retardé ».
- **Frontend** (`AdminAirport`) : l'auto-poll 30s compare les statuts ; toute bascule vers retardé/annulé déclenche un **chime (`playAlert`) + toast.warning** (8s). Pas d'alerte au premier chargement (seed). eslint clean.


## 2026-06-10 — Flight Watch RÉEL via AviationStack [DONE, testé]

- **Intégration AviationStack** (clé user dans `AVIATIONSTACK_API_KEY`) : `core/airport.fetch_aviationstack` (GET `/v1/flights?flight_iata=`, HTTPS, timeout court) + `_map_aviationstack` (flight_status/arrival.delay/scheduled/estimated/actual → on_time/delayed/early/cancelled + adjusted_pickup). `get_flight_status` = appel réel **avec cache 10 min** + **backoff 5 min** sur échec (économise le quota gratuit 100 req/mois) et **fallback automatique** vers `simulate_flight_status` (même format de données → zéro régression).
- **Booking non bloquant** : `create_ride` seed instantané (simulé) puis tâche de fond `refresh_flight_for_ride` (données réelles, notifie si changement). `flight_watch_loop` et `POST /rides/{id}/flight-refresh` utilisent l'API réelle.
- Vérifié : clé valide (HTTP 200), mapping 4 cas (retard/avance/annulé/à l'heure), fallback OK, 7/7 pytest. Frontend inchangé (même contrat).
- Note : egress preview parfois instable (DNS) → le fallback simulé prend le relais ; en prod l'API réelle est utilisée.

## 2026-06-10 — Module « Airport Transfer » (P2) [DONE, testé iter222]

- **Backend** : `core/airport.py` (Flight Watch SIMULÉ déterministe, free-wait, bagages, navette, `flight_watch_loop`, `notify_admins`). Schemas enrichis (`airport_id/terminal/flight_arrival_time/luggage_*/shared_shuttle/flight_status/meeting_point/free_wait_minutes`). `create_ride` applique frais bagages + remise navette, résout l'aéroport, seed le statut vol, alerte admins. `phase2.py` : CRUD `airport-zones` étendu, `GET /airports` (public), `GET /admin/airport/reservations`, `POST /rides/{id}/flight-refresh`. Loop enregistrée dans `startup.py`.
- **Frontend** : panneau aéroport enrichi (`RideChoosePage`), bannière `FlightWatchBanner` (tracking + état recherche), info vol côté chauffeur (`DriverRideFlow`, free-wait 45 min), page admin `/admin/airport` (KPIs + Réservations + CRUD aéroports), chip vol sur `/scheduled-rides`.
- **Choix user** : flight watch en mode SIMULÉ (option d) — migration vers vraie API de vols quand clé fournie. Tous chauffeurs éligibles. 45 min attente gratuite. Aéroports gérés par admin. Dispatch via agent IA existant.
- Tests : `backend/tests/test_airport_transfer.py` (3/3) + iter222 (6/6 backend). FE validé (admin + panneau client + booking).


## 2026-06-09 — Fix « la proposition de tarif ne fonctionne pas » (enchères) [DONE, testé]

- **Bug** : à l'acceptation directe d'une course en enchère (« Offrez votre tarif »), le chauffeur acceptait le tarif proposé par le client (ex. 25 €) mais la course retombait sur l'estimation système (ex. 14,38 €) → le tarif proposé/négocié était perdu.
- **Cause** : `accept_ride` (rides.py) n'appliquait pas `proposed_fare` pour les courses bidding.
- **Fix** : `accept_ride` détecte les courses bidding (`mode/ride_type=='bidding'` ou `is_bidding`) et fixe `estimated_fare = agreed_fare = final_fare = proposed_fare` dans le verrou atomique d'acceptation.
- **Vérifié** : reproduction E2E via API (création enchère → chauffeur accepte → tarif = 25 € ✓ ; contre-offre chauffeur → client accepte → 32 € ✓) + 2 tests pytest (`test_iter210_bidding_accept_fare.py`). Le flux web d'enchères fonctionnait par ailleurs (contre-offre/accept). Aucun changement frontend requis (affiche `estimated_fare`, désormais correct).
- NB : analyse menée sur l'app **web** (reproductible). Si le symptôme concernait l'app **mobile native** (`/app/mobile`, Expo — codebase distinct), me le préciser pour un correctif ciblé.


## 2026-06-09 — Surge auto par commune + contact client + chauffeurs hors-ligne à proximité [DONE, testé 100% — iter209]

### 1. Tarification dynamique automatique par commune (surge)
- `pricing.py` : `get_auto_surge_config()`, `auto_surge_multiplier_for_demand()`, `_auto_commune_surge()` — majoration auto selon la demande en attente de la commune du pickup (paliers ≥3→x1.2, ≥6→x1.5, ≥10→x1.8, plafond x2.0). Intégré dans `compute_pricing_adjustment` (max entre surge manuel et auto) → appliqué à l'estimation ET à la création de course.
- `dispatch_admin.py` : `GET/PUT /api/admin/dispatch/auto-surge` (config, stockée dans service_configs `auto_surge`). `demand-heatmap` expose `surge_multiplier` par commune + `auto_surge_enabled`.
- `AdminDispatch.js` : carte « Tarification dynamique automatique » (toggle + 3 paliers éditables + plafond + save) + badge `xN` sur les tuiles de la heatmap. **Activé par défaut** (demande utilisateur).

### 2. Nom + téléphone client à côté des commandes
- Overview dispatch : ajout `passenger_phone`. `AdminDispatch.js` : nom client + téléphone cliquable (`tel:`) sur chaque course en attente. Côté chauffeur : déjà existant (`tel:${ride.passenger_phone}` dans `DriverRideFlow.jsx`).

### 3. Chauffeurs taxi à proximité (hors-ligne, actifs récemment)
- `GET /api/admin/dispatch/nearby-offline-drivers?days=14` : chauffeurs taxi approuvés hors-ligne ayant terminé une course ≤ 14 j, groupés par dernière commune connue, avec téléphone (appeler). Panneaux sur `AdminDispatch.js` ET `AdminTaxiRecruitment.js` (affichés si count>0).

### Notes (consultatif, non corrigé)
- `_auto_commune_surge` re-requête les pending à chaque estimation (O(P)) → à cacher ~5-10s à l'échelle. Le plafond `cap` plafonne le total. Backend 8/8 pytest (`test_iter209_auto_surge.py`).


## 2026-06-09 — Carte thermique de la demande par commune (Tour de contrôle dispatch) [DONE]

- Backend `dispatch_admin.py` : `GET /api/admin/dispatch/demand-heatmap` — agrège par commune la demande taxi (pending en cours pondéré ×3 + volume du jour) vs l'offre (chauffeurs taxi en ligne), avec intensité normalisée 0-100 (sur les communes localisées uniquement) et `deficit`. Le bucket « Hors zone » (demande non géolocalisée) est renvoyé séparément pour ne pas fausser l'échelle.
- Frontend `AdminDispatch.js` : nouveau widget « Carte thermique de la demande (par commune) » — grille de tuiles colorées (dégradé rouge selon l'intensité) avec courses en attente, volume du jour, taxis en ligne, badge déficit −N, légende, + tuile grise « Hors zone ». Auto-refresh. `dispatchAdminAPI.demandHeatmap`.
- Vérifié e2e : endpoint (FdF intensité 100, Lamentin 46, Sainte-Anne 31) + rendu UI (screenshot). Données de test nettoyées.


## 2026-06-09 — Zones géographiques Martinique (34 communes) [DONE]

- `routes/zones.py` : nouvelle fonction `seed_martinique_communes()` — seed idempotent (insert-only, par id `zone_mq_<slug>`) des **34 communes de Martinique** comme zones géo actives (centre lat/lng + rayon ajusté 4-7 km + alias texte). Appelée au démarrage dans `core/startup.py` après `seed_zones()` → s'applique automatiquement en preview ET en prod (DB distinctes).
- Active le ciblage par zone pour le **dispatch** (overview/heatmap par zone) et le **recrutement Taxi** (zones chaudes par commune au lieu de « Hors zone »).
- Vérifié : 34 zones actives, `resolve_zone` mappe correctement les coordonnées (Fort-de-France, Le Marin, Sainte-Anne…), page admin `/admin/zones` liste les 37 zones (3 anciennes démo restées inactives). Les zones restent éditables/désactivables par l'admin (le seed ne réécrit jamais une zone existante).


## 2026-06-09 — Recrutement Taxi par zone (alerte admin chauffeurs courier→taxi) [DONE, testé 100% — iter208]

### Backend (dispatch_admin.py, préfixe /admin/dispatch)
- `GET /taxi-recruitment` : détecte les zones « chaudes » (courses taxi en attente ≥ 3 ET pending > chauffeurs taxi en ligne dans la zone) via `resolve_zone`, et liste les chauffeurs courier/livraison (sans taxi) localisés dans ces zones, avec flag `vtc_eligible`. Retour : `{hot_zones:[{zone,pending,online_taxi,deficit,candidates[]}], totals}`.
- `POST /taxi-recruitment/invite` : crée une notification 'promo' au chauffeur (`data.kind=taxi_invite`, `data.link=/chauffeur/profile?services=1`).
- « Activer » réutilise `PUT /api/admin/drivers/{id}/service-types`.

### Frontend
- Nouvelle page `AdminTaxiRecruitment.js` (route `/admin/taxi-recruitment`, menu Taxi/Transport) : compteurs, cartes zones en tension, candidats avec statut VTC, boutons **Activer** (override immédiat) / **Inviter** (notification). Auto-refresh 15s.
- Widget `dispatch-recruit-widget` sur le Tour de contrôle dispatch (`/admin/dispatch`) → CTA vers la page.
- `DriverNotificationsPage.js` : notifications avec `data.link` désormais cliquables (deep-link vers la gestion des services).

### Notes
- Aucune zone configurée en prod → tout tombe sous « Hors zone » (l'admin doit créer des zones pour un ciblage fin). Logique validée via zone de test (nettoyée). Backend 5/5 pytest (`test_iter208_taxi_recruitment.py`).
- Consultatif (non corrigé) : N+1 lookup candidats, pas d'hystérésis sur pending=online_taxi, `vtc_eligible` ne vérifie pas l'expiration.


## 2026-06-09 — Gestion services chauffeur (Taxi/Livraison/Coursier) admin + chauffeur [DONE, testé — iter207]

### Contexte / bug à l'origine
Un chauffeur configuré courier/livraison uniquement (sans "taxi") ne reçoit pas les réservations taxi planifiées (home-feed `scheduled_pending` filtré par `has_taxi`). Le compte de test `+33644112233` était dans ce cas → taxi activé (fix data).

### Côté ADMIN (nouveau)
- Backend `misc.py` : `PUT /api/admin/drivers/{driver_id}/service-types` (permission `drivers.approve`) — override admin (bypass gate VTC), `taxi_mode='car'` auto si taxi ajouté, 400 si liste vide, 404 si introuvable. (Bug projection MongoDB `{}` → faux 404 trouvé & corrigé par l'agent de test : `if driver is None` + projection `id`.)
- Frontend `AdminDrivers.js` : colonne **Services** (badges Taxi/Livr./Cours.) + modale `admin-driver-services-modal` (3 cases + Sauvegarder) accessible par cellule ou bouton clé. `adminAPI.setDriverServiceTypes`.

### Côté CHAUFFEUR (nouveau + existant)
- `DriverHome.js` : CTA **« Devenir chauffeur Taxi »** (`become-taxi-cta`) affiché quand le chauffeur n'a pas "taxi" → navigue vers `/chauffeur/profile?services=1`.
- `DriverProfilePage.js` : auto-ouverture de la modale « Gérer mes services » (existante, avec gate Carte VTC) via `?services=1`.
- Vérifié e2e : CTA rendu pour chauffeur courier-only, deep-link ouvre la modale, gate VTC actif. Backend 7/7 pytest.


## 2026-06-09 — Configuration Pool admin (parité V3Cube) + véhicules dynamiques dans la réservation [DONE, testé 100% — iter206]

### Interface admin « Configuration Pool » (/admin/pool-config)
- Nouvelle page dédiée `AdminPoolConfig.js` (remplace le formulaire générique) : activation Pool, `pool_percentage`, capacité max passagers (`available_seats`), sièges max/commande (`max_seats_per_booking`), nombre max d'arrêts (`max_stops`), réduction covoiturage, **catégories de véhicules éligibles** (cases liées à `/api/config/vehicle-types`), **moyens de paiement autorisés** (cash/card/wallet/sbpaygo). Sauvegarde via `PUT /api/admin/service-config/pool` (préserve les autres clés du doc).
- Backend : nouvelle fonction `get_pool_global_config()` (rides.py) + endpoint public `GET /api/config/pool`. **Enforcement** dans `create_ride` : véhicule non éligible / paiement non autorisé / trop d'arrêts → 400 (messages FR explicites).

### Correction MODES véhicule codés en dur
- `AdvancedTaxiBookingPage.js` : `VEHICLE_BY_MODE` corrigé vers des slugs RÉELS (sb/luxe/airport/confort/moto), résolution dynamique via `/api/config/vehicle-types`, affichage de l'**image admin** dans la carte d'estimation. Auparavant 'comfort'/'premium' (inexistants) cassaient l'estimation.
- `RideChoosePage.js` : en mode Pool, la liste véhicules (`effectiveVtypes`) et les paiements (`effectivePayments`) sont filtrés selon la config admin ; le sélecteur de places respecte `max_seats_per_booking`.
- Tests : `/app/backend/tests/test_iter206_pool_config.py` (7/7). ⚠️ PREVIEW → redéploiement requis pour la prod.


## 2026-06-09 — Bannières + sous-titres catégories taxi visibles côté client [DONE, vérifié]

- `UserHome.js` : les catégories taxi configurées avec **Type d'affichage = Bannière / Icône+Bannière** + image bannière s'affichent en **cartes pleine largeur** (image + nom + sous-titre `list_description`) sous la grille « Services Taxi » → parité visuelle V3Cube. `data-testid=taxi-banner-cards` / `taxi-banner-{key}`.
- Vérifié e2e + screenshot : catégorie « Trajet Premium » rendue sur l'accueil. Clic → `/course?mode={key}`. Catégories en mode Icône inchangées.
- ⚠️ PREVIEW → redéploiement requis pour la prod.

## 2026-06-09 — Éditeur de catégories façon V3Cube + covoiturage visible "Complet" [DONE, testé 100%]

### Éditeur de catégories de service (parité V3Cube)
- Backend `service_categories.py` : `POST /api/admin/service-categories` (créer, clé unique, `is_custom`), `DELETE /{key}` (supprimer), et `PUT /{key}` étendu aux champs V3Cube : `view_type` (icon|banner|icon_banner), `banner_image`, `service_image`, `list_description`, `description`.
- Frontend `AdminServiceCategories.js` : bouton **« Créer une catégorie »**, **suppression** par carte (confirm), et modale enrichie : choix du **Type d'affichage** (Icône / Bannière / Icône+Bannière), upload **icône** + **bannière** (objet storage via `ImageUpload`) + **Service Image**, **description courte** et **description**. `adminAPI.createServiceCategory` / `deleteServiceCategory`.
- Vérifié : créer (icon_banner + images), éditer, supprimer → reflété dans `/api/service-categories` (app client).

### Covoiturage
- `GET /api/carpool/rides` renvoie désormais les trajets `open` ET `full` → l'état **« Complet »** est visible côté client (au lieu de disparaître).

- **Tests** : `tests/test_iter205_carpool_svccat.py` (14/14). testing_agent iteration_205 : **100% (backend 14/14 + frontend complet)**.
- Note : les chauffeurs/admins sont redirigés hors de `/carpool` (c'est une fonction CLIENT) — comportement attendu.
- ⚠️ PREVIEW → redéploiement requis pour la prod.

### ⚠️ Clarification importante (véhicules)
- La config véhicules de NOTRE app se reflète déjà dans l'app cliente. Les écrans « Service Category » montrés par l'utilisateur viennent de **sbdrivevtc.com** (V3Cube PHP séparé). Tout doit être configuré dans NOTRE admin pour être reflété dans NOTRE app.


## 2026-06-09 — Covoiturage interurbain activé [DONE, testé e2e]

- `CarPoolPage.js` rebranché sur le vrai backend `/api/carpool` (était sur un catalogue de démo `phase2` + bouton « Publier » factice).
- **Publier un trajet** (modale : départ, destination, date/heure, places, prix/place → POST `/api/carpool/rides`), **liste des trajets réels** (`GET /api/carpool/rides`), **réserver une place** (`POST /api/carpool/rides/{id}/book`) avec décompte des places restantes + état « Complet ».
- Distinct du **Pool** (taxi partagé instantané, catégorie taxi séparée).
- Vérifié e2e : publier → lister (5 trajets) → réserver → passagers +1. Frontend compile OK.
- ⚠️ PREVIEW → redéploiement requis pour la prod.

### Constat config véhicules (à clarifier avec l'utilisateur)
- Vérifié : la config véhicules de NOTRE app se reflète bien côté client — `AdminVehicleTypes`/`VehicleTypeEditor` (images, tarifs, capacité) → `/api/config/vehicle-types` → `RideChoosePage` affiche images + tarifs (15 types avec images servies). Les captures « Service Category (Vehicle Service) » viennent de **sbdrivevtc.com**, un système V3Cube PHP **séparé** (pas notre app).


## 2026-06-09 — Détection de mots-clés à risque dans le chat course [DONE, testé 100%]

- **Scanner** `scan_risky_text` (dispatch_admin.py) : détecte espèces/cash/liquide, intention d'annulation, hors-app (WhatsApp, virement, paypal, « appelle-moi », « payer directement »…) + numéros de téléphone (≥9 chiffres, ignore les petits montants).
- Intégré dans `phase1.send_ride_message` : le message du chauffeur est marqué `flagged`/`flag_reasons` ; si c'est le CHAUFFEUR, `record_chat_flag` incrémente `chat_flags_count` + alerte admin temps réel (`chat_risk_flag`). Un message client risqué est surligné mais ne sanctionne pas le chauffeur.
- **Admin** : `ride-conversations` marque le fil `flagged` ; la modale surligne les messages à risque (bordure rouge + puces de raison). `driver-behavior` renvoie `chat_flags` et signale (🚩) tout chauffeur avec ≥1 alerte chat ; nouvelle colonne « Alertes chat » dans la tour de contrôle.
- **Tests** : `tests/test_iter204_chat_risk_keywords.py` (6/6) + `test_iter204_chat_risk_e2e.py` (4/4). testing_agent iteration_204 : **100% (10/10 backend + frontend complet)**, 0 erreur JS.
- ⚠️ PREVIEW → redéploiement requis pour la prod.


## 2026-06-09 — Alertes live + conversations chauffeur↔client + abus wallet [DONE, testé 100%]

- **Alerte admin en direct (cloche + son)** sur `/admin/dispatch` : icône cloche avec badge rouge = nb de zones « aucun chauffeur » ; bip Web Audio + toast quand une NOUVELLE zone passe en alerte ou qu'un chauffeur est nouvellement signalé. `data-testid=dispatch-bell`.
- **Abus élargi au WALLET** : `record_driver_cancellation` (dispatch_admin.py) incrémente le compteur « sans espèces » pour les paiements CARTE **et** WALLET (`NONCASH_METHODS`). Colonnes renommées « dont sans esp. » / « % sans esp. ».
- **Conversations course chauffeur↔client (admin)** : le chat de course est stocké dans `db.ride_messages` (≠ `chat_messages`). NOUVEAUX endpoints `GET /api/moderation/admin/ride-conversations` (+ filtre `payment=noncash|card|wallet|cash`) et `/admin/ride-conversations/{ride_id}` (fil complet + contexte course). NOUVEL onglet « Courses (chauffeur↔client) » dans `AdminModeration.js` : liste avec puce paiement + ouverture du fil en modal (`ridechat-thread-modal`).
- **Tests** : `tests/test_iter203_ride_conversations_and_noncash.py` (6/6) + frontend complet. testing_agent iteration_203 : **100%**, 0 erreur JS. (Régression iter201/202 OK.)
- ⚠️ PREVIEW → redéploiement requis pour la prod.


## 2026-06-09 — Tour de contrôle dispatch + anti-abus chauffeurs [DONE, testé 100%]

### Tour de contrôle dispatch (admin/dispatcher temps réel)
- NOUVEAU `routes/dispatch_admin.py` (monté) : `GET /api/admin/dispatch/overview` (courses en attente groupées par ZONE via `resolve_zone`, tier d'escalade, mode de paiement, âge, tarif ; chauffeurs en ligne par zone ; alertes « aucun chauffeur » ; config), `GET /driver-behavior`, `POST /drivers/{id}/suspend`, `POST /drivers/{id}/reinstate`.
- NOUVELLE page `pages/admin/AdminDispatch.js` (route `/admin/dispatch`, sidebar PILOTAGE → « Tour de contrôle dispatch ») : totaux live (rafraîchissement 5s), barre « Règles de discipline », cartes zones (badges tier/paiement, chrono d'âge), table « Comportement chauffeurs » avec drapeau 🚩 + Suspendre/Réintégrer en 1 clic. `dispatchAdminAPI` ajouté.

### Anti-abus chauffeurs
- **Mode de paiement caché au chauffeur avant accept** (`rides.py list_rides`) : `payment_method`/`payment_status` retirés des offres en attente non assignées → empêche le tri (n'accepter que les espèces). Révélé après acceptation. L'admin le voit toujours.
- **Détection accepter-puis-annuler** : `driver_cancel_booking` appelle `record_driver_cancellation` (compteurs `accept_release_count`/`accept_release_cb_count` + log). Drapeau dans le contrôle tour quand le % d'annulations CB ≥ `cb_cancel_flag_pct` (avec min. `cb_cancel_flag_min`).
- **Passage hors-ligne auto après X refus** : NOUVEAU `POST /api/rides/{id}/decline` → `record_driver_refusal` ; au-delà de `max_refusals_before_offline` (fenêtre `refusal_window_minutes`) le chauffeur passe `is_online:false` + notif. Câblé dans `DriverHome.js` (`declineRide` + toast). Sonnerie+vibration à la réception : déjà présente (`startSiren`).
- Config admin via `auto-dispatch/config` (nouveaux champs : `max_refusals_before_offline`, `refusal_window_minutes`, `cb_cancel_flag_pct`, `cb_cancel_flag_min`).
- **Tests** : `tests/test_iter202_dispatch_control_tower.py` (6/6) + frontend complet. testing_agent iteration_202 : **100%**, aucun bug.
- ⚠️ PREVIEW → redéploiement requis pour la prod.


## 2026-06-09 — Phase 4 : Logique de dispatch (verrou atomique + courses planifiées) [DONE, testé 26/26]

### Upload logo & photos (Object Storage) — VALIDÉ
- La fonctionnalité était déjà entièrement implémentée (handoff périmé) : backend `routes/uploads.py` (Object Storage Emergent, POST `/api/uploads/image` auth + GET `/api/uploads/{id}` public), composant `components/ImageUpload.jsx` (ImageUpload + GalleryUpload) branché dans `MerchantSettings.js`, `AdminStores.js`, `AdminServiceProviders.js`. Champs `image_url`/`photo`/`gallery` persistés (merchants.py, admin.py, services.py).
- Vérifié e2e (upload + serve PNG 200) + testing_agent iteration_200 : 9/9 backend + persistance UI marchand. Incohérence max=8→12 corrigée côté `MerchantSettings`.

### Phase 4 — Dispatch (P1)
- **Verrou atomique à l'acceptation** (`routes/rides.py` `accept_ride`) : remplacé le find-then-update par `find_one_and_update({id,status:pending,driver_id:None})` → un SEUL chauffeur gagne la course ; le perdant reçoit **409** « Course déjà acceptée par un autre chauffeur ». Idem `passenger_accept_offer` (bidding) → 409 si déjà attribuée.
- **Courses planifiées = pool/agenda** : créées en `status:pending` avec `scheduled_at`, NON broadcastées à la création, visibles dans l'agenda chauffeur (`driver/home-feed` → `scheduled_pending`), absentes du feed immédiat (`available_rides`).
- **Auto-dispatch corrigé** (`routes/auto_dispatch.py` `_process_pending_ride`) : une course planifiée n'est plus escaladée ni auto-annulée tant qu'on n'est pas à `scheduled_lead_minutes` (défaut 15 min, configurable admin) avant le `scheduled_at`. À l'échéance → `_activate_scheduled_ride` (broadcast unique aux chauffeurs) puis timeline d'escalade normale (30s → 60s → annulation 120s) basée sur l'heure d'échéance.
- **Relâche dans le pool** : `driver_cancel_booking` remet la course en `pending` (driver_id=null) ; instantanée = re-broadcast, planifiée = retour à l'agenda.
- Config admin `GET/PUT /api/admin/auto-dispatch/config` expose `scheduled_lead_minutes`.
- **Tests** : `tests/test_iter201_phase4_scheduled_dispatch.py` (unit, 5/5) + `tests/test_iter201_phase4_api.py` (e2e, 8/8) + `test_rewards_dispatch_helpers.py` (13/13) = **26/26**. testing_agent iteration_201 : 100%, aucun bug.
- ⚠️ PREVIEW → redéploiement requis pour la prod.


## 2026-06-09 — « Parler en direct » (IA + escalade) + Upload images (object storage)

### Support « Parler en direct » (IA d'abord → escalade humaine)
- **Backend** (`routes/support.py`): agent IA **GPT-4o-mini** via clé Emergent (emergentintegrations). Endpoints `/support/me`, `/support/message` (réponse IA tant que status=ai), `/support/escalate` (→ status=escalated, l'IA se coupe), inbox admin `/support/admin/threads*` (reply en tant que `agent`, close). Garde-fou: pas de réponse sur thread clôturé. Prompt FR connaissant tout l'app (VTC, livraison, services, portefeuille, fidélité…).
- **Frontend**: composant réutilisable `SupportChatPanel.jsx` (polling 5s, bouton « Parler à un conseiller »). Intégré client (`/livechat`), chauffeur (DriverSupportPage), marchand (`/merchant/live-support`). **Admin inbox** `AdminLiveSupport` (`/admin/live-support`, lien sidebar).
- **Tests**: `test_iter198_support.py` (8/8) + testing_agent iter 198 = 100% (4 rôles).

### Upload logo & photos (object storage Emergent)
- **Backend** (`routes/uploads.py`): `POST /uploads/image` (auth, validation type + max 6 Mo) → `{id, url:'/api/uploads/{id}'}`; `GET /uploads/{id}` **public** (sert l'image pour `<img>`, Cache-Control). Refresh auto du storage_key sur 403.
- **Frontend**: `ImageUpload` + `GalleryUpload` (aperçu, progression). Marchand (logo + galerie boutique dans Vitrine), Admin boutique (logo dans `/admin/stores`), Admin prestataire (photo + galerie dans `/admin/service-providers`). `image_url`/`gallery` acceptés par `PUT /merchants/me` et `PUT /admin/merchants/{id}`.
- **Tests**: `test_iter199_uploads.py` (9/9) + testing_agent iter 199 = 100%. Galerie cap à 12 (UI alignée).


## 2026-06-09 — Réduction flash programmable (marchand + admin)

- **Backend** (`routes/merchants.py`): config `flash_discount {enabled, pct, start_time, end_time, days}` sur le marchand. Helpers `_flash_is_active` (fenêtre horaire en tz Europe/Paris, gère le passage minuit + jours), `compute_effective_discount` (la réduction la plus avantageuse s'applique), `validate_flash_discount`. `_enrich_merchant` expose `effective_discount_pct` + `flash_active`. Accepté par `PUT /merchants/me` et `PUT /admin/merchants/{id}`. `orders.py` applique la réduction effective au total.
- **Marchand** (`MerchantSettings.js`): carte « Réduction flash » (toggle, %, début/fin, chips jours, badge ACTIVE).
- **Admin** (`AdminStores.js`): mêmes champs flash dans la modale d'édition marchand.
- **Client**: badge **ambre « Flash −X% »** sur la carte resto quand actif (FoodPage), libellé « Réduction flash ⚡ » au checkout, total appliqué.
- **Tests**: `tests/test_iter197_flash_discount.py` (10/10 pass) + testing_agent iter 197 = 100% backend & frontend, aucun bug.


## 2026-06-09 — Cuisines & réductions configurables + couverture prestataires

- **Admin** (`AdminStores.js` + `PUT /api/admin/merchants/{id}`): édition cuisine, réduction (%), frais de livraison et délai par marchand (modale + colonnes dédiées). Reflété immédiatement côté client.
- **Marchand** (`MerchantSettings.js` carte « Vitrine & Réduction » + `GET/PUT /api/merchants/me`): le marchand configure lui-même sa cuisine, sa réduction et sa livraison (champs pré-remplis, réels).
- **Services à la demande**: seed étendu à 27 prestataires couvrant **les 24 catégories** — plus aucune catégorie vide (gardien, jardinage, dj, traiteur, serrurier, coach-fitness, etc. ont désormais un prestataire avec prestations).
- **Tests**: `tests/test_iter196_merchant_config_ondemand.py` (31/31 pass) + testing_agent iter 196 = 100% backend & frontend, aucun bug.


## 2026-06-09 — Module « Services à la demande » (V3Cube) + harmonisation UI

### Module Services à la demande (Lot 1 + Lot 2) — NEW
- **Backend** (`routes/services.py`): `GET /services/ondemand-categories`, `GET /services/providers?category=&lat=&lng=` (distance + price_from), `GET /services/providers/{id}`. Admin CRUD: `GET/POST/PUT/DELETE /services/admin/providers`, `GET/PUT /services/admin/ondemand-categories`. Réservation via `/services/bookings` existant (status=confirmed si provider_id).
- **Seed** (`core/ondemand_seed.py`, branché dans startup): 24 catégories FR + 9 prestataires démo (dont Sylvain G coiffeur avec 6 prestations). Idempotent.
- **Frontend**: `AllServicesPage` (grille catégories « Tous les autres services »), `ServiceProvidersPage` (`/service-providers/:slug` — « Fournisseur de services »), `ServiceProviderDetailPage` (`/service-provider/:id` — « Détail du service » avec onglets Prestations/Galerie/Avis + modale de réservation). `lib/phosphorIcon.js` résout les icônes par nom. Tuiles Accueil « Services à la demande » reliées au nouveau flux.
- **Admin**: `AdminServiceProviders` (`/admin/service-providers`) — CRUD prestataires + éditeur de prestations + toggle catégories. Lien sidebar sous « Services à la demande ».
- **Tests**: `tests/test_iter195_ondemand_services.py` (9/9 pass). Testing agent iter 195 = 100% backend + frontend, aucun bug.

### Harmonisation UI (style page Repas V3Cube)
- `MarketplacePage` + `ServiceListLayout` (Magasins à proximité & autres listes): en-tête orange + recherche blanche arrondie intégrée, cohérent avec Livraison Repas.
- Page Livraison Repas refondue (bannière, chips Cuisines, cartes Vendeurs chauds, réductions marchand réelles, panier flottant).
- Bouton chauffeur « En ligne » modernisé (dégradé vert + halo + point live), cercles de stats chauffeur peaufinés.


## 2026-06-09 — Phase 3 : Annulations, pénalités & modération + bouton chauffeur vert

### UI Chauffeur
- `DriverHomeHeader.jsx` : fond de l'en-tête repassé en **noir** (`#0B0B0B`) avec bouton « En ligne » en **vert d'origine** (`#00B578`). Vérifié visuellement.

### Phase 3 — Modération (NEW)
- Nouveau module `routes/moderation.py` (enregistré dans `core/api_router.py`).
- Règles client configurables : seuil d'avertissement (def. 10 annulations), seuil de bannissement (def. 15) → bannissement temporaire (def. 2 h) puis remise à zéro du compteur.
- Pénalités chauffeur configurables : 2 € annulation abusive, 1 € « accepter puis relâcher » (débitées du portefeuille).
- Hooks dans `routes/rides.py` : `create_ride`→`check_passenger_ban` (403 si banni) ; `cancel_ride` & `update_ride_status`(cancelled)→`register_passenger_cancel` ; `driver_cancel_booking`→pénalité `accept_release` ; cancel chauffeur→pénalité `abusive_cancel`.
- Journalisation des appels (`POST /api/moderation/call-log`, branché sur boutons d'appel client `RideTrackingPage.js` & chauffeur `DriverRideFlow.jsx`) + archivage des conversations (chat_messages) pour modération admin.
- Endpoints admin : `GET/PUT /api/moderation/admin/config`, `/admin/events`, `/admin/call-logs`, `/admin/conversations[/{ref_type}/{ref_id}]`. Self : `GET /api/moderation/passenger-status`.
- Frontend admin : page `/admin/moderation` (`AdminModeration.js`) avec 4 onglets (Règles, Avertissements & pénalités, Journal d'appels, Conversations). Lien sidebar « Modération & Annulations » sous EXPLOITATION.
- Tests : `tests/test_iter193_moderation.py` (helpers, 3 pass) + `tests/test_iter193_moderation_api.py` (HTTP e2e, 10/10 pass). Validé par testing_agent iteration_193 — 100% backend & frontend.


## 2026-06-06 (suite) — Menus restaurants traduits en FR/€

- Seed `server.py` : noms, descriptions et catégories des produits des 3 restaurants (Burger Palace, Pizza Heaven, Sushi Master) traduits en français ; descriptions des restaurants traduites. Catégories : Sides→Accompagnements, Drinks→Boissons, Rolls→Makis (Burgers/Pizzas/Desserts/Nigiri/Sashimi conservés).
- Boucles de seed passées en **upsert** des champs traduisibles (`name`/`description`/`category` produits, `description` marchands) → met à jour les documents déjà en base sans toucher prix/disponibilité.
- Vérifié via API + screenshot : fiche Burger Palace 100% FR/€ (Milkshake Vanille, Oignons Frits, Frites… prix en €, « Ajouter », aucun `$`).

## 2026-06-06 (fix) — Commande de repas cassée : 2 bugs bloquants + cohérence FR/€

Demande : « Simuler une commande de repas jusqu'au bout ». Diagnostic & corrections :

### Bug bloquant #1 — `CheckoutPage.js` ligne 376 : `e;` parasite
Un `e;` (résidu d'une édition corrompue) après `export default CheckoutPage;` levait `ReferenceError: e is not defined` à l'évaluation du module → la page de paiement ne se chargeait pas. **Supprimé.**

### Bug bloquant #2 (cause racine) — calque plein écran `.mobile-container`
La barre fixe du bouton « Commander » (`fixed bottom-0`) contenait un `<div className="mobile-container">`. Or `.mobile-container` impose `min-height:100vh` + `background:#fff` → ce div créait un **calque blanc plein écran** masquant tout le contenu et **interceptant tous les clics** (adresse, articles, bouton). D'où : écran « blanc », clics impossibles, aucun appel `/api/orders`. **Corrigé** en `max-w-[430px] mx-auto`. Vérifié : seule occurrence de cet anti-pattern.

### Cohérence FR/€
- `CheckoutPage` : écran de confirmation (« Commande passée ! », « Suivre la commande », « Retour à l'accueil ») + bouton « Commander · X,XX € ».
- `OrderTracking` : page de suivi entièrement traduite FR + devise € (statuts : Commande passée/Confirmée/En préparation/Prête/En livraison/Livrée ; Détails, Sous-total, Livraison, Total, Adresse de livraison, Besoin d'aide ?).
- Fix lint React-Compiler (`loadOrder`/`loadData` inlinés dans les effets, `useCallback` retiré).

### Note — erreur `__WEBPACK_DEFAULT_EXPORT__ before initialization`
Vérifié via `madge` : **aucun import circulaire**. C'était un artefact de session HMR figée (rechargement complet de la page le résout). Le code est sain.

### Testé
e2e complet (client `coherence@demo.sb`) : restaurant → panier (4 articles) → checkout → `POST /api/orders` 200 → « Commande passée ! » → page de suivi FR/€. Backend de création de commande validé par curl (`order_...`, total, articles, adresse).

## 2026-06-06 (fix) — Bug bloquant « WEBPACK_DEFAULT_EXPORT before initialization »
- **Cause** : artefact transitoire du hot-reload (HMR) après éditions successives de `UserHome.js` (chargé en lazy) — overlay d'erreur plein écran bloquant toute l'app (d'où « beaucoup de bugs »).
- **Fix** : redémarrage frontend → bundle propre. Chargement frais 100% sans erreur (vérifié par testing agent, `PAGE ERRORS: []`).
- **Polish** : `UserHome` conteneur `pb-28` → `pb-36` pour que la dernière rangée de tuiles ne passe plus sous la barre de navigation flottante (clics interceptés).
- **Validation** (testing agent, iter 133) : backend 100% (recherche + filtres store_type), frontend 95% — tous les flux livraison/recherche OK, aucun autre bug bloquant.

## 2026-06-06 (suite) — Recherche unifiée multi-magasins sur l'accueil

### Demande
Ajouter une barre « Que voulez-vous vous faire livrer ? » interrogeant TOUTES les verticales. Aucun flux mocké.

### Added
- **Backend `routes/search.py`** : `GET /api/search/delivery?q=` — recherche en direct les **marchands** (par nom, toutes verticales) ET leurs **produits** (par nom, jointés au magasin actif), avec label de type FR (`store_type_label`). Enregistré dans `server.py`.
- **Frontend `DeliverySearchOverlay.js`** : overlay plein écran, input debouncé (250 ms), sections **Magasins**/**Produits** avec icône+couleur par verticale, prix €, suggestions, états chargement/vide. Clic → ouvre la fiche magasin (`/food/{id}`).
- **`UserHome.js`** : barre orange « Que voulez-vous vous faire livrer ? » en tête de la section Livraison (`data-testid="delivery-search-bar"`). `merchantAPI.searchDelivery(q)` ajouté.

### Testé
e2e (client `coherence@demo.sb`) : « pizza » → Pizza Heaven + 3 produits ; « roses » → Le Jardin Fleuri (Fleuriste) ; clic produit → fiche magasin. Lint JS/Python OK.

## 2026-06-06 — Services de Livraison fonctionnels (verticales) + cohérence FR/€

### Demande utilisateur
« Vérifie si les 4 services de livraison fonctionnent + ajouter les services manquants, s'assurer que tout fonctionne bien. »

### État avant
Les 4 cartes (Repas, Courses, Express, Colis) s'affichaient mais : **« Livraison Courses » → /food affichait les RESTAURANTS** (aucune épicerie en base) ; **FoodPage en anglais/$** ; dans `AllDeliveryPage` les 9 catégories pointaient TOUTES vers /food.

### Added (backend `server.py` seed)
- Marchands démo par verticale : **grocery** (Carrefour City, Franprix Express), **florist** (Le Jardin Fleuri), **stationery** (Papeterie du Coin), **wine** (La Cave à Vins), **construction** (Brico Matériaux) + 4 produits FR/€ chacun.
- Migration idempotente : `home_categories` clé `grocery-delivery` et bannière promo « Courses fraîches » → `/food?type=grocery`.
- Seeds par défaut mis à jour (`home_categories.py`, `promo_banners.py`).

### Changed (frontend)
- **`FoodPage.js`** : page générique **verticale-aware** (`?type=grocery|florist|stationery|wine|construction`, défaut restaurant) — filtre par `store_type`, **textes FR + devise €**, titre/placeholder/empty par verticale.
- **`RestaurantDetail.js`** : FR/€ (« commandes », ETA dynamique, prix `x,xx €`, « Ajouter », « Voir le panier · N article(s) · x,xx € »). Effet `loadMerchant` déplacé **dans** le useEffect (fix règle React-Compiler `react-hooks/immutability` du linter sans casser CRA).
- **`AllDeliveryPage.js`** : routage corrigé par catégorie — Courses/Eau/Supermarché → grocery, Médicaments → `/pharmacy`, Fleurs → florist, Papeterie → stationery, Vin → wine, Matériaux → construction.

### Testé
e2e screenshot (compte client `coherence@demo.sb`) : Courses→épiceries, détail magasin FR/€ + ajout panier, Fleurs→fleuriste, Médicaments→/pharmacy. Lint JS sans erreur bloquante.



### Signalement utilisateur
« J'ai modifié les images sur catégories de services, sur l'écran il n'y a pas le changement. »

### Cause
La synchro précédente (accueil client ← `service_categories`) affichait une **icône Phosphor fixe par clé** et **ignorait l'image** uploadée (stockée dans le champ `icon` en data-URL). L'admin enregistrait bien l'image, mais le client ne la rendait pas.

### Changed
- **Web `UserHome.js`** : tuile taxi → `imageUrl = icon` si `icon` est une image (`data:`/`http`), sinon icône Phosphor par défaut. (`DynamicIcon` rend déjà l'image.)
- **Mobile `UserHomeScreen.tsx`** : `image_url` rempli depuis `icon` si image, sinon icône par clé.
- **Admin `AdminServiceCategories.js`** : texte d'aide corrigé « max 512 Ko » → **« max 5 Mo »** (+ mention que l'image s'affiche sur l'accueil client). Faux positif lint `set-state-in-effect` corrigé (`setLoading` retiré de l'effet).

### Vérifié
- Screenshot accueil client web : les catégories avec image custom affichent **l'image** (photos de voitures uploadées par l'utilisateur) ; les autres gardent l'icône par défaut. ✅ Web lint + mobile tsc OK.
- ⚠️ À configurer aussi en **production** (BDD séparée) + **Redéployer**.


## 2026-06 — Cohérence « Gérer les catégories » ↔ app client (source unique = service_categories)

### Signalement utilisateur (captures à l'appui)
« Il n'y a pas cohérence / c'est pas pareil » : les catégories éditées dans l'admin **« Gérer les catégories »** (Taxi VTC, Plus Tard, Enchères, Mise à Dispo…) ne correspondaient PAS aux tuiles « Services Taxi » de l'app client (Programmer Course, Enchères VTC, VTC Intercity…). Choix utilisateur : **Solution A**.

### Cause
Deux collections séparées avec les **mêmes clés mais des libellés différents** : `service_categories` (admin « Gérer les catégories », aussi lue par /taxi) vs `home_categories` (lue par l'accueil client web ET mobile). Éditer l'admin n'avait aucun effet sur l'accueil.

### Changed — source unique = service_categories pour le taxi
- **Web `UserHome.js`** : la section « Services Taxi » lit désormais `configAPI.getServiceCategories()` (`/service-categories`). Tuiles = catégories **actives** triées par `display_order` (top 7 + « Tous les Taxis » → /taxi). Style (icône Phosphor + couleurs pastel) mappé par `key` via `TAXI_VISUAL`. Fallback hardcodé conservé si l'API échoue.
- **Mobile `UserHomeScreen.tsx`** : section taxi reconstruite depuis `servicesAPI.getServiceCategories()` (remplace la section taxi du CMS). Mapping `taxiCatStyle(key)` ajouté dans `cmsMappings.ts`. Nav → Booking avec `mode=key`.
- `endpoints.ts` (mobile) : `servicesAPI.getServiceCategories`.

### Vérifié
- Screenshot accueil client web : affiche exactement **Taxi VTC, Plus Tard, Enchères, Mise à Dispo, Pool, Corporate, PMR, Tous les Taxis** (= admin, même ordre). ✅
- Web lint OK, mobile `tsc`+lint OK. ⚠️ Expo natif non capturable en preview.
- `home_categories` (section taxi) n'est plus utilisé pour le taxi (autres sections inchangées). À configurer aussi en **production** (BDD séparée) + **Redéployer**.


## 2026-06 — Réordonnancement des véhicules (admin ↑/↓) + diagnostic propagation app client

### Demande / signalement utilisateur
« J'ai reclassé les véhicules dans le dashboard, ça n'a pas réagi sur l'écran de l'app client. »

### Diagnostic
Le code de tri était déjà correct : `/api/config/vehicle-types` trie par `display_order` (serveur) et tous les écrans client (`RideChoosePage`, `RideBookingPage`, `RideMapStep`) affichent cet ordre. Vérifié en direct : changer `display_order` via l'admin remonte immédiatement dans l'API.
→ Cause probable du « non-réagi » : bases **preview/production séparées** (changement fait dans un env, testé dans l'autre) ou écran client non rechargé. + il manquait une **UI de réordonnancement** intuitive (seul le champ numérique « Ordre d'affichage » existait).

### Changed
- **Backend `admin.py`** : nouvel endpoint `POST /api/admin/vehicle-types/reorder` ({ordered_slugs}) → réécrit `display_order` par index. Testé (luxe/moto remontés puis restaurés ; `/config/vehicle-types` reflète immédiatement).
- **Admin `AdminVehicleTypes.js`** : flèches **↑/↓** + numéro d'ordre sur chaque carte véhicule (optimiste + persistance), texte d'aide « ordre repris dans l'app client ». ✅ rendu vérifié par screenshot. Lint OK.

### Note
Le réordonnancement est une donnée (BDD) : un changement fait sur la **preview** n'apparaît PAS en **production** (et inversement). Reclasser dans le dashboard **production** pour impacter l'app de production.


## 2026-06 — Moteur multilingue : 30+ langues + traduction automatique LLM (Phase 1)

### Demande utilisateur
« Intégrer la traduction complète, ajouter au moins 30 langues, et donner la possibilité d'ajouter des langues avec une traduction automatique de tout le site et toutes les apps. » Choix : Phase 1 (moteur + mobile + admin) d'abord ; web en internationalisation progressive (Phase 2, option A) ; « langues populaires ».

### Livré (Phase 1) — testé end-to-end
- **Backend `routes/i18n.py` (réécrit)** : catalogue de **32 langues populaires** (drapeau + sens RTL), bundles de base FR/EN (source de vérité = 128 clés mobiles), collection `i18n_app_bundles`.
  - Moteur **traduction automatique LLM** (Claude `claude-sonnet-4-6` via `EMERGENT_LLM_KEY`, batch de 64, placeholders `{{name}}` préservés). Endpoint `POST /i18n/admin/auto-translate {target_lang, overwrite}`.
  - Endpoints : `GET /i18n/languages` (langues *prêtes* uniquement), `GET /i18n/bundle/{lang}`, `GET /i18n/admin/overview`, `POST /i18n/admin/languages/{code}/activate`, `GET /i18n/admin/bundle/{lang}`, `POST /i18n/admin/bundle-key`.
  - Seed idempotent (`$setOnInsert` pour ne pas écraser les choix admin au reboot).
- **Admin web `AdminI18n.js` (réécrit)** — page « Traductions i18n » : grille des 32 langues (drapeau, couverture %, toggle actif, badge RTL), bouton **« Traduire automatiquement »** par langue, éditeur clé par clé avec repérage des manquants. ✅ rendu vérifié par screenshot.
- **Apps mobiles** : `i18n.ts` charge dynamiquement le bundle de la langue choisie (`/api/i18n/bundle/{lang}`), persiste le choix (SecureStore), gère le **RTL** (I18nManager). Sélecteur de langue complet dans `SettingsScreen` (liste depuis l'API). `endpoints.ts` : `i18nAPI`.

### Vérifications
- Traduction réelle LLM testée : **Allemand** (128/128, `Speichern`, `Anmelden`, placeholder `Hallo {{name}}` conservé) et **Arabe** (RTL=true, `تسجيل الدخول`). 
- 32 langues / 128 clés via `/i18n/admin/overview`. `/languages` public filtré aux langues traduites (fr, en, de, ar). Lint web/python OK, `tsc` mobile OK.
- ⚠️ App native Expo non capturable en preview → vérif code/type/API + endpoints prouvés par curl.

### Phase 2 (backlog) — Internationalisation du SITE WEB (option A, progressif)
react-i18next non installé côté web, textes FR en dur : à internationaliser page par page (accueil → réservation → …) puis brancher sur le même moteur.


## 2026-06 — Synchronisation des services Dashboard ↔ App mobile (Expo)

### Demande utilisateur
« Synchroniser les services entre le dashboard et les applications. » (Périmètre confirmé : services de la page d'accueil + catégories Taxi + Types de véhicule.)

### Constat
- App **web** : déjà pilotée par le CMS admin (`/api/home-categories`) et `/api/config/vehicle-types`.
- App **mobile (Expo)** : liste de services **codée en dur** dans `UserHomeScreen.tsx` → aucune synchro avec l'admin.
- **Bug de désynchro véhicules** : `BookingScreen` appelait `getVehicleTypes('taxi')` (= `category_slug=taxi`) → **0 véhicule** (les docs ont `category='ride'`, pas `category_slug`). Le web appelle `getVehicleTypes()` sans filtre → 13 véhicules. De plus, le chip affichait `v.name` (inexistant) au lieu de `v.name_fr`.

### Changed (mobile)
- `mobile/src/screens/user/UserHomeScreen.tsx` : accueil **dynamique** — fetch `/api/home-categories`, rendu par section (taxi, delivery, ondemand, beauty, pet, carcare, towing, nearby) avec items `visible_home` triés par `display_order`. Fallback sur la liste statique si l'API échoue/vide.
- `mobile/src/utils/cmsMappings.ts` (nouveau) : mapping icônes **Phosphor → Ionicons**, couleurs **Tailwind → hex**, et `section/target_route → écran + params` de navigation.
- `mobile/src/components/ServiceTile.tsx` : support `imageUrl` (icône image uploadée depuis l'admin).
- `mobile/src/api/endpoints.ts` : ajout `homeAPI.getHomeCategories()`.
- `mobile/src/screens/user/BookingScreen.tsx` : `getVehicleTypes()` sans filtre (13 véhicules synchronisés) + libellé `name_fr || name || name_en || slug`.

### Vérification
- `tsc --noEmit` OK, lint OK.
- API confirmées : `/api/home-categories` (8 sections, 17 items taxi), `/api/config/vehicle-types` (13 véhicules).
- ⚠️ App native Expo non testable via screenshot dans le preview — vérif au niveau code/type/API. L'utilisateur doit recharger l'app Expo pour voir les changements.



## 2026-06-06 — Chip de réservation piloté par le CMS (libellés/icônes par mode éditables) + retry géocodage

### Demande utilisateur
Pouvoir éditer SANS CODE les libellés/sous-titres/icônes de chaque mode taxi (le chip « Taxi VTC / Course standard » de `/course` ET les tuiles d'accueil), avec **upload d'icône personnalisée** (choix 1b) ; + retry/loader si le géocodage du départ est throttlé. (Refactor RideTrackingPage / loaders Maps laissé en backlog — choix 3b.)

### Constat
Les **tuiles d'accueil sont déjà 100% éditables** via la page admin existante **« Catégories accueil »** (`/admin/home-categories`) : libellé, sous-titre, **icône Phosphor OU image uploadée** (data-URL), visible/masqué, ordre. Seul le **chip** de `/course` venait des constantes `taxiHubConstants.MODES`.

### Changed — `RideChoosePage.js`
- Le **chip** lit désormais l'entrée CMS du mode (`homeCategoriesAPI.public('taxi')`, match par `target_route` contenant `mode=<id>`) → libellé/sous-titre + icône via **`DynamicIcon`** (gère `icon_name` Phosphor ET `image_url` uploadée). Fallback sur les constantes si pas d'entrée CMS. → tuile + chip partagent la même source éditable (upload inclus).
- **reverseGeocode** : retry sur `OVER_QUERY_LIMIT` (2 tentatives espacées) avant le fallback « lat, lng » ; label « Départ · Localisation… » pendant la géoloc.

### Tests
- testing_agent **iteration_131 : 4/4** — édition admin live (« VTC Réservation » → « VTC Premium / Trajet rapide ») reflétée sur le **chip de /course** ET la **tuile d'accueil**, puis restaurée ; départ auto-rempli (adresse réelle quand non throttlé, sinon lat/lng) ; en-tête blanc OK. Lint clean.

### Backlog (P2 — non fait, choix utilisateur)
- Découpe `RideTrackingPage` en RideWaitingScreen/RideCancelledScreen/RideActiveScreen.
- Consolidation des loaders Google Maps (GooglePlacesInput `<script>` brut vs `useJsApiLoader`).

## 2026-06-06 — Refonte UI réservation : en-tête blanc éditable, thème clair, géolocalisation auto, calendrier auto-ouvert

### Demandes utilisateur (capture annotée)
1. Textes de l'en-tête (rectangle) éditables par l'admin. 2. Départ auto-rempli par géolocalisation à l'arrivée. 3. En-tête trop grand → compact, fond blanc, texte noir, accent orange. 4. Thème CLAIR partout (choix « a ») : radar d'attente + écran annulé (bleu nuit) → fond blanc/noir/orange. 5. « Programmer Course » → calendrier auto-ouvert pré-réglé +1h, puis saisie destination. 6. Toggle « Programmer plus tard » → ouvre directement le calendrier (idem partout).

### Changed
- **`RideChoosePage.js`** : en-tête **blanc compact** (≈90px au lieu de 176px), titre/sur-titre **éditables admin** (`cfg.booking_header_title` / `booking_header_eyebrow`). Géocodage inverse via **`window.google.maps.Geocoder`** (fiable, sans CORS) → départ auto-rempli au chargement. **Auto-ouverture du calendrier** si `mode.panel==='datetime'` (book_later/intercity), pré-réglé à now+`min_advance`. Toggle « Programmer plus tard » → ouvre le calendrier. Overlay radar « Demander » → fond blanc.
- **`RideTrackingPage.js`** : écrans **attente (pending)** et **annulé (cancelled)** passés en **fond blanc**, texte `#0B1426`, accents orange (style inline #ffffff).
- **`SearchingRadar.jsx`** : recoloré **orange `#FF5000`** (anneaux/arc/disque) pour fond blanc.
- **Backend `config.py`** + **`AdminServiceConfig.js`** : champs `booking_header_title` / `booking_header_eyebrow` (clé `taxi_booking`), éditables via `/admin/taxi-booking-config`.

### Tests
- testing_agent **iteration_130 : 6/6** — en-tête blanc + édition admin live (titre change puis restauré), départ auto-rempli (géoloc accordée), pending + cancelled `backgroundColor rgb(255,255,255)`, book_later auto-ouvre le calendrier pré-réglé, toggle ouvre le calendrier. 0 erreur console. Lint clean.
- Note mineure : si le Geocoder est throttlé, le départ retombe sur « lat, lng » (champ jamais vide). Amélioration possible : retry/loader.

## 2026-06-06 — Fix erreur runtime app chauffeur (« Script error » / carte Google Maps)

### Problème (capture utilisateur, preview)
Overlay rouge bloquant « Uncaught runtime errors: Script error. » sur l'accueil chauffeur (`/chauffeur/home`).

### Cause racine (diagnostic QA iteration_127)
- **Chemin SVG invalide** pour l'icône voiture du chauffeur dans `AdminGoogleMap.jsx` : les arcs en notation compacte (`a1.5 1.5 0 11-3 0 … 013 0`) cassent le parseur SVG de Google Maps → throw cross-origin (`Expected number at position 63, found M`) remonté en « Script error » par l'overlay dev (visible en preview uniquement).
- **2e bug** révélé au clic « Heat View » : Google Maps a **supprimé `visualization.HeatmapLayer` en v3.65** → le constructeur throwait.

### Changed — `AdminGoogleMap.jsx`
- `carIcon.path` remplacé par l'icône Material **directions_car** (courbes de Bézier uniquement, aucun arc) → parseur GMaps OK, marqueur voiture toujours affiché.
- useEffect heatmap réécrit : essaie `HeatmapLayer` si disponible, sinon **fallback en `google.maps.Circle` pondérés** (jaune/orange/rouge selon l'intensité) avec try/catch → plus jamais d'erreur, feature « Heat View » conservée.

### Tests
- testing_agent iteration_128 (fix SVG confirmé) + **iteration_129 : 0 erreur runtime** au chargement, au clic Heat View ON/OFF (warning bénin uniquement) et à l'ouverture Mode Destination. Marqueur voiture visible. Lint clean.
- Backlog (non bloquant, signalé QA) : consolider les loaders Google Maps (GooglePlacesInput injecte un `<script>` brut `libraries=places` ≠ `useJsApiLoader` `places,visualization`) — peut déclencher l'avertissement « multiple times » sur les pages utilisant les deux.

## 2026-06-06 — Cohérence visuelle attente/annulation + écran annulé sombre (RideTrackingPage)

### Problème (capture utilisateur, preview)
Le parcours basculait entre **2 styles** : radar bleu nuit (attente) → ancien écran **blanc** « Course annulée » (map + carte rouge) quand l'auto-dispatch annule faute de chauffeur.

### Changed — `RideTrackingPage.js`
- Nouvel **early-return plein écran sombre** pour `isCancelled` : fond `#0B1426`, icône X rouge, « Course annulée » + raison, carte récap trajet, boutons **Réessayer la recherche** (recrée la course → /ride/:id), **Proposer votre tarif** (→ /taxi-bidding), **Retour à l'accueil**.
- Fond navy forcé via `style` inline sur les états pending ET cancelled (corrige l'override `.mobile-container{background:#fff}`).
- Anciens blocs blancs (bandeau « Course annulée », petite carte radar) retirés du rendu principal → plus de bascule de style.

### Tests
- testing_agent iteration_126 : **5/5** — `getComputedStyle().backgroundColor === rgb(11,20,38)` confirmé sur pending ET cancelled ; aucun `.leaflet-container` (plus d'écran blanc/map) ; Réessayer recrée une course pending navy ; Proposer tarif → /taxi-bidding. Lint clean.
- Backlog (suggéré QA) : découper RideTrackingPage en RideWaitingScreen/RideCancelledScreen/RideActiveScreen + retirer `background:#fff` global de `.mobile-container`.

## 2026-06-06 — Écran d'attente course = radar V3Cube plein écran (RideTrackingPage)

### Demande utilisateur (2 captures : « ancien » vs « nouveau à utiliser »)
L'écran d'attente après « Demander » affichait l'ancienne carte (stepper Recherche/Acceptée/En route + carte blanche « Veuillez patienter » + petit radar). L'utilisateur veut le **radar plein écran moderne** « Recherche d'un chauffeur… / Nous contactons les chauffeurs proches » (fond bleu nuit) sur tout l'écran d'attente.

### Changed — `RideTrackingPage.js`
- Nouvel **early-return plein écran** pour `ride.status === 'pending'` : fond `#0B1426`, `SearchingRadar` 220, titre + sous-titre, carte récap trajet (`ride-searching-route`, départ/destination/prix), et actions en bas (Activer Taxi Pool, Relancer la recherche, Annuler la course). Modale no-driver (après max relances) conservée et fonctionnelle.
- Supprimé du rendu principal les anciens blocs « pending » (petite carte radar, toggle Pool, matches Pool, modale no-driver) devenus inatteignables → plus de code mort ni de testids dupliqués.
- **Fix CSS** : `.mobile-container { background:#ffffff }` (index.css) écrasait `bg-[#0B1426]` (spécificité égale, cascade). Corrigé via `style={{ backgroundColor: '#0B1426' }}` inline (spécificité supérieure → gagne toujours).

### Tests
- testing_agent iteration_125 : **6/7** — toute l'UX d'attente fonctionne (radar, copy, 3 boutons, toast « Recherche relancée » + compteur Relance 1/3, modale d'annulation avec motifs, navigation /course→Demander→/ride/:id). Seul échec = fond blanc (override CSS) → **corrigé** par le style inline.
- Lint clean.

## 2026-06-05 — Flux taxi UNIFIÉ « Choisissez un voyage » sur toutes les commandes + Réservation WhatsApp (admin) — Iteration 124

### Demande utilisateur (vidéo de référence)
Intégrer le parcours V3Cube « Choisissez un voyage » (saisie départ/destination → comparaison multi-véhicules avec prix/ETA en direct → « Demander » → radar « Recherche d'un chauffeur ») sur **TOUTES** les commandes taxi, ajouter une option **Réservation via WhatsApp**, le tout **administrable dans le dashboard** (choix utilisateur : 1a + 2a + 3 oui).

### Added — Flux unifié mode-aware (`RideChoosePage.js`, route `/course?mode=<id>`)
- Point d'entrée unique pour toutes les commandes taxi. Lit `?mode=` et adapte l'écran : carte d'adresses (départ + destination + « ma position » + raccourcis Maison/Travail/récents), **comparaison multi-véhicules** avec prix live par véhicule (`/api/rides/estimate` en parallèle), paiement, CTA « Demander » + overlay radar → `/ride/:id`.
- **Panneaux spécifiques par mode** (composants frères `ModeSpecificPanel` + `SchedulePanel`, plus de shadowing) : aéroport (n° vol), animaux (nb + taille), assistance, corporate (compte entreprise), pour un proche (nom/tél), enchères (proposez votre tarif → `/taxi-bidding`), location/chauffeur privé (forfait/durée + carte prix unique, sans destination), programmation (date & heure ou toggle « plus tard »). Pool → comparaison avec tarifs partagés.
- **Bouton « Réserver via WhatsApp »** : ouvre `wa.me/<numéro>` avec un message pré-rempli (placeholders {mode} {pickup} {dropoff} {vehicle} {price} {when} {payment}) — visible uniquement si l'admin l'active.

### Added — Administration (dashboard)
- Backend public `GET /api/config/taxi-booking` (clé `service_configs.taxi_booking`, défauts sûrs). Édition via le `PUT /api/admin/service-config/taxi_booking` générique.
- Page admin **« Réservation Taxi & WhatsApp »** (`/admin/taxi-booking-config`, sidebar SERVICES › Taxi) via `AdminServiceConfig` (schéma `taxi_booking`, support type `textarea` ajouté) : toggle flux unifié, toggle WhatsApp, numéro WhatsApp Business, modèle de message.

### Routing
- Tuiles taxi de l'accueil (`UserHome.js`) → `/course?mode=X`. Grille TaxiHub `selectMode` → `/course?mode=X`. **`TaxiHubPage` redirige `/taxi?mode=X` → `/course?mode=X`** quand le flux unifié est activé (couvre aussi les tuiles CMS legacy `hcat_*`). Si l'admin désactive le flux unifié → `/course` retombe sur le hub legacy `/taxi?mode=` (aucune boucle).

### Tests
- Backend curl : `GET /api/config/taxi-booking` (défauts + reflet après save admin), persistance WhatsApp OK.
- **testing_agent frontend 100%** (iteration_124) : flux standard e2e (Google Places → comparaison prix live → WhatsApp → radar → /ride/:id), panneaux par mode (airport/pets/assist/corporate/contact/bidding), page admin (4 réglages + textarea + save), routing tuiles → /course. (iteration_123 avait relevé 3 régressions — toutes corrigées : schéma admin perdu par une race d'éditions parallèles → réajouté ; ModePanel early-return → scindé ; tuiles CMS → redirection TaxiHub.)
- Config remise aux défauts après test (WhatsApp désactivé, numéro vide — l'admin saisit le sien).
- ⚠️ Backlog : `RideChoosePage.js` ~660 lignes → extraire les panneaux (`ridechoose/panels/`) + hook `useRideChooseState` ultérieurement.


## 2026-06-05 — Analyse de bundle (source-map-explorer) + optimisation jspdf — Iteration 129

### Added — Outil de mesure
- `source-map-explorer` (devDependency) + script **`yarn analyze`** (`source-map-explorer 'build/static/js/*.js'`). Build de mesure : `GENERATE_SOURCEMAP=true yarn build`.

### Données mesurées (gzip)
- **main (shell, chargé par tous) : 213 KB**.
- **DriverHome : 20 KB gzip (74 KB raw) — DÉJÀ lazy-split** dans son propre chunk → ne pèse pas sur le chargement initial.
- Plus lourds = chunks vendor : **jspdf+autotable ~124 KB**, recharts ~105–150 KB, leaflet ~43 KB (déjà lazy par route).

### Décision data-driven
- **Découper DriverHome n'apporte ~aucun gain perf** (20 KB, déjà code-splitté, sur le chemin live chauffeur à risque) → NON prioritaire. Garder l'effort pour les vrais poids (vendors).

### Optimisation appliquée (vrai levier)
- `dashboard/exportAnalytics.js` : `jspdf`/`jspdf-autotable` passés en **`import()` dynamique** dans `exportAnalyticsPDF` (désormais async). **~124 KB gzip retirés du chargement initial du dashboard admin** — chargés uniquement au clic « Export PDF ».
- Vérifié : nouveau chunk jspdf isolé (124 KB) ; dashboard admin rendu OK ; clic Export PDF fonctionne **sans erreur console** (chargement on-demand).


## 2026-06-05 — Découpage composants (suite) — Iteration 128

### Fait & vérifié
- **LandingPage.js : 429 → ~135 lignes** — sections statiques + données extraites dans `landing/LandingSections.jsx` (HowItWorks, PoolBusiness, Services, Why, Security, Phone, Register, Footer + StoreLinks/constantes). Navbar + hero (interactifs) gardés dans le parent. Rendu vérifié (toutes sections OK, 4 étapes, 6 boutons inscription).
- **AdminUsers.js : 420 → ~320 lignes** — modales « Ajouter solde » et « Documents » extraites dans `admin/users/AdminUserModals.jsx` (état conservé dans le parent, passé en props). Vérifié : 208 lignes affichées, les 2 modales s'ouvrent correctement.
- Imports orphelins nettoyés dans les deux cas (lint propre, build CRA intact).

### Reporté volontairement (app en production — qualité avant tout)
- **DriverHome.js (718)** : chemin live chauffeur (WebSocket, toggle online, acceptation course, OTP, mode destination, heatmap). Découpage à faire en session dédiée AVEC test du flux d'acceptation de course (simulation d'une course entrante) pour éviter toute régression sur le chemin de revenu.
- **LoginPage.js (543)** : AUTH → à traiter via `integration_expert` avant restructuration (règle de sécurité).


## 2026-06-05 — Gros refactors (Option A), incrémental + testé — Iteration 127

### Phase 1 — Nettoyage console.log
- 4 `console.log` (handlers WS/wallet) → `console.warn` contextuels. Scanner `yarn lint:audit` : **0 `no-console`** restant.

### Phase 2 — Code-splitting (lazy-load) App.js
- 157 pages de route converties en `React.lazy` + `<Suspense fallback={<PageLoader/>}>`. Imports « shell » (ProtectedRoute, AuthCallback, VoiceAssistant, barrel AdminCrudPages) gardés eager.
- **Build CRA intact** (aucun `eslintConfig` ajouté). Vérifié e2e : routes user (home/course/food/real-estate/wallet) + admin (users/vehicle-types/weekly-reports/vouchers/audit-logs) chargent OK.
- NB : App.js gagne en lignes (581) mais l'objectif réel (découpage du bundle, réduction du couplage des ~200 imports) est atteint.

### Phase 3 — Complexité admin.py (refactor préservant le comportement)
- `admin_create_user` / `admin_update_user` : helpers extraits `_compose_full_phone`, `_assert_email_available`, `_assert_phone_available`, `_collect_user_updates` (dédup création/édition, complexité réduite).
- `get_analytics` : helpers `_ride_status_map`, `_earnings_summary` (60→~30 lignes, moins de locals).
- Vérifié : **27 tests** (iter117 + iter118) ✓ + e2e curl (create/dup-email 400/update/delete/analytics) ✓.

### Phase 4 — Découpage composant > 500 lignes (AdminDashboard)
- `AdminDashboard.js` **593 → 389 lignes** : 3 sections présentationnelles extraites → `dashboard/DashboardDeliveryCharts.jsx`, `DashboardBreakdown.jsx`, `DashboardServerPanels.jsx`. Imports orphelins nettoyés.
- Vérifié au rendu : delivery charts, Revenus par service (218,24 €), Top zones, Server/Notif/Contact panels, switch période — tous OK.

### Reste à faire (recommandé en suivi dédié)
- `DriverHome.js` (697) : état live complexe (WebSocket, toggle online) → découpage à tester avec un compte chauffeur.
- `LoginPage.js` (543) : **auth** → passer par `integration_expert` avant restructuration.
- `AdminUsers.js` (411), `LandingPage.js` (388) : < 500 lignes, priorité basse.


## 2026-06-05 — Garde-fous qualité/sécurité automatisés (scanners) — Iteration 126

### Added — Scanner ESLint d'audit (frontend, sans impact build)
- `frontend/eslint.audit.config.mjs` : flat-config **séparée** (ESLint 9) qui ne surveille que `react/no-array-index-key` et `no-console` (warn, autorise `console.warn`/`console.error`).
- Script `yarn lint:audit`. **N'impacte PAS le build CRA** (qui transforme les warnings en erreurs si `CI=true`) — la config du build reste intacte (`eslintConfig` absent).
- État actuel : 24 `no-array-index-key` + 4 `console.log` repérés et suivis (non bloquants).

### Added — Bandit (backend, sécurité Python)
- `backend/pyproject.toml` → `[tool.bandit]` (exclut `tests/`). Lancement : `bandit -c pyproject.toml -r .`.
- `backend/requirements-dev.txt` (bandit) — **hors** `requirements.txt` de prod.
- Résultat : **0 Medium / 0 High** ; 32 Low informatifs (ex. `random` non-crypto de simulation.py) → confirme l'absence de vraie faille.

### Bénéfice
Les revues à répétition ne renverront plus que de vrais problèmes ; ces patterns sont traçables à la source via 2 commandes, sans risque pour la prod déployée.


## 2026-06-05 — Revue qualité #2 : correctifs sûrs (sécurité + patterns) — Iteration 125

### Fixed (sécurité)
- **Identifiants de test centralisés** : les 5 fichiers (`test_iter97/96/95/84/117`) importent désormais `ADMIN_EMAIL`/`ADMIN_PASSWORD` depuis `tests/_creds.py` (source unique, 100 % env via `os.environ.get`). Plus aucun littéral d'identifiant dispersé. 30 tests collectés OK.

### Fixed (patterns React — clés stables)
- Clés d'index → clés stables : `PostPropertyPage` (galerie → URL image), `DeliveryTrackingPage` (markers dépôt → `lat-lng`), `DriverSubscriptions` (perks → valeur), `VehicleTypeEditor` (zones → `_id` UUID stable à l'ajout/suppression).

### Fixed (catch silencieux loggés)
- `TaxiBiddingPage` (poll + cancel), `RouteEditModal` (preview tarif), `RideChoosePage` (reverse-geocode) : `console.warn` contextuel au lieu d'avaler l'erreur.

### Faux positifs confirmés (non modifiés)
- **`random` dans `simulation.py`** : génère uniquement des **données de démo** (noms chauffeurs, plaques fictives, notes) — aucun token/crypto → `secrets` inutile.
- **`is` vs `==` (165 annoncés)** : audit réel = 3 occurrences, toutes dans des **commentaires** → rien à corriger.
- **localStorage** ProfileTabView/InstallPWA (préférences) et KioskApp (token device-bound) : inchangés (cf. iteration 124).
- **Gros refactors** (complexité admin.py, paramètres audit_logs, découpage composants, lazy-load App.js, retrait des ~153 console) : différés (risque de régression sur prod déployée).


## 2026-06-05 — Revue qualité de code : correctifs sûrs (sécurité + patterns) — Iteration 124

### Fixed (Critique — sécurité)
- **Identifiants de test en dur retirés** : `ADMIN_EMAIL`/`ADMIN_PASSWORD` désormais lus via `os.environ.get(...)` (avec défauts) dans 5 fichiers de test (`test_iter97/96/95/84/117`), surchargeables par `TEST_ADMIN_EMAIL`/`TEST_ADMIN_PASSWORD`.

### Fixed (patterns React)
- **Clés d'index remplacées** par des clés stables : `ParcelPage` (stops dotés d'un `_id` séquentiel → robustesse add/remove des points de dépôt) ; `PropertyDetailPage` (galerie → clé = URL image ; détails → clé = label).
- **Catch silencieux** : `MyServiceBookingsPage` logge désormais l'erreur de polling (`console.warn` avec contexte) au lieu d'avaler l'exception.

### Volontairement NON modifié (faux positifs / risque sur prod déployée)
- `localStorage` dans `ProfileTabView` / `InstallPWA` : ne stockent que des **préférences non sensibles** (langue, devise, flag PWA) → pas un risque sécurité.
- `localStorage` token kiosque (`KioskApp`) : flux **device-bound** délibéré ; bascule vers cookies httpOnly nécessite des changements d'auth backend → à planifier hors hotfix.
- Deps de hooks (`RouteEditModal` a déjà `eslint-disable` + deps correctes ; `GoogleRideMap` = boucle d'animation, risque de re-render).
- Gros refactors (complexité `admin.py`, découpage composants > 500 lignes, `useMemo`, retrait des 152 `console`) : bénéfice marginal vs risque de régression sur l'app **en production** → à faire de façon incrémentale et testée.


## 2026-06-05 — Parcours « taxi standard » V3Cube : écran « Choisissez un voyage » — Iteration 123

### Added (flux V3Cube standard, d'après la vidéo utilisateur)
- **Nouvelle page `RideChoosePage`** (route `/course`) : saisie départ + destination (Google Places + « Utiliser ma position »), aperçu carte (Static Maps avec itinéraire), puis écran **« Choisissez un voyage »** listant **tous les types de véhicules « ride » actifs** (SB, Confort, Luxe, Moto, SUV, Électrique, Van, TukTuk) avec **prix calculé en direct + ETA (durée·distance) par véhicule** via `/api/rides/estimate` en parallèle. Sélection → bouton **« Demander · X € »**.
- **Animation V3Cube « Recherche d'un chauffeur »** : overlay plein écran (SearchingRadar, anneau pulsant) après « Demander », puis handoff vers le suivi live `/ride/:id`.
- Le tile d'accueil **« VTC Réservation »** pointe désormais vers `/course` (parcours en parallèle ; les autres modes restent sur `/taxi`).
- Spécialisés (pool, aéroport, animaux, assistance, accessible) exclus de la comparaison (gardent leurs flux dédiés).

### Fixed
- Libellé obsolète **« Taxi Pool −30% »** retiré de l'écran de suivi (`RideTrackingPage`) → « Taxi Pool partagé ».
- Correction d'un bloc corrompu en fin de `App.js` (tail dupliqué + `Provider>` orphelin) qui cassait la compilation.

### Tests
- E2E vérifié à l'écran : prix live par véhicule (SB 11,70€ · Confort 17,76€ · Luxe 30,76€ · SUV 23,81€ · Van 26,45€), sélection, « Demander · X € », overlay « Recherche d'un chauffeur », handoff vers `/ride/:id`. Lint propre.


## 2026-06-05 — Taxi Pool : config Admin par Type de véhicule (parité V3Cube) — Iteration 122

### Fixed / Added (Pool Percentage par Type de véhicule)
- **Source de vérité corrigée** : `get_pool_config()` (`backend/routes/rides.py`) lit désormais `enable_pool` / `pool_percentage` / `person_capacity` directement depuis le document **vehicle_types** sélectionné (parité V3Cube), avec repli sur l'ancien `service_configs.pool` puis défauts. `estimate_ride` et `create_ride` passent `vtype_doc`.
- **Éditeur Admin** (`VehicleTypeEditor.jsx`) : nouveau champ **« Pourcentage Pool (%) »** (`vt-pool-percentage`), affiché uniquement quand « Activer Pool » est ON, avec l'aide V3Cube : *1ʳᵉ place = plein tarif ; chaque place suivante coûte ce % du tarif plein (ex. 10€ + 8€ = 18€ à 80%)*.
- **Schéma backend** : `pool_percentage` ajouté à `VT_FIELDS` / `VT_DEFAULTS` (défaut 90.0) dans `admin.py`.
- Modèle de prix confirmé conforme : `total(n) = F × (1 + (n-1)×pct/100)`.

### Tests
- `tests/test_iter121_taxi_pool.py` : 5/5 passés.
- E2E vérifié : Admin règle pool_percentage=50 sur le type « pool » → ratio 2 places = 1.5 ; remis à 90 → ratio 1.9. Champ Admin rendu (capture).

### Added (UX — estimation d'économie côté client)
- Écran Pool (`TaxiHubPage.js`) : bandeau **« Vous économisez X € en partageant »** (`pool-savings-banner`) affiché dès 2 places — compare le tarif Pool au coût des mêmes places réservées séparément (économie = F×(n-1)×(1-%/100)). Vérifié e2e (ex. 2 places : 9,50 € au lieu de 10,00 €, -0,50 €).
- Libellé du mode Pool corrigé : « Partagé, -30% » (ancienne hypothèse erronée) → « Taxi partagé » / badge « Partagé ».


## 2026-06-03 — Enchère bidirectionnelle (inDrive) + itinéraire réel — Iteration 93

### Added (Enchère bidirectionnelle façon inDrive)
- **Écran de recherche client** (`TaxiBiddingPage`) : liste en **temps réel** des **offres/contre-offres des chauffeurs** (`driver-offers-list`) — nom, note, véhicule, montant — avec bouton **« Choisir »** par chauffeur (`accept-offer-*`) → accepte ce chauffeur précis et lance la course. Polling toutes les 2,5 s.
- **Suggestion auto d'augmentation** après 20 s sans offre : toast + mise en évidence (pulse) du bloc d'augmentation de tarif.
- Côté chauffeur (déjà présent) : contre-offre via le modal de course (`send-counter-offer-btn`). Backend déjà en place : `POST /counter-offer`, `POST /accept-offer/{id}`.

### Added (Itinéraire réel sur cartes)
- `create_ride` stocke désormais `route_polyline` (Google Directions avec waypoints) + recalcule distance/durée/tarif sur l'itinéraire réel quand disponible. Exposé dans `RideResponse`.
- Util `utils/polyline.js` (décodage polyline Google).
- **Carte chauffeur** (`DriverHome`/`LeafletMap`) : trace le **tracé routier réel** (polyline décodée) + marqueurs d'arrêts numérotés ; fallback segments droits.
- **Suivi passager** (`RideTrackingMap`) : affiche les **arrêts intermédiaires** (marqueurs numérotés) + le tracé routier réel.

### Tests
- `tests/test_iter93_bidirectional.py` — flow complet contre-offre → acceptation chauffeur précis + route_polyline ✅. `test_iter92_bidding.py` 3/3 ✅.
- E2E curl validé : contre-offre Jean Dupont 13€ → acceptée → course assignée à 13€, route_polyline stocké.

## 2026-06-03 — Taxi Bidding : tarif minimum + écran de recherche sans quitter — Iteration 92

### Changed (TaxiBiddingPage)
- **Tarif minimum = tarif recommandé** : l'offre par défaut est désormais le tarif recommandé (et non 95%). Le client **ne peut plus descendre en dessous** (bouton « − » plancher + clamp de la saisie). Note « Tarif minimum : X € · vous ne pouvez pas proposer moins ».
- **Le client ne quitte plus l'interface** : après envoi de l'offre, passage à un **écran de recherche** (animation radar, « Recherche d'un chauffeur… », tarif + secondes écoulées, nb chauffeurs en ligne) au lieu de naviguer. Polling du statut → navigation auto vers la course dès qu'un chauffeur accepte.
- **Augmenter le tarif sans quitter** : boutons **+1€ / +2€ / +5€** qui ré-émettent l'offre aux chauffeurs (impossible de baisser). Bouton « Annuler la recherche » (annule la course).

### Added (Backend)
- `POST /api/rides/{ride_id}/proposed-fare` : augmente l'offre d'une course **en attente** (propriétaire only, nouveau tarif strictement supérieur sinon 400) et **re-broadcast** aux chauffeurs via WebSocket.

### Tests
- `tests/test_iter92_bidding.py` — 3/3 ✅ (augmentation OK, baisse/égal rejetés 400, course non-pending 400, owner-only).
- UI vérifiée par screenshots : tarif bloqué au plancher (10€ après 8× « − »), écran radar + boutons +1/+2/+5 après soumission.

## 2026-06-03 — Arrêts sur fiche/itinéraire chauffeur + mémorisation point carte — Iteration 91

### Added
- **Arrêts intermédiaires côté chauffeur** : les arrêts (`stops`) s'affichent désormais dans la **fiche course active** (`current-ride-stop-*`) ET dans le **modal de nouvelle course** (`request-stop-*`), entre Départ et Arrivée, avec puces numérotées.
- **Itinéraire sur la carte chauffeur** : `LeafletMap` reçoit un nouveau prop `waypoints` (marqueurs numérotés orange) + `routePath` (polyline Départ → arrêts → Arrivée). DriverHome trace l'itinéraire complet de la course en cours.
- **Mémorisation du point carte** : à la confirmation d'un lieu via `MapLocationPicker`, le point est ajouté aux **lieux récents** (`placesAPI.addRecent`) et la liste est rechargée.

### Tests
- E2E vérifié (curl) : une course créée avec 2 arrêts (Louvre, Opera) est bien renvoyée au chauffeur via `/api/rides/pending/available` avec ses `stops`.
- Smoke screenshot DriverHome : chargement OK, carte rendue, aucun crash. Lint clean (LeafletMap, DriverHome, TaxiHubPage).

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

## 2026-06-05 — Parité menu admin V3Cube : 7 entrées manquantes ajoutées

### Added (pages admin fonctionnelles + persistantes)
- **Surcharge météo** (`/admin/weather-surcharge`) sous Taxi/Transport — multiplicateur + supplément fixe par condition météo.
- **Chauffeur personnel** (`/admin/personal-driver`) sous Services aux enchères.
- **Auto-promotions IA** (`/admin/auto-promotions`) sous Croissance.
- **Vouchers / Bons** (`/admin/vouchers`) sous Croissance.
- **FAQs** (`/admin/faqs`) + **Centre d'aide (Help)** (`/admin/help-articles`) sous Contenu (CMS).
- **Dons / Donation** (`/admin/donations`) sous Configuration.
- Backend : collections ajoutées à `ALLOWED_CRUD` (admin.py) → CRUD persistant via `/api/admin/crud/{collection}`.
- Sidebar `AdminLayout.js` + routes `App.js` câblées.

### Tests
- curl : POST/LIST/DELETE vouchers + weather_surcharge OK (persistance MongoDB confirmée).
- Screenshot : login admin OK, page FAQs rend les seeds, sidebar affiche les nouvelles entrées.

### Note
- `/app/mobile/.env` EXPO_PUBLIC_BACKEND_URL == URL preview actuelle → aucun changement requis (faux positif du handoff).

## 2026-06-05 (suite) — 4 pages admin réparées (placeholder) + robustesse CRUD

### Fixed
- **Currency, Language, SEO, Maps/Geo API** : affichaient le placeholder "🚧 Configuration bientôt disponible" (clés absentes de `serviceConfigs`). Ajout de schémas de réglages complets dans `AdminServiceConfig.js` → pages fonctionnelles + persistance via `/api/admin/service-config/{key}`.
- `AdminCrudPage` & `AdminServiceConfig` : les toasts de succès s'affichaient même sur réponse non-200. Ajout de contrôles `res.ok` → toast d'erreur correct.

### Tests (iteration_117.json)
- Backend pytest 23/23 ✅ (7 collections CRUD + 4 clés service-config, cycle Create→Get→Update→Delete).
- Frontend Playwright : login admin OK ; 7 pages CRUD + 4 pages config rendues sans placeholder ; cycles Ajout/Suppression vérifiés (vouchers, faqs) ; sauvegarde config OK.
- **Balayage complet sidebar : 107 routes admin → 106 OK, 0 placeholder, 1 faux positif (heat-view = canvas carte).**
- Marqueurs de test nettoyés de `service_configs` + collections CRUD.

## 2026-06-05 (suite) — Dashboard pilotage : Revenus par service + Top zones/villes

### Added (données réelles)
- Backend `GET /api/admin/analytics/breakdown` : revenus agrégés par service (Taxi/VTC=rides.final_fare, Colis=parcels.fare, Boutiques=orders.total, Runner/Genie=runner_orders.estimated_fare) + total ; Top 8 zones/villes par volume de courses (parsing ville depuis pickup_address + filtre anti-bruit test/placeholder).
- Frontend `AdminDashboard.js` : 2 nouveaux widgets — « Revenus par service » (bar chart horizontal coloré, total en €) et « Top zones / villes » (classement avec barres de progression, courses + revenu par ville).

### Tests
- pytest `tests/test_iter118_dashboard_breakdown.py` 3/3 ✅ (structure, tri/propreté zones, auth requise).
- Screenshot dashboard : widgets rendus avec vraies données (694,61 € total ; Paris top zone).

## 2026-06-05 (suite) — Widgets dashboard filtrables par période

### Added
- `GET /api/admin/analytics/breakdown?period=today|week|month|all` : filtre `created_at` (today=00h, week=7j, month=30j).
- Dashboard : les widgets « Revenus par service » et « Top zones/villes » se rafraîchissent au clic sur le sélecteur Aujourd'hui/Semaine/Mois (déjà présent) ; badge de période affiché sur chaque widget.

### Tests
- pytest `test_iter118_dashboard_breakdown.py` 4/4 ✅ (ajout test période cumulative today≤week≤month≤all).
- Screenshot : clic Mois→291,46 € / Semaine→197,01 €, badge "7 jours", graphiques mis à jour.

## 2026-06-05 (suite) — Export analytics CSV / PDF

### Added
- Dépendances : `jspdf` + `jspdf-autotable`.
- `dashboard/exportAnalytics.js` : `exportAnalyticsCSV` (UTF-8 BOM, séparateur ;) + `exportAnalyticsPDF` (titre, période, total, 2 tableaux Revenus par service + Top zones via autoTable).
- Dashboard : boutons **CSV** et **PDF** à côté du sélecteur de période ; export du rapport pour la période sélectionnée (Aujourd'hui/Semaine/Mois).

### Tests
- Screenshot Playwright : login admin → période Mois → clic CSV et PDF → téléchargements confirmés (sb-drive-analytics-month-*.csv / .pdf), aucune erreur console.

## 2026-06-05 (suite) — Rapports hebdomadaires automatiques par email (Resend)

### Added
- Backend `routes/weekly_reports.py` : moteur de calcul par chauffeur/prestataire/livreur sur la semaine précédente (lundi 00:00→dimanche 23:59 en heure locale via zoneinfo) + rapport global.
  - Par chauffeur : courses terminées/annulées/refusées, brut, répartition espèces/CB/portefeuille, bonus, commission (taux configurable), revenu net, montant disponible sur l'app, montant non retirable (floor configurable), **virement à effectuer** = max(0, net − espèces encaissées − floor).
  - Sources agrégées : rides (Taxi), parcels (Colis), runner_orders (Runner/Genie), orders (Boutiques delivery_fee).
- Endpoints admin : GET/PUT `/api/admin/weekly-reports/config` (clé Resend masquée), GET `/preview`, POST `/send-now` (avec `test_email` optionnel).
- Emails HTML inline (Resend SDK, `asyncio.to_thread`) : rapport individuel par chauffeur + rapport global (admin/comptable).
- Planificateur : `weekly_report_loop` (lifespan) — envoie automatiquement le jour/heure configuré si `enabled`, anti-doublon via `last_sent_week`.
- Frontend `AdminWeeklyReports.js` (`/admin/weekly-reports`, sidebar FINANCE) : config complète (clé API, expéditeur, destinataires, fuseau, jour/heure, commission, montant non retirable, toggles chauffeurs/prestataires/livreurs, activation), bouton Aperçu (tableau détaillé), Envoi manuel + email de test.
- `.env` : `RESEND_API_KEY`, `SENDER_EMAIL` (fallback ; la clé admin en DB est prioritaire). `resend==2.30.1` ajouté.

### Tests
- pytest `test_iter119_weekly_reports.py` 5/5 ✅ (auth, config persist+masquage clé, structure preview + invariants virement, send-now gracieux sans clé, bornes semaine lundi→dimanche).
- Engine validé sur fenêtre large : 10 chauffeurs, commissions/virements cohérents (Sophie brut 108,54€ CB → net 92,26€ → virement 72,26€ après floor 20€).
- Screenshot : page rend, sauvegarde + aperçu OK.

### À NOTER (gating)
- **L'envoi réel d'emails nécessite que l'admin saisisse une clé API Resend + un expéditeur vérifié** dans la page. Sans clé, `send-now` renvoie un message clair (« Clé API Resend manquante »). En mode test Resend, seuls les emails vérifiés reçoivent.

## 2026-06-05 (suite) — Rapports hebdo : pièce jointe PDF + archivage/historique + renvoi

### Added
- **PDF** généré côté serveur (reportlab) joint à chaque email : rapport individuel chauffeur + rapport global (tableaux mis en forme). Joint via `attachments` Resend (content=list[int]).
- **Archivage** de chaque envoi dans `report_sends` (semaine, type global/driver, destinataire, statut sent/failed, email_id, erreur, snapshot pour renvoi).
- Endpoints : GET `/api/admin/weekly-reports/history`, POST `/api/admin/weekly-reports/resend/{id}` (rejoue depuis le snapshot stocké).
- Frontend : section **Historique des envois** (date, semaine, type, destinataire, statut ✅/❌, badge test) + bouton **Renvoyer** par ligne.
- `reportlab==4.5.1` ajouté.

### Tests
- pytest `test_iter119_weekly_reports.py` **9/9 ✅** (ajout : PDF valide %PDF-, history endpoint sans fuite de snapshot, auth, resend 404).
- Screenshot : section historique rend l'entrée archivée + bouton Renvoyer.

## 2026-06-05 (suite) — Espace chauffeur : Mes rapports hebdo + téléchargement PDF

### Added
- Backend `driver_router` (`/api/driver/weekly-reports/*`, rôle driver) : `GET /current` (rapport semaine précédente du chauffeur connecté), `GET /current/pdf` (PDF), `GET /history` (rapports archivés du chauffeur, hors tests), `GET /{send_id}/pdf` (PDF archivé, vérif appartenance).
- Frontend `DriverWeeklyReportsPage.js` (`/chauffeur/reports`, thème sombre driver) : carte semaine précédente détaillée (courses, brut, espèces/CB/portefeuille, commission, net, virement) + bouton **Télécharger le PDF** + **Historique** avec téléchargement PDF par ligne.
- Lien d'accès depuis `DriverEarningsPage` (bouton « Rapports hebdo »).

### Tests
- pytest `test_iter120_driver_reports.py` **5/5 ✅** (auth rôle driver, structure current, history, PDF avec activité = %PDF- / 200, 404 inconnu).
- E2e manuel : ride temporaire semaine précédente → calcul correct (brut 42,50€ → net 36,12€ → virement 16,12€) + PDF 200 application/pdf ; données nettoyées.
- Screenshot driver : page rend (état vide propre + bottom nav).

## 2026-06-05 (suite) — Mobile Phase B : « Mes rapports hebdo » porté dans l'app Expo

### Added (mobile / Expo SDK 52)
- `DriverWeeklyReportsScreen.tsx` : rapport semaine précédente détaillé (courses, brut, espèces/CB/portefeuille, commission, net, virement) + historique, avec **téléchargement/partage PDF** via `expo-file-system` (downloadAsync + header Bearer) + `expo-sharing`.
- Câblé dans `RootNavigator` (DriverStack → `WeeklyReports`) + bouton d'accès depuis `DriverEarningsScreen` (« Mes rapports hebdo »).
- `endpoints.ts` : `driverAPI.getWeeklyReport` + `getWeeklyReportHistory`.
- Dépendances : `expo-file-system@~18.0.12`, `expo-sharing@~13.0.1`.

### Tests
- `tsc --noEmit` : 0 erreur sur les fichiers modifiés.
- Endpoints backend déjà validés (iter120, pytest 5/5).
- ⚠️ Runtime mobile NON testé dans cet environnement (app native Expo — nécessite Expo Go / device). Logique réutilise des endpoints testés.

## 2026-06-05 (suite) — Activation du Taxi Pool (partage de course −30%, section Pool uniquement)

### Contexte
Le mode « Pool » du TaxiHub envoyait `pool_enabled:true` mais aucune remise n'était appliquée (le « −30% » n'était qu'un badge). Un moteur Pool existait dans `phase2.py` (matching `/phase2/pool/matches` + remise `/phase2/pool/enable`) mais n'était pas câblé au flux de réservation.

### Activated
- Backend `rides.py` : constante `POOL_DISCOUNT_RATE=0.30`.
  - `POST /api/rides/estimate` : si `pool_enabled` → applique −30%, renvoie `original_fare`, `pool_enabled` et raison « Pool partagé −30% ».
  - `POST /api/rides` (création) : si `pool_enabled` → applique −30%, stocke `original_fare` + `estimated_fare` remisé. **Remise appliquée uniquement quand `pool_enabled=true` (donc uniquement via la section Pool).**
- `models/schemas.py` : `RideResponse` expose désormais `original_fare` + `pool_enabled` (prix barré côté UI).
- Frontend `TaxiHubPage.js` : `fetchEstimate` envoie `pool_enabled: mode.id === 'pool'` → le tarif affiché en section Pool reflète la remise.
- `RideTrackingPage.js` : synchronise l'état du toggle Pool depuis `ride.pool_enabled` au chargement (cohérence UI, pas de double remise grâce à `original_fare`).
- Le moteur de matching co-passagers `/phase2/pool/matches` reste disponible.

### Tests
- pytest `test_iter121_taxi_pool.py` **3/3 ✅** : estimate non-pool vs pool (−30% exact, original_fare, raison), création course Pool (remise + original_fare), remise jamais appliquée hors Pool.
- curl e2e : estimate 5,00€ → 3,50€ ; création course Pool estimated_fare 3,50€ / original_fare 5,00€ / pool_enabled true. Données de test nettoyées.

## 2026-06-05 (suite) — Processus Pool V3Cube : sélection des sièges + tarif par siège

### Contexte
Captures V3Cube fournies : après adresse + Pool → écran « De combien de places avez-vous besoin ? » (1 ou 2 sièges, prix qui s'ajuste : 1 = 4,30€, 2 = 8,17€, ratio 1,9) → « Confirmer les sièges » → « Recherche de pilotes ».

### Added
- Backend `rides.py` : tarification géométrique par siège `pool_fare_multiplier(n) = 0.70*(1-0.9^n)/(1-0.9)` (1 siège=×0.70, 2=×1.33). Appliquée dans estimate + création quand `pool_enabled`, bornée à POOL_MAX_SEATS=4. `models/schemas.py` : `seats_required` (RideRequest + RideResponse).
- Frontend `TaxiHubPage.js` : CTA « Confirmer les détails » en mode Pool → feuille de sélection des sièges (`pool-seats-sheet`, options 1/2 avec prix par siège), « Confirmer les sièges » → réservation. `buildPayload` envoie `seats_required`. Prix live ajusté selon les sièges.

### Tests
- pytest `test_iter121_taxi_pool.py` **5/5 ✅** (remise pool, sièges géométriques, création 2 sièges, jamais hors Pool).
- testing_agent frontend **100%** (iteration_121.json) : feuille sièges, ratio 1,97×, navigation vers /ride/<id> « Recherche d'un chauffeur ». Mode standard contourne la feuille. Rides de test nettoyés.

## 2026-06-05 (suite) — Correction modèle prix Pool = parité V3Cube exacte + config admin

### Contexte (captures admin V3Cube fournies)
Config V3Cube du type de véhicule Pool : Enable Pool (toggle), **Pool Percentage = 90** (chaque siège suppl. = 90% du 1er siège), **Available Seats = 4** (capacité hors chauffeur), Fare Model = Fixed. Important : le **1er siège = tarif plein** (PAS de remise -30%).

### Fixed / Changed
- Backend `rides.py` : remplacé le modèle géométrique erroné (0.70×…) par le **modèle linéaire V3Cube** : `total(n) = F × (1 + (n-1)×pool_percentage/100)` où F = tarif plein du véhicule Pool. 1 siège = F (5,00€), 2 = ×1,9 (9,50€), 3 = ×2,8 (14,00€), 4 = ×3,7 (18,50€).
- Config **admin-configurable** via `service_configs` clé `pool` : `get_pool_config()` lit `enable_pool`, `pool_percentage`, `available_seats`. Sièges demandés bornés à la capacité.
- Admin : page **« Configuration Pool »** (`/admin/pool-config`, sidebar Taxi/Transport) avec toggle + Pool Percentage + Sièges disponibles + Modèle tarifaire.
- Estimate renvoie `available_seats` + `pool_percentage` ; frontend `TaxiHubPage` : options de sièges dynamiques (1..capacité), prix par siège via le modèle linéaire piloté par la config.
- Seed config par défaut (90 / 4 / Fixed).

### Tests
- pytest `test_iter121_taxi_pool.py` **5/5 ✅** (1er siège = plein, tarif linéaire par siège, clamp capacité, persistance création, non-pool intact).
- curl e2e : P=90→2 sièges 9,50€ / 4 sièges 18,50€ ; changement admin P=80 → 9,00€ et capacité 2 → clamp ✓.
- Screenshot : page admin Configuration Pool OK.

## 2026-06-06 — Thème Orange écrans Radar + Course annulée

### Changed
- `SearchingRadar.jsx` : ajout prop `variant` ('light' | 'orange'). En `orange`, anneaux/arcs blancs + disque central blanc avec pin orange — lisible sur fond orange.
- `RideTrackingPage.js` (état `pending`) : écran « Recherche d'un chauffeur » passé en **fond Orange (#FF5000) / texte blanc** ; radar en variant orange ; carte trajet en blanc translucide ; boutons (Pool blanc, Relancer/Annuler blanc translucide).
- `RideTrackingPage.js` (état `cancelled`) : écran « Course annulée » passé en **fond Orange / texte blanc** ; bouton primaire « Réessayer » blanc à texte orange ; secondaires blancs translucides.
- Cohérence visuelle complète avec le nouvel en-tête réservation Orange/Blanc (choix utilisateur « a »).
- Lint JS clean. Changement purement CSS (aucune logique modifiée).

## 2026-06-06 (suite) — Compteur chauffeurs proches + retrait bouton WhatsApp

### Added
- Backend `rides.py` : `GET /api/rides/{ride_id}/nearby-drivers` → compte les chauffeurs **approuvés + en ligne** dans un rayon de 12 km du départ (haversine via `calculate_distance`, position live `manager.get_driver_location` avec fallback `current_lat/lng`). Réponse `{count, radius_km}`. Auth + propriété de course vérifiées. Testé e2e : course Paris → `{"count":15,"radius_km":12.0}`.
- `RideTrackingPage.js` (état pending) : badge temps réel sous le sous-titre du radar — « N chauffeurs notifiés à proximité » (pastille verte pulsante), polling toutes les 6 s. `data-testid=nearby-drivers-badge / nearby-drivers-count`.

### Removed
- `RideChoosePage.js` : suppression du bouton **« Réserver via WhatsApp »** du CTA (tous véhicules/modes), + code mort associé (`buildWhatsAppText`, `onWhatsApp`, `showWhatsApp`, `selectedVehicle/Name`) et import `WhatsappLogo`. La config WhatsApp admin reste en base (réutilisable ailleurs) mais n'est plus exposée dans l'app.

### Tests
- Lint JS + Python clean. Frontend compile (warnings exhaustive-deps préexistants). Endpoint nearby-drivers : 401 sans auth, 404 course inexistante, 200 + count sur course réelle.

## 2026-06-06 (suite) — Bouton "Activer Taxi Pool" limité à la catégorie Pool

### Changed
- `RideTrackingPage.js` (écran recherche/pending) : le bouton « Activer Taxi Pool (tarif partagé) » n'est plus affiché pour toutes les courses. Nouveau flag stable `isPoolRide` (défini au 1er chargement via `pool_enabled || mode_id==='pool'`). Le toggle Pool n'apparaît QUE pour les courses réservées depuis la catégorie Pool ; retiré de toutes les autres catégories. Lint clean.

## 2026-06-06 (suite) — Refonte moderne de l'écran d'accueil User (UserHome.js)

### Changed (design — choix utilisateur « B » : sections conservées séparées)
- Réécriture complète de `UserHome.js` selon `design_guidelines.json` (archetype Swiss/high-contrast premium).
- **Header sticky en verre dépoli** (bg-white/85 backdrop-blur) : menu, salutation+nom, sélecteur de langue, avatar, pastille d'adresse, barre de recherche toujours visible.
- **Nouveau bloc héros « Vos essentiels »** (grille 2×2) : VTC · Livraison Repas · Coursier · Pharmacie (grandes tuiles blanches, icône colorée, accent radial).
- **Toutes les sections existantes conservées séparément** (Taxi, Livraison, Genie&Runner, Vidéo, À la demande, Beauté, Médical, Animaux, Enchères, Auto, Dépannage, Marketplace, Parking, Cartes cadeaux, Covoiturage, Suivi, Commerces) — uniquement modernisées : en-têtes avec barre d'accent orange + lien « Tout voir », fond app #F8FAFC, cartes rounded-[20-22px] blanches/bordées, ombres douces.
- **Polices** Outfit (titres) + Manrope (texte) ajoutées dans `public/index.html`, appliquées via classes Tailwind arbitraires.
- **Tuiles de service** modernisées (rounded-[20px], ombre douce, hover -translate-y) — **CMS 100% préservé** (icônes dynamiques, bg/couleurs configurables, routes intactes).
- **Micro-animations** framer-motion : apparition en fondu/montée du contenu + `whileTap` (scale) sur toutes les tuiles/cartes.
- **Bottom-nav** refaite en verre dépoli (bg-white/90 backdrop-blur), onglet actif orange lumineux.
- Aucune route ni `data-testid` supprimé ; ajout testids `hero-tile-*`, `section-action-*`.

### Tests
- Lint JS clean. Webpack compile sans erreur (1 warning exhaustive-deps préexistant, hors scope).
- ⚠️ Vérification visuelle authentifiée en attente : preview en veille (gate "Wake up servers"). À valider à l'ouverture du preview.
- Compte passager de test créé : marie.test@demo.sb / Passager2026!

## 2026-06-06 (suite) — Réordonnancement des sections de l'accueil (choix utilisateur)

### Changed
- `UserHome.js` refactoré en rendu déclaratif : map `blocks` (chaque section keyée) + tableau `SECTION_ORDER` → l'ordre des sections se change désormais en éditant une seule liste.
- **Nouvel ordre** (demande utilisateur) : 1.Services Taxi · 2.Bannière promo · 3.Services de Livraison · 4.Livraison de Colis · 5.Acheter/Vendre/Louer · 6.Beauté · 7.Médicaux · 8.À la demande · 9.Enchères Services · 10.Entretien Auto · 11.Dépannage & Remorquage.
- Sections non citées conservées à la suite (option a, non destructif) : Genie&Runner, Vidéo, Animaux, Parking, Cartes Cadeaux, Covoiturage, Suivi Famille, Commerces Proches.
- **Supprimés** (confirmé « 2 oui ») : bloc héros **« Vos essentiels »** + bannière **« Tous les services »**.
- Lint clean, webpack compile sans erreur.

## 2026-06-06 (suite) — Accueil aligné sur les formats/grilles V3Cube (réf. utilisateur)

### Changed (UserHome.js — d'après 4 captures de référence fournies)
- **Tuiles de service agrandies** (style V3Cube) : grande tuile pastel carrée (aspect-square, rounded-2xl) avec icône centrée à l'intérieur + **label gras foncé en dessous** (2 lignes, police Outfit). Composant `ServiceTile`.
- **Grilles 3 colonnes** (Animaux, Dépannage) : variante `inside` → label gras en haut + icône en dessous, tuiles gris clair (comme la réf).
- **« More Services »** : pastille signature à **4 carrés colorés** (orange/rose/vert/orange) via `MoreSquares`, déclenchée quand l'id contient `more`.
- **Bannière promo** : passage en **défilement horizontal** snap (aperçu de la bannière suivante), suppression de l'auto-rotation/dots.
- **Titres de section** : gros, gras noir (extrabold), suppression de la barre d'accent orange et des liens « Tout voir » (navigation via la tuile More).
- **Cartes** retravaillées au format réf : Genie&Runner (2 cartes), Médical (bento 1 grande + 2), Enchères (2×3 cartes blanches avec flèche), Acheter/Vendre/Louer (2 cartes + 1), Vidéo (chips blancs), Suivi famille (2 cartes centrées), Covoiturage/Parking/Cartes cadeaux (bannières).
- **Barre du bas** : pill sombre flottante (#0B1426) avec « Accueil » en pastille orange + icônes Réservations/Portefeuille/Profil (icône `ClipboardText` pour réservations).
- En-tête épuré fond blanc : « Bienvenue / Nom », avatar arrondi, localisation simple, recherche blanche ombrée.
- CMS 100% préservé (icônes/couleurs/routes), ordre des sections inchangé (SECTION_ORDER).

### Tests
- Lint clean, webpack compile sans erreur (1 warning préexistant). Vérif visuelle en attente (preview en veille).

## 2026-06-06 (suite) — Fix : adresse de départ non auto-localisée

### Problème
Le champ « Départ » restait vide : la géolocalisation navigateur (`getCurrentPosition`) est bloquée silencieusement dans l'iframe du preview et quand le GPS/permission est désactivé sur mobile — sans aucun repli, le champ restait vide (aucun feedback).

### Fix
- **Backend** `routes/geo.py` : nouvel endpoint `GET /api/geo/ip-locate` — lit l'IP réelle du client via `X-Forwarded-For`/`X-Real-IP` (helper `_first_public_ip`, ignore IP privées/loopback) et interroge **ip-api.com** (sans clé, HTTP côté serveur) pour renvoyer `{ok, lat, lng, city, address}`. Testé : XFF=92.184.96.1 → localisation France ✅.
- **Frontend** `services/api.js` : ajout `geoAPI.ipLocate()`.
- **Frontend** `RideChoosePage.js` : `autoLocate()` garde le GPS prioritaire ; en cas d'échec/blocage/permission refusée → repli **`ipLocate()`** qui remplit le départ avec la position approximative (ville). Toast informatif sur action manuelle.
- Résout l'« écran vide » sur preview (iframe) ET prod (GPS off). Précision GPS conservée si autorisé.
- Lint clean, webpack compile OK.

## 2026-06-06 (suite) — Retrait du bouton "Activer Taxi Pool" (sauf option Pool)

### Changed
- `RideTrackingPage.js` : suppression complète du bouton bascule « Activer Taxi Pool (tarif partagé) » de l'écran de recherche (apparaissait à tort sur des courses non-Pool, ex. Confort). Nettoyage : callback `togglePool`, états `poolLoading`/`isPoolRide`, import `UsersThree`.
- Conservé : tuile « VTC Pooling » sur l'accueil + fonctionnement Pool des courses réservées en Pool (poolEnabled initialisé depuis la réservation, panneau de jumelage `pool-matches-panel` toujours actif).
- Conforme à la demande « retirer Taxi Pool partout sauf sur le pool ». Lint clean, webpack OK.

## 2026-06-06 (suite) — PHASE A (Paiements) — Étape 1 livrée & testée

### Contexte (épisode multi-features demandé par l'utilisateur)
Roadmap validée : A Paiements → B Annulations/dette → D Favoris → F Popup promo → C Permissions/docs → E Appels+enregistrement (Twilio). Valeurs par défaut : marge CB 1€, frais annulation 5€, fenêtre gratuite 5 min. SB PayGo ≠ Portefeuille (4 moyens). CB pré-auth = Stripe.

### Livré (Phase A — Étape 1, sans hold Stripe)
- **Backend** `config.py` : `GET /api/config/payment-methods` → moyens activés (Espèces, CB, Portefeuille, SB PayGo) + `cb_margin_eur` + `wallet_shortfall_to_cash`. Config stockée sous `service_configs.payment_methods` (flags admin).
- **Backend** `rides.py` : `PUT /api/rides/{id}/payment-method` — change le moyen de paiement à tout moment avant fin de course ; pour Portefeuille insuffisant → `difference_in_cash` + `shortfall` (payable en espèces). Helper `_payment_feasibility`. Testé : wallet solde 0 → shortfall 7.38€ ✅, card OK, invalide→400.
- **Frontend** `RideChoosePage` : 4 moyens chargés depuis la config (grille 2 cols) + solde portefeuille + avis « différence en espèces » / « suffisant ✓ ».
- **Frontend** `RideTrackingPage` : carte « Moyen de paiement » avec bouton **Changer** (sélecteur 4 moyens) actif pendant toute la course + bandeau shortfall.
- **Admin** : panneau « Moyens de paiement » (`/admin/payment-methods-config`) — activer/désactiver chaque moyen, marge CB, règle portefeuille→espèces, frais & fenêtre d'annulation (seed Phase B). Testé GET/PUT + reflet API publique ✅.
- Lint clean, backend testé curl e2e, frontend compile.

### BLOQUÉ / EN ATTENTE
- **CB pré-autorisation (hold + capture + carte enregistrée)** : la lib Stripe Emergent (`sk_test_emergent`) ne fait que du Checkout hébergé (débit immédiat), PAS d'autorisation/hold. → nécessite les **clés Stripe RÉELLES de l'utilisateur** (test ou live) + SDK officiel. À brancher dès réception des clés.

## 2026-06-06 (suite) — PHASE B (Annulations & dette) livrée & testée backend

### Backend
- `routes/debts.py` (nouveau, prefix `/debts`) : `GET /me` (dette impayée totale + items), `POST /pay` (règle depuis le portefeuille, 402 si insuffisant). Helpers `get_unpaid_debt_total`, `settle_cancellation_fee` (débite le portefeuille sinon crée une dette). Collection `cancellation_debts`. Enregistré dans server.py.
- `routes/rides.py` :
  - Helpers `_cancel_policy()` (lit `cancellation_fee_eur`/`free_cancel_window_minutes` admin) et `_compute_cancel_fee(ride, policy, now)` : GRATUIT tant que pending/non-accepté ; courses **directes** → fenêtre gratuite démarre à l'**acceptation** du chauffeur ; **réservations** → gratuit si annulation > fenêtre avant l'heure planifiée.
  - Endpoint `/cancel` et bloc « cancelled » de l'update statut réécrits pour appliquer la politique + `settle_cancellation_fee` (portefeuille ou dette).
  - **Blocage** : `POST /rides` renvoie **402** si dette d'annulation impayée.
- `config.py` : la config publique payment-methods renvoie aussi `cancellation_fee_eur` + `free_cancel_window_minutes`.

### Frontend
- `components/DebtBanner.jsx` (nouveau) : bannière rouge persistante (montant + bouton **Régler** via portefeuille) + **rappel toast toutes les 2h** (throttle localStorage). Monté sur l'**accueil** et pendant la **course**.
- `RideTrackingPage.js` : **popup « Politique d'annulation »** affiché 1×/course après réservation (gratuit maintenant / frais après X min) ; capte frais+fenêtre depuis la config.
- `services/api.js` : `debtsAPI {me, pay}`.
- Blocage 402 à la réservation : message de dette déjà affiché via le catch existant de `onRequest`.

### Tests (curl e2e ✅)
- Annulation pending → 0€. Annulation acceptée +10min → 5€ → dette créée (portefeuille 0). Nouvelle commande → 402 bloquée. Paiement dette portefeuille vide → 402. Recharge 10€ → paiement → dette soldée (solde 5€).
- Lint clean, frontend compile.

### Roadmap restante
- Phase A reste : **CB pré-autorisation Stripe** (attend clés Stripe réelles user).
- Suivantes : D (Favoris max 2) → F (Popup promo en course) → C (Permissions/docs) → E (Appels+enregistrement Twilio, clés à fournir).

## Iteration 185-186 (Jun 9, 2026) — Phase 1 Sécurité & Favoris + Phase 2 Parrainage (DONE)

### Correctifs critiques (reprise de fork)
- **RideTrackingPage.js** : erreur de compilation `return outside of function` — la ligne `if (ride.status === 'pending') {` avait été supprimée par erreur, laissant le bloc radar orphelin. Restaurée. Le `useEffect` d'auto-partage est correctement placé avant tous les early returns.
- **trip_share.py** : l'endpoint public `GET /api/trip-share/{token}` (suivi live `/t/:token`) avait perdu son décorateur `@router.get` et sa signature `def` (code orphelin après le `return` de `ride_auto_share`). Restauré. Testé : 404 FR pour token invalide, snapshot complet sinon.

### Phase 1 — Sécurité & Favoris (testé 11/11 backend, frontend OK — iter 185)
- Auto-partage du trajet aux contacts de confiance à l'acceptation (toggle dans /safety, hook dans RideTrackingPage).
- Limite de 2 chauffeurs favoris (`phase1.py` add/list/delete, 400 au 3e).
- Régression : `/app/backend/tests/test_iter185_phase1_safety.py`.

### Phase 2 — Parrainage (testé 14/14 backend, frontend OK — iter 186)
- **Codes basés sur le nom** : `Sylvain01` (client), `Sylvain01P` (chauffeur, suffixe P), uniques (Sylvain02...). Anciens codes aléatoires conservés pour comptes existants.
- **Récompenses conditionnelles différenciées par rôle**, payées aux DEUX parties :
  - Chauffeur→Chauffeur = 50€ chacun après 20 courses du filleul en 30 jours (fenêtre `expires_at`).
  - Chauffeur→Client / Client→Client / Client→Chauffeur = 5€ chacun après la 1ère course.
- Statut `pending` à l'application (aucun crédit immédiat) → `completed` + crédit wallet via le hook `process_referral_on_ride_completion` branché à la complétion de course (`rides.py` ~l.1357).
- Validation insensible à la casse. Config admin réelle persistée : `GET/PUT /api/referral/config` (admin only).
- Frontend : `AdminReferralSettings.js` (4 montants + 3 conditions, save persistant) ; `ReferralPage.js` (badges En attente/Expiré/validé + progression courses).
- Régression : `/app/backend/tests/test_iter186_referral.py`.

### Roadmap restante (5 phases validées)
- Phase 3 — Annulations, pénalités & modération (bans clients 10/15, pénalités chauffeurs 1-2€, archivage conversations).
- Phase 4 — Logique de dispatch (courses planifiées pool/lock ; dispatch live 30s zone → fallback → propose price).
- Phase 5 — Statuts de fidélité (Silver/Gold/Platinum/Diamond, configurables admin).
- Backlog : Livraison Marketplace (coursiers) ; accusés de lecture « lu » messages Marketplace.

## Iteration 187 (Jun 9, 2026) — Croissance : bannière parrainage + rappel d'évaluation Store (DONE)
- **Bannière de parrainage** sur le reçu de fin de course (`RideReceiptPage.jsx`) : « Invitez un ami, gagnez X€ » + code basé sur le nom + bouton Inviter/Partager (boucle virale au moment de satisfaction).
- **Rappel d'évaluation Play Store / App Store** après N courses (défaut 2), affiché UNE seule fois : 4-5★ → ouvre le store (détection iOS/Android) ; 1-3★ → retour interne (anti-avis négatifs, stocké dans `db.app_feedback`). Rejetable « Plus tard ».
- URLs configurables en admin (carte « Rappel d'évaluation » dans la page Parrainage), seedées : Play `com.sbdrivervtc.client`, App Store `id1444980912`.
- Backend (`config.py`) : `GET /config/store-review`, `PUT /config/admin/store-review` (admin), `GET /config/review-prompt`, `POST /config/review-prompt/seen`, `POST /config/review-prompt/feedback`, `GET /config/admin/feedback` (admin — liste des retours négatifs).
- Testé 10/10 backend + frontend 100% (iter 187). Régression : `/app/backend/tests/test_iter187_growth.py`.
- Reste possible : page admin UI pour lister `db.app_feedback` (endpoint déjà exposé).

## Iteration 188-189 (Jun 9, 2026) — UX chauffeur/client + Dispatch "Prochaine course" (DONE)
### 1. Mini-compteur de parrainage (accueil client) — testé iter188
- Bannière « Plus que N course(s) pour débloquer vos X€ » + barre de progression pour le filleul avec parrainage en attente. Backend : `GET /api/referral/my-pending`. (`UserHome.js`)
### 2-3. Chauffeur : son + clignotant + calendrier — testé iter188
- Util audio déblocable partagé `src/lib/driverAlert.js` (AudioContext résumé à la 1ère interaction) : `playAlert/startSiren/stopSiren`. Sirène + vibration tant qu'une demande immédiate est affichée. Le hook `driverHome.js` réutilise `playAlert` (réservations planifiées + T-40min).
- Badge calendrier : clignotement franc « clignotant de voiture » (CSS `@keyframes blink-turn`/`blink-ring`, rouge) + badge orange sur la cloche de notifications (compteur non lus). Respect `prefers-reduced-motion`.
### 4. Thème — testé iter188
- App chauffeur : vert `#00B578` → **bleu ciel `#0EA5E9`** (header confirmé rgb(14,165,233)) + accents **orange `#FF5000`** (boutons Accepter). App client : reste orange.
### 5. Dispatch "Prochaine course" (Phase 4 MVP) — backend testé iter189
- Un chauffeur occupé à ≤ `next_job_lead_minutes` (défaut 5, configurable, dans `config/ride-search`) de sa destination peut recevoir/réserver la course suivante (banner `next-job-offer` → `Réserver pour après`). Réservation via `/api/rides/{id}/accept` (assigne le chauffeur sans interrompre la course en cours), puis promotion auto à la fin (`finishRide`). Éligibilité = distance haversine position→dropoff vs vitesse 25 km/h.
- NB : le banner est piloté WebSocket + géolocalisation → non automatisable en headless ; backend (config + assignation 2e course + non-régression) validé 100%. Commentaire explicite ajouté sur `/accept` (ne pas ajouter de garde « chauffeur occupé »).
- Régressions : test_iter188_ux.py, test_iter189_nextjob.py.

## Iteration 190 (Jun 9, 2026) — Thème chauffeur 50/50 + admin "Prochaine course" global+zone (DONE)
- **Thème chauffeur** : en-tête en dégradé **50% bleu ciel #0EA5E9 / 50% orange #FF5000** (au lieu de bleu plein). Badges calendrier + notifications rouges clignotants (visibles sur les deux moitiés).
- **Calendrier réservations planifiées** : confirmé fonctionnel (ouvre la feuille ; vide si aucune réservation planifiée en attente — normal).
- **Admin "Prochaine course"** (carte dans `AdminAutoDispatch` /admin/auto-dispatch) : interrupteur global + délai (min, clampé 1..30) + **override par zone** (cycle Hérite→ON→OFF). Backend : `GET/PUT /api/config/next-job/admin` (admin), `GET /api/config/next-job?lat&lng` (effectif, résolu par zone active via `resolve_zone`, fallback global). Frontend chauffeur consomme la config effective par zone (grille grossière ~2km).
- NB : zones seedées `is_active=false` en env → la config globale s'applique tant qu'une zone n'est pas activée (override validé en activant temporairement zone_fdf). Le banner « Prochaine course » reste piloté WS+géoloc (non automatisable headless) ; backend + admin validés 100% (11/11). Régression : test_iter190_nextjob_admin.py.

## Iteration 191 (Jun 9, 2026) — Thème chauffeur NOIR + Phase 5 Fidélité (DONE)
### Thème chauffeur
- En-tête chauffeur passé en **noir `#0B0B0B`** (textes/icônes blancs, accents + toggle « En ligne » orange, badges rouges clignotants). Bleu ciel `#0EA5E9` remplacé par orange `#FF5000` dans toute l'app chauffeur.
### Phase 5 — Statuts de fidélité (testé 9/9 backend + frontend 100%, iter191)
- Paliers Silver/Gold/Platinum/Diamond (seuils 0/500/1500/4000, configurables). Points : +10/course (config), +50 1ère course, +20 parrainage qualifié — pour clients ET chauffeurs (stockés dans `db.loyalty`, séparés du score dispatch 0-100).
- **Avantage concret câblé** : réduction de commission chauffeur selon le palier (appliquée au calcul des gains à la complétion). Réduction client & priorité dispatch exposées (config) pour câblage progressif.
- Backend `routes/loyalty.py` : `GET /loyalty/me`, `GET /loyalty/config`, `GET/PUT /loyalty/admin/config`. Hook d'attribution dans `rides.py` (complétion).
- Frontend : `LoyaltyStatusCard` (accueil client + page récompenses chauffeur), page `/loyalty` (paliers + historique), admin `/admin/loyalty` (points, bonus, paliers/avantages éditables).
### Bugfix parrainage à l'inscription (Phase 2)
- `phone_register` crashait (REFERRAL_AMOUNT supprimé) et générait des codes `SB-XXXX`. Corrigé : code **basé sur le nom** (`Jean01P` chauffeur / `Sophie01` client), résolution insensible à la casse, création d'un parrainage **pending** (modèle Phase 2) au lieu du crédit instantané. Fonctions cassées supprimées.
- Régression : test_iter191_loyalty.py (9/9).

## Iteration 192 (Jun 9, 2026) — Remise fidélité client appliquée + affichée au checkout (DONE)
- La remise de palier client (`client_discount_pct`) est désormais **appliquée concrètement** au tarif : à la réservation (sur `estimated_fare`) et au **tarif final** à la complétion (sur la part tarifaire, hors péages/extras), comme une couche de remise (après voucher/corporate/promo).
- **Affichage au checkout** (`AdvancedTaxiBookingPage`) : bannière « En tant que membre {palier}, -X% appliqués 🎉 » + prix remisé avec l'ancien prix barré. Endpoint `GET /api/loyalty/my-discount`.
- Stocké sur la course : `loyalty_discount_pct/amount/tier_name` ; `fare_breakdown.loyalty_discount` à la complétion.
- Testé 5/5 backend (réservation + complétion : Gold final_fare ≤ Silver) + frontend (Silver sans bannière, Gold -3%). Régression : test_iter192_loyalty_discount.py.
- Note : remise absorbée comme un voucher (réduit le tarif payé). Avantages Phase 5 restants à câbler : priorité dispatch dans l'auto-dispatch.
