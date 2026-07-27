import { requireOptionalNativeModule } from "expo-modules-core";

export type NativeProfilePaths = {
  profileId: string;
  rootDir: string;
  cookieDir: string;
  cacheDir: string;
  storageDir: string;
  downloadsDir: string;
  permissionsFile: string;
  profileFile?: string;
};

export type NativeProfileCapabilities = {
  available: boolean;
  platform: string;
  supportsProfileDirs: boolean;
  supportsCookieDirectoryPlanning: boolean;
  supportsCacheDirectoryPlanning: boolean;
  supportsDownloadDirectoryPlanning: boolean;
  supportsNativeProfileManager?: boolean;
  supportsNativeCookieIsolation?: boolean;
  supportsNativeStorageIsolation?: boolean;
  supportsNativeWebViewHost?: boolean;
  supportsDownloadIsolation?: boolean;
  supportsPermissionIsolation?: boolean;
  webViewMultiProfileSupported?: boolean;
};

export type NativeProfileStatus = {
  profileId: string;
  exists: boolean;
  rootDir: string;
  cookieDirExists: boolean;
  cacheDirExists: boolean;
  storageDirExists: boolean;
  downloadsDirExists: boolean;
  permissionsFileExists: boolean;
  profileFileExists: boolean;
  nativeMultiProfileSupported?: boolean;
};

type NativeBrowserProfileModule = {
  getCapabilities?: () => Promise<NativeProfileCapabilities>;
  prepareProfile?: (accountId: string) => Promise<NativeProfilePaths>;
  clearProfile?: (accountId: string) => Promise<NativeProfilePaths>;
  getProfilePaths?: (accountId: string) => Promise<NativeProfilePaths>;
  getProfileStatus?: (accountId: string) => Promise<NativeProfileStatus>;
};

function safeId(accountId: string): string {
  return (accountId || "default").replace(/[^a-zA-Z0-9_-]/g, "_");
}

function fallbackPaths(accountId: string): NativeProfilePaths {
  const id = safeId(accountId);

  return {
    profileId: id,
    rootDir: `browser-profiles/${id}`,
    cookieDir: `browser-profiles/${id}/cookies`,
    cacheDir: `browser-profiles/${id}/cache`,
    storageDir: `browser-profiles/${id}/storage`,
    downloadsDir: `browser-profiles/${id}/downloads`,
    permissionsFile: `browser-profiles/${id}/permissions.json`,
    profileFile: `browser-profiles/${id}/profile.json`,
  };
}

function nativeModule(): NativeBrowserProfileModule | null {
  return requireOptionalNativeModule<NativeBrowserProfileModule>("BrowserProfile");
}

export async function getNativeProfileCapabilities(): Promise<NativeProfileCapabilities> {
  const module = nativeModule();

  if (!module?.getCapabilities) {
    return {
      available: false,
      platform: "expo-go",
      supportsProfileDirs: false,
      supportsCookieDirectoryPlanning: false,
      supportsCacheDirectoryPlanning: false,
      supportsDownloadDirectoryPlanning: false,
      supportsNativeProfileManager: false,
      supportsNativeCookieIsolation: false,
      supportsNativeStorageIsolation: false,
      supportsNativeWebViewHost: false,
      supportsDownloadIsolation: false,
      supportsPermissionIsolation: false,
      webViewMultiProfileSupported: false,
    };
  }

  return module.getCapabilities();
}

export async function prepareNativeBrowserProfile(accountId: string): Promise<NativeProfilePaths> {
  const module = nativeModule();
  return module?.prepareProfile ? module.prepareProfile(accountId) : fallbackPaths(accountId);
}

export async function clearNativeBrowserProfile(accountId: string): Promise<NativeProfilePaths> {
  const module = nativeModule();
  return module?.clearProfile ? module.clearProfile(accountId) : fallbackPaths(accountId);
}

export async function getNativeBrowserProfilePaths(accountId: string): Promise<NativeProfilePaths> {
  const module = nativeModule();
  return module?.getProfilePaths ? module.getProfilePaths(accountId) : fallbackPaths(accountId);
}

export async function getNativeBrowserProfileStatus(accountId: string): Promise<NativeProfileStatus> {
  const module = nativeModule();
  if (module?.getProfileStatus) return module.getProfileStatus(accountId);

  const paths = fallbackPaths(accountId);
  return {
    profileId: paths.profileId,
    exists: false,
    rootDir: paths.rootDir,
    cookieDirExists: false,
    cacheDirExists: false,
    storageDirExists: false,
    downloadsDirExists: false,
    permissionsFileExists: false,
    profileFileExists: false,
  };
}
