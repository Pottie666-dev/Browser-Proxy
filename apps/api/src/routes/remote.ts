import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import {
  requireAuth,
  ownerFilter,
  bearer,
  sessionByHash,
  audit,
} from "../lib/auth";
import { requireDevice } from "../lib/device-auth";
import { DeviceModel } from "../lib/device-model";
import { AccountModel } from "../lib/account-model";
import { RemoteModel } from "../lib/remote-model";
import { connectMongo } from "../lib/mongo";
import { HttpError, tokenHash } from "../lib/security";
import {
  commandSchema,
  signalSchema,
  iceServers,
} from "../lib/remote-protocol";
const router = Router();
router.use(async (_req, _res, next) => {
  try {
    await connectMongo();
    await RemoteModel.init();
    next();
  } catch (e) {
    next(e);
  }
});
router.use(
  rateLimit({
    windowMs: 60000,
    limit: 120,
    skipSuccessfulRequests: true,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  }),
);
router.use((req, res, next) =>
  req.path.startsWith("/self/")
    ? requireDevice(req, res, next)
    : requireAuth(req, res, next),
);
router.use(
  rateLimit({
    windowMs: 60000,
    limit: 600,
    keyGenerator: (_req, res) =>
      res.locals.device
        ? `device:${res.locals.device._id}`
        : `owner:${res.locals.userId}`,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  }),
);
const live = () => ({
  revokedAt: { $exists: false },
  expiresAt: { $gt: new Date() },
});
const view = (s: any, peer: "controller" | "device") => ({
  id: String(s._id),
  expiresAt: new Date(s.expiresAt).toISOString(),
  resolution: s.resolution,
  generation: s.generation,
  signal: s[peer] ?? {},
  iceServers: iceServers(String(s._id), new Date(s.expiresAt)),
});
async function verify(s: any) {
  if (!s || !(await sessionByHash(s.controllerHash)))
    throw new HttpError(410, "Remote session ended");
  const d: any = await DeviceModel.findOne({
    _id: s.deviceId,
    ownerId: s.ownerId,
    accountId: s.accountId,
    revokedAt: { $exists: false },
    tokenExpiresAt: { $gt: new Date() },
  });
  if (!d || !(await AccountModel.exists(ownerFilter(s.accountId, s.ownerId))))
    throw new HttpError(410, "Remote session ended");
  return d;
}

router.post("/self/poll", async (_req, res) => {
  const d = res.locals.device;
  const s: any = await RemoteModel.findOne({
    deviceId: String(d._id),
    ownerId: d.ownerId,
    ...live(),
    controllerSeenAt: { $gt: new Date(Date.now() - 5000) },
  })
    .select("+controllerHash")
    .sort({ _id: -1 });
  if (!s) return res.json({ session: null });
  await verify(s);
  // Atomic claim: commands are never replayed after a lost response or reconnect.
  const claimed: any = await RemoteModel.findOneAndUpdate(
    { _id: s._id, ...live(), generation: s.generation },
    { $set: { commands: [] } },
  );
  if (!claimed) return res.json({ session: null });
  return res.json({
    session: view(s, "controller"),
    commands: (claimed.commands ?? []).filter(
      (c: any) => c.deadline > Date.now(),
    ),
    leaseMs: 4000,
  });
});
router.post("/self/:id/signal", async (req, res) => {
  const signal = signalSchema.parse(req.body);
  const s: any = await RemoteModel.findOne({
    ...ownerFilter(req.params.id as string, res.locals.device.ownerId),
    deviceId: String(res.locals.device._id),
    ...live(),
    controllerSeenAt: { $gt: new Date(Date.now() - 5000) },
  }).select("+controllerHash");
  await verify(s);
  if (s.generation !== signal.generation)
    throw new HttpError(409, "Stale negotiation");
  await RemoteModel.updateOne(
    { _id: s._id, generation: signal.generation, ...live() },
    { $set: { device: signal } },
  );
  res.json({ ok: true });
});

