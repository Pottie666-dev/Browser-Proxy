import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scrypt,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { promisify } from "node:util";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export const memoryMode = () =>
  process.env.NODE_ENV === "test" && process.env.ALLOW_IN_MEMORY_DB === "true";
const derive = promisify(scrypt);

function encryptionKey(): Buffer {
  const value = process.env.ACCOUNT_ENCRYPTION_KEY || "";
  const key = /^[a-f0-9]{64}$/i.test(value)
    ? Buffer.from(value, "hex")
    : Buffer.from(value, "base64");
  if (key.length !== 32)
    throw new HttpError(503, "A valid ACCOUNT_ENCRYPTION_KEY is required");
  return key;
}
export function validateSecurityConfig() {
  encryptionKey();
  if (
    process.env.NODE_ENV === "production" &&
    !["127.0.0.1", "::1"].includes(process.env.HOST || "")
  ) {
    if (!process.env.PUBLIC_API_ORIGIN?.startsWith("https://"))
      throw new Error(
        "A public HTTPS API origin is required for production deployment",
      );
  }
  if (!process.env.MONGODB_URI?.trim() && !memoryMode())
    throw new Error(
      "MONGODB_URI is required; volatile storage is restricted to explicit tests",
    );
}
export function encrypt(value: unknown, context: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAAD(Buffer.from(context));
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]);
  return `enc:v1:${iv.toString("base64url")}:${cipher.getAuthTag().toString("base64url")}:${encrypted.toString("base64url")}`;
}
export function decrypt(value: unknown, context: string): unknown {
  if (typeof value !== "string" || !value.startsWith("enc:v1:"))
    throw new HttpError(
      503,
      "Legacy sensitive data requires an explicit ownership/encryption migration",
    );
  try {
    const [, , iv, tag, data] = value.split(":");
    const cipher = createDecipheriv(
      "aes-256-gcm",
      encryptionKey(),
      Buffer.from(iv!, "base64url"),
    );
    cipher.setAAD(Buffer.from(context));
    cipher.setAuthTag(Buffer.from(tag!, "base64url"));
    return JSON.parse(
      Buffer.concat([
        cipher.update(Buffer.from(data!, "base64url")),
        cipher.final(),
      ]).toString("utf8"),
    );
  } catch {
    throw new HttpError(503, "Sensitive data could not be decrypted");
  }
}
export const sensitiveFields = [
  "password",
  "idNumber",
  "proxyUrl",
  "cookies",
  "browserState",
  "metadata",
  "image1",
  "image2",
];
export function protectAccount(
  data: Record<string, unknown>,
  ownerId: string,
  id: string,
) {
  const output = { ...data };
  for (const field of sensitiveFields)
    if (output[field] !== undefined && output[field] !== null)
      output[field] = encrypt(
        output[field],
        `account:${ownerId}:${id}:${field}`,
      );
  return output;
}
export function revealAccount(data: Record<string, unknown>) {
  const output = { ...data };
  const id = String(data.id ?? data._id);
  const owner = String(data.ownerId);
  for (const field of sensitiveFields)
    if (output[field] !== undefined && output[field] !== null)
      output[field] = decrypt(output[field], `account:${owner}:${id}:${field}`);
  delete output.ownerId;
  delete output._id;
  delete output.__v;
  output.id = id;
  return output;
}
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const key = (await derive(password, salt, 64)) as Buffer;
  return `scrypt:${salt}:${key.toString("hex")}`;
}
export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const [, salt, expected] = stored.split(":");
  if (!salt || !expected) return false;
  const key = (await derive(password, salt, 64)) as Buffer;
  const comparison = Buffer.from(expected, "hex");
  return key.length === comparison.length && timingSafeEqual(key, comparison);
}
export const randomToken = () => randomBytes(32).toString("base64url");
export const tokenHash = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export function rejectUnsafeKeys(value: unknown, depth = 0): void {
  if (depth > 20) throw new HttpError(400, "Request is too deeply nested");
  if (!value || typeof value !== "object") return;
  for (const [key, nested] of Object.entries(value)) {
    if (
      key.startsWith("$") ||
      key.includes(".") ||
      ["__proto__", "prototype", "constructor"].includes(key)
    )
      throw new HttpError(400, "Unsafe request field");
    rejectUnsafeKeys(nested, depth + 1);
  }
}
