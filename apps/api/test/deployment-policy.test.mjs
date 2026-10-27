import { test } from "node:test";
import assert from "node:assert/strict";
import { assertDeploymentPolicy } from "../tools/deployment-policy.mjs";
const safe = {
  NODE_ENV: "production",
  HOST: "127.0.0.1",
  BROWSER_ENGINE_ENABLED: "true",
  PUBLIC_API_ORIGIN: "https://api.example.com",
  CORS_ORIGINS: "https://api.example.com",
  ACCOUNT_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
  MONGODB_URI: "mongodb+srv://example.invalid/browserproxy",
  WEBRTC_TURN_SECRET: "synthetic-test-secret-of-at-least-32-characters",
  WEBRTC_TURN_URLS: "turns:turn.example.com:5349?transport=tcp",
};
test("deployment policy accepts explicit TLS production configuration", () =>
  assert.doesNotThrow(() => assertDeploymentPolicy(safe)));
test("deployment preflight rejects unsafe isolation, TLS and public-listener settings", () => {
  for (const change of [
    { NODE_ENV: "test" },
    { HOST: "0.0.0.0" },
    { BROWSER_ALLOW_DIRECT: "true" },
    { ALLOW_IN_MEMORY_DB: "true" },
    { BROWSER_NO_SANDBOX: "true" },
    { BROWSER_NAMESPACE_WRAPPER: "/tmp/custom-wrapper" },
    { NODE_TLS_REJECT_UNAUTHORIZED: "0" },
    { CHROMIUM_FLAGS: "--no-sandbox" },
    { NODE_OPTIONS: "--import /tmp/hook.mjs" },
    { PUBLIC_API_ORIGIN: "http://api.example.com" },
    { CORS_ORIGINS: "*" },
    { MONGODB_URI: "mongodb://localhost/db?tls=false" },
    {
      MONGODB_URI:
        "mongodb+srv://example.invalid/db?tlsAllowInvalidCertificates=true",
    },
    { WEBRTC_TURN_URLS: "turn:turn.example.com:3478?transport=udp" },
    { ACCOUNT_ENCRYPTION_KEY: "bad" },
  ])
    assert.throws(
      () => assertDeploymentPolicy({ ...safe, ...change }),
      JSON.stringify(Object.keys(change)),
    );
});
