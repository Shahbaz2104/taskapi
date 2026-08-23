const express = require("express");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const helmet = require("helmet");
const cors = require("cors");
const compression = require("compression");
const pinoHttp = require("pino-http");
const promClient = require("prom-client");
const { connectDB, disconnectDB } = require("./config/db.js");
const { initRedis, closeRedis, isAvailable } = require("./config/redis.js");
const { initPosthog, shutdownPosthog } = require("./config/posthog.js");
const logger = require("./config/logger.js");
const { buildLimiter } = require("./config/rate_limit.js");
const swaggerSpec = require("./config/swagger.js");
const swaggerUi = require("swagger-ui-express");
const tasksRoutes = require("./routes/tasks_routes.js");
const authRoutes = require("./routes/auth_routes.js");
const userRoutes = require("./routes/user_routes.js");
const adminRoutes = require("./routes/admin_routes.js");
const errorHandler = require("./middleware/error_handler.js");
const { startEmailWorker } = require("./jobs/email_worker.js");
const { startReminderJob } = require("./jobs/reminders.js");

dotenv.config();

// Fail fast if required environment variables are missing
const REQUIRED_ENV = ["MONGO_URI", "JWT_SECRET"];
const missingEnv = REQUIRED_ENV.filter((key) => !process.env[key]);
if (missingEnv.length > 0) {
  console.error(
    `Missing required environment variables: ${missingEnv.join(", ")}`
  );
  console.error("Copy .env.example to .env and fill in the values.");
  process.exit(1);
}

promClient.collectDefaultMetrics();

const app = express();
const PORT = process.env.PORT || 3000;

// Express 5 trusts proxies set by cloud hosts — required for accurate
// client IPs behind Render/Railway/nginx (express-rate-limit depends on it)
app.set("trust proxy", 1);

app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN || "*" }));
app.use(compression());
app.use(
  pinoHttp({
    logger,
    genReqId: (req) =>
      req.headers["x-request-id"] || require("crypto").randomUUID(),
  })
);
app.use(express.json());
app.use(
  buildLimiter({
    windowMs: 15 * 60 * 1000,
    limit: 100,
    message: { error: "Too many requests, please try again later" },
    skip: () => process.env.NODE_ENV === "test",
  })
);

app.use("/api/v1/tasks", tasksRoutes);
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/me", userRoutes);
app.use("/api/v1/admin", adminRoutes);
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

app.get("/health", (req, res) => {
  res.status(200).json({
    status: "OK",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// Readiness probe — verifies the DB is actually reachable (used by
// Docker healthcheck and deployment platforms)
app.get("/ready", async (req, res) => {
  try {
    await mongoose.connection.db.admin().ping();
    res.status(200).json({
      status: "OK",
      db: "connected",
      redis: isAvailable() ? "connected" : "unavailable",
    });
  } catch {
    res.status(503).json({ status: "Unavailable", db: "disconnected" });
  }
});

app.get("/metrics", async (req, res) => {
  res.set("Content-Type", promClient.register.contentType);
  res.end(await promClient.register.metrics());
});

app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

app.use(errorHandler);

let server;
if (require.main === module) {
  const boot = async () => {
    await initRedis();
    initPosthog();
    server = app.listen(PORT, () => {
      logger.info(`Server running on port ${PORT}`);
    });
    startEmailWorker();
    startReminderJob();
  };

  const shutdown = async (signal) => {
    logger.info(`${signal} received, shutting down gracefully...`);
    server.close(async () => {
      await shutdownPosthog();
      await closeRedis();
      await disconnectDB();
      process.exit(0);
    });
    // Force exit if connections don't close in time
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  boot().catch((err) => {
    logger.error({ err }, "Boot failed");
    process.exit(1);
  });
}

// Connect at module load so tests (and the app) get a live connection
connectDB();

module.exports = app;
