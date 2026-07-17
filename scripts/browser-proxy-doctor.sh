#!/usr/bin/env bash
set -euo pipefail
ROOT="${1:-$PWD}"
cd "$ROOT"
pnpm run typecheck:libs
pnpm --filter @workspace/browser-app typecheck
pnpm --filter @workspace/api-server typecheck
cd apps/mobile
pnpm dlx expo-doctor@latest
