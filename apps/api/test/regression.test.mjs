import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { createServer as createHttpServer } from "node:http";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import {
  createAccount,
  deleteAccount,
  getAccount,
  healthCheck,
  listAccounts,
  updateAccount,
} from "../../../packages/api-client-react/src/generated/api.ts";
import { setBaseUrl } from "../../../packages/api-client-react/src/custom-fetch.ts";

let child;
let baseUrl;
let logs = "";

before(async () => {
  const portProbe = createServer();
  portProbe.listen(0, "127.0.0.1");
  await once(portProbe, "listening");
  const port = portProbe.address().port;
  await new Promise((resolve) => portProbe.close(resolve));
  baseUrl = `http://127.0.0.1:${port}`;
  setBaseUrl(baseUrl);
  child = spawn(process.execPath, ["--enable-source-maps", "dist/index.mjs"], {
    cwd: fileURLToPath(new URL("../", import.meta.url)),
    // Tests never access a configured database or real account records.
    env: {
      ...process.env,
      MONGODB_URI: "",
      HOST: "127.0.0.1",
      PORT: String(port),
      NODE_ENV: "development",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (data) => {
    logs += data;
  });
  child.stderr.on("data", (data) => {
    logs += data;
  });
  for (let attempt = 0; attempt < 60; attempt++) {
    if (child.exitCode !== null || child.signalCode !== null)
      throw new Error(`API exited during startup: ${logs}`);
    try {
      assert.equal(
        (await healthCheck({ signal: AbortSignal.timeout(1000) })).status,
        "ok",
      );
      return;
    } catch {
      await delay(100);
    }
  }
  throw new Error(`API failed to start: ${logs}`);
});

after(async () => {
  setBaseUrl(null);
  if (child && child.exitCode === null && child.signalCode === null) {
    const exited = once(child, "exit");
    child.kill("SIGTERM");
    await exited;
  }
});

const fixture = () => ({
  name: "Audit",
  surname: "Fixture",
  email: "fixture@example.invalid",
  password: "synthetic-test-only",
  walletName: "fixture",
});
const jsonRequest = async (path, method, body) => {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return {
    status: response.status,
    body: response.status === 204 ? null : await response.json(),
  };
};

test("generated client completes account CRUD and preserves omitted fields", async () => {
  const account = await createAccount(fixture());
  try {
    assert.ok(account.id);
    assert.ok((await listAccounts()).some((item) => item.id === account.id));
    assert.deepEqual(await getAccount(account.id), account);
    const updated = await updateAccount(account.id, { name: "Updated" });
    assert.equal(updated.name, "Updated");
    assert.equal(updated.password, account.password);
    assert.equal(updated.createdAt, account.createdAt);
    assert.deepEqual(updated.fingerprint, account.fingerprint);
  } finally {
    await deleteAccount(account.id);
  }
  await assert.rejects(
    () => getAccount(account.id),
    (error) => error.status === 404,
  );
});

test("legacy PUT and canonical PATCH use the same partial-update behavior", async () => {
  const account = await createAccount(fixture());
  try {
    for (const method of ["PUT", "PATCH"]) {
      const result = await jsonRequest(`/api/accounts/${account.id}`, method, {
        walletName: method,
      });
      assert.equal(result.status, 200);
      assert.equal(result.body.walletName, method);
      assert.equal(result.body.name, account.name);
      assert.deepEqual(result.body.fingerprint, account.fingerprint);
    }
  } finally {
    await deleteAccount(account.id);
  }
});

test("browser state persists, caps history, resets, and stays separate by account", async () => {
  const first = await createAccount(fixture());
  const second = await createAccount(fixture());
  try {
    const state = {
      cookies: { synthetic: "fixture" },
      localStorage: { theme: "dark" },
      sessionStorage: { tab: "one" },
      history: Array.from({ length: 260 }, (_, i) => ({
        url: `https://example.invalid/${i}`,
        at: new Date().toISOString(),
      })),
    };
    const saved = await jsonRequest(
      `/api/accounts/${first.id}/browser-state`,
      "PATCH",
      state,
    );
    assert.equal(saved.status, 200);
    assert.equal(saved.body.history.length, 250);
    const loaded = await jsonRequest(
      `/api/accounts/${first.id}/browser-state`,
      "GET",
    );
    assert.deepEqual(loaded.body, saved.body);
    const other = await jsonRequest(
      `/api/accounts/${second.id}/browser-state`,
      "GET",
    );
    assert.deepEqual(other.body.localStorage, {});
    assert.deepEqual(other.body.cookies, {});
    const reset = await jsonRequest(
      `/api/accounts/${first.id}/browser-state`,
      "DELETE",
    );
    assert.equal(reset.status, 200);
    for (const key of ["cookies", "localStorage", "sessionStorage"])
      assert.deepEqual(reset.body[key], {});
    assert.deepEqual(reset.body.history, []);
    assert.equal((await getAccount(first.id)).id, first.id);
    assert.deepEqual(
      (await jsonRequest(`/api/accounts/${first.id}/browser-state`, "GET"))
        .body,
      reset.body,
    );
  } finally {
    await deleteAccount(first.id);
    await deleteAccount(second.id);
  }
});

test("fingerprint patches merge without regenerating the account identity", async () => {
  const account = await createAccount(fixture());
  try {
    const result = await jsonRequest(`/api/accounts/${account.id}`, "PATCH", {
      timezone: "Africa/Johannesburg",
      fingerprint: { auditMarker: "fixture" },
    });
    assert.equal(result.status, 200);
    assert.equal(result.body.timezone, "Africa/Johannesburg");
    assert.equal(result.body.fingerprint.auditMarker, "fixture");
    assert.equal(result.body.deviceName, account.deviceName);
    assert.equal(result.body.userAgent, account.userAgent);
    assert.equal(result.body.fakeIp, account.fakeIp);
  } finally {
    await deleteAccount(account.id);
  }
});

test("missing accounts return 404 for updates and browser-state operations", async () => {
  for (const method of ["PUT", "PATCH"]) {
    assert.equal(
      (await jsonRequest("/api/accounts/missing", method, { name: "Missing" }))
        .status,
      404,
    );
  }
  for (const method of ["GET", "PATCH", "DELETE"]) {
    assert.equal(
      (
        await jsonRequest(
          "/api/accounts/missing/browser-state",
          method,
          method === "PATCH" ? {} : undefined,
        )
      ).status,
      404,
    );
  }
});

test("existing proxy fetch still returns upstream content and status", async () => {
  const upstream = createHttpServer((_req, res) => {
    res.writeHead(202, { "content-type": "text/html" });
    res.end("<html>synthetic proxy fixture</html>");
  });
  upstream.listen(0, "127.0.0.1");
  await once(upstream, "listening");
  try {
    const url = `http://127.0.0.1:${upstream.address().port}/fixture`;
    const response = await fetch(
      `${baseUrl}/api/proxy?url=${encodeURIComponent(url)}`,
    );
    assert.equal(response.status, 202);
    assert.match(await response.text(), /synthetic proxy fixture/);
    assert.equal(response.headers.get("cache-control"), "no-store");
  } finally {
    await new Promise((resolve) => upstream.close(resolve));
  }
});

test("proxy-record routes remain registered and require MongoDB", async () => {
  for (const [path, method, body] of [
    ["/api/proxies", "GET"],
    ["/api/proxies", "POST", { name: "fixture" }],
    ["/api/proxies/missing", "PATCH", {}],
    ["/api/proxies/missing", "DELETE"],
    ["/api/proxies/missing/check", "POST", {}],
  ])
    assert.equal((await jsonRequest(path, method, body)).status, 503);
});
