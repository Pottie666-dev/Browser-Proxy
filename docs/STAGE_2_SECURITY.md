# Stage 2 — Security and database stabilization

## Foundation and scope

Development branch: `development/stage-2-security`, created from verified Stage 1 commit `81e38a840dc29dd4de8d44222c3ea8684e74b4c6`. Its parent is the current implementation `199b1ccf37cfe278283445e680a6994d3a98b8d6`. The earlier working reference remains `bb49eda85fece3232f9b3807dfd15f897d884864`.

Stage 1 was pushed to `origin/stabilization/stage-1-recovery`. GitHub PR creation targeting `restructure/monorepo` was attempted through GraphQL and REST and failed with HTTP Forbidden because this cloud environment blocks `api.github.com`. An additive allowlist draft was saved for environment review. The active policy has not changed. Neither primary branch was merged or reset. Stage 2 does not depend on that merge.

This stage secures the existing implementation. It does not complete browser storage/process isolation, proxy transport, Android Companion, streaming, or device charging. Existing native browser module, identity engine and browser UX remain preserved.

## Implemented behavior

- MongoDB-backed user registration (explicitly gated), login, session refresh, logout and current-user endpoints. Passwords use salted scrypt. Random opaque access/refresh tokens are stored only by SHA-256 digest; access lasts 15 minutes and refresh lasts seven days. Refresh is single-use and invalidates the prior access token. Disabled users cannot use sessions.
- Account, browser-state and proxy CRUD enforce the authenticated owner on every lookup/update/delete. PUT compatibility remains alongside PATCH. Unknown ownership, MongoDB operators and forged immutable fields cannot be supplied through API updates. Unowned legacy records stay inaccessible pending an explicit migration.
- Account passwords, ID numbers, images, proxy URLs, cookies, browser state and metadata use AES-256-GCM with random nonces and authenticated owner/record/field context. Proxy usernames and passwords are encrypted; responses never disclose proxy passwords. API owner responses still expose the account credentials needed by the existing Account Vault.
- MongoDB is mandatory outside explicit isolated test mode. Startup validates the key/database configuration, connects to MongoDB and initializes indexes before accepting traffic. Connection failures cannot silently fall back to volatile storage. Session/grant/audit expiration uses MongoDB TTL indexes with application-level expiry checks.
- Short-lived, one-use, account-scoped browser grants exchange for signed HttpOnly/SameSite cookies (Secure in production). They are bound to the active API session, so logout, refresh or disabling the owner revokes authorization. API bearer tokens are not passed to upstream websites. These grants are browser navigation authorization, not Android remote-session authorization.
- Helmet, bounded request bodies, allowlisted CORS, no-store responses, safe errors and redacted request logging. Rate limits are 300 requests/minute globally and 20/minute for login/register/refresh. Forwarded IP headers are not trusted. Audit records contain actor/action/target identifiers, not credentials; retention is 90 days.
- Server outbound requests reject private/reserved/loopback/mapped IPv6/metadata targets, URL credentials, unsafe schemes and nonstandard ports. All DNS answers must be public, connection lookup is pinned to a vetted address, and each redirect is revalidated. Responses are bounded to 15 MB, requests to 15 seconds and redirects to five.
- Assigned account proxies or inherited HTTP(S) proxy settings fail closed until verified transport is integrated. No direct fallback occurs, including before DNS resolution for inherited proxy settings. This intentionally returns 503 rather than pretending proxy routing works. Proxy checks remain explicitly unchecked. It does not prevent arbitrary direct subresource connections by the current WebView; that is a Stage 3 blocker.
- Existing Expo controller gains an authentication gate, native SecureStore session storage, in-memory web sessions, serialized refresh/keychain updates, cache clearing on owner change and HTTPS login enforcement. Account editing fetches data through the authenticated API instead of placing credentials/PII in route parameters. Generated client bearer tokens are confined to the configured API origin. Password generation uses cryptographic randomness.
- OpenAPI authentication contracts and generated React Query/Zod clients are synchronized. Orval explicitly targets Zod 3 and React Query 5 to preserve the existing runtime.
- PNPM 10.28.2 makes the one-day minimum-release-age policy enforceable. Platform packages for normal Linux/macOS/Windows and ARM development are restored. EAS PNPM versions are aligned. Dependency patches adapt Expo plist parsing to fixed XML APIs and Metro image reading to image-size v2; regression tests cover real file-backed assets.
- The mobile landing server ignores untrusted forwarded host/protocol headers, escapes template values and self-hosts its existing QR library with license, registry integrity and bundle digest instead of executing a CDN script.

