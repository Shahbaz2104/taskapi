const { Worker } = require("bullmq");
const { sendDirect } = require("../services/email.service.js");
const { getClient, isAvailable } = require("../config/redis");
const logger = require("../config/logger");

let worker = null;

const startEmailWorker = () => {
  if (!isAvailable() || worker) return;
  worker = new Worker(
    "emails",
    async (job) => {
      await sendDirect(job.data);
    },
    { connection: getClient() }
  );
  worker.on("failed", (job, err) =>
    logger.error({ err, jobId: job?.id }, "Email job failed")
  );
  logger.info("Email worker started");
};

module.exports = { startEmailWorker };
