# SB Drive VTC — Plan de Restructuration BDD (Itération 2+)

> Plan d'exécution **safe** pour restructurer la base sans casser l'application.
> Chaque étape est **idempotente** et **réversible**, exécutée par un script de migration.

## 🎯 Objectifs

1. Normaliser les noms inconsistants
2. Migrer `created_at` string → BSON Date
3. Créer les indexes manquants critiques
4. Ajouter le soft-delete sur entités sensibles
5. Créer les collections manquantes
6. Externaliser les arrays inline volumineux
7. Générer les endpoints CRUD manquants

---

## Étape 1 — Renommage collections (LOW RISK, 1h)

| Avant | Après | Justification |
|---|---|---|
| (aucun renommage critique identifié) | | |

Note : `carpool_rides` reste tel quel — V3Cube utilise les deux noms indifféremment.

## Étape 2 — Migration created_at en BSON Date (MEDIUM RISK, 2h)

Script `/app/backend/migrations/m001_dates_to_bson.py` :
- Boucle sur chaque collection
- Pour chaque doc, si `created_at` est string, convertir via `dateutil.parser.isoparse` + `update_one`
- Idempotent (skip si déjà BSON Date)
- Log nb conversions par collection

**Adaptation code** : tous les endpoints qui retournent `created_at` doivent ajouter `.isoformat()` ou laisser FastAPI serialize automatiquement (Pydantic gère).

## Étape 3 — Indexes manquants (LOW RISK, 30min)

Ajout dans `core/config.py` startup :

```python
async def ensure_indexes():
    await db.users.create_index("email", unique=True)
    await db.users.create_index("phone", sparse=True)
    await db.users.create_index("referral_code_own", unique=True, sparse=True)
    await db.rides.create_index([("status", 1), ("created_at", -1)])
    await db.rides.create_index("user_id")
    await db.rides.create_index("driver_id")
    await db.rides.create_index("booking_no", unique=True, sparse=True)
    await db.rides.create_index("kiosk_id", sparse=True)
    await db.drivers.create_index("user_id", unique=True)
    await db.drivers.create_index("is_online")
    await db.drivers.create_index([("current_lat", 1), ("current_lng", 1)])
    await db.wallet_transactions.create_index("wallet_user_id")
    await db.wallet_transactions.create_index("ride_id", sparse=True)
    await db.notifications.create_index([("user_id", 1), ("is_read", 1), ("created_at", -1)])
    await db.orders.create_index([("user_id", 1), ("status", 1), ("created_at", -1)])
    await db.orders.create_index("merchant_id")
    await db.kiosks.create_index("session_token", unique=True)
    await db.kiosks.create_index("pin_code")
    await db.coupons.create_index("code", unique=True)
    await db.gift_cards.create_index("code", unique=True)
```

## Étape 4 — Soft-delete (LOW RISK, 1h)

Ajout d'un champ `deleted_at: ISO | null` sur entités critiques :
- `users`, `drivers`, `merchants`, `rides`, `orders`, `kiosks`, `marketplace_listings`

Endpoints DELETE updates :
- Au lieu de `db.X.delete_one({...})` → `db.X.update_one({...}, {"$set":{"deleted_at": now()}})`
- Toutes les queries GET ajoutent un filter `{"deleted_at": None}` (helper `not_deleted()` dans deps).

## Étape 5 — Collections manquantes (MEDIUM RISK, 4h)

### `audit_logs` (admin actions trace)
```python
{
    id: str,
    actor_id: str,      # admin/dispatcher qui a agi
    actor_role: str,
    action: str,        # "driver.approve", "wallet.adjust", "kiosk.delete", …
    target_type: str,   # "driver", "user", "wallet", …
    target_id: str,
    payload_before: object | null,
    payload_after: object | null,
    reason: str?,
    ip_address: str?,
    user_agent: str?,
    created_at: datetime,
}
```
**Indexes**: `(actor_id, created_at)`, `(target_type, target_id)`.

Décorateur Python à ajouter sur les endpoints admin sensibles :
```python
@audit_log("driver.approve")
@router.post("/admin/drivers/{driver_id}/approve")
async def approve_driver(...): ...
```

### `driver_shifts` (pointage)
```python
{
    id: str, driver_id: str,
    start_at: datetime, end_at: datetime | null,
    duration_min: int, total_rides: int, total_earnings: float,
    vehicle_used: str, status: "active" | "ended",
}
```

### `vehicle_inspections` (visite technique + assurance + permis)
```python
{
    id, driver_id, vehicle_id?,
    inspection_type: "technical" | "insurance" | "license" | "registration",
    document_url, valid_from, valid_until,
    status: "pending" | "valid" | "expired" | "rejected",
    reminder_sent_at: datetime | null,
    created_at,
}
```
**Cron job** : alerter chauffeurs 30 jours avant expiration via notification.