router.post(
  "/",
  rateLimit({
    windowMs: 60000,
    limit: 10,
    keyGenerator: (_req, res) => String(res.locals.userId),
    standardHeaders: "draft-8",
    legacyHeaders: false,
  }),
  async (req, res) => {
    const body = z
      .object({
        deviceId: z.string().regex(/^[a-f0-9]{24}$/),
        resolution: z.union([z.literal(360), z.literal(720), z.literal(1080)]),
      })
      .strict()
      .parse(req.body);
    const d: any = await DeviceModel.findOne({
      ...ownerFilter(body.deviceId, res.locals.userId),
      revokedAt: { $exists: false },
    });
    if (
      !d ||
      !d.accountId ||
      !(await AccountModel.exists(ownerFilter(d.accountId, res.locals.userId)))
    )
      throw new HttpError(404, "Assigned device not found");
    if (
      !d.status?.captureActive ||
      !d.lastSeenAt ||
      Date.now() - d.lastSeenAt.getTime() > 90000
    )
      throw new HttpError(409, "Authorize capture on the Companion first");
    // Device document write serializes concurrent session creation using a Mongo transaction.
    const s: any = await RemoteModel.db.transaction(async (session) => {
      await DeviceModel.updateOne(
        { _id: d._id },
        { $inc: { __v: 1 } },
        { session },
      );
      await RemoteModel.updateMany(
        { deviceId: body.deviceId, ...live() },
        {
          $set: {
            revokedAt: new Date(),
            commands: [],
            controller: {},
            device: {},
          },
        },
        { session },
      );
      const [created] = await RemoteModel.create(
        [
          {
            ownerId: res.locals.userId,
            deviceId: body.deviceId,
            accountId: d.accountId,
            controllerHash: tokenHash(bearer(req)!),
            expiresAt: new Date(Date.now() + 5 * 60000),
            controllerSeenAt: new Date(),
            resolution: body.resolution,
          },
        ],
        { session },
      );
      iceServers(String(created._id), created.expiresAt); // Reject bad deployment configuration before committing.
      return created;
    });
    await audit(res.locals.userId, "remote.create", String(s._id));
    res.status(201).json(view(s, "device"));
  },
);
router.use("/:id", async (req, res, next) => {
  try {
    const s: any = await RemoteModel.findOne({
      ...ownerFilter(req.params.id as string, res.locals.userId),
      controllerHash: tokenHash(bearer(req)!),
      ...live(),
    }).select("+controllerHash");
    res.locals.remote = s;
    res.locals.remoteDevice = await verify(s);
    next();
  } catch (e) {
    next(e);
  }
});
router.post("/:id/poll", async (_req, res) => {
  const s: any = await RemoteModel.findOneAndUpdate(
    { _id: res.locals.remote._id, ...live() },
    { $set: { controllerSeenAt: new Date() } },
    { new: true },
  );
  if (!s) throw new HttpError(410, "Remote session ended");
  res.json(view(s, "device"));
});
router.post("/:id/signal", async (req, res) => {
  const signal = signalSchema.parse(req.body),
    s = res.locals.remote;
  // Full candidate snapshots make retries idempotent; each ICE restart increments generation.
  if (signal.generation < s.generation || signal.generation > s.generation + 1)
    throw new HttpError(409, "Stale negotiation");
  if (signal.generation === s.generation && s.controller?.sdp !== signal.sdp)
    throw new HttpError(409, "Offer changed without restart");
  const updated = await RemoteModel.updateOne(
    { _id: s._id, ...live(), generation: s.generation },
    {
      $set: {
        generation: signal.generation,
        controller: signal,
        ...(signal.generation !== s.generation
          ? { device: {}, commands: [] }
          : {}),
      },
    },
  );
  if (!updated.matchedCount) throw new HttpError(409, "Negotiation changed");
  res.json({ ok: true });
});
router.post("/:id/command", async (req, res) => {
  const command = commandSchema.parse(req.body),
    d = res.locals.remoteDevice;
  if (!d.status?.accessibilityEnabled || !d.status?.captureActive)
    throw new HttpError(
      409,
      "Enable capture and Accessibility on the Companion",
    );
  const s = res.locals.remote;
  if (
    s.controllerSeenAt.getTime() < Date.now() - 5000 ||
    s.device?.generation !== s.generation ||
    !s.generation
  )
    throw new HttpError(409, "Stream not negotiated");
  const result = await RemoteModel.updateOne(
    { _id: s._id, ...live(), "commands.15": { $exists: false } },
    { $push: { commands: { ...command, deadline: Date.now() + 1500 } } },
  );
  if (!result.matchedCount)
    throw new HttpError(409, "Control queue full or session ended");
  res.status(202).json({ queued: true });
});
router.delete("/:id", async (_req, res) => {
  await RemoteModel.updateOne(
    { _id: res.locals.remote._id },
    {
      $set: { revokedAt: new Date(), commands: [], controller: {}, device: {} },
    },
  );
  await audit(
    res.locals.userId,
    "remote.revoke",
    String(res.locals.remote._id),
  );
  res.status(204).end();
});
export default router;
