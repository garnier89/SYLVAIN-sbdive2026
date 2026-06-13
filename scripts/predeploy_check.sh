#!/usr/bin/env bash
#
# Pre-deploy guardrail — runs the CRITICAL backend flows (rides + ferry + payments)
# against the live ingress before you redeploy. Catches regressions early.
#
# Usage:
#   bash /app/scripts/predeploy_check.sh
#
# Exit code 0 = safe to deploy, non-zero = a critical flow broke (do NOT deploy).
#
set -uo pipefail

BACKEND_DIR="/app/backend"
ENV_FILE="/app/frontend/.env"

# Target the same public URL the app uses (so we test the real ingress + routing).
BACKEND_URL="$(grep '^REACT_APP_BACKEND_URL=' "$ENV_FILE" | cut -d '=' -f2- | tr -d '"' | tr -d "'")"
if [[ -z "${BACKEND_URL}" ]]; then
  echo "❌ REACT_APP_BACKEND_URL introuvable dans ${ENV_FILE}"
  exit 2
fi
export REACT_APP_BACKEND_URL="${BACKEND_URL}"

# Curated critical-path suites (fast, HTTP end-to-end). Keep this list tight.
CRITICAL_TESTS=(
  # Rides — bidding / negotiation
  "tests/test_iter374_rides_bidding.py"
  "tests/test_iter210_bidding_accept_fare.py"
  "tests/test_iter215_bidding_avg_fares.py"
  # Rides — rental (mise à disposition)
  "tests/test_iter374_rides_rental.py"
  # Rides — dead/stale pending erasure
  "tests/test_iter376_expire_dead_rides.py"
  # Rides — payments / cash / debt reconciliation
  "tests/test_iter312_payment_switch.py"
  "tests/test_iter244_cash_gating_refund.py"
  "tests/test_iter249_cash_due_collection.py"
  "tests/test_iter250_cash_due_full_chain.py"
  "tests/test_cancellation_debt_carry.py"
  "tests/test_driver_ride_flow.py"
  # SB Ferry — booking + commission/settlement
  "tests/test_iter365_ferry.py"
  "tests/test_iter368_ferry_commission.py"
)

echo "════════════════════════════════════════════════════════════"
echo "  🚦 SB Drive — Garde-fou de pré-déploiement"
echo "  Cible : ${REACT_APP_BACKEND_URL}"
echo "  Suites critiques : ${#CRITICAL_TESTS[@]} fichiers"
echo "════════════════════════════════════════════════════════════"

cd "${BACKEND_DIR}" || { echo "❌ ${BACKEND_DIR} introuvable"; exit 2; }

python3 -m pytest "${CRITICAL_TESTS[@]}" -q -p no:cacheprovider --no-header
RESULT=$?

echo "────────────────────────────────────────────────────────────"
if [[ ${RESULT} -eq 0 ]]; then
  echo "✅ TOUS LES FLUX CRITIQUES PASSENT — déploiement sûr."
else
  echo "❌ ÉCHEC d'un flux critique — NE PAS déployer avant correction."
fi
echo "════════════════════════════════════════════════════════════"
exit ${RESULT}
