# Architecture

## High-Level Flow

```text
Mobile App
  -> Account Vault
  -> Browser Screen
  -> Fingerprint Runtime
  -> API Proxy
  -> Remote Website
```

Long-term native flow:

```text
Account
  -> Identity Profile
  -> Native Browser Profile
  -> Isolated WebView Storage
  -> Proxy Layer
  -> Remote Website
```

## Monorepo Structure

```text
apps/
  api/
  mobile/
    app/
    lib/
    modules/browser-profile/
packages/
  api-client-react/
  api-zod/
  db/
docs/
```

## Mobile App

The mobile app is React Native with Expo Router. It handles account vault UI, browser UI, tabs/bookmarks/history, identity display, injected runtime spoofing, browser state capture/restore, and native module wrapper calls.

## API Server

The API server handles account CRUD, Mongo storage, identity generation, browser state persistence, browser state reset, and proxy endpoint.

## Identity Profile

The identity profile is generated once per account and stored forever unless intentionally reset. It includes device, browser, timezone, language, screen, hardware, WebGL, canvas, audio, fonts, battery, network, and geolocation data.

## Browser Runtime

Injected JavaScript aligns browser APIs with the account identity. It modifies/masks navigator, screen, Intl timezone, WebGL, Canvas, AudioBuffer, Battery, Network Information, Permissions, Geolocation, MediaDevices, WebRTC constructors, Clipboard, Notification, SpeechSynthesis, plugins, mimeTypes, and sensors.

## Browser State

The app captures and restores JS-visible cookies, localStorage, sessionStorage, and history. HTTP-only cookies, IndexedDB, service workers and native cache require native Android work.

## Native Browser Profile Module

Stage 8B added `apps/mobile/modules/browser-profile/`.

It currently exposes:

- `getCapabilities`
- `prepareProfile(accountId)`
- `getProfilePaths(accountId)`
- `clearProfile(accountId)`

It creates:

```text
browser-profiles/<accountId>/
  cookies/
  cache/
  storage/
  downloads/
  permissions.json
```
