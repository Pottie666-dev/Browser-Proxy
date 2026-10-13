import https from "node:https";
import tls from "node:tls";
import { publicAddress, validateTarget, resolveTarget } from "../lib/outbound";
import { HttpError } from "../lib/security";
import type { EgressProxy } from "./egress";
import { openProxyTunnel } from "./egress";

export type DnsPolicy = {
  endpoint: string;
  bootstrapAddress: string;
  testCA?: string;
};
/** Destination DNS is encrypted and sent through the same required account proxy. */
export function proxyDnsResolver(
  proxy: EgressProxy,
  policy: DnsPolicy,
): typeof resolveTarget {
  const endpoint = validateTarget(policy.endpoint);
  if (endpoint.protocol !== "https:" || !publicAddress(policy.bootstrapAddress))
    throw new HttpError(
      503,
      "A public HTTPS DNS endpoint and public bootstrap IP are required",
    );
  if (policy.testCA && process.env.NODE_ENV !== "test")
    throw new Error("Test certificate trust is test-only");
  async function query(host: string, type: "A" | "AAAA") {
    const raw = await openProxyTunnel(proxy, policy.bootstrapAddress, 443);
    const url = new URL(endpoint);
    url.searchParams.set("name", host);
    url.searchParams.set("type", type);
    return new Promise<string[]>((resolve, reject) => {
      const agent = new https.Agent({ keepAlive: false });
      agent.createConnection = (() =>
        tls.connect({
          socket: raw as any,
          servername: endpoint.hostname,
          ...(policy.testCA ? { ca: policy.testCA } : {}),
        })) as typeof agent.createConnection;
      const request = https.get(
        url,
        { agent, headers: { accept: "application/dns-json" } },
        (response) => {
          let body = "";
          response.on("data", (chunk) => {
            body += chunk;
            if (body.length > 65536)
              request.destroy(new Error("DNS response too large"));
          });
          response.on("error", reject);
          response.on("end", () => {
            try {
              if (response.statusCode !== 200) throw new Error("DNS refused");
              const result = JSON.parse(body);
              if (result.Status !== 0) throw new Error("DNS lookup failed");
              resolve(
                (result.Answer ?? [])
                  .filter((r: any) => r.type === (type === "A" ? 1 : 28))
                  .map((r: any) => String(r.data)),
              );
            } catch {
              reject(new HttpError(502, "Proxy-routed DNS failed"));
            }
          });
        },
      );
      request.setTimeout(10000, () =>
        request.destroy(new Error("DNS timeout")),
      );
      request.on("error", () =>
        reject(new HttpError(502, "Proxy-routed DNS failed")),
      );
      request.on("close", () => {
        raw.destroy();
        agent.destroy();
      });
    });
  }
  return async (raw) => {
    const url = validateTarget(raw),
      host = url.hostname.replace(/^\[|\]$/g, "");
    const { isIP } = await import("node:net");
    const addresses = isIP(host)
      ? [host]
      : [...(await query(host, "A")), ...(await query(host, "AAAA"))];
    if (!addresses.length || addresses.some((ip) => !publicAddress(ip)))
      throw new HttpError(
        403,
        "Private, reserved or unresolved DNS destination prohibited",
      );
    return {
      url,
      address: { address: addresses[0]!, family: isIP(addresses[0]!) },
    };
  };
}
export function operatorDnsPolicy(): DnsPolicy {
  if (
    !process.env.BROWSER_DOH_ENDPOINT ||
    !process.env.BROWSER_DOH_BOOTSTRAP_IP
  )
    throw new HttpError(
      503,
      "Proxy browsing requires configured proxy-routed DNS; local DNS fallback is disabled",
    );
  return {
    endpoint: process.env.BROWSER_DOH_ENDPOINT,
    bootstrapAddress: process.env.BROWSER_DOH_BOOTSTRAP_IP,
  };
}
