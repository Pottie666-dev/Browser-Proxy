import mongoose, { Schema, type InferSchemaType } from "mongoose";

const proxySchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    type: { type: String, enum: ["http", "https", "socks5"], default: "https" },
    host: { type: String, required: true, trim: true },
    port: { type: Number, required: true, min: 1, max: 65535 },
    username: { type: String, trim: true },
    password: { type: String },
    region: { type: String, trim: true },
    enabled: { type: Boolean, default: true },
    status: { type: String, enum: ["unchecked", "healthy", "failed"], default: "unchecked" },
    lastCheckedAt: { type: Date },
    lastError: { type: String },
    exitIp: { type: String, trim: true },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      versionKey: false,
      transform(_doc, ret: Record<string, unknown>) {
        ret.id = ret._id?.toString();
        delete ret._id;
        if (ret.password) ret.hasPassword = true;
        delete ret.password;
        return ret;
      },
    },
  },
);

export type ProxyDocument = InferSchemaType<typeof proxySchema>;
export const ProxyModel = mongoose.models.Proxy ?? mongoose.model("Proxy", proxySchema, "proxies");
