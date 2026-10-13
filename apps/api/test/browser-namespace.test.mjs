import test from "node:test";
import assert from "node:assert/strict";
import { BrowserEngine } from "../src/browser/engine.ts";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import { once } from "node:events";
import net from "node:net";
import http from "node:http";
import { fileURLToPath } from "node:url";

test("production rejects namespace, sandbox, DNS and certificate test overrides", () => {
  const prior = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    assert.throws(() => new BrowserEngine("/usr/local/profiles"));
    assert.throws(() => new BrowserEngine("/var/../usr/profiles"));
    for (const options of [
      { sandbox: false },
      { networkNamespace: false },
      { gateway: () => ({}) },
      { testCertificateSPKI: "fake" },
    ])
      assert.throws(() => new BrowserEngine("/tmp/browser-test", options));
  } finally {
    process.env.NODE_ENV = prior;
  }
});
test(
  "namespace worker relays only to the assigned Unix gateway and rewrites Chromium proxy arguments",
  { timeout: 15000 },
  async () => {
    const root = await mkdtemp(path.join(tmpdir(), "browser-proxy-relay-")),
      socket = path.join(root, "gateway.sock"),
      received = [];
    const gateway = net.createServer((client) => {
      client.once("data", (data) => {
        received.push(data.toString());
        client.end(
          "HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\nOK",
        );
      });
      client.on("error", () => client.destroy());
    });
    await new Promise((resolve) => gateway.listen(socket, resolve));
    const fake = path.join(root, "fake-chromium");
    await writeFile(
      fake,
      `#!/usr/bin/env node\nrequire('node:fs').writeFileSync(${JSON.stringify(path.join(root, "args.json"))},JSON.stringify(process.argv.slice(2)));console.log('FIXTURE_READY');setInterval(()=>{},1000);process.on('SIGTERM',()=>process.exit(0));`,
      { mode: 0o700 },
    );
    const child = spawn(
      process.execPath,
      [
        fileURLToPath(
          new URL("../tools/namespace-browser-worker.mjs", import.meta.url),
        ),
        "--proxy-server=http://unapproved.invalid:9999",
        "--remote-debugging-pipe",
      ],
      {
        env: {
          PATH: process.env.PATH,
          PROFILE_RELAY_PORT: "0",
          PROFILE_GATEWAY_SOCKET: socket,
          PROFILE_CHROMIUM_EXECUTABLE: fake,
        },
        stdio: ["ignore", "pipe", "pipe", "pipe", "pipe"],
      },
    );
    let output = "",
      errors = "";
    child.stdout.on("data", (data) => (output += data));
    child.stderr.on("data", (data) => (errors += data));
    try {
      for (let i = 0; i < 100 && !output.includes("FIXTURE_READY"); i++)
        await new Promise((r) => setTimeout(r, 20));
      assert.ok(output.includes("FIXTURE_READY"), errors);
      const port = Number(output.match(/PROFILE_RELAY_READY:(\d+)/)[1]);
      assert.deepEqual(
        JSON.parse(await readFile(path.join(root, "args.json"), "utf8")),
        [`--proxy-server=http://127.0.0.1:${port}`, "--remote-debugging-pipe"],
      );
      const response = await new Promise((resolve, reject) =>
        http
          .get(
            `http://127.0.0.1:${port}/`,
            { headers: { host: "fixture.invalid" } },
            (res) => {
              let body = "";
              res.on("data", (c) => (body += c));
              res.on("end", () => resolve(body));
            },
          )
          .on("error", reject),
      );
      assert.equal(response, "OK");
      assert.match(received[0], /^GET \/ HTTP/);
    } finally {
      if (child.exitCode === null && child.signalCode === null) {
        const exit = once(child, "exit");
        child.kill("SIGTERM");
        await exit;
      }
      await new Promise((resolve) => gateway.close(resolve));
      await rm(root, { recursive: true, force: true });
    }
  },
);
