# API

## Accounts

Expected account endpoints:

```text
GET    /api/accounts
POST   /api/accounts
GET    /api/accounts/:id
PATCH  /api/accounts/:id
DELETE /api/accounts/:id
```

## Browser State

```text
GET    /api/accounts/:id/browser-state
PATCH  /api/accounts/:id/browser-state
DELETE /api/accounts/:id/browser-state
```

Used for JS-visible cookies, localStorage, sessionStorage, and history.

## Proxy

Current browser URL wrapping pattern:

```text
/api/proxy?url=<target>&accountId=<accountId>
```

## Future API Ideas

Proxy management:

```text
GET    /api/proxies
POST   /api/proxies
PATCH  /api/proxies/:id
DELETE /api/proxies/:id
POST   /api/proxies/:id/check
```

Fingerprint testing:

```text
GET    /api/accounts/:id/fingerprint
POST   /api/accounts/:id/fingerprint/test
POST   /api/accounts/:id/fingerprint/regenerate
```

Browser profile:

```text
GET    /api/accounts/:id/profile
POST   /api/accounts/:id/profile/clone
POST   /api/accounts/:id/profile/reset
POST   /api/accounts/:id/profile/export
POST   /api/accounts/:id/profile/import
```
