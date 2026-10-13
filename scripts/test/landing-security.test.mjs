import assert from "node:assert/strict";
import { test } from "node:test";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

test("landing page ignores untrusted forwarded headers and self-hosts the pinned QR bundle", async () => {
  const root = fileURLToPath(new URL("../../", import.meta.url));
  const probe = createServer();
  probe.listen(0, "127.0.0.1");
  await once(probe, "listening");
  const port = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));
  const child = spawn(process.execPath, ["server/serve.js"], {
    cwd: `${root}/apps/mobile`,
    env: {
      ...process.env,
      PORT: String(port),
      PUBLIC_DEPLOYMENT_HOST: "fixture.example.invalid",
    },
    stdio: "ignore",
  });
  const base = `http://127.0.0.1:${port}`;
  try {
    for (let i = 0; i < 40; i++) {
      try {
        if ((await fetch(base)).ok) break;
      } catch {}
      await delay(100);
    }
    const response = await fetch(base, {
      headers: {
        "x-forwarded-host": 'evil.example";globalThis.__injected=1;//',
        "x-forwarded-proto": "javascript:",
      },
    });
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.ok(!html.includes("__injected"));
    assert.ok(html.includes("fixture.example.invalid"));
    assert.ok(!html.includes("unpkg.com"));
    assert.match(html, /vendor\/qr-code-styling.js/);
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    const qr = await fetch(`${base}/vendor/qr-code-styling.js`);
    assert.equal(qr.status, 200);
    const data = Buffer.from(await qr.arrayBuffer());
    const provenance = JSON.parse(
      readFileSync(`${root}/apps/mobile/server/vendor/provenance.json`),
    );
    assert.equal(
      createHash("sha256").update(data).digest("hex"),
      provenance.bundle_sha256,
    );
  } finally {
    const exited = once(child, "exit");
    child.kill("SIGTERM");
    await exited;
  }
});
