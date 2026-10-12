import fs from "node:fs";

const checks = [
  ["Root package", "package.json"],
  ["Mobile app", "apps/mobile/package.json"],
  ["API server", "apps/api/package.json"],
  ["Native isolation abstraction", "apps/mobile/lib/native-isolation.ts"],
  ["Stage 8 docs", "docs/STAGE_8_NATIVE_BROWSER_ISOLATION.md"],
];

let ok = true;

for (const [label, path] of checks) {
  const exists = fs.existsSync(path);
  console.log(`${exists ? "OK" : "MISSING"} ${label}: ${path}`);
  if (!exists) ok = false;
}

console.log("");
console.log("Stage 1: standard WebView is the default browser host.");
console.log("Run pnpm run typecheck, pnpm test, and pnpm run build for runtime/build validation.");
console.log("Stage 2: custom Android host, native isolation, downloads, and permissions remain unverified.");

process.exit(ok ? 0 : 1);
