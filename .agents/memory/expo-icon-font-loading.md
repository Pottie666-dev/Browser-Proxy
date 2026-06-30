---
name: Expo icon font loading
description: Why @expo/vector-icons show as broken glyphs and how to load them reliably
---

If Inter (or any Google Fonts CDN font) fails to load, `useFonts({...Inter, ...Feather.font})` in a single call means ALL fonts fail together — icons show as "?" boxes even though Feather.ttf is local.

**Fix:** Load fonts separately via `Font.loadAsync` in `useEffect`, Feather first (local, should never fail), then Inter (CDN, can fail on slow networks). Both are wrapped in try/catch so one failure doesn't block the other.

**Also:** Declare the Feather TTF in `app.json` under the `expo-font` plugin so it's bundled as a native asset for EAS builds:
```json
["expo-font", { "fonts": ["node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/Feather.ttf"] }]
```

**How to apply:** See `artifacts/browser-app/app/_layout.tsx`.
