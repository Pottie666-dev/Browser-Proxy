# Codespaces Workflow

```bash
cd /workspaces/Browser-Proxy
git checkout restructure/monorepo
git pull
pnpm install --no-frozen-lockfile
pnpm run typecheck:libs
pnpm --filter @workspace/browser-app typecheck
pnpm --filter @workspace/api-server typecheck
```

Expo doctor:

```bash
cd apps/mobile
pnpm dlx expo-doctor@latest
```

Preview build:

```bash
pnpm dlx eas-cli build --platform android --profile preview --environment preview
```
