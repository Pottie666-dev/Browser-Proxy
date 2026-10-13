# Browser-Proxy

Browser-Proxy is an account-first browser and physical Android device management platform. Every account must support Browser Mode; assigning a physical phone adds Android Mode. Browser-only accounts do not require a phone. Changing browser attributes does not guarantee that websites identify accounts as separate physical devices.

The primary development lineage is `restructure/monorepo`. Stage 1 recovery is preserved at `81e38a840dc29dd4de8d44222c3ea8684e74b4c6`; Stage 2 security/database development is on `development/stage-2-security`. Development branches require owner approval before merging.

Existing account management, identity generation, tabs, bookmarks, history, browser-state persistence, standard WebView and unfinished native BrowserProfile code are preserved. Stage 2 adds authentication, ownership enforcement and encrypted database storage. Stage 3 adds a real persistent Chromium process/profile per account, proxy-routed DNS, fail-closed transport and remote controller integration. Its production namespace/sandbox boundary and device behavior require deployment validation. Historical documents describing virtualization or completed isolation are design/history, not verified product guarantees.

## Setup and verification

Use Node >=20.19 and PNPM 10.28.2. Configure the API using [the environment template](apps/api/.env.example); production requires MongoDB, a backed-up 32-byte encryption key, and an HTTPS API origin. Set `EXPO_PUBLIC_API_URL` to that HTTPS origin before building the controller. Localhost HTTP is permitted only in development; physical phones need HTTPS.

```bash
pnpm install --frozen-lockfile --strict-peer-dependencies
pnpm run codegen
pnpm run typecheck
pnpm run build
pnpm test
```

To include real database regressions, set `MONGO_TEST_URI` to a new **empty** database named `browser_proxy_test_…`. The test suite drops that fixture database after testing and refuses existing data. Without this setting, the real MongoDB suite is skipped; this is not full validation.

Read [Stage 2 results and operating requirements](docs/STAGE_2_SECURITY.md) before migrating legacy data and [Stage 3 browser support and setup](docs/STAGE_3_BROWSER_ENGINE.md) before browser deployment. No real legacy migration or production deployment has been performed.

## Roadmap

1. Security and database stabilization (Stage 2).
2. Persistent browser isolation, browser completion and verified proxy/DNS routing (Stage 3).
3. Physical Android Companion, explicit permissions and installable APK (Stage 4).
4. WebRTC streaming, authorized remote interaction and reconnection (Stage 5).
5. Unified accounts, browser and Device Hub dashboard (Stage 6).
6. Battery monitoring, supported external charging controls and fleet tests (Stage 7).
7. Security review, device/EAS builds, deployment and recovery verification (Stage 8).

Existing documentation and native browser implementation history remain in `docs/`. No hardware functionality is implied by a successful JavaScript export.

## Physical Android Companion

Stage 4 adds a separate Kotlin Android app (`com.browserproxy.companion`), Device Hub and secure device registration. Build, pairing steps and supported limitations: [Stage 4 Companion](docs/STAGE_4_ANDROID_COMPANION.md). Browser-only accounts continue using the isolated Stage 3 Chromium engine without device assignment.
