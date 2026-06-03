# SB Drive VTC — API Reference

> **Version 1.0 (Jun 1, 2026)** — Toutes les APIs en place (227 endpoints).
> Documentation Swagger interactive : `https://sb-drive-vtc.preview.emergentagent.com/api/docs`

## 🗂 Sommaire par module

| Module | # endpoints | Description |
|---|---|---|
| [auth](#-auth) | 10 | Authentification, phone-login, Google OAuth |
| [drivers](#-drivers) | 18 | Profil chauffeur, scoring, gains |
| [rides](#-rides) | 10 | Cycle de vie d'une course VTC |
| [phase1](#-phase1) | 12 | Chat, OTP, favoris, SOS, stopovers |
| [phase2](#-phase2) | 31 | Heatmap, pricing, gift cards, waybill, pool, runner, catalogs sponsorisés |
| [finance](#-finance) | 15 | Wallets, SB PayGo, méthodes paiement |
| [admin](#-admin) | 24 | CRUD admin, rewards, priority, db backup, live rides |
| [misc](#-misc) | 25 | Tickets support, dashboard admin, dispatcher, webhooks |
| [merchants](#-merchants) | 6 | Boutique, produits |
| [orders](#-orders) | 4 | Commandes (status, assignation, rating) |
| [config](#-config) | 11 | Catégories véhicules, services, app config |
| [kiosk](#-kiosk) | 12 | SB Drive Tab borne tablette |
| [coupons](#-coupons) | 4 | Codes promo |
| [carpool](#-carpool) | 4 | Covoiturage |
| [marketplace](#-marketplace) | 4 | Annonces vente/location |
| [services](#-services) | 6 | Réservations services génériques |
| [referral](#-referral) | 4 | Parrainage |
| [wallet](#-wallet) | 4 | Top-up, pay, transfer, refund |
| [features](#-features) | 4 | Donations + livechat |
| [simulation](#-simulation) | 3 | Mode simulation chauffeur virtuel |
| [auto_dispatch](#-auto_dispatch) | 3 | Config + stats auto-dispatch |
| [payments](#-payments) | 2 | Stripe checkout |
| [webhooks](#-webhooks) | 1 | Stripe webhook |

**TOTAL : 227 endpoints exposés**

---

## 🔐 auth

| Méthode | URL | Description | Auth |
|---|---|---|---|
| POST | `/api/auth/register` | Inscription email/password | Public |
| POST | `/api/auth/login` | Login email/password (set httpOnly cookie) | Public |
| POST | `/api/auth/logout` | Logout (clear cookie) | Session |
| POST | `/api/auth/refresh` | Refresh JWT cookie | Session |
| GET | `/api/auth/me` | Profil utilisateur courant | Session |
| POST | `/api/auth/check-phone` | Vérifier si un téléphone est enregistré | Public |
| POST | `/api/auth/phone-login` | Login par téléphone + mot de passe | Public |
| POST | `/api/auth/phone-register` | Inscription par téléphone | Public |
| POST | `/api/auth/google/session` | Échange session_id Google OAuth contre cookie | Public |
| POST | `/api/auth/change-password` | Changer mdp (vérifie ancien) | Session |

## 🚗 rides

| Méthode | URL | Rôle requis |
|---|---|---|
| POST | `/api/rides/estimate` | user — distance/durée/tarif via Google Maps |
| POST | `/api/rides` (server.py /admin) | user — crée la course |
| GET | `/api/rides/{ride_id}` | user/driver |
| GET | `/api/rides/active/current` | user/driver |
| GET | `/api/rides/pending/available` | driver |
| POST | `/api/rides/{ride_id}/accept` | driver |
| POST | `/api/rides/{ride_id}/status` | driver — accepted→arriving→in_progress→completed |
| POST | `/api/rides/{ride_id}/cancel` | user/driver |
| POST | `/api/rides/{ride_id}/rate` | user |
| POST | `/api/rides/{ride_id}/counter-offer` | driver — négociation |
| POST | `/api/rides/{ride_id}/accept-offer/{offer_id}` | user |

## 👨‍✈️ drivers

| Méthode | URL | Description |
|---|---|---|
| POST | `/api/drivers/register` | Inscription chauffeur (depuis user existant) |
| GET | `/api/drivers/profile` | Profil chauffeur courant |
| POST | `/api/drivers/toggle-online` | Bascule online/offline |
| POST | `/api/drivers/location` | Push GPS (WS recommandé) |
| POST | `/api/drivers/documents` | Upload de docs |
| GET | `/api/drivers/earnings` | Synthèse gains |
| GET | `/api/drivers/ride-history` | Historique courses (limit 20) |
| GET | `/api/drivers/my-activity` | Stats activité + palette + priority |
| GET | `/api/drivers/my-score-history` | Iter69 — historique score + palette next |
| GET | `/api/drivers/my-earnings-breakdown` | Jour/semaine/mois |
| POST | `/api/drivers/refuse-ride/{ride_id}` | −5 pts |
| GET | `/api/drivers/top` | Classement top drivers |
| GET | `/api/drivers/my-active-rewards` | Récompenses actives |
| GET | `/api/drivers/my-stats` | KPI |
| GET | `/api/drivers/my-earnings` | Synthèse alternative |
| GET | `/api/drivers/my-documents` | Liste docs |
| GET | `/api/drivers/my-notifications` | Notifications driver |
| GET | `/api/drivers/incoming-requests` | Courses en attente proches |

## 📜 phase1 (Chat, OTP, Favoris, SOS, Stopovers)

| Méthode | URL |
|---|---|
| GET | `/api/phase1/rides/{ride_id}/messages` |
| POST | `/api/phase1/rides/{ride_id}/messages` |
| POST | `/api/phase1/rides/{ride_id}/start-otp/request` |
| POST | `/api/phase1/rides/{ride_id}/start-otp/verify` |
| GET | `/api/phase1/favorite-drivers` |
| POST | `/api/phase1/favorite-drivers/{driver_id}` |
| DELETE | `/api/phase1/favorite-drivers/{driver_id}` |
| PUT | `/api/phase1/rides/{ride_id}/stopovers` |
| GET | `/api/phase1/emergency-contacts` |
| POST | `/api/phase1/emergency-contacts` |
| DELETE | `/api/phase1/emergency-contacts/{contact_id}` |
| POST | `/api/phase1/sos` |

## 🎯 phase2 (Heatmap, Pricing, Pool, Runner, Catalogs)

| Méthode | URL | Description |
|---|---|---|
| GET | `/api/phase2/heatmap` | Heatmap densité courses |
| GET/PUT | `/api/phase2/driver/destination-mode` | Driver destination filter |
| GET/POST/DELETE | `/api/phase2/config/airport-zones[/{id}]` | Geo-zones aéroport |
| GET/POST/DELETE | `/api/phase2/config/flat-rates[/{id}]` | Tarifs forfaitaires |
| POST | `/api/phase2/pricing/quote` | Devis prix |
| POST | `/api/phase2/airport-flat-quote` | Alias airport surcharge |
| POST | `/api/phase2/rides/{ride_id}/tip` | Pourboire post-course |
| POST | `/api/phase2/gift-cards` | Achat carte cadeau |
| POST | `/api/phase2/gift-cards/redeem` | Activation code |
| GET | `/api/phase2/gift-cards/my[ne]` | Mes cartes |
| GET | `/api/phase2/rides/{ride_id}/waybill` | Feuille de route |
| GET | `/api/phase2/pool/matches/{ride_id}` | Matches Taxi Pool |
| PUT | `/api/phase2/pool/enable/{ride_id}` | Activer pool |
| GET | `/api/phase2/loyalty/me` | Points fidélité + tier |
| GET | `/api/phase2/referral/me` | Mes parrainages |
| GET | `/api/phase2/subscriptions/plans` | Plans abonnements |
| GET | `/api/phase2/safety/emergency-contacts` | Alias contacts SOS |
| GET | `/api/phase2/favorites/drivers` | Alias favoris |
| POST | `/api/phase2/runner/book` | Réserver Runner / Genie |
| GET | `/api/phase2/runner/my` | Mes commandes Runner |
| GET | `/api/phase2/catalogs/{collection}` | Catalogues services (8 collections whitelistées) |
| POST | `/api/phase2/admin/catalogs/{collection}/{id}/feature` | Sponsorisé (admin) |
| DELETE | `/api/phase2/admin/catalogs/{collection}/{id}/feature` | Retirer sponsorisé (admin) |
| GET | `/api/phase2/admin/catalogs/{collection}/featured` | Liste sponsorisés (admin) |
| GET | `/api/phase2/taxi-bidding/live-stats` | Stats Offer Your Fare |

## 💰 finance

| Méthode | URL |
|---|---|
| GET | `/api/config/payment-methods` |
| GET/PUT | `/api/admin/payment-methods[/{id}]` |
| PUT | `/api/admin/finance/module` |
| GET | `/api/finance/status` |
| GET | `/api/finance/balance` |
| GET | `/api/finance/sbpaygo/availability` |
| GET/POST/PUT/DELETE | `/api/admin/sbpaygo/zones[/{id}]` |
| POST | `/api/finance/sbpaygo/pay-ride` |
| POST | `/api/finance/sbpaygo/topup` |
| POST | `/api/finance/sbpaygo/send` |
| POST | `/api/finance/sbpaygo/sso-link` |

## 🏨 kiosk (SB Drive Tab)

| Méthode | URL | Description |
|---|---|---|
| POST | `/api/kiosk/admin/create` | Admin créer borne |
| GET | `/api/kiosk/admin/list` | Admin lister bornes |
| PUT | `/api/kiosk/admin/{id}` | Admin update |
| DELETE | `/api/kiosk/admin/{id}` | Admin delete |
| POST | `/api/kiosk/admin/{id}/regenerate-token` | Régénérer session_token |
| POST | `/api/kiosk/unlock` | Borne — déverrouiller par PIN |
| GET | `/api/kiosk/{token}/info` | Info borne + véhicules |
| GET | `/api/kiosk/{token}/nearest-driver` | ETA driver le plus proche |
| POST | `/api/kiosk/{token}/estimate` | Devis prix |
| POST | `/api/kiosk/{token}/book` | Crée la course |
| GET | `/api/kiosk/{token}/ride/{ride_id}` | Status course |
| GET | `/api/kiosk/{token}/geocode?q=` | Proxy Nominatim |

## 👮 admin (CRUD + Settings)

| Méthode | URL | Description |
|---|---|---|
| POST/PUT/DELETE | `/api/admin/vehicle-types[/{slug}]` | CRUD types véhicules |
| POST | `/api/admin/merchants/{id}/status` | Activer/désactiver marchand |
| GET | `/api/admin/stats` | KPI globaux |
| GET/PUT | `/api/admin/settings` | Settings généraux |
| GET | `/api/admin/analytics` | Aggregation MongoDB |
| GET/PUT | `/api/admin/service-config/{key}` | Config par service |
| GET/POST/PUT/DELETE | `/api/admin/crud/{collection}[/{id}]` | CRUD générique sur whitelist |
| GET/PUT | `/api/admin/rewards/config` | Récompenses chauffeurs |
| GET/PUT/DELETE | `/api/admin/priority-drivers[/{id}]` | Drivers prioritaires |
| GET/PUT | `/api/admin/top-drivers-config` | Settings classement |
| GET | `/api/admin/db-backup` | Dump JSON |
| GET | `/api/admin/reports/negotiation-gap` | Écart négociation |
| GET | `/api/admin/live-rides` | Cockpit Live Rides |
| GET/PUT | `/api/admin/auto-dispatch/config` | Auto-dispatch |
| GET | `/api/admin/auto-dispatch/stats` | Stats par tier |

## 📋 misc (Tickets support, Admin dashboard, Dispatcher)

Voir Swagger pour détails. Inclut :
- `/api/support/tickets[/{id}/reply]`, `/api/support/contact`
- `/api/rides/{id}/help`, `/api/orders/{id}/help`
- `/api/admin/dashboard`, `/api/admin/users[/{id}/(un)suspend]`
- `/api/admin/drivers[/{id}/(approve|reject)]`
- `/api/admin/rides`, `/api/admin/orders`, `/api/admin/revenue`
- `/api/dispatcher/live`, `/api/dispatcher/assign-ride`
- `/api/files/{path:path}`, `/api/health`
- `/api/wallet/withdraw-request`

## 🏪 merchants, orders, marketplace, carpool, services, coupons, referral, wallet, features, config, payments, webhooks, simulation, auto_dispatch

Tous ces modules suivent le pattern REST classique CRUD. Voir Swagger pour les payloads détaillés :
- `https://sb-drive-vtc.preview.emergentagent.com/api/docs` (Swagger UI)
- `https://sb-drive-vtc.preview.emergentagent.com/api/redoc` (ReDoc)

---

## 🚦 Endpoints par rôle

| Rôle | Endpoints accessibles |
|---|---|
| **Public** (no auth) | `/api/auth/*`, `/api/config/*`, `/api/phase2/catalogs/*`, `/api/kiosk/{token}/*`, `/api/health` |
| **user** | `/api/rides/*`, `/api/orders/*`, `/api/wallet/*`, `/api/finance/sbpaygo/*`, `/api/phase1/*`, `/api/phase2/{user-side}/*` |
| **driver** | `/api/drivers/*`, `/api/rides/{id}/(accept|status|cancel)`, `/api/rides/active/current`, `/api/rides/pending/available` |
| **merchant** | `/api/merchants/products/*`, `/api/orders/*` (assignation) |
| **admin** | tout `/api/admin/*`, `/api/auto_dispatch/*`, `/api/dispatcher/*`, kiosk admin |

---

## 📌 Recommandations Phase 2 (génération APIs manquantes)

Voir `DATABASE_SCHEMA.md` pour les collections manquantes. APIs à créer :
- `GET/POST/PUT/DELETE /api/audit-logs` (admin only)
- `GET/POST /api/drivers/shifts` (driver+admin)
- `GET/POST /api/vehicle-inspections` (driver+admin)
- `GET /api/admin/tax-reports?from=&to=&format=csv|pdf`
- `GET/POST /api/subscriptions/plans`, `POST /api/subscriptions/subscribe`
- `POST /api/complaints`, `GET /api/admin/complaints`
- Endpoints CRUD manquants pour : `notifications` (CRUD + mark-as-read), `notifications_preferences`
