# 🔜 BACKLOG PRIORITAIRE (validé avec user, 2026-06-09)

## Lot 1 — restant
- ~~**C. Audit boutons retour** (client + chauffeur)~~ ✅ **FAIT (2026-06-10)** : audit complet. La majorité des sous-pages étaient déjà couvertes (`ServiceListLayout` a déjà un retour). Ajout des retours manquants sur `DriverEarningsPage`, `DriverHistoryPage` et `RideReceiptPage` (tous `navigate(-1)`).

## Lot 2 — Notifications push PWA (VALIDÉ "2b oui") — EN COURS
- Notifs système + son à l'arrivée d'une course/commande **même app en arrière-plan / autre onglet / autre site**.
- Implémentation : Web Push (service worker + Push API + VAPID), envoi backend. Limite iPhone : nécessite « Ajouter à l'écran d'accueil » (PWA installée) + autorisation notifications.

### ✅ Phase 1 — Socle Push (FAIT 2026-06-10, testé)
- Backend : clés VAPID (env), `core/webpush.py` (pywebpush, purge 404/410), `routes/push_web.py` :
  GET `/api/push/vapid-public-key`, POST `/api/push/subscribe|unsubscribe|test`, GET `/api/push/settings`.
- Web Push branché dans `core/notifications.create_notification` → **tous** les events existants envoient déjà un push.
- Admin réglages : `GET/PUT /api/admin/notifications/settings` (distance 200m, enchaînement temps/distance, textes) + page `AdminNotifSettings` (/admin/notif-settings).
- Frontend : `src/lib/webpush.js` (permission + subscribe + persist), auto-subscribe après login (AuthContext). SW `sw.js` a déjà push + notificationclick.
- Tests : `backend/tests/test_webpush_phase1.py` (3 passent).

### ✅ Phase 2 — Événements + Son (FAIT 2026-06-10)
- Push ciblés branchés : **course entrante** → chauffeurs en ligne à proximité (`_push_new_ride_to_drivers`, fire-and-forget) ; **réservation planifiée** → chauffeurs ; **acceptation** → client (déjà via create_notification) ; **cycle de vie** (arrivé/démarré/terminé) → client dans `update_ride_status` ; **messages** course (`phase1.py`) + livraison/transport (`chat.py`) → destinataire.
- **Son in-app centralisé** : `hooks/useWebSocket.js` joue `playAlert()` sur les types `ride_status_update` (arriving/in_progress/completed), `new_message`, `notification`, `scheduled_reservation`, `driver_nearby`. (Course entrante chauffeur = siren déjà existante.)
- **Icônes PWA** régénérées avec le logo SB (`icons/icon-{192,512}{,-maskable}.png`, `apple-touch-icon.png`, `favicon.png`) → l'app installée affiche le SB sur l'écran d'accueil.
- ⚠️ Le son d'**arrière-plan** reste le son système (limite Web Push). Le son custom joue en **foreground**. Livraison push réelle = à vérifier sur device (abonnement navigateur requis).

### ✅ Phase 3 — Proximité & Arrivée (FAIT 2026-06-10)
- **Proximité "Votre chauffeur arrive"** : `core/proximity.py` notifie le client une seule fois (flag `nearby_notified` atomique) quand le chauffeur entre dans le rayon admin (200m) en route vers le pickup. Branché sur le stream WS (`ws_endpoint`) ET le REST `/drivers/location`. Validé (loin→0, près→1, répétition→1).
- **Bug corrigé** : le forward de position chauffeur interrogeait `rides.driver_id` avec le `user_id` (alors que `driver_id` = `drivers.id`) → la position n'atteignait jamais le passager. Résolu via lookup `drivers` par `user_id`.
- **Modale d'arrivée chauffeur** : si le chauffeur glisse "Arrivé" à >200m du pickup, modale "Vous n'êtes pas encore à l'adresse… êtes-vous sûr ?" (le client peut s'être trompé d'adresse), avec override. (`DriverRideFlow.jsx`, mirror du finish-confirm existant.)
- **Bandeau opt-in** : `EnableNotificationsBanner` (monté global) propose "Activez les notifications" aux users connectés (permission `default`), dismissible.
- Notifs cycle de vie (arrivé/démarré/terminé) déjà en Phase 2.

### ✅ Phase 4 — Flag flottant + Enchaînement + No-back actif (FAIT 2026-06-10)
- **Flag flottant SB** : `ActiveRideFlag.jsx` (monté global) — bulle ronde avec logo SB transparent + anneau pulsant, visible quand une course est active (client + chauffeur) et qu'on n'est pas sur l'écran de course. Tap → retour à la course (`/ride/:id` client, `/chauffeur/home` chauffeur). Source : `/api/rides/active/current` (poll 15s + sur changement de route).
- **Enchaînement** : DÉJÀ implémenté via `next_job` (offre la course suivante près du dropoff, gating distance via `next_job_lead_minutes`). Admin dédié : `/api/config/next-job/admin` (switch global + délai + overrides par zone). Section "enchaînement" retirée du panneau Notifications pour éviter un doublon.
- **No-back pendant course active** : déjà satisfait — écrans de course active sans bouton retour (client `RideTrackingPage` : retour seulement en phase recherche/annulée ; chauffeur `DriverRideFlow` : seulement "minimiser"). Le flag fournit le retour.

