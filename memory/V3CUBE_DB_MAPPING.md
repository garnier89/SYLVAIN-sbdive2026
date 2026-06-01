# SB Drive VTC — Mapping V3Cube ↔ MongoDB

> **Source** : dump `sbdriv5_db2024.sql` (51 MB décompressé, MariaDB 10.11, charset utf8mb4)
> **224 tables V3Cube** → **56 collections MongoDB** déjà mappées
> **Date d'analyse** : Jun 1, 2026

## 📊 Vue d'ensemble

| Catégorie | V3Cube | MongoDB actuel | Écart |
|---|---|---|---|
| Auth & Users | 9 tables (`user_*`, `administrators`, `register_*`, `member_log`) | `users`, `login_attempts` | **−7 (ACL granulaire manquante)** |
| Trips/Rides | 18 tables (`trips`, `trip_*`, `trips_*`) | `rides`, `ride_messages`, `ratings` | **−15 (logs détaillés, status, locations)** |
| Drivers | 18 tables (`driver_*`) | `drivers`, `favorite_drivers` | **−16 (subscriptions, insurance, manage_timing)** |
| Bidding | 7 tables (`bidding_*`) | `bidding_posts`, `bidding_offers` | **−5 (drivers, services, ratings, media)** |
| Admin ACL | 10 tables (`admin_*`, `admin_pro_*`) | `panel_preference` champ user | **−9 (vraie ACL granulaire)** |
| Parking | 9 tables (`parking_*`) | `parking_reservations` | **−8 (durations, ratings, vehicle_size)** |
| Hotel | 2 tables (`hotel`, `hotel_banners`) | `kiosks` (proche) | **−1 (banners hôtel)** |
| Subscriptions | 2 tables (`package_type`, `plan_purchase_master`) | (aucun) | **−2 (manquant complet)** |
| Configuration | 7 tables (`configurations*`) | `app_configurations`, `service_configs` | **OK (avec versioning manquant)** |
| Emails / SMS / WhatsApp | 5 tables | `service_configs.email-templates` etc. | **−4 (WA templates)** |
| Tax / Finance / Wallet | 7 tables | `wallets`, `wallet_transactions`, `payment_transactions` | **−4 (payment_requests, payout audit)** |
| Coupon / Rewards | 6 tables | `coupons`, `coupon_usage`, `gift_cards`, `referrals` | **OK** |
| Currency / Language | 5 tables | `service_configs.currency`, `service_configs.language` | **−3 (i18n labels)** |
| Marketplace / Rentitem | ~12 tables | `marketplace_listings` (résumé) | **−11 (sous-tables : fields, images, status_log)** |
| Documents | 2 tables (`document_list`, `document_master`) | `drivers.documents[]` inline | **−2 (workflow validation)** |
| Other (76 misc) | 76 | divers | À auditer cas par cas |

**TOTAL gap théorique : ~95 tables manquantes** sur 224 V3Cube — mais seulement ~30 ont une vraie valeur produit (le reste est de la duplication, des logs internes V3Cube, ou du legacy).

---

## 🎯 Tables V3Cube prioritaires à intégrer (gain produit max)

### P0 — Manquantes critiques (8 collections)

1. **`administrators` + `admin_groups` + `admin_permissions` + `admin_group_permission`**
   → Collection **`admin_users`** + **`admin_roles`** + **`admin_permissions`**
   - ACL granulaire pour les 7 panels (résout la dette technique iter72 : tous les comptes panel ont `role='admin'`)
   - Permet "dispatcher_alice n'accède qu'au panel dispatch et aux endpoints associés"
   - Champs essentiels : `permissions: ["dispatch.view", "dispatch.assign", "billing.view", …]`

2. **`driver_subscription_plan` + `driver_subscription_details`**
   → Collections **`subscription_plans`** + **`driver_subscriptions`**
   - Plans payants par chauffeur (commission 0% sur les courses, badge VIP, etc.)
   - Champs : `plan_id, driver_id, started_at, expires_at, status, auto_renew, payment_method`

3. **`driver_insurance_report` + `driver_doc` + `document_master`**
   → Collection **`driver_documents`** (sort `drivers.documents[]` inline)
   - Workflow validation : `uploaded → under_review → approved | rejected → expiring → expired`
   - Reminders auto J−30/J−7 avant expiration

4. **`driver_manage_timing`**
   → Collection **`driver_shifts`** (déjà dans `RESTRUCTURE_PLAN.md`)
   - Pointage + horaires hebdomadaires

