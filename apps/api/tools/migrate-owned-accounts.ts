import mongoose from "mongoose";
import { UserModel } from "../src/lib/auth-model";
import {
  protectAccount,
  encrypt,
  sensitiveFields,
  validateSecurityConfig,
} from "../src/lib/security";

async function main() {
  const args = process.argv.slice(2);
  const owner = args[args.indexOf("--owner-id") + 1];
  if (!args.includes("--owner-id") || !mongoose.isValidObjectId(owner))
    throw new Error(
      "Pass an explicit --owner-id. Dry-run is the default; --apply requires owner approval and a backup.",
    );
  validateSecurityConfig();
  await mongoose.connect(process.env.MONGODB_URI!);
  if (!(await UserModel.exists({ _id: owner })))
    throw new Error("Target user does not exist");
  let candidates = 0;
  const planned: Array<{
    collection: string;
    id: unknown;
    ownerId: unknown;
    updatedAt: unknown;
    patch: Record<string, unknown>;
  }> = [];
  for (const name of ["accounts", "proxies"]) {
    const collection = mongoose.connection.collection(name);
    const cursor = collection.find({
      $or: [{ ownerId: { $exists: false } }, { ownerId: owner }],
    });
    for await (const record of cursor) {
      const patch: Record<string, unknown> = {};
      const fields =
        name === "accounts" ? sensitiveFields : ["username", "password"];
      for (const field of fields) {
        const value = record[field];
        if (value === undefined || value === null) continue;
        if (typeof value === "string" && value.startsWith("enc:")) {
          if (!record.ownerId)
            throw new Error(
              "Unowned encrypted data needs a separate context migration",
            );
          continue;
        }
        patch[field] = value;
      }
      if (record.ownerId && !Object.keys(patch).length) continue;
      const protectedFields =
        name === "accounts"
          ? protectAccount(patch, owner, String(record._id))
          : Object.fromEntries(
              Object.entries(patch).map(([field, value]) => [
                field,
                encrypt(value, `proxy:${owner}:${record._id}:${field}`),
              ]),
            );
      planned.push({
        collection: name,
        id: record._id,
        ownerId: record.ownerId,
        updatedAt: record.updatedAt,
        patch: { ...protectedFields, ownerId: owner },
      });
    }
  }
  // Preflight all records before the first write. Refuse to overwrite a concurrent change.
  for (const record of planned) {
    if (args.includes("--apply")) {
      const result = await mongoose.connection
        .collection(record.collection)
        .updateOne(
          {
            _id: record.id as mongoose.Types.ObjectId,
            ownerId: record.ownerId ?? { $exists: false },
            updatedAt: record.updatedAt ?? { $exists: false },
          },
          { $set: record.patch },
        );
      if (result.matchedCount !== 1)
        throw new Error(
          "Record changed during migration; stop and review before retrying",
        );
    }
    candidates++;
  }
  console.log(
    JSON.stringify({
      mode: args.includes("--apply") ? "applied" : "dry-run",
      candidates,
    }),
  );
}
main()
  .catch(() => {
    console.error(
      "Migration failed; verify owner, backup, database and encryption configuration. No credentials are logged.",
    );
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
