# Stage 4.2 Android APK and carrier-network readiness

Foundation: integration/stage-4-baseline at a0a821af9190ea5608d82f98d92ce53c593cad78. Stage 4.2 branch: development/stage-4-2-hardware-readiness. PR #2 must not be merged as part of this work.

## Artifact provenance and installation

The controller hardware APK uses the release Gradle variant with an embedded Hermes bundle and DEVELOPMENT signing. It runs without Metro, local discovery or shared Wi-Fi. This is not a production signed release. Companion is a debug development APK. Both support arm64 Android phones (Companion min API 26; controller min API 24, target API 36). The signed artifact metadata/actual manifest is authoritative. APK inputs use Expo SDK 54.0.35, RN 0.81.5, PNPM 10.28.2, JDK 17, Gradle 8.14.3 with pinned official ZIP checksum, SDK 36 and NDK 27.1.12297006.

RN coordinates are com.facebook.react:react-android:0.81.5, release/debug AAR according to variant, resolved through Maven Central. Its debug AAR redirects to the official repo.reactnative.dev host. Stage 4.1's 403 no longer reproduces: a ranged official request returns HTTP 206 through the managed proxy with TLS verification retained. The downloaded RN release AAR SHA256 matches its official Maven Central .sha256 metadata: a4da05bc571946aa1034c0d7be46593719105fb9e81d58aded9183c85a1f04fc. Artifact provenance verifies this cached AAR hash before publication. No mirror, untrusted binary, checksum override or disabled TLS was used. Native bundle failures from telemetry writing to read-only HOME and relative Babel preset resolution were repaired using supported CI/telemetry settings and explicit resolution from pinned Expo. BlurView remains pinned official licensed source at afc19dc45718b739d818af324a4cd0f85dafd653.

The Android hardware readiness GitHub Actions workflow uses pinned official checkout/setup/upload actions and uploads both APKs, SHA256SUMS, PROVENANCE.json and this guide. Artifacts expire after 30 days and require GitHub download access. Never publish diagnostic logs, pairing codes, auth/device tokens or database/profile data as build artifacts. This public source repository cannot provide a private GitHub release asset; CI artifacts are the selected distribution mechanism. Hardware APKs contain no production endpoint credentials; the controller asks for its public HTTPS API origin before sign-in. Sessions are bound to that origin; changing it clears local authentication and caches. Legacy sessions without an identifiable API endpoint require reauthentication.

Verify `sha256sum -c SHA256SUMS` before installation. Use the Android package installer (temporarily allow installation from the selected download source, then turn that permission off), or locally authorized USB:

```sh
adb install -r BrowserProxy-controller-hardware.apk
adb install -r BrowserProxy-companion-hardware.apk
```

Install controller only on phone A and Companion on phones B/C/D. Companion package is com.browserproxy.companion; controller package is com.anonymous.browserapp. Development signing uses the controller's standard test key for CI Companion builds, enabling consistent test-build updates. Existing Stage 4/4.1 Companion APKs may have a different signature: revoke their device registration before uninstalling, then install/re-pair. Do not uninstall to bypass Android security warnings without checking the expected signer and APK hashes. These test keys are unsuitable for production distribution.

## Public HTTPS test environment — required before device acceptance

No public API endpoint or hosting credentials were configured in the cloud instance at task start. A localhost MongoDB fixture is not a carrier-network deployment. Supply the existing public hostname/provider and secure runtime bindings through environment settings; do not paste credentials into chat. No paid hosting, TURN or emulator service is provisioned by this stage.

Use an existing public Linux host with trusted HTTPS on 443, Caddy/reverse proxy, Node API on loopback 8080, MongoDB replica-set connectivity on a private boundary, and persistent encrypted Chromium profile storage. The templates in deploy/public-device-test retain the API's authentication and existing namespace protections. Set HOST=127.0.0.1, PORT=8080, PUBLIC_API_ORIGIN=https://the-actual-host, explicit CORS_ORIGINS, MONGODB_URI and ACCOUNT_ENCRYPTION_KEY through a protected service environment. Disable registration after administrator-controlled test logins are provisioned. Do not expose MongoDB, Node's internal port, ADB, CDP or Companion controls publicly. Allow no phone-side inbound ports, port forwarding, VPN or shared-LAN dependency.

Run Stage 4.1 release packaging and deployment preflight on that actual host. Configure approved per-account proxy and proxy-routed DoH for Browser Hub; retain fail-closed behavior. Host namespace support, real provider egress and encrypted storage must be verified there. Template presence is not evidence of a live deployment.

## Exact two-phone smoke test

