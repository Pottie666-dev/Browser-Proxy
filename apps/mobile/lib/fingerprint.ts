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

  geolocation?: {
    latitude?: number;
    longitude?: number;
    accuracy?: number;
  };
};

function safeJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function defaultGeo(timezone: string | undefined) {
  switch (timezone) {
    case "Africa/Johannesburg":
      return { latitude: -26.2041, longitude: 28.0473, accuracy: 220 };
    case "Europe/London":
      return { latitude: 51.5072, longitude: -0.1276, accuracy: 180 };
    case "Europe/Dublin":
      return { latitude: 53.3498, longitude: -6.2603, accuracy: 180 };
    case "Asia/Dubai":
      return { latitude: 25.2048, longitude: 55.2708, accuracy: 220 };
    case "Australia/Sydney":
      return { latitude: -33.8688, longitude: 151.2093, accuracy: 240 };
    case "America/New_York":
      return { latitude: 40.7128, longitude: -74.006, accuracy: 210 };
    default:
      return { latitude: -26.2041, longitude: 28.0473, accuracy: 250 };
  }
}

export function buildFingerprintScript(profile: FingerprintProfile = {}) {
  const geo = {
    ...defaultGeo(profile.timezone),
    ...(profile.geolocation ?? {}),
  };

  const merged = {
    profileId: profile.profileId ?? "local",
    generatedAt: profile.generatedAt ?? new Date(0).toISOString(),

    accountId: profile.accountId ?? "local",
    storageNamespace: `bp:${profile.accountId ?? "local"}:`,
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

    geolocation: geo,
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

  function defineValue(target, key, value) {
    try {
      Object.defineProperty(target, key, {
        value,
        writable: false,
        configurable: true
      });
    } catch (e) {}
  }

  function namespaceKey(key) {
    return profile.storageNamespace + String(key);
  }

  function unnamespaceKey(key) {
    key = String(key);
    return key.indexOf(profile.storageNamespace) === 0 ? key.slice(profile.storageNamespace.length) : null;
  }

  // Core navigator/device identity
  defineGetter(Navigator.prototype, "userAgent", profile.userAgent);
  defineGetter(Navigator.prototype, "platform", profile.platform);
  defineGetter(Navigator.prototype, "vendor", profile.vendor);
  defineGetter(Navigator.prototype, "language", profile.locale);
  defineGetter(Navigator.prototype, "languages", profile.languages);
  defineGetter(Navigator.prototype, "hardwareConcurrency", profile.hardwareConcurrency);
  defineGetter(Navigator.prototype, "deviceMemory", profile.deviceMemory);
  defineGetter(Navigator.prototype, "maxTouchPoints", 5);
  defineGetter(Navigator.prototype, "doNotTrack", null);

  // Screen profile
  try {
    defineGetter(Screen.prototype, "width", profile.screenWidth);
    defineGetter(Screen.prototype, "height", profile.screenHeight);
    defineGetter(Screen.prototype, "availWidth", profile.screenWidth);
    defineGetter(Screen.prototype, "availHeight", profile.screenHeight - 24);
    defineGetter(window, "innerWidth", profile.screenWidth);
    defineGetter(window, "innerHeight", profile.screenHeight);
    defineGetter(window, "devicePixelRatio", profile.pixelRatio);
  } catch (e) {}

  // Timezone/locale
  try {
    const realResolvedOptions = Intl.DateTimeFormat.prototype.resolvedOptions;
    Intl.DateTimeFormat.prototype.resolvedOptions = function() {
      const options = realResolvedOptions.call(this);
      options.timeZone = profile.timezone;
      options.locale = profile.locale;
      return options;
    };
  } catch (e) {}

  // Account-scoped localStorage/sessionStorage namespace.
  // This prevents two identities on the same website from seeing each other's normal JS storage.
  try {
    function patchStorage(storage) {
      const getItem = storage.getItem.bind(storage);
      const setItem = storage.setItem.bind(storage);
      const removeItem = storage.removeItem.bind(storage);
      const clear = storage.clear.bind(storage);
      const key = storage.key.bind(storage);

      storage.getItem = function(k) { return getItem(namespaceKey(k)); };
      storage.setItem = function(k, v) { return setItem(namespaceKey(k), String(v)); };
      storage.removeItem = function(k) { return removeItem(namespaceKey(k)); };
      storage.clear = function() {
        const keys = [];
        for (let i = 0; i < storage.length; i++) {
          const raw = key(i);
          if (raw && raw.indexOf(profile.storageNamespace) === 0) keys.push(raw);
        }
        keys.forEach(removeItem);
      };
      storage.key = function(i) {
        const visible = [];
        for (let n = 0; n < storage.length; n++) {
          const raw = key(n);
          const clean = raw ? unnamespaceKey(raw) : null;
          if (clean !== null) visible.push(clean);
        }
        return visible[i] || null;
      };
      try {
        Object.defineProperty(storage, "length", {
          get: function() {
            let count = 0;
            for (let n = 0; n < storage.length; n++) {
              const raw = key(n);
              if (raw && raw.indexOf(profile.storageNamespace) === 0) count++;
            }
            return count;
          },
          configurable: true
        });
      } catch (e) {}
    }

    patchStorage(window.localStorage);
    patchStorage(window.sessionStorage);
  } catch (e) {}

  // JS-visible cookie namespace. Native HTTP-only cookie jars will be handled in a later native phase.
  try {
    const cookieStoreKey = profile.storageNamespace + "__cookies__";

    function parseCookieJar() {
      try { return JSON.parse(window.localStorage.getItem(cookieStoreKey) || "{}"); }
      catch (e) { return {}; }
    }

    function saveCookieJar(jar) {
      window.localStorage.setItem(cookieStoreKey, JSON.stringify(jar));
    }

    Object.defineProperty(document, "cookie", {
      get: function() {
        const jar = parseCookieJar();
        return Object.keys(jar).map(function(k) { return k + "=" + jar[k]; }).join("; ");
      },
      set: function(value) {
        const jar = parseCookieJar();
        const first = String(value).split(";")[0] || "";
        const eq = first.indexOf("=");
        if (eq > 0) {
          const name = first.slice(0, eq).trim();
          const val = first.slice(eq + 1).trim();
          if (/max-age=0|expires=thu, 01 jan 1970/i.test(String(value))) {
            delete jar[name];
          } else {
            jar[name] = val;
          }
          saveCookieJar(jar);
        }
        return value;
      },
      configurable: true
    });
  } catch (e) {}

  // WebGL
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

  // Canvas
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

  // Audio
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

  // Battery
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

  // Network
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

  // Permissions
  try {
    const permissionStates = {
      geolocation: "granted",
      notifications: "default",
      camera: "prompt",
      microphone: "prompt",
      midi: "denied",
      clipboard: "granted"
    };

    navigator.permissions = navigator.permissions || {};
    navigator.permissions.query = function(desc) {
      const name = desc && desc.name ? String(desc.name) : "";
      const state = permissionStates[name] || "prompt";
      return Promise.resolve({
        state: state,
        name: name,
        onchange: null,
        addEventListener: function(){},
        removeEventListener: function(){},
        dispatchEvent: function(){ return false; }
      });
    };
  } catch (e) {}

  // Geolocation matching timezone
  try {
    const position = {
      coords: {
        latitude: profile.geolocation.latitude,
        longitude: profile.geolocation.longitude,
        accuracy: profile.geolocation.accuracy,
        altitude: null,
        altitudeAccuracy: null,
        heading: null,
        speed: null
      },
      timestamp: Date.now()
    };

    navigator.geolocation = navigator.geolocation || {};
    navigator.geolocation.getCurrentPosition = function(success) {
      if (typeof success === "function") setTimeout(function() { success(position); }, 80);
    };
    navigator.geolocation.watchPosition = function(success) {
      if (typeof success === "function") setTimeout(function() { success(position); }, 80);
      return 1;
    };
    navigator.geolocation.clearWatch = function(){};
  } catch (e) {}

  // WebRTC leak protection
  try {
    const BlockedPeerConnection = function() {
      throw new Error("RTCPeerConnection disabled by Browser-Proxy identity isolation");
    };
    defineValue(window, "RTCPeerConnection", BlockedPeerConnection);
    defineValue(window, "webkitRTCPeerConnection", BlockedPeerConnection);
    defineValue(window, "mozRTCPeerConnection", BlockedPeerConnection);
  } catch (e) {}

  // Media devices
  try {
    const devices = [
      { deviceId: "bp-front-camera-" + profile.profileId, groupId: "bp-camera", kind: "videoinput", label: "" },
      { deviceId: "bp-mic-" + profile.profileId, groupId: "bp-mic", kind: "audioinput", label: "" },
      { deviceId: "bp-speaker-" + profile.profileId, groupId: "bp-speaker", kind: "audiooutput", label: "" }
    ];

    navigator.mediaDevices = navigator.mediaDevices || {};
    navigator.mediaDevices.enumerateDevices = function() {
      return Promise.resolve(devices);
    };
    navigator.mediaDevices.getUserMedia = function() {
      return Promise.reject(new DOMException("Permission denied", "NotAllowedError"));
    };
  } catch (e) {}

  // Notifications
  try {
    defineGetter(Notification, "permission", "default");
    Notification.requestPermission = function() { return Promise.resolve("default"); };
  } catch (e) {}

  // Clipboard
  try {
    navigator.clipboard = navigator.clipboard || {};
    navigator.clipboard.readText = function() { return Promise.resolve(""); };
    navigator.clipboard.writeText = function() { return Promise.resolve(); };
  } catch (e) {}

  // Voices
  try {
    speechSynthesis.getVoices = function() {
      return [
        { voiceURI: "Google UK English Female", name: "Google UK English Female", lang: "en-GB", localService: false, default: profile.locale === "en-GB" },
        { voiceURI: "Google US English", name: "Google US English", lang: "en-US", localService: false, default: profile.locale === "en-US" },
        { voiceURI: "Google English South Africa", name: "Google English South Africa", lang: "en-ZA", localService: false, default: profile.locale === "en-ZA" }
      ];
    };
  } catch (e) {}

  // Plugins/mimeTypes
  try {
    const plugins = [
      { name: "Chrome PDF Plugin", filename: "internal-pdf-viewer", description: "Portable Document Format" },
      { name: "Chrome PDF Viewer", filename: "mhjfbmdgcfjbbpaeojofohoefgiehjai", description: "" }
    ];
    defineGetter(Navigator.prototype, "plugins", plugins);
    defineGetter(Navigator.prototype, "mimeTypes", [{ type: "application/pdf", suffixes: "pdf", description: "Portable Document Format" }]);
  } catch (e) {}

  // Hide hardware APIs that would expose host device details.
  try {
    defineValue(navigator, "bluetooth", undefined);
    defineValue(navigator, "usb", undefined);
    defineValue(navigator, "serial", undefined);
    defineValue(navigator, "hid", undefined);
    defineValue(navigator, "nfc", undefined);
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
