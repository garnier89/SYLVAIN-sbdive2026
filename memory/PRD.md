## NEW - 2026-06-16 (542) - 🧹 Nettoyage profond du code mobile + rebuild APK
- **Demande user** : connexion difficile sur les APK + « les apk ont les anciens fichiers » → nettoyer le code en profondeur.
- **Cause** : tout l'ancien code natif (écrans auth/driver/merchant/user, navigation, contexts, hooks, i18n, api, theme, utils) subsistait dans `mobile/src/` bien que non importé (App.tsx → WebAppShell uniquement). Les anciens APK (du zip) contenaient les écrans de connexion natifs lourds.
- **Nettoyage** : supprimé TOUT `mobile/src/` sauf `screens/WebAppShell.tsx`. Retiré les dépendances inutiles (react-navigation x4, react-native-maps/svg/reanimated/screens, axios, i18next/react-i18next, expo-auth-session/secure-store/file-system/font/linking/localization/sharing/speech/system-ui/web-browser, vector-icons, async-storage). `babel.config.js` : retiré le plugin reanimated. `app.json` : retiré le plugin `expo-secure-store`. Aligné `react-native` → 0.76.9.
- **Résultat** : `expo-doctor` 18/18 ✅. Dépendances 33 → **11**. APK **63 Mo** (vs 85 Mo), bundle contient l'URL prod, **0 ancien écran natif**. 3 builds EAS FINISHED.
- **Liens APK nettoyés (iter 542)** : client `mMMLFaf-bk2nZeGHcML-PDV_7rsGCLOBZt6ulBKpxl4`, driver `gTAptPKMyj1ZjExTz7Z32zcGn4jS14zI0jbTS6yKjdE`, merchant `rNvw34XAe_mvI49Uyrif8nbbWrEQp8yi4yCWktUFUZY` (préfixe https://expo.dev/artifacts/eas/…apk).

---


- **Contexte** : user ne pouvait pas installer les anciens APK (natifs, datés). Demande : générer des APK récents. Compilation impossible dans le conteneur (Hermes/ELF) → déclenchement via **EAS cloud** avec jeton Expo fourni par l'utilisateur (compte **sylvain2029**, projectId `481fcc8e-0f58-4f1b-8d04-829748aa7f53`).
- **Corrections nécessaires pour que le build EAS passe** :
  1. Fichier au nom corrompu (résidu `expo export`) bloquant l'archive `EAS_NO_VCS` → supprimé ; ajout `.easignore` (node_modules/android/ios/dist).
  2. **Versions Expo incohérentes** : `expo-device`, `expo-image-picker`, `expo-notifications` en `^56.x` (SDK 53+) vs cœur `expo` SDK 52 → `yarn remove` des 3 (inutiles en WebView) + retrait du plugin `withImageCropperFix`.
  3. **Kotlin/Compose** : `expo-modules-core 2.2.3` (Compose Compiler 1.5.15) exige Kotlin **1.9.25** mais le template SDK 52 utilise 1.9.24 → ajout `expo-build-properties` avec `android.kotlinVersion: '1.9.25'` (rebuild `--clear-cache`).
- **Résultat** : 3 builds **FINISHED** (client/driver/merchant), APK signés (v2), package `com.sbdrive.vtc/.driver/.merchant`, bundle JS contient bien l'URL prod (= coque WebView). Liens artifacts EAS fournis au user + tableau de bord expo.dev/accounts/sylvain2029/projects/sb-drive-vtc/builds.
- **Note install** : signature v2-only (AGP minSdk24) → si blocage Play Protect/MIUI, étapes « Installer quand même » + désinstaller anciennes versions. Alternative PWA disponible.
- **Config mobile clé** : `mobile/app.config.js` (owner sylvain2029, plugins + build-properties), `mobile/.easignore`, EAS profiles client/driver/merchant dans `mobile/eas.json`.

---


## NEW - 2026-06-16 (540) - 📱 APK = app web de production (coque WebView native), 3 APK par rôle
- **Problème user** : les APK Expo natifs générés « n'avaient rien à voir » avec l'app en ligne (sous-ensemble de fonctions) + connexion impossible (« Une erreur est survenue »). Diagnostic : app native distincte/limitée ; le message générique = repli sans `detail` (erreur réseau/écart). Production joignable (compte `garnier89@live.fr` existe, 401 sur mauvais mdp).
- **Choix user** : 3 APK séparés par rôle, et l'APK doit être l'app en ligne complète.
- **Solution** : chaque APK devient une **coque native légère** chargeant directement la super-app web de production (`https://gojek-mvp-1.emergent.host`) au point d'entrée du rôle → APK **identique** à l'app en ligne (mêmes identifiants, toutes les fonctions, MAJ web auto sans rebuild).
  - `mobile/src/screens/WebAppShell.tsx` (nouveau) : `react-native-webview` plein écran — géoloc (expo-location + `geolocationEnabled`), caméra/KYC (`allowFileAccess`, inline media), bouton retour Android = historique web, liens externes (tel:/maps) ouverts hors-app, cookies/localStorage persistants, écran « Réessayer » réseau, SafeArea haut+bas.
  - `mobile/App.tsx` réécrit : rend `WebAppShell` (supprime nav/auth natifs, app allégée).
  - `mobile/app.config.js` : `startPath` par variante — client `/`, chauffeur `/chauffeur`, marchand `/merchant` ; `backendUrl` exposé dans `extra`.
- **Auth web role-aware confirmée** : login redirige déjà chauffeur→`/chauffeur/home`, marchand→`/merchant/dashboard` (EmailLoginPage/LoginPage) → atterrissage correct par APK.
- **Vérifié** : bundle Metro OK (**823 modules**, toutes importations résolues) ; 3 points d'entrée prod répondent 200. ⚠️ APK non compilable dans le conteneur (EAS cloud uniquement ; `hermesc` ELF = limite conteneur connue, non bloquant EAS). À rebuild via `eas build -p android --profile client|driver|merchant`. Guide `mobile/BUILD_APK.md` mis à jour.

---


## NEW - 2026-06-15 (539) - 📣 Notifications admin : segments fins + planification (outil marketing/rétention)
- **Demande user** : ajouter (A) planification (envoi différé date/heure) + (B) ciblage fin par segment : chauffeurs hors-ligne, chauffeurs par zone (dernière position GPS), clients inactifs (délai admin-configurable : 1/2/3 semaines, 1/2/3 mois), ET croisé zone × inactivité.
- **Backend** : nouveau module `core/notif_broadcast.py` — `AUDIENCE_LABELS` (8 audiences : all/client/driver/merchant + driver_offline/driver_zone/client_inactive/client_inactive_zone), `resolve_audience()` (rôles, `is_online`, GPS chauffeur via haversine dans rayon zone, clients sans course/commande depuis N jours = `users(role user) − distinct(rides/orders depuis cutoff)`, croisé = dernière position pickup dans la zone), `dispatch_broadcast()`, `run_due_scheduled_broadcasts()` (claim atomique status `scheduled`→`sending`→`sent`, idempotent) + boucle `broadcast_scheduler_loop()` (60 s) enregistrée dans `core/startup.py`.
- **Endpoints** (`routes/push_web.py` admin_router) : `GET /broadcasts` renvoie aussi zones + `inactivity_presets` [7,14,21,30,60,90] + zone/inactivity_audiences ; `POST /broadcasts/preview` (estimation taille audience, no-send) ; create/update gèrent `schedule_at` (`_norm_schedule` : futur→`scheduled`, sinon `draft`) + `_apply_targeting` (zone_id/zone_name/inactive_days, 400 si zone manquante). Statuts : draft/scheduled/sent.
- **Frontend** (`AdminNotifSettings.js` `BroadcastManager`) : selects conditionnels Zone + Inactivité selon l'audience, champ `datetime-local` de planification, bouton « Estimer l'audience » (compteur), badges statut (Brouillon/Planifiée/Envoyée) + « ⏰ Programmée pour … ». testids : `broadcast-zone-select`, `broadcast-inactive-select`, `broadcast-schedule-input`, `broadcast-preview-btn`, `broadcast-estimate`.
- **Testé** : pytest `test_iter539_broadcast_segments.py` + `test_iter539_broadcast_http.py` (12) → **20/20 backend** ; E2E front admin (selects conditionnels + estimation + création planifiée + édition + suppression, toasts FR) **100%**. Curl : offline=30, inactif 7j=662 ≥ 30j=598, driver_zone sans zone=400, boucle dispatch 12 marchands + idempotente. 0 donnée résiduelle.

---


## NEW - 2026-06-15 (538) - 🔔 Annulation course : alerte temps réel chauffeur + message 409 précis + Gestionnaire de notifications admin
- **Demande user** : (1) prévenir le chauffeur en temps réel (toast+son) si un client annule une course déjà acceptée ; (2) message 409 précis à l'acceptation (« Course annulée par le client. » vs « Course déjà acceptée par un autre chauffeur. ») ; (3) NOUVEAU : permettre à l'admin de modifier/ajouter des notifications dans le dashboard, ciblées app client/chauffeur/marchand.
- **(1) Alerte temps réel** : `routes/rides.py` `cancel_ride` — si la course annulée avait un `driver_user_id` (status accepted/arriving/in_progress), envoi DIRECT (room-indépendant) d'un évènement WS `ride_cancelled` à `manager.send_personal_message(driver_user_id)` + `create_notification` (corps « La course a été annulée par le client. »). Front `DriverHome.js` : nouvel écouteur `on('ride_cancelled')` → toast warning + son + reset `currentRide`/`incomingRequest` ; l'ancien handler `ride_status_update`=cancelled affiche désormais aussi un toast. `useWebSocket.js` : `ride_cancelled` ajouté aux `SOUND_EVENT_TYPES`.
- **(2) Message 409 précis** : `accept_ride` — si le claim atomique `find_one_and_update` échoue, on relit le status réel : `cancelled` → « Course annulée par le client. », absent → 404 « Course introuvable. », sinon « Course déjà acceptée par un autre chauffeur. ».
- **(3) Gestionnaire notifications admin** : `routes/push_web.py` `admin_router` (/admin/notifications) — collection `notif_broadcasts`, CRUD complet + `POST /broadcasts/{id}/send` (résout l'audience client→user / driver / merchant / all → boucle `create_notification`, renvoie `{ok, sent}`). Front : composant `BroadcastManager` ajouté dans `AdminNotifSettings.js` (page « Notifications — Réglages ») : formulaire (titre, destinataires, message, lien) + liste avec boutons Envoyer/Modifier/Supprimer. testids `broadcast-manager`, `broadcast-{title,audience,body,url}-input/-select`, `broadcast-submit-btn`, `broadcast-row/send/edit/delete-{id}`.
- **Testé** : pytest `test_iter538_cancel_notify.py` (4/4) + `test_iter538_broadcast_admin.py` (HTTP CRUD+send) → **7/7 backend** ; E2E front admin (login → /admin/notif-settings → create/edit/delete sur audience merchant + toasts FR) **100%**. Données de test nettoyées (0 résiduel).

---


## NEW - 2026-06-15 (537) - ✅ Bascule auto fin de course VALIDÉE (E2E) + fix StrictMode du minuteur
- **Demande user** : confirmer en condition réelle la bascule automatique vers la fin de course à l'arrivée au point B.
- **Validation E2E réussie** : avec `set_geolocation(48.8566,2.3522)` = dropoff (course 504 patchée temporairement en `in_progress` à Paris), debug confirmé `distToDropoff:0` → arrivée détectée → après 2 s la vue **bascule vers `RideCompletionFlow`** (étape « Frais supplémentaires » → Sauter/Soumettre). `STILL_IN_PROGRESS=False`. 🎉
- **🐛 BUG StrictMode trouvé & corrigé** : le minuteur de bascule était nettoyé par le cleanup « démontage » lors du cycle mount→unmount→remount de React **StrictMode** (dev), et le garde `arrivedRef` empêchait sa re-programmation → `setCompleting` ne se déclenchait jamais (log `ARRIVAL_FIRE` absent). Correctif : séparation en 2 effets — (1) détection (voix+toast, `arrivedRef` une fois, `setArrived(true)`), (2) programmation du `setTimeout(2000)` piloté par l'état `arrived` (re-programmé au re-setup → robuste StrictMode). 
- Données démo (19 courses actives jean.dupont) modifiées pour le test puis **intégralement restaurées** ; logs debug retirés.

---


- **Demande user** : (1) alerte vocale d'arrivée FR + bascule auto vers l'écran de fin de course au point B ; (2) mode nuit automatique de la carte de navigation (sombre le soir).
- **🌙 Mode nuit auto** : `AdminGoogleMap` reçoit une prop `nightMode` + constante `NIGHT_STYLE` (style sombre type Waze/Google) appliquée à `mapOptions.styles`. `InAppNav` calcule `nightMode = heure ≥ 19h ou < 7h` et le passe à la carte. ✅ Validé visuellement (carte sombre + trafic coloré, à 20h conteneur).
- **🔊 Alerte arrivée + bascule auto** : `DriverRideFlow` — quand `inProgress` et `distToDropoff ≤ 200 m`, annonce vocale FR « Vous êtes arrivé à destination » (voix `fr-*`) + toast + ferme la nav, puis `setCompleting(true)` après 2 s → écran de fin de course. ✅ Toast + voix validés (déclenchés en test).
- **🐛 BUG trouvé & corrigé via test** : le `setTimeout` de bascule était dans le cleanup de l'effet → annulé à chaque changement de `distToDropoff` (GPS qui bouge) → bascule jamais exécutée. Corrigé : timer stocké en `arrivalTimerRef`, nettoyé uniquement au démontage (effet séparé). La bascule utilise `setCompleting(true)`, même chemin prouvé que le bouton manuel « Glisser pour terminer ».
- ⚠️ Capture visuelle de l'écran de fin non obtenue : la géoloc du navigateur de test (Playwright headless) est instable et l'app force `driverPos`/`mapCenter` à un point fixe ~10 km du dropoff (fallback de zone) → `distToDropoff` rarement ≤ 200 m en test. En usage réel (GPS chauffeur fiable) le déclenchement est nominal.
- Données démo (19 courses actives de jean.dupont) modifiées temporairement pour les tests puis **intégralement restaurées**.

---


- **Demande user** : (1) valider en réel (course intra-ville) le tracé noir + ETA-trafic + recalcul ; (2) lancer la nav auto aussi à l'acceptation (vers le client) + faire pivoter le véhicule selon le cap.
- **🐛 FIX CRITIQUE `DirectionsService is not a constructor`** : le loader Google async expose `google.maps` avant que la lib `routes` soit prête ; le lancement auto (plus précoce) révélait la race → écran d'erreur runtime. Ajout `getDirectionsService()` dans `lib/googleMaps.js` (via `importLibrary('routes')`, comme `getGeocoder`) ; `InAppNav.computeRoute` est désormais async et l'utilise. (Aurait aussi planté en prod.)
- **Nav auto à l'acceptation ET au démarrage** : `DriverRideFlow` — effet centralisé avec garde `autoNavRef` (phase 'pick' à `accepted`, 'drop' à `in_progress`) → la nav interne s'ouvre 1× par phase, ne se rouvre pas après « Quitter ».
- **Véhicule orienté selon le cap** : `InAppNav` calcule le `bearing()` entre positions successives (si déplacement > 3 m) et passe `driverHeading` à `AdminGoogleMap` ; nouvelle prop `driverHeading` → génère un SVG voiture pivoté (`rotatedCarUrl`, 56×56, rotation autour du centre) quand pas d'icône custom. Visible dès que le véhicule bouge (non simulable en test GPS statique).
- **Tracé noir** : prop `routeColor` sur `AdminGoogleMap` (défaut bleu admin) ; `InAppNav` passe `#111111`.
- **✅ Validation visuelle réelle** : course test patchée temporairement en intra-Paris (Châtelet→Gare du Nord) puis RESTAURÉE. Screenshot confirme : **tracé NOIR** visible, **ETA-trafic** « 14 minutes · 3,4 km restants · trafic fluide », **instruction FR** « Prendre la direction nord-ouest sur Av. Victoria… · Dans 0,1 km », calque trafic actif, 0 erreur.

---


- **Demande user** : recalcul d'itinéraire auto quand le trafic dépasse un seuil (proposer une route alternative plus rapide) ; tracé de la route en NOIR ; voix en français.
- **Recalcul auto anti-bouchons** (`InAppNav.jsx`) : `DirectionsService` avec `provideRouteAlternatives: true` + `drivingOptions(trafficModel:'bestguess')` ; à chaque calcul (toutes les 30 s) on choisit la route la plus rapide par `duration_in_traffic`. Si une route différente est ≥ 60 s plus rapide que celle suivie → bascule + bandeau vert « Itinéraire recalculé — route plus rapide pour éviter les bouchons » (12 s) + annonce vocale FR « Nouvel itinéraire plus rapide pour éviter les bouchons ». testid `inapp-nav-reroute`.
- **Tracé noir** : `AdminGoogleMap` reçoit une prop `routeColor` (défaut `#3B82F6` pour l'admin) ; `InAppNav` passe `routeColor="#111111"` (noir, épaisseur 5). 
- **Voix FR garantie** : helper `speakFr()` sélectionne explicitement une voix `fr-*` de `speechSynthesis.getVoices()` (rechargée via `onvoiceschanged`), `lang='fr-FR'`. Les instructions Directions sont déjà en FR (loader `language:'fr'`, `region:'FR'`). Manœuvres + reroute annoncés via `speakFr`.
- Vérifié : nav s'ouvre, calque trafic OK, 0 erreur console. ⚠️ Tracé noir / ETA-trafic / reroute non démontrables visuellement en démo car la course test va de Paris (GPS navigateur) à Fort-de-France → pas d'itinéraire routier ; câblage en place et compile sans erreur.

---


- **Demande user** : lancer la nav interne AUTO au démarrage de la course + GPS de qualité, précis, qui signale les bouchons, avec le véhicule qui suit la carte.
- **Lancement auto** : `DriverRideFlow.applyStarted` fait `setShowNav(true)` → la nav interne (`InAppNav`) s'ouvre automatiquement quand la course démarre (in_progress), plus besoin d'appuyer sur la flèche.
- **GPS qualité (`InAppNav.jsx` réécrit)** : (a) **calque trafic live** (`showTraffic` → `<TrafficLayer/>`, routes colorées vert/jaune/rouge) + carte épurée (`cleanUI`) ; (b) **ETA temps réel avec trafic** via `drivingOptions:{departureTime, trafficModel:'bestguess'}` → `leg.duration_in_traffic` ; (c) **badge « Bouchons » rouge** + ETA en rouge si le retard trafic ≥ 2 min (`trafficDelaySec`), sous-texte « trafic fluide/dense » ; (d) **re-calcul d'itinéraire toutes les 30 s** depuis la position courante du chauffeur (ETA + manœuvres restent précis) ; (e) véhicule qui suit la carte (center=driverPos, zoom 18) ; voix FR virage-par-virage conservée ; boutons Google Maps + Waze + Quitter.
- Vérifié screenshot : calque trafic visible (routes colorées), suivi véhicule, 0 erreur console. ⚠️ ETA « — » en démo car le GPS navigateur du chauffeur de test est à Paris alors que la course démo va à Fort-de-France (Martinique) → pas d'itinéraire routier transatlantique ; le code ETA-trafic est correct dès que chauffeur+destination sont dans la même région.

---


- **Demande user** : (1) le GPS Google ne doit plus s'ouvrir/popper en auto — il doit être DANS le bouton navigation, et la nav Google intégrée à l'app comme GPS par défaut ; (2) objectif de gains JOURNALIER au-dessus du graphe ; (3) e-mail admin quand abus d'appels relais détecté.
- **(1) GPS interne** : l'app avait déjà `InAppNav.jsx` (carte qui suit le chauffeur zoom 18 + bandeau virage-par-virage Google Directions + voix FR `speechSynthesis` + ETA/distance + Waze) — c'EST le GPS interne. Problème = ouverture AUTO de Google Maps externe. Fix : supprimé l'effet `gpsPickupRef`/`openGoogleMapsNav` dans `DriverHome.js` (accept) + le bloc dans `DriverRideFlow.applyStarted` (start) + imports inutilisés. Commande vocale « naviguer » → ouvre désormais `InAppNav` (`onNavigate={() => setShowNav(true)}`) au lieu du Maps externe. Ajout bouton **« Google Maps »** dans `InAppNav` (prop `onGoogle`) à côté de Waze → Google reste accessible depuis le bouton nav. Vérifié screenshot (bandeau + carte suivi + boutons Google/Waze/Quitter). ⚠️ Pas de virage-par-virage vocal natif en PWA (limite web, OK user).
- **(2) Objectif journalier** : backend `drivers.py` breakdown renvoie `daily_goal` (champ `drivers.daily_goal`, défaut 100€ net) + nouveau `PUT /drivers/daily-goal`. Frontend `EarningsBreakdownModal.jsx` : carte objectif au-dessus du graphe (barre de progression `today.earnings/daily_goal`, %, « 🎉 atteint », objectif éditable inline ✏️). Vérifié curl (goal 150 persiste) + screenshot (0% · 0/150€).
- **(3) E-mail admin abus appels** : `routes/calls.py` `_maybe_alert_relay_abuse()` appelé après log d'un appel relais → si l'appelant atteint le seuil/jour (config `call_abuse.relay_per_day`), envoi `send_fraud_alert_email` (Resend) à `cfg.alert_email` ou `ADMIN_ALERT_EMAIL` ou `admin@superapp.com`. Dédoublonnage 1 alerte/appelant/jour via `call_abuse_alerts`. Best-effort (n'interrompt jamais l'appel). Vérifié unit (2→0, 4→1, dedup OK). ⚠️ **Resend en mode test** : ne délivre qu'à l'e-mail propriétaire du compte tant qu'un domaine n'est pas vérifié sur resend.com/domains (code OK, config prod à faire).

---


- **Demande user** : (a) harmoniser les revenus chauffeur sur le NET (après commission 15%) ; (b) mini-graphe « gains des 7 derniers jours » dans le modal « Mes revenus » ; (c) P2 alerte admin anti-abus appels relais (coûts Twilio) ; (d) re-vérifier vraie caution Stripe.
- **(a) NET** : `routes/drivers.py` `get_my_earnings_breakdown` applique désormais la commission (`commission_percent` depuis `service_configs/general`, défaut 15%) → `today/week/month` en NET, `is_net:true`. L'accueil lisant cette même source (cf. 530), accueil **et** modal affichent le net cohérent. Modal footer : « Revenus nets (après commission)… ». Vérifié curl (mois 76 brut → 64.60 net) + screenshot modal.
- **(b) Graphe 7 jours** : backend ajoute `daily_7d` (7 entrées {date, earnings net, trips} via agg `completed_at` substr jour). Frontend `EarningsBreakdownModal.jsx` : `recharts` BarChart (déjà en deps `^3.8.1`), labels jours FR (Lun..Dim), dernière barre orange foncé `#FF4500`, tooltip €. testid `earnings-7d-chart`. Vérifié screenshot (barres Ven 23.80 / Sam 40.80).
- **(c) Anti-abus appels relais** : `routes/calls_admin.py` — helper `_abuse_threshold()` (config `service_configs/call_abuse.relay_per_day`, défaut 10) + `_abuse_alerts()` (agg `masked_call_logs` channel=relay groupé par caller_id+jour, ≥ seuil). `GET /admin/calls` renvoie `abuse_threshold` + `alerts`. Nouveau `PUT /admin/calls/abuse-threshold` (admin). Frontend `AdminCallLogs.js` : panneau « Alertes anti-abus » (liste alertes rouge + input seuil + Enregistrer). `adminAPI.setCallAbuseThreshold`. testids `calls-abuse-panel`, `abuse-threshold-input`, `abuse-threshold-save`, `abuse-row-{i}`. Vérifié curl (seuil 3 → 1 alerte de 4 appels) + screenshot admin.
- **(d) Stripe vraie caution** : re-confirmé — `emergentintegrations/payments/stripe/` = `checkout.py` seulement (pas de PaymentIntent/capture manuelle) → **toujours bloqué**. Caution simulée SB Pay opérationnelle.

---


- **Demande user (preview)** : (1) bouton « Ajouter un véhicule » invisible/inopérant ; (2) incohérence revenus : accueil « 0€/0 course aujourd'hui » vs modal « Mes revenus » « 121€/1 course aujourd'hui ».
- **(1) Bug CSS bouton** : `index.css` définissait `--primary: #FF4500` (hex) dans un `:root` **non-layered** (l.8) ce qui **écrasait** le token shadcn `@layer base { --primary: 16 100% 50% }` (les déclarations hors-couche battent celles d'un `@layer`). Résultat : `bg-primary` = `hsl(#FF4500)` invalide → fond transparent + texte blanc = **tous les `<Button>` shadcn par défaut invisibles** (pas que les véhicules). Fix : supprimé `--primary` + `--secondary` du `:root` non-layered (shadcn HSL gagne), `.status-in_progress` repassé en littéral `#FF4500`. Vérifié : bouton « Ajouter » = `rgb(255,68,0)` + texte blanc + ajout véhicule E2E OK (toast « Véhicule ajouté »).
- **(2) Cohérence revenus** : accueil chauffeur appelait `/api/drivers/earnings` (filtre `created_at` + `estimated_fare` net) tandis que le modal appelle `/api/drivers/my-earnings-breakdown` (filtre `completed_at` + `final_fare` brut) → valeurs « du jour » divergentes. Fix : `DriverHome.js` utilise désormais `driverAPI.getEarningsBreakdown()` (`today.earnings`/`today.trips`) → **même source que le modal**, toujours cohérent. Nouvelle méthode `getEarningsBreakdown` dans `services/api/account.js`. NB : le « 121€ aujourd'hui » provient d'une course seedée avec `completed_at`=aujourd'hui (donnée démo réelle), désormais affichée identiquement des 2 côtés.

---


- **Demande user** : sur le tableau de bord chauffeur, les ronds entourés affichaient des valeurs incohérentes (« 42 » courses & « 11636 EUR » alors qu'aucune course n'a été faite aujourd'hui) ; + corriger les liens morts CGU/Confidentialité de l'app mobile (choix user : **WebView interne**).
- **(1) BUG stats « du jour »** : `DriverHome.js` passait `driver.earnings` / `driver.total_trips` (= **totaux à vie**) à `DriverStatsRow` dont les libellés disent « Gains du jour » / « Voyages d'aujourd'hui ». Fix : nouvel état `todayStats`, appel `driverAPI.getEarnings()` (endpoint `/api/drivers/earnings` renvoie déjà `today` + `today_trips`), passés au composant. Vérifié curl (jean.dupont : total=640/454 trips → today=0/0). 
- **(2) Cercles morts → cliquables** : `DriverStatsRow.jsx` — le cercle « Voyages d'aujourd'hui » (`onTrips` → `/chauffeur/history`) et « Moy. Évaluation » (`onRating` → `/chauffeur/reviews`) avaient `onClick` undefined (boutons disabled). Désormais cliquables (testIds `stat-trips-today`, `stat-rating`). Menu ≡ et « Gains du jour » (bouton i → détail revenus) étaient déjà fonctionnels.
- **(3) Liens morts mobile CGU/Confidentialité** : `mobile/src/screens/user/SettingsScreen.tsx` avait 2 `onPress={() => {}}`. Installé `react-native-webview@13.12.5` (`expo install`). Nouvel écran `LegalScreen.tsx` (WebView interne, HTML inline FR autonome hors-ligne — CGU + Politique de confidentialité RGPD génériques personnalisables) ; route `Legal` ajoutée dans `RootNavigator` ; boutons Réglages → `nav.navigate('Legal', {type:'terms'|'privacy'})`. testIds `legal-back`, `legal-webview`. NB autolinking Android OK (pas de re-prebuild nécessaire ; EAS gère). Bundle metro résolu (1301 modules) ; échec hermesc local = limitation conteneur (non bloquant pour EAS).

---


## NEW - 2026-06-14 (528) - 🧭 Audit On-Demand → marketplaces réels + 🔗 Open Graph circuits partagés
- **Demande user (backlog)** : (1) vérifier s'il reste des sous-verticales « On-Demand » à transformer en marketplaces ; (2) vignette Open Graph `/circuit/:token` ; (3) vraie caution Stripe (bloqué SDK).
- **(1) On-Demand — AUDIT** : le **seul** chemin non transactionnel restant était la page `/services` (`ServicesPage` → `ServiceListLayout`, mock « Demande envoyée ») et ses 3 tuiles accueil (Bricolage, Massage, Mécanique). Ces 3 verticales sont **déjà 100% couvertes** par les marketplaces transactionnels existants : **Métiers** (`trades` : catégories `bricolage`+`mecanique`) et **Beauté** (`beauty` : catégorie `corps`/massage). CarCare (`/car-care`) et Towing (`/towing`) routent déjà vers des flux réels (`ServiceBookingFlow` `/api/services/estimate`+`/bookings`, dispatch dépanneurs) → aucun changement.
  - **Fix** : tuiles accueil CMS (`home_categories`) redirigées (seed + DB live) → Bricolage `/services-metiers?category=bricolage`, Mécanique `/services-metiers?category=mecanique`, Massage `/beauty?category=corps`. `ProServiceMarketPage` lit désormais `?category=` (useSearchParams) pour pré-sélectionner la catégorie. Route `/services` → **redirige** vers `/services-metiers` (ancienne page accessible à `/services-old`). `SearchOverlay` : ~17 entrées « /services » re-routées vers les vraies pages (Métiers par catégorie, `/sante`, `/pharmacy`, `/video-consult`). → **On-Demand entièrement transactionnel.**
- **(2) Open Graph circuits** : nouvel endpoint **`GET /api/itineraries/share/{token}`** (HTMLResponse, public) servant des balises OG/Twitter **spécifiques au circuit** (titre, description = ville + N étapes, image = 1ʳᵉ photo d'étape ou repli SB Travel) aux robots sociaux (WhatsApp/FB/Twitter ne lisent pas le JS de la SPA), puis **redirige les vrais visiteurs** vers `/circuit/{token}` (refresh relatif → reste sur le domaine public). `og:url`/canonical construits depuis `x-forwarded-host`/`proto`. `MyItinerariesPage.shareUrl` pointe désormais sur ce lien backend.
- **(3) Stripe vraie caution** : confirmé — `emergentintegrations/payments/stripe/` ne contient que `checkout.py` (pas de PaymentIntent/manual capture) → **reste bloqué**. Caution simulée via wallet SB Pay opérationnelle.
- **Testé** : pytest `test_itineraries.py` **8/8** + curl OG (`og:title`/`description`/`image` corrects, `og:url` = domaine public, redirect relatif) + screenshot (`/services-metiers?category=bricolage` → chip bricolage pré-sélectionné + 4 prestations filtrées ; `/services` → redirige vers `/services-metiers`). ⚠️ Visible en prod après REDÉPLOIEMENT. ⚠️ OG dynamique testé via curl ; le rendu social réel dépend du cache des crawlers.

---

## NEW - 2026-06-14 (527) - ⚙️📲 Fenêtres de planification CONFIGURABLES (admin) + Rappel SMS automatique avant RDV
- **Demande user (approuvée)** : (1) rendre les fenêtres des courses programmées configurables côté admin ; (2) rappel SMS automatique 30 min avant le RDV (client + chauffeur). Choix user : rappel unique à 30 min, configurable.
- **(1) Fenêtres configurables** — `routes/config.py` `DEFAULT_SCHEDULING` + sanitize : nouvelles clés bornées `driver_start_window_min` (40), `anti_double_booking_min` (30), `driver_conflict_min` (45), `sms_reminder_enabled` (true), `sms_reminder_min` (30). Exposées via `/api/config/scheduling` (public) et `/api/admin/service-config/scheduling` (PUT admin). `routes/rides.py` : nouvel helper async `_scheduling_windows()` (repli sur les constantes) ; branchées dans `create_ride` (anti-double), `update_ride_status` (garde « arriving » = fenêtre démarrage), `_driver_schedule_conflict` (anti-conflit chauffeur), `_is_scheduled_pending_activation(ride, activation_min)` (+ param), `/rides/active/current`.
- **(2) Rappel SMS** — `routes/rides.py` : `run_scheduled_ride_reminders()` (testable, idempotent via flag `reminder_sms_sent`) + loop `scheduled_ride_reminder_loop()` (toutes les 60 s), enregistré dans `core/startup.py`. Envoie via Twilio (`core/sms.py`) au client (`book_for_phone`/`users.phone`) et au chauffeur (si accepté) ~`sms_reminder_min` min avant le RDV. No-op propre si désactivé/Twilio off (ne pose pas le flag si Twilio off → réessai).
- **Frontend** : `pages/admin/AdminScheduling.js` — 2 nouvelles sections « Fenêtres de réservation » (3 inputs) + « Rappel SMS automatique » (toggle + délai). data-testids : `scheduling-driver-start-window-input`, `scheduling-anti-double-input`, `scheduling-driver-conflict-input`, `scheduling-sms-toggle`, `scheduling-sms-reminder-min-input`.
- **Testé** : pytest `test_iter_scheduled_reminders.py` **3/3** (clamp config, no-op désactivé, envoi client+chauffeur + idempotence + hors-fenêtre ignoré) + non-régression `test_iter414_scheduled_rides.py` + `test_iter95` **12/12** + cashback/access **15/15** + curl round-trip admin (PUT 50/20/60/45 → re-GET OK, restore) + screenshot admin (toutes sections rendues). ⚠️ Visible en prod après REDÉPLOIEMENT. ⚠️ Livraison SMS réelle nécessite Twilio actif (déjà configuré).

---

## NEW - 2026-06-14 (526) - ⏱️ Fenêtre de démarrage des réservations basée sur l'HEURE DU RDV (40 min), pas l'heure de commande
- **Question/anomalie user** : « le temps de démarrage est-il pris en fonction de l'heure de la commande ? » → RDV 15h00 doit être démarrable à 14h20 (40 min avant), pas en fonction de l'heure de réservation (midi).
- **Bug trouvé** : côté chauffeur `DriverBookingsPage.js`, le bouton « Démarrable dans X min » était calculé sur `accepted_at + start_delay_minutes (20min)` (= heure d'acceptation/commande) → pour un RDV 15h accepté à 12h05, il disait « démarrable à 12h25 ». Absurde.
- **Correctif** :
  - Constante `SCHEDULED_ACTIVATION_MIN` 45 → **40** (calculée sur `scheduled_at`) ; (527) désormais admin-configurable via `driver_start_window_min`.
  - Backend `update_ride_status` : garde « arriving » dans les 40 min précédant le RDV (HTTP 400 sinon). Admins non bloqués.
  - Frontend chauffeur : fenêtre de démarrage = `scheduled_at − 40 min`, label « Démarrable à HH:MM », bouton « Relâcher » dispo tant que non démarrée.

---

## Architecture & contexte (résumé pour fork)
- **App** : super-app multi-services FR (SB Drive VTC + verticales). FastAPI + React + MongoDB. Langue UI : **FRANÇAIS uniquement**.
- **Déploiement** : prod sur `gojek-mvp-1.emergent.host`. Le preview ≠ prod → changements visibles après REDÉPLOIEMENT.
- **Verticales transactionnelles complètes & testées** : Taxi/VTC (planification, pool, enchères, intercity, aéroport), Food, Coursier/Colis, Marketplace/Immobilier/Véhicules, Location voiture/moto (caution Stripe), Hôtels (caution SB Pay), Vols, Évènements, **Beauté** (`/beauty`), **Métiers** (`/services-metiers`), **Médical** (Phase 3a RDV `/sante`, 3b ordonnances, 3c labo `/analyses`, 3d urgences/ambulance `/urgences`), Dépannage (KYC+commission), Animaux (+carnet santé), Auto Pièces (+Mon Garage), Assistant vocal exécutable, Itinéraires touristiques partageables.
- **Moteur pro_services générique** (`routes/pro_services.py`) : verticales beauty/trades/medical/lab — KYC admin + commission 15% + espace pro + booking SB Pay/espèces.
- **Intégrations** : Twilio (SMS, actif), Emergent LLM Key (OpenAI/Gemini + Whisper STT), Resend (emails), Stripe (Checkout only), Google Maps. Stripe Auth/Capture (vraie caution) BLOQUÉ par wrapper → caution simulée via SB Pay wallet.
- **Loops de fond** (`core/startup.py`) : auto_dispatch, weekly_report, order_auto_progress, demand_automation, flight_watch, cashback_monthly, grouping, student_digest, access_recurring, sequential_dispatch, report_schedule, flight_hold, carpool_autorelease, debt_reminder, no_movement, pro_booking_reminder, pet_health_reminder, pro_expiry_reminder, **scheduled_ride_reminder (NEW 527)**.
- **PWA** : `public/sw.js` v2 + auto-reload `index.html` (anti bundle obsolète).

## Comptes de test (voir /app/memory/test_credentials.md)
- Admin : admin@superapp.com / SuperAdmin123!
- Client : famtester@demo.sb / FamTest123! · freeuser@demo.sb (multi-rôle pro/labo/ambulancier validé)
- Chauffeur : jean.dupont@demo.sb / Driver123!

## Journal des modifications (fork courant — juin 2026)
- **Fix build EAS Android (JitPack 403 CanHub cropper)** : `expo-image-picker` (SDK 52 → v16.x) dépend de `com.github.CanHub:Android-Image-Cropper` (JitPack, renvoie 403). Plugin de config Expo `mobile/plugins/withImageCropperFix.js` (via `withProjectBuildGradle`) qui substitue cette dépendance par `com.vanniktech:android-image-cropper:4.7.0` (Maven Central) — même package `com.canhub.cropper.*`, donc compatible toutes versions. Enregistré dans `app.config.js` (s'applique aussi sur EAS prebuild) + injecté dans `mobile/android/build.gradle`. Plus aucune dépendance JitPack. Aussi : généré `mobile/android/` (projet Gradle complet) via prebuild + guides `OUVRIR_DANS_ANDROID_STUDIO.md` / `android_fixes/⚠️_LIRE...md`.
- **App mobile Expo → APK séparés par rôle** : config dynamique `mobile/app.config.js` (variantes client/chauffeur/marchand → noms + packages Android distincts : `com.sbdrive.vtc/.driver/.merchant`), `mobile/eas.json` (3 profils APK, backend prod + clé Google Maps), helper `utils/appVariant.ts`. Espace **Marchand** complété : `MerchantHomeScreen` (stats réelles `/merchants/me/stats` + ouvert/fermé via `/me/availability`), `MerchantOrdersScreen` (commandes : accepter→préparation→prête→remise/refuser via `/orders/{id}/status`), `MerchantMenuScreen` (produits : ajout + dispo/rupture). Nav `RootNavigator` : onglets marchand Dashboard/Commandes/Menu/Profil. Validé : `expo export` OK (1294 modules bundlés). Guide `mobile/BUILD_APK.md`. NB : APK généré via `eas build` (cloud Expo) — pas compilable dans le conteneur. Les apps natives V3Cube (`android_fixes`) sont externes, non présentes ici.
- **Refactor qualité (revue de code)** : conversion du barrel `from routes.admin._common import *` → imports explicites dans les 11 fichiers admin (`users, settings, drivers, analytics, vehicle_types, rewards, monitoring, merchants, driver_categories, onboarding, imports`). Supprime les warnings « wildcard imports » + artefacts « 86 variables non définies » (pyflakes : 11→0 « unable to detect »). Vérifié : 0 F821, endpoints admin 200, aucun NameError. NB : reste du rapport de revue = faux positifs documentés (eval/exec = motifs du scanner `code_audit.py` ; `secrets` déjà utilisé partout ; `is` en prod = commentaires).
- **Contrôle vocal mains-libres chauffeur** (`DriverVoiceControl.jsx`) : bouton micro sur l'écran de course active (off par défaut). Écoute continue FR + retour TTS. Commandes : « Navigation/GPS » → Google Maps ; « Appeler » → appel client ; « Arrivé » → confirme arrivée ; « Démarrer » → démarre la course ; « Annuler/Stop » → coupe le mode vocal (n'annule PAS la course). Anti-rebond + auto-restart + permission micro. Handler `beginStart` extrait dans `DriverRideFlow`.
- **TTS assistant vocal** : l'assistant lit le récapitulatif à voix haute dans la langue de l'utilisateur (Web Speech `speechSynthesis`, gratuit/hors-ligne). Toggle haut-parleur (mémorisé `sb_voice_tts`). `VoiceAssistant.js`.
- **GPS Google auto fiabilisé** : repli « 1 tap » (toast action « Ouvrir Maps ») si l'ouverture auto est bloquée par le navigateur mobile. `lib/driverNav.js` (`openGoogleMapsNav` → {ok,reason,url}).
- **GPS Google automatique chauffeur** : acceptation → Maps vers prise en charge ; démarrage → Maps vers destination.
- **Assistant vocal multilingue (FR + EN, IT, ES, PT, DE)** : suit la langue de l'app (Web Speech + Whisper `language` + prompt IA multilingue `routes/voice.py`). Réserve un taxi **de bout en bout** (récap → confirm → création course). Testé E2E.
- **Écran d'appel redesigné** (Bolt/Uber) + **Twilio prod vérifié** + **Journal des appels admin** (`/admin/call-logs`, `masked_call_logs`).
- **Pré-déploiement** : aucun blocage (warn N+1 préexistant `admin/drivers.py`, hors scope).

## Backlog / Prochaines tâches
- **P1** : vérifier s'il reste des sous-verticales « On-Demand » à transformer en marketplaces transactionnels (Beauté/Métiers/Santé déjà complets). Admin « Onboarding partenaires » (clés API Uber/Yango/Bolt côté transport).
- **P3** : vignette Open Graph page publique `/circuit/:token` (acquisition organique SB Travel) ; surveiller complexité `routes/rides.py` (~2640 l.) si ajout de cron.
- **Bloqué** : vraie caution Stripe (Auth/Capture) — limitation SDK emergentintegrations.

## Journal des modifications (fork courant — juin 2026)
- **Écran d'appel in-app redesigné** (`CallContext.jsx`) : style Bolt/Uber (fond sombre, avatar rond initiale + pastille téléphone, halo animé, boutons ronds animés). Texte « Appel masqué — numéro protégé » retiré → icône bouclier verte seule.
- **Twilio production vérifié** : compte `active` (Full), SID/token valides, numéro `+16153345871` (voice+sms), solde ~11 USD. Relais masqué opérationnel. ⚠️ Numéro US → vérifier tarifs/délivrabilité FR ; activer recharge auto.
- **Journal des appels admin (P2 — FAIT)** : collection dédiée `masked_call_logs` (≠ `call_logs` de moderation). Logging dans `routes/calls.py` (initiate/connected/failed/relay + nouveau endpoint `ended` avec durée). Endpoint `GET /api/admin/calls` (`routes/calls_admin.py`) : KPIs (total, WebRTC, relais, aboutis, manqués, durée moy., taux réponse) + filtres canal/statut/recherche. Page admin `/admin/call-logs` (`AdminCallLogs.js`) sous menu Rapports. Test : `tests/test_iter_call_logs.py` (PASS).
