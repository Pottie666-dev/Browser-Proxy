export type FingerprintProfile = {
  profileId?: string;
  generatedAt?: string;

  accountId?: string;
  deviceName?: string;
  userAgent?: string;
  fakeIp?: string;

  timezone?: string;
  locale?: string;
  languages?: string[];

  platform?: string;
  vendor?: string;

  screenWidth?: number;
  screenHeight?: number;
  pixelRatio?: number;

  hardwareConcurrency?: number;
  deviceMemory?: number;

  webglVendor?: string;
  webglRenderer?: string;

  canvasSeed?: string;
  canvasNoise?: number;
  audioSeed?: string;
  audioNoise?: number;

  fonts?: string[];

  battery?: {
    charging?: boolean;
    level?: number;
    chargingTime?: number;
    dischargingTime?: number;
  };

  network?: {
    effectiveType?: "3g" | "4g" | "5g";
    downlink?: number;
    rtt?: number;
    saveData?: boolean;
  };
};

function safeJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

export function buildFingerprintScript(profile: FingerprintProfile = {}) {
  const merged = {
    profileId: profile.profileId ?? "local",
    generatedAt: profile.generatedAt ?? new Date(0).toISOString(),

    accountId: profile.accountId ?? "local",
    deviceName: profile.deviceName ?? "Samsung Galaxy S23",
    userAgent:
      profile.userAgent ??
      "Mozilla/5.0 (Linux; Android 13; Samsung Galaxy S23) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.230 Mobile Safari/537.36",
    fakeIp: profile.fakeIp ?? "",

    timezone: profile.timezone ?? "Africa/Johannesburg",
    locale: profile.locale ?? "en-ZA",
    languages: profile.languages ?? ["en-ZA", "en"],

    platform: profile.platform ?? "Linux armv8l",
    vendor: profile.vendor ?? "Google Inc.",

    screenWidth: profile.screenWidth ?? 360,
    screenHeight: profile.screenHeight ?? 780,
    pixelRatio: profile.pixelRatio ?? 3,

    hardwareConcurrency: profile.hardwareConcurrency ?? 8,
    deviceMemory: profile.deviceMemory ?? 8,

    webglVendor: profile.webglVendor ?? "Qualcomm",
    webglRenderer: profile.webglRenderer ?? "Adreno (TM) 730",

    canvasSeed: profile.canvasSeed ?? "local-canvas",
    canvasNoise: profile.canvasNoise ?? 0.0000007,
    audioSeed: profile.audioSeed ?? "local-audio",
    audioNoise: profile.audioNoise ?? 0.0000009,

    fonts: profile.fonts ?? ["Roboto", "Noto Sans", "Arial", "sans-serif"],

    battery: {
      charging: profile.battery?.charging ?? true,
      level: profile.battery?.level ?? 0.76,
      chargingTime: profile.battery?.chargingTime ?? 0,
      dischargingTime: profile.battery?.dischargingTime ?? 14400,
    },

    network: {
      effectiveType: profile.network?.effectiveType ?? "4g",
      downlink: profile.network?.downlink ?? 7.5,
      rtt: profile.network?.rtt ?? 80,
      saveData: profile.network?.saveData ?? false,
    },
  };

  return `
(function() {
  const profile = ${safeJson(merged)};

  function defineGetter(target, key, value) {
    try {
      Object.defineProperty(target, key, {
        get: function() { return value; },
        configurable: true
      });
    } catch (e) {}
  }

  defineGetter(Navigator.prototype, "userAgent", profile.userAgent);
  defineGetter(Navigator.prototype, "platform", profile.platform);
  defineGetter(Navigator.prototype, "vendor", profile.vendor);
  defineGetter(Navigator.prototype, "language", profile.locale);
  defineGetter(Navigator.prototype, "languages", profile.languages);
  defineGetter(Navigator.prototype, "hardwareConcurrency", profile.hardwareConcurrency);
  defineGetter(Navigator.prototype, "deviceMemory", profile.deviceMemory);
  defineGetter(Navigator.prototype, "maxTouchPoints", 5);

  try {
    defineGetter(Screen.prototype, "width", profile.screenWidth);
    defineGetter(Screen.prototype, "height", profile.screenHeight);
    defineGetter(Screen.prototype, "availWidth", profile.screenWidth);
    defineGetter(Screen.prototype, "availHeight", profile.screenHeight - 24);
    defineGetter(window, "devicePixelRatio", profile.pixelRatio);
  } catch (e) {}

  try {
    const realResolvedOptions = Intl.DateTimeFormat.prototype.resolvedOptions;
    Intl.DateTimeFormat.prototype.resolvedOptions = function() {
      const options = realResolvedOptions.call(this);
      options.timeZone = profile.timezone;
      options.locale = profile.locale;
      return options;
    };
  } catch (e) {}

  try {
    const getParameter = WebGLRenderingContext.prototype.getParameter;
    WebGLRenderingContext.prototype.getParameter = function(parameter) {
      if (parameter === 37445) return profile.webglVendor;
      if (parameter === 37446) return profile.webglRenderer;
      return getParameter.call(this, parameter);
    };
  } catch (e) {}

  try {
    const getSupportedExtensions = WebGLRenderingContext.prototype.getSupportedExtensions;
    WebGLRenderingContext.prototype.getSupportedExtensions = function() {
      const extensions = getSupportedExtensions.call(this) || [];
      return extensions.filter(function(ext) { return ext !== "WEBGL_debug_renderer_info"; });
    };
  } catch (e) {}

  try {
    const toDataURL = HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.toDataURL = function() {
      const ctx = this.getContext("2d");
      if (ctx) {
        const w = this.width || 1;
        const h = this.height || 1;
        const x = Math.max(0, Math.min(w - 1, 1));
        const y = Math.max(0, Math.min(h - 1, 1));
        ctx.fillStyle = "rgba(0,0,0," + profile.canvasNoise + ")";
        ctx.fillRect(x, y, 1, 1);
      }
      return toDataURL.apply(this, arguments);
    };
  } catch (e) {}

  try {
    const getChannelData = AudioBuffer.prototype.getChannelData;
    AudioBuffer.prototype.getChannelData = function() {
      const data = getChannelData.apply(this, arguments);
      if (data && data.length > 100) {
        data[100] = data[100] + profile.audioNoise;
      }
      return data;
    };
  } catch (e) {}

  try {
    navigator.getBattery = function() {
      return Promise.resolve({
        charging: profile.battery.charging,
        chargingTime: profile.battery.chargingTime,
        dischargingTime: profile.battery.dischargingTime,
        level: profile.battery.level,
        addEventListener: function(){},
        removeEventListener: function(){},
        dispatchEvent: function(){ return false; }
      });
    };
  } catch (e) {}

  try {
    const connection = {
      effectiveType: profile.network.effectiveType,
      downlink: profile.network.downlink,
      rtt: profile.network.rtt,
      saveData: profile.network.saveData,
      addEventListener: function(){},
      removeEventListener: function(){},
      dispatchEvent: function(){ return false; }
    };
    defineGetter(Navigator.prototype, "connection", connection);
  } catch (e) {}

  try {
    document.fonts && profile.fonts.forEach(function(font) {
      window.__BROWSER_PROXY_FONTS__ = profile.fonts;
    });
  } catch (e) {}

  window.__BROWSER_PROXY_PROFILE__ = profile;

  true;
})();
`;
}

export function buildFormInterceptScript() {
  return `
(function() {
  function describeInput(input) {
    return {
      name: input.name || "",
      id: input.id || "",
      type: input.type || "",
      placeholder: input.placeholder || "",
      autocomplete: input.autocomplete || ""
    };
  }

  window.__BROWSER_PROXY_FORMS__ = function() {
    return Array.from(document.querySelectorAll("input, textarea, select")).map(describeInput);
  };

  true;
})();
`;
}
