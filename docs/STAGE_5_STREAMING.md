# Stage 5 streaming and remote control (development)

Branch: `development/stage-5-webrtc`, based exactly on Stage 4.2 `edb547dadd46239fe7d9ae2bddc438fe3e6b0b7a`. No existing history is rewritten. Stage 4.2's real-device/carrier acceptance matrix remains outstanding; this development work does not certify that gate or production readiness. Browser Hub stays independent of device assignment.

## Using the implementation

Pair a Companion using the existing HTTPS flow and assign it to an owned account. On the Companion explicitly authorize screen capture through Android's system dialog. For input, manually enable its AccessibilityService in Android settings; its permission description explains focused-field access. Start capture before selecting **Open live Android screen** in Device Hub. Choose 360, 720 or 1080 pixels across the capture width, then Connect. Disconnect to change resolution. Portrait aspect ratio follows the display. Android 14+ requests full-display capture using MediaProjectionConfig; rotation ends capture and requires fresh consent to avoid stale input coordinates. Protected/FLAG_SECURE screens remain protected.

Tap or swipe inside the video. Letterboxing does not produce gestures. Back, Home and Recents use Android supported global actions. Send text replaces the focused editable field, rejects password fields and never traverses other nodes. Keyboard/IME behavior, system restrictions and individual applications can refuse actions. There is no ADB, root, shell command receiver, clipboard extraction, camera or microphone stream.

A visible foreground capture notice identifies connection state and has a Stop capture and control action; Android's capture indication also remains active. The connection/presence service is preserved. Stopping capture ends streaming and input locally. Permission cancellation, system projection stop, credential removal and process death do not restore capture silently. Capture can stay explicitly authorized while waiting for a new controller; use the local Stop button to withdraw that authorization.

The controller closes/revokes its session on backgrounding, navigation away, viewer failure or Stop. Five-minute sessions never refresh automatically. Long interruptions require Connect again while the Companion's explicit capture remains active. A new controller session replaces any previous session for that device.

## Protocol and security boundaries

Authenticated HTTPS POST polling on the existing API origin carries WebRTC offer/answer and trickle ICE candidate snapshots. This deliberately uses the existing transport/authentication/CORS boundary rather than introducing WSS infrastructure. It adds roughly one-second signaling/input latency and is a development implementation, not a high-frequency game controller. Video travels over WebRTC DTLS-SRTP, independently of the signaling API. Input exclusively traverses authenticated API endpoints; incoming WebRTC data channels are closed.

`POST /api/remote` accepts `{deviceId,resolution}` and binds a session to the authenticated controller access-session hash, owner, assigned account and device. It requires recent capture telemetry and an existing owned assignment. MongoDB transactions serialize concurrent creation/replacement; use a replica set. IDs are references, not bearer grants. Every poll, signal and command verifies current owner, device registration/revocation/expiry, account existence/assignment and originating controller login. Logout, refresh/replacement of that access session, disabled owner, device revocation or reassignment invalidates authorization. Controller/device credentials are distinct and cannot cross roles. A second controller login cannot take over an existing session ID.

Controller endpoints are `POST /:id/poll`, `POST /:id/signal`, `POST /:id/command` and `DELETE /:id`. Device endpoints are `POST /self/poll` and `POST /self/:id/signal` under `/api/remote`. Signals contain `{generation,sdp,candidates:[{candidate,sdpMid,sdpMLineIndex}]}`. Only the controller advances negotiation generations; stale answers and changed offers in the same generation are rejected. SDP is capped at 64 KiB; candidate snapshots at 64 entries. Clients resend complete snapshots idempotently. These endpoints are documented here and used through the existing authenticated client fetch; the generated OpenAPI client has not been expanded for them.

Commands are a strict union: normalized `tap{x,y}`, `swipe{x,y,x2,y2,duration:100..1000}`, `text{text:1..500 characters}`, or `navigation{action:back|home|recents}` with a `type` discriminator. Maximum pending queue is 16. Each expires after 1.5 seconds and is atomically claimed once. Lost replies discard input rather than replay it. No commands are delivered without a live controller lease. Accessibility and actual local capture/peer connection must also be active at execution. Input acknowledgment means queued, not confirmed execution in the Android app.

