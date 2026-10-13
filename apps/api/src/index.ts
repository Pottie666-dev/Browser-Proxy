import { shutdownBrowsers } from "./browser/service";
import app from "./app";
import { logger } from "./lib/logger";
import { validateSecurityConfig, memoryMode } from "./lib/security";
import { connectMongo } from "./lib/mongo";
import {
  UserModel,
  SessionModel,
  BrowserGrantModel,
  AuditModel,
} from "./lib/auth-model";
import { AccountModel } from "./lib/account-model";
import { ProxyModel } from "./lib/proxy-model";

async function start() {
  validateSecurityConfig();
  await connectMongo();
  if (!memoryMode())
    await Promise.all([
      UserModel.init(),
      SessionModel.init(),
      BrowserGrantModel.init(),
      AuditModel.init(),
      AccountModel.init(),
      ProxyModel.init(),
    ]);
  const port = Number(process.env.PORT ?? 3000),
    host = process.env.HOST ?? "0.0.0.0";
  const server = app.listen(port, host, () =>
    logger.info({ host, port }, "API server ready"),
  );
  let stopping = false;
  for (const signal of ["SIGTERM", "SIGINT"])
    process.on(signal, () => {
      if (stopping) return;
      stopping = true;
      server.close(async () => {
        const mongoose = await import("mongoose");
        await shutdownBrowsers();
        await mongoose.default.disconnect();
        process.exit(0);
      });
      setTimeout(() => process.exit(1), 10000).unref();
    });
}
start().catch(() => {
  logger.error(
    "API startup failed: check database availability and security configuration",
  );
  process.exitCode = 1;
});
