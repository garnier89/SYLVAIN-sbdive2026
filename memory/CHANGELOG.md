# CHANGELOG

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
