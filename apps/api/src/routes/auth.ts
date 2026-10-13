import { closeOwnerBrowsers } from "../browser/service";
import { Router } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import { rateLimit } from "express-rate-limit";
import { connectMongo } from "../lib/mongo";
import { UserModel } from "../lib/auth-model";
import {
  requireAuth,
  memoryUsers,
  newSession,
  rotateSession,
  revokeSession,
  audit,
  createBrowserGrant,
  ownerFilter,
} from "../lib/auth";
import {
  HttpError,
  memoryMode,
  hashPassword,
  verifyPassword,
} from "../lib/security";
import { AccountModel } from "../lib/account-model";
import { memoryAccounts } from "./accounts";

const router = Router();
router.use(
  ["/register", "/login", "/refresh"],
  rateLimit({
    windowMs: 60000,
    limit: 20,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: "Too many authentication attempts" },
  }),
);
const credentials = z
  .object({
    email: z
      .string()
      .email()
      .max(254)
      .transform((v) => v.trim().toLowerCase()),
    password: z.string().min(12).max(128),
  })
  .strict();
router.post("/register", async (req, res, next) => {
  try {
    if (process.env.ALLOW_REGISTRATION !== "true")
      throw new HttpError(403, "Registration is disabled");
    const body = credentials.parse(req.body);
    const id = new mongoose.Types.ObjectId().toString();
    const passwordHash = await hashPassword(body.password);
    if (memoryMode()) {
      if ([...memoryUsers.values()].some((u) => u.email === body.email))
        throw new HttpError(409, "Unable to register this user");
      memoryUsers.set(id, { _id: id, email: body.email, passwordHash });
    } else {
      await connectMongo();
      await UserModel.create({ _id: id, email: body.email, passwordHash });
    }
    await audit(id, "user.register");
    res.status(201).json(await newSession(id));
  } catch (error) {
    next(error);
  }
});
router.post("/login", async (req, res, next) => {
  try {
    const body = credentials.parse(req.body);
    let user: any;
    if (memoryMode())
      user = [...memoryUsers.values()].find((u) => u.email === body.email);
    else {
      await connectMongo();
      user = await UserModel.findOne({ email: body.email })
        .select("+passwordHash")
        .lean();
    }
    // Derive even for an unknown user, reducing email-existence timing signals.
    const valid = await verifyPassword(
      body.password,
      user?.passwordHash ??
        "scrypt:00000000000000000000000000000000:" + "00".repeat(64),
    );
    if (!user || !valid) throw new HttpError(401, "Invalid credentials");
    await audit(String(user._id), "session.login");
    res.json(await newSession(String(user._id)));
  } catch (error) {
    next(error);
  }
});
router.post("/refresh", async (req, res, next) => {
  try {
    const body = z
      .object({ refreshToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/) })
      .strict()
      .parse(req.body);
    res.json(await rotateSession(body.refreshToken));
  } catch (error) {
    next(error);
  }
});
router.post("/logout", requireAuth, async (_req, res, next) => {
  try {
    await revokeSession(res.locals.session.accessHash);
    await closeOwnerBrowsers(res.locals.userId);
    await audit(res.locals.userId, "session.logout");
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});
router.get("/me", requireAuth, (_req, res) => {
  res.json({ id: res.locals.userId });
});
router.post("/browser-grant", requireAuth, async (req, res, next) => {
  try {
    const { accountId } = z
      .object({ accountId: z.string().regex(/^[a-f0-9]{24}$/i) })
      .strict()
      .parse(req.body);
    const userId = res.locals.userId;
    const account = memoryMode()
      ? memoryAccounts.get(accountId)
      : await AccountModel.findOne(ownerFilter(accountId, userId));
    if (!account || account.ownerId !== userId)
      throw new HttpError(404, "Not found");
    res.json({
      grant: await createBrowserGrant(
        userId,
        accountId,
        res.locals.session.accessHash,
      ),
    });
  } catch (error) {
    next(error);
  }
});
export default router;
