import http from "node:http";
import net from "node:net";
import tls from "node:tls";
import type { Duplex } from "node:stream";
import { resolveTarget, validateTarget, publicAddress } from "../lib/outbound";
import { HttpError } from "../lib/security";

export type EgressProxy = {
  protocol: "http:" | "https:";
  host: string;
  port: number;
  username?: string;
  password?: string;
  tlsServerName?: string;
};
export type GatewayOptions = {
  proxy?: EgressProxy;
  listenSocket?: string;
  resolve?: typeof resolveTarget;
  dial?: (
    host: string,
    port: number,
    secure: boolean,
    servername?: string,
  ) => Promise<Duplex>;
  onRoute?: (host: string, address: string, viaProxy: boolean) => void;
};
const authority = (host: string, port: number) =>
  `${host.includes(":") ? `[${host}]` : host}:${port}`;
export function proxyFromUrl(raw: string): EgressProxy {
  const url = new URL(raw);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  )
    throw new HttpError(503, "Only HTTP/HTTPS egress proxies are supported");
  return {
    protocol: url.protocol as EgressProxy["protocol"],
    host: url.hostname.replace(/^\[|\]$/g, ""),
    port: Number(url.port || (url.protocol === "https:" ? 443 : 80)),
    username: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
  };
}
export async function validateProxy(
  proxy: EgressProxy,
  trusted: string[] = [],
) {
  if (!Number.isInteger(proxy.port) || proxy.port < 1 || proxy.port > 65535)
    throw new HttpError(503, "Invalid egress proxy");
  // Private upstreams require an explicit operator-owned allowlist, never an account-controlled bypass.
  if (!trusted.includes(authority(proxy.host, proxy.port))) {
    const { lookup } = await import("node:dns/promises");
    const addresses = await lookup(proxy.host, { all: true });
    if (!addresses.length || addresses.some((a) => !publicAddress(a.address)))
      throw new HttpError(503, "Private egress proxy is not operator-approved");
    return { ...proxy, host: addresses[0]!.address, tlsServerName: proxy.host };
  }
  return proxy;
}
function basic(proxy: EgressProxy) {
  return proxy.username || proxy.password
    ? `Basic ${Buffer.from(`${proxy.username ?? ""}:${proxy.password ?? ""}`).toString("base64")}`
    : undefined;
}
const defaultDial = (
  host: string,
  port: number,
  secure: boolean,
  servername?: string,
): Promise<Duplex> =>
  new Promise((resolve, reject) => {
    const socket = secure
      ? tls.connect({
          host,
          port,
          servername: servername ?? (net.isIP(host) ? undefined : host),
        })
      : net.connect({ host, port });
    const timeout = setTimeout(
      () => socket.destroy(new Error("Connection timeout")),
      10000,
    );
    socket.once(secure ? "secureConnect" : "connect", () => {
      clearTimeout(timeout);
      resolve(socket);
    });
    socket.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
async function tunnel(
  dial: NonNullable<GatewayOptions["dial"]>,
  proxy: EgressProxy,
  address: string,
  port: number,
): Promise<Duplex> {
  const socket = await dial(
    proxy.host,
    proxy.port,
    proxy.protocol === "https:",
    proxy.tlsServerName,
  );
  return new Promise((resolve, reject) => {
    let buffer = Buffer.alloc(0);
    const timeout = setTimeout(
      () => socket.destroy(new Error("Proxy handshake timeout")),
      10000,
    );
    const fail = () => {
      clearTimeout(timeout);
      reject(new HttpError(502, "Egress proxy unavailable"));
    };
    socket.once("error", fail);
    socket.once("close", fail);
    const onData = (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);
      if (buffer.length > 16384) {
        socket.destroy();
        fail();
        return;
      }
      const end = buffer.indexOf("\r\n\r\n");
      if (end < 0) return;
      socket.removeListener("data", onData);
      socket.removeListener("error", fail);
      socket.removeListener("close", fail);
      clearTimeout(timeout);
      if (!/^HTTP\/1\.[01] 200\b/.test(buffer.toString("latin1"))) {
        socket.destroy();
        reject(new HttpError(502, "Egress proxy refused connection"));
        return;
      }
      socket.pause();
      if (buffer.length > end + 4) socket.unshift(buffer.subarray(end + 4));
      resolve(socket);
    };
    socket.on("data", onData);
    const auth = basic(proxy);
    socket.write(
      `CONNECT ${authority(address, port)} HTTP/1.1\r\nHost: ${authority(address, port)}\r\n${auth ? `Proxy-Authorization: ${auth}\r\n` : ""}\r\n`,
    );
  });
}
/** All browser HTTP, HTTPS and WSS traffic goes through this profile-local gateway. */
export async function createGateway(options: GatewayOptions = {}) {
  const resolve = options.resolve ?? resolveTarget,
    dial = options.dial ?? defaultDial;
  const sockets = new Set<Duplex>();
  const track = (socket: Duplex) => {
    sockets.add(socket);
    socket.once("error", () => socket.destroy());
    socket.once("close", () => sockets.delete(socket));
    return socket;
  };
  const open = async (raw: string) => {
    validateTarget(raw);
    const target = await resolve(raw);
    if (!publicAddress(target.address.address))
      throw new HttpError(403, "Private destination prohibited");
    const port = Number(
      target.url.port || (target.url.protocol === "https:" ? 443 : 80),
    );
    const socket = track(
      options.proxy
        ? await tunnel(dial, options.proxy, target.address.address, port)
        : await dial(target.address.address, port, false),
    );
    options.onRoute?.(
      target.url.hostname,
      target.address.address,
      Boolean(options.proxy),
    );
    return { socket, url: target.url };
  };
  const server = http.createServer(async (req, res) => {
    let upstream: http.ClientRequest | undefined;
    try {
      if (!req.url?.startsWith("http://"))
        throw new HttpError(400, "Absolute HTTP target required");
      const { socket, url } = await open(req.url);
      const headers: http.IncomingHttpHeaders = {
        ...req.headers,
        host: url.host,
      };
      delete headers["proxy-authorization"];
      delete headers["proxy-connection"];
      // HTTP also uses CONNECT when an upstream proxy is configured; auth never reaches the origin.
      const agent = new http.Agent({ keepAlive: false });
      agent.createConnection = (() => socket) as typeof agent.createConnection;
      upstream = http.request(
        {
          hostname: url.hostname,
          port: url.port || 80,
          path: url.pathname + url.search,
          method: req.method,
          headers,
          agent,
        },
        (response) => {
          const safeHeaders = { ...response.headers };
          delete safeHeaders["proxy-authenticate"];
          res.writeHead(response.statusCode ?? 502, safeHeaders);
          response.pipe(res);
          response.on("error", () => res.destroy());
        },
      );
      upstream.on("error", () => {
        if (!res.headersSent) res.writeHead(502);
        res.end();
      });
      req.on("aborted", () => upstream?.destroy());
      res.on("close", () => {
        upstream?.destroy();
        socket.destroy();
        agent.destroy();
      });
      upstream.setTimeout(120000, () => upstream?.destroy());
      socket.resume();
      req.pipe(upstream);
    } catch (error) {
      res.writeHead(error instanceof HttpError ? error.status : 502);
      res.end("Egress denied or unavailable");
    }
  });
  server.on("connect", async (req, client, head) => {
    try {
      if (!req.url || !/^(\[[a-f0-9:]+\]|[a-z0-9.-]+):(443|80)$/i.test(req.url))
        throw new HttpError(400, "Unsafe CONNECT target");
      const { socket } = await open(`https://${req.url}`);
      client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      if (head.length) socket.write(head);
      client.pipe(socket);
      socket.pipe(client);
      socket.resume();
      client.once("close", () => socket.destroy());
      socket.once("error", () => client.destroy());
      socket.once("close", () => client.destroy());
    } catch {
      client.end(
        "HTTP/1.1 502 Egress unavailable\r\nConnection: close\r\n\r\n",
      );
    }
  });
  server.on("upgrade", async (req, client, head) => {
    try {
      const raw = (req.url ?? "").replace(/^ws:/, "http:");
      if (!raw.startsWith("http://")) throw new Error("Unsupported upgrade");
      const { socket, url } = await open(raw);
      const headers: http.IncomingHttpHeaders = {
        ...req.headers,
        host: url.host,
      };
      delete headers["proxy-authorization"];
      delete headers["proxy-connection"];
      socket.write(
        `${req.method} ${url.pathname}${url.search} HTTP/1.1\r\n${Object.entries(
          headers,
        )
          .map(
            ([key, value]) =>
              `${key}: ${Array.isArray(value) ? value.join(", ") : value}`,
          )
          .join("\r\n")}\r\n\r\n`,
      );
      if (head.length) socket.write(head);
      client.pipe(socket);
      socket.pipe(client);
      socket.resume();
      client.once("close", () => socket.destroy());
      socket.once("error", () => client.destroy());
      socket.once("close", () => client.destroy());
    } catch {
      client.destroy();
    }
  });
  server.on("connection", (socket) => {
    track(socket);
    socket.setTimeout(600000, () => socket.destroy());
  });
  server.on("clientError", (_error, socket) => socket.destroy());
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    if (options.listenSocket) server.listen(options.listenSocket, resolve);
    else server.listen(0, "127.0.0.1", resolve);
  });
  return {
    url: options.listenSocket
      ? "http://127.0.0.1:18080"
      : `http://127.0.0.1:${(server.address() as net.AddressInfo).port}`,
    close: async () => {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

export async function openProxyTunnel(
  proxy: EgressProxy,
  address: string,
  port: number,
) {
  if (!publicAddress(address))
    throw new HttpError(403, "Private tunnel destination prohibited");
  return tunnel(defaultDial, proxy, address, port);
}
