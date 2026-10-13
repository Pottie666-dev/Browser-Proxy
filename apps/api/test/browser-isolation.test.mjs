import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { randomBytes, createHash, X509Certificate } from "node:crypto";
import { BrowserEngine } from "../src/browser/engine.ts";
import { proxyDnsResolver } from "../src/browser/dns.ts";
import {
  createGateway,
  proxyFromUrl,
  validateProxy,
} from "../src/browser/egress.ts";

const listen = (server) =>
  new Promise((resolve) =>
    server.listen(0, "127.0.0.1", () => resolve(server.address().port)),
  );
const stop = (server) =>
  new Promise((resolve) => {
    server.closeAllConnections?.();
    server.close(resolve);
  });
const connect = (port) =>
  new Promise((resolve, reject) => {
    const s = net.connect(port, "127.0.0.1", () => resolve(s));
    s.once("error", reject);
  });
const fixtureHtml = `<!doctype html><title>Fixture</title><input id="text"><input id="file" type="file"><button onclick="fetch('/upload',{method:'POST',body:document.querySelector('#file').files[0]}).then(r=>r.text()).then(t=>document.querySelector('#result').textContent=t)">Upload</button><div id="result"></div><form method="post" action="/form"><input name="value" value="hello"><button>Submit</button></form><a href="/download">Download</a>`;

