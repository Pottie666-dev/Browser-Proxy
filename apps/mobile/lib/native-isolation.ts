export type IsolationCapability = {
  key: string;
  label: string;
  status: "js" | "native-required" | "native-ready";
  description: string;
};

export type BrowserProfilePaths = {
  profileId: string;
  cookieStore: string;
  cacheStore: string;
  storageStore: string;
  downloadsStore: string;
  permissionsStore: string;
};

export function getBrowserProfilePaths(accountId: string): BrowserProfilePaths {
  const safeId = accountId.replace(/[^a-zA-Z0-9_-]/g, "_") || "default";

  return {
    profileId: safeId,
    cookieStore: `browser-profiles/${safeId}/cookies`,
    cacheStore: `browser-profiles/${safeId}/cache`,
    storageStore: `browser-profiles/${safeId}/storage`,
    downloadsStore: `browser-profiles/${safeId}/downloads`,
    permissionsStore: `browser-profiles/${safeId}/permissions`,
  };
}

export function getIsolationCapabilities(): IsolationCapability[] {
  return [
    { key: "identity", label: "Stable identity", status: "native-ready", description: "Persistent fingerprint, device, timezone and hardware profile are stored per account." },
    { key: "js-storage", label: "JS storage", status: "js", description: "localStorage/sessionStorage are namespaced and persisted through the API." },
    { key: "js-cookies", label: "JS cookies", status: "js", description: "JavaScript-visible cookies are captured and restored per account." },
    { key: "http-cookies", label: "HTTP-only cookies", status: "native-required", description: "Requires native Android CookieManager/WebView profile isolation." },
    { key: "indexeddb", label: "IndexedDB", status: "native-required", description: "Requires per-account native WebView data directory or dedicated WebView container." },
    { key: "cache", label: "Cache", status: "native-required", description: "Requires native cache directory isolation." },
    { key: "service-workers", label: "Service workers", status: "native-required", description: "Requires native WebView profile isolation." },
    { key: "downloads", label: "Downloads", status: "native-required", description: "Requires native download manager routing per account." },
    { key: "permissions", label: "Permissions", status: "native-required", description: "Requires native geolocation/media/notification permission routing per account." },
  ];
}

export function isNativeIsolationAvailable(): boolean {
  return false;
}
