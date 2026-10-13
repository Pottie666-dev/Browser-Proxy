import mongoose from "mongoose";
import { AccountModel } from "./account-model";
import { DeviceModel } from "./device-model";
import { ownerFilter } from "./auth";
import { HttpError } from "./security";
async function transaction<T>(
  operation: (session: mongoose.ClientSession) => Promise<T>,
): Promise<T> {
  try {
    return await mongoose.connection.transaction(operation, {
      readConcern: { level: "snapshot" },
      writeConcern: { w: "majority" },
    });
  } catch (error: any) {
    if (error.code === 20 || error.codeName === "IllegalOperation")
      throw new HttpError(
        503,
        "Device/account consistency requires a MongoDB replica set",
      );
    if (error.code === 11000)
      throw new HttpError(409, "Account already assigned");
    throw error;
  }
}
export async function assignDevice(
  id: string,
  ownerId: string,
  accountId: string | null,
) {
  const filter = ownerFilter(id, ownerId);
  return transaction(async (session) => {
    // A write to the target account makes concurrent deletion conflict and retry.
    if (
      accountId !== null &&
      !(await AccountModel.findOneAndUpdate(
        ownerFilter(accountId, ownerId),
        { $inc: { deviceAssignmentRevision: 1 } },
        { session },
      ))
    )
      throw new HttpError(404, "Account not found");
    const device = await DeviceModel.findOneAndUpdate(
      { ...filter, revokedAt: { $exists: false } },
      { $set: { accountId } },
      { session, new: true },
    );
    if (!device) throw new HttpError(404, "Device not found");
    return device;
  });
}
export async function deleteAccountConsistently(id: string, ownerId: string) {
  return transaction(async (session) => {
    if (
      !(await AccountModel.findOneAndDelete(ownerFilter(id, ownerId), {
        session,
      }))
    )
      throw new HttpError(404, "Account not found");
    await DeviceModel.updateMany(
      { ownerId, accountId: id },
      { $set: { accountId: null } },
      { session },
    );
  });
}
