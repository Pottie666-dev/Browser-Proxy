import express, { type Express } from "express";
import type { ErrorRequestHandler } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  logger.error({ error }, "Request failed");

  const status = typeof error?.status === "number" ? error.status : 400;
  const message =
    error instanceof Error && error.message ? error.message : "Request failed";

  res.status(status >= 400 && status < 600 ? status : 500).json({
    error: message,
  });
};

app.use(errorHandler);

export default app;
