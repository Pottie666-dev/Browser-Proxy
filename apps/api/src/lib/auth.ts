import type { RequestHandler, Request } from "express";
import mongoose from "mongoose";
import { connectMongo } from "./mongo";
import {
  UserModel,
  SessionModel,
  BrowserGrantModel,
  AuditModel,
} from "./auth-model";
import { HttpError, memoryMode, randomToken, tokenHash } from "./security";

export const memoryUsers = new Map<string, any>();
export const memorySessions = new Map<string, any>();
export const memoryGrants = new Map<string, any>();
export async function audit(userId: string, action: string, targetId?: string) {
  if (!memoryMode()) await AuditModel.create({ userId, action, targetId });
}
export function ownerFilter(id: string, ownerId: string) {
  if (!mongoose.isValidObjectId(id)) throw new HttpError(404, "Not found");
  return { _id: id, ownerId };
}
export function bearer(req: Request): string | null {
  const value = req.headers.authorization;
  return typeof value === "string" && /^Bearer [A-Za-z0-9_-]{43}$/.test(value)
    ? value.slice(7)
    : null;
}
export async function sessionFor(token: string) {
  return sessionByHash(tokenHash(token));
}
export async function sessionByHash(hash: string) {
  let session: any;
  if (memoryMode()) session = memorySessions.get(hash);
  else {
    await connectMongo();
    session = await SessionModel.findOne({
      accessHash: hash,
      expiresAt: { $gt: new Date() },
    }).lean();
  }
  if (!session || session.expiresAt <= new Date()) return null;
  const user = memoryMode()
    ? memoryUsers.get(session.userId)
    : await UserModel.findById(session.userId).lean();
  return user && !(user as any).disabled ? session : null;
}

export const requireAuth: RequestHandler = async (req, res, next) => {
  try {
    const token = bearer(req);
    const session: any = token && (await sessionFor(token));
    if (!session) throw new HttpError(401, "Authentication required");
    res.locals.userId = session.userId;
    res.locals.session = session;
    next();
  } catch (error) {
    next(error);
  }
};
export async function newSession(userId: string) {
  const user = memoryMode()
    ? memoryUsers.get(userId)
    : await UserModel.findById(userId).lean();
  if (!user || (user as any).disabled)
    throw new HttpError(401, "Authentication required");
  const accessToken = randomToken(),
    refreshToken = randomToken();
  const expiresAt = new Date(Date.now() + 15 * 60000),
    refreshExpiresAt = new Date(Date.now() + 7 * 86400000);
  const row = {
    userId,
    accessHash: tokenHash(accessToken),
    refreshHash: tokenHash(refreshToken),
    expiresAt,
    refreshExpiresAt,
  };
  if (memoryMode()) memorySessions.set(row.accessHash, row);
  else await SessionModel.create(row);
  return {
    accessToken,
    refreshToken,
    expiresAt: expiresAt.toISOString(),
    userId,
  };
}
export async function rotateSession(refreshToken: string) {
  const hash = tokenHash(refreshToken),
    now = new Date();
  let old: any;
  if (memoryMode()) {
    old = [...memorySessions.values()].find(
      (s) => s.refreshHash === hash && s.refreshExpiresAt > now,
    );
    if (old) memorySessions.delete(old.accessHash);
  } else
    old = await SessionModel.findOneAndDelete({
      refreshHash: hash,
      refreshExpiresAt: { $gt: now },
    }).lean();
  if (!old) throw new HttpError(401, "Invalid or expired refresh token");
  return newSession(old.userId);
}
export async function revokeSession(hash: string) {
  if (memoryMode()) memorySessions.delete(hash);
  else await SessionModel.deleteOne({ accessHash: hash });
}
export async function createBrowserGrant(
  userId: string,
  accountId: string,
  sessionHash: string,
) {
  const token = randomToken();
  const grant = {
    userId,
    accountId,
    sessionHash,
    hash: tokenHash(token),
    expiresAt: new Date(Date.now() + 2 * 60000),
  };
  if (memoryMode()) memoryGrants.set(grant.hash, grant);
  else await BrowserGrantModel.create(grant);
  return token;
}
export async function consumeBrowserGrant(
  token: string,
  accountId: string,
): Promise<any> {
  const hash = tokenHash(token);
  let grant: any;
  if (memoryMode()) {
    grant = memoryGrants.get(hash);
    if (grant?.accountId === accountId && grant.expiresAt > new Date())
      memoryGrants.delete(hash);
    else grant = null;
  } else
    grant = await BrowserGrantModel.findOneAndDelete({
      hash,
      accountId,
      expiresAt: { $gt: new Date() },
    }).lean();
  if (!grant) throw new HttpError(401, "Invalid or expired browser grant");
  return grant;
}
