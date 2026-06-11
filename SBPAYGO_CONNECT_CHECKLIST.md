# SBPAYGO Connect — Pont SB Drive ↔ sbpaygo.com

> Fondation **côté SB Drive** livrée le 2026-06-11. Le module est **désactivé par défaut**
> (feature-flag) et n'affecte AUCUN flux portefeuille existant tant que ton équipe
> SBPAYGO n'a pas livré les points ci-dessous + fourni les identifiants OAuth.

---

## 1. Ce qui est DÉJÀ fait côté SB Drive (prêt, désactivé)

Module : `backend/routes/sbpaygo_connect.py` (testé 7/7).

| Endpoint (préfixe `/api`)            | Rôle                                                              |
|--------------------------------------|------------------------------------------------------------------|
| `GET  /connect/status`               | Indique si la connexion est activée/configurée/liée pour le user |
| `POST /connect/oauth/authorize`      | Renvoie l'URL d'autorisation SBPAYGO (+ `state` anti-CSRF)        |
| `GET  /connect/oauth/callback`       | (public) Reçoit le `code`, échange contre les tokens, les stocke |
| `POST /connect/charge`               | Débite le solde SBPAYGO externe (proxy défensif, ne casse rien)  |
| `POST /connect/unlink`               | Oublie les tokens stockés                                        |

Sécurité : `state` à usage unique (TTL 10 min), tokens stockés par user, tous les
appels sortants en `try/except` + timeout 10 s → l'API SBPAYGO peut tomber sans
jamais bloquer SB Drive.

---

## 2. Ce que TON équipe SBPAYGO doit fournir / créer

### A. Identifiants OAuth2 (à me transmettre — rien à coder côté SBPAYGO si déjà existant)
- [ ] `client_id` + `client_secret` pour SB Drive (client confidentiel)
- [ ] URL d'autorisation (`authorize`) — ex. `https://sbpaygo.com/oauth/authorize`
- [ ] URL du token (`token`) — ex. `https://sbpaygo.com/oauth/token`
- [ ] Enregistrer notre **redirect_uri** : `https://<domaine-sbdrive>/api/connect/oauth/callback`
- [ ] Liste des `scope` supportés (on demande par défaut `openid profile balance payments`)

### B. Endpoint de charge (DÉBIT du solde) — **à créer**
- [ ] `POST /payments/charge` (Bearer token)
  - Entrée : `{ amount, currency, user_id, reference }`
  - Sortie succès : `{ transaction_id, status }` (HTTP 200)
  - Erreur solde insuffisant : HTTP 402/422 avec `{ error }`

### C. Endpoints MANQUANTS signalés (à créer)
- [ ] **Cash-out / retrait** : `POST /payments/payout` (montant, bénéficiaire, devise) → `transaction_id`
- [ ] **Remboursement** : `POST /payments/refund` `{ transaction_id, amount }` → `refund_id`
- [ ] **Consultation du solde** : `GET /balance` → `{ balance, currency }` (pour pré-vérifier avant débit)

### D. Webhooks signés (HMAC) — **à créer**
- [ ] SBPAYGO POST → `https://<domaine-sbdrive>/api/webhooks/sbpaygo`
- [ ] Header `X-SBPAYGO-Signature: hmac_sha256(body, shared_secret)`
- [ ] Événements : `charge.succeeded`, `charge.failed`, `refund.succeeded`, `payout.succeeded`
- [ ] Me fournir le `shared_secret` (validation HMAC côté SB Drive)

### E. Documentation
- [ ] Swagger/OpenAPI accessible (actuellement bloqué par une erreur d'autorisation)
- [ ] Schémas exacts des réponses `charge` (champs, codes d'erreur)

---

## 3. Activation côté SB Drive (quand A→E sont prêts)

Renseigner dans `backend/.env` (puis redéployer) :

```
SBPAYGO_ENABLED="true"
SBPAYGO_CLIENT_ID="<fourni par SBPAYGO>"
SBPAYGO_CLIENT_SECRET="<fourni par SBPAYGO>"
SBPAYGO_AUTHORIZE_URL="https://sbpaygo.com/oauth/authorize"
SBPAYGO_TOKEN_URL="https://sbpaygo.com/oauth/token"
SBPAYGO_CHARGE_URL="https://sbpaygo.com/payments/charge"
SBPAYGO_REDIRECT_URI="https://<domaine-sbdrive>/api/connect/oauth/callback"
```

Tant que ces variables sont vides, tous les endpoints `/connect/*` renvoient 404
et le portefeuille SB Drive fonctionne exactement comme aujourd'hui.

---

## 4. Étape suivante (après activation)
Brancher `attempt_sbpaygo_charge()` comme **secours** dans la complétion de course
(`routes/rides.py`) : si le portefeuille interne est insuffisant ET que l'utilisateur
a lié SBPAYGO, tenter le débit externe avant de générer une dette/espèces. (Non
branché pour l'instant pour ne pas dépendre d'une API partenaire incomplète.)
