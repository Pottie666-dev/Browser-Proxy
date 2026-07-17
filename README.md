# Browser-Proxy

Browser-Proxy is a mobile browser identity platform. The goal is for every saved account to behave like its own separate Android phone, with its own persistent identity, browser state, storage, proxy/IP, and eventually native profile isolation.

## Current status

Completed:

- Phase 1: Account Vault
- Phase 2: Identity generation
- Phase 3: Persistent per-account browser identity
- Phase 4A: Browser runtime isolation
- Phase 4B: Browser state persistence
- Phase 5: Browser UX with tabs, bookmarks and history
- Phase 6: Device virtualization
- Phase 7: Session isolation controls
- Stage 8A: Native browser isolation foundation
- Stage 8B: Native browser profile module scaffold

In progress:

- Android NDK setup on Raspberry Pi
- First custom native Android build
- Native BrowserProfile module verification

## Quick commands

```bash
pnpm run typecheck:libs
pnpm --filter @workspace/browser-app typecheck
pnpm --filter @workspace/api-server typecheck
pnpm run mobile:android:native
```

## Documentation

See the `docs/` folder for project vision, roadmap, architecture, development setup, native Android work, fingerprint engine, proxy engine, database, API, UI/UX, release plan, ideas, dev notes, changelog, troubleshooting, security model, and project history.
## Cloud Browser Expansion

- `docs/16_CLOUD_BROWSER.md`
- `docs/17_CLOUD_BROWSER_ARCHITECTURE.md`
- `docs/18_CLOUD_BROWSER_API.md`
- `docs/19_CLOUD_BROWSER_MOBILE.md`
- `docs/20_CLOUD_BROWSER_DEPLOYMENT.md`
- `docs/21_CLOUD_BROWSER_SECURITY.md`
- `docs/22_CLOUD_BROWSER_TASKS.md`
- `docs/23_CODESPACES_WORKFLOW.md`
- `docs/24_FIRST_USABLE_RELEASE.md`
