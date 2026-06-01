# SB Drive VTC — Diagramme Base de Données

> **Version 1.0 (Jun 1, 2026)** — Diagramme Mermaid ER de l'écosystème complet.
> Visualisable directement sur GitHub ou via Mermaid Live Editor : https://mermaid.live/

## 🌍 Vue d'ensemble (entités principales)

```mermaid
erDiagram
    users ||--o| drivers : "1:1 (role=driver)"
    users ||--o| merchants : "1:1 (role=merchant)"
    users ||--|| wallets : "1:1"
    users ||--o{ sbpaygo_wallets : "1:N par devise"
    users ||--o{ addresses : "favoris"
    users ||--o{ emergency_contacts : "SOS"
    users ||--o{ rides : "passager"
    users ||--o{ rides : "chauffeur"
    users ||--o{ orders : "commandes"
    users ||--o{ ratings : "donne"
    users ||--o{ notifications : "reçoit"
    users ||--o{ referrals : "parrain/parrainé"
    users ||--o{ favorite_drivers : "favoris"
    users ||--o{ support_tickets : ""
    users ||--o{ sos_alerts : "déclenche"
    users ||--o{ gift_cards : "achète"

    drivers ||--o{ rides : "assigné"
    drivers ||--o{ favorite_drivers : "favori de"

    merchants ||--o{ products : "vend"
    merchants ||--o{ orders : "reçoit"

    rides ||--o{ ride_messages : "chat"
    rides ||--o{ ratings : "noté"
    rides ||--o{ wallet_transactions : "paye"

    kiosks ||--o{ rides : "source=kiosk"

    coupons ||--o{ coupon_usage : "utilisé"

    sbpaygo_zones ||--o{ sbpaygo_wallets : "config"

    orders ||--o| carts : "panier source"

    users {
        string id PK
        string email UK
        string phone
        string role
        string panel_preference
        bool is_verified
    }
    drivers {
        string id PK
        string user_id FK_UK
        string status
        bool is_online
        float rating
        int points
        string palette
    }
    rides {
        string id PK
        string booking_no
        string user_id FK
        string driver_id FK
        string status
        float estimated_fare
        float final_fare
        string payment_method
        string source
        string kiosk_id FK
    }
    kiosks {
        string id PK
        string hotel_name
        string pin_code
        string session_token
        bool active
    }
    wallets {
        string user_id PK
        float balance
    }
    merchants {
        string id PK
        string user_id FK
        string store_type
        bool is_active
    }
```

---

## 🚗 Domaine Rides détaillé

```mermaid
erDiagram
    rides ||--o{ ride_messages : "chat in-ride"
    rides ||--o{ ratings : ""
    rides ||--o{ wallet_transactions : "paiement"
    rides }o--|| users : "passager (user_id)"
    rides }o--o| users : "chauffeur (driver_id)"
    rides }o--o| kiosks : "source"
    rides }o--o| coupons : "promo utilisée"

    bidding_posts ||--o{ bidding_offers : "marketplace négo"
    bidding_posts }o--|| users : "demandeur"

    rides {
        string id PK
        string status "pending|accepted|arriving|in_progress|completed|cancelled"
        list stopovers
        bool pool_enabled
        float tip_amount
        int auto_dispatch_tier
        list offered_to_drivers
        list penalized_drivers
        list negotiations
        string start_otp
    }
```

---

## 💰 Domaine Finance détaillé

```mermaid
erDiagram
    users ||--|| wallets : ""
    users ||--o{ wallet_transactions : ""
    users ||--o{ sbpaygo_wallets : "par devise"
    sbpaygo_zones ||--o{ sbpaygo_wallets : ""
    rides ||--o{ wallet_transactions : "via ride_id"

    payment_methods ||--o{ payment_transactions : ""
    payment_transactions }o--|| users : ""

    finance_config {
        string key PK
        object value
    }
    sbpaygo_zones {
        string id PK
        string name
        string country
        string currency
        bool is_active
        float min_topup
    }
    wallet_transactions {
        string id PK
        string wallet_user_id FK
        string type "topup|pay|transfer|refund"
        float amount
        string ride_id FK
        string order_id FK
    }
```

---

## 🛒 Domaine Marketplace & Services (catalogues sponsorisables)

