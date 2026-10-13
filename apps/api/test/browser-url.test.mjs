import test from "node:test";
import assert from "node:assert/strict";
import { browserTargetUrl } from "../../mobile/lib/browser-url.ts";
test("browser URLs do not unwrap a website's url query into a spoofed address", () => {
  const base = "https://controller.example.invalid";
  const site =
    "https://actual.example.invalid/?url=https%3A%2F%2Fbank.example.invalid";
  assert.equal(browserTargetUrl(site, base), site);
  assert.equal(
    browserTargetUrl(`${base}/unrelated?url=hidden`, base),
    `${base}/unrelated?url=hidden`,
  );
  assert.equal(
    browserTargetUrl(`${base}/api/proxy?url=${encodeURIComponent(site)}`, base),
    site,
  );
});

test("legacy account configuration has a stable browser identity without timestamp regeneration", async () => {
  const { profileConfig } = await import("../src/browser/service.ts");
  const profile = await profileConfig(
    {
      id: "aaaaaaaaaaaaaaaaaaaaaaaa",
      proxyUrl: "http://proxy.example.invalid:8080",
    },
    "111111111111111111111111",
  );
  assert.equal(profile.accountRevision, "missing");
  assert.equal(profile.userAgent, "Browser-Proxy/1.0");
  assert.equal(profile.timezone, "UTC");
});
