# Stage 1 stabilization

Branch: `stabilization/stage-1-recovery`, based on
`restructure/monorepo` at `199b1ccf37cfe278283445e680a6994d3a98b8d6`.
The working standard WebView reference is
`bb49eda85fece3232f9b3807dfd15f897d884864`; no branch reset or wholesale
screen replacement was performed.

## Development and validation

Use Node.js 20.19 or newer and the currently pinned PNPM 10.28.2. From the repository root:

```sh
pnpm install --frozen-lockfile --strict-peer-dependencies
pnpm run codegen
pnpm run typecheck
pnpm test
pnpm run build
```

Root typechecking includes `apps`, the mockup sandbox, and utility scripts.
Shared declarations are built first. The build compiles the API, builds the
sandbox, and exports an Android JavaScript/Hermes bundle. It does not create an
APK/AAB or publish an application. For restricted/offline environments, prefix
Expo commands with `CI=true EXPO_OFFLINE=1 EXPO_NO_TELEMETRY=1`.

`pnpm run mobile:doctor` checks installed dependencies against the SDK's
compatibility expectations; an offline check uses bundled SDK metadata.
The project doctor is a source-presence check, not an isolation certification.

Set `EXPO_PUBLIC_API_URL` before running or exporting the mobile application.
Physical devices require a reachable LAN address or HTTPS API endpoint. Metro's
LAN host is used during development when available; localhost is only a local
fallback. No developer-specific IP address is baked into the app.

```sh
pnpm --filter @workspace/api-server run dev
pnpm --filter @workspace/browser-app run dev
```

The mobile development script honors `PORT`, including Replit's service port.
The sandbox defaults to port 8083 and `/__mockup` and accepts explicit overrides.

## API compatibility and tests

PATCH is the canonical account-update method in OpenAPI and the regenerated
client. PUT remains a compatibility alias to the same partial-update handler.
Both preserve unspecified account fields and the existing fingerprint profile.

The seven regression tests launch the built API using synthetic in-memory
accounts. They explicitly clear `MONGODB_URI` and never access a real database.
They exercise generated-client CRUD, PUT/PATCH compatibility, browser-state
persistence/reset/account separation, fingerprint merges, missing records,
upstream proxy responses, and retained proxy-record routes. The test process
uses the development logger, verifying Pino's installed worker/transport path.
Pino is external to the API bundle because its former build plugin declared an
incompatible esbuild peer range; logging functionality is retained.

## Historical Stage 1 browser host and preserved work

At Stage 1, standard `react-native-webview` was the default host. Stage 3 superseded this with isolated remote Chromium; see STAGE_3_BROWSER_ENGINE.md. The following describes retained historical work. Existing tabs, bookmarks,
history, fingerprint/form scripts, state messages, and session controls remain.
The custom native bridge, capabilities, profile helpers, proxy models/routes,
and patch archives are preserved. The experimental host requires both
`EXPO_PUBLIC_NATIVE_BROWSER_ENABLED=1` and a reported native WebView capability.
Do not enable it until Android implementation, autolinking, and device tests exist.

The standard host does not provide native per-account HTTP-only cookie,
IndexedDB, service-worker, download, or permission isolation. Its clear operation
clears JavaScript-visible state and cache; it is not a native profile wipe.
Pause/resume are native-only operations. Native-only capabilities stay pending.

Database models remain in `apps/api/src/lib`. The shared `@workspace/db` barrel
now exposes Mongoose and Schema without claiming to provide account models.

## Deployment

Replit's API entry point is `apps/api/dist/index.mjs`. The existing Expo Go
deployment workflow is preserved separately:

```sh
EXPO_PUBLIC_DOMAIN=your-deployment-host pnpm --filter @workspace/browser-app run build:deployment
pnpm --filter @workspace/browser-app run serve
```

That build owns Metro on port 8082 by default (`EXPO_METRO_PORT` overrides it).
It refuses to reuse an existing Metro server, avoiding stale configuration or
another project's bundler. The ordinary `build` remains independent of a
deployment domain. Deployment output and Metro caches are ignored by Git.
The offline cloud validation used Expo's cache-directory override to avoid an
unwritable home directory. It generated and served both platform manifests and
bundles, but Expo emitted manifest asset-resolution warnings; device rendering
and the optional deployment icon/font metadata still need verification.

## Next stage

Required before a release: MongoDB-backed regression tests and persistence
verification; authentication/ownership checks; encryption/key handling;
private-address/redirect protections and account-aware cookie/proxy routing;
dependency-advisory remediation; Android native integration and device testing.
The currently pinned package manager and platform-specific workspace overrides
also need a portability/security-policy review before ARM/macOS/Windows support.
EAS project ownership, runtime API settings, and APK/AAB builds remain unverified.
