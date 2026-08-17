const express = require("express");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const helmet = require("helmet");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const { connectDB, disconnectDB } = require("./config/db.js");
const swaggerSpec = require("./config/swagger.js");
const swaggerUi = require("swagger-ui-express");
const tasksRoutes = require("./routes/tasks_routes.js");
const authRoutes = require("./routes/auth_routes.js");
const errorHandler = require("./middleware/error_handler.js");

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

connectDB();

const app = express();
const PORT = process.env.PORT || 3000;

// Express 5 trusts proxies set by cloud hosts — required for accurate
// client IPs behind Render/Railway/nginx (express-rate-limit depends on it)
app.set("trust proxy", 1);

app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN || "*" }));
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 100,
    message: { error: "Too many requests, please try again later" },
  })
);
app.use(express.json());

app.use("/tasks", tasksRoutes);
app.use("/auth", authRoutes);
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
    res.status(200).json({ status: "OK", db: "connected" });
  } catch {
    res.status(503).json({ status: "Unavailable", db: "disconnected" });
  }
});

app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

app.use(errorHandler);

let server;
if (require.main === module) {
  server = app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });

  // Graceful shutdown
  const shutdown = async (signal) => {
    console.log(`${signal} received, shutting down gracefully...`);
    server.close(async () => {
      await disconnectDB();
      process.exit(0);
    });
    // Force exit if connections don't close in time
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

module.exports = app;