5. **`trips_status_logs` + `trips_driver_settlement_log` + `user_status_logs`**
   → Collection **`audit_logs`** (déjà dans le plan iter74)
   - Trace exhaustive des changements d'état (acceptance, completion, settlement)

6. **`trip_call_masking` + `masking_numbers`**
   → Collection **`call_masking_sessions`**
   - Pool de numéros virtuels Twilio pour anonymiser les appels chauffeur ↔ client
   - Critique pour GDPR / RGPD

7. **`emergency_contact_data`**
   → ⚠️ Déjà couvert par `emergency_contacts` mais champs additionnels V3Cube : `country_code`, `is_primary`, `notify_on_sos`

8. **`pushnotification_log` + `notification_sound`**
   → Collection **`notification_log`**
   - Idempotence + retry policy (lié à FCM/OneSignal à venir)
   - Sons configurables (différents pour SOS / ride / promo)

### P1 — Améliorent l'existant (12 collections)

9. **`city` + `country` + `state` + `location_master`**
   → Collections référentielles **`countries`** + **`states`** + **`cities`** seedées
   - Permet sélecteur cascade pays→état→ville lors de l'inscription
   - Joindre aux `addresses` et `kiosks`

10. **`language_master` + `language_label` + `language_label_other` + `language_page_details`**
    → Collection **`i18n_translations`**
    - Labels traduits stockés en base au lieu de fichiers JSON statiques
    - Permet ajout d'une langue sans redéploiement

11. **`rental_package` + `package_type`**
    → Collection **`rental_packages`**
    - Locations courte/longue durée (heures/jours/semaine/mois) pour la cat. "Location véhicule"

12. **`vehicle_size_info` + `vehicle_size_price_info`**
    → Sous-doc dans `vehicle_types` : `size: { length, width, height, max_load_kg }` + grille tarifaire par taille
    - Utile pour Runner / livraison colis (tarif selon le volume)

13. **`airport_location_master` + `airportsurcharge_fare`**
    → ⚠️ Déjà couvert par `airport_zones` + `flat_rates` mais champs additionnels : `terminal_id`, `pickup_lane`, `dropoff_lane`

14. **`rent_items_category` + `rentitem_post` + `rentitem_images` + `rentitem_fields`**
    → Refonte de **`marketplace_listings`** (sortir les images en collection dédiée)
    - Sortir le tableau `images[]` en **`marketplace_listing_images`** (1:N)
    - Permet zoom HD, ordre, primary image flag

15. **`gopay_otp_logs`**
    → Sous-doc dans **`login_attempts`** ou collection dédiée **`otp_logs`**
    - Trace des OTP envoyés (SMS bill audit)

16. **`reward_campaign` + `reward_settings`**
    → ⚠️ Déjà partiellement dans `service_configs.rewards` mais V3Cube a une vraie collection campaign (date début/fin + cible + multi-règles)

17. **`travel_preferences` + `travel_preferences_category`** (climatisation, musique, conversation, …)
    → Sous-doc dans **`users.preferences`** ou collection dédiée
    - Personnalisation expérience passager

18. **`multi_level_referral_master`**
    → ⚠️ Notre `referrals` est plat. V3Cube supporte MLM 5 niveaux (parrain → filleul → petit-filleul, etc.) avec commission décroissante

19. **`organization` + `company`**
    → Collection **`organizations`** (B2B multi-tenant)
    - Permet "Hôtel Carbet a 5 chauffeurs dédiés + ses propres tarifs + sa propre facturation"
    - Champs : `name, type, contract_terms, commission_pct, parent_org_id?`

20. **`hotel` + `hotel_banners`**
    → ⚠️ Notre `kiosks` couvre le concept "borne" mais pas le concept "hôtel partenaire global" (un hôtel peut avoir 3 bornes + ses propres tarifs)
    - Sortir une collection **`partner_venues`** parent + `kiosks` enfants

### P2 — Nice-to-have (utiles mais non bloquants)

- `seo_sections`, `master_lng_pages`, `pages` → CMS pages publiques (déjà via `LandingPage.js`)
- `faq_categories`, `faqs` → Module FAQ public
- `voice_direction_files` → Navigation vocale TTS in-ride
- `live_activity_device_tokens` → Push iOS Live Activities + Android persistent notif
- `wa_message_templates`, `wa_default_message_templates` → WhatsApp Business API
- `parking_durations`, `parking_user_vehicle` → Si Phase Parking développée

