import {
  closeAccountBrowser,
  resetAccountBrowser,
  beginBrowserChange,
} from "../browser/service";
import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { AccountModel } from "../lib/account-model";
import { connectMongo, hasMongoUri } from "../lib/mongo";
import { generateIdentity, mergeFingerprint } from "../lib/identity";
import { Types } from "mongoose";
import { z } from "zod";
import { ownerFilter, requireAuth, audit } from "../lib/auth";
import {
  HttpError,
  protectAccount,
  revealAccount,
  encrypt,
  decrypt,
  rejectUnsafeKeys,
} from "../lib/security";

type Account = Record<string, unknown> & {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

const router = Router();
export const memoryAccounts = new Map<string, Account>();
router.use(requireAuth);

function makeId(): string {
  return new Types.ObjectId().toString();
}

function cleanBody(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw new HttpError(400, "Account body must be an object");
  const input = body as Record<string, unknown>;
  const cleaned: Record<string, unknown> = {};
  const allowed = new Set([
    "name",
    "surname",
    "username",
    "email",
    "password",
    "walletName",
    "idNumber",
    "cryptoAddress",
    "deviceName",
    "fakeIp",
    "timezone",
    "proxyUrl",
    "proxyId",
    "userAgent",
    "notes",
    "fingerprint",
    "metadata",
    "favorite",
    "tags",
    "image1",
    "image2",
  ]);

  for (const [key, value] of Object.entries(input)) {
    if (!allowed.has(key))
      throw new HttpError(400, "Unsupported account field");
    if (
      [
        "name",
        "surname",
        "username",
        "email",
        "password",
        "walletName",
        "idNumber",
        "cryptoAddress",
        "deviceName",
        "fakeIp",
        "timezone",
        "proxyUrl",
        "userAgent",
        "notes",
        "image1",
        "image2",
      ].includes(key) &&
      value !== null &&
      typeof value !== "string"
    )
      throw new HttpError(400, "Account field has an invalid type");
    if (
      ["name", "deviceName", "userAgent", "fakeIp", "timezone"].includes(key) &&
      (typeof value !== "string" || !value.trim())
    )
      throw new HttpError(
        400,
        "Required account configuration cannot be cleared",
      );
    if (
      typeof value === "string" &&
      value.length > (key.startsWith("image") ? 2 * 1024 * 1024 : 4096)
    )
      throw new HttpError(400, "Account field is too long");
    if (
      key === "proxyId" &&
      value !== null &&
      (typeof value !== "string" || !Types.ObjectId.isValid(value))
    )
      throw new HttpError(400, "Invalid proxy reference");
    if (key === "favorite" && typeof value !== "boolean")
      throw new HttpError(400, "Invalid favorite flag");
    if (key === "tags") z.array(z.string().max(100)).max(100).parse(value);
    if (
      ["fingerprint", "metadata"].includes(key) &&
      (!value || typeof value !== "object" || Array.isArray(value))
    )
      throw new HttpError(400, "Invalid account configuration");
    if (key === "fingerprint") rejectUnsafeKeys(value);
    if (value === undefined) continue;
    if (typeof value === "string") {
      cleaned[key] = key === "password" ? value : value.trim();
      continue;
    }
    cleaned[key] = value;
  }

  return cleaned;
}

function bodyFingerprint(
  body: Record<string, unknown>,
): Record<string, unknown> {
  return body.fingerprint && typeof body.fingerprint === "object"
    ? (body.fingerprint as Record<string, unknown>)
    : {};
}

function requestedTimezone(body: Record<string, unknown>): string | undefined {
  const fp = bodyFingerprint(body);
  if (typeof fp.timezone === "string" && fp.timezone) return fp.timezone;
  if (typeof body.timezone === "string" && body.timezone) return body.timezone;
  return undefined;
}

async function useMongo(): Promise<boolean> {
  if (!hasMongoUri()) return false;
  await connectMongo();
  return true;
}

function cleanMongoAccount(account: any) {
  return revealAccount({
    ...account,
    id: account._id?.toString?.() ?? account.id,
    _id: undefined,
    __v: undefined,
  });
}

router.get("/", async (_req, res, next) => {
  try {
    if (await useMongo()) {
      const accounts = await AccountModel.find({ ownerId: res.locals.userId })
        .sort({ updatedAt: -1, createdAt: -1 })
        .lean();
      res.json(accounts.map(cleanMongoAccount));
      return;
    }

    res.json(
      Array.from(memoryAccounts.values())
        .filter((a) => a.ownerId === res.locals.userId)
        .map((a) => revealAccount(a)),
    );
  } catch (error) {
    next(error);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const body = cleanBody(req.body);
    const name =
      typeof body.name === "string" && body.name ? body.name : "New Account";

    const identity = generateIdentity(requestedTimezone(body));
    const fpPatch = bodyFingerprint(body);
    const fingerprint = {
      ...identity.fingerprint,
      ...fpPatch,
      timezone: requestedTimezone(body) ?? identity.fingerprint.timezone,
    };

    const enrichedBody = {
      ...identity,
      ...body,
      name,
      fingerprint,
      timezone: fingerprint.timezone,
      deviceName:
        typeof body.deviceName === "string" && body.deviceName
          ? body.deviceName
          : identity.deviceName,
      fakeIp:
        typeof body.fakeIp === "string" && body.fakeIp
          ? body.fakeIp
          : identity.fakeIp,
      userAgent:
        typeof body.userAgent === "string" && body.userAgent
          ? body.userAgent
          : identity.userAgent,
    };

    const id = makeId();
    if (body.proxyId) {
      if (!hasMongoUri())
        throw new HttpError(503, "MongoDB is required for proxy assignment");
      const { ProxyModel } = await import("../lib/proxy-model");
      if (
        !(await ProxyModel.exists(
          ownerFilter(String(body.proxyId), res.locals.userId),
        ))
      )
        throw new HttpError(404, "Proxy not found");
    }
    const secured = protectAccount(enrichedBody, res.locals.userId, id);
    if (await useMongo()) {
      const account = await AccountModel.create({
        ...secured,
        _id: id,
        ownerId: res.locals.userId,
      });
      await audit(res.locals.userId, "account.create", id);
      res.status(201).json(revealAccount(account.toJSON()));
      return;
    }

    const now = new Date().toISOString();
    const account: Account = {
      ...secured,
      name,
      ownerId: res.locals.userId,
      id,
      createdAt: now,
      updatedAt: now,
    };
    memoryAccounts.set(account.id, account);
    res.status(201).json(revealAccount(account));
  } catch (error) {
    next(error);
  }
});

router.delete("/:id/browser-state", async (req, res, next) => {
  try {
    const emptyState = {
      cookies: {},
      localStorage: {},
      sessionStorage: {},
      history: [],
      updatedAt: new Date().toISOString(),
    };

    if (await useMongo()) {
      const account = await AccountModel.findOneAndUpdate(
        ownerFilter(req.params.id, res.locals.userId),
        {
          $set: {
            browserState: encrypt(
              emptyState,
              `account:${res.locals.userId}:${req.params.id}:browserState`,
            ),
          },
        },
        { new: true },
      );

      if (!account || (account as any).ownerId !== res.locals.userId) {
        res.status(404).json({ message: "Account not found" });
        return;
      }

      res.json(emptyState);
      return;
    }

    const account = memoryAccounts.get(req.params.id);
    if (!account || (account as any).ownerId !== res.locals.userId) {
      res.status(404).json({ message: "Account not found" });
      return;
    }

    account.browserState = encrypt(
      emptyState,
      `account:${res.locals.userId}:${req.params.id}:browserState`,
    );
    account.updatedAt = new Date().toISOString();
    memoryAccounts.set(account.id, account);
    res.json(emptyState);
  } catch (error) {
    next(error);
  }
});

router.get("/:id/browser-state", async (req, res, next) => {
  try {
    if (await useMongo()) {
      const account = await AccountModel.findOne(
        ownerFilter(req.params.id, res.locals.userId),
      ).lean();
      if (!account || (account as any).ownerId !== res.locals.userId) {
        res.status(404).json({ message: "Account not found" });
        return;
      }

      res.json(
        ((account as any).browserState
          ? decrypt(
              (account as any).browserState,
              `account:${res.locals.userId}:${req.params.id}:browserState`,
            )
          : null) ?? {
          cookies: {},
          localStorage: {},
          sessionStorage: {},
          history: [],
          updatedAt: null,
        },
      );
      return;
    }

    const account = memoryAccounts.get(req.params.id);
    if (!account || (account as any).ownerId !== res.locals.userId) {
      res.status(404).json({ message: "Account not found" });
      return;
    }

    res.json(
      (account.browserState
        ? decrypt(
            account.browserState,
            `account:${res.locals.userId}:${req.params.id}:browserState`,
          )
        : null) ?? {
        cookies: {},
        localStorage: {},
        sessionStorage: {},
        history: [],
        updatedAt: null,
      },
    );
  } catch (error) {
    next(error);
  }
});

router.patch("/:id/browser-state", async (req, res, next) => {
  try {
    const incoming = z
      .object({
        cookies: z.record(z.string().max(100000)).optional(),
        localStorage: z.record(z.string().max(100000)).optional(),
        sessionStorage: z.record(z.string().max(100000)).optional(),
        history: z
          .array(
            z.object({
              url: z.string().max(8192),
              title: z.string().max(4096).optional(),
              at: z.string().max(100),
            }),
          )
          .max(1000)
          .optional(),
        updatedAt: z.string().nullable().optional(),
      })
      .strict()
      .parse(req.body);
    const browserState = {
      cookies:
        incoming.cookies && typeof incoming.cookies === "object"
          ? incoming.cookies
          : {},
      localStorage:
        incoming.localStorage && typeof incoming.localStorage === "object"
          ? incoming.localStorage
          : {},
      sessionStorage:
        incoming.sessionStorage && typeof incoming.sessionStorage === "object"
          ? incoming.sessionStorage
          : {},
      history: Array.isArray(incoming.history)
        ? incoming.history.slice(-250)
        : [],
      updatedAt: new Date().toISOString(),
    };

    if (await useMongo()) {
      const account = await AccountModel.findOneAndUpdate(
        ownerFilter(req.params.id, res.locals.userId),
        {
          $set: {
            browserState: encrypt(
              browserState,
              `account:${res.locals.userId}:${req.params.id}:browserState`,
            ),
          },
        },
        { new: true },
      );

      if (!account || (account as any).ownerId !== res.locals.userId) {
        res.status(404).json({ message: "Account not found" });
        return;
      }

      await audit(res.locals.userId, "browser-state.update", req.params.id);
      res.json(browserState);
      return;
    }

    const account = memoryAccounts.get(req.params.id);
    if (!account || (account as any).ownerId !== res.locals.userId) {
      res.status(404).json({ message: "Account not found" });
      return;
    }

    account.browserState = encrypt(
      browserState,
      `account:${res.locals.userId}:${req.params.id}:browserState`,
    );
    account.updatedAt = new Date().toISOString();
    memoryAccounts.set(account.id, account);
    res.json(browserState);
  } catch (error) {
    next(error);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    if (await useMongo()) {
      const account = await AccountModel.findOne(
        ownerFilter(req.params.id, res.locals.userId),
      );
      if (!account || (account as any).ownerId !== res.locals.userId) {
        res.status(404).json({ message: "Account not found" });
        return;
      }
      await audit(res.locals.userId, "account.access", String(account._id));
      res.json(revealAccount(account.toJSON()));
      return;
    }

    const account = memoryAccounts.get(req.params.id);
    if (!account || (account as any).ownerId !== res.locals.userId) {
      res.status(404).json({ message: "Account not found" });
      return;
    }
    res.json(revealAccount(account));
  } catch (error) {
    next(error);
  }
});

// PUT remains an alias for previously generated clients. Both methods preserve
// unspecified fields and the existing identity profile. PATCH is canonical.
router.route("/:id").patch(updateAccount).put(updateAccount);

async function updateAccount(
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction,
) {
  let release: (() => void) | undefined;
  try {
    const body = cleanBody(req.body);
    const fpPatch = bodyFingerprint(body);
    if (body.proxyId) {
      if (!hasMongoUri())
        throw new HttpError(503, "MongoDB is required for proxy assignment");
      const { ProxyModel } = await import("../lib/proxy-model");
      if (
        !(await ProxyModel.exists(
          ownerFilter(String(body.proxyId), res.locals.userId),
        ))
      )
        throw new HttpError(404, "Proxy not found");
    }

    if (await useMongo()) {
      const existing = await AccountModel.findOne(
        ownerFilter(req.params.id, res.locals.userId),
      );
      if (!existing || existing.ownerId !== res.locals.userId) {
        res.status(404).json({ message: "Account not found" });
        return;
      }

      release = beginBrowserChange(res.locals.userId, req.params.id);
      await closeAccountBrowser(res.locals.userId, req.params.id);
      const existingObject = existing.toObject() as Record<string, unknown>;
      const mergedFingerprint = mergeFingerprint(
        existingObject.fingerprint,
        fpPatch,
      );

      if (requestedTimezone(body)) {
        mergedFingerprint.timezone = requestedTimezone(body);
      }

      const patch = {
        ...protectAccount(body, res.locals.userId, req.params.id),
        fingerprint: mergedFingerprint,
        timezone:
          typeof mergedFingerprint.timezone === "string"
            ? mergedFingerprint.timezone
            : existingObject.timezone,
      };

      const account = await AccountModel.findOneAndUpdate(
        ownerFilter(req.params.id, res.locals.userId),
        { $set: patch },
        { new: true, runValidators: true },
      );

      if (!account || (account as any).ownerId !== res.locals.userId) {
        res.status(404).json({ message: "Account not found" });
        return;
      }

      await audit(res.locals.userId, "account.access", String(account._id));
      res.json(revealAccount(account.toJSON()));
      return;
    }

    const existing = memoryAccounts.get(req.params.id);
    if (!existing || existing.ownerId !== res.locals.userId) {
      res.status(404).json({ message: "Account not found" });
      return;
    }

    release = beginBrowserChange(res.locals.userId, req.params.id);
    await closeAccountBrowser(res.locals.userId, req.params.id);
    const mergedFingerprint = mergeFingerprint(existing.fingerprint, fpPatch);
    if (requestedTimezone(body)) {
      mergedFingerprint.timezone = requestedTimezone(body);
    }

    const updated: Account = {
      ...existing,
      ...protectAccount(body, res.locals.userId, req.params.id),
      id: existing.id,
      name:
        typeof body.name === "string" && body.name ? body.name : existing.name,
      fingerprint: mergedFingerprint,
      timezone:
        typeof mergedFingerprint.timezone === "string"
          ? mergedFingerprint.timezone
          : existing.timezone,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
    };
    memoryAccounts.set(updated.id, updated);
    await audit(res.locals.userId, "account.update", req.params.id);
    res.json(revealAccount(updated));
  } catch (error) {
    next(error);
  } finally {
    release?.();
  }
}

router.delete("/:id", async (req, res, next) => {
  let release: (() => void) | undefined;
  try {
    if (await useMongo()) {
      if (
        !(await AccountModel.exists(
          ownerFilter(req.params.id, res.locals.userId),
        ))
      )
        throw new HttpError(404, "Not found");
      release = beginBrowserChange(res.locals.userId, req.params.id);
      await resetAccountBrowser(res.locals.userId, req.params.id);
      if (
        !(await AccountModel.findOneAndDelete(
          ownerFilter(req.params.id, res.locals.userId),
        ))
      )
        throw new HttpError(404, "Not found");
      await audit(res.locals.userId, "account.delete", req.params.id);
      res.status(204).send();
      return;
    }

    if (memoryAccounts.get(req.params.id)?.ownerId !== res.locals.userId)
      throw new HttpError(404, "Not found");
    release = beginBrowserChange(res.locals.userId, req.params.id);
    await resetAccountBrowser(res.locals.userId, req.params.id);
    memoryAccounts.delete(req.params.id);
    res.status(204).send();
  } catch (error) {
    next(error);
  } finally {
    release?.();
  }
});

export default router;