### ✅ Aucun chauffeur en ligne → blocage instantané + planifier (FAIT 2026-06-10)
- Backend `create_ride` : course **instantanée** (standard + bidding) refusée si `count(drivers approved & is_online)==0` → `409 {code:"no_drivers_available", message, can_schedule:true}`. Les courses planifiées ne sont pas bloquées. Validé (0 en ligne→409, restauration OK).
- Frontend : `RideChoosePage` → modale "Aucun chauffeur disponible" avec bouton **Planifier** (ouvre le calendrier). `TaxiBiddingPage` (proposition de prix) + `RideTrackingPage` (relance) → toast avec le message. Extraction du `detail` objet gérée partout.
- **"Me prévenir" (FAIT 2026-06-10)** : bouton dans la modale → `POST /api/rides/availability-alert` (stocke pickup, 1 alerte/user). Quand un chauffeur passe en ligne (`/drivers/toggle-online`), `core/availability.notify_waiting_clients` notifie (push) les clients en attente dans un rayon de 15 km (TTL 2 h, alerte consommée). Validé de bout en bout.
- **Dashboard admin — clients en attente par zone (FAIT 2026-06-10)** : `GET /api/admin/notifications/waiting-clients` (admin) → total + breakdown par zone (matching pickup→zone par centre+radius_km) + hors-zone. Carte `WaitingClientsPanel` sur `AdminDashboard` (refresh 30 s). Validé (2 PAP / 1 hors-zone).
- **Push ciblé par zone (FAIT 2026-06-10)** : clic sur une zone → `POST /api/admin/notifications/notify-zone-drivers {zone_id}` → push "📈 Forte demande à {zone}" aux chauffeurs approuvés hors-ligne situés dans la zone. Validé (1 notifié, mauvaise zone→404).
- **Agent demande automatique + historique (FAIT 2026-06-10)** : boucle de fond `core/availability.demand_automation_loop` (toutes les 5 min, enregistrée dans `startup.py`) — analyse les clients en attente par zone et notifie auto les chauffeurs hors-ligne, avec **cooldown anti-spam par zone**. Historique persistant (`zone_demand_pushes`) affiché dans la carte dashboard (🤖 + "il y a X"). Réglages admin : `auto_demand_alerts`, `demand_cooldown_min` (30), `demand_min_waiting` (1).
- **KPI efficacité agent (FAIT 2026-06-10)** : chaque relance crée un événement (`demand_push_events` : notified_ids, converted_ids). Quand un chauffeur repasse en ligne (`/drivers/toggle-online`), `record_driver_back_online` marque une conversion s'il avait été relancé dans les 10 min. `GET /api/admin/notifications/demand-kpi` (24 h) → {pushes, notified, converted, conversion_rate}. Bande KPI sur la carte dashboard. Validé bout en bout (0%→100% après mise en ligne).

## ✅ Lot 2 (Notifications Push) — COMPLET (Phases 1→4)

### ✅ Demande entrante chauffeur — UI + bug "bloqué" (FAIT 2026-06-10)
- **Bug corrigé (cause racine)** : dans `IncomingRequestSheet`, le `useEffect` du compte à rebours dépendait de `onDecline` (fonction inline passée par `DriverHome` → nouvelle identité à chaque render). Le timer se réinitialisait en boucle → n'atteignait jamais 0 → la demande + la sirène restaient **bloquées** à l'écran. Fix : `onDecline` mis dans un `ref`, deps stables `[offerPending, windowSeconds, request.id]` → auto-rejet à la fin de la fenêtre.
- **Annulation client** : `DriverHome` poll la course toutes les 3 s tant que la demande est affichée ; si le statut n'est plus `pending` (client annule / expire / prise par un autre) → fermeture auto + arrêt sirène.
- **UI** : grand cercle de compte à rebours descendu (`pt-12`→`pt-28`) dans l'espace libre pour ne plus masquer les infos ; retrait du fond rond transparent (`bg-black/35 backdrop-blur`) → seul le cercle vert qui tourne + minuteur restent.

