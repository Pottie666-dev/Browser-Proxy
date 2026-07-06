# Native Android

## Why Native Is Needed

Expo Go and JavaScript are useful for fast development and API spoofing, but not enough for true browser profile isolation.

JavaScript cannot fully isolate HTTP-only cookies, Android WebView cookie database, WebView cache, IndexedDB, service workers, native downloads, native permissions, WebView data directory, or low-level network behavior.

## Current Native Status

Stage 8A added the native abstraction.

Stage 8B added a native Android module scaffold:

```text
apps/mobile/modules/browser-profile/
```

Current module functions:

- `getCapabilities`
- `prepareProfile(accountId)`
- `getProfilePaths(accountId)`
- `clearProfile(accountId)`

## Profile Folder Shape

```text
browser-profiles/<accountId>/
  cookies/
  cache/
  storage/
  downloads/
  permissions.json
```

## What Stage 8B Does Now

It creates and clears planned native profile folders. It does not yet make Android WebView use those folders for real cookie/cache/database isolation.

## Next Native Tasks

- Native WebView manager
- Native CookieManager strategy
- IndexedDB and service worker isolation
- per-account downloads
- permission routing
- native geolocation handling
- per-account proxy routing

## Important Note

Expo Go will not load the native module. A custom dev build or installed native APK is required.
