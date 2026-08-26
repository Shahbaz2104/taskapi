import express, { type Express } from "express";
import helmet from "helmet";
import cors from "cors";
import compression from "compression";
import pinoHttpModule from "pino-http";

// pino-http ships CJS `export =`-style types; under NodeNext ESM the
// callable lives on the namespace's default at runtime.
const pinoHttp = (
  pinoHttpModule as unknown as {
    default: typeof pinoHttpModule.default;
  }
).default;
import promClient from "prom-client";
import crypto from "node:crypto";
import swaggerUi from "swagger-ui-express";
import logger from "./config/logger.js";
import { buildLimiter } from "./config/rate_limit.js";
import { initSentry, attachSentryErrorHandler } from "./config/sentry.js";
import { isAvailable } from "./config/redis.js";
import { env } from "./config/env.js";
import { swaggerSpec } from "./config/swagger.js";
import { errorHandler } from "./middleware/error_handler.js";
import authRoutes from "./routes/auth.routes.js";
import userRoutes from "./routes/user.routes.js";
import tasksRoutes from "./routes/tasks.routes.js";
import adminRoutes from "./routes/admin.routes.js";

let metricsRegistered = false;

export const createApp = (): Express => {
  if (!metricsRegistered) {
    promClient.collectDefaultMetrics();
    metricsRegistered = true;
  }

  initSentry();

  const app = express();

  // Express 5 trusts proxies set by cloud hosts — required for accurate
  // client IPs behind Render/Railway/nginx (express-rate-limit depends on it)
  app.set("trust proxy", 1);

  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGIN || "*" }));
  app.use(compression());
  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => {
        const header = req.headers["x-request-id"];
        return typeof header === "string" && header
          ? header
          : crypto.randomUUID();
      },
    })
  );
  app.use(express.json());
  app.use(
    buildLimiter({
      windowMs: 15 * 60 * 1000,
      limit: 100,
      message: { error: "Too many requests, please try again later" },
      skip: () => env.NODE_ENV === "test",
    })
  );

  app.use("/api/v1/tasks", tasksRoutes);
  app.use("/api/v1/auth", authRoutes);
  app.use("/api/v1/me", userRoutes);
  app.use("/api/v1/admin", adminRoutes);
  app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

  app.get("/health", (_req, res) => {
    res.status(200).json({
      status: "OK",
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  });

  app.get("/ready", async (_req, res) => {
    const mongoose = (await import("mongoose")).default;
    try {
      const db = mongoose.connection.db;
      if (!db) throw new Error("db not connected");
      await db.admin().ping();
      res.status(200).json({
        status: "OK",
        db: "connected",
        redis: isAvailable() ? "connected" : "unavailable",
      });
    } catch {
      res.status(503).json({ status: "Unavailable", db: "disconnected" });
    }
  });

  app.get("/metrics", async (_req, res) => {
    res.set("Content-Type", promClient.register.contentType);
    res.end(await promClient.register.metrics());
  });

  app.use((_req, res) => {
    res.status(404).json({ error: "Route not found" });
  });

  attachSentryErrorHandler(app);
  app.use(errorHandler);

  return app;
};