The Companion checks authorization every second and disconnects its peer after a maximum four-second request-start-based local lease, with a 200 ms watchdog interval. Revocation is bounded rather than instant: already delivered input cannot be undone, and media can remain visible until the next poll/watchdog. Controller disappearance is detected after five seconds server-side, plus the bounded device lease. No command is carried through ICE restarts. Device clocks should be synchronized: absolute command/session deadlines fail closed on large clock differences. Server-side expiry is always authoritative; Mongo TTL deletion timing is not used for authorization.

ICE restart increments generation after failed/disconnected paths; the same consented capturer survives peer replacement. A changed Companion answer after local peer loss triggers fresh controller negotiation. HTTPS polling retries interrupted calls, pauses controller input and stops the controller after four seconds without authorization success. No credentials or capture permission are silently recovered after app/process death. Rotation/race handling for existing device credentials remains in place.

Authentication stays in native Authorization headers. The isolated inline viewer receives no account/device bearer token, has no network fetch capability in its CSP, blocks navigation/file access and bridges only signals/status/commands. API request logging omits bodies, headers and query strings. Do not enable raw SDP, ICE, text-input or transport debug logging. SDP/ICE contains sensitive network metadata and ephemeral transport credentials; it is stored only in bounded session documents, cleared on explicit revoke/replacement and TTL-cleaned after expiry. It is not an audit payload. Remote create/revoke audit records contain only owner/action/session IDs.

API authentication-failure limits, authenticated owner/device quotas and a separate session-creation quota avoid coupling normal fleet polling to a shared carrier IP. Existing CORS and Browser Hub fail-closed proxy/namespace boundaries remain. In-memory rate limits are not distributed quotas; load and multi-node production hardening remain required.

## Free local checks

Use Node 20.19+, PNPM 10.28.2, Docker, Chromium and Python 3. No public host, phone or production credential is needed:

```sh
pnpm install --frozen-lockfile
pnpm run codegen
pnpm run typecheck
bash scripts/test-stage5-local.sh
```

The script creates a disposable, digest-pinned MongoDB 8.0.16 replica-set container, binds its published port only to loopback, generates a new `browser_proxy_test_` database, runs the full API/script regressions and the actual WebRTC media smoke test, then removes its container. It preserves command exit status. Never substitute a production database URI. The standalone media test is:

```sh
pnpm --filter @workspace/api-server exec tsx --test test/remote-media.check.mjs
```

The fixture draws synthetic video into a canvas and sends real WebRTC media to the same viewer document embedded in Expo. It verifies received dimensions, connection/quality status, an ICE restart, a mapped tap and stream shutdown. It does not test Android permissions, hardware encoding or actual gestures.

On ordinary desktops, host ICE candidates are sufficient. This managed cloud Chromium has `WebRtcIPHandling=disable_non_proxied_udp`. Keep that policy intact and use local TURN/TCP instead. Install coturn from the trusted OS repository, or use the prepared managed toolchain, then run:

```sh
bash scripts/start-stage5-local-turn.sh
# In another shell, use the exact temporary ice.json path printed by that process:
WEBRTC_TEST_ICE_FILE=/tmp/browser-proxy-turn.THE_PRINTED_SUFFIX/ice.json bash scripts/test-stage5-local.sh
```

The helper generates a disposable password in mode-600 files, listens only on 127.0.0.1:3479, uses local relay ports 49200–49220, and deletes its files on exit. It deliberately allows loopback peers for this fixture only. It is not a public deployment template. The managed toolchain's coturn executable/libraries were extracted from official `coturn/coturn:4.6.3@sha256:71c3c990283385567f11794ee692e3a47b66fd9b0bb39e42afbe776e331dd888`; JDK/SDK and Maven artifacts retained verification. No system Chromium policy, TLS validation or global routing was weakened. The helper needs restarting in a restored task.

