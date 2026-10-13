# Stage 4.1 integration and lifecycle baseline

Branch: integration/stage-4-baseline. Parent: 68d1f64a472d1c39d8171db3df6031adbbc974d6. No Stage 5 streaming/control features are introduced. Browser Hub remains isolated remote Chromium; Device Hub remains physical Companion registration, telemetry and consented capture infrastructure. Accounts need no physical phone.

## Consistency and security

Account IDs must be exactly 24 hexadecimal characters or null. Empty strings, malformed/nonexistent IDs and other owners' accounts are refused. MongoDB snapshot/majority transactions cover assignment and account deletion/unassignment. Assignment writes a private revision counter on the target account, forcing concurrent deletion to conflict/retry. Unique indexes enforce one active device per account. The counter is excluded from API responses. Standalone MongoDB cannot safely perform these operations and returns 503: a replica set or sharded cluster is now required. A one-node replica set is suitable for local development, not production redundancy. Browser directory reset follows committed deletion; filesystem cleanup is outside the database transaction and orphan cleanup after failures remains an operational requirement.

Interactive device requests retain their IP limit. Authenticated heartbeats bypass interactive/global quotas, use a device-ID quota (12/min), and retain failed-authentication IP throttling (120/min). Counters are process-local: distributed rate limits and durable owner device/pairing quotas remain production work. Tests exercise 32 devices/320 heartbeats behind one IP, independent per-device throttling, interactive throttling and continued heartbeat access.

Companion uses a synchronized generation coordinator around pairing/rotation/clearing, with network I/O outside the state lock. Clearing invalidates late responses. Token, HTTPS origin and rotation schedule persist in one AES-GCM encrypted record backed by Android Keystore. Existing valid Stage 4 records migrate without losing credentials on failed migration writes. Failed persistence does not report success. Stale revocation cannot clear newer credentials. Lost registration/rotation responses may require a new pairing code; review/revoke orphan device registrations in Device Hub. Local Forget is not server revocation. Heartbeat results explicitly distinguish connected, unpaired, revoked and stale responses. Revoked/unpaired services stop instead of announcing success.

## Reproducible Android dependencies/builds

Expo SDK 54 / RN 0.81.5 and PNPM 10.28.2 remain in use. BlurView version-2.0.6 is built from official https://github.com/Dimezis/BlurView commit afc19dc45718b739d818af324a4cd0f85dafd653 (annotated tag object f5f7a44f37e39bf9fc8bfa226b5ae56c7760c6f3). Apache-2.0 license and upstream source checksums are retained in apps/mobile/vendor/blurview. Java/resources are unchanged; manifest package moves to the modern Gradle namespace. A PNPM expo-blur patch and repeatable Expo plugin link this module. No blur functionality, TLS validation or checksum verification is removed.

Gradle 8.14.3 distribution checksum is pinned from the official distribution metadata: bd71102213493060956ec229d946beee57158dbd89d0e62b91bca0fa2c5f3531. Use JDK 17, SDK/build tools 36, NDK 27.1.12297006 for controller, and `pnpm run android:development`. Set JAVA_HOME/ANDROID_HOME and PNPM store configuration appropriate to the host. Preserve managed proxy and CA trust. The script checks frozen installation, generated clients/typechecks, prebuild and both builds. Build signing is local development signing: equivalent reproducible inputs/commands do not imply identical APK bytes across machines/signing keys.

Controller build successfully compiles the local BlurView module, but cannot finish in this cloud runtime: Maven Central redirects RN react-android-0.81.5-debug.aar to repo.reactnative.dev, which returns HTTP 403 under the active network policy. This host was saved in the environment draft, preserving existing domains. Publish the environment configuration to enable it, then retry. Companion assembleDebug, unit tests and lint pass. No controller APK or physical-device validation is claimed.

## Dependency backports

Upstream metadata offers no patched versions for the three current advisories. PNPM patches mitigate the observed code paths with tests:
- node-forge GHSA-86w9-cpqp-85rv: validate nested DigestAlgorithm element count and NULL payload; valid signatures still verify.
- braces GHSA-vfj7-8cjw-p6xm: bound parser depth and public AST walkers, including cyclic/external AST inputs; normal expansion remains compatible.
- sprintf-js GHSA-hp3w-g68c-fv3c: bound numeric precision before ECMAScript formatting; normal formatting preserved.

Version-based `pnpm audit` still reports 2 high/1 moderate/0 critical. No advisories are suppressed and no zero-vulnerability claim is made. Replace these backports with reviewed official fixes when available; tested entry points do not certify every vendored distribution/browser bundle.

## Browser Hub release packaging

`pnpm run api:release /absolute/new/release-directory` builds and performs frozen production deployment without replacing an existing artifact. The API files whitelist includes dist and both browser helpers/preflight, while runtime dependencies (including playwright-core, Pino and mongoose) are retained. RELEASE.json records runtime file hashes. Run `node apps/api/tools/deployment-check.mjs` inside the release with MONGODB_URI and a dedicated BROWSER_PROFILE_ROOT. Preflight checks runtime modules, helpers, Chromium, host network/PID/IPC namespaces, private writable storage and replica-set support. It cannot prove disk encryption; operator must provide encrypted persistent storage/backups, a valid encryption key, trusted HTTPS, approved proxy routing and DoH configuration.

Host Linux must support Bubblewrap and Chromium sandbox namespaces/seccomp. Do not disable sandbox or replace required proxy/DNS with direct routing. Generic restricted Docker hosts may not support nested namespaces; passing a host preflight is not certification of another deployment platform. Default active Chromium capacity is three; measure resources before increasing. No public CDP/ADB/control ports.

Cloud preflight passes all six checks. A production release smoke test starts the packaged API with fresh replica-set data and an explicitly approved loopback fixture proxy, launches real confined Chromium, retrieves a frame, closes/restarts API and verifies persistent account/tab state. This is not live provider IP/DNS or encrypted-volume certification.

## Verification and hardware acceptance

Full suite: 60 passed, zero failed/skipped. Confinement suite: 13 passed (overlaps full suite). Release artifact smoke: 1 passed. Workspace typechecks, codegen, API/workspace builds and Android Hermes export pass. Companion native tests: 9 passed, including generation/race/recovery cases; lint has warnings, no errors. Controller build is blocked as above.

Before Stage 5:
1. Publish required dependency/API host settings, finish controller APK, and review this PR before merging.
2. Install both development apps on a Samsung A25 and the other five phones; pair separately to trusted HTTPS, assign/unassign and verify Browser Mode without a phone.
3. Test revoked/expired tokens, local Forget during network loss/rotation, process death/relaunch, migration from Stage 4, connectivity loss and same-Wi-Fi fleet presence.
4. Check notification permission denial, visible presence/capture notifications and Stop/Disconnect actions; no capture restoration after reboot.
5. Exercise MediaProjection consent, screen rotation, app-window sharing, protected-screen blanking and accessibility activation/deactivation. No remote commands are enabled.
6. Verify production proxy IP/DNS, fail-closed behavior, encrypted storage and resource capacity on the actual deployment host.

Then implement Stage 5 short-lived authorized WebRTC signaling, live streams and session-bound control, while retaining both hubs' regression gates.
