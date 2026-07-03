import { Router } from "express";
import { AccountModel } from "../lib/account-model";
import { connectMongo, hasMongoUri } from "../lib/mongo";
import { generateIdentity, mergeFingerprint } from "../lib/identity";

type Account = Record<string, unknown> & {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

const router = Router();
const memoryAccounts = new Map<string, Account>();

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function cleanBody(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== "object") return {};
  const input = body as Record<string, unknown>;
  const cleaned: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue;
    if (typeof value === "string") {
      cleaned[key] = value.trim();
      continue;
    }
    cleaned[key] = value;
  }

  return cleaned;
}

function bodyFingerprint(body: Record<string, unknown>): Record<string, unknown> {
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
  return {
    ...account,
    id: account._id?.toString?.() ?? account.id,
    _id: undefined,
    __v: undefined,
  };
}

router.get("/", async (_req, res, next) => {
  try {
    if (await useMongo()) {
      const accounts = await AccountModel.find({}).sort({ updatedAt: -1, createdAt: -1 }).lean();
      res.json(accounts.map(cleanMongoAccount));
      return;
    }

    res.json(Array.from(memoryAccounts.values()));
  } catch (error) {
    next(error);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const body = cleanBody(req.body);
    const name = typeof body.name === "string" && body.name ? body.name : "New Account";

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
      deviceName: typeof body.deviceName === "string" && body.deviceName ? body.deviceName : identity.deviceName,
      fakeIp: typeof body.fakeIp === "string" && body.fakeIp ? body.fakeIp : identity.fakeIp,
      userAgent: typeof body.userAgent === "string" && body.userAgent ? body.userAgent : identity.userAgent,
    };

    if (await useMongo()) {
      const account = await AccountModel.create(enrichedBody);
      res.status(201).json(account.toJSON());
      return;
    }

    const now = new Date().toISOString();
    const account: Account = {
      ...enrichedBody,
      id: makeId(),
      createdAt: now,
      updatedAt: now,
    };
    memoryAccounts.set(account.id, account);
    res.status(201).json(account);
  } catch (error) {
    next(error);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    if (await useMongo()) {
      const account = await AccountModel.findById(req.params.id);
      if (!account) {
        res.status(404).json({ message: "Account not found" });
        return;
      }
      res.json(account.toJSON());
      return;
    }

    const account = memoryAccounts.get(req.params.id);
    if (!account) {
      res.status(404).json({ message: "Account not found" });
      return;
    }
    res.json(account);
  } catch (error) {
    next(error);
  }
});

router.patch("/:id", async (req, res, next) => {
  try {
    const body = cleanBody(req.body);
    const fpPatch = bodyFingerprint(body);

    if (await useMongo()) {
      const existing = await AccountModel.findById(req.params.id);
      if (!existing) {
        res.status(404).json({ message: "Account not found" });
        return;
      }

      const existingObject = existing.toObject() as Record<string, unknown>;
      const mergedFingerprint = mergeFingerprint(existingObject.fingerprint, fpPatch);

      if (requestedTimezone(body)) {
        mergedFingerprint.timezone = requestedTimezone(body);
      }

      const patch = {
        ...body,
        fingerprint: mergedFingerprint,
        timezone: typeof mergedFingerprint.timezone === "string" ? mergedFingerprint.timezone : existingObject.timezone,
      };

      const account = await AccountModel.findByIdAndUpdate(
        req.params.id,
        { $set: patch },
        { new: true, runValidators: true },
      );

      if (!account) {
        res.status(404).json({ message: "Account not found" });
        return;
      }

      res.json(account.toJSON());
      return;
    }

    const existing = memoryAccounts.get(req.params.id);
    if (!existing) {
      res.status(404).json({ message: "Account not found" });
      return;
    }

    const mergedFingerprint = mergeFingerprint(existing.fingerprint, fpPatch);
    if (requestedTimezone(body)) {
      mergedFingerprint.timezone = requestedTimezone(body);
    }

    const updated: Account = {
      ...existing,
      ...body,
      id: existing.id,
      name: typeof body.name === "string" && body.name ? body.name : existing.name,
      fingerprint: mergedFingerprint,
      timezone: typeof mergedFingerprint.timezone === "string" ? mergedFingerprint.timezone : existing.timezone,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
    };
    memoryAccounts.set(updated.id, updated);
    res.json(updated);
  } catch (error) {
    next(error);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    if (await useMongo()) {
      await AccountModel.findByIdAndDelete(req.params.id);
      res.status(204).send();
      return;
    }

    memoryAccounts.delete(req.params.id);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

export default router;