## Configuration and operations

Supply values securely; `.env*` files are ignored except `.env.example`. No credentials are checked in.

| Variable | Requirement |
| --- | --- |
| `MONGODB_URI` | Real MongoDB URI with authenticated least-privilege access; use TLS for nonlocal deployment. |
| `ACCOUNT_ENCRYPTION_KEY` | Exactly 32 random bytes encoded as base64 or 64 hexadecimal characters. Store outside source control and back it up securely. |
| `PUBLIC_API_ORIGIN` | Canonical HTTPS origin for publicly bound production API. |
| `CORS_ORIGINS` | Comma-separated explicit controller origins; no wildcard credentials. |
| `ALLOW_REGISTRATION` | Default false. Enable only for intentional onboarding, then disable. No default user/password exists. |
| `HOST` / `PORT` | Production bind and port; put the API behind a configured TLS ingress. |
| `EXPO_PUBLIC_API_URL` | HTTPS API origin embedded in the controller build; no secrets belong in Expo public settings. |

A proxy-injected credential placeholder is not a usable encryption key. Key changes require a planned decrypt/re-encrypt migration and verified backups; silently rotating the key makes existing data unreadable. Do not log keys, tokens, database URIs or account fields. The API does not automatically load `.env`; the process/deployment must inject configuration.

TLS termination must actually be configured; an HTTPS environment string does not install a certificate. The API intentionally does not trust forwarded client IPs. Behind a shared ingress this gives conservative aggregate limits; configure only verified ingress addresses if individual client limits are needed. In-memory rate counters are per process and require a shared store for a multi-instance deployment.

### Legacy ownership/encryption migration

Back up and verify database recovery first. Create the intended authenticated user during controlled onboarding, then obtain its ID from `/api/auth/me`. Review which legacy records belong to that user; a single owner assignment must not be used for a multi-owner database without a reviewed mapping.

```bash
pnpm run db:migrate --owner-id <existing-user-id>
# Only after owner approval, backup and dry-run review:
pnpm run db:migrate --owner-id <existing-user-id> --apply
```

Default is dry-run. The tool considers unowned records and plaintext sensitive fields already owned by that user in `accounts` and `proxies`. It does not touch other owners or delete records. Preflight occurs before writing; ambiguous already-encrypted unowned data is refused. Writes check original owner/updatedAt to refuse concurrent edits. Quiesce legacy writers for migration: this is not a transactional all-or-nothing migration, and a mid-run conflict can leave a partially applied, restartable batch. No migration was run against real user data; only disposable fixtures were used.

## Validation results

Environment: Node 24.19.0, PNPM 10.28.2, Linux. All checks ran on `development/stage-2-security` based on the Stage 1 hash above; the delivery commit contains this exact verified source and lockfile.

