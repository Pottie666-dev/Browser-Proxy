import { Router } from "express";
import { z } from "zod";
import { rateLimit } from "express-rate-limit";
import { requireAuth, ownerFilter, audit } from "../lib/auth";
import { AccountModel } from "../lib/account-model";
import { memoryAccounts } from "./accounts";
import { memoryMode, revealAccount, HttpError } from "../lib/security";
import { browserEngine, profileConfig } from "../browser/service";

const router = Router({ mergeParams: true });
router.use(requireAuth);
router.use(
  rateLimit({
    windowMs: 60000,
    limit: 600,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  }),
);
router.use(async (req, res, next) => {
  try {
    const id = String((req.params as Record<string, string>).id);
    const account: any = memoryMode()
      ? memoryAccounts.get(id)
      : await AccountModel.findOne(ownerFilter(id, res.locals.userId)).lean();
    if (!account || String(account.ownerId) !== res.locals.userId)
      throw new HttpError(404, "Not found");
    res.locals.account = revealAccount(account);
    next();
  } catch (error) {
    next(error);
  }
});
const command = z
  .object({
    action: z.enum([
      "navigate",
      "new-tab",
      "switch-tab",
      "close-tab",
      "back",
      "forward",
      "reload",
      "stop",
      "tap",
      "scroll",
      "type",
      "key",
      "bookmark",
      "remove-bookmark",
      "clear-page",
      "upload",
    ]),
    tabId: z.string().uuid().optional(),
    url: z.string().max(8192).optional(),
    text: z.string().max(50000).optional(),
    x: z.number().min(0).max(390).optional(),
    y: z.number().min(0).max(740).optional(),
    deltaY: z.number().min(-10000).max(10000).optional(),
    name: z.string().max(150).optional(),
    mimeType: z.string().max(100).optional(),
    base64: z
      .string()
      .max(4 * 1024 * 1024)
      .optional(),
  })
  .strict()
  .superRefine((c, ctx) => {
    const required: Record<string, string[]> = {
      navigate: ["url"],
      "switch-tab": ["tabId"],
      "close-tab": ["tabId"],
      tap: ["x", "y"],
      scroll: ["deltaY"],
      type: ["text"],
      key: ["text"],
      "remove-bookmark": ["url"],
      upload: ["name", "mimeType", "base64"],
    };
    for (const key of required[c.action] ?? [])
      if ((c as any)[key] === undefined)
        ctx.addIssue({ code: "custom", message: `Missing ${key}` });
  });
router.get("/", async (_req, res, next) => {
  try {
    res.json(
      await browserEngine().run(
        await profileConfig(res.locals.account, res.locals.userId),
      ),
    );
  } catch (e) {
    next(e);
  }
});
router.post("/commands", async (req, res, next) => {
  try {
    const input = command.parse(req.body);
    res.json(
      await browserEngine().run(
        await profileConfig(res.locals.account, res.locals.userId),
        input,
      ),
    );
    await audit(
      res.locals.userId,
      `browser.${input.action}`,
      String((req.params as Record<string, string>).id),
    );
  } catch (error: any) {
    next(
      error?.name === "TimeoutError" || error?.message?.startsWith("page.goto")
        ? new HttpError(
            502,
            "Browser navigation failed; no direct fallback is permitted",
          )
        : error,
    );
  }
});
router.get("/frame", async (_req, res, next) => {
  try {
    res
      .type("jpeg")
      .send(
        await browserEngine().frame(
          await profileConfig(res.locals.account, res.locals.userId),
        ),
      );
  } catch (e) {
    next(e);
  }
});
router.post("/verify-egress", async (_req, res, next) => {
  try {
    const endpoint = process.env.BROWSER_IP_CHECK_URL;
    if (!endpoint)
      throw new HttpError(
        503,
        "Configure a trusted public-IP verification endpoint",
      );
    res.json(
      await browserEngine().verify(
        await profileConfig(res.locals.account, res.locals.userId),
        endpoint,
      ),
    );
  } catch (e) {
    next(e);
  }
});
router.delete("/session", async (req, res, next) => {
  try {
    await browserEngine().close(
      res.locals.userId,
      String((req.params as Record<string, string>).id),
    );
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});
router.delete("/profile", async (req, res, next) => {
  try {
    await browserEngine().reset(
      res.locals.userId,
      String((req.params as Record<string, string>).id),
    );
    await audit(
      res.locals.userId,
      "browser.reset",
      String((req.params as Record<string, string>).id),
    );
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});
router.get("/downloads/:downloadId", async (req, res, next) => {
  try {
    const file = await browserEngine().download(
      res.locals.userId,
      String((req.params as Record<string, string>).id),
      String(req.params.downloadId),
    );
    res.attachment(file.name).send(file.buffer);
  } catch (e: any) {
    next(e.code === "ENOENT" ? new HttpError(404, "Download not found") : e);
  }
});
export default router;
