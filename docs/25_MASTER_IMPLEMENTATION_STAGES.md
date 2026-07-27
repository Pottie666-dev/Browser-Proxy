# Browser-Proxy Master Implementation Stages

This document is the working checklist from the current codebase to the finished platform.

## Completed foundation

### Phase 1 - Account Vault
- [x] Create, list and delete accounts
- [x] MongoDB-backed storage
- [x] Account images, favorites, tags and search
- [ ] Confirm account editing after Stage 8C maintenance patch

### Phase 2 - Identity Generation
- [x] Device name, fake IP and user-agent generation
- [x] Timezone and locale support
- [x] Identity passed into browser runtime

### Phase 3 - Persistent Identity
- [x] Generate identity once per account
- [x] Persist fingerprint, hardware, canvas, audio, WebGL and screen profile

### Phase 4A - JavaScript Runtime Isolation
- [x] Namespaced localStorage/sessionStorage
- [x] JavaScript-visible cookie sandbox
- [x] WebRTC leak blocking and browser API masking

### Phase 4B - Browser State Persistence
- [x] Browser-state API
- [x] Mongo persistence
- [x] Restore JavaScript cookies, storage and history

### Phase 5 - Browser UX
- [x] Tabs, bookmarks, history and browser tools

### Phase 6 - Device Virtualization
- [x] Deterministic device and fingerprint profile
- [x] Region/timezone-aware browser identity

### Phase 7 - Session Controls
- [x] Runtime clear
- [x] Saved session reset
- [x] Diagnostics counters

### Stage 8A - Native Foundation
- [x] Native isolation abstraction
- [x] Profile-path plan
- [x] Native build scripts and diagnostics

### Stage 8B - Native Module Scaffold
- [x] Local Expo module structure
- [x] Per-account profile path API design
- [x] Browser screen integration points

## Current implementation

### Stage 8C - Native Profile Manager and Maintenance Patch
- [x] Fix account editing API method mismatch
- [x] Generate 10-12 character strong passwords
- [x] Force Mongo database `BrowserProxy`
- [x] Force collection name `accounts`
- [x] Add real Kotlin Expo module
- [x] Create, inspect and reset per-account native profile folders
- [ ] Build preview APK
- [ ] Verify native status reports `available: true`
- [ ] Verify edit and strong-password behavior on phone

## Native browser isolation

### Stage 8D - Native WebView Host
- [x] Replace the shared React Native WebView host with a Browser-Proxy native view
- [x] Bind each native view to one account profile ID
- [x] Expose navigation, loading, URL, title and error events to React Native
- [x] Support back, forward, reload and stop
- [x] Preserve the existing browser UI

### Stage 8E - Native Cookie Isolation
- [x] Separate cookie handling per account when Android WebView multi-profile is supported
- [x] Keep native and HTTP-only cookies inside the selected native WebView profile
- [x] Bind the native profile before first navigation
- [x] Add selected-profile clear operation
- [ ] Add cookie diagnostics and isolation tests

### Stage 8F - Native Storage and Cache Isolation
- [x] Isolate WebView cache through AndroidX WebView profiles when supported
- [x] Isolate IndexedDB, WebStorage and service-worker state through native profiles when supported
- [x] Route DOM storage to the selected account profile
- [ ] Confirm no storage crosses between two test accounts

### Stage 8G - Downloads and Permissions
- [x] Route downloads to each account's downloads folder
- [ ] Add download progress and open/share actions
- [x] Deny sensitive site permissions by default and surface the decision
- [x] Intercept camera and microphone resource requests; file/content access disabled
- [x] Add safe denial notices and profile reset controls

### Stage 8H - Native Browser Reliability
- [ ] Crash recovery and profile lock handling
- [x] Add native pause/resume/stop/destroy lifecycle commands
- [ ] Low-memory recovery
- [x] Add background/foreground lifecycle handling
- [ ] Automated two-account isolation smoke test

## Network identity

### Stage 9A - Proxy Data Model
- [x] Add proxy records and credential fields (encryption scheduled for Stage 10C)
- [x] Add account proxyId assignment field
- [x] Add proxy type, host, port, username, password and region
- [x] Add proxy health and last-check fields

### Stage 9B - Proxy Engine
- [ ] Route all browser traffic through the selected account proxy
- [ ] Support HTTP, HTTPS and SOCKS5
- [ ] Prevent DNS and WebRTC leaks
- [ ] Add sticky-session support
- [ ] Refuse navigation when required proxy protection fails

### Stage 9C - Proxy Management UI
- [ ] Add, edit, test and remove proxies
- [ ] Assign/unassign proxy from account
- [ ] Display current exit IP and region
- [ ] Add failure and rotation controls

## Verification and hardening

### Stage 10A - Fingerprint Verification Dashboard
- [x] Show expected user-agent, screen, timezone, locale and hardware profile
- [ ] Show WebGL, canvas, audio, media and permission values
- [x] Show native host/profile capability alongside expected identity
- [x] Flag unavailable native multi-profile support as provider fallback

### Stage 10B - Isolation Test Suite
- [ ] Two-account cookie test
- [ ] Cache and storage crossover test
- [ ] Proxy/IP leak test
- [ ] Fingerprint stability test
- [ ] Reset-account-only test
- [ ] Reinstall/upgrade persistence test

### Stage 10C - Security Hardening
- [ ] Encrypt sensitive local data
- [ ] Encrypt proxy credentials and account secrets at rest
- [ ] Add app lock and optional biometrics
- [ ] Add API authentication and authorization
- [ ] Add rate limits, audit events and safe logging
- [ ] Remove plaintext passwords from ordinary API responses

## Stable native release

### Stage 11A - Release Candidate
- [ ] Clean build from a fresh checkout
- [ ] API, mobile and native type/build checks
- [ ] Install and upgrade tests on physical Android devices
- [ ] Account CRUD, browser, isolation and proxy smoke tests
- [ ] Backup/export and restore validation

### Stage 11B - v1.0 First Stable Native Browser
- [ ] Signed production APK/AAB
- [ ] Release notes and rollback package
- [ ] Stable database migration process
- [ ] User-facing diagnostics and support bundle
- [ ] Tag `v1.0`

## Post-v1 platform expansion

### Stage 12 - Cloud Browser Proof
- [ ] Start secure Chromium container from phone
- [ ] Stream keyboard, pointer, clipboard, upload and download
- [ ] Persist cloud profile per account

### Stage 13 - Cloud Session Platform
- [ ] Session create/status/pause/resume/delete API
- [ ] Container orchestration and cleanup
- [ ] Signed short-lived stream tokens
- [ ] Reconnect and health checks
- [ ] Per-session proxy/VPN

### Stage 14 - Account Ecosystem
- [ ] Per-account inbox and email workflows
- [ ] File and image vault
- [ ] Autofill and credential vault
- [ ] Import/export account packages
- [ ] Optional automation with Playwright and AI controls

## Working instruction format

The user can instruct work using the stage number, for example:

`Start Stage 8D.`

Each stage should be delivered as a tested patch ZIP or an automatic apply script, plus a short deployment and phone-test checklist.
