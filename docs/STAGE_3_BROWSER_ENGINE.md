# Stage 3 — Persistent browser engine and account isolation

## Branch and foundation

Branch: `development/stage-3-browser-isolation`, from Stage 2 commit `46a477e0ef4525a43e703c35f816466955562015`. Existing Stage 1/2 account APIs, authentication, encryption, generated clients, native bridge and fingerprint generator are preserved. No merge, reset or source replacement was performed.

Browser Mode uses no physical-device assignment or emulator. Each account owns a persistent remote Chromium profile. Android phones remain a separate future Companion/Device Hub implementation.

## Why the engine is remote

The tracked native BrowserProfile module contains a JavaScript bridge and module descriptor, but no Android Kotlin implementation. It remains in place for future work.

Android WebView's `setDataDirectorySuffix` is process-wide and must be called before any `android.webkit` use. Android's documented API rejects changing it after initialization; different processes cannot share a directory. This was checked against [AOSP WebView source](https://github.com/aosp-mirror/platform_frameworks_base/blob/master/core/java/android/webkit/WebView.java) and the installed Android SDK. A single Expo/UI process cannot safely switch fifty data directories. Planning folders or clearing JavaScript cookies does not provide isolation.

The implemented alternative is one Chromium browser process, user-data directory, egress gateway and network namespace per active account. The Expo controller displays authenticated screenshots and sends bounded input commands. Website JavaScript and storage never execute inside its standard WebView. The existing WebView/native bridge and unfinished fingerprint code are retained; they are not silently used as a fallback if the isolated worker fails.

## Implemented browser and storage behavior

- Profile paths are keyed by validated owner ID and account ID, with private filesystem permissions. A file lock prevents two workers using the same directory. Another owner cannot open the account through API routes.
- Real Chromium cookie storage includes HttpOnly cookies. Chromium maintains localStorage, IndexedDB, HTTP cache and service-worker registration/cache data in the dedicated directory.
- Real tabs share storage only within their account. Tab identifiers, active selection, history, bookmarks and downloads are persisted in an AES-GCM encrypted manifest. Chrome's native session restoration is reused to recover navigation history where available.
- SessionStorage uses native Chromium session restoration, with native CDP DOMStorage observation for encrypted checkpoints. Playwright’s startup blank URL is omitted during recovery, and mobile viewport settings are applied through CDP without recreating the first restored tab. No cross-origin session-data injection is used.
- Navigation, redirects, forms, regular cookie-based login, popup tabs, touch/tap, vertical scroll and focused-field typing operate in a real browser. Back/forward status comes from Chromium navigation history. The controller preserves the existing account browser toolbar, tabs, bookmarks/history drawers and reset controls. Actual remote URLs retain their query strings; a website cannot spoof the address bar by adding its own `url` parameter.
- Uploads use the website's real file chooser and selected controller files, limited to 3 MB per controller request. Downloads are routed by the account browser, capped at 50 MB using native download progress/cancellation, encrypted after completion and accessible only through owned authenticated endpoints. Temporary shared copies in the controller cache are removed after sharing.
- Browser identity uses the account's existing stable user agent, locale and timezone plus a mobile touch viewport. It does not assert physical-phone equivalence, spoof every hardware characteristic or promise undetectability. Legacy identity/fingerprint code remains available for future integration.
- Changing account/proxy configuration closes affected live profiles; mutation guards and revision checks reject queued stale configurations. Removing a required proxy retains the account reference, so browsing fails until explicit reassignment/unassignment. Logout closes that owner's live workers; a normal close flushes data instead of clearing it.
- Default capacity is three active processes, configurable up to 32 per worker. Inactive profiles stay on disk independently of active process capacity. The controller closes its worker session when its browser screen unmounts; idle sessions close after fifteen minutes. Fifty saved accounts do not require fifty continuously running processes. Each active profile is limited to twenty tabs; unrequested popup blocking remains enabled.
- Legacy API browser-state data is preserved. Its history seeds a new profile. Unscoped legacy cookie/localStorage captures are not guessed into website origins.

## Network boundary

Every Chromium process is launched through `tools/chromium-namespace-wrapper.mjs`. Production cannot disable its network namespace or Chromium sandbox through an account setting. Bubblewrap gives it private network/PID/IPC namespaces, private temporary storage, limited read-only OS assets and only its own profile directory. Other profile directories and API secret files are not mounted. API/database/encryption credentials are not passed to Chromium's environment. CDP uses pipes; no debugging or device-control TCP endpoint is exposed.

The namespace has only loopback. A namespace-local TCP relay reaches one owned Unix-domain gateway socket. Chromium cannot directly dial the host LAN, external TCP/UDP or a resolver. QUIC and non-proxied WebRTC UDP are disabled additionally; browser flags are not the sole boundary.

The gateway validates HTTP(S) targets, rejects private/reserved addresses and credentials in destination URLs, limits ports to 80/443, checks all returned DNS addresses and connects to the vetted IP. Every new redirect/subresource connection undergoes these checks. HTTPS stays end-to-end: the gateway does not strip website TLS validation or rewrite HTML/cookies. HTTP and HTTPS use CONNECT through an assigned HTTP/HTTPS upstream proxy. Basic proxy authentication is confined to that upstream hop and never forwarded to the origin. HTTP upstream proxies carry that login over plain TCP; prefer HTTPS upstreams or an operator-controlled encrypted tunnel/VPN. WebSocket/WSS forwarding is implemented, but application-specific socket behavior still needs broader compatibility testing.

Destination DNS uses HTTPS JSON DNS queries through that same proxy, with an operator-configured public bootstrap address. The TLS name is verified. No local destination-DNS fallback occurs when the proxy or DNS service fails. Initial upstream-proxy hostname resolution may use the worker host resolver; public proxy addresses are validated and pinned, with the original TLS name preserved. Explicitly approved private upstream gateways are an operator trust decision, not an account-controlled SSRF bypass.

Explicit direct egress is available only when the operator sets `BROWSER_ALLOW_DIRECT=true` and no assigned/inherited proxy exists. It still uses the validating gateway and pinned public DNS results. A failed or disabled required proxy never switches to direct egress. SOCKS5 records remain supported as stored configuration but browser transport refuses them until a verified implementation exists.

The egress-verification endpoint navigates a separate page through the actual profile route to an operator-selected verifier, accepts only a public IP response and returns the observation timestamp and DNS mode. It reports an observation, not a fabricated/fake account IP. Public IP and DNS routing were tested using controlled TLS/proxy/DNS fixtures here; no live external proxy/provider or geographic DNS behavior was certified.

## Configuration and startup

Stage 2 MongoDB, ownership, TLS and encryption requirements still apply. Supply actual values securely through process configuration; `.env` is not automatically loaded.

| Setting | Purpose |
| --- | --- |
| `BROWSER_ENGINE_ENABLED=true` | Enable owned browser endpoints only after host security setup. |
| `BROWSER_PROFILE_ROOT` | Dedicated absolute writable profile directory, on encrypted storage with encrypted backups. |
| `CHROMIUM_EXECUTABLE_PATH` | System Chromium under `/usr/`; default `/usr/bin/chromium`. |
| `BROWSER_NAMESPACE_WRAPPER` | Optional absolute helper override for packaged deployments; ship both helper files. |
| `BROWSER_MAX_ACTIVE` | Concurrent-process capacity, default 3. |
| `BROWSER_ALLOW_DIRECT` | Default false; direct transport requires explicit operator authorization. |
| `BROWSER_TRUSTED_PROXY_AUTHORITIES` | Exact comma-separated approved private gateway `host:port` entries. |
| `BROWSER_DOH_ENDPOINT` | HTTPS JSON DNS resolver endpoint, for example Cloudflare's `/dns-query`. |
| `BROWSER_DOH_BOOTSTRAP_IP` | Public fixed address for that resolver; destination DNS does not bootstrap via host DNS. |
| `BROWSER_IP_CHECK_URL` | Trusted HTTPS verifier returning a plain public IP or JSON `ip`. |
| `EXPO_PUBLIC_API_URL` | HTTPS API origin for the controller. |

Install a distro Chromium and bubblewrap on the existing Linux host, configure its supported unprivileged namespaces/Chromium sandbox and create the dedicated profile directory for the API service user. Keep the API behind HTTPS and MongoDB privately authenticated. The API package must retain `playwright-core` at runtime; it is externalized from esbuild because its driver loads resources dynamically. Deploy `apps/api/tools` alongside `apps/api/dist`. Start from `apps/api` using its package script, or supply the helper's absolute path.

Chromium's native databases and active/incomplete downloads are ordinary filesystem data. Manifest/completed-download encryption does not encrypt the entire native profile. Host-volume and backup encryption are mandatory operational requirements for production; they were not configured here. Apply host CPU/memory/disk quotas in addition to the application’s active-profile/tab caps before serving untrusted sites at scale. A string setting cannot certify an encrypted disk. Do not rotate `ACCOUNT_ENCRYPTION_KEY` without migrating manifests/downloads and verifying recovery.

A clean API shutdown flushes and closes workers. Following a hard crash, do not delete profiles or blindly remove locks. Confirm the recorded worker/browser processes are gone and that no other host uses the directory before an operator removes only orphan `engine.lock`/`egress.sock` runtime entries. Unrecognized/live locks fail closed. Shared multi-host profile storage, distributed locking and automatic hard-crash repair are not implemented.

## API contract

All operations require Stage 2 bearer authentication and account ownership:

- `GET /api/accounts/:id/browser` — start/restore and read tab/history/bookmark/download status.
- `POST .../commands` — validated browser operations; arbitrary evaluation is not exposed.
- `GET .../frame` — no-store authenticated JPEG.
- `POST .../verify-egress` — timestamped actual-route IP observation.
- `DELETE .../session` — flush and close without clearing persistent data.
- `DELETE .../profile` — explicit destructive reset of that account's browser data/downloads.
- `GET .../downloads/:downloadId` — owned completed file.

OpenAPI plus generated React Query and Zod clients include these operations and account proxy URLs. The legacy HTML-fetch `/api/proxy` route remains registered for compatibility; the mobile browser now uses the complete remote engine rather than that limited route.

## Validation and current blockers

Checks were run on this Stage 3 branch from the exact Stage 2 foundation above. The final delivery commit contains the verified sources and lockfile.

| Validation | Result |
| --- | --- |
| Frozen installation / strict peers | Passed with PNPM 10.28.2. |
| Generated clients | Reproduced byte-for-byte after two code-generation runs; formatting is part of the script. |
| Workspace typechecks, API build, sandbox build | Passed. |
| Expo Android Hermes JavaScript export | Passed; this is not an APK. |
| Bundled Expo SDK compatibility (offline) | Passed; online Expo/EAS checks are not certified. |
| Full regressions with real MongoDB and confined Chromium | 53 passed, zero failed/skipped (48 API cases plus five compatibility/landing cases). |
| Dedicated confined-browser/kernel checks | 13 passed, zero failed/skipped; twelve browser cases rerun under confinement plus the kernel boundary check. |
| Android prebuild | Passed. |
| Android debug APK | Blocked by dependency-host HTTP 403, detailed below. |

Tests include HTTP cache and CacheStorage separation/recovery, HttpOnly cookies, IndexedDB, service workers, multiple-origin sessionStorage, tabs/bookmarks/back-forward recovery, real touch coordinates/typing, TLS forms/file transfer, separate proxy credentials, proxy-routed DNS, proxy failure without direct fallback, origin reset, URL spoof prevention, legacy identity defaults, directory locks, owner denial and all Stage 2 regressions.

The automated suite runs real Chromium 154.0.8037.57, controlled HTTPS origins, two separately authenticated upstream proxies, a TLS DNS fixture and real local MongoDB 8. The test certificate is trusted by its exact fixture public-key fingerprint only; production has no certificate-bypass setting. Sandbox/network overrides are constructor-only and rejected outside `NODE_ENV=test`.

The normal tool filesystem sandbox makes namespace UID mapping read-only. A supported execution escalation allowed actual host verification: the complete per-account wrapper, Unix gateway and Chromium sandbox ran successfully with unchanged production sandbox defaults. Kernel tests observed loopback as the only network interface, rejected direct TCP/UDP/DNS with `ENETUNREACH`, and confirmed sibling profiles and API marker files were absent. Chromium's internal report showed namespace, PID/network and seccomp-BPF sandboxes enabled. Yama ptrace protection was reported absent; include host hardening in the production review. No production sandbox-disabling flag was added. Profile storage paths (including symlinks) that resolve into mounted OS assets are refused. Deployment secrets must also stay outside those OS asset/configuration directories.

Run `BROWSER_TEST_CONFINED=true MONGO_TEST_URI=<new-empty-fixture-db> pnpm test`, then `pnpm run test:browser:confined` on a namespace-capable Linux host. In this managed environment these checks require the supported execution escalation rather than weakening sandbox controls. The standard fixture runner has explicit test-only overrides for restricted development sandboxes; production constructor settings reject those overrides. The confined check runs the same storage/proxy regressions with the real boundary and separately checks kernel network/filesystem isolation.

Android prebuild passed. SDK 36, build-tools 36, NDK 27.1.12297006 and checksum-verified Microsoft JDK 17 were prepared locally. Debug APK assembly reached native dependency resolution and failed because the environment returns HTTP 403 for `www.jitpack.io` and `central.sonatype.com` while resolving Expo BlurView. The existing blur feature was preserved. An additive domain draft was saved alongside the earlier `api.github.com` requirement; saving did not apply or publish it. Review/save that draft in environment settings and publish before retrying. No APK, EAS build, Samsung A25 installation or physical testing is claimed.

The prepared APK command, after network access is applied, is:

```bash
cd apps/mobile
CI=true EXPO_OFFLINE=1 pnpm exec expo prebuild --platform android --no-install
cd android
JAVA_HOME=/workspace/.jdk17-browser-proxy/usr/lib/jvm/msopenjdk-17-amd64 \
ANDROID_HOME=/workspace/.android-sdk-browser-proxy \
ANDROID_USER_HOME=/workspace/.android-user-browser-proxy \
GRADLE_USER_HOME=/workspace/.gradle-browser-proxy \
JAVA_TOOL_OPTIONS='-Djavax.net.ssl.trustStore=/workspace/.gradle-browser-proxy/cacerts -Djavax.net.ssl.trustStorePassword=changeit -Dhttps.proxyHost=proxy -Dhttps.proxyPort=8080 -Dhttp.proxyHost=proxy -Dhttp.proxyPort=8080' \
./gradlew :app:assembleDebug -PreactNativeArchitectures=arm64-v8a --max-workers=2 --no-daemon
```

Those paths/truststore are cloud setup artifacts, not production dependencies or committed credentials. The proxy CA was added to a copied Java truststore; TLS verification remained enabled. For another host use its SDK/JDK/proxy/trust configuration. Debug development clients load the current controller JavaScript through Metro and need the HTTPS API setting; they are not standalone production releases.

Remaining dependency findings are unchanged: zero critical, two high (`node-forge`, `braces`) and one moderate (`sprintf-js`) in mobile tooling chains, with no patched versions listed by the registry. They remain visible, not suppressed.

## Supported versus pending

Supported and exercised: independent real profile stores; persistent cookies including HttpOnly, localStorage, IndexedDB, caches and service workers; ordinary HTTP/HTTPS navigation/redirects; account-specific Basic-auth proxies; encrypted proxy-routed DNS; blocked private destinations/rebinding; failed-proxy denial; owner-enforced API access; browser tab/history/bookmark recovery; text/forms/file transfer through controlled fixtures.

Deployment/device validation remains required for the target deployment host, real provider IP/DNS verification, production TLS/encrypted profile storage, controller gestures/keyboards/file sharing, Android lifecycle and network-loss recovery. SessionStorage for partitioned third-party iframe storage is not promised beyond native browser lifetime. Hard-crash locks require reviewed recovery. Full media streaming/audio, DRM, arbitrary browser extensions, camera/microphone/geolocation grants, WebAuthn hardware keys, drag-and-drop/pinch/selection gestures, corporate NTLM/Digest proxy auth, SOCKS and high-volume/unlimited file transfer are not implemented or certified. WebSocket forwarding needs additional integration coverage. Normal website controls can be operated through screenshot input, but this is a modest-frame-rate controller, not a low-latency video stream.

The next product priority is Stage 4: physical Android Companion pairing, explicit permissions, device registration/assignment and telemetry, then the six-device WebRTC dashboard. Keep that separate from browser-only accounts. Resolve the browser deployment/APK prerequisites before describing Stage 3 as production-ready.
