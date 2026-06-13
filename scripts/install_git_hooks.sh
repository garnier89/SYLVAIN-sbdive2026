#!/usr/bin/env bash
# Installe les hooks git versionnés de scripts/git-hooks/ dans .git/hooks/.
# Usage : bash /app/scripts/install_git_hooks.sh
set -euo pipefail

REPO_ROOT="/app"
SRC="${REPO_ROOT}/scripts/git-hooks"
DEST="${REPO_ROOT}/.git/hooks"

if [[ ! -d "${REPO_ROOT}/.git" ]]; then
  echo "❌ Pas de dépôt git dans ${REPO_ROOT}"; exit 1
fi

mkdir -p "$DEST"
for hook in "$SRC"/*; do
  name="$(basename "$hook")"
  cp "$hook" "$DEST/$name"
  chmod +x "$DEST/$name"
  echo "✅ Hook installé : $name"
done
echo "Terminé. Les hooks s'exécuteront automatiquement (pre-push lance le garde-fou)."
