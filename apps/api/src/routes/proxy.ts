import { Router } from "express";
import { createHmac, timingSafeEqual } from "node:crypto";
import {
  bearer,
  sessionFor,
  sessionByHash,
  consumeBrowserGrant,
  ownerFilter,
} from "../lib/auth";
import { HttpError, memoryMode, revealAccount } from "../lib/security";
import { AccountModel } from "../lib/account-model";
import { memoryAccounts } from "./accounts";
import { fetchPublic } from "../lib/outbound";

const router = Router();
function signature(value: string) {
  return createHmac("sha256", process.env.ACCOUNT_ENCRYPTION_KEY!)
    .update(`browser-cookie:${value}`)
    .digest("base64url");
}
router.get("/", async (req, res, next) => {
  try {
    const id =
      typeof req.query.accountId === "string" ? req.query.accountId : "";
    if (!/^[a-f0-9]{24}$/i.test(id))
      throw new HttpError(400, "A valid accountId is required");
    let userId: string | undefined;
    const token = bearer(req);
    const session: any = token && (await sessionFor(token));
    if (session) userId = session.userId;
    const cookieName = `bp_browser_${id}`;
    if (typeof req.query.grant === "string") {
      const grant = await consumeBrowserGrant(req.query.grant, id);
      if (!(await sessionByHash(grant.sessionHash)))
        throw new HttpError(401, "Browser session was revoked");
      userId = grant.userId;
      const value = Buffer.from(
        JSON.stringify({
          userId,
          accountId: id,
          sessionHash: grant.sessionHash,
          expires: Date.now() + 15 * 60000,
        }),
      ).toString("base64url");
      res.cookie(cookieName, `${value}.${signature(value)}`, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        path: "/api/proxy",
        maxAge: 15 * 60000,
      });
    }
    if (!userId) {
      const raw = String(req.headers.cookie ?? "")
        .split(";")
        .map((v) => v.trim())
        .find((v) => v.startsWith(`${cookieName}=`))
        ?.slice(cookieName.length + 1);
      if (raw) {
        const [value, sig] = raw.split(".");
        const expected = Buffer.from(signature(value ?? ""));
        const actual = Buffer.from(sig ?? "");
        if (
          expected.length === actual.length &&
          timingSafeEqual(expected, actual)
        ) {
          const parsed = JSON.parse(
            Buffer.from(value!, "base64url").toString(),
          );
          const active: any =
            typeof parsed.sessionHash === "string" &&
            (await sessionByHash(parsed.sessionHash));
          if (
            active &&
            active.userId === parsed.userId &&
            parsed.accountId === id &&
            parsed.expires > Date.now()
          )
            userId = parsed.userId;
        }
      }
    }
    if (!userId) throw new HttpError(401, "Authentication required");
    const stored: any = memoryMode()
      ? memoryAccounts.get(id)
      : await AccountModel.findOne(ownerFilter(id, userId)).lean();
    if (!stored || stored.ownerId !== userId)
      throw new HttpError(404, "Not found");
    const account = revealAccount(stored);
    if (account.proxyId || account.proxyUrl)
      throw new HttpError(
        503,
        "Assigned proxy transport is not verified; direct fallback is disabled",
      );
    const target =
      typeof req.query.url === "string" ? req.query.url.trim() : "";
    if (!target) throw new HttpError(400, "Missing target URL");
    const upstream = await fetchPublic(
      /^https?:\/\//.test(target) ? target : `https://${target}`,
      String(account.userAgent ?? "Browser-Proxy"),
    );
    res.removeHeader("content-security-policy");
    res.setHeader("referrer-policy", "no-referrer");
    res.status(upstream.status).type(upstream.contentType).send(upstream.body);
  } catch (error) {
    next(error);
  }
});
export default router;
