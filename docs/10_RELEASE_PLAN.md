# Release Plan

## Planned Tags

- v0.1 - Account Management
- v0.2 - Identity Engine
- v0.3 - Persistent Fingerprints
- v0.4 - Browser Runtime Isolation
- v0.5 - Browser State Persistence
- v0.6 - Tabs, Bookmarks and History
- v0.7 - Session Isolation
- v0.8 - Native Foundation
- v0.9 - Native Browser Profile Module
- v1.0 - First Stable Native Browser

## Release Checklist

Before tagging:

- typecheck libs
- typecheck mobile
- typecheck API
- native build
- install on phone
- smoke test account create/open browser
- check docs updated
- commit clean
- tag
- push tag

## Tag Command

```bash
git tag v0.9
git push origin v0.9
```
