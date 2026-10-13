import mongoose, { Schema } from "mongoose";

export const UserModel =
  mongoose.models.User ??
  mongoose.model(
    "User",
    new Schema(
      {
        disabled: { type: Boolean, default: false },
        email: { type: String, required: true, unique: true },
        passwordHash: { type: String, required: true, select: false },
      },
      { timestamps: true },
    ),
    "users",
  );
export const SessionModel =
  mongoose.models.AuthSession ??
  mongoose.model(
    "AuthSession",
    new Schema(
      {
        userId: { type: String, required: true, index: true },
        accessHash: { type: String, required: true, unique: true },
        refreshHash: { type: String, required: true, unique: true },
        expiresAt: { type: Date, required: true },
        refreshExpiresAt: { type: Date, required: true, expires: 0 },
      },
      { timestamps: true },
    ),
    "auth_sessions",
  );
export const BrowserGrantModel =
  mongoose.models.BrowserGrant ??
  mongoose.model(
    "BrowserGrant",
    new Schema({
      userId: { type: String, required: true },
      accountId: { type: String, required: true },
      sessionHash: { type: String, required: true },
      hash: { type: String, required: true, unique: true },
      expiresAt: { type: Date, required: true, expires: 0 },
    }),
    "browser_grants",
  );
export const AuditModel =
  mongoose.models.AccessAudit ??
  mongoose.model(
    "AccessAudit",
    new Schema(
      {
        userId: String,
        action: { type: String, required: true },
        targetId: String,
        expiresAt: {
          type: Date,
          default: () => new Date(Date.now() + 90 * 86400000),
          expires: 0,
        },
      },
      { timestamps: true },
    ),
    "access_audit",
  );
