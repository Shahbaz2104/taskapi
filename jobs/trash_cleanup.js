// Daily purge of soft-deleted tasks past the retention window.
// Follows the same Redis-optional pattern as jobs/reminders.js.

const { Worker, Queue } = require("bullmq");
const Task = require("../models/tasks_models.js");
const { getClient, isAvailable } = require("../config/redis");
const { reportError } = require("../config/sentry");
const logger = require("../config/logger");

const TRASH_CRON = "0 3 * * *"; // daily at 03:00
const DEFAULT_RETENTION_DAYS = 30;

const runTrashCleanup = async () => {
  const days =
    Number(process.env.TRASH_RETENTION_DAYS) || DEFAULT_RETENTION_DAYS;
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

let cleanupWorker = null;

const startTrashCleanupJob = () => {
  if (!isAvailable() || cleanupWorker) return;

  const queue = new Queue("trash-cleanup", { connection: getClient() });
  queue
    .add(
      "daily",
      {},
      { repeat: { pattern: TRASH_CRON }, jobId: "daily-trash-cleanup" }
    )
    .catch((err) => {
      logger.warn({ err }, "Failed to schedule trash cleanup");
      reportError(err, { queue: "trash-cleanup" });
    });

  cleanupWorker = new Worker(
    "trash-cleanup",
    async () => {
      await runTrashCleanup();
    },
    {
      connection: getClient(),
      onError: (err) => reportError(err, { queue: "trash-cleanup" }),
    }
  );
  logger.info("Trash cleanup job started");
};

module.exports = { startTrashCleanupJob, runTrashCleanup };