test(
  "real Chromium processes isolate cookies, persistent storage, caches, service workers and egress",
  { timeout: 120000 },
  async (t) => {
    process.env.NODE_ENV = "test";
    process.env.ACCOUNT_ENCRYPTION_KEY = randomBytes(32).toString("base64");
    const root = await mkdtemp(path.join(tmpdir(), "browser-proxy-stage3-"));
    execFileSync(
      "openssl",
      [
        "req",
        "-x509",
        "-newkey",
        "rsa:2048",
        "-nodes",
        "-keyout",
        path.join(root, "fixture.key"),
        "-out",
        path.join(root, "fixture.crt"),
        "-days",
        "1",
        "-subj",
        "/CN=browser.test",
        "-addext",
        "subjectAltName=DNS:browser.test,DNS:other.test",
      ],
      { stdio: "ignore" },
    );
    const cert = await readFile(path.join(root, "fixture.crt")),
      key = await readFile(path.join(root, "fixture.key"));
    const spki = createHash("sha256")
      .update(
        new X509Certificate(cert).publicKey.export({
          type: "spki",
          format: "der",
        }),
      )
      .digest("base64");
    let originHits = 0,
      leakedHeaders = 0,
      uploads = [],
      setCookies = true;
    let httpCacheHits = 0;
    const dns = [],
      routes = [];
    const handler = (req, res) => {
      if (req.url.startsWith("/resolve")) {
        const url = new URL(req.url, "https://browser.test");
        dns.push(url.searchParams.get("name"));
        const type = url.searchParams.get("type");
        res.setHeader("content-type", "application/dns-json");
        res.end(
          JSON.stringify({
            Status: 0,
            Answer:
              type === "A"
                ? [
                    {
                      type: 1,
                      data:
                        url.searchParams.get("name") === "rebind.test"
                          ? "127.0.0.1"
                          : "93.184.216.34",
                    },
                  ]
                : [],
          }),
        );
        return;
      }
      originHits++;
      if (req.url === "/cached-resource") {
        httpCacheHits++;
        res.setHeader("cache-control", "public, max-age=86400");
        res.end(
          req.headers.cookie?.includes("visible=alpha")
            ? "cache-alpha"
            : "cache-beta",
        );
        return;
      }
      if (req.headers["proxy-authorization"] || req.headers.authorization)
        leakedHeaders++;
      if (req.url === "/redirect") {
        res.writeHead(302, { location: "https://browser.test/" });
        res.end();
        return;
      }
      if (req.url === "/unsafe-redirect") {
        res.writeHead(302, { location: "http://127.0.0.1/" });
        res.end();
        return;
      }
      if (req.url === "/sw.js") {
        res.setHeader("content-type", "application/javascript");
        res.end(
          "self.addEventListener('install',e=>self.skipWaiting());self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));",
        );
        return;
      }
      if (req.url === "/download") {
        res.writeHead(200, {
          "content-disposition": "attachment; filename=report.txt",
          "content-type": "application/octet-stream",
        });
        res.end("private account download");
        return;
      }
      if (req.url === "/upload" || req.url === "/form") {
        const chunks = [];
        req.on("data", (c) => chunks.push(c));
        req.on("end", () => {
          const text = Buffer.concat(chunks).toString();
          uploads.push(text);
          res.end(text);
        });
        return;
      }
      if (req.url === "/ip") {
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ ip: "93.184.216.34" }));
        return;
      }
      if (req.url === "/cookie" && setCookies) {
        res.setHeader(
          "Set-Cookie",
          "httpOnlySecret=alpha; HttpOnly; Secure; SameSite=Lax; Max-Age=86400",
        );
      }
      res.setHeader("content-type", "text/html");
      res.end(fixtureHtml);
    };
    const web = http.createServer(handler),
      secureWeb = https.createServer({ key, cert }, handler);
    const httpPort = await listen(web),
      httpsPort = await listen(secureWeb);
    const proxyConnections = [];
    const upstream = http.createServer((_req, res) => {
      res.writeHead(405);
      res.end();
    });
    const tunnels = new Set();
    upstream.on("connect", async (req, client, head) => {
      proxyConnections.push({
        owner: req.fixtureOwner ?? "a",
        target: req.url,
        auth: req.headers["proxy-authorization"],
      });
      if (
        req.headers["proxy-authorization"] !==
        `Basic ${Buffer.from(req.fixtureOwner === "b" ? "test-user-b:test-password-b" : "test-user:test-password").toString("base64")}`
      ) {
        client.end("HTTP/1.1 407 Required\r\n\r\n");
        return;
      }
      const s = await connect(req.url.endsWith(":443") ? httpsPort : httpPort);
      client.on("error", () => client.destroy());
      s.on("error", () => s.destroy());
      tunnels.add(s);
      tunnels.add(client);
      client.write("HTTP/1.1 200 OK\r\n\r\n");
      if (head.length) s.write(head);
      client.pipe(s);
      s.pipe(client);
      client.on("close", () => s.destroy());
      s.on("close", () => client.destroy());
    });
    const proxyPort = await listen(upstream);
    const upstreamB = http.createServer((_req, res) => {
      res.writeHead(405);
      res.end();
    });
    upstreamB.on("connect", (req, client, head) => {
      req.fixtureOwner = "b";
      upstream.listeners("connect")[0](req, client, head);
    });
    const proxyPortB = await listen(upstreamB);
    const gateway = (config) => ({
      proxy: config.proxy,
      resolve: proxyDnsResolver(config.proxy, {
        endpoint: "https://browser.test/resolve",
        bootstrapAddress: "93.184.216.35",
        testCA: cert.toString(),
      }),
      dial: (host, port) => {
        if (host === "127.0.0.1" && port === config.proxy.port)
          return connect(port);
        throw new Error("No direct dial permitted in required-proxy fixture");
      },
      onRoute: (host, address, via) =>
        routes.push({ account: config.accountId, host, address, via }),
    });
    const options = {
      executablePath: "/usr/bin/chromium",
      sandbox: process.env.BROWSER_TEST_CONFINED === "true",
      networkNamespace: process.env.BROWSER_TEST_CONFINED === "true",
      testCertificateSPKI: spki,
      gateway,
      maxActive: 3,
    };
    const owner = "111111111111111111111111",
      a = {
        ownerId: owner,
        accountId: "aaaaaaaaaaaaaaaaaaaaaaaa",
        userAgent: "BrowserProxy-A/1",
        locale: "en-US",
        timezone: "UTC",
        proxy: {
          protocol: "http:",
          host: "127.0.0.1",
          port: proxyPort,
          username: "test-user",
          password: "test-password",
        },
      },
      b = {
        ...a,
        accountId: "bbbbbbbbbbbbbbbbbbbbbbbb",
        userAgent: "BrowserProxy-B/1",
        locale: "en-GB",
        timezone: "Europe/London",
        proxy: {
          ...a.proxy,
          port: proxyPortB,
          username: "test-user-b",
          password: "test-password-b",
        },
      };
    let engine = new BrowserEngine(path.join(root, "profiles"), options);
    try {
      await engine.run(a, {
        action: "navigate",
        url: "https://browser.test/cookie",
      });
      const ca = await engine.testingContext(a),
        pa = ca.pages()[0];
      await pa.evaluate(async () => {
        document.cookie = "visible=alpha; max-age=86400";
        localStorage.setItem("secret", "alpha");
        sessionStorage.setItem("session", "alpha");
        await new Promise((resolve, reject) => {
          const request = indexedDB.open("vault", 1);
          request.onupgradeneeded = () =>
            request.result.createObjectStore("items");
          request.onsuccess = () => {
            const tx = request.result.transaction("items", "readwrite");
            tx.objectStore("items").put("alpha", "secret");
            tx.oncomplete = () => {
              request.result.close();
              resolve();
            };
          };
          request.onerror = reject;
        });
        const cache = await caches.open("vault");
        await cache.put("/cached", new Response("alpha"));
        await navigator.serviceWorker.register("/sw.js");
        await navigator.serviceWorker.ready;
      });
      await engine.run(a, { action: "navigate", url: "https://other.test/" });
      await pa.evaluate(() => sessionStorage.setItem("other-session", "beta"));
      await engine.run(a, {
        action: "navigate",
        url: "https://browser.test/session-next",
      });
      let savedA = await engine.run(a);

      await engine.run(b, { action: "navigate", url: "https://browser.test/" });
      const cb = await engine.testingContext(b),
        pb = cb.pages()[0];
      await t.test(
        "cookies including HttpOnly, localStorage, IndexedDB, cache and SW never cross accounts",
        async () => {
          assert.equal(
            (await ca.cookies()).find((c) => c.name === "httpOnlySecret")
              .httpOnly,
            true,
          );
          assert.equal((await cb.cookies()).length, 0);
          const state = await pb.evaluate(async () => ({
            local: localStorage.getItem("secret"),
            session: sessionStorage.getItem("session"),
            databases: await indexedDB.databases(),
            caches: await caches.keys(),
            workers: (await navigator.serviceWorker.getRegistrations()).length,
          }));
          assert.equal(state.local, null);
          assert.equal(state.session, null);
          assert.deepEqual(state.databases, []);
          assert.deepEqual(state.caches, []);
          assert.equal(state.workers, 0);
          assert.equal(
            await pa.evaluate(() =>
              fetch("/cached-resource").then((r) => r.text()),
            ),
            "cache-alpha",
          );
          assert.equal(
            await pa.evaluate(() =>
              fetch("/cached-resource").then((r) => r.text()),
            ),
            "cache-alpha",
          );
          assert.equal(httpCacheHits, 1);
          assert.equal(
            await pb.evaluate(() =>
              fetch("/cached-resource").then((r) => r.text()),
            ),
            "cache-beta",
          );
          assert.equal(httpCacheHits, 2);
          await pb.evaluate(() =>
            sessionStorage.setItem("b-session", "b-only"),
          );
          assert.equal(
            await pa.evaluate(() => navigator.userAgent),
            a.userAgent,
          );
          assert.equal(
            await pb.evaluate(() => navigator.userAgent),
            b.userAgent,
          );
          assert.equal(await pb.evaluate(() => navigator.language), b.locale);
          assert.equal(
            await pb.evaluate(
              () => Intl.DateTimeFormat().resolvedOptions().timeZone,
            ),
            b.timezone,
          );
          assert.ok((await pb.evaluate(() => navigator.maxTouchPoints)) > 0);
          assert.notEqual(ca, pb.context());
          const profiles = await readdir(path.join(root, "profiles", owner));
          assert.deepEqual(profiles.sort(), [a.accountId, b.accountId]);
        },
      );
      await t.test(
        "tabs, bookmarks and keyboard input use the real account browser",
        async () => {
          const original = savedA.activeTabId;
          await engine.run(a, { action: "bookmark" });
          const next = await engine.run(a, {
            action: "new-tab",
            url: "https://browser.test/tab-two",
          });
          assert.equal(next.tabs.length, 2);
          assert.notEqual(next.activeTabId, original);
          const second = ca.pages()[1];
          assert.equal(
            await second.evaluate(() => sessionStorage.getItem("session")),
            null,
          );
          const box = await second.locator("#text").boundingBox();
          const metrics = await second.evaluate(() => ({
            width: visualViewport.width,
            height: visualViewport.height,
          }));
          await engine.run(a, {
            action: "tap",
            x: ((box.x + box.width / 2) / metrics.width) * 390,
            y: ((box.y + box.height / 2) / metrics.height) * 740,
          });
          await engine.run(a, { action: "type", text: "controller input" });
          assert.equal(
            await second.locator("#text").inputValue(),
            "controller input",
          );
          savedA = await engine.run(a, {
            action: "switch-tab",
            tabId: original,
          });
        },
      );
      await t.test(
        "persistent Chrome stores and tabs survive closing and recreating the engine",
        async () => {
          setCookies = false;
          await engine.shutdown();
          engine = new BrowserEngine(path.join(root, "profiles"), options);
          const state = await engine.run(a);
          assert.equal(state.tabs.length, 2);
          assert.equal(state.bookmarks.length, 1);
          assert.ok(state.history.length);
          assert.equal(state.tabs[0].id, savedA.tabs[0].id);
          assert.equal(
            state.tabs[0].canGoBack,
            true,
            "Native browser navigation history is restored",
          );
          const c = await engine.testingContext(a),
            p = c
              .pages()
              .find(
                (p) =>
                  p.url() ===
                  state.tabs.find((t) => t.id === state.activeTabId).url,
              );
          assert.equal(
            (await c.cookies()).find((c) => c.name === "httpOnlySecret").value,
            "alpha",
          );
          const stores = await p.evaluate(async () => ({
            local: localStorage.getItem("secret"),
            session: sessionStorage.getItem("session"),
            databases: await indexedDB.databases(),
            cached: await (
              await (await caches.open("vault")).match("/cached")
            ).text(),
            workers: (await navigator.serviceWorker.getRegistrations()).length,
          }));
          assert.equal(stores.local, "alpha");
          assert.equal(stores.session, "alpha");
          assert.equal(stores.cached, "alpha");
          assert.equal(stores.databases[0].name, "vault");
          assert.equal(stores.workers, 1);
          const beforeCache = httpCacheHits;
          assert.equal(
            await p.evaluate(() =>
              fetch("/cached-resource").then((r) => r.text()),
            ),
            "cache-alpha",
          );
          assert.equal(httpCacheHits, beforeCache);
          await engine.run(a, { action: "back" });
          assert.equal(p.url(), "https://other.test/");
          assert.equal(
            await p.evaluate(() => sessionStorage.getItem("other-session")),
            "beta",
          );
          await engine.run(a, { action: "forward" });
          assert.equal(
            await p.evaluate(() => sessionStorage.getItem("session")),
            "alpha",
          );
          const stateB = await engine.run(b);
          assert.equal(stateB.tabs.length, 1);
          assert.equal(
            await (await engine.testingContext(b))
              .pages()[0]
              .evaluate(() => sessionStorage.getItem("b-session")),
            "b-only",
          );
          assert.equal(
            (await (await engine.testingContext(b)).cookies()).length,
            0,
          );
        },
      );
      await t.test(
        "a second worker cannot open an already-owned Chromium directory",
        async () => {
          const other = new BrowserEngine(path.join(root, "profiles"), options);
          await assert.rejects(() => other.run(a), /already in use/);
          await other.shutdown();
        },
      );
      await t.test(
        "HTTP redirects and HTTPS forms/uploads/downloads use the proxy without credential leakage",
        async () => {
          await engine.run(a, {
            action: "navigate",
            url: "http://browser.test/redirect",
          });
          const p = (await engine.testingContext(a))
            .pages()
            .find((p) => p.url() === "https://browser.test/");
          assert.ok(p);
          await p.locator("#file").click();
          assert.equal((await engine.run(a)).filePickerOpen, true);
          await engine.run(a, {
            action: "upload",
            name: "fixture.txt",
            mimeType: "text/plain",
            base64: Buffer.from("uploaded privately").toString("base64"),
          });
          await p.getByText("Upload", { exact: true }).click();
          await p.waitForFunction(
            () =>
              document.querySelector("#result").textContent ===
              "uploaded privately",
          );
          await p.getByText("Submit", { exact: true }).click();
          await p.waitForURL("**/form");
          assert.ok(uploads.includes("value=hello"));
          await engine.run(a, {
            action: "navigate",
            url: "https://browser.test/",
          });
          const download = p.waitForEvent("download");
          await p.getByText("Download", { exact: true }).click();
          await (await download).path();
          let state;
          for (let i = 0; i < 30; i++) {
            state = await engine.run(a);
            if (state.downloads.length) break;
            await new Promise((r) => setTimeout(r, 50));
          }
          assert.equal(state.downloads.length, 1);
          const file = await engine.download(
            owner,
            a.accountId,
            state.downloads[0].id,
          );
          assert.equal(file.buffer.toString(), "private account download");
          await assert.rejects(() =>
            engine.download(owner, b.accountId, state.downloads[0].id),
          );
          assert.equal(leakedHeaders, 0);
          assert.ok(proxyConnections.length > 2);
          assert.ok(
            proxyConnections.every((c) =>
              /^93\.184\.216\.(34|35):/.test(c.target),
            ),
          );
          assert.ok(routes.every((r) => r.via));
          assert.ok(
            proxyConnections.some((c) => c.owner === "a") &&
              proxyConnections.some((c) => c.owner === "b"),
          );
          for (const c of proxyConnections)
            assert.equal(
              c.auth,
              `Basic ${Buffer.from(c.owner === "b" ? "test-user-b:test-password-b" : "test-user:test-password").toString("base64")}`,
            );
        },
      );
      await t.test(
        "private redirects, subresources and DNS rebinding do not reach private fixtures",
        async () => {
          const p = (await engine.testingContext(b)).pages()[0];
          await assert.rejects(() =>
            engine.run(b, { action: "navigate", url: "http://127.0.0.1/" }),
          );
          await engine
            .run(b, {
              action: "navigate",
              url: "https://browser.test/unsafe-redirect",
            })
            .catch(() => {});
          await engine.run(b, {
            action: "navigate",
            url: "https://browser.test/",
          });
          const before = originHits;
          await p.evaluate(async () => {
            await Promise.all([
              fetch("http://127.0.0.1/").catch(() => {}),
              fetch("https://rebind.test/").catch(() => {}),
            ]);
          });
          assert.equal(originHits, before);
          assert.ok(dns.includes("rebind.test"));
        },
      );
      await t.test(
        "public IP verification is observed through the configured egress",
        async () => {
          const status = await engine.verify(a, "https://browser.test/ip");
          assert.equal(status.ip, "93.184.216.34");
          assert.equal(status.proxy, true);
          assert.equal(status.dns, "proxy-doh-and-pinned");
        },
      );
      if (process.env.BROWSER_TEST_CONFINED === "true")
        await t.test(
          "confined Chromium retains its native namespace and seccomp sandbox",
          async () => {
            const context = await engine.testingContext(a),
              page = await context.newPage();
            try {
              await page.goto("chrome://sandbox");
              const status = await page.locator("body").innerText();
              assert.match(status, /Layer 1 Sandbox\s+(Namespace|SUID)/);
              assert.match(status, /Network namespaces\s+Yes/);
              assert.match(status, /Seccomp-BPF sandbox\s+Yes/);
            } finally {
              await page.close();
            }
          },
        );
      await t.test(
        "native page reset clears its origin and leaves the other account untouched",
        async () => {
          await engine.run(a, { action: "clear-page" });
          const context = await engine.testingContext(a);
          const state = await engine.run(a),
            page = context
              .pages()
              .find(
                (p) =>
                  p.url() ===
                  state.tabs.find((t) => t.id === state.activeTabId).url,
              );
          assert.equal((await context.cookies()).length, 0);
          assert.equal(
            await page.evaluate(() => localStorage.getItem("secret")),
            null,
          );
          assert.equal(
            await page.evaluate(() => sessionStorage.getItem("session")),
            null,
          );
          assert.equal(
            await (await engine.testingContext(b))
              .pages()[0]
              .evaluate(() => sessionStorage.getItem("b-session")),
            "b-only",
          );
        },
      );
      await t.test(
        "dead required proxy produces an error and never directly contacts the origin",
        async () => {
          for (const socket of tunnels) socket.destroy();
          await stop(upstreamB);
          const before = originHits;
          await assert.rejects(() =>
            engine.run(b, {
              action: "navigate",
              url: "https://browser.test/no-direct-fallback",
            }),
          );
          assert.equal(originHits, before);
          await engine.run(a, {
            action: "navigate",
            url: "https://browser.test/still-isolated",
          });
          assert.ok(originHits > before);
        },
      );
    } finally {
      await engine.shutdown();
      for (const s of tunnels) s.destroy();
      if (upstream.listening) await stop(upstream);
      if (upstreamB.listening) await stop(upstreamB);
      await stop(web);
      await stop(secureWeb);
      await rm(root, { recursive: true, force: true });
    }
  },
);

test("egress proxy URL parsing and private proxy approval are fail closed", async () => {
  assert.throws(() => proxyFromUrl("socks5://127.0.0.1:1080"));
  assert.throws(() => proxyFromUrl("http://proxy.invalid/path"));
  await assert.rejects(() =>
    validateProxy({ protocol: "http:", host: "127.0.0.1", port: 8080 }),
  );
  await validateProxy({ protocol: "http:", host: "127.0.0.1", port: 8080 }, [
    "127.0.0.1:8080",
  ]);
});
