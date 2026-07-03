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
};

const devices: DeviceTemplate[] = [
  { deviceName: "Samsung Galaxy S23", androidVersion: "13", chromeVersion: "120.0.6099.230", screenWidth: 360, screenHeight: 780, pixelRatio: 3, platform: "Linux armv8l", vendor: "Google Inc.", hardwareConcurrency: 8, deviceMemory: 8 },
  { deviceName: "Samsung Galaxy A54", androidVersion: "13", chromeVersion: "119.0.6045.194", screenWidth: 384, screenHeight: 854, pixelRatio: 2.75, platform: "Linux armv8l", vendor: "Google Inc.", hardwareConcurrency: 8, deviceMemory: 6 },
  { deviceName: "Google Pixel 7", androidVersion: "13", chromeVersion: "120.0.6099.230", screenWidth: 412, screenHeight: 915, pixelRatio: 2.625, platform: "Linux armv8l", vendor: "Google Inc.", hardwareConcurrency: 8, deviceMemory: 8 },
  { deviceName: "Google Pixel 6a", androidVersion: "12", chromeVersion: "118.0.5993.111", screenWidth: 412, screenHeight: 915, pixelRatio: 2.625, platform: "Linux armv8l", vendor: "Google Inc.", hardwareConcurrency: 8, deviceMemory: 6 },
  { deviceName: "OnePlus 11", androidVersion: "13", chromeVersion: "120.0.6099.230", screenWidth: 412, screenHeight: 919, pixelRatio: 3.5, platform: "Linux armv8l", vendor: "Google Inc.", hardwareConcurrency: 8, deviceMemory: 8 },
  { deviceName: "Oppo Find X5", androidVersion: "12", chromeVersion: "117.0.5938.140", screenWidth: 393, screenHeight: 873, pixelRatio: 2.75, platform: "Linux armv8l", vendor: "Google Inc.", hardwareConcurrency: 8, deviceMemory: 8 },
  { deviceName: "Xiaomi Redmi Note 12", androidVersion: "13", chromeVersion: "119.0.6045.194", screenWidth: 393, screenHeight: 873, pixelRatio: 2.75, platform: "Linux armv8l", vendor: "Google Inc.", hardwareConcurrency: 8, deviceMemory: 6 },
];

const timezones = ["Africa/Johannesburg", "Europe/London", "Europe/Dublin", "Australia/Sydney", "Asia/Dubai"];
const locales = ["en-ZA", "en-GB", "en-US"];

function pick<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)]!;
}

function rand(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
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

export type GeneratedIdentity = {
  deviceName: string;
  fakeIp: string;
  userAgent: string;
  fingerprint: {
    timezone: string;
    locale: string;
    languages: string[];
    platform: string;
    vendor: string;
    screenWidth: number;
    screenHeight: number;
    pixelRatio: number;
    hardwareConcurrency: number;
    deviceMemory: number;
    androidVersion: string;
    chromeVersion: string;
    webglVendor: string;
    webglRenderer: string;
    canvasNoise: number;
    audioNoise: number;
  };
};

export function generateIdentity(): GeneratedIdentity {
  const device = pick(devices);
  const locale = pick(locales);
  const timezone = pick(timezones);

  return {
    deviceName: device.deviceName,
    fakeIp: fakePublicIp(),
    userAgent: `Mozilla/5.0 (Linux; Android ${device.androidVersion}; ${device.deviceName}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${device.chromeVersion} Mobile Safari/537.36`,
    fingerprint: {
      timezone,
      locale,
      languages: [locale, "en"],
      platform: device.platform,
      vendor: device.vendor,
      screenWidth: device.screenWidth,
      screenHeight: device.screenHeight,
      pixelRatio: device.pixelRatio,
      hardwareConcurrency: device.hardwareConcurrency,
      deviceMemory: device.deviceMemory,
      androidVersion: device.androidVersion,
      chromeVersion: device.chromeVersion,
      webglVendor: "Qualcomm",
      webglRenderer: `Adreno (TM) ${rand(610, 740)}`,
      canvasNoise: rand(1000, 9999) / 10000000,
      audioNoise: rand(1000, 9999) / 10000000,
    },
  };
}
