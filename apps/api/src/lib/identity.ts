type DeviceTemplate = {
  deviceName: string;
  androidVersion: string;
  chromeVersion: string;
  screenWidth: number;
  screenHeight: number;
  pixelRatio: number;
  platform: string;
  vendor: string;
  hardwareConcurrency: number;
  deviceMemory: number;
  webglVendor: string;
  webglRendererBase: string;
};

const devices: DeviceTemplate[] = [
  { deviceName: "Samsung Galaxy S23", androidVersion: "13", chromeVersion: "120.0.6099.230", screenWidth: 360, screenHeight: 780, pixelRatio: 3, platform: "Linux armv8l", vendor: "Google Inc.", hardwareConcurrency: 8, deviceMemory: 8, webglVendor: "Qualcomm", webglRendererBase: "Adreno (TM) 740" },
  { deviceName: "Samsung Galaxy A54", androidVersion: "13", chromeVersion: "119.0.6045.194", screenWidth: 384, screenHeight: 854, pixelRatio: 2.75, platform: "Linux armv8l", vendor: "Google Inc.", hardwareConcurrency: 8, deviceMemory: 6, webglVendor: "ARM", webglRendererBase: "Mali-G68" },
  { deviceName: "Google Pixel 7", androidVersion: "13", chromeVersion: "120.0.6099.230", screenWidth: 412, screenHeight: 915, pixelRatio: 2.625, platform: "Linux armv8l", vendor: "Google Inc.", hardwareConcurrency: 8, deviceMemory: 8, webglVendor: "ARM", webglRendererBase: "Mali-G710" },
  { deviceName: "Google Pixel 6a", androidVersion: "12", chromeVersion: "118.0.5993.111", screenWidth: 412, screenHeight: 915, pixelRatio: 2.625, platform: "Linux armv8l", vendor: "Google Inc.", hardwareConcurrency: 8, deviceMemory: 6, webglVendor: "ARM", webglRendererBase: "Mali-G78" },
  { deviceName: "OnePlus 11", androidVersion: "13", chromeVersion: "120.0.6099.230", screenWidth: 412, screenHeight: 919, pixelRatio: 3.5, platform: "Linux armv8l", vendor: "Google Inc.", hardwareConcurrency: 8, deviceMemory: 8, webglVendor: "Qualcomm", webglRendererBase: "Adreno (TM) 740" },
  { deviceName: "Oppo Find X5", androidVersion: "12", chromeVersion: "117.0.5938.140", screenWidth: 393, screenHeight: 873, pixelRatio: 2.75, platform: "Linux armv8l", vendor: "Google Inc.", hardwareConcurrency: 8, deviceMemory: 8, webglVendor: "Qualcomm", webglRendererBase: "Adreno (TM) 730" },
  { deviceName: "Xiaomi Redmi Note 12", androidVersion: "13", chromeVersion: "119.0.6045.194", screenWidth: 393, screenHeight: 873, pixelRatio: 2.75, platform: "Linux armv8l", vendor: "Google Inc.", hardwareConcurrency: 8, deviceMemory: 6, webglVendor: "Qualcomm", webglRendererBase: "Adreno (TM) 619" },
];

const timezones = ["Africa/Johannesburg", "Europe/London", "Europe/Dublin", "Australia/Sydney", "Asia/Dubai"];
const locales = ["en-ZA", "en-GB", "en-US"];
const fontPools = [
  ["Roboto", "Noto Sans", "Droid Sans", "Arial", "sans-serif"],
  ["Roboto", "Google Sans", "Noto Sans", "Arial", "sans-serif"],
  ["Roboto", "SamsungOne", "Noto Sans", "Arial", "sans-serif"],
];

function pick<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)]!;
}

function rand(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function seed(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

function noise(): number {
  return rand(1000, 9999) / 10000000;
}

function fakePublicIp(): string {
  const ranges = [
    [102, rand(132, 191), rand(1, 254), rand(1, 254)],
    [105, rand(184, 245), rand(1, 254), rand(1, 254)],
    [154, rand(64, 127), rand(1, 254), rand(1, 254)],
    [196, rand(1, 255), rand(1, 254), rand(1, 254)],
  ];
  return pick(ranges).join(".");
}

export type BrowserFingerprint = {
  profileId: string;
  generatedAt: string;

  timezone: string;
  locale: string;
  languages: string[];

  platform: string;
  vendor: string;
  deviceName: string;
  androidVersion: string;
  chromeVersion: string;
  userAgent: string;

  screenWidth: number;
  screenHeight: number;
  pixelRatio: number;

  hardwareConcurrency: number;
  deviceMemory: number;

  webglVendor: string;
  webglRenderer: string;

  canvasSeed: string;
  canvasNoise: number;
  audioSeed: string;
  audioNoise: number;

  fonts: string[];

  battery: {
    charging: boolean;
    level: number;
    chargingTime: number;
    dischargingTime: number;
  };

  network: {
    effectiveType: "3g" | "4g" | "5g";
    downlink: number;
    rtt: number;
    saveData: boolean;
  };
};

export type GeneratedIdentity = {
  deviceName: string;
  fakeIp: string;
  userAgent: string;
  timezone: string;
  fingerprint: BrowserFingerprint;
};

export function generateIdentity(timezoneOverride?: string): GeneratedIdentity {
  const device = pick(devices);
  const locale = pick(locales);
  const timezone = timezoneOverride || pick(timezones);
  const userAgent = `Mozilla/5.0 (Linux; Android ${device.androidVersion}; ${device.deviceName}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${device.chromeVersion} Mobile Safari/537.36`;

  const fingerprint: BrowserFingerprint = {
    profileId: seed(),
    generatedAt: new Date().toISOString(),

    timezone,
    locale,
    languages: [locale, "en"],

    platform: device.platform,
    vendor: device.vendor,
    deviceName: device.deviceName,
    androidVersion: device.androidVersion,
    chromeVersion: device.chromeVersion,
    userAgent,

    screenWidth: device.screenWidth,
    screenHeight: device.screenHeight,
    pixelRatio: device.pixelRatio,

    hardwareConcurrency: device.hardwareConcurrency,
    deviceMemory: device.deviceMemory,

    webglVendor: device.webglVendor,
    webglRenderer: device.webglRendererBase,

    canvasSeed: seed(),
    canvasNoise: noise(),
    audioSeed: seed(),
    audioNoise: noise(),

    fonts: pick(fontPools),

    battery: {
      charging: Math.random() > 0.35,
      level: rand(38, 97) / 100,
      chargingTime: 0,
      dischargingTime: rand(7200, 28800),
    },

    network: {
      effectiveType: pick(["4g", "5g"] as const),
      downlink: rand(12, 95) / 10,
      rtt: rand(35, 180),
      saveData: false,
    },
  };

  return {
    deviceName: device.deviceName,
    fakeIp: fakePublicIp(),
    userAgent,
    timezone,
    fingerprint,
  };
}

export function mergeFingerprint(existing: unknown, patch: unknown): Record<string, unknown> {
  const base = existing && typeof existing === "object" ? (existing as Record<string, unknown>) : {};
  const next = patch && typeof patch === "object" ? (patch as Record<string, unknown>) : {};
  return {
    ...base,
    ...next,
  };
}