### ✅ Badge notifications non lues (FAIT 2026-06-10)
- Backend : `GET /api/push/unread-count`, `GET /api/push/list`, `POST /api/push/read-all` (génériques, `get_current_user`). Flux validé (count 2 → list 2 → read-all → count 0).
- Client : badge rouge `unread-badge` sur le bouton menu de `UserHome` (poll 30s + refetch au focus, animation `bounce` à l'arrivée). Vraie **boîte de réception** dans l'onglet Notifications (`ProfileTabView` → `/profile?tab=notifications`) : liste des notifs reçues + **marquage auto en "lu" à l'ouverture**, au-dessus des préférences.
- Chauffeur : badge cloche déjà existant + **marquage auto en "lu" à l'ouverture** de `DriverNotificationsPage`.

## Lot 3 — Refonte modules (specs détaillées fournies par user)

### ✈️ Module "Airport Transfer" (service premium) — ✅ LIVRÉ (2026-06-10, testé iter222 — backend 6/6, FE ~100%)
- ✅ Réservation immédiate ou planifiée via `/course?mode=airport` (panneau enrichi : sélection aéroport admin, n° vol, terminal, heure d'arrivée, aide bagages + nb, navette partagée, note "45 min offertes").
- ✅ **Flight Watch RÉEL via AviationStack** (clé user, 2026-06-10) : `core/airport.fetch_aviationstack`/`get_flight_status` (cache 10 min + backoff 5 min pour économiser le quota gratuit 100 req/mois) avec **fallback automatique** vers la simulation déterministe si API indisponible/quota/vol introuvable. Booking non bloquant (seed simulé instantané + refresh réel en tâche de fond). Ajuste `scheduled_at` (retard/avance) + notifie client & chauffeur. Endpoint manuel `POST /api/phase2/rides/{id}/flight-refresh`. (`AVIATIONSTACK_API_KEY` dans backend/.env)
- ✅ Aéroports **gérés par admin** : CRUD `airport_zones` étendu (meeting_point, free_wait_minutes, luggage_fee, shuttle_discount_pct, waiting_rate_per_min) + page admin dédiée `/admin/airport` (KPIs + onglets Réservations / Aéroports). Directory public `GET /api/phase2/airports`.
- ✅ **Attente gratuite 45 min** (config par aéroport) : `DriverRideFlow` `freeWaitSec = free_wait_minutes*60` → facturation au tarif standard au-delà (via extra_charges.waiting du flux de complétion). Chrono visible client + chauffeur.
- ✅ **Aide & supplément bagages** (luggage_fee) + **navette partagée** (shuttle_discount_pct) appliqués au tarif à la création.
- ✅ **Alerte admin** sur chaque réservation aéroport (`notify_admins`) + **notifs client/chauffeur** sur changement de vol.
- ✅ Affichage chauffeur : badge ✈️ + n° vol + terminal + point de RDV + statut vol (`driver-airport-info`). Affichage client : `FlightWatchBanner` (suivi + état recherche + tracking) + chip vol sur `/scheduled-rides`.
- ⏳ NON fait (backlog) : attribution prioritaire chauffeurs certifiés (user a choisi "tous éligibles"), ~~accueil pancarte VIP~~ ✅ **PANCARTE VIP LIVRÉE (2026-06-11, testé iter234 — backend 4/4, frontend 100%)** : bouton « Pancarte VIP — accueil client » dans la carte aéroport chauffeur (`DriverRideFlow.jsx`, phases accepted/arriving) → écran plein écran fort contraste (`AirportVipSign.jsx`) avec logo SB + message d'accueil personnalisable + nom du client (via `passenger_name` déjà exposé par `enrich_passenger_info`) + sous-titre vol/terminal, tous **éditables** (bouton Modifier), auto-rotation paysage. Test : `backend/tests/test_airport_vip_passenger_name.py`.

### 🕒 Module "Mise à disposition" (réserver un chauffeur+véhicule pour une durée) — ✅ LIVRÉ (2026-06-10, testé iter223)
- ✅ Forfaits horaires 2h/4h/8h + **Journée 10h/100km** (configurables admin) avec tarifs de dépassement (heure sup + km sup).
- ✅ **Arrêts multiples** (au booking + en direct pendant la course via le chauffeur).
- ✅ **Compteur de facturation temps réel** : chauffeur démarre/termine (saisie km final), chrono live + dépassement projeté ; client suit en lecture seule. Facture finale = forfait + dépassement temps/km.
- ✅ Flux chauffeur dédié `RentalDriverFlow` ; bannière client `RentalMeterBanner`. Pas d'écran admin (choix user MVP).
- Durées : 2h / 4h / 8h / journée / plusieurs jours. Client choisit date, heure début, durée, type véhicule, nb passagers.
- **Tarification forfaitaire** (ex. 2h=60€, 4h=110€, 8h=200€, journée=350€) + **km inclus** + **dépassement km/temps facturé**.
- **Chauffeur dédié** : reste dispo, attend, multi-arrêts. **Itinéraire flexible** (modif destination/arrêts depuis l'app).
- **Dashboard temps réel** : temps restant, km parcourus, coût estimé, coût supplémentaire. Vue chauffeur : début mission, temps restant, arrêts, historique.
- **Option Business** : abonnement entreprise, facturation centralisée, multi-utilisateurs, compte société.
- **Option Luxe** : berline premium, van VIP, chauffeur bilingue, eau/Wi-Fi à bord.
- Note : paniers bien plus élevés qu'une course classique → cible entreprises/hôtels/haut de gamme.

### Pop-up "aucun chauffeur" — fait ✅ (Réessayer + Augmenter tarif + Planifier)

---


# 🗺️ Roadmap — SB Marketplace Locale (12 modules)

Stack cible : **React + FastAPI + MongoDB** (pas Flutter/Laravel — adaptation à l'existant, zéro réécriture).
LLM via **Emergent LLM Key** (OpenAI/Claude/Gemini) pour les modules IA.
Légende effort : S (≤1j) · M (2–4j) · L (≥1 semaine).

---

## 📊 Vue d'ensemble — existant vs à faire

| # | Module | État actuel | Briques existantes |
|---|--------|-------------|--------------------|
| 1 | Marketplace Locale | 🟡 Partiel | `marketplace.py`, `merchants.py`, `store_categories.py`, `MarketplacePage`, `nearby_businesses`, `pharmacy`, `real_estate` |
| 2 | Carte interactive temps réel | 🟠 À construire | `NearbyBusinessPage`, `geo.py`, `zones.py` (heatmap dispatch existe) |
| 3 | Livraison instantanée | 🟡 Partiel | `parcels.py`, `orders.py`, `auto_dispatch.py`, `DeliveryTrackingPage` |
| 4 | IA Shopping Assistant | 🟠 À construire | `voice.py`, `chat.py`, LiveChat (infra LLM en place) |
| 5 | Achats groupés intelligents | 🔴 Nouveau | — |
| 6 | SB Neighbour (C2C) | 🟡 Partiel | `marketplace_listings` (vente/location), `PostVehiclePage`, `SellGalleryPage` |
| 7 | Marketplace Services | 🟢 Quasi fait | `services.py`, `ServiceProvidersPage`, `ondemand_categories` |
| 8 | Wallet SB Pay | 🟢 Quasi fait | `wallet.py`, `payments.py`, `coupons.py`, `WalletPage` |
| 9 | Programme Fidélité SB Rewards | 🟢 Quasi fait | `loyalty.py`, `LoyaltyPage`, `referral.py` |
| 10 | IA Business commerçants | 🟠 À construire | `weekly_reports.py`, `finance.py`, stats marchands partielles |
| 11 | Réseau social commerce | 🟠 À construire | `news.py`, `NewsFeedPage` |
| 12 | Offres flash géolocalisées | 🟡 Partiel | `auto_promotions.py`, `coupons.py`, `promo_banners` (surfaces+billing déjà faits) |

---

## 🔴 P0 — Boucle commerce de base (valeur immédiate, s'appuie sur l'existant)

### P0.1 — Vitrine digitale marchand complète (Module 1) · **M**
Compléter chaque boutique : logo, bannière, galerie photos, description, **catalogue produits + stock**, horaires d'ouverture, avis clients, mini-stats.
- Backend : étendre `merchants`/`marketplace_listings` (champs storefront, gestion stock, horaires).
- Front : page boutique publique + back-office marchand (catalogue, stock, horaires, promos).
- Catégories structurées : Épiceries, Boulangeries, Pharmacies, Fleuristes, Boucheries, Poissonneries, Supermarchés, Commerces indépendants, Producteurs locaux.

### P0.2 — Livraison Marketplace ↔ réseau SB Drive (Module 3) · **M**
Connecter les commandes marketplace au dispatch coursier + suivi temps réel.
- Options : Express / Standard / Programmée / Prioritaire.
- Réutilise `auto_dispatch.py`, `parcels.py`, tracking WebSocket existant.
- (Déjà au backlog P3 initial — remonté en P0 car cœur de la Super App.)

### P0.3 — Checkout unifié SB Pay (Module 8) · **S/M** — ✅ LIVRÉ (2026-06-10, testé iter224)
Paiement marketplace/VTC/livraison via le wallet + cashback + application coupons à la commande.
- Réutilise `wallet.py`, `payments.py` (Stripe test mappé), `coupons.py`.
- Ajouts : cashback à la commande, historique unifié.
- ✅ **UNIFICATION** : `db.wallets` est désormais LE portefeuille unique « SB Pay ». Les soldes `db.sbpaygo_wallets` ont été migrés (`app_migrations.sbpay_unified_v1`). `/finance` redirige vers `/wallet`. Page unique « SB Pay » (`WalletPage.js`).
- ✅ **Recharge réelle Stripe** : montants fixes 10/20/50/100 € + **montant libre** (validé serveur 1–5000 €) via `POST /api/payments/checkout` (package_id OU custom_amount). Recharge simulée (`/finance/sbpaygo/topup`) désactivée (400).
- ✅ **P2P « Envoyer de l'argent »** + **pay-ride** rebranchés sur `db.wallets`. Pharmacy/Real-Estate `payment-methods` exposent un seul « SB Pay ».
- ⏳ Backlog : cashback automatique à la commande, libellés docstrings backend « SB PayGo »→« SB Pay » (cosmétique).

### P0.5 — Cashback mensuel + Réserve portefeuille & Zones · ✅ LIVRÉ (2026-06-10, testé iter226 — 10/10)
**Phase A — Cashback mensuel** : `GET /api/finance/cashback/summary` (this_month/all_time), compteur sur `/wallet`, boucle `cashback_monthly_loop` (notification récap mensuelle idempotente via `db.cashback_monthly`).
**Phase B — Réserve & Région** (`core/wallet_reserve.py`) :
- Réserve non-retirable **offerte à l'activation** + plancher permanent : chauffeur **50 € (Europe/DOM-TOM) / 2 € (Afrique)**, marchand **1 €**. Crédit idempotent (`wallets.reserve_credited`).
- **Région** dérivée du pays (Afrique vs Europe/DOM-TOM) + override admin (`PUT /api/admin/users/{id}/region`).
- `GET /api/wallet` renvoie `reserve / withdrawable / can_withdraw / pending_withdraw`.
- Retrait : **clients bloqués (403)**, chauffeurs/marchands seulement, jamais sous le plancher, gel du montant en `pending_withdraw`.
- Admin : `GET/PUT /api/admin/wallet-reserve-config` + carte « Réserve portefeuille SB Pay » dans `/admin/payment-methods`.

### P0.6 — Retraits + KYC paiement (Phase C1) · ✅ LIVRÉ (2026-06-10, testé iter227 — 17/17)
- **Moyens de retrait** (`routes/payouts.py`, `core/face_match.py`) : **RIB** (Europe/DOM-TOM, IBAN+BIC, titulaire personne/société) ou **Mobile Money** (Afrique : Orange/MTN/Wave/SBPAYGO/Moov), avec **selfie + pièce d'identité**.
- **Face-match IA automatique** (gpt-4o via clé Emergent) à la soumission → assiste l'admin ; ne lève jamais d'erreur (dégrade en « uncertain »). **Validation admin obligatoire** avant tout retrait.
- **Demande de retrait** gâtée : moyen approuvé + conforme à la zone requis ; montant gelé en suspens.
- **Validation admin** avec **score chauffeur** (note, acceptation, annulation, courses, réclamations), **ajustement du montant** (remboursement de la différence), approuver/refuser/marquer payé.
- **Alerte admin temps réel** à chaque nouvelle demande (notification + score).
- Front : page user `PayoutMethodPage` (selfie/CNI), modal de retrait sur `/wallet`, admin `AdminPayouts` (2 onglets : demandes + KYC) sur `/admin/withdraw-requests` & `/admin/payout-methods`.

### P0.6b — Retraits avancés (Phase C2) · ✅ LIVRÉ (2026-06-10, testé iter228 — 12/12)
- **Délais (SLA) éditables admin** par zone/rôle (`withdrawal_sla_config`) : EU/DOM-TOM chauffeur 24h/marchand 48h ; Afrique chauffeur 12h/marchand 24h. Carte « Délais de versement » dans `/admin/payment-methods`.
- **Délai estimé affiché** dans la modale de retrait (« Versement estimé sous ~Xh »).
- **Retrait express 12h** (EU/DOM-TOM) avec **frais éditables (1 €) déduits du montant** (demande 30 € → reçoit 29 €). Dégradation gracieuse hors zone.
- **Jumelage** de deux comptes (client+marchand) : demande par e-mail/téléphone + confirmation des deux côtés, transfert facilité. Page `/wallet/linked-accounts`.
- ✅ **Versements réels Mobile Money LIVRÉS** (2026-06-10, pytest 10/10 + frontend iter231) — `core/mobile_money.py` :
  - Clients **Wave** (`POST /v1/payout` + signature HMAC + idempotency-key), **MTN MoMo Disbursement** (token + `transfer` 202 async + status), **Orange Money** (OAuth + transfers — *en attente d'activation du produit B2C par Orange*). Conversion EUR→XOF au taux fixe **655,957**.
  - **Modèle de sécurité** : `mode=sandbox` (par défaut) → versements **SIMULÉS** (aucun argent réel, flux/UI testables) ; `mode=live` → appels réels **uniquement si `live_enabled=true`** (double confirmation). Config DB `payout_provider_config`, endpoints admin `GET/PUT /api/payouts/admin/payout-config`.
  - Flux admin : `POST /api/payouts/admin/withdrawals/{id}/send` (versement auto Mobile Money, idempotent) + `/refresh-status` (MTN async). Le RIB garde « Marquer versé » manuel. UI : bannière mode + toggle + puces de disponibilité prestataires dans `AdminPayouts`.
  - Identifiants dans `.env` (jamais en dur). **Blockers avant le live** : (1) **clé Wave complète** (celle fournie était tronquée → `WAVE_API_KEY` vide) ; (2) MTN : confirmer la **clé d'abonnement *Disbursement*** + **whitelist IP** serveur côté MTN ; (3) Orange : **activation produit B2C/disbursement** (clés fournies = Web Payment/encaissement). Tests : `backend/tests/test_mobile_money_payout.py`.

  - **Pré-vérification du bénéficiaire** (sécurité avant argent réel) : bouton admin « Vérifier le bénéficiaire » → `POST /api/payouts/admin/withdrawals/{id}/verify-recipient`. Wave `POST /v1/verify_recipient/` (renvoie `name_match` MATCH/NO_MATCH/NAME_NOT_KNOWN + `within_limits` — Wave ne divulgue pas le nom) ; MTN `accountholder/.../active`. Sandbox simulé. Verdict ok/warning/info affiché en ligne dans `AdminPayouts`.
  - **Garde-fou actif (auto-vérification avant envoi)** : `preflight_verify()` — en **mode live**, chaque envoi lance d'abord la vérification ; si `NO_MATCH`/hors-limites/vérif impossible → **envoi BLOQUÉ** (réponse `blocked`), l'admin doit **forcer explicitement** (`force=true`, confirmation UI). Sandbox et force contournent.
  - **Trace d'audit (conformité)** : chaque versement **forcé** est enregistré dans `payout_audit_log` (admin, horodatage, verdict contourné, montant EUR/XOF, prestataire, résultat). Consultable via `GET /api/payouts/admin/payout-audit` + onglet « Audit versements forcés » dans `AdminPayouts`.
  - **Export CSV** : `GET /api/payouts/admin/payout-audit/export` (journal d'audit) et `GET /api/payouts/admin/withdrawals/export?status=` (versements) → CSV téléchargeable. Boutons « Exporter CSV » sur les onglets audit + retraits. Tests : `test_mobile_money_payout.py` (18/18).
- ⏳ Reste : versements RIB SEPA réels (Stripe Payouts) — optionnel.

### Pourboire (Pourboire) — mouvement d'argent réel · ✅ LIVRÉ (2026-06-10, testé pytest 4/4)
- Le pourboire débitait seulement les stats chauffeur (cosmétique). Désormais : le **client choisit le moyen** (Portefeuille SB Pay OU Carte Stripe).
  - **SB Pay** : débit immédiat du solde client + crédit immédiat du **db.wallets** chauffeur (100%, retirable). Idempotent (`rides.tip_status`). Solde insuffisant → 400.
  - **Carte** : `POST /api/phase2/rides/{id}/tip {method:'card', origin_url}` → session Stripe Checkout (redirection). Au retour, `GET /api/phase2/rides/{id}/tip/status?session_id=` confirme et crédite le chauffeur (gate atomique anti-double crédit). Min 1 €.
- Aucune commission, **aucun cashback**, aucun plafond. Stats chauffeur `earnings`/`total_tips` toujours mises à jour.
- Front : `TipModal.js` (choix SB Pay/Carte + redirection) + `RideTrackingPage.js` (gère le retour `?tip_session=`). Tests : `backend/tests/test_tip_flow.py`.

### P0.7 — Paiement « sans contact » (Phase D) · ✅ LIVRÉ (2026-06-10, testé pytest 7/7 + frontend iter229 100%)
- Le bénéficiaire (**chauffeur OU marchand**) saisit un montant → `POST /api/contactless/requests` génère **QR + code 6 chiffres** (expire, défaut 15 min). Page `/encaisser` (`ContactlessReceivePage`) : QR + code + compte à rebours + polling du statut.
- Le client **scanne le QR (caméra html5-qrcode)** ou **saisit le code 6 chiffres** sur `/pay` (`ContactlessPayPage`) → écran `/pay/:id` → paie via **SB Pay** ou **Carte (Stripe Checkout)**.
- **Encaissement (choix 1a)** : commission plateforme prélevée (admin, défaut **10%**) ; le **net** est crédité au `db.wallets` retirable du bénéficiaire ; le **client gagne le cashback**. Idempotent (lock atomique du statut). Carte : min 1 €, confirmation via `GET /api/contactless/requests/{id}/status`.
- Admin pilotable : `GET/PUT /api/contactless/admin/config` (commission, expiration, max, min carte, on/off) — carte « Paiement sans contact » dans `/admin/payment-methods`.
- Entrées UI : boutons « Encaisser un paiement (QR) » (bénéficiaire) + « Payer / Scanner un QR » (tous) sur `/wallet`. Tests : `backend/tests/test_contactless_flow.py`.


Crédite automatiquement un % du montant payé sur le solde SB Pay, pour tous les services.
- Moteur `core/cashback.py` : `get_cashback_config()` + `award_cashback()` idempotent (index unique `cashback_ledger.key = service:ref_id`), buckets `sbpay/card/cash`.
- **Admin-configurable** : taux (défaut 2 %, clampé 0–50), montant minimum (défaut 5 €), plafond/transaction, moyens éligibles, activer/désactiver — `GET/PUT /api/admin/cashback` + carte `AdminPaymentMethods.js`.
- Branché sur : complétion course (SB Pay + carte), `pay-ride`, `/wallet/pay`, pharmacie, commandes (food/marketplace), colis/coursier, transport médical. **Espèces exclues.**
- UX : ligne « Cashback » verte dans l'historique SB Pay, bannière taux sur `/wallet`, carte + toast cashback sur le reçu de course.
- 🐞 **2 bugs post-unification corrigés** : complétion course + `core/payments.py debit_with_fallback` débitaient encore `sbpaygo_wallets` (vide) → désormais `db.wallets`.

### P0.4 — Fidélité multi-verticale SB Rewards (Module 9) · ✅ LIVRÉ (2026-06-10, pytest 5/5 + frontend iter230)
- **Gain de points multi-verticale** : Courses (déjà), **Commandes food/marketplace** (`orders.py`, idempotent `loyalty_awarded`), **Colis/coursier** (`parcels.py`), **Parrainage** (déjà via `referral.py`). Points par verticale configurables (`points_per_order`, `points_per_delivery`).
- **Catalogue de récompenses** (`loyalty.py`) : `GET /api/loyalty/rewards`, `POST /api/loyalty/redeem`, `GET /api/loyalty/my-redemptions`. Récompenses : **crédit SB Pay** (wallet_credit) ou **coupon personnel** (SBREWARD-xxx). Gating par palier (`min_tier`).
- **Points de statut préservés** : on dépense `available_points = points − spent_points` ; le palier reste basé sur les points cumulés (lifetime). Anti double-dépense via garde atomique `$expr`.
- **Coupons-récompense privés** : `coupons.py` filtre les coupons ciblés (`user_id`) → invisibles/inutilisables par les autres.
- Front : section « Récompenses » dans `LoyaltyPage.jsx` + carte « Encaissé aujourd'hui » (contactless + pourboires) sur `DriverEarningsPage.js` (endpoint `GET /api/contactless/driver/today-summary`). Tests : `backend/tests/test_loyalty_rewards.py`.
- ⏳ Reste (backlog) : ~~UI admin pour éditer le catalogue de récompenses~~ ✅ **LIVRÉ** (2026-06-10) — éditeur complet (ajout/suppression/édition : nom, coût, palier min, type crédit SB Pay/coupon, valeur, service) dans `AdminLoyalty.js` ; round-trip `PUT /api/loyalty/admin/config` testé (`test_loyalty_rewards.py` 6/6). Champs `points_per_order`/`points_per_delivery` éditables.

---

## 🟠 P1 — Différenciation & engagement

### P1.1 — Carte interactive commerce temps réel (Module 2) · **L**
Carte façon Google Maps dédiée au commerce : commerces ouverts, promos actives, produits populaires, coursiers dispo, zones de demande. Recherche géolocalisée + filtres + commande directe depuis la carte.

### P1.2 — Offres flash géolocalisées (Module 12) · **M**
Promos dynamiques (invendus boulangerie, dernière minute) + notifications intelligentes (position, historique, préférences).
- Réutilise `auto_promotions.py`, `coupons.py`, et l'infra de bannières (surfaces/billing déjà livrée).

### P1.3 — Marketplace Services finalisée (Module 7) · **S/M**
Polish réservation/disponibilités/géoloc/notation pour Plombier, Électricien, Coiffeur, Mécanicien, Jardinier, Ménage, Informatique, Dépannage.
- Réutilise `services.py`, `ServiceProvidersPage`.

### P1.4 — SB Neighbour C2C (Module 6) · **M**
Vente/achat entre particuliers, **location de matériel**, services de proximité. Paiement sécurisé (escrow SB Pay), livraison via chauffeurs SB.
- Réutilise `marketplace_listings`, `SellGalleryPage`.

---

## 🟣 P2 — Innovation IA (LLM via Emergent Key)

### P2.1 — IA Shopping Assistant (Module 4) · ✅ LIVRÉ (2026-06-10, pytest 5/5 + frontend iter233 100%)
**SB Assistant** (`routes/assistant.py`) — assistant conversationnel **Gemini 3 Flash** via clé Emergent (`gemini-3-flash-preview`).
- Pattern **grounded** (pas de function-calling natif) : 1) extraction d'intention JSON (intent/keywords/store_type/max_price/open_now/sort) → 2) recherche dans le **vrai catalogue** `db.products`/`db.merchants` (filtres, prix, calcul « ouvert maintenant » via `opening_hours`) → 3) réponse rédigée **uniquement** sur ces résultats (aucune hallucination, vérifié). Nettoyage de stopwords des mots-clés. Sessions multi-tours dans `db.assistant_sessions`.
- `POST /api/assistant/chat {message, session_id?}` → `{reply, products[], merchants[]}` ; `GET /api/assistant/sessions/{id}`.
- Front : `AssistantPage.jsx` (route `/assistant`, chat + cartes produits/commerces cliquables → `/food/{merchant_id}`, suggestions, timeout 25s) + bouton flottant « Assistant » sur `FoodPage`. Tests : `backend/tests/test_assistant.py`.
- Note : catalogue actuel = restaurant/grocery/florist/wine/stationery/construction (pas de pharmacie en données).

### P2.2 — Achats groupés intelligents (Module 5) · **L**
Regroupement automatique des commandes proches → frais de livraison réduits, trajets optimisés, empreinte carbone. IA identifie les commandes compatibles.

### P2.3 — IA Business pour commerçants (Module 10) · **M**
Tableau de bord intelligent : prévision des ventes, produits populaires, tendances, recommandations de promos, prévision des stocks.
- Réutilise `weekly_reports.py`, stats marchands.

### P2.2 — Achats groupés intelligents (Module 5) · ✅ LIVRÉ (2026-06-11, testé iter235 — backend 11/11 + 5/5 HTTP, frontend ~100%)
**Livraison groupée intelligente** (`core/grouping.py`) :
- Option checkout « Groupée 🌱 » (opt-in) : la commande paie le **tarif plein** ; dès qu'elle est **réellement regroupée** avec une commande compatible, la réduction (**30% configurable**) est **créditée au client sur son SB Pay** (idempotent via `group_savings_ledger`). Si aucune commande compatible dans la fenêtre → **livraison standard tarif plein** (`group_status="solo"`).
- **Moteur d'appariement géo déterministe** (tâche de fond `grouping_loop`, 20s) : regroupe les commandes proches (rayon marchands 1.5km + dropoff 1.2km, fenêtre 8 min, lot max 3) en `delivery_batches` avec **itinéraire optimisé** (plus proche voisin pickups→dropoffs) + **résumé IA éco** (Gemini, non bloquant).
- **Courier** : un seul livreur prend tout le lot (claim assigne les commandes sœurs), badge « LOT GROUPÉ ». `GET /api/orders/batch/{id}` expose la route ordonnée.
- **Admin** : `GET/PUT /api/orders/admin/grouping-config` (enable, discount %, lot max, rayons, fenêtre) + carte « Livraison groupée 🌱 » dans `/admin/payment-methods`. Client : ligne « Économie groupée » sur le suivi de commande. Tests : `backend/tests/test_grouped_delivery.py` (6/6).

### P2.3 — IA Business commerçants (Module 10) · ✅ LIVRÉ (2026-06-11, testé iter235 — backend 5/5, frontend ~100%)
**Tableau de bord intelligent marchand** (`core/merchant_ai.py`) :
- **Vraies stats** (remplace les données factices de `MerchantAnalytics.js`) : `GET /api/merchants/me/analytics?period=week|month|year` → revenu + tendance vs période précédente, commandes + tendance, panier moyen, jour le plus actif, série temporelle réelle (7j / 30j / 12 mois), top produits (qté + revenu), stocks faibles/ruptures.
- **Insights IA** (Gemini 3 Flash, groundé sur les vraies données, fallback déterministe) : `GET /api/merchants/me/ai-insights` → résumé, prévision de ventes, produits phares, recommandations promo, alertes stock.
- Front : `MerchantAnalytics.js` réécrit (KPIs réels + sélecteur période + graphique + top produits + carte « Insights IA » avec rafraîchissement). Tests : `backend/tests/test_merchant_bi.py` (5/5).

### App marchand — Commandes temps réel (A) + Stock avancé (C) · ✅ LIVRÉ (2026-06-11, testé iter236 — backend 6/6, frontend ~100%)
**A — Gestion des commandes en temps réel** (`MerchantOrders.js` réécrit) :
- WebSocket live (`useWebSocket(user.id)`) : événement `new_order` → **son** (`playAlert`) + toast + reload automatique ; `order_status`/`order_driver_assigned` rafraîchissent la file. Indicateur « En direct » + bouton son.
- Cycle complet en FRANÇAIS : pending → Accepter/Refuser → Commencer la préparation → Marquer prête → « En attente du livreur ». Onglets En attente/En cours/Terminées, badges vitesse + groupée, mise à jour optimiste.
- Backend : `update_order_status` pose `merchant_managed=True` → l'auto-progress démo **ignore** les commandes pilotées par le marchand (le marchand reprend le contrôle). Menu marchand traduit en FR.

**C — Gestion produits & stock avancée** (`MerchantProducts.js` réécrit) :
- Cartes de synthèse (Produits / Disponibles / Stock faible / Ruptures) + filtres (Tous/Disponibles/Stock faible/Rupture) + recherche.
- **Ajustement rapide du stock** (stepper +/- par carte) → `POST /api/merchants/products/{id}/stock` ({delta} ou {stock}, plancher 0, flags low/out). Badges « Stock faible » (amber) / « Rupture » (rouge).
- Champ **seuil d'alerte** (`low_stock_threshold` ajouté à `ProductCreate`) + **upload de photo** (`/uploads/image`) en plus de l'URL.
- Tests : `backend/tests/test_merchant_stock.py` (6/6).

### P2.4 — Réseau social commerce (Module 11) · **L**
Publications / Stories / Promos / Événements par commerce ; suivre / liker / commenter / partager (inspiration TikTok Shop & Instagram Shopping).
- Réutilise `news.py`, `NewsFeedPage`.

---

## ✅ Déjà livré (socle pub/monétisation — base du commerce connecté)
- Bannières Sponsorisé multi-surfaces (Accueil/Livraison/Marketplace) + label « Sponsorisé ».
- Suivi impressions/clics + CTR par bannière.
- Facturation publicitaire (tarif/jour ou CPM) + récap par commerçant.
- Enchères VTC bidirectionnelles + auto-acceptation client + son/animation + « vu par X ».

---

## 🧭 Ordre d'exécution recommandé
1. **P0.1 → P0.4** : compléter la boucle Marketplace → Livraison → Paiement → Fidélité (cœur Super App, ROI rapide).
2. **P1.2** (offres flash) + **P1.1** (carte) : engagement & rétention.
3. **P2.1** (IA Shopping) puis **P2.2/P2.3/P2.4** : différenciation vs Gojek/Grab/Rappi.

> Multi-pays / multi-langues / multi-devises : l'i18n (`i18n.py`) et les devises existent partiellement — à consolider transversalement au fil des phases (pas un module isolé).
