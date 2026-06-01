# SB Drive VTC — Schéma Base de Données

> **Version 1.0 (Jun 1, 2026)** — Audit exhaustif de l'existant.
> Base de données : MongoDB. 56 collections actives.
> Cette doc reflète l'état actuel — voir `/app/memory/DATABASE_RESTRUCTURE_PLAN.md` pour les évolutions proposées.

## 📊 Vue d'ensemble

| Domaine | Collections principales |
|---|---|
| 🔐 Auth & Users | `users`, `login_attempts`, `addresses`, `emergency_contacts` |
| 🚗 VTC / Rides | `rides`, `ride_messages`, `ratings`, `bidding_posts`, `bidding_offers` |
| 👨‍✈️ Chauffeurs | `drivers`, `favorite_drivers` |
| 🏪 Marchands & Commandes | `merchants`, `products`, `orders`, `carts` |
| 💰 Finance | `wallets`, `wallet_transactions`, `sbpaygo_wallets`, `sbpaygo_zones`, `sbpaygo_sso_log`, `payment_methods`, `payment_transactions`, `finance_config` |
| 🎁 Promotions | `coupons`, `coupon_usage`, `gift_cards`, `donations`, `referrals` |
| 🏨 Hotels / Kiosk | `kiosks` |
| 🛒 Marketplace | `marketplace_listings`, `carpool_rides`, `runner_orders`, `intercity_bookings`, `parking_reservations` |
| 🛠 Services (B2C) | `service_bookings`, `beauty_salons`, `pet_providers`, `car_services`, `towing_partners`, `nearby_businesses`, `nearby_categories`, `ondemand_services`, `master_service_categories` |
| 🎯 Référentiels | `vehicle_categories`, `vehicle_types`, `parcel_package_types`, `cancel_reasons`, `track_categories`, `tracked_members` |
| ⚙️ Config Admin | `app_configurations`, `service_configs`, `admin_settings`, `airport_zones`, `flat_rates` |
| 📩 Support / Notifications | `support_tickets`, `notifications`, `livechat_messages`, `sos_alerts`, `admin_contact_requests`, `admin_order_help_requests`, `admin_trip_help_requests`, `admin_withdraw_requests` |
| 📹 Phase 2 | `video_sessions` |

---

## 🔐 Domaine Auth & Users

### `users` — Compte utilisateur unifié (client, chauffeur, marchand, admin)
| Champ | Type | Description |
|---|---|---|
| `id` (PK) | str | `user_<uuid12>` — index unique |
| `email` | str | index unique |
| `phone` | str? | `+33...` normalisé, sans espaces |
| `password_hash` | str | bcrypt |
| `name` | str | |
| `role` | str | `user` / `driver` / `merchant` / `admin` |
| `panel_preference` | str? | `/dispatch`, `/billing`, etc. (admins) — Phase B |
| `avatar_url` | str? | |
| `is_verified` | bool | |
| `is_suspended` | bool? | |
| `is_kiosk_guest` | bool? | guest user créé via une borne |
| `kiosk_id` | str? | ref `kiosks.id` |
| `referral_code_own` | str? | code propre pour parrainer |
| `created_at` | iso datetime | |

**Indexes** : `email` UNIQUE, `id` UNIQUE, `referral_code_own` UNIQUE SPARSE

### `login_attempts` — Anti-brute force
| Champ | Type | Description |
|---|---|---|
| `identifier` | str | email/phone — INDEX |
| `attempts` | int | |
| `last_attempt` | iso | |
| `locked_until` | iso? | |

### `addresses` — Adresses sauvegardées par utilisateur
| Champ | Type | Description |
|---|---|---|
| `id` (PK) | str | `addr_<uuid>` |
| `user_id` (FK→users.id) | str | |
| `label` | str | "Domicile" / "Travail" |
| `address` | str | adresse complète |
| `lat` / `lng` | float | |
| `is_default` | bool? | |
| `created_at` | iso | |

### `emergency_contacts` — Contacts SOS Phase 1
| Champ | Type | Description |
|---|---|---|
| `id` (PK) | str | |
| `user_id` (FK→users.id) | str | |
| `name` / `phone` / `relationship` | str | |
| `created_at` | iso | |

---

## 🚗 Domaine VTC / Rides