```mermaid
erDiagram
    %% Tous ces catalogues partagent le schéma SPONSORING (is_featured, featured_until, featured_priority)
    beauty_salons ||..|| marketplace_listings : "même pattern sponsoring"
    pet_providers ||..|| marketplace_listings : "même pattern"
    car_services ||..|| marketplace_listings : "même pattern"
    towing_partners ||..|| marketplace_listings : "même pattern"
    nearby_businesses ||..|| marketplace_listings : "même pattern"
    ondemand_services ||..|| marketplace_listings : "même pattern"
    carpool_rides ||..|| marketplace_listings : "même pattern"

    users ||--o{ runner_orders : "client"
    users ||--o{ intercity_bookings : ""
    users ||--o{ parking_reservations : ""
    users ||--o{ service_bookings : ""

    marketplace_listings {
        string id PK
        string category "real-estate|cars|items"
        string type "Vente|Location"
        float price
        bool is_featured
        datetime featured_until
        int featured_priority
    }
    service_bookings {
        string id PK
        string user_id FK
        string category
        string provider_id FK
        datetime scheduled_at
        string status
    }
```

---

## 🏨 Domaine Kiosk (SB Drive Tab)

```mermaid
erDiagram
    kiosks ||--o{ rides : "source=kiosk"
    kiosks ||--o{ users : "guest users créés"

    kiosks {
        string id PK
        string hotel_name
        string address
        float lat
        float lng
        string pin_code "4-6 digits"
        string language
        string currency
        string image_url
        string session_token "URL token"
        bool active
        int total_bookings
    }
```

---

## 📩 Domaine Support / Notifications

```mermaid
erDiagram
    users ||--o{ support_tickets : ""
    users ||--o{ notifications : ""
    users ||--o{ livechat_messages : ""
    users ||--o{ sos_alerts : ""
    rides ||--o{ sos_alerts : "associé"

    users ||--o{ admin_contact_requests : "envoie"
    users ||--o{ admin_withdraw_requests : ""
    users ||--o{ admin_trip_help_requests : ""
    users ||--o{ admin_order_help_requests : ""

    notifications {
        string id PK
        string user_id FK
        string title
        string body
        string type
        bool is_read
        object metadata
    }
```

---

## ⚙️ Domaine Config (référentiels seedés au startup)

```mermaid
erDiagram
    vehicle_categories ||--o{ vehicle_types : "1:N"
    nearby_categories ||--o{ nearby_businesses : ""
    master_service_categories ||--o{ ondemand_services : ""

    app_configurations {
        string key PK
        object value
    }
    service_configs {
        string key PK
        object value
        datetime updated_at
    }
    vehicle_categories {
        string id PK
        string slug UK
        string name
        string icon
        int order_index
    }
    vehicle_types {
        string id PK
        string slug
        string category_id FK
        string label
        float base_fare
        float price_per_km
        int seats
    }
```

---

## 🎯 Légende des cardinalités

| Notation Mermaid | Signification |
|---|---|
| `||--||` | 1:1 strict |
| `||--o|` | 1:0..1 (optionnel à droite) |
| `||--o{` | 1:0..N |
| `||--|{` | 1:1..N |
| `}o--||` | N:1 obligatoire |
| `}o--o|` | N:0..1 |
| `||..||` | relation faible (même pattern) |

## 📌 Notes d'architecture

1. **Schéma denormalisé** : MongoDB privilégie les documents imbriqués (ex: `stopovers[]` dans `rides`, `replies[]` dans `support_tickets`). FK soft via string id, pas de contraintes référentielles strictes.
2. **Sponsoring transversal** : 8 catalogues (`beauty_salons`, `pet_providers`, …) partagent les 3 champs `is_featured` / `featured_until` / `featured_priority` → tri auto + auto-expiry au passage de l'endpoint public.
3. **Kiosk Guest Users** : créés à la volée via phone lors d'un `POST /api/kiosk/{token}/book` (flag `is_kiosk_guest=true`). Pas de password (placeholder `$kiosk_guest$`).
4. **Score Log inline** : `drivers.score_log[]` plafonné à 200 entrées (slice au push) — à externaliser si scaling.
5. **Phase B (panels)** : pas de nouvelle collection, juste un champ `panel_preference` sur `users` (admins).

Pour visualiser ces diagrammes :
1. Coller le bloc Mermaid sur https://mermaid.live/
2. OU ouvrir ce fichier sur GitHub (rendu Mermaid natif)
3. OU utiliser l'extension VS Code "Markdown Preview Mermaid Support"
