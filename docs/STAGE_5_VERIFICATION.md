# Stage 5 verification — 26 October 2026

Implementation commit: `86cad13a32b265de84c86a546d59e355ddbb4331` (documentation-only commits may follow). Branch `development/stage-5-webrtc` is descended from the exact requested Stage 4.2 commit `edb547dadd46239fe7d9ae2bddc438fe3e6b0b7a`.

| Check | Observed result |
| --- | --- |
| PNPM 10.28.2 frozen install | Passed, including repeat installation with the retained store; lockfile unchanged |
| Code generation and workspace typecheck | Passed |
| Workspace builds | Passed: API bundle, mockup build and Android JavaScript/Hermes export |
| Disposable local workflow | Passed: `scripts/test-stage5-local.sh` with the generated loopback TURN/TCP fixture |
| API tests including real Chromium Browser Hub regressions and Mongo replica-set tests | **63 passed, 0 failed/skipped** |
| Existing script/security regressions | **10 passed, 0 failed/skipped** |
| Actual WebRTC viewer media test through local TURN/TCP | **1 passed, 0 failed/skipped**: decoded synthetic video, quality status, ICE restart, mapped tap and shutdown |
| Direct host-candidate media test on managed Chromium | Failed with zero candidates under the managed `disable_non_proxied_udp` policy; policy retained; TURN/TCP path above passed |
| Strict confined Browser Hub subset | **1 passed, 2 failed** before confinement could start: `bwrap: setting up uid map: Read-only file system`. This runtime cannot supply the required nested namespace capability. No fallback or security weakening was introduced |
| Companion debug assemble, unit tests, lint | Passed; **9 native unit tests**, no failures/skips; lint **0 errors, 14 warnings** |
| Controller release APK | **Blocked**: official React Native/Hermes Maven AAR downloads redirect to `repo.reactnative.dev`, denied by the active network policy (HTTP 403). No Stage 5 controller APK produced |
| Real Android devices / public hosting | **Not run**; no phones, public API or public TURN deployment were supplied |

The ordinary Browser Hub regression suite verifies account storage separation, persistence/recovery, proxy routing and fail-closed behavior in its existing test configuration. It does not replace the separately failing production-style namespace/sandbox tests. Those need a host supporting the existing confinement mechanism.

New remote API checks cover capture readiness, device/controller credential separation, cross-owner access refusal, bounded schemas, TURN credential construction, negotiation generation/retry, one-time command claims, all four input families, expired input, Accessibility-disabled refusal, session replacement/revoke/expiry, controller liveness/logout, unassignment and device revocation. These are software tests, not evidence of Android gesture execution.

## Companion artifact

- File: `hardware-artifacts/BrowserProxy-companion-stage5-debug.apk` (retained locally, intentionally Git-ignored).
- Package: `com.browserproxy.companion`, version **0.2.0 / code 2**, min Android API **26**, target **35**, compiled with SDK **36**.
- Size: **48,756,689 bytes**.
- SHA256: `554bcffff6afef4c897576356ba96ec3f5f8da68c25713acbabd4eb5277c2051`.
- Development/debug signing only; APK signature verified with Android apksigner. No production signing or public distribution is claimed. Check the signer and hash before installing; an older Companion with a different development key cannot be upgraded in place. Revoke/re-pair deliberately rather than bypassing a signature warning.

```sh
sha256sum -c hardware-artifacts/SHA256SUMS
```

Native WebRTC encoding, Android WebView reception, capture consent, visible system/foreground indications, password-field refusal, gestures and rotation-triggered stop still require real-device testing. See the full acceptance checklist in [STAGE_5_STREAMING.md](STAGE_5_STREAMING.md).

## Environment configuration and next actions

Saved the reusable installation script, startup instructions and the custom network addition **`repo.reactnative.dev`** in the environment draft. Draft saving does not apply network policy, execute scripts or publish a snapshot. Review/save the changes in environment settings, then publish the environment; retry the controller build after the hostname is actually reachable. No secret values were requested or saved in chat/configuration scripts.

The prepared snapshot includes JDK/SDK/Gradle/PNPM caches and official-image coturn executable/libraries. Use `source /workspace/toolchains/activate.sh`; restart disposable services using the documented helpers. Publishing/restoration in a new task has not been verified. No paid infrastructure, existing PR merge or JHP-Casino change was performed.

The GitHub branch push and a subsequent read-only Git check both failed with proxy transport HTTP 503 (`upstream connect error ... cloudflare_https_tunnel`). This is not evidence of missing GitHub credentials; no replacement token was requested. Commits remain local until Git transport recovers. A verified Git bundle at `/workspace/Browser-Proxy-stage5.bundle` preserves the development branch independently of the checkout. Local-only commit restoration in newly published tasks is not guaranteed; retain this bundle and retry the ordinary non-force branch push after transport recovery.

Stage 5.1 update: Git transport and the controller APK build recovered. See [Stage 5.1 verification](STAGE_5_1_VERIFICATION.md) and the [Ubuntu deployment/recovery guide](STAGE_5_1_UBUNTU_DEPLOYMENT.md) for current results; the Stage 5 observations above are historical.
