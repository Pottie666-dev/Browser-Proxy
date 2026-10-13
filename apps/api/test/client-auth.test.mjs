import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  customFetch,
  setAuthTokenGetter,
  setAuthFailureHandler,
  setBaseUrl,
} from "../../../packages/api-client-react/src/custom-fetch.ts";

const original = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = original;
  setBaseUrl(null);
  setAuthTokenGetter(null);
  setAuthFailureHandler(null);
});
test("automatic bearer credentials are confined to the configured API origin", async () => {
  setBaseUrl("https://api.example.invalid");
  setAuthTokenGetter(() => "synthetic-token");
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), headers: options.headers });
    return new Response("{}", {
      headers: { "content-type": "application/json" },
    });
  };
  await customFetch("/api/accounts");
  await customFetch("https://third-party.example.invalid/fixture");
  assert.equal(calls[0].headers.get("authorization"), "Bearer synthetic-token");
  assert.equal(calls[1].headers.get("authorization"), null);
});
test("protocol-relative third-party URLs never receive automatic credentials", async () => {
  setAuthTokenGetter(() => "synthetic-token");
  globalThis.fetch = async (_url, options) => {
    assert.equal(options.headers.get("authorization"), null);
    return new Response("{}");
  };
  await customFetch("//third-party.example.invalid/fixture");
});
test("API unauthorized responses notify the authentication provider", async () => {
  let notified = false;
  setAuthFailureHandler(() => {
    notified = true;
  });
  globalThis.fetch = async () =>
    new Response('{"error":"Authentication required"}', {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  await assert.rejects(
    () => customFetch("/api/accounts"),
    (error) => error.status === 401,
  );
  assert.equal(notified, true);
});

test("an unrelated site's 401 cannot invalidate the API session", async () => {
  setBaseUrl("https://api.example.invalid");
  let notified = false;
  setAuthFailureHandler(() => {
    notified = true;
  });
  globalThis.fetch = async () => new Response("{}", { status: 401 });
  await assert.rejects(() =>
    customFetch("https://third-party.example.invalid"),
  );
  assert.equal(notified, false);
});
