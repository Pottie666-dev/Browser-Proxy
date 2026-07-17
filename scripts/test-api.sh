#!/usr/bin/env bash
set -euo pipefail
BASE="${1:-${EXPO_PUBLIC_API_URL:-}}"
[ -n "$BASE" ] || { echo "Usage: bash scripts/test-api.sh https://api-url"; exit 1; }
BASE="${BASE%/}"
curl -fsS "$BASE/api/healthz"; echo
curl -fsS "$BASE/api/accounts"; echo
