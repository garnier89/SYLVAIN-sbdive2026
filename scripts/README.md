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

## Garde-fou automatique — hook git `pre-push`

Pour **bloquer tout push** introduisant une régression sur les flux critiques :

```bash
bash /app/scripts/install_git_hooks.sh
```

Cela installe `scripts/git-hooks/pre-push` dans `.git/hooks/`. À chaque
`git push` (« Save to GitHub »), le hook lance `predeploy_check.sh` et **annule
le push** si un flux critique casse.

- Contournement exceptionnel (doc-only) : `SKIP_PREDEPLOY=1 git push`
- ⚠️ Le déploiement Emergent (bouton Deploy) est géré par la plateforme et
  n'utilise pas ce hook : lancez `bash /app/scripts/predeploy_check.sh`
  manuellement juste avant de déployer.
