import { lookup } from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import ipaddr from "ipaddr.js";
import { HttpError } from "./security";

export function publicAddress(address: string): boolean {
  try {
    return ipaddr.process(address).range() === "unicast";
  } catch {
    return false;
  }
}
export function validateTarget(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new HttpError(400, "Invalid target URL");
  }
  if (
    !["https:", "http:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    (url.port && !["80", "443"].includes(url.port))
  )
    throw new HttpError(400, "Unsupported target URL");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (ipaddr.isValid(host) && !publicAddress(host))
    throw new HttpError(
      403,
      "Private or reserved network targets are prohibited",
    );
  return url;
}
export async function resolveTarget(raw: string) {
  const url = validateTarget(raw);
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = await lookup(host, { all: true, verbatim: true }).catch(
    () => {
      throw new HttpError(502, "Target could not be resolved");
    },
  );
  if (!addresses.length || addresses.some((a) => !publicAddress(a.address)))
    throw new HttpError(
      403,
      "Private or reserved network targets are prohibited",
    );
  return { url, address: addresses[0]! };
}
export function pinnedLookup(address: { address: string; family: number }) {
  return (
    _host: string,
    options: unknown,
    callback: (...args: any[]) => void,
  ) => {
    if ((options as { all?: boolean }).all) callback(null, [address]);
    else callback(null, address.address, address.family);
  };
}
/** Pin the vetted address at connect time. Revalidate every redirect. */
export async function fetchPublic(
  raw: string,
  userAgent: string,
  redirects = 0,
): Promise<{ status: number; contentType: string; body: Buffer }> {
  if (redirects > 5) throw new HttpError(502, "Too many redirects");
  validateTarget(raw);
  // Never bypass an inherited proxy; its verified transport is a Stage 3 task.
  if (process.env.HTTPS_PROXY || process.env.HTTP_PROXY)
    throw new HttpError(
      503,
      "Configured egress requires a verified proxy transport; direct fallback is disabled",
    );
  const { url, address } = await resolveTarget(raw);
  return new Promise((resolve, reject) => {
    const client = url.protocol === "https:" ? https : http;
    const request = client.request(
      url,
      {
        method: "GET",
        headers: {
          "user-agent": userAgent,
          accept: "text/html,application/xhtml+xml,*/*",
        },
        lookup: pinnedLookup(address),
      },
      (response) => {
        if (
          response.statusCode &&
          response.statusCode >= 300 &&
          response.statusCode < 400 &&
          response.headers.location
        ) {
          response.resume();
          let next: string;
          try {
            next = new URL(response.headers.location, url).toString();
          } catch {
            reject(new HttpError(502, "Invalid redirect"));
            return;
          }
          fetchPublic(next, userAgent, redirects + 1).then(resolve, reject);
          return;
        }
        const parts: Buffer[] = [];
        let size = 0;
        response.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > 15 * 1024 * 1024) {
            response.destroy();
            request.destroy();
            reject(new HttpError(502, "Upstream response too large"));
          } else parts.push(chunk);
        });
        response.on("end", () =>
          resolve({
            status: response.statusCode ?? 502,
            contentType: String(
              response.headers["content-type"] ?? "application/octet-stream",
            ),
            body: Buffer.concat(parts),
          }),
        );
        response.on("error", () =>
          reject(new HttpError(502, "Upstream request failed")),
        );
      },
    );
    const timer = setTimeout(
      () => request.destroy(new Error("timeout")),
      15000,
    );
    request.on("close", () => clearTimeout(timer));
    request.on("error", () =>
      reject(new HttpError(502, "Upstream request failed")),
    );
    request.end();
  });
}
