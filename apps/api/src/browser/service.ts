import { BrowserEngine, inheritedProxy, type ProfileConfig } from "./engine";
import { proxyFromUrl } from "./egress";
import { AccountModel } from "../lib/account-model";
import { ProxyModel } from "../lib/proxy-model";
import { decrypt, HttpError } from "../lib/security";
import path from "node:path";

const revision = (value: unknown) =>
  value == null ? "missing" : new Date(value as string).toISOString();
const changing = new Set<string>();
const accountKey = (owner: string, account: string) =>
  `${owner}:${account.toLowerCase()}`;
export function beginBrowserChange(owner: string, account: string) {
  const key = accountKey(owner, account);
  if (changing.has(key))
    throw new HttpError(409, "Account browser configuration is changing");
  changing.add(key);
  return () => changing.delete(key);
}
async function validateLiveConfiguration(config: ProfileConfig) {
  if (changing.has(accountKey(config.ownerId, config.accountId)))
    throw new HttpError(503, "Account browser configuration is changing");
  const current: any = await AccountModel.findOne({
    _id: config.accountId,
    ownerId: config.ownerId,
  })
    .select("updatedAt")
    .lean();
  if (!current) throw new HttpError(404, "Not found");
  if (revision(current.updatedAt) !== config.accountRevision)
    throw new HttpError(409, "Reload the updated account configuration");
  if (config.proxyId) {
    const record: any = await ProxyModel.findOne({
      _id: config.proxyId,
      ownerId: config.ownerId,
      enabled: true,
    })
      .select("updatedAt")
      .lean();
    if (!record || revision(record.updatedAt) !== config.proxyRevision)
      throw new HttpError(503, "Required proxy changed or is unavailable");
  }
}
let singleton: BrowserEngine | undefined;
export function browserEngine() {
  if (
    process.env.BROWSER_ENGINE_ENABLED !== "true" ||
    !process.env.BROWSER_PROFILE_ROOT
  )
    throw new HttpError(
      503,
      "Configure the isolated browser worker before browsing",
    );
  if (!path.isAbsolute(process.env.BROWSER_PROFILE_ROOT))
    throw new HttpError(503, "Browser profile root must be absolute");
  return (singleton ??= new BrowserEngine(process.env.BROWSER_PROFILE_ROOT, {
    maxActive: Number(process.env.BROWSER_MAX_ACTIVE || 3),
    validate: validateLiveConfiguration,
  }));
}
export async function profileConfig(
  account: Record<string, any>,
  ownerId: string,
): Promise<ProfileConfig> {
  if (changing.has(accountKey(ownerId, String(account.id ?? account._id))))
    throw new HttpError(503, "Account browser configuration is changing");
  let proxy = inheritedProxy();
  let proxyRevision: string | undefined;
  if (account.proxyId) {
    const record: any = await ProxyModel.findOne({
      _id: account.proxyId,
      ownerId,
    }).lean();
    if (!record?.enabled)
      throw new HttpError(503, "Required account proxy is missing or disabled");
    if (!["http", "https"].includes(record.type))
      throw new HttpError(
        503,
        "SOCKS transport is not yet supported; direct fallback is disabled",
      );
    proxyRevision = revision(record.updatedAt);
    proxy = {
      protocol: `${record.type}:` as "http:" | "https:",
      host: record.host,
      port: record.port,
      username: record.username
        ? (decrypt(
            record.username,
            `proxy:${ownerId}:${record._id}:username`,
          ) as string)
        : undefined,
      password: record.password
        ? (decrypt(
            record.password,
            `proxy:${ownerId}:${record._id}:password`,
          ) as string)
        : undefined,
    };
  } else if (account.proxyUrl) proxy = proxyFromUrl(account.proxyUrl);
  if (!proxy && process.env.BROWSER_ALLOW_DIRECT !== "true")
    throw new HttpError(
      503,
      "No egress proxy is configured; direct browsing requires an explicit operator setting",
    );
  const locale = String(
    account.fingerprint?.locale ??
      account.fingerprint?.navigator?.language ??
      account.fingerprint?.language ??
      "en-US",
  );
  const timezone = String(
    account.timezone ?? account.fingerprint?.timezone ?? "UTC",
  );
  try {
    new Intl.DateTimeFormat(locale, { timeZone: timezone });
  } catch {
    throw new HttpError(400, "Invalid browser locale/timezone");
  }
  return {
    ownerId,
    accountId: String(account.id ?? account._id),
    userAgent: String(account.userAgent ?? "Browser-Proxy/1.0"),
    locale,
    timezone,
    proxy,
    proxyId: account.proxyId ? String(account.proxyId) : undefined,
    proxyRevision,
    accountRevision: revision(account.updatedAt),
    legacyHistory: account.browserState?.history,
  };
}
export async function closeAccountBrowser(owner: string, account: string) {
  await singleton?.close(owner, account);
}
export async function resetAccountBrowser(owner: string, account: string) {
  if (process.env.BROWSER_ENGINE_ENABLED === "true")
    await browserEngine().reset(owner, account);
}
export async function shutdownBrowsers() {
  await singleton?.shutdown();
}
const timer = setInterval(() => {
  void singleton?.closeIdle().catch(() => {});
}, 60000);
timer.unref();

export async function closeOwnerBrowsers(owner: string) {
  await singleton?.closeOwner(owner);
}