1. Put controller phone A and Companion phone B on different mobile carriers; disable Wi-Fi. Confirm each can open the public HTTPS API hostname without certificate warnings. Do not use localhost, a LAN IP or Metro.
2. Install the verified controller artifact on A. Enter the public HTTPS API origin; sign in using the administrator-provided user login. Create an account for B and an additional browser-only account.
3. Install Companion on B. On A open Device Hub, create a five-minute single-use pairing code, and enter that code plus the same HTTPS API origin into B. Treat the code as a password. Confirm B appears as a separate registered device.
4. On B choose Start persistent connection and approve notification permission if prompted. Confirm the visible connection notification. A should show online status and battery/charging/version/model telemetry after a heartbeat. Presence expires after 90 seconds without one.
5. On A assign B to the selected account; unassign/reassign. Open the browser-only account without assigning a phone. Verify existing Browser Hub browsing through its configured proxy.
6. On B enter airplane mode for over 90 seconds; A must show offline. Restore mobile data; B should reconnect while its activity/foreground service is alive. Force-stop/reopen separately: services require user restart; capture is never silently restored.
7. Revoke B from A. On its next authenticated request B must clear its device credentials, stop connection/capture services and require new pairing. No remote control is available. Retry the consumed pairing code: it must fail. Pair again with a new code.
8. On B separately authorize screen capture through Android's MediaProjection dialog and optionally enable the Companion accessibility service in Android settings. Confirm visible capture indication and Stop action. Screen capture is prepared but no live viewer or remote commands exist. Android protected screens remain protected.

## Four-phone acceptance matrix — one controller, three Companions

All four phones must use independently routed mobile networks, preferably distinct carriers. Record carrier labels A/B/C/D without publishing SIM identifiers or phone numbers. Do not mark this matrix passed using cloud/unit tests.

| Case | Required result |
| --- | --- |
| Independent pairing B/C/D | Three distinct device registrations and credentials; consumed/expired code reuse fails |
| Heartbeats behind CGNAT | All three online independently; telemetry and server last-seen times advance |
| Account assignment | B/C/D optionally map to owned accounts; no duplicate active assignment; browser-only account works |
| Owner separation | Another test login cannot list, assign or revoke the owner's devices/accounts |
| Network changes | Switch each Companion between carrier data and an unrelated Wi-Fi/carrier connection; reconnect without re-pairing while credentials remain valid |
| Offline/presence | Disconnect one device for over 90 seconds; other devices remain online; reconnect restores only that device |
| Revocation | Revoke B; B rejects credentials/stops services on next request while C/D remain connected |
| Rotation/recovery | Controlled test deployment exercises token rotation and lost responses; stale credentials fail; valid local clear cannot be undone by delayed responses |
| Lifecycle | Background, lock screen, process death, force-stop and reboot tested separately; no silent capture permission restoration |
| Permissions | Notification denial, MediaProjection cancellation/stop, accessibility enable/disable and protected-screen behavior recorded |
| Browser regression | Two account profiles preserve separate cookies/storage and required proxy failure never falls back to direct routing |

Record date, APK SHA256 and Git commit, Android/model, case result, observed times, errors and corrective action. A PASS requires observations from real phones and the actual public deployment. This stage does not claim these hardware or carrier tests have run.

## Diagnostic capture without exposing secrets

Prefer a written result matrix plus timestamps and non-sensitive status codes. Server logging already excludes request bodies/authorization headers and query strings. Do not turn on raw HTTP header/body logging. Never export SecureStore/Keystore records, browser profiles, complete bugreports or screenshots containing credentials.

For locally attached authorized USB debugging, get the app PID and capture only that process:

```sh
adb shell pidof com.browserproxy.companion
adb logcat --pid=THE_RETURNED_PID -v threadtime > companion-local.log
adb shell pidof com.anonymous.browserapp
adb logcat --pid=THE_RETURNED_PID -v threadtime > controller-local.log
```

Stop capture promptly, review/redact logs locally, and retain them privately. Never enable ADB over public TCP. CI artifacts contain build provenance/APKs, not device logs. Collect API deployment health/preflight results without environment dumps or secret files.

## Stage 5 networking preparation — design only

Stage 4 uses outbound authenticated HTTPS from all phones, which traverses CGNAT without inbound phone access. Stage 5 should add owner/device-scoped WSS signaling on this trusted API origin, short-lived remote-session grants bound to controller/device/account, explicit local consent and visible session termination. Device registration tokens must not become unrestricted remote-control credentials.

Plan STUN for candidate discovery and an authenticated TURN relay for networks where direct ICE paths fail. CGNAT may require relay even when STUN succeeds. Use expiring TURN credentials, encrypted DTLS-SRTP, TURN/TLS fallback (including a dedicated relay hostname/443 where required), relay bandwidth quotas and revocation/session TTLs. Reuse an existing host only after measuring capacity and receiving approval for any paid resources. Restrict signaling by ownership, rate limits and origin; never expose debugging/control ports. Prefer local paths only when available, but the four-carrier acceptance path must work through relay. No signaling, STUN/TURN service, streaming or remote-control endpoints are implemented in this stage. Stage 5 remains gated on completion of this acceptance matrix.

## Cloud build evidence

Local controller assembleRelease passes with embedded Hermes (3,112,548 bytes); Companion assembleDebug, 9 native tests and lint pass. Full API/script suite: 63 passed, zero failed/skipped. Confined-browser subset/kernel checks: 13 passed (overlaps full suite). Workspace typechecks, API/workspace builds and Android JavaScript export pass. Companion lint retains 13 warnings, no errors; Gradle deprecation and read-only SDK analytics warnings are not hidden. No USB/emulator/physical devices or public carrier deployment were tested. Existing dependency scanner metadata remains 2 high/1 moderate with Stage 4.1 tested security backports; no new advisories were suppressed.
