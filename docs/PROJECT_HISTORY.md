# Project History

## Beginning

Browser-Proxy started as a React Native / Expo mobile app where accounts could be linked and opened in a browser. The original requirement was that each account needed a different web footprint: different IP, device and browser identity.

## First Problem

The app had seeded accounts that were never manually added. This led to fixing account storage and moving toward a proper API-backed account system.

## API and Mongo

The backend was improved with local accounts store, Mongo connection, account model, account CRUD, fallback memory mode, and environment configuration.

## Account Vault

The mobile app gained search, favorites, tags, images, edit/delete/open browser actions.

## Identity Shift

The project changed from “browser with proxy” to “virtual phone per account.”

That changed the architecture. Each account needed persistent device, persistent fingerprint, persistent browser state, and eventually native storage isolation.

## Browser Identity Work

The browser gained fingerprint injection, WebGL spoofing, canvas/audio spoofing, timezone/locale spoofing, battery/network/geolocation profiles, WebRTC blocking, and runtime isolation.

## Browser State

Browser state persistence was added so each account could remember JS cookies, localStorage, sessionStorage, and history.

## Native Direction

Expo Go was useful for speed, but the project reached the point where native Android was required.

Stage 8 introduced native isolation foundation and native BrowserProfile module scaffold.

## Raspberry Pi Development

The project is being developed from a phone using Termux SSH, Raspberry Pi devbox, code-server as optional editor, tmux for long tasks, and Android phone connected via USB debugging.

## Current Position

The app is ready for the first native Android build once the NDK install completes. The next important milestone is verifying that the native BrowserProfile module loads in the installed Android app.
