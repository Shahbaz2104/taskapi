import { Queue, Worker } from "bullmq";
import { Task } from "../models/task.js";
import { getClient, isAvailable } from "../config/redis.js";
import { reportError } from "../config/sentry.js";
import logger from "../config/logger.js";
import { env } from "../config/env.js";
import { QUEUES } from "../config/constants.js";

const TRASH_CRON = "0 3 * * *"; // daily at 03:00
const DEFAULT_RETENTION_DAYS = 30;

const runTrashCleanup = async (): Promise<number> => {
  const days = env.TRASH_RETENTION_DAYS ?? DEFAULT_RETENTION_DAYS;
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const result = await Task.deleteMany({
    deletedAt: { $ne: null, $lt: cutoff },
  });
  if (result.deletedCount > 0) {
    logger.info(
      { deleted: result.deletedCount, retentionDays: days },
      "Trash cleanup purged old tasks"
    );
  }
  return result.deletedCount;
};

let cleanupWorker: Worker | null = null;

const startTrashCleanupJob = (): void => {
  if (!isAvailable() || cleanupWorker) return;

  const queue = new Queue(QUEUES.TRASH_CLEANUP, {
    connection: getClient() as never,
  });
  queue
    .add("daily", {}, {
      repeat: { pattern: TRASH_CRON },
      jobId: "daily-trash-cleanup",
    } as never)
    .catch((err) => {
      logger.warn({ err }, "Failed to schedule trash cleanup");
      reportError(err, { queue: QUEUES.TRASH_CLEANUP });
    });

  cleanupWorker = new Worker(
    QUEUES.TRASH_CLEANUP,
    async () => {
      await runTrashCleanup();
    },
    { connection: getClient() as never }
  );
  cleanupWorker.on("error", (err: Error) =>
    reportError(err, { queue: QUEUES.TRASH_CLEANUP })
  );
  logger.info("Trash cleanup job started");
};

export { startTrashCleanupJob, runTrashCleanup };