### `rides` — Course VTC (collection principale)
| Champ | Type | Description |
|---|---|---|
| `id` (PK) | str | `ride_<uuid12>` |
| `booking_no` | str | code court 8 chars upper |
| `user_id` (FK→users.id) | str | passager |
| `driver_id` (FK→users.id) | str? | chauffeur assigné |
| `passenger_name` / `passenger_phone` / `passenger_email` | str? | snapshot (incl. kiosk guests) |
| `pickup_lat` / `pickup_lng` / `pickup_address` | float/str | |
| `dropoff_lat` / `dropoff_lng` / `dropoff_address` | float/str | |
| `stopovers` | list? | Phase 1 — points intermédiaires |
| `vehicle_type` | str | `sb` / `confort` / `fast` / `taxi` / `van` / `moto` / etc. |
| `distance_km` | float | |
| `estimated_fare` / `final_fare` | float | |
| `currency` | str | EUR par défaut |
| `status` | str | `pending` / `accepted` / `arriving` / `in_progress` / `completed` / `cancelled` |
| `cancelled_by` | str? | `user` / `driver` / `auto_dispatch` |
| `payment_method` | str | `cash_to_driver` / `sbpaygo` / `card` / `wallet` |
| `payment_status` | str | `unpaid` / `paid` / `unpaid_insufficient` |
| `paid_with` / `paid_at` | str?/iso? | trace de paiement effectif |
| `start_otp` | str? | code OTP 4 chiffres (Phase 1) |
| `pool_enabled` | bool? | Phase 2 — Taxi Pool |
| `tip_amount` | float? | Phase 2 — pourboire |
| `auto_dispatch_tier` | int? | 0/1/2 — niveau d'escalation |
| `offered_to_drivers` | list | drivers contactés (auto-dispatch) |
| `penalized_drivers` | list | drivers ayant subi le malus no-response |
| `negotiations` | list? | tour de négociation (counter-offers) |
| `source` | str? | `app` / `kiosk` / `manual` / `website` |
| `kiosk_id` / `kiosk_hotel` | str? | si source=kiosk |
| `created_at` | iso | |

**Indexes** : `(status, created_at DESC)`

### `ride_messages` — Chat in-ride (Phase 1)
| `id`, `ride_id` (FK), `sender_id` (FK→users.id), `text`, `created_at` |

### `ratings` — Évaluations
| `id`, `ride_id` (FK), `user_id` (FK), `driver_id` (FK), `stars` (1-5), `comment`, `created_at` |

### `bidding_posts` & `bidding_offers` — Marketplace négociation (electricien, plombier, etc.)
- `bidding_posts` : annonce client (catégorie, description, budget max)
- `bidding_offers` : offre prestataire (montant, durée estimée, notes)

---

## 👨‍✈️ Domaine Chauffeurs

### `drivers` — Profil chauffeur étendu (lié à `users` 1:1)
| Champ | Type | Description |
|---|---|---|
| `id` (PK) | str | `driver_<uuid12>` |
| `user_id` (FK→users.id) | str | UNIQUE |
| `vehicle_type` / `vehicle_model` / `vehicle_number` / `license_number` | str? | tous optionnels (legacy fix iter70) |
| `status` | str | `pending` / `approved` / `rejected` / `suspended` |
| `is_online` | bool | |
| `current_lat` / `current_lng` | float? | tracking GPS |
| `rating` | float | 0-5 |
| `total_trips` | int | |
| `earnings` | float | total cumulé |
| `points` | int | 0-100 capé — Driver Quality Scoring (iter68) |
| `palette` | str? | `Debutant` / `Standard` / `Confirme` / `Expert` — calculée |
| `manual_priority` | bool? | flag VIP partenaire |
| `manual_priority_note` | str? | |
| `acceptance_rate` / `cancellation_rate` | float | % |
| `offered_count` / `accepted_count` / `refused_count` / `cancelled_count` | int | |
| `score_log` | list | historique +/− points (max 200) |
| `documents` | list | objets `{type, url, status, uploaded_at, expires_at}` |
| `destination_mode` | obj? | Phase 2 — destination filter |
| `created_at` | iso | |

**Indexes** : `user_id` UNIQUE

