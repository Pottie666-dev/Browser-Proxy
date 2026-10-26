import mongoose, { Schema } from "mongoose";
const schema = new Schema({
  ownerId: { type: String, required: true },
  deviceId: { type: String, required: true, index: true },
  accountId: { type: String, required: true },
  controllerHash: { type: String, required: true, select: false },
  expiresAt: { type: Date, required: true },
  controllerSeenAt: { type: Date, required: true },
  revokedAt: Date,
  resolution: { type: Number, required: true },
  generation: { type: Number, default: 0 },
  controller: { type: Schema.Types.Mixed, default: {} },
  device: { type: Schema.Types.Mixed, default: {} },
  commands: { type: [Schema.Types.Mixed], default: [] },
});
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const RemoteModel =
  mongoose.models.RemoteSession ?? mongoose.model("RemoteSession", schema);
