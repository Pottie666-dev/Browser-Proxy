# Fingerprint Engine

## Goal

Every account gets a stable, believable browser fingerprint that stays consistent across sessions.

The fingerprint must not be regenerated every launch. It is generated once and stored with the account.

## Current Fingerprint Fields

- profileId
- generatedAt
- timezone
- locale
- languages
- brand/model/deviceName
- Android version/build ID/Chrome version
- user agent
- platform/vendor/product
- screen width/height/available size
- pixel ratio/color depth/orientation
- hardwareConcurrency/deviceMemory/maxTouchPoints
- WebGL vendor/renderer
- canvas seed/noise
- audio seed/noise
- fonts
- battery profile
- network profile
- geolocation
- media device counts

## Runtime APIs

The injected runtime modifies or masks Navigator, Screen, Intl timezone, matchMedia, localStorage/sessionStorage namespace, document.cookie JS sandbox, WebGL/WebGL2, Canvas, ImageData, TextMetrics, AudioBuffer, Battery API, Network Information API, Permissions API, Geolocation API, WebRTC constructors, MediaDevices, Notifications, Clipboard, SpeechSynthesis, Plugins/mimeTypes, Bluetooth/USB/Serial/HID/NFC, and motion/orientation sensors.

## Stable vs Dynamic

Stable:

- device model
- screen metrics
- user agent
- WebGL vendor/renderer
- fonts
- canvas seed
- audio seed
- timezone
- locale
- geolocation base

Dynamic but controlled:

- battery level drift
- network timing
- browsing history
- cookies
- storage

## Known Limits

JavaScript-level spoofing is useful but not perfect. True isolation requires native Android work for HTTP-only cookies, IndexedDB, service workers, native cache, network stack, and WebRTC below JS.
