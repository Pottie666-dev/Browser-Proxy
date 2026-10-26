import express, { type Express, type ErrorRequestHandler } from "express";
import cors from "cors";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import pinoHttp from "pino-http";
import { ZodError } from "zod";
import router from "./routes";
import { logger } from "./lib/logger";
import { HttpError } from "./lib/security";

const app: Express = express();
app.disable("x-powered-by");
app.set("trust proxy", false);
app.use(helmet());
app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return { id: req.id, method: req.method, url: req.url?.split("?")[0] };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  }),
);
const origins = new Set(
  (process.env.CORS_ORIGINS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
);
if (process.env.PUBLIC_API_ORIGIN) origins.add(process.env.PUBLIC_API_ORIGIN);
app.use(
  cors({
    origin(origin, callback) {
      callback(
        origin && !origins.has(origin)
          ? new HttpError(403, "Origin not allowed")
          : null,
        Boolean(origin),
      );
    },
    credentials: false,
  }),
);
app.use(
  rateLimit({
    windowMs: 60000,
    limit: 300,
    skip: (req) =>
      (req.method === "POST" && req.path === "/api/devices/self/heartbeat") ||
      req.path.startsWith("/api/remote/"),
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: "Too many requests" },
  }),
);
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: false, limit: "256kb" }));
app.use((_req, res, next) => {
  res.setHeader("cache-control", "no-store");
  next();
});
app.use("/api", router);
app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});
const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  let status = error instanceof HttpError ? error.status : 500;
  if (
    error instanceof ZodError ||
    error?.name === "ValidationError" ||
    error?.name === "CastError" ||
    error?.type === "entity.parse.failed"
  )
    status = 400;
  if (error?.type === "entity.too.large") status = 413;
  if (error?.code === 11000) status = 409;
  logger.warn({ status, type: error?.name }, "Request rejected");
  res.status(status).json({
    error:
      error instanceof HttpError
        ? error.message
        : status === 500
          ? "Internal server error"
          : "Invalid request",
  });
};
app.use(errorHandler);
export default app;
