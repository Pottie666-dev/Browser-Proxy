import { test } from "node:test";
import assert from "node:assert/strict";
import { validatePublicApiOrigin } from "../../mobile/lib/api-origin.ts";
test("carrier-ready origins require HTTPS public hostnames and cannot embed credentials", () => {
  assert.equal(
    validatePublicApiOrigin(" https://api.example.com:8443/ "),
    "https://api.example.com:8443",
  );
  for (const origin of [
    "http://api.example.com",
    "https://localhost",
    "https://192.168.1.2",
    "https://device.local",
    "https://api.example.invalid",
    "https://user:secret@api.example.com",
    "https://api.example.com/path",
    "https://api.example.com?x=token",
    "https://[::1]",
  ])
    assert.throws(() => validatePublicApiOrigin(origin));
});
