# Changelog

## Major Progress

### Account Vault

- added account management
- connected app to API
- fixed seeded account issue
- moved to Mongo-backed account storage
- added image support
- added favorites and tags
- improved Vault UI

### Identity Engine

- generated device identity
- fake IP
- user agent
- timezone
- fingerprint profile

### Persistent Browser Identity

- profiles generated once
- fingerprint stored in Mongo
- account browser receives full identity

### Browser Runtime Isolation

- injected runtime spoofing
- storage namespace
- JS cookie sandbox
- WebRTC blocking
- permissions/geolocation/media spoofing
- battery/network/clipboard/notification/voice/plugin masking

### Browser State Persistence

- backend browser-state endpoints
- saved cookies/localStorage/sessionStorage/history
- restored state when opening account

### Browser UX

- tabs
- bookmarks
- history drawer
- browser menu

### Device Virtualization

- richer Android profiles
- WebGL2
- canvas/imageData/textMetrics noise
- battery drift
- media/sensor hardening

### Session Isolation

- reset saved session
- clear runtime
- diagnostics

### Native Foundation

- native isolation abstraction
- native readiness diagnostics
- docs and scripts

### Native Browser Profile Module

- Android module scaffold
- Kotlin profile module
- JS fallback wrapper
- profile folder creation/clear
- browser lifecycle hook

## Current In-Progress

- Android NDK install on Raspberry Pi
- first native Android build
- native module verification