- Frozen installation with strict peer checks: passed.
- OpenAPI generation and workspace typechecks (including migration tooling): passed.
- API build, sandbox production build and Expo Android Hermes JavaScript export: passed. This is not an APK or an EAS/device validation.
- Expo SDK compatibility check with `CI=true EXPO_OFFLINE=1`: passed against bundled SDK metadata. Online Expo checks remain unavailable under the managed network policy.
- `MONGO_TEST_URI=mongodb://127.0.0.1:27018/browser_proxy_test_stage2 pnpm test`: 36 tests passed, zero failures/skips (31 API tests including real MongoDB subtests, five compatibility/landing tests).
- Database tests used official `mongo:8.0`, digest `sha256:d0d926f94df099bff534b7ee5b5986458131a22489dfff8664509af0c1e2ca9c`, bound only to local loopback. They verified real persistence across API restart, encrypted database values, indexes/session behavior, cross-owner denial, proxy credential masking, grant replay/tamper/revocation, refresh replay/expiry, disabled users, legacy migration, CORS/body limits/rate limits and audit persistence.
- Account regressions preserve CRUD, partial PUT/PATCH behavior, browser-state isolation in the API, history limits and stable fingerprint patches.
- Security unit tests verify authenticated encryption/tamper/context binding, password hashing, configuration fail-closed behavior, private-network rejection and DNS connection pinning. Inherited proxy failure was tested before DNS. Public outbound streaming and live proxy IP/DNS were not tested here.
- Client tests verify API-origin token confinement, rejection of protocol-relative credential leakage and appropriate 401 notifications. Device SecureStore/UI behavior has not been exercised on hardware.

## Remaining findings and limitations

Dependency audit began with 118 findings (13 critical, 67 high, 33 moderate, five low). After remediation: **zero critical, two high, one moderate**. These are not suppressed:

| Dependency / installed path | Severity / advisory | Status |
| --- | --- | --- |
| `node-forge@1.4.0`, Expo CLI | High, [GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv) | Registry lists no fixed version. |
| `braces@3.0.3`, Expo Metro file-map/micromatch | High, [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) | Registry lists no fixed version. |
| `sprintf-js@1.0.3`, React Native babel-jest/Istanbul/js-yaml/argparse | Moderate, [GHSA-hp3w-g68c-fv3c](https://github.com/advisories/GHSA-hp3w-g68c-fv3c) | Listed vulnerable through 1.1.3; registry lists no fixed version. |

All reported paths are mobile development/build tooling chains; the workspace audit is not clean. Keep builds restricted to trusted projects/inputs and monitor upstream fixes. No safe remediation was fabricated by removing browser/native features or hiding advisories. A filtered PNPM audit invocation is unsupported; these are whole-workspace audit results and paths, not a separately certified deployed API dependency scan.

Additional production gaps:

- Existing WebView/native profile implementation does not yet establish persistent process/storage isolation, HTTP-only cookie export, IndexedDB/cache/service-worker separation or independent network egress. API owner isolation tests are not browser-engine isolation tests.
- Current HTML-fetch proxy is not a complete browser transport (forms, authentication cookies, uploads/downloads, subresource routing and IP/DNS verification remain). Blocking unverified configured proxy traffic is intentional protection; direct WebView traffic must be addressed before proxy guarantees.
- API database/credential protections are tested, but real hosted MongoDB TLS, least privilege, encrypted disks/backups and recovery have not been configured or verified. Names/email/notes and other nonsensitive account labels remain ordinary database fields; use storage/backup encryption for full-database confidentiality.
- Account recovery, MFA, all-device session revocation UI and operational alerting are not yet implemented. Browser grants are scoped navigation access, not Device Hub pairing/control authorization.
- No physical device was available. SecureStore behavior, mobile sign-in/logout, WebView grant/cookie behavior, Samsung A25 native installation and permissions require device testing. No Companion APK, MediaProjection permission, WebRTC remote control or charging capability is claimed.
- GitHub PR creation is blocked by cloud outbound policy until the saved `api.github.com` allowance is reviewed/published. Branch pushing works; merge remains forbidden without owner approval.

## Next stage

Stage 3 should implement persistent per-account browser-engine/process storage and complete the browser transport while preserving the custom native code. Add automated two-account cookie (including HttpOnly), localStorage, IndexedDB, cache/service-worker and session-recovery tests. Verify proxy egress IP/DNS and failed-proxy leak prevention with a controlled network fixture before enabling configured transport. Complete forms/auth/uploads/downloads and Android device smoke tests before declaring the browser finished. Continue monitoring the three unresolved dependency advisories; production readiness remains gated on security review.
