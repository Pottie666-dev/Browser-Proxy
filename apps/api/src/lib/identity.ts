type DeviceTemplate = {
  brand: string;
  model: string;
  deviceName: string;
  androidVersion: string;
  buildId: string;
  chromeVersion: string;
  screenWidth: number;
  screenHeight: number;
  pixelRatio: number;
  colorDepth: number;
  platform: string;
  vendor: string;
  hardwareConcurrency: number;
  deviceMemory: number;
  maxTouchPoints: number;
  webglVendor: string;
  webglRenderer: string;
  fonts: string[];
};

const devices: DeviceTemplate[] = [
  {
    brand: "Samsung",
    model: "SM-S911B",
    deviceName: "Samsung Galaxy S23",
    androidVersion: "13",
    buildId: "TP1A.220624.014",
    chromeVersion: "120.0.6099.230",
    screenWidth: 360,
    screenHeight: 780,
    pixelRatio: 3,
    colorDepth: 24,
    platform: "Linux armv8l",
    vendor: "Google Inc.",
    hardwareConcurrency: 8,
    deviceMemory: 8,
    maxTouchPoints: 5,
    webglVendor: "Qualcomm",
    webglRenderer: "Adreno (TM) 740",
    fonts: ["Roboto", "SamsungOne", "Noto Sans", "Droid Sans", "Arial", "sans-serif"],
  },
  {
    brand: "Samsung",
    model: "SM-A546E",
    deviceName: "Samsung Galaxy A54",
    androidVersion: "13",
    buildId: "TP1A.220624.014",
    chromeVersion: "119.0.6045.194",
    screenWidth: 384,
    screenHeight: 854,
    pixelRatio: 2.75,
    colorDepth: 24,
    platform: "Linux armv8l",
    vendor: "Google Inc.",
    hardwareConcurrency: 8,
    deviceMemory: 6,
    maxTouchPoints: 5,
    webglVendor: "ARM",
    webglRenderer: "Mali-G68",
    fonts: ["Roboto", "SamsungOne", "Noto Sans", "Droid Sans", "Arial", "sans-serif"],
  },
  {
    brand: "Google",
    model: "Pixel 7",
    deviceName: "Google Pixel 7",
    androidVersion: "13",
    buildId: "TQ3A.230805.001",
    chromeVersion: "120.0.6099.230",
    screenWidth: 412,
    screenHeight: 915,
    pixelRatio: 2.625,
    colorDepth: 24,
    platform: "Linux armv8l",
    vendor: "Google Inc.",
    hardwareConcurrency: 8,
    deviceMemory: 8,
    maxTouchPoints: 5,
    webglVendor: "ARM",
    webglRenderer: "Mali-G710",
    fonts: ["Roboto", "Google Sans", "Noto Sans", "Droid Sans", "Arial", "sans-serif"],
  },
  {
    brand: "Google",
    model: "Pixel 6a",
    deviceName: "Google Pixel 6a",
    androidVersion: "12",
    buildId: "SQ3A.220705.003",
    chromeVersion: "118.0.5993.111",
    screenWidth: 412,
    screenHeight: 915,
    pixelRatio: 2.625,
    colorDepth: 24,
    platform: "Linux armv8l",
    vendor: "Google Inc.",
    hardwareConcurrency: 8,
    deviceMemory: 6,
    maxTouchPoints: 5,
    webglVendor: "ARM",
    webglRenderer: "Mali-G78",
    fonts: ["Roboto", "Google Sans", "Noto Sans", "Droid Sans", "Arial", "sans-serif"],
  },
  {
    brand: "OnePlus",
    model: "CPH2449",
    deviceName: "OnePlus 11",
    androidVersion: "13",
    buildId: "TP1A.220905.001",
    chromeVersion: "120.0.6099.230",
    screenWidth: 412,
    screenHeight: 919,
    pixelRatio: 3.5,
    colorDepth: 24,
    platform: "Linux armv8l",
    vendor: "Google Inc.",
    hardwareConcurrency: 8,
    deviceMemory: 8,
    maxTouchPoints: 5,
    webglVendor: "Qualcomm",
    webglRenderer: "Adreno (TM) 740",
    fonts: ["Roboto", "OnePlus Sans", "Noto Sans", "Droid Sans", "Arial", "sans-serif"],
  },
  {
    brand: "Oppo",
    model: "CPH2307",
    deviceName: "Oppo Find X5",
    androidVersion: "12",
    buildId: "SKQ1.211006.001",
    chromeVersion: "117.0.5938.140",
    screenWidth: 393,
    screenHeight: 873,
    pixelRatio: 2.75,
    colorDepth: 24,
    platform: "Linux armv8l",
    vendor: "Google Inc.",
    hardwareConcurrency: 8,
    deviceMemory: 8,
    maxTouchPoints: 5,
    webglVendor: "Qualcomm",
    webglRenderer: "Adreno (TM) 730",
    fonts: ["Roboto", "ColorOS Sans", "Noto Sans", "Droid Sans", "Arial", "sans-serif"],
  },
  {
    brand: "Xiaomi",
    model: "22111317G",
    deviceName: "Xiaomi Redmi Note 12",
    androidVersion: "13",
    buildId: "TKQ1.221013.002",
    chromeVersion: "119.0.6045.194",
    screenWidth: 393,
    screenHeight: 873,
    pixelRatio: 2.75,
    colorDepth: 24,
    platform: "Linux armv8l",
    vendor: "Google Inc.",
    hardwareConcurrency: 8,
    deviceMemory: 6,
    maxTouchPoints: 5,
    webglVendor: "Qualcomm",
    webglRenderer: "Adreno (TM) 619",
    fonts: ["Roboto", "MiSans", "Noto Sans", "Droid Sans", "Arial", "sans-serif"],
  },
];

