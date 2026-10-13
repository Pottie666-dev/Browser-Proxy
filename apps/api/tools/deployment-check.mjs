#!/usr/bin/env node
import { createRequire } from "node:module";
import {
  existsSync,
  mkdirSync,
  realpathSync,
  writeFileSync,
  unlinkSync,
  statSync,
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
try {
  const mongoose = require("mongoose");
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
