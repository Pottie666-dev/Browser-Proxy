import mongoose, { Schema } from "mongoose";
const device = new Schema(
  {
    ownerId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    accountId: { type: String, default: null },
    tokenHash: {
      type: String,
      required: true,
      select: false,
      unique: true,
      sparse: true,
    },
    tokenExpiresAt: { type: Date, required: true },
    revokedAt: Date,
    lastSeenAt: Date,
    status: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
);
device.index(
  { ownerId: 1, accountId: 1 },
  { unique: true, partialFilterExpression: { accountId: { $type: "string" } } },
);
const pairing = new Schema(
  {
    ownerId: { type: String, required: true },
    codeHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);
pairing.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const DeviceModel =
  mongoose.models.CompanionDevice ?? mongoose.model("CompanionDevice", device);
export const PairingModel =
  mongoose.models.DevicePairing ?? mongoose.model("DevicePairing", pairing);
