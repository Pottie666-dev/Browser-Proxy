# Roadmap

## Completed

### Phase 1 - Account Vault

- Account CRUD
- Mongo-backed storage
- Account images
- Favorites
- Tags
- Search
- Improved Vault UI

### Phase 2 - Identity Generation

- Device name generation
- Fake IP generation
- User agent generation
- Timezone support
- Identity passed into the browser

### Phase 3 - Persistent Browser Identity

Each account has a persistent identity generated once and reused.

Includes browser fingerprint, canvas seed, audio seed, WebGL vendor/renderer, screen profile, device memory, CPU cores, fonts, battery profile, network profile, timezone, and language.

### Phase 4A - Browser Runtime Isolation

- localStorage/sessionStorage namespace
- JS cookie sandbox
- WebRTC leak blocking
- permissions spoofing
- geolocation spoofing
- mediaDevices spoofing
- battery/network spoofing
- clipboard/notification/voice/plugin masking

### Phase 4B - Browser State Persistence

- API browser-state endpoints
- Mongo persistence
- JS-visible cookies
- localStorage/sessionStorage snapshots
- history snapshots
- automatic restore when opening account browser

### Phase 5 - Browser UX

- tabs
- bookmarks
- history drawer
- browser tools menu
- better navigation

### Phase 6 - Device Virtualization

- richer Android device profiles
- region/timezone-aware geolocation
- natural battery drift
- WebGL2 support spoofing
- deterministic canvas/imageData/textMetrics noise
- media/sensor hardening
- virtual device diagnostics

### Phase 7 - Session Isolation Controls

- clear current runtime state
- reset saved account session
- browser-state reset API
- storage/cookie/history count diagnostics

### Stage 8A - Native Foundation

- native isolation abstraction
- profile path planning
- native readiness documentation
- WebView hardening props
- native build scripts

### Stage 8B - Native Browser Profile Module Scaffold

- Expo native module scaffold
- Kotlin Android module
- native profile folder creation/cleanup
- JS wrapper with Expo fallback
- browser screen prepares native profile
- session reset clears native profile folder

## Current Work

- Complete Android NDK install: `ndk;27.1.12297006`
- Run native Android build
- Install custom app on phone
- Verify native BrowserProfile module loads

## Next Milestones

- Stage 8C - Native WebView Profile Manager
- Stage 8D - Native Cookie Isolation
- Stage 8E - Native Storage Isolation
- Stage 8F - Native Download and Permission Routing
- Stage 9 - Proxy Engine
- Stage 10 - Fingerprint Verification Dashboard
- v1.0 - First Stable Native Browser
