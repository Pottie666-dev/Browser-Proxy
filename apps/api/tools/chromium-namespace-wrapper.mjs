#!/usr/bin/env node
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root = process.env.PROFILE_STORAGE_ROOT,
  dir = process.env.PROFILE_NAMESPACE_ROOT;
const chromium = process.env.PROFILE_CHROMIUM_EXECUTABLE;
if (
  !root ||
  !dir ||
  !path.isAbsolute(root) ||
  root === "/" ||
  !dir.startsWith(`${root}/`) ||
  !process.env.PROFILE_GATEWAY_SOCKET ||
  !chromium?.startsWith("/usr/")
) {
  console.error("Missing browser namespace configuration");
  process.exit(1);
}
// No network interface except namespace-local loopback. The only upstream is an owned Unix socket.
// Mount only OS assets, Node, this worker and the current profile. Sibling profiles and API secret files are absent.
const worker = fileURLToPath(
  new URL("./namespace-browser-worker.mjs", import.meta.url),
);
const child = spawn(
  "bwrap",
  [
    "--unshare-net",
    "--unshare-ipc",
    "--unshare-pid",
    "--new-session",
    "--die-with-parent",
    "--ro-bind",
    "/usr",
    "/usr",
    "--ro-bind",
    "/bin",
    "/bin",
    "--ro-bind",
    "/lib",
    "/lib",
    "--ro-bind-try",
    "/lib64",
    "/lib64",
    "--ro-bind-try",
    "/etc/chromium.d",
    "/etc/chromium.d",
    "--ro-bind-try",
    "/etc/fonts",
    "/etc/fonts",
    "--ro-bind-try",
    "/etc/ssl",
    "/etc/ssl",
    "--ro-bind-try",
    "/etc/pki",
    "/etc/pki",
    "--ro-bind-try",
    "/etc/ld.so.cache",
    "/etc/ld.so.cache",
    "--ro-bind-try",
    "/etc/nsswitch.conf",
    "/etc/nsswitch.conf",
    "--ro-bind-try",
    "/etc/passwd",
    "/etc/passwd",
    "--ro-bind-try",
    "/etc/group",
    "/etc/group",
    "--ro-bind-try",
    "/etc/hosts",
    "/etc/hosts",
    "--proc",
    "/proc",
    "--dev",
    "/dev",
    "--tmpfs",
    "/tmp",
    "--bind",
    dir,
    dir,
    "--ro-bind",
    process.execPath,
    process.execPath,
    "--ro-bind",
    worker,
    worker,
    process.execPath,
    worker,
    ...process.argv.slice(2),
  ],
  { stdio: ["inherit", "inherit", "inherit", 3, 4] },
);
child.once("error", () => {
  console.error("Browser network confinement unavailable");
  process.exit(1);
});
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
child.once("exit", (code) => process.exit(code ?? 1));
