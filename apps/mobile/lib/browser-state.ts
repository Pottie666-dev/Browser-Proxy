export type BrowserState = {
  cookies?: Record<string, string>;
  localStorage?: Record<string, string>;
  sessionStorage?: Record<string, string>;
  history?: Array<{ url: string; title?: string; at: string }>;
  updatedAt?: string | null;
};

export const EMPTY_BROWSER_STATE: BrowserState = {
  cookies: {},
  localStorage: {},
  sessionStorage: {},
  history: [],
  updatedAt: null,
};

function safeJson(value: unknown): string {
  return JSON.stringify(value ?? {}).replace(/</g, "\\u003c");
}

export function buildBrowserStateRestoreScript(state: BrowserState | null | undefined) {
  const cleanState: BrowserState = {
    cookies: state?.cookies ?? {},
    localStorage: state?.localStorage ?? {},
    sessionStorage: state?.sessionStorage ?? {},
    history: state?.history ?? [],
    updatedAt: state?.updatedAt ?? null,
  };

  return `
(function() {
  const restoredState = ${safeJson(cleanState)};

  try {
    Object.entries(restoredState.localStorage || {}).forEach(function(entry) {
      window.localStorage.setItem(entry[0], entry[1]);
    });
  } catch (e) {}

  try {
    Object.entries(restoredState.sessionStorage || {}).forEach(function(entry) {
      window.sessionStorage.setItem(entry[0], entry[1]);
    });
  } catch (e) {}

  try {
    Object.entries(restoredState.cookies || {}).forEach(function(entry) {
      document.cookie = entry[0] + "=" + entry[1] + "; path=/";
    });
  } catch (e) {}

  window.__BROWSER_PROXY_RESTORED_STATE__ = restoredState;

  true;
})();
`;
}

export function buildBrowserStateCaptureScript() {
  return `
(function() {
  if (window.__BROWSER_PROXY_STATE_CAPTURE_INSTALLED__) {
    true;
    return;
  }

  window.__BROWSER_PROXY_STATE_CAPTURE_INSTALLED__ = true;

  function readStorage(storage) {
    const out = {};
    try {
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i);
        if (key) out[key] = storage.getItem(key) || "";
      }
    } catch (e) {}
    return out;
  }

  function readCookies() {
    const out = {};
    try {
      String(document.cookie || "").split(";").forEach(function(part) {
        const trimmed = part.trim();
        if (!trimmed) return;
        const idx = trimmed.indexOf("=");
        if (idx <= 0) return;
        out[trimmed.slice(0, idx)] = trimmed.slice(idx + 1);
      });
    } catch (e) {}
    return out;
  }

  function capture(reason) {
    try {
      const payload = {
        type: "BROWSER_PROXY_STATE",
        reason: reason || "manual",
        state: {
          cookies: readCookies(),
          localStorage: readStorage(window.localStorage),
          sessionStorage: readStorage(window.sessionStorage),
          history: [{
            url: window.location.href,
            title: document.title || "",
            at: new Date().toISOString()
          }]
        }
      };

      if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
        window.ReactNativeWebView.postMessage(JSON.stringify(payload));
      }
    } catch (e) {}
  }

  ["click", "submit", "change", "input"].forEach(function(eventName) {
    document.addEventListener(eventName, function() {
      setTimeout(function() { capture(eventName); }, 350);
    }, true);
  });

  window.addEventListener("beforeunload", function() { capture("beforeunload"); });
  window.addEventListener("pagehide", function() { capture("pagehide"); });
  setTimeout(function() { capture("initial"); }, 1500);
  setInterval(function() { capture("interval"); }, 15000);

  true;
})();
`;
}


export function buildBrowserStateClearScript() {
  return `
(function() {
  try { window.localStorage.clear(); } catch (e) {}
  try { window.sessionStorage.clear(); } catch (e) {}
  try {
    String(document.cookie || "").split(";").forEach(function(part) {
      const name = part.split("=")[0] && part.split("=")[0].trim();
      if (name) {
        document.cookie = name + "=; Max-Age=0; path=/";
        document.cookie = name + "=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
      }
    });
  } catch (e) {}
  true;
})();
`;
}
