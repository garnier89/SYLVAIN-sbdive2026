# CHANGELOG

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
