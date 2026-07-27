# Browser Foundation Pack — Stages 8D to 10A

This checkpoint replaces the generic React Native WebView with the Browser-Proxy Android native browser view and adds the first real native profile boundary.

## Included

### Stage 8D — Native WebView host
- Android `WebView` is owned by the local Expo native module.
- Every view receives an account profile ID before navigation.
- Native navigation, loading, title, error and message events are bridged to React Native.
- Back, forward, reload, stop and JavaScript injection are native commands.
- Existing Browser-Proxy toolbar, tabs, history and diagnostics remain in React Native.

### Stages 8E and 8F — Native profile isolation
- Uses AndroidX WebKit multi-profile APIs when the installed Android System WebView supports them.
- Cookie manager and WebStorage are attached to the account profile.
- IndexedDB, DOM storage, cache, cookies and service-worker data follow the native WebView profile boundary.
- Older WebView providers fall back visibly in diagnostics; they are not falsely reported as isolated.
- Reset Session clears the selected native profile and the server-side browser state.

### Stage 8G — Downloads and permissions
- Downloads are routed to an app-private, account-specific downloads folder.
- Browser download events are surfaced to the React Native UI.
- Camera, microphone and protected WebView resource requests are denied by default and surfaced to the UI.
- File/content access and mixed content are disabled.

### Stage 8H — Reliability groundwork
- WebView pause/resume follows React Native app lifecycle.
- Native view exposes stop, pause, resume, destroy and clear-profile commands.
- Main-frame errors and progress are reported without crashing the React Native screen.
- Profile preparation happens before account navigation.

### Stage 9A — Proxy data model
- New `proxies` MongoDB collection.
- CRUD API at `/api/proxies`.
- Supports HTTP, HTTPS and SOCKS5 metadata, region, health status and credentials.
- Account schema can reference `proxyId`.
- Proxy responses do not return passwords.
- Actual traffic routing remains Stage 9B.

### Stage 10A — Diagnostics
- Native host status is displayed.
- Android WebView multi-profile support is displayed.
- Expected fingerprint, device, timezone, profile paths and JavaScript state remain visible.
- Unsupported native isolation is shown as provider fallback, not as a successful result.

## Important compatibility note

True simultaneous WebView profile isolation depends on AndroidX WebKit multi-profile support in the Android System WebView installed on the phone. The app checks this at runtime. A current Android System WebView should be installed before testing.

## Build checkpoint

This is intentionally a larger checkpoint. Build and test after applying this pack before implementing Stage 9B traffic routing or Stage 10B automated isolation tests.
