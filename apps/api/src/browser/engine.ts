import {
  chromium,
  type BrowserContext,
  type Page,
  type FileChooser,
} from "playwright-core";
import {
  mkdir,
  readFile,
  writeFile,
  rename,
  open,
  rm,
  realpath,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import {
  createGateway,
  type GatewayOptions,
  type EgressProxy,
  proxyFromUrl,
  validateProxy,
} from "./egress";
import { proxyDnsResolver, operatorDnsPolicy } from "./dns";
import { validateTarget } from "../lib/outbound";
import { HttpError, encrypt, decrypt } from "../lib/security";

export type ProfileConfig = {
  ownerId: string;
  accountId: string;
  userAgent: string;
  locale: string;
  timezone: string;
  proxy?: EgressProxy;
  accountRevision?: string;
  proxyId?: string;
  proxyRevision?: string;
  legacyHistory?: { url: string; title?: string; at: string }[];
};
export type BrowserCommand = {
  action: string;
  tabId?: string;
  url?: string;
  text?: string;
  x?: number;
  y?: number;
  deltaY?: number;
  name?: string;
  mimeType?: string;
  base64?: string;
};
type SavedTab = {
  id: string;
  url: string;
  session?: Record<string, string>;
  sessions?: Record<string, Record<string, string>>;
};
type DownloadRecord = {
  id: string;
  name: string;
  size: number;
  createdAt: string;
};
type Manifest = {
  tabs: SavedTab[];
  activeTabId: string;
  bookmarks: { url: string; title: string }[];
  history: { url: string; title: string; visitedAt: string }[];
  downloads: DownloadRecord[];
};
type Live = {
  config: ProfileConfig;
  context: BrowserContext;
  gateway: Awaited<ReturnType<typeof createGateway>>;
  dir: string;
  pages: Map<string, Page>;
  manifest: Manifest;
  sessions: Map<string, Record<string, Record<string, string>>>;
  watchers: Map<string, Promise<void>>;
  chooser?: FileChooser;
  touched: number;
  closing?: Promise<void>;
};
const blank = (): Manifest => ({
  tabs: [],
  activeTabId: "",
  bookmarks: [],
  history: [],
  downloads: [],
});
const safeName = (value: string) =>
  path
    .basename(value)
    .replace(/[^a-zA-Z0-9._ -]/g, "_")
    .slice(0, 150) || "download";
function safeProfileRoot(root: string) {
  return ![
    "/usr",
    "/bin",
    "/lib",
    "/lib64",
    "/etc",
    "/proc",
    "/sys",
    "/dev",
  ].some((directory) => root === directory || root.startsWith(`${directory}/`));
}
export class BrowserEngine {
  private live = new Map<string, Live>();
  private starting = new Set<string>();
  private queues = new Map<string, Promise<unknown>>();
  constructor(
    private root: string,
    private options: {
      executablePath?: string;
      maxActive?: number;
      gateway?: (config: ProfileConfig) => GatewayOptions;
      sandbox?: boolean;
      testCertificateSPKI?: string;
      networkNamespace?: boolean;
      validate?: (config: ProfileConfig) => Promise<void>;
    } = {},
  ) {
    if (
      (options.sandbox === false ||
        options.testCertificateSPKI ||
        options.networkNamespace === false ||
        options.gateway) &&
      process.env.NODE_ENV !== "test"
    )
      throw new Error(
        "Browser security overrides are restricted to controlled tests",
      );
    this.root = path.resolve(root);
    if (
      !path.isAbsolute(root) ||
      this.root === "/" ||
      !safeProfileRoot(this.root)
    )
      throw new Error("A dedicated absolute profile directory is required");
    if (
      options.maxActive !== undefined &&
      (!Number.isInteger(options.maxActive) ||
        options.maxActive < 1 ||
        options.maxActive > 32)
    )
      throw new Error("Invalid browser capacity");
  }
  private key(owner: string, account: string) {
    if (!/^[a-f0-9]{24}$/i.test(owner) || !/^[a-f0-9]{24}$/i.test(account))
      throw new HttpError(404, "Not found");
    return `${owner.toLowerCase()}/${account.toLowerCase()}`;
  }
  private async exclusive<T>(
    key: string,
    action: () => Promise<T>,
  ): Promise<T> {
    const prior = this.queues.get(key) ?? Promise.resolve();
    const job = prior.catch(() => {}).then(action);
    this.queues.set(key, job);
    try {
      return await job;
    } finally {
      if (this.queues.get(key) === job) this.queues.delete(key);
    }
  }
  private context(key: string) {
    return `browser-manifest:${key}`;
  }
  private async persist(key: string, live: Live) {
    live.manifest.tabs = await Promise.all(
      [...live.pages]
        .filter(([, page]) => !page.isClosed())
        .map(async ([id, page]) => {
          const session = await Promise.race([
            page
              .evaluate(() =>
                Object.fromEntries(
                  Object.keys(sessionStorage).map((k) => [
                    k,
                    sessionStorage.getItem(k)!,
                  ]),
                ),
              )
              .catch(() => ({})),
            new Promise<Record<string, string>>((resolve) => {
              const timer = setTimeout(() => resolve({}), 2000);
              timer.unref();
            }),
          ]);
          const sessions = live.sessions.get(id) ?? {};
          if (/^https?:/.test(page.url())) {
            const origin = new URL(page.url()).origin;
            if (
              Object.keys(session).length ||
              !Object.keys(sessions[origin] ?? {}).length
            )
              sessions[origin] = session;
          }
          live.sessions.set(id, sessions);
          return { id, url: page.url(), session, sessions };
        }),
    );
    const data = encrypt(live.manifest, this.context(key));
    await writeFile(path.join(live.dir, "manifest.tmp"), data, { mode: 0o600 });
    await rename(
      path.join(live.dir, "manifest.tmp"),
      path.join(live.dir, "manifest.enc"),
    );
  }
  private attach(live: Live, page: Page, id: string = randomUUID()) {
    if (live.pages.size >= 20) {
      void page.close().catch(() => {});
      return "";
    }
    live.pages.set(id, page);
    const ready = this.watchSessionStorage(live, page, id);
    ready.catch(() => {});
    live.watchers.set(id, ready);
    page.on("popup", (popup) => {
      const existing = [...live.pages].find(([, p]) => p === popup)?.[0];
      const popupId = existing ?? this.attach(live, popup);
      if (popupId) live.manifest.activeTabId = popupId;
    });
    page.on("filechooser", (chooser) => {
      live.chooser = chooser;
    });
    page.on("dialog", (dialog) => {
      void dialog.dismiss();
    });
    page.on("download", async (download) => {
      try {
        const file = await download.path();
        if (!file) return;
        const bytes = await readFile(file);
        if (bytes.length > 50 * 1024 * 1024) {
          await download.delete();
          return;
        }
        const item = {
          id: randomUUID(),
          name: safeName(download.suggestedFilename()),
          size: bytes.length,
          createdAt: new Date().toISOString(),
        };
        await mkdir(path.join(live.dir, "downloads"), {
          mode: 0o700,
          recursive: true,
        });
        await writeFile(
          path.join(live.dir, "downloads", item.id),
          encrypt(
            bytes.toString("base64"),
            `browser-download:${this.key(live.config.ownerId, live.config.accountId)}:${item.id}`,
          ),
          { mode: 0o600 },
        );
        live.manifest.downloads.unshift(item);
        await download.delete();
        const key = this.key(live.config.ownerId, live.config.accountId);
        await this.exclusive(key, () => this.persist(key, live));
      } catch {
        /* A failed download is not advertised as complete. */
      }
    });
    page.on("framenavigated", (frame) => {
      if (frame === page.mainFrame() && /^https?:/.test(page.url())) {
        live.manifest.history.unshift({
          url: page.url(),
          title: "",
          visitedAt: new Date().toISOString(),
        });
        live.manifest.history = live.manifest.history.slice(0, 250);
      }
    });
    page.on("close", () => {
      live.pages.delete(id);
      live.sessions.delete(id);
      live.watchers.delete(id);
      if (live.manifest.activeTabId === id)
        live.manifest.activeTabId = [...live.pages.keys()][0] ?? "";
    });
    return id;
  }
  private async watchSessionStorage(live: Live, page: Page, id: string) {
    const session = await live.context.newCDPSession(page);
    await session.send("Emulation.setDeviceMetricsOverride", {
      width: 390,
      height: 740,
      deviceScaleFactor: 1,
      mobile: true,
    });
    const values = live.sessions.get(id) ?? {};
    live.sessions.set(id, values);
    const originFor = (storage: any) => {
      if (storage.isLocalStorage || storage.storageKey?.includes("^"))
        return null;
      try {
        return new URL(storage.securityOrigin || storage.storageKey).origin;
      } catch {
        return null;
      }
    };
    for (const event of [
      "domStorageItemAdded",
      "domStorageItemUpdated",
      "domStorageItemRemoved",
      "domStorageItemsCleared",
    ] as const) {
      session.on(`DOMStorage.${event}`, (data: any) => {
        const origin = originFor(data.storageId);
        if (!origin) return;
        const store = (values[origin] ??= Object.create(null));
        if (event === "domStorageItemsCleared")
          values[origin] = Object.create(null);
        else if (event === "domStorageItemRemoved") delete store[data.key];
        else
          Object.defineProperty(store, data.key, {
            value: data.newValue,
            enumerable: true,
            writable: true,
            configurable: true,
          });
      });
    }
    await session.send("Page.enable");
    await session.send("DOMStorage.enable");
  }

  private async start(config: ProfileConfig) {
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    this.root = await realpath(this.root);
    if (!safeProfileRoot(this.root))
      throw new HttpError(
        503,
        "Profile storage must be outside mounted OS assets",
      );
    const key = this.key(config.ownerId, config.accountId);
    await this.options.validate?.(config);
    let live = this.live.get(key);
    if (live) {
      if (
        JSON.stringify({ ...live.config, legacyHistory: undefined }) ===
        JSON.stringify({ ...config, legacyHistory: undefined })
      )
        return live;
      await this.closeInner(key, live); // Configuration change never reuses an old egress route.
    }
    if (this.live.size + this.starting.size >= (this.options.maxActive ?? 3))
      throw new HttpError(
        503,
        "Browser capacity reached; close another account session",
      );
    const dir = path.join(this.root, key);
    await mkdir(dir, { recursive: true, mode: 0o700 });
    let lock;
    try {
      lock = await open(path.join(dir, "engine.lock"), "wx", 0o600);
    } catch {
      throw new HttpError(
        503,
        "Profile is already in use; operator lock recovery may be required",
      );
    }
    await lock.writeFile(String(process.pid));
    await lock.close();
    this.starting.add(key);
    let launched: BrowserContext | undefined;
    let gateway: Awaited<ReturnType<typeof createGateway>> | undefined;
    try {
      let manifest = blank();
      manifest.history = (config.legacyHistory ?? [])
        .filter((h) => /^https?:/.test(h.url))
        .slice(0, 250)
        .map((h) => ({ url: h.url, title: h.title ?? "", visitedAt: h.at }));
      try {
        manifest = decrypt(
          await readFile(path.join(dir, "manifest.enc"), "utf8"),
          this.context(key),
        ) as Manifest;
      } catch (error: any) {
        if (error.code !== "ENOENT") {
          throw error;
        }
      }
      const proxy =
        !this.options.gateway && config.proxy
          ? await validateProxy(
              config.proxy,
              (process.env.BROWSER_TRUSTED_PROXY_AUTHORITIES ?? "").split(","),
            )
          : config.proxy;
      const namespace = this.options.networkNamespace !== false;
      gateway = await createGateway({
        ...(this.options.gateway?.(config) ?? {
          proxy,
          resolve: proxy
            ? proxyDnsResolver(proxy, operatorDnsPolicy())
            : undefined,
        }),
        ...(namespace ? { listenSocket: path.join(dir, "egress.sock") } : {}),
      });
      const context = (launched = await chromium.launchPersistentContext(
        path.join(dir, "chromium"),
        {
          executablePath: namespace
            ? path.resolve(
                process.env.BROWSER_NAMESPACE_WRAPPER ??
                  path.resolve(
                    path.dirname(fileURLToPath(import.meta.url)),
                    path.basename(
                      path.dirname(fileURLToPath(import.meta.url)),
                    ) === "dist"
                      ? "../tools"
                      : "../../tools",
                    "chromium-namespace-wrapper.mjs",
                  ),
              )
            : (this.options.executablePath ??
              process.env.CHROMIUM_EXECUTABLE_PATH ??
              "/usr/bin/chromium"),
          env: {
            PATH: process.env.PATH ?? "/usr/bin:/bin",
            LANG: process.env.LANG ?? "C.UTF-8",
            PROFILE_STORAGE_ROOT: this.root,
            PROFILE_NAMESPACE_ROOT: dir,
            PROFILE_GATEWAY_SOCKET: path.join(dir, "egress.sock"),
            PROFILE_CHROMIUM_EXECUTABLE:
              this.options.executablePath ??
              process.env.CHROMIUM_EXECUTABLE_PATH ??
              "/usr/bin/chromium",
            XDG_CONFIG_HOME: path.join(dir, "config"),
            XDG_CACHE_HOME: path.join(dir, "cache"),
          },
          headless: true,
          chromiumSandbox: this.options.sandbox !== false,
          proxy: { server: gateway.url, bypass: "<-loopback>" },
          userAgent: config.userAgent,
          locale: config.locale,
          timezoneId: config.timezone,
          viewport: { width: 390, height: 740 },
          isMobile: false, // Persistent mobile contexts otherwise recreate (and lose) the first restored tab.
          hasTouch: true,
          deviceScaleFactor: 1,
          ignoreDefaultArgs: [
            ...(manifest.tabs.length ? ["about:blank"] : []),
            "--disable-popup-blocking",
            "--enable-unsafe-swiftshader",
            "--unsafely-disable-devtools-self-xss-warnings",
          ],
          downloadsPath: path.join(dir, "incoming"),
          acceptDownloads: true,
          serviceWorkers: "allow",
          permissions: [],
          args: [
            ...(this.options.testCertificateSPKI
              ? [
                  `--ignore-certificate-errors-spki-list=${this.options.testCertificateSPKI}`,
                ]
              : []),
            "--restore-last-session",
            "--disable-quic",
            "--force-webrtc-ip-handling-policy=disable_non_proxied_udp",
            "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1",
            "--disable-background-networking",
            "--disable-extensions",
            "--disable-component-update",
          ],
        },
      ));
      const control = await context.browser()!.newBrowserCDPSession();
      await control.send("Browser.setDownloadBehavior", {
        behavior: "allowAndName",
        downloadPath: path.join(dir, "incoming"),
        eventsEnabled: true,
      });
      control.on("Browser.downloadProgress", (event) => {
        if (
          event.receivedBytes > 50 * 1024 * 1024 ||
          event.totalBytes > 50 * 1024 * 1024
        )
          void control
            .send("Browser.cancelDownload", { guid: event.guid })
            .catch(() => {});
      });
      live = {
        config,
        context,
        gateway,
        dir,
        pages: new Map(),
        sessions: new Map(
          manifest.tabs.map((tab) => [
            tab.id,
            tab.sessions ??
              (tab.session && /^https?:/.test(tab.url)
                ? { [new URL(tab.url).origin]: tab.session }
                : {}),
          ]),
        ),
        watchers: new Map(),
        manifest,
        touched: Date.now(),
      };
      const own = live;
      const initial = context.pages();
      await Promise.all(
        initial.map((page) =>
          page
            .waitForLoadState("domcontentloaded", { timeout: 5000 })
            .catch(() => {}),
        ),
      );
      for (const tab of manifest.tabs) {
        // Reuse Chromium’s native session-restored tab whenever available, preserving its history and per-origin sessionStorage.
        const restored = initial.find(
          (page) =>
            page.url() === tab.url && ![...live!.pages.values()].includes(page),
        );
        const page = restored ?? (await context.newPage());
        this.attach(live, page, tab.id);
        await live.watchers.get(tab.id);
        if (restored) continue;
        if (tab.url !== "about:blank") {
          validateTarget(tab.url);
          await page
            .goto(tab.url, { waitUntil: "domcontentloaded", timeout: 15000 })
            .catch(() => {});
        }
      }
      for (const page of initial)
        if (![...live.pages.values()].includes(page)) await page.close();
      context.on("page", (page) => {
        if (![...own.pages.values()].includes(page)) this.attach(own, page);
      });
      if (!live.pages.size) {
        const page = await context.newPage();
        live.manifest.activeTabId = [...live.pages].find(
          ([, p]) => p === page,
        )![0];
      }
      if (!live.pages.has(manifest.activeTabId))
        live.manifest.activeTabId = [...live.pages.keys()][0]!;
      this.live.set(key, live);
      return live;
    } catch (error) {
      await launched?.close().catch(() => {});
      await gateway?.close();
      await rm(path.join(dir, "engine.lock"), { force: true });
      if (process.env.NODE_ENV === "test") throw error;
      throw error instanceof HttpError
        ? error
        : new HttpError(
            503,
            "Isolated browser unavailable; verify namespace, sandbox and storage configuration",
          );
    } finally {
      this.starting.delete(key);
    }
  }
  async run(config: ProfileConfig, command?: BrowserCommand) {
    const key = this.key(config.ownerId, config.accountId);
    return this.exclusive(key, async () => {
      const live = await this.start(config);
      live.touched = Date.now();
      let page = live.pages.get(command?.tabId ?? live.manifest.activeTabId);
      if (command?.tabId && !page) throw new HttpError(404, "Tab not found");
      if (!page) {
        page = await live.context.newPage();
        live.manifest.activeTabId = [...live.pages].find(
          ([, p]) => p === page,
        )![0];
      }
      await live.watchers.get([...live.pages].find(([, p]) => p === page)![0]);
      if (command) {
        switch (command.action) {
          case "navigate":
            validateTarget(command.url!);
            await page.goto(command.url!, {
              waitUntil: "domcontentloaded",
              timeout: 20000,
            });
            break;
          case "new-tab": {
            if (live.pages.size >= 20)
              throw new HttpError(
                409,
                "This profile has reached its 20-tab limit",
              );
            page = await live.context.newPage();
            live.manifest.activeTabId = [...live.pages].find(
              ([, p]) => p === page,
            )![0];
            await live.watchers.get(live.manifest.activeTabId);
            if (command.url) {
              validateTarget(command.url);
              await page.goto(command.url, {
                waitUntil: "domcontentloaded",
                timeout: 20000,
              });
            }
            break;
          }
          case "switch-tab":
            live.manifest.activeTabId = command.tabId!;
            break;
          case "close-tab":
            if (live.pages.size > 1) await page.close();
            break;
          case "back":
            await page.goBack({ waitUntil: "domcontentloaded" });
            break;
          case "forward":
            await page.goForward({ waitUntil: "domcontentloaded" });
            break;
          case "reload":
            await page.reload({ waitUntil: "domcontentloaded" });
            break;
          case "stop": {
            const session = await live.context.newCDPSession(page);
            await session.send("Page.stopLoading");
            await session.detach();
            break;
          }
          case "tap": {
            const session = await live.context.newCDPSession(page);
            const metrics = await session.send("Page.getLayoutMetrics");
            await session.detach();
            await page.touchscreen.tap(
              (command.x! * metrics.cssVisualViewport.clientWidth) / 390,
              (command.y! * metrics.cssVisualViewport.clientHeight) / 740,
            );
            break;
          }
          case "scroll":
            await page.mouse.wheel(0, command.deltaY!);
            break;
          case "type":
            await page.keyboard.insertText(command.text!);
            break;
          case "key":
            if (
              ![
                "Enter",
                "Backspace",
                "Tab",
                "Escape",
                "ArrowLeft",
                "ArrowRight",
                "ArrowUp",
                "ArrowDown",
                "Control+a",
              ].includes(command.text!)
            )
              throw new HttpError(400, "Unsupported key");
            await page.keyboard.press(command.text!);
            break;
          case "bookmark":
            if (
              /^https?:/.test(page.url()) &&
              !live.manifest.bookmarks.some((b) => b.url === page!.url())
            )
              live.manifest.bookmarks.unshift({
                url: page.url(),
                title: await page.title(),
              });
            break;
          case "remove-bookmark":
            live.manifest.bookmarks = live.manifest.bookmarks.filter(
              (b) => b.url !== command.url,
            );
            break;
          case "clear-page": {
            if (!/^https?:/.test(page.url())) break;
            const session = await live.context.newCDPSession(page);
            await session.send("Storage.clearDataForOrigin", {
              origin: new URL(page.url()).origin,
              storageTypes: "all",
            });
            await session.send("DOMStorage.clear", {
              storageId: {
                securityOrigin: new URL(page.url()).origin,
                isLocalStorage: false,
              },
            });
            await session.detach();
            await page.reload({ waitUntil: "domcontentloaded" });
            break;
          }
          case "upload": {
            if (!live.chooser)
              throw new HttpError(409, "Open a file picker on the page first");
            const buffer = Buffer.from(command.base64!, "base64");
            if (buffer.length > 3 * 1024 * 1024)
              throw new HttpError(413, "Upload exceeds 3 MB controller limit");
            await live.chooser.setFiles({
              name: safeName(command.name!),
              mimeType: command.mimeType!,
              buffer,
            });
            live.chooser = undefined;
            break;
          }
          default:
            throw new HttpError(400, "Unknown browser command");
        }
      }
      await this.persist(key, live);
      return this.describe(live);
    });
  }
  private async describe(live: Live) {
    return {
      engine: "chromium-process" as const,
      accountId: live.config.accountId,
      activeTabId: live.manifest.activeTabId,
      tabs: await Promise.all(
        [...live.pages].map(async ([id, p]) => {
          const title = await p.title().catch(() => "");
          const recent = live.manifest.history.find(
            (h) => h.url === p.url() && !h.title,
          );
          if (recent) recent.title = title;
          const session = await live.context.newCDPSession(p);
          const navigation = await session.send("Page.getNavigationHistory");
          await session.detach();
          return {
            id,
            url: p.url(),
            title,
            canGoBack: navigation.currentIndex > 0,
            canGoForward:
              navigation.currentIndex < navigation.entries.length - 1,
          };
        }),
      ),
      bookmarks: live.manifest.bookmarks,
      history: live.manifest.history,
      downloads: live.manifest.downloads,
      filePickerOpen: Boolean(live.chooser),
      identity: {
        userAgent: live.config.userAgent,
        locale: live.config.locale,
        timezone: live.config.timezone,
      },
      egress: {
        mode: live.config.proxy ? "proxy" : "direct-explicit",
        dns: live.config.proxy
          ? "proxy-doh-and-pinned"
          : "gateway-resolved-and-pinned",
        verifiedPublicIp: null,
      },
    };
  }
  async frame(config: ProfileConfig) {
    const key = this.key(config.ownerId, config.accountId);
    return this.exclusive(key, async () => {
      const live = await this.start(config);
      live.touched = Date.now();
      return live.pages
        .get(live.manifest.activeTabId)!
        .screenshot({ type: "jpeg", quality: 65, timeout: 5000 });
    });
  }
  async verify(config: ProfileConfig, endpoint: string) {
    return this.exclusive(
      this.key(config.ownerId, config.accountId),
      async () => {
        validateTarget(endpoint);
        const live = await this.start(config),
          page = await live.context.newPage();
        try {
          const response = await page.goto(endpoint, {
            waitUntil: "domcontentloaded",
            timeout: 15000,
          });
          if (!response?.ok())
            throw new HttpError(502, "IP verification failed");
          const text = (await page.locator("body").innerText()).trim();
          let ip = text;
          try {
            ip = JSON.parse(text).ip;
          } catch {
            /* Plain-IP providers are supported. */
          }
          const { publicAddress } = await import("../lib/outbound");
          if (typeof ip !== "string" || !publicAddress(ip))
            throw new HttpError(502, "Verifier did not return a public IP");
          return {
            ip,
            checkedAt: new Date().toISOString(),
            dns: live.config.proxy
              ? "proxy-doh-and-pinned"
              : "gateway-resolved-and-pinned",
            proxy: Boolean(config.proxy),
          };
        } finally {
          await page.close();
        }
      },
    );
  }
  async download(owner: string, account: string, id: string) {
    const key = this.key(owner, account);
    if (!/^[a-f0-9-]{36}$/i.test(id))
      throw new HttpError(404, "Download not found");
    const live = this.live.get(key);
    const manifest =
      live?.manifest ??
      (decrypt(
        await readFile(path.join(this.root, key, "manifest.enc"), "utf8"),
        this.context(key),
      ) as Manifest);
    const item = manifest.downloads.find((d) => d.id === id);
    if (!item) throw new HttpError(404, "Download not found");
    const value = decrypt(
      await readFile(path.join(this.root, key, "downloads", id), "utf8"),
      `browser-download:${key}:${id}`,
    ) as string;
    return { ...item, buffer: Buffer.from(value, "base64") };
  }
  private async closeInner(key: string, live: Live) {
    await this.persist(key, live);
    await live.context.close();
    await live.gateway.close();
    this.live.delete(key);
    await rm(path.join(live.dir, "engine.lock"), { force: true });
  }
  async close(owner: string, account: string) {
    const key = this.key(owner, account);
    await this.exclusive(key, async () => {
      const live = this.live.get(key);
      if (live) await this.closeInner(key, live);
    });
  }
  async reset(owner: string, account: string) {
    const key = this.key(owner, account);
    await this.exclusive(key, async () => {
      const live = this.live.get(key);
      if (live) await this.closeInner(key, live);
      const dir = path.join(this.root, key);
      // Explicit user action only; refuse if another process owns this profile.
      try {
        await readFile(path.join(dir, "engine.lock"));
        throw new HttpError(409, "Profile is in use");
      } catch (e: any) {
        if (e.code !== "ENOENT") throw e;
      }
      await rm(dir, { recursive: true, force: true });
    });
  }
  async closeIdle(age = 15 * 60000) {
    for (const live of this.live.values())
      if (Date.now() - live.touched > age)
        await this.close(live.config.ownerId, live.config.accountId);
  }
  async closeOwner(owner: string) {
    for (const live of [...this.live.values()])
      if (live.config.ownerId === owner)
        await this.close(owner, live.config.accountId);
  }
  async shutdown() {
    for (const live of [...this.live.values()])
      await this.close(live.config.ownerId, live.config.accountId);
  }
  /** Test access only: no raw evaluation/debugging API is exposed to controllers. */
  async testingContext(config: ProfileConfig) {
    if (process.env.NODE_ENV !== "test") throw new Error("Test-only");
    return (await this.start(config)).context;
  }
}
export function inheritedProxy() {
  const raw = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
  return raw ? proxyFromUrl(raw) : undefined;
}
