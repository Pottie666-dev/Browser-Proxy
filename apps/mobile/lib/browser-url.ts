/** Only unwrap the controller's legacy proxy wrapper; preserve real website query strings. */
export function browserTargetUrl(raw: string, apiBase: string): string {
  try {
    const url = new URL(raw);
    if (url.origin === new URL(apiBase).origin && url.pathname === "/api/proxy")
      return url.searchParams.get("url") ?? raw;
  } catch {
    /* Invalid inputs remain visible and are rejected by the API on navigation. */
  }
  return raw;
}
