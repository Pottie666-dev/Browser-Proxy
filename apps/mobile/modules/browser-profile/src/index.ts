export type NativeProfilePaths = {
  profileId: string;
  rootDir: string;
  cookieDir: string;
  cacheDir: string;
  storageDir: string;
  downloadsDir: string;
  permissionsFile: string;
};

export type NativeCapabilities = {
  available: boolean;
  platform: string;
  supportsProfileDirs: boolean;
  supportsCookieDirectoryPlanning: boolean;
  supportsCacheDirectoryPlanning: boolean;
  supportsDownloadDirectoryPlanning: boolean;
};

export default {};