const timezones = ["Africa/Johannesburg", "Europe/London", "Europe/Dublin", "Australia/Sydney", "Asia/Dubai"];
const localesByTimezone: Record<string, string[]> = {
  "Africa/Johannesburg": ["en-ZA", "af-ZA", "zu-ZA"],
  "Europe/London": ["en-GB"],
  "Europe/Dublin": ["en-IE", "en-GB"],
  "Australia/Sydney": ["en-AU"],
  "Asia/Dubai": ["en-AE", "en-GB"],
  "America/New_York": ["en-US"],
};

const geoByTimezone: Record<string, { latitude: number; longitude: number; accuracy: number }> = {
  "Africa/Johannesburg": { latitude: -26.2041, longitude: 28.0473, accuracy: 190 },
  "Europe/London": { latitude: 51.5072, longitude: -0.1276, accuracy: 170 },
  "Europe/Dublin": { latitude: 53.3498, longitude: -6.2603, accuracy: 170 },
  "Asia/Dubai": { latitude: 25.2048, longitude: 55.2708, accuracy: 210 },
  "Australia/Sydney": { latitude: -33.8688, longitude: 151.2093, accuracy: 230 },
  "America/New_York": { latitude: 40.7128, longitude: -74.006, accuracy: 210 },
};

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

function jitterGeo(base: { latitude: number; longitude: number; accuracy: number }) {
  return {
    latitude: Number((base.latitude + rand(-35, 35) / 10000).toFixed(6)),
    longitude: Number((base.longitude + rand(-35, 35) / 10000).toFixed(6)),
    accuracy: base.accuracy + rand(-40, 90),
  };
}

export type BrowserFingerprint = {
  profileId: string;
  generatedAt: string;

  timezone: string;
  locale: string;
  languages: string[];

  brand: string;
  model: string;
  deviceName: string;
  androidVersion: string;
  buildId: string;
  chromeVersion: string;
  userAgent: string;

  platform: string;
  vendor: string;
  product: string;
  productSub: string;
  appName: string;
  appCodeName: string;

  screenWidth: number;
  screenHeight: number;
  availWidth: number;
  availHeight: number;
  pixelRatio: number;
  colorDepth: number;
  orientationType: "portrait-primary" | "landscape-primary";
  orientationAngle: number;

  hardwareConcurrency: number;
  deviceMemory: number;
  maxTouchPoints: number;

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
    driftPerHour: number;
  };

  network: {
    type: "cellular" | "wifi";
    effectiveType: "3g" | "4g" | "5g";
    downlink: number;
    rtt: number;
    saveData: boolean;
  };

  geolocation: {
    latitude: number;
    longitude: number;
    accuracy: number;
  };

  mediaDevices: {
    cameraCount: number;
    microphoneCount: number;
    speakerCount: number;
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
  const timezone = timezoneOverride || pick(timezones);
  const locale = pick(localesByTimezone[timezone] ?? ["en-ZA", "en-GB", "en-US"]);
  const geo = jitterGeo(geoByTimezone[timezone] ?? geoByTimezone["Africa/Johannesburg"]);
  const profileId = seed();

  const userAgent = `Mozilla/5.0 (Linux; Android ${device.androidVersion}; ${device.model} Build/${device.buildId}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${device.chromeVersion} Mobile Safari/537.36`;

  const fingerprint: BrowserFingerprint = {
    profileId,
    generatedAt: new Date().toISOString(),

    timezone,
    locale,
    languages: [locale, "en"],

    brand: device.brand,
    model: device.model,
    deviceName: device.deviceName,
    androidVersion: device.androidVersion,
    buildId: device.buildId,
    chromeVersion: device.chromeVersion,
    userAgent,

    platform: device.platform,
    vendor: device.vendor,
    product: "Gecko",
    productSub: "20030107",
    appName: "Netscape",
    appCodeName: "Mozilla",

    screenWidth: device.screenWidth,
    screenHeight: device.screenHeight,
    availWidth: device.screenWidth,
    availHeight: device.screenHeight - rand(24, 34),
    pixelRatio: device.pixelRatio,
    colorDepth: device.colorDepth,
    orientationType: "portrait-primary",
    orientationAngle: 0,

    hardwareConcurrency: device.hardwareConcurrency,
    deviceMemory: device.deviceMemory,
    maxTouchPoints: device.maxTouchPoints,

    webglVendor: device.webglVendor,
    webglRenderer: device.webglRenderer,

    canvasSeed: seed(),
    canvasNoise: noise(),
    audioSeed: seed(),
    audioNoise: noise(),

    fonts: device.fonts,

    battery: {
      charging: Math.random() > 0.35,
      level: rand(38, 97) / 100,
      chargingTime: 0,
      dischargingTime: rand(7200, 28800),
      driftPerHour: rand(1, 8) / 100,
    },

    network: {
      type: Math.random() > 0.28 ? "cellular" : "wifi",
      effectiveType: pick(["4g", "5g"] as const),
      downlink: rand(12, 95) / 10,
      rtt: rand(35, 180),
      saveData: false,
    },

    geolocation: geo,

    mediaDevices: {
      cameraCount: 2,
      microphoneCount: 1,
      speakerCount: 1,
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
