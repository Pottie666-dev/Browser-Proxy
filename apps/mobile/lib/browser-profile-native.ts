import { NativeModules } from "react-native";

export type NativeProfilePaths = {
  profileId: string;
  rootDir: string;
  cookieDir: string;
  cacheDir: string;
  storageDir: string;
  downloadsDir: string;
  permissionsFile: string;
};

export type NativeProfileCapabilities = {
  available: boolean;
  platform: string;
  supportsProfileDirs: boolean;
  supportsCookieDirectoryPlanning: boolean;
  supportsCacheDirectoryPlanning: boolean;
  supportsDownloadDirectoryPlanning: boolean;
};

type NativeBrowserProfileModule = {
  getCapabilities?: () => Promise<NativeProfileCapabilities>;
  prepareProfile?: (accountId: string) => Promise<NativeProfilePaths>;
  clearProfile?: (accountId: string) => Promise<NativeProfilePaths>;
  getProfilePaths?: (accountId: string) => Promise<NativeProfilePaths>;
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
  };
}

function nativeModule(): NativeBrowserProfileModule | null {
  return (NativeModules.BrowserProfile as NativeBrowserProfileModule | undefined) ?? null;
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
