# Browser-Proxy Roadmap

## Mission

Browser-Proxy is evolving into a browser identity platform where each account behaves like its own separate Android phone.

Each account should eventually have its own:
- Device identity
- Browser fingerprint
- Timezone and location profile
- Cookies
- Cache
- LocalStorage
- SessionStorage
- IndexedDB
- Service workers
- Downloads
- Permissions
- Proxy/IP
- Browser history
- Bookmarks
- Stored images
- Autofill data

## Completed Milestones

- [x] Phase 1 - Account Vault
- [x] Phase 2 - Identity generation
- [x] Phase 3 - Persistent per-account browser identity
- [x] Phase 4A - Browser runtime isolation
- [x] Phase 4B - Browser state persistence
- [x] Phase 5 - Browser UX: tabs, bookmarks, history
- [x] Phase 6 - Device virtualization
- [x] Phase 7 - Session isolation controls
- [x] Stage 8A - Native browser isolation foundation
- [x] Stage 8B - Native browser profile module scaffold

## Next Milestones

- [ ] Finish Android native build on Pi
- [ ] Install native app on Android phone
- [ ] Verify native BrowserProfile module loads
- [ ] Add true native WebView profile manager
- [ ] Add native cookie/cache/storage isolation
- [ ] Add native download routing
- [ ] Add per-account proxy assignment
- [ ] Add fingerprint test dashboard
- [ ] Build first stable APK

## Tagged Release Plan

- v0.1 - Account Management
- v0.2 - Identity Engine
- v0.3 - Persistent Fingerprints
- v0.4 - Browser Runtime Isolation
- v0.5 - Browser State Persistence
- v0.6 - Tabs, Bookmarks and History
- v0.7 - Session Isolation
- v0.8 - Native Foundation
- v0.9 - Native Browser Profile Module
- v1.0 - First Stable Native Browser

## Long-Term Vision

Selecting an account should feel like picking up a different physical Android phone.

John should always look like John's phone.
Sarah should always look like Sarah's phone.
No shared cookies.
No shared cache.
No shared browser history.
No shared identity.
