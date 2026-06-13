# Scripts utilitaires SB Drive

## `predeploy_check.sh` — Garde-fou de pré-déploiement

Lance les **flux backend critiques** (courses : enchères, mise à disposition,
paiements/cash/dettes ; SB Ferry : réservation + commission/règlements) contre
l'ingress public, **avant chaque redéploiement** en production.

### Utilisation
```bash
bash /app/scripts/predeploy_check.sh
```

- **Exit 0** → tous les flux critiques passent, déploiement sûr.
- **Exit ≠ 0** → un flux critique est cassé, **ne pas déployer** avant correction.

Durée ~20-25 s. Cible automatiquement `REACT_APP_BACKEND_URL` (`/app/frontend/.env`).

### Maintenir la liste
Les suites couvertes sont dans le tableau `CRITICAL_TESTS` du script. Ajoutez-y
tout nouveau flux critique (un fichier `tests/test_*.py` rapide et E2E HTTP).
