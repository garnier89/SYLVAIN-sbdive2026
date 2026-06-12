# 🔐 Audit Sécurité & Fraude — SB Marketplace Locale
_Date : 2026-06-12 · Périmètre demandé : paiement/wallet (a), comptes (b), chauffeurs/livreurs (c), promos/parrainage/cashback (d), données/accès (e), sécurité trajets (f)._

## Synthèse
La base est solide (auth robuste, logs d'audit, ACL granulaire). **Deux failles CRITIQUES** côté wallet ont été identifiées **et corrigées** dans cette itération. Le reste est priorisé ci-dessous.

---

## 1. Paiement / Wallet (a) — 🔴 CRITIQUE (corrigé)
| # | Risque | Gravité | Statut |
|---|--------|---------|--------|
| W1 | `POST /api/wallet/refund` créditait le wallet de **n'importe quel utilisateur** sans contrôle de rôle → **auto-remboursement illimité** | 🔴 Critique | ✅ Corrigé (admin-only + audit + fraud_event) |
| W2 | `POST /api/wallet/topup` créditait le solde **sans vérification de paiement** (argent gratuit) | 🔴 Critique | ✅ Corrigé (admin-only ; grand public via Stripe `/payments/checkout`) |
| W3 | `/wallet/transfer` sans détection de vélocité (blanchiment/collusion) | 🟠 Moyen | ✅ Atténué (velocity check + fraud_event ; blocage compte) |
| W4 | Mises à jour de solde non atomiques (`$set` après lecture) → double-dépense en concurrence | 🟡 Faible | ⏳ Backlog (passer à `$inc` conditionnel / verrou) |
| ✅ | Topup Stripe (`payments.py`) : montants fixes serveur, crédit idempotent (`payment_status != paid`) | — | Déjà sûr |

## 2. Comptes (b) — 🟢 Bon, améliorations possibles
- ✅ Anti-bruteforce login (email + téléphone) : lockout 15 min après 5 échecs (`login_attempts`).
- ✅ Hash bcrypt, JWT access/refresh, cookies httpOnly+secure+samesite, OTP/lien hashés.
- 🆕 **Blocage de compte** (`is_blocked`) ajouté + enforcement sur opérations financières (pay/transfer).
- ⏳ Backlog : multi-comptes (même device/IP), lockout complet à la connexion pour comptes bloqués (touche l'auth → via integration_expert).

## 3. Chauffeurs / Livreurs (c) — 🟠 À auditer (Phase 2)
- ⏳ GPS spoofing / courses fantômes : pas de détection de saut de position ni de cohérence trajet/temps.
- ⏳ Collusion client-chauffeur (courses répétées entre 2 comptes liés).
- Recommandation : score de cohérence trajet + alerte sur paires récurrentes.

## 4. Promos / Parrainage / Cashback (d) — 🟠 Moyen
- ✅ Parrainage : auto-parrainage bloqué, déjà-parrainé bloqué, récompense **conditionnelle** (après courses) → limite l'abus.
- ⏳ Multi-comptes pour farmer les bonus (pas de check device/IP/téléphone).
- ⏳ Plafond global de cashback/promo par utilisateur et par période.

## 5. Données / Accès (e) — 🟢 Bon
- ✅ ACL granulaire (`acl.py`, `permissions.py`), permissions `super.*`.
- ✅ Audit logs exhaustifs (`audit_logs.py`) avec filtres + RGPD.
- 🆕 Nouvelles permissions `super.fraud.view` / `super.fraud.manage` (dashboard anti-fraude).
- ⏳ Backlog : revue des endpoints sensibles non protégés par permission.

## 6. Sécurité des trajets (f) — 🟡 Partiel
- ✅ SOS / partage de trajet (`trip_share.py`, `student_safety.py`) en place.
- 🔴 SMS d'urgence Twilio : BLOQUÉ (jeton 401) — en attente d'un Auth Token valide.

---

## ✅ Livré dans cette itération (Phase 1)
1. **Failles wallet W1/W2 fermées** (refund & topup → admin-only, fraud_event sur tentative).
2. **Moteur anti-fraude** `core/fraud.py` : `record_fraud_event`, `ensure_not_blocked`, `check_wallet_velocity`.
3. **Blocage de compte** (admin) + enforcement financier.
4. **Tableau de bord admin anti-fraude** (`routes/fraud.py` + `/admin/fraud`) : alertes, risque wallet, blocage/déblocage, résolution d'alertes.
5. Tests : `backend/tests/test_iter300_fraud.py`.

## ⏭️ Prochaines phases proposées
- **P1** : abus promos/parrainage multi-comptes (d) + plafonds cashback.
- **P1** : détection fraude chauffeurs/livreurs (c) — GPS/cohérence trajet.
- **P2** : verrou anti double-dépense wallet (W4) ; lockout complet comptes bloqués (auth) ; revue endpoints.
