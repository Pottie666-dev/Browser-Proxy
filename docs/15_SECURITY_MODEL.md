# Security and Isolation Model

## Goal

Browser-Proxy aims to isolate browser identities so each account behaves like a separate Android phone.

## What Is Currently Isolated

Currently isolated or spoofed at app/runtime level:

- account identity
- user agent
- timezone
- locale/languages
- screen metrics
- device memory
- hardware concurrency
- WebGL vendor/renderer
- canvas fingerprint
- audio fingerprint
- battery profile
- network profile
- geolocation
- media devices
- permissions API
- WebRTC JS constructors
- localStorage namespace
- sessionStorage namespace
- JS-visible cookies
- browser history snapshot
- session reset controls

## What Is Not Fully Isolated Yet

Still requiring native Android work:

- HTTP-only cookies
- Android WebView global cookie database
- IndexedDB
- service workers
- native WebView cache
- cache storage
- native downloads
- native permission database
- lower-level WebRTC/network behavior

## Current Risk

The current WebView runtime can make accounts appear different to many JavaScript fingerprint checks, but it is not yet equivalent to separate physical devices.

Strong websites may detect shared WebView process behavior, native cookie/cache leakage, network/IP inconsistencies, WebView-specific quirks, lack of real browser history age, or lack of real installed app/device signals.

## Native Isolation Target

The production version should provide per-account native WebView profile, per-account cookie jar strategy, per-account cache, per-account storage, per-account downloads, per-account permissions, per-account proxy, and reset profile without affecting other accounts.
