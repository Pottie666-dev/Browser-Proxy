import { Router } from "express";
import { AccountModel } from "../lib/account-model";
import { connectMongo, hasMongoUri } from "../lib/mongo";
import { generateIdentity } from "../lib/identity";

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

async function useMongo(): Promise<boolean> {
  if (!hasMongoUri()) return false;
  await connectMongo();
  return true;
}

router.get("/", async (_req, res, next) => {
  try {
    if (await useMongo()) {
      const accounts = await AccountModel.find({}).sort({ createdAt: -1 }).lean({ virtuals: true });
      res.json(
        accounts.map((account: any) => ({
          ...account,
          id: account._id?.toString?.() ?? account.id,
          _id: undefined,
          __v: undefined,
        })),
      );
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
    const identity = generateIdentity();

    const bodyFingerprint = typeof body.fingerprint === "object" && body.fingerprint ? body.fingerprint as Record<string, unknown> : {};
    const enrichedTimezone = typeof bodyFingerprint.timezone === "string" && bodyFingerprint.timezone
      ? bodyFingerprint.timezone
      : identity.fingerprint.timezone;

    const enrichedBody = {
      ...identity,
      ...body,
      fingerprint: {
        ...identity.fingerprint,
        ...bodyFingerprint,
        timezone: enrichedTimezone,
      },
      timezone: enrichedTimezone,
      name,
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
      name,
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
    const bodyFingerprint = typeof body.fingerprint === "object" && body.fingerprint ? body.fingerprint as Record<string, unknown> : {};
    if (typeof bodyFingerprint.timezone === "string" && bodyFingerprint.timezone) {
      body.timezone = bodyFingerprint.timezone;
    }

    if (await useMongo()) {
      const account = await AccountModel.findByIdAndUpdate(
        req.params.id,
        { $set: body },
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

    const updated: Account = {
      ...existing,
      ...body,
      id: existing.id,
      name: typeof body.name === "string" && body.name ? body.name : existing.name,
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
