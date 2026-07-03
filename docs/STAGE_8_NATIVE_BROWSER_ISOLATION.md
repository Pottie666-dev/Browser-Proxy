# Browser-Proxy Stage 8: Native Browser Isolation

Stage 8 moves Browser-Proxy from an Expo Go WebView prototype toward a true Android browser profile manager.

## Already working

- Persistent account identities
- Stable browser fingerprint profiles
- Per-account timezone/locale/device data
- Runtime fingerprint masking
- JavaScript-visible cookie and storage snapshots
- Per-account browser history snapshots
- Session reset controls

## Why native Android is required

Expo Go and JavaScript can spoof many browser APIs, but they cannot fully isolate:

- HTTP-only cookies
- Android WebView cookie database
- WebView cache
- IndexedDB
- Service workers
- Native permissions
- Native downloads
- Android WebView data directory
- WebRTC/network stack below JavaScript

## Stage 8B target

Create a custom Android browser profile module that can:

1. Create a separate native browser profile per account.
2. Route each account to its own cookie store.
3. Route cache/storage/downloads to profile-specific directories.
4. Clear/reset one account without affecting others.
5. Expose diagnostics to React Native.
6. Prepare for per-account proxy routing.

## Profile directory shape

```text
browser-profiles/<accountId>/
  cookies/
  cache/
  storage/
  downloads/
  permissions.json
  profile.json
```

Stage 8A adds the React Native abstraction and UI diagnostics.
Stage 8B will add the custom native Android module/dev build.
