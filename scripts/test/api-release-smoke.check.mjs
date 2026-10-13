import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { createServer as proxyServer } from "node:http";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
test("packaged production API starts confined Chromium and recovers persistent account profiles", async () => {
  const root = process.env.API_RELEASE_ROOT,
    uri = process.env.MONGO_TEST_URI;
  assert.ok(root);
  assert.match(uri, /\/browser_proxy_test_[a-zA-Z0-9_-]+(?:\?|$)/);
  const api = path.join(root, "apps/api"),
    require = createRequire(path.join(api, "package.json"));
  const mongoose = require("mongoose");
  const db = await mongoose.createConnection(uri).asPromise();
  assert.equal(
    (await db.db.listCollections().toArray()).length,
    0,
    "Refuse nonempty fixture",
  );
  const profiles = await mkdtemp(path.join(tmpdir(), "bp-release-profiles-"));
  const key = randomBytes(32).toString("base64");
  const proxy = proxyServer((_req, res) => {
    res.writeHead(502);
    res.end("Fixture proxy unavailable");
  });
  proxy.on("connect", (_req, socket) =>
    socket.end("HTTP/1.1 502 Bad Gateway\r\n\r\n"),
  );
  proxy.listen(0, "127.0.0.1");
  await once(proxy, "listening");
  const proxyPort = proxy.address().port;
  let child, base, actor;
  async function stop() {
    if (child && child.exitCode === null && child.signalCode === null) {
      const exited = once(child, "exit");
      child.kill("SIGTERM");
      await exited;
    }
  }
  async function start() {
    const probe = createServer();
    probe.listen(0, "127.0.0.1");
    await once(probe, "listening");
    const port = probe.address().port;
    await new Promise((r) => probe.close(r));
    base = `http://127.0.0.1:${port}`;
    child = spawn(process.execPath, ["dist/index.mjs"], {
      cwd: api,
      env: {
        ...process.env,
        NODE_ENV: "production",
        HOST: "127.0.0.1",
        PORT: String(port),
        MONGODB_URI: uri,
        ACCOUNT_ENCRYPTION_KEY: key,
        ALLOW_REGISTRATION: "true",
        BROWSER_ENGINE_ENABLED: "true",
        BROWSER_PROFILE_ROOT: profiles,
        BROWSER_ALLOW_DIRECT: "false",
        BROWSER_DOH_ENDPOINT: "https://cloudflare-dns.com/dns-query",
        BROWSER_DOH_BOOTSTRAP_IP: "1.1.1.1",
        BROWSER_TRUSTED_PROXY_AUTHORITIES: `127.0.0.1:${proxyPort}`,
      },
      stdio: ["ignore", "ignore", "ignore"],
    });
    for (let n = 0; n < 100; n++) {
      assert.equal(child.exitCode, null, "Release API exited");
      try {
        if ((await fetch(base + "/api/healthz")).ok) return;
      } catch {}
      await delay(100);
    }
    throw Error("Release API not ready");
  }
  async function request(route, method = "GET", body) {
    const r = await fetch(base + "/api" + route, {
      method,
      headers: {
        "content-type": "application/json",
        ...(actor ? { authorization: `Bearer ${actor.accessToken}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    assert.ok(
      r.ok,
      `Release request failed: ${r.status} ${await (!r.ok ? r.text() : Promise.resolve(""))}`,
    );
    return r.status === 204 ? null : r.json();
  }
  try {
    await start();
    actor = await request("/auth/register", "POST", {
      email: "release-fixture@example.invalid",
      password: "Synthetic-Strong-Password-42",
    });
    const account = await request("/accounts", "POST", {
      name: "Packaged browser",
      proxyUrl: `http://127.0.0.1:${proxyPort}`,
    });
    const prefix = `/accounts/${account.id}/browser`;
    const initial = await request(prefix);
    assert.equal(initial.engine, "chromium-process");
    assert.ok(initial.tabs.length > 0);
    const frame = await fetch(base + "/api" + prefix + "/frame", {
      headers: { authorization: `Bearer ${actor.accessToken}` },
    });
    assert.equal(frame.status, 200);
    assert.match(frame.headers.get("content-type"), /image/);
    assert.ok((await frame.arrayBuffer()).byteLength > 100);
    await request(prefix + "/session", "DELETE");
    await stop();
    await start();
    assert.equal(
      (await request(`/accounts/${account.id}`)).name,
      "Packaged browser",
    );
    const recovered = await request(prefix);
    assert.deepEqual(
      recovered.tabs.map((t) => t.id),
      initial.tabs.map((t) => t.id),
    );
    await request(prefix + "/session", "DELETE");
    await request(`/accounts/${account.id}`, "DELETE");
  } finally {
    await stop();
    await new Promise((resolve) => proxy.close(resolve));
    await db.dropDatabase();
    await db.close();
    await rm(profiles, { recursive: true, force: true });
  }
});
