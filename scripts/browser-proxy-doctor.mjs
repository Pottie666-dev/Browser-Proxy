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
console.log("Stage 8A status:");
console.log("OK JS identity/runtime isolation");
console.log("OK Browser state persistence");
console.log("OK Native isolation abstraction");
console.log("TODO Native Android WebView profile module");
console.log("TODO Custom dev build / prebuild");

process.exit(ok ? 0 : 1);
