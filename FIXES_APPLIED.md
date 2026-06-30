# Fixes applied by ChatGPT

## Browser / proxy loading fixes

- Fixed proxied GET forms, including search pages, so extra query parameters like `q=` are carried through to the target website.
- Added support for non-GET requests through `/api/proxy`, including common JSON and URL-encoded form submissions.
- Improved URL rewriting for more HTML resources: `area`, `frame`, `audio`, `video`, `source`, `embed`, `object[data]`, `srcset`, and CSS `url(...)` values.
- Removed `<base>` tags and CSP meta tags from proxied HTML because they often break proxied navigation inside a WebView.
- Improved Set-Cookie handling for combined cookie headers.
- Added WebView error handling so failed loads show an error instead of spinning forever.
- Changed mobile navigation to update the WebView source directly instead of injecting `window.location`, which is more reliable on Expo/React Native.
- Normalized `EXPO_PUBLIC_DOMAIN` so it works whether the value includes `https://` or not.

## API/spec fixes

- Updated the OpenAPI account ID fields from `integer` to `string` to match MongoDB ObjectId values.

## Password storage improvement

- Added optional password encryption using `ACCOUNT_ENCRYPTION_KEY`.
- New/updated passwords are encrypted when this environment variable is set.
- Existing plaintext passwords still work and will display normally.
- If encrypted passwords exist but the key is missing or wrong, the API returns a safe placeholder instead of exposing broken data.

### Important environment variable

Set this in your Replit secrets / environment:

```text
ACCOUNT_ENCRYPTION_KEY=put-a-long-random-secret-here
```

Do not change this value after creating encrypted accounts, or old encrypted passwords will no longer decrypt.

## Known limitation

The app still does not provide a true external residential/mobile proxy IP. The `fakeIp` value is only forwarded in HTTP headers. Websites normally see the server IP unless you route server-side fetches through a real proxy provider that you are authorized to use.