### `favorite_drivers` — Liste favoris client→chauffeur
| `id`, `user_id`, `driver_id`, `created_at` |

---

## 🏪 Domaine Marchands & Commandes

### `merchants` — Boutique/restaurant/hôtel
| `id`, `user_id` (FK), `store_name`, `store_type`, `address`, `lat`, `lng`, `rating`, `total_orders`, `is_active`, `opening_hours`, `image_url`, `description`, `created_at` |

### `products` — Articles vendus par un marchand
| `id`, `merchant_id` (FK), `name`, `description`, `price`, `category`, `is_available`, `image_url`, `created_at` |

### `orders` — Commande passée à un marchand
| `id`, `booking_no`, `user_id`, `merchant_id`, `driver_id?`, `items[]`, `subtotal`, `delivery_fee`, `total`, `status`, `delivery_address`, `payment_method`, `created_at` |

### `carts` — Panier persistant (dual-write local/server)
| `user_id` (PK), `merchant_id`, `items[]`, `updated_at` |

---

## 💰 Domaine Finance

### `wallets` — Portefeuille interne (EUR)
| `user_id` (PK), `balance`, `created_at` |

### `wallet_transactions` — Historique transactions wallet
| `id`, `wallet_user_id`, `type` (`topup`/`pay`/`transfer`/`refund`), `amount`, `currency`, `ride_id?`, `order_id?`, `label`, `created_at` |

### `sbpaygo_wallets` — Wallet SB PayGo (multi-devise par zone)
| `user_id`, `currency`, `balance`, `zone_id`, `created_at` |

### `sbpaygo_zones` — Zones géographiques admin où SB PayGo est dispo
| `id`, `name`, `country`, `currency`, `is_active`, `min_topup`, `created_at` |

### `sbpaygo_sso_log` — Trace des liens SSO vers app PayGo externe
| `id`, `user_id`, `target_url`, `created_at` |

### `payment_methods` — Modes de paiement supportés
| `id`, `method_id`, `label`, `icon`, `is_active`, `requires_zone`, `order_index` |

### `payment_transactions` — Transactions Stripe (existant — historique pour reconciliation)
| `id`, `session_id`, `user_id`, `amount`, `currency`, `payment_status`, `metadata{}`, `created_at` |

### `finance_config` — Config globale finance (clé/valeur)
| `key` (PK), `value`, `updated_at` |

---

## 🎁 Domaine Promotions

### `coupons` — Codes promo admin
| `id`, `code` UNIQUE, `description`, `discount_type` (`Percentage`/`Flat`), `discount_value`, `max_discount`, `usage_limit`, `per_user_limit`, `used`, `service_type`, `status`, `expiry_date`, `created_at` |

### `coupon_usage` — Trace d'usage des coupons
| `id`, `coupon_code`, `user_id`, `used_at`, `ride_id?`, `order_id?` |

### `gift_cards` — Cartes cadeaux (Phase 2)
| `id`, `code` UNIQUE, `amount`, `currency`, `purchased_by`, `recipient_email?`, `redeemed_by?`, `redeemed_at?`, `created_at` |

### `donations` — Dons clients
| `id`, `user_id`, `amount`, `cause`, `created_at` |

### `referrals` — Système parrainage MLM
| `id`, `referrer_id`, `referred_id` UNIQUE SPARSE, `code`, `level`, `reward_amount`, `status`, `created_at` |

---

## 🏨 Domaine Kiosk (Iter 71)

### `kiosks` — Bornes SB Drive Tab installées
| Champ | Type | Description |
|---|---|---|
| `id` (PK) | str | `kiosk_<uuid12>` |
| `hotel_name` / `address` / `lat` / `lng` | | |
| `pin_code` | str | 4-6 chiffres |
| `language` / `currency` | str | défauts borne |
| `image_url` | str | carrousel accueil |
| `pickup_label` | str | étiquette point de prise en charge |
| `session_token` | str | secret URL borne |
| `active` | bool | |
| `total_bookings` | int | counter |
| `created_at` | iso | |

---

## 🛒 Domaine Marketplace & Services divers

### `marketplace_listings` — Annonces (Real-estate, Cars, Items)
| `id`, `title`, `category` (`real-estate`/`cars`/`items`), `type` (`Vente`/`Location`), `price`, `currency`, `location`, `image`, `description`, `is_featured`?, `featured_until`?, `featured_priority`?, `created_at` |

