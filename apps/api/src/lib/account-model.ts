import mongoose, { Schema, type InferSchemaType } from "mongoose";

const accountSchema = new Schema(
  {
    ownerId: { type: String, required: true, index: true },
    deviceAssignmentRevision: { type: Number, default: 0, select: false },
    surname: { type: String },
    name: { type: String, required: true, trim: true, default: "New Account" },
    username: { type: String, trim: true },
    email: { type: String, trim: true },
    password: { type: String },
    walletName: { type: String, trim: true },
    idNumber: { type: String, trim: true },
    cryptoAddress: { type: String, trim: true },
    deviceName: { type: String, trim: true },
    fakeIp: { type: String, trim: true },
    timezone: { type: String, trim: true },
    proxyUrl: { type: String, trim: true },
    proxyId: { type: Schema.Types.ObjectId, ref: "Proxy" },
    userAgent: { type: String },
    notes: { type: String },
    fingerprint: { type: Schema.Types.Mixed },
    cookies: { type: Schema.Types.Mixed },
    metadata: { type: Schema.Types.Mixed },
    image1: { type: String },
    image2: { type: String },
    browserState: { type: Schema.Types.Mixed },
    favorite: { type: Boolean, default: false },
    tags: { type: [String], default: [] },
  },
  {
    timestamps: true,
    strict: true,
    toJSON: {
      virtuals: true,
      versionKey: false,
      transform(_doc, ret: Record<string, unknown>) {
        ret.id = ret._id?.toString();
        delete ret._id;
        return ret;
      },
    },
  },
);

export type AccountDocument = InferSchemaType<typeof accountSchema>;

export const AccountModel =
  mongoose.models.Account ??
  mongoose.model("Account", accountSchema, "accounts");
