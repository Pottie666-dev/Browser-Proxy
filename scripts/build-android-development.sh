#!/usr/bin/env bash
set -euo pipefail
# Use caller-provided SDK/JDK/proxy trust. Never disable TLS or invent credentials.
: "${JAVA_HOME:?Configure JDK 17}"
: "${ANDROID_HOME:?Configure Android SDK 36}"
if ! "$JAVA_HOME/bin/java" -version 2>&1 | head -1 | grep -q '"17'; then echo "JDK 17 is required" >&2; exit 1; fi
pnpm install --frozen-lockfile --strict-peer-dependencies
pnpm run codegen
pnpm run typecheck
CI=true EXPO_NO_TELEMETRY=1 pnpm run mobile:prebuild
./apps/android-companion/gradlew -p apps/android-companion :app:assembleDebug :app:testDebugUnitTest :app:lintDebug --max-workers=2 --no-daemon
./apps/mobile/android/gradlew -p apps/mobile/android :app:assembleDebug -PreactNativeArchitectures=arm64-v8a --max-workers=2 --no-daemon
# Development signing is local; this does not promise identical APK bytes across signing keys.
sha256sum apps/android-companion/app/build/outputs/apk/debug/app-debug.apk apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk
