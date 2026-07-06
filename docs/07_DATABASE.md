# Database

## Current Database

MongoDB is used for backend persistence.

## Account Document

Current account data includes name, surname, email, username, password, walletName, idNumber, cryptoAddress, images, deviceName, userAgent, fakeIp, timezone, fingerprint, metadata, favorite, tags, browserState, createdAt, and updatedAt.

## Fingerprint

Stored under the account. It includes profileId, timezone, locale, deviceName, userAgent, screen data, WebGL data, canvas/audio data, battery, network, and geolocation.

## Browser State

Stored under account:

```json
{
  "browserState": {
    "cookies": {},
    "localStorage": {},
    "sessionStorage": {},
    "history": [],
    "updatedAt": "..."
  }
}
```

## Future Collections

Potential future collections:

- proxies
- proxyHealthChecks
- browserProfiles
- accountEvents
- downloads
- permissions
- auditLogs
- profileBackups
- fingerprintTests

## Backup Ideas

- export account JSON
- encrypted profile export
- full Mongo backup
- per-account backup
- restore account from file
