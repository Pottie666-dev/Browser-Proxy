# Stage 5.1 verification — 27 October 2026

Stage 5 history was verified at `48bfd68678cb39bed35dbf4866645a119588d861`, including both implementation commits and both documentation commits. A normal non-force push succeeded; `git ls-remote` independently returned the exact starting SHA on GitHub. Stage 5.1 deployment/preflight code is commit `f7699f7`; documentation commits follow on the same branch, without resets or merges. The final delivery reports the independently verified remote tip.

## APKs

| Artifact | SHA256 | Size |
| --- | --- | --- |
| `hardware-artifacts/BrowserProxy-controller-stage5-1-development.apk` | `7949aba810fbb1edbd8f9d7617a8f2585cf61f4f9b4db4d222966d1f8ab2c8e1` | 54,107,856 bytes |
| `hardware-artifacts/BrowserProxy-companion-stage5-debug.apk` | `554bcffff6afef4c897576356ba96ec3f5f8da68c25713acbabd4eb5277c2051` | 48,756,689 bytes |

Both signatures were verified using Android apksigner. The controller is the **release Gradle variant with development signing**, not a production-signed release. It contains an embedded 3,140,136-byte Hermes bundle and does not require Metro. It targets arm64-v8a, min Android API 24, target 36; package `com.anonymous.browserapp`, version 1.0.0/code 1. Companion remains development/debug signed, min API 26, target 35, package `com.browserproxy.companion`, version 0.2.0/code 2. The rerun Companion build is byte-for-byte identical to the retained Stage 5 APK; the original was not overwritten.

```sh
sha256sum -c hardware-artifacts/STAGE_5_1_SHA256SUMS
```

Install through Android's package installer or locally authorized USB. Verify the hash/signer first. A different existing development signer prevents an in-place upgrade; do not bypass that warning. Revoke/unpair deliberately before an approved uninstall/re-pair. APKs are retained in the workspace and intentionally excluded from Git; no public GitHub release or production distribution is claimed.

## Observed automated results

| Check | Result |
| --- | --- |
| Frozen PNPM installation, code generation, workspace typecheck | Passed; dependency lockfile unchanged |
| Workspace/API builds and Android JavaScript/Hermes export | Passed |
| Full API regressions with a fresh disposable MongoDB replica-set database | **65 passed, 0 failed, 0 skipped** |
| Existing script/security regressions | **10 passed, 0 failed, 0 skipped** |
| Real WebRTC viewer media smoke via local TURN/TCP | **1 passed, 0 failed, 0 skipped**: decoded frames, connection quality, ICE restart, mapped tap and shutdown |
| Companion assembleDebug, testDebugUnitTest, lintDebug with tasks rerun | Passed; **9 native unit tests**, no failures/skips; lint **0 errors, 14 warnings** |
| Controller native assembleRelease | **Passed**, 908 Gradle tasks, with pinned JDK 17/SDK 36/NDK 27.1.12297006 |
| Strict confined Browser Hub subset | **1 passed, 2 failed**, both blocked before namespace startup by `bwrap: setting up uid map: Read-only file system` |
| New preflight policy tests | Included in the 65 API tests; accepts complete TLS configuration and rejects unsafe sandbox/namespace overrides, direct fallback, test storage, insecure TLS, wildcard CORS and missing TURN/TLS |
| Source and packaged deployment preflight | Correctly returned nonzero on this unsuitable/incomplete host; no false readiness claim |
| Deployable API release export and RELEASE.json hashes | Passed; runtime dependencies and all four helper/policy files present in `/workspace/stage51-api-release` |
| Caddy template | `caddy validate` passed using the official image in a container with networking disabled; no certificate issuance/deployment |
| Coturn template | Parsed and completed a verified local TLS handshake with a disposable test CA/certificate, loopback/interface/port overrides and no external traffic |
| systemd unit verification on this cloud host | Could not validate runtime executable paths: this managed Debian host has no `/usr/bin/node`; the target Ubuntu guide explicitly requires Node there |

The full local workflow was rerun using `scripts/test-stage5-local.sh` with a generated loopback TURN/TCP fixture. Two earlier API-only checks without `MONGO_TEST_URI` skipped database integration; those are not the final results above. Policy-only test runs overlap the full suite and are not additional passes. Native unit tests do not execute MediaProjection or Accessibility on phones.

Ordinary Browser Hub regressions passed for account cookie/storage separation, persistence/recovery, proxy routing, authenticated ownership and fail-closed egress. They do not replace the separately failing production-style namespace/sandbox checks. Existing protections remain enabled; the new service preflight refuses startup when those capabilities are absent. The official Google Chrome `/opt/google/chrome` read-only namespace mount is prepared, but a positive native-browser sandbox test on Ubuntu 24.04 remains required.

## Dependency integrity and environment

The official React Native dependency host returned HTTPS 200 and Gradle subsequently downloaded the required AARs with TLS verification intact. Their SHA256 values matched official Maven Central checksum metadata:

- React Native 0.81.5 release AAR: `a4da05bc571946aa1034c0d7be46593719105fb9e81d58aded9183c85a1f04fc`.
- Hermes 0.81.5 release AAR: `f8d8af2486ee26d7b8d3da92dcd96ea5df27acfcfe556866ea13c68fec1d2992`.

No mirror substitution, signature/checksum override or TLS bypass was used. The previously saved draft still contains `repo.reactnative.dev`; no agent-side apply/publish tool is available. Actual host access and builds succeeded without claiming the draft was activated. Reusable setup instructions are retained/updated for environment review and publication; publication/new-task restoration is not an observed test result.

## Remaining acceptance and deployment gates

No existing VPS, Atlas credentials, real domain or physical phones were supplied, and none were purchased/provisioned. The [Ubuntu deployment/recovery guide](STAGE_5_1_UBUNTU_DEPLOYMENT.md) covers native Chromium/Bubblewrap/AppArmor requirements, Atlas replica-set/TLS/access roles, HTTPS, authenticated polling signaling, public Coturn, firewalls, bandwidth quotas and encrypted persistent storage. Templates are under `deploy/ubuntu-24.04`.

The full four-phone checklist at the end of that guide remains **entirely unexecuted**. Actual screen capture consent, foreground/system indications, OEM encoding/WebView decoding, Accessibility gestures/password refusal, rotation, thermal behavior, public TURN/TCP/TLS, CGNAT transitions, real revocation timing and four independent mobile networks must be observed on hardware. Production signing, vendor/Play policy review, real-host positive preflight, storage/backup restore, TLS renewal and capacity/security review remain operator work.

No paid hosting was purchased, no PR was merged, and JHP-Casino was not modified. Existing branch history and the original Stage 5 source bundle/APK remain preserved. A fresh Stage 5.1 complete-history bundle plus checksum is exported separately for recovery.
