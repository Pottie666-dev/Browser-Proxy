#!/usr/bin/env node
import { assertDeploymentPolicy } from "./deployment-policy.mjs";
import { createRequire } from "node:module";
import {
  existsSync,
  mkdirSync,
  realpathSync,
  writeFileSync,
  unlinkSync,
  statSync,
  rmSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";
const require = createRequire(import.meta.url),
  checks = [];
function check(name, operation) {
  try {
    operation();
    checks.push({ name, ok: true });
  } catch {
    checks.push({ name, ok: false });
  }
}
check(
  "Production configuration (TLS, sandbox, ownership and relay prerequisites)",
  () => assertDeploymentPolicy(process.env),
);
check("Unprivileged service user", () => {
  if (!process.getuid || process.getuid() === 0) throw Error();
});
check("Runtime dependencies", () => {
  for (const p of ["playwright-core", "pino", "mongoose"]) require.resolve(p);
});
check("Namespace helpers", () => {
  for (const f of [
    "chromium-namespace-wrapper.mjs",
    "namespace-browser-worker.mjs",
  ])
    if (!existsSync(new URL(f, import.meta.url))) throw Error();
});
check("Chromium executable", () => {
  const r = spawnSync(
    process.env.CHROMIUM_EXECUTABLE_PATH ?? "/usr/bin/chromium",
    ["--version"],
    { encoding: "utf8" },
  );
  if (r.status !== 0) throw Error();
});
check("Host network/PID/IPC namespaces", () => {
  const r = spawnSync(
    "bwrap",
    [
      "--unshare-net",
      "--unshare-pid",
      "--unshare-ipc",
      "--ro-bind",
      "/",
      "/",
      "--",
      "/usr/bin/true",
    ],
    { encoding: "utf8" },
  );
  if (r.status !== 0) throw Error();
});
check("Dedicated persistent profile path", () => {
  const configured = process.env.BROWSER_PROFILE_ROOT;
  if (!configured || !path.isAbsolute(configured)) throw Error();
  mkdirSync(configured, { recursive: true, mode: 0o700 });
  const root = realpathSync(configured);
  if (
    root === "/" ||
    ["/usr", "/bin", "/lib", "/etc", "/proc", "/sys", "/dev"].some(
      (p) => root === p || root.startsWith(p + "/"),
    ) ||
    (statSync(root).mode & 0o077) !== 0
  )
    throw Error();
  const probe = path.join(root, ".deployment-check-" + randomUUID());
  try {
    writeFileSync(probe, "probe", { flag: "wx", mode: 0o600 });
  } finally {
    if (existsSync(probe)) unlinkSync(probe);
  }
});
// Exercise the actual packaged wrapper and Chromium sandbox, not just an open port.
check("Trusted native browser assets", () => {
  const configured =
    process.env.CHROMIUM_EXECUTABLE_PATH || "/usr/bin/chromium";
  const actual = realpathSync(configured);
  if (actual.startsWith("/snap/") || actual.startsWith("/var/lib/snapd/"))
    throw Error();
  for (const file of [configured, actual]) {
    const st = statSync(file);
    if (st.uid !== 0 || st.mode & 0o022) throw Error();
  }
});
try {
  if (!checks.every((c) => c.ok)) throw Error();
  const { chromium } = require("playwright-core");
  const root = realpathSync(process.env.BROWSER_PROFILE_ROOT);
  const dir = path.join(root, ".preflight-" + randomUUID());
  mkdirSync(dir, { mode: 0o700 });
  let context;
  try {
    context = await chromium.launchPersistentContext(
      path.join(dir, "chromium"),
      {
        executablePath: new URL(
          "chromium-namespace-wrapper.mjs",
          import.meta.url,
        ).pathname,
        headless: true,
        chromiumSandbox: true,
        timeout: 20000,
        env: {
          PATH: process.env.PATH || "/usr/bin:/bin",
          LANG: "C.UTF-8",
          PROFILE_STORAGE_ROOT: root,
          PROFILE_NAMESPACE_ROOT: dir,
          PROFILE_GATEWAY_SOCKET: path.join(dir, "egress.sock"),
          PROFILE_CHROMIUM_EXECUTABLE:
            process.env.CHROMIUM_EXECUTABLE_PATH || "/usr/bin/chromium",
        },
      },
    );
    const page = await context.newPage();
    await page.goto("chrome://sandbox", { timeout: 10000 });
    const status = await page.locator("body").innerText();
    if (
      !/Layer 1 Sandbox\s+(Namespace|SUID)/.test(status) ||
      !/Network namespaces\s+Yes/.test(status) ||
      !/Seccomp-BPF sandbox\s+Yes/.test(status)
    )
      throw Error();
    checks.push({
      name: "Chromium sandbox inside packaged namespace wrapper",
      ok: true,
    });
  } finally {
    if (context) await context.close();
    rmSync(dir, { recursive: true, force: true });
  }
} catch {
  checks.push({
    name: "Chromium sandbox inside packaged namespace wrapper",
    ok: false,
  });
}
try {
  const mongoose = require("mongoose");
  try {
    assertDeploymentPolicy(process.env);
  } catch {
    throw Error();
  }
  await mongoose.connect(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 8000,
  });
  const hello = await mongoose.connection.db.admin().command({ hello: 1 });
  checks.push({
    name: "Database replica set",
    ok: !!hello.setName || hello.msg === "isdbgrid",
  });
  await mongoose.disconnect();
} catch {
  checks.push({ name: "Database replica set", ok: false });
  try {
    await require("mongoose").disconnect();
  } catch {}
}
console.log(
  JSON.stringify(
    {
      checks,
      operatorRequirements: [
        "Trusted HTTPS reverse proxy",
        "Encrypted profile filesystem and backups",
        "Account encryption key",
        "Approved proxy and DoH configuration",
      ],
    },
    null,
    2,
  ),
);
if (checks.some((c) => !c.ok)) process.exitCode = 1;
