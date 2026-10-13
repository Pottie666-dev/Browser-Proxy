import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { requireAuth, bearer, ownerFilter, audit } from "../lib/auth";
import { UserModel } from "../lib/auth-model";
import { assignDevice } from "../lib/device-consistency";
import { DeviceModel, PairingModel } from "../lib/device-model";
import { connectMongo } from "../lib/mongo";
import { HttpError, randomToken, tokenHash } from "../lib/security";
export const heartbeatSchema = z
  .object({
    batteryPercent: z.number().int().min(0).max(100).nullable(),
    charging: z.boolean(),
    temperatureC: z.number().min(-30).max(100).nullable(),
    androidVersion: z.string().max(40),
    model: z.string().max(100),
    captureActive: z.boolean(),
    accessibilityEnabled: z.boolean(),
  })
  .strict();
const router = Router();
router.use(async (_req, _res, next) => {
  try {
    await connectMongo();
    await Promise.all([DeviceModel.init(), PairingModel.init()]);
    next();
  } catch (e) {
    next(e);
  }
});
router.use(
  rateLimit({
    windowMs: 60000,
    limit: 60,
    skip: (req) => req.method === "POST" && req.path === "/self/heartbeat",
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: "Too many device requests" },
  }),
);
const publicDevice = (d: any) => ({
  id: String(d._id),
  name: d.name,
  accountId: d.accountId ?? null,
  revoked: !!d.revokedAt,
  online:
    !d.revokedAt &&
    !!d.lastSeenAt &&
    Date.now() - new Date(d.lastSeenAt).getTime() < 90000,
  lastSeenAt: d.lastSeenAt ?? null,
  status: d.status ?? {},
});
router.post("/pairing", requireAuth, async (_req, res) => {
  const code = randomToken();
  const expiresAt = new Date(Date.now() + 5 * 60000);
  await PairingModel.create({
    ownerId: res.locals.userId,
    codeHash: tokenHash(code),
    expiresAt,
  });
  await audit(res.locals.userId, "device.pairing.create");
  res.status(201).json({ code, expiresAt: expiresAt.toISOString() });
});
router.post("/register", async (req, res) => {
  const body = z
    .object({
      code: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
      name: z.string().trim().min(1).max(100),
    })
    .strict()
    .safeParse(req.body);
  if (!body.success) throw new HttpError(400, "Invalid registration");
  const grant: any = await PairingModel.findOneAndDelete({
    codeHash: tokenHash(body.data.code),
    expiresAt: { $gt: new Date() },
  });
  if (!grant) throw new HttpError(401, "Pairing code invalid or expired");
  const owner: any = await UserModel.findById(grant.ownerId);
  if (!owner || owner.disabled) throw new HttpError(401, "Pairing unavailable");
  const token = randomToken(),
    tokenExpiresAt = new Date(Date.now() + 30 * 86400000);
  const d = await DeviceModel.create({
    ownerId: grant.ownerId,
    name: body.data.name,
    tokenHash: tokenHash(token),
    tokenExpiresAt,
  });
  await audit(grant.ownerId, "device.register", String(d._id));
  res.status(201).json({
    device: publicDevice(d),
    token,
    expiresAt: tokenExpiresAt.toISOString(),
  });
});
router.use(
  "/self",
  rateLimit({
    windowMs: 60000,
    limit: 120,
    skipSuccessfulRequests: true,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: "Too many device requests" },
  }),
);
const heartbeatLimit = rateLimit({
  windowMs: 60000,
  limit: 12,
  keyGenerator: (_req, res) => String(res.locals.device._id),
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many device requests" },
});
router.use("/self", async (req, res, next) => {
  try {
    const token = bearer(req);
    const d: any =
      token &&
      (await DeviceModel.findOne({
        tokenHash: tokenHash(token),
        revokedAt: { $exists: false },
        tokenExpiresAt: { $gt: new Date() },
      }));
    if (!d) throw new HttpError(401, "Device authentication required");
    const owner: any = await UserModel.findById(d.ownerId);
    if (!owner || owner.disabled)
      throw new HttpError(401, "Device authentication required");
    res.locals.device = d;
    res.locals.deviceTokenHash = tokenHash(token!);
    next();
  } catch (e) {
    next(e);
  }
});
router.post("/self/heartbeat", heartbeatLimit, async (req, res) => {
  const body = heartbeatSchema.safeParse(req.body);
  if (!body.success) throw new HttpError(400, "Invalid heartbeat");
  const d = await DeviceModel.findOneAndUpdate(
    {
      _id: res.locals.device._id,
      tokenHash: res.locals.deviceTokenHash,
      revokedAt: { $exists: false },
    },
    { $set: { status: body.data, lastSeenAt: new Date() } },
    { new: true },
  );
  if (!d) throw new HttpError(401, "Device revoked");
  res.json(publicDevice(d));
});
router.post("/self/rotate", async (_req, res) => {
  const token = randomToken(),
    expiresAt = new Date(Date.now() + 30 * 86400000);
  const d: any = await DeviceModel.findOneAndUpdate(
    {
      _id: res.locals.device._id,
      tokenHash: res.locals.deviceTokenHash,
      revokedAt: { $exists: false },
    },
    { $set: { tokenHash: tokenHash(token), tokenExpiresAt: expiresAt } },
    { new: true },
  );
  if (!d) throw new HttpError(401, "Token already rotated");
  await audit(d.ownerId, "device.rotate", String(d._id));
  res.json({ token, expiresAt: expiresAt.toISOString() });
});
router.use(requireAuth);
router.get("/", async (_req, res) =>
  res.json(
    (await DeviceModel.find({ ownerId: res.locals.userId })).map(publicDevice),
  ),
);
router.patch("/:id/assignment", async (req, res) => {
  const b = z
    .object({
      accountId: z
        .string()
        .regex(/^[a-fA-F0-9]{24}$/)
        .nullable(),
    })
    .strict()
    .safeParse(req.body);
  if (!b.success)
    throw new HttpError(400, "Invalid assignment: use an account ID or null");
  const d = await assignDevice(
    req.params.id as string,
    res.locals.userId,
    b.data.accountId?.toLowerCase() ?? null,
  );
  await audit(res.locals.userId, "device.assignment", String(d._id));
  res.json(publicDevice(d));
});
router.delete("/:id", async (req, res) => {
  const d = await DeviceModel.findOneAndUpdate(
    ownerFilter(req.params.id as string, res.locals.userId),
    {
      $set: { revokedAt: new Date(), accountId: null },
      $unset: { tokenHash: 1, status: 1 },
    },
    { new: true },
  );
  if (!d) throw new HttpError(404, "Device not found");
  await audit(res.locals.userId, "device.revoke", String(d._id));
  res.status(204).end();
});
export default router;