### `carpool_rides` — Covoiturage longue distance
| `id`, `driver_name`, `from_city`, `to_city`, `departure_at`, `seats_available`, `price_per_seat`, `vehicle`, `duration_h`, `created_at` |

### `runner_orders` — Coursier Express / Delivery Genie (Phase 2)
| `id`, `user_id`, `service_type` (`runner`/`genie`), `mode` (`simple`/`multi`), `package_type`, `pickup`, `dropoffs[]`, `fare`, `status`, `created_at` |

### `intercity_bookings` — Réservations inter-villes
| `id`, `user_id`, `from_city`, `to_city`, `date`, `passengers`, `vehicle_type`, `fare`, `status`, `created_at` |

### `parking_reservations` — Réservations de parking
| `id`, `user_id`, `parking_id`, `start_at`, `end_at`, `vehicle_plate`, `fare`, `status`, `created_at` |

---

## 🛠 Domaine Services Catalogues (B2C)

Toutes ces collections partagent le schéma **Sponsoring** : `is_featured` (bool), `featured_until` (iso), `featured_priority` (int).

### `beauty_salons` / `pet_providers` / `car_services` / `towing_partners` / `nearby_businesses` / `ondemand_services`
| `id`, `name`, `category`, `address`, `phone?`, `rating`, `price_range?` / `price_from?`, `services[]`, `image`, `open_hours?`, `pet_types?` (pet), `response_time_mins?` (towing), `available_24h?` (towing), `is_featured`, `featured_until`, `featured_priority`, `created_at` |

### `service_bookings` — Réservations de services génériques
| `id`, `user_id`, `category`, `provider_id`, `service_name`, `scheduled_at`, `status`, `fare`, `notes`, `created_at` |

### `nearby_categories` & `master_service_categories` — Référentiels
| `id`, `slug`, `name`, `icon`, `order_index`, `is_active` |

---

## 🎯 Domaine Référentiels (seed au startup)

| Collection | Description | Indexes |
|---|---|---|
| `vehicle_categories` | Catégories (VTC, Moto, Pool, etc.) | `slug` UNIQUE |
| `vehicle_types` | Sub-types (SB, Confort, Luxe, …) avec tarifs | `slug` |
| `parcel_package_types` | Types de colis pour Runner | |
| `cancel_reasons` | Motifs d'annulation prédéfinis | |
| `track_categories` | Catégories de tracking | |
| `tracked_members` | Membres suivis par un user (live tracking) | |
| `app_configurations` | Config clé/valeur globale | `key` UNIQUE |

---

## ⚙️ Domaine Config Admin

### `service_configs` — Config par service (clé/valeur JSON)
| `key` (PK), `value` (obj), `updated_at` |

**Clés connues** : `genie`, `runner`, `ondemand`, `video`, `bids`, `marketplace`, `medical`, `rideshare`, `nearby`, `tracking`, `location-fare`, `country`, `state`, `cancel-reasons`, `pages`, `app-home`, `intro`, `labels`, `currency`, `language`, `seo`, `maps-api`, `auto_dispatch`, `rewards`, `top_drivers_config`.

### `admin_settings` — Paramètres généraux dashboard
### `airport_zones` & `flat_rates` — Geo-fences + tarifs forfaitaires (Phase 2)

---

## 📩 Domaine Support / Notifications

### `support_tickets` — Tickets de support
| `id`, `user_id`, `subject`, `message`, `priority`, `status` (`open`/`pending`/`resolved`), `replies[]`, `created_at` |

### `notifications` — Notifications push/in-app
| `id`, `user_id`, `title`, `body`, `type`, `is_read`, `metadata{}`, `created_at` |

### `livechat_messages` — Chat support live
| `id`, `user_id`, `sender_role`, `text`, `is_read`, `created_at` |

### `sos_alerts` — Alertes SOS (Phase 1)
| `id`, `user_id`, `user_role`, `ride_id?`, `lat`/`lng`, `address?`, `message?`, `status`, `created_at` |

### `admin_*_requests` — Sub-collections support admin
- `admin_contact_requests`, `admin_order_help_requests`, `admin_trip_help_requests`, `admin_withdraw_requests` — toutes structurées `{id, user_name, subject/message, status, created_at}`

