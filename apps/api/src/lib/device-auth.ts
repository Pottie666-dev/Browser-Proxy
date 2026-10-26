import type { RequestHandler } from "express";
import { bearer } from "./auth";
import { DeviceModel } from "./device-model";
import { UserModel } from "./auth-model";
import { HttpError, tokenHash } from "./security";
import { connectMongo } from "./mongo";
export const requireDevice: RequestHandler = async (req, res, next) => {
  await connectMongo();
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
};
