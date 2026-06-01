# CHANGELOG

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
