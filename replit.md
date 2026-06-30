# BrowserVault

A private mobile browser app for managing multiple accounts, each with its own spoofed device profile (User-Agent, IP) routed through a server-side proxy.

## Stack

- **Backend:** Node.js 24, Express 5, Mongoose + MongoDB, Zod validation, esbuild
- **Mobile App:** Expo (React Native), expo-router, react-native-webview
- **Shared:** OpenAPI spec → Orval-generated React Query hooks (`lib/api-client-react`)
- **Monorepo:** pnpm workspaces

## Architecture

```
artifacts/
  api-server/     — Express REST API + proxy server
  browser-app/    — Expo React Native mobile app
lib/
  db/             — Mongoose models & connection (exports AccountModel, connectDb)
  api-spec/       — OpenAPI YAML source of truth
  api-zod/        — Zod schemas generated from OpenAPI
  api-client-react/ — React Query hooks generated from OpenAPI
```

## Running

| Workflow | Command |
|---|---|
| API Server | `pnpm --filter @workspace/api-server run dev` |
| Expo App | `pnpm --filter @workspace/browser-app run dev` |

## Required Secrets

| Key | Purpose |
|---|---|
| `MONGODB_URI` | MongoDB Atlas connection string |
| `SESSION_SECRET` | Session signing |

## Key Notes

- Account IDs are MongoDB ObjectId strings — not numeric. All API routes, client hooks, and the Expo app use `string` for account IDs.
- The WebView (browser) only works on a physical device or Expo Go — not in the web preview pane.
- The cookie jar is in-memory and resets on server restart (tracked as tech debt).
- Proxy strips CSP headers from upstream responses so content renders inside the WebView.
- Device profiles (12 presets) are in `artifacts/api-server/src/lib/devices.ts`.

## User Preferences

- Prefers MongoDB over PostgreSQL.
