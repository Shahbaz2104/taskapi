import mongoose from "mongoose";
import { createApp } from "./app.js";
import { connectDB, disconnectDB } from "./config/db.js";
import { initRedis, closeRedis } from "./config/redis.js";
import { initPosthog, shutdownPosthog } from "./config/posthog.js";
import { closeSentry } from "./config/sentry.js";
import logger from "./config/logger.js";
import { env } from "./config/env.js";
import { startEmailWorker } from "./jobs/email.worker.js";
import { startReminderJob } from "./jobs/reminders.job.js";
import { startTrashCleanupJob } from "./jobs/trash_cleanup.job.js";
import { startWebhooksWorker } from "./jobs/webhooks.worker.js";

const boot = async (): Promise<void> => {
  await connectDB();
  await initRedis();
  initPosthog();

  const app = createApp();

  const server = app.listen(env.PORT, () => {
    logger.info(`Server running on port ${env.PORT}`);
  });

  startEmailWorker();
  startReminderJob();
  startTrashCleanupJob();
  startWebhooksWorker();

  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`${signal} received, shutting down gracefully...`);
    server.close(async () => {
      await shutdownPosthog();
      await closeSentry();
      await closeRedis();
      await disconnectDB();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
};

boot().catch((err) => {
  logger.error({ err }, "Boot failed");
  void mongoose.connection.close().catch(() => undefined);
  process.exit(1);
});
