# Project Vision

## Mission

Browser-Proxy is evolving into a browser identity platform where every account behaves like its own independent Android device.

The original idea was simple: create a mobile app where different user accounts can browse the web through different footprints. Over time, the project evolved into something bigger: a virtual phone per account.

## The Core Idea

Each account should have a persistent browser identity.

John should always be John:

- same phone model
- same browser fingerprint
- same timezone
- same language
- same cookies
- same browser history
- same local storage
- same behavior profile

Sarah should be completely separate:

- different phone model
- different fingerprint
- different storage
- different browser state
- different proxy/IP
- no shared cookies
- no shared cache
- no shared history

## Final Experience

The user opens the app, chooses an account, and the browser behaves as if it is a dedicated Android phone for that account.

The user should not need to think about technical details. The app should handle device identity, browser identity, session persistence, cookies, proxy selection, timezone matching, fingerprint matching, session reset, storage isolation, downloads, and permissions.

## Product Philosophy

Browser-Proxy should be practical on a phone, usable from a Raspberry Pi development setup, simple enough to run daily, powerful enough to isolate identities, documented enough to recover after a reinstall, and modular enough to reuse technology in other projects.
