# Stage 4 Android Companion

Foundation: development/stage-3-browser-isolation at 992aba0334a599434ec700f5e80f5a1f5ea1a6ca. Companion package: com.browserproxy.companion; Android 8/API 26+, target 35. Separate native Kotlin app, no shared WebView, no browser-engine changes.

## Pair a phone

1. Deploy the existing API with MongoDB, HTTPS, account encryption key and a controller user. Do not expose debugging ports. Companion refuses HTTP, redirects and invalid TLS certificates. Same-Wi-Fi phones still require a trusted HTTPS origin reachable from the phones.
2. Sign into the controller, open Device Hub and create a pairing code. Code is a 256-bit random secret, expires in five minutes and is consumed once. Copy it privately into Companion with the HTTPS API origin. No camera/QR scanning permission is necessary.
3. Pair each phone separately. Device tokens are distinct from controller sessions, hashed in MongoDB and AES-GCM encrypted with Android Keystore locally; backup is disabled. Tokens expire after 30 days and rotate after seven days while the Companion activity or a user-started foreground service is running. A failed/lost rotation response requires re-pairing; old tokens are never restored.
4. Select an owned account in Device Hub and assign a device, or leave it unassigned. Assignment is optional, one active device per account; all browser-only behavior remains independent. Revocation invalidates the token and clears assignment immediately. Forgetting local credentials is not server revocation.
5. Screen capture requires fresh system MediaProjection consent. Optional accessibility activation opens Android settings for manual enablement. Notification permission is requested on Android 13+. Android foreground-service notices/system capture indicators remain active even if notification permission is denied. Use Stop to release the projection. Reboot/process death does not restore consent.

## Supported now

Owner-filtered devices, one-time registration, atomic token rotation, revocation, optional assignment, 30-second activity/presence/capture-service heartbeats, server-derived offline status after 90 seconds, battery/charging/temperature/model/version telemetry, explicit permission UI, capture foreground service, virtual-display/ImageReader pipeline (frames drained, not transmitted), stop notification and accessibility service declaration. HTTPS outbound only, no listening device-control/ADB ports. Reconnection retries while an activity or consented capture service is alive. API audit events record actions without codes/tokens.

## Limitations requiring Stage 5 / hardware

No WebRTC, signaling, live viewer, touch, typing or app navigation commands yet. Accessibility service intentionally has no command receiver; it cannot retrieve window content or bypass protected screens. Capture may be blank for FLAG_SECURE/protected content. Screen size/rotation, permission dialogs, Samsung A25 behavior, notification visibility, thermal/battery accuracy, process death and network recovery must be tested on real phones. No physical phones are connected to this cloud environment.

Use Start persistent connection for an explicit foreground presence service with a Disconnect notification action. It uses Android specialUse with a declared fleet-monitoring rationale; distribution through Google Play would require review of this use. Without a user-started foreground service or visible activity, Android may stop heartbeats; Device Hub correctly shows offline. Services are not automatically restarted after reboot or process death; reopen and reconnect. OEM background restrictions and battery optimization require hardware validation. No reboot auto-capture. Charging reports do not control hardware charging. No root required. Device status is self-reported, not hardware attestation.

Mongo unique indexes enforce assignment uniqueness. Concurrent account deletion/assignment can leave a stale reference without a transaction; controller displays absent accounts as unassigned. A transaction-backed assignment/delete lifecycle is still required before production. Pairing creation currently uses per-IP limits, not durable owner quotas; production multi-node rate limiting remains pending.

## Build

Use JDK 17, SDK 36 and Gradle 8.14.3; `cd apps/android-companion && ./gradlew :app:assembleDebug`. Google Maven and Maven Central only. Debug APK: app/build/outputs/apk/debug/app-debug.apk. Install locally using Android's package installer or locally authorized USB; never expose ADB over public networks. Debug builds use development signing and require a production signing/release process later.

The controller's Expo SDK 54 expo-blur 15.0.8 requires BlurView version-2.0.6 from JitPack. The active cloud allowlist does not include jitpack.io/www.jitpack.io or its Sonatype fallback; previous HTTP 403 is an environment access denial, not evidence that the version is broken. The saved environment draft includes these host additions but must be published to activate them. No TLS/checksum bypass, dependency removal, or unverified artifact substitution was used. Companion APK is independent of this dependency.

## Cloud validation evidence

On development/stage-4-android-companion: frozen PNPM installation, code generation, workspace typechecks, API/esbuild and Android Hermes export pass. Full Stage 1–4 regressions: 54 pass, zero failures/skips; confined Chromium subset/kernel checks: 13 pass. Native Companion assembleDebug, testDebugUnitTest (2 pass), and lintDebug pass (11 warnings, no errors). Device regressions use a new empty local MongoDB fixture and verify replay/expired pairing refusal, token scope, ownership, assignment/unassignment, invalid telemetry, offline presence, hashed persistence, rotation and revocation.

Controller native build was attempted offline against the prepared toolchain and fails because BlurView version-2.0.6 is not cached; Stage 3's online attempt received HTTP 403 from the unallowed dependency hosts. Repeated denied online requests were avoided because the active policy has not changed. Review/save and publish the existing environment host additions before retrying online. No controller native APK is claimed.

Existing JavaScript dependency audit: 0 critical, 2 high, 1 moderate (node-forge, braces and sprintf-js inherited from Expo/Metro/RN tooling). No advisories were suppressed. Production release remains blocked on this dependency remediation, transaction-safe assignment lifecycle, durable distributed rate limits/owner quotas, signed releases and physical-device acceptance testing.
