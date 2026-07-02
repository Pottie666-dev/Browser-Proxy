import app from "./app";
import { logger } from "./lib/logger";

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? "0.0.0.0";

app.listen(port, host, () => {
  logger.info({ host, port }, `API server listening on http://${host}:${port}`);
});
