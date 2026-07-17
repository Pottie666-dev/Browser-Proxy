#!/usr/bin/env bash
set -euo pipefail
ROOT="${1:-$PWD}"
cd "$ROOT/apps/mobile"
pnpm dlx eas-cli build --platform android --profile preview --environment preview
