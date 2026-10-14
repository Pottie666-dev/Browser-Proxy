/** Carrier-network testing requires an explicit public HTTPS origin, never a LAN fallback. */
export function validatePublicApiOrigin(value: string): string {
  const url = new URL(value.trim());
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.pathname !== "/" && url.pathname !== "")
  )
    throw new Error(
      "Enter a public HTTPS API origin without a path or credentials",
    );
  const host = url.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".lan") ||
    host.endsWith(".invalid") ||
    host.startsWith("[") ||
    /^\d+\.\d+\.\d+\.\d+$/.test(host) ||
    !host.includes(".")
  )
    throw new Error(
      "Use a public DNS hostname with a trusted HTTPS certificate",
    );
  return url.origin;
}