---

## 📹 Phase 2

### `video_sessions` — Sessions vidéo-consultation (médecin/expert)
| `id`, `user_id`, `provider_id`, `scheduled_at`, `room_id`, `status`, `created_at` |

---

## 🔗 Relations clés (FK soft)

```
users 1───* drivers (user_id)
users 1───* merchants (user_id)
users 1───* rides (user_id passager)
users 1───* rides (driver_id chauffeur)
users 1───1 wallets (user_id)
users 1───* sbpaygo_wallets (user_id, currency)
users 1───* addresses
users 1───* emergency_contacts
users 1───* notifications
users 1───* referrals (referrer_id / referred_id)
users 1───* favorite_drivers

merchants 1───* products
merchants 1───* orders
users 1───* carts (user_id)

rides 1───* ride_messages
rides 1───* ratings
rides 1───* wallet_transactions (via ride_id)

kiosks 1───* rides (kiosk_id) — source kiosk

coupons 1───* coupon_usage
sbpaygo_zones 1───* sbpaygo_wallets
```

---

## 📌 Observations & dette technique

### Inconsistances détectées
1. **Doublon collections** : `carpool_rides` vs config V3Cube qui parle de `carpool_trips` — à harmoniser.
2. **Stockage hybride** : certaines courses (rides) stockent `passenger_name/phone/email` ET référencent `user_id` → snapshot redondant mais utile pour les kiosk guests.
3. **`score_log` inline dans `drivers`** : array max 200 entrées → devrait être sa propre collection `driver_score_events` pour scaling.
4. **`stopovers` inline dans `rides`** : OK pour MVP, sortir si > 5 stopovers.
5. **`replies` inline dans `support_tickets`** : sortir en `support_messages` si conversations longues.
6. **Pas de soft-delete** : aucune collection n'a `deleted_at` — toute suppression est définitive.
7. **`created_at` stocké en string ISO** au lieu de `BSON Date` natif → tri texte qui fonctionne par chance (format ISO 8601 trié lexicographiquement = trié chronologiquement). À migrer vers `BSON Date` pour cohérence.
8. **`merchants.user_id` non strictement UNIQUE en base** (vs `drivers.user_id` qui l'est). À corriger.
9. **Pas de collection `audit_logs`** : aucune trace des actions admin (qui a approuvé un chauffeur, modifié un wallet, etc.).
10. **Pas de collection `notifications_preferences`** : les prefs sont en localStorage côté client uniquement.

### Collections manquantes (recommandées Phase 2 restructure)
- `audit_logs` — toute action sensible (approval driver, wallet adjustment, sponsor activation, …)
- `driver_shifts` — pointage et horaires chauffeur
- `vehicle_inspections` — visites techniques + assurances + permis (avec dates d'expiration)
- `tax_reports` — exports TVA / TAR pour comptabilité
- `subscription_plans` & `user_subscriptions` — abonnements (mentionnés en phase2 mais pas persistés)
- `complaints` — réclamations distinctes des disputes
- `webhooks_events` — log des webhooks reçus (Stripe, Twilio, …) pour idempotence

### Indexes manquants recommandés
- `rides.user_id`, `rides.driver_id`, `rides.booking_no` (UNIQUE), `rides.kiosk_id`
- `drivers.is_online`, `drivers.current_lat/lng` (geo)
- `wallet_transactions.wallet_user_id`, `wallet_transactions.ride_id`
- `notifications.user_id`, `notifications.is_read`
- `orders.user_id`, `orders.merchant_id`, `orders.status`

---

## 🚀 Prochaines étapes (Itération 2 - restructuration safe)

Plan proposé dans `/app/memory/DATABASE_RESTRUCTURE_PLAN.md` (à créer) :
1. **Renommage** des collections inconsistantes (carpool_rides → carpool_trips si V3Cube)
2. **Migration created_at** string → BSON Date avec script idempotent
3. **Création collections manquantes** + endpoints associés
4. **Ajout indexes manquants** au startup
5. **Soft-delete** sur les collections critiques (`users`, `drivers`, `merchants`, `rides`)
6. **Sortie des champs inline** (score_log, stopovers, replies) vers leurs propres collections si volumétrie le justifie