### `subscription_plans` & `user_subscriptions`
```python
plans: { id, name, price, duration_days, perks[], is_active }
subscriptions: { id, user_id, plan_id, started_at, expires_at, status, payment_method }
```

### `complaints` (réclamations distinctes de disputes)
```python
{ id, user_id, against_type: "driver"|"merchant"|"platform", against_id, category, message, status, resolution, created_at }
```

### `webhooks_events` (idempotence Stripe/Twilio)
```python
{ id, source: "stripe"|"twilio"|…, event_id UK, payload, status: "received"|"processed"|"failed", error?, processed_at, created_at }
```

### `notifications_preferences`
```python
{ user_id PK, channels: { email: bool, sms: bool, push: bool, in_app: bool }, categories: { ride_updates: bool, promo: bool, news: bool, sos: bool } }
```

## Étape 6 — Externaliser arrays inline (LOW RISK, 2h)

### `drivers.score_log[]` → collection `driver_score_events`
```python
{ id, driver_id, ride_id?, delta_points: int, reason: str, balance_after: int, created_at }
```
**Indexes**: `(driver_id, created_at DESC)`.
**Migration** : foreach driver, foreach score_log entry, insert + clear field.

### `rides.stopovers[]` (optionnel — garder inline si <5)

### `support_tickets.replies[]` → collection `support_messages` (optionnel)

## Étape 7 — APIs manquantes à générer (HIGH VALUE, 6h)

### Notifications
| Méthode | URL |
|---|---|
| GET | `/api/notifications?limit=&offset=&unread=true` |
| POST | `/api/notifications/{id}/read` |
| POST | `/api/notifications/read-all` |
| DELETE | `/api/notifications/{id}` |
| GET/PUT | `/api/notifications/preferences` |

### Audit logs (admin)
| Méthode | URL |
|---|---|
| GET | `/api/admin/audit-logs?actor=&target=&from=&to=&action=` |

### Driver shifts
| Méthode | URL |
|---|---|
| POST | `/api/drivers/shifts/start` |
| POST | `/api/drivers/shifts/end` |
| GET | `/api/drivers/shifts?from=&to=` |
| GET | `/api/admin/drivers/{id}/shifts` |

### Vehicle inspections
| Méthode | URL |
|---|---|
| POST | `/api/drivers/inspections` (upload doc) |
| GET | `/api/drivers/inspections` |
| GET | `/api/admin/inspections?status=&expiring_in_days=` |
| POST | `/api/admin/inspections/{id}/approve` |

### Subscriptions
| Méthode | URL |
|---|---|
| GET | `/api/subscriptions/plans` (déjà partiel) |
| POST | `/api/subscriptions/subscribe` |
| GET | `/api/subscriptions/my` |
| POST | `/api/subscriptions/cancel` |
| GET | `/api/admin/subscriptions` |

### Complaints
| Méthode | URL |
|---|---|
| POST | `/api/complaints` |
| GET | `/api/complaints/my` |
| GET | `/api/admin/complaints?status=` |
| POST | `/api/admin/complaints/{id}/resolve` |

### Tax reports (Billing panel)
| Méthode | URL |
|---|---|
| GET | `/api/admin/tax-reports?from=&to=&format=json\|csv\|pdf` |
| GET | `/api/admin/revenue/breakdown?by=service_type\|driver\|merchant` |

---

## 🗓 Estimation et planning

| Étape | Effort | Risque | Priorité | Phase |
|---|---|---|---|---|
| 2 — created_at BSON | 2h | MEDIUM | P1 | Iter72bis |
| 3 — Indexes | 30min | LOW | P0 | Iter72bis |
| 4 — Soft-delete | 1h | LOW | P1 | Iter72bis |
| 5 — Collections manquantes | 4h | MEDIUM | P0 | Iter73 |
| 6 — Externaliser arrays | 2h | LOW | P2 | Iter74 |
| 7 — APIs manquantes | 6h | LOW | P1 | Iter73 |

**Total : ~16h de dev focused**

## ✅ Critères de validation

À chaque étape :
- [ ] Tests pytest existants verts (régression)
- [ ] Nouveaux tests pour la migration (idempotence + rollback)
- [ ] Lint Python + ESLint clean
- [ ] Documentation `DATABASE_SCHEMA.md` mise à jour
- [ ] CHANGELOG.md daté

## 🛠 Conventions à adopter

- Nommage : `snake_case` partout (cohérent), pluriel pour collections
- IDs : `<entity>_<uuid12 hex>` (ex: `ride_a1b2c3d4e5f6`)
- Dates : BSON Date stocké, ISO string en API
- Soft-delete : `deleted_at: datetime | None`
- Pagination : `?limit=&offset=` ou `?cursor=` (préférer cursor pour scaling)
- Filtre admin : `?status=&from=&to=&q=` (full-text léger)
