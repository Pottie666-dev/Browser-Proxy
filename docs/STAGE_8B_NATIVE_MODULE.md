# Stage 8B: Native Browser Profile Module

This stage adds the first custom Android native module for Browser-Proxy.

## What it does now

The native module creates and clears per-account browser profile directories:

```text
files/browser-profiles/<accountId>/
  cookies/
  cache/
  storage/
  downloads/
  permissions.json
```

The React Native app calls this module when opening an account browser and when resetting an account session.

## Why this matters

This is the bridge from Expo Go/WebView behavior to real Android profile isolation.

JavaScript can simulate isolation for visible browser APIs, but Android native code is required for:

- HTTP-only cookies
- WebView cache
- IndexedDB
- Service workers
- native download folders
- native permission routing
- profile-specific WebView containers

## Activate native module

From the repo root:

```bash
pnpm install
pnpm run mobile:prebuild
pnpm run mobile:android:native
```

Expo Go will not load the native module. A custom dev build or APK is required.

## Next native work

The next target is a native WebView manager that uses these profile paths to route:

- cookies
- cache
- downloads
- permissions
- WebView data cleanup
