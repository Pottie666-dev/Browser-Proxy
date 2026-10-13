import assert from "node:assert/strict";
import { test } from "node:test";
import { randomBytes } from "node:crypto";
import {
  encrypt,
  decrypt,
  hashPassword,
  verifyPassword,
  tokenHash,
  validateSecurityConfig,
} from "../src/lib/security.ts";
import {
  publicAddress,
  resolveTarget,
  pinnedLookup,
  fetchPublic,
} from "../src/lib/outbound.ts";

process.env.ACCOUNT_ENCRYPTION_KEY = randomBytes(32).toString("base64");
test("AES-GCM uses random nonces, authenticates data and binds it to an owner/record", () => {
  const context = "account:alice:record:password";
  const first = encrypt("synthetic-private-value", context),
    second = encrypt("synthetic-private-value", context);
  assert.notEqual(first, second);
  assert.ok(!first.includes("synthetic-private-value"));
  assert.equal(decrypt(first, context), "synthetic-private-value");
  assert.throws(() => decrypt(first, "account:bob:record:password"));
  const parts = first.split(":");
  parts[3] = randomBytes(16).toString("base64url");
  assert.throws(() => decrypt(parts.join(":"), context));
  assert.throws(() => decrypt("legacy-plaintext", context));
});
test("scrypt hashes are salted and tokens are stored by digest", async () => {
  const first = await hashPassword("Synthetic-Password-Value"),
    second = await hashPassword("Synthetic-Password-Value");
  assert.notEqual(first, second);
  assert.ok(await verifyPassword("Synthetic-Password-Value", first));
  assert.equal(await verifyPassword("wrong-password", first), false);
  assert.notEqual(tokenHash("synthetic-token"), "synthetic-token");
});
test("production cannot start with volatile storage or invalid encryption configuration", () => {
  const previous = {
    NODE_ENV: process.env.NODE_ENV,
    MONGODB_URI: process.env.MONGODB_URI,
    ACCOUNT_ENCRYPTION_KEY: process.env.ACCOUNT_ENCRYPTION_KEY,
    PUBLIC_API_ORIGIN: process.env.PUBLIC_API_ORIGIN,
  };
  try {
    process.env.NODE_ENV = "production";
    process.env.PUBLIC_API_ORIGIN = "https://fixture.example.invalid";
    delete process.env.MONGODB_URI;
    assert.throws(validateSecurityConfig, /MONGODB_URI/);
    process.env.MONGODB_URI = "mongodb://127.0.0.1/test";
    process.env.ACCOUNT_ENCRYPTION_KEY = "invalid";
    assert.throws(validateSecurityConfig);
  } finally {
    for (const [name, value] of Object.entries(previous))
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
  }
});
test("private, loopback, mapped IPv6, metadata, multicast and reserved addresses are blocked", () => {
  for (const address of [
    "127.0.0.1",
    "0.0.0.0",
    "10.1.2.3",
    "172.16.0.1",
    "192.168.0.1",
    "169.254.169.254",
    "100.64.0.1",
    "224.0.0.1",
    "::1",
    "::ffff:127.0.0.1",
    "fe80::1",
    "fc00::1",
    "ff02::1",
    "203.0.113.1",
  ])
    assert.equal(publicAddress(address), false, address);
  assert.equal(publicAddress("8.8.8.8"), true);
});
test("target validation rejects URL credentials, schemes, private IP encodings and unsafe ports", async () => {
  for (const target of [
    "file:///etc/passwd",
    "http://user:password@example.com",
    "http://127.1",
    "http://2130706433",
    "http://[::ffff:127.0.0.1]",
    "http://169.254.169.254",
    "http://8.8.8.8:22",
  ])
    await assert.rejects(() => resolveTarget(target));
});

test("connection lookup stays pinned to the vetted address despite later DNS changes", () => {
  const lookup = pinnedLookup({ address: "8.8.8.8", family: 4 });
  lookup("attacker-changed-host.example", {}, (error, address, family) => {
    assert.equal(error, null);
    assert.equal(address, "8.8.8.8");
    assert.equal(family, 4);
  });
  lookup("127.0.0.1", { all: true }, (error, addresses) => {
    assert.equal(error, null);
    assert.deepEqual(addresses, [{ address: "8.8.8.8", family: 4 }]);
  });
});

test(
  "configured egress fails closed before resolving an attacker-controlled DNS name",
  { skip: !(process.env.HTTPS_PROXY || process.env.HTTP_PROXY) },
  async () => {
    // Existing proxy settings are preserved. No request or DNS lookup is sent.
    await assert.rejects(
      () =>
        fetchPublic("https://nonexistent-egress-fixture.invalid", "Fixture"),
      (error) => error.status === 503,
    );
  },
);