---

## 🚫 Tables V3Cube à **ne pas** importer

Ces tables sont des artifacts internes V3Cube ou de la dette technique :
- `configurations_old`, `configurations-livebackup`, `configurations_logs` → versioning à faire à part
- `backup_database`, `all_database_details`, `log_file`, `request_data_debug`, `data_storage_engine` → debug interne
- `register_driver`, `register_user` → tables transitoires (notre `users` est unifié)
- `member_login_session_log` → traces auth (déjà couvert par `login_attempts`)
- `home_content`, `homecontent`, `home_screens`, `app_home_screen_view`, `app_screen_master`, `app_launch_info` → UI dynamique mobile, on a notre propre LandingPage React
- `home_driver` → idem
- `passenger_requests`, `request_post_data` → buffer transitoire
- `temp_item_image`, `idproof_images`, `prescription_images` → stockage fichiers (déjà dans /api/files)
- `setup_info`, `content_cubexpro_details` → metadata install V3Cube
- `lang_conversion_process` → process interne migration langues

---

## 🛠 Plan d'implémentation recommandé (4 itérations)

### Itération 74 — ACL granulaire (P0 #1) — 4h
- Créer collections `admin_users`, `admin_roles`, `admin_permissions`
- Migrer les 6 comptes démo `panel_*@superapp.com` vers `admin_users` avec rôle ciblé + permissions précises
- Helper Python `require_permission("dispatch.assign")` à utiliser sur les endpoints
- Frontend : décorateur `<RequirePermission perms="dispatch.assign">` pour cacher boutons
- **Bénéfice** : vraie séparation des rôles, audit GDPR

### Itération 75 — Audit logs + Driver workflow (P0 #3, #4, #5) — 6h
- Créer `audit_logs`, `driver_documents`, `driver_shifts`
- Décorateur `@audit_log("action_name")` sur endpoints admin
- API CRUD documents avec workflow validation
- Cron job d'expiration documents (notification J−30/J−7)
- **Bénéfice** : conformité, traçabilité, professionnalisation

### Itération 76 — Subscriptions + Multi-tenant (P0 #2 + P1 #19) — 6h
- Collections `subscription_plans`, `driver_subscriptions`, `organizations`
- Endpoints CRUD + checkout Stripe pour abonnements chauffeurs
- Multi-tenant : tarifs spéciaux + commission par organisation
- **Bénéfice** : nouvelle source de revenus (10-50€/mois/chauffeur en abonnement)

### Itération 77 — Internationalisation + Référentiels géo (P1 #9, #10) — 4h
- Collections `countries`, `states`, `cities` (seed depuis V3Cube SQL ; ~250 pays, ~5000 villes principales)
- Collection `i18n_translations` + endpoint `/api/i18n/{lang}` retournant tous les labels d'un coup
- Migration frontend : remplacer les hardcoded FR par des `t("key")` dynamiques
- **Bénéfice** : scaling international (Maroc, Sénégal, Espagne, …)

### Itération 78+ — P2 (call masking Twilio, FAQ, voice direction)
À planifier selon priorités business

---

## 📁 Fichiers de référence créés

- `/app/_v3cube_db/db2024.sql` (51 MB extrait — peut être supprimé après usage)
- `/app/_v3cube_db/v3cube_tables.txt` (liste des 224 tables, ordre d'apparition)
- `/app/_v3cube_db/v3cube_sorted.txt` (liste triée alpha)
- Ce fichier `/app/memory/V3CUBE_DB_MAPPING.md`

## 🔎 Comment exploiter le SQL V3Cube davantage

Pour récupérer le schéma exact d'une table V3Cube spécifique (ex: comprendre les colonnes de `admin_permissions`) :
```bash
grep -A 30 "CREATE TABLE \`admin_permissions\`" /app/_v3cube_db/db2024.sql | head -40
```

Pour récupérer des données de seed (référentiels city/country/state) :
```bash
grep -A 1 "^INSERT INTO \`city\`" /app/_v3cube_db/db2024.sql | head -5
```

Pour générer un Pydantic model à partir d'un CREATE TABLE :
1. Extraire les colonnes via regex
2. Mapper MySQL types → Python : `int` → `int`, `varchar` → `str`, `text` → `str`, `tinyint(1)` → `bool`, `datetime` → `datetime`, `decimal` → `float`
3. Adapter snake_case (V3Cube utilise `iColumnName` Hungarian, à normaliser)