For local phone testing, use a trusted HTTPS origin reachable by both phones (existing local DNS/certificate setup is sufficient). The current controller still requires an explicit DNS HTTPS origin; no HTTP/LAN fallback or trust-all certificate setting was added. The fixture's HTTP loopback API is only for software tests. Carrier tests require an actual public HTTPS endpoint and a reachable relay; localhost and Docker fixtures do not establish carrier readiness. Never publish local MongoDB, ADB, CDP or development API ports.

## Future STUN/TURN deployment

No external STUN or TURN service is contacted by default. Configure server-side optional variables:

| Variable | Purpose |
| --- | --- |
| `WEBRTC_STUN_URLS` | Comma-separated `stun:` / `stuns:` URLs |
| `WEBRTC_TURN_URLS` | Comma-separated `turn:` / `turns:` URLs, optional `?transport=udp` or `tcp` |
| `WEBRTC_TURN_SECRET` | Coturn REST/HMAC shared secret, at least 32 characters, held only by API/relay |

API generates HMAC-SHA1 coturn credentials whose username expires at session expiry. This is the coturn REST authentication protocol, not password storage. The shared secret is never sent to clients. Short-lived per-session TURN credentials are sent only through authenticated HTTPS and retained in memory. Do not put secrets in Expo public variables, deep links, source or logs. A proxy-placeholder secret cannot provide local HMAC bytes: configure a secure runtime secret binding appropriate to the deployment, not an HTTPS-injection placeholder.

For public hosting, use trusted TLS for API and TURN/TLS, deliberate relay port/firewall ranges, loopback/private-peer denial, bandwidth/allocation quotas, short allocation lifetimes and monitoring. A public TURN relay must not use the local fixture's loopback allowance. Expiring TURN credentials do not instantly revoke an existing allocation; application peer termination and session leases enforce control revocation. Test UDP, TCP/TLS fallback and CGNAT on different carriers; do not infer relay reachability from STUN success. No paid resources have been deployed.

## Build and verification evidence

In the managed environment source `/workspace/toolchains/activate.sh` for JDK 17, SDK 36, PNPM and Java proxy CA trust. Use the existing checkout; cloud tasks are already isolated and should not create extra Git worktrees unless requested.

- Frozen PNPM install, code generation, workspace typecheck and workspace/API/Android Hermes export were exercised.
- API/script regression results and final artifact metadata are recorded in `STAGE_5_VERIFICATION.md`.
- Companion `:app:assembleDebug :app:testDebugUnitTest :app:lintDebug` passes. The WebRTC AAR is pinned to `io.github.webrtc-sdk:android:144.7559.15`; SHA256 `fc7c8d027eb33860ccbb7847988f7f942d44a92d1f575348bba6c0250cde4071` matches official Maven Central checksum metadata.
- Controller release compilation was attempted. Expo now explicitly builds patched `expo-blur` from source; otherwise SDK 54's prebuilt publication reintroduces the old JitPack dependency. The remaining React Native/Hermes AAR download redirects to denied `repo.reactnative.dev`. No Stage 5 controller APK is claimed until that build succeeds.

## Hardware/deployment acceptance still required

Use Stage 4.2's two-/four-phone matrix with the Stage 5 versions and record APK hashes, Android/model, network and result. Add: capture cancellation/regrant and notification denial; local Stop while viewing; Accessibility enable/disable during a session; input blocked on passwords/protected screens; tap/swipe alignment with letterboxing, rotation, display scaling, keyboard and partial-app capture; 360/720/1080 quality/thermal tests; five-minute expiry, replacement, owner separation, logout, reassignment and revocation during gestures; short/long network loss, Wi-Fi/carrier transitions, ICE restart and app/process death; direct and TURN/TCP/TLS relay paths across independent carriers. Rotation deliberately stops capture; verify this on hardware. Android 14+ requests full-display capture to exclude partial-app coordinate ambiguity. OEM display scaling still needs validation before relying on remote gestures. Software/compilation tests do not establish correct coordinates on real devices.

Native Android WebView must support receive-only WebRTC; Expo Go is not the acceptance target. Controller native APK, OEM hardware encoders/decoders, system consent/notifications, Accessibility gestures and the public carrier deployment are unverified until explicitly recorded. Public hosting, production signing, Google Play Accessibility/foreground-service policy review, distributed quotas and relay capacity/security remain deployment work.
