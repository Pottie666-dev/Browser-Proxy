---
name: GET form proxy bug
description: Why search/navigation fails in the proxy browser WebView and how to fix it
---

When a server-side proxy rewrites form actions like `/api/proxy?url=TARGET&accountId=ID`, browsers submitting GET forms replace the entire query string with form fields — so `?url=` and `accountId=` are lost, causing "url query parameter is required" on the server.

**Fix:** Inject a JS event listener (`injectedJavaScriptBeforeContentLoaded`) into the WebView that intercepts GET form submits, extracts the target URL and accountId from the action, appends form fields to the target URL, and navigates via `window.location.href` to the correct `/api/proxy?url=...&accountId=...`.

**How to apply:** See `artifacts/browser-app/lib/fingerprint.ts` → `buildFormInterceptScript()` and `artifacts/browser-app/app/browser.tsx` where both scripts are concatenated in `injectedJavaScriptBeforeContentLoaded`.

**Also:** Add a guard in `onShouldStartLoadWithRequest` to block any URL matching `/api/proxy` but missing `url=` (malformed proxy URLs), returning `false` to prevent the error from reaching the user.
